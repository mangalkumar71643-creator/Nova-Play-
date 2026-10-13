import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Rect, RadialGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../api/client';
import { DiceDuelBetRow, DiceDuelConfig, DuelPick, fetchDiceDuelConfig, fetchDiceDuelHistory, playDiceDuel } from '../api/backend';
import GameInfoButton from '../components/GameInfoButton';
import { useGameState } from '../state/GameStateContext';

const GOLD = '#FFD66B';
const DEEP_GOLD = '#B8860B';
const BLUE = '#3AC8FF';
const RED = '#FF4A62';
const VIOLET = '#C08AFF';
const GREEN = '#3DFF8A';
const TEXT = '#F2F6FF';
const INK = '#06121E';
const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const DEFAULT_BET = 10;
const TOAST_MS = 1800;
/** No paid roll resolves faster than this, press to result. */
const MIN_ROLL_MS = 2500;
/** When the player's dice and then the house's dice land, from the press. */
const PLAYER_LANDS_MS = 1150;
const HOUSE_LANDS_MS = 2200;
const PICKS: DuelPick[] = ['PLAYER', 'TIE', 'HOUSE'];
const PICK_COLOR: Record<DuelPick, string> = { PLAYER: BLUE, TIE: VIOLET, HOUSE: RED };
const PICK_LABEL: Record<DuelPick, string> = { PLAYER: 'YOU WIN', TIE: 'TIE', HOUSE: 'HOUSE WINS' };
/** Used until the config arrives; the server's table replaces it. */
const FALLBACK_PAYS: Record<DuelPick, number> = { PLAYER: 1.98, TIE: 7.81, HOUSE: 1.98 };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Rounded down like the server, without float error (10 x 7.81 is 78.10, not 78.09). */
function floor2(n: number): number {
  return Math.floor(Number((n * 100).toPrecision(12))) / 100;
}

function money(n: number): string {
  return `₹${n.toFixed(2)}`;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const run = (a: Animated.CompositeAnimation) => new Promise<void>((r) => a.start(() => r()));
const randomFace = () => 1 + Math.floor(Math.random() * 6);

// ---------- art ----------

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [
    [29, 29],
    [71, 71],
  ],
  3: [
    [27, 27],
    [50, 50],
    [73, 73],
  ],
  4: [
    [29, 29],
    [71, 29],
    [29, 71],
    [71, 71],
  ],
  5: [
    [27, 27],
    [73, 27],
    [50, 50],
    [27, 73],
    [73, 73],
  ],
  6: [
    [29, 25],
    [71, 25],
    [29, 50],
    [71, 50],
    [29, 75],
    [71, 75],
  ],
};

/** One die: the player's are pearl white with blue pips, the house's translucent ruby with white pips. */
export const Die = memo(function Die({ face, size, side }: { face: number; size: number; side: 'PLAYER' | 'HOUSE' }) {
  const u = `dd${useId().replace(/:/g, '')}`;
  const house = side === 'HOUSE';
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <SvgLinearGradient id={`${u}b`} x1="0" y1="0" x2="1" y2="1">
          {house ? <Stop offset="0" stopColor="#FF8A9A" /> : <Stop offset="0" stopColor="#FFFFFF" />}
          {house ? <Stop offset="0.5" stopColor="#D8102E" /> : <Stop offset="0.55" stopColor="#EAF2FA" />}
          {house ? <Stop offset="1" stopColor="#6A0014" /> : <Stop offset="1" stopColor="#A8B8CC" />}
        </SvgLinearGradient>
        <RadialGradient id={`${u}p`} cx="0.4" cy="0.35" r="0.7">
          {house ? <Stop offset="0" stopColor="#FFFFFF" /> : <Stop offset="0" stopColor="#5AD8FF" />}
          {house ? <Stop offset="1" stopColor="#E8D8DC" /> : <Stop offset="1" stopColor="#0A4AA0" />}
        </RadialGradient>
      </Defs>
      <Rect x={4} y={7} width={92} height={92} rx={20} fill={house ? '#3A0008' : '#56677A'} opacity={0.55} />
      <Rect x={3} y={3} width={92} height={92} rx={20} fill={`url(#${u}b)`} stroke={house ? '#4A0010' : '#7A8CA0'} strokeWidth={2} />
      <Rect x={12} y={9} width={60} height={14} rx={7} fill="#FFFFFF" opacity={house ? 0.25 : 0.7} />
      {(PIPS[face] ?? PIPS[1]).map(([x, y], i) => (
        <Circle key={i} cx={x - 1} cy={y - 1} r={face === 1 ? 11 : 8.5} fill={`url(#${u}p)`} stroke={house ? '#8A2030' : '#06306A'} strokeWidth={0.8} />
      ))}
    </Svg>
  );
});

