import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient as SvgLinearGradient, Polygon, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../api/client';
import { DiceBet, DiceConfig, fetchDiceConfig, fetchDiceHistory, rollDice } from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const CYAN = '#3DF2FF';
const TEAL = '#14B8C4';
const GOLD = '#FFD66B';
const WIN = '#2BF59A';
const LOSE = '#FF4D6A';
const INK = '#E9FBFF';
const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const DEFAULT_BET = 10;
const AUTO_OPTIONS = [10, 25, 50, 100];
const SOUND_KEY = 'novaplay:dice:sound';
const TOAST_MS = 1800;
const RECENT_MAX = 12;
/** Slider stops: win chance 2%–89% whichever way the roll goes. */
const SLIDE_MIN_CHANCE = 2;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function floor2(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}

function floor4(n: number): number {
  return Math.floor(n * 10000 + 1e-9) / 10000;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

// ---------- art ----------

/** Isometric die, three faces showing 1, 2 and 3 pips. */
function DieArt({ size, glow = CYAN }: { size: number; glow?: string }) {
  const top = '50,8 90,30 50,52 10,30';
  const left = '10,30 50,52 50,96 10,74';
  const right = '90,30 50,52 50,96 90,74';
  return (
    <Svg width={size} height={size} viewBox="0 0 100 104">
      <Defs>
        <SvgLinearGradient id="dTop" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#D8F6FF" />
        </SvgLinearGradient>
        <SvgLinearGradient id="dLeft" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#E6F3F8" />
          <Stop offset="1" stopColor="#9FC4D2" />
        </SvgLinearGradient>
        <SvgLinearGradient id="dRight" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#C4E4EF" />
          <Stop offset="1" stopColor="#6E98AA" />
        </SvgLinearGradient>
      </Defs>
      <Polygon points={top} fill="url(#dTop)" stroke={glow} strokeWidth={2} strokeLinejoin="round" />
      <Polygon points={left} fill="url(#dLeft)" stroke={glow} strokeWidth={2} strokeLinejoin="round" />
      <Polygon points={right} fill="url(#dRight)" stroke={glow} strokeWidth={2} strokeLinejoin="round" />
      {/* 1 on top */}
      <Circle cx={50} cy={30} r={6} fill="#E11D48" />
      {/* 2 on the left face */}
      <Circle cx={22} cy={46} r={4.6} fill="#0B1B2E" />
      <Circle cx={38} cy={78} r={4.6} fill="#0B1B2E" />
      {/* 3 on the right face */}
      <Circle cx={78} cy={46} r={4.6} fill="#0B1B2E" />
      <Circle cx={70} cy={62} r={4.6} fill="#0B1B2E" />
      <Circle cx={62} cy={78} r={4.6} fill="#0B1B2E" />
    </Svg>
  );
}

function Background({ w, h }: { w: number; h: number }) {
  const lines = [];
  // Perspective floor grid under the stage.
  const horizon = h * 0.34;
  for (let i = -10; i <= 10; i++) {
    lines.push(<Line key={`v${i}`} x1={w / 2 + i * 26} y1={horizon} x2={w / 2 + i * 150} y2={h} stroke={CYAN} strokeOpacity={0.07} strokeWidth={1} />);
  }
  for (let i = 1; i <= 14; i++) {
    const y = horizon + (h - horizon) * (i / 14) ** 1.8;
    lines.push(<Line key={`h${i}`} x1={0} y1={y} x2={w} y2={y} stroke={CYAN} strokeOpacity={0.06} strokeWidth={1} />);
  }
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id="dBg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#06182B" />
          <Stop offset="0.45" stopColor="#041020" />
          <Stop offset="1" stopColor="#020814" />
        </SvgLinearGradient>
        <RadialGradient id="dGlow" cx="50%" cy="30%" r="60%">
          <Stop offset="0" stopColor={TEAL} stopOpacity={0.32} />
          <Stop offset="1" stopColor={TEAL} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="dGlow2" cx="85%" cy="95%" r="50%">
          <Stop offset="0" stopColor="#6D28D9" stopOpacity={0.22} />
          <Stop offset="1" stopColor="#6D28D9" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill="url(#dBg)" />
      <Rect x={0} y={0} width={w} height={h} fill="url(#dGlow)" />
      <Rect x={0} y={0} width={w} height={h} fill="url(#dGlow2)" />
      {lines}
      {/* floating pips */}
      {[
        [0.1, 0.16, 3],
        [0.88, 0.12, 2.4],
        [0.18, 0.5, 2],
        [0.92, 0.46, 3],
        [0.06, 0.8, 2.2],
        [0.8, 0.76, 1.8],
      ].map(([x, y, r], i) => (
        <Circle key={i} cx={x * w} cy={y * h} r={r} fill={CYAN} opacity={0.35} />
      ))}
    </Svg>
  );
}

