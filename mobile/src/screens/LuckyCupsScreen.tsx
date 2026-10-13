import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient as SvgLinearGradient, Path, Polygon, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../api/client';
import { CupPick, CupsConfig, CupsRound, cashOutCups, fetchCupsConfig, fetchCupsCurrent, fetchCupsHistory, pickCup, startCupsRound } from '../api/backend';
import { useGameState } from '../state/GameStateContext';
import GameInfoButton from '../components/GameInfoButton';

const GOLD = '#FFD66B';
const DEEP_GOLD = '#B8860B';
const RUBY = '#FF2E5A';
const VELVET = '#4A0A1E';
const CREAM = '#FFF4DC';
const GREEN = '#3DFF8A';
const RED = '#FF4D5E';
const INK = '#1A0610';
const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const DEFAULT_BET = 10;
const ROUNDS = 5;
const TOAST_MS = 1800;
const SLOTS = [0.2, 0.5, 0.8];
const CUP_NAME = ['left', 'middle', 'right'];

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

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const run = (a: Animated.CompositeAnimation) => new Promise<void>((r) => a.start(() => r()));

// ---------- art ----------

/** A polished golden cup, upside down, with a ruby set in the front. */
export const Cup = memo(function Cup({ w, glow }: { w: number; glow?: boolean }) {
  const u = `lc${useId().replace(/:/g, '')}`;
  return (
    <Svg width={w} height={w * 1.1} viewBox="0 0 100 110">
      <Defs>
        <SvgLinearGradient id={`${u}b`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#7A5200" />
          <Stop offset="0.22" stopColor="#FFE9A0" />
          <Stop offset="0.45" stopColor={GOLD} />
          <Stop offset="0.75" stopColor={DEEP_GOLD} />
          <Stop offset="1" stopColor="#5A3A00" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${u}r`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#5A3A00" />
          <Stop offset="0.3" stopColor="#FFF4C8" />
          <Stop offset="0.6" stopColor="#D8A020" />
          <Stop offset="1" stopColor="#4A2E00" />
        </SvgLinearGradient>
        <RadialGradient id={`${u}j`} cx="0.35" cy="0.3" r="0.8">
          <Stop offset="0" stopColor="#FFC8D4" />
          <Stop offset="0.4" stopColor={RUBY} />
          <Stop offset="1" stopColor="#6A0018" />
        </RadialGradient>
      </Defs>
      {glow && <Ellipse cx={50} cy={60} rx={50} ry={52} fill={GOLD} opacity={0.25} />}
      {/* knob */}
      <Ellipse cx={50} cy={10} rx={11} ry={6} fill={`url(#${u}r)`} />
      <Rect x={44} y={10} width={12} height={8} fill={`url(#${u}b)`} />
      {/* body */}
      <Path d="M30 18 C 30 14, 70 14, 70 18 L 86 92 L 14 92 Z" fill={`url(#${u}b)`} stroke="#5A3A00" strokeWidth={1.2} />
      {/* bands */}
      <Path d="M27 30 L 73 30 L 74.5 36 L 25.5 36 Z" fill={`url(#${u}r)`} opacity={0.9} />
      <Path d="M18 76 L 82 76 L 83.5 82 L 16.5 82 Z" fill={`url(#${u}r)`} opacity={0.9} />
      {/* rim */}
      <Ellipse cx={50} cy={94} rx={40} ry={8} fill={`url(#${u}r)`} stroke="#5A3A00" strokeWidth={1.2} />
      {/* star emboss and the ruby */}
      <Polygon points="50,42 53.5,51 63,51 55.5,57 58.5,66 50,60.5 41.5,66 44.5,57 37,51 46.5,51" fill="#FFF0B0" opacity={0.35} />
      <Circle cx={50} cy={55} r={7.5} fill={`url(#${u}j)`} stroke="#FFE9A0" strokeWidth={1.6} />
      <Circle cx={47.5} cy={52.5} r={2} fill="#FFFFFF" opacity={0.85} />
      {/* shine */}
      <Path d="M33 22 C 31 40, 26 62, 22 88" stroke="#FFFFFF" strokeWidth={3} opacity={0.35} strokeLinecap="round" fill="none" />
    </Svg>
  );
});

/** The ball: a glowing ruby pearl. */
export const Pearl = memo(function Pearl({ size }: { size: number }) {
  const u = `lp${useId().replace(/:/g, '')}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={`${u}g`} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor={RUBY} stopOpacity={0.55} />
          <Stop offset="1" stopColor={RUBY} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`${u}b`} cx="0.36" cy="0.32" r="0.75">
          <Stop offset="0" stopColor="#FFE0E8" />
          <Stop offset="0.35" stopColor="#FF5A80" />
          <Stop offset="0.8" stopColor="#B0002E" />
          <Stop offset="1" stopColor="#5A0016" />
        </RadialGradient>
      </Defs>
      <Circle cx={50} cy={50} r={50} fill={`url(#${u}g)`} />
      <Circle cx={50} cy={50} r={30} fill={`url(#${u}b)`} />
      <Ellipse cx={41} cy={39} rx={10} ry={6} fill="#FFFFFF" opacity={0.75} />
    </Svg>
  );
});

/** The magician's stage: velvet curtains, a spotlight, and the felt table. */
const Stage = memo(function Stage({ S, H, tableY, tile }: { S: number; H: number; tableY: number; tile?: boolean }) {
  const u = `ls${useId().replace(/:/g, '')}`;
  const folds = tile ? 8 : 14;
  return (
    <Svg width={S} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id={`${u}fold`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#2A0410" />
          <Stop offset="0.5" stopColor="#8A1434" />
          <Stop offset="1" stopColor="#2A0410" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${u}shade`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#000000" stopOpacity={0.55} />
          <Stop offset="0.5" stopColor="#000000" stopOpacity={0} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0.6} />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${u}spot`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFF4C8" stopOpacity={0.5} />
          <Stop offset="1" stopColor="#FFF4C8" stopOpacity={0.04} />
        </SvgLinearGradient>
        <RadialGradient id={`${u}felt`} cx="0.5" cy="0.35" r="0.7">
          <Stop offset="0" stopColor="#1E8A6A" />
          <Stop offset="0.7" stopColor="#0A5A44" />
          <Stop offset="1" stopColor="#043024" />
        </RadialGradient>
        <SvgLinearGradient id={`${u}rim`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#6A4400" />
          <Stop offset="0.3" stopColor="#FFE9A0" />
          <Stop offset="0.6" stopColor={DEEP_GOLD} />
          <Stop offset="1" stopColor="#6A4400" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${u}wood`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#5A2A10" />
          <Stop offset="1" stopColor="#1E0A04" />
        </SvgLinearGradient>
      </Defs>
      <Rect x={0} y={0} width={S} height={H} fill={VELVET} />
      {Array.from({ length: folds }, (_, i) => (
        <Rect key={i} x={(S / folds) * i} y={0} width={S / folds + 0.5} height={H} fill={`url(#${u}fold)`} />
      ))}
      <Rect x={0} y={0} width={S} height={H} fill={`url(#${u}shade)`} />
      {/* valance */}
      <Path
        d={`M0 0 L ${S} 0 L ${S} ${H * 0.07} ${Array.from({ length: 7 }, (_, i) => `Q ${S - (S / 7) * (i + 0.5)} ${H * 0.13} ${S - (S / 7) * (i + 1)} ${H * 0.07}`).join(' ')} Z`}
        fill="#6A0A26"
        stroke={GOLD}
        strokeWidth={1.5}
      />
      {Array.from({ length: 8 }, (_, i) => (
        <Circle key={`t${i}`} cx={(S / 7) * i} cy={H * 0.07} r={2.5} fill={GOLD} />
      ))}
      {/* spotlight */}
      <Polygon points={`${S * 0.42},0 ${S * 0.58},0 ${S * 0.98},${tableY} ${S * 0.02},${tableY}`} fill={`url(#${u}spot)`} />
      {!tile &&
        [0.12, 0.3, 0.7, 0.88, 0.2, 0.8].map((x, i) => (
          <Path key={`sp${i}`} d={`M${x * S} ${H * (0.2 + (i % 3) * 0.08)} l 2 5 l 5 2 l -5 2 l -2 5 l -2 -5 l -5 -2 l 5 -2 Z`} fill={GOLD} opacity={0.6} />
        ))}
      {/* table */}
      <Ellipse cx={S / 2} cy={tableY + H * 0.1} rx={S * 0.56} ry={H * 0.2} fill={`url(#${u}wood)`} />
      <Ellipse cx={S / 2} cy={tableY + H * 0.06} rx={S * 0.54} ry={H * 0.18} fill={`url(#${u}rim)`} />
      <Ellipse cx={S / 2} cy={tableY + H * 0.055} rx={S * 0.51} ry={H * 0.165} fill={`url(#${u}felt)`} />
      <Ellipse cx={S / 2} cy={tableY + H * 0.055} rx={S * 0.44} ry={H * 0.13} fill="none" stroke={GOLD} strokeOpacity={0.35} strokeWidth={1.2} strokeDasharray="4 5" />
    </Svg>
  );
});

const Logo = memo(function Logo({ width }: { width: number }) {
  const u = `ll${useId().replace(/:/g, '')}`;
  const h = width * 0.2;
  return (
    <Svg width={width} height={h} viewBox="0 0 500 100">
      <Defs>
        <SvgLinearGradient id={`${u}g`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFF8D8" />
          <Stop offset="0.5" stopColor={GOLD} />
          <Stop offset="1" stopColor="#A06A00" />
        </SvgLinearGradient>
      </Defs>
      <SvgText x={250} y={70} fontSize={62} fontWeight="900" fill="#2A0008" textAnchor="middle" letterSpacing={6} fontFamily="serif" stroke="#2A0008" strokeWidth={8}>
        LUCKY CUPS
      </SvgText>
      <SvgText x={250} y={70} fontSize={62} fontWeight="900" fill={`url(#${u}g)`} textAnchor="middle" letterSpacing={6} fontFamily="serif">
        LUCKY CUPS
      </SvgText>
      <Path d="M40 52 l 4 10 l 10 4 l -10 4 l -4 10 l -4 -10 l -10 -4 l 10 -4 Z" fill={GOLD} />
      <Path d="M460 52 l 4 10 l 10 4 l -10 4 l -4 10 l -4 -10 l -10 -4 l 10 -4 Z" fill={GOLD} />
    </Svg>
  );
});

/** Home tile art: the stage with three cups and the ruby under the middle one. */
export function LuckyCupsTileArt({ size }: { size: number }) {
  const cw = size * 0.26;
  const tableY = size * 0.5;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size }} pointerEvents="none">
      <Stage S={size} H={size} tableY={tableY} tile />
      {SLOTS.map((x, i) => (
        <View key={i} style={{ position: 'absolute', left: x * size - cw / 2, top: tableY - cw * 1.1 + size * 0.06 - (i === 1 ? size * 0.12 : 0) }}>
          <Cup w={cw} />
        </View>
      ))}
      <View style={{ position: 'absolute', left: size / 2 - size * 0.08, top: tableY + size * 0.0 }}>
        <Pearl size={size * 0.16} />
      </View>
    </View>
  );
}

