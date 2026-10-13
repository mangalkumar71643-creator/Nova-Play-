import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { ApiClientError } from '../api/client';
import {
  K3Config,
  K3Duration,
  K3HistoryEntry,
  K3MyBet,
  K3RoundView,
  fetchK3Config,
  fetchK3Current,
  fetchK3History,
  fetchK3MyBets,
  placeK3Bets,
} from '../api/backend';
import { useGameState } from '../state/GameStateContext';

// ---------- theme ----------

const G1 = '#23A35E';
const G2 = '#12743F';
const G3 = '#0B5A30';
const GOLD = '#F4CF6A';
const PAGE_BG = '#EEF3F0';
const INK = '#1C2B22';
const MUTED = '#7C8A82';
const DURATIONS: K3Duration[] = [60, 180, 300, 600];
const DURATION_LABEL: Record<K3Duration, string> = { 60: '1 Min', 180: '3 Min', 300: '5 Min', 600: '10 Min' };
const UNIT_VALUES = [1, 10, 50, 100];
const MULTIPLIERS = [1, 5, 10, 20, 50, 100];
const ROWS_PER_PAGE = 10;
const MIN_ROLL_MS = 1600;
const TOAST_MS = 1800;
const WIN_MS = 3500;

type Tab = 'TOTAL' | 'TWO' | 'THREE' | 'DIFF';
const TABS: { key: Tab; label: string }[] = [
  { key: 'TOTAL', label: 'Total' },
  { key: 'TWO', label: '2 same' },
  { key: 'THREE', label: '3 same' },
  { key: 'DIFF', label: 'Different' },
];
type HistoryTab = 'game' | 'chart' | 'my';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function floor2(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

/** Throws out of 216 for each sum 3..18 (fallback odds before config loads). */
const SUM_WAYS = [0, 0, 0, 1, 3, 6, 10, 15, 21, 25, 27, 27, 25, 21, 15, 10, 6, 3, 1];

function combos<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const [first, ...rest] = items;
  return [...combos(rest, k - 1).map((c) => [first, ...c]), ...combos(rest, k)];
}

/** Human label for a bet key, as in the history list. */
function labelFor(key: string): string {
  const [kind, arg] = key.split(':');
  switch (kind) {
    case 'SUM':
      return `Sum ${arg}`;
    case 'BIG':
      return 'Big';
    case 'SMALL':
      return 'Small';
    case 'ODD':
      return 'Odd';
    case 'EVEN':
      return 'Even';
    case 'PAIR':
      return `${arg}${arg}`;
    case 'PAIRSINGLE': {
      const [n, m] = arg.split('-');
      return `${n}${n}+${m}`;
    }
    case 'TRIPLE':
      return `${arg}${arg}${arg}`;
    case 'ANYTRIPLE':
      return 'Any triple';
    case 'DIFF3':
      return arg.split('-').join('');
    case 'DIFF2':
      return arg.split('-').join('');
    case 'STRAIGHT':
      return 'Straight';
    default:
      return key;
  }
}

// ---------- dice ----------

const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.28, 0.28], [0.72, 0.72]],
  3: [[0.26, 0.26], [0.5, 0.5], [0.74, 0.74]],
  4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
  5: [[0.26, 0.26], [0.74, 0.26], [0.5, 0.5], [0.26, 0.74], [0.74, 0.74]],
  6: [[0.28, 0.24], [0.72, 0.24], [0.28, 0.5], [0.72, 0.5], [0.28, 0.76], [0.72, 0.76]],
};

/** An ivory die with engraved pips; 1 and 4 are red, as on Chinese dice. */
export const DieFace = memo(function DieFace({ value, size }: { value: number; size: number }) {
  const red = value === 1 || value === 4;
  const r = size * (value === 1 ? 0.13 : 0.085);
  return (
    <Svg width={size} height={size}>
      <Defs>
        <SvgLinearGradient id="k3Ivory" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.6" stopColor="#F1EFEA" />
          <Stop offset="1" stopColor="#D5D1C8" />
        </SvgLinearGradient>
        <RadialGradient id="k3PipRed" cx="40%" cy="35%" r="65%">
          <Stop offset="0" stopColor="#FF6B6B" />
          <Stop offset="1" stopColor="#A90E1E" />
        </RadialGradient>
        <RadialGradient id="k3PipDark" cx="40%" cy="35%" r="65%">
          <Stop offset="0" stopColor="#4A4A55" />
          <Stop offset="1" stopColor="#0E0E14" />
        </RadialGradient>
      </Defs>
      <Rect x={0.5} y={0.5} width={size - 1} height={size - 1} rx={size * 0.2} fill="url(#k3Ivory)" stroke="#BDB7AA" strokeWidth={1} />
      <Rect x={size * 0.06} y={size * 0.06} width={size * 0.88} height={size * 0.88} rx={size * 0.16} fill="none" stroke="#FFFFFF" strokeWidth={1} opacity={0.8} />
      {PIPS[value].map(([x, y], i) => (
        <Circle key={i} cx={x * size} cy={y * size} r={r} fill={red ? 'url(#k3PipRed)' : 'url(#k3PipDark)'} />
      ))}
    </Svg>
  );
});

/** A die that tumbles through random faces while rolling and drops onto
 * its result when the roll ends. */
