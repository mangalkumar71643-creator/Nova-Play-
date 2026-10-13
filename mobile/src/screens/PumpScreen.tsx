import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient as SvgLinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../api/client';
import { PumpConfig, PumpDifficulty, PumpRound, cashOutPump, fetchActivePump, fetchPumpConfig, fetchPumpHistory, pumpOnce, startPump } from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const GOLD = '#FFD66B';
const INK = '#F3F0FF';
const CYAN = '#5EEAD4';
const DIFFS: PumpDifficulty[] = ['EASY', 'MEDIUM', 'HARD', 'EXPERT'];
const DIFF_LABEL: Record<PumpDifficulty, string> = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard', EXPERT: 'Expert' };
/** Balloon colour per difficulty: [light, main, dark]. */
const BALLOON: Record<PumpDifficulty, [string, string, string]> = {
  EASY: ['#A7F3D0', '#10B981', '#065F46'],
  MEDIUM: ['#BAE6FD', '#0EA5E9', '#075985'],
  HARD: ['#FDE68A', '#F59E0B', '#92400E'],
  EXPERT: ['#FECDD3', '#F43F5E', '#881337'],
};
const SLOTS = 25;
const FALLBACK_POPS: Record<PumpDifficulty, number> = { EASY: 1, MEDIUM: 3, HARD: 5, EXPERT: 10 };
const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const DEFAULT_BET = 10;
const SOUND_KEY = 'novaplay:pump:sound';
const TOAST_MS = 1900;
const SHARDS = 12;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

/** Rounded down, so the shown multiplier never exceeds what is paid. */
function fmtMult(m: number): string {
  if (m >= 1000) return `${Math.floor(m).toLocaleString('en-IN')}x`;
  if (m >= 100) return `${(Math.floor(m * 10) / 10).toFixed(1)}x`;
  return `${(Math.floor(m * 100) / 100).toFixed(2)}x`;
}

/** The multiplier table for a difficulty when the server config hasn't arrived. */
function fallbackMultipliers(pops: number): number[] {
  const safe = SLOTS - pops;
  let p = 1;
  return Array.from({ length: safe }, (_, i) => {
    p *= (safe - i) / (SLOTS - i);
    return Math.floor((0.9 / p) * 10000 + 1e-6) / 10000;
  });
}

const run = (a: Animated.CompositeAnimation) => new Promise<void>((r) => a.start(() => r()));

// ---------- art ----------

/** A glossy party balloon with its knot at the bottom centre of the box. */
const Balloon = memo(function Balloon({ w, colors, id }: { w: number; colors: [string, string, string]; id: string }) {
  const h = w * 1.22;
  const [light, main, dark] = colors;
  return (
    <Svg width={w} height={h} viewBox="0 0 100 122">
      <Defs>
        <RadialGradient id={`pb${id}`} cx="36%" cy="30%" r="75%">
          <Stop offset="0" stopColor={light} />
          <Stop offset="0.45" stopColor={main} />
          <Stop offset="1" stopColor={dark} />
        </RadialGradient>
      </Defs>
      <Path d="M50 4 C 78 4 96 26 96 52 C 96 80 72 102 54 110 L 46 110 C 28 102 4 80 4 52 C 4 26 22 4 50 4 Z" fill={`url(#pb${id})`} />
      <Path d="M44 110 L 56 110 L 59 118 L 41 118 Z" fill={dark} />
      <Ellipse cx={30} cy={30} rx={9} ry={15} fill="#FFFFFF" opacity={0.5} transform="rotate(-28 30 30)" />
      <Circle cx={24} cy={52} r={3.5} fill="#FFFFFF" opacity={0.35} />
    </Svg>
  );
});

function Background({ w, h }: { w: number; h: number }) {
  const sag = (x: number) => h * 0.05 + Math.sin((x / w) * Math.PI) * h * 0.05;
  const bulbs = Array.from({ length: 13 }, (_, i) => (i + 0.5) * (w / 13));
  const bulbColors = [GOLD, '#F472B6', CYAN, '#A78BFA'];
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id="pmBg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#0E1238" />
          <Stop offset="0.55" stopColor="#1A0F3D" />
          <Stop offset="1" stopColor="#08061A" />
        </SvgLinearGradient>
        <RadialGradient id="pmSpot" cx="50%" cy="45%" r="55%">
          <Stop offset="0" stopColor="#F472B6" stopOpacity={0.2} />
          <Stop offset="1" stopColor="#F472B6" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill="url(#pmBg)" />
      <Rect x={0} y={0} width={w} height={h} fill="url(#pmSpot)" />
      {Array.from({ length: 30 }, (_, i) => {
        const a = Math.sin(i * 12.9898) * 43758.5453;
        const b = Math.sin(i * 78.233) * 12543.123;
        return <Circle key={i} cx={(a - Math.floor(a)) * w} cy={(b - Math.floor(b)) * h * 0.7} r={0.6 + (i % 3) * 0.4} fill="#FFFFFF" opacity={0.3} />;
      })}
      {/* A string of carnival lights */}
      <Path d={bulbs.reduce((d, x, i) => d + `${i ? ' L' : 'M'}${x} ${sag(x)}`, '')} fill="none" stroke="#3B3363" strokeWidth={1.5} />
      {bulbs.map((x, i) => (
        <G key={i}>
          <Circle cx={x} cy={sag(x) + 5} r={9} fill={bulbColors[i % 4]} opacity={0.18} />
          <Circle cx={x} cy={sag(x) + 5} r={3.6} fill={bulbColors[i % 4]} />
        </G>
      ))}
      {/* Striped big-top tent at the horizon */}
      {Array.from({ length: 9 }, (_, i) => (
        <Path key={i} d={`M${w / 2} ${h * 0.8} L${(i / 9) * w * 1.4 - w * 0.2} ${h} L${((i + 1) / 9) * w * 1.4 - w * 0.2} ${h} Z`} fill={i % 2 ? '#7F1D1D' : '#F5E6C8'} opacity={0.08} />
      ))}
    </Svg>
  );
}

