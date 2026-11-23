import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, ImageSourcePropType, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../components/AppText';
import { ApiClientError } from '../api/client';
import { TurboSevensConfig, TurboSpinRow, TurboStep, fetchTurboSevensConfig, fetchTurboSevensHistory, spinTurboSevens } from '../api/backend';
import { useGameState } from '../state/GameStateContext';
import { PlayOptions, SoundSet, setSoundEnabled, useSoundEnabled } from '../sound/engine';
import type { SoundEvent } from '../sound/types';
import { withTapSound } from '../sound/ui';
import TurboReel, { Img, ReelHandle } from './turbo/TurboReel';
import { CoinShower, RespinWheel } from './turbo/TurboFx';
import { AutoSheet, BetSheet, GOLD, INK, InfoSheet, money } from './turbo/TurboSheets';

/*
 * Turbo Sevens: a one-payline 777 slot with a fourth, gold-framed bonus reel. Three of a kind (or any mix of 7s and BARs) on the middle row
 * pays; the bonus reel multiplies the line (x2, x5, x10), pays cash ($+, $$+) or opens the respin wheel (1 to 5 respins, bonus reel included).
 * The odds are in the backend (turboSevensEngine.ts); the pictures come from scripts/art/turbosevens and the reels, numbers and lights are live.
 */

const A = {
  bg: require('../../assets/turbosevens/bg.webp'),
  board: require('../../assets/turbosevens/board.webp'),
  reelsBg: require('../../assets/turbosevens/reels-bg.webp'),
  reelsShade: require('../../assets/turbosevens/reels-shade.webp'),
  frame: require('../../assets/turbosevens/frame.webp'),
  panel: require('../../assets/turbosevens/panel.webp'),
  spin: require('../../assets/turbosevens/spin.webp'),
  spinLit: require('../../assets/turbosevens/spin-lit.webp'),
  btn: require('../../assets/turbosevens/btn.webp'),
  btnOn: require('../../assets/turbosevens/btn-on.webp'),
};
const IMAGES: Record<string, Img> = {
  FLAME7: require('../../assets/turbosevens/sym-flame7.webp'),
  RED7: require('../../assets/turbosevens/sym-red7.webp'),
  GOLD7: require('../../assets/turbosevens/sym-gold7.webp'),
  GREEN2BAR: require('../../assets/turbosevens/sym-green2bar.webp'),
  BLUE1BAR: require('../../assets/turbosevens/sym-blue1bar.webp'),
  BLANK: null,
  EMPTY: require('../../assets/turbosevens/b-empty.webp'),
  X2: require('../../assets/turbosevens/b-x2.webp'),
  X5: require('../../assets/turbosevens/b-x5.webp'),
  X10: require('../../assets/turbosevens/b-x10.webp'),
  CASH2: require('../../assets/turbosevens/b-cash2.webp'),
  CASH20: require('../../assets/turbosevens/b-cash20.webp'),
  RESPIN: require('../../assets/turbosevens/b-respin.webp'),
};

// ---------- layout (units of a 412-wide machine, scaled to the phone) ----------
const U_W = 412;
const U_H = 800;
const REELS = { x: 22, y: 338, w: 368, h: 276 };
const COL = 92;
const FRAME_AT = { x: 0, y: 330 };
const PANEL_AT = { x: 0, y: 630 };
const SPIN_C = { x: 206, y: 714 };
const PAYLINE_Y = REELS.y + COL * 1.5;

