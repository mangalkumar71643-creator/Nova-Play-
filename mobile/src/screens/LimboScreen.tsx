import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient as SvgLinearGradient, Path, Polygon, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../api/client';
import { LimboBet, LimboConfig, fetchLimboConfig, fetchLimboHistory, playLimbo } from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const PINK = '#FF5FD2';
const VIOLET = '#A78BFA';
const GOLD = '#FFD66B';
const WIN = '#35F5A0';
const LOSE = '#FF4D6A';
const INK = '#F5EEFF';
const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const DEFAULT_BET = 10;
const AUTO_OPTIONS = [10, 25, 50, 100];
const TARGET_STEPS = [1.01, 1.1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10, 15, 20, 25, 50, 75, 100, 250, 500, 1000, 2500, 5000, 10000];
const QUICK_TARGETS = [1.5, 2, 3, 5, 10, 100];
const SOUND_KEY = 'novaplay:limbo:sound';
const TOAST_MS = 1800;
const RECENT_MAX = 12;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function floor2(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

function fmtX(v: number): string {
  return v >= 10000 ? Math.floor(v).toLocaleString('en-IN') : v.toFixed(2);
}

// ---------- art ----------

/** Fixed pseudo-random star field so it never jumps between renders. */
const STARS = Array.from({ length: 70 }, (_, i) => {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const b = Math.sin(i * 78.233) * 12543.123;
  return { x: a - Math.floor(a), y: b - Math.floor(b), r: 0.5 + ((i * 7) % 5) * 0.28, o: 0.25 + ((i * 13) % 7) * 0.1 };
});

function Background({ w, h }: { w: number; h: number }) {
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id="lBg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#12052B" />
          <Stop offset="0.5" stopColor="#0A0320" />
          <Stop offset="1" stopColor="#040111" />
        </SvgLinearGradient>
        <RadialGradient id="lNeb1" cx="20%" cy="22%" r="55%">
          <Stop offset="0" stopColor="#C026D3" stopOpacity={0.3} />
          <Stop offset="1" stopColor="#C026D3" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="lNeb2" cx="85%" cy="40%" r="50%">
          <Stop offset="0" stopColor="#4F46E5" stopOpacity={0.28} />
          <Stop offset="1" stopColor="#4F46E5" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="lPlanet" cx="50%" cy="0%" r="100%">
          <Stop offset="0" stopColor="#7C3AED" stopOpacity={0.55} />
          <Stop offset="0.6" stopColor="#2E1065" stopOpacity={0.5} />
          <Stop offset="1" stopColor="#0A0320" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill="url(#lBg)" />
      <Rect x={0} y={0} width={w} height={h} fill="url(#lNeb1)" />
      <Rect x={0} y={0} width={w} height={h} fill="url(#lNeb2)" />
      {STARS.map((s, i) => (
        <Circle key={i} cx={s.x * w} cy={s.y * h} r={s.r} fill="#FFFFFF" opacity={s.o} />
      ))}
      {/* Planet horizon low on the screen */}
      <Ellipse cx={w / 2} cy={h * 1.18} rx={w * 1.1} ry={h * 0.5} fill="url(#lPlanet)" />
      <Ellipse cx={w / 2} cy={h * 1.18} rx={w * 1.1} ry={h * 0.5} fill="none" stroke={PINK} strokeOpacity={0.35} strokeWidth={1.5} />
    </Svg>
  );
}

function Logo({ width }: { width: number }) {
  return (
    <Svg width={width} height={width * 0.2} viewBox="0 0 300 60">
      <Defs>
        <SvgLinearGradient id="lLogo" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.45" stopColor={PINK} />
          <Stop offset="1" stopColor="#7C3AED" />
        </SvgLinearGradient>
      </Defs>
      <Line x1={4} y1={30} x2={30} y2={30} stroke={PINK} strokeOpacity={0.5} strokeWidth={1.5} />
      <Line x1={270} y1={30} x2={296} y2={30} stroke={PINK} strokeOpacity={0.5} strokeWidth={1.5} />
      <Polygon points="34,30 40,24 46,30 40,36" fill={GOLD} />
      <Polygon points="254,30 260,24 266,30 260,36" fill={GOLD} />
      <SvgText x={150} y={45} fontSize={42} fontWeight="bold" fontFamily="serif" fill="url(#lLogo)" stroke="#2E0A3A" strokeWidth={1.2} textAnchor="middle" letterSpacing={8}>
        LIMBO
      </SvgText>
    </Svg>
  );
}

