import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, ImageSourcePropType, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../components/AppText';
import { ApiClientError } from '../api/client';
import { GarudaGoldConfig, GarudaOutcome, GarudaSpinRow, fetchGarudaGoldConfig, fetchGarudaGoldHistory, spinGarudaGold } from '../api/backend';
import { useGameState } from '../state/GameStateContext';
import { PlayOptions, SoundSet, setSoundEnabled, useSoundEnabled } from '../sound/engine';
import type { SoundEvent } from '../sound/types';
import { withTapSound } from '../sound/ui';
import GarudaReel, { Img, ReelHandle } from './garuda/GarudaReel';
import { GarudaInfoSheet } from './garuda/GarudaSheets';
import { CoinShower } from './turbo/TurboFx';
import { AutoSheet, BetSheet, GOLD, INK, money } from './turbo/TurboSheets';

/*
 * Garuda Gold: a temple slot with three reels of tiles (five lines: the rows and the diagonals) and a fourth, red MULTIPLIER REEL whose
 * centre coin multiplies the spin's line wins. A NUDGE coin there lights the NUDGE lamp and nudges the reel on to 10x-500x on a winning
 * spin. EX costs 1.5 bets for a richer multiplier reel. The odds are in the backend (garudaGoldEngine.ts); the pictures come from
 * scripts/art/garuda and the reels, numbers, lines and lights are live.
 */

const A = {
  bg: require('../../assets/garuda/bg.webp'),
  scene: require('../../assets/garuda/scene.webp'),
  hero: require('../../assets/garuda/hero.webp'),
  title: require('../../assets/garuda/title.webp'),
  nudgeOff: require('../../assets/garuda/nudge-off.webp'),
  nudgeOn: require('../../assets/garuda/nudge-on.webp'),
  frame: require('../../assets/garuda/frame.webp'),
  reelsBg: require('../../assets/garuda/reels-bg.webp'),
  multBg: require('../../assets/garuda/mult-bg.webp'),
  multWindow: require('../../assets/garuda/mult-window.webp'),
  panel: require('../../assets/garuda/panel.webp'),
  spin: require('../../assets/garuda/spin.webp'),
  spinLit: require('../../assets/garuda/spin-lit.webp'),
  btn: require('../../assets/garuda/btn.webp'),
  btnOn: require('../../assets/garuda/btn-on.webp'),
  exOff: require('../../assets/garuda/ex-off.webp'),
  exOn: require('../../assets/garuda/ex-on.webp'),
};
const IMAGES: Record<string, Img> = {
  WILD: require('../../assets/garuda/sym-wild.webp'),
  RUBY: require('../../assets/garuda/sym-ruby.webp'),
  SAPPHIRE: require('../../assets/garuda/sym-sapphire.webp'),
  EMERALD: require('../../assets/garuda/sym-emerald.webp'),
  A: require('../../assets/garuda/sym-a.webp'),
  K: require('../../assets/garuda/sym-k.webp'),
  Q: require('../../assets/garuda/sym-q.webp'),
  J: require('../../assets/garuda/sym-j.webp'),
  X1: require('../../assets/garuda/coin-x1.webp'),
  X2: require('../../assets/garuda/coin-x2.webp'),
  X3: require('../../assets/garuda/coin-x3.webp'),
  X5: require('../../assets/garuda/coin-x5.webp'),
  X10: require('../../assets/garuda/coin-x10.webp'),
  X15: require('../../assets/garuda/coin-x15.webp'),
  X20: require('../../assets/garuda/coin-x20.webp'),
  X25: require('../../assets/garuda/coin-x25.webp'),
  X50: require('../../assets/garuda/coin-x50.webp'),
  X100: require('../../assets/garuda/coin-x100.webp'),
  X500: require('../../assets/garuda/coin-x500.webp'),
  NUDGE: require('../../assets/garuda/coin-nudge.webp'),
};

