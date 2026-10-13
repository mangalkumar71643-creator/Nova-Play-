import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient as SvgLinearGradient, Path, Polygon, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../api/client';
import { BombConfig, BombRound, cashOutBomb, cutBombWire, fetchBombConfig, fetchBombCurrent, fetchBombHistory, startBombRound } from '../api/backend';
import { useGameState } from '../state/GameStateContext';
import GameInfoButton from '../components/GameInfoButton';

const HAZARD = '#FFC21A';
const LED_RED = '#FF2A2A';
const STEEL = '#3A404A';
const GREEN = '#3DFF8A';
const RED = '#FF4D5E';
const INK = '#0A0B0E';
const TEXT = '#E4E8F0';
const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const DEFAULT_BET = 10;
const WIRES = 8;
const TOAST_MS = 1800;
const WIRE_COLORS = ['#FF3B3B', '#3B8BFF', '#FFD23B', '#3BDC6A', '#F4F4F4', '#B36BFF', '#FF8A2A', '#2ADCE0'];
const WIRE_NAMES = ['red', 'blue', 'yellow', 'green', 'white', 'purple', 'orange', 'cyan'];
const MODES = [2, 3, 5];
const MODE_NAME: Record<number, string> = { 2: 'EASY', 3: 'MEDIUM', 5: 'HARD' };
const MODE_COLOR: Record<number, string> = { 2: GREEN, 3: HAZARD, 5: RED };
const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function floor2(n: number): number {
  return Math.floor(Number((n * 100).toPrecision(12))) / 100;
}

