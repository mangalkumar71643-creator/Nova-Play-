import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Line, RadialGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { ApiClientError } from '../api/client';
import {
  TrxConfig,
  TrxDuration,
  TrxHistoryEntry,
  TrxMyBet,
  TrxRoundView,
  fetchTrxConfig,
  fetchTrxCurrent,
  fetchTrxHistory,
  fetchTrxMyBets,
  placeTrxBets,
} from '../api/backend';
import { useGameState } from '../state/GameStateContext';
import { NumberBall } from './WinGoScreen';

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
const DURATIONS: TrxDuration[] = [60, 180, 300, 600];
/** The original Win Go's serif lettering for labels and buttons. */
const SERIF = 'serif';
const DURATION_LABEL: Record<TrxDuration, string> = { 60: '1Min', 180: '3Min', 300: '5Min', 600: '10Min' };
// Block panel palette: a dark ledger with gold, like the 5D machine.
const LEDGER_1 = '#0F3A25';
const LEDGER_2 = '#082417';
const GOLD = '#F4CF6A';
const MONO = 'monospace';
/** The draw block exists ~0-3 s after the draw and is used once 3 blocks are
 * built on it, so results land ~10 s after the draw: first look after this. */
const FIRST_POLL_MS = 5000;
const POLL_MS = 1500;
const POLLS = 28;
/** Hash lock-in (64 characters, left to right) plus the ball popping in. */
const LOCK_IN_MS = 1100;
const REVEAL_MS = LOCK_IN_MS + 700;
const TRONSCAN_BLOCK = 'https://tronscan.org/#/block/';
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

/** Clock face used on the duration tabs. */
function ClockIcon({ on, size }: { on: boolean; size: number }) {
  const r = size / 2;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={on ? 'trxcOn' : 'trxcOff'} cx="40%" cy="35%" r="70%">
          <Stop offset="0" stopColor={on ? '#6BE59C' : '#E4E8E6'} />
          <Stop offset="1" stopColor={on ? '#138A48' : '#AEB8B2'} />
        </RadialGradient>
      </Defs>
      <Circle cx={r} cy={r} r={r - 1} fill={`url(#${on ? 'trxcOn' : 'trxcOff'})`} stroke="#FFFFFF" strokeWidth={2} />
      <Line x1={r} y1={r} x2={r} y2={r * 0.45} stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" />
      <Line x1={r} y1={r} x2={r * 1.38} y2={r * 1.2} stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" />
      <Circle cx={r} cy={r} r={2.2} fill="#FFFFFF" />
    </Svg>
  );
}

/** Local wall-clock time, HH:MM:SS. */
function fmtTime(iso: string | number): string {
  const d = new Date(iso);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((x) => String(x).padStart(2, '0')).join(':');
}

/** Where the result digit sits in a hash: its last decimal digit. */
function digitIndexOf(hash: string): number {
  for (let i = hash.length - 1; i >= 0; i--) if (hash[i] >= '0' && hash[i] <= '9') return i;
  return -1;
}

const HEX_CHARS = '0123456789abcdef';
function randomHex(n: number): string {
  let out = '';
  for (let i = 0; i < n; i++) out += HEX_CHARS[Math.floor(Math.random() * 16)];
  return out;
}

/** "…c7e2" with the result digit marked: from the digit to the end. */
function HashTail({ hash, size = 12 }: { hash: string; size?: number }) {
  const idx = digitIndexOf(hash);
  const from = Math.max(0, Math.min(idx, hash.length - 4));
  return (
    <Text style={{ fontFamily: MONO, fontSize: size, color: MUTED }}>
      …
      {hash
        .slice(from)
        .split('')
        .map((c, i) => (
          <Text key={i} style={from + i === idx ? { color: C_RED, fontWeight: '900' } : undefined}>
            {c}
          </Text>
        ))}
    </Text>
  );
}

/**
 * The block hash as a 2 x 32 grid of characters. While `scrambling` it
 * cycles random hex; when the scramble ends on a hash it settles left to
 * right, then the result digit lights up. Characters after the digit are
 * dimmed: they are the letters skipped on the way to it.
 */
