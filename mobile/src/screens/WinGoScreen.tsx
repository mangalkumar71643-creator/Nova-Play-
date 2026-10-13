import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient as SvgLinearGradient, Path, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { ApiClientError } from '../api/client';
import {
  WinGoConfig,
  WinGoDuration,
  WinGoHistoryEntry,
  WinGoMyBet,
  WinGoRoundView,
  fetchWinGoConfig,
  fetchWinGoCurrent,
  fetchWinGoHistory,
  fetchWinGoMyBets,
  placeWinGoBets,
} from '../api/backend';
import { useGameState } from '../state/GameStateContext';

// ---------- theme ----------

const G1 = '#26A15D';
const G2 = '#177A43';
const G3 = '#0F6034';
const PAGE_BG = '#F2F4F3';
const INK = '#1E2A23';
const MUTED = '#8A968F';
const C_GREEN = '#1DB25E';
const C_RED = '#F0445A';
const C_VIOLET = '#A559E6';
const C_BIG = '#F6A93B';
const C_SMALL = '#5C9DF2';
// Same order as the original screen: 1 Min first.
const DURATIONS: WinGoDuration[] = [60, 30, 180, 300, 600];
/** The original Win Go's serif lettering for labels and buttons. */
const SERIF = 'serif';
const DURATION_LABEL: Record<WinGoDuration, string> = { 30: '30S', 60: '1Min', 180: '3Min', 300: '5Min', 600: '10Min' };
const UNIT_VALUES = [1, 10, 50, 100];
const MULTIPLIERS = [1, 5, 10, 20, 50, 100];
const ROWS_PER_PAGE = 10;
const TOAST_MS = 1800;
const WIN_MS = 3500;
const FALLBACK = { number: 9, size: 1.8, violet: 4.5, color: 1.9, colorMixed: 1.4 };

type HistoryTab = 'game' | 'chart' | 'my';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

function colorsOf(n: number): ('GREEN' | 'RED' | 'VIOLET')[] {
  if (n === 0) return ['RED', 'VIOLET'];
  if (n === 5) return ['GREEN', 'VIOLET'];
  return n % 2 === 0 ? ['RED'] : ['GREEN'];
}

const HEX = { GREEN: C_GREEN, RED: C_RED, VIOLET: C_VIOLET } as const;

function keyColor(key: string): string {
  if (key.startsWith('NUM:')) return HEX[colorsOf(Number(key.slice(4)))[0]];
  if (key === 'BIG') return C_BIG;
  if (key === 'SMALL') return C_SMALL;
  return HEX[key as 'GREEN' | 'RED' | 'VIOLET'];
}

function keyLabel(key: string): string {
  if (key.startsWith('NUM:')) return key.slice(4);
  return key[0] + key.slice(1).toLowerCase();
}

// ---------- art ----------

/** A glossy number ball; 0 and 5 are split with violet. */
export const NumberBall = memo(function NumberBall({ n, size }: { n: number; size: number }) {
  const cols = colorsOf(n).map((c) => HEX[c]);
  const r = size / 2;
  const id = `wgb${n}`;
  const text = cols[0];
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={`${id}s`} cx="35%" cy="30%" r="75%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.55} />
          <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
        <SvgLinearGradient id={`${id}t`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={text} />
          <Stop offset="1" stopColor={cols[1] ?? text} />
        </SvgLinearGradient>
      </Defs>
      {cols.length === 1 ? (
        <Circle cx={r} cy={r} r={r - 1} fill={cols[0]} />
      ) : (
        <G>
          <Path d={`M ${r} 1 A ${r - 1} ${r - 1} 0 0 0 ${r} ${size - 1} Z`} fill={cols[0]} />
          <Path d={`M ${r} 1 A ${r - 1} ${r - 1} 0 0 1 ${r} ${size - 1} Z`} fill={cols[1]} />
        </G>
      )}
      {/* chip rim marks */}
      <Circle cx={r} cy={r} r={r * 0.82} fill="none" stroke="#FFFFFF" strokeWidth={r * 0.14} strokeDasharray={`${(2 * Math.PI * r * 0.82) / 16} ${(2 * Math.PI * r * 0.82) / 16}`} opacity={0.55} />
      <Circle cx={r} cy={r} r={r * 0.6} fill="#FFFFFF" />
      <Circle cx={r} cy={r} r={r - 1} fill={`url(#${id}s)`} />
      <SvgText x={r} y={r + size * 0.14} fontSize={size * 0.42} fontWeight="bold" fill={`url(#${id}t)`} textAnchor="middle">
        {n}
      </SvgText>
    </Svg>
  );
});