function money(n: number): string {
  return `₹${n.toFixed(2)}`;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

/** Same ladder as the server: 88% / P(no live wire in `cuts` cuts). */
function ladderFor(live: number): number[] {
  const out = [1];
  let p = 1;
  for (let k = 0; k < WIRES - live; k++) {
    p *= (WIRES - live - k) / (WIRES - k);
    out.push(floor2(0.88 / p));
  }
  return out;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const run = (a: Animated.CompositeAnimation) => new Promise<void>((r) => a.start(() => r()));

// ---------- art ----------

/** A bundle of three dynamite sticks with black tape. */
const Dynamite = memo(function Dynamite({ w, h }: { w: number; h: number }) {
  const u = `bd${useId().replace(/:/g, '')}`;
  const sw = w / 3;
  return (
    <Svg width={w} height={h}>
      <Defs>
        <SvgLinearGradient id={`${u}s`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#6A0A0A" />
          <Stop offset="0.35" stopColor="#FF5A4A" />
          <Stop offset="0.7" stopColor="#C81A14" />
          <Stop offset="1" stopColor="#4A0404" />
        </SvgLinearGradient>
      </Defs>
      {[0, 1, 2].map((i) => (
        <G key={i}>
          <Rect x={i * sw + 1} y={h * 0.08} width={sw - 2} height={h * 0.9} rx={sw * 0.18} fill={`url(#${u}s)`} stroke="#2A0000" strokeWidth={1} />
          <Ellipse cx={i * sw + sw / 2} cy={h * 0.09} rx={sw / 2 - 1} ry={sw * 0.16} fill="#E8C8A0" stroke="#2A0000" strokeWidth={1} />
          <Path d={`M${i * sw + sw / 2} ${h * 0.09} q ${sw * 0.2} ${-h * 0.06} ${sw * (i - 1) * 0.3} ${-h * 0.08}`} stroke="#2A2A2A" strokeWidth={1.5} fill="none" />
        </G>
      ))}
      <Rect x={0} y={h * 0.32} width={w} height={h * 0.1} fill="#141414" />
      <Rect x={0} y={h * 0.7} width={w} height={h * 0.1} fill="#141414" />
      <SvgText x={w / 2} y={h * 0.6} fontSize={sw * 0.5} fontWeight="900" fill="#FFE8C0" textAnchor="middle" opacity={0.9}>
        TNT
      </SvgText>
    </Svg>
  );
});

type Geo = { S: number; H: number; caseX: number; caseY: number; caseW: number; caseH: number; wireTop: number; wireBot: number; colX: number; colW: number };

function geometry(S: number, H: number): Geo {
  const caseX = S * 0.04;
  const caseY = H * 0.07;
  const caseW = S * 0.92;
  const caseH = H * 0.86;
  const colX = S * 0.1;
  const colW = (S * 0.8) / WIRES;
  return { S, H, caseX, caseY, caseW, caseH, wireTop: H * 0.47, wireBot: H * 0.79, colX, colW };
}

/** Workbench, hazard tape and the steel bomb case with its terminal blocks. */
const BombCase = memo(function BombCase({ g, tile }: { g: Geo; tile?: boolean }) {
  const u = `bc${useId().replace(/:/g, '')}`;
  const { S, H, caseX, caseY, caseW, caseH, wireTop, wireBot, colX, colW } = g;
  const stripe = H * 0.035;
  const stripes = (y: number) =>
    Array.from({ length: Math.ceil(S / (stripe * 2)) + 2 }, (_, i) => (
      <Polygon key={`${y}-${i}`} points={`${i * stripe * 2 - stripe},${y + stripe} ${i * stripe * 2},${y} ${i * stripe * 2 + stripe},${y} ${i * stripe * 2},${y + stripe}`} fill={INK} />
    ));
  return (
    <Svg width={S} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id={`${u}bg`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#22262E" />
          <Stop offset="1" stopColor="#0A0B0E" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${u}case`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#6A727E" />
          <Stop offset="0.45" stopColor={STEEL} />
          <Stop offset="1" stopColor="#1E2228" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${u}plate`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#2A2E36" />
          <Stop offset="1" stopColor="#14171C" />
        </SvgLinearGradient>
        <RadialGradient id={`${u}brass`} cx="0.35" cy="0.3" r="0.8">
          <Stop offset="0" stopColor="#FFF0B0" />
          <Stop offset="0.5" stopColor="#C8962A" />
          <Stop offset="1" stopColor="#5A3A00" />
        </RadialGradient>
        <SvgLinearGradient id={`${u}board`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#0A3A1E" />
          <Stop offset="1" stopColor="#04200F" />
        </SvgLinearGradient>
      </Defs>
      <Rect x={0} y={0} width={S} height={H} fill={`url(#${u}bg)`} />
      <Rect x={0} y={0} width={S} height={stripe} fill={HAZARD} />
      {stripes(0)}
      <Rect x={0} y={H - stripe} width={S} height={stripe} fill={HAZARD} />
      {stripes(H - stripe)}
      {/* case */}
      <Rect x={caseX + 4} y={caseY + 6} width={caseW} height={caseH} rx={18} fill="#000000" opacity={0.5} />
      <Rect x={caseX} y={caseY} width={caseW} height={caseH} rx={18} fill={`url(#${u}case)`} stroke="#8A929E" strokeWidth={1.5} />
      <Rect x={caseX + 8} y={caseY + 8} width={caseW - 16} height={caseH - 16} rx={12} fill="none" stroke="#14171C" strokeWidth={2} />
      {[
        [caseX + 16, caseY + 16],
        [caseX + caseW - 16, caseY + 16],
        [caseX + 16, caseY + caseH - 16],
        [caseX + caseW - 16, caseY + caseH - 16],
      ].map(([x, y], i) => (
        <G key={i}>
          <Circle cx={x} cy={y} r={5} fill="#9AA2AE" stroke="#14171C" strokeWidth={1} />
          <Path d={`M${x - 3} ${y} L ${x + 3} ${y}`} stroke="#3A404A" strokeWidth={1.4} />
        </G>
      ))}
      {/* circuit board behind the wires */}
      <Rect x={colX - 10} y={wireTop - 18} width={colW * WIRES + 20} height={wireBot - wireTop + 36} rx={8} fill={`url(#${u}board)`} stroke="#0A1A10" strokeWidth={1.5} />
      {!tile &&
        Array.from({ length: 7 }, (_, i) => (
          <Path
            key={`tr${i}`}
            d={`M${colX - 6} ${wireTop + ((wireBot - wireTop) * (i + 0.5)) / 7} h ${colW * (1 + (i % 3))} v ${8 + i} h ${colW * 2}`}
            stroke="#2A7A4A"
            strokeOpacity={0.45}
            strokeWidth={1.2}
            fill="none"
          />
        ))}
      {/* terminal blocks */}
      {[wireTop - 18, wireBot + 4].map((y, k) => (
        <G key={k}>
          <Rect x={colX - 8} y={y} width={colW * WIRES + 16} height={14} rx={4} fill={`url(#${u}plate)`} stroke="#4A505A" strokeWidth={1} />
          {Array.from({ length: WIRES }, (_, i) => (
            <Circle key={i} cx={colX + colW * i + colW / 2} cy={y + 7} r={4.2} fill={`url(#${u}brass)`} stroke="#2A1A00" strokeWidth={0.8} />
          ))}
        </G>
      ))}
    </Svg>
  );
});

type WireState = 'whole' | 'safe' | 'boom';

/** The eight wires, each a wavy run from the top terminal to the bottom one, split where cut. */
const Wires = memo(function Wires({ g, states, live }: { g: Geo; states: WireState[]; live: number[] }) {
  const { S, H, wireTop, wireBot, colX, colW } = g;
  const mid = (wireTop + wireBot) / 2;
  const sw = Math.max(5, colW * 0.24);
  const wave = (cx: number, y0: number, y1: number) => {
    const a = colW * 0.22;
    const h = (y1 - y0) / 4;
    return `M${cx} ${y0} C ${cx + a} ${y0 + h}, ${cx - a} ${y0 + h * 2}, ${cx} ${y0 + h * 2} S ${cx + a} ${y0 + h * 3.2}, ${cx} ${y1}`;
  };
  const half = (cx: number, top: boolean) => {
    const a = colW * 0.22;
    return top
      ? `M${cx} ${wireTop} C ${cx + a} ${wireTop + (mid - wireTop) / 2}, ${cx - a} ${mid - 20}, ${cx - 3} ${mid - 7}`
      : `M${cx + 3} ${mid + 7} C ${cx + a} ${mid + 20}, ${cx - a} ${wireBot - (wireBot - mid) / 2}, ${cx} ${wireBot}`;
  };
  return (
    <Svg width={S} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: WIRES }, (_, i) => {
        const cx = colX + colW * i + colW / 2;
        const color = WIRE_COLORS[i];
        const st = states[i];
        const isLive = live.includes(i);
        const paths = st === 'whole' ? [wave(cx, wireTop, wireBot)] : [half(cx, true), half(cx, false)];
        return (
          <G key={i}>
            {isLive && <Path d={wave(cx, wireTop, wireBot)} stroke={RED} strokeOpacity={0.35} strokeWidth={sw * 2.6} fill="none" strokeLinecap="round" />}
            {paths.map((d, k) => (
              <G key={k}>
                <Path d={d} stroke="#000000" strokeOpacity={0.6} strokeWidth={sw + 3} fill="none" strokeLinecap="round" />
                <Path d={d} stroke={st === 'boom' ? '#2A2220' : color} strokeWidth={sw} fill="none" strokeLinecap="round" />
                <Path d={d} stroke="#FFFFFF" strokeOpacity={st === 'boom' ? 0.05 : 0.35} strokeWidth={sw * 0.25} fill="none" strokeLinecap="round" transform={`translate(${-sw * 0.2} 0)`} />
              </G>
            ))}
            {st !== 'whole' && (
              <>
                <Circle cx={cx - 3} cy={mid - 7} r={sw * 0.3} fill="#E8902A" />
                <Circle cx={cx + 3} cy={mid + 7} r={sw * 0.3} fill="#E8902A" />
              </>
            )}
            {/* status LED above the top terminal */}
            <Circle cx={cx} cy={wireTop - 28} r={5} fill={st === 'safe' ? GREEN : st === 'boom' || isLive ? LED_RED : '#2A2E36'} stroke="#000000" strokeWidth={1} />
            {(st === 'safe' || st === 'boom' || isLive) && <Circle cx={cx} cy={wireTop - 28} r={9} fill={st === 'safe' ? GREEN : LED_RED} opacity={0.3} />}
          </G>
        );
      })}
    </Svg>
  );
});

/** An explosion: rings of jagged flame and smoke. */
const Blast = memo(function Blast({ size }: { size: number }) {
  const u = `bb${useId().replace(/:/g, '')}`;
  const star = (r1: number, r2: number, n: number, rot: number) =>
    Array.from({ length: n * 2 }, (_, i) => {
      const r = i % 2 ? r2 : r1;
      const a = rot + (i * Math.PI) / n;
      return `${50 + r * Math.cos(a)},${50 + r * Math.sin(a)}`;
    }).join(' ');
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={`${u}f`} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.3" stopColor="#FFE85A" />
          <Stop offset="0.7" stopColor="#FF7A1A" />
          <Stop offset="1" stopColor="#C81A00" />
        </RadialGradient>
      </Defs>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Circle key={i} cx={50 + 34 * Math.cos(i * 1.05)} cy={50 + 34 * Math.sin(i * 1.05)} r={14} fill="#2A2420" opacity={0.55} />
      ))}
      <Polygon points={star(48, 30, 12, 0)} fill="#C81A00" />
      <Polygon points={star(40, 24, 10, 0.3)} fill={`url(#${u}f)`} />
      <Polygon points={star(24, 14, 8, 0.1)} fill="#FFF4A0" />
      <SvgText x={50} y={57} fontSize={18} fontWeight="900" fill="#5A0A00" textAnchor="middle">
        BOOM
      </SvgText>
    </Svg>
  );
});

