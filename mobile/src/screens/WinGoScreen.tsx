import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import QuantityInputModal from '../components/QuantityInputModal';
import Svg, { Line } from 'react-native-svg';
import { ClockIcon, DigitBox, HouseBall, NumberBall, ResultNumber, WalletIcon } from '../components/WinGoArt';
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
import { NO_LIMIT, winLimit } from '../utils/limits';
import { fonts } from '../theme';

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
// The ⭐ House result: gold, darker for text on white.
const HOUSE_1 = '#FFD56B';
const HOUSE_2 = '#E59A12';
const HOUSE_INK = '#9A5F00';
// Same order as the original screen: 1 Min first.
const DURATIONS: WinGoDuration[] = [60, 30, 180, 300, 600];
/** The original Win Go's serif lettering for labels and buttons. */
const SERIF = 'serif';
const DURATION_LABEL: Record<WinGoDuration, string> = { 30: '30S', 60: '1Min', 180: '3Min', 300: '5Min', 600: '10Min' };
const DURATION_NAME: Record<WinGoDuration, string> = { 30: '30 second', 60: '1 minute', 180: '3 minute', 300: '5 minute', 600: '10 minute' };
const COLOR_BUTTONS = [
  { key: 'GREEN', label: 'Green', colors: ['#45D485', '#18A055'], edge: '#0E7E40' },
  { key: 'VIOLET', label: 'Violet', colors: ['#C88FF8', '#8E3EDB'], edge: '#6E26B5' },
  { key: 'RED', label: 'Red', colors: ['#FF7D8E', '#E62D47'], edge: '#B9182F' },
] as const;
const HIST_TABS = [
  { key: 'game', label: 'Game history' },
  { key: 'chart', label: 'Chart' },
  { key: 'my', label: 'My history' },
] as const;
const UNIT_VALUES = [1, 10, 50, 100];
const MULTIPLIERS = [1, 5, 10, 20, 50, 100];
const ROWS_PER_PAGE = 10;
const TOAST_MS = 1800;
const WIN_MS = 3500;
// Fair odds on the 4 periods in 5 that are not House (80% return).
const FALLBACK = { number: 10, size: 2, violet: 5, color: 2.1, colorMixed: 1.6 };
const FALLBACK_HOUSE_PERCENT = 0;
const FALLBACK_RTP_PERCENT = 80;

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

/** "9%", "45%": a chance as a whole (or one-decimal) percentage. */
export function pctText(p: number): string {
  return `${Math.round(p * 1000) / 10}%`;
}

// ---------- art (components/WinGoArt; Trx Win uses the balls from here too) ----------

export { HouseBall, NumberBall };

/** The "⭐ House" tag shown for a House result in tables and charts. */
export function HousePill({ size = 12, note }: { size?: number; note?: string }) {
  return (
    <View style={[styles.housePill, { paddingHorizontal: size * 0.6, paddingVertical: size * 0.15 }]}>
      <Text style={[styles.housePillText, { fontSize: size }]}>
        ⭐ House{note ? <Text style={[styles.housePillNote, { fontSize: size - 1 }]}>{`  ${note}`}</Text> : null}
      </Text>
    </View>
  );
}

const NOTICE =
  'Welcome to Win Go! A new result every period — pick Green, Violet, Red, a number, or Big / Small. Betting closes 5 seconds before each result. Good luck!';

