import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../api/client';
import { FortuneSixBetRow, FortuneSixConfig, fetchFortuneSixConfig, fetchFortuneSixHistory, playFortuneSix } from '../api/backend';
import GameInfoButton from '../components/GameInfoButton';
import { useGameState } from '../state/GameStateContext';

const GOLD = '#FFD66B';
const DEEP_GOLD = '#B8860B';
const GREEN = '#3DFF8A';
const TEXT = '#F4F6FF';
const INK = '#0A0E1E';
const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const DEFAULT_BET = 5;
const TOAST_MS = 1800;
/** No paid ticket resolves faster than this, press to result. */
const MIN_TICKET_MS = 2500;
/** Time between drawn balls. */
const BALL_MS = 125;
const NUMBERS = 48;
const DRAWN = 35;
const PICKS = 6;
/** The eight ball colours; number n wears colour (n - 1) % 8. */
const BALL_COLORS = ['#E8283C', '#1FB04A', '#2A6AE8', '#9A3AE0', '#9A6230', '#F0C020', '#FF7A1A', '#3A3A50'];
const colorOf = (n: number) => BALL_COLORS[(n - 1) % 8];
/** Used until the config arrives; the server's table replaces it. */
const FALLBACK_PAYS: Record<number, number> = {
  6: 10000,
  7: 7500,
  8: 5000,
  9: 2500,
  10: 1000,
  11: 500,
  12: 300,
  13: 200,
  14: 150,
  15: 100,
  16: 80,
  17: 70,
  18: 60,
  19: 50,
  20: 40,
  21: 34,
  22: 27.5,
  23: 22,
  24: 16,
  25: 12,
  26: 10,
  27: 9,
  28: 7.5,
  29: 6,
  30: 5,
  31: 4,
  32: 3,
  33: 2,
  34: 1.5,
  35: 1,
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Rounded down like the server, without float error. */
function floor2(n: number): number {
  return Math.floor(Number((n * 100).toPrecision(12))) / 100;
}

function money(n: number): string {
  return `₹${n.toFixed(2)}`;
}

function fmtX(m: number): string {
  return m >= 1000 ? `${m / 1000}K` : `${m}`;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const run = (a: Animated.CompositeAnimation) => new Promise<void>((r) => a.start(() => r()));

// ---------- art ----------

/** A glossy numbered ball in its colour group. */
export const NumBall = memo(function NumBall({ n, size, dim }: { n: number; size: number; dim?: boolean }) {
  const u = `fs${useId().replace(/:/g, '')}`;
  const c = colorOf(n);
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" opacity={dim ? 0.35 : 1}>
      <Defs>
        <RadialGradient id={`${u}g`} cx="0.36" cy="0.3" r="0.8">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.9} />
          <Stop offset="0.25" stopColor={c} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0.85} />
        </RadialGradient>
      </Defs>
      <Circle cx={50} cy={50} r={47} fill={c} />
      <Circle cx={50} cy={50} r={47} fill={`url(#${u}g)`} opacity={0.75} />
      <Circle cx={50} cy={52} r={26} fill="#FFFFFF" />
      <SvgText x={50} y={62} fontSize={28} fontWeight="900" fill="#14141E" textAnchor="middle">
        {n}
      </SvgText>
      <Ellipse cx={34} cy={22} rx={14} ry={7} fill="#FFFFFF" opacity={0.5} transform="rotate(-25 34 22)" />
    </Svg>
  );
});

/** Home tile art: a fan of coloured balls with a gold 6. */
export function FortuneSixTileArt({ size }: { size: number }) {
  const b = size * 0.25;
  const balls = [17, 3, 42, 28, 6];
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size }} pointerEvents="none">
      <LinearGradient colors={['#0E3A5A', '#0A0E2A']} style={StyleSheet.absoluteFill} />
      {balls.map((n, i) => {
        const a = ((i - 2) * 26 * Math.PI) / 180;
        return (
          <View key={n} style={{ position: 'absolute', left: size / 2 - b / 2 + Math.sin(a) * size * 0.3, top: size * 0.46 - b / 2 - Math.cos(a) * size * 0.26 }}>
            <NumBall n={n} size={b} />
          </View>
        );
      })}
      <View style={[styles.tileSix, { left: size / 2 - size * 0.15, top: size * 0.33, width: size * 0.3, height: size * 0.3, borderRadius: size * 0.15 }]}>
        <Text style={{ color: INK, fontSize: size * 0.2, fontWeight: '900' }}>6</Text>
      </View>
    </View>
  );
}