/** Home tile art: the bomb case, its red display and a few wires. */
export function BombSquadTileArt({ size }: { size: number }) {
  const g = { ...geometry(size, size), wireTop: size * 0.38, wireBot: size * 0.56 };
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size }} pointerEvents="none">
      <BombCase g={g} tile />
      <Wires g={g} states={['whole', 'safe', 'whole', 'whole', 'whole', 'safe', 'whole', 'whole']} live={[]} />
      <View style={{ position: 'absolute', left: size * 0.1, top: size * 0.1 }}>
        <Dynamite w={size * 0.2} h={size * 0.2} />
      </View>
      <View style={{ position: 'absolute', right: size * 0.1, top: size * 0.1 }}>
        <Dynamite w={size * 0.2} h={size * 0.2} />
      </View>
      <View style={[styles.led, { position: 'absolute', left: size * 0.31, top: size * 0.12, width: size * 0.38, height: size * 0.13, paddingHorizontal: 2 }]}>
        <Text style={[styles.ledText, { fontSize: size * 0.07, letterSpacing: 0 }]} numberOfLines={1}>
          00:07
        </Text>
      </View>
    </View>
  );
}

// ---------- screen ----------

type Phase = 'idle' | 'aim' | 'cutting' | 'over';
type Banner = { title: string; sub?: string; tone: 'win' | 'lose' };