// ---------- layout (units of a 412-wide machine, scaled to the phone) ----------
const U_W = 412;
const U_H = 730;
const SCENE_H = 300;
const TITLE_Y = 288;
const LAMP = { x: 304, y: 294, w: 100, h: 36 };
const FRAME_Y = 334;
const REELS = { x: 16, y: 342, w: 294, h: 228 };
const CELL_W = 98;
const CELL_H = 76;
const MULT = { x: 320, y: 342, w: 76, h: 228 };
const COIN_ROW = MULT.h / 5;
const COIN_SIZE = 52;
const WINDOW = { x: MULT.x - 3, y: MULT.y + COIN_ROW * 2.5 - 26, w: 82, h: 52 };
const PANEL_Y = 582;
const SPIN_C = { x: 206, y: 658 };
const LINES = [
  [0, 0, 0],
  [1, 1, 1],
  [2, 2, 2],
  [0, 1, 2],
  [2, 1, 0],
];

const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
const DEFAULT_BET = 10;
const TOAST_MS = 2200;
const SYMBOL_FILLERS = ['J', 'Q', 'K', 'A', 'J', 'Q', 'EMERALD', 'SAPPHIRE', 'RUBY', 'WILD', 'K', 'J', 'Q', 'A'];
const COIN_FILLERS = ['X1', 'X2', 'X3', 'X1', 'X5', 'X2', 'X10', 'X1', 'X3', 'X15', 'X2', 'X20', 'X1', 'X25', 'NUDGE', 'X50', 'X2', 'X100'];
const NUDGE_PATH = ['X10', 'X15', 'X20', 'X25', 'X50', 'X100', 'X500'];
const START_ROWS: string[][] = [
  ['K', 'SAPPHIRE', 'J'],
  ['WILD', 'A', 'RUBY'],
  ['Q', 'EMERALD', 'K'],
  ['X3', 'X15', 'X10', 'X25', 'X3'],
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
const none = () => [3, 3, 3, 5].map((n) => new Array(n).fill(false) as boolean[]);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

type Big = { title: string; amount: number } | null;

export default function GarudaGoldScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();
  const soundOn = useSoundEnabled();

  const [config, setConfig] = useState<GarudaGoldConfig | null>(null);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [ex, setEx] = useState(false);
  const [busy, setBusy] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [autoLeft, setAutoLeft] = useState(0);
  const [shownBalance, setShownBalance] = useState(coins);
  const [winShown, setWinShown] = useState(0);
  const [counting, setCounting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [dimmed, setDimmed] = useState<boolean[][]>(none());
  const [glowing, setGlowing] = useState<boolean[][]>(none());
  const [lines, setLines] = useState<number[]>([]);
  const [lampOn, setLampOn] = useState(false);
  const [multBadge, setMultBadge] = useState<string | null>(null);
  const [big, setBig] = useState<Big>(null);
  const [panel, setPanel] = useState<'pays' | 'rules' | 'history' | null>(null);
  const [history, setHistory] = useState<GarudaSpinRow[] | null>(null);
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
  const exRef = useRef(ex);
  exRef.current = ex;
  const configRef = useRef<GarudaGoldConfig | null>(null);
  configRef.current = config;
  const soundsRef = useRef<SoundSet | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runRef = useRef<() => void>(() => {});
  const reelRefs = [useRef<ReelHandle>(null), useRef<ReelHandle>(null), useRef<ReelHandle>(null), useRef<ReelHandle>(null)];
  const shownRef = useRef<string[][]>(START_ROWS);
  const pressSpin = useRef(new Animated.Value(0)).current;
  const lineGlow = useRef(new Animated.Value(0)).current;
  const windowGlow = useRef(new Animated.Value(0)).current;
  const badgeAnim = useRef(new Animated.Value(0)).current;
  const shower = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;

  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 100000;
  const exCost = config?.exCost ?? 1.5;
  const levels = useMemo(() => BET_LEVELS.filter((b) => b >= minStake && b <= maxStake), [minStake, maxStake]);
  const locked = busy || autoLeft > 0;
  const costOf = (b: number, withEx: boolean) => (withEx ? round2(b * exCost) : b);

  // ---------- sounds ----------
  useEffect(() => {
    const set = new SoundSet('garudagold');
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
    fetchGarudaGoldConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => {});
    // the Garuda breathes: a slow rise and fall of its glow
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => {
      mountedRef.current = false;
      loop.stop();
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (autoTimer.current) clearTimeout(autoTimer.current);
    };
  }, [breathe]);

  // the reels show a real stop of the real strips from the start
  const placed = useRef(false);
  useEffect(() => {
    if (!config || busyRef.current || placed.current) return;
    placed.current = true;
    const rowsOf = (strip: string[], stop: number, n: number) => Array.from({ length: n }, (_, i) => strip[(stop + i - Math.floor(n / 2) + strip.length) % strip.length]);
    const rows = [0, 1, 2].map((i) => rowsOf(config.strips[i], 5 + i * 9, 3));
    rows.push(rowsOf(config.coinStrips.normal, 17, 5));
    rows.forEach((r, i) => reelRefs[i].current?.set(r));
    shownRef.current = rows;
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
    setLines([]);
    lineGlow.setValue(0);
    windowGlow.setValue(0);
    setMultBadge(null);
  };

  const pause = (ms: number) => wait(quickRef.current ? Math.min(ms, 120) : turboRef.current ? ms * 0.45 : ms);

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

  /** Reels 1-3 land one by one, then the multiplier reel; then a NUDGE (if any) takes the multiplier reel on. */
  const land = useCallback(
    async (o: GarudaOutcome, startedAt: number) => {
      const fast = turboRef.current || quickRef.current;
      await wait(Math.max(0, (fast ? 380 : 950) - (Date.now() - startedAt)));
      const gap = fast ? 110 : 260;
      await Promise.all([0, 1, 2].map((i) => reelRefs[i].current?.land(o.window[i], i * gap).then(() => play('land'))));
      await reelRefs[3].current?.land(o.coinWindow, fast ? 80 : 260);
      play(o.coin === 'NUDGE' ? 'special' : 'reveal');
      shownRef.current = [...o.window, o.coinWindow];
      if (o.nudge) {
        setLampOn(true);
        await pause(500);
        // the reel steps on through big coins and stops with the nudge's coin in the window
        const path = Array.from({ length: fast ? 5 : 9 }, () => pick(NUDGE_PATH));
        const target: string[] = [pick(NUDGE_PATH), pick(NUDGE_PATH), o.nudge, pick(NUDGE_PATH), pick(NUDGE_PATH)];
        const stepMs = fast ? 70 : 140;
        const ticker = setInterval(() => play('step'), stepMs * 1.6);
        await reelRefs[3].current?.nudge(target, path, stepMs);
        clearInterval(ticker);
        shownRef.current = [...o.window, target];
        play('reveal');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [play]
  );

  /** Lights the winning lines and cells, counts the line wins, then the multiplier. Returns the total shown. */
  const showWin = useCallback(
    async (o: GarudaOutcome, stake: number) => {
      if (o.linePay <= 0) return 0;
      const hits = none();
      o.lines.forEach((l) => LINES[l.line].forEach((row, reel) => (hits[reel][row] = true)));
      const mult = o.multiplier;
      if (mult > 1) hits[3][2] = true;
      setGlowing(hits);
      setDimmed(hits.map((c, r) => c.map((x) => (r === 3 ? false : !x))));
      setLines(o.lines.map((l) => l.line));
      Animated.loop(Animated.sequence([Animated.timing(lineGlow, { toValue: 1, duration: 360, useNativeDriver: true }), Animated.timing(lineGlow, { toValue: 0.4, duration: 360, useNativeDriver: true })]), { iterations: 4 }).start();
      const lineWin = round2(floor2(stake * o.linePay));
      play(o.linePay >= 5 ? 'bigwin' : 'win');
      await countUp(0, lineWin);
      let total = lineWin;
      await pause(450);
      if (mult > 1) {
        setMultBadge(`×${mult}`);
        badgeAnim.setValue(0);
        Animated.spring(badgeAnim, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }).start();
        Animated.loop(Animated.sequence([Animated.timing(windowGlow, { toValue: 1, duration: 300, useNativeDriver: true }), Animated.timing(windowGlow, { toValue: 0.3, duration: 300, useNativeDriver: true })]), { iterations: 4 }).start();
        play('special');
        await pause(600);
        const full = round2(floor2(stake * o.totalWin));
        await countUp(total, full);
        total = full;
        await pause(500);
      }
      return total;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [badgeAnim, countUp, lineGlow, play, windowGlow]
  );

  /** One spin, from the press to the paid win. */
  const run = useCallback(async () => {
    const cfg = configRef.current;
    if (busyRef.current) return;
    if (!cfg) {
      showToast('Loading the machine…');
      fetchGarudaGoldConfig()
        .then((c) => mountedRef.current && setConfig(c))
        .catch(() => {});
      return;
    }
    const stake = betRef.current;
    const withEx = exRef.current;
    const cost = costOf(stake, withEx);
    if (cost > balanceRef.current) {
      showToast('Not enough balance');
      setAutoLeft(0);
      return;
    }
    busyRef.current = true;
    quickRef.current = false;
    setBusy(true);
    setBig(null);
    setLampOn(false);
    clearLights();
    setWinShown(0);
    setCounting(false);
    setShownBalance((b) => round2(b - cost));
    play('start');
    reelRefs.forEach((r) => r.current?.start());
    const started = Date.now();

    let res;
    try {
      res = await spinGarudaGold(stake, withEx);
    } catch (err) {
      reelRefs.forEach((r, i) => r.current?.set(shownRef.current[i]));
      setShownBalance((v) => round2(v + cost));
      setAutoLeft(0);
      showToast(errorMessage(err));
      busyRef.current = false;
      setBusy(false);
      return;
    }
    if (!mountedRef.current) return;
    const { outcome, spin } = res;
    const payout = Number(spin.payout);

    await land(outcome, started);
    if (!mountedRef.current) return;
    const shown = await showWin(outcome, stake);

    // the spin is paid as a whole (rounded down), then a big win gets its banner
    if (payout > 0 && payout !== shown) setWinShown(payout);
    if (payout <= 0) setWinShown(0);
    setCounting(false);
    setShownBalance((v) => round2(v + payout));
    refreshWallet().catch(() => {});
    setHistory(null);
    if (payout >= stake * 10) {
      setBig({ title: payout >= stake * 100 ? 'SUPER WIN' : payout >= stake * 30 ? 'MEGA WIN' : 'BIG WIN', amount: payout });
      shower.setValue(0);
      Animated.timing(shower, { toValue: 1, duration: 2800, easing: Easing.linear, useNativeDriver: true }).start();
      play('bigwin');
      await wait(quickRef.current ? 700 : 2800);
      setBig(null);
    } else if (payout <= 0) {
      await pause(150);
    }
    setLampOn(false);
    busyRef.current = false;
    setBusy(false);
    quickRef.current = false;

    if (autoRef.current > 0) {
      const next = autoRef.current - 1;
      setAutoLeft(next);
      if (next > 0) autoTimer.current = setTimeout(() => mountedRef.current && runRef.current(), turboRef.current ? 250 : 800);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [land, play, refreshWallet, showWin, showToast]);
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
      fetchGarudaGoldHistory(30)
        .then((h) => mountedRef.current && setHistory(h))
        .catch(() => mountedRef.current && setHistory([]));
    }
  };

  const toggleEx = () => {
    if (locked) return;
    setEx((v) => {
      showToast(v ? 'EX off' : `EX on: a spin costs ${money(costOf(bet, true))}`);
      return !v;
    });
  };

  // ---------- layout ----------
  const headerH = insets.top + 46;
  const availH = H - headerH - insets.bottom;
  const k = Math.min(Math.min(W, 520) / U_W, availH / U_H);
  const gameW = U_W * k;
  const gameH = U_H * k;
  const u = (n: number) => n * k;
  const box = (x: number, y: number, w: number, h: number) => ({ position: 'absolute' as const, left: u(x), top: u(y), width: u(w), height: u(h) });
  const cellCenter = (reel: number, row: number) => `${u(CELL_W * reel + CELL_W / 2)},${u(CELL_H * row + CELL_H / 2)}`;

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
      </View>

      <View style={{ position: 'absolute', top: headerH, left: 0, right: 0, alignItems: 'center' }}>
        <View style={{ width: gameW, height: gameH }}>
          {/* the temple and the Garuda */}
          <View style={[box(0, 0, U_W, SCENE_H), { overflow: 'hidden' }]} pointerEvents="none">
            <Image source={A.scene} style={styles.fill} resizeMode="stretch" fadeDuration={0} />
            <Animated.View style={[styles.fill, { transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.012] }) }, { translateY: breathe.interpolate({ inputRange: [0, 1], outputRange: [0, -u(1.5)] }) }] }]}>
              <Image source={A.hero} style={styles.fill} resizeMode="stretch" fadeDuration={0} />
            </Animated.View>
          </View>

          {/* EX */}
          <Pressable onPress={withTapSound(toggleEx)} style={[box(8, 244, 66, 40), locked && { opacity: 0.7 }]} accessibilityRole="switch" accessibilityState={{ checked: ex }} accessibilityLabel="EX" testID="gg-ex">
            <Image source={ex ? A.exOn : A.exOff} style={styles.fill} resizeMode="stretch" fadeDuration={0} />
          </Pressable>
          <Pressable onPress={withTapSound(() => openPanel('rules'))} style={[box(76, 251, 26, 26), styles.help]} accessibilityLabel="What is EX" hitSlop={8}>
            <Text style={[styles.helpText, { fontSize: u(15) }]}>?</Text>
          </Pressable>

          {/* the name plate and the NUDGE lamp */}
          <Pic source={A.title} style={box(0, TITLE_Y, U_W, 48)} />
          <Pic source={lampOn ? A.nudgeOn : A.nudgeOff} style={box(LAMP.x, LAMP.y, LAMP.w, LAMP.h)} />

          {/* the reels */}
          <Pic source={A.reelsBg} style={box(REELS.x, REELS.y, REELS.w, REELS.h)} />
          <View style={[box(REELS.x, REELS.y, REELS.w, REELS.h), { flexDirection: 'row' }]}>
            {[0, 1, 2].map((r) => (
              <GarudaReel
                key={r}
                ref={reelRefs[r]}
                rows={3}
                initial={START_ROWS[r]}
                width={u(CELL_W)}
                rowH={u(CELL_H)}
                imgW={u(CELL_W)}
                imgH={u(CELL_H)}
                images={IMAGES}
                fillers={SYMBOL_FILLERS}
                dimmed={dimmed[r]}
                glowing={glowing[r]}
                fast={turbo}
                testID={`gg-reel-${r}`}
              />
            ))}
          </View>
          <Pic source={A.multBg} style={box(MULT.x, MULT.y, MULT.w, MULT.h)} />
          <View style={box(MULT.x, MULT.y, MULT.w, MULT.h)}>
            <GarudaReel
              ref={reelRefs[3]}
              rows={5}
              initial={START_ROWS[3]}
              width={u(MULT.w)}
              rowH={u(COIN_ROW)}
              imgW={u(COIN_SIZE)}
              imgH={u(COIN_SIZE)}
              images={IMAGES}
              fillers={COIN_FILLERS}
              dimmed={dimmed[3]}
              glowing={glowing[3]}
              fast={turbo}
              testID="gg-mult"
            />
          </View>
          <Pic source={A.frame} style={box(0, FRAME_Y, U_W, 248)} />

          {/* the winning lines */}
          {lines.length > 0 ? (
            <Animated.View style={[box(REELS.x, REELS.y, REELS.w, REELS.h), { opacity: lineGlow }]} pointerEvents="none">
              <Svg width={u(REELS.w)} height={u(REELS.h)}>
                {lines.map((l) => (
                  <Polyline key={`s${l}`} points={[0, 1, 2].map((reel) => cellCenter(reel, LINES[l][reel])).join(' ')} fill="none" stroke="#7a3a00" strokeWidth={u(7)} strokeLinejoin="round" strokeLinecap="round" opacity={0.6} />
                ))}
                {lines.map((l) => (
                  <Polyline key={`l${l}`} points={[0, 1, 2].map((reel) => cellCenter(reel, LINES[l][reel])).join(' ')} fill="none" stroke="#FFE27A" strokeWidth={u(3.6)} strokeLinejoin="round" strokeLinecap="round" />
                ))}
              </Svg>
            </Animated.View>
          ) : null}

          {/* the window of the coin that counts */}
          <Animated.View
            style={[box(WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h), { transform: [{ scale: windowGlow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }] }]}
            pointerEvents="none"
          >
            <Image source={A.multWindow} style={styles.fill} resizeMode="stretch" fadeDuration={0} />
          </Animated.View>

          {/* what the spin is winning */}
          {counting && winShown > 0 ? (
            <View style={[box(REELS.x, REELS.y + REELS.h / 2 - 34, REELS.w, 68), styles.center]} pointerEvents="none">
              <Text style={[styles.reelWin, { fontSize: u(42) }]} testID="gg-reelwin">
                {winShown.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
          ) : null}
          {multBadge ? (
            <Animated.View
              style={[box(REELS.x + 60, REELS.y + 8, REELS.w - 120, 52), styles.center, { opacity: badgeAnim, transform: [{ scale: badgeAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }]}
              pointerEvents="none"
            >
              <View style={styles.badge}>
                <Text style={[styles.badgeText, { fontSize: u(28) }]}>{multBadge}</Text>
              </View>
            </Animated.View>
          ) : null}

          {/* the control deck */}
          <Pic source={A.panel} style={box(0, PANEL_Y, U_W, 148)} />
          <View style={[box(96, PANEL_Y + 10, 220, 28), styles.plate]} pointerEvents="none">
            <Text style={[styles.winLabel, { fontSize: u(14) }]}>WIN</Text>
            <Text style={[styles.winValue, { fontSize: u(16) }]} testID="gg-win">
              {money(winShown)}
            </Text>
          </View>
          <View style={[box(106, PANEL_Y + 116, 200, 26), styles.plate]} pointerEvents="none">
            <Text style={[styles.balLabel, { fontSize: u(13) }]}>Balance</Text>
            <Text style={[styles.balValue, { fontSize: u(14.5) }]} testID="gg-balance">
              {money(shownBalance)}
            </Text>
          </View>

          <RoundButton style={box(SPIN_C.x - 162 - 25, SPIN_C.y - 25, 50, 50)} img={A.btn} icon="information-variant" size={u(26)} onPress={() => openPanel('pays')} label="Paytable" />
          <RoundButton style={[box(SPIN_C.x - 94 - 25, SPIN_C.y - 25, 50, 50), locked && { opacity: 0.6 }]} img={A.btn} icon="layers-triple" size={u(24)} onPress={() => !locked && setBetOpen(true)} label="Bet" />
          <Text style={[box(SPIN_C.x - 94 - 44, SPIN_C.y + 26, 88, 18), styles.btnLabel, { fontSize: u(11.5) }]} pointerEvents="none" testID="gg-bet">
            Bet ₹{bet.toLocaleString('en-IN')}
          </Text>
          {ex ? (
            <Text style={[box(SPIN_C.x - 94 - 50, SPIN_C.y - 44, 100, 16), styles.exLabel, { fontSize: u(10.5) }]} pointerEvents="none" testID="gg-cost">
              EX ₹{costOf(bet, true).toLocaleString('en-IN')}
            </Text>
          ) : null}

          <Pressable
            onPress={onSpin}
            onPressIn={() => Animated.timing(pressSpin, { toValue: 1, duration: 60, useNativeDriver: true }).start()}
            onPressOut={() => Animated.timing(pressSpin, { toValue: 0, duration: 120, useNativeDriver: true }).start()}
            style={box(SPIN_C.x - 46, SPIN_C.y - 46, 92, 92)}
            accessibilityRole="button"
            accessibilityLabel={busy ? 'Hurry' : autoLeft > 0 ? 'Stop auto spin' : 'Spin'}
            testID="gg-spin"
          >
            <Animated.View style={{ flex: 1, transform: [{ scale: pressSpin.interpolate({ inputRange: [0, 1], outputRange: [1, 0.93] }) }] }}>
              <Image source={busy || autoLeft > 0 ? A.spinLit : A.spin} style={styles.fill} resizeMode="stretch" fadeDuration={0} />
              {autoLeft > 0 ? (
                <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
                  <Text style={[styles.autoCount, { fontSize: u(24) }]}>{autoLeft}</Text>
                </View>
              ) : null}
            </Animated.View>
          </Pressable>

          <RoundButton style={box(SPIN_C.x + 94 - 25, SPIN_C.y - 25, 50, 50)} img={autoLeft > 0 ? A.btnOn : A.btn} icon="autorenew" size={u(25)} dark={autoLeft > 0} onPress={() => (autoLeft > 0 ? setAutoLeft(0) : !busy && setAutoOpen(true))} label="Auto spin" />
          <RoundButton style={box(SPIN_C.x + 162 - 25, SPIN_C.y - 25, 50, 50)} img={turbo ? A.btnOn : A.btn} icon="flash" size={u(26)} dark={turbo} onPress={() => setTurbo((t) => !t)} label="Turbo" selected={turbo} />
          <Text style={[box(SPIN_C.x + 94 - 44, SPIN_C.y + 26, 156, 18), styles.btnLabel, { fontSize: u(10.5), color: 'rgba(255,243,220,0.7)' }]} pointerEvents="none">
            {autoLeft > 0 ? 'Auto · tap to stop' : turbo ? 'Auto · Turbo ON' : 'Auto · Turbo'}
          </Text>

          {big ? (
            <View style={[box(0, 230, U_W, 400), styles.center]} pointerEvents="none">
              <CoinShower w={u(U_W)} h={u(400)} progress={shower} />
              <Text style={[styles.bigTitle, { fontSize: u(42) }]}>{big.title}</Text>
              <Text style={[styles.bigAmount, { fontSize: u(34) }]}>{money(big.amount)}</Text>
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
      <GarudaInfoSheet
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

function RoundButton({ style, img, icon, size, onPress, label, dark, selected }: { style: object; img: ImageSourcePropType; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; size: number; onPress: () => void; label: string; dark?: boolean; selected?: boolean }) {
  return (
    <Pressable onPress={withTapSound(onPress)} style={style} accessibilityRole="button" accessibilityLabel={label} accessibilityState={selected === undefined ? undefined : { selected }}>
      <Image source={img} style={styles.fill} resizeMode="stretch" fadeDuration={0} />
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        <MaterialCommunityIcons name={icon} size={size} color={dark ? '#2A1600' : '#FFE9A8'} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#100602' },
  bg: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' },
  fill: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 8, zIndex: 3, backgroundColor: 'rgba(30,12,4,0.82)', borderBottomWidth: 1, borderBottomColor: 'rgba(255,200,58,0.3)' },
  headBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(50,22,8,0.9)', borderWidth: 1, borderColor: 'rgba(255,200,58,0.55)' },
  deposit: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: 'rgba(80,36,10,0.9)', borderWidth: 1.2, borderColor: 'rgba(255,200,58,0.7)' },
  depositText: { color: GOLD, fontWeight: '800', fontSize: 13 },
  help: { borderRadius: 20, backgroundColor: 'rgba(40,16,4,0.85)', borderWidth: 1.2, borderColor: 'rgba(255,200,58,0.8)', alignItems: 'center', justifyContent: 'center' },
  helpText: { color: GOLD, fontWeight: '900' },
  plate: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  winLabel: { color: GOLD, fontWeight: '900', letterSpacing: 1.5, textShadowColor: '#000', textShadowRadius: 4 },
  winValue: { color: '#FFFFFF', fontWeight: '900', textShadowColor: '#000', textShadowRadius: 4 },
  balLabel: { color: 'rgba(255,214,120,0.9)', fontWeight: '800', fontStyle: 'italic' },
  balValue: { color: '#FFFFFF', fontWeight: '800' },
  btnLabel: { color: '#FFF3DC', fontWeight: '800', textAlign: 'center', textShadowColor: '#000', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  exLabel: { color: '#FFB040', fontWeight: '900', textAlign: 'center', textShadowColor: '#000', textShadowRadius: 4 },
  autoCount: { color: '#FFF3B0', fontWeight: '900', textShadowColor: '#000', textShadowRadius: 6 },
  reelWin: { color: '#FFE27A', fontWeight: '900', textShadowColor: '#000', textShadowRadius: 8, textShadowOffset: { width: 0, height: 2 } },
  badge: { paddingHorizontal: 20, paddingVertical: 4, borderRadius: 26, backgroundColor: 'rgba(90,10,40,0.92)', borderWidth: 2, borderColor: '#FFD23A' },
  badgeText: { color: '#FFE27A', fontWeight: '900', textShadowColor: '#000', textShadowRadius: 5 },
  bigTitle: { color: GOLD, fontWeight: '900', letterSpacing: 4, textShadowColor: '#5A2A00', textShadowRadius: 10 },
  bigAmount: { color: '#FFFFFF', fontWeight: '900', textShadowColor: '#000', textShadowRadius: 8 },
  toast: { position: 'absolute', alignSelf: 'center', top: '46%', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.86)', borderWidth: 1, borderColor: 'rgba(255,200,58,0.6)', maxWidth: '86%', zIndex: 5 },
  toastText: { color: INK, fontSize: 14, fontWeight: '800', textAlign: 'center' },
});