/** The latest ball, rolling into the big window. */
function CurrentBall({ n, size }: { n: number; size: number }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    a.setValue(0);
    Animated.timing(a, { toValue: 1, duration: 110, easing: Easing.out(Easing.back(2)), useNativeDriver: true }).start();
  }, [n, a]);
  return (
    <Animated.View style={{ transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }, { rotate: a.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', '0deg'] }) }] }}>
      <NumBall n={n} size={size} />
    </Animated.View>
  );
}

// ---------- screen ----------

type Banner = { title: string; sub?: string; big: boolean };
type Shown = { payout: number; stake: number; m: number; position: number | null; hits: number };

export default function FortuneSixScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<FortuneSixConfig | null>(null);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [picks, setPicks] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [drawn, setDrawn] = useState<number[]>([]);
  const [complete, setComplete] = useState<number | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [recent, setRecent] = useState<{ position: number | null; hits: number }[]>([]);
  const [shownBalance, setShownBalance] = useState(coins);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [panel, setPanel] = useState<'info' | 'history' | null>(null);
  const [history, setHistory] = useState<FortuneSixBetRow[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sessionNet, setSessionNet] = useState(0);
  const [now, setNow] = useState(Date.now());

  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const sessionStart = useRef(Date.now());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  const bannerAnim = useRef(new Animated.Value(0)).current;

  const S = Math.min(W - 12, 470);
  // Six slots a row (the first row is balls 1-6, where the top prizes start).
  const slot = Math.min(Math.floor((S - 30 - 5 * 5) / 6), 54);
  const tile = Math.floor((S - 16 - 7 * 5) / 8);

  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const maxPayout = config?.maxPayout ?? 10000;
  const betLevels = useMemo(() => BET_LEVELS.filter((v) => v >= minStake && v <= maxStake), [minStake, maxStake]);
  const pays = useMemo(() => {
    const m: Record<number, number> = { ...FALLBACK_PAYS };
    config?.pays.forEach((p) => (m[p.position] = p.multiplier));
    return m;
  }, [config]);
  const drawnSet = useMemo(() => new Set(drawn), [drawn]);
  const hits = picks.filter((p) => drawnSet.has(p)).length;

  useEffect(() => {
    if (!busyRef.current) setShownBalance(coins);
  }, [coins]);

  useEffect(() => {
    mountedRef.current = true;
    fetchFortuneSixConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => mountedRef.current && setToast('Could not load the game — check your connection.'));
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      mountedRef.current = false;
      clearInterval(clock);
      loop.stop();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [pulse]);

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const flashBanner = useCallback(
    async (bn: Banner, hold: number) => {
      setBanner(bn);
      bannerAnim.setValue(0);
      await run(Animated.spring(bannerAnim, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }));
      await wait(hold);
      await run(Animated.timing(bannerAnim, { toValue: 0, duration: 180, useNativeDriver: true }));
      if (mountedRef.current) setBanner(null);
    },
    [bannerAnim],
  );

  const toggle = (n: number) => {
    if (busy) return;
    setShown(null);
    setDrawn([]);
    setComplete(null);
    setPicks((p) => (p.includes(n) ? p.filter((x) => x !== n) : p.length >= PICKS ? p : [...p, n]));
  };

  const quickPick = () => {
    if (busy) return;
    const pool = Array.from({ length: NUMBERS }, (_, i) => i + 1);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    setShown(null);
    setDrawn([]);
    setComplete(null);
    setPicks(pool.slice(0, PICKS));
  };

  const clearPicks = () => {
    if (busy) return;
    setShown(null);
    setDrawn([]);
    setComplete(null);
    setPicks([]);
  };

  const play = useCallback(async () => {
    if (busyRef.current || !config) return;
    if (picks.length !== PICKS) {
      showToast(`Pick ${PICKS} numbers first`);
      return;
    }
    if (bet > shownBalance) {
      showToast('Insufficient balance');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setShown(null);
    setDrawn([]);
    setComplete(null);
    glow.setValue(0);
    // Bring the draw board into view.
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    setShownBalance((v) => round2(v - bet));
    const t0 = Date.now();
    try {
      const res = await playFortuneSix(bet, picks);
      if (!mountedRef.current) return;
      // Balls come out one at a time; the ticket lights up the moment its 6th number is drawn.
      for (let i = 0; i < res.drawn.length; i++) {
        if (!mountedRef.current) return;
        setDrawn(res.drawn.slice(0, i + 1));
        if (res.position === i + 1) {
          setComplete(i + 1);
          Animated.loop(
            Animated.sequence([Animated.timing(glow, { toValue: 1, duration: 300, useNativeDriver: true }), Animated.timing(glow, { toValue: 0.3, duration: 300, useNativeDriver: true })]),
            { iterations: 3 },
          ).start();
          await wait(BALL_MS * 3);
        }
        await wait(BALL_MS);
      }
      await wait(Math.max(0, MIN_TICKET_MS - (Date.now() - t0)));
      if (!mountedRef.current) return;
      const payout = Number(res.payout);
      const m = Number(res.multiplier);
      const h = res.picks.filter((p) => res.drawn.includes(p)).length;
      setShown({ payout, stake: bet, m, position: res.position, hits: h });
      setRecent((r) => [{ position: res.position, hits: h }, ...r].slice(0, 12));
      setShownBalance((v) => round2(v + payout));
      setSessionNet((v) => round2(v + payout - bet));
      refreshWallet();
      if (panel === 'history')
        fetchFortuneSixHistory(30)
          .then((rows) => mountedRef.current && setHistory(rows))
          .catch(() => {});
      // Only a return above the stake is celebrated.
      if (payout > bet) {
        await flashBanner({ title: m >= 100 ? 'JACKPOT!' : m >= 10 ? 'BIG WIN!' : 'WIN!', sub: `6 by ball ${res.position} · ${m}x · ${money(payout)}`, big: m >= 10 }, m >= 10 ? 1600 : 1000);
      }
    } catch (err) {
      if (mountedRef.current) {
        showToast(errorMessage(err));
        setShownBalance(coins);
        refreshWallet();
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  }, [config, picks, bet, shownBalance, glow, flashBanner, panel, coins, refreshWallet, showToast]);

  const stepBet = (dir: 1 | -1) => {
    if (busy) return;
    const idx = Math.max(0, betLevels.indexOf(bet));
    setBet(betLevels[Math.max(0, Math.min(betLevels.length - 1, idx + dir))] ?? bet);
  };

  const openHistory = () => {
    setPanel('history');
    setHistory(null);
    fetchFortuneSixHistory(30)
      .then((rows) => mountedRef.current && setHistory(rows))
      .catch(() => mountedRef.current && setHistory([]));
  };

  const minutes = Math.floor((now - sessionStart.current) / 60000);
  const seconds = Math.floor(((now - sessionStart.current) % 60000) / 1000);
  const last = drawn.length ? drawn[drawn.length - 1] : null;
  const pickSet = new Set(picks);
  const canPlay = !busy && !!config && picks.length === PICKS;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#0E2A4A', '#0A0E24', '#05060E']} style={StyleSheet.absoluteFill} />

      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={TEXT} />
          <MaterialCommunityIcons name="numeric-6-circle" size={20} color={GOLD} />
          <Text style={styles.title}>FORTUNE 6</Text>
        </Pressable>
        <View style={styles.balancePill}>
          <MaterialCommunityIcons name="wallet" size={15} color={GOLD} />
          <Text style={styles.balanceText}>{money(shownBalance)}</Text>
        </View>
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: insets.bottom + 24, alignItems: 'center' }}>
        {/* Recent tickets */}
        <View style={[styles.recentRow, { width: S }]}>
          {recent.length === 0 ? (
            <Text style={styles.recentEmpty}>Your last tickets show here</Text>
          ) : (
            recent.map((r, i) => (
              <View key={i} style={[styles.recentChip, { borderColor: r.position ? GOLD : '#3A4A6A', opacity: 1 - i * 0.06 }]}>
                <Text style={[styles.recentText, { color: r.position ? GOLD : '#7A8AA8' }]}>{r.position ? `${fmtX(pays[r.position])}x` : `${r.hits}/6`}</Text>
              </View>
            ))
          )}
        </View>

        {/* Draw board: 35 slots, the pay for completing at each one underneath */}
        <View style={[styles.stage, { width: S }]}>
          <LinearGradient colors={['#123A62', '#0A1630', '#0A0A1E']} style={StyleSheet.absoluteFill} />
          <View style={styles.stageHead}>
            <View style={styles.bigWindow}>{last ? <CurrentBall n={last} size={58} /> : <MaterialCommunityIcons name="numeric-6-circle-outline" size={44} color="#3A5A8A" />}</View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.headTitle}>MATCH ALL 6 · THE SOONER, THE BIGGER</Text>
              <Text style={styles.headSub}>
                Ball <Text style={styles.headNum}>{drawn.length}</Text>/{DRAWN} · Hits <Text style={[styles.headNum, { color: hits ? GREEN : TEXT }]}>{hits}</Text>/6
              </Text>
              <View style={styles.hitBar}>
                {Array.from({ length: PICKS }, (_, i) => (
                  <View key={i} style={[styles.hitPip, i < hits && { backgroundColor: GREEN, borderColor: GREEN }]} />
                ))}
              </View>
            </View>
          </View>
          <View style={styles.slotGrid}>
            {Array.from({ length: DRAWN }, (_, i) => {
              const pos = i + 1;
              const n = drawn[i];
              const isHit = n !== undefined && pickSet.has(n);
              const isDone = complete === pos;
              return (
                <View key={pos} style={{ width: slot, alignItems: 'center' }}>
                  <View style={[styles.slot, { width: slot - 4, height: slot - 4, borderRadius: (slot - 4) / 2 }, isHit && { borderColor: GREEN }]}>
                    {isDone && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.slotGlow, { borderRadius: slot, opacity: glow }]} />}
                    {n !== undefined ? <NumBall n={n} size={slot - 8} /> : <Text style={styles.slotNum}>{pos}</Text>}
                  </View>
                  <Text style={[styles.slotPay, pos < 6 && { color: '#3A4A6A' }, isDone && { color: GOLD }]} numberOfLines={1}>
                    {pos < 6 ? '•' : `${fmtX(pays[pos])}x`}
                  </Text>
                </View>
              );
            })}
          </View>
          {/* Result plate */}
          <View style={styles.plate}>
            {shown ? (
              shown.payout > shown.stake ? (
                <Text style={styles.plateWin}>
                  WIN {money(shown.payout)}{' '}
                  <Text style={styles.plateSub}>
                    (ball {shown.position} · {shown.m}x)
                  </Text>
                </Text>
              ) : shown.payout > 0 ? (
                <Text style={styles.plateText}>RETURNED {money(shown.payout)}</Text>
              ) : (
                <Text style={styles.plateText}>{shown.hits} OF 6 DRAWN · NO WIN</Text>
              )
            ) : (
              <Text style={styles.plateText}>{busy ? 'DRAWING…' : picks.length < PICKS ? `PICK ${PICKS - picks.length} MORE NUMBER${PICKS - picks.length === 1 ? '' : 'S'}` : 'READY · PLAY'}</Text>
            )}
          </View>
        </View>

        {/* Your numbers */}
        <View style={[styles.pickHead, { width: S }]}>
          <Text style={styles.pickTitle}>YOUR 6</Text>
          <View style={styles.pickChips}>
            {Array.from({ length: PICKS }, (_, i) => {
              const n = [...picks].sort((a, b) => a - b)[i];
              return n ? <NumBall key={i} n={n} size={26} dim={busy && drawn.length > 0 && !drawnSet.has(n)} /> : <View key={i} style={styles.emptyChip} />;
            })}
          </View>
          <Pressable onPress={quickPick} disabled={busy} style={[styles.smallBtn, busy && styles.dim]} hitSlop={4}>
            <MaterialCommunityIcons name="shuffle-variant" size={14} color={GOLD} />
            <Text style={styles.smallBtnText}>QUICK</Text>
          </Pressable>
          <Pressable onPress={clearPicks} disabled={busy} style={[styles.smallBtn, busy && styles.dim]} hitSlop={4}>
            <MaterialCommunityIcons name="close" size={14} color="#A8B8D0" />
          </Pressable>
        </View>
        <View style={[styles.board, { width: S }]}>
          {Array.from({ length: NUMBERS }, (_, i) => {
            const n = i + 1;
            const on = pickSet.has(n);
            const out = drawnSet.has(n);
            const c = colorOf(n);
            return (
              <Pressable
                key={n}
                onPress={() => toggle(n)}
                disabled={busy}
                style={[
                  styles.tile,
                  { width: tile, height: tile * 0.82, borderColor: on ? GOLD : c, backgroundColor: on ? c : 'rgba(255,255,255,0.04)' },
                  out && !on && { backgroundColor: 'rgba(255,255,255,0.16)' },
                  on && out && styles.tileHit,
                ]}
              >
                <View style={[styles.tileDot, { backgroundColor: c }]} />
                <Text style={[styles.tileText, on && { color: '#FFFFFF' }, out && !on && { color: '#FFFFFF' }]}>{n}</Text>
                {on && out && <MaterialCommunityIcons name="check-bold" size={11} color="#FFFFFF" style={styles.tileCheck} />}
              </Pressable>
            );
          })}
        </View>

        {/* Session (time played and net position, always on show) */}
        <View style={[styles.session, { width: S }]}>
          <MaterialCommunityIcons name="timer-outline" size={15} color="#C8D4E8" />
          <Text style={styles.sessionText}>
            Session {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </Text>
          <Text style={styles.sessionSep}>·</Text>
          <Text style={[styles.sessionText, { color: sessionNet > 0 ? GREEN : sessionNet < 0 ? '#FF9AA6' : '#C8D4E8' }]}>
            Net {sessionNet >= 0 ? '+' : '−'}
            {money(Math.abs(sessionNet))}
          </Text>
        </View>

        {/* Controls: no autoplay or turbo */}
        <View style={[styles.controls, { width: S }]}>
          <Pressable onPress={() => setPanel('info')} style={styles.sideBtn} hitSlop={6}>
            <MaterialCommunityIcons name="information-outline" size={20} color={GOLD} />
            <Text style={styles.sideText}>RULES</Text>
          </Pressable>
          <View style={styles.betBox}>
            <Text style={styles.betLabel}>TICKET</Text>
            <View style={styles.betRow}>
              <Pressable onPress={() => stepBet(-1)} disabled={busy} style={[styles.betBtn, busy && styles.dim]} hitSlop={6}>
                <MaterialCommunityIcons name="minus" size={18} color={INK} />
              </Pressable>
              <Text style={styles.betValue}>{money(bet)}</Text>
              <Pressable onPress={() => stepBet(1)} disabled={busy} style={[styles.betBtn, busy && styles.dim]} hitSlop={6}>
                <MaterialCommunityIcons name="plus" size={18} color={INK} />
              </Pressable>
            </View>
          </View>
          <Pressable onPress={play} disabled={busy || !config} style={({ pressed }) => [styles.mainWrap, pressed && { transform: [{ scale: 0.95 }] }]}>
            <Animated.View style={[styles.mainHalo, { opacity: canPlay ? pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.7] }) : 0 }]} />
            <LinearGradient colors={canPlay ? ['#FFF4C8', GOLD, DEEP_GOLD] : ['#4A5A6A', '#1E2A3A']} style={styles.mainBtn}>
              <MaterialCommunityIcons name={busy ? 'dots-horizontal' : 'play'} size={28} color={INK} />
              {!busy && <Text style={styles.mainSmall}>PLAY</Text>}
            </LinearGradient>
          </Pressable>
          <Pressable onPress={openHistory} style={styles.sideBtn} hitSlop={6}>
            <MaterialCommunityIcons name="history" size={20} color={GOLD} />
            <Text style={styles.sideText}>HISTORY</Text>
          </Pressable>
        </View>

        <GameInfoButton>
          RTP {config?.rtpPercent ?? 87.98}% · ticket {money(minStake)}–{money(maxStake)} · max {money(maxPayout)} per ticket{'\n'}
          No autoplay or turbo · each ticket takes at least 2.5 seconds · provably fair
        </GameInfoButton>
      </ScrollView>

      {banner && (
        <Animated.View pointerEvents="none" style={[styles.banner, { opacity: bannerAnim, transform: [{ scale: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }]}>
          <LinearGradient colors={banner.big ? ['#FFF4C8', GOLD, '#B87800'] : ['#1A5A9A', '#0A2440']} style={[styles.bannerInner, { borderColor: banner.big ? '#FFFFFF' : GOLD }]}>
            <MaterialCommunityIcons name="star-four-points" size={30} color={banner.big ? '#5A2A00' : GOLD} />
            <Text style={[styles.bannerText, banner.big && { color: '#3A1A00' }]}>{banner.title}</Text>
            {banner.sub ? <Text style={[styles.bannerSub, banner.big && { color: '#5A2A00' }]}>{banner.sub}</Text> : null}
          </LinearGradient>
        </Animated.View>
      )}

      {toast && (
        <View pointerEvents="none" style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      <Modal visible={panel !== null} transparent animationType="fade" onRequestClose={() => setPanel(null)}>
        <Pressable style={styles.modalBack} onPress={() => setPanel(null)}>
          <Pressable style={[styles.modalCard, { width: Math.min(W - 24, 440) }]} onPress={() => {}}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{panel === 'info' ? 'HOW TO PLAY' : 'MY TICKETS'}</Text>
              <Pressable onPress={() => setPanel(null)} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={22} color={TEXT} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 480 }}>{panel === 'info' ? <Rules bet={bet} config={config} /> : <History bets={history} />}</ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Rules({ bet, config }: { bet: number; config: FortuneSixConfig | null }) {
  if (!config) return <Text style={styles.note}>Loading…</Text>;
  const win = config.pays.reduce((s, p) => s + p.chance, 0);
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.note}>
        Pick {config.picks} of the {config.numbers} numbers (or tap QUICK), set your ticket price and PLAY. {config.drawn} of the {config.numbers} balls are drawn one by one. If all 6 of your numbers
        are drawn, your ticket wins — and the sooner your 6th number comes out, the more it pays. If any of your numbers is not drawn, the ticket loses.
      </Text>
      <Text style={styles.section}>PAYS (POSITION OF YOUR 6TH NUMBER)</Text>
      {config.pays.map((p) => (
        <View key={p.position} style={styles.tRow}>
          <Text style={styles.tCell}>Ball {p.position}</Text>
          <Text style={styles.tCell}>{p.multiplier}x</Text>
          <Text style={[styles.tCell, { textAlign: 'right' }]}>{money(Math.min(floor2(bet * p.multiplier), config.maxPayout))}</Text>
        </View>
      ))}
      <Text style={styles.section}>GAME INFO</Text>
      <Text style={styles.note}>
        A ticket wins about {(win * 100).toFixed(1)}% of the time. Tickets return {config.rtpPercent}% over time (before the {money(config.maxPayout)} per-ticket limit). Completing on ball 35 pays 1x,
        which only returns your ticket price. No autoplay or turbo; each ticket takes at least 2.5 seconds. The draw order comes from your provably-fair seeds (server seed hash, client seed and nonce
        on each ticket).
      </Text>
    </View>
  );
}