function Logo({ width }: { width: number }) {
  return (
    <Svg width={width} height={width * 0.2} viewBox="0 0 300 60">
      <Defs>
        <SvgLinearGradient id="dLogo" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.55" stopColor={CYAN} />
          <Stop offset="1" stopColor="#0E7490" />
        </SvgLinearGradient>
      </Defs>
      <Line x1={14} y1={30} x2={56} y2={30} stroke={CYAN} strokeOpacity={0.5} strokeWidth={1.5} />
      <Line x1={244} y1={30} x2={286} y2={30} stroke={CYAN} strokeOpacity={0.5} strokeWidth={1.5} />
      <Polygon points="60,30 66,24 72,30 66,36" fill={GOLD} />
      <Polygon points="228,30 234,24 240,30 234,36" fill={GOLD} />
      <SvgText x={150} y={45} fontSize={42} fontWeight="bold" fontFamily="serif" fill="url(#dLogo)" stroke="#022C3A" strokeWidth={1.2} textAnchor="middle" letterSpacing={8}>
        DICE
      </SvgText>
    </Svg>
  );
}

/** Home tile art: two tumbling dice on a teal glow. */
export function DiceTileArt({ size }: { size: number }) {
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size }} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="dtBg" cx="50%" cy="38%" r="70%">
            <Stop offset="0" stopColor="#0E4B63" />
            <Stop offset="1" stopColor="#031423" />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill="url(#dtBg)" />
        {Array.from({ length: 7 }, (_, i) => (
          <Line key={i} x1={50 + (i - 3) * 8} y1={58} x2={50 + (i - 3) * 40} y2={100} stroke={CYAN} strokeOpacity={0.14} strokeWidth={0.6} />
        ))}
        <Line x1={0} y1={72} x2={100} y2={72} stroke={CYAN} strokeOpacity={0.12} strokeWidth={0.6} />
        <Line x1={0} y1={86} x2={100} y2={86} stroke={CYAN} strokeOpacity={0.12} strokeWidth={0.6} />
      </Svg>
      <View style={{ position: 'absolute', left: size * 0.16, top: size * 0.12, transform: [{ rotate: '-14deg' }] }}>
        <DieArt size={size * 0.4} />
      </View>
      <View style={{ position: 'absolute', left: size * 0.46, top: size * 0.2, transform: [{ rotate: '12deg' }] }}>
        <DieArt size={size * 0.36} glow={GOLD} />
      </View>
    </View>
  );
}

// ---------- screen ----------

type Recent = { id: string; v: number; won: boolean };
type Last = { result: number; won: boolean; target: number; rollOver: boolean; payout: number; stake: number };