function HashGrid({ hash, scrambling, width }: { hash: string | null; scrambling: boolean; width: number }) {
  const [text, setText] = useState(() => hash ?? randomHex(64));
  const [settled, setSettled] = useState(!!hash);
  const glow = useRef(new Animated.Value(hash ? 1 : 0)).current;
  const wasScrambling = useRef(false);

  useEffect(() => {
    if (!scrambling) return;
    wasScrambling.current = true;
    setSettled(false);
    glow.setValue(0);
    const id = setInterval(() => setText(randomHex(64)), 70);
    return () => clearInterval(id);
  }, [scrambling, glow]);

  useEffect(() => {
    if (scrambling) return;
    if (!hash) {
      setText(randomHex(64));
      setSettled(false);
      return;
    }
    const lockIn = wasScrambling.current;
    wasScrambling.current = false;
    if (!lockIn) {
      setText(hash);
      setSettled(true);
      glow.setValue(1);
      return;
    }
    let k = 0;
    const perTick = 64 / (LOCK_IN_MS / 30);
    const id = setInterval(() => {
      k = Math.min(64, k + perTick);
      const n = Math.floor(k);
      setText(hash.slice(0, n) + randomHex(64 - n));
      if (n >= 64) {
        clearInterval(id);
        setSettled(true);
        glow.setValue(0);
        Animated.sequence([
          Animated.timing(glow, { toValue: 1.25, duration: 220, useNativeDriver: true }),
          Animated.spring(glow, { toValue: 1, friction: 4, useNativeDriver: true }),
        ]).start();
      }
    }, 30);
    return () => clearInterval(id);
    // Runs when a hash arrives or the scramble stops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash, scrambling]);

  const idx = settled && hash ? digitIndexOf(hash) : -1;
  const cellW = width / 32;
  return (
    <View style={{ width, gap: 4 }}>
      {[0, 1].map((row) => (
        <View key={row} style={{ flexDirection: 'row' }}>
          {text
            .slice(row * 32, row * 32 + 32)
            .split('')
            .map((c, j) => {
              const i = row * 32 + j;
              const hit = i === idx;
              const skipped = idx >= 0 && i > idx;
              if (hit) {
                return (
                  <Animated.View key={i} style={[styles.hashHit, { width: cellW + 6, marginHorizontal: -3, transform: [{ scale: glow }] }]}>
                    <Text style={styles.hashHitText}>{c}</Text>
                  </Animated.View>
                );
              }
              return (
                <Text
                  key={i}
                  style={[
                    styles.hashChar,
                    { width: cellW },
                    !settled && { color: 'rgba(255,255,255,0.55)' },
                    settled && i < 16 && { color: 'rgba(244,207,106,0.75)' },
                    skipped && { color: 'rgba(255,255,255,0.3)' },
                  ]}
                >
                  {c}
                </Text>
              );
            })}
        </View>
      ))}
    </View>
  );
}

/**
 * The result's source: the TRON block (height, time, hash) and the number
 * read from it, with a link to check it on TronScan. While a period is being
 * drawn the hash scrambles; when its block arrives it locks in and the ball
 * pops.
 */
function BlockPanel({
  entry,
  drawing,
  drawAt,
  nextDrawAt,
  width,
  onVerify,
}: {
  entry: TrxHistoryEntry | null;
  drawing: boolean;
  drawAt: number | null;
  nextDrawAt: number | null;
  width: number;
  onVerify: (e: TrxHistoryEntry) => void;
}) {
  const wasDrawing = useRef(false);
  const [ballOn, setBallOn] = useState(!!entry);
  const ballPop = useRef(new Animated.Value(entry ? 1 : 0)).current;
  const dots = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (drawing) {
      wasDrawing.current = true;
      setBallOn(false);
      ballPop.setValue(0);
      const loop = Animated.loop(Animated.timing(dots, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }));
      loop.start();
      return () => loop.stop();
    }
    if (entry && wasDrawing.current) {
      // Out of a draw: the ball waits for the hash to lock in.
      wasDrawing.current = false;
      const t = setTimeout(() => {
        setBallOn(true);
        ballPop.setValue(0);
        Animated.spring(ballPop, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }).start();
      }, LOCK_IN_MS + 150);
      return () => clearTimeout(t);
    }
    wasDrawing.current = false;
    setBallOn(!!entry);
    ballPop.setValue(entry ? 1 : 0);
    // Driven by the draw state and the block shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing, entry?.periodNumber]);

  const elapsed = drawAt ? Date.now() - drawAt : 0;
  const status = elapsed < 3000 ? 'Waiting for the draw block' : 'Confirming on TRON (3 blocks)';
  const gridW = width - 28;
  return (
    <View style={[styles.block, { width }]}>
      <LinearGradient colors={[LEDGER_1, LEDGER_2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 18 }]} />
      <View style={styles.blockHead}>
        <View style={styles.blockBadge}>
          <MaterialCommunityIcons name="cube-outline" size={14} color={LEDGER_2} />
          <Text style={styles.blockBadgeText}>TRON BLOCK</Text>
        </View>
        {drawing ? (
          <Text style={styles.blockHeadText}>Draw {drawAt ? fmtTime(drawAt) : ''}</Text>
        ) : entry ? (
          <Text style={styles.blockHeadText}>
            #{entry.blockNumber} · {fmtTime(entry.blockTime)}
          </Text>
        ) : (
          <Text style={styles.blockHeadText}>Waiting for the first result</Text>
        )}
      </View>

      <View style={styles.blockHashWrap}>
        <HashGrid hash={drawing ? null : entry?.blockHash ?? null} scrambling={drawing} width={gridW} />
      </View>

      <View style={styles.blockFoot}>
        {drawing ? (
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {[0, 1, 2].map((i) => (
                <Animated.View
                  key={i}
                  style={[
                    styles.blockDot,
                    { opacity: dots.interpolate({ inputRange: [0, (i + 0.5) / 3.5, (i + 1.5) / 3.5, 1], outputRange: [0.25, 1, 0.25, 0.25] }) },
                  ]}
                />
              ))}
            </View>
            <Text style={styles.blockStatus}>{status}…</Text>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <Text style={styles.blockRule}>Result = last digit in the block hash</Text>
            {nextDrawAt ? <Text style={styles.blockNext}>Next draw: first block at or after {fmtTime(nextDrawAt)}</Text> : null}
          </View>
        )}
        <View style={styles.blockBallWrap}>
          {ballOn && entry && !drawing ? (
            <Animated.View style={{ transform: [{ scale: ballPop }] }}>
              <NumberBall n={entry.number} size={44} />
            </Animated.View>
          ) : (
            <View style={styles.blockBallWait}>
              <Text style={styles.blockBallWaitText}>?</Text>
            </View>
          )}
        </View>
      </View>

      {entry && !drawing && ballOn && (
        <Pressable onPress={() => onVerify(entry)} style={styles.verifyBtn}>
          <MaterialCommunityIcons name="shield-check" size={15} color={LEDGER_2} />
          <Text style={styles.verifyText}>Verify on TronScan</Text>
          <MaterialCommunityIcons name="open-in-new" size={13} color={LEDGER_2} />
        </Pressable>
      )}
    </View>
  );
}

