import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient as SvgLinearGradient, Path, Polygon, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../api/client';
import { WheelConfig, WheelRisk, WheelSpinRow, fetchWheelConfig, fetchWheelHistory, spinLuckyWheel } from '../api/backend';
import { useGameState } from '../state/GameStateContext';
import GameInfoButton from '../components/GameInfoButton';

const GOLD = '#FFD66B';
const DEEP_GOLD = '#B8860B';
const PURPLE = '#2A0A4A';
const GREEN = '#3DFF8A';
const TEXT = '#FFF4E4';
const INK = '#1A0626';
const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const DEFAULT_BET = 10;
const TOAST_MS = 1800;
/** No paid spin resolves faster than this, press to result. */
const MIN_SPIN_MS = 2500;
const SPIN_MS = 4200;
const RISKS: WheelRisk[] = ['LOW', 'MEDIUM', 'HIGH'];
const RISK_COLOR: Record<WheelRisk, string> = { LOW: GREEN, MEDIUM: '#5AC8FF', HIGH: '#FF5A7A' };

/** Used until the config arrives; the server's wheels replace it. */
const FALLBACK: Record<WheelRisk, number[]> = {
  LOW: [1.2, 0, 1.2, 1.2, 1.2, 0, 1.5, 0, 1.2, 1.2, 1.2, 0, 1.5, 0, 1.2, 1.2, 1.2, 0, 1.5, 0, 1.2, 1.2, 1.5, 0, 1.2, 0, 1.2, 1.5, 2.1, 0],
  MEDIUM: [6.9, 0, 0, 1.5, 0, 2, 0, 0, 1.5, 0, 0, 3, 0, 0, 1.5, 0, 2, 0, 0, 1.5, 0, 0, 3, 0, 0, 1.5, 0, 2, 0, 0],
  HIGH: [20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6.4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

/** Segment colours by multiplier: dark for a blank, warmer and brighter as it pays more. */
function segColor(m: number): [string, string] {
  if (m <= 0) return ['#3A2A4E', '#22163A'];
  if (m < 1.4) return ['#3ADCA0', '#0A8A5A'];
  if (m < 1.8) return ['#5AC8FF', '#1A6ACA'];
  if (m < 2.5) return ['#B88AFF', '#6A2ACA'];
  if (m < 4) return ['#FF9A3A', '#C8500A'];
  if (m < 10) return ['#FF5A7A', '#B8103A'];
  return ['#FFF0A0', '#D8A020'];
}

function fmtX(m: number): string {
  return m <= 0 ? '0' : `${Number.isInteger(m) ? m : m.toFixed(1)}x`;
}

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

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const run = (a: Animated.CompositeAnimation) => new Promise<void>((r) => a.start(() => r()));

// ---------- art ----------

/** The wheel face: coloured segments with their multipliers, rotating as one. */
const WheelFace = memo(function WheelFace({ size, segments, lit }: { size: number; segments: number[]; lit: number | null }) {
  const u = `wf${useId().replace(/:/g, '')}`;
  const n = segments.length;
  const r = 50;
  const step = (Math.PI * 2) / n;
  const pt = (a: number, rad: number) => `${50 + Math.sin(a) * rad},${50 - Math.cos(a) * rad}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        {segments.map((m, i) => {
          const [a, b] = segColor(m);
          return (
            <RadialGradient key={i} id={`${u}s${i}`} cx="50" cy="50" r="48" gradientUnits="userSpaceOnUse">
              <Stop offset="0.3" stopColor={b} />
              <Stop offset="1" stopColor={a} />
            </RadialGradient>
          );
        })}
      </Defs>
      {segments.map((m, i) => {
        const a0 = i * step;
        const a1 = (i + 1) * step;
        return <Path key={i} d={`M50,50 L${pt(a0, r)} A${r},${r} 0 0 1 ${pt(a1, r)} Z`} fill={`url(#${u}s${i})`} stroke={lit === i ? '#FFFFFF' : '#14062A'} strokeWidth={lit === i ? 1.2 : 0.5} />;
      })}
      {segments.map((m, i) => {
        const a = (i + 0.5) * step;
        const x = 50 + Math.sin(a) * 37;
        const y = 50 - Math.cos(a) * 37;
        const deg = (a * 180) / Math.PI;
        return (
          <SvgText
            key={`t${i}`}
            x={x}
            y={y + 1.6}
            fontSize={m >= 10 ? 4.6 : 4.2}
            fontWeight="900"
            fill={m <= 0 ? '#8A7AA8' : m >= 10 ? '#5A2A00' : '#FFFFFF'}
            textAnchor="middle"
            rotation={deg}
            origin={`${x}, ${y}`}
          >
            {fmtX(m)}
          </SvgText>
        );
      })}
    </Svg>
  );
});