function Rocket({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Defs>
        <SvgLinearGradient id="lRk" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#C4B5FD" />
        </SvgLinearGradient>
      </Defs>
      <Path d="M20 3 C 27 9 28 19 25 27 L 15 27 C 12 19 13 9 20 3 Z" fill="url(#lRk)" stroke="#4C1D95" strokeWidth={1.2} />
      <Circle cx={20} cy={14} r={3.4} fill="#38BDF8" stroke="#4C1D95" strokeWidth={1} />
      <Path d="M15 21 L 9 29 L 15 27 Z" fill={PINK} />
      <Path d="M25 21 L 31 29 L 25 27 Z" fill={PINK} />
      <Path d="M16 28 Q 20 38 24 28 Z" fill={GOLD} />
    </Svg>
  );
}

/** Home tile art: a rocket climbing past a glowing multiplier. */
export function LimboTileArt({ size }: { size: number }) {
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size }} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="ltBg" cx="50%" cy="35%" r="75%">
            <Stop offset="0" stopColor="#4C1D95" />
            <Stop offset="1" stopColor="#0A0320" />
          </RadialGradient>
          <SvgLinearGradient id="ltRing" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={PINK} />
            <Stop offset="1" stopColor="#7C3AED" />
          </SvgLinearGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill="url(#ltBg)" />
        {STARS.slice(0, 22).map((s, i) => (
          <Circle key={i} cx={s.x * 100} cy={s.y * 60} r={s.r * 0.7} fill="#FFFFFF" opacity={s.o} />
        ))}
        <Circle cx={50} cy={34} r={22} fill="none" stroke="url(#ltRing)" strokeWidth={3} />
        <Circle cx={50} cy={34} r={27} fill="none" stroke={PINK} strokeOpacity={0.25} strokeWidth={1} />
        <SvgText x={50} y={40} fontSize={15} fontWeight="bold" fill="#FFFFFF" textAnchor="middle">
          2.00x
        </SvgText>
      </Svg>
      <View style={{ position: 'absolute', left: size * 0.66, top: size * 0.04, transform: [{ rotate: '35deg' }] }}>
        <Rocket size={size * 0.26} />
      </View>
    </View>
  );
}

// ---------- screen ----------

type Recent = { id: string; v: number; won: boolean };
type Last = { result: number; won: boolean; target: number; payout: number };