// ---------- screen ----------

export default function TrxWinScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<TrxConfig | null>(null);
  const [duration, setDuration] = useState<TrxDuration>(60);
  const [round, setRound] = useState<TrxRoundView | null>(null);
  const [history, setHistory] = useState<TrxHistoryEntry[]>([]);
  const [myBets, setMyBets] = useState<TrxMyBet[]>([]);
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
  const [win, setWin] = useState<{ amount: number; period: string; result: TrxHistoryEntry } | null>(null);
  const [showRules, setShowRules] = useState(false);
  // The period being drawn (its draw time), until its block arrives.
  const [drawAt, setDrawAt] = useState<number | null>(null);
  // The new result while its hash locks in, before history shows it.
  const [revealEntry, setRevealEntry] = useState<TrxHistoryEntry | null>(null);
  const [detail, setDetail] = useState<TrxHistoryEntry | null>(null);
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

  const loadRound = useCallback(async (d: TrxDuration) => {
    const sentAt = Date.now();
    const v = await fetchTrxCurrent(d);
    const receivedAt = Date.now();
    if (!mountedRef.current || durationRef.current !== d) return;
    offsetRef.current = new Date(v.serverTime).getTime() - (sentAt + receivedAt) / 2;
    setRound(v);
  }, []);

  const loadMyBets = useCallback(async () => {
    try {
      const rows = await fetchTrxMyBets(50);
      if (mountedRef.current) setMyBets(rows);
      return rows;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchTrxConfig()
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
    setDrawAt(null);
    setRevealEntry(null);
    endedRef.current = null;
    loadRound(duration).catch(() => {});
    fetchTrxHistory(duration, 100)
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

  // Round over: next round, then wait for the draw block (it needs a few
  // seconds plus 3 confirmations), lock its hash in, then pay any win.
  useEffect(() => {
    if (!round || srvNow < endMs || endedRef.current === round.periodNumber) return;
    const period = round.periodNumber;
    const d = duration;
    endedRef.current = period;
    setSelection(null);
    setDrawAt(endMs);
    (async () => {
      await new Promise((r) => setTimeout(r, 400));
      loadRound(d).catch(() => {});
      await new Promise((r) => setTimeout(r, FIRST_POLL_MS - 400));
      let h: TrxHistoryEntry[] | null = null;
      for (let i = 0; i < POLLS && mountedRef.current && durationRef.current === d; i++) {
        try {
          const rows = await fetchTrxHistory(d, 100);
          if (rows[0]?.periodNumber === period) {
            h = rows;
            break;
          }
        } catch {
          // retry below
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
      if (!mountedRef.current || durationRef.current !== d) return;
      if (!h) {
        setDrawAt(null);
        showToast('The TRON block is taking longer — the result will appear in history');
        return;
      }
      setRevealEntry(h[0]);
      setDrawAt(null);
      await new Promise((r) => setTimeout(r, REVEAL_MS));
      if (!mountedRef.current || durationRef.current !== d) return;
      setHistory(h);
      setRevealEntry(null);
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

  const openBlock = (e: TrxHistoryEntry) => {
    Linking.openURL(`${TRONSCAN_BLOCK}${e.blockNumber}`).catch(() => showToast('Could not open TronScan'));
  };

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
      await placeTrxBets(duration, [{ area: selection, amount: perBet }]);
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
            <Text style={styles.headerTitle}>
              Trx <Text style={{ color: GOLD }}>Win Go</Text>
            </Text>
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
                <Text style={[styles.durText, on && { color: '#FFFFFF' }]}>Trx Win Go</Text>
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
            <Text style={styles.ticketGame}>Trx Win Go {DURATION_LABEL[duration]}</Text>
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

        {/* Where the number comes from */}
        <View style={{ marginHorizontal: pad, marginTop: 12 }}>
          <BlockPanel
            entry={revealEntry ?? history[0] ?? null}
            drawing={drawAt !== null}
            drawAt={drawAt}
            nextDrawAt={round ? endMs : null}
            width={W - pad * 2}
            onVerify={openBlock}
          />
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
                <Text style={[styles.th, { flex: 1.5 }]}>Period</Text>
                <Text style={[styles.th, { flex: 1.15 }]}>Block</Text>
                <Text style={[styles.th, { flex: 0.95 }]}>Time</Text>
                <Text style={[styles.th, { flex: 1 }]}>Hash</Text>
                <Text style={[styles.th, { flex: 0.95 }]}>Result</Text>
              </LinearGradient>
              {pageRows.map((h, i) => (
                <Pressable key={h.periodNumber} onPress={() => setDetail(h)} style={[styles.tr, i % 2 === 1 && { backgroundColor: '#F7F9F8' }]}>
                  <Text style={[styles.td, { flex: 1.5, fontSize: 10.5 }]}>{h.periodNumber}</Text>
                  <Text style={[styles.td, { flex: 1.15, fontSize: 11, fontWeight: '700', color: G2 }]}>{h.blockNumber}</Text>
                  <Text style={[styles.td, { flex: 0.95, fontSize: 11 }]}>{fmtTime(h.blockTime)}</Text>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <HashTail hash={h.blockHash} size={11} />
                  </View>
                  <View style={{ flex: 0.95, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                    <NumberBall n={h.number} size={22} />
                    <View style={[styles.sizeBadge, { marginLeft: 0, width: 18, height: 18, backgroundColor: h.size === 'BIG' ? C_BIG : C_SMALL }]}>
                      <Text style={[styles.sizeBadgeText, { fontSize: 10 }]}>{h.size === 'BIG' ? 'B' : 'S'}</Text>
                    </View>
                  </View>
                </Pressable>
              ))}
              {pageRows.length === 0 && <Text style={styles.empty}>No results yet</Text>}
              {pageRows.length > 0 && <Text style={styles.tableHint}>Tap a row for the full block hash</Text>}
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
                const refunded = b.status === 'VOID';
                return (
                  <View key={b.id} style={styles.myRow}>
                    <View style={[styles.myBadge, { backgroundColor: keyColor(b.area) }]}>
                      <Text style={styles.myBadgeText}>{keyLabel(b.area)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.myPeriod}>{b.periodNumber}</Text>
                      <Text style={styles.myMeta}>
                        Trx {DURATION_LABEL[b.durationSeconds]} · ₹{Number(b.amount).toFixed(2)}
                        {b.result ? `  ·  Result ${b.result.number} · #${b.result.blockNumber}` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <View style={[styles.statusTag, { borderColor: won ? C_GREEN : lost ? C_RED : MUTED }]}>
                        <Text style={[styles.statusTagText, { color: won ? C_GREEN : lost ? C_RED : MUTED }]}>{won ? 'Succeed' : lost ? 'Failed' : refunded ? 'Refunded' : 'Pending'}</Text>
                      </View>
                      <Text style={[styles.myAmount, { color: won ? C_GREEN : lost ? C_RED : MUTED }]}>
                        {won ? `+₹${Number(b.payout).toFixed(2)}` : lost ? `-₹${Number(b.amount).toFixed(2)}` : refunded ? `₹${Number(b.amount).toFixed(2)} back` : ''}
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
          <Text style={styles.sheetTitle}>Trx Win Go {DURATION_LABEL[duration]}</Text>
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
                Period: Trx {DURATION_LABEL[duration]} · {win.period}
              </Text>
              <Text style={styles.winPeriod}>
                TRON block #{win.result.blockNumber} · <HashTail hash={win.result.blockHash} size={11} />
              </Text>
            </View>
          </Animated.View>
        </Pressable>
      )}

      {/* Block detail */}
      {detail && (
        <Pressable style={styles.overlay} onPress={() => setDetail(null)}>
          <Pressable onPress={() => {}} style={styles.detailCard}>
            <LinearGradient colors={[G1, G2]} style={styles.rulesHead}>
              <Text style={styles.rulesTitle}>Period {detail.periodNumber}</Text>
            </LinearGradient>
            <View style={{ padding: 14, gap: 10 }}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Draw time</Text>
                <Text style={styles.detailValue}>{fmtTime(detail.drawAt)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Block</Text>
                <Text style={styles.detailValue}>
                  #{detail.blockNumber} · {fmtTime(detail.blockTime)}
                </Text>
              </View>
              <View style={[styles.block, { padding: 12, marginTop: 0 }]}>
                <LinearGradient colors={[LEDGER_1, LEDGER_2]} style={[StyleSheet.absoluteFill, { borderRadius: 14 }]} />
                <HashGrid hash={detail.blockHash} scrambling={false} width={Math.min(W * 0.88, 380) - 28 - 24} />
              </View>
              <View style={[styles.detailRow, { alignItems: 'center' }]}>
                <Text style={styles.detailLabel}>Result</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <NumberBall n={detail.number} size={30} />
                  <Text style={styles.detailValue}>
                    {detail.size === 'BIG' ? 'Big' : 'Small'} · {detail.colors.map((c) => c[0] + c.slice(1).toLowerCase()).join(' + ')}
                  </Text>
                </View>
              </View>
              <Pressable onPress={() => openBlock(detail)} style={[styles.verifyBtn, { alignSelf: 'stretch', justifyContent: 'center', marginTop: 4 }]}>
                <MaterialCommunityIcons name="shield-check" size={15} color={LEDGER_2} />
                <Text style={styles.verifyText}>Verify on TronScan</Text>
                <MaterialCommunityIcons name="open-in-new" size={13} color={LEDGER_2} />
              </Pressable>
            </View>
          </Pressable>
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
                `Each period (${DURATION_LABEL[duration]}) ends at a set time. Betting closes ${lockSeconds} seconds before it.`,
                'The number is the last digit (0–9) in the hash of the first TRON block produced at or after that time. Letters a–f are skipped, reading from the end.',
                'The block does not exist while betting is open, so nobody — not you, not us — can know or choose it. It is used once 3 more blocks are built on it (about 10 seconds), then anyone can check it on TronScan.',
                `Green: 1, 3, 7, 9 pay ${P.color}X; 5 pays ${P.colorMixed}X.`,
                `Red: 2, 4, 6, 8 pay ${P.color}X; 0 pays ${P.colorMixed}X.`,
                `Violet: 0 or 5 pays ${P.violet}X.`,
                `Number: the exact number pays ${P.number}X.`,
                `Big (5–9) / Small (0–4): ${P.size}X.`,
                `Bet amount = balance × quantity × multiplier; ₹${minStake}–₹${maxStake} per bet, max win ₹${maxPayout}.`,
                `If the TRON network can't be read for ${config?.voidAfterMinutes ?? 60} minutes after a draw, that period is cancelled and every bet on it refunded.`,
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
  headerTitle: { fontFamily: SERIF, color: '#FFFFFF', fontSize: 19, fontWeight: '900', letterSpacing: 0.5 },
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
  block: { borderRadius: 18, padding: 14, gap: 12, borderWidth: 1.5, borderColor: 'rgba(244,207,106,0.55)', overflow: 'hidden', ...shadow },
  blockHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  blockBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: GOLD, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  blockBadgeText: { color: LEDGER_2, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  blockHeadText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  blockHashWrap: { paddingVertical: 10, paddingHorizontal: 0, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.28)', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  hashChar: { fontFamily: MONO, color: '#E8F3EC', fontSize: 12.5, textAlign: 'center' },
  hashHit: { borderRadius: 6, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center', shadowColor: GOLD, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 6 },
  hashHitText: { fontFamily: MONO, color: LEDGER_2, fontSize: 13.5, fontWeight: '900' },
  blockFoot: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  blockDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: GOLD },
  blockStatus: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  blockRule: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '800' },
  blockNext: { color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: '600', marginTop: 3 },
  blockBallWrap: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.1)' },
  blockBallWait: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: 'rgba(244,207,106,0.7)', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  blockBallWaitText: { color: GOLD, fontSize: 20, fontWeight: '900' },
  verifyBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, backgroundColor: GOLD, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  verifyText: { color: LEDGER_2, fontSize: 12.5, fontWeight: '900' },
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
  tableHint: { color: MUTED, textAlign: 'center', fontSize: 11, paddingTop: 10 },
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
  detailCard: { width: '88%', maxWidth: 380, borderRadius: 18, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between' },
  detailLabel: { color: MUTED, fontSize: 13, fontWeight: '700' },
  detailValue: { color: INK, fontSize: 13, fontWeight: '800' },
  rulesCard: { width: '88%', borderRadius: 18, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  rulesHead: { paddingVertical: 12, alignItems: 'center' },
  rulesTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
  rulesText: { color: INK, fontSize: 13, lineHeight: 19 },
  toastWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 1001, elevation: 41 },
  toastText: { color: '#FFFFFF', backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, overflow: 'hidden', fontWeight: '700' },
});

/** Home-screen tile art: a block of hash with its result digit lit, and the
 * number ball it gives. */
export function TrxTileArt({ size }: { size: number }) {
  const w = size * 0.62;
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: w, paddingVertical: 5, paddingHorizontal: 6, borderRadius: 8, backgroundColor: LEDGER_2, borderWidth: 1.5, borderColor: GOLD, gap: 1 }}>
        {['0528f7a9', 'c3e1bd4f', 'a0e6d0b7'].map((line, r) => (
          <Text key={r} style={{ fontFamily: MONO, color: 'rgba(232,243,236,0.85)', fontSize: w / 9.5, letterSpacing: 0.5, textAlign: 'center' }}>
            {r === 2 ? (
              <>
                {line.slice(0, 7)}
                <Text style={{ color: LEDGER_2, backgroundColor: GOLD, fontWeight: '900' }}>7</Text>
              </>
            ) : (
              line
            )}
          </Text>
        ))}
      </View>
      <View style={{ position: 'absolute', right: -size * 0.1, bottom: -size * 0.12 }}>
        <NumberBall n={7} size={size * 0.3} />
      </View>
    </View>
  );
}