/** The notice under the wallet: a line of text running right to left, and a Detail button (the rules). */
const NoticeBar = memo(function NoticeBar({ onDetail, marginH }: { onDetail: () => void; marginH: number }) {
  const x = useRef(new Animated.Value(0)).current;
  const [trackW, setTrackW] = useState(0);
  const [textW, setTextW] = useState(0);
  useEffect(() => {
    if (!trackW || !textW) return;
    x.setValue(trackW);
    const loop = Animated.loop(Animated.timing(x, { toValue: -textW, duration: ((trackW + textW) / 42) * 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [trackW, textW, x]);
  return (
    <View style={[styles.notice, { marginHorizontal: marginH }]}>
      <View style={styles.noticeIcon}>
        <MaterialCommunityIcons name="volume-high" size={20} color={G1} />
      </View>
      <View style={styles.noticeTrack} onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}>
        <Animated.View style={[styles.noticeRun, { transform: [{ translateX: x }] }]}>
          <Text style={styles.noticeText} onLayout={(e) => setTextW(e.nativeEvent.layout.width)}>
            {NOTICE}
          </Text>
        </Animated.View>
      </View>
      <Pressable onPress={onDetail} style={({ pressed }) => [styles.noticeBtn, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Detail">
        <LinearGradient colors={['#25A55E', '#137A3E']} style={[StyleSheet.absoluteFill, { borderRadius: 17 }]} />
        <MaterialCommunityIcons name="fire" size={15} color="#FFFFFF" />
        <Text style={styles.noticeBtnText}>Detail</Text>
      </Pressable>
    </View>
  );
});

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
  const [qtyOpen, setQtyOpen] = useState(false);
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
  const housePercent = config?.houseChancePercent ?? FALLBACK_HOUSE_PERCENT;
  const rtpPercent = config?.rtpPercent ?? FALLBACK_RTP_PERCENT;
  const leastStaked = config?.resultRule === 'LEAST_STAKED';
  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 100000;
  const maxPayout = config?.maxPayout ?? NO_LIMIT;
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

  // The period has ended but the next one hasn't loaded (a slow network):
  // keep asking every 2 s rather than waiting for the 15 s sync, so the
  // bet buttons don't stay closed.
  const staleRetryRef = useRef(0);
  useEffect(() => {
    if (!round || srvNow < endMs + 1500 || Date.now() - staleRetryRef.current < 2000) return;
    staleRetryRef.current = Date.now();
    loadRound(durationRef.current).catch(() => {});
  }, [round, srvNow, endMs, loadRound]);

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
      if (h[0].house && mine.length > 0) showToast('⭐ House result — every bet this period loses');
      const won = round2(mine.reduce((s, b) => s + (b.status === 'WON' ? Number(b.payout) : 0), 0));
      if (won > 0) {
        setWin({ amount: won, period, result: h[0] });
        winPop.setValue(0);
        Animated.spring(winPop, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }).start();
      }
    })();
  }, [round, srvNow, endMs, duration, loadRound, loadMyBets, refreshWallet, winPop, showToast]);

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
    if (perBet * rateOf(selection) > maxPayout) return showToast(`Max ₹${Math.floor(maxPayout / rateOf(selection))} here (max win ${winLimit(maxPayout)})`);
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
  const pad = 14;
  // Narrow phones: the three colour buttons get smaller lettering so the name and the rate don't touch.
  const narrow = W < 390;
  const ballSize = Math.min(62, (W - pad * 2 - 28 - 4 * 10) / 5);
  const mm = String(Math.floor(secsLeft / 60)).padStart(2, '0');
  const ss = String(secsLeft % 60).padStart(2, '0');
  const rows = history.slice(0, 100);
  const pageCount = Math.max(1, Math.ceil((historyTab === 'my' ? myBets.length : rows.length) / ROWS_PER_PAGE));
  const pageRows = rows.slice(page * ROWS_PER_PAGE, page * ROWS_PER_PAGE + ROWS_PER_PAGE);
  const myRows = myBets.slice(page * ROWS_PER_PAGE, page * ROWS_PER_PAGE + ROWS_PER_PAGE);
  const [sheetH, setSheetH] = useState(380);
  const selColor = selection ? keyColor(selection) : G1;
  const chartW = W - pad * 2;
  const chartRowH = 46;
  const chartX0 = chartW * 0.3;
  const chartStep = (chartW * 0.58) / 10;
  // The chart's statistics over the periods shown (newest first; a House period has no number).
  const stats = useMemo(() => {
    const nums = history.slice(0, 100).map((h) => (h.house ? -1 : h.number));
    const total = nums.length;
    return Array.from({ length: 10 }, (_, d) => {
      const first = nums.indexOf(d);
      const freq = nums.filter((x) => x === d).length;
      let best = 0;
      let run = 0;
      for (const x of nums) {
        run = x === d ? run + 1 : 0;
        best = Math.max(best, run);
      }
      return { missing: first === -1 ? total : first, avg: freq === 0 ? total : Math.round((total - freq) / (freq + 1)), freq, best };
    });
  }, [history]);

  return (
    <View style={styles.root}>
      <ScrollView nestedScrollEnabled contentContainerStyle={{ paddingBottom: (sheetOpen ? sheetH : 0) + insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        {/* The green top: header, wallet, notice and the duration tabs, which sit across its lower edge */}
        <View>
          <LinearGradient colors={['#11703A', '#1C914E', '#2BAE66']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <View pointerEvents="none" style={[styles.heroGlow, { width: W * 0.95, height: W * 0.95, borderRadius: W * 0.475, right: -W * 0.42, top: -W * 0.38 }]} />
            <View pointerEvents="none" style={[styles.heroGlow, { width: W * 0.7, height: W * 0.7, borderRadius: W * 0.35, left: -W * 0.32, bottom: -W * 0.3 }]} />
          </LinearGradient>

          <View style={[styles.headerRow, { marginTop: insets.top }]}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel="Back">
              <MaterialCommunityIcons name="chevron-left" size={32} color="#FFFFFF" />
            </Pressable>
            <View style={styles.brand} pointerEvents="none">
              <Image source={require('../../assets/novaplay-badge.webp')} style={styles.brandBadge} />
              <Text style={styles.brandText}>NOVAPLAY</Text>
            </View>
            <View style={styles.headerRight}>
              <Pressable onPress={() => navigation.navigate('Help')} hitSlop={8} style={styles.headerIcon} accessibilityRole="button" accessibilityLabel="Help">
                <MaterialCommunityIcons name="headset" size={21} color="#FFFFFF" />
              </Pressable>
              <Pressable onPress={() => setShowRules(true)} hitSlop={8} style={styles.headerIcon} accessibilityRole="button" accessibilityLabel="How to play">
                <MaterialCommunityIcons name="information-variant" size={21} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>

          {/* Wallet */}
          <View style={[styles.wallet, { marginHorizontal: pad }]}>
            <View style={styles.walletRow}>
              <Text style={styles.walletAmount} numberOfLines={1} adjustsFontSizeToFit>
                ₹{coins.toFixed(2)}
              </Text>
              <Pressable onPress={() => refreshWallet()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Refresh balance">
                <MaterialCommunityIcons name="autorenew" size={24} color="#9AA6A0" />
              </Pressable>
            </View>
            <View style={styles.walletLabelRow}>
              <WalletIcon size={30} />
              <Text style={styles.walletLabel}>Wallet balance</Text>
            </View>
            <View style={styles.walletBtns}>
              <Pressable onPress={() => navigation.navigate('Withdraw')} style={({ pressed }) => [styles.walletBtn, styles.walletBtnOutline, pressed && styles.pressed]} accessibilityRole="button">
                <Text style={[styles.walletBtnText, { color: G2 }]}>Withdraw</Text>
              </Pressable>
              <Pressable onPress={() => navigation.navigate('Deposit')} style={({ pressed }) => [styles.walletBtn, styles.walletBtnFill, pressed && styles.pressed]} accessibilityRole="button">
                <LinearGradient colors={['#25A55E', '#137A3E']} style={StyleSheet.absoluteFill} />
                <Text style={[styles.walletBtnText, { color: '#FFFFFF' }]}>Deposit</Text>
              </Pressable>
            </View>
          </View>

          <NoticeBar onDetail={() => setShowRules(true)} marginH={pad} />

          {/* Duration tracks */}
          <View style={[styles.durations, { marginHorizontal: pad }]}>
            {DURATIONS.map((d) => {
              const on = d === duration;
              return (
                <Pressable key={d} onPress={() => d !== duration && setDuration(d)} style={styles.durTab} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                  {on && <LinearGradient colors={['#3DBB72', '#9FE2BB', '#F1FBF5']} locations={[0, 0.62, 1]} style={[StyleSheet.absoluteFill, { borderRadius: 16 }]} />}
                  {/* Wrapped so it stacks above the tab's gradient on every platform. */}
                  <View>
                    <ClockIcon on={on} size={48} />
                  </View>
                  <Text style={[styles.durText, on && styles.durTextOn]}>Win Go</Text>
                  <Text style={[styles.durText, on && styles.durTextOn]}>{DURATION_LABEL[d]}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Ticket: rules, last results, countdown */}
        <View style={[styles.ticket, { marginHorizontal: pad }]}>
          <LinearGradient colors={['#31B96E', '#1E9552', '#167C3E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 18 }]} />
          <View pointerEvents="none" style={styles.ticketShine} />
          <View style={[styles.notch, { top: -11 }]} />
          <View style={[styles.notch, { bottom: -11 }]} />
          <View style={styles.ticketLeft}>
            <Pressable onPress={() => setShowRules(true)} style={({ pressed }) => [styles.howBtn, pressed && styles.pressed]} accessibilityRole="button">
              <MaterialCommunityIcons name="file-document-outline" size={15} color="#FFFFFF" />
              <Text style={styles.howText}>How to play</Text>
            </Pressable>
            <Text style={styles.ticketGame}>WinGo {DURATION_NAME[duration]}</Text>
            <View style={styles.ticketBalls}>
              {history.slice(0, 5).map((h) => (h.house ? <HouseBall key={h.periodNumber} size={29} /> : <NumberBall key={h.periodNumber} n={h.number} size={29} />))}
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
                  <DigitBox key={i} char={round ? c : '-'} width={29} height={40} color={G2} />
                )
              )}
            </View>
            <Text style={styles.ticketPeriod} numberOfLines={1} adjustsFontSizeToFit>
              {round?.periodNumber ?? '—'}
            </Text>
          </View>
        </View>

        {/* Betting */}
        <View style={[styles.betCard, { marginHorizontal: pad }]}>
          <View style={styles.colorRow}>
            {COLOR_BUTTONS.map((b) => (
              <Pressable
                key={b.key}
                onPress={() => choose(b.key)}
                style={({ pressed }) => [
                  styles.colorBtn,
                  b.key === 'GREEN' ? styles.btnGreen : b.key === 'RED' ? styles.btnRed : styles.btnViolet,
                  { borderBottomColor: b.edge, paddingHorizontal: narrow ? 8 : 12 },
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={b.label}
              >
                <LinearGradient colors={b.colors} style={StyleSheet.absoluteFill} />
                <View pointerEvents="none" style={styles.btnShine} />
                <Text style={[styles.colorBtnText, narrow && { fontSize: 14.5 }]}>{b.label}</Text>
                <Text style={[styles.colorBtnRate, narrow && { fontSize: 12.5 }]}>{b.key === 'VIOLET' ? P.violet : P.color}X</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.ballPanel}>
            {Array.from({ length: 10 }, (_, n) => (
              <Pressable
                key={n}
                onPress={() => choose(`NUM:${n}`)}
                style={({ pressed }) => [styles.ballCell, randomFlash === n && styles.ballFlash, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`Number ${n}`}
              >
                <NumberBall n={n} size={ballSize} />
                <Text style={styles.ballRate}>{P.number}X</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.multRow}>
            <Pressable onPress={pickRandom} style={({ pressed }) => [styles.randomBtn, pressed && styles.pressed]} accessibilityRole="button">
              <Text style={styles.randomText}>Random</Text>
            </Pressable>
            {MULTIPLIERS.map((m) => {
              const on = mult === m;
              return (
                <Pressable key={m} onPress={() => setMult(m)} style={[styles.multBtn, on && styles.multOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                  {on && <LinearGradient colors={['#2DB36A', '#157B3F']} style={[StyleSheet.absoluteFill, { borderRadius: 10 }]} />}
                  <Text style={[styles.multText, on && { color: '#FFFFFF' }]}>X{m}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.bsPill}>
            <Pressable onPress={() => choose('BIG')} style={({ pressed }) => [styles.bsHalf, pressed && { opacity: 0.88 }]} accessibilityRole="button" accessibilityLabel="Big">
              <LinearGradient colors={['#FFCB72', '#F7992A']} style={StyleSheet.absoluteFill} />
              <View pointerEvents="none" style={styles.btnShine} />
              <Text style={styles.bsText}>Big</Text>
              <Text style={styles.bsRate}>{P.size}X</Text>
            </Pressable>
            <Pressable onPress={() => choose('SMALL')} style={({ pressed }) => [styles.bsHalf, pressed && { opacity: 0.88 }]} accessibilityRole="button" accessibilityLabel="Small">
              <LinearGradient colors={['#91C4FF', '#4C8DEE']} style={StyleSheet.absoluteFill} />
              <View pointerEvents="none" style={styles.btnShine} />
              <Text style={styles.bsText}>Small</Text>
              <Text style={styles.bsRate}>{P.size}X</Text>
            </Pressable>
          </View>

          {locked && (
            <View style={styles.lockOverlay}>
              {[ss[0], ss[1]].map((c, i) => (
                <Animated.View key={i} style={[styles.lockDigit, { transform: [{ scale: lockPulse }] }]}>
                  <LinearGradient colors={['#31B96E', '#137A3E']} style={[StyleSheet.absoluteFill, { borderRadius: 22 }]} />
                  <Text style={styles.lockDigitText}>{c}</Text>
                </Animated.View>
              ))}
            </View>
          )}
        </View>

        {/* History */}
        <View style={[styles.histTabs, { marginHorizontal: pad }]}>
          {HIST_TABS.map((t) => {
            const on = t.key === historyTab;
            return (
              <Pressable
                key={t.key}
                onPress={() => {
                  setHistoryTab(t.key);
                  setPage(0);
                  if (t.key === 'my') loadMyBets();
                }}
                style={[styles.histTab, on ? styles.histTabOn : styles.histTabOff]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                {on && <LinearGradient colors={['#2AB067', '#137A3E']} style={[StyleSheet.absoluteFill, { borderRadius: 12 }]} />}
                <Text style={[styles.histTabText, on && { color: '#FFFFFF' }]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.tableCard, { marginHorizontal: pad }]}>
          {historyTab === 'game' && (
            <>
              <LinearGradient colors={['#2AB067', '#178444']} style={styles.tableHead}>
                <Text style={[styles.th, { flex: 1.7 }]}>Period</Text>
                <Text style={[styles.th, { flex: 1 }]}>Number</Text>
                <Text style={[styles.th, { flex: 1.15 }]}>Big Small</Text>
                <Text style={[styles.th, { flex: 0.9 }]}>Color</Text>
              </LinearGradient>
              {pageRows.map((h, i) => (
                <View key={h.periodNumber} style={[styles.tr, i % 2 === 1 && styles.trAlt]}>
                  <Text style={[styles.td, { flex: 1.7 }]} numberOfLines={1} adjustsFontSizeToFit>
                    {h.periodNumber}
                  </Text>
                  {h.house ? (
                    // House: every bet lost, whatever the number.
                    <View style={{ flex: 3.05, alignItems: 'center' }}>
                      <HousePill note="every bet loses" />
                    </View>
                  ) : (
                    <>
                      <View style={{ flex: 1, alignItems: 'center' }}>
                        <ResultNumber n={h.number} size={30} />
                      </View>
                      <Text style={[styles.td, { flex: 1.15 }]}>{h.size === 'BIG' ? 'Big' : 'Small'}</Text>
                      <View style={{ flex: 0.9, flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                        {h.colors.map((c) => (
                          <View key={c} style={[styles.dot, { backgroundColor: HEX[c] }]} />
                        ))}
                      </View>
                    </>
                  )}
                </View>
              ))}
              {pageRows.length === 0 && <Text style={styles.empty}>No results yet</Text>}
            </>
          )}

          {historyTab === 'chart' && (
            <>
              <LinearGradient colors={['#2AB067', '#178444']} style={styles.tableHead}>
                <Text style={[styles.th, { flex: 1 }]}>Period</Text>
                <Text style={[styles.th, { flex: 2 }]}>Number</Text>
              </LinearGradient>
              {rows.length > 0 && (
                <View style={styles.statBox}>
                  <Text style={styles.statTitle}>Statistic (last {rows.length} Periods)</Text>
                  <View style={styles.statRow}>
                    <Text style={[styles.statLabel, { width: chartX0 }]}>Winning number</Text>
                    {Array.from({ length: 10 }, (_, n) => (
                      <View key={n} style={{ width: chartStep, alignItems: 'center' }}>
                        <View style={[styles.statBall, { borderColor: HEX[colorsOf(n)[0]] }]}>
                          <Text style={[styles.statBallText, { color: HEX[colorsOf(n)[0]] }]}>{n}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                  {(
                    [
                      ['Missing', 'missing'],
                      ['Avg missing', 'avg'],
                      ['Frequency', 'freq'],
                      ['Max consecutive', 'best'],
                    ] as const
                  ).map(([label, key]) => (
                    <View key={key} style={styles.statRow}>
                      <Text style={[styles.statLabel, { width: chartX0 }]}>{label}</Text>
                      {stats.map((s, n) => (
                        <Text key={n} style={[styles.statValue, { width: chartStep }]}>
                          {s[key]}
                        </Text>
                      ))}
                    </View>
                  ))}
                </View>
              )}
              <View style={{ height: Math.max(1, pageRows.length) * chartRowH }}>
                <Svg width={chartW} height={Math.max(1, pageRows.length) * chartRowH} style={StyleSheet.absoluteFill}>
                  {pageRows.slice(0, -1).map((h, i) => {
                    const next = pageRows[i + 1];
                    // The trend line breaks at House rows (no number).
                    if (h.house || next.house) return null;
                    return (
                      <Line
                        key={h.periodNumber}
                        x1={chartX0 + chartStep * (h.number + 0.5)}
                        y1={chartRowH * (i + 0.5)}
                        x2={chartX0 + chartStep * (next.number + 0.5)}
                        y2={chartRowH * (i + 1.5)}
                        stroke="#E8433A"
                        strokeWidth={1.8}
                      />
                    );
                  })}
                </Svg>
                {pageRows.map((h, i) => (
                  <View key={h.periodNumber} style={[styles.chartRow, { height: chartRowH, top: i * chartRowH }]}>
                    <Text style={[styles.chartPeriod, { width: chartX0 }]} numberOfLines={1} adjustsFontSizeToFit>
                      {h.periodNumber}
                    </Text>
                    {h.house ? (
                      <View style={{ width: chartStep * 10, alignItems: 'center' }}>
                        <HousePill size={11} />
                      </View>
                    ) : (
                      Array.from({ length: 10 }, (_, n) => {
                        const hit = n === h.number;
                        const cols = h.colors.map((c) => HEX[c]);
                        return (
                          <View key={n} style={{ width: chartStep, alignItems: 'center' }}>
                            {hit ? (
                              <LinearGradient
                                colors={cols.length > 1 ? [cols[0], cols[0], cols[1], cols[1]] : [cols[0], cols[0]]}
                                locations={cols.length > 1 ? [0, 0.5, 0.5, 1] : [0, 1]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={[styles.chartCell, styles.chartHit]}
                              >
                                <Text style={[styles.chartCellText, { color: '#FFFFFF' }]}>{n}</Text>
                              </LinearGradient>
                            ) : (
                              <View style={styles.chartCell}>
                                <Text style={styles.chartCellText}>{n}</Text>
                              </View>
                            )}
                          </View>
                        );
                      })
                    )}
                    <View style={[styles.sizeBadge, { backgroundColor: h.house ? HOUSE_2 : h.size === 'BIG' ? C_BIG : C_SMALL }]}>
                      <Text style={styles.sizeBadgeText}>{h.house ? 'H' : h.size === 'BIG' ? 'B' : 'S'}</Text>
                    </View>
                  </View>
                ))}
              </View>
              {pageRows.length === 0 && <Text style={styles.empty}>No results yet</Text>}
            </>
          )}

          {historyTab === 'my' && (
            <View style={{ padding: 10, gap: 10 }}>
              {myRows.map((b) => {
                const won = b.status === 'WON';
                const lost = b.status === 'LOST';
                const tone = won ? C_GREEN : lost ? C_RED : MUTED;
                return (
                  <View key={b.id} style={styles.myRow}>
                    <View style={[styles.myBadge, { backgroundColor: keyColor(b.area) }]}>
                      <View pointerEvents="none" style={styles.btnShine} />
                      <Text style={styles.myBadgeText} numberOfLines={1} adjustsFontSizeToFit>
                        {keyLabel(b.area)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.myPeriod}>{b.periodNumber}</Text>
                      <Text style={styles.myMeta}>{new Date(b.createdAt).toLocaleString()}</Text>
                      <Text style={styles.myMeta}>
                        Win Go {DURATION_LABEL[b.durationSeconds]} · ₹{Number(b.amount).toFixed(2)}
                        {b.result ? `  ·  Result ${b.result.house ? '⭐ House' : b.result.number}` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <View style={[styles.statusTag, { borderColor: tone }]}>
                        <Text style={[styles.statusTagText, { color: tone }]}>{won ? 'Succeed' : lost ? 'Failed' : 'Pending'}</Text>
                      </View>
                      <Text style={[styles.myAmount, { color: tone }]}>{won ? `+₹${Number(b.payout).toFixed(2)}` : lost ? `-₹${Number(b.amount).toFixed(2)}` : ''}</Text>
                    </View>
                  </View>
                );
              })}
              {myRows.length === 0 && <Text style={styles.empty}>No bets yet</Text>}
            </View>
          )}

          <View style={styles.pager}>
            <Pressable onPress={() => setPage((p) => Math.max(0, p - 1))} style={[styles.pageBtn, page === 0 ? styles.pageBtnOff : styles.pageBtnOn]} accessibilityRole="button" accessibilityLabel="Previous page">
              <MaterialCommunityIcons name="chevron-left" size={30} color={page === 0 ? '#8C9692' : '#FFFFFF'} />
            </Pressable>
            <Text style={styles.pageText}>
              {page + 1}/{pageCount}
            </Text>
            <Pressable
              onPress={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              style={[styles.pageBtn, page >= pageCount - 1 ? styles.pageBtnOff : styles.pageBtnOn]}
              accessibilityRole="button"
              accessibilityLabel="Next page"
            >
              <MaterialCommunityIcons name="chevron-right" size={30} color={page >= pageCount - 1 ? '#8C9692' : '#FFFFFF'} />
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <QuantityInputModal
        visible={qtyOpen}
        value={qty}
        unit={unit}
        mult={mult}
        maxTotal={maxStake}
        color={selColor}
        onConfirm={(n) => {
          setQty(n);
          setQtyOpen(false);
        }}
        onClose={() => setQtyOpen(false)}
      />

      {/* Bet sheet, tinted by the selection */}
      <Animated.View
        pointerEvents={sheetOpen ? 'auto' : 'none'}
        onLayout={(e) => setSheetH(e.nativeEvent.layout.height)}
        style={[styles.sheet, { paddingBottom: insets.bottom + 6, transform: [{ translateY: sheet.interpolate({ inputRange: [0, 1], outputRange: [sheetH + 40, 0] }) }] }]}
      >
        <View style={[styles.sheetHead, { backgroundColor: selColor }]}>
          <View pointerEvents="none" style={styles.sheetHeadShine} />
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
              <Pressable onPress={() => setQtyOpen(true)}>
                <Text style={styles.qtyText}>{qty}</Text>
              </Pressable>
              <Pressable onPress={() => setQty((q) => Math.min(maxStake, q + 1))} style={[styles.qtyBtn, { backgroundColor: selColor }]}>
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
          {leastStaked && (
            <Text style={[styles.rulesText, { color: C_RED, marginTop: 6 }]}>
              Result rule: the side and number with the least money bet on them win.
            </Text>
          )}
          <Pressable onPress={() => setAgree(!agree)} style={styles.agreeRow}>
            <MaterialCommunityIcons name={agree ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'} size={19} color={agree ? selColor : MUTED} />
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
            <LinearGradient colors={['#FFE08A', '#F7A928', '#E5701A']} style={styles.winTop}>
              <MaterialCommunityIcons name="trophy" size={48} color="#FFFFFF" />
              <Text style={styles.winTitle}>Congratulations</Text>
            </LinearGradient>
            <View style={styles.winBody}>
              <Text style={styles.winLabel}>Lottery results</Text>
              <View style={styles.winResult}>
                <View style={[styles.winTag, { backgroundColor: HEX[win.result.colors[0]] }]}>
                  <Text style={styles.winTagText}>{win.result.colors.map((c) => c[0] + c.slice(1).toLowerCase()).join(' ')}</Text>
                </View>
                <NumberBall n={win.result.number} size={38} />
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
            <LinearGradient colors={['#2AB067', '#137A3E']} style={styles.rulesHead}>
              <Text style={styles.rulesTitle}>How to play</Text>
            </LinearGradient>
            <ScrollView nestedScrollEnabled style={{ maxHeight: 400 }} contentContainerStyle={{ padding: 16, gap: 9 }}>
              {(leastStaked
                ? [
                    `One number 0–9 is chosen every period (${DURATION_LABEL[duration]}). Betting closes in the last ${lockSeconds} seconds.`,
                    'Result rule — least money wins: when betting closes, whichever of Big or Small has less money bet on it by all players wins. The result is then the number on that side with the least money bet on it. Ties are decided at random. Colour bets do not change the result.',
                    'This means the result goes against where most players’ money is: the more money is on a choice, the less likely it is to win. The number is not a random draw.',
                  ]
                : [`One number 0–9 is drawn every period (${DURATION_LABEL[duration]}). Betting closes in the last ${lockSeconds} seconds.`]
              )
                .concat([
                  `⭐ House: one period in five (${housePercent}%) is a House result, shown as ⭐ House. Every bet on a House period loses, whatever the number. All other periods pay the odds below.`,
                  `Green: 1, 3, 7, 9 pay ${P.color}X; 5 pays ${P.colorMixed}X.`,
                  `Red: 2, 4, 6, 8 pay ${P.color}X; 0 pays ${P.colorMixed}X.`,
                  `Violet: 0 or 5 pays ${P.violet}X.`,
                  `Number: the exact number pays ${P.number}X.`,
                  `Big (5–9) / Small (0–4): ${P.size}X.`,
                ])
                .concat(
                  leastStaked
                    ? []
                    : [
                        `Win chances, House included: a number wins ${pctText(0.1 * (1 - housePercent / 100))} of periods, Big or Small ${pctText(0.5 * (1 - housePercent / 100))}, Green or Red ${pctText(0.5 * (1 - housePercent / 100))}, Violet ${pctText(0.2 * (1 - housePercent / 100))}. Every bet returns ${rtpPercent}% of stakes on average.`,
                      ]
                )
                .concat([`Bet amount = balance × quantity × multiplier; ₹${minStake}–₹${maxStake} per bet, max win ${winLimit(maxPayout)}.`])
                .concat(
                  leastStaked
                    ? ['Whether a period is ⭐ House, and how ties are decided, come from a server seed whose hash is published before the period and the seed itself after it.']
                    : ['Provably fair: each period’s number, and whether it is House, come from a server seed whose hash is published before the period, and the seed itself after it.']
                )
                .filter((t) => housePercent > 0 || !t.startsWith('⭐ House'))
                .map((t, i) => (
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

const shadow = { shadowColor: '#0B3D22', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 4 };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE_BG },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.92 },

  // The green ends at the middle of the duration tabs (about 62 px above the bottom of the top block).
  hero: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 62, borderBottomLeftRadius: 46, borderBottomRightRadius: 46, overflow: 'hidden' },
  heroGlow: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.07)' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, height: 54 },
  headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  brand: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  brandBadge: { width: 32, height: 32 },
  brandText: { fontFamily: fonts.italic, fontSize: 19, color: '#FFFFFF', letterSpacing: 1, textShadowColor: 'rgba(0,0,0,0.25)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  headerRight: { flexDirection: 'row', gap: 10, paddingRight: 6 },
  headerIcon: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.6, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },

  wallet: { marginTop: 10, alignItems: 'center', paddingTop: 20, paddingBottom: 22, borderRadius: 28, backgroundColor: '#FFFFFF', ...shadow },
  walletRow: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: '86%' },
  walletAmount: { fontFamily: SERIF, color: INK, fontSize: 32, fontWeight: '900' },
  walletLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  walletLabel: { fontFamily: SERIF, color: '#2B3A32', fontSize: 18, fontWeight: '600' },
  walletBtns: { flexDirection: 'row', gap: 16, marginTop: 20, paddingHorizontal: 18, alignSelf: 'stretch' },
  walletBtn: { flex: 1, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  walletBtnOutline: { borderWidth: 2, borderColor: G2, backgroundColor: '#FFFFFF' },
  walletBtnFill: { borderBottomWidth: 4, borderBottomColor: '#0A5A2C' },
  walletBtnText: { fontFamily: SERIF, fontSize: 18, fontWeight: '800' },

  notice: { marginTop: 14, height: 46, borderRadius: 23, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', paddingRight: 6, ...shadow },
  noticeIcon: { width: 40, alignItems: 'center' },
  noticeTrack: { flex: 1, height: 46, overflow: 'hidden', justifyContent: 'center' },
  noticeRun: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4000, flexDirection: 'row', alignItems: 'center' },
  noticeText: { fontFamily: SERIF, color: '#24332B', fontSize: 15, fontWeight: '700' },
  noticeBtn: { height: 34, paddingHorizontal: 14, borderRadius: 17, flexDirection: 'row', alignItems: 'center', gap: 4, overflow: 'hidden', marginLeft: 8 },
  noticeBtnText: { fontFamily: SERIF, color: '#FFFFFF', fontSize: 15, fontWeight: '800' },

  durations: { marginTop: 16, flexDirection: 'row', padding: 6, gap: 4, borderRadius: 22, backgroundColor: '#FFFFFF', ...shadow },
  durTab: { flex: 1, alignItems: 'center', paddingTop: 10, paddingBottom: 8, borderRadius: 16, overflow: 'hidden' },
  durText: { fontFamily: SERIF, color: '#9AA4A0', fontSize: 13, fontWeight: '700', lineHeight: 17 },
  durTextOn: { color: '#0E6A35' },

  ticket: { marginTop: 18, height: 136, borderRadius: 18, flexDirection: 'row', ...shadow },
  ticketShine: { position: 'absolute', left: 0, right: 0, top: 0, height: '45%', borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)' },
  notch: { position: 'absolute', left: '55%', marginLeft: -11, width: 22, height: 22, borderRadius: 11, backgroundColor: PAGE_BG },
  ticketLeft: { width: '55%', paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'space-between' },
  howBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'stretch', height: 32, borderRadius: 16, borderWidth: 1.3, borderColor: 'rgba(255,255,255,0.9)' },
  howText: { fontFamily: SERIF, color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  ticketGame: { fontFamily: SERIF, color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  ticketBalls: { flexDirection: 'row', gap: 4, minHeight: 29 },
  ticketDivider: { width: 0, marginVertical: 14, borderLeftWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)', borderStyle: 'dashed' },
  ticketRight: { flex: 1, paddingHorizontal: 12, paddingVertical: 12, alignItems: 'flex-end', justifyContent: 'space-between' },
  ticketLabel: { fontFamily: SERIF, color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  digits: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  digitColon: { fontFamily: SERIF, color: '#FFFFFF', fontSize: 24, fontWeight: '900', marginHorizontal: 1 },
  ticketPeriod: { fontFamily: SERIF, color: '#FFFFFF', fontSize: 17, fontWeight: '800', letterSpacing: 0.4 },

  betCard: { marginTop: 18, padding: 12, borderRadius: 22, backgroundColor: '#EDF0EE', ...shadow },
  colorRow: { flexDirection: 'row', gap: 10 },
  colorBtn: { flex: 1, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4, overflow: 'hidden', borderBottomWidth: 4 },
  btnGreen: { borderTopRightRadius: 18, borderBottomLeftRadius: 18, borderTopLeftRadius: 6, borderBottomRightRadius: 6 },
  btnViolet: { borderRadius: 12 },
  btnRed: { borderTopLeftRadius: 18, borderBottomRightRadius: 18, borderTopRightRadius: 6, borderBottomLeftRadius: 6 },
  btnShine: { position: 'absolute', left: 0, right: 0, top: 0, height: '48%', backgroundColor: 'rgba(255,255,255,0.16)' },
  colorBtnText: { fontFamily: SERIF, color: '#FFFFFF', fontSize: 17, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.18)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  colorBtnRate: { fontFamily: SERIF, color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  ballPanel: { marginTop: 12, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 18, backgroundColor: '#F8F9F9', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  ballCell: { width: '19.5%', alignItems: 'center', paddingVertical: 2, borderRadius: 14 },
  ballFlash: { backgroundColor: '#FFE9A8' },
  ballRate: { fontFamily: SERIF, color: '#8D9792', fontSize: 13, fontWeight: '700', marginTop: 3 },
  multRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12 },
  randomBtn: { height: 40, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1.6, borderColor: G1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  randomText: { fontFamily: SERIF, color: G2, fontSize: 15, fontWeight: '800' },
  multBtn: { flex: 1, height: 40, borderRadius: 10, backgroundColor: '#F8F9F9', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  multOn: { borderBottomWidth: 3, borderBottomColor: '#0A5A2C' },
  multText: { fontFamily: SERIF, color: INK, fontSize: 14, fontWeight: '800' },
  bsPill: { flexDirection: 'row', marginTop: 12, height: 54, borderRadius: 27, overflow: 'hidden' },
  bsHalf: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  bsText: { fontFamily: SERIF, color: '#FFFFFF', fontSize: 21, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.15)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  bsRate: { fontFamily: SERIF, color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
  lockOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 22, backgroundColor: 'rgba(16,22,19,0.62)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 },
  lockDigit: { width: 112, height: 150, borderRadius: 22, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...shadow },
  lockDigitText: { fontFamily: SERIF, color: '#FFFFFF', fontSize: 112, fontWeight: '900', lineHeight: 140 },

  histTabs: { flexDirection: 'row', gap: 10, marginTop: 20 },
  histTab: { flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  histTabOn: { borderBottomWidth: 3, borderBottomColor: '#0A5A2C' },
  histTabOff: { backgroundColor: '#E6EAE8' },
  histTabText: { fontFamily: SERIF, color: '#8A948F', fontSize: 16, fontWeight: '800' },
  tableCard: { marginTop: 12, borderRadius: 18, backgroundColor: '#FFFFFF', overflow: 'hidden', ...shadow },
  tableHead: { flexDirection: 'row', alignItems: 'center', height: 50, paddingHorizontal: 8 },
  th: { fontFamily: SERIF, color: '#FFFFFF', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  tr: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E3E8E5' },
  trAlt: { backgroundColor: '#F8FAF9' },
  td: { fontFamily: SERIF, color: INK, fontSize: 15, textAlign: 'center' },
  dot: { width: 14, height: 14, borderRadius: 7 },
  empty: { fontFamily: SERIF, color: MUTED, textAlign: 'center', padding: 22, fontSize: 15 },

  statBox: { paddingTop: 10, paddingBottom: 6, borderBottomWidth: 6, borderBottomColor: '#F1F4F2' },
  statTitle: { fontFamily: SERIF, color: INK, fontSize: 15, fontWeight: '800', paddingHorizontal: 12, marginBottom: 6 },
  statRow: { flexDirection: 'row', alignItems: 'center', minHeight: 32 },
  statLabel: { fontFamily: SERIF, color: '#56635C', fontSize: 13, fontWeight: '700', paddingLeft: 12 },
  statValue: { fontFamily: SERIF, color: '#7E8A84', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  statBall: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.4, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  statBallText: { fontFamily: SERIF, fontSize: 11, fontWeight: '900' },
  chartRow: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E3E8E5' },
  chartPeriod: { fontFamily: SERIF, color: INK, fontSize: 13, textAlign: 'center' },
  chartCell: { width: 21, height: 21, borderRadius: 11, borderWidth: 1, borderColor: '#CBD2CE', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', overflow: 'hidden' },
  chartHit: { width: 24, height: 24, borderRadius: 12, borderWidth: 0 },
  chartCellText: { fontFamily: SERIF, color: '#A1ABA6', fontSize: 11, fontWeight: '800' },
  sizeBadge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  sizeBadgeText: { fontFamily: SERIF, color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  housePill: { borderRadius: 12, backgroundColor: '#FFF4D6', borderWidth: 1, borderColor: HOUSE_2 },
  housePillText: { color: HOUSE_INK, fontWeight: '900' },
  housePillNote: { color: HOUSE_INK, fontWeight: '600' },

  myRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 14, backgroundColor: '#F7F9F8', borderWidth: 1, borderColor: '#EDF1EF' },
  myBadge: { width: 56, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, overflow: 'hidden' },
  myBadgeText: { fontFamily: SERIF, color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  myPeriod: { fontFamily: SERIF, color: INK, fontSize: 14, fontWeight: '800' },
  myMeta: { color: MUTED, fontSize: 11, fontWeight: '600', marginTop: 2 },
  statusTag: { borderWidth: 1.2, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 2 },
  statusTagText: { fontFamily: SERIF, fontSize: 12, fontWeight: '800' },
  myAmount: { fontFamily: SERIF, fontSize: 14, fontWeight: '900' },

  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 40, paddingVertical: 18 },
  pageBtn: { width: 54, height: 54, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pageBtnOn: { backgroundColor: '#1C8F4E', borderBottomWidth: 3, borderBottomColor: '#0A5A2C' },
  pageBtnOff: { backgroundColor: '#E1E5E3' },
  pageText: { fontFamily: SERIF, color: INK, fontSize: 18, fontWeight: '700' },

  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF', borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden', ...shadow, elevation: 20 },
  sheetHead: { paddingTop: 16, paddingBottom: 14, alignItems: 'center', gap: 8, borderBottomLeftRadius: 44, borderBottomRightRadius: 44, overflow: 'hidden' },
  sheetHeadShine: { position: 'absolute', left: 0, right: 0, top: 0, height: '50%', backgroundColor: 'rgba(255,255,255,0.14)' },
  sheetTitle: { fontFamily: SERIF, color: '#FFFFFF', fontSize: 19, fontWeight: '900' },
  sheetSelPill: { backgroundColor: '#FFFFFF', borderRadius: 16, paddingHorizontal: 18, paddingVertical: 5 },
  sheetSelText: { fontFamily: SERIF, fontSize: 15, fontWeight: '800' },
  sheetBody: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, gap: 12 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetLabel: { fontFamily: SERIF, color: INK, fontSize: 16, fontWeight: '800' },
  sheetChoices: { flexDirection: 'row', gap: 6 },
  choice: { minWidth: 46, height: 32, paddingHorizontal: 8, borderRadius: 8, backgroundColor: '#F1F3F2', alignItems: 'center', justifyContent: 'center' },
  choiceText: { fontFamily: SERIF, color: INK, fontSize: 14, fontWeight: '800' },
  qtyBox: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  qtyText: { fontFamily: SERIF, minWidth: 60, textAlign: 'center', color: INK, fontSize: 16, fontWeight: '900', paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#DCE3DF' },
  sheetMults: { flexDirection: 'row', justifyContent: 'flex-end', gap: 6 },
  agreeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  agreeText: { fontFamily: SERIF, color: INK, fontSize: 14, fontWeight: '600' },
  agreeLink: { fontFamily: SERIF, fontSize: 14, fontWeight: '700' },
  sheetFoot: { flexDirection: 'row', height: 56 },
  cancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF1EF' },
  cancelText: { fontFamily: SERIF, color: MUTED, fontSize: 16, fontWeight: '800' },
  totalBtn: { flex: 2, alignItems: 'center', justifyContent: 'center' },
  totalText: { fontFamily: SERIF, color: '#FFFFFF', fontSize: 16, fontWeight: '900' },

  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.58)', alignItems: 'center', justifyContent: 'center', zIndex: 1000, elevation: 40 },
  winCard: { width: 304, borderRadius: 24, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  winTop: { alignItems: 'center', paddingVertical: 20, gap: 6 },
  winTitle: { fontFamily: SERIF, color: '#FFFFFF', fontSize: 26, fontWeight: '900', letterSpacing: 0.5, textShadowColor: 'rgba(120,50,0,0.35)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 },
  winBody: { alignItems: 'center', padding: 18, gap: 9 },
  winLabel: { fontFamily: SERIF, color: MUTED, fontSize: 13, fontWeight: '700' },
  winResult: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  winTag: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9 },
  winTagText: { fontFamily: SERIF, color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  winAmount: { fontFamily: SERIF, color: '#E0710E', fontSize: 34, fontWeight: '900' },
  winPeriod: { color: MUTED, fontSize: 11, fontWeight: '600' },
  rulesCard: { width: '88%', borderRadius: 20, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  rulesHead: { paddingVertical: 14, alignItems: 'center' },
  rulesTitle: { fontFamily: SERIF, color: '#FFFFFF', fontSize: 19, fontWeight: '900' },
  rulesText: { color: INK, fontSize: 13.5, lineHeight: 20 },
  toastWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 1001, elevation: 41 },
  toastText: { color: '#FFFFFF', backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 18, overflow: 'hidden', fontWeight: '700' },
});
