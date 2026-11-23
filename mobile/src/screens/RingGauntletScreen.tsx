import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../components/AppText';
import { ApiClientError } from '../api/client';
import {
  RingGauntletConfig,
  RingGauntletMove,
  RingGauntletRound,
  RingKey,
  RingSegment,
  advanceRingGauntlet,
  autoRingGauntlet,
  cashOutRingGauntlet,
  fetchRingGauntletConfig,
  fetchRingGauntletCurrent,
  fetchRingGauntletHistory,
  partCashOutRingGauntlet,
  startRingGauntlet,
} from '../api/backend';
import { useGameState } from '../state/GameStateContext';
import { PlayOptions, SoundSet, setSoundEnabled, useSoundEnabled } from '../sound/engine';
import type { SoundEvent } from '../sound/types';
import { withTapSound } from '../sound/ui';
import RingWheel, { RING_COLOR, RING_NAME, RING_ORDER, endAngle } from './ring/RingWheel';
import { AutoSheet, BetSheet, INK, InfoSheet, MUTED, PINK, ShapeIcon, money } from './ring/RingSheets';

/*
 * Ring Gauntlet: three rings, 8, 6 and 4 segments. Pick a ring (tap its badge), set the bet and press PLAY: the bet is placed and the first
 * segment is tried. Every press after that tries the next one; each survived segment lights up and raises the cash-out value, a failed
 * one loses the round. CASHOUT takes the value, PART CASHOUT takes half and keeps climbing, holding PLAY sets up autoplay.
 * The odds are in the backend (ringGauntletEngine.ts); here the pictures come from scripts/art/ringgauntlet and the wheel is drawn live.
 */

const A = {
  bg: require('../../assets/ringgauntlet/bg.webp'),
  plate: require('../../assets/ringgauntlet/plate.webp'),
  play: require('../../assets/ringgauntlet/play.webp'),
  playLit: require('../../assets/ringgauntlet/play-lit.webp'),
  logo: require('../../assets/ringgauntlet/logo.webp'),
};
const GUARD = {
  OUTER: require('../../assets/ringgauntlet/guard-outer.webp'),
  MIDDLE: require('../../assets/ringgauntlet/guard-middle.webp'),
  INNER: require('../../assets/ringgauntlet/guard-inner.webp'),
  lost: require('../../assets/ringgauntlet/guard-lost.webp'),
};

const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
const DEFAULT_BET = 10;
const BIG_WIN_X = 10;
const TOAST_MS = 2400;

// What the rings show before the server's table arrives (the numbers are the game's own and never change).
const FALLBACK_LABELS: Record<RingKey, string[]> = {
  OUTER: ['3.9X', '12.5X', '28X', '52X', '85X', '133X', '200X', 'BONUS'],
  MIDDLE: ['2.5X', '7.7X', '16X', '27.5X', '44X', '+20.5X'],
  INNER: ['1.55X', '4.85X', '10X', '+7X'],
};
const FALLBACK: Record<RingKey, RingSegment[]> = Object.fromEntries(
  RING_ORDER.map((k) => [
    k,
    FALLBACK_LABELS[k].map((label, i) => ({
      step: i + 1,
      kind: label === 'BONUS' ? 'bonus' : label.startsWith('+') ? 'plus' : 'x',
      label,
      multiplier: parseFloat(label) || 0,
      chance: 0,
      reach: 0,
    })),
  ])
) as Record<RingKey, RingSegment[]>;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const pct = (n: number) => `${(n * 100).toFixed(n >= 0.1 ? 0 : 1)}%`;

type Pop = { text: string; sub: string; kind: 'win' | 'big' | 'lose' } | null;