/** Home tile art: a pearl die and a ruby die squaring up across a VS badge. */
export function DiceDuelTileArt({ size }: { size: number }) {
  const d = size * 0.36;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size }} pointerEvents="none">
      <LinearGradient colors={['#0A3A6A', '#2A0A2A', '#6A0A1E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={{ position: 'absolute', left: size * 0.08, top: size * 0.14, transform: [{ rotate: '-14deg' }] }}>
        <Die face={6} size={d} side="PLAYER" />
      </View>
      <View style={{ position: 'absolute', right: size * 0.08, top: size * 0.14, transform: [{ rotate: '12deg' }] }}>
        <Die face={5} size={d} side="HOUSE" />
      </View>
      <View style={[styles.tileVs, { left: size / 2 - size * 0.12, top: size * 0.27, width: size * 0.24, height: size * 0.24, borderRadius: size * 0.12 }]}>
        <Text style={{ color: INK, fontSize: size * 0.1, fontWeight: '900' }}>VS</Text>
      </View>
    </View>
  );
}

/** A die that tumbles while `rolling` and settles with a little bounce when it lands. */
function RollingDie({ face, size, side, rolling, tilt }: { face: number; size: number; side: 'PLAYER' | 'HOUSE'; rolling: boolean; tilt: number }) {
  const spin = useRef(new Animated.Value(0)).current;
  const hop = useRef(new Animated.Value(0)).current;
  const land = useRef(new Animated.Value(1)).current;
  const loops = useRef<Animated.CompositeAnimation | null>(null);
  const first = useRef(true);

  useEffect(() => {
    if (rolling) {
      loops.current = Animated.parallel([
        Animated.loop(Animated.timing(spin, { toValue: 1, duration: 380, easing: Easing.linear, useNativeDriver: true })),
        Animated.loop(
          Animated.sequence([
            Animated.timing(hop, { toValue: 1, duration: 170, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(hop, { toValue: 0, duration: 170, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          ]),
        ),
      ]);
      spin.setValue(0);
      loops.current.start();
    } else {
      loops.current?.stop();
      spin.setValue(0);
      hop.setValue(0);
      if (first.current) {
        first.current = false;
        return;
      }
      land.setValue(1.28);
      Animated.spring(land, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
    }
  }, [rolling, spin, hop, land]);

  const dir = side === 'PLAYER' ? 1 : -1;
  return (
    <Animated.View
      style={{
        transform: [
          { translateY: hop.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.32] }) },
          { rotate: rolling ? spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${360 * dir}deg`] }) : `${tilt}deg` },
          { scale: land },
        ],
      }}
    >
      <Die face={face} size={size} side={side} />
    </Animated.View>
  );
}

// ---------- screen ----------

type Banner = { title: string; sub?: string; tone: DuelPick };
type Shown = { pick: DuelPick; outcome: DuelPick; payout: number; stake: number; m: number };

export default function DiceDuelScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<DiceDuelConfig | null>(null);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [pick, setPick] = useState<DuelPick>('PLAYER');
  const [busy, setBusy] = useState(false);
  const [faces, setFaces] = useState([6, 5, 4, 3]);
  const [rolling, setRolling] = useState([false, false, false, false]);
  const [tilts, setTilts] = useState([-8, 6, 7, -5]);
  const [totals, setTotals] = useState<{ p: number | null; h: number | null }>({ p: null, h: null });
  const [shown, setShown] = useState<Shown | null>(null);
  const [recent, setRecent] = useState<{ p: number; h: number; o: DuelPick }[]>([]);
  const [shownBalance, setShownBalance] = useState(coins);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [panel, setPanel] = useState<'info' | 'history' | null>(null);
  const [history, setHistory] = useState<DiceDuelBetRow[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sessionNet, setSessionNet] = useState(0);
  const [now, setNow] = useState(Date.now());

  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const rollingRef = useRef([false, false, false, false]);
  const sessionStart = useRef(Date.now());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const vsPulse = useRef(new Animated.Value(0)).current;
  const sideGlow = useRef(new Animated.Value(0)).current;
  const bannerAnim = useRef(new Animated.Value(0)).current;

  const S = Math.min(W - 12, 470);
  const trayW = (S - 64) / 2;
  const dieSize = Math.min(trayW * 0.42, 70);

  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const maxPayout = config?.maxPayout ?? 10000;
  const betLevels = useMemo(() => BET_LEVELS.filter((b) => b >= minStake && b <= maxStake), [minStake, maxStake]);
  const pays = useCallback((p: DuelPick) => config?.picks.find((x) => x.pick === p)?.multiplier ?? FALLBACK_PAYS[p], [config]);

  useEffect(() => {
    if (!busyRef.current) setShownBalance(coins);
  }, [coins]);

  useEffect(() => {
    mountedRef.current = true;
    fetchDiceDuelConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => mountedRef.current && setToast('Could not load the game — check your connection.'));
    const clock = setInterval(() => setNow(Date.now()), 1000);
    // Tumbling dice flick through faces.
    const flicker = setInterval(() => {
      if (rollingRef.current.some(Boolean)) setFaces((f) => f.map((v, i) => (rollingRef.current[i] ? randomFace() : v)));
    }, 80);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    const vs = Animated.loop(
      Animated.sequence([
        Animated.timing(vsPulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(vsPulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    vs.start();
    return () => {
      mountedRef.current = false;
      clearInterval(clock);
      clearInterval(flicker);
      loop.stop();
      vs.stop();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [pulse, vsPulse]);

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const flashBanner = useCallback(
    async (b: Banner, hold: number) => {
      setBanner(b);
      bannerAnim.setValue(0);
      await run(Animated.spring(bannerAnim, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }));
      await wait(hold);
      await run(Animated.timing(bannerAnim, { toValue: 0, duration: 180, useNativeDriver: true }));
      if (mountedRef.current) setBanner(null);
    },
    [bannerAnim],
  );

  const setRollingBoth = (r: boolean[]) => {
    rollingRef.current = r;
    setRolling(r);
  };

  const roll = useCallback(async () => {
    if (busyRef.current || !config) return;
    if (bet > shownBalance) {
      showToast('Insufficient balance');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setShown(null);
    setTotals({ p: null, h: null });
    sideGlow.setValue(0);
    setShownBalance((b) => round2(b - bet));
    const backed = pick;
    const t0 = Date.now();
    setRollingBoth([true, true, true, true]);
    try {
      const res = await playDiceDuel(bet, backed);
      if (!mountedRef.current) return;
      const tilt = () => Math.round((Math.random() - 0.5) * 22);
      // The player's dice land first, then the house answers.
      await wait(Math.max(0, PLAYER_LANDS_MS - (Date.now() - t0)));
      if (!mountedRef.current) return;
      setTilts((t) => [tilt(), tilt(), t[2], t[3]]);
      setFaces((f) => [res.playerDice[0], res.playerDice[1], f[2], f[3]]);
      setRollingBoth([false, false, true, true]);
      const p = res.playerDice[0] + res.playerDice[1];
      setTotals({ p, h: null });
      await wait(Math.max(0, HOUSE_LANDS_MS - (Date.now() - t0)));
      if (!mountedRef.current) return;
      setTilts((t) => [t[0], t[1], tilt(), tilt()]);
      setFaces((f) => [f[0], f[1], res.houseDice[0], res.houseDice[1]]);
      setRollingBoth([false, false, false, false]);
      const h = res.houseDice[0] + res.houseDice[1];
      setTotals({ p, h });
      await wait(Math.max(0, MIN_ROLL_MS - (Date.now() - t0)));
      if (!mountedRef.current) return;
      const payout = Number(res.payout);
      const m = Number(res.multiplier);
      setShown({ pick: res.pick, outcome: res.outcome, payout, stake: bet, m });
      setRecent((r) => [{ p, h, o: res.outcome }, ...r].slice(0, 12));
      setShownBalance((b) => round2(b + payout));
      setSessionNet((v) => round2(v + payout - bet));
      refreshWallet();
      Animated.timing(sideGlow, { toValue: 1, duration: 260, useNativeDriver: true }).start();
      if (panel === 'history')
        fetchDiceDuelHistory(30)
          .then((rows) => mountedRef.current && setHistory(rows))
          .catch(() => {});
      // Only a return above the stake is celebrated.
      if (payout > bet) {
        await flashBanner({ title: res.outcome === 'TIE' ? 'TIE PAYS!' : 'YOU WIN!', sub: `${m}x · ${money(payout)}`, tone: res.outcome }, res.outcome === 'TIE' ? 1400 : 900);
      }
    } catch (err) {
      if (mountedRef.current) {
        setRollingBoth([false, false, false, false]);
        showToast(errorMessage(err));
        setShownBalance(coins);
        refreshWallet();
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  }, [config, bet, shownBalance, pick, sideGlow, flashBanner, panel, coins, refreshWallet, showToast]);

  const stepBet = (dir: 1 | -1) => {
    if (busy) return;
    const idx = Math.max(0, betLevels.indexOf(bet));
    setBet(betLevels[Math.max(0, Math.min(betLevels.length - 1, idx + dir))] ?? bet);
  };

  const openHistory = () => {
    setPanel('history');
    setHistory(null);
    fetchDiceDuelHistory(30)
      .then((rows) => mountedRef.current && setHistory(rows))
      .catch(() => mountedRef.current && setHistory([]));
  };

  const minutes = Math.floor((now - sessionStart.current) / 60000);
  const seconds = Math.floor(((now - sessionStart.current) % 60000) / 1000);
  const outcome = shown?.outcome ?? null;
  const rtpLine = config ? [...new Set(config.picks.map((p) => p.rtpPercent))].join('% / ') + '%' : '88%';

  const tray = (side: 'PLAYER' | 'HOUSE') => {
    const isP = side === 'PLAYER';
    const color = isP ? BLUE : RED;
    const total = isP ? totals.p : totals.h;
    const won = outcome === side;
    const lost = outcome !== null && outcome !== side && outcome !== 'TIE';
    const idx = isP ? [0, 1] : [2, 3];
    return (
      <View style={[styles.tray, { width: trayW, borderColor: color }, lost && { opacity: 0.55 }]}>
        <LinearGradient colors={isP ? ['#0E3A62', '#06182E'] : ['#5A0A1E', '#24040C']} style={StyleSheet.absoluteFill} />
        {won && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.trayGlow, { borderColor: color, opacity: sideGlow }]} />}
        <View style={styles.trayHead}>
          <MaterialCommunityIcons name={isP ? 'account' : 'bank'} size={14} color={color} />
          <Text style={[styles.trayName, { color }]}>{isP ? 'YOU' : 'HOUSE'}</Text>
        </View>
        <View style={[styles.felt, { height: dieSize * 1.75 }]}>
          {idx.map((i) => (
            <RollingDie key={i} face={faces[i]} size={dieSize} side={side} rolling={rolling[i]} tilt={tilts[i]} />
          ))}
        </View>
        <View style={[styles.totalBox, { borderColor: total !== null ? color : 'rgba(255,255,255,0.15)' }]}>
          <Text style={[styles.totalText, { color: total !== null ? '#FFFFFF' : '#5A6A80' }]}>{total ?? '–'}</Text>
        </View>
        {won && <Text style={[styles.winTag, { color }]}>{isP ? 'WINNER' : 'WINS'}</Text>}
      </View>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#0A2440', '#140A22', '#06080F']} style={StyleSheet.absoluteFill} />

      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={TEXT} />
          <MaterialCommunityIcons name="dice-multiple" size={18} color={GOLD} />
          <Text style={styles.title}>DICE DUEL</Text>
        </Pressable>
        <View style={styles.balancePill}>
          <MaterialCommunityIcons name="wallet" size={15} color={GOLD} />
          <Text style={styles.balanceText}>{money(shownBalance)}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24, alignItems: 'center' }} scrollEnabled={!busy}>
        {/* Recent duels */}
        <View style={[styles.recentRow, { width: S }]}>
          {recent.length === 0 ? (
            <Text style={styles.recentEmpty}>Your last duels show here</Text>
          ) : (
            recent.map((r, i) => (
              <View key={i} style={[styles.recentChip, { borderColor: PICK_COLOR[r.o], opacity: 1 - i * 0.06 }]}>
                <Text style={[styles.recentText, { color: PICK_COLOR[r.o] }]}>
                  {r.p}–{r.h}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Arena */}
        <View style={[styles.arena, { width: S }]}>
          <LinearGradient colors={['#123A5A', '#0A1426', '#2A0A18']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          {Array.from({ length: 10 }, (_, i) => (
            <View key={i} style={[styles.ray, { left: S / 2 - 1, top: 120, height: S * 0.9, transform: [{ rotate: `${i * 36}deg` }, { translateY: -S * 0.45 }] }]} />
          ))}
          <View style={styles.arenaTitle}>
            <MaterialCommunityIcons name="sword-cross" size={14} color={GOLD} />
            <Text style={styles.arenaTitleText}>HIGHER TOTAL WINS</Text>
            <MaterialCommunityIcons name="sword-cross" size={14} color={GOLD} />
          </View>
          <View style={styles.arenaRow}>
            {tray('PLAYER')}
            <Animated.View style={[styles.vs, outcome === 'TIE' && { borderColor: VIOLET }, { transform: [{ scale: vsPulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.08] }) }] }]}>
              <LinearGradient colors={outcome === 'TIE' ? ['#E8D0FF', VIOLET, '#5A2A9A'] : ['#FFF4C8', GOLD, DEEP_GOLD]} style={styles.vsInner}>
                <Text style={styles.vsText}>{outcome === 'TIE' ? '=' : 'VS'}</Text>
              </LinearGradient>
            </Animated.View>
            {tray('HOUSE')}
          </View>
          {/* Result plate */}
          <View style={styles.plate}>
            {shown ? (
              shown.payout > shown.stake ? (
                <Text style={styles.plateWin}>
                  WIN {money(shown.payout)} <Text style={styles.plateSub}>({shown.m}x)</Text>
                </Text>
              ) : (
                <Text style={styles.plateText}>{shown.outcome === 'TIE' ? 'TIE · NO WIN' : shown.outcome === 'HOUSE' ? 'HOUSE WINS · NO WIN' : 'YOUR TOTAL HIGHER · NO WIN'}</Text>
              )
            ) : (
              <Text style={styles.plateText}>{busy ? 'ROLLING…' : 'BACK A SIDE · ROLL'}</Text>
            )}
          </View>
        </View>

        {/* Picks */}
        <View style={[styles.pickRow, { width: S }]}>
          {PICKS.map((p) => {
            const on = p === pick;
            const c = PICK_COLOR[p];
            const hit = shown && shown.pick === p && shown.outcome === p;
            return (
              <Pressable
                key={p}
                onPress={() => !busy && setPick(p)}
                disabled={busy}
                style={[styles.pick, on && { borderColor: c, backgroundColor: 'rgba(255,255,255,0.08)' }, busy && !on && styles.dim]}
              >
                {on && <MaterialCommunityIcons name="check-circle" size={14} color={c} style={styles.pickCheck} />}
                <Text style={[styles.pickName, { color: on ? c : '#B8C4D8' }]}>{PICK_LABEL[p]}</Text>
                <Text style={[styles.pickPay, hit && { color: GREEN }]}>{pays(p)}x</Text>
                <Text style={styles.pickSub}>pays {money(Math.min(floor2(bet * pays(p)), maxPayout))}</Text>
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
            <Text style={styles.betLabel}>BET</Text>
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
          <Pressable onPress={roll} disabled={busy || !config} style={({ pressed }) => [styles.mainWrap, pressed && { transform: [{ scale: 0.95 }] }]}>
            <Animated.View style={[styles.mainHalo, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.7] }) }]} />
            <LinearGradient colors={busy || !config ? ['#4A5A6A', '#1E2A3A'] : ['#FFF4C8', GOLD, DEEP_GOLD]} style={styles.mainBtn}>
              <MaterialCommunityIcons name={busy ? 'dots-horizontal' : 'dice-6'} size={26} color={INK} />
              {!busy && <Text style={styles.mainSmall}>ROLL</Text>}
            </LinearGradient>
          </Pressable>
          <Pressable onPress={openHistory} style={styles.sideBtn} hitSlop={6}>
            <MaterialCommunityIcons name="history" size={20} color={GOLD} />
            <Text style={styles.sideText}>HISTORY</Text>
          </Pressable>
        </View>

        <GameInfoButton>
          RTP {rtpLine} · bet {money(minStake)}–{money(maxStake)} · max {money(maxPayout)} per roll{'\n'}
          No autoplay or turbo · each roll takes at least 2.5 seconds · provably fair
        </GameInfoButton>
      </ScrollView>

      {banner && (
        <Animated.View pointerEvents="none" style={[styles.banner, { opacity: bannerAnim, transform: [{ scale: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }]}>
          <LinearGradient
            colors={banner.tone === 'TIE' ? ['#FFF4C8', GOLD, '#B87800'] : ['#1A5A9A', '#0A2440']}
            style={[styles.bannerInner, { borderColor: banner.tone === 'TIE' ? '#FFFFFF' : GOLD }]}
          >
            <MaterialCommunityIcons name="star-four-points" size={30} color={banner.tone === 'TIE' ? '#5A2A00' : GOLD} />
            <Text style={[styles.bannerText, banner.tone === 'TIE' && { color: '#3A1A00' }]}>{banner.title}</Text>
            {banner.sub ? <Text style={[styles.bannerSub, banner.tone === 'TIE' && { color: '#5A2A00' }]}>{banner.sub}</Text> : null}
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
              <Text style={styles.modalTitle}>{panel === 'info' ? 'HOW TO PLAY' : 'MY DUELS'}</Text>
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

function Rules({ bet, config }: { bet: number; config: DiceDuelConfig | null }) {
  if (!config) return <Text style={styles.note}>Loading…</Text>;
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.note}>
        Back a side, set your bet and ROLL. You and the house each roll two dice; the higher total wins. Back YOU WIN, HOUSE WINS or TIE (both totals equal). If your side comes up, your bet pays its
        multiplier; otherwise the bet is lost.
      </Text>
      <Text style={styles.section}>PAYS</Text>
      {config.picks.map((p) => (
        <View key={p.pick} style={styles.tRow}>
          <Text style={[styles.tCell, { color: PICK_COLOR[p.pick] }]}>{PICK_LABEL[p.pick]}</Text>
          <Text style={styles.tCell}>{p.multiplier}x</Text>
          <Text style={[styles.tCell, { color: '#A8B8CC' }]}>{(p.chance * 100).toFixed(2)}%</Text>
          <Text style={[styles.tCell, { textAlign: 'right' }]}>{money(Math.min(floor2(bet * p.multiplier), config.maxPayout))}</Text>
        </View>
      ))}
      <Text style={styles.section}>GAME INFO</Text>
      <Text style={styles.note}>
        Every one of the 1,296 ways the four dice can land is equally likely: you win 575 of them, the house 575 and a tie 146. Returns:{' '}
        {config.picks.map((p) => `${PICK_LABEL[p.pick]} ${p.rtpPercent}%`).join(' · ')}. No autoplay or turbo; each roll takes at least 2.5 seconds. The dice come from your provably-fair seeds (server
        seed hash, client seed and nonce on each roll).
      </Text>
    </View>
  );
}

function History({ bets }: { bets: DiceDuelBetRow[] | null }) {
  if (bets === null) return <Text style={styles.note}>Loading…</Text>;
  if (bets.length === 0) return <Text style={styles.note}>No duels yet.</Text>;
  return (
    <View>
      {bets.map((b) => {
        const payout = Number(b.payout);
        const d = new Date(b.createdAt);
        const p = b.playerDice[0] + b.playerDice[1];
        const h = b.houseDice[0] + b.houseDice[1];
        return (
          <View key={b.id} style={styles.histRow}>
            <Text style={styles.histTime}>{d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            <Text style={styles.histStake}>{money(Number(b.stake))}</Text>
            <Text style={[styles.histPick, { color: PICK_COLOR[b.pick] }]}>{b.pick === 'PLAYER' ? 'YOU' : b.pick}</Text>
            <Text style={styles.histMult}>
              {p}–{h}
            </Text>
            <Text style={[styles.histWin, { color: payout > 0 ? GREEN : '#8A8FA8' }]}>{payout > 0 ? `+${money(payout)}` : '—'}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#06080F' },
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
  recentEmpty: { color: '#6A7A90', fontSize: 11, fontWeight: '700' },
  recentChip: { paddingHorizontal: 8, height: 24, borderRadius: 12, borderWidth: 1.5, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  recentText: { fontSize: 11, fontWeight: '900' },
  tileVs: { position: 'absolute', backgroundColor: GOLD, borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  arena: { borderRadius: 20, overflow: 'hidden', borderWidth: 2.5, borderColor: DEEP_GOLD, paddingVertical: 12, alignItems: 'center' },
  ray: { position: 'absolute', width: 2, backgroundColor: 'rgba(255,214,107,0.06)' },
  arenaTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  arenaTitleText: { color: GOLD, fontSize: 12, fontWeight: '900', letterSpacing: 3 },
  arenaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  tray: { borderRadius: 16, borderWidth: 2, overflow: 'hidden', alignItems: 'center', paddingVertical: 8 },
  trayGlow: { borderRadius: 16, borderWidth: 3, backgroundColor: 'rgba(255,255,255,0.08)' },
  trayHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  trayName: { fontSize: 13, fontWeight: '900', letterSpacing: 3 },
  felt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'stretch', marginHorizontal: 8, marginTop: 6, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.3)' },
  totalBox: { marginTop: 8, minWidth: 54, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 12, borderWidth: 2, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  totalText: { fontSize: 26, fontWeight: '900', fontVariant: ['tabular-nums'] },
  winTag: { fontSize: 10, fontWeight: '900', letterSpacing: 2, marginTop: 4 },
  vs: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: '#FFFFFF', overflow: 'hidden' },
  vsInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  vsText: { color: INK, fontSize: 16, fontWeight: '900' },
  plate: { marginTop: 12, paddingHorizontal: 18, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(4,8,16,0.85)', borderWidth: 1.5, borderColor: GOLD },
  plateText: { color: TEXT, fontSize: 13, fontWeight: '900', letterSpacing: 1.5 },
  plateWin: { color: GREEN, fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  plateSub: { color: GOLD, fontSize: 13 },
  pickRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  pick: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12, borderWidth: 1.5, borderColor: '#2A3A52' },
  pickCheck: { position: 'absolute', top: 4, right: 5 },
  pickName: { fontSize: 11.5, fontWeight: '900', letterSpacing: 1 },
  pickPay: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', marginTop: 1 },
  pickSub: { color: '#8A9AB0', fontSize: 9.5, fontWeight: '700' },
  session: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)' },
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
  banner: { position: 'absolute', top: '52%', alignSelf: 'center' },
  bannerInner: { paddingHorizontal: 30, paddingVertical: 12, borderRadius: 16, borderWidth: 3, alignItems: 'center' },
  bannerText: { color: TEXT, fontSize: 32, fontWeight: '900', letterSpacing: 2 },
  bannerSub: { color: GOLD, fontSize: 14, fontWeight: '900', marginTop: 2, letterSpacing: 1 },
  toast: { position: 'absolute', bottom: 120, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14 },
  toastText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  modalBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  modalCard: { backgroundColor: '#0E1828', borderRadius: 16, borderWidth: 2, borderColor: DEEP_GOLD, padding: 14 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { color: TEXT, fontSize: 16, fontWeight: '900', letterSpacing: 3 },
  note: { color: '#C8D4E8', fontSize: 12, lineHeight: 17 },
  section: { color: GOLD, fontSize: 12, fontWeight: '900', letterSpacing: 2, marginTop: 4 },
  tRow: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.12)' },
  tCell: { flex: 1, color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)', gap: 6 },
  histTime: { color: '#8A9AB0', fontSize: 11, width: 64 },
  histStake: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', width: 66 },
  histPick: { fontSize: 10, fontWeight: '900', width: 50 },
  histMult: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', flex: 1 },
  histWin: { fontSize: 12, fontWeight: '900' },
});