function History({ bets }: { bets: FortuneSixBetRow[] | null }) {
  if (bets === null) return <Text style={styles.note}>Loading…</Text>;
  if (bets.length === 0) return <Text style={styles.note}>No tickets yet.</Text>;
  return (
    <View>
      {bets.map((row) => {
        const payout = Number(row.payout);
        const d = new Date(row.createdAt);
        const h = row.picks.filter((p) => row.drawn.includes(p)).length;
        return (
          <View key={row.id} style={styles.histRow}>
            <Text style={styles.histTime}>{d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            <Text style={styles.histStake}>{money(Number(row.stake))}</Text>
            <Text style={styles.histMult}>{row.position ? `ball ${row.position} · ${Number(row.multiplier)}x` : `${h}/6 hit`}</Text>
            <Text style={[styles.histWin, { color: payout > 0 ? GREEN : '#8A8FA8' }]}>{payout > 0 ? `+${money(payout)}` : '—'}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05060E' },
  topBar: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  title: { color: TEXT, fontSize: 18, fontWeight: '900', letterSpacing: 3 },
  balancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,214,107,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,214,107,0.45)',
  },
  balanceText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  recentRow: { flexDirection: 'row', gap: 5, height: 28, alignItems: 'center', overflow: 'hidden', marginBottom: 6 },
  recentEmpty: { color: '#6A7A98', fontSize: 11, fontWeight: '700' },
  recentChip: { paddingHorizontal: 8, height: 24, borderRadius: 12, borderWidth: 1.5, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  recentText: { fontSize: 11, fontWeight: '900' },
  tileSix: { position: 'absolute', backgroundColor: GOLD, borderWidth: 2.5, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  stage: { borderRadius: 20, overflow: 'hidden', borderWidth: 2.5, borderColor: DEEP_GOLD, padding: 12, alignItems: 'center' },
  stageHead: { flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'stretch', marginBottom: 10 },
  bigWindow: { width: 74, height: 74, borderRadius: 37, borderWidth: 3, borderColor: GOLD, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  headTitle: { color: GOLD, fontSize: 10.5, fontWeight: '900', letterSpacing: 1.2 },
  headSub: { color: '#A8B8D0', fontSize: 13, fontWeight: '800' },
  headNum: { color: TEXT, fontSize: 16, fontWeight: '900' },
  hitBar: { flexDirection: 'row', gap: 5 },
  hitPip: { width: 18, height: 8, borderRadius: 4, borderWidth: 1, borderColor: '#3A5A8A', backgroundColor: 'rgba(255,255,255,0.05)' },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'center', rowGap: 6 },
  slot: { borderWidth: 1.5, borderColor: '#2A3E5E', backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  slotGlow: { backgroundColor: GOLD },
  slotNum: { color: '#3A5070', fontSize: 11, fontWeight: '900' },
  slotPay: { color: '#8AA0C0', fontSize: 9.5, fontWeight: '900', marginTop: 2 },
  plate: { marginTop: 10, paddingHorizontal: 18, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(4,8,16,0.85)', borderWidth: 1.5, borderColor: GOLD },
  plateText: { color: TEXT, fontSize: 13, fontWeight: '900', letterSpacing: 1.5 },
  plateWin: { color: GREEN, fontSize: 15, fontWeight: '900', letterSpacing: 1 },
  plateSub: { color: GOLD, fontSize: 12 },
  pickHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, marginBottom: 6 },
  pickTitle: { color: GOLD, fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  pickChips: { flexDirection: 'row', gap: 4, flex: 1 },
  emptyChip: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#3A5070' },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: '#3A5070' },
  smallBtnText: { color: GOLD, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  board: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'center', padding: 8, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: '#1E2E4A' },
  tile: { borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  tileHit: { borderColor: GREEN, borderWidth: 2.5 },
  tileDot: { position: 'absolute', top: 3, left: 3, width: 5, height: 5, borderRadius: 3 },
  tileText: { color: '#C8D4E8', fontSize: 14, fontWeight: '900' },
  tileCheck: { position: 'absolute', top: 1, right: 2 },
  session: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)' },
  sessionText: { color: '#C8D4E8', fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sessionSep: { color: '#4A5A70', fontSize: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingHorizontal: 4 },
  sideBtn: { alignItems: 'center', gap: 2, width: 58 },
  sideText: { color: GOLD, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  betBox: { alignItems: 'center', gap: 4 },
  betLabel: { color: '#A8B8D0', fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  betRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(6,14,28,0.9)',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#2A4A6A',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  betBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: TEXT, alignItems: 'center', justifyContent: 'center' },
  betValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', minWidth: 70, textAlign: 'center' },
  dim: { opacity: 0.4 },
  mainWrap: { width: 92, height: 92, alignItems: 'center', justifyContent: 'center' },
  mainHalo: { position: 'absolute', width: 92, height: 92, borderRadius: 46, backgroundColor: GOLD },
  mainBtn: { width: 82, height: 82, borderRadius: 41, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  mainSmall: { color: INK, fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  banner: { position: 'absolute', top: '30%', alignSelf: 'center' },
  bannerInner: { paddingHorizontal: 30, paddingVertical: 12, borderRadius: 16, borderWidth: 3, alignItems: 'center' },
  bannerText: { color: TEXT, fontSize: 32, fontWeight: '900', letterSpacing: 2 },
  bannerSub: { color: GOLD, fontSize: 13, fontWeight: '900', marginTop: 2, letterSpacing: 0.5 },
  toast: { position: 'absolute', bottom: 120, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14 },
  toastText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  modalBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  modalCard: { backgroundColor: '#0E1828', borderRadius: 16, borderWidth: 2, borderColor: DEEP_GOLD, padding: 14 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { color: TEXT, fontSize: 16, fontWeight: '900', letterSpacing: 3 },
  note: { color: '#C8D4E8', fontSize: 12, lineHeight: 17 },
  section: { color: GOLD, fontSize: 12, fontWeight: '900', letterSpacing: 2, marginTop: 4 },
  tRow: { flexDirection: 'row', paddingVertical: 3, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.12)' },
  tCell: { flex: 1, color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)', gap: 6 },
  histTime: { color: '#8A9AB0', fontSize: 11, width: 64 },
  histStake: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', width: 66 },
  histMult: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', flex: 1 },
  histWin: { fontSize: 12, fontWeight: '900' },
});