function RollingDie({ value, rolling, size, delay }: { value: number; rolling: boolean; size: number; delay: number }) {
  const [face, setFace] = useState(value);
  const wobble = useRef(new Animated.Value(0)).current;
  const drop = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!rolling) return;
    const id = setInterval(() => setFace(1 + Math.floor(Math.random() * 6)), 75);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(wobble, { toValue: 1, duration: 110, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(wobble, { toValue: -1, duration: 220, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(wobble, { toValue: 0, duration: 110, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => {
      clearInterval(id);
      loop.stop();
      wobble.setValue(0);
    };
  }, [rolling, wobble]);

  useEffect(() => {
    if (rolling) return;
    const t = setTimeout(() => {
      setFace(value);
      drop.setValue(0);
      Animated.timing(drop, { toValue: 1, duration: 520, easing: Easing.bounce, useNativeDriver: true }).start();
    }, delay);
    return () => clearTimeout(t);
  }, [rolling, value, delay, drop]);

  return (
    <Animated.View
      style={{
        transform: [
          { translateY: Animated.add(wobble.interpolate({ inputRange: [-1, 1], outputRange: [-size * 0.12, size * 0.06] }), drop.interpolate({ inputRange: [0, 1], outputRange: [-size * 0.5, 0] })) },
          { rotate: wobble.interpolate({ inputRange: [-1, 1], outputRange: ['-16deg', '16deg'] }) },
        ],
      }}
    >
      <View style={[styles.dieShadow, { width: size, height: size, borderRadius: size * 0.2 }]} />
      {/* Wrapped so the die stacks above its shadow on every platform. */}
      <View>
        <DieFace value={face} size={size} />
      </View>
    </Animated.View>
  );
}

/** Glossy number ball for the sum grid. */
const SumBall = memo(function SumBall({ n, size, active }: { n: number; size: number; active: boolean }) {
  const red = n % 2 === 1;
  const id = `k3b${red ? 'r' : 'g'}`;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id={id} cx="38%" cy="32%" r="70%">
            <Stop offset="0" stopColor={red ? '#FF8A8A' : '#7EE0A6'} />
            <Stop offset="0.55" stopColor={red ? '#E5283F' : '#1FA75C'} />
            <Stop offset="1" stopColor={red ? '#8E0A1B' : '#0B6534'} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2 - 1} fill={`url(#${id})`} stroke={active ? GOLD : 'rgba(255,255,255,0.6)'} strokeWidth={active ? 3 : 1.5} />
        <Circle cx={size / 2} cy={size / 2} r={size * 0.3} fill="#FFFFFF" />
      </Svg>
      <Text style={[styles.ballNum, { fontSize: size * 0.3, color: red ? '#C2142B' : '#12743F' }]}>{n}</Text>
    </View>
  );
});

// ---------- screen ----------

export default function K3LotteryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<K3Config | null>(null);
  const [duration, setDuration] = useState<K3Duration>(60);
  const [round, setRound] = useState<K3RoundView | null>(null);
  const [history, setHistory] = useState<K3HistoryEntry[]>([]);
  const [myBets, setMyBets] = useState<K3MyBet[]>([]);
  const [rolling, setRolling] = useState(false);
  const [tab, setTab] = useState<Tab>('TOTAL');
  const [selTotal, setSelTotal] = useState<string | null>(null);
  const [selPairs, setSelPairs] = useState<number[]>([]);
  const [selUniPairs, setSelUniPairs] = useState<number[]>([]);
  const [selUniSingles, setSelUniSingles] = useState<number[]>([]);
  const [selTriples, setSelTriples] = useState<number[]>([]);
  const [anyTriple, setAnyTriple] = useState(false);
  const [selDiff3, setSelDiff3] = useState<number[]>([]);
  const [straight, setStraight] = useState(false);
  const [selDiff2, setSelDiff2] = useState<number[]>([]);
  const [unit, setUnit] = useState(1);
  const [qty, setQty] = useState(1);
  const [mult, setMult] = useState(1);
  const [agree, setAgree] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [historyTab, setHistoryTab] = useState<HistoryTab>('game');
  const [page, setPage] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [win, setWin] = useState<{ amount: number; period: string; result: K3HistoryEntry } | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [, setTick] = useState(0);

  const offsetRef = useRef(0);
  const mountedRef = useRef(true);
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const endedRef = useRef<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheet = useRef(new Animated.Value(0)).current;
  const winPop = useRef(new Animated.Value(0)).current;

  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const maxPayout = config?.maxPayout ?? 10000;
  const lockSeconds = config?.lockSeconds ?? 5;
  const multOf = useCallback(
    (key: string) => {
      const m = config?.multipliers?.[key];
      if (m) return m;
      if (key.startsWith('SUM:')) return floor2((0.9 * 216) / SUM_WAYS[Number(key.slice(4))]);
      return 0;
    },
    [config]
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const loadRound = useCallback(async (d: K3Duration) => {
    const sentAt = Date.now();
    const v = await fetchK3Current(d);
    const receivedAt = Date.now();
    if (!mountedRef.current || durationRef.current !== d) return null;
    offsetRef.current = new Date(v.serverTime).getTime() - (sentAt + receivedAt) / 2;
    setRound(v);
    return v;
  }, []);

  const loadMyBets = useCallback(async () => {
    try {
      const rows = await fetchK3MyBets(50);
      if (mountedRef.current) setMyBets(rows);
      return rows;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchK3Config()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => {});
    loadMyBets();
    return () => {
      mountedRef.current = false;
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [loadMyBets]);

  // Switching track: fresh round and history for it.
  useEffect(() => {
    setRound(null);
    setHistory([]);
    setRolling(false);
    setPage(0);
    endedRef.current = null;
    loadRound(duration).catch(() => {});
    fetchK3History(duration, 50)
      .then((h) => mountedRef.current && durationRef.current === duration && setHistory(h))
      .catch(() => {});
  }, [duration, loadRound]);

  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 250);
    return () => clearInterval(id);
  }, []);

  // Keep the clock honest while waiting.
  useEffect(() => {
    const id = setInterval(() => loadRound(durationRef.current).catch(() => {}), 15000);
    return () => clearInterval(id);
  }, [loadRound]);

  const srvNow = Date.now() + offsetRef.current;
  const endMs = round ? new Date(round.endTime).getTime() : 0;
  const msLeft = round ? Math.max(0, endMs - srvNow) : 0;
  const secsLeft = Math.ceil(msLeft / 1000);
  const locked = !!round && secsLeft <= lockSeconds;

  // Round over: roll the dice, move to the next round, wait for the
  // result, land the dice on it and pay out any win.
  useEffect(() => {
    if (!round || srvNow < endMs || endedRef.current === round.periodNumber) return;
    const period = round.periodNumber;
    const d = duration;
    endedRef.current = period;
    setRolling(true);
    const startedAt = Date.now();
    (async () => {
      await new Promise((r) => setTimeout(r, 400));
      loadRound(d).catch(() => {});
      let h: K3HistoryEntry[] | null = null;
      for (let i = 0; i < 12 && mountedRef.current && durationRef.current === d; i++) {
        try {
          const rows = await fetchK3History(d, 50);
          if (rows[0]?.periodNumber === period) {
            h = rows;
            break;
          }
        } catch {
          // retry below
        }
        await new Promise((r) => setTimeout(r, 700));
      }
      if (!mountedRef.current || durationRef.current !== d) return;
      await new Promise((r) => setTimeout(r, Math.max(0, MIN_ROLL_MS - (Date.now() - startedAt))));
      if (h) setHistory(h);
      setRolling(false);
      const bets = await loadMyBets();
      const mine = (bets ?? []).filter((b) => b.periodNumber === period && b.durationSeconds === d);
      if (mine.length > 0) refreshWallet();
      const won = round2(mine.reduce((s, b) => s + (b.status === 'WON' ? Number(b.payout) : 0), 0));
      if (won > 0 && h) {
        setTimeout(() => {
          if (!mountedRef.current) return;
          setWin({ amount: won, period, result: h![0] });
          winPop.setValue(0);
          Animated.spring(winPop, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }).start();
        }, 900);
      }
    })();
  }, [round, srvNow, endMs, duration, loadRound, loadMyBets, refreshWallet, winPop]);

  useEffect(() => {
    if (!win) return;
    const id = setTimeout(() => setWin(null), WIN_MS);
    return () => clearTimeout(id);
  }, [win]);

  // ---- selection -> bet keys ----
  const clearSelection = useCallback(() => {
    setSelTotal(null);
    setSelPairs([]);
    setSelUniPairs([]);
    setSelUniSingles([]);
    setSelTriples([]);
    setAnyTriple(false);
    setSelDiff3([]);
    setStraight(false);
    setSelDiff2([]);
  }, []);

  const keys = useMemo(() => {
    const sort = (a: number[]) => [...a].sort((x, y) => x - y);
    switch (tab) {
      case 'TOTAL':
        return selTotal ? [selTotal] : [];
      case 'TWO':
        return [
          ...sort(selPairs).map((n) => `PAIR:${n}`),
          ...sort(selUniPairs).flatMap((n) => sort(selUniSingles).filter((m) => m !== n).map((m) => `PAIRSINGLE:${n}-${m}`)),
        ];
      case 'THREE':
        return [...sort(selTriples).map((n) => `TRIPLE:${n}`), ...(anyTriple ? ['ANYTRIPLE'] : [])];
      case 'DIFF':
        return [
          ...combos(sort(selDiff3), 3).map((c) => `DIFF3:${c.join('-')}`),
          ...(straight ? ['STRAIGHT'] : []),
          ...combos(sort(selDiff2), 2).map((c) => `DIFF2:${c.join('-')}`),
        ];
    }
  }, [tab, selTotal, selPairs, selUniPairs, selUniSingles, selTriples, anyTriple, selDiff3, straight, selDiff2]);

  const sheetOpen = keys.length > 0;
  useEffect(() => {
    Animated.timing(sheet, { toValue: sheetOpen ? 1 : 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    if (!sheetOpen) {
      setQty(1);
      setMult(1);
    }
  }, [sheetOpen, sheet]);

  const toggle = (list: number[], set: (v: number[]) => void, n: number) => set(list.includes(n) ? list.filter((x) => x !== n) : [...list, n]);

  const perBet = round2(unit * qty * mult);
  const totalCost = round2(perBet * keys.length);

  const confirm = async () => {
    if (!round || placing) return;
    if (!agree) return showToast('Please agree to the pre-sale rules');
    if (locked) return showToast('Betting is closed for this period');
    if (perBet < minStake) return showToast(`Minimum ₹${minStake} per bet`);
    if (perBet > maxStake) return showToast(`Max ₹${maxStake} per bet`);
    const capped = keys.find((k) => perBet * multOf(k) > maxPayout);
    if (capped) return showToast(`Max ₹${Math.floor(maxPayout / multOf(capped))} on ${labelFor(capped)} (max win ₹${maxPayout})`);
    if (totalCost > coins) return showToast('Insufficient balance');
    setPlacing(true);
    try {
      await placeK3Bets(duration, keys.map((area) => ({ area, amount: perBet })));
      showToast(`Bet placed · ₹${totalCost.toFixed(2)}`);
      clearSelection();
      refreshWallet();
      loadMyBets();
    } catch (err) {
      showToast(errorMessage(err));
    } finally {
      if (mountedRef.current) setPlacing(false);
    }
  };

  // ---- layout ----
  const pad = 12;
  const cardW = W - pad * 2;
  const dieSize = Math.min(64, (cardW - 90) / 3 - 18);
  const ballSize = Math.min(52, (cardW - 24) / 4 - 26);
  const last = history[0] ?? null;
  const shownDice = last?.dice ?? [1, 2, 3];
  const mm = String(Math.floor(secsLeft / 60)).padStart(2, '0');
  const ss = String(secsLeft % 60).padStart(2, '0');
  const pages = Math.max(1, Math.ceil(Math.min(history.length, 50) / ROWS_PER_PAGE));
  const myPages = Math.max(1, Math.ceil(myBets.length / ROWS_PER_PAGE));
  const pageCount = historyTab === 'my' ? myPages : pages;
  const pageRows = history.slice(page * ROWS_PER_PAGE, page * ROWS_PER_PAGE + ROWS_PER_PAGE);
  const myRows = myBets.slice(page * ROWS_PER_PAGE, page * ROWS_PER_PAGE + ROWS_PER_PAGE);
  const [sheetH, setSheetH] = useState(380);

  const pill = (label: string, on: boolean, onPress: () => void, tone: 'purple' | 'pink' | 'green' | 'red' | 'gold', width?: number) => (
    <Pressable key={label} onPress={onPress} style={[styles.pill, { width }, on ? [styles.pillOn, { backgroundColor: TONE[tone].on }] : { backgroundColor: TONE[tone].off }]}>
      <Text style={[styles.pillText, { color: on ? '#FFFFFF' : TONE[tone].text }]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: (sheetOpen ? sheetH : 0) + insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <LinearGradient colors={[G1, G2, G3]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.header, { paddingTop: insets.top + 6, height: insets.top + 58 + 110 }]}>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <View style={[styles.deco, { width: 180, height: 180, borderRadius: 90, right: -50, top: -40 }]} />
            <View style={[styles.deco, { width: 110, height: 110, borderRadius: 55, left: -30, top: 90 }]} />
            <View style={[styles.decoDie, { right: 64, top: insets.top + 14, transform: [{ rotate: '18deg' }] }]}>
              <DieFace value={5} size={34} />
            </View>
            <View style={[styles.decoDie, { left: 60, top: insets.top + 16, transform: [{ rotate: '-14deg' }] }]}>
              <DieFace value={3} size={26} />
            </View>
          </View>
          <View style={styles.headerRow}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.headerBtn}>
              <MaterialCommunityIcons name="chevron-left" size={28} color="#FFFFFF" />
            </Pressable>
            <Text style={styles.headerTitle}>K3 Lottery</Text>
            <Pressable onPress={() => setShowRules(true)} hitSlop={10} style={styles.headerBtn}>
              <MaterialCommunityIcons name="information-outline" size={22} color="#FFFFFF" />
            </Pressable>
          </View>
        </LinearGradient>

        {/* Wallet */}
        <View style={[styles.card, styles.wallet, { marginHorizontal: pad }]}>
          <View style={styles.walletRow}>
            <Text style={styles.walletAmount}>₹{coins.toFixed(2)}</Text>
            <Pressable onPress={() => refreshWallet()} hitSlop={8}>
              <MaterialCommunityIcons name="refresh" size={20} color={MUTED} />
            </Pressable>
          </View>
          <View style={styles.walletLabelRow}>
            <MaterialCommunityIcons name="wallet" size={16} color={G2} />
            <Text style={styles.walletLabel}>Wallet balance</Text>
          </View>
          <View style={styles.walletBtns}>
            <Pressable onPress={() => navigation.navigate('Withdraw')} style={[styles.walletBtn, styles.walletBtnOutline]}>
              <Text style={[styles.walletBtnText, { color: G2 }]}>Withdraw</Text>
            </Pressable>
            <Pressable onPress={() => navigation.navigate('Deposit')} style={styles.walletBtn}>
              <LinearGradient colors={[G1, G2]} style={[StyleSheet.absoluteFill, { borderRadius: 20 }]} />
              <Text style={[styles.walletBtnText, { color: '#FFFFFF' }]}>Deposit</Text>
            </Pressable>
          </View>
        </View>

        {/* Duration tracks */}
        <View style={[styles.card, styles.durations, { marginHorizontal: pad }]}>
          {DURATIONS.map((d) => {
            const on = d === duration;
            return (
              <Pressable key={d} onPress={() => d !== duration && setDuration(d)} style={styles.durTab}>
                {on && <LinearGradient colors={[G1, G2]} style={[StyleSheet.absoluteFill, { borderRadius: 12 }]} />}
                <View style={[styles.durIcon, on && { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                  <MaterialCommunityIcons name="clock-time-four" size={22} color={on ? '#FFFFFF' : '#B8C4BD'} />
                </View>
                <Text style={[styles.durText, on && { color: '#FFFFFF' }]}>K3 Lotre</Text>
                <Text style={[styles.durText, on && { color: '#FFFFFF' }]}>{DURATION_LABEL[d]}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Ticket: rules + countdown */}
        <View style={[styles.ticket, { marginHorizontal: pad }]}>
          <LinearGradient colors={[G1, G2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 14 }]} />
          <View style={[styles.notch, { top: -9 }]} />
          <View style={[styles.notch, { bottom: -9 }]} />
          <View style={styles.ticketLeft}>
            <Pressable onPress={() => setShowRules(true)} style={styles.howBtn}>
              <MaterialCommunityIcons name="file-document-outline" size={14} color="#FFFFFF" />
              <Text style={styles.howText}>How to play</Text>
            </Pressable>
            <Text style={styles.ticketGame}>K3 Lotre {DURATION_LABEL[duration]}</Text>
            <View style={styles.ticketDice}>
              {shownDice.map((v, i) => (
                <DieFace key={i} value={v} size={20} />
              ))}
            </View>
          </View>
          <View style={styles.ticketDivider} />
          <View style={styles.ticketRight}>
            <Text style={styles.ticketLabel}>Time remaining</Text>
            <View style={styles.digits}>
              {[mm[0], mm[1], ':', ss[0], ss[1]].map((c, i) =>
                c === ':' ? (
                  <Text key={i} style={styles.digitColon}>
                    :
                  </Text>
                ) : (
                  <View key={i} style={[styles.digit, locked && { backgroundColor: '#FFE8E8' }]}>
                    <Text style={[styles.digitText, locked && { color: '#D7263D' }]}>{round ? c : '-'}</Text>
                  </View>
                )
              )}
            </View>
            <Text style={styles.ticketPeriod}>{round?.periodNumber ?? '—'}</Text>
          </View>
        </View>

        {/* The dice machine */}
        <View style={[styles.machine, { marginHorizontal: pad }]}>
          <LinearGradient colors={['#2DB36B', '#15824A', '#0D6437']} style={[StyleSheet.absoluteFill, { borderRadius: 18 }]} />
          <View style={styles.machineTop}>
            <Text style={styles.machineTitle}>{rolling ? 'Rolling…' : last ? `Result · ${last.periodNumber.slice(-6)}` : 'Waiting for the first result'}</Text>
          </View>
          <View style={styles.machineBody}>
            <View style={[styles.pointer, styles.pointerLeft]} />
            <LinearGradient colors={['#06341C', '#0A4A28']} style={styles.windowsWrap}>
              {shownDice.map((v, i) => (
                <View key={i} style={[styles.window, { width: dieSize + 22, height: dieSize + 26 }]}>
                  <LinearGradient colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.1)', 'rgba(255,255,255,0.08)']} style={[StyleSheet.absoluteFill, { borderRadius: 12 }]} />
                  <RollingDie value={v} rolling={rolling} size={dieSize} delay={i * 180} />
                </View>
              ))}
            </LinearGradient>
            <View style={[styles.pointer, styles.pointerRight]} />
          </View>
          <View style={styles.resultRow}>
            {last && !rolling ? (
              <>
                <View style={[styles.resultChip, { backgroundColor: GOLD }]}>
                  <Text style={[styles.resultChipText, { color: '#4A3200' }]}>Sum {last.sum}</Text>
                </View>
                <View style={[styles.resultChip, { backgroundColor: last.size === 'BIG' ? '#F39A1E' : '#3D8BEA' }]}>
                  <Text style={styles.resultChipText}>{last.size === 'BIG' ? 'Big' : 'Small'}</Text>
                </View>
                <View style={[styles.resultChip, { backgroundColor: last.parity === 'ODD' ? '#E5283F' : '#1FA75C' }]}>
                  <Text style={styles.resultChipText}>{last.parity === 'ODD' ? 'Odd' : 'Even'}</Text>
                </View>
              </>
            ) : (
              <Text style={styles.resultWait}>{rolling ? 'Dice are rolling…' : '—'}</Text>
            )}
          </View>
        </View>

        {/* Bet types */}
        <View style={[styles.card, styles.betCard, { marginHorizontal: pad }]}>
          <View style={styles.betTabs}>
            {TABS.map((t) => {
              const on = t.key === tab;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => {
                    if (t.key === tab) return;
                    clearSelection();
                    setTab(t.key);
                  }}
                  style={styles.betTab}
                >
                  {on && <LinearGradient colors={[G1, G2]} style={[StyleSheet.absoluteFill, { borderRadius: 10 }]} />}
                  <Text style={[styles.betTabText, on && { color: '#FFFFFF' }]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View>
            {tab === 'TOTAL' && (
              <>
                <View style={styles.ballGrid}>
                  {Array.from({ length: 16 }, (_, i) => i + 3).map((n) => {
                    const key = `SUM:${n}`;
                    const on = selTotal === key;
                    return (
                      <Pressable key={n} onPress={() => setSelTotal(on ? null : key)} style={[styles.ballCell, on && styles.ballCellOn]}>
                        <SumBall n={n} size={ballSize} active={on} />
                        <Text style={styles.ballOdds}>{multOf(key)}X</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.bsRow}>
                  {(
                    [
                      { key: 'BIG', label: 'Big', color: ['#FFB547', '#F08A12'] },
                      { key: 'SMALL', label: 'Small', color: ['#6EB2FF', '#2F7DE0'] },
                      { key: 'ODD', label: 'Odd', color: ['#FF6B7C', '#D91F37'] },
                      { key: 'EVEN', label: 'Even', color: ['#45D08A', '#159A52'] },
                    ] as const
                  ).map((b) => {
                    const on = selTotal === b.key;
                    return (
                      <Pressable key={b.key} onPress={() => setSelTotal(on ? null : b.key)} style={[styles.bsBtn, on && styles.bsBtnOn]}>
                        <LinearGradient colors={[b.color[0], b.color[1]]} style={[StyleSheet.absoluteFill, { borderRadius: 10 }]} />
                        <Text style={styles.bsText}>{b.label}</Text>
                        <Text style={styles.bsOdds}>{multOf(b.key) || 1.8}X</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            {tab === 'TWO' && (
              <>
                <Text style={styles.sectionHint}>
                  2 matching numbers: odds <Text style={styles.oddsEm}>({multOf('PAIR:1')}X)</Text>
                </Text>
                <View style={styles.pillRow}>{[1, 2, 3, 4, 5, 6].map((n) => pill(`${n}${n}`, selPairs.includes(n), () => toggle(selPairs, setSelPairs, n), 'purple'))}</View>
                <Text style={styles.sectionHint}>
                  A pair plus a different number: odds <Text style={styles.oddsEm}>({multOf('PAIRSINGLE:1-2')}X)</Text>
                </Text>
                <View style={styles.pillRow}>{[1, 2, 3, 4, 5, 6].map((n) => pill(`${n}${n}`, selUniPairs.includes(n), () => toggle(selUniPairs, setSelUniPairs, n), 'pink'))}</View>
                <View style={styles.pillRow}>{[1, 2, 3, 4, 5, 6].map((n) => pill(`${n}`, selUniSingles.includes(n), () => toggle(selUniSingles, setSelUniSingles, n), 'green'))}</View>
              </>
            )}

            {tab === 'THREE' && (
              <>
                <Text style={styles.sectionHint}>
                  3 same numbers: odds <Text style={styles.oddsEm}>({multOf('TRIPLE:1')}X)</Text>
                </Text>
                <View style={styles.pillRow}>{[1, 2, 3, 4, 5, 6].map((n) => pill(`${n}${n}${n}`, selTriples.includes(n), () => toggle(selTriples, setSelTriples, n), 'purple'))}</View>
                <Text style={styles.sectionHint}>
                  Any 3 same numbers: odds <Text style={styles.oddsEm}>({multOf('ANYTRIPLE')}X)</Text>
                </Text>
                <View style={styles.pillRow}>{pill('Any 3 of a kind', anyTriple, () => setAnyTriple(!anyTriple), 'red', cardW - 24)}</View>
              </>
            )}

            {tab === 'DIFF' && (
              <>
                <Text style={styles.sectionHint}>
                  3 different numbers: odds <Text style={styles.oddsEm}>({multOf('DIFF3:1-2-3')}X)</Text> · pick 3 or more
                </Text>
                <View style={styles.pillRow}>{[1, 2, 3, 4, 5, 6].map((n) => pill(`${n}`, selDiff3.includes(n), () => toggle(selDiff3, setSelDiff3, n), 'purple'))}</View>
                <Text style={styles.sectionHint}>
                  3 continuous numbers: odds <Text style={styles.oddsEm}>({multOf('STRAIGHT')}X)</Text>
                </Text>
                <View style={styles.pillRow}>{pill('123 · 234 · 345 · 456', straight, () => setStraight(!straight), 'red', cardW - 24)}</View>
                <Text style={styles.sectionHint}>
                  2 different numbers: odds <Text style={styles.oddsEm}>({multOf('DIFF2:1-2')}X)</Text> · pick 2 or more
                </Text>
                <View style={styles.pillRow}>{[1, 2, 3, 4, 5, 6].map((n) => pill(`${n}`, selDiff2.includes(n), () => toggle(selDiff2, setSelDiff2, n), 'green'))}</View>
              </>
            )}

            {/* Last seconds: no more bets */}
            {locked && (
              <View style={styles.lockOverlay}>
                <View style={styles.lockDigit}>
                  <Text style={styles.lockDigitText}>{ss[0]}</Text>
                </View>
                <View style={styles.lockDigit}>
                  <Text style={styles.lockDigitText}>{ss[1]}</Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* History */}
        <View style={[styles.histTabs, { marginHorizontal: pad }]}>
          {(
            [
              { key: 'game', label: 'Game history' },
              { key: 'chart', label: 'Chart' },
              { key: 'my', label: 'My history' },
            ] as const
          ).map((t) => {
            const on = t.key === historyTab;
            return (
              <Pressable
                key={t.key}
                onPress={() => {
                  setHistoryTab(t.key);
                  setPage(0);
                  if (t.key === 'my') loadMyBets();
                }}
                style={[styles.histTab, !on && { backgroundColor: '#E2E7E4' }]}
              >
                {on && <LinearGradient colors={[G1, G2]} style={[StyleSheet.absoluteFill, { borderRadius: 10 }]} />}
                <Text style={[styles.histTabText, on && { color: '#FFFFFF' }]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.card, { marginHorizontal: pad, marginTop: 10, overflow: 'hidden', padding: 0 }]}>
          {historyTab === 'game' && (
            <>
              <LinearGradient colors={[G1, G2]} style={styles.tableHead}>
                <Text style={[styles.th, { flex: 1.5 }]}>Period</Text>
                <Text style={[styles.th, { flex: 0.7 }]}>Sum</Text>
                <Text style={[styles.th, { flex: 1.3 }]}>Result</Text>
                <Text style={[styles.th, { flex: 1 }]}>Big/Small</Text>
                <Text style={[styles.th, { flex: 0.9 }]}>Odd/Even</Text>
              </LinearGradient>
              {pageRows.map((h, i) => (
                <View key={h.periodNumber} style={[styles.tr, i % 2 === 1 && { backgroundColor: '#F7FAF8' }]}>
                  <Text style={[styles.td, { flex: 1.5, fontSize: 11 }]}>{h.periodNumber}</Text>
                  <Text style={[styles.td, { flex: 0.7, fontWeight: '900', color: G2 }]}>{h.sum}</Text>
                  <View style={{ flex: 1.3, flexDirection: 'row', justifyContent: 'center', gap: 3 }}>
                    {h.dice.map((v, j) => (
                      <DieFace key={j} value={v} size={17} />
                    ))}
                  </View>
                  <Text style={[styles.td, { flex: 1, fontWeight: '800', color: h.size === 'BIG' ? '#E07F0A' : '#2F7DE0' }]}>{h.size === 'BIG' ? 'Big' : 'Small'}</Text>
                  <Text style={[styles.td, { flex: 0.9, fontWeight: '800', color: h.parity === 'ODD' ? '#D91F37' : '#159A52' }]}>{h.parity === 'ODD' ? 'Odd' : 'Even'}</Text>
                </View>
              ))}
              {pageRows.length === 0 && <Text style={styles.empty}>No results yet</Text>}
            </>
          )}

          {historyTab === 'chart' && (
            <>
              <LinearGradient colors={[G1, G2]} style={styles.tableHead}>
                <Text style={[styles.th, { flex: 1.5 }]}>Period</Text>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <Text key={n} style={[styles.th, { flex: 0.5 }]}>
                    {n}
                  </Text>
                ))}
                <Text style={[styles.th, { flex: 0.8 }]}>Sum</Text>
              </LinearGradient>
              {pageRows.map((h, i) => (
                <View key={h.periodNumber} style={[styles.tr, i % 2 === 1 && { backgroundColor: '#F7FAF8' }]}>
                  <Text style={[styles.td, { flex: 1.5, fontSize: 11 }]}>{h.periodNumber.slice(-6)}</Text>
                  {[1, 2, 3, 4, 5, 6].map((n) => {
                    const c = h.dice.filter((d) => d === n).length;
                    return (
                      <View key={n} style={{ flex: 0.5, alignItems: 'center' }}>
                        {c > 0 ? (
                          <View style={[styles.chartDot, { backgroundColor: c === 3 ? '#8E44AD' : c === 2 ? '#F08A12' : '#E5283F' }]}>
                            <Text style={styles.chartDotText}>{c > 1 ? `${n}×${c}` : n}</Text>
                          </View>
                        ) : (
                          <Text style={styles.chartEmpty}>{n}</Text>
                        )}
                      </View>
                    );
                  })}
                  <Text style={[styles.td, { flex: 0.8, fontWeight: '900', color: G2 }]}>{h.sum}</Text>
                </View>
              ))}
              {pageRows.length === 0 && <Text style={styles.empty}>No results yet</Text>}
            </>
          )}

          {historyTab === 'my' && (
            <View style={{ padding: 10, gap: 8 }}>
              {myRows.map((b) => {
                const won = b.status === 'WON';
                const lost = b.status === 'LOST';
                return (
                  <View key={b.id} style={styles.myRow}>
                    <View style={[styles.myBadge, { backgroundColor: won ? '#1FA75C' : lost ? '#E5283F' : '#9AA7A0' }]}>
                      <Text style={styles.myBadgeText} numberOfLines={1}>
                        {labelFor(b.area)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.myPeriod}>
                        {b.periodNumber} · {DURATION_LABEL[b.durationSeconds]}
                      </Text>
                      <Text style={styles.myMeta}>
                        ₹{Number(b.amount).toFixed(2)} @ {Number(b.multiplier)}X{b.result ? `  ·  ${b.result.dice.join(' ')} = ${b.result.sum}` : ''}
                      </Text>
                    </View>
                    <Text style={[styles.myStatus, { color: won ? '#159A52' : lost ? '#D91F37' : MUTED }]}>
                      {won ? `+₹${Number(b.payout).toFixed(2)}` : lost ? `-₹${Number(b.amount).toFixed(2)}` : 'Pending'}
                    </Text>
                  </View>
                );
              })}
              {myRows.length === 0 && <Text style={styles.empty}>No bets yet</Text>}
            </View>
          )}

          <View style={styles.pager}>
            <Pressable onPress={() => setPage((p) => Math.max(0, p - 1))} style={[styles.pageBtn, page === 0 && { opacity: 0.35 }]}>
              <MaterialCommunityIcons name="chevron-left" size={24} color="#FFFFFF" />
            </Pressable>
            <Text style={styles.pageText}>
              {page + 1}/{pageCount}
            </Text>
            <Pressable onPress={() => setPage((p) => Math.min(pageCount - 1, p + 1))} style={[styles.pageBtn, page >= pageCount - 1 && { opacity: 0.35 }]}>
              <MaterialCommunityIcons name="chevron-right" size={24} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* Bet sheet */}
      <Animated.View
        pointerEvents={sheetOpen ? 'auto' : 'none'}
        onLayout={(e) => setSheetH(e.nativeEvent.layout.height)}
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + 8, transform: [{ translateY: sheet.interpolate({ inputRange: [0, 1], outputRange: [sheetH + 40, 0] }) }] },
        ]}
      >
        <LinearGradient colors={[G1, G2]} style={styles.sheetHead}>
          <Text style={styles.sheetTitle}>K3 Lotre {DURATION_LABEL[duration]}</Text>
          <Text style={styles.sheetSel} numberOfLines={1}>
            Select: {keys.length > 4 ? `${keys.slice(0, 4).map(labelFor).join(', ')} +${keys.length - 4}` : keys.map(labelFor).join(', ')}
          </Text>
        </LinearGradient>
        <View style={styles.sheetBody}>
          <View style={styles.sheetRow}>
            <Text style={styles.sheetLabel}>Balance</Text>
            <View style={styles.sheetChoices}>
              {UNIT_VALUES.map((v) => (
                <Pressable key={v} onPress={() => setUnit(v)} style={[styles.choice, unit === v && styles.choiceOn]}>
                  <Text style={[styles.choiceText, unit === v && { color: '#FFFFFF' }]}>{v}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.sheetRow}>
            <Text style={styles.sheetLabel}>Quantity</Text>
            <View style={styles.qtyBox}>
              <Pressable onPress={() => setQty((q) => Math.max(1, q - 1))} style={styles.qtyBtn}>
                <MaterialCommunityIcons name="minus" size={18} color="#FFFFFF" />
              </Pressable>
              <Text style={styles.qtyText}>{qty}</Text>
              <Pressable onPress={() => setQty((q) => Math.min(500, q + 1))} style={styles.qtyBtn}>
                <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
          <View style={styles.multRow}>
            {MULTIPLIERS.map((m) => (
              <Pressable key={m} onPress={() => setMult(m)} style={[styles.multBtn, mult === m && styles.choiceOn]}>
                <Text style={[styles.choiceText, mult === m && { color: '#FFFFFF' }]}>X{m}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => setAgree(!agree)} style={styles.agreeRow}>
            <MaterialCommunityIcons name={agree ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'} size={18} color={agree ? G1 : MUTED} />
            <Text style={styles.agreeText}>I agree to the pre-sale rules</Text>
            <Text style={styles.sheetInfo}>
              {keys.length} bet{keys.length > 1 ? 's' : ''} × ₹{perBet.toFixed(2)}
            </Text>
          </Pressable>
        </View>
        <View style={styles.sheetFoot}>
          <Pressable onPress={clearSelection} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable onPress={confirm} disabled={placing} style={styles.totalBtn}>
            <LinearGradient colors={[G1, G2]} style={StyleSheet.absoluteFill} />
            <Text style={styles.totalText}>{placing ? 'Placing…' : `Total amount ₹${totalCost.toFixed(2)}`}</Text>
          </Pressable>
        </View>
      </Animated.View>

      {/* Win */}
      {win && (
        <Pressable style={styles.overlay} onPress={() => setWin(null)}>
          <Animated.View style={[styles.winCard, { transform: [{ scale: winPop.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }], opacity: winPop }]}>
            <LinearGradient colors={['#FFD56B', '#F59E0B', '#E0710E']} style={styles.winTop}>
              <MaterialCommunityIcons name="trophy" size={42} color="#FFFFFF" />
              <Text style={styles.winTitle}>Congratulations</Text>
            </LinearGradient>
            <View style={styles.winBody}>
              <Text style={styles.winLabel}>Lottery results</Text>
              <View style={styles.winDice}>
                {win.result.dice.map((v, i) => (
                  <DieFace key={i} value={v} size={34} />
                ))}
                <Text style={styles.winSum}>= {win.result.sum}</Text>
              </View>
              <Text style={styles.winLabel}>Bonus</Text>
              <Text style={styles.winAmount}>₹{win.amount.toFixed(2)}</Text>
              <Text style={styles.winPeriod}>
                Period: K3 {DURATION_LABEL[duration]} · {win.period}
              </Text>
            </View>
          </Animated.View>
        </Pressable>
      )}

      {/* Rules */}
      {showRules && (
        <Pressable style={styles.overlay} onPress={() => setShowRules(false)}>
          <View style={styles.rulesCard}>
            <LinearGradient colors={[G1, G2]} style={styles.rulesHead}>
              <Text style={styles.rulesTitle}>How to play</Text>
            </LinearGradient>
            <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ padding: 14, gap: 8 }}>
              {[
                `Three dice are thrown at the end of every period. ${DURATION_LABEL[duration]} per period; betting closes in the last ${lockSeconds} seconds.`,
                `Total: bet on the sum (3–18). Big = 11–18, Small = 3–10, Odd / Even on the sum — ${multOf('BIG') || 1.8}X.`,
                `2 same: a pair such as 22 wins when at least two dice show 2 (${multOf('PAIR:2')}X). A pair plus a number, e.g. 22+5, needs exactly 2, 2, 5 (${multOf('PAIRSINGLE:2-5')}X).`,
                `3 same: a triple such as 444 (${multOf('TRIPLE:4')}X), or any triple (${multOf('ANYTRIPLE')}X).`,
                `Different: pick 3+ numbers for "3 different" — every group of three you picked is one bet (${multOf('DIFF3:1-2-3')}X). "2 different" wins when both numbers show (${multOf('DIFF2:1-2')}X). 3 continuous: 123, 234, 345 or 456 in any order (${multOf('STRAIGHT')}X).`,
                `Bet ₹${minStake}–₹${maxStake} per selection, max win ₹${maxPayout} per bet. Amount = balance × quantity × multiplier.`,
                'Provably fair: each period’s dice come from a server seed whose hash is published before the period, and the seed itself after it.',
              ].map((t, i) => (
                <Text key={i} style={styles.rulesText}>
                  • {t}
                </Text>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      )}

      {toast && (
        <View pointerEvents="none" style={[styles.toastWrap, { bottom: (sheetOpen ? sheetH : 0) + insets.bottom + 20 }]}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}
    </View>
  );
}

/** Home-screen tile art: three dice on the green felt. */
export function K3TileArt({ size }: { size: number }) {
  const d = size * 0.34;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
      <View style={{ transform: [{ rotate: '-12deg' }] }}>
        <DieFace value={4} size={d} />
      </View>
      <View style={{ transform: [{ translateY: -d * 0.3 }] }}>
        <DieFace value={6} size={d} />
      </View>
      <View style={{ transform: [{ rotate: '10deg' }] }}>
        <DieFace value={1} size={d} />
      </View>
    </View>
  );
}

const TONE = {
  purple: { off: '#EFE6FB', on: '#8E44AD', text: '#7A3AA0' },
  pink: { off: '#FDE7EF', on: '#D6336C', text: '#C2255C' },
  green: { off: '#E3F6EA', on: '#1FA75C', text: '#12743F' },
  red: { off: '#FDE8EA', on: '#D91F37', text: '#C2142B' },
  gold: { off: '#FFF4D6', on: '#E0A000', text: '#A77400' },
} as const;

const shadow = { shadowColor: '#0B3D22', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE_BG },
  // Height is set inline: status bar + icon row + the part the wallet card overlaps.
  header: { borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden' },
  deco: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.07)' },
  decoDie: { position: 'absolute', opacity: 0.3 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, height: 44 },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#FFFFFF', fontSize: 19, fontWeight: '900', letterSpacing: 1 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 12, ...shadow },
  wallet: { marginTop: -110, alignItems: 'center', paddingVertical: 16 },
  walletRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  walletAmount: { color: INK, fontSize: 26, fontWeight: '900' },
  walletLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  walletLabel: { color: MUTED, fontSize: 13, fontWeight: '600' },
  walletBtns: { flexDirection: 'row', gap: 14, marginTop: 14 },
  walletBtn: { width: 128, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  walletBtnOutline: { borderWidth: 1.5, borderColor: G2, backgroundColor: '#FFFFFF' },
  walletBtnText: { fontSize: 15, fontWeight: '800' },
  durations: { marginTop: 12, flexDirection: 'row', padding: 6, gap: 6 },
  durTab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12, overflow: 'hidden' },
  durIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2EF', marginBottom: 4 },
  durText: { color: MUTED, fontSize: 11, fontWeight: '700' },
  ticket: { marginTop: 12, height: 118, borderRadius: 14, flexDirection: 'row', ...shadow },
  notch: { position: 'absolute', left: '52%', marginLeft: -9, width: 18, height: 18, borderRadius: 9, backgroundColor: PAGE_BG },
  ticketLeft: { width: '52%', padding: 12, justifyContent: 'space-between' },
  howBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)' },
  howText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  ticketGame: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  ticketDice: { flexDirection: 'row', gap: 4 },
  ticketDivider: { width: 0, marginVertical: 12, borderLeftWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)', borderStyle: 'dashed' },
  ticketRight: { flex: 1, padding: 12, alignItems: 'flex-end', justifyContent: 'space-between' },
  ticketLabel: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  digits: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  digit: { width: 24, height: 32, borderRadius: 5, backgroundColor: '#F4FBF7', alignItems: 'center', justifyContent: 'center' },
  digitText: { color: G2, fontSize: 20, fontWeight: '900' },
  digitColon: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', marginHorizontal: 1 },
  ticketPeriod: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  machine: { marginTop: 12, borderRadius: 18, padding: 10, borderWidth: 2, borderColor: GOLD, ...shadow },
  machineTop: { alignItems: 'center', marginBottom: 6 },
  machineTitle: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  machineBody: { flexDirection: 'row', alignItems: 'center' },
  pointer: { width: 0, height: 0, borderTopWidth: 10, borderBottomWidth: 10, borderTopColor: 'transparent', borderBottomColor: 'transparent' },
  pointerLeft: { borderLeftWidth: 14, borderLeftColor: GOLD, marginRight: 6 },
  pointerRight: { borderRightWidth: 14, borderRightColor: GOLD, marginLeft: 6 },
  windowsWrap: { flex: 1, flexDirection: 'row', justifyContent: 'space-evenly', paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  window: { borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  dieShadow: { position: 'absolute', left: 3, top: 5, backgroundColor: 'rgba(0,0,0,0.4)' },
  resultRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 10, minHeight: 26, alignItems: 'center' },
  resultChip: { paddingHorizontal: 14, paddingVertical: 4, borderRadius: 13 },
  resultChipText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  resultWait: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '700' },
  betCard: { marginTop: 12 },
  betTabs: { flexDirection: 'row', backgroundColor: '#EEF2EF', borderRadius: 12, padding: 4, marginBottom: 12 },
  betTab: { flex: 1, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  betTabText: { color: MUTED, fontSize: 13, fontWeight: '800' },
  ballGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  ballCell: { width: '24%', alignItems: 'center', paddingVertical: 6, borderRadius: 12 },
  ballCellOn: { backgroundColor: '#FFF6DA' },
  ballNum: { fontWeight: '900' },
  ballOdds: { color: MUTED, fontSize: 11, fontWeight: '700', marginTop: 3 },
  bsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  bsBtn: { flex: 1, height: 52, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  bsBtnOn: { borderWidth: 3, borderColor: GOLD },
  bsText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  bsOdds: { color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '800' },
  sectionHint: { color: INK, fontSize: 13, fontWeight: '700', marginTop: 4, marginBottom: 8 },
  oddsEm: { color: '#D91F37', fontWeight: '900' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  pill: { minWidth: 46, height: 42, paddingHorizontal: 8, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pillOn: { borderWidth: 2, borderColor: GOLD },
  pillText: { fontSize: 16, fontWeight: '900' },
  lockOverlay: { position: 'absolute', left: -12, right: -12, top: -60, bottom: -12, borderRadius: 18, backgroundColor: 'rgba(8,40,22,0.72)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
  lockDigit: { width: 86, height: 120, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  lockDigitText: { color: G2, fontSize: 80, fontWeight: '900' },
  histTabs: { flexDirection: 'row', gap: 8, marginTop: 18 },
  histTab: { flex: 1, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  histTabText: { color: MUTED, fontSize: 13, fontWeight: '800' },
  tableHead: { flexDirection: 'row', alignItems: 'center', height: 40, paddingHorizontal: 8 },
  th: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', textAlign: 'center' },
  tr: { flexDirection: 'row', alignItems: 'center', minHeight: 40, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E3E9E5' },
  td: { color: INK, fontSize: 13, textAlign: 'center' },
  empty: { color: MUTED, textAlign: 'center', padding: 20 },
  chartDot: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center' },
  chartDotText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  chartEmpty: { color: '#C8D2CC', fontSize: 12, fontWeight: '700' },
  myRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, backgroundColor: '#F7FAF8' },
  myBadge: { minWidth: 58, maxWidth: 90, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  myBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  myPeriod: { color: INK, fontSize: 12, fontWeight: '800' },
  myMeta: { color: MUTED, fontSize: 11, fontWeight: '600', marginTop: 2 },
  myStatus: { fontSize: 13, fontWeight: '900' },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 30, paddingVertical: 14 },
  pageBtn: { width: 40, height: 40, borderRadius: 8, backgroundColor: G2, alignItems: 'center', justifyContent: 'center' },
  pageText: { color: INK, fontSize: 14, fontWeight: '800' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden', ...shadow, elevation: 20 },
  sheetHead: { paddingVertical: 12, alignItems: 'center' },
  sheetTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
  sheetSel: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', marginTop: 4, paddingHorizontal: 20 },
  sheetBody: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12, gap: 10 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetLabel: { color: INK, fontSize: 14, fontWeight: '800' },
  sheetChoices: { flexDirection: 'row', gap: 6 },
  choice: { minWidth: 44, height: 30, paddingHorizontal: 8, borderRadius: 6, backgroundColor: '#EEF2EF', alignItems: 'center', justifyContent: 'center' },
  choiceOn: { backgroundColor: G1 },
  choiceText: { color: INK, fontSize: 13, fontWeight: '800' },
  qtyBox: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyBtn: { width: 30, height: 30, borderRadius: 6, backgroundColor: G1, alignItems: 'center', justifyContent: 'center' },
  qtyText: { minWidth: 52, textAlign: 'center', color: INK, fontSize: 15, fontWeight: '900', paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#DCE4DF' },
  multRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 6 },
  multBtn: { minWidth: 46, height: 30, borderRadius: 6, backgroundColor: '#EEF2EF', alignItems: 'center', justifyContent: 'center' },
  agreeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  agreeText: { color: INK, fontSize: 12, fontWeight: '600', flex: 1 },
  sheetInfo: { color: MUTED, fontSize: 12, fontWeight: '700' },
  sheetFoot: { flexDirection: 'row', height: 52 },
  cancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E9EEEB' },
  cancelText: { color: MUTED, fontSize: 15, fontWeight: '800' },
  totalBtn: { flex: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  totalText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', zIndex: 1000, elevation: 40 },
  winCard: { width: 290, borderRadius: 22, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  winTop: { alignItems: 'center', paddingVertical: 18, gap: 6 },
  winTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  winBody: { alignItems: 'center', padding: 16, gap: 6 },
  winLabel: { color: MUTED, fontSize: 12, fontWeight: '700' },
  winDice: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  winSum: { color: INK, fontSize: 18, fontWeight: '900', marginLeft: 4 },
  winAmount: { color: '#E0710E', fontSize: 30, fontWeight: '900' },
  winPeriod: { color: MUTED, fontSize: 11, fontWeight: '600' },
  rulesCard: { width: '88%', borderRadius: 18, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  rulesHead: { paddingVertical: 12, alignItems: 'center' },
  rulesTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
  rulesText: { color: INK, fontSize: 13, lineHeight: 19 },
  toastWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 1001, elevation: 41 },
  toastText: { color: '#FFFFFF', backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, overflow: 'hidden', fontWeight: '700' },
});