/** Clock face used on the duration tabs. */
function ClockIcon({ on, size }: { on: boolean; size: number }) {
  const r = size / 2;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={on ? 'wgcOn' : 'wgcOff'} cx="40%" cy="35%" r="70%">
          <Stop offset="0" stopColor={on ? '#6BE59C' : '#E4E8E6'} />
          <Stop offset="1" stopColor={on ? '#138A48' : '#AEB8B2'} />
        </RadialGradient>
      </Defs>
      <Circle cx={r} cy={r} r={r - 1} fill={`url(#${on ? 'wgcOn' : 'wgcOff'})`} stroke="#FFFFFF" strokeWidth={2} />
      <Line x1={r} y1={r} x2={r} y2={r * 0.45} stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" />
      <Line x1={r} y1={r} x2={r * 1.38} y2={r * 1.2} stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" />
      <Circle cx={r} cy={r} r={2.2} fill="#FFFFFF" />
    </Svg>
  );
}

// ---------- screen ----------

export default function WinGoScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<WinGoConfig | null>(null);
  const [duration, setDuration] = useState<WinGoDuration>(60);
  const [round, setRound] = useState<WinGoRoundView | null>(null);
  const [history, setHistory] = useState<WinGoHistoryEntry[]>([]);
  const [myBets, setMyBets] = useState<WinGoMyBet[]>([]);
  const [selection, setSelection] = useState<string | null>(null);
  const [unit, setUnit] = useState(1);
  const [qty, setQty] = useState(1);
  const [mult, setMult] = useState(1);
  const [agree, setAgree] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [randomFlash, setRandomFlash] = useState<number | null>(null);
  const [historyTab, setHistoryTab] = useState<HistoryTab>('game');
  const [page, setPage] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [win, setWin] = useState<{ amount: number; period: string; result: WinGoHistoryEntry } | null>(null);
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
  const lockPulse = useRef(new Animated.Value(1)).current;

  const P = config?.payouts ?? FALLBACK;
  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const maxPayout = config?.maxPayout ?? 10000;
  const lockSeconds = config?.lockSeconds ?? 5;
  const rateOf = (key: string) => (key.startsWith('NUM:') ? P.number : key === 'BIG' || key === 'SMALL' ? P.size : key === 'VIOLET' ? P.violet : P.color);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const loadRound = useCallback(async (d: WinGoDuration) => {
    const sentAt = Date.now();
    const v = await fetchWinGoCurrent(d);
    const receivedAt = Date.now();
    if (!mountedRef.current || durationRef.current !== d) return;
    offsetRef.current = new Date(v.serverTime).getTime() - (sentAt + receivedAt) / 2;
    setRound(v);
  }, []);

  const loadMyBets = useCallback(async () => {
    try {
      const rows = await fetchWinGoMyBets(50);
      if (mountedRef.current) setMyBets(rows);
      return rows;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchWinGoConfig()
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
    setPage(0);
    setSelection(null);
    endedRef.current = null;
    loadRound(duration).catch(() => {});
    fetchWinGoHistory(duration, 100)
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
  }, [locked, secsLeft, lockPulse]);

  // Round over: next round, the result, and any win.
  useEffect(() => {
    if (!round || srvNow < endMs || endedRef.current === round.periodNumber) return;
    const period = round.periodNumber;
    const d = duration;
    endedRef.current = period;
    setSelection(null);
    (async () => {
      await new Promise((r) => setTimeout(r, 400));
      loadRound(d).catch(() => {});
      let h: WinGoHistoryEntry[] | null = null;
      for (let i = 0; i < 12 && mountedRef.current && durationRef.current === d; i++) {
        try {
          const rows = await fetchWinGoHistory(d, 100);
          if (rows[0]?.periodNumber === period) {
            h = rows;
            break;
          }
        } catch {
          // retry below
        }
        await new Promise((r) => setTimeout(r, 700));
      }
      if (!mountedRef.current || durationRef.current !== d || !h) return;
      setHistory(h);
      const bets = await loadMyBets();
      const mine = (bets ?? []).filter((b) => b.periodNumber === period && b.durationSeconds === d);
      if (mine.length > 0) refreshWallet();
      const won = round2(mine.reduce((s, b) => s + (b.status === 'WON' ? Number(b.payout) : 0), 0));
      if (won > 0) {
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

  const sheetOpen = !!selection;
  useEffect(() => {
    Animated.timing(sheet, { toValue: sheetOpen ? 1 : 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    if (!sheetOpen) setQty(1);
  }, [sheetOpen, sheet]);

  const choose = (key: string) => {
    if (locked) return showToast('Betting is closed for this period');
    setSelection(key);
  };

  // "Random": a quick run across the balls, then a number is picked.
  const pickRandom = () => {
    if (locked) return showToast('Betting is closed for this period');
    let steps = 0;
    const id = setInterval(() => {
      steps += 1;
      const n = Math.floor(Math.random() * 10);
      setRandomFlash(n);
      if (steps >= 12) {
        clearInterval(id);
        setTimeout(() => {
          if (!mountedRef.current) return;
          setRandomFlash(null);
          setSelection(`NUM:${n}`);
        }, 180);
      }
    }, 85);
  };

  const perBet = round2(unit * qty * mult);

  const confirm = async () => {
    if (!selection || !round || placing) return;
    if (!agree) return showToast('Please agree to the pre-sale rules');
    if (locked) return showToast('Betting is closed for this period');
    if (perBet < minStake) return showToast(`Minimum ₹${minStake}`);
    if (perBet > maxStake) return showToast(`Max ₹${maxStake} per bet`);
    if (perBet * rateOf(selection) > maxPayout) return showToast(`Max ₹${Math.floor(maxPayout / rateOf(selection))} here (max win ₹${maxPayout})`);
    if (perBet > coins) return showToast('Insufficient balance');
    setPlacing(true);
    try {
      await placeWinGoBets(duration, [{ area: selection, amount: perBet }]);
      showToast(`Bet placed · ₹${perBet.toFixed(2)}`);
      setSelection(null);
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
  const ballSize = Math.min(54, (W - pad * 2 - 24 - 4 * 14) / 5);
  const mm = String(Math.floor(secsLeft / 60)).padStart(2, '0');
  const ss = String(secsLeft % 60).padStart(2, '0');
  const rows = history.slice(0, 100);
  const pageCount = Math.max(1, Math.ceil((historyTab === 'my' ? myBets.length : rows.length) / ROWS_PER_PAGE));
  const pageRows = rows.slice(page * ROWS_PER_PAGE, page * ROWS_PER_PAGE + ROWS_PER_PAGE);
  const myRows = myBets.slice(page * ROWS_PER_PAGE, page * ROWS_PER_PAGE + ROWS_PER_PAGE);
  const [sheetH, setSheetH] = useState(380);
  const selColor = selection ? keyColor(selection) : G1;
  const chartW = W - pad * 2;
  const chartRowH = 42;
  const chartX0 = chartW * 0.3;
  const chartStep = (chartW * 0.58) / 10;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: (sheetOpen ? sheetH : 0) + insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <LinearGradient colors={[G1, G2, G3]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.header, { paddingTop: insets.top + 4, height: insets.top + 60 + 130 }]}>
          <View pointerEvents="none" style={[styles.headerArc, { width: W * 1.4, height: W * 1.4, borderRadius: W * 0.7, right: -W * 0.9, top: -W * 0.55 }]} />
          <View style={styles.headerRow}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.headerBtn}>
              <MaterialCommunityIcons name="chevron-left" size={30} color="#FFFFFF" />
            </Pressable>
            <View style={styles.headerRight}>
              <Pressable onPress={() => navigation.navigate('Help')} hitSlop={8} style={styles.headerIcon}>
                <MaterialCommunityIcons name="headset" size={20} color="#FFFFFF" />
              </Pressable>
              <Pressable onPress={() => setShowRules(true)} hitSlop={8} style={styles.headerIcon}>
                <MaterialCommunityIcons name="information-variant" size={20} color="#FFFFFF" />
              </Pressable>
            </View>
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
            <MaterialCommunityIcons name="wallet" size={18} color={G2} />
            <Text style={styles.walletLabel}>Wallet balance</Text>
          </View>
          <View style={styles.walletBtns}>
            <Pressable onPress={() => navigation.navigate('Withdraw')} style={[styles.walletBtn, styles.walletBtnOutline]}>
              <Text style={[styles.walletBtnText, { color: G2 }]}>Withdraw</Text>
            </Pressable>
            <Pressable onPress={() => navigation.navigate('Deposit')} style={styles.walletBtn}>
              <LinearGradient colors={[G2, G3]} style={[StyleSheet.absoluteFill, { borderRadius: 22 }]} />
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
                  <ClockIcon on={on} size={40} />
                </View>
                <Text style={[styles.durText, on && { color: '#FFFFFF' }]}>Win Go</Text>
                <Text style={[styles.durText, on && { color: '#FFFFFF' }]}>{DURATION_LABEL[d]}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Ticket: rules, last results, countdown */}
        <View style={[styles.ticket, { marginHorizontal: pad }]}>
          <LinearGradient colors={['#2FAE67', G2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 14 }]} />
          <View style={[styles.notch, { top: -9 }]} />
          <View style={[styles.notch, { bottom: -9 }]} />
          <View style={styles.ticketLeft}>
            <Pressable onPress={() => setShowRules(true)} style={styles.howBtn}>
              <MaterialCommunityIcons name="file-document-outline" size={14} color="#FFFFFF" />
              <Text style={styles.howText}>How to play</Text>
            </Pressable>
            <Text style={styles.ticketGame}>Win Go {DURATION_LABEL[duration]}</Text>
            <View style={styles.ticketBalls}>
              {history.slice(0, 5).map((h) => (
                <NumberBall key={h.periodNumber} n={h.number} size={24} />
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
                  <View key={i} style={styles.digit}>
                    <Text style={styles.digitText}>{round ? c : '-'}</Text>
                  </View>
                )
              )}
            </View>
            <Text style={styles.ticketPeriod}>{round?.periodNumber ?? '—'}</Text>
          </View>
        </View>

        {/* Betting */}
        <View style={[styles.card, { marginHorizontal: pad, marginTop: 12 }]}>
          <View style={styles.colorRow}>
            {(
              [
                { key: 'GREEN', label: 'Green', rate: P.color, style: styles.btnGreen, colors: ['#3FD17F', '#16994F'] },
                { key: 'VIOLET', label: 'Violet', rate: P.violet, style: styles.btnViolet, colors: ['#C184F5', '#8C3FD8'] },
                { key: 'RED', label: 'Red', rate: P.color, style: styles.btnRed, colors: ['#FF7385', '#E0263E'] },
              ] as const
            ).map((b) => (
              <Pressable key={b.key} onPress={() => choose(b.key)} style={({ pressed }) => [styles.colorBtn, b.style, pressed && { opacity: 0.85 }]}>
                <LinearGradient colors={[b.colors[0], b.colors[1]]} style={StyleSheet.absoluteFill} />
                <Text style={styles.colorBtnText}>{b.label}</Text>
                <Text style={styles.colorBtnRate}>{b.rate}X</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.ballPanel}>
            {Array.from({ length: 10 }, (_, n) => (
              <Pressable key={n} onPress={() => choose(`NUM:${n}`)} style={[styles.ballCell, randomFlash === n && styles.ballFlash]}>
                <NumberBall n={n} size={ballSize} />
                <Text style={styles.ballRate}>{P.number}X</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.multRow}>
            <Pressable onPress={pickRandom} style={styles.randomBtn}>
              <Text style={styles.randomText}>Random</Text>
            </Pressable>
            {MULTIPLIERS.map((m) => (
              <Pressable key={m} onPress={() => setMult(m)} style={[styles.multBtn, mult === m && styles.multOn]}>
                <Text style={[styles.multText, mult === m && { color: '#FFFFFF' }]}>X{m}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.bsPill}>
            <Pressable onPress={() => choose('BIG')} style={styles.bsHalf}>
              <LinearGradient colors={['#FFC260', C_BIG]} style={StyleSheet.absoluteFill} />
              <Text style={styles.bsText}>Big</Text>
              <Text style={styles.bsRate}>{P.size}X</Text>
            </Pressable>
            <Pressable onPress={() => choose('SMALL')} style={styles.bsHalf}>
              <LinearGradient colors={['#7DB4FF', C_SMALL]} style={StyleSheet.absoluteFill} />
              <Text style={styles.bsText}>Small</Text>
              <Text style={styles.bsRate}>{P.size}X</Text>
            </Pressable>
          </View>

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
                style={[styles.histTab, !on && { backgroundColor: '#E6E9E7' }]}
              >
                {on && <LinearGradient colors={[G1, G3]} style={[StyleSheet.absoluteFill, { borderRadius: 10 }]} />}
                <Text style={[styles.histTabText, on && { color: '#FFFFFF' }]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.card, { marginHorizontal: pad, marginTop: 10, overflow: 'hidden', padding: 0 }]}>
          {historyTab === 'game' && (
            <>
              <LinearGradient colors={[G1, G2]} style={styles.tableHead}>
                <Text style={[styles.th, { flex: 1.7 }]}>Period</Text>
                <Text style={[styles.th, { flex: 1 }]}>Number</Text>
                <Text style={[styles.th, { flex: 1.1 }]}>Big Small</Text>
                <Text style={[styles.th, { flex: 0.9 }]}>Color</Text>
              </LinearGradient>
              {pageRows.map((h, i) => (
                <View key={h.periodNumber} style={[styles.tr, i % 2 === 1 && { backgroundColor: '#F7F9F8' }]}>
                  <Text style={[styles.td, { flex: 1.7, fontSize: 12 }]}>{h.periodNumber}</Text>
                  <Text style={[styles.tdNum, { flex: 1, color: HEX[h.colors[0]] }]}>{h.number}</Text>
                  <Text style={[styles.td, { flex: 1.1, fontWeight: '700' }]}>{h.size === 'BIG' ? 'Big' : 'Small'}</Text>
                  <View style={{ flex: 0.9, flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
                    {h.colors.map((c) => (
                      <View key={c} style={[styles.dot, { backgroundColor: HEX[c] }]} />
                    ))}
                  </View>
                </View>
              ))}
              {pageRows.length === 0 && <Text style={styles.empty}>No results yet</Text>}
            </>
          )}

          {historyTab === 'chart' && (
            <>
              <LinearGradient colors={[G1, G2]} style={styles.tableHead}>
                <Text style={[styles.th, { flex: 1 }]}>Period</Text>
                <Text style={[styles.th, { flex: 2 }]}>Number</Text>
              </LinearGradient>
              <View style={{ height: Math.max(1, pageRows.length) * chartRowH }}>
                <Svg width={chartW} height={Math.max(1, pageRows.length) * chartRowH} style={StyleSheet.absoluteFill}>
                  {pageRows.slice(0, -1).map((h, i) => {
                    const next = pageRows[i + 1];
                    return (
                      <Line
                        key={h.periodNumber}
                        x1={chartX0 + chartStep * (h.number + 0.5)}
                        y1={chartRowH * (i + 0.5)}
                        x2={chartX0 + chartStep * (next.number + 0.5)}
                        y2={chartRowH * (i + 1.5)}
                        stroke="#E0463D"
                        strokeWidth={1.6}
                      />
                    );
                  })}
                </Svg>
                {pageRows.map((h, i) => (
                  <View key={h.periodNumber} style={[styles.chartRow, { height: chartRowH, top: i * chartRowH }]}>
                    <Text style={[styles.td, { width: chartX0, fontSize: 11 }]}>{h.periodNumber}</Text>
                    {Array.from({ length: 10 }, (_, n) => {
                      const hit = n === h.number;
                      return (
                        <View key={n} style={{ width: chartStep, alignItems: 'center' }}>
                          <View style={[styles.chartCell, hit && { backgroundColor: HEX[h.colors[0]], borderColor: HEX[h.colors[0]] }]}>
                            <Text style={[styles.chartCellText, hit && { color: '#FFFFFF' }]}>{n}</Text>
                          </View>
                        </View>
                      );
                    })}
                    <View style={[styles.sizeBadge, { backgroundColor: h.size === 'BIG' ? C_BIG : C_SMALL }]}>
                      <Text style={styles.sizeBadgeText}>{h.size === 'BIG' ? 'B' : 'S'}</Text>
                    </View>
                  </View>
                ))}
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
                    <View style={[styles.myBadge, { backgroundColor: keyColor(b.area) }]}>
                      <Text style={styles.myBadgeText}>{keyLabel(b.area)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.myPeriod}>{b.periodNumber}</Text>
                      <Text style={styles.myMeta}>
                        Win Go {DURATION_LABEL[b.durationSeconds]} · ₹{Number(b.amount).toFixed(2)}
                        {b.result ? `  ·  Result ${b.result.number}` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <View style={[styles.statusTag, { borderColor: won ? C_GREEN : lost ? C_RED : MUTED }]}>
                        <Text style={[styles.statusTagText, { color: won ? C_GREEN : lost ? C_RED : MUTED }]}>{won ? 'Succeed' : lost ? 'Failed' : 'Pending'}</Text>
                      </View>
                      <Text style={[styles.myAmount, { color: won ? C_GREEN : lost ? C_RED : MUTED }]}>
                        {won ? `+₹${Number(b.payout).toFixed(2)}` : lost ? `-₹${Number(b.amount).toFixed(2)}` : ''}
                      </Text>
                    </View>
                  </View>
                );
              })}
              {myRows.length === 0 && <Text style={styles.empty}>No bets yet</Text>}
            </View>
          )}

          <View style={styles.pager}>
            <Pressable onPress={() => setPage((p) => Math.max(0, p - 1))} style={[styles.pageBtn, page === 0 && { opacity: 0.35 }]}>
              <MaterialCommunityIcons name="chevron-left" size={26} color="#FFFFFF" />
            </Pressable>
            <Text style={styles.pageText}>
              {page + 1}/{pageCount}
            </Text>
            <Pressable onPress={() => setPage((p) => Math.min(pageCount - 1, p + 1))} style={[styles.pageBtn, page >= pageCount - 1 && { opacity: 0.35 }]}>
              <MaterialCommunityIcons name="chevron-right" size={26} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* Bet sheet, tinted by the selection */}
      <Animated.View
        pointerEvents={sheetOpen ? 'auto' : 'none'}
        onLayout={(e) => setSheetH(e.nativeEvent.layout.height)}
        style={[styles.sheet, { paddingBottom: insets.bottom + 6, transform: [{ translateY: sheet.interpolate({ inputRange: [0, 1], outputRange: [sheetH + 40, 0] }) }] }]}
      >
        <View style={[styles.sheetHead, { backgroundColor: selColor }]}>
          <Text style={styles.sheetTitle}>Win Go {DURATION_LABEL[duration]}</Text>
          <View style={styles.sheetSelPill}>
            <Text style={[styles.sheetSelText, { color: selColor }]}>Select {selection ? keyLabel(selection) : ''}</Text>
          </View>
        </View>
        <View style={styles.sheetBody}>
          <View style={styles.sheetRow}>
            <Text style={styles.sheetLabel}>Balance</Text>
            <View style={styles.sheetChoices}>
              {UNIT_VALUES.map((v) => (
                <Pressable key={v} onPress={() => setUnit(v)} style={[styles.choice, unit === v && { backgroundColor: selColor }]}>
                  <Text style={[styles.choiceText, unit === v && { color: '#FFFFFF' }]}>{v}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.sheetRow}>
            <Text style={styles.sheetLabel}>Quantity</Text>
            <View style={styles.qtyBox}>
              <Pressable onPress={() => setQty((q) => Math.max(1, q - 1))} style={[styles.qtyBtn, { backgroundColor: selColor }]}>
                <MaterialCommunityIcons name="minus" size={18} color="#FFFFFF" />
              </Pressable>
              <Text style={styles.qtyText}>{qty}</Text>
              <Pressable onPress={() => setQty((q) => Math.min(500, q + 1))} style={[styles.qtyBtn, { backgroundColor: selColor }]}>
                <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
          <View style={styles.sheetMults}>
            {MULTIPLIERS.map((m) => (
              <Pressable key={m} onPress={() => setMult(m)} style={[styles.choice, mult === m && { backgroundColor: selColor }]}>
                <Text style={[styles.choiceText, mult === m && { color: '#FFFFFF' }]}>X{m}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => setAgree(!agree)} style={styles.agreeRow}>
            <MaterialCommunityIcons name={agree ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'} size={18} color={agree ? selColor : MUTED} />
            <Text style={styles.agreeText}>I agree</Text>
            <Text style={[styles.agreeLink, { color: C_RED }]}>《Pre-sale rules》</Text>
          </Pressable>
        </View>
        <View style={styles.sheetFoot}>
          <Pressable onPress={() => setSelection(null)} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable onPress={confirm} disabled={placing} style={[styles.totalBtn, { backgroundColor: selColor }]}>
            <Text style={styles.totalText}>{placing ? 'Placing…' : `Total amount ₹${perBet.toFixed(2)}`}</Text>
          </Pressable>
        </View>
      </Animated.View>

      {/* Win */}
      {win && (
        <Pressable style={styles.overlay} onPress={() => setWin(null)}>
          <Animated.View style={[styles.winCard, { opacity: winPop, transform: [{ scale: winPop.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }]}>
            <LinearGradient colors={['#FFD56B', '#F59E0B', '#E0710E']} style={styles.winTop}>
              <MaterialCommunityIcons name="trophy" size={44} color="#FFFFFF" />
              <Text style={styles.winTitle}>Congratulations</Text>
            </LinearGradient>
            <View style={styles.winBody}>
              <Text style={styles.winLabel}>Lottery results</Text>
              <View style={styles.winResult}>
                <View style={[styles.winTag, { backgroundColor: HEX[win.result.colors[0]] }]}>
                  <Text style={styles.winTagText}>{win.result.colors.map((c) => c[0] + c.slice(1).toLowerCase()).join(' ')}</Text>
                </View>
                <NumberBall n={win.result.number} size={34} />
                <View style={[styles.winTag, { backgroundColor: win.result.size === 'BIG' ? C_BIG : C_SMALL }]}>
                  <Text style={styles.winTagText}>{win.result.size === 'BIG' ? 'Big' : 'Small'}</Text>
                </View>
              </View>
              <Text style={styles.winLabel}>Bonus</Text>
              <Text style={styles.winAmount}>₹{win.amount.toFixed(2)}</Text>
              <Text style={styles.winPeriod}>
                Period: Win Go {DURATION_LABEL[duration]} · {win.period}
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
                `One number 0–9 is drawn every period (${DURATION_LABEL[duration]}). Betting closes in the last ${lockSeconds} seconds.`,
                `Green: 1, 3, 7, 9 pay ${P.color}X; 5 pays ${P.colorMixed}X.`,
                `Red: 2, 4, 6, 8 pay ${P.color}X; 0 pays ${P.colorMixed}X.`,
                `Violet: 0 or 5 pays ${P.violet}X.`,
                `Number: the exact number pays ${P.number}X.`,
                `Big (5–9) / Small (0–4): ${P.size}X.`,
                `Bet amount = balance × quantity × multiplier; ₹${minStake}–₹${maxStake} per bet, max win ₹${maxPayout}.`,
                'Provably fair: each period’s number comes from a server seed whose hash is published before the period, and the seed itself after it.',
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

const shadow = { shadowColor: '#0B3D22', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE_BG },
  // Height is set inline: status bar + icon row + the part the wallet card overlaps.
  header: { borderBottomRightRadius: 60, overflow: 'hidden' },
  headerArc: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.07)' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, height: 48 },
  headerBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  headerRight: { flexDirection: 'row', gap: 10, paddingRight: 6 },
  headerIcon: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 12, ...shadow },
  wallet: { marginTop: -130, alignItems: 'center', paddingVertical: 18, borderRadius: 24 },
  walletRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  walletAmount: { color: INK, fontSize: 26, fontWeight: '900' },
  walletLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  walletLabel: { fontFamily: SERIF, color: INK, fontSize: 15, fontWeight: '600' },
  walletBtns: { flexDirection: 'row', gap: 16, marginTop: 16 },
  walletBtn: { width: 132, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  walletBtnOutline: { borderWidth: 2, borderColor: G2, backgroundColor: '#FFFFFF' },
  walletBtnText: { fontFamily: SERIF, fontSize: 16, fontWeight: '800' },
  durations: { marginTop: 12, flexDirection: 'row', padding: 6, gap: 4 },
  durTab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12, overflow: 'hidden', gap: 2 },
  durText: { fontFamily: SERIF, color: MUTED, fontSize: 11, fontWeight: '700' },
  ticket: { marginTop: 12, height: 120, borderRadius: 14, flexDirection: 'row', ...shadow },
  notch: { position: 'absolute', left: '54%', marginLeft: -9, width: 18, height: 18, borderRadius: 9, backgroundColor: PAGE_BG },
  ticketLeft: { width: '54%', padding: 12, justifyContent: 'space-between' },
  howBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)' },
  howText: { fontFamily: SERIF, color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  ticketGame: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  ticketBalls: { flexDirection: 'row', gap: 4, minHeight: 24 },
  ticketDivider: { width: 0, marginVertical: 12, borderLeftWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)', borderStyle: 'dashed' },
  ticketRight: { flex: 1, padding: 12, alignItems: 'flex-end', justifyContent: 'space-between' },
  ticketLabel: { fontFamily: SERIF, color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  digits: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  digit: { width: 24, height: 32, borderRadius: 4, backgroundColor: '#F4FBF7', alignItems: 'center', justifyContent: 'center' },
  digitText: { color: G2, fontSize: 20, fontWeight: '900' },
  digitColon: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', marginHorizontal: 1 },
  ticketPeriod: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  colorRow: { flexDirection: 'row', gap: 10 },
  colorBtn: { flex: 1, height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, overflow: 'hidden' },
  btnGreen: { borderTopRightRadius: 14, borderBottomLeftRadius: 14, borderTopLeftRadius: 4, borderBottomRightRadius: 4 },
  btnViolet: { borderRadius: 10 },
  btnRed: { borderTopLeftRadius: 14, borderBottomRightRadius: 14, borderTopRightRadius: 4, borderBottomLeftRadius: 4 },
  colorBtnText: { fontFamily: SERIF, color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  colorBtnRate: { fontFamily: SERIF, color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  ballPanel: { marginTop: 12, padding: 10, borderRadius: 14, backgroundColor: '#F1F3F2', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  ballCell: { width: '19%', alignItems: 'center', paddingVertical: 4, borderRadius: 12 },
  ballFlash: { backgroundColor: '#FFE9A8' },
  ballRate: { color: MUTED, fontSize: 11, fontWeight: '700', marginTop: 2 },
  multRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12 },
  randomBtn: { height: 36, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1.5, borderColor: C_RED, alignItems: 'center', justifyContent: 'center' },
  randomText: { fontFamily: SERIF, color: C_RED, fontSize: 13, fontWeight: '800' },
  multBtn: { flex: 1, height: 36, borderRadius: 8, backgroundColor: '#F1F3F2', alignItems: 'center', justifyContent: 'center' },
  multOn: { backgroundColor: G1 },
  multText: { fontFamily: SERIF, color: INK, fontSize: 12, fontWeight: '800' },
  bsPill: { flexDirection: 'row', marginTop: 12, height: 48, borderRadius: 24, overflow: 'hidden' },
  bsHalf: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18 },
  bsText: { fontFamily: SERIF, color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
  bsRate: { fontFamily: SERIF, color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  lockOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.6)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  lockDigit: { width: 96, height: 140, borderRadius: 16, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  lockDigitText: { color: G2, fontSize: 96, fontWeight: '900' },
  histTabs: { flexDirection: 'row', gap: 8, marginTop: 18 },
  histTab: { flex: 1, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  histTabText: { fontFamily: SERIF, color: MUTED, fontSize: 14, fontWeight: '800' },
  tableHead: { flexDirection: 'row', alignItems: 'center', height: 42, paddingHorizontal: 8 },
  th: { fontFamily: SERIF, color: '#FFFFFF', fontSize: 13, fontWeight: '800', textAlign: 'center' },
  tr: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E3E8E5' },
  td: { color: INK, fontSize: 13, textAlign: 'center' },
  tdNum: { fontSize: 24, fontWeight: '900', textAlign: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6 },
  empty: { color: MUTED, textAlign: 'center', padding: 20 },
  chartRow: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E3E8E5' },
  chartCell: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: '#C9D1CC', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  chartCellText: { color: '#9AA5A0', fontSize: 10, fontWeight: '800' },
  sizeBadge: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  sizeBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  myRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, backgroundColor: '#F7F9F8' },
  myBadge: { minWidth: 50, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  myBadgeText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  myPeriod: { color: INK, fontSize: 13, fontWeight: '800' },
  myMeta: { color: MUTED, fontSize: 11, fontWeight: '600', marginTop: 2 },
  statusTag: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  statusTagText: { fontSize: 11, fontWeight: '800' },
  myAmount: { fontSize: 13, fontWeight: '900', marginTop: 3 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 34, paddingVertical: 16 },
  pageBtn: { width: 42, height: 42, borderRadius: 8, backgroundColor: G2, alignItems: 'center', justifyContent: 'center' },
  pageText: { color: INK, fontSize: 14, fontWeight: '800' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden', ...shadow, elevation: 20 },
  sheetHead: { paddingTop: 14, paddingBottom: 12, alignItems: 'center', gap: 8, borderBottomLeftRadius: 40, borderBottomRightRadius: 40 },
  sheetTitle: { fontFamily: SERIF, color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  sheetSelPill: { backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 4 },
  sheetSelText: { fontSize: 14, fontWeight: '800' },
  sheetBody: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, gap: 10 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetLabel: { fontFamily: SERIF, color: INK, fontSize: 15, fontWeight: '800' },
  sheetChoices: { flexDirection: 'row', gap: 6 },
  choice: { minWidth: 44, height: 30, paddingHorizontal: 8, borderRadius: 6, backgroundColor: '#F1F3F2', alignItems: 'center', justifyContent: 'center' },
  choiceText: { color: INK, fontSize: 13, fontWeight: '800' },
  qtyBox: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyBtn: { width: 30, height: 30, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  qtyText: { minWidth: 56, textAlign: 'center', color: INK, fontSize: 15, fontWeight: '900', paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#DCE3DF' },
  sheetMults: { flexDirection: 'row', justifyContent: 'flex-end', gap: 6 },
  agreeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  agreeText: { color: INK, fontSize: 13, fontWeight: '600' },
  agreeLink: { fontSize: 13, fontWeight: '700' },
  sheetFoot: { flexDirection: 'row', height: 52 },
  cancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF1EF' },
  cancelText: { fontFamily: SERIF, color: MUTED, fontSize: 15, fontWeight: '800' },
  totalBtn: { flex: 2, alignItems: 'center', justifyContent: 'center' },
  totalText: { fontFamily: SERIF, color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', zIndex: 1000, elevation: 40 },
  winCard: { width: 296, borderRadius: 22, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  winTop: { alignItems: 'center', paddingVertical: 18, gap: 6 },
  winTitle: { color: '#FFFFFF', fontSize: 23, fontWeight: '900', letterSpacing: 1 },
  winBody: { alignItems: 'center', padding: 16, gap: 8 },
  winLabel: { color: MUTED, fontSize: 12, fontWeight: '700' },
  winResult: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  winTag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  winTagText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  winAmount: { color: '#E0710E', fontSize: 30, fontWeight: '900' },
  winPeriod: { color: MUTED, fontSize: 11, fontWeight: '600' },
  rulesCard: { width: '88%', borderRadius: 18, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  rulesHead: { paddingVertical: 12, alignItems: 'center' },
  rulesTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
  rulesText: { color: INK, fontSize: 13, lineHeight: 19 },
  toastWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 1001, elevation: 41 },
  toastText: { color: '#FFFFFF', backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, overflow: 'hidden', fontWeight: '700' },
});
