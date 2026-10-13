import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient as SvgLinearGradient, Path, Polygon, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../api/client';
import { KenoBet, KenoConfig, KenoRisk, fetchKenoConfig, fetchKenoHistory, playKeno } from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const AMBER = '#FFB547';
const GOLD = '#FFD66B';
const HIT = '#2EF2A0';
const INK = '#F1F4FF';
const BOARD = 40;
const COLS = 8;
const MAX_PICKS = 10;
const RISKS: KenoRisk[] = ['CLASSIC', 'LOW', 'MEDIUM', 'HIGH'];
const RISK_LABEL: Record<KenoRisk, string> = { CLASSIC: 'Classic', LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' };
const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const DEFAULT_BET = 10;
const AUTO_OPTIONS = [10, 25, 50, 100];
const SOUND_KEY = 'novaplay:keno:sound';
const TOAST_MS = 1800;

/** Same tables as the server, used until the config arrives. */
const FALLBACK_TABLES: Record<KenoRisk, number[][]> = {
  CLASSIC: [[0, 3.6], [0, 1.72, 4.08], [0, 0.9, 2.81, 9.45], [0, 0.72, 1.63, 4.54, 20.4], [0, 0.22, 1.27, 3.72, 15, 32.7], [0, 0, 0.9, 3.34, 6.36, 15, 36.3], [0, 0, 0.42, 2.72, 4.09, 12.7, 28.1, 54.5], [0, 0, 0, 1.99, 3.63, 11.8, 19.9, 49.9, 63.6], [0, 0, 0, 1.4, 2.72, 7.27, 13.6, 40, 54.5, 77.2], [0, 0, 0, 1.27, 2.04, 4.08, 7.26, 15.4, 45.4, 72.6, 90.8]],
  LOW: [[0.63, 1.68], [0, 1.82, 3.45], [0, 1, 1.25, 23.6], [0, 0, 2, 7.18, 81.8], [0, 0, 1.36, 3.82, 11.8, 272], [0, 0, 0.99, 1.81, 5.63, 90.9, 636], [0, 0, 1, 1.45, 3.18, 13.6, 204, 636], [0, 0, 0.99, 1.36, 1.81, 4.99, 35.4, 90.9, 727], [0, 0, 0.99, 1.18, 1.54, 2.27, 6.81, 45.4, 227, 908], [0, 0, 1, 1.09, 1.18, 1.64, 3.18, 11.8, 45.5, 227, 911]],
  MEDIUM: [[0.36, 2.5], [0, 1.64, 4.65], [0, 0, 2.54, 45.4], [0, 0, 1.54, 9.11, 91.1], [0, 0, 1.27, 3.63, 12.7, 354], [0, 0, 0, 2.73, 8.19, 163, 646], [0, 0, 0, 1.81, 6.36, 27.2, 363, 727], [0, 0, 0, 1.81, 3.63, 10, 60.9, 363, 818], [0, 0, 0, 1.81, 2.27, 4.54, 13.6, 90.9, 454, 909], [0, 0, 0, 1.45, 1.81, 3.63, 6.36, 23.6, 90.9, 454, 909]],
  HIGH: [[0, 3.6], [0, 0, 15.6], [0, 0, 0, 74.1], [0, 0, 0, 9.09, 235], [0, 0, 0, 4.09, 43.6, 409], [0, 0, 0, 0, 10, 318, 645], [0, 0, 0, 0, 6.36, 81.8, 363, 727], [0, 0, 0, 0, 4.54, 18.1, 245, 545, 818], [0, 0, 0, 0, 3.63, 10, 50.9, 454, 727, 909], [0, 0, 0, 0, 3.18, 7.27, 11.8, 57.2, 454, 727, 909]],
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** Chance of `hits` hits with `picks` numbers picked. */
function hitChance(picks: number, hits: number): number {
  return (choose(10, hits) * choose(BOARD - 10, picks - hits)) / choose(BOARD, picks);
}

function fmtMult(m: number): string {
  return m >= 100 ? String(Math.floor(m)) : m >= 10 ? m.toFixed(1).replace(/\.0$/, '') : String(round2(m));
}

/** Shorter form for the narrow payout bar cells. */
function fmtMultShort(m: number): string {
  return m >= 10 ? String(Math.floor(m)) : m >= 1 ? String(Math.floor(m * 10) / 10) : String(round2(m));
}

// ---------- art ----------

function Background({ w, h }: { w: number; h: number }) {
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id="kBg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#0B1640" />
          <Stop offset="0.5" stopColor="#070E2B" />
          <Stop offset="1" stopColor="#03061A" />
        </SvgLinearGradient>
        <RadialGradient id="kGlow" cx="50%" cy="38%" r="60%">
          <Stop offset="0" stopColor={AMBER} stopOpacity={0.18} />
          <Stop offset="1" stopColor={AMBER} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="kGlow2" cx="10%" cy="90%" r="45%">
          <Stop offset="0" stopColor="#2563EB" stopOpacity={0.25} />
          <Stop offset="1" stopColor="#2563EB" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill="url(#kBg)" />
      <Rect x={0} y={0} width={w} height={h} fill="url(#kGlow)" />
      <Rect x={0} y={0} width={w} height={h} fill="url(#kGlow2)" />
      {/* Stage lights fanning down from the top */}
      {Array.from({ length: 9 }, (_, i) => (
        <Line key={i} x1={w / 2} y1={-40} x2={(i / 8) * w * 1.6 - w * 0.3} y2={h * 0.55} stroke={AMBER} strokeOpacity={0.05} strokeWidth={18} />
      ))}
      {Array.from({ length: 24 }, (_, i) => {
        const a = Math.sin(i * 12.9898) * 43758.5453;
        const b = Math.sin(i * 78.233) * 12543.123;
        return <Circle key={`s${i}`} cx={(a - Math.floor(a)) * w} cy={(b - Math.floor(b)) * h} r={1 + (i % 3) * 0.5} fill={GOLD} opacity={0.18} />;
      })}
    </Svg>
  );
}

function Logo({ width }: { width: number }) {
  return (
    <Svg width={width} height={width * 0.2} viewBox="0 0 300 60">
      <Defs>
        <SvgLinearGradient id="kLogo" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFF6D6" />
          <Stop offset="0.5" stopColor={AMBER} />
          <Stop offset="1" stopColor="#B45309" />
        </SvgLinearGradient>
      </Defs>
      <Line x1={6} y1={30} x2={36} y2={30} stroke={AMBER} strokeOpacity={0.55} strokeWidth={1.5} />
      <Line x1={264} y1={30} x2={294} y2={30} stroke={AMBER} strokeOpacity={0.55} strokeWidth={1.5} />
      <Circle cx={46} cy={30} r={6} fill="#2563EB" stroke={GOLD} strokeWidth={1.5} />
      <Circle cx={254} cy={30} r={6} fill="#2563EB" stroke={GOLD} strokeWidth={1.5} />
      <SvgText x={150} y={45} fontSize={42} fontWeight="bold" fontFamily="serif" fill="url(#kLogo)" stroke="#3A1A00" strokeWidth={1.2} textAnchor="middle" letterSpacing={9}>
        KENO
      </SvgText>
    </Svg>
  );
}

/** A lottery ball with its number. */
const Ball = memo(function Ball({ n, size, hit }: { n: number; size: number; hit: boolean }) {
  const id = `kb${hit ? 'h' : 'm'}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Defs>
        <RadialGradient id={id} cx="35%" cy="30%" r="70%">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.55" stopColor={hit ? '#6BFFC6' : '#CBD5FF'} />
          <Stop offset="1" stopColor={hit ? '#079E63' : '#3B4A8C'} />
        </RadialGradient>
      </Defs>
      <Circle cx={20} cy={20} r={19} fill={`url(#${id})`} stroke={hit ? '#B8FFE2' : '#E0E7FF'} strokeWidth={1} />
      <Circle cx={20} cy={20} r={11} fill="#FFFFFF" opacity={0.92} />
      <SvgText x={20} y={24.5} fontSize={12.5} fontWeight="bold" fill={hit ? '#05603C' : '#1E2A5E'} textAnchor="middle">
        {n}
      </SvgText>
    </Svg>
  );
});

function Gem({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Defs>
        <SvgLinearGradient id="kGem" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#D1FFF0" />
          <Stop offset="0.5" stopColor={HIT} />
          <Stop offset="1" stopColor="#047857" />
        </SvgLinearGradient>
      </Defs>
      <Polygon points="20,4 34,14 28,36 12,36 6,14" fill="url(#kGem)" stroke="#ECFFF7" strokeWidth={1.2} />
      <Path d="M6 14 L34 14 M20 4 L14 14 L20 36 L26 14 Z" fill="none" stroke="#FFFFFF" strokeOpacity={0.55} strokeWidth={0.9} />
    </Svg>
  );
}

/** Home tile art: a few board tiles with drawn balls and a hit gem. */
export function KenoTileArt({ size }: { size: number }) {
  const t = size * 0.17;
  const cells = [
    [0, 0, 'pick'],
    [1, 0, 'idle'],
    [2, 0, 'hit'],
    [3, 0, 'idle'],
    [0, 1, 'idle'],
    [1, 1, 'hit'],
    [2, 1, 'pick'],
    [3, 1, 'drawn'],
  ] as const;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size }} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="ktBg" cx="50%" cy="35%" r="75%">
            <Stop offset="0" stopColor="#1D2F7A" />
            <Stop offset="1" stopColor="#050A24" />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill="url(#ktBg)" />
      </Svg>
      <View style={{ position: 'absolute', left: (size - 4 * t - 3 * 4) / 2, top: size * 0.12, width: 4 * t + 12, flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
        {cells.map(([c, r, kind], i) => (
          <View key={i} style={[styles.tileBase, { width: t, height: t, borderRadius: t * 0.22 }, kind === 'pick' && [styles.tilePicked, { backgroundColor: AMBER }], kind === 'hit' && [styles.tileHit, { backgroundColor: '#0B4D37' }], kind === 'drawn' && styles.tileDrawn]}>
            {kind === 'hit' ? <Gem size={t * 0.72} /> : <Text style={[styles.tileText, { fontSize: t * 0.42 }, kind === 'pick' && { color: '#2A1400' }]}>{r * 4 + c + 7}</Text>}
          </View>
        ))}
      </View>
      <View style={{ position: 'absolute', left: size * 0.62, top: size * 0.44 }}>
        <Ball n={21} size={size * 0.2} hit />
      </View>
    </View>
  );
}