export default function DiceScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<DiceConfig | null>(null);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [target, setTarget] = useState(50);
  const [rollOver, setRollOver] = useState(true);
  const [busy, setBusy] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [autoLeft, setAutoLeft] = useState(0);
  const [autoOpen, setAutoOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [shownBalance, setShownBalance] = useState(coins);
  const [last, setLast] = useState<Last | null>(null);
  const [shownResult, setShownResult] = useState<number | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [trackW, setTrackW] = useState(0);
  const [multText, setMultText] = useState<string | null>(null);
  const [chanceText, setChanceText] = useState<string | null>(null);
  const [panel, setPanel] = useState<'bets' | 'rules' | null>(null);
  const [history, setHistory] = useState<DiceBet[] | null>(null);
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
  const stateRef = useRef({ bet, target, rollOver });
  stateRef.current = { bet, target, rollOver };
  const playersRef = useRef<{ tick: AudioPlayer; win: AudioPlayer; land: AudioPlayer } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackRef = useRef<View>(null);
  const trackX = useRef(0);
  const doRollRef = useRef<() => void>(() => {});

  const tumble = useRef(new Animated.Value(0)).current;
  const hop = useRef(new Animated.Value(0)).current;
  const markerFrac = useRef(new Animated.Value(0.5)).current;
  const markerIn = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const gain = useRef(new Animated.Value(0)).current;
  const resultAnim = useRef(new Animated.Value(0)).current;
  const tumbleLoop = useRef<Animated.CompositeAnimation | null>(null);

  const rtp = config?.rtpPercent ?? 90;
  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const maxPayout = config?.maxPayout ?? 10000;
  const minChance = config?.minChance ?? 0.01;
  const maxChance = config?.maxChance ?? 89;
  const betLevels = useMemo(() => BET_LEVELS.filter((b) => b >= minStake && b <= maxStake), [minStake, maxStake]);

  const chance = round2(rollOver ? 100 - target : target);
  const multiplier = floor4(rtp / chance);
  const winAmount = floor2(bet * multiplier);
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
    fetchDiceConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => {});
    fetchDiceHistory(RECENT_MAX)
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
    const id = resultAnim.addListener(({ value }) => setShownResult(round2(value)));
    return () => {
      mountedRef.current = false;
      resultAnim.removeListener(id);
      const players = playersRef.current;
      playersRef.current = null;
      if (players) Object.values(players).forEach((p) => p.remove());
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (autoTimer.current) clearTimeout(autoTimer.current);
    };
  }, [resultAnim]);

  useEffect(() => {
    if (!busyRef.current) setShownBalance(coins);
  }, [coins]);

  // ---------- slider ----------

  const clampTarget = useCallback(
    (t: number, over: boolean) => {
      const lo = over ? 100 - maxChance : SLIDE_MIN_CHANCE;
      const hi = over ? 100 - SLIDE_MIN_CHANCE : maxChance;
      return Math.min(hi, Math.max(lo, t));
    },
    [maxChance]
  );

  const measureTrack = useCallback(() => {
    trackRef.current?.measureInWindow((x) => {
      trackX.current = x;
    });
  }, []);

  const slideTo = useCallback(
    (pageX: number) => {
      if (busyRef.current || autoRef.current > 0 || trackW <= 0) return;
      const raw = ((pageX - trackX.current) / trackW) * 100;
      const next = clampTarget(Math.round(raw), stateRef.current.rollOver);
      if (next !== stateRef.current.target) {
        setTarget(next);
        play('tick');
      }
    },
    [clampTarget, play, trackW]
  );

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          measureTrack();
          slideTo(e.nativeEvent.pageX);
        },
        onPanResponderMove: (e) => slideTo(e.nativeEvent.pageX),
      }),
    [measureTrack, slideTo]
  );

  const flipDirection = () => {
    if (busy || autoLeft > 0) return;
    setRollOver((o) => !o);
    setTarget((t) => round2(100 - t));
  };

  const commitMultiplier = (text: string) => {
    setMultText(null);
    const m = Number(text.replace(',', '.'));
    if (!Number.isFinite(m) || m <= 0) return;
    const c = Math.min(maxChance, Math.max(minChance, round2(rtp / m)));
    setTarget(round2(rollOver ? 100 - c : c));
  };

  const commitChance = (text: string) => {
    setChanceText(null);
    const v = Number(text.replace(',', '.'));
    if (!Number.isFinite(v)) return;
    const c = Math.min(maxChance, Math.max(minChance, round2(v)));
    setTarget(round2(rollOver ? 100 - c : c));
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

  // ---------- roll ----------

  const doRoll = useCallback(async () => {
    if (busyRef.current) return;
    const { bet: stake, target: t, rollOver: over } = stateRef.current;
    const c = round2(over ? 100 - t : t);
    const m = floor4(rtp / c);
    if (stake > balanceRef.current) {
      showToast('Insufficient balance');
      setAutoLeft(0);
      return;
    }
    if (floor2(stake * m) > maxPayout) {
      showToast(`Max win per roll is ₹${maxPayout}. Lower the bet or the multiplier.`);
      setAutoLeft(0);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setShownBalance((b) => round2(b - stake));
    play('tick');
    const fast = turboRef.current;
    tumble.setValue(0);
    tumbleLoop.current = Animated.loop(Animated.timing(tumble, { toValue: 1, duration: fast ? 260 : 420, easing: Easing.linear, useNativeDriver: true }));
    tumbleLoop.current.start();
    Animated.sequence([
      Animated.timing(hop, { toValue: 1, duration: fast ? 90 : 150, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(hop, { toValue: 0, duration: fast ? 140 : 260, easing: Easing.bounce, useNativeDriver: true }),
    ]).start();

    let b: DiceBet;
    try {
      b = await rollDice(stake, t, over);
    } catch (err) {
      tumbleLoop.current?.stop();
      tumble.setValue(0);
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
    const dur = fast ? 170 : 420;
    tumbleLoop.current?.stop();
    Animated.timing(tumble, { toValue: 1, duration: dur, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    markerIn.setValue(1);
    await new Promise<void>((resolve) =>
      Animated.parallel([
        Animated.timing(markerFrac, { toValue: result / 100, duration: dur, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
        Animated.timing(resultAnim, { toValue: result, duration: dur, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      ]).start(() => resolve())
    );
    if (!mountedRef.current) return;
    setShownResult(result);
    setLast({ result, won: b.won, target: t, rollOver: over, payout, stake });
    setRecent((r) => [...r, { id: b.id, v: result, won: b.won }].slice(-RECENT_MAX));
    flash.setValue(0);
    Animated.timing(flash, { toValue: 1, duration: 700, useNativeDriver: false }).start();
    if (b.won) {
      play('win');
      setShownBalance((v) => round2(v + payout));
      gain.setValue(0);
      Animated.timing(gain, { toValue: 1, duration: 1100, useNativeDriver: true }).start();
    } else {
      play('land');
    }
    refreshWallet().catch(() => {});
    busyRef.current = false;
    setBusy(false);

    if (autoRef.current > 0) {
      const next = autoRef.current - 1;
      setAutoLeft(next);
      if (next > 0) autoTimer.current = setTimeout(() => mountedRef.current && doRollRef.current(), fast ? 160 : 520);
    }
  }, [flash, gain, hop, markerFrac, markerIn, maxPayout, play, refreshWallet, resultAnim, rtp, showToast, tumble]);
  doRollRef.current = doRoll;

  const startAuto = (n: number) => {
    setAutoOpen(false);
    setAutoLeft(n);
    autoRef.current = n;
    doRoll();
  };

  const stopAuto = () => {
    setAutoLeft(0);
    if (autoTimer.current) clearTimeout(autoTimer.current);
  };

  const openPanel = (p: 'bets' | 'rules') => {
    setPanel(p);
    if (p === 'bets') {
      setHistory(null);
      fetchDiceHistory(30)
        .then((h) => mountedRef.current && setHistory(h))
        .catch(() => mountedRef.current && setHistory([]));
    }
  };

  // ---------- layout ----------
  const contentW = Math.min(W - 24, 460);
  const headerH = insets.top + 50;
  const compact = H < 760;
  const dieSize = compact ? 64 : 96;
  const lastColor = last ? (last.won ? WIN : LOSE) : INK;
  const locked = busy || autoLeft > 0;
  const markerW = 58;

  return (
    <View style={styles.root}>
      <Background w={W} h={H} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 6, height: headerH }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtn} hitSlop={8} accessibilityLabel="Back">
          <MaterialCommunityIcons name="chevron-left" size={26} color={CYAN} />
        </Pressable>
        <View style={styles.headBalance}>
          <MaterialCommunityIcons name="wallet" size={16} color={CYAN} />
          <Text style={styles.headBalanceText} numberOfLines={1}>
            ₹{shownBalance.toFixed(2)}
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        <Pressable onPress={toggleSound} style={styles.headBtn} hitSlop={6} accessibilityLabel="Sound">
          <MaterialCommunityIcons name={soundOn ? 'volume-high' : 'volume-off'} size={20} color={CYAN} />
        </Pressable>
        <Pressable onPress={() => openPanel('bets')} style={styles.headBtn} hitSlop={6} accessibilityLabel="My bets">
          <MaterialCommunityIcons name="history" size={20} color={CYAN} />
        </Pressable>
        <Pressable onPress={() => openPanel('rules')} style={styles.headBtn} hitSlop={6} accessibilityLabel="Rules">
          <MaterialCommunityIcons name="information-variant" size={22} color={CYAN} />
        </Pressable>
      </View>

      <View style={[styles.body, { paddingTop: headerH + 2, paddingBottom: insets.bottom + 12, width: contentW, alignSelf: 'center' }]}>
        <View>
          <View style={{ alignItems: 'center' }} pointerEvents="none">
            <Logo width={Math.min(contentW * 0.72, 280)} />
          </View>

          {/* Recent results */}
          <View style={styles.recentRow}>
            {recent.length === 0 ? (
              <Text style={styles.recentEmpty}>Your recent rolls show here</Text>
            ) : (
              recent.slice(-(compact ? 6 : 7)).map((r, i, arr) => (
                <View key={r.id} style={[styles.recentPill, { backgroundColor: r.won ? 'rgba(43,245,154,0.16)' : 'rgba(255,255,255,0.06)', borderColor: r.won ? WIN : 'rgba(255,255,255,0.14)' }, i === arr.length - 1 && styles.recentPillNew]}>
                  <Text style={[styles.recentText, { color: r.won ? WIN : 'rgba(233,251,255,0.75)' }]}>{r.v.toFixed(2)}</Text>
                </View>
              ))
            )}
          </View>
        </View>

        {/* Stage */}
        <View style={styles.stage}>
          <LinearGradient colors={['rgba(20,70,95,0.55)', 'rgba(4,16,32,0.92)']} style={StyleSheet.absoluteFill} />
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              styles.stageFlash,
              { borderColor: lastColor, opacity: flash.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0.35] }) },
            ]}
          />
          <View style={styles.stageInner}>
            <Animated.View
              style={{
                transform: [
                  { translateY: hop.interpolate({ inputRange: [0, 1], outputRange: [0, -26] }) },
                  { rotate: tumble.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
                ],
              }}
            >
              <DieArt size={dieSize} glow={last && !busy ? lastColor : CYAN} />
            </Animated.View>
            <View style={{ marginLeft: 18, alignItems: 'flex-start' }}>
              <Text style={styles.stageLabel}>{busy ? 'ROLLING' : last ? 'RESULT' : 'READY'}</Text>
              <Text style={[styles.stageNumber, { color: busy ? INK : lastColor, fontSize: compact ? 46 : 62 }]}>{shownResult === null ? '--.--' : shownResult.toFixed(2)}</Text>
              <Text style={styles.stageSub}>
                {busy ? `Rolling ${rollOver ? 'over' : 'under'} ${target.toFixed(2)}` : last ? `${last.rollOver ? 'Over' : 'Under'} ${last.target.toFixed(2)} · ${last.won ? `WON ₹${last.payout.toFixed(2)}` : 'LOST'}` : `Roll ${rollOver ? 'over' : 'under'} ${target.toFixed(2)} to win`}
              </Text>
            </View>
          </View>
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
        </View>

        <View>
          {/* Slider */}
          <View style={styles.sliderBox}>
            <View style={styles.scaleRow}>
              {[0, 25, 50, 75, 100].map((n) => (
                <Text key={n} style={styles.scaleText}>
                  {n}
                </Text>
              ))}
            </View>
            <View
              ref={trackRef}
              onLayout={(e) => {
                setTrackW(e.nativeEvent.layout.width);
                measureTrack();
              }}
              style={styles.trackHit}
              {...pan.panHandlers}
            >
              <View style={styles.trackWell}>
                <View style={[styles.trackSeg, { width: `${target}%` }]}>
                  <LinearGradient colors={rollOver ? ['#FF7A8C', '#C8163A'] : ['#5CFFC0', '#0BA868']} style={StyleSheet.absoluteFill} />
                </View>
                <View style={[styles.trackSeg, { flex: 1 }]}>
                  <LinearGradient colors={rollOver ? ['#5CFFC0', '#0BA868'] : ['#FF7A8C', '#C8163A']} style={StyleSheet.absoluteFill} />
                </View>
              </View>
              {trackW > 0 && (
                <View pointerEvents="none" style={[styles.thumb, { left: (target / 100) * trackW - 17 }]}>
                  <LinearGradient colors={['#FFFFFF', '#BFEFFF', '#4FB6CF']} style={styles.thumbInner}>
                    <View style={styles.thumbGrip} />
                    <View style={styles.thumbGrip} />
                    <View style={styles.thumbGrip} />
                  </LinearGradient>
                </View>
              )}
              {trackW > 0 && last && (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.marker,
                    {
                      width: markerW,
                      opacity: markerIn,
                      transform: [{ translateX: markerFrac.interpolate({ inputRange: [0, 1], outputRange: [-markerW / 2, trackW - markerW / 2] }) }],
                    },
                  ]}
                >
                  <Svg width={markerW} height={46} viewBox="0 0 58 46">
                    <Polygon points="29,1 55,10 55,28 29,37 3,28 3,10" fill="#051526" stroke={busy ? CYAN : lastColor} strokeWidth={2.4} />
                    <Polygon points="23,37 35,37 29,45" fill={busy ? CYAN : lastColor} />
                    <SvgText x={29} y={24} fontSize={14} fontWeight="bold" fill={busy ? INK : lastColor} textAnchor="middle">
                      {(shownResult ?? 0).toFixed(2)}
                    </SvgText>
                  </Svg>
                </Animated.View>
              )}
            </View>
          </View>

          {/* Stats */}
          <View style={styles.stats}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>MULTIPLIER</Text>
              <View style={styles.statInputRow}>
                <TextInput
                  value={multText ?? multiplier.toFixed(4)}
                  onChangeText={setMultText}
                  onFocus={() => setMultText(multiplier.toFixed(4))}
                  onEndEditing={(e) => commitMultiplier(e.nativeEvent.text)}
                  onSubmitEditing={(e) => commitMultiplier(e.nativeEvent.text)}
                  onBlur={() => multText !== null && commitMultiplier(multText)}
                  keyboardType="decimal-pad"
                  editable={!locked}
                  style={styles.statInput}
                  selectTextOnFocus
                  accessibilityLabel="Multiplier"
                />
                <Text style={styles.statUnit}>x</Text>
              </View>
            </View>
            <Pressable onPress={flipDirection} style={[styles.statCard, styles.statToggle]} accessibilityLabel={rollOver ? 'Roll over, tap to switch' : 'Roll under, tap to switch'}>
              <Text style={styles.statLabel}>{rollOver ? 'ROLL OVER' : 'ROLL UNDER'}</Text>
              <View style={styles.statInputRow}>
                <Text style={styles.statValue}>{target.toFixed(2)}</Text>
                <MaterialCommunityIcons name="swap-horizontal" size={18} color={CYAN} style={{ marginLeft: 4 }} />
              </View>
            </Pressable>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>WIN CHANCE</Text>
              <View style={styles.statInputRow}>
                <TextInput
                  value={chanceText ?? chance.toFixed(2)}
                  onChangeText={setChanceText}
                  onFocus={() => setChanceText(chance.toFixed(2))}
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

          {/* Bet */}
          <View style={styles.betRow}>
            <View style={styles.betBox}>
              <Pressable onPress={() => changeBet(-1)} style={[styles.betBtn, locked && styles.dim]} hitSlop={6} accessibilityLabel="Lower bet">
                <MaterialCommunityIcons name="minus" size={20} color="#03202A" />
              </Pressable>
              <View style={styles.betValueBox}>
                <Text style={styles.betLabel}>BET</Text>
                <Text style={styles.betValue}>₹{bet}</Text>
              </View>
              <Pressable onPress={() => changeBet(1)} style={[styles.betBtn, locked && styles.dim]} hitSlop={6} accessibilityLabel="Raise bet">
                <MaterialCommunityIcons name="plus" size={20} color="#03202A" />
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

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable
              onPress={() => {
                if (autoLeft > 0) stopAuto();
                else doRoll();
              }}
              disabled={busy && autoLeft === 0}
              style={({ pressed }) => [styles.rollBtn, pressed && { transform: [{ scale: 0.97 }] }]}
              accessibilityLabel={autoLeft > 0 ? 'Stop auto roll' : 'Roll'}
            >
              <LinearGradient colors={autoLeft > 0 ? ['#FF7A8A', '#B3102F'] : busy ? ['#7FE9F2', '#1B8FA0'] : ['#9BFFF9', '#22D3EE', '#0E7490']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.rollInner}>
                {autoLeft > 0 ? (
                  <Text style={styles.rollText}>STOP · {autoLeft}</Text>
                ) : (
                  <>
                    <MaterialCommunityIcons name="dice-multiple" size={24} color="#022C3A" />
                    <Text style={styles.rollText}>{busy ? 'ROLLING' : 'ROLL'}</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
            <View style={styles.sideBtns}>
              <Pressable onPress={() => (autoLeft > 0 ? stopAuto() : setAutoOpen((o) => !o))} style={[styles.sideBtn, autoLeft > 0 && styles.sideBtnOn]} accessibilityLabel="Auto roll">
                <MaterialCommunityIcons name="autorenew" size={16} color={autoLeft > 0 ? '#022C3A' : CYAN} />
                <Text style={[styles.sideBtnText, autoLeft > 0 && { color: '#022C3A' }]}>AUTO</Text>
              </Pressable>
              <Pressable onPress={() => setTurbo((t) => !t)} style={[styles.sideBtn, turbo && styles.sideBtnOn]} accessibilityLabel="Turbo">
                <MaterialCommunityIcons name="lightning-bolt" size={16} color={turbo ? '#022C3A' : CYAN} />
                <Text style={[styles.sideBtnText, turbo && { color: '#022C3A' }]}>TURBO</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      {autoOpen && (
        <View style={[styles.autoPop, { bottom: insets.bottom + 92, right: (W - contentW) / 2 }]}>
          <Text style={styles.autoPopTitle}>AUTO ROLL</Text>
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
                <MaterialCommunityIcons name="close" size={20} color={CYAN} />
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

function Rules({ config }: { config: DiceConfig | null }) {
  const rtp = config?.rtpPercent ?? 90;
  return (
    <View>
      <Text style={styles.ruleHead}>How to play</Text>
      <Text style={styles.ruleLine}>Every roll lands on a number from 0.00 to 100.00. Drag the slider to set your target, then pick ROLL OVER (win if the roll is above the target) or ROLL UNDER (win if it is below). Tap the middle box to switch.</Text>
      <Text style={styles.ruleHead}>Win chance & multiplier</Text>
      <Text style={styles.ruleLine}>The green part of the bar is your win chance. The smaller it is, the bigger the multiplier: multiplier = {rtp} ÷ win chance. You can also type a multiplier or a win chance directly.</Text>
      <View style={styles.exampleBox}>
        {[
          [50, floor4(rtp / 50)],
          [25, floor4(rtp / 25)],
          [10, floor4(rtp / 10)],
          [1, floor4(rtp / 1)],
        ].map(([c, m]) => (
          <View key={c} style={styles.exampleRow}>
            <Text style={styles.exampleText}>{c}% chance</Text>
            <Text style={[styles.exampleText, { color: CYAN }]}>{m}x</Text>
          </View>
        ))}
      </View>
      <Text style={styles.ruleHead}>Game info</Text>
      <Text style={styles.ruleLine}>
        Return to player {rtp}%. Win chance {config?.minChance ?? 0.01}% – {config?.maxChance ?? 89}%. Bet ₹{config?.minStake ?? 1} – ₹{config?.maxStake ?? 500}. Max win per roll ₹{config?.maxPayout ?? 10000}.
      </Text>
      <Text style={styles.ruleLine}>Every roll is drawn from your provably-fair seeds (Settings → Provably Fair).</Text>
    </View>
  );
}

function History({ bets }: { bets: DiceBet[] | null }) {
  if (bets === null) return <Text style={styles.ruleLine}>Loading…</Text>;
  if (bets.length === 0) return <Text style={styles.ruleLine}>No rolls yet.</Text>;
  return (
    <View style={{ gap: 8 }}>
      {bets.map((b) => {
        const payout = Number(b.payout);
        const stake = Number(b.stake);
        return (
          <View key={b.id} style={styles.histRow}>
            <View style={[styles.histChip, { borderColor: b.won ? WIN : LOSE }]}>
              <Text style={[styles.histChipText, { color: b.won ? WIN : LOSE }]}>{Number(b.result).toFixed(2)}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.histMain}>
                {b.rollOver ? 'Over' : 'Under'} {Number(b.target).toFixed(2)} · {Number(b.multiplier).toFixed(4)}x
              </Text>
              <Text style={styles.histSub}>
                ₹{stake.toFixed(2)} · {new Date(b.createdAt).toLocaleString()}
              </Text>
            </View>
            <Text style={[styles.histPay, { color: b.won ? WIN : 'rgba(233,251,255,0.5)' }]}>{b.won ? `+₹${payout.toFixed(2)}` : `-₹${stake.toFixed(2)}`}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#020814' },
  dim: { opacity: 0.4 },
  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 6, zIndex: 2 },
  headBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(4,24,40,0.9)', borderWidth: 1, borderColor: 'rgba(61,242,255,0.45)' },
  headBalance: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: 'rgba(4,24,40,0.92)', borderWidth: 1.2, borderColor: CYAN },
  headBalanceText: { color: INK, fontWeight: '900', fontSize: 14 },
  body: { flex: 1, justifyContent: 'space-between' },
  recentRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, height: 30, marginTop: 4, marginBottom: 8 },
  recentEmpty: { color: 'rgba(233,251,255,0.4)', fontSize: 12, fontWeight: '700' },
  recentPill: { paddingHorizontal: 8, height: 26, borderRadius: 13, justifyContent: 'center', borderWidth: 1 },
  recentPillNew: { transform: [{ scale: 1.08 }] },
  recentText: { fontWeight: '900', fontSize: 12 },
  stage: { flex: 1, minHeight: 120, maxHeight: 280, marginVertical: 8, borderRadius: 22, overflow: 'hidden', borderWidth: 1.2, borderColor: 'rgba(61,242,255,0.35)', justifyContent: 'center' },
  stageFlash: { borderRadius: 22, borderWidth: 2.5 },
  stageInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  stageLabel: { color: 'rgba(233,251,255,0.55)', fontWeight: '900', fontSize: 11, letterSpacing: 3 },
  stageNumber: { fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: 1, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 2 } },
  stageSub: { color: 'rgba(233,251,255,0.8)', fontWeight: '800', fontSize: 12.5 },
  gainPill: { position: 'absolute', top: 10, alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 4, borderRadius: 14, backgroundColor: 'rgba(3,40,26,0.9)', borderWidth: 1.5, borderColor: WIN },
  gainText: { color: WIN, fontWeight: '900', fontSize: 16 },
  sliderBox: { paddingHorizontal: 14, paddingTop: 50, paddingBottom: 12, borderRadius: 20, backgroundColor: 'rgba(3,14,28,0.85)', borderWidth: 1, borderColor: 'rgba(61,242,255,0.22)' },
  scaleRow: { position: 'absolute', top: 8, left: 14, right: 14, flexDirection: 'row', justifyContent: 'space-between' },
  scaleText: { color: 'rgba(233,251,255,0.45)', fontSize: 11, fontWeight: '800', width: 26, textAlign: 'center', marginHorizontal: -13 },
  trackHit: { height: 34, justifyContent: 'center' },
  trackWell: { height: 14, borderRadius: 7, flexDirection: 'row', overflow: 'hidden', borderWidth: 2, borderColor: '#0B2338', backgroundColor: '#0B2338' },
  trackSeg: { height: '100%', overflow: 'hidden' },
  thumb: { position: 'absolute', width: 34, height: 34, borderRadius: 9, shadowColor: CYAN, shadowOpacity: 0.8, shadowRadius: 10, elevation: 6 },
  thumbInner: { flex: 1, borderRadius: 9, borderWidth: 1.5, borderColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  thumbGrip: { width: 2.5, height: 14, borderRadius: 2, backgroundColor: 'rgba(6,40,56,0.55)' },
  marker: { position: 'absolute', left: 0, top: -48, alignItems: 'center' },
  stats: { flexDirection: 'row', gap: 8, marginTop: 10 },
  statCard: { flex: 1, height: 58, borderRadius: 14, paddingHorizontal: 10, justifyContent: 'center', backgroundColor: 'rgba(3,14,28,0.9)', borderWidth: 1, borderColor: 'rgba(61,242,255,0.25)' },
  statToggle: { borderColor: CYAN, backgroundColor: 'rgba(8,48,66,0.9)' },
  statLabel: { color: 'rgba(233,251,255,0.55)', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  statInputRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  statInput: { flex: 1, color: INK, fontSize: 17, fontWeight: '900', padding: 0, minWidth: 0 },
  statValue: { color: INK, fontSize: 17, fontWeight: '900' },
  statUnit: { color: CYAN, fontWeight: '900', fontSize: 14, marginLeft: 2 },
  betRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  betBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6, borderRadius: 16, backgroundColor: 'rgba(3,14,28,0.92)', borderWidth: 1.2, borderColor: 'rgba(61,242,255,0.45)' },
  betBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: CYAN },
  betValueBox: { flex: 1, alignItems: 'center' },
  betLabel: { color: 'rgba(233,251,255,0.55)', fontSize: 9.5, fontWeight: '900', letterSpacing: 1.5 },
  betValue: { color: INK, fontSize: 18, fontWeight: '900' },
  chip: { width: 50, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(3,14,28,0.92)', borderWidth: 1.2, borderColor: 'rgba(61,242,255,0.45)' },
  chipText: { color: CYAN, fontWeight: '900', fontSize: 16 },
  profitRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 6, marginTop: 8 },
  profitLabel: { color: 'rgba(233,251,255,0.5)', fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  profitValue: { color: WIN, fontSize: 15, fontWeight: '900' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  rollBtn: { flex: 1, height: 64, borderRadius: 20, overflow: 'hidden', shadowColor: CYAN, shadowOpacity: 0.6, shadowRadius: 14, elevation: 8 },
  rollInner: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 20, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  rollText: { color: '#022C3A', fontSize: 22, fontWeight: '900', letterSpacing: 3 },
  sideBtns: { gap: 8 },
  sideBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 84, height: 28, borderRadius: 10, justifyContent: 'center', backgroundColor: 'rgba(3,14,28,0.92)', borderWidth: 1.2, borderColor: 'rgba(61,242,255,0.45)' },
  sideBtnOn: { backgroundColor: CYAN, borderColor: '#CFFBFF' },
  sideBtnText: { color: CYAN, fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  autoPop: { position: 'absolute', padding: 12, borderRadius: 14, backgroundColor: '#05223A', borderWidth: 1.5, borderColor: CYAN },
  autoPopTitle: { color: CYAN, fontWeight: '900', fontSize: 11, letterSpacing: 2, textAlign: 'center', marginBottom: 8 },
  autoGrid: { flexDirection: 'row', gap: 8 },
  autoOpt: { width: 46, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(61,242,255,0.12)', borderWidth: 1, borderColor: 'rgba(61,242,255,0.5)' },
  autoOptText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  sheet: { borderRadius: 18, backgroundColor: '#04182B', borderWidth: 1.5, borderColor: CYAN, overflow: 'hidden' },
  tabs: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(61,242,255,0.25)' },
  tab: { paddingHorizontal: 12, paddingVertical: 7, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  tabOn: { backgroundColor: 'rgba(61,242,255,0.12)', borderBottomWidth: 2, borderBottomColor: CYAN },
  tabText: { color: 'rgba(233,251,255,0.55)', fontWeight: '900', fontSize: 12, letterSpacing: 1.2 },
  tabTextOn: { color: CYAN },
  ruleHead: { color: CYAN, fontWeight: '900', fontSize: 13, letterSpacing: 1, marginTop: 12, marginBottom: 6 },
  ruleLine: { color: 'rgba(233,251,255,0.85)', fontSize: 12.5, lineHeight: 19, fontWeight: '600', marginTop: 4 },
  exampleBox: { marginTop: 8, borderRadius: 12, padding: 10, backgroundColor: 'rgba(61,242,255,0.06)', borderWidth: 1, borderColor: 'rgba(61,242,255,0.2)', gap: 6 },
  exampleRow: { flexDirection: 'row', justifyContent: 'space-between' },
  exampleText: { color: INK, fontWeight: '800', fontSize: 13 },
  histRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(61,242,255,0.15)' },
  histChip: { minWidth: 62, paddingHorizontal: 6, height: 30, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  histChipText: { fontWeight: '900', fontSize: 14 },
  histMain: { color: INK, fontWeight: '800', fontSize: 13 },
  histSub: { color: 'rgba(233,251,255,0.5)', fontSize: 11, marginTop: 2 },
  histPay: { fontWeight: '900', fontSize: 14 },
  toast: { position: 'absolute', alignSelf: 'center', top: '45%', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.85)', borderWidth: 1, borderColor: TEAL, maxWidth: '86%' },
  toastText: { color: INK, fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