export default function BombSquadScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<BombConfig | null>(null);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [live, setLive] = useState(3);
  const [round, setRound] = useState<BombRound | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [snip, setSnip] = useState<{ wire: number; text: string } | null>(null);
  const [shownBalance, setShownBalance] = useState(coins);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [panel, setPanel] = useState<'info' | 'history' | null>(null);
  const [history, setHistory] = useState<BombRound[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sessionNet, setSessionNet] = useState(0);
  const [now, setNow] = useState(Date.now());

  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const sessionStart = useRef(Date.now());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(0)).current;
  const bannerAnim = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const blast = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const snipAnim = useRef(new Animated.Value(0)).current;

  const S = Math.min(W - 12, 470);
  const H = Math.round(S * 1.0);
  const g = useMemo(() => geometry(S, H), [S, H]);

  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const maxPayout = config?.maxPayout ?? 10000;
  const betLevels = useMemo(() => BET_LEVELS.filter((b) => b >= minStake && b <= maxStake), [minStake, maxStake]);
  const activeLive = round?.live ?? live;
  const ladder = useMemo(() => config?.modes.find((m) => m.live === activeLive)?.multipliers ?? ladderFor(activeLive), [config, activeLive]);
  const steps = WIRES - activeLive;
  const stake = round ? Number(round.stake) : bet;
  const safeCuts = round?.safeCuts ?? 0;
  const pending = round?.status === 'PENDING';
  const lost = round?.status === 'LOST';
  const won = round?.status === 'WON';
  const cashValue = pending && safeCuts > 0 ? Math.min(floor2(stake * Number(round!.multiplier)), maxPayout) : 0;
  const cuts = round?.cuts ?? [];
  const liveWires = round?.liveWires ?? [];
  const states: WireState[] = useMemo(() => Array.from({ length: WIRES }, (_, i) => (!cuts.includes(i) ? 'whole' : lost && cuts[cuts.length - 1] === i ? 'boom' : 'safe')), [cuts, lost]);

  useEffect(() => {
    if (!busyRef.current) setShownBalance(coins);
  }, [coins]);

  useEffect(() => {
    mountedRef.current = true;
    fetchBombConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => mountedRef.current && setToast('Could not load the game — check your connection.'));
    // Pick up a bomb left unfinished.
    fetchBombCurrent()
      .then((r) => {
        if (!mountedRef.current || !r) return;
        setRound(r);
        setLive(r.live);
        setBet(Number(r.stake));
        setPhase('aim');
      })
      .catch(() => {});
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const loops = [
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(blink, { toValue: 1, duration: 120, useNativeDriver: true }),
          Animated.delay(380),
          Animated.timing(blink, { toValue: 0, duration: 120, useNativeDriver: true }),
          Animated.delay(380),
        ]),
      ),
    ];
    loops.forEach((l) => l.start());
    return () => {
      mountedRef.current = false;
      clearInterval(clock);
      loops.forEach((l) => l.stop());
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [pulse, blink]);

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const flashBanner = useCallback(
    async (b: Banner, hold = 1000) => {
      setBanner(b);
      bannerAnim.setValue(0);
      await run(Animated.spring(bannerAnim, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }));
      await wait(hold);
      await run(Animated.timing(bannerAnim, { toValue: 0, duration: 180, useNativeDriver: true }));
      if (mountedRef.current) setBanner(null);
    },
    [bannerAnim],
  );

  const settle = useCallback(
    (payout: number) => {
      setShownBalance((b) => round2(b + payout));
      setSessionNet((n) => round2(n + payout));
      refreshWallet();
      if (panel === 'history')
        fetchBombHistory(30)
          .then((h) => mountedRef.current && setHistory(h))
          .catch(() => {});
    },
    [refreshWallet, panel],
  );

  const arm = useCallback(async () => {
    if (busyRef.current || !config || pending) return;
    if (bet > shownBalance) {
      showToast('Insufficient balance');
      return;
    }
    busyRef.current = true;
    try {
      const r = await startBombRound(bet, live);
      if (!mountedRef.current) return;
      blast.setValue(0);
      setRound(r);
      setShownBalance((b) => round2(b - bet));
      setSessionNet((n) => round2(n - bet));
      setPhase('aim');
    } catch (err) {
      showToast(errorMessage(err));
    } finally {
      busyRef.current = false;
    }
  }, [config, pending, bet, shownBalance, live, blast, showToast]);

  const cut = useCallback(
    async (wire: number) => {
      if (busyRef.current || phase !== 'aim' || !round || round.status !== 'PENDING' || round.cuts.includes(wire)) return;
      busyRef.current = true;
      setPhase('cutting');
      setSnip({ wire, text: '' });
      snipAnim.setValue(0);
      try {
        // The cutters close on the wire while the server answers.
        const [res] = await Promise.all([cutBombWire(round.id, wire), run(Animated.timing(snipAnim, { toValue: 1, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: true }))]);
        if (!mountedRef.current) return;
        const r = res.round;
        setRound(r);
        if (res.boom) {
          setSnip(null);
          blast.setValue(0);
          flash.setValue(0);
          await run(
            Animated.parallel([
              Animated.timing(blast, { toValue: 1, duration: 1300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
              Animated.sequence([Animated.timing(flash, { toValue: 1, duration: 80, useNativeDriver: true }), Animated.timing(flash, { toValue: 0, duration: 500, useNativeDriver: true })]),
              Animated.sequence([14, -12, 10, -8, 6, -4, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 55, useNativeDriver: true }))),
            ]),
          );
          setPhase('over');
          await flashBanner({ title: 'BOOM!', sub: `The ${WIRE_NAMES[wire]} wire was live`, tone: 'lose' }, 1100);
          if (mountedRef.current) refreshWallet();
        } else {
          setSnip({ wire, text: `${Number(r.multiplier).toFixed(2)}x` });
          snipAnim.setValue(0);
          Animated.timing(snipAnim, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => mountedRef.current && setSnip(null));
          if (r.status === 'WON') {
            const payout = Number(r.payout);
            setPhase('over');
            await flashBanner({ title: r.safeCuts >= WIRES - r.live ? 'DEFUSED!' : 'MAX WIN!', sub: `${Number(r.multiplier).toFixed(2)}x · ${money(payout)}`, tone: 'win' }, 1500);
            if (mountedRef.current) settle(payout);
          } else {
            await wait(250);
            if (mountedRef.current) setPhase('aim');
          }
        }
      } catch (err) {
        if (mountedRef.current) {
          setSnip(null);
          showToast(errorMessage(err));
          // Re-sync with the server in case the cut went through.
          fetchBombCurrent()
            .then((cur) => {
              if (!mountedRef.current) return;
              setRound(cur);
              setPhase(cur ? 'aim' : 'idle');
              refreshWallet();
            })
            .catch(() => setPhase('aim'));
        }
      } finally {
        busyRef.current = false;
      }
    },
    [phase, round, snipAnim, blast, flash, shake, flashBanner, settle, refreshWallet, showToast],
  );

  const cashOut = useCallback(async () => {
    if (busyRef.current || phase !== 'aim' || !round || round.status !== 'PENDING' || round.safeCuts <= 0) return;
    busyRef.current = true;
    try {
      const r = await cashOutBomb(round.id);
      if (!mountedRef.current) return;
      setRound(r);
      setPhase('over');
      const payout = Number(r.payout);
      settle(payout);
      await flashBanner({ title: 'CASHED OUT', sub: `${Number(r.multiplier).toFixed(2)}x · ${money(payout)}`, tone: 'win' }, 1200);
    } catch (err) {
      showToast(errorMessage(err));
    } finally {
      busyRef.current = false;
    }
  }, [phase, round, settle, flashBanner, showToast]);

  const stepBet = (dir: 1 | -1) => {
    if (pending || phase === 'cutting') return;
    const idx = Math.max(0, betLevels.indexOf(bet));
    setBet(betLevels[Math.max(0, Math.min(betLevels.length - 1, idx + dir))] ?? bet);
  };

  const openHistory = () => {
    setPanel('history');
    setHistory(null);
    fetchBombHistory(30)
      .then((h) => mountedRef.current && setHistory(h))
      .catch(() => mountedRef.current && setHistory([]));
  };

  const minutes = Math.floor((now - sessionStart.current) / 60000);
  const seconds = Math.floor(((now - sessionStart.current) % 60000) / 1000);
  const canCut = phase === 'aim' && pending;
  const display = pending ? (safeCuts > 0 ? `${ladder[safeCuts].toFixed(2)}x` : 'ARMED') : lost ? 'BOOM' : won ? 'SAFE' : 'READY';
  const mid = (g.wireTop + g.wireBot) / 2;
  const prompt =
    phase === 'cutting'
      ? ' '
      : canCut
        ? safeCuts === 0
          ? 'TAP A WIRE TO CUT IT'
          : `NEXT CUT ${ladder[safeCuts + 1]?.toFixed(2)}x · OR CASH OUT`
        : lost
          ? 'BOOM — ARM A NEW BOMB'
          : won
            ? `YOU WON ${money(Number(round!.payout))}`
            : 'CHOOSE LIVE WIRES · ARM';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#181B22', '#050608']} style={StyleSheet.absoluteFill} />

      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={TEXT} />
          <MaterialCommunityIcons name="bomb" size={18} color={HAZARD} />
          <Text style={styles.title}>BOMB SQUAD</Text>
        </Pressable>
        <View style={styles.balancePill}>
          <MaterialCommunityIcons name="wallet" size={15} color={HAZARD} />
          <Text style={styles.balanceText}>{money(shownBalance)}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24, alignItems: 'center' }}>
        <Animated.View style={[styles.stage, { width: S, height: H, transform: [{ translateX: shake }] }]}>
          <BombCase g={g} />

          {/* Dynamite and the red display */}
          <View pointerEvents="none" style={{ position: 'absolute', left: g.caseX + S * 0.05, top: g.caseY + H * 0.05 }}>
            <Dynamite w={S * 0.2} h={H * 0.24} />
          </View>
          <View pointerEvents="none" style={{ position: 'absolute', right: S - g.caseX - g.caseW + S * 0.05, top: g.caseY + H * 0.05 }}>
            <Dynamite w={S * 0.2} h={H * 0.24} />
          </View>
          <View pointerEvents="none" style={[styles.led, { left: S * 0.31, top: g.caseY + H * 0.07, width: S * 0.38, height: H * 0.13 }]}>
            <Text style={[styles.ledText, { fontSize: S * 0.072 }]} numberOfLines={1} adjustsFontSizeToFit>
              {display}
            </Text>
            <Animated.View style={[styles.ledDot, { opacity: pending ? blink : 0.25, backgroundColor: won ? GREEN : LED_RED }]} />
          </View>
          <View pointerEvents="none" style={[styles.counter, { left: S * 0.31, top: g.caseY + H * 0.215, width: S * 0.38 }]}>
            <Text style={styles.counterText}>
              {activeLive} LIVE · {safeCuts}/{steps} SAFE CUT
            </Text>
          </View>

          <Wires g={g} states={states} live={pending ? [] : liveWires} />

          {/* Skulls on live wires once the round is over */}
          {!pending &&
            liveWires.map((w) => (
              <View key={`sk${w}`} pointerEvents="none" style={[styles.skull, { left: g.colX + g.colW * w + g.colW / 2 - 9, top: g.wireTop - 37 }]}>
                <MaterialCommunityIcons name="skull" size={16} color={RED} />
              </View>
            ))}

          {/* Tap targets, one per wire */}
          {Array.from({ length: WIRES }, (_, i) => (
            <Pressable
              key={i}
              disabled={!canCut || cuts.includes(i)}
              accessibilityLabel={`Cut the ${WIRE_NAMES[i]} wire`}
              onPress={() => cut(i)}
              style={({ pressed }) => [
                styles.wireHit,
                { left: g.colX + g.colW * i, top: g.wireTop - 6, width: g.colW, height: g.wireBot - g.wireTop + 12 },
                pressed && canCut && { backgroundColor: 'rgba(255,194,26,0.15)' },
              ]}
            >
              {canCut && !cuts.includes(i) && <Animated.View style={[styles.cutMark, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.75] }) }]} />}
            </Pressable>
          ))}

          {/* Cutters and the safe-cut readout */}
          {snip && (
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: g.colX + g.colW * snip.wire + g.colW / 2 - 16,
                top: mid - 16,
                opacity: snip.text ? snipAnim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }) : 1,
                transform: snip.text
                  ? [{ translateY: snipAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -40] }) }]
                  : [{ translateX: snipAnim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }, { rotate: snipAnim.interpolate({ inputRange: [0, 1], outputRange: ['-30deg', '0deg'] }) }],
              }}
            >
              {snip.text ? (
                <View style={styles.safeTag}>
                  <MaterialCommunityIcons name="check-bold" size={12} color={INK} />
                  <Text style={styles.safeTagText}>{snip.text}</Text>
                </View>
              ) : (
                <MaterialCommunityIcons name="content-cut" size={32} color={HAZARD} />
              )}
            </Animated.View>
          )}

          {/* Explosion */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: S / 2 - S * 0.45,
              top: mid - S * 0.45,
              opacity: blast.interpolate({ inputRange: [0, 0.08, 0.55, 1], outputRange: [0, 1, 1, 0] }),
              transform: [{ scale: blast.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0.2, 1, 1.15] }) }],
            }}
          >
            {lost && <Blast size={S * 0.9} />}
          </Animated.View>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#FFF4C8', opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.85] }) }]} />

          {phase !== 'cutting' && (
            <View pointerEvents="none" style={[styles.prompt, { top: g.caseY + g.caseH - 32 }]}>
              <Text style={styles.promptText}>{prompt}</Text>
            </View>
          )}
        </Animated.View>

        {/* Multiplier ladder */}
        <View style={[styles.ladder, { width: S }]}>
          {Array.from({ length: steps }, (_, i) => {
            const n = i + 1;
            const reached = safeCuts >= n && (pending || won);
            const next = pending && safeCuts + 1 === n;
            return (
              <View key={n} style={[styles.rung, reached && styles.rungReached, next && styles.rungNext]}>
                <Text style={[styles.rungLabel, reached && { color: INK }]}>CUT {n}</Text>
                <Text style={[styles.rungMult, reached && { color: INK }]} numberOfLines={1} adjustsFontSizeToFit>
                  {ladder[n]?.toFixed(2)}x
                </Text>
                <Text style={[styles.rungMoney, reached && { color: INK }]} numberOfLines={1} adjustsFontSizeToFit>
                  {money(Math.min(floor2(stake * (ladder[n] ?? 0)), maxPayout))}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Live wires */}
        <View style={[styles.modeRow, { width: S }]}>
          {MODES.map((m) => {
            const on = activeLive === m;
            const locked = pending || phase === 'cutting';
            const top = (config?.modes.find((x) => x.live === m)?.multipliers ?? ladderFor(m)).slice(-1)[0];
            return (
              <Pressable
                key={m}
                disabled={locked}
                onPress={() => setLive(m)}
                style={[styles.mode, on && { borderColor: MODE_COLOR[m], backgroundColor: 'rgba(255,255,255,0.06)' }, locked && !on && styles.dim]}
              >
                <Text style={[styles.modeName, { color: on ? MODE_COLOR[m] : '#C8D0E0' }]}>{MODE_NAME[m]}</Text>
                <View style={{ flexDirection: 'row', gap: 2, marginTop: 3 }}>
                  {Array.from({ length: WIRES }, (_, k) => (
                    <View key={k} style={[styles.wireDot, { backgroundColor: k < m ? MODE_COLOR[m] : '#3A404A' }]} />
                  ))}
                </View>
                <Text style={styles.modeSub}>
                  {m} live · up to {top.toFixed(2)}x
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Session (time played and net position, always on show) */}
        <View style={[styles.session, { width: S }]}>
          <MaterialCommunityIcons name="timer-outline" size={15} color="#C8D0E0" />
          <Text style={styles.sessionText}>
            Session {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </Text>
          <Text style={styles.sessionSep}>·</Text>
          <Text style={[styles.sessionText, { color: sessionNet > 0 ? GREEN : sessionNet < 0 ? '#FF9AA6' : '#C8D0E0' }]}>
            Net {sessionNet >= 0 ? '+' : '−'}
            {money(Math.abs(sessionNet))}
          </Text>
        </View>

        {/* Controls: no autoplay */}
        <View style={[styles.controls, { width: S }]}>
          <Pressable onPress={() => setPanel('info')} style={styles.sideBtn} hitSlop={6}>
            <MaterialCommunityIcons name="information-outline" size={20} color={HAZARD} />
            <Text style={styles.sideText}>RULES</Text>
          </Pressable>
          <View style={styles.betBox}>
            <Text style={styles.betLabel}>BET</Text>
            <View style={styles.betRow}>
              <Pressable onPress={() => stepBet(-1)} disabled={pending} style={[styles.betBtn, pending && styles.dim]} hitSlop={6}>
                <MaterialCommunityIcons name="minus" size={18} color={INK} />
              </Pressable>
              <Text style={styles.betValue}>{money(pending ? stake : bet)}</Text>
              <Pressable onPress={() => stepBet(1)} disabled={pending} style={[styles.betBtn, pending && styles.dim]} hitSlop={6}>
                <MaterialCommunityIcons name="plus" size={18} color={INK} />
              </Pressable>
            </View>
          </View>
          {pending ? (
            <Pressable onPress={cashOut} disabled={safeCuts === 0 || phase !== 'aim'} style={({ pressed }) => [styles.mainWrap, pressed && { transform: [{ scale: 0.95 }] }]}>
              <LinearGradient colors={safeCuts === 0 || phase !== 'aim' ? ['#4A505A', '#22262E'] : ['#7CFFB0', '#1AC860', '#0A7A3A']} style={styles.mainBtn}>
                <Text style={styles.mainSmall}>{safeCuts === 0 ? 'CUT A' : 'CASH OUT'}</Text>
                <Text style={styles.mainBig} numberOfLines={1} adjustsFontSizeToFit>
                  {safeCuts === 0 ? 'WIRE' : money(cashValue)}
                </Text>
              </LinearGradient>
            </Pressable>
          ) : (
            <Pressable onPress={arm} disabled={!config || phase === 'cutting'} style={({ pressed }) => [styles.mainWrap, pressed && { transform: [{ scale: 0.95 }] }]}>
              <Animated.View style={[styles.mainHalo, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.7] }) }]} />
              <LinearGradient colors={!config ? ['#4A505A', '#22262E'] : ['#FFE88A', HAZARD, '#B88A00']} style={styles.mainBtn}>
                <MaterialCommunityIcons name="bomb" size={24} color={INK} />
                <Text style={styles.mainSmall}>ARM</Text>
              </LinearGradient>
            </Pressable>
          )}
          <Pressable onPress={openHistory} style={styles.sideBtn} hitSlop={6}>
            <MaterialCommunityIcons name="history" size={20} color={HAZARD} />
            <Text style={styles.sideText}>HISTORY</Text>
          </Pressable>
        </View>

        <GameInfoButton>
          RTP {config?.rtpPercent ?? 88}% at every cash-out point · bet {money(minStake)}–{money(maxStake)} · max {money(maxPayout)} per bomb{'\n'}
          No autoplay · the live wires are fixed by your provably-fair seeds when you arm the bomb
        </GameInfoButton>
      </ScrollView>

      {banner && (
        <Animated.View pointerEvents="none" style={[styles.banner, { opacity: bannerAnim, transform: [{ scale: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }]}>
          <LinearGradient
            colors={banner.tone === 'lose' ? ['#5A0A0A', '#200404'] : ['#FFF0A0', HAZARD, '#9A7000']}
            style={[styles.bannerInner, { borderColor: banner.tone === 'lose' ? RED : '#FFFFFF' }]}
          >
            <MaterialCommunityIcons name={banner.tone === 'lose' ? 'skull' : 'shield-check'} size={36} color={banner.tone === 'lose' ? '#FFD0D4' : INK} />
            <Text style={[styles.bannerText, banner.tone === 'win' && { color: INK }]}>{banner.title}</Text>
            {banner.sub ? <Text style={[styles.bannerSub, banner.tone === 'win' && { color: '#3A2A00' }]}>{banner.sub}</Text> : null}
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
              <Text style={styles.modalTitle}>{panel === 'info' ? 'HOW TO PLAY' : 'MY BOMBS'}</Text>
              <Pressable onPress={() => setPanel(null)} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={22} color={TEXT} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 480 }}>{panel === 'info' ? <Rules bet={bet} config={config} /> : <History rounds={history} />}</ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Rules({ bet, config }: { bet: number; config: BombConfig | null }) {
  if (!config) return <Text style={styles.note}>Loading…</Text>;
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.note}>
        Choose how many of the bomb's {config.wires} wires are live (2, 3 or 5) and your bet, then ARM. Tap a wire to cut it. A safe cut raises your multiplier; cut a live wire and the bomb goes off
        and the bet is lost.
      </Text>
      <Text style={styles.note}>
        Cash out after any safe cut. Cut every safe wire and the bomb is defused and pays out automatically. The live wires are drawn from your seeds when you arm the bomb, and every wire has the same
        chance. Once the round ends the live wires are shown.
      </Text>
      <Text style={styles.section}>MULTIPLIERS (at {money(bet)})</Text>
      {config.modes.map((m) => (
        <View key={m.live} style={{ marginTop: 2 }}>
          <Text style={[styles.tName, { color: MODE_COLOR[m.live] }]}>
            {MODE_NAME[m.live]} · {m.live} live wires
          </Text>
          <View style={styles.tRow}>
            {m.multipliers.slice(1).map((x, i) => (
              <View key={i} style={styles.tCellBox}>
                <Text style={styles.tHead}>cut {i + 1}</Text>
                <Text style={styles.tCell}>{x.toFixed(2)}x</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
      <Text style={styles.section}>GAME INFO</Text>
      <Text style={styles.note}>
        Return to player {config.rtpPercent}% whenever you cash out. A bomb pays at most {money(config.maxPayout)}; reaching it settles the round. No autoplay. Every round is decided by your
        provably-fair seeds (server seed hash, client seed and nonce in each round).
      </Text>
    </View>
  );
}

function History({ rounds }: { rounds: BombRound[] | null }) {
  if (rounds === null) return <Text style={styles.note}>Loading…</Text>;
  if (rounds.length === 0) return <Text style={styles.note}>No bombs yet.</Text>;
  return (
    <View>
      {rounds.map((r) => {
        const payout = Number(r.payout);
        const d = new Date(r.createdAt);
        return (
          <View key={r.id} style={styles.histRow}>
            <Text style={styles.histTime}>{d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            <Text style={styles.histStake}>{money(Number(r.stake))}</Text>
            <Text style={[styles.histMode, { color: MODE_COLOR[r.live] }]}>{r.live} LIVE</Text>
            <View style={{ flexDirection: 'row', gap: 2, flex: 1, flexWrap: 'wrap' }}>
              {(r.cuts ?? []).map((w, i) => (
                <View key={i} style={[styles.histWire, { backgroundColor: WIRE_COLORS[w], borderColor: r.status === 'LOST' && i === r.cuts.length - 1 ? RED : '#000' }]} />
              ))}
            </View>
            <Text style={[styles.histWin, { color: payout > 0 ? GREEN : '#8A8FA8' }]}>{payout > 0 ? `+${money(payout)}` : '—'}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050608' },
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
    backgroundColor: 'rgba(255,194,26,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,194,26,0.45)',
  },
  balanceText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  stage: { borderRadius: 18, overflow: 'hidden', borderWidth: 2, borderColor: '#3A404A', marginTop: 4 },
  led: { position: 'absolute', borderRadius: 8, backgroundColor: '#140404', borderWidth: 2, borderColor: '#000000', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  ledText: { color: LED_RED, fontWeight: '900', fontFamily: MONO, letterSpacing: 2, textShadowColor: LED_RED, textShadowRadius: 10 },
  ledDot: { position: 'absolute', top: 5, right: 6, width: 7, height: 7, borderRadius: 4 },
  counter: { position: 'absolute', alignItems: 'center', paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.55)' },
  counterText: { color: '#C8D0E0', fontSize: 9, fontWeight: '900', letterSpacing: 0.4, fontFamily: MONO },
  wireHit: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  cutMark: { width: '70%', height: 3, borderRadius: 2, backgroundColor: HAZARD },
  skull: { position: 'absolute', width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#14171C' },
  safeTag: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: GREEN },
  safeTagText: { color: INK, fontSize: 12, fontWeight: '900' },
  prompt: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.6)' },
  promptText: { color: TEXT, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  ladder: { flexDirection: 'row', gap: 4, marginTop: 10 },
  rung: { flex: 1, alignItems: 'center', paddingVertical: 5, borderRadius: 10, borderWidth: 1.5, borderColor: '#2A2E36', backgroundColor: 'rgba(20,23,28,0.9)' },
  rungReached: { backgroundColor: HAZARD, borderColor: HAZARD },
  rungNext: { borderColor: GREEN },
  rungLabel: { color: '#8A92A0', fontSize: 8.5, fontWeight: '900', letterSpacing: 1 },
  rungMult: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  rungMoney: { color: HAZARD, fontSize: 9.5, fontWeight: '800' },
  modeRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  mode: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 10, borderWidth: 1.5, borderColor: '#2A2E36' },
  modeName: { fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  modeSub: { color: '#8A92A0', fontSize: 9, fontWeight: '700', marginTop: 2 },
  wireDot: { width: 6, height: 6, borderRadius: 3 },
  session: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)' },
  sessionText: { color: '#C8D0E0', fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sessionSep: { color: '#5A6070', fontSize: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingHorizontal: 4 },
  sideBtn: { alignItems: 'center', gap: 2, width: 58 },
  sideText: { color: HAZARD, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  betBox: { alignItems: 'center', gap: 4 },
  betLabel: { color: '#A8B0C0', fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  betRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(20,23,28,0.9)',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#3A404A',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  betBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: TEXT, alignItems: 'center', justifyContent: 'center' },
  betValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', minWidth: 70, textAlign: 'center' },
  dim: { opacity: 0.4 },
  mainWrap: { width: 92, height: 92, alignItems: 'center', justifyContent: 'center' },
  mainHalo: { position: 'absolute', width: 92, height: 92, borderRadius: 46, backgroundColor: HAZARD },
  mainBtn: { width: 82, height: 82, borderRadius: 41, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF', paddingHorizontal: 6 },
  mainSmall: { color: INK, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  mainBig: { color: INK, fontSize: 15, fontWeight: '900' },
  banner: { position: 'absolute', top: '47%', alignSelf: 'center' },
  bannerInner: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 16, borderWidth: 3, alignItems: 'center' },
  bannerText: { color: '#FFE0E4', fontSize: 30, fontWeight: '900', letterSpacing: 2 },
  bannerSub: { color: '#FF9AA6', fontSize: 13, fontWeight: '900', marginTop: 2, letterSpacing: 1 },
  toast: { position: 'absolute', bottom: 120, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14 },
  toastText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  modalBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  modalCard: { backgroundColor: '#14171C', borderRadius: 16, borderWidth: 2, borderColor: '#3A404A', padding: 14 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { color: TEXT, fontSize: 16, fontWeight: '900', letterSpacing: 3 },
  note: { color: '#C8D0E0', fontSize: 12, lineHeight: 17 },
  section: { color: HAZARD, fontSize: 12, fontWeight: '900', letterSpacing: 2, marginTop: 4 },
  tRow: { flexDirection: 'row', gap: 4, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.12)' },
  tName: { fontSize: 11, fontWeight: '900' },
  tCellBox: { flex: 1, alignItems: 'center' },
  tHead: { color: '#8A92A0', fontSize: 9, fontWeight: '800' },
  tCell: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)', gap: 6 },
  histTime: { color: '#98A0B0', fontSize: 11, width: 64 },
  histStake: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', width: 58 },
  histMode: { fontSize: 9.5, fontWeight: '900', width: 42 },
  histWire: { width: 8, height: 14, borderRadius: 2, borderWidth: 1 },
  histWin: { fontSize: 12, fontWeight: '900' },
});