export default function RingGauntletScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();
  const soundOn = useSoundEnabled();

  const [config, setConfig] = useState<RingGauntletConfig | null>(null);
  const [ring, setRing] = useState<RingKey>('MIDDLE');
  const [bet, setBet] = useState(DEFAULT_BET);
  const [round, setRound] = useState<RingGauntletRound | null>(null);
  const [busy, setBusy] = useState(false);
  const [sweep, setSweep] = useState(0);
  const [litStep, setLitStep] = useState(0);
  const [fail, setFail] = useState<{ step: number; alpha: number } | null>(null);
  const [lost, setLost] = useState(false);
  const [glow, setGlow] = useState(0);
  const [pop, setPop] = useState<Pop>(null);
  const [lastWin, setLastWin] = useState<number | null>(null);
  const [shownBalance, setShownBalance] = useState(coins);
  const [autoLeft, setAutoLeft] = useState(0);
  const [autoRounds, setAutoRounds] = useState(10);
  const [autoTarget, setAutoTarget] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const [betOpen, setBetOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [tab, setTab] = useState<'rules' | 'odds' | 'history'>('rules');
  const [history, setHistory] = useState<RingGauntletRound[] | null>(null);

  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const roundRef = useRef<RingGauntletRound | null>(null);
  roundRef.current = round;
  const ringRef = useRef(ring);
  ringRef.current = ring;
  const betRef = useRef(bet);
  betRef.current = bet;
  const balanceRef = useRef(shownBalance);
  balanceRef.current = shownBalance;
  const autoRef = useRef(0);
  const autoTargetRef = useRef(1);
  autoTargetRef.current = autoTarget;
  const sweepRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soundsRef = useRef<SoundSet | null>(null);
  const guardScale = useRef(new Animated.Value(1)).current;
  const guardTilt = useRef(new Animated.Value(0)).current;
  const popAnim = useRef(new Animated.Value(0)).current;
  const pressAnim = useRef(new Animated.Value(0)).current;

  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 100000;
  const levels = useMemo(() => BET_LEVELS.filter((b) => b >= minStake && b <= maxStake), [minStake, maxStake]);
  const rings = useMemo(() => {
    const out = { ...FALLBACK } as Record<RingKey, RingSegment[]>;
    if (config) for (const r of config.rings) out[r.ring] = r.steps;
    return out;
  }, [config]);
  const steps = rings[ring];
  const autoActive = autoLeft > 0;
  const locked = busy || round !== null || autoActive;

  // ---------- sounds: the pack of this game ----------
  useEffect(() => {
    const set = new SoundSet('ringgauntlet');
    soundsRef.current = set;
    return () => {
      set.release();
      soundsRef.current = null;
    };
  }, []);
  const play = useCallback((ev: SoundEvent, opts?: PlayOptions) => soundsRef.current?.play(ev, opts), []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchRingGauntletConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => {});
    // An open round (the player left in the middle of a climb) goes on where it was.
    fetchRingGauntletCurrent()
      .then((r) => {
        if (!r || !mountedRef.current) return;
        setRing(r.ring);
        setRound(r);
        setLitStep(r.currentStep);
        sweepRef.current = endAngle(r.ring, r.currentStep);
        setSweep(sweepRef.current);
      })
      .catch(() => {});
    return () => {
      mountedRef.current = false;
      autoRef.current = 0;
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!busyRef.current) setShownBalance(coins);
  }, [coins]);

  // A bet the limits do not allow comes down to the nearest that they do.
  useEffect(() => {
    if (levels.length && !levels.includes(bet)) setBet(levels.reduce((best, b) => (Math.abs(b - bet) < Math.abs(best - bet) ? b : best), levels[0]));
  }, [levels, bet]);

  // ---------- small animations ----------
  /** The lit arc runs to `to` degrees (ease-out), a frame at a time. */
  const animateSweep = useCallback(
    (to: number, ms: number) =>
      new Promise<void>((resolve) => {
        if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
        const from = sweepRef.current;
        if (ms <= 0 || Math.abs(to - from) < 0.01) {
          sweepRef.current = to;
          setSweep(to);
          resolve();
          return;
        }
        const t0 = Date.now();
        const tick = () => {
          if (!mountedRef.current) return resolve();
          const p = Math.min(1, (Date.now() - t0) / ms);
          const v = from + (to - from) * (1 - Math.pow(1 - p, 3));
          sweepRef.current = v;
          setSweep(v);
          if (p < 1) frameRef.current = requestAnimationFrame(tick);
          else {
            frameRef.current = null;
            resolve();
          }
        };
        frameRef.current = requestAnimationFrame(tick);
      }),
    []
  );

  const bump = useCallback(() => {
    guardScale.setValue(0.88);
    Animated.spring(guardScale, { toValue: 1, friction: 4, tension: 180, useNativeDriver: true }).start();
  }, [guardScale]);

  const shake = useCallback(() => {
    guardTilt.setValue(0);
    Animated.sequence([-14, 12, -9, 6, -3, 0].map((v) => Animated.timing(guardTilt, { toValue: v, duration: 70, easing: Easing.linear, useNativeDriver: true }))).start();
  }, [guardTilt]);

  const flashRed = useCallback(
    async (step: number, quick: boolean) => {
      const t0 = Date.now();
      const dur = quick ? 600 : 1100;
      while (mountedRef.current) {
        const p = Math.min(1, (Date.now() - t0) / dur);
        setFail({ step, alpha: Math.max(0, 1 - p) * (0.55 + 0.45 * Math.abs(Math.sin(p * 9))) });
        if (p >= 1) break;
        await wait(40);
      }
      if (mountedRef.current) setFail(null);
    },
    []
  );

  const popUp = useCallback(
    (p: NonNullable<Pop>, ms: number) => {
      setPop(p);
      popAnim.setValue(0);
      Animated.spring(popAnim, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }).start();
      return wait(ms).then(() => {
        if (mountedRef.current) setPop(null);
      });
    },
    [popAnim]
  );

  const pulseGlow = useCallback(async (ms: number) => {
    const t0 = Date.now();
    while (mountedRef.current) {
      const p = Math.min(1, (Date.now() - t0) / ms);
      setGlow(Math.sin(p * Math.PI));
      if (p >= 1) break;
      await wait(40);
    }
    if (mountedRef.current) setGlow(0);
  }, []);

  // ---------- the round's endings ----------
  const clearBoard = useCallback(
    async (quick: boolean) => {
      await animateSweep(0, quick ? 120 : 420);
      if (!mountedRef.current) return;
      setLitStep(0);
      setLost(false);
      setRound(null);
    },
    [animateSweep]
  );

  /** The round ended in a win (a cash-out or the last segment): the money is added, the win is shown, the wheel is cleared. */
  const finishWin = useCallback(
    async (r: RingGauntletRound, prevBanked: number, quick: boolean) => {
      const add = round2(r.payout - prevBanked);
      setShownBalance((b) => round2(b + add));
      setLastWin(r.payout);
      const mult = r.stake > 0 ? r.payout / r.stake : 0;
      const big = mult >= BIG_WIN_X;
      play(big ? 'bigwin' : r.currentStep >= r.steps ? 'win' : 'cashout');
      pulseGlow(quick ? 700 : 1500);
      bump();
      await popUp({ text: `+${money(r.payout)}`, sub: r.currentStep >= r.steps ? `LAST SEGMENT · ${r.bonus > 0 ? `+${r.bonus}X` : ''} ${r.multiplier}X`.replace('  ', ' ') : `CASHED OUT · ${r.multiplier}X`, kind: big ? 'big' : 'win' }, quick ? 650 : big ? 2200 : 1500);
      refreshWallet().catch(() => {});
      await clearBoard(quick);
    },
    [bump, clearBoard, play, popUp, pulseGlow, refreshWallet]
  );

  /** A segment was failed: the segment flashes red, the sentinel cracks, what part cash-outs already paid stays with the player. */
  const finishLoss = useCallback(
    async (r: RingGauntletRound, quick: boolean) => {
      play('special');
      shake();
      setLost(true);
      if (r.payout > 0) setLastWin(r.payout);
      if (!quick) setTimeout(() => mountedRef.current && play('lose'), 480);
      else play('lose');
      const flash = flashRed(r.currentStep + 1, quick);
      await popUp({ text: 'OUT!', sub: r.payout > 0 ? `You kept ${money(r.payout)}` : `Segment ${r.currentStep + 1} failed`, kind: 'lose' }, quick ? 650 : 1400);
      await flash;
      refreshWallet().catch(() => {});
      await clearBoard(quick);
    },
    [clearBoard, flashRed, play, popUp, refreshWallet, shake]
  );

  /** One reply of the server (the first segment, or the next one): the arc runs there, and the round goes on or ends. */
  const reveal = useCallback(
    async (move: RingGauntletMove, before: RingGauntletRound | null, quick = false) => {
      const r = move.round;
      if (move.survived) {
        // every segment of the climb in turn (an autoplay round can come back several segments up)
        for (let k = (before?.currentStep ?? 0) + 1; k <= r.currentStep; k++) {
          play('step', { rate: Math.min(1.6, 1 + 0.07 * (k - 1)) });
          bump();
          await animateSweep(endAngle(r.ring, k), quick ? 150 : 430);
          if (!mountedRef.current) return;
          setLitStep(k);
        }
        if (r.status === 'WON') await finishWin(r, before?.banked ?? 0, quick);
        else setRound(r);
      } else {
        // the arc first runs up to the segments that were survived
        for (let k = (before?.currentStep ?? 0) + 1; k <= r.currentStep; k++) {
          play('step', { rate: Math.min(1.6, 1 + 0.07 * (k - 1)) });
          await animateSweep(endAngle(r.ring, k), quick ? 150 : 430);
          if (!mountedRef.current) return;
          setLitStep(k);
        }
        await wait(quick ? 60 : 200);
        await finishLoss(r, quick);
      }
    },
    [animateSweep, bump, finishLoss, finishWin, play]
  );

  const release = () => {
    busyRef.current = false;
    if (mountedRef.current) setBusy(false);
  };

  // ---------- the moves ----------
  const start = useCallback(async () => {
    const stake = betRef.current;
    if (stake > balanceRef.current) {
      showToast('Not enough balance — tap Deposit to add money');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setLost(false);
    setFail(null);
    setPop(null);
    setShownBalance((b) => round2(b - stake));
    play('start');
    try {
      const move = await startRingGauntlet(stake, ringRef.current);
      if (!mountedRef.current) return;
      await reveal(move, null);
    } catch (err) {
      setShownBalance((b) => round2(b + stake));
      showToast(errorMessage(err));
    }
    release();
  }, [play, reveal, showToast]);

  const syncRound = useCallback(async () => {
    try {
      const r = await fetchRingGauntletCurrent();
      if (!mountedRef.current) return;
      setRound(r);
      setLitStep(r?.currentStep ?? 0);
      if (r) setRing(r.ring);
      await animateSweep(r ? endAngle(r.ring, r.currentStep) : 0, 200);
    } catch {
      // the next press will tell
    }
  }, [animateSweep]);

  const next = useCallback(async () => {
    const r = roundRef.current;
    if (!r) return;
    busyRef.current = true;
    setBusy(true);
    play('tick');
    try {
      const move = await advanceRingGauntlet(r.id);
      if (!mountedRef.current) return;
      await reveal(move, r);
    } catch (err) {
      showToast(errorMessage(err));
      if (err instanceof ApiClientError && (err.status === 409 || err.status === 400)) await syncRound();
    }
    release();
  }, [play, reveal, showToast, syncRound]);

  const cashOut = useCallback(async () => {
    const r = roundRef.current;
    if (!r || busyRef.current || r.currentStep <= 0) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const done = await cashOutRingGauntlet(r.id);
      if (!mountedRef.current) return;
      await finishWin(done, r.banked, false);
    } catch (err) {
      showToast(errorMessage(err));
      if (err instanceof ApiClientError && (err.status === 409 || err.status === 400)) await syncRound();
    }
    release();
  }, [finishWin, showToast, syncRound]);

  const partCashOut = useCallback(async () => {
    const r = roundRef.current;
    if (!r || busyRef.current || !r.canPartCashout) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const done = await partCashOutRingGauntlet(r.id);
      if (!mountedRef.current) return;
      const added = round2(done.banked - r.banked);
      setShownBalance((b) => round2(b + added));
      play('cashout');
      bump();
      setRound(done);
      showToast(`+${money(added)} taken · half of your bet keeps climbing`);
      refreshWallet().catch(() => {});
    } catch (err) {
      showToast(errorMessage(err));
      if (err instanceof ApiClientError && (err.status === 409 || err.status === 400)) await syncRound();
    }
    release();
  }, [bump, play, refreshWallet, showToast, syncRound]);

  // ---------- autoplay ----------
  const runAuto = useCallback(async () => {
    while (autoRef.current > 0 && mountedRef.current) {
      const stake = betRef.current;
      if (stake > balanceRef.current) {
        showToast('Autoplay stopped: not enough balance');
        break;
      }
      busyRef.current = true;
      setBusy(true);
      setLost(false);
      setFail(null);
      setShownBalance((b) => round2(b - stake));
      play('start');
      try {
        const move = await autoRingGauntlet(stake, ringRef.current, autoTargetRef.current);
        if (!mountedRef.current) return;
        await reveal(move, null, true);
      } catch (err) {
        setShownBalance((b) => round2(b + stake));
        showToast(errorMessage(err));
        autoRef.current = 0;
      }
      release();
      if (autoRef.current > 0) {
        autoRef.current -= 1;
        setAutoLeft(autoRef.current);
        if (autoRef.current > 0) await wait(450);
      }
    }
    autoRef.current = 0;
    if (mountedRef.current) setAutoLeft(0);
  }, [play, reveal, showToast]);

  const startAuto = () => {
    setAutoOpen(false);
    if (locked) return;
    autoRef.current = autoRounds;
    setAutoLeft(autoRounds);
    runAuto();
  };

  // ---------- buttons ----------
  const onPlay = () => {
    if (autoRef.current > 0) {
      autoRef.current = 0; // stops after the round that is running
      setAutoLeft(0);
      showToast('Autoplay stopped');
      return;
    }
    if (busyRef.current) return;
    if (roundRef.current) next();
    else start();
  };
  const onHoldPlay = () => {
    if (busyRef.current || roundRef.current || autoRef.current > 0) return;
    setAutoTarget((t) => Math.min(t, steps.length));
    setAutoOpen(true);
  };
  const pickRing = (k: RingKey) => {
    if (locked) return;
    if (k !== ringRef.current) {
      play('tick');
      setRing(k);
      setAutoTarget(1);
      sweepRef.current = 0;
      setSweep(0);
      setLitStep(0);
    }
  };
  const stepBet = (dir: 1 | -1) => {
    if (locked) return;
    const i = levels.indexOf(bet);
    const j = Math.max(0, Math.min(levels.length - 1, (i < 0 ? 0 : i) + dir));
    if (levels[j] !== undefined) {
      play('tick');
      setBet(levels[j]);
    }
  };
  const openInfo = (t: 'rules' | 'odds' | 'history') => {
    setTab(t);
    setInfoOpen(true);
    if (t === 'history') loadHistory();
  };
  const loadHistory = () => {
    setHistory(null);
    fetchRingGauntletHistory(30)
      .then((h) => mountedRef.current && setHistory(h))
      .catch(() => mountedRef.current && setHistory([]));
  };

  // ---------- layout ----------
  const headerH = insets.top + 52;
  const playSize = W < 380 ? 92 : 100;
  const rowW = Math.min(W, 520) - 24;
  const boxW = (rowW - (playSize - 14)) / 2;
  const controlsH = 172 + insets.bottom;
  const wheelSize = Math.max(240, Math.min(Math.min(W, 520) - 12, H - headerH - controlsH - 30));
  const value = round?.value ?? 0;
  const balanceText = `${shownBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₹`;
  const canCash = !!round && round.currentStep > 0 && !busy;
  const canPart = !!round && round.canPartCashout && !busy;
  const half = round ? Math.floor((value / 2) * 100) / 100 : 0;
  const nextSeg = round?.next ?? null;
  const col = RING_COLOR[ring];
  const guardImg = lost ? GUARD.lost : GUARD[ring];
  const hint = autoActive
    ? `AUTOPLAY · ${autoLeft} round${autoLeft === 1 ? '' : 's'} left · cash out at ${steps[Math.min(autoTarget, steps.length) - 1]?.label ?? ''}`
    : round && nextSeg
      ? `NEXT ${nextSeg.label} · ${pct(nextSeg.chance)} chance`
      : busy
        ? ' '
        : `${RING_NAME[ring].toUpperCase()} · tap a badge to pick a ring`;

  return (
    <View style={styles.root}>
      <Image source={A.bg} style={styles.bg} resizeMode="cover" fadeDuration={0} />

      <View style={[styles.header, { paddingTop: insets.top + 4, height: headerH }]}>
        <Pressable onPress={withTapSound(() => navigation.goBack())} style={styles.headBtn} hitSlop={8} accessibilityLabel="Back">
          <MaterialCommunityIcons name="chevron-left" size={26} color={PINK} />
        </Pressable>
        <Image source={A.logo} style={styles.logo} resizeMode="contain" fadeDuration={0} accessibilityLabel="Ring Gauntlet" />
        <View style={{ flex: 1 }} />
        <Pressable onPress={withTapSound(() => (navigation as any).navigate('Deposit'))} style={styles.deposit} accessibilityLabel="Deposit">
          <MaterialCommunityIcons name="wallet-plus" size={16} color={PINK} />
          <Text style={styles.depositText}>Deposit</Text>
        </Pressable>
        <Pressable onPress={withTapSound(() => openInfo('rules'))} style={styles.headBtn} hitSlop={6} accessibilityLabel="Rules">
          <MaterialCommunityIcons name="menu" size={21} color={PINK} />
        </Pressable>
      </View>

      <View style={[styles.stage, { top: headerH, bottom: controlsH }]}>
        <View style={{ width: wheelSize, height: wheelSize }}>
          <RingWheel
            size={wheelSize}
            rings={rings}
            plate={A.plate}
            ring={ring}
            step={litStep}
            sweep={sweep}
            failStep={fail?.step ?? null}
            failAlpha={fail?.alpha ?? 0}
            guard={guardImg}
            guardScale={guardScale}
            guardTilt={guardTilt}
            glow={glow}
            onPick={locked ? null : pickRing}
          />
          {pop ? (
            <Animated.View
              style={[styles.pop, { transform: [{ scale: popAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }], opacity: popAnim }]}
              pointerEvents="none"
              testID="rg-pop"
            >
              <Text style={[styles.popText, pop.kind === 'lose' && { color: '#FF5A68' }, pop.kind === 'big' && { color: '#FFE27A' }]}>{pop.text}</Text>
              <Text style={styles.popSub}>{pop.sub}</Text>
            </Animated.View>
          ) : null}
        </View>
        <Text style={[styles.hint, round && { color: col.light }]} numberOfLines={1} testID="rg-hint">
          {hint}
        </Text>
      </View>

      {/* the controls */}
      <View style={[styles.controls, { height: controlsH, paddingBottom: insets.bottom + 6 }]}>
        <View style={[styles.row, { width: rowW, gap: playSize - 14 }]}>
          <View style={[styles.box, { width: boxW, height: 44, justifyContent: 'center', paddingHorizontal: 12 }]}>
            <Text style={styles.boxLabel}>BALANCE</Text>
            <Text style={[styles.balance, balanceText.length > 12 ? { fontSize: 12.5 } : balanceText.length > 10 ? { fontSize: 13.5 } : null]} testID="rg-balance" numberOfLines={1}>
              {balanceText}
            </Text>
          </View>
          <Pressable
            onPress={canPart ? partCashOut : undefined}
            style={[styles.box, { width: boxW, height: 44, alignItems: 'center', justifyContent: 'center' }, canPart && styles.partOn]}
            accessibilityRole="button"
            accessibilityLabel="Part cashout"
            accessibilityState={{ disabled: !canPart }}
          >
            <Text style={[styles.partText, canPart && { color: '#FFD76A' }]}>PART CASHOUT</Text>
            {canPart ? <Text style={styles.partSub} numberOfLines={1}>take {money(half)}</Text> : null}
          </Pressable>
        </View>

        <View style={[styles.row, { width: rowW, gap: playSize - 14, marginTop: 10 }]}>
          <View style={[styles.box, { width: boxW, height: 62, flexDirection: 'row', alignItems: 'center', paddingLeft: 12, paddingRight: 6 }, locked && { opacity: 0.55 }]}>
            <Pressable onPress={withTapSound(() => !locked && setBetOpen(true))} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel="Bet">
              <Text style={styles.boxLabel}>BET</Text>
              <Text style={styles.betValue} testID="rg-bet" numberOfLines={1} adjustsFontSizeToFit>
                ₹ {bet.toLocaleString('en-IN')}
              </Text>
            </Pressable>
            <View style={styles.arrows}>
              <Pressable onPress={() => stepBet(1)} hitSlop={6} style={styles.arrow} accessibilityLabel="Raise the bet">
                <MaterialCommunityIcons name="chevron-up" size={22} color={INK} />
              </Pressable>
              <Pressable onPress={() => stepBet(-1)} hitSlop={6} style={styles.arrow} accessibilityLabel="Lower the bet">
                <MaterialCommunityIcons name="chevron-down" size={22} color={INK} />
              </Pressable>
            </View>
          </View>
          <Pressable
            onPress={canCash ? cashOut : undefined}
            style={[styles.box, { width: boxW, height: 62, alignItems: 'center', justifyContent: 'center' }, canCash && styles.cashOn]}
            accessibilityRole="button"
            accessibilityLabel="Cashout"
            accessibilityState={{ disabled: !canCash }}
          >
            <Text style={[styles.cashText, canCash && { color: '#2B1A00' }]}>CASHOUT</Text>
            {round && round.currentStep > 0 ? (
              <Text style={[styles.cashValue, canCash && { color: '#2B1A00' }]} testID="rg-cash" numberOfLines={1} adjustsFontSizeToFit>
                {value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₹
              </Text>
            ) : null}
          </Pressable>
        </View>

        <Text style={styles.lastWin} testID="rg-last">
          LAST WIN: {lastWin === null ? '-' : `${lastWin.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₹`}
        </Text>

        {/* the big button sits across the rows */}
        <Pressable
          onPress={onPlay}
          onLongPress={onHoldPlay}
          delayLongPress={520}
          onPressIn={() => Animated.timing(pressAnim, { toValue: 1, duration: 60, useNativeDriver: true }).start()}
          onPressOut={() => Animated.timing(pressAnim, { toValue: 0, duration: 120, useNativeDriver: true }).start()}
          style={[styles.play, { width: playSize, height: playSize, left: (W - playSize) / 2, top: 91 - playSize / 2 }]}
          accessibilityRole="button"
          accessibilityLabel={autoActive ? 'Stop autoplay' : round ? 'Next segment' : 'Play'}
          testID="rg-play"
        >
          <Animated.View style={{ flex: 1, opacity: busy && !autoActive ? 0.72 : 1, transform: [{ scale: pressAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] }) }] }}>
            <Image source={autoActive ? A.playLit : A.play} style={styles.fill} resizeMode="stretch" fadeDuration={0} />
            {autoActive ? (
              <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
                <Text style={styles.autoCount}>{autoLeft}</Text>
              </View>
            ) : null}
          </Animated.View>
        </Pressable>
      </View>

      {toast ? (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      <BetSheet
        visible={betOpen}
        levels={levels}
        bet={bet}
        onPick={(b) => {
          setBet(b);
          setBetOpen(false);
        }}
        onClose={() => setBetOpen(false)}
      />
      <AutoSheet
        visible={autoOpen}
        ring={ring}
        steps={steps}
        rounds={autoRounds}
        target={Math.min(autoTarget, steps.length)}
        onRounds={setAutoRounds}
        onTarget={setAutoTarget}
        onStart={startAuto}
        onClose={() => setAutoOpen(false)}
      />
      <InfoSheet
        visible={infoOpen}
        tab={tab}
        onTab={(t) => {
          setTab(t);
          if (t === 'history') loadHistory();
        }}
        config={config}
        history={history}
        soundOn={soundOn}
        onSound={setSoundEnabled}
        onClose={() => setInfoOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0c0c0f' },
  bg: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' },
  fill: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 8, zIndex: 3 },
  headBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,79,147,0.5)' },
  logo: { width: 112, height: 34 },
  deposit: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: 'rgba(255,79,147,0.14)', borderWidth: 1.2, borderColor: 'rgba(255,79,147,0.7)' },
  depositText: { color: INK, fontWeight: '800', fontSize: 13 },
  stage: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  hint: { marginTop: 6, color: MUTED, fontWeight: '800', fontSize: 11.5, letterSpacing: 0.8, textAlign: 'center', paddingHorizontal: 16 },
  pop: { position: 'absolute', left: 0, right: 0, top: '40%', alignItems: 'center' },
  popText: { color: '#FFFFFF', fontWeight: '900', fontSize: 38, textShadowColor: '#000', textShadowRadius: 10, textShadowOffset: { width: 0, height: 2 } },
  popSub: { color: INK, fontWeight: '900', fontSize: 12.5, letterSpacing: 1.4, marginTop: 2, textShadowColor: '#000', textShadowRadius: 6 },
  controls: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingTop: 6 },
  row: { flexDirection: 'row', justifyContent: 'center' },
  box: { borderRadius: 10, backgroundColor: 'rgba(28,29,35,0.96)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  boxLabel: { color: MUTED, fontWeight: '800', fontSize: 11, letterSpacing: 1 },
  balance: { color: INK, fontWeight: '900', fontSize: 15, marginTop: 1 },
  partText: { color: 'rgba(237,239,245,0.38)', fontWeight: '900', fontSize: 12, letterSpacing: 0.8 },
  partOn: { borderColor: 'rgba(255,215,106,0.7)', backgroundColor: 'rgba(60,46,10,0.9)' },
  partSub: { color: 'rgba(255,215,106,0.8)', fontWeight: '700', fontSize: 9.5, marginTop: 1 },
  betValue: { color: '#FFFFFF', fontWeight: '900', fontSize: 17, marginTop: 1 },
  arrows: { width: 30, alignItems: 'center', justifyContent: 'center' },
  arrow: { width: 30, height: 26, alignItems: 'center', justifyContent: 'center' },
  cashText: { color: 'rgba(237,239,245,0.45)', fontWeight: '900', fontSize: 15, letterSpacing: 1 },
  cashValue: { color: INK, fontWeight: '900', fontSize: 17, marginTop: 1, maxWidth: '88%' },
  cashOn: { backgroundColor: '#FFC82E', borderColor: '#FFE88A' },
  lastWin: { marginTop: 25, color: INK, fontWeight: '800', fontSize: 12.5, letterSpacing: 0.4 },
  play: { position: 'absolute', zIndex: 4 },
  autoCount: { color: '#2B1A00', fontWeight: '900', fontSize: 30, marginTop: -1 },
  toast: { position: 'absolute', alignSelf: 'center', top: '44%', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.88)', borderWidth: 1, borderColor: 'rgba(255,79,147,0.6)', maxWidth: '88%', zIndex: 6 },
  toastText: { color: INK, fontSize: 13.5, fontWeight: '800', textAlign: 'center' },
});