// ---------- screen ----------

type Phase = 'idle' | 'shuffling' | 'aim' | 'revealing' | 'over';
type Banner = { title: string; sub?: string; tone: 'win' | 'lose' | 'big' };

export default function LuckyCupsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<CupsConfig | null>(null);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [balls, setBalls] = useState(1);
  const [round, setRound] = useState<CupsRound | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [reveal, setReveal] = useState<CupPick | null>(null);
  const [shownBalance, setShownBalance] = useState(coins);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [panel, setPanel] = useState<'info' | 'history' | null>(null);
  const [history, setHistory] = useState<CupsRound[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sessionNet, setSessionNet] = useState(0);
  const [now, setNow] = useState(Date.now());

  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const sessionStart = useRef(Date.now());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const bannerAnim = useRef(new Animated.Value(0)).current;
  // Which slot each cup sits in; the shuffle moves cups between slots.
  const slotOf = useRef([0, 1, 2]);
  const cupX = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const cupY = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const lift = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const ballPop = useRef(new Animated.Value(0)).current;

  const cabW = Math.min(W - 12, 470);
  const S = cabW;
  const H = Math.round(cabW * 0.92);
  const tableY = H * 0.6;
  const cupW = S * 0.25;
  const cupH = cupW * 1.1;
  const cupTop = tableY + H * 0.06 - cupH * 0.92;
  const slotX = useCallback((slot: number) => SLOTS[slot] * S - cupW / 2, [S, cupW]);

  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const maxPayout = config?.maxPayout ?? 10000;
  const betLevels = useMemo(() => BET_LEVELS.filter((b) => b >= minStake && b <= maxStake), [minStake, maxStake]);
  const activeBalls = round?.balls ?? balls;
  const ladder = useMemo(() => {
    const fromServer = config?.modes.find((m) => m.balls === activeBalls)?.multipliers;
    if (fromServer) return fromServer;
    return Array.from({ length: ROUNDS + 1 }, (_, n) => (n ? floor2(0.88 / Math.pow(activeBalls / 3, n)) : 1));
  }, [config, activeBalls]);
  const stake = round ? Number(round.stake) : bet;
  const wins = round?.wins ?? 0;
  const pending = round?.status === 'PENDING';
  const cashValue = pending && wins > 0 ? Math.min(floor2(stake * Number(round!.multiplier)), maxPayout) : 0;
  const picks = round?.picks ?? [];
  const moving = phase === 'shuffling' || phase === 'revealing';

  useEffect(() => {
    if (!busyRef.current) setShownBalance(coins);
  }, [coins]);

  // Put every cup at its slot (no animation).
  const placeCups = useCallback(() => {
    slotOf.current.forEach((slot, cup) => {
      cupX[cup].setValue(slotX(slot));
      cupY[cup].setValue(0);
      lift[cup].setValue(0);
    });
  }, [cupX, cupY, lift, slotX]);

  useEffect(() => {
    placeCups();
  }, [placeCups]);

  useEffect(() => {
    mountedRef.current = true;
    fetchCupsConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => mountedRef.current && setToast('Could not load the game — check your connection.'));
    // Pick up a game left unfinished.
    fetchCupsCurrent()
      .then((r) => {
        if (!mountedRef.current || !r) return;
        setRound(r);
        setBalls(r.balls);
        setBet(Number(r.stake));
        setPhase('aim');
      })
      .catch(() => {});
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

  /** Cups down, then a run of swaps that speeds up. Decoration only: no ball is shown before the pick. */
  const shuffle = useCallback(async () => {
    setPhase('shuffling');
    setReveal(null);
    await run(Animated.parallel(lift.map((l) => Animated.timing(l, { toValue: 0, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: true }))));
    const swaps = 7 + Math.floor(Math.random() * 3);
    for (let k = 0; k < swaps; k++) {
      if (!mountedRef.current) return;
      const a = Math.floor(Math.random() * 3);
      const b = (a + 1 + Math.floor(Math.random() * 2)) % 3;
      const ca = slotOf.current.indexOf(a);
      const cb = slotOf.current.indexOf(b);
      slotOf.current[ca] = b;
      slotOf.current[cb] = a;
      const d = Math.max(170, 340 - k * 26);
      const arc = cupH * (Math.abs(a - b) === 2 ? 0.22 : 0.14);
      await run(
        Animated.parallel([
          Animated.timing(cupX[ca], { toValue: slotX(b), duration: d, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(cupX[cb], { toValue: slotX(a), duration: d, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(cupY[ca], { toValue: arc, duration: d / 2, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(cupY[ca], { toValue: 0, duration: d / 2, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(cupY[cb], { toValue: -arc, duration: d / 2, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(cupY[cb], { toValue: 0, duration: d / 2, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          ]),
        ]),
      );
    }
    if (mountedRef.current) setPhase('aim');
  }, [lift, cupX, cupY, cupH, slotX]);

  const settle = useCallback(
    (payout: number) => {
      setShownBalance((b) => round2(b + payout));
      setSessionNet((n) => round2(n + payout));
      refreshWallet();
      if (panel === 'history')
        fetchCupsHistory(30)
          .then((h) => mountedRef.current && setHistory(h))
          .catch(() => {});
    },
    [refreshWallet, panel],
  );

  const play = useCallback(async () => {
    if (busyRef.current || !config || pending) return;
    if (bet > shownBalance) {
      showToast('Insufficient balance');
      return;
    }
    busyRef.current = true;
    try {
      const r = await startCupsRound(bet, balls);
      if (!mountedRef.current) return;
      setRound(r);
      setShownBalance((b) => round2(b - bet));
      setSessionNet((n) => round2(n - bet));
      await shuffle();
    } catch (err) {
      showToast(errorMessage(err));
    } finally {
      busyRef.current = false;
    }
  }, [config, pending, bet, shownBalance, balls, shuffle, showToast]);

  const choose = useCallback(
    async (cup: number) => {
      if (busyRef.current || phase !== 'aim' || !round || round.status !== 'PENDING') return;
      busyRef.current = true;
      setPhase('revealing');
      const slot = slotOf.current[cup];
      try {
        // The chosen cup rises a touch while the server answers.
        const [res] = await Promise.all([pickCup(round.id, slot), run(Animated.timing(lift[cup], { toValue: 0.15, duration: 220, useNativeDriver: true }))]);
        if (!mountedRef.current) return;
        const { pick } = res;
        setReveal(pick);
        ballPop.setValue(0);
        // Lift the chosen cup, then the others.
        await run(Animated.timing(lift[cup], { toValue: 1, duration: 380, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }));
        Animated.spring(ballPop, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }).start();
        await wait(220);
        await run(Animated.parallel([0, 1, 2].filter((c) => c !== cup).map((c) => Animated.timing(lift[c], { toValue: 1, duration: 340, easing: Easing.out(Easing.quad), useNativeDriver: true }))));
        setRound(res.round);
        const r = res.round;
        if (!pick.won) {
          setPhase('over');
          await flashBanner({ title: 'MISSED!', sub: `The ball was under the ${pick.ballCups.map((c) => CUP_NAME[c]).join(' & ')} cup`, tone: 'lose' }, 1100);
          if (mountedRef.current) refreshWallet();
        } else if (r.status === 'WON') {
          const payout = Number(r.payout);
          setPhase('over');
          await flashBanner({ title: r.wins >= ROUNDS ? 'PERFECT 5/5!' : 'MAX WIN!', sub: `${Number(r.multiplier).toFixed(2)}x · ${money(payout)}`, tone: 'big' }, 1500);
          if (mountedRef.current) settle(payout);
        } else {
          await flashBanner({ title: 'FOUND IT!', sub: `${Number(r.multiplier).toFixed(2)}x · ${money(floor2(Number(r.stake) * Number(r.multiplier)))}`, tone: 'win' }, 800);
          if (!mountedRef.current) return;
          busyRef.current = false;
          await shuffle();
          return;
        }
      } catch (err) {
        if (mountedRef.current) {
          showToast(errorMessage(err));
          lift[cup].setValue(0);
          // Re-sync with the server in case the pick went through.
          fetchCupsCurrent()
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
    [phase, round, lift, ballPop, flashBanner, settle, shuffle, refreshWallet, showToast],
  );

  const cashOut = useCallback(async () => {
    if (busyRef.current || phase !== 'aim' || !round || round.status !== 'PENDING' || round.wins <= 0) return;
    busyRef.current = true;
    try {
      const r = await cashOutCups(round.id);
      if (!mountedRef.current) return;
      setRound(r);
      setPhase('over');
      const payout = Number(r.payout);
      settle(payout);
      await flashBanner({ title: 'CASHED OUT', sub: `${Number(r.multiplier).toFixed(2)}x · ${money(payout)}`, tone: 'big' }, 1200);
    } catch (err) {
      showToast(errorMessage(err));
    } finally {
      busyRef.current = false;
    }
  }, [phase, round, settle, flashBanner, showToast]);

  const stepBet = (dir: 1 | -1) => {
    if (pending || moving) return;
    const idx = Math.max(0, betLevels.indexOf(bet));
    setBet(betLevels[Math.max(0, Math.min(betLevels.length - 1, idx + dir))] ?? bet);
  };

  const openHistory = () => {
    setPanel('history');
    setHistory(null);
    fetchCupsHistory(30)
      .then((h) => mountedRef.current && setHistory(h))
      .catch(() => mountedRef.current && setHistory([]));
  };

  const minutes = Math.floor((now - sessionStart.current) / 60000);
  const seconds = Math.floor(((now - sessionStart.current) % 60000) / 1000);
  const canPick = phase === 'aim' && pending;
  const pearl = cupW * 0.5;
  const lost = round?.status === 'LOST';
  const won = round?.status === 'WON';
  const prompt =
    phase === 'shuffling'
      ? 'SHUFFLING…'
      : canPick
        ? wins === 0
          ? `WHICH CUP HIDES THE ${activeBalls === 2 ? 'BALLS' : 'BALL'}?`
          : `NEXT FIND ${ladder[wins + 1]?.toFixed(2)}x · OR CASH OUT`
        : lost
          ? 'MISSED — PLAY AGAIN'
          : won
            ? `YOU WON ${money(Number(round!.payout))}`
            : phase === 'revealing'
              ? ' '
              : 'CHOOSE 1 OR 2 BALLS · PLAY';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#2A0614', '#0A0206']} style={StyleSheet.absoluteFill} />

      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={CREAM} />
          <MaterialCommunityIcons name="cup" size={18} color={GOLD} style={{ transform: [{ rotate: '180deg' }] }} />
          <Text style={styles.title}>LUCKY CUPS</Text>
        </Pressable>
        <View style={styles.balancePill}>
          <MaterialCommunityIcons name="wallet" size={15} color={GOLD} />
          <Text style={styles.balanceText}>{money(shownBalance)}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24, alignItems: 'center' }}>
        <View style={[styles.stage, { width: S, height: H }]}>
          <Stage S={S} H={H} tableY={tableY} />
          <View style={{ position: 'absolute', top: H * 0.085, alignSelf: 'center' }}>
            <Logo width={S * 0.78} />
          </View>

          {/* Streak tracker */}
          <View style={[styles.tracker, { top: tableY + H * 0.155 }]}>
            {Array.from({ length: ROUNDS }, (_, i) => {
              const p = picks[i];
              return (
                <View key={i} style={[styles.trackDot, p && (p.won ? styles.trackWin : styles.trackMiss)]}>
                  {p ? <MaterialCommunityIcons name={p.won ? 'check-bold' : 'close-thick'} size={12} color={p.won ? INK : CREAM} /> : <Text style={styles.trackNum}>{i + 1}</Text>}
                </View>
              );
            })}
            <Text style={styles.trackMult}>{wins > 0 ? `${ladder[wins].toFixed(2)}x` : '—'}</Text>
          </View>

          {/* Balls, shown only once the cups lift */}
          {reveal &&
            reveal.ballCups.map((slot) => (
              <Animated.View
                key={`b${slot}`}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: SLOTS[slot] * S - pearl / 2,
                  top: tableY + H * 0.06 - pearl * 0.92,
                  transform: [{ scale: ballPop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
                  opacity: ballPop,
                }}
              >
                <Pearl size={pearl} />
              </Animated.View>
            ))}
          {reveal && (
            <View
              pointerEvents="none"
              style={[
                styles.pickRing,
                { left: SLOTS[reveal.cup] * S - cupW * 0.45, top: tableY + H * 0.06 - cupW * 0.14, width: cupW * 0.9, height: cupW * 0.28, borderColor: reveal.won ? GREEN : RED },
              ]}
            />
          )}

          {/* Cups */}
          {[0, 1, 2].map((cup) => (
            <Animated.View
              key={cup}
              style={{
                position: 'absolute',
                left: 0,
                top: cupTop,
                zIndex: 2,
                transform: [{ translateX: cupX[cup] }, { translateY: Animated.add(cupY[cup], lift[cup].interpolate({ inputRange: [0, 1], outputRange: [0, -cupH * 0.5] })) }],
              }}
            >
              <Pressable disabled={!canPick} accessibilityLabel={`Cup ${cup + 1}`} onPress={() => choose(cup)} style={({ pressed }) => [pressed && canPick && { transform: [{ scale: 0.96 }] }]}>
                {canPick && <Animated.View style={[styles.cupGlow, { width: cupW, height: cupH, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.6] }) }]} />}
                <Cup w={cupW} glow={reveal?.cup === slotOf.current[cup] && phase !== 'shuffling'} />
              </Pressable>
            </Animated.View>
          ))}

          {/* Prompt */}
          <View pointerEvents="none" style={[styles.prompt, { top: H - 34 }]}>
            <Text style={styles.promptText}>{prompt}</Text>
          </View>
        </View>

        {/* Multiplier ladder */}
        <View style={[styles.ladder, { width: S }]}>
          {Array.from({ length: ROUNDS }, (_, i) => {
            const n = i + 1;
            const reached = wins >= n && (pending || won);
            const next = pending && wins + 1 === n;
            return (
              <View key={n} style={[styles.rung, reached && styles.rungReached, next && styles.rungNext]}>
                <Text style={[styles.rungLabel, reached && { color: INK }]}>FIND {n}</Text>
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

        {/* Mode: 1 or 2 balls */}
        <View style={[styles.modeRow, { width: S }]}>
          {[1, 2].map((b) => {
            const on = activeBalls === b;
            const locked = pending || moving;
            const first = config?.modes.find((m) => m.balls === b)?.multipliers[1] ?? floor2(0.88 / (b / 3));
            return (
              <Pressable key={b} disabled={locked} onPress={() => setBalls(b)} style={[styles.mode, on && styles.modeOn, locked && !on && styles.dim]}>
                <View style={{ flexDirection: 'row', gap: 3 }}>
                  {Array.from({ length: b }, (_, i) => (
                    <Pearl key={i} size={22} />
                  ))}
                </View>
                <View>
                  <Text style={[styles.modeName, on && { color: GOLD }]}>
                    {b} BALL{b > 1 ? 'S' : ''}
                  </Text>
                  <Text style={styles.modeSub}>
                    {b}/3 chance · {first.toFixed(2)}x a find
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Session (time played and net position, always on show) */}
        <View style={[styles.session, { width: S }]}>
          <MaterialCommunityIcons name="timer-outline" size={15} color="#E0C8D0" />
          <Text style={styles.sessionText}>
            Session {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </Text>
          <Text style={styles.sessionSep}>·</Text>
          <Text style={[styles.sessionText, { color: sessionNet > 0 ? GREEN : sessionNet < 0 ? '#FF9AA6' : '#E0C8D0' }]}>
            Net {sessionNet >= 0 ? '+' : '−'}
            {money(Math.abs(sessionNet))}
          </Text>
        </View>

        {/* Controls: no autoplay */}
        <View style={[styles.controls, { width: S }]}>
          <Pressable onPress={() => setPanel('info')} style={styles.sideBtn} hitSlop={6}>
            <MaterialCommunityIcons name="information-outline" size={20} color={GOLD} />
            <Text style={styles.sideText}>RULES</Text>
          </Pressable>
          <View style={styles.betBox}>
            <Text style={styles.betLabel}>BET</Text>
            <View style={styles.betRow}>
              <Pressable onPress={() => stepBet(-1)} disabled={pending || moving} style={[styles.betBtn, (pending || moving) && styles.dim]} hitSlop={6}>
                <MaterialCommunityIcons name="minus" size={18} color={INK} />
              </Pressable>
              <Text style={styles.betValue}>{money(pending ? stake : bet)}</Text>
              <Pressable onPress={() => stepBet(1)} disabled={pending || moving} style={[styles.betBtn, (pending || moving) && styles.dim]} hitSlop={6}>
                <MaterialCommunityIcons name="plus" size={18} color={INK} />
              </Pressable>
            </View>
          </View>
          {pending ? (
            <Pressable onPress={cashOut} disabled={wins === 0 || phase !== 'aim'} style={({ pressed }) => [styles.mainWrap, pressed && { transform: [{ scale: 0.95 }] }]}>
              <LinearGradient colors={wins === 0 || phase !== 'aim' ? ['#5A4650', '#2A1E24'] : ['#7CFFB0', '#1AC860', '#0A7A3A']} style={styles.mainBtn}>
                <Text style={styles.mainSmall}>{wins === 0 ? 'PICK A' : 'CASH OUT'}</Text>
                <Text style={styles.mainBig} numberOfLines={1} adjustsFontSizeToFit>
                  {wins === 0 ? 'CUP' : money(cashValue)}
                </Text>
              </LinearGradient>
            </Pressable>
          ) : (
            <Pressable onPress={play} disabled={!config || moving} style={({ pressed }) => [styles.mainWrap, pressed && { transform: [{ scale: 0.95 }] }]}>
              <Animated.View style={[styles.mainHalo, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.7] }) }]} />
              <LinearGradient colors={!config || moving ? ['#5A4650', '#2A1E24'] : ['#FFF4C8', GOLD, DEEP_GOLD]} style={styles.mainBtn}>
                <MaterialCommunityIcons name="shuffle-variant" size={24} color={INK} />
                <Text style={styles.mainSmall}>PLAY</Text>
              </LinearGradient>
            </Pressable>
          )}
          <Pressable onPress={openHistory} style={styles.sideBtn} hitSlop={6}>
            <MaterialCommunityIcons name="history" size={20} color={GOLD} />
            <Text style={styles.sideText}>HISTORY</Text>
          </Pressable>
        </View>

        <GameInfoButton>
          RTP {config?.rtpPercent ?? 88}% at every cash-out point · bet {money(minStake)}–{money(maxStake)} · max {money(maxPayout)} per game{'\n'}
          No autoplay · the ball's cup is drawn from your provably-fair seeds; the shuffle is just for show
        </GameInfoButton>
      </ScrollView>

      {banner && (
        <Animated.View pointerEvents="none" style={[styles.banner, { opacity: bannerAnim, transform: [{ scale: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }]}>
          <LinearGradient
            colors={banner.tone === 'lose' ? ['#3A0A14', '#1A0408'] : banner.tone === 'big' ? ['#FFF4C8', GOLD, '#B87800'] : ['#6A0A26', '#2A0410']}
            style={[styles.bannerInner, { borderColor: banner.tone === 'lose' ? RED : banner.tone === 'big' ? '#FFFFFF' : GOLD }]}
          >
            {banner.tone !== 'lose' && <Pearl size={44} />}
            <Text style={[styles.bannerText, banner.tone === 'big' && { color: '#3A1A00' }, banner.tone === 'lose' && { color: '#FFD0D4' }]}>{banner.title}</Text>
            {banner.sub ? <Text style={[styles.bannerSub, banner.tone === 'big' && { color: '#5A2A00' }, banner.tone === 'lose' && { color: '#FF9AA6' }]}>{banner.sub}</Text> : null}
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
              <Text style={styles.modalTitle}>{panel === 'info' ? 'HOW TO PLAY' : 'MY GAMES'}</Text>
              <Pressable onPress={() => setPanel(null)} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={22} color={CREAM} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 480 }}>{panel === 'info' ? <Rules bet={bet} config={config} /> : <History rounds={history} />}</ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Rules({ bet, config }: { bet: number; config: CupsConfig | null }) {
  if (!config) return <Text style={styles.note}>Loading…</Text>;
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.note}>
        Choose 1 or 2 balls and your bet, then PLAY. The cups are shuffled and you pick one. Find a ball and your multiplier rises; pick an empty cup and the bet is lost.
      </Text>
      <Text style={styles.note}>
        Cash out after any find, or keep going for up to {config.rounds} finds; the {config.rounds}th pays out automatically. Which cups hide the balls is drawn from your seeds before you pick, and
        every cup has the same chance. The shuffle is just for show: the ball is never shown before you pick, so there is nothing to follow.
      </Text>
      <Text style={styles.section}>MULTIPLIERS (at {money(bet)})</Text>
      <View style={styles.tRow}>
        <Text style={[styles.tHead, { width: 64, textAlign: 'left' }]}>FINDS</Text>
        {Array.from({ length: config.rounds }, (_, i) => (
          <Text key={i} style={styles.tHead}>
            {i + 1}
          </Text>
        ))}
      </View>
      {config.modes.map((m) => (
        <View key={m.balls} style={styles.tRow}>
          <Text style={styles.tName}>
            {m.balls} BALL{m.balls > 1 ? 'S' : ''}
            {'\n'}
            <Text style={styles.tSub}>{m.balls}/3 chance</Text>
          </Text>
          {m.multipliers.slice(1).map((x, i) => (
            <Text key={i} style={styles.tCell}>
              {x.toFixed(2)}x
            </Text>
          ))}
        </View>
      ))}
      <Text style={styles.section}>GAME INFO</Text>
      <Text style={styles.note}>
        Return to player {config.rtpPercent}% whenever you cash out. A game pays at most {money(config.maxPayout)}; reaching it settles the game. No autoplay. Every pick is decided by your
        provably-fair seeds (server seed hash, client seed and nonce in each game).
      </Text>
    </View>
  );
}

function History({ rounds }: { rounds: CupsRound[] | null }) {
  if (rounds === null) return <Text style={styles.note}>Loading…</Text>;
  if (rounds.length === 0) return <Text style={styles.note}>No games yet.</Text>;
  return (
    <View>
      {rounds.map((r) => {
        const payout = Number(r.payout);
        const d = new Date(r.createdAt);
        return (
          <View key={r.id} style={styles.histRow}>
            <Text style={styles.histTime}>{d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            <Text style={styles.histStake}>{money(Number(r.stake))}</Text>
            <Text style={styles.histMode}>
              {r.balls} BALL{r.balls > 1 ? 'S' : ''}
            </Text>
            <View style={{ flexDirection: 'row', gap: 2, flex: 1 }}>
              {(r.picks ?? []).map((p, i) => (
                <MaterialCommunityIcons key={i} name={p.won ? 'check-circle' : 'close-circle'} size={13} color={p.won ? GREEN : RED} />
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
  root: { flex: 1, backgroundColor: '#0A0206' },
  topBar: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  title: { color: CREAM, fontSize: 18, fontWeight: '900', letterSpacing: 3, fontFamily: 'serif' },
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
  stage: { borderRadius: 18, overflow: 'hidden', borderWidth: 2.5, borderColor: DEEP_GOLD, marginTop: 4 },
  tracker: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(20,2,8,0.85)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,214,107,0.6)',
  },
  trackDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(255,214,107,0.6)', alignItems: 'center', justifyContent: 'center' },
  trackNum: { color: 'rgba(255,244,220,0.6)', fontSize: 10, fontWeight: '900' },
  trackWin: { backgroundColor: GREEN, borderColor: GREEN },
  trackMiss: { backgroundColor: RED, borderColor: RED },
  trackMult: { color: GOLD, fontSize: 14, fontWeight: '900', minWidth: 52, textAlign: 'right', fontVariant: ['tabular-nums'] },
  cupGlow: { position: 'absolute', borderRadius: 999, backgroundColor: GOLD },
  pickRing: { position: 'absolute', borderRadius: 999, borderWidth: 3 },
  prompt: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.5)' },
  promptText: { color: CREAM, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  ladder: { flexDirection: 'row', gap: 5, marginTop: 10 },
  rung: { flex: 1, alignItems: 'center', paddingVertical: 5, borderRadius: 10, borderWidth: 1.5, borderColor: '#5A1A2E', backgroundColor: 'rgba(42,6,20,0.85)' },
  rungReached: { backgroundColor: GOLD, borderColor: GOLD },
  rungNext: { borderColor: GREEN },
  rungLabel: { color: '#C89AA8', fontSize: 8.5, fontWeight: '900', letterSpacing: 1 },
  rungMult: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  rungMoney: { color: GOLD, fontSize: 10, fontWeight: '800' },
  modeRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  mode: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5, borderColor: '#5A1A2E' },
  modeOn: { borderColor: GOLD, backgroundColor: 'rgba(255,214,107,0.08)' },
  modeName: { color: '#E0C8D0', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  modeSub: { color: '#B08A98', fontSize: 9.5, fontWeight: '700' },
  session: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)' },
  sessionText: { color: '#E0C8D0', fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sessionSep: { color: '#6A5060', fontSize: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingHorizontal: 4 },
  sideBtn: { alignItems: 'center', gap: 2, width: 58 },
  sideText: { color: GOLD, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  betBox: { alignItems: 'center', gap: 4 },
  betLabel: { color: '#C8A8B4', fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  betRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(42,6,20,0.85)',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#6A2A3E',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  betBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center' },
  betValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', minWidth: 70, textAlign: 'center' },
  dim: { opacity: 0.4 },
  mainWrap: { width: 92, height: 92, alignItems: 'center', justifyContent: 'center' },
  mainHalo: { position: 'absolute', width: 92, height: 92, borderRadius: 46, backgroundColor: GOLD },
  mainBtn: { width: 82, height: 82, borderRadius: 41, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF', paddingHorizontal: 6 },
  mainSmall: { color: INK, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  mainBig: { color: INK, fontSize: 15, fontWeight: '900' },
  banner: { position: 'absolute', top: '47%', alignSelf: 'center' },
  bannerInner: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 16, borderWidth: 3, alignItems: 'center' },
  bannerText: { color: CREAM, fontSize: 30, fontWeight: '900', letterSpacing: 2, fontFamily: 'serif' },
  bannerSub: { color: GOLD, fontSize: 13, fontWeight: '900', marginTop: 2, letterSpacing: 1 },
  toast: { position: 'absolute', bottom: 120, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14 },
  toastText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  modalBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  modalCard: { backgroundColor: '#2A0614', borderRadius: 16, borderWidth: 2, borderColor: DEEP_GOLD, padding: 14 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { color: CREAM, fontSize: 16, fontWeight: '900', letterSpacing: 3, fontFamily: 'serif' },
  note: { color: '#E0C8D0', fontSize: 12, lineHeight: 17 },
  section: { color: GOLD, fontSize: 12, fontWeight: '900', letterSpacing: 2, marginTop: 4, fontFamily: 'serif' },
  tRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.12)' },
  tHead: { flex: 1, color: '#C89AA8', fontSize: 10, fontWeight: '900', textAlign: 'right' },
  tName: { width: 64, color: GOLD, fontSize: 11, fontWeight: '900' },
  tSub: { color: '#C89AA8', fontSize: 9, fontWeight: '700' },
  tCell: { flex: 1, color: '#FFFFFF', fontSize: 11, fontWeight: '800', textAlign: 'right' },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)', gap: 6 },
  histTime: { color: '#B8A0A8', fontSize: 11, width: 64 },
  histStake: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', width: 58 },
  histMode: { color: GOLD, fontSize: 9.5, fontWeight: '900', width: 50 },
  histWin: { fontSize: 12, fontWeight: '900' },
});