/** The fixed frame: gold rim with bulbs, the hub, and the pointer at the top. */
const Frame = memo(function Frame({ size, blink }: { size: number; blink: boolean }) {
  const u = `fr${useId().replace(/:/g, '')}`;
  const bulbs = 24;
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id={`${u}g`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFF4C0" />
          <Stop offset="0.35" stopColor={GOLD} />
          <Stop offset="0.7" stopColor={DEEP_GOLD} />
          <Stop offset="1" stopColor="#6A4400" />
        </SvgLinearGradient>
        <RadialGradient id={`${u}h`} cx="0.4" cy="0.35" r="0.7">
          <Stop offset="0" stopColor="#FFF8D8" />
          <Stop offset="0.5" stopColor={GOLD} />
          <Stop offset="1" stopColor="#8A5A00" />
        </RadialGradient>
      </Defs>
      {/* rim (a thick ring around the face, which is drawn underneath at 100/120 of this size) */}
      <Circle cx={60} cy={60} r={55} fill="none" stroke={`url(#${u}g)`} strokeWidth={9} />
      <Circle cx={60} cy={60} r={50.5} fill="none" stroke="#6A4400" strokeWidth={0.8} />
      <Circle cx={60} cy={60} r={59.4} fill="none" stroke="#6A4400" strokeWidth={0.8} />
      {Array.from({ length: bulbs }, (_, i) => {
        const a = (i * Math.PI * 2) / bulbs;
        const on = (i % 2 === 0) === blink;
        return (
          <G key={i}>
            {on && <Circle cx={60 + Math.sin(a) * 55} cy={60 - Math.cos(a) * 55} r={3.2} fill="#FFF8C0" opacity={0.45} />}
            <Circle cx={60 + Math.sin(a) * 55} cy={60 - Math.cos(a) * 55} r={1.9} fill={on ? '#FFFDF0' : '#C89A3A'} stroke="#6A4400" strokeWidth={0.4} />
          </G>
        );
      })}
      {/* hub */}
      <Circle cx={60} cy={60} r={11} fill={`url(#${u}h)`} stroke="#6A4400" strokeWidth={1} />
      <Circle cx={60} cy={60} r={8} fill={PURPLE} stroke={GOLD} strokeWidth={0.8} />
      <SvgText x={60} y={59.2} fontSize={3} fontWeight="900" fill={GOLD} textAnchor="middle">
        LUCKY
      </SvgText>
      <SvgText x={60} y={63} fontSize={3} fontWeight="900" fill={GOLD} textAnchor="middle">
        WHEEL
      </SvgText>
      {/* pointer */}
      <Polygon points="60,15 53,1.5 67,1.5" fill={`url(#${u}g)`} stroke="#6A4400" strokeWidth={0.8} />
      <Polygon points="60,12 56,3.5 64,3.5" fill="#FF3A5A" />
      <Circle cx={60} cy={3.5} r={2} fill="#FFF8D8" stroke="#6A4400" strokeWidth={0.5} />
    </Svg>
  );
});

