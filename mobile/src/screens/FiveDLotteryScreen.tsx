import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient as SvgLinearGradient, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { ApiClientError } from '../api/client';
import {
  FiveDConfig,
  FiveDDuration,
  FiveDHistoryEntry,
  FiveDMyBet,
  FiveDRoundView,
  fetchFiveDConfig,
  fetchFiveDCurrent,
  fetchFiveDHistory,
  fetchFiveDMyBets,
  placeFiveDBets,
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
const C_BIG = '#F39A1E';
const C_SMALL = '#3D8BEA';
const C_ODD = '#E5283F';
const C_EVEN = '#1FA75C';
const DURATIONS: FiveDDuration[] = [60, 180, 300, 600];
const DURATION_LABEL: Record<FiveDDuration, string> = { 60: '1 Min', 180: '3 Min', 300: '5 Min', 600: '10 Min' };
const POSITIONS = ['A', 'B', 'C', 'D', 'E'] as const;
type Tab = (typeof POSITIONS)[number] | 'SUM';
const TABS: Tab[] = [...POSITIONS, 'SUM'];
const UNIT_VALUES = [1, 10, 50, 100];
const MULTIPLIERS = [1, 5, 10, 20, 50, 100];
const ROWS_PER_PAGE = 10;
const MIN_ROLL_MS = 1800;
const TOAST_MS = 1800;
const WIN_MS = 3500;
// Reel strip: digits 0-9 repeated. Resting in lap 2, spinning through laps
// 2-4 and landing at most ~2.6 laps in, so 42 cells always fill the window.
const REEL_CELLS = 42;
const SPIN_LAP_MS = 420; // one lap of ten digits at full speed
const SPIN_UP_MS = 2 * SPIN_LAP_MS; // ease-in over one lap ends at full speed
const REEL_MIN_TRAVEL = 5; // cells a reel still rolls after it starts stopping
const REEL_OVERSHOOT = 0.3; // of a cell, before settling back
const REEL_STOP_MIN_MS = 600;
const REEL_STOP_MAX_MS = 1100;
const REEL_SETTLE_MS = 180;
const REEL_STAGGER_MS = 240;
// Time for the last reel to land: the ticket and history reveal the draw only then.
const LAND_MS = 4 * REEL_STAGGER_MS + REEL_STOP_MAX_MS + REEL_SETTLE_MS + 150;
type HistoryTab = 'game' | 'chart' | 'my';
type Pick = 'BIG' | 'SMALL' | 'ODD' | 'EVEN';
const PICKS: { key: Pick; label: string; color: string }[] = [
  { key: 'BIG', label: 'Big', color: C_BIG },
  { key: 'SMALL', label: 'Small', color: C_SMALL },
  { key: 'ODD', label: 'Odd', color: C_ODD },
  { key: 'EVEN', label: 'Even', color: C_EVEN },
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

/** "A:7" -> "A 7", "SUM:BIG" -> "Sum Big". */
function labelFor(key: string): string {
  const [pos, what] = key.split(':');
  const w = /^\d$/.test(what) ? what : what[0] + what.slice(1).toLowerCase();
  return `${pos === 'SUM' ? 'Sum' : pos} ${w}`;
}

// ---------- art ----------

/** A glossy numbered ball for the digit grid and results. */
const DigitBall = memo(function DigitBall({ d, size, on, tone = G2 }: { d: number; size: number; on?: boolean; tone?: string }) {
  const r = size / 2;
  const id = `fdb${on ? 'on' : 'off'}${tone.slice(1)}`;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={id} cx="38%" cy="32%" r="72%">
          <Stop offset="0" stopColor={on ? '#7EE0A6' : '#FFFFFF'} />
          <Stop offset="0.6" stopColor={on ? '#1FA75C' : '#F1F4F2'} />
          <Stop offset="1" stopColor={on ? '#0B6534' : '#D3DBD6'} />
        </RadialGradient>
      </Defs>
      <Circle cx={r} cy={r} r={r - 1} fill={`url(#${id})`} stroke={on ? GOLD : tone} strokeWidth={on ? 2.5 : 1.5} />
      <SvgText x={r} y={r + size * 0.14} fontSize={size * 0.42} fontWeight="bold" fill={on ? '#FFFFFF' : tone} textAnchor="middle">
        {d}
      </SvgText>
    </Svg>
  );
});

/** Clock face for the duration tabs. */
function ClockIcon({ on, size }: { on: boolean; size: number }) {
  const r = size / 2;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={on ? 'fdcOn' : 'fdcOff'} cx="40%" cy="35%" r="70%">
          <Stop offset="0" stopColor={on ? '#6BE59C' : '#E4E8E6'} />
          <Stop offset="1" stopColor={on ? '#138A48' : '#AEB8B2'} />
        </RadialGradient>
      </Defs>
      <Circle cx={r} cy={r} r={r - 1} fill={`url(#${on ? 'fdcOn' : 'fdcOff'})`} stroke="#FFFFFF" strokeWidth={2} />
      <Line x1={r} y1={r} x2={r} y2={r * 0.45} stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" />
      <Line x1={r} y1={r} x2={r * 1.38} y2={r * 1.2} stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" />
      <Circle cx={r} cy={r} r={2.2} fill="#FFFFFF" />
    </Svg>
  );
}