function Logo({ width }: { width: number }) {
  return (
    <Svg width={width} height={width * 0.22} viewBox="0 0 300 66">
      <Defs>
        <SvgLinearGradient id="pmLogo" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFF1F7" />
          <Stop offset="0.5" stopColor="#F9A8D4" />
          <Stop offset="1" stopColor="#DB2777" />
        </SvgLinearGradient>
      </Defs>
      <SvgText x={150} y={50} fontSize={50} fontWeight="bold" fill="url(#pmLogo)" stroke="#4A044E" strokeWidth={1.4} textAnchor="middle" letterSpacing={8}>
        PUMP
      </SvgText>
      <Circle cx={44} cy={26} r={10} fill={CYAN} />
      <Path d="M44 36 L 44 50" stroke={CYAN} strokeWidth={1.4} />
      <Circle cx={256} cy={26} r={10} fill={GOLD} />
      <Path d="M256 36 L 256 50" stroke={GOLD} strokeWidth={1.4} />
    </Svg>
  );
}

/** Home tile art: a big pink balloon over a little pump. */
export function PumpTileArt({ size }: { size: number }) {
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size }} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="pmtBg" cx="50%" cy="38%" r="70%">
            <Stop offset="0" stopColor="#3B1A6B" />
            <Stop offset="1" stopColor="#0B0822" />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill="url(#pmtBg)" />
        {[14, 30, 46, 62, 78, 94].map((x, i) => (
          <Circle key={x} cx={x} cy={8 + Math.sin((x / 100) * Math.PI) * 5} r={2.2} fill={[GOLD, '#F472B6', CYAN][i % 3]} />
        ))}
        <Path d="M50 62 C 56 66 66 64 72 58" fill="none" stroke="#CBD5E1" strokeWidth={1.2} />
        <Rect x={70} y={40} width={10} height={22} rx={2} fill="#D4A94A" />
        <Rect x={66} y={34} width={18} height={4} rx={2} fill="#9CA3AF" />
      </Svg>
      <View style={{ position: 'absolute', left: size * 0.22, top: size * 0.1 }}>
        <Balloon w={size * 0.44} colors={['#FBCFE8', '#EC4899', '#831843']} id="tile" />
      </View>
    </View>
  );
}