export default function LimboScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<LimboConfig | null>(null);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [target, setTarget] = useState(2);
  const [busy, setBusy] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [autoLeft, setAutoLeft] = useState(0);
  const [autoOpen, setAutoOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [shownBalance, setShownBalance] = useState(coins);
  const [last, setLast] = useState<Last | null>(null);
  const [shownX, setShownX] = useState(1);
  const [climbing, setClimbing] = useState(false);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [targetText, setTargetText] = useState<string | null>(null);
  const [chanceText, setChanceText] = useState<string | null>(null);
  const [panel, setPanel] = useState<'bets' | 'rules' | null>(null);
  const [history, setHistory] = useState<LimboBet[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const autoRef = useRef(0);
  autoRef.current = autoLeft;
  const turboRef = useRef(turbo);
  turboRef.current = turbo;
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;
  const balanceRef = useRef(shownBalance);
  balanceRef.current = shownBalance;
  const stateRef = useRef({ bet, target });
  stateRef.current = { bet, target };
  const playersRef = useRef<{ tick: AudioPlayer; win: AudioPlayer; land: AudioPlayer } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doPlayRef = useRef<() => void>(() => {});
  const climbTo = useRef(1);

  const climb = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const gain = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const rocketSpin = useRef(new Animated.Value(0)).current;

  const rtp = config?.rtpPercent ?? 90;
  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const maxPayout = config?.maxPayout ?? 10000;
  const minTarget = config?.minTarget ?? 1.01;
  const maxTarget = config?.maxTarget ?? 10000;
  const betLevels = useMemo(() => BET_LEVELS.filter((b) => b >= minStake && b <= maxStake), [minStake, maxStake]);

  const chance = rtp / target;
  const winAmount = floor2(bet * target);
  const overCap = winAmount > maxPayout;

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

  useEffect(() => {
    mountedRef.current = true;
    fetchLimboConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => {});
    fetchLimboHistory(RECENT_MAX)
      .then((h) => mountedRef.current && setRecent(h.reverse().map((b) => ({ id: b.id, v: Number(b.result), won: b.won }))))
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
    // The climb runs 0 → 1; the number grows exponentially from 1.00x to the result.
    const id = climb.addListener(({ value }) => setShownX(Math.max(1, Math.floor(Math.exp(Math.log(climbTo.current) * value) * 100) / 100)));
    const spin = Animated.loop(Animated.timing(rocketSpin, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: true }));
    spin.start();
    return () => {
      mountedRef.current = false;
      climb.removeListener(id);
      spin.stop();
      const players = playersRef.current;
      playersRef.current = null;
      if (players) Object.values(players).forEach((p) => p.remove());
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (autoTimer.current) clearTimeout(autoTimer.current);
    };
  }, [climb, rocketSpin]);

  useEffect(() => {
    if (!busyRef.current) setShownBalance(coins);
  }, [coins]);

  const clampTarget = useCallback((t: number) => Math.min(maxTarget, Math.max(minTarget, round2(t))), [maxTarget, minTarget]);

  const commitTarget = (text: string) => {
    setTargetText(null);
    const t = Number(text.replace(',', '.').replace(/x$/i, ''));
    if (Number.isFinite(t) && t > 0) setTarget(clampTarget(t));
  };

  const commitChance = (text: string) => {
    setChanceText(null);
    const c = Number(text.replace(',', '.'));
    if (Number.isFinite(c) && c > 0) setTarget(clampTarget(rtp / c));
  };

  const stepTarget = (dir: -1 | 1) => {
    if (busy || autoLeft > 0) return;
    const next = dir > 0 ? TARGET_STEPS.find((s) => s > target + 1e-9) : [...TARGET_STEPS].reverse().find((s) => s < target - 1e-9);
    if (next !== undefined) setTarget(clampTarget(next));
  };

  const changeBet = (dir: -1 | 1) => {
    if (busy || autoLeft > 0) return;
    const i = betLevels.indexOf(bet);
    const next = i < 0 ? betLevels.find((b) => (dir > 0 ? b > bet : b >= bet)) ?? bet : betLevels[Math.min(betLevels.length - 1, Math.max(0, i + dir))];
    setBet(next);
  };

  const scaleBet = (k: 0.5 | 2) => {
    if (busy || autoLeft > 0) return;
    setBet((b) => Math.min(maxStake, Math.max(minStake, Math.round(b * k))));
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    AsyncStorage.setItem(SOUND_KEY, next ? 'on' : 'off').catch(() => {});
  };

  const doPlay = useCallback(async () => {
    if (busyRef.current) return;
    const { bet: stake, target: t } = stateRef.current;
    if (stake > balanceRef.current) {
      showToast('Insufficient balance');
      setAutoLeft(0);
      return;
    }
    if (floor2(stake * t) > maxPayout) {
      showToast(`Max win per bet is ₹${maxPayout}. Lower the bet or the target.`);
      setAutoLeft(0);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setShownBalance((b) => round2(b - stake));
    setLast(null);
    climb.setValue(0);
    climbTo.current = 1;
    setShownX(1);
    play('tick');

    let b: LimboBet;
    try {
      b = await playLimbo(stake, t);
    } catch (err) {
      setShownBalance((v) => round2(v + stake));
      setAutoLeft(0);
      showToast(errorMessage(err));
      busyRef.current = false;
      setBusy(false);
      return;
    }
    if (!mountedRef.current) return;

    const result = Number(b.result);
    const payout = Number(b.payout);
    const fast = turboRef.current;
    // Longer climbs for bigger results, but never slow.
    const dur = result <= 1 ? 120 : Math.min(fast ? 520 : 1300, (fast ? 180 : 380) + Math.log10(result) * (fast ? 110 : 300));
    climbTo.current = result;
    setClimbing(true);
    await new Promise<void>((resolve) => Animated.timing(climb, { toValue: 1, duration: dur, easing: Easing.out(Easing.quad), useNativeDriver: false }).start(() => resolve()));
    if (!mountedRef.current) return;
    setClimbing(false);
    setShownX(result);
    setLast({ result, won: b.won, target: t, payout });
    setRecent((r) => [...r, { id: b.id, v: result, won: b.won }].slice(-RECENT_MAX));
    if (b.won) {
      play('win');
      setShownBalance((v) => round2(v + payout));
      burst.setValue(0);
      Animated.timing(burst, { toValue: 1, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      gain.setValue(0);
      Animated.timing(gain, { toValue: 1, duration: 1100, useNativeDriver: true }).start();
    } else {
      play('land');
      shake.setValue(0);
      Animated.timing(shake, { toValue: 1, duration: 360, easing: Easing.linear, useNativeDriver: true }).start();
    }
    refreshWallet().catch(() => {});
    busyRef.current = false;
    setBusy(false);

    if (autoRef.current > 0) {
      const next = autoRef.current - 1;
      setAutoLeft(next);
      if (next > 0) autoTimer.current = setTimeout(() => mountedRef.current && doPlayRef.current(), fast ? 200 : 650);
    }
  }, [burst, climb, gain, maxPayout, play, refreshWallet, shake, showToast]);
  doPlayRef.current = doPlay;

  const startAuto = (n: number) => {
    setAutoOpen(false);
    setAutoLeft(n);
    autoRef.current = n;
    doPlay();
  };

  const stopAuto = () => {
    setAutoLeft(0);
    if (autoTimer.current) clearTimeout(autoTimer.current);
  };

  const openPanel = (p: 'bets' | 'rules') => {
    setPanel(p);
    if (p === 'bets') {
      setHistory(null);
      fetchLimboHistory(30)
        .then((h) => mountedRef.current && setHistory(h))
        .catch(() => mountedRef.current && setHistory([]));
    }
  };

  // ---------- layout ----------
  const contentW = Math.min(W - 24, 460);
  const headerH = insets.top + 50;
  const compact = H < 760;
  const ring = Math.min(contentW * (compact ? 0.62 : 0.72), compact ? 200 : 290);
  const R = ring / 2 - 12;
  const circ = 2 * Math.PI * R;
  // Ring fills as the number climbs towards the target; full (and green) at the target.
  const progress = last ? (last.won ? 1 : Math.min(0.999, Math.log(Math.max(1, last.result)) / Math.log(last.target))) : climbing || busy ? Math.min(1, Math.log(Math.max(1, shownX)) / Math.log(stateRef.current.target)) : 0;
  const reached = shownX >= (last?.target ?? target);
  const numColor = last ? (last.won ? WIN : LOSE) : reached && climbing ? WIN : INK;
  const ringColor = last ? (last.won ? WIN : LOSE) : reached ? WIN : PINK;
  const label = fmtX(shownX);
  const numSize = Math.min(ring * 0.3, (ring * 1.55) / Math.max(4, label.length + 1));
  const locked = busy || autoLeft > 0;

  return (
    <View style={styles.root}>
      <Background w={W} h={H} />

      <View style={[styles.header, { paddingTop: insets.top + 6, height: headerH }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtn} hitSlop={8} accessibilityLabel="Back">
          <MaterialCommunityIcons name="chevron-left" size={26} color={PINK} />
        </Pressable>
        <View style={styles.headBalance}>
          <MaterialCommunityIcons name="wallet" size={16} color={PINK} />
          <Text style={styles.headBalanceText} numberOfLines={1}>
            ₹{shownBalance.toFixed(2)}
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        <Pressable onPress={toggleSound} style={styles.headBtn} hitSlop={6} accessibilityLabel="Sound">
          <MaterialCommunityIcons name={soundOn ? 'volume-high' : 'volume-off'} size={20} color={PINK} />
        </Pressable>
        <Pressable onPress={() => openPanel('bets')} style={styles.headBtn} hitSlop={6} accessibilityLabel="My bets">
          <MaterialCommunityIcons name="history" size={20} color={PINK} />
        </Pressable>
        <Pressable onPress={() => openPanel('rules')} style={styles.headBtn} hitSlop={6} accessibilityLabel="Rules">
          <MaterialCommunityIcons name="information-variant" size={22} color={PINK} />
        </Pressable>
      </View>

      <View style={[styles.body, { paddingTop: headerH + 2, paddingBottom: insets.bottom + 12, width: contentW, alignSelf: 'center' }]}>
        <View style={{ alignItems: 'center' }} pointerEvents="none">
          <Logo width={Math.min(contentW * 0.72, 280)} />
        </View>

        <View style={styles.recentRow}>
          {recent.length === 0 ? (
            <Text style={styles.recentEmpty}>Your recent results show here</Text>
          ) : (
            recent.slice(-(compact ? 6 : 7)).map((r, i, arr) => (
              <View key={r.id} style={[styles.recentPill, { backgroundColor: r.won ? 'rgba(53,245,160,0.15)' : 'rgba(255,255,255,0.06)', borderColor: r.won ? WIN : 'rgba(255,255,255,0.14)' }, i === arr.length - 1 && styles.recentPillNew]}>
                <Text style={[styles.recentText, { color: r.won ? WIN : 'rgba(245,238,255,0.75)' }]}>{fmtX(r.v)}x</Text>
              </View>
            ))
          )}
        </View>

        {/* Stage: orbit ring with the climbing multiplier */}
        <View style={styles.stage}>
          <Animated.View
            style={{
              width: ring,
              height: ring,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ translateX: shake.interpolate({ inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1], outputRange: [0, -8, 7, -5, 3, 0] }) }],
            }}
          >
            {last?.won && (
              <Animated.View pointerEvents="none" style={{ position: 'absolute', opacity: burst.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.9, 0] }), transform: [{ scale: burst.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.5] }) }] }}>
                <Svg width={ring} height={ring} viewBox="0 0 100 100">
                  {Array.from({ length: 16 }, (_, i) => {
                    const a = (i / 16) * Math.PI * 2;
                    return <Line key={i} x1={50 + Math.cos(a) * 36} y1={50 + Math.sin(a) * 36} x2={50 + Math.cos(a) * 49} y2={50 + Math.sin(a) * 49} stroke={WIN} strokeWidth={2} strokeLinecap="round" />;
                  })}
                </Svg>
              </Animated.View>
            )}
            <Svg width={ring} height={ring} style={StyleSheet.absoluteFill}>
              <Defs>
                <RadialGradient id="lCore" cx="50%" cy="45%" r="55%">
                  <Stop offset="0" stopColor="#3B0F6B" stopOpacity={0.95} />
                  <Stop offset="1" stopColor="#0E0424" stopOpacity={0.95} />
                </RadialGradient>
              </Defs>
              <Circle cx={ring / 2} cy={ring / 2} r={R + 9} fill="none" stroke={VIOLET} strokeOpacity={0.18} strokeWidth={1} strokeDasharray="2 6" />
              <Circle cx={ring / 2} cy={ring / 2} r={R - 8} fill="url(#lCore)" />
              <Circle cx={ring / 2} cy={ring / 2} r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={9} />
              {progress > 0.005 && (
                <G rotation={-90} origin={`${ring / 2}, ${ring / 2}`}>
                  <Circle cx={ring / 2} cy={ring / 2} r={R} fill="none" stroke={ringColor} strokeWidth={9} strokeLinecap="round" strokeDasharray={`${circ * progress} ${circ}`} />
                </G>
              )}
            </Svg>
            <Animated.View style={{ position: 'absolute', width: ring, height: ring, transform: [{ rotate: rocketSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }} pointerEvents="none">
              <View style={{ position: 'absolute', left: ring / 2 - 13, top: -6, transform: [{ rotate: '90deg' }] }}>
                <Rocket size={26} />
              </View>
            </Animated.View>
            <Text style={[styles.bigX, { color: numColor, fontSize: numSize }]} numberOfLines={1}>
              {label}
              <Text style={{ fontSize: numSize * 0.6 }}>x</Text>
            </Text>
            <Text style={styles.stageSub}>{last ? (last.won ? `WON ₹${last.payout.toFixed(2)}` : `TARGET ${fmtX(last.target)}x`) : busy ? 'LAUNCHING' : `TARGET ${fmtX(target)}x`}</Text>
            {last?.won && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.gainPill,
                  {
                    opacity: gain.interpolate({ inputRange: [0, 0.1, 0.8, 1], outputRange: [0, 1, 1, 0] }),
                    transform: [{ translateY: gain.interpolate({ inputRange: [0, 1], outputRange: [8, -4] }) }],
                  },
                ]}
              >
                <Text style={styles.gainText}>+₹{last.payout.toFixed(2)}</Text>
              </Animated.View>
            )}
          </Animated.View>
        </View>

        {/* Target & chance */}
        <View style={styles.stats}>
          <View style={[styles.statCard, { flex: 1.35 }]}>
            <Text style={styles.statLabel}>TARGET MULTIPLIER</Text>
            <View style={styles.statInputRow}>
              <Pressable onPress={() => stepTarget(-1)} style={[styles.stepBtn, locked && styles.dim]} hitSlop={4} accessibilityLabel="Lower target">
                <MaterialCommunityIcons name="minus" size={16} color="#2A0636" />
              </Pressable>
              <TextInput
                value={targetText ?? target.toFixed(2)}
                onChangeText={setTargetText}
                onFocus={() => setTargetText(target.toFixed(2))}
                onEndEditing={(e) => commitTarget(e.nativeEvent.text)}
                onSubmitEditing={(e) => commitTarget(e.nativeEvent.text)}
                onBlur={() => targetText !== null && commitTarget(targetText)}
                keyboardType="decimal-pad"
                editable={!locked}
                style={styles.statInput}
                selectTextOnFocus
                accessibilityLabel="Target multiplier"
              />
              <Text style={styles.statUnit}>x</Text>
              <Pressable onPress={() => stepTarget(1)} style={[styles.stepBtn, locked && styles.dim]} hitSlop={4} accessibilityLabel="Raise target">
                <MaterialCommunityIcons name="plus" size={16} color="#2A0636" />
              </Pressable>
            </View>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>WIN CHANCE</Text>
            <View style={styles.statInputRow}>
              <TextInput
                value={chanceText ?? chance.toFixed(4)}
                onChangeText={setChanceText}
                onFocus={() => setChanceText(chance.toFixed(4))}
                onEndEditing={(e) => commitChance(e.nativeEvent.text)}
                onSubmitEditing={(e) => commitChance(e.nativeEvent.text)}
                onBlur={() => chanceText !== null && commitChance(chanceText)}
                keyboardType="decimal-pad"
                editable={!locked}
                style={styles.statInput}
                selectTextOnFocus
                accessibilityLabel="Win chance"
              />
              <Text style={styles.statUnit}>%</Text>
            </View>
          </View>
        </View>

        <View style={styles.quickRow}>
          {QUICK_TARGETS.map((q) => (
            <Pressable key={q} onPress={() => !locked && setTarget(clampTarget(q))} style={[styles.quick, target === q && styles.quickOn, locked && styles.dim]}>
              <Text style={[styles.quickText, target === q && styles.quickTextOn]}>{q}x</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.betRow}>
          <View style={styles.betBox}>
            <Pressable onPress={() => changeBet(-1)} style={[styles.betBtn, locked && styles.dim]} hitSlop={6} accessibilityLabel="Lower bet">
              <MaterialCommunityIcons name="minus" size={20} color="#2A0636" />
            </Pressable>
            <View style={styles.betValueBox}>
              <Text style={styles.betLabel}>BET</Text>
              <Text style={styles.betValue}>₹{bet}</Text>
            </View>
            <Pressable onPress={() => changeBet(1)} style={[styles.betBtn, locked && styles.dim]} hitSlop={6} accessibilityLabel="Raise bet">
              <MaterialCommunityIcons name="plus" size={20} color="#2A0636" />
            </Pressable>
          </View>
          <Pressable onPress={() => scaleBet(0.5)} style={[styles.chip, locked && styles.dim]} accessibilityLabel="Half bet">
            <Text style={styles.chipText}>½</Text>
          </Pressable>
          <Pressable onPress={() => scaleBet(2)} style={[styles.chip, locked && styles.dim]} accessibilityLabel="Double bet">
            <Text style={styles.chipText}>2×</Text>
          </Pressable>
        </View>
        <View style={styles.profitRow}>
          <Text style={styles.profitLabel}>WIN AMOUNT</Text>
          <Text style={[styles.profitValue, overCap && { color: LOSE }]}>{overCap ? `Max win ₹${maxPayout}` : `₹${winAmount.toFixed(2)}`}</Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={() => {
              if (autoLeft > 0) stopAuto();
              else doPlay();
            }}
            disabled={busy && autoLeft === 0}
            style={({ pressed }) => [styles.playBtn, pressed && { transform: [{ scale: 0.97 }] }]}
            accessibilityLabel={autoLeft > 0 ? 'Stop auto bet' : 'Bet'}
          >
            <LinearGradient colors={autoLeft > 0 ? ['#FF7A8A', '#B3102F'] : busy ? ['#D8A6F5', '#7C3AED'] : ['#FFB3EE', '#FF5FD2', '#7C3AED']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.playInner}>
              {autoLeft > 0 ? (
                <Text style={styles.playText}>STOP · {autoLeft}</Text>
              ) : (
                <>
                  <MaterialCommunityIcons name="rocket-launch" size={22} color="#FFFFFF" />
                  <Text style={styles.playText}>{busy ? 'LAUNCHING' : 'BET'}</Text>
                </>
              )}
            </LinearGradient>
          </Pressable>
          <View style={styles.sideBtns}>
            <Pressable onPress={() => (autoLeft > 0 ? stopAuto() : setAutoOpen((o) => !o))} style={[styles.sideBtn, autoLeft > 0 && styles.sideBtnOn]} accessibilityLabel="Auto bet">
              <MaterialCommunityIcons name="autorenew" size={16} color={autoLeft > 0 ? '#2A0636' : PINK} />
              <Text style={[styles.sideBtnText, autoLeft > 0 && { color: '#2A0636' }]}>AUTO</Text>
            </Pressable>
            <Pressable onPress={() => setTurbo((t) => !t)} style={[styles.sideBtn, turbo && styles.sideBtnOn]} accessibilityLabel="Turbo">
              <MaterialCommunityIcons name="lightning-bolt" size={16} color={turbo ? '#2A0636' : PINK} />
              <Text style={[styles.sideBtnText, turbo && { color: '#2A0636' }]}>TURBO</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {autoOpen && (
        <View style={[styles.autoPop, { bottom: insets.bottom + 92, right: (W - contentW) / 2 }]}>
          <Text style={styles.autoPopTitle}>AUTO BET</Text>
          <View style={styles.autoGrid}>
            {AUTO_OPTIONS.map((n) => (
              <Pressable key={n} onPress={() => startAuto(n)} style={styles.autoOpt}>
                <Text style={styles.autoOptText}>{n}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {panel && (
        <Pressable style={styles.scrim} onPress={() => setPanel(null)}>
          <Pressable style={[styles.sheet, { maxHeight: H * 0.84, width: Math.min(W - 24, 470) }]} onPress={() => {}}>
            <View style={styles.tabs}>
              {(
                [
                  ['bets', 'MY BETS'],
                  ['rules', 'RULES'],
                ] as const
              ).map(([id, label]) => (
                <Pressable key={id} onPress={() => openPanel(id)} style={[styles.tab, panel === id && styles.tabOn]}>
                  <Text style={[styles.tabText, panel === id && styles.tabTextOn]}>{label}</Text>
                </Pressable>
              ))}
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => setPanel(null)} hitSlop={10} style={{ padding: 6 }} accessibilityLabel="Close">
                <MaterialCommunityIcons name="close" size={20} color={PINK} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 14 }}>{panel === 'bets' ? <History bets={history} /> : <Rules config={config} />}</ScrollView>
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

function Rules({ config }: { config: LimboConfig | null }) {
  const rtp = config?.rtpPercent ?? 90;
  return (
    <View>
      <Text style={styles.ruleHead}>How to play</Text>
      <Text style={styles.ruleLine}>Set a target multiplier and your bet, then tap BET. A result multiplier climbs from 1.00x and stops at a random point. If it reaches your target or goes past it, you win bet × target.</Text>
      <Text style={styles.ruleHead}>Target & win chance</Text>
      <Text style={styles.ruleLine}>The higher the target, the lower the chance: win chance = {rtp} ÷ target. You can type a target or a win chance, or use the quick buttons.</Text>
      <View style={styles.exampleBox}>
        {[1.5, 2, 10, 100].map((t) => (
          <View key={t} style={styles.exampleRow}>
            <Text style={styles.exampleText}>{t}x target</Text>
            <Text style={[styles.exampleText, { color: PINK }]}>{(rtp / t).toFixed(2)}% chance</Text>
          </View>
        ))}
      </View>
      <Text style={styles.ruleHead}>Game info</Text>
      <Text style={styles.ruleLine}>
        Return to player {rtp}%. Target {config?.minTarget ?? 1.01}x – {config?.maxTarget ?? 10000}x. Bet ₹{config?.minStake ?? 1} – ₹{config?.maxStake ?? 500}. Max win per bet ₹{config?.maxPayout ?? 10000}.
      </Text>
      <Text style={styles.ruleLine}>Every result is drawn from your provably-fair seeds (Settings → Provably Fair).</Text>
    </View>
  );
}

function History({ bets }: { bets: LimboBet[] | null }) {
  if (bets === null) return <Text style={styles.ruleLine}>Loading…</Text>;
  if (bets.length === 0) return <Text style={styles.ruleLine}>No bets yet.</Text>;
  return (
    <View style={{ gap: 8 }}>
      {bets.map((b) => {
        const payout = Number(b.payout);
        const stake = Number(b.stake);
        return (
          <View key={b.id} style={styles.histRow}>
            <View style={[styles.histChip, { borderColor: b.won ? WIN : LOSE }]}>
              <Text style={[styles.histChipText, { color: b.won ? WIN : LOSE }]}>{fmtX(Number(b.result))}x</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.histMain}>Target {fmtX(Number(b.target))}x</Text>
              <Text style={styles.histSub}>
                ₹{stake.toFixed(2)} · {new Date(b.createdAt).toLocaleString()}
              </Text>
            </View>
            <Text style={[styles.histPay, { color: b.won ? WIN : 'rgba(245,238,255,0.5)' }]}>{b.won ? `+₹${payout.toFixed(2)}` : `-₹${stake.toFixed(2)}`}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#040111' },
  dim: { opacity: 0.4 },
  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 6, zIndex: 2 },
  headBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(30,8,52,0.9)', borderWidth: 1, borderColor: 'rgba(255,95,210,0.45)' },
  headBalance: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: 'rgba(30,8,52,0.92)', borderWidth: 1.2, borderColor: PINK },
  headBalanceText: { color: INK, fontWeight: '900', fontSize: 14 },
  body: { flex: 1 },
  recentRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, height: 30, marginTop: 4, marginBottom: 6 },
  recentEmpty: { color: 'rgba(245,238,255,0.4)', fontSize: 12, fontWeight: '700' },
  recentPill: { paddingHorizontal: 8, height: 26, borderRadius: 13, justifyContent: 'center', borderWidth: 1 },
  recentPillNew: { transform: [{ scale: 1.08 }] },
  recentText: { fontWeight: '900', fontSize: 12 },
  stage: { flex: 1, minHeight: 170, alignItems: 'center', justifyContent: 'center' },
  bigX: { fontWeight: '900', fontVariant: ['tabular-nums'], textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 10, textShadowOffset: { width: 0, height: 2 } },
  stageSub: { color: 'rgba(245,238,255,0.75)', fontWeight: '900', fontSize: 12, letterSpacing: 2, marginTop: 2 },
  gainPill: { position: 'absolute', top: -40, alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 4, borderRadius: 14, backgroundColor: 'rgba(3,40,26,0.9)', borderWidth: 1.5, borderColor: WIN },
  gainText: { color: WIN, fontWeight: '900', fontSize: 16 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 6 },
  statCard: { flex: 1, height: 60, borderRadius: 14, paddingHorizontal: 10, justifyContent: 'center', backgroundColor: 'rgba(20,6,40,0.9)', borderWidth: 1, borderColor: 'rgba(255,95,210,0.3)' },
  statLabel: { color: 'rgba(245,238,255,0.55)', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  statInputRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 4 },
  statInput: { flex: 1, color: INK, fontSize: 17, fontWeight: '900', padding: 0, minWidth: 0, textAlign: 'left' },
  statUnit: { color: PINK, fontWeight: '900', fontSize: 14 },
  stepBtn: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: PINK },
  quickRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  quick: { flex: 1, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(20,6,40,0.9)', borderWidth: 1, borderColor: 'rgba(255,95,210,0.3)' },
  quickOn: { backgroundColor: PINK, borderColor: '#FFD1F3' },
  quickText: { color: INK, fontWeight: '900', fontSize: 12 },
  quickTextOn: { color: '#2A0636' },
  betRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  betBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6, borderRadius: 16, backgroundColor: 'rgba(20,6,40,0.92)', borderWidth: 1.2, borderColor: 'rgba(255,95,210,0.45)' },
  betBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: PINK },
  betValueBox: { flex: 1, alignItems: 'center' },
  betLabel: { color: 'rgba(245,238,255,0.55)', fontSize: 9.5, fontWeight: '900', letterSpacing: 1.5 },
  betValue: { color: INK, fontSize: 18, fontWeight: '900' },
  chip: { width: 50, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(20,6,40,0.92)', borderWidth: 1.2, borderColor: 'rgba(255,95,210,0.45)' },
  chipText: { color: PINK, fontWeight: '900', fontSize: 16 },
  profitRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 6, marginTop: 8 },
  profitLabel: { color: 'rgba(245,238,255,0.5)', fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  profitValue: { color: WIN, fontSize: 15, fontWeight: '900' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  playBtn: { flex: 1, height: 64, borderRadius: 20, overflow: 'hidden', shadowColor: PINK, shadowOpacity: 0.6, shadowRadius: 14, elevation: 8 },
  playInner: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 20, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  playText: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', letterSpacing: 3, textShadowColor: 'rgba(60,0,80,0.6)', textShadowRadius: 6 },
  sideBtns: { gap: 8 },
  sideBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 84, height: 28, borderRadius: 10, justifyContent: 'center', backgroundColor: 'rgba(20,6,40,0.92)', borderWidth: 1.2, borderColor: 'rgba(255,95,210,0.45)' },
  sideBtnOn: { backgroundColor: PINK, borderColor: '#FFD1F3' },
  sideBtnText: { color: PINK, fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  autoPop: { position: 'absolute', padding: 12, borderRadius: 14, backgroundColor: '#1E0838', borderWidth: 1.5, borderColor: PINK },
  autoPopTitle: { color: PINK, fontWeight: '900', fontSize: 11, letterSpacing: 2, textAlign: 'center', marginBottom: 8 },
  autoGrid: { flexDirection: 'row', gap: 8 },
  autoOpt: { width: 46, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,95,210,0.12)', borderWidth: 1, borderColor: 'rgba(255,95,210,0.5)' },
  autoOptText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  sheet: { borderRadius: 18, backgroundColor: '#150530', borderWidth: 1.5, borderColor: PINK, overflow: 'hidden' },
  tabs: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,95,210,0.25)' },
  tab: { paddingHorizontal: 12, paddingVertical: 7, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  tabOn: { backgroundColor: 'rgba(255,95,210,0.12)', borderBottomWidth: 2, borderBottomColor: PINK },
  tabText: { color: 'rgba(245,238,255,0.55)', fontWeight: '900', fontSize: 12, letterSpacing: 1.2 },
  tabTextOn: { color: PINK },
  ruleHead: { color: PINK, fontWeight: '900', fontSize: 13, letterSpacing: 1, marginTop: 12, marginBottom: 6 },
  ruleLine: { color: 'rgba(245,238,255,0.85)', fontSize: 12.5, lineHeight: 19, fontWeight: '600', marginTop: 4 },
  exampleBox: { marginTop: 8, borderRadius: 12, padding: 10, backgroundColor: 'rgba(255,95,210,0.06)', borderWidth: 1, borderColor: 'rgba(255,95,210,0.2)', gap: 6 },
  exampleRow: { flexDirection: 'row', justifyContent: 'space-between' },
  exampleText: { color: INK, fontWeight: '800', fontSize: 13 },
  histRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,95,210,0.15)' },
  histChip: { minWidth: 70, paddingHorizontal: 6, height: 30, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  histChipText: { fontWeight: '900', fontSize: 14 },
  histMain: { color: INK, fontWeight: '800', fontSize: 13 },
  histSub: { color: 'rgba(245,238,255,0.5)', fontSize: 11, marginTop: 2 },
  histPay: { fontWeight: '900', fontSize: 14 },
  toast: { position: 'absolute', alignSelf: 'center', top: '45%', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.85)', borderWidth: 1, borderColor: VIOLET, maxWidth: '86%' },
  toastText: { color: INK, fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