/**
 * One slot-machine reel: a strip of repeating digits. It spins up while the
 * period is being drawn, keeps turning until its turn to stop, then rolls
 * forward onto its digit at the speed it was spinning and settles with a
 * small overshoot. The strip repeats every 10 cells, so any cell showing the
 * same digit is the same face and the offset can be re-based invisibly.
 */
function Reel({ digit, rolling, delay, w, cellH }: { digit: number; rolling: boolean; delay: number; w: number; cellH: number }) {
  // Resting / landing offset of the strip.
  const y = useRef(new Animated.Value(-(10 + digit) * cellH)).current;
  // 0 -> 1 is one lap of ten digits while spinning. Loops reset it to its
  // initial 0 on every platform, so it is kept separate from y.
  const spin = useRef(new Animated.Value(0)).current;
  const translateY = useMemo(() => Animated.add(y, spin.interpolate({ inputRange: [0, 1], outputRange: [0, -10 * cellH] })), [y, spin, cellH]);
  const wasRolling = useRef(false);
  const runRef = useRef<Animated.CompositeAnimation | null>(null);
  const bump = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (rolling) {
      wasRolling.current = true;
      runRef.current?.stop();
      spin.setValue(0);
      y.setValue(-(10 + digit) * cellH);
      runRef.current = Animated.sequence([
        // Accelerate over one lap to exactly the looping speed.
        Animated.timing(y, { toValue: -(20 + digit) * cellH, duration: SPIN_UP_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.loop(Animated.timing(spin, { toValue: 1, duration: SPIN_LAP_MS, easing: Easing.linear, useNativeDriver: true })),
      ]);
      runRef.current.start();
      return;
    }
    if (!wasRolling.current) {
      runRef.current?.stop();
      runRef.current = null;
      spin.setValue(0);
      y.setValue(-(10 + digit) * cellH);
      return;
    }
    const t = setTimeout(() => {
      wasRolling.current = false;
      runRef.current?.stop();
      runRef.current = null;
      y.stopAnimation((yv) =>
        spin.stopAnimation((sv) => {
          // Current cell, re-based onto the same face in the second lap.
          const cur = -yv / cellH + sv * 10;
          const p = 10 + (((cur % 10) + 10) % 10);
          spin.setValue(0);
          y.setValue(-p * cellH);
          let target = Math.ceil(p + REEL_MIN_TRAVEL);
          target += (digit - (target % 10) + 10) % 10;
          // Ease-out that starts at the spinning speed.
          const dur = Math.min(REEL_STOP_MAX_MS, Math.max(REEL_STOP_MIN_MS, ((target + REEL_OVERSHOOT - p) * 2 * SPIN_LAP_MS) / 10));
          runRef.current = Animated.sequence([
            Animated.timing(y, { toValue: -(target + REEL_OVERSHOOT) * cellH, duration: dur, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(y, { toValue: -target * cellH, duration: REEL_SETTLE_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          ]);
          runRef.current.start(({ finished }) => {
            if (!finished) return;
            bump.setValue(0);
            Animated.sequence([
              Animated.timing(bump, { toValue: 1, duration: 140, useNativeDriver: true }),
              Animated.timing(bump, { toValue: 0, duration: 260, useNativeDriver: true }),
            ]).start();
          });
        })
      );
    }, delay);
    return () => clearTimeout(t);
    // Driven by the roll state and the digit to land on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolling, digit]);

  const windowH = cellH * 1.5;
  return (
    <Animated.View style={[styles.reel, { width: w, height: windowH, transform: [{ scale: bump.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }] }]}>
      <LinearGradient colors={['#FFFFFF', '#F3EFE4', '#E4DDCB']} style={StyleSheet.absoluteFill} />
      <Animated.View style={{ position: 'absolute', left: 0, right: 0, top: (windowH - cellH) / 2, transform: [{ translateY }] }}>
        {Array.from({ length: REEL_CELLS }, (_, i) => (
          <View key={i} style={{ height: cellH, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={[styles.reelDigit, { fontSize: cellH * 0.68 }]}>{i % 10}</Text>
          </View>
        ))}
      </Animated.View>
      <LinearGradient pointerEvents="none" colors={['rgba(40,30,10,0.55)', 'rgba(40,30,10,0)']} style={[styles.reelShade, { top: 0, height: windowH * 0.3 }]} />
      <LinearGradient pointerEvents="none" colors={['rgba(40,30,10,0)', 'rgba(40,30,10,0.55)']} style={[styles.reelShade, { bottom: 0, height: windowH * 0.3 }]} />
    </Animated.View>
  );
}

// ---------- screen ----------

export default function FiveDLotteryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<FiveDConfig | null>(null);
  const [duration, setDuration] = useState<FiveDDuration>(60);
  const [round, setRound] = useState<FiveDRoundView | null>(null);
  const [history, setHistory] = useState<FiveDHistoryEntry[]>([]);
  const [myBets, setMyBets] = useState<FiveDMyBet[]>([]);
  const [rolling, setRolling] = useState(false);
  // The drawn digits while the reels are landing on them, before the reveal.
  const [landing, setLanding] = useState<number[] | null>(null);
  const [tab, setTab] = useState<Tab>('A');
  const [picks, setPicks] = useState<Pick[]>([]);
  const [digits, setDigits] = useState<number[]>([]);
  const [unit, setUnit] = useState(1);
  const [qty, setQty] = useState(1);
  const [mult, setMult] = useState(1);
  const [agree, setAgree] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [historyTab, setHistoryTab] = useState<HistoryTab>('game');
  const [chartPos, setChartPos] = useState(0);
  const [page, setPage] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [win, setWin] = useState<{ amount: number; period: string; result: FiveDHistoryEntry } | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [sheetH, setSheetH] = useState(380);
  const [, setTick] = useState(0);

  const offsetRef = useRef(0);
  const mountedRef = useRef(true);
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const endedRef = useRef<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheet = useRef(new Animated.Value(0)).current;
  const winPop = useRef(new Animated.Value(0)).current;
  const lockPulse = useRef(new Animated.Value(1)).current;

  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const maxPayout = config?.maxPayout ?? 10000;
  const lockSeconds = config?.lockSeconds ?? 5;
  const multOf = useCallback((key: string) => config?.multipliers?.[key] ?? (/^\w+:\d$/.test(key) ? 9 : 1.8), [config]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const loadRound = useCallback(async (d: FiveDDuration) => {
    const sentAt = Date.now();
    const v = await fetchFiveDCurrent(d);
    const receivedAt = Date.now();
    if (!mountedRef.current || durationRef.current !== d) return;
    offsetRef.current = new Date(v.serverTime).getTime() - (sentAt + receivedAt) / 2;
    setRound(v);
  }, []);

  const loadMyBets = useCallback(async () => {
    try {
      const rows = await fetchFiveDMyBets(50);
      if (mountedRef.current) setMyBets(rows);
      return rows;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchFiveDConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => {});
    loadMyBets();
    return () => {
      mountedRef.current = false;
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [loadMyBets]);

  useEffect(() => {
    setRound(null);
    setHistory([]);
    setRolling(false);
    setLanding(null);
    setPage(0);
    endedRef.current = null;
    loadRound(duration).catch(() => {});
    fetchFiveDHistory(duration, 50)
      .then((h) => mountedRef.current && durationRef.current === duration && setHistory(h))
      .catch(() => {});
  }, [duration, loadRound]);

  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 250);
    const sync = setInterval(() => loadRound(durationRef.current).catch(() => {}), 15000);
    return () => {
      clearInterval(id);
      clearInterval(sync);
    };
  }, [loadRound]);

  const srvNow = Date.now() + offsetRef.current;
  const endMs = round ? new Date(round.endTime).getTime() : 0;
  const secsLeft = round ? Math.ceil(Math.max(0, endMs - srvNow) / 1000) : 0;
  const locked = !!round && secsLeft <= lockSeconds;

  useEffect(() => {
    if (!locked) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(lockPulse, { toValue: 1.08, duration: 250, useNativeDriver: true }),
        Animated.timing(lockPulse, { toValue: 1, duration: 250, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [locked, lockPulse]);

  // Period over: spin the reels, move to the next period, wait for the
  // draw, stop the reels on it and pay out any win.
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
      let h: FiveDHistoryEntry[] | null = null;
      for (let i = 0; i < 12 && mountedRef.current && durationRef.current === d; i++) {
        try {
          const rows = await fetchFiveDHistory(d, 50);
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
      if (h) setLanding(h[0].digits);
      setRolling(false);
      await new Promise((r) => setTimeout(r, h ? LAND_MS : 0));
      if (!mountedRef.current || durationRef.current !== d) return;
      if (h) setHistory(h);
      setLanding(null);
      const bets = await loadMyBets();
      const mine = (bets ?? []).filter((b) => b.periodNumber === period && b.durationSeconds === d);
      if (mine.length > 0) refreshWallet();
      const won = round2(mine.reduce((s, b) => s + (b.status === 'WON' ? Number(b.payout) : 0), 0));
      if (won > 0 && h) {
        setWin({ amount: won, period, result: h[0] });
        winPop.setValue(0);
        Animated.spring(winPop, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }).start();
      }
    })();
  }, [round, srvNow, endMs, duration, loadRound, loadMyBets, refreshWallet, winPop]);

  useEffect(() => {
    if (!win) return;
    const id = setTimeout(() => setWin(null), WIN_MS);
    return () => clearTimeout(id);
  }, [win]);

  // ---- selection ----
  const clearSelection = useCallback(() => {
    setPicks([]);
    setDigits([]);
  }, []);
  const keys = useMemo(
    () => [...PICKS.filter((p) => picks.includes(p.key)).map((p) => `${tab}:${p.key}`), ...[...digits].sort((a, b) => a - b).map((d) => `${tab}:${d}`)],
    [tab, picks, digits]
  );
  const sheetOpen = keys.length > 0;
  useEffect(() => {
    Animated.timing(sheet, { toValue: sheetOpen ? 1 : 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    if (!sheetOpen) setQty(1);
  }, [sheetOpen, sheet]);

  const togglePick = (p: Pick) => {
    if (locked) return showToast('Betting is closed for this period');
    setPicks((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  };
  const toggleDigit = (d: number) => {
    if (locked) return showToast('Betting is closed for this period');
    setDigits((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
  };

  const perBet = round2(unit * qty * mult);
  const totalCost = round2(perBet * keys.length);

  const confirm = async () => {
    if (!round || placing || keys.length === 0) return;
    if (!agree) return showToast('Please agree to the pre-sale rules');
    if (locked) return showToast('Betting is closed for this period');
    if (perBet < minStake) return showToast(`Minimum ₹${minStake} per bet`);
    if (perBet > maxStake) return showToast(`Max ₹${maxStake} per bet`);
    const capped = keys.find((k) => perBet * multOf(k) > maxPayout);
    if (capped) return showToast(`Max ₹${Math.floor(maxPayout / multOf(capped))} on ${labelFor(capped)} (max win ₹${maxPayout})`);
    if (totalCost > coins) return showToast('Insufficient balance');
    setPlacing(true);
    try {
      await placeFiveDBets(duration, keys.map((area) => ({ area, amount: perBet })));
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
  const reelW = Math.min(54, (cardW - 20 - 28 - 4 * 8) / 5);
  const cellH = Math.min(60, reelW * 1.15);
  const ballSize = Math.min(50, (cardW - 24 - 4 * 12) / 5);
  const last = history[0] ?? null;
  const shown = last?.digits ?? [0, 0, 0, 0, 0];
  const reelDigits = landing ?? shown;
  const drawing = rolling || !!landing;
  const mm = String(Math.floor(secsLeft / 60)).padStart(2, '0');
  const ss = String(secsLeft % 60).padStart(2, '0');
  const rows = history.slice(0, 50);
  const pageCount = Math.max(1, Math.ceil((historyTab === 'my' ? myBets.length : rows.length) / ROWS_PER_PAGE));
  const pageRows = rows.slice(page * ROWS_PER_PAGE, page * ROWS_PER_PAGE + ROWS_PER_PAGE);
  const myRows = myBets.slice(page * ROWS_PER_PAGE, page * ROWS_PER_PAGE + ROWS_PER_PAGE);
  const chartW = cardW;
  const chartRowH = 40;
  const chartX0 = chartW * 0.3;
  const chartStep = (chartW * 0.62) / 10;
  const isSum = tab === 'SUM';

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: (sheetOpen ? sheetH : 0) + insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <LinearGradient colors={[G1, G2, G3]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.header, { paddingTop: insets.top + 6, height: insets.top + 58 + 110 }]}>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <View style={[styles.deco, { width: 180, height: 180, borderRadius: 90, right: -50, top: -40 }]} />
            <View style={[styles.deco, { width: 110, height: 110, borderRadius: 55, left: -30, top: 90 }]} />
            <Text style={[styles.decoDigits, { top: insets.top + 12, right: 60 }]}>5D</Text>
          </View>
          <View style={styles.headerRow}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.headerBtn}>
              <MaterialCommunityIcons name="chevron-left" size={28} color="#FFFFFF" />
            </Pressable>
            <Text style={styles.headerTitle}>5D Lottery</Text>
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
                {on && <LinearGradient colors={['#3FC47A', G2]} style={[StyleSheet.absoluteFill, { borderRadius: 12 }]} />}
                {/* Wrapped so it stacks above the tab's gradient on every platform. */}
                <View>
                  <ClockIcon on={on} size={38} />
                </View>
                <Text style={[styles.durText, on && { color: '#FFFFFF' }]}>5D Lotre</Text>
                <Text style={[styles.durText, on && { color: '#FFFFFF' }]}>{DURATION_LABEL[d]}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Ticket: rules + last draw + countdown */}
        <View style={[styles.ticket, { marginHorizontal: pad }]}>
          <LinearGradient colors={[G1, G2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 14 }]} />
          <View style={[styles.notch, { top: -9 }]} />
          <View style={[styles.notch, { bottom: -9 }]} />
          <View style={styles.ticketLeft}>
            <Pressable onPress={() => setShowRules(true)} style={styles.howBtn}>
              <MaterialCommunityIcons name="file-document-outline" size={14} color="#FFFFFF" />
              <Text style={styles.howText}>How to play</Text>
            </Pressable>
            <Text style={styles.ticketGame}>5D Lotre {DURATION_LABEL[duration]}</Text>
            <View style={styles.ticketBalls}>
              {shown.map((d, i) => (
                <DigitBall key={i} d={d} size={22} />
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

        {/* The draw machine: five reels */}
        <View style={[styles.machine, { marginHorizontal: pad }]}>
          <LinearGradient colors={['#2DB36B', '#15824A', '#0D6437']} style={[StyleSheet.absoluteFill, { borderRadius: 18 }]} />
          <View style={styles.machineTop}>
            <Text style={styles.machineTitle}>{drawing ? 'Drawing…' : last ? `Result · ${last.periodNumber.slice(-6)}` : 'Waiting for the first result'}</Text>
          </View>
          <View style={styles.machineBody}>
            <View style={[styles.pointer, styles.pointerLeft]} />
            <LinearGradient colors={['#06341C', '#0A4A28']} style={styles.reelsWrap}>
              {POSITIONS.map((p, i) => (
                <View key={p} style={styles.reelCol}>
                  <View style={styles.reelBadge}>
                    <Text style={styles.reelBadgeText}>{p}</Text>
                  </View>
                  <View style={styles.reelFrame}>
                    <Reel digit={reelDigits[i]} rolling={rolling} delay={i * REEL_STAGGER_MS} w={reelW} cellH={cellH} />
                  </View>
                </View>
              ))}
            </LinearGradient>
            <View style={[styles.pointer, styles.pointerRight]} />
          </View>
          <View style={styles.resultRow}>
            {last && !drawing ? (
              <>
                <View style={[styles.resultChip, { backgroundColor: GOLD }]}>
                  <Text style={[styles.resultChipText, { color: '#4A3200' }]}>Sum {last.sum}</Text>
                </View>
                <View style={[styles.resultChip, { backgroundColor: last.sumSize === 'BIG' ? C_BIG : C_SMALL }]}>
                  <Text style={styles.resultChipText}>{last.sumSize === 'BIG' ? 'Big' : 'Small'}</Text>
                </View>
                <View style={[styles.resultChip, { backgroundColor: last.sumParity === 'ODD' ? C_ODD : C_EVEN }]}>
                  <Text style={styles.resultChipText}>{last.sumParity === 'ODD' ? 'Odd' : 'Even'}</Text>
                </View>
              </>
            ) : (
              <Text style={styles.resultWait}>{drawing ? 'Reels are spinning…' : '—'}</Text>
            )}
          </View>
        </View>

        {/* Betting */}
        <View style={[styles.card, { marginHorizontal: pad, marginTop: 12 }]}>
          <View style={styles.posTabs}>
            {TABS.map((t) => {
              const on = t === tab;
              return (
                <Pressable
                  key={t}
                  onPress={() => {
                    if (t === tab) return;
                    clearSelection();
                    setTab(t);
                  }}
                  style={[styles.posTab, t === 'SUM' && { width: 56 }]}
                >
                  {on && <LinearGradient colors={['#3FC47A', G2]} style={[StyleSheet.absoluteFill, { borderRadius: 21 }]} />}
                  <Text style={[styles.posTabText, on && { color: '#FFFFFF' }]}>{t}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.sectionHint}>
            {isSum ? 'Sum of all five digits · Big 23–45, Small 0–22' : `Position ${tab} · Big 5–9, Small 0–4 · pick one or more`}
          </Text>

          <View style={styles.pickRow}>
            {PICKS.map((p) => {
              const on = picks.includes(p.key);
              return (
                <Pressable key={p.key} onPress={() => togglePick(p.key)} style={[styles.pickBtn, on && styles.pickBtnOn]}>
                  <LinearGradient colors={[p.color, p.color + 'CC']} style={StyleSheet.absoluteFill} />
                  <Text style={styles.pickText}>{p.label}</Text>
                  <Text style={styles.pickRate}>{multOf(`${tab}:${p.key}`)}X</Text>
                </Pressable>
              );
            })}
          </View>

          {!isSum && (
            <View style={styles.ballPanel}>
              {Array.from({ length: 10 }, (_, d) => {
                const on = digits.includes(d);
                return (
                  <Pressable key={d} onPress={() => toggleDigit(d)} style={styles.ballCell}>
                    <DigitBall d={d} size={ballSize} on={on} />
                    <Text style={styles.ballRate}>{multOf(`${tab}:${d}`)}X</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {locked && (
            <View style={styles.lockOverlay}>
              {[ss[0], ss[1]].map((c, i) => (
                <Animated.View key={i} style={[styles.lockDigit, { transform: [{ scale: lockPulse }] }]}>
                  <Text style={styles.lockDigitText}>{c}</Text>
                </Animated.View>
              ))}
            </View>
          )}
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
                <Text style={[styles.th, { flex: 2 }]}>Result</Text>
                <Text style={[styles.th, { flex: 1 }]}>Sum</Text>
              </LinearGradient>
              {pageRows.map((h, i) => (
                <View key={h.periodNumber} style={[styles.tr, i % 2 === 1 && { backgroundColor: '#F7FAF8' }]}>
                  <Text style={[styles.td, { flex: 1.5, fontSize: 11 }]}>{h.periodNumber}</Text>
                  <View style={{ flex: 2, flexDirection: 'row', justifyContent: 'center', gap: 3 }}>
                    {h.digits.map((d, j) => (
                      <DigitBall key={j} d={d} size={20} />
                    ))}
                  </View>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                    <Text style={[styles.td, { fontWeight: '900', color: G2 }]}>{h.sum}</Text>
                    <View style={[styles.miniBadge, { backgroundColor: h.sumSize === 'BIG' ? C_BIG : C_SMALL }]}>
                      <Text style={styles.miniBadgeText}>{h.sumSize === 'BIG' ? 'B' : 'S'}</Text>
                    </View>
                    <View style={[styles.miniBadge, { backgroundColor: h.sumParity === 'ODD' ? C_ODD : C_EVEN }]}>
                      <Text style={styles.miniBadgeText}>{h.sumParity === 'ODD' ? 'O' : 'E'}</Text>
                    </View>
                  </View>
                </View>
              ))}
              {pageRows.length === 0 && <Text style={styles.empty}>No results yet</Text>}
            </>
          )}

          {historyTab === 'chart' && (
            <>
              <View style={styles.chartPosRow}>
                {POSITIONS.map((p, i) => (
                  <Pressable key={p} onPress={() => setChartPos(i)} style={[styles.chartPos, chartPos === i && { backgroundColor: G1, borderColor: G1 }]}>
                    <Text style={[styles.chartPosText, chartPos === i && { color: '#FFFFFF' }]}>{p}</Text>
                  </Pressable>
                ))}
              </View>
              <LinearGradient colors={[G1, G2]} style={styles.tableHead}>
                <Text style={[styles.th, { width: chartX0 - 8 }]}>Period</Text>
                <Text style={[styles.th, { flex: 1 }]}>Position {POSITIONS[chartPos]}</Text>
              </LinearGradient>
              <View style={{ height: Math.max(1, pageRows.length) * chartRowH }}>
                <Svg width={chartW} height={Math.max(1, pageRows.length) * chartRowH} style={StyleSheet.absoluteFill}>
                  {pageRows.slice(0, -1).map((h, i) => (
                    <Line
                      key={h.periodNumber}
                      x1={chartX0 + chartStep * (h.digits[chartPos] + 0.5)}
                      y1={chartRowH * (i + 0.5)}
                      x2={chartX0 + chartStep * (pageRows[i + 1].digits[chartPos] + 0.5)}
                      y2={chartRowH * (i + 1.5)}
                      stroke="#E0463D"
                      strokeWidth={1.6}
                    />
                  ))}
                </Svg>
                {pageRows.map((h, i) => {
                  const v = h.digits[chartPos];
                  return (
                    <View key={h.periodNumber} style={[styles.chartRow, { height: chartRowH, top: i * chartRowH }]}>
                      <Text style={[styles.td, { width: chartX0, fontSize: 11 }]}>{h.periodNumber.slice(-8)}</Text>
                      {Array.from({ length: 10 }, (_, n) => (
                        <View key={n} style={{ width: chartStep, alignItems: 'center' }}>
                          <View style={[styles.chartCell, n === v && { backgroundColor: v >= 5 ? C_BIG : C_SMALL, borderColor: v >= 5 ? C_BIG : C_SMALL }]}>
                            <Text style={[styles.chartCellText, n === v && { color: '#FFFFFF' }]}>{n}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  );
                })}
              </View>
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
                        ₹{Number(b.amount).toFixed(2)} @ {Number(b.multiplier)}X{b.result ? `  ·  ${b.result.digits.join(' ')} = ${b.result.sum}` : ''}
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

      {/* Bet sheet: sized by its content so large system fonts never hide a row */}
      <Animated.View
        pointerEvents={sheetOpen ? 'auto' : 'none'}
        onLayout={(e) => setSheetH(e.nativeEvent.layout.height)}
        style={[styles.sheet, { paddingBottom: insets.bottom + 8, transform: [{ translateY: sheet.interpolate({ inputRange: [0, 1], outputRange: [sheetH + 40, 0] }) }] }]}
      >
        <LinearGradient colors={[G1, G2]} style={styles.sheetHead}>
          <Text style={styles.sheetTitle}>5D Lotre {DURATION_LABEL[duration]}</Text>
          <Text style={styles.sheetSel} numberOfLines={1}>
            Select: {keys.length > 5 ? `${keys.slice(0, 5).map(labelFor).join(', ')} +${keys.length - 5}` : keys.map(labelFor).join(', ')}
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
            <Text style={styles.agreeText}>I agree</Text>
            <Text style={styles.agreeLink}>《Pre-sale rules》</Text>
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
          <Animated.View style={[styles.winCard, { opacity: winPop, transform: [{ scale: winPop.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }]}>
            <LinearGradient colors={['#FFD56B', '#F59E0B', '#E0710E']} style={styles.winTop}>
              <MaterialCommunityIcons name="trophy" size={42} color="#FFFFFF" />
              <Text style={styles.winTitle}>Congratulations</Text>
            </LinearGradient>
            <View style={styles.winBody}>
              <Text style={styles.winLabel}>Lottery results</Text>
              <View style={styles.winDigits}>
                {win.result.digits.map((d, i) => (
                  <View key={i} style={{ alignItems: 'center' }}>
                    <Text style={styles.winPos}>{POSITIONS[i]}</Text>
                    <DigitBall d={d} size={32} />
                  </View>
                ))}
              </View>
              <Text style={styles.winSum}>
                Sum {win.result.sum} · {win.result.sumSize === 'BIG' ? 'Big' : 'Small'} · {win.result.sumParity === 'ODD' ? 'Odd' : 'Even'}
              </Text>
              <Text style={styles.winLabel}>Bonus</Text>
              <Text style={styles.winAmount}>₹{win.amount.toFixed(2)}</Text>
              <Text style={styles.winPeriod}>
                Period: 5D {DURATION_LABEL[duration]} · {win.period}
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
                `Five digits A, B, C, D, E (each 0–9) are drawn every period (${DURATION_LABEL[duration]}). Betting closes in the last ${lockSeconds} seconds.`,
                `Position bets (A–E): the exact digit pays ${multOf('A:0')}X. Big (5–9), Small (0–4), Odd or Even pay ${multOf('A:BIG')}X.`,
                `Sum bets: the five digits added up (0–45). Big (23–45), Small (0–22), Odd or Even pay ${multOf('SUM:BIG')}X.`,
                'Pick as many as you like in a tab — every pick is its own bet.',
                `Bet amount = balance × quantity × multiplier; ₹${minStake}–₹${maxStake} per bet, max win ₹${maxPayout}.`,
                'Provably fair: each period’s digits come from a server seed whose hash is published before the period, and the seed itself after it.',
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

/** Home-screen tile art: a row of five mini reels. */
export function FiveDTileArt({ size }: { size: number }) {
  const w = size * 0.16;
  return (
    <View style={{ flexDirection: 'row', gap: 2, padding: 4, borderRadius: 8, backgroundColor: '#06341C', borderWidth: 1.5, borderColor: GOLD }}>
      {[5, 2, 8, 0, 7].map((d, i) => (
        <View key={i} style={{ width: w, height: w * 1.35, borderRadius: 4, backgroundColor: '#FBF8EF', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#2A1F08', fontWeight: '900', fontSize: w * 0.8 }}>{d}</Text>
        </View>
      ))}
    </View>
  );
}

const shadow = { shadowColor: '#0B3D22', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE_BG },
  // Height is set inline: status bar + icon row + the part the wallet card overlaps.
  header: { borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden' },
  deco: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.07)' },
  decoDigits: { position: 'absolute', color: 'rgba(255,255,255,0.18)', fontSize: 30, fontWeight: '900', fontStyle: 'italic' },
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
  durTab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12, overflow: 'hidden', gap: 2 },
  durText: { color: MUTED, fontSize: 11, fontWeight: '700' },
  ticket: { marginTop: 12, height: 118, borderRadius: 14, flexDirection: 'row', ...shadow },
  notch: { position: 'absolute', left: '54%', marginLeft: -9, width: 18, height: 18, borderRadius: 9, backgroundColor: PAGE_BG },
  ticketLeft: { width: '54%', padding: 12, justifyContent: 'space-between' },
  howBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)' },
  howText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  ticketGame: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  ticketBalls: { flexDirection: 'row', gap: 3 },
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
  pointerLeft: { borderLeftWidth: 12, borderLeftColor: GOLD, marginRight: 4 },
  pointerRight: { borderRightWidth: 12, borderRightColor: GOLD, marginLeft: 4 },
  reelsWrap: { flex: 1, flexDirection: 'row', justifyContent: 'space-evenly', paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  reelCol: { alignItems: 'center', gap: 5 },
  reelBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' },
  reelBadgeText: { color: '#4A3200', fontSize: 12, fontWeight: '900' },
  reelFrame: { padding: 3, borderRadius: 10, backgroundColor: '#C9A24A' },
  reel: { borderRadius: 8, overflow: 'hidden' },
  reelDigit: { color: '#2A1F08', fontWeight: '900' },
  reelShade: { position: 'absolute', left: 0, right: 0 },
  resultRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 10, minHeight: 26, alignItems: 'center' },
  resultChip: { paddingHorizontal: 14, paddingVertical: 4, borderRadius: 13 },
  resultChipText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  resultWait: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '700' },
  posTabs: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#EEF2EF', borderRadius: 24, padding: 3 },
  posTab: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  posTabText: { color: MUTED, fontSize: 16, fontWeight: '900' },
  sectionHint: { color: MUTED, fontSize: 12, fontWeight: '700', marginTop: 10, marginBottom: 8 },
  pickRow: { flexDirection: 'row', gap: 8 },
  pickBtn: { flex: 1, height: 52, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  pickBtnOn: { borderWidth: 3, borderColor: GOLD },
  pickText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  pickRate: { color: 'rgba(255,255,255,0.92)', fontSize: 11, fontWeight: '800' },
  ballPanel: { marginTop: 12, padding: 10, borderRadius: 14, backgroundColor: '#F1F4F2', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  ballCell: { width: '19%', alignItems: 'center', paddingVertical: 4 },
  ballRate: { color: MUTED, fontSize: 11, fontWeight: '700', marginTop: 2 },
  lockOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 18, backgroundColor: 'rgba(8,40,22,0.7)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
  lockDigit: { width: 86, height: 120, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  lockDigitText: { color: G2, fontSize: 80, fontWeight: '900' },
  histTabs: { flexDirection: 'row', gap: 8, marginTop: 18 },
  histTab: { flex: 1, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  histTabText: { color: MUTED, fontSize: 13, fontWeight: '800' },
  tableHead: { flexDirection: 'row', alignItems: 'center', height: 40, paddingHorizontal: 8 },
  th: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', textAlign: 'center' },
  tr: { flexDirection: 'row', alignItems: 'center', minHeight: 42, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E3E9E5' },
  td: { color: INK, fontSize: 13, textAlign: 'center' },
  miniBadge: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  miniBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
  empty: { color: MUTED, textAlign: 'center', padding: 20 },
  chartPosRow: { flexDirection: 'row', gap: 8, padding: 10, justifyContent: 'center' },
  chartPos: { width: 36, height: 30, borderRadius: 8, borderWidth: 1.5, borderColor: '#C9D1CC', alignItems: 'center', justifyContent: 'center' },
  chartPosText: { color: MUTED, fontSize: 14, fontWeight: '900' },
  chartRow: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E3E8E5' },
  chartCell: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: '#C9D1CC', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  chartCellText: { color: '#9AA5A0', fontSize: 10, fontWeight: '800' },
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
  agreeText: { color: INK, fontSize: 12, fontWeight: '600' },
  agreeLink: { color: '#E5283F', fontSize: 12, fontWeight: '700', flex: 1 },
  sheetInfo: { color: MUTED, fontSize: 12, fontWeight: '700' },
  sheetFoot: { flexDirection: 'row', height: 52 },
  cancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E9EEEB' },
  cancelText: { color: MUTED, fontSize: 15, fontWeight: '800' },
  totalBtn: { flex: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  totalText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', zIndex: 1000, elevation: 40 },
  winCard: { width: 300, borderRadius: 22, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  winTop: { alignItems: 'center', paddingVertical: 18, gap: 6 },
  winTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  winBody: { alignItems: 'center', padding: 16, gap: 6 },
  winLabel: { color: MUTED, fontSize: 12, fontWeight: '700' },
  winDigits: { flexDirection: 'row', gap: 6 },
  winPos: { color: MUTED, fontSize: 10, fontWeight: '900', marginBottom: 2 },
  winSum: { color: INK, fontSize: 14, fontWeight: '900' },
  winAmount: { color: '#E0710E', fontSize: 30, fontWeight: '900' },
  winPeriod: { color: MUTED, fontSize: 11, fontWeight: '600' },
  rulesCard: { width: '88%', borderRadius: 18, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  rulesHead: { paddingVertical: 12, alignItems: 'center' },
  rulesTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
  rulesText: { color: INK, fontSize: 13, lineHeight: 19 },
  toastWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 1001, elevation: 41 },
  toastText: { color: '#FFFFFF', backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, overflow: 'hidden', fontWeight: '700' },
});