/** The hand pump: cylinder with a pressure gauge, a plunger handle that moves, and a hose to the balloon. */
function PumpDevice({ w, h, press, pressure }: { w: number; h: number; press: Animated.Value; pressure: Animated.Value }) {
  const cylH = h * 0.62;
  const gauge = w * 0.42;
  return (
    <View style={{ width: w, height: h, alignItems: 'center', justifyContent: 'flex-end' }}>
      {/* Plunger rod and T-handle, pushed down on each pump */}
      <Animated.View style={{ position: 'absolute', top: 0, alignItems: 'center', transform: [{ translateY: press.interpolate({ inputRange: [0, 1], outputRange: [0, h * 0.2] }) }] }}>
        <View style={{ width: w * 0.95, height: 10, borderRadius: 5, backgroundColor: '#9CA3AF', borderWidth: 1, borderColor: '#E5E7EB' }} />
        <View style={{ width: 5, height: h * 0.34, backgroundColor: '#D1D5DB' }} />
      </Animated.View>
      <LinearGradient colors={['#F7D98B', '#C9962E', '#8A6414']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: w * 0.62, height: cylH, borderRadius: 8, alignItems: 'center', paddingTop: 10, borderWidth: 1, borderColor: '#FDE68A' }}>
        <View style={{ width: gauge, height: gauge, borderRadius: gauge / 2, backgroundColor: '#F8FAFC', borderWidth: 2, borderColor: '#374151', alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={gauge} height={gauge} style={StyleSheet.absoluteFill}>
            <Path d={`M${gauge * 0.2} ${gauge * 0.72} A ${gauge * 0.36} ${gauge * 0.36} 0 1 1 ${gauge * 0.8} ${gauge * 0.72}`} fill="none" stroke="#E11D48" strokeWidth={2} strokeDasharray="2 3" />
          </Svg>
          <Animated.View style={{ position: 'absolute', width: 2, height: gauge * 0.36, backgroundColor: '#111827', top: gauge * 0.14, transform: [{ translateY: gauge * 0.18 }, { rotate: pressure.interpolate({ inputRange: [0, 1], outputRange: ['-130deg', '130deg'] }) }, { translateY: -gauge * 0.18 }] }} />
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#111827' }} />
        </View>
      </LinearGradient>
      <View style={{ width: w, height: 10, borderRadius: 4, backgroundColor: '#6B7280', borderWidth: 1, borderColor: '#9CA3AF' }} />
    </View>
  );
}

// ---------- screen ----------

type Banner = { title: string; sub: string; tone: 'win' | 'lose' };

export default function PumpScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<PumpConfig | null>(null);
  const [difficulty, setDifficulty] = useState<PumpDifficulty>('MEDIUM');
  const [bet, setBet] = useState(DEFAULT_BET);
  const [round, setRound] = useState<PumpRound | null>(null);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const [popped, setPopped] = useState(false);
  const [flown, setFlown] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [shownBalance, setShownBalance] = useState(coins);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [panel, setPanel] = useState<'history' | 'rules' | null>(null);
  const [history, setHistory] = useState<PumpRound[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [stage, setStage] = useState<{ w: number; h: number } | null>(null);

  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;
  const balanceRef = useRef(shownBalance);
  balanceRef.current = shownBalance;
  const playersRef = useRef<{ tick: AudioPlayer; win: AudioPlayer; land: AudioPlayer } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const grow = useRef(new Animated.Value(0)).current;
  const squash = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(0)).current;
  const pressure = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const fly = useRef(new Animated.Value(0)).current;
  const bannerAnim = useRef(new Animated.Value(0)).current;

  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const maxPayout = config?.maxPayout ?? 10000;
  const betLevels = useMemo(() => BET_LEVELS.filter((b) => b >= minStake && b <= maxStake), [minStake, maxStake]);
  const live = round?.status === 'ACTIVE';
  const diff = live && round ? round.difficulty : difficulty;
  const pops = config?.difficulties[diff].pops ?? FALLBACK_POPS[diff];
  const top = SLOTS - pops;
  const multipliers = config?.multipliers[diff] ?? fallbackMultipliers(pops);
  const pumps = round && (live || round.status === 'WON' || popped) && round.difficulty === diff ? round.pumps : 0;

  /** Balloon size for a number of pumps, from a small bud to full size. */
  const sizeFor = useCallback((n: number, max: number) => 0.34 + 0.66 * Math.pow(Math.min(n, max) / max, 0.55), []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const play = useCallback((name: 'tick' | 'win' | 'land') => {
    if (!soundRef.current) return;
    const p = playersRef.current?.[name];
    if (!p) return;
    try {
      p.seekTo(0);
      p.play();
    } catch {
      // A missed sound effect is harmless.
    }
  }, []);

  const resetBalloon = useCallback(
    (n: number, max: number) => {
      burst.setValue(0);
      fly.setValue(0);
      grow.setValue(sizeFor(n, max));
      pressure.setValue(n / max);
      setPopped(false);
      setFlown(false);
    },
    [burst, fly, grow, pressure, sizeFor]
  );

  useEffect(() => {
    mountedRef.current = true;
    grow.setValue(sizeFor(0, 1));
    fetchPumpConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => {});
    fetchActivePump()
      .then(({ round: open }) => {
        if (!open || !mountedRef.current) return;
        setRound(open);
        setBet(Number(open.stake));
        setDifficulty(open.difficulty);
        resetBalloon(open.pumps, open.maxPumps);
      })
      .catch(() => {});
    AsyncStorage.getItem(SOUND_KEY)
      .then((v) => v === 'off' && setSoundOn(false))
      .catch(() => {});
    try {
      setAudioModeAsync({ playsInSilentMode: false }).catch(() => {});
      playersRef.current = {
        tick: createAudioPlayer(require('../../assets/sounds/plinko-tick.wav')),
        win: createAudioPlayer(require('../../assets/sounds/plinko-win.wav')),
        land: createAudioPlayer(require('../../assets/sounds/plinko-land.wav')),
      };
    } catch {
      playersRef.current = null;
    }
    return () => {
      mountedRef.current = false;
      const players = playersRef.current;
      playersRef.current = null;
      if (players) Object.values(players).forEach((p) => p.remove());
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [grow, resetBalloon, sizeFor]);

  useEffect(() => {
    if (!busyRef.current) setShownBalance(coins);
  }, [coins]);

  const showBanner = useCallback(
    (b: Banner) => {
      setBanner(b);
      bannerAnim.setValue(0);
      Animated.sequence([
        Animated.spring(bannerAnim, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
        Animated.delay(1300),
        Animated.timing(bannerAnim, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]).start(() => mountedRef.current && setBanner(null));
    },
    [bannerAnim]
  );

  const flyAway = useCallback(() => {
    setFlown(true);
    fly.setValue(0);
    Animated.timing(fly, { toValue: 1, duration: 1100, easing: Easing.in(Easing.quad), useNativeDriver: true }).start();
  }, [fly]);

  const doStart = useCallback(async () => {
    if (busyRef.current) return;
    if (bet > balanceRef.current) {
      showToast('Insufficient balance');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setStarting(true);
    setBanner(null);
    let r: PumpRound;
    try {
      r = await startPump(bet, difficulty);
    } catch (err) {
      showToast(errorMessage(err));
      busyRef.current = false;
      setBusy(false);
      setStarting(false);
      return;
    }
    if (!mountedRef.current) return;
    setShownBalance((b) => round2(b - bet));
    resetBalloon(0, r.maxPumps);
    grow.setValue(0.05);
    Animated.spring(grow, { toValue: sizeFor(0, r.maxPumps), friction: 5, tension: 90, useNativeDriver: true }).start();
    setRound(r);
    play('tick');
    busyRef.current = false;
    setBusy(false);
    setStarting(false);
  }, [bet, difficulty, grow, play, resetBalloon, showToast, sizeFor]);

  const doPump = useCallback(async () => {
    if (busyRef.current || !round || round.status !== 'ACTIVE') return;
    busyRef.current = true;
    setBusy(true);
    // Push the handle down while the server answers.
    const pushing = run(Animated.timing(press, { toValue: 1, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    let r: PumpRound;
    try {
      [r] = await Promise.all([pumpOnce(round.id), pushing]);
    } catch (err) {
      Animated.timing(press, { toValue: 0, duration: 150, useNativeDriver: true }).start();
      showToast(errorMessage(err));
      fetchActivePump()
        .then(({ round: open }) => mountedRef.current && setRound(open))
        .catch(() => {});
      busyRef.current = false;
      setBusy(false);
      return;
    }
    if (!mountedRef.current) return;
    Animated.timing(press, { toValue: 0, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    Animated.timing(pressure, { toValue: Math.min(r.pumps / r.maxPumps, 1), duration: 220, useNativeDriver: true }).start();
    if (r.status === 'LOST') {
      // One last puff, then it bursts.
      await run(Animated.timing(grow, { toValue: sizeFor(r.pumps, r.maxPumps) * 1.08, duration: 140, useNativeDriver: true }));
      setRound(r);
      setPopped(true);
      burst.setValue(0);
      Animated.timing(burst, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      play('land');
      showBanner({ title: 'POP!', sub: `-₹${Number(r.stake).toFixed(2)}`, tone: 'lose' });
      refreshWallet().catch(() => {});
    } else {
      setRound(r);
      squash.setValue(1);
      Animated.parallel([
        Animated.spring(grow, { toValue: sizeFor(r.pumps, r.maxPumps), friction: 4, tension: 120, useNativeDriver: true }),
        Animated.spring(squash, { toValue: 0, friction: 3, tension: 140, useNativeDriver: true }),
      ]).start();
      play(r.status === 'WON' ? 'win' : 'tick');
      if (r.status === 'WON') {
        const payout = Number(r.payout);
        setShownBalance((b) => round2(b + payout));
        showBanner({ title: r.pumps >= r.maxPumps ? 'FULLY PUMPED' : 'MAX WIN', sub: `₹${payout.toFixed(2)}  ·  ${fmtMult(Number(r.multiplier))}`, tone: 'win' });
        setTimeout(() => mountedRef.current && flyAway(), 500);
        refreshWallet().catch(() => {});
      }
    }
    busyRef.current = false;
    setBusy(false);
  }, [burst, flyAway, grow, play, press, pressure, refreshWallet, round, showBanner, showToast, sizeFor, squash]);

  const doCashOut = useCallback(async () => {
    if (busyRef.current || !round || round.pumps === 0) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const r = await cashOutPump(round.id);
      if (!mountedRef.current) return;
      setRound(r);
      const payout = Number(r.payout);
      setShownBalance((b) => round2(b + payout));
      play('win');
      flyAway();
      showBanner({ title: 'CASHED OUT', sub: `₹${payout.toFixed(2)}  ·  ${fmtMult(Number(r.multiplier))}`, tone: 'win' });
      refreshWallet().catch(() => {});
    } catch (err) {
      showToast(errorMessage(err));
    }
    busyRef.current = false;
    setBusy(false);
  }, [flyAway, play, refreshWallet, round, showBanner, showToast]);

  const changeBet = (dir: -1 | 1) => {
    if (live || busy) return;
    const i = betLevels.indexOf(bet);
    const next = i < 0 ? betLevels.find((b) => (dir > 0 ? b > bet : b >= bet)) ?? bet : betLevels[Math.min(betLevels.length - 1, Math.max(0, i + dir))];
    setBet(next);
  };

  const scaleBet = (k: 0.5 | 2) => {
    if (live || busy) return;
    setBet((b) => Math.min(maxStake, Math.max(minStake, Math.round(b * k))));
  };

  const chooseDifficulty = (d: PumpDifficulty) => {
    if (live || busy) return;
    setDifficulty(d);
    if (round) setRound(null);
    resetBalloon(0, SLOTS - (config?.difficulties[d].pops ?? FALLBACK_POPS[d]));
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    AsyncStorage.setItem(SOUND_KEY, next ? 'on' : 'off').catch(() => {});
  };

  const openPanel = (p: 'history' | 'rules') => {
    setPanel(p);
    if (p === 'history') {
      setHistory(null);
      fetchPumpHistory(30)
        .then((h) => mountedRef.current && setHistory(h))
        .catch(() => mountedRef.current && setHistory([]));
    }
  };

  // ---------- layout ----------
  const contentW = Math.min(W - 24, 460);
  const headerH = insets.top + 50;
  const compact = H < 760;
  const logoW = Math.min(contentW * 0.5, 210);
  const sw = stage?.w ?? contentW;
  const sh = stage?.h ?? 300;
  const pumpW = Math.min(sw * 0.2, 78);
  const pumpH = Math.min(sh * 0.46, 170);
  const knotY = sh - pumpH * 0.22;
  const bw = Math.min(sw * 0.8, (knotY - 8) / 1.22);
  const bh = bw * 1.22;
  const balloonLeft = sw * 0.42 - bw / 2;
  const pumpLeft = sw - pumpW - 6;
  const colors = BALLOON[diff];
  const shownMult = round && pumps > 0 ? (live ? round.currentMultiplier : Number(round.multiplier) || round.currentMultiplier) : 0;
  const tapeStart = live ? Math.max(1, pumps) : 1;
  const tape = Array.from({ length: 5 }, (_, i) => tapeStart + i).filter((n) => n <= top);

  let status: React.ReactNode;
  if (live && round) {
    status = (
      <View style={styles.statusRow}>
        <Text style={styles.statusText}>
          Pumps {round.pumps}/{round.maxPumps} · {DIFF_LABEL[diff]}
        </Text>
        <Text style={styles.statusNext}>{round.nextChance ? `${round.nextChance}% safe next` : ''}</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Background w={W} h={H} />

      <View style={[styles.header, { paddingTop: insets.top + 6, height: headerH }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtn} hitSlop={8} accessibilityLabel="Back">
          <MaterialCommunityIcons name="chevron-left" size={26} color={GOLD} />
        </Pressable>
        <View style={styles.headBalance}>
          <MaterialCommunityIcons name="wallet" size={16} color={GOLD} />
          <Text style={styles.headBalanceText} numberOfLines={1}>
            ₹{shownBalance.toFixed(2)}
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        <Pressable onPress={toggleSound} style={styles.headBtn} hitSlop={6} accessibilityLabel="Sound">
          <MaterialCommunityIcons name={soundOn ? 'volume-high' : 'volume-off'} size={20} color={GOLD} />
        </Pressable>
        <Pressable onPress={() => openPanel('history')} style={styles.headBtn} hitSlop={6} accessibilityLabel="My balloons">
          <MaterialCommunityIcons name="history" size={20} color={GOLD} />
        </Pressable>
        <Pressable onPress={() => openPanel('rules')} style={styles.headBtn} hitSlop={6} accessibilityLabel="Rules">
          <MaterialCommunityIcons name="information-variant" size={22} color={GOLD} />
        </Pressable>
      </View>

      <View style={[styles.body, { paddingTop: headerH, paddingBottom: insets.bottom + 10, width: contentW, alignSelf: 'center' }]}>
        {!compact && (
          <View style={{ alignItems: 'center' }} pointerEvents="none">
            <Logo width={logoW} />
          </View>
        )}

        {/* Stage: balloon, hose and pump */}
        <View style={{ flex: 1, marginVertical: 6 }} onLayout={(e) => setStage({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
          {stage && (
            <>
              <Svg width={sw} height={sh} style={StyleSheet.absoluteFill} pointerEvents="none">
                <Ellipse cx={sw * 0.42} cy={sh - 4} rx={bw * 0.38} ry={6} fill="#000000" opacity={0.35} />
                {/* Hose from the pump's foot to the balloon's knot */}
                {!flown && <Path d={`M${pumpLeft + pumpW * 0.2} ${sh - 12} C ${pumpLeft - sw * 0.1} ${sh - 4}, ${sw * 0.42 + bw * 0.1} ${sh}, ${sw * 0.42} ${knotY}`} fill="none" stroke="#475569" strokeWidth={5} strokeLinecap="round" />}
                {!flown && <Line x1={sw * 0.42 - 6} y1={knotY} x2={sw * 0.42 + 6} y2={knotY} stroke="#94A3B8" strokeWidth={4} strokeLinecap="round" />}
              </Svg>

              {/* Balloon, anchored at its knot */}
              {!popped && (
                <Animated.View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: balloonLeft,
                    top: knotY - bh,
                    width: bw,
                    height: bh,
                    opacity: fly.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
                    transform: [
                      { translateY: fly.interpolate({ inputRange: [0, 1], outputRange: [0, -sh * 1.1] }) },
                      { translateX: fly.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 14, -8] }) },
                      { translateY: grow.interpolate({ inputRange: [0, 2], outputRange: [bh / 2, -bh / 2] }) },
                      { scaleX: Animated.multiply(grow, squash.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] })) },
                      { scaleY: Animated.multiply(grow, squash.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] })) },
                    ],
                  }}
                >
                  <Balloon w={bw} colors={colors} id="main" />
                  <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', paddingBottom: bh * 0.12 }]}>
                    {shownMult > 0 && <Text style={[styles.balloonMult, { fontSize: bw * 0.16 }]}>{fmtMult(shownMult)}</Text>}
                  </View>
                </Animated.View>
              )}

              {/* Rubber shards when it pops */}
              {popped &&
                Array.from({ length: SHARDS }, (_, i) => {
                  const a = (i / SHARDS) * Math.PI * 2 + 0.3;
                  const dist = bw * (0.45 + (i % 3) * 0.12);
                  const cx = balloonLeft + bw / 2;
                  const cy = knotY - bh * sizeFor(round?.pumps ?? 1, top) * 0.55;
                  return (
                    <Animated.View
                      key={i}
                      pointerEvents="none"
                      style={{
                        position: 'absolute',
                        left: cx - 8,
                        top: cy - 5,
                        width: 16 + (i % 3) * 5,
                        height: 9,
                        borderRadius: 5,
                        backgroundColor: i % 2 ? colors[1] : colors[2],
                        opacity: burst.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
                        transform: [
                          { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(a) * dist] }) },
                          { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(a) * dist + bw * 0.25] }) },
                          { rotate: burst.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${(i % 2 ? 1 : -1) * (180 + i * 25)}deg`] }) },
                        ],
                      }}
                    />
                  );
                })}
              {popped && (
                <View pointerEvents="none" style={{ position: 'absolute', left: balloonLeft, top: knotY - 40, width: bw, alignItems: 'center' }}>
                  <Text style={styles.poppedText}>POPPED on pump {round?.popAt}</Text>
                </View>
              )}
              {flown && round?.status === 'WON' && (
                <View pointerEvents="none" style={{ position: 'absolute', left: balloonLeft, top: knotY - bh * 0.5, width: bw, alignItems: 'center' }}>
                  <Text style={styles.wonText}>+₹{Number(round.payout).toFixed(2)}</Text>
                  <Text style={styles.wonSub}>
                    {fmtMult(Number(round.multiplier))} · it would have popped on pump {round.popAt}
                  </Text>
                </View>
              )}

              <View style={{ position: 'absolute', left: pumpLeft, top: sh - pumpH }} pointerEvents="none">
                <PumpDevice w={pumpW} h={pumpH} press={press} pressure={pressure} />
              </View>

              {!round && !busy && (
                <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 8, width: sw * 0.88, alignItems: 'center' }}>
                  <Text style={styles.hint}>Pump the balloon — cash out before it pops</Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* Upcoming multipliers */}
        <View style={styles.tape}>
          {tape.map((n) => {
            const now = live && n === pumps;
            const next = live ? n === pumps + 1 : n === 1;
            return (
              <View key={n} style={[styles.tapeCell, now && styles.tapeNow, next && styles.tapeNext]}>
                <Text style={[styles.tapeMult, now && { color: '#1B0B2E' }]} numberOfLines={1}>
                  {fmtMult(multipliers[n - 1])}
                </Text>
                <Text style={[styles.tapeLabel, now && { color: 'rgba(27,11,46,0.7)' }]}>{now ? 'NOW' : `${n} pump${n > 1 ? 's' : ''}`}</Text>
              </View>
            );
          })}
        </View>

        {/* Controls, the same height live or not */}
        <View style={{ minHeight: 166, justifyContent: 'flex-end' }}>
          {live && round ? (
            <>
              {status}
              <View style={styles.liveRow}>
                <Pressable onPress={doCashOut} disabled={busy || round.pumps === 0} style={({ pressed }) => [styles.cashBtn, (busy || round.pumps === 0) && styles.dim, pressed && { transform: [{ scale: 0.97 }] }]} accessibilityLabel="Cash out">
                  <LinearGradient colors={['#FFF1B0', GOLD, '#C98A10']} style={styles.cashInner}>
                    <Text style={styles.cashText}>CASH OUT</Text>
                    <Text style={styles.cashSub} numberOfLines={1}>
                      {round.pumps > 0 ? `₹${round.cashOut.toFixed(2)}` : 'pump first'}
                    </Text>
                  </LinearGradient>
                </Pressable>
                <Pressable onPress={doPump} disabled={busy} style={({ pressed }) => [styles.pumpBtn, pressed && { transform: [{ scale: 0.96 }] }]} accessibilityLabel="Pump">
                  <LinearGradient colors={['#F9A8D4', '#EC4899', '#9D174D']} style={styles.pumpInner}>
                    <MaterialCommunityIcons name="arrow-down-bold-circle" size={24} color="#FFFFFF" />
                    <View>
                      <Text style={styles.pumpText}>PUMP</Text>
                      <Text style={styles.pumpSub}>{round.nextMultiplier ? `→ ${fmtMult(round.nextMultiplier)}` : ''}</Text>
                    </View>
                  </LinearGradient>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <View style={styles.diffRow}>
                {DIFFS.map((d) => (
                  <Pressable key={d} onPress={() => chooseDifficulty(d)} style={[styles.diffBtn, difficulty === d && { backgroundColor: BALLOON[d][1] }, busy && styles.dim]} accessibilityLabel={`Difficulty ${DIFF_LABEL[d]}`}>
                    <Text style={[styles.diffText, difficulty === d && styles.diffTextOn]}>{DIFF_LABEL[d]}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.betRow}>
                <View style={styles.betBox}>
                  <Pressable onPress={() => changeBet(-1)} style={[styles.betBtn, busy && styles.dim]} hitSlop={6} accessibilityLabel="Lower bet">
                    <MaterialCommunityIcons name="minus" size={20} color="#2A1600" />
                  </Pressable>
                  <View style={styles.betValueBox}>
                    <Text style={styles.betLabel}>BET</Text>
                    <Text style={styles.betValue}>₹{bet}</Text>
                  </View>
                  <Pressable onPress={() => changeBet(1)} style={[styles.betBtn, busy && styles.dim]} hitSlop={6} accessibilityLabel="Raise bet">
                    <MaterialCommunityIcons name="plus" size={20} color="#2A1600" />
                  </Pressable>
                </View>
                <Pressable onPress={() => scaleBet(0.5)} style={[styles.chip, busy && styles.dim]} accessibilityLabel="Half bet">
                  <Text style={styles.chipText}>½</Text>
                </Pressable>
                <Pressable onPress={() => scaleBet(2)} style={[styles.chip, busy && styles.dim]} accessibilityLabel="Double bet">
                  <Text style={styles.chipText}>2×</Text>
                </Pressable>
              </View>
              <Pressable onPress={doStart} disabled={busy} style={({ pressed }) => [styles.startBtn, pressed && { transform: [{ scale: 0.97 }] }]} accessibilityLabel="Bet">
                <LinearGradient colors={['#99F6E4', '#14B8A6', '#0F766E']} style={styles.startInner}>
                  <MaterialCommunityIcons name="balloon" size={22} color="#042F2E" />
                  <Text style={styles.startText}>{starting ? 'STARTING' : round ? 'NEW BALLOON' : 'BET'}</Text>
                  <Text style={styles.startSub}>up to {fmtMult(Math.min(multipliers[top - 1], maxPayout / Math.max(bet, 1)))}</Text>
                </LinearGradient>
              </Pressable>
            </>
          )}
        </View>
      </View>

      {banner && (
        <View pointerEvents="none" style={[styles.bannerWrap, { top: H * 0.3 }]}>
          <Animated.View style={{ opacity: bannerAnim, transform: [{ scale: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
            <LinearGradient colors={banner.tone === 'win' ? ['#0F766E', '#042F2E'] : ['#9D174D', '#3B0418']} style={[styles.bannerCard, { borderColor: banner.tone === 'win' ? GOLD : '#FDA4AF' }]}>
              <Text style={styles.bannerTitle}>{banner.title}</Text>
              <Text style={[styles.bannerSub, { color: banner.tone === 'win' ? GOLD : '#FECDD3' }]}>{banner.sub}</Text>
            </LinearGradient>
          </Animated.View>
        </View>
      )}

      {panel && (
        <Pressable style={styles.scrim} onPress={() => setPanel(null)}>
          <Pressable style={[styles.sheet, { maxHeight: H * 0.84, width: Math.min(W - 24, 470) }]} onPress={() => {}}>
            <View style={styles.tabs}>
              {(
                [
                  ['history', 'MY BALLOONS'],
                  ['rules', 'RULES'],
                ] as const
              ).map(([id, label]) => (
                <Pressable key={id} onPress={() => openPanel(id)} style={[styles.tab, panel === id && styles.tabOn]}>
                  <Text style={[styles.tabText, panel === id && styles.tabTextOn]}>{label}</Text>
                </Pressable>
              ))}
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => setPanel(null)} hitSlop={10} style={{ padding: 6 }} accessibilityLabel="Close">
                <MaterialCommunityIcons name="close" size={20} color={GOLD} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 14 }}>{panel === 'history' ? <History rounds={history} /> : <Rules config={config} />}</ScrollView>
          </Pressable>
        </Pressable>
      )}

      {toast && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}
    </View>
  );
}

function Rules({ config }: { config: PumpConfig | null }) {
  return (
    <View>
      <Text style={styles.ruleHead}>How to play</Text>
      <Text style={styles.ruleLine}>Choose a difficulty and place your bet. Press Pump to blow up the balloon — every pump that doesn't pop it raises your multiplier. Cash out any time after the first pump to take bet × multiplier; if the balloon pops, the bet is lost.</Text>
      <Text style={styles.ruleLine}>Each balloon hides its popping pumps among {config?.slots ?? SLOTS} — more on harder difficulties. Pumping through every safe one cashes out automatically.</Text>
      <Text style={styles.ruleHead}>Difficulty</Text>
      <View style={styles.ruleBox}>
        {DIFFS.map((d) => {
          const pops = config?.difficulties[d].pops ?? FALLBACK_POPS[d];
          const mults = config?.multipliers[d] ?? fallbackMultipliers(pops);
          return (
            <View key={d} style={styles.ruleRow}>
              <View style={[styles.ruleDot, { backgroundColor: BALLOON[d][1] }]} />
              <Text style={styles.ruleKey}>{DIFF_LABEL[d]}</Text>
              <Text style={styles.ruleMid}>
                {pops} pop · {SLOTS - pops} pumps max
              </Text>
              <Text style={styles.ruleVal}>
                {fmtMult(mults[0])} → {fmtMult(mults[mults.length - 1])}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.ruleHead}>Game info</Text>
      <Text style={styles.ruleLine}>
        Multiplier after n pumps = {(config?.rtpPercent ?? 90) / 100} ÷ (chance of surviving n pumps), so the return is {config?.rtpPercent ?? 90}% whenever you cash out. On Easy the first pumps pay less than the bet. Bet ₹{config?.minStake ?? 1} – ₹{config?.maxStake ?? 500}; max win per balloon ₹{config?.maxPayout ?? 10000} — reaching it cashes out automatically.
      </Text>
      <Text style={styles.ruleLine}>Where the balloon pops is fixed from your provably-fair seeds when it's handed to you and shown when the round ends (Settings → Provably Fair).</Text>
    </View>
  );
}

function History({ rounds }: { rounds: PumpRound[] | null }) {
  if (rounds === null) return <Text style={styles.ruleLine}>Loading…</Text>;
  if (rounds.length === 0) return <Text style={styles.ruleLine}>No balloons yet.</Text>;
  return (
    <View style={{ gap: 8 }}>
      {rounds.map((r) => {
        const payout = Number(r.payout);
        const stake = Number(r.stake);
        return (
          <View key={r.id} style={styles.histRow}>
            <View style={[styles.histBalloon, { backgroundColor: BALLOON[r.difficulty][1], opacity: r.status === 'LOST' ? 0.4 : 1 }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.histMain}>
                {DIFF_LABEL[r.difficulty]} · {r.status === 'WON' ? `cashed out after ${r.pumps} pump${r.pumps > 1 ? 's' : ''} (${fmtMult(Number(r.multiplier))})` : `popped on pump ${r.pumps}`}
              </Text>
              <Text style={styles.histSub}>
                ₹{stake.toFixed(2)} · {new Date(r.createdAt).toLocaleString()}
              </Text>
            </View>
            <Text style={[styles.histPay, { color: payout > stake ? GOLD : 'rgba(243,240,255,0.5)' }]}>{payout > 0 ? `+₹${payout.toFixed(2)}` : `-₹${stake.toFixed(2)}`}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#08061A' },
  dim: { opacity: 0.4 },
  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 6, zIndex: 3 },
  headBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(24,16,60,0.9)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.45)' },
  headBalance: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: 'rgba(24,16,60,0.92)', borderWidth: 1.2, borderColor: GOLD },
  headBalanceText: { color: GOLD, fontWeight: '900', fontSize: 14 },
  body: { flex: 1 },
  hint: { color: 'rgba(243,240,255,0.75)', fontWeight: '800', fontSize: 13 },
  balloonMult: { color: '#FFFFFF', fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 2 } },
  poppedText: { color: '#FDA4AF', fontWeight: '900', fontSize: 14, letterSpacing: 1 },
  wonText: { color: GOLD, fontWeight: '900', fontSize: 30, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 8 },
  wonSub: { color: 'rgba(243,240,255,0.7)', fontWeight: '800', fontSize: 12, marginTop: 4, textAlign: 'center' },
  tape: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  tapeCell: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(24,16,60,0.85)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)' },
  tapeNow: { backgroundColor: GOLD, borderColor: '#FFF3C4' },
  tapeNext: { borderColor: '#F472B6', borderWidth: 1.5 },
  tapeMult: { color: INK, fontWeight: '900', fontSize: 13 },
  tapeLabel: { color: 'rgba(243,240,255,0.5)', fontWeight: '800', fontSize: 9.5, marginTop: 1 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4, marginBottom: 8 },
  statusText: { color: INK, fontWeight: '900', fontSize: 13 },
  statusNext: { color: CYAN, fontWeight: '900', fontSize: 13 },
  liveRow: { flexDirection: 'row', gap: 10 },
  cashBtn: { flex: 1, height: 66, borderRadius: 18, overflow: 'hidden' },
  cashInner: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 18, borderWidth: 2, borderColor: '#FFF3C4' },
  cashText: { color: '#2A1600', fontWeight: '900', fontSize: 18, letterSpacing: 2 },
  cashSub: { color: 'rgba(42,22,0,0.75)', fontWeight: '900', fontSize: 12 },
  pumpBtn: { flex: 1.15, height: 66, borderRadius: 18, overflow: 'hidden', shadowColor: '#EC4899', shadowOpacity: 0.6, shadowRadius: 14, elevation: 8 },
  pumpInner: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 18, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  pumpText: { color: '#FFFFFF', fontWeight: '900', fontSize: 22, letterSpacing: 3 },
  pumpSub: { color: 'rgba(255,255,255,0.85)', fontWeight: '900', fontSize: 11.5 },
  diffRow: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14, backgroundColor: 'rgba(24,16,60,0.9)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.3)' },
  diffBtn: { flex: 1, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  diffText: { color: 'rgba(243,240,255,0.75)', fontWeight: '900', fontSize: 12 },
  diffTextOn: { color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 3 },
  betRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  betBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6, borderRadius: 16, backgroundColor: 'rgba(24,16,60,0.92)', borderWidth: 1.2, borderColor: 'rgba(255,214,107,0.45)' },
  betBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: GOLD },
  betValueBox: { flex: 1, alignItems: 'center' },
  betLabel: { color: 'rgba(243,240,255,0.55)', fontSize: 9.5, fontWeight: '900', letterSpacing: 1.5 },
  betValue: { color: INK, fontSize: 18, fontWeight: '900' },
  chip: { width: 50, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(24,16,60,0.92)', borderWidth: 1.2, borderColor: 'rgba(255,214,107,0.45)' },
  chipText: { color: GOLD, fontWeight: '900', fontSize: 16 },
  startBtn: { height: 62, borderRadius: 20, overflow: 'hidden', marginTop: 10, shadowColor: '#14B8A6', shadowOpacity: 0.5, shadowRadius: 14, elevation: 8 },
  startInner: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 20, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  startText: { color: '#042F2E', fontSize: 21, fontWeight: '900', letterSpacing: 3 },
  startSub: { color: 'rgba(4,47,46,0.7)', fontSize: 11, fontWeight: '900' },
  bannerWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  bannerCard: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 18, borderWidth: 2, alignItems: 'center', minWidth: 220 },
  bannerTitle: { color: '#FFFFFF', fontWeight: '900', fontSize: 24, letterSpacing: 3 },
  bannerSub: { fontWeight: '900', fontSize: 17, marginTop: 2 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  sheet: { borderRadius: 18, backgroundColor: '#150F36', borderWidth: 1.5, borderColor: GOLD, overflow: 'hidden' },
  tabs: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,214,107,0.25)' },
  tab: { paddingHorizontal: 12, paddingVertical: 7, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  tabOn: { backgroundColor: 'rgba(255,214,107,0.14)', borderBottomWidth: 2, borderBottomColor: GOLD },
  tabText: { color: 'rgba(243,240,255,0.55)', fontWeight: '900', fontSize: 12, letterSpacing: 1.2 },
  tabTextOn: { color: GOLD },
  ruleHead: { color: GOLD, fontWeight: '900', fontSize: 13, letterSpacing: 1, marginTop: 12, marginBottom: 6 },
  ruleLine: { color: 'rgba(243,240,255,0.86)', fontSize: 12.5, lineHeight: 19, fontWeight: '600', marginTop: 4 },
  ruleBox: { borderRadius: 12, padding: 10, backgroundColor: 'rgba(255,214,107,0.07)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.25)', gap: 7 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ruleDot: { width: 10, height: 12, borderRadius: 6 },
  ruleKey: { color: INK, fontWeight: '900', fontSize: 12.5, width: 52 },
  ruleMid: { color: 'rgba(243,240,255,0.7)', fontWeight: '700', fontSize: 11.5, flex: 1 },
  ruleVal: { color: GOLD, fontWeight: '900', fontSize: 11.5 },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.15)' },
  histBalloon: { width: 16, height: 20, borderRadius: 9 },
  histMain: { color: INK, fontWeight: '800', fontSize: 13 },
  histSub: { color: 'rgba(243,240,255,0.5)', fontSize: 11, marginTop: 3 },
  histPay: { fontWeight: '900', fontSize: 14, marginLeft: 8 },
  toast: { position: 'absolute', alignSelf: 'center', top: '45%', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.85)', borderWidth: 1, borderColor: GOLD, maxWidth: '86%', zIndex: 6 },
  toastText: { color: INK, fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