// ---------- screen ----------

type Round = { drawn: number[]; shown: number; hits: number; multiplier: number; payout: number; done: boolean };

export default function KenoScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<KenoConfig | null>(null);
  const [picks, setPicks] = useState<number[]>([]);
  const [risk, setRisk] = useState<KenoRisk>('CLASSIC');
  const [bet, setBet] = useState(DEFAULT_BET);
  const [round, setRound] = useState<Round | null>(null);
  const [busy, setBusy] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [autoLeft, setAutoLeft] = useState(0);
  const [autoOpen, setAutoOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [shownBalance, setShownBalance] = useState(coins);
  const [panel, setPanel] = useState<'bets' | 'pay' | null>(null);
  const [history, setHistory] = useState<KenoBet[] | null>(null);
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
  const stateRef = useRef({ picks, risk, bet });
  stateRef.current = { picks, risk, bet };
  const playersRef = useRef<{ tick: AudioPlayer; win: AudioPlayer; land: AudioPlayer } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doBetRef = useRef<() => void>(() => {});
  const tileAnims = useRef(Array.from({ length: BOARD + 1 }, () => new Animated.Value(1))).current;
  const ballAnims = useRef(Array.from({ length: 10 }, () => new Animated.Value(0))).current;
  const winAnim = useRef(new Animated.Value(0)).current;

  const tables = config?.tables ?? FALLBACK_TABLES;
  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const maxPayout = config?.maxPayout ?? 10000;
  const betLevels = useMemo(() => BET_LEVELS.filter((b) => b >= minStake && b <= maxStake), [minStake, maxStake]);
  const row = picks.length > 0 ? tables[risk][picks.length - 1] : null;
  const locked = busy || autoLeft > 0;

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
    fetchKenoConfig()
      .then((c) => mountedRef.current && setConfig(c))
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
      if (autoTimer.current) clearTimeout(autoTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!busyRef.current) setShownBalance(coins);
  }, [coins]);

  const togglePick = (n: number) => {
    if (locked) return;
    setRound(null);
    setPicks((p) => {
      if (p.includes(n)) return p.filter((x) => x !== n);
      if (p.length >= MAX_PICKS) {
        showToast(`You can pick up to ${MAX_PICKS} numbers`);
        return p;
      }
      play('tick');
      return [...p, n];
    });
    tileAnims[n].setValue(0.82);
    Animated.spring(tileAnims[n], { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }).start();
  };

  const autoPick = () => {
    if (locked) return;
    setRound(null);
    const count = picks.length > 0 ? picks.length : MAX_PICKS;
    const pool = Array.from({ length: BOARD }, (_, i) => i + 1);
    const next: number[] = [];
    while (next.length < count) next.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    setPicks(next);
    play('tick');
    next.forEach((n, i) => {
      tileAnims[n].setValue(0.6);
      Animated.spring(tileAnims[n], { toValue: 1, friction: 4, tension: 120, delay: i * 30, useNativeDriver: true }).start();
    });
  };

  const clearPicks = () => {
    if (locked) return;
    setRound(null);
    setPicks([]);
  };

  const changeBet = (dir: -1 | 1) => {
    if (locked) return;
    const i = betLevels.indexOf(bet);
    const next = i < 0 ? betLevels.find((b) => (dir > 0 ? b > bet : b >= bet)) ?? bet : betLevels[Math.min(betLevels.length - 1, Math.max(0, i + dir))];
    setBet(next);
  };

  const scaleBet = (k: 0.5 | 2) => {
    if (locked) return;
    setBet((b) => Math.min(maxStake, Math.max(minStake, Math.round(b * k))));
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    AsyncStorage.setItem(SOUND_KEY, next ? 'on' : 'off').catch(() => {});
  };

  const doBet = useCallback(async () => {
    if (busyRef.current) return;
    const { picks: chosen, risk: r, bet: stake } = stateRef.current;
    if (chosen.length === 0) {
      showToast('Pick 1 to 10 numbers first');
      setAutoLeft(0);
      return;
    }
    if (stake > balanceRef.current) {
      showToast('Insufficient balance');
      setAutoLeft(0);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setShownBalance((b) => round2(b - stake));
    setRound(null);
    ballAnims.forEach((a) => a.setValue(0));
    winAnim.setValue(0);

    let b: KenoBet;
    try {
      b = await playKeno(stake, chosen, r);
    } catch (err) {
      setShownBalance((v) => round2(v + stake));
      setAutoLeft(0);
      showToast(errorMessage(err));
      busyRef.current = false;
      setBusy(false);
      return;
    }
    if (!mountedRef.current) return;

    // Reveal the draw one ball at a time.
    const fast = turboRef.current;
    const step = fast ? 70 : 190;
    let hits = 0;
    for (let i = 0; i < b.drawn.length; i++) {
      const n = b.drawn[i];
      const hit = chosen.includes(n);
      if (hit) hits++;
      setRound({ drawn: b.drawn, shown: i + 1, hits, multiplier: 0, payout: 0, done: false });
      tileAnims[n].setValue(hit ? 0.5 : 0.75);
      Animated.spring(tileAnims[n], { toValue: 1, friction: hit ? 3.5 : 5, tension: 150, useNativeDriver: true }).start();
      Animated.timing(ballAnims[i], { toValue: 1, duration: fast ? 120 : 260, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }).start();
      play(hit ? 'land' : 'tick');
      await new Promise<void>((resolve) => setTimeout(resolve, step));
      if (!mountedRef.current) return;
    }
    const payout = Number(b.payout);
    setRound({ drawn: b.drawn, shown: b.drawn.length, hits: b.hits, multiplier: Number(b.multiplier), payout, done: true });
    if (payout > 0) {
      setShownBalance((v) => round2(v + payout));
      if (payout > stake) play('win');
      // The win card shows briefly, then fades so the board stays readable.
      Animated.sequence([
        Animated.spring(winAnim, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
        Animated.delay(fast ? 700 : 1500),
        Animated.timing(winAnim, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]).start();
    }
    refreshWallet().catch(() => {});
    busyRef.current = false;
    setBusy(false);

    if (autoRef.current > 0) {
      const next = autoRef.current - 1;
      setAutoLeft(next);
      if (next > 0) autoTimer.current = setTimeout(() => mountedRef.current && doBetRef.current(), fast ? 350 : payout > stake ? 1300 : 700);
    }
  }, [ballAnims, play, refreshWallet, showToast, tileAnims, winAnim]);
  doBetRef.current = doBet;

  const startAuto = (n: number) => {
    setAutoOpen(false);
    if (stateRef.current.picks.length === 0) {
      showToast('Pick 1 to 10 numbers first');
      return;
    }
    setAutoLeft(n);
    autoRef.current = n;
    doBet();
  };

  const stopAuto = () => {
    setAutoLeft(0);
    if (autoTimer.current) clearTimeout(autoTimer.current);
  };

  const openPanel = (p: 'bets' | 'pay') => {
    setPanel(p);
    if (p === 'bets') {
      setHistory(null);
      fetchKenoHistory(30)
        .then((h) => mountedRef.current && setHistory(h))
        .catch(() => mountedRef.current && setHistory([]));
    }
  };

  // ---------- layout ----------
  const contentW = Math.min(W - 24, 460);
  const headerH = insets.top + 50;
  const compact = H < 760;
  const gap = 5;
  const tile = Math.floor(Math.min((contentW - gap * (COLS - 1) - 16) / COLS, (H * (compact ? 0.3 : 0.33)) / 5));
  const boardW = tile * COLS + gap * (COLS - 1);
  const ball = Math.min(30, (contentW - 9 * 4) / 10);
  const drawnShown = round ? round.drawn.slice(0, round.shown) : [];
  const drawnSet = new Set(drawnShown);
  const maxWin = row ? Math.min(Math.floor(bet * Math.max(...row) * 100) / 100, maxPayout) : 0;
  const payFont = row ? Math.max(8, Math.min(10.5, (boardW + 16 - 3 * (row.length - 1)) / row.length / 3.6)) : 10.5;

  return (
    <View style={styles.root}>
      <Background w={W} h={H} />

      <View style={[styles.header, { paddingTop: insets.top + 6, height: headerH }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtn} hitSlop={8} accessibilityLabel="Back">
          <MaterialCommunityIcons name="chevron-left" size={26} color={AMBER} />
        </Pressable>
        <View style={styles.headBalance}>
          <MaterialCommunityIcons name="wallet" size={16} color={AMBER} />
          <Text style={styles.headBalanceText} numberOfLines={1}>
            ₹{shownBalance.toFixed(2)}
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        <Pressable onPress={toggleSound} style={styles.headBtn} hitSlop={6} accessibilityLabel="Sound">
          <MaterialCommunityIcons name={soundOn ? 'volume-high' : 'volume-off'} size={20} color={AMBER} />
        </Pressable>
        <Pressable onPress={() => openPanel('bets')} style={styles.headBtn} hitSlop={6} accessibilityLabel="My bets">
          <MaterialCommunityIcons name="history" size={20} color={AMBER} />
        </Pressable>
        <Pressable onPress={() => openPanel('pay')} style={styles.headBtn} hitSlop={6} accessibilityLabel="Paytable">
          <MaterialCommunityIcons name="information-variant" size={22} color={AMBER} />
        </Pressable>
      </View>

      <View style={[styles.body, { paddingTop: headerH, paddingBottom: insets.bottom + 10, width: contentW, alignSelf: 'center' }]}>
        <View>
          <View style={{ alignItems: 'center' }} pointerEvents="none">
            <Logo width={Math.min(contentW * 0.6, 240)} />
          </View>
          {/* Drawn balls tray */}
          <View style={[styles.tray, { height: ball + 12 }]}>
            {Array.from({ length: 10 }, (_, i) => {
              const n = round?.drawn[i];
              const shown = round && i < round.shown && n !== undefined;
              return (
                <View key={i} style={[styles.traySlot, { width: ball, height: ball, borderRadius: ball / 2 }]}>
                  {shown && (
                    <Animated.View style={{ opacity: ballAnims[i], transform: [{ translateY: ballAnims[i].interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }) }, { scale: ballAnims[i].interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }}>
                      <Ball n={n} size={ball} hit={picks.includes(n)} />
                    </Animated.View>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {/* Board */}
        <View style={{ alignItems: 'center' }}>
          <View style={[styles.boardFrame, { width: boardW + 16 }]}>
            <View style={{ width: boardW, flexDirection: 'row', flexWrap: 'wrap', gap }}>
              {Array.from({ length: BOARD }, (_, i) => {
                const n = i + 1;
                const picked = picks.includes(n);
                const drawn = drawnSet.has(n);
                const hit = picked && drawn;
                return (
                  <Pressable key={n} onPress={() => togglePick(n)} disabled={locked} accessibilityLabel={`Number ${n}`}>
                    <Animated.View style={{ transform: [{ scale: tileAnims[n] }] }}>
                      {picked && !drawn ? (
                        <LinearGradient colors={['#FFE6A8', AMBER, '#D97706']} style={[styles.tileBase, styles.tilePicked, { width: tile, height: tile, borderRadius: tile * 0.2 }]}>
                          <Text style={[styles.tileText, { fontSize: tile * 0.4, color: '#2A1400' }]}>{n}</Text>
                        </LinearGradient>
                      ) : hit ? (
                        <LinearGradient colors={['#0F5E44', '#063A2A']} style={[styles.tileBase, styles.tileHit, { width: tile, height: tile, borderRadius: tile * 0.2 }]}>
                          <Gem size={tile * 0.6} />
                          <Text style={[styles.hitNum, { fontSize: tile * 0.24 }]}>{n}</Text>
                        </LinearGradient>
                      ) : (
                        <View style={[styles.tileBase, drawn && styles.tileDrawn, { width: tile, height: tile, borderRadius: tile * 0.2 }]}>
                          <Text style={[styles.tileText, { fontSize: tile * 0.4 }, drawn && { color: '#FF8FA0' }]}>{n}</Text>
                          {drawn && <View style={[styles.missRing, { width: tile * 0.78, height: tile * 0.78, borderRadius: tile * 0.39 }]} />}
                        </View>
                      )}
                    </Animated.View>
                  </Pressable>
                );
              })}
            </View>
            {round?.done && round.payout > 0 && (
              <Animated.View pointerEvents="none" style={[styles.winCard, { opacity: winAnim, transform: [{ scale: winAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }]}>
                <Text style={styles.winMult}>{fmtMult(round.multiplier)}x</Text>
                <View style={styles.winDivider} />
                <Text style={styles.winAmt}>₹{round.payout.toFixed(2)}</Text>
              </Animated.View>
            )}
          </View>

          {/* Payout bar for the current picks */}
          <View style={[styles.payBar, { width: boardW + 16 }]}>
            {row ? (
              row.map((m, h) => {
                const on = round?.done ? round.hits === h : false;
                const live = !round?.done && round ? round.hits === h : false;
                return (
                  <View key={h} style={[styles.payCell, on && (m > 0 ? styles.payCellWin : styles.payCellLose), live && styles.payCellLive]}>
                    <Text style={[styles.payMult, { fontSize: payFont }, m === 0 && { color: 'rgba(241,244,255,0.35)' }, on && m > 0 && { color: '#03281B' }]} numberOfLines={1}>
                      {row.length > 8 ? fmtMultShort(m) : fmtMult(m)}x
                    </Text>
                    <View style={styles.payHitsRow}>
                      <Text style={[styles.payHits, on && m > 0 && { color: '#03281B' }]}>{h}</Text>
                      <MaterialCommunityIcons name="diamond-stone" size={9} color={on && m > 0 ? '#03281B' : HIT} />
                    </View>
                  </View>
                );
              })
            ) : (
              <Text style={styles.payEmpty}>Pick 1–10 numbers to see what each hit pays</Text>
            )}
          </View>
        </View>

        {/* Controls */}
        <View>
          <View style={styles.riskRow}>
            {RISKS.map((r) => (
              <Pressable key={r} onPress={() => !locked && setRisk(r)} style={[styles.riskBtn, risk === r && styles.riskOn, locked && risk !== r && styles.dim]} accessibilityLabel={`Risk ${RISK_LABEL[r]}`}>
                <Text style={[styles.riskText, risk === r && styles.riskTextOn]}>{RISK_LABEL[r]}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.pickRow}>
            <Text style={styles.pickCount}>
              {picks.length}/{MAX_PICKS} picked{round?.done ? `  ·  ${round.hits} hit${round.hits === 1 ? '' : 's'}` : ''}
            </Text>
            <View style={{ flex: 1 }} />
            <Pressable onPress={autoPick} style={[styles.smallBtn, locked && styles.dim]} accessibilityLabel="Auto pick">
              <MaterialCommunityIcons name="shuffle-variant" size={15} color={AMBER} />
              <Text style={styles.smallBtnText}>AUTO PICK</Text>
            </Pressable>
            <Pressable onPress={clearPicks} style={[styles.smallBtn, locked && styles.dim]} accessibilityLabel="Clear picks">
              <MaterialCommunityIcons name="close-circle-outline" size={15} color={AMBER} />
              <Text style={styles.smallBtnText}>CLEAR</Text>
            </Pressable>
          </View>
          <View style={styles.betRow}>
            <View style={styles.betBox}>
              <Pressable onPress={() => changeBet(-1)} style={[styles.betBtn, locked && styles.dim]} hitSlop={6} accessibilityLabel="Lower bet">
                <MaterialCommunityIcons name="minus" size={20} color="#2A1400" />
              </Pressable>
              <View style={styles.betValueBox}>
                <Text style={styles.betLabel}>BET</Text>
                <Text style={styles.betValue}>₹{bet}</Text>
              </View>
              <Pressable onPress={() => changeBet(1)} style={[styles.betBtn, locked && styles.dim]} hitSlop={6} accessibilityLabel="Raise bet">
                <MaterialCommunityIcons name="plus" size={20} color="#2A1400" />
              </Pressable>
            </View>
            <Pressable onPress={() => scaleBet(0.5)} style={[styles.chip, locked && styles.dim]} accessibilityLabel="Half bet">
              <Text style={styles.chipText}>½</Text>
            </Pressable>
            <Pressable onPress={() => scaleBet(2)} style={[styles.chip, locked && styles.dim]} accessibilityLabel="Double bet">
              <Text style={styles.chipText}>2×</Text>
            </Pressable>
          </View>
          <View style={styles.actions}>
            <Pressable
              onPress={() => (autoLeft > 0 ? stopAuto() : doBet())}
              disabled={busy && autoLeft === 0}
              style={({ pressed }) => [styles.betMain, pressed && { transform: [{ scale: 0.97 }] }]}
              accessibilityLabel={autoLeft > 0 ? 'Stop auto bet' : 'Bet'}
            >
              <LinearGradient colors={autoLeft > 0 ? ['#FF7A8A', '#B3102F'] : busy ? ['#FFD89A', '#C2771A'] : ['#FFF1C2', AMBER, '#C2410C']} style={styles.betMainInner}>
                {autoLeft > 0 ? (
                  <Text style={styles.betMainText}>STOP · {autoLeft}</Text>
                ) : (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={styles.betMainText}>{busy ? 'DRAWING' : 'BET'}</Text>
                    {!busy && row && <Text style={styles.betMainSub}>max win ₹{maxWin.toFixed(2)}</Text>}
                  </View>
                )}
              </LinearGradient>
            </Pressable>
            <View style={styles.sideBtns}>
              <Pressable onPress={() => (autoLeft > 0 ? stopAuto() : setAutoOpen((o) => !o))} style={[styles.sideBtn, autoLeft > 0 && styles.sideBtnOn]} accessibilityLabel="Auto bet">
                <MaterialCommunityIcons name="autorenew" size={16} color={autoLeft > 0 ? '#2A1400' : AMBER} />
                <Text style={[styles.sideBtnText, autoLeft > 0 && { color: '#2A1400' }]}>AUTO</Text>
              </Pressable>
              <Pressable onPress={() => setTurbo((t) => !t)} style={[styles.sideBtn, turbo && styles.sideBtnOn]} accessibilityLabel="Turbo">
                <MaterialCommunityIcons name="lightning-bolt" size={16} color={turbo ? '#2A1400' : AMBER} />
                <Text style={[styles.sideBtnText, turbo && { color: '#2A1400' }]}>TURBO</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      {autoOpen && (
        <View style={[styles.autoPop, { bottom: insets.bottom + 84, right: (W - contentW) / 2 }]}>
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
                  ['pay', 'PAYTABLE'],
                ] as const
              ).map(([id, label]) => (
                <Pressable key={id} onPress={() => openPanel(id)} style={[styles.tab, panel === id && styles.tabOn]}>
                  <Text style={[styles.tabText, panel === id && styles.tabTextOn]}>{label}</Text>
                </Pressable>
              ))}
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => setPanel(null)} hitSlop={10} style={{ padding: 6 }} accessibilityLabel="Close">
                <MaterialCommunityIcons name="close" size={20} color={AMBER} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 14 }}>{panel === 'bets' ? <History bets={history} /> : <Paytable tables={tables} risk={risk} picks={picks.length} config={config} />}</ScrollView>
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

function Paytable({ tables, risk, picks, config }: { tables: Record<KenoRisk, number[][]>; risk: KenoRisk; picks: number; config: KenoConfig | null }) {
  const [k, setK] = useState(picks > 0 ? picks : 5);
  const row = tables[risk][k - 1];
  return (
    <View>
      <Text style={styles.ruleHead}>How to play</Text>
      <Text style={styles.ruleLine}>Pick 1 to 10 numbers from 1–40 and place your bet. Ten numbers are drawn. Every drawn number you picked is a hit, and the table below shows what each number of hits pays for your picks and risk.</Text>
      <Text style={styles.ruleHead}>Risk</Text>
      <Text style={styles.ruleLine}>Classic pays small wins often. Low and Medium pay less on few hits and more on many. High pays only on the top hits, with the biggest multipliers.</Text>
      <Text style={styles.ruleHead}>
        {RISK_LABEL[risk]} · {k} pick{k === 1 ? '' : 's'}
      </Text>
      <View style={styles.kRow}>
        {Array.from({ length: MAX_PICKS }, (_, i) => i + 1).map((n) => (
          <Pressable key={n} onPress={() => setK(n)} style={[styles.kBtn, n === k && styles.kBtnOn]}>
            <Text style={[styles.kText, n === k && { color: '#2A1400' }]}>{n}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.tableBox}>
        <View style={styles.tableHead}>
          <Text style={[styles.tableHeadText, { flex: 1 }]}>HITS</Text>
          <Text style={[styles.tableHeadText, { flex: 1, textAlign: 'center' }]}>PAYS</Text>
          <Text style={[styles.tableHeadText, { flex: 1, textAlign: 'right' }]}>CHANCE</Text>
        </View>
        {row.map((m, h) => (
          <View key={h} style={styles.tableRow}>
            <Text style={[styles.tableCell, { flex: 1 }]}>{h}</Text>
            <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', color: m > 0 ? HIT : 'rgba(241,244,255,0.4)' }]}>{fmtMult(m)}x</Text>
            <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', color: 'rgba(241,244,255,0.7)' }]}>{(hitChance(k, h) * 100).toFixed(h >= 7 ? 5 : 2)}%</Text>
          </View>
        ))}
      </View>
      <Text style={styles.ruleHead}>Game info</Text>
      <Text style={styles.ruleLine}>
        Return to player {config?.rtpRange ? `${config.rtpRange[0]}–${config.rtpRange[1]}` : '89.25–90'}% depending on picks and risk. Bet ₹{config?.minStake ?? 1} – ₹{config?.maxStake ?? 500}. Max win per bet ₹{config?.maxPayout ?? 10000}.
      </Text>
      <Text style={styles.ruleLine}>Every draw comes from your provably-fair seeds (Settings → Provably Fair).</Text>
    </View>
  );
}

function History({ bets }: { bets: KenoBet[] | null }) {
  if (bets === null) return <Text style={styles.ruleLine}>Loading…</Text>;
  if (bets.length === 0) return <Text style={styles.ruleLine}>No bets yet.</Text>;
  return (
    <View style={{ gap: 8 }}>
      {bets.map((b) => {
        const payout = Number(b.payout);
        const stake = Number(b.stake);
        return (
          <View key={b.id} style={styles.histRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.histMain}>
                {b.hits}/{b.picks.length} hits · {RISK_LABEL[b.risk]} · {fmtMult(Number(b.multiplier))}x
              </Text>
              <View style={styles.histNums}>
                {b.picks.map((p) => (
                  <View key={p} style={[styles.histNum, b.drawn.includes(p) && styles.histNumHit]}>
                    <Text style={[styles.histNumText, b.drawn.includes(p) && { color: '#03281B' }]}>{p}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.histSub}>
                ₹{stake.toFixed(2)} · {new Date(b.createdAt).toLocaleString()}
              </Text>
            </View>
            <Text style={[styles.histPay, { color: payout > stake ? HIT : payout > 0 ? '#E5E7EB' : 'rgba(241,244,255,0.5)' }]}>{payout > 0 ? `+₹${payout.toFixed(2)}` : `-₹${stake.toFixed(2)}`}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#03061A' },
  dim: { opacity: 0.4 },
  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 6, zIndex: 2 },
  headBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(12,20,56,0.9)', borderWidth: 1, borderColor: 'rgba(255,181,71,0.45)' },
  headBalance: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: 'rgba(12,20,56,0.92)', borderWidth: 1.2, borderColor: AMBER },
  headBalanceText: { color: INK, fontWeight: '900', fontSize: 14 },
  body: { flex: 1, justifyContent: 'space-between' },
  tray: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4, marginTop: 2, borderRadius: 18, backgroundColor: 'rgba(3,8,30,0.7)', borderWidth: 1, borderColor: 'rgba(255,181,71,0.25)' },
  traySlot: { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  boardFrame: { padding: 8, borderRadius: 18, backgroundColor: 'rgba(6,12,40,0.9)', borderWidth: 1.5, borderColor: 'rgba(255,181,71,0.45)', shadowColor: AMBER, shadowOpacity: 0.25, shadowRadius: 16, elevation: 6 },
  tileBase: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#18255E', borderWidth: 1, borderColor: 'rgba(160,180,255,0.25)' },
  tilePicked: { borderColor: '#FFF1C2', borderWidth: 1.5 },
  tileHit: { borderColor: HIT, borderWidth: 2, shadowColor: HIT, shadowOpacity: 0.8, shadowRadius: 8, elevation: 6 },
  tileDrawn: { backgroundColor: '#1A1433', borderColor: 'rgba(255,120,140,0.5)' },
  tileText: { color: INK, fontWeight: '900' },
  hitNum: { position: 'absolute', bottom: 1, right: 4, color: '#ECFFF7', fontWeight: '900' },
  missRing: { position: 'absolute', borderWidth: 1.5, borderColor: 'rgba(255,120,140,0.55)' },
  winCard: { position: 'absolute', alignSelf: 'center', top: '32%', paddingHorizontal: 26, paddingVertical: 10, borderRadius: 18, backgroundColor: 'rgba(3,30,20,0.94)', borderWidth: 2, borderColor: HIT, alignItems: 'center' },
  winMult: { color: HIT, fontWeight: '900', fontSize: 28 },
  winDivider: { width: 60, height: 1.5, backgroundColor: 'rgba(46,242,160,0.5)', marginVertical: 4 },
  winAmt: { color: '#FFFFFF', fontWeight: '900', fontSize: 18 },
  payBar: { flexDirection: 'row', gap: 3, marginTop: 8, minHeight: 44, alignItems: 'stretch', justifyContent: 'center' },
  payCell: { flex: 1, borderRadius: 8, paddingVertical: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(12,20,56,0.9)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  payCellWin: { backgroundColor: HIT, borderColor: '#D1FFF0' },
  payCellLose: { backgroundColor: 'rgba(255,90,110,0.25)', borderColor: 'rgba(255,90,110,0.7)' },
  payCellLive: { borderColor: AMBER, backgroundColor: 'rgba(255,181,71,0.18)' },
  payMult: { color: INK, fontWeight: '900', fontSize: 10.5 },
  payHitsRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  payHits: { color: 'rgba(241,244,255,0.6)', fontWeight: '800', fontSize: 9.5 },
  payEmpty: { color: 'rgba(241,244,255,0.5)', fontWeight: '700', fontSize: 12, alignSelf: 'center' },
  riskRow: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: 14, backgroundColor: 'rgba(12,20,56,0.9)', borderWidth: 1, borderColor: 'rgba(255,181,71,0.3)' },
  riskBtn: { flex: 1, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  riskOn: { backgroundColor: AMBER },
  riskText: { color: 'rgba(241,244,255,0.75)', fontWeight: '900', fontSize: 12.5, letterSpacing: 0.5 },
  riskTextOn: { color: '#2A1400' },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  pickCount: { color: 'rgba(241,244,255,0.75)', fontWeight: '800', fontSize: 12 },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: 10, borderRadius: 10, backgroundColor: 'rgba(12,20,56,0.9)', borderWidth: 1, borderColor: 'rgba(255,181,71,0.45)' },
  smallBtnText: { color: AMBER, fontWeight: '900', fontSize: 11, letterSpacing: 0.8 },
  betRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  betBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6, borderRadius: 16, backgroundColor: 'rgba(12,20,56,0.92)', borderWidth: 1.2, borderColor: 'rgba(255,181,71,0.45)' },
  betBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: AMBER },
  betValueBox: { flex: 1, alignItems: 'center' },
  betLabel: { color: 'rgba(241,244,255,0.55)', fontSize: 9.5, fontWeight: '900', letterSpacing: 1.5 },
  betValue: { color: INK, fontSize: 18, fontWeight: '900' },
  chip: { width: 50, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(12,20,56,0.92)', borderWidth: 1.2, borderColor: 'rgba(255,181,71,0.45)' },
  chipText: { color: AMBER, fontWeight: '900', fontSize: 16 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  betMain: { flex: 1, height: 62, borderRadius: 20, overflow: 'hidden', shadowColor: AMBER, shadowOpacity: 0.55, shadowRadius: 14, elevation: 8 },
  betMainInner: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 20, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  betMainText: { color: '#2A1400', fontSize: 22, fontWeight: '900', letterSpacing: 3 },
  betMainSub: { color: 'rgba(42,20,0,0.75)', fontSize: 10.5, fontWeight: '900', letterSpacing: 0.6 },
  sideBtns: { gap: 8 },
  sideBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 84, height: 27, borderRadius: 10, justifyContent: 'center', backgroundColor: 'rgba(12,20,56,0.92)', borderWidth: 1.2, borderColor: 'rgba(255,181,71,0.45)' },
  sideBtnOn: { backgroundColor: AMBER, borderColor: '#FFF1C2' },
  sideBtnText: { color: AMBER, fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  autoPop: { position: 'absolute', padding: 12, borderRadius: 14, backgroundColor: '#0E1A4A', borderWidth: 1.5, borderColor: AMBER },
  autoPopTitle: { color: AMBER, fontWeight: '900', fontSize: 11, letterSpacing: 2, textAlign: 'center', marginBottom: 8 },
  autoGrid: { flexDirection: 'row', gap: 8 },
  autoOpt: { width: 46, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,181,71,0.12)', borderWidth: 1, borderColor: 'rgba(255,181,71,0.5)' },
  autoOptText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  sheet: { borderRadius: 18, backgroundColor: '#0A1440', borderWidth: 1.5, borderColor: AMBER, overflow: 'hidden' },
  tabs: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,181,71,0.25)' },
  tab: { paddingHorizontal: 12, paddingVertical: 7, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  tabOn: { backgroundColor: 'rgba(255,181,71,0.14)', borderBottomWidth: 2, borderBottomColor: AMBER },
  tabText: { color: 'rgba(241,244,255,0.55)', fontWeight: '900', fontSize: 12, letterSpacing: 1.2 },
  tabTextOn: { color: AMBER },
  ruleHead: { color: AMBER, fontWeight: '900', fontSize: 13, letterSpacing: 1, marginTop: 12, marginBottom: 6 },
  ruleLine: { color: 'rgba(241,244,255,0.85)', fontSize: 12.5, lineHeight: 19, fontWeight: '600', marginTop: 4 },
  kRow: { flexDirection: 'row', gap: 4, marginBottom: 8 },
  kBtn: { flex: 1, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,181,71,0.1)', borderWidth: 1, borderColor: 'rgba(255,181,71,0.35)' },
  kBtnOn: { backgroundColor: AMBER },
  kText: { color: INK, fontWeight: '900', fontSize: 12 },
  tableBox: { borderRadius: 12, padding: 10, backgroundColor: 'rgba(255,181,71,0.06)', borderWidth: 1, borderColor: 'rgba(255,181,71,0.22)' },
  tableHead: { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,181,71,0.2)', marginBottom: 4 },
  tableHeadText: { color: 'rgba(255,181,71,0.8)', fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  tableRow: { flexDirection: 'row', paddingVertical: 4 },
  tableCell: { color: INK, fontWeight: '800', fontSize: 13 },
  histRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,181,71,0.15)' },
  histMain: { color: INK, fontWeight: '800', fontSize: 13 },
  histNums: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginTop: 5 },
  histNum: { minWidth: 22, height: 20, borderRadius: 5, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,181,71,0.2)' },
  histNumHit: { backgroundColor: HIT },
  histNumText: { color: INK, fontWeight: '900', fontSize: 10.5 },
  histSub: { color: 'rgba(241,244,255,0.5)', fontSize: 11, marginTop: 4 },
  histPay: { fontWeight: '900', fontSize: 14, marginLeft: 8 },
  toast: { position: 'absolute', alignSelf: 'center', top: '45%', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.85)', borderWidth: 1, borderColor: AMBER, maxWidth: '86%' },
  toastText: { color: INK, fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