/** Home tile art: the wheel on a purple stage. */
export function LuckyWheelTileArt({ size }: { size: number }) {
  const d = size * 0.8;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size, alignItems: 'center' }} pointerEvents="none">
      <LinearGradient colors={['#4A1A7A', '#1A0626']} style={StyleSheet.absoluteFill} />
      <View style={{ marginTop: size * 0.03, width: d, height: d, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: (d * 100) / 120, height: (d * 100) / 120, transform: [{ rotate: '-18deg' }] }}>
          <WheelFace size={(d * 100) / 120} segments={FALLBACK.MEDIUM} lit={null} />
        </View>
        <Frame size={d} blink />
      </View>
    </View>
  );
}

// ---------- screen ----------

type Banner = { title: string; sub?: string; tone: 'win' | 'big' | 'plain' };

export default function LuckyWheelScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<WheelConfig | null>(null);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [risk, setRisk] = useState<WheelRisk>('MEDIUM');
  const [busy, setBusy] = useState(false);
  const [lit, setLit] = useState<number | null>(null);
  const [lastWin, setLastWin] = useState<{ payout: number; m: number } | null>(null);
  const [recent, setRecent] = useState<{ m: number; risk: WheelRisk }[]>([]);
  const [shownBalance, setShownBalance] = useState(coins);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [panel, setPanel] = useState<'info' | 'history' | null>(null);
  const [history, setHistory] = useState<WheelSpinRow[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sessionNet, setSessionNet] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [blink, setBlink] = useState(false);

  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const sessionStart = useRef(Date.now());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turn = useRef(new Animated.Value(0)).current;
  const turnDeg = useRef(0);
  const pulse = useRef(new Animated.Value(0)).current;
  const bannerAnim = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;

  const S = Math.min(W - 12, 470);
  const frameSize = S * 0.9;
  const faceSize = (frameSize * 100) / 120;

  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const maxPayout = config?.maxPayout ?? 10000;
  const betLevels = useMemo(() => BET_LEVELS.filter((b) => b >= minStake && b <= maxStake), [minStake, maxStake]);
  const segmentsFor = useCallback((r: WheelRisk) => config?.wheels.find((w) => w.risk === r)?.segments ?? FALLBACK[r], [config]);
  const segments = segmentsFor(risk);
  const n = segments.length;

  useEffect(() => {
    if (!busyRef.current) setShownBalance(coins);
  }, [coins]);

  useEffect(() => {
    mountedRef.current = true;
    fetchWheelConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => mountedRef.current && setToast('Could not load the game — check your connection.'));
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const lights = setInterval(() => setBlink((b) => !b), 550);
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
      clearInterval(lights);
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
    async (b: Banner, hold = 1100) => {
      setBanner(b);
      bannerAnim.setValue(0);
      await run(Animated.spring(bannerAnim, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }));
      await wait(hold);
      await run(Animated.timing(bannerAnim, { toValue: 0, duration: 180, useNativeDriver: true }));
      if (mountedRef.current) setBanner(null);
    },
    [bannerAnim],
  );

  const spin = useCallback(async () => {
    if (busyRef.current || !config) return;
    if (bet > shownBalance) {
      showToast('Insufficient balance');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setLit(null);
    setLastWin(null);
    setShownBalance((b) => round2(b - bet));
    const t0 = Date.now();
    // Start turning at once; the stop is set when the server answers.
    const windUp = Animated.timing(turn, { toValue: turnDeg.current + 360, duration: 700, easing: Easing.in(Easing.quad), useNativeDriver: true });
    windUp.start();
    try {
      const res = await spinLuckyWheel(bet, risk);
      if (!mountedRef.current) return;
      // Where the wind-up has got to; the slow-down carries on from there.
      const from = await new Promise<number>((r) => turn.stopAnimation(r));
      // Bring the landed segment's middle under the pointer at the top, a little off-centre so it looks natural.
      const step = 360 / n;
      const jitter = (Math.random() - 0.5) * step * 0.6;
      const target = -(res.segment * step + step / 2 + jitter);
      let to = target;
      while (to < from + 360 * 5) to += 360;
      turnDeg.current = to;
      await run(Animated.timing(turn, { toValue: to, duration: Math.max(SPIN_MS - (Date.now() - t0), MIN_SPIN_MS), easing: Easing.out(Easing.cubic), useNativeDriver: true }));
      if (!mountedRef.current) return;
      // Normalise so the angle doesn't grow without bound.
      const norm = ((to % 360) + 360) % 360;
      turn.setValue(norm);
      turnDeg.current = norm;
      await wait(Math.max(0, MIN_SPIN_MS - (Date.now() - t0)));
      const payout = Number(res.payout);
      const m = Number(res.multiplier);
      setLit(res.segment);
      setRecent((r) => [{ m, risk: res.risk }, ...r].slice(0, 12));
      setShownBalance((b) => round2(b + payout));
      setSessionNet((v) => round2(v + payout - bet));
      setLastWin({ payout, m });
      refreshWallet();
      if (panel === 'history')
        fetchWheelHistory(30)
          .then((h) => mountedRef.current && setHistory(h))
          .catch(() => {});
      // Only a return above the stake is celebrated.
      if (payout > bet) {
        glow.setValue(0);
        Animated.sequence([Animated.timing(glow, { toValue: 1, duration: 160, useNativeDriver: true }), Animated.timing(glow, { toValue: 0, duration: 900, useNativeDriver: true })]).start();
        await flashBanner({ title: m >= 6 ? 'BIG WIN!' : 'WIN!', sub: `${fmtX(m)} · ${money(payout)}`, tone: m >= 6 ? 'big' : 'win' }, m >= 6 ? 1500 : 900);
      }
    } catch (err) {
      turn.stopAnimation((v) => (turnDeg.current = v));
      if (mountedRef.current) {
        showToast(errorMessage(err));
        setShownBalance(coins);
        refreshWallet();
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  }, [config, bet, shownBalance, risk, n, turn, glow, flashBanner, panel, coins, refreshWallet, showToast]);

  const stepBet = (dir: 1 | -1) => {
    if (busy) return;
    const idx = Math.max(0, betLevels.indexOf(bet));
    setBet(betLevels[Math.max(0, Math.min(betLevels.length - 1, idx + dir))] ?? bet);
  };

  const pickRisk = (r: WheelRisk) => {
    if (busy) return;
    setRisk(r);
    setLit(null);
    setLastWin(null);
  };

  const openHistory = () => {
    setPanel('history');
    setHistory(null);
    fetchWheelHistory(30)
      .then((h) => mountedRef.current && setHistory(h))
      .catch(() => mountedRef.current && setHistory([]));
  };

  const minutes = Math.floor((now - sessionStart.current) / 60000);
  const seconds = Math.floor(((now - sessionStart.current) % 60000) / 1000);
  // The distinct prizes on this wheel and how many segments carry each.
  const prizes = useMemo(() => {
    const counts = new Map<number, number>();
    segments.forEach((m) => counts.set(m, (counts.get(m) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[0] - a[0]);
  }, [segments]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#3A0E5E', '#12041E']} style={StyleSheet.absoluteFill} />

      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={TEXT} />
          <MaterialCommunityIcons name="ship-wheel" size={18} color={GOLD} />
          <Text style={styles.title}>LUCKY WHEEL</Text>
        </Pressable>
        <View style={styles.balancePill}>
          <MaterialCommunityIcons name="wallet" size={15} color={GOLD} />
          <Text style={styles.balanceText}>{money(shownBalance)}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24, alignItems: 'center' }} scrollEnabled={!busy}>
        {/* Recent results */}
        <View style={[styles.recentRow, { width: S }]}>
          {recent.length === 0 ? (
            <Text style={styles.recentEmpty}>Your last spins show here</Text>
          ) : (
            recent.map((r, i) => {
              const [a] = segColor(r.m);
              return (
                <View key={i} style={[styles.recentChip, { borderColor: a, opacity: 1 - i * 0.06 }]}>
                  <Text style={[styles.recentText, { color: r.m > 0 ? a : '#8A7AA8' }]}>{fmtX(r.m)}</Text>
                </View>
              );
            })
          )}
        </View>

        {/* Stage */}
        <View style={[styles.stage, { width: S, height: frameSize + 84 }]}>
          <LinearGradient colors={['#5A1A8A', '#2A0A4A', '#14041E']} style={StyleSheet.absoluteFill} />
          {/* spotlight rays */}
          {Array.from({ length: 12 }, (_, i) => (
            <View key={i} style={[styles.ray, { left: S / 2 - 1, top: 34 + frameSize / 2, height: S * 0.75, transform: [{ rotate: `${i * 30}deg` }, { translateY: -S * 0.375 }] }]} />
          ))}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.winGlow,
              { width: frameSize * 1.05, height: frameSize * 1.05, borderRadius: frameSize, left: (S - frameSize * 1.05) / 2, top: 34 + frameSize / 2 - frameSize * 0.525, opacity: glow },
            ]}
          />
          <View style={{ position: 'absolute', top: 34, left: (S - frameSize) / 2, width: frameSize, height: frameSize, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View style={{ width: faceSize, height: faceSize, transform: [{ rotate: turn.interpolate({ inputRange: [-3600, 3600], outputRange: ['-3600deg', '3600deg'] }) }] }}>
              <WheelFace size={faceSize} segments={segments} lit={lit} />
            </Animated.View>
            <Frame size={frameSize} blink={busy ? blink : !blink} />
          </View>
          {/* Result plate */}
          <View style={[styles.plate, { top: 34 + frameSize + 6 }]}>
            {lastWin ? (
              lastWin.payout > bet ? (
                <Text style={styles.plateWin}>
                  WIN {money(lastWin.payout)} <Text style={styles.plateSub}>({fmtX(lastWin.m)})</Text>
                </Text>
              ) : lastWin.payout > 0 ? (
                <Text style={styles.plateText}>RETURNED {money(lastWin.payout)}</Text>
              ) : (
                <Text style={styles.plateText}>NO WIN</Text>
              )
            ) : (
              <Text style={styles.plateText}>{busy ? 'SPINNING…' : `PICK A RISK · SPIN`}</Text>
            )}
          </View>
        </View>

        {/* Risk */}
        <View style={[styles.riskRow, { width: S }]}>
          {RISKS.map((r) => {
            const on = r === risk;
            const segs = segmentsFor(r);
            const top = Math.max(...segs);
            const hits = segs.filter((m) => m > 0).length;
            return (
              <Pressable
                key={r}
                onPress={() => pickRisk(r)}
                disabled={busy}
                style={[styles.risk, on && { borderColor: RISK_COLOR[r], backgroundColor: 'rgba(255,255,255,0.08)' }, busy && !on && styles.dim]}
              >
                <Text style={[styles.riskName, { color: on ? RISK_COLOR[r] : '#D8C8E8' }]}>{r}</Text>
                <Text style={styles.riskTop}>up to {fmtX(top)}</Text>
                <Text style={styles.riskSub}>
                  {hits}/{segs.length} pay
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Prizes on this wheel */}
        <View style={[styles.prizeRow, { width: S }]}>
          {prizes.map(([m, c]) => {
            const [a, b] = segColor(m);
            return (
              <LinearGradient key={m} colors={[a, b]} style={styles.prize}>
                <Text style={[styles.prizeX, m >= 10 && { color: '#5A2A00' }]}>{fmtX(m)}</Text>
                <Text style={[styles.prizeC, m >= 10 && { color: '#5A2A00' }]}>×{c}</Text>
              </LinearGradient>
            );
          })}
        </View>

        {/* Session (time played and net position, always on show) */}
        <View style={[styles.session, { width: S }]}>
          <MaterialCommunityIcons name="timer-outline" size={15} color="#D8C8E8" />
          <Text style={styles.sessionText}>
            Session {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </Text>
          <Text style={styles.sessionSep}>·</Text>
          <Text style={[styles.sessionText, { color: sessionNet > 0 ? GREEN : sessionNet < 0 ? '#FF9AA6' : '#D8C8E8' }]}>
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
          <Pressable onPress={spin} disabled={busy || !config} style={({ pressed }) => [styles.mainWrap, pressed && { transform: [{ scale: 0.95 }] }]}>
            <Animated.View style={[styles.mainHalo, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.7] }) }]} />
            <LinearGradient colors={busy || !config ? ['#5A4A6A', '#2A1E3A'] : ['#FFF4C8', GOLD, DEEP_GOLD]} style={styles.mainBtn}>
              <MaterialCommunityIcons name={busy ? 'dots-horizontal' : 'rotate-right'} size={26} color={INK} />
              {!busy && <Text style={styles.mainSmall}>SPIN</Text>}
            </LinearGradient>
          </Pressable>
          <Pressable onPress={openHistory} style={styles.sideBtn} hitSlop={6}>
            <MaterialCommunityIcons name="history" size={20} color={GOLD} />
            <Text style={styles.sideText}>HISTORY</Text>
          </Pressable>
        </View>

        <GameInfoButton>
          RTP {config?.rtpPercent ?? 88}% on every risk level · bet {money(minStake)}–{money(maxStake)} · max {money(maxPayout)} per spin{'\n'}
          No autoplay or turbo · each spin takes at least 2.5 seconds · provably fair
        </GameInfoButton>
      </ScrollView>

      {banner && (
        <Animated.View pointerEvents="none" style={[styles.banner, { opacity: bannerAnim, transform: [{ scale: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }]}>
          <LinearGradient
            colors={banner.tone === 'big' ? ['#FFF4C8', GOLD, '#B87800'] : ['#6A2AAA', '#2A0A4A']}
            style={[styles.bannerInner, { borderColor: banner.tone === 'big' ? '#FFFFFF' : GOLD }]}
          >
            <MaterialCommunityIcons name="star-four-points" size={30} color={banner.tone === 'big' ? '#5A2A00' : GOLD} />
            <Text style={[styles.bannerText, banner.tone === 'big' && { color: '#3A1A00' }]}>{banner.title}</Text>
            {banner.sub ? <Text style={[styles.bannerSub, banner.tone === 'big' && { color: '#5A2A00' }]}>{banner.sub}</Text> : null}
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
              <Text style={styles.modalTitle}>{panel === 'info' ? 'HOW TO PLAY' : 'MY SPINS'}</Text>
              <Pressable onPress={() => setPanel(null)} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={22} color={TEXT} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 480 }}>{panel === 'info' ? <Rules bet={bet} config={config} /> : <History spins={history} />}</ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Rules({ bet, config }: { bet: number; config: WheelConfig | null }) {
  if (!config) return <Text style={styles.note}>Loading…</Text>;
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.note}>
        Pick a risk level and your bet, then SPIN. The wheel has {config.segments} equal segments; your bet pays the multiplier of the segment the pointer stops on. A 0 segment pays nothing.
      </Text>
      {config.wheels.map((w) => {
        const counts = new Map<number, number>();
        w.segments.forEach((m) => counts.set(m, (counts.get(m) ?? 0) + 1));
        return (
          <View key={w.risk} style={{ marginTop: 4 }}>
            <Text style={[styles.section, { color: RISK_COLOR[w.risk] }]}>
              {w.risk} · RTP {w.rtpPercent}%
            </Text>
            {[...counts.entries()]
              .sort((a, b) => b[0] - a[0])
              .map(([m, c]) => (
                <View key={m} style={styles.tRow}>
                  <Text style={styles.tCell}>{fmtX(m)}</Text>
                  <Text style={styles.tCell}>
                    {c} of {w.segments.length}
                  </Text>
                  <Text style={[styles.tCell, { textAlign: 'right' }]}>{m > 0 ? money(Math.min(floor2(bet * m), config.maxPayout)) : '—'}</Text>
                </View>
              ))}
          </View>
        );
      })}
      <Text style={styles.section}>GAME INFO</Text>
      <Text style={styles.note}>
        Every risk level returns exactly {config.rtpPercent}% over time (the average segment). No autoplay or turbo; each spin takes at least 2.5 seconds. The segment comes from your provably-fair
        seeds (server seed hash, client seed and nonce in each spin).
      </Text>
    </View>
  );
}

function History({ spins }: { spins: WheelSpinRow[] | null }) {
  if (spins === null) return <Text style={styles.note}>Loading…</Text>;
  if (spins.length === 0) return <Text style={styles.note}>No spins yet.</Text>;
  return (
    <View>
      {spins.map((s) => {
        const payout = Number(s.payout);
        const d = new Date(s.createdAt);
        return (
          <View key={s.id} style={styles.histRow}>
            <Text style={styles.histTime}>{d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            <Text style={styles.histStake}>{money(Number(s.stake))}</Text>
            <Text style={[styles.histRisk, { color: RISK_COLOR[s.risk] }]}>{s.risk}</Text>
            <Text style={styles.histMult}>{fmtX(Number(s.multiplier))}</Text>
            <Text style={[styles.histWin, { color: payout > 0 ? GREEN : '#8A8FA8' }]}>{payout > 0 ? `+${money(payout)}` : '—'}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#12041E' },
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
  recentEmpty: { color: '#8A7AA8', fontSize: 11, fontWeight: '700' },
  recentChip: { paddingHorizontal: 8, height: 24, borderRadius: 12, borderWidth: 1.5, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  recentText: { fontSize: 11, fontWeight: '900' },
  stage: { borderRadius: 20, overflow: 'hidden', borderWidth: 2.5, borderColor: DEEP_GOLD },
  ray: { position: 'absolute', width: 2, backgroundColor: 'rgba(255,214,107,0.08)' },
  winGlow: { position: 'absolute', backgroundColor: GOLD },
  plate: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(10,2,18,0.85)', borderWidth: 1.5, borderColor: GOLD },
  plateText: { color: TEXT, fontSize: 13, fontWeight: '900', letterSpacing: 1.5 },
  plateWin: { color: GREEN, fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  plateSub: { color: GOLD, fontSize: 13 },
  riskRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  risk: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 12, borderWidth: 1.5, borderColor: '#4A2A6A' },
  riskName: { fontSize: 13, fontWeight: '900', letterSpacing: 1.5 },
  riskTop: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', marginTop: 1 },
  riskSub: { color: '#A890C8', fontSize: 9.5, fontWeight: '700' },
  prizeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8, justifyContent: 'center' },
  prize: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10 },
  prizeX: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  prizeC: { color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: '800' },
  session: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)' },
  sessionText: { color: '#D8C8E8', fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sessionSep: { color: '#5A4A70', fontSize: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingHorizontal: 4 },
  sideBtn: { alignItems: 'center', gap: 2, width: 58 },
  sideText: { color: GOLD, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  betBox: { alignItems: 'center', gap: 4 },
  betLabel: { color: '#C8B0E0', fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  betRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(20,6,34,0.9)',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#5A2A8A',
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
  banner: { position: 'absolute', top: '40%', alignSelf: 'center' },
  bannerInner: { paddingHorizontal: 30, paddingVertical: 12, borderRadius: 16, borderWidth: 3, alignItems: 'center' },
  bannerText: { color: TEXT, fontSize: 32, fontWeight: '900', letterSpacing: 2 },
  bannerSub: { color: GOLD, fontSize: 14, fontWeight: '900', marginTop: 2, letterSpacing: 1 },
  toast: { position: 'absolute', bottom: 120, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14 },
  toastText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  modalBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  modalCard: { backgroundColor: '#22083A', borderRadius: 16, borderWidth: 2, borderColor: DEEP_GOLD, padding: 14 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { color: TEXT, fontSize: 16, fontWeight: '900', letterSpacing: 3 },
  note: { color: '#D8C8E8', fontSize: 12, lineHeight: 17 },
  section: { color: GOLD, fontSize: 12, fontWeight: '900', letterSpacing: 2, marginTop: 4 },
  tRow: { flexDirection: 'row', paddingVertical: 3, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.12)' },
  tCell: { flex: 1, color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)', gap: 6 },
  histTime: { color: '#A898B8', fontSize: 11, width: 64 },
  histStake: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', width: 58 },
  histRisk: { fontSize: 10, fontWeight: '900', width: 54 },
  histMult: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', flex: 1 },
  histWin: { fontSize: 12, fontWeight: '900' },
});