const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
const DEFAULT_BET = 10;
const TOAST_MS = 2200;
const MAIN_FILLERS = ['FLAME7', 'RED7', 'GOLD7', 'GREEN2BAR', 'BLUE1BAR', 'BLANK', 'BLANK', 'GREEN2BAR', 'BLUE1BAR', 'BLANK'];
const BONUS_FILLERS = ['EMPTY', 'EMPTY', 'EMPTY', 'X2', 'EMPTY', 'CASH2', 'EMPTY', 'X5', 'EMPTY', 'RESPIN', 'EMPTY', 'X10', 'CASH20', 'EMPTY'];
const START_ROWS: string[][] = [
  ['GREEN2BAR', 'BLUE1BAR', 'GOLD7'],
  ['BLANK', 'BLUE1BAR', 'GREEN2BAR'],
  ['RED7', 'BLUE1BAR', 'BLANK'],
  ['EMPTY', 'EMPTY', 'EMPTY'],
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function floor2(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}
function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const none = () => [false, false, false, false].map(() => [false, false, false]);

type Badge = { text: string; kind: 'mult' | 'cash' | 'line' } | null;

export default function TurboSevensScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();
  const soundOn = useSoundEnabled();

  const [config, setConfig] = useState<TurboSevensConfig | null>(null);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [busy, setBusy] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [autoLeft, setAutoLeft] = useState(0);
  const [shownBalance, setShownBalance] = useState(coins);
  const [winShown, setWinShown] = useState(0);
  const [counting, setCounting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [dimmed, setDimmed] = useState<boolean[][]>(none());
  const [glowing, setGlowing] = useState<boolean[][]>(none());
  const [banner, setBanner] = useState<string | null>(null);
  const [badge, setBadge] = useState<Badge>(null);
  const [wheel, setWheel] = useState<{ stage: 'spin' | 'done'; respins: number } | null>(null);
  const [bigWin, setBigWin] = useState<number | null>(null);
  const [panel, setPanel] = useState<'pays' | 'rules' | 'history' | null>(null);
  const [history, setHistory] = useState<TurboSpinRow[] | null>(null);
  const [betOpen, setBetOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);

  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const turboRef = useRef(false);
  turboRef.current = turbo;
  const autoRef = useRef(0);
  autoRef.current = autoLeft;
  const quickRef = useRef(false);
  const balanceRef = useRef(shownBalance);
  balanceRef.current = shownBalance;
  const betRef = useRef(bet);
  betRef.current = bet;
  const configRef = useRef<TurboSevensConfig | null>(null);
  configRef.current = config;
  const soundsRef = useRef<SoundSet | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runRef = useRef<() => void>(() => {});
  const reelRefs = [useRef<ReelHandle>(null), useRef<ReelHandle>(null), useRef<ReelHandle>(null), useRef<ReelHandle>(null)];
  const shownRef = useRef<string[][] | null>(null);
  const pressSpin = useRef(new Animated.Value(0)).current;
  const lineGlow = useRef(new Animated.Value(0)).current;
  const badgeAnim = useRef(new Animated.Value(0)).current;
  const wheelTurn = useRef(new Animated.Value(0)).current;
  const shower = useRef(new Animated.Value(0)).current;

  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 100000;
  const levels = useMemo(() => BET_LEVELS.filter((b) => b >= minStake && b <= maxStake), [minStake, maxStake]);
  const locked = busy || autoLeft > 0;

  // ---------- sounds ----------
  useEffect(() => {
    const set = new SoundSet('turbosevens');
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
    fetchTurboSevensConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => {});
    return () => {
      mountedRef.current = false;
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (autoTimer.current) clearTimeout(autoTimer.current);
    };
  }, []);

  // the reels show a real stop of the real strips from the start
  useEffect(() => {
    if (!config || busyRef.current || shownRef.current) return;
    const rowsOf = (strip: string[], stop: number) => [-1, 0, 1].map((d) => strip[(stop + d + strip.length) % strip.length]);
    config.strips.slice(0, 3).forEach((strip, i) => reelRefs[i].current?.set(rowsOf(strip, 5 + i * 7)));
    reelRefs[3].current?.set(rowsOf(config.bonusStrip, 3));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  useEffect(() => {
    if (!busyRef.current) setShownBalance(coins);
  }, [coins]);

  // A bet the limits do not allow comes down to the nearest that they do.
  useEffect(() => {
    if (levels.length && !levels.includes(bet)) setBet(levels.reduce((best, b) => (Math.abs(b - bet) < Math.abs(best - bet) ? b : best), levels[0]));
  }, [levels, bet]);

  // ---------- the show ----------
  const clearLights = () => {
    setDimmed(none());
    setGlowing(none());
    lineGlow.setValue(0);
  };

  const countUp = useCallback(
    async (from: number, to: number) => {
      if (from === to) return;
      setCounting(true);
      const quick = quickRef.current || turboRef.current;
      const steps = quick ? 6 : 16;
      for (let i = 1; i <= steps && mountedRef.current; i++) {
        setWinShown(round2(from + ((to - from) * i) / steps));
        if (i % 4 === 0) play('tick');
        await wait(quick ? 30 : 45);
      }
      setWinShown(to);
    },
    [play]
  );
  const pause = (ms: number) => wait(quickRef.current ? Math.min(ms, 120) : turboRef.current ? ms * 0.45 : ms);

  const startAll = () => {
    reelRefs.forEach((r) => r.current?.start());
  };

  /** The four reels land on a step's window (the bonus reel last) and resolve when the last one has settled. */
  const landStep = useCallback(
    async (step: TurboStep, startedAt: number) => {
      shownRef.current = [...step.window, step.bonusWindow];
      const fast = turboRef.current || quickRef.current;
      await wait(Math.max(0, (fast ? 380 : 950) - (Date.now() - startedAt)));
      const gap = fast ? 110 : 260;
      await Promise.all(
        [0, 1, 2, 3].map((i) =>
          reelRefs[i].current?.land(i < 3 ? step.window[i] : step.bonusWindow, i * gap + (i === 3 ? (fast ? 60 : 160) : 0)).then(() => play('land'))
        )
      );
    },
    [play]
  );

  const pop = useCallback(
    (b: NonNullable<Badge>) => {
      setBadge(b);
      badgeAnim.setValue(0);
      Animated.spring(badgeAnim, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }).start();
    },
    [badgeAnim]
  );

  /** Shows what one step (the paid spin or a respin) won: the line, the multiplier of the bonus reel, the cash symbol. Returns the running total. */
  const showStep = useCallback(
    async (step: TurboStep, stake: number, running: number) => {
      let total = running;
      const hits = [false, false, false, false].map(() => [false, false, false]);
      if (step.linePay > 0) [0, 1, 2].forEach((r) => (hits[r][1] = true));
      if ((step.multiplier > 1 && step.linePay > 0) || step.cash > 0) hits[3][1] = true;
      const any = hits.some((c) => c.some(Boolean));
      if (any) {
        setGlowing(hits);
        setDimmed(hits.map((c) => c.map((x) => !x)));
        Animated.loop(Animated.sequence([Animated.timing(lineGlow, { toValue: 1, duration: 380, useNativeDriver: true }), Animated.timing(lineGlow, { toValue: 0.35, duration: 380, useNativeDriver: true })]), { iterations: 3 }).start();
      }
      if (step.linePay > 0) {
        const line = round2(floor2(stake * step.linePay));
        play(step.linePay >= 20 ? 'bigwin' : 'win');
        pop({ text: `+${money(line)}`, kind: 'line' });
        await countUp(total, round2(total + line));
        total = round2(total + line);
        await pause(500);
      }
      if (step.multiplier > 1 && step.linePay > 0) {
        play('special');
        pop({ text: `×${step.multiplier}`, kind: 'mult' });
        const full = round2(floor2(stake * step.linePay * step.multiplier));
        const gain = round2(full - round2(floor2(stake * step.linePay)));
        await pause(500);
        await countUp(total, round2(total + gain));
        total = round2(total + gain);
        await pause(500);
      }
      if (step.cash > 0) {
        play('cashout');
        const cash = round2(floor2(stake * step.cash));
        pop({ text: `+${money(cash)}`, kind: 'cash' });
        await pause(350);
        await countUp(total, round2(total + cash));
        total = round2(total + cash);
        await pause(500);
      }
      if (any) {
        setBadge(null);
        lineGlow.stopAnimation();
      }
      return total;
    },
    [countUp, lineGlow, play, pop]
  );

  /** The wheel turns and stops on the number of respins the server awarded. */
  const spinWheel = useCallback(
    async (respins: number) => {
      setWheel({ stage: 'spin', respins });
      wheelTurn.setValue(0);
      play('reveal');
      const target = 360 * 5 - (respins - 0.5) * 72;
      await new Promise<void>((resolve) => Animated.timing(wheelTurn, { toValue: target, duration: quickRef.current ? 900 : turboRef.current ? 1500 : 2800, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => resolve()));
      if (!mountedRef.current) return;
      setWheel({ stage: 'done', respins });
      play('special');
      await wait(quickRef.current ? 500 : 1300);
      setWheel(null);
    },
    [play, wheelTurn]
  );

  /** One spin, from the press to the last respin. */
  const run = useCallback(async () => {
    const cfg = configRef.current;
    if (busyRef.current) return;
    if (!cfg) {
      showToast('Loading the machine…');
      fetchTurboSevensConfig()
        .then((c) => mountedRef.current && setConfig(c))
        .catch(() => {});
      return;
    }
    const stake = betRef.current;
    if (stake > balanceRef.current) {
      showToast('Not enough balance');
      setAutoLeft(0);
      return;
    }
    busyRef.current = true;
    quickRef.current = false;
    setBusy(true);
    setBigWin(null);
    setBadge(null);
    setBanner(null);
    clearLights();
    setWinShown(0);
    setCounting(false);
    setShownBalance((b) => round2(b - stake));
    play('start');
    startAll();
    const started = Date.now();

    let res;
    try {
      res = await spinTurboSevens(stake);
    } catch (err) {
      if (shownRef.current) reelRefs.forEach((r, i) => r.current?.set(shownRef.current![i]));
      setShownBalance((v) => round2(v + stake));
      setAutoLeft(0);
      showToast(errorMessage(err));
      busyRef.current = false;
      setBusy(false);
      return;
    }
    if (!mountedRef.current) return;
    const { outcome, spin } = res;
    const payout = Number(spin.payout);

    await landStep(outcome.spins[0], started);
    if (!mountedRef.current) return;
    let running = await showStep(outcome.spins[0], stake, 0);

    if (outcome.respins > 0) {
      await pause(300);
      await spinWheel(outcome.respins);
      for (let i = 1; i <= outcome.respins && mountedRef.current; i++) {
        clearLights();
        setBanner(`RESPIN ${i} / ${outcome.respins}`);
        play('step');
        startAll();
        await landStep(outcome.spins[i], Date.now());
        running = await showStep(outcome.spins[i], stake, running);
      }
      setBanner(null);
    }

    // the whole spin is paid at once (rounded down as a whole), then a big win gets its banner
    if (payout > 0 && payout !== running) setWinShown(payout);
    if (payout <= 0) setWinShown(0);
    setCounting(false);
    setShownBalance((v) => round2(v + payout));
    refreshWallet().catch(() => {});
    setHistory(null);
    if (payout >= stake * 25) {
      setBigWin(payout);
      shower.setValue(0);
      Animated.timing(shower, { toValue: 1, duration: 2600, easing: Easing.linear, useNativeDriver: true }).start();
      play('bigwin');
      await wait(quickRef.current ? 600 : 2600);
      setBigWin(null);
    } else if (payout <= 0) {
      await pause(150);
    }
    busyRef.current = false;
    setBusy(false);
    quickRef.current = false;

    if (autoRef.current > 0) {
      const next = autoRef.current - 1;
      setAutoLeft(next);
      if (next > 0) autoTimer.current = setTimeout(() => mountedRef.current && runRef.current(), turboRef.current ? 250 : 800);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landStep, play, refreshWallet, showStep, showToast, spinWheel]);
  runRef.current = run;

  const onSpin = () => {
    if (autoLeft > 0 && !busy) {
      setAutoLeft(0);
      return;
    }
    if (busy) {
      // a second press while it turns: hurry up (and stop the auto spins)
      quickRef.current = true;
      setAutoLeft(0);
      return;
    }
    run();
  };

  const startAuto = (n: number) => {
    setAutoOpen(false);
    setAutoLeft(n);
    autoRef.current = n;
    run();
  };

  const openPanel = (p: 'pays' | 'rules' | 'history') => {
    setPanel(p);
    if (p === 'history') {
      setHistory(null);
      fetchTurboSevensHistory(30)
        .then((h) => mountedRef.current && setHistory(h))
        .catch(() => mountedRef.current && setHistory([]));
    }
  };

  // ---------- layout ----------
  const headerH = insets.top + 46;
  const availH = H - headerH - insets.bottom;
  const k = Math.min(Math.min(W, 520) / U_W, availH / U_H);
  const gameW = U_W * k;
  const gameH = U_H * k;
  const u = (n: number) => n * k;
  const box = (x: number, y: number, w: number, h: number) => ({ position: 'absolute' as const, left: u(x), top: u(y), width: u(w), height: u(h) });
  const spinSize = 104;

  return (
    <View style={styles.root}>
      <Image source={A.bg} style={styles.bg} resizeMode="cover" fadeDuration={0} />

      <View style={[styles.header, { paddingTop: insets.top + 4, height: headerH }]}>
        <Pressable onPress={withTapSound(() => navigation.goBack())} style={styles.headBtn} hitSlop={8} accessibilityLabel="Back">
          <MaterialCommunityIcons name="chevron-left" size={26} color={GOLD} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={withTapSound(() => (navigation as any).navigate('Deposit'))} style={styles.deposit} accessibilityLabel="Deposit">
          <MaterialCommunityIcons name="wallet-plus" size={16} color={GOLD} />
          <Text style={styles.depositText}>Deposit</Text>
        </Pressable>
        <Pressable onPress={withTapSound(() => setSoundEnabled(!soundOn))} style={styles.headBtn} hitSlop={6} accessibilityLabel="Sound">
          <MaterialCommunityIcons name={soundOn ? 'volume-high' : 'volume-off'} size={19} color={GOLD} />
        </Pressable>
        <Pressable onPress={withTapSound(() => openPanel('history'))} style={styles.headBtn} hitSlop={6} accessibilityLabel="History">
          <MaterialCommunityIcons name="history" size={19} color={GOLD} />
        </Pressable>
        <Pressable onPress={withTapSound(() => openPanel('pays'))} style={styles.headBtn} hitSlop={6} accessibilityLabel="Rules">
          <MaterialCommunityIcons name="information-variant" size={21} color={GOLD} />
        </Pressable>
      </View>

      <View style={{ position: 'absolute', top: headerH, left: 0, right: 0, alignItems: 'center' }}>
        <View style={{ width: gameW, height: gameH }}>
          {/* the top of the machine */}
          <Pic source={A.board} style={box(0, 0, 412, 330)} />

          {/* the reels */}
          <Pic source={A.reelsBg} style={box(REELS.x, REELS.y, REELS.w, REELS.h)} />
          <View style={[box(REELS.x, REELS.y, REELS.w, REELS.h), { flexDirection: 'row' }]}>
            {[0, 1, 2, 3].map((r) => (
              <TurboReel
                key={r}
                ref={reelRefs[r]}
                initial={START_ROWS[r]}
                cell={u(COL)}
                width={u(COL)}
                images={IMAGES}
                fillers={r < 3 ? MAIN_FILLERS : BONUS_FILLERS}
                dimmed={dimmed[r]}
                glowing={glowing[r]}
                fast={turbo}
              />
            ))}
          </View>
          <Pic source={A.reelsShade} style={box(REELS.x, REELS.y, REELS.w, REELS.h)} />

          {/* the payline: a thin line always, a bright one on a win */}
          <View style={[box(REELS.x, PAYLINE_Y - 1.2, REELS.w, 2.4), { backgroundColor: 'rgba(255,205,60,0.55)' }]} pointerEvents="none" />
          <Animated.View
            style={[box(REELS.x, PAYLINE_Y - 3, REELS.w, 6), { backgroundColor: '#FFE680', opacity: lineGlow, shadowColor: '#FFC020', shadowRadius: 10, shadowOpacity: 1, shadowOffset: { width: 0, height: 0 } }]}
            pointerEvents="none"
          />
          <Pic source={A.frame} style={box(FRAME_AT.x, FRAME_AT.y, 412, 300)} />

          {/* what the spin is winning */}
          {counting && winShown > 0 ? (
            <View style={[box(REELS.x, PAYLINE_Y - 34, REELS.w, 68), styles.center]} pointerEvents="none">
              <Text style={[styles.reelWin, { fontSize: u(44) }]} testID="ts-reelwin">
                {winShown.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
          ) : null}
          {badge ? (
            <Animated.View
              style={[box(REELS.x, REELS.y + 6, REELS.w, 56), styles.center, { opacity: badgeAnim, transform: [{ scale: badgeAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }]}
              pointerEvents="none"
            >
              <View style={[styles.badge, badge.kind === 'mult' && styles.badgeMult, badge.kind === 'cash' && styles.badgeCash]}>
                <Text style={[styles.badgeText, { fontSize: u(26) }]}>{badge.text}</Text>
              </View>
            </Animated.View>
          ) : null}
          {banner ? (
            <View style={[box(REELS.x + 60, REELS.y + REELS.h - 30, REELS.w - 120, 26), styles.banner]} pointerEvents="none">
              <Text style={[styles.bannerText, { fontSize: u(13) }]}>{banner}</Text>
            </View>
          ) : null}

          {/* the control deck */}
          <Pic source={A.panel} style={box(PANEL_AT.x, PANEL_AT.y, 412, 170)} />
          <View style={[box(116, PANEL_AT.y + 9, 180, 30), styles.winPlate]} pointerEvents="none">
            <Text style={[styles.winLabel, { fontSize: u(14) }]}>WIN</Text>
            <Text style={[styles.winValue, { fontSize: u(16) }]} testID="ts-win">
              {money(winShown)}
            </Text>
          </View>
          <View style={[box(126, PANEL_AT.y + 134, 160, 28), styles.winPlate]} pointerEvents="none">
            <Text style={[styles.balLabel, { fontSize: u(13) }]}>Balance</Text>
            <Text style={[styles.balValue, { fontSize: u(14.5) }]} testID="ts-balance">
              {money(shownBalance)}
            </Text>
          </View>

          {/* bet, spin, auto, turbo */}
          <Pressable onPress={withTapSound(() => !locked && setBetOpen(true))} style={[box(36, 692, 52, 52), locked && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel="Bet">
            <Image source={A.btn} style={styles.fill} resizeMode="stretch" fadeDuration={0} />
            <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
              <MaterialCommunityIcons name="layers" size={u(26)} color="#FFE9A8" />
            </View>
          </Pressable>
          <Text style={[box(10, 746, 104, 20), styles.btnLabel, { fontSize: u(12.5) }]} pointerEvents="none" testID="ts-bet">
            Bet ₹{bet.toLocaleString('en-IN')}
          </Text>

          <Pressable
            onPress={onSpin}
            onPressIn={() => Animated.timing(pressSpin, { toValue: 1, duration: 60, useNativeDriver: true }).start()}
            onPressOut={() => Animated.timing(pressSpin, { toValue: 0, duration: 120, useNativeDriver: true }).start()}
            style={box(SPIN_C.x - spinSize / 2, SPIN_C.y - spinSize / 2 - 6, spinSize, spinSize)}
            accessibilityRole="button"
            accessibilityLabel={busy ? 'Hurry' : autoLeft > 0 ? 'Stop auto spin' : 'Spin'}
            testID="ts-spin"
          >
            <Animated.View style={{ flex: 1, transform: [{ scale: pressSpin.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] }) }] }}>
              <Image source={busy || autoLeft > 0 ? A.spinLit : A.spin} style={styles.fill} resizeMode="stretch" fadeDuration={0} />
              {autoLeft > 0 ? (
                <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
                  <Text style={[styles.autoCount, { fontSize: u(26) }]}>{autoLeft}</Text>
                </View>
              ) : null}
            </Animated.View>
          </Pressable>

          <Pressable onPress={withTapSound(() => (autoLeft > 0 ? setAutoLeft(0) : !busy && setAutoOpen(true)))} style={box(300, 692, 52, 52)} accessibilityRole="button" accessibilityLabel="Auto spin">
            <Image source={autoLeft > 0 ? A.btnOn : A.btn} style={styles.fill} resizeMode="stretch" fadeDuration={0} />
            <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
              <MaterialCommunityIcons name="autorenew" size={u(26)} color={autoLeft > 0 ? '#06310F' : '#FFE9A8'} />
            </View>
          </Pressable>
          <Pressable onPress={withTapSound(() => setTurbo((t) => !t))} style={box(356, 692, 52, 52)} accessibilityRole="button" accessibilityLabel="Turbo" accessibilityState={{ selected: turbo }}>
            <Image source={turbo ? A.btnOn : A.btn} style={styles.fill} resizeMode="stretch" fadeDuration={0} />
            <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
              <MaterialCommunityIcons name="flash" size={u(27)} color={turbo ? '#06310F' : '#FFE9A8'} />
            </View>
          </Pressable>
          <Text style={[box(286, 746, 126, 20), styles.btnLabel, { fontSize: u(11), color: 'rgba(255,243,220,0.7)' }]} pointerEvents="none">
            {autoLeft > 0 ? 'Auto · tap to stop' : turbo ? 'Auto · Turbo ON' : 'Auto · Turbo'}
          </Text>

          {/* the respin wheel */}
          {wheel ? (
            <View style={[box(0, REELS.y - 10, 412, 300), styles.center, styles.wheelLayer]} pointerEvents="none">
              <Text style={[styles.wheelTitle, { fontSize: u(15) }]}>RESPIN WHEEL</Text>
              <View style={{ marginTop: u(14), marginBottom: u(6) }}>
                <RespinWheel size={u(190)} turn={wheelTurn} />
              </View>
              <Text style={[styles.wheelResult, { fontSize: u(22), opacity: wheel.stage === 'done' ? 1 : 0 }]}>{wheel.respins} RESPIN{wheel.respins === 1 ? '' : 'S'}!</Text>
            </View>
          ) : null}

          {bigWin !== null ? (
            <View style={[box(0, 250, 412, 400), styles.center]} pointerEvents="none">
              <CoinShower w={u(412)} h={u(400)} progress={shower} />
              <Text style={[styles.bigWinText, { fontSize: u(40) }]}>BIG WIN</Text>
              <Text style={[styles.bigWinAmount, { fontSize: u(34) }]}>{money(bigWin)}</Text>
            </View>
          ) : null}
        </View>
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
      <AutoSheet visible={autoOpen} onStart={startAuto} onClose={() => setAutoOpen(false)} />
      <InfoSheet
        visible={panel !== null}
        tab={panel ?? 'pays'}
        onTab={openPanel}
        config={config}
        bet={bet}
        history={history}
        soundOn={soundOn}
        onSound={setSoundEnabled}
        onClose={() => setPanel(null)}
        images={IMAGES}
      />
    </View>
  );
}

/** A picture that sits where `style` puts it and never takes a touch. */
function Pic({ source, style }: { source: ImageSourcePropType; style: object }) {
  return (
    <View pointerEvents="none" style={style}>
      <Image source={source} style={styles.fill} resizeMode="stretch" fadeDuration={0} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0c0204' },
  bg: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' },
  fill: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 8, zIndex: 3, backgroundColor: 'rgba(30,4,10,0.78)', borderBottomWidth: 1, borderBottomColor: 'rgba(255,200,58,0.3)' },
  headBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(50,10,18,0.9)', borderWidth: 1, borderColor: 'rgba(255,200,58,0.55)' },
  deposit: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: 'rgba(80,20,10,0.9)', borderWidth: 1.2, borderColor: 'rgba(255,200,58,0.7)' },
  depositText: { color: GOLD, fontWeight: '800', fontSize: 13 },
  winPlate: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  winLabel: { color: GOLD, fontWeight: '900', letterSpacing: 1.5, textShadowColor: '#000', textShadowRadius: 4 },
  winValue: { color: '#FFFFFF', fontWeight: '900', textShadowColor: '#000', textShadowRadius: 4 },
  balLabel: { color: 'rgba(255,214,120,0.9)', fontWeight: '800', fontStyle: 'italic' },
  balValue: { color: '#FFFFFF', fontWeight: '800' },
  btnLabel: { color: '#FFF3DC', fontWeight: '800', textAlign: 'center', textShadowColor: '#000', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  autoCount: { color: '#2A1600', fontWeight: '900', textShadowColor: '#FFF3B0', textShadowRadius: 5 },
  reelWin: { color: '#FFE27A', fontWeight: '900', textShadowColor: '#000', textShadowRadius: 8, textShadowOffset: { width: 0, height: 2 } },
  badge: { paddingHorizontal: 18, paddingVertical: 4, borderRadius: 24, backgroundColor: 'rgba(30,8,0,0.88)', borderWidth: 2, borderColor: '#FFD23A' },
  badgeMult: { backgroundColor: 'rgba(110,20,0,0.92)' },
  badgeCash: { backgroundColor: 'rgba(60,40,0,0.92)' },
  badgeText: { color: '#FFE27A', fontWeight: '900', textShadowColor: '#000', textShadowRadius: 5 },
  banner: { alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: 'rgba(40,6,70,0.88)', borderWidth: 1.2, borderColor: 'rgba(255,226,122,0.85)' },
  bannerText: { color: '#FFE680', fontWeight: '900', letterSpacing: 2 },
  wheelLayer: { backgroundColor: 'rgba(20,2,6,0.82)', zIndex: 4 },
  wheelTitle: { color: GOLD, fontWeight: '900', letterSpacing: 3, textShadowColor: '#000', textShadowRadius: 6 },
  wheelResult: { color: '#FFFFFF', fontWeight: '900', letterSpacing: 2, textShadowColor: '#6a1aa8', textShadowRadius: 10 },
  bigWinText: { color: GOLD, fontWeight: '900', letterSpacing: 4, textShadowColor: '#5A2A00', textShadowRadius: 10 },
  bigWinAmount: { color: '#FFFFFF', fontWeight: '900', textShadowColor: '#000', textShadowRadius: 8 },
  toast: { position: 'absolute', alignSelf: 'center', top: '46%', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.86)', borderWidth: 1, borderColor: 'rgba(255,200,58,0.6)', maxWidth: '86%', zIndex: 5 },
  toastText: { color: INK, fontSize: 14, fontWeight: '800', textAlign: 'center' },
});
