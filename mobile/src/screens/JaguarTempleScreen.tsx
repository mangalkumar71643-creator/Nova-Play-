import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, ImageSourcePropType, Modal, Pressable, ScrollView, StyleSheet, Switch, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../components/AppText';
import TapPressable from '../components/TapPressable';
import { ApiClientError } from '../api/client';
import {
  JaguarConfig,
  JaguarFreeGame,
  JaguarLineWin,
  JaguarOutcome,
  JaguarSpinRow,
  JaguarSymbol,
  fetchJaguarTempleConfig,
  fetchJaguarTempleHistory,
  spinJaguarTemple,
} from '../api/backend';
import { useGameState } from '../state/GameStateContext';
import { NO_LIMIT, winLimit } from '../utils/limits';
import { GameCue, GamePlayers, createGamePlayers, noteResult, setSoundEnabled, useSoundEnabled } from '../sound/engine';
import { withPopupSound, withTapSound } from '../sound/ui';

/*
 * Jaguar Temple: a three-reel, three-row jungle-temple slot. Five lines (the rows and the two diagonals), jaguar wilds with
 * multipliers on the third reel, a sun stone on every reel starts ten free games (the Jaguar Spirit grows after every win and
 * multiplies the next), and the bonus can be bought. The pictures come from scripts/art (assets/jaguar); the reels, the numbers
 * and the lights are live.
 */

const A = {
  scene: require('../../assets/jaguar/scene.webp'),
  hero: require('../../assets/jaguar/hero.webp'),
  frame: require('../../assets/jaguar/frame.webp'),
  board: require('../../assets/jaguar/reels-bg.webp'),
  logo: require('../../assets/jaguar/logo.webp'),
  panel: require('../../assets/jaguar/panel.webp'),
  spin: require('../../assets/jaguar/spin.webp'),
  spinLit: require('../../assets/jaguar/spin-lit.webp'),
  btn: require('../../assets/jaguar/btn.webp'),
  btnOn: require('../../assets/jaguar/btn-on.webp'),
  buy: require('../../assets/jaguar/badge-buy.webp'),
};

const SYMBOL_IMAGE: Record<JaguarSymbol, ImageSourcePropType> = {
  VASE: require('../../assets/jaguar/sym-vase.webp'),
  DAGGER: require('../../assets/jaguar/sym-dagger.webp'),
  COIN: require('../../assets/jaguar/sym-coin.webp'),
  RING: require('../../assets/jaguar/sym-ring.webp'),
  HEAD: require('../../assets/jaguar/sym-head.webp'),
  CHEST: require('../../assets/jaguar/sym-chest.webp'),
  WILD2: require('../../assets/jaguar/sym-wild.webp'),
  WILD3: require('../../assets/jaguar/sym-wild.webp'),
  WILD5: require('../../assets/jaguar/sym-wild.webp'),
  SUN: require('../../assets/jaguar/sym-sun.webp'),
};
const WILD_NUMBER: Partial<Record<JaguarSymbol, number>> = { WILD2: 2, WILD3: 3, WILD5: 5 };
const SYMBOL_LABEL: Record<string, string> = { VASE: 'Jade vase', DAGGER: 'Crystal dagger', COIN: 'Mask coin', RING: 'Silver ring', HEAD: 'Stone jaguar', CHEST: 'Treasure chest' };

// ---------- layout (units of a 412-wide game area, scaled to the phone) ----------
const U_W = 412;
const U_H = 790;
const REELS = { x: 22, y: 272, w: 368, h: 312 };
const COL_W = REELS.w / 3;
const CELL_H = REELS.h / 3;
const FRAME_AT = { x: 0, y: 236 };
const PANEL_AT = { x: 0, y: 608 };
const SPIN_C = { x: 206, y: 694 };
const ORB_C = { x: 66, y: 124 };

const GOLD = '#F6C94A';
const GOLD_DEEP = '#7A4A0A';
const WIN = '#7DFFB0';
const INK = '#FFF6DC';

const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
const DEFAULT_BET = 10;
const AUTO_OPTIONS = [10, 25, 50, 100];
const TOAST_MS = 2200;
const FALLBACK_STRIPS: JaguarSymbol[][] = [
  ['VASE', 'DAGGER', 'COIN'],
  ['DAGGER', 'RING', 'VASE'],
  ['COIN', 'HEAD', 'DAGGER'],
];
const FILLER: JaguarSymbol[] = ['VASE', 'DAGGER', 'COIN', 'RING', 'HEAD', 'CHEST', 'VASE', 'DAGGER', 'COIN', 'WILD3', 'SUN'];
const filler = () => FILLER[Math.floor(Math.random() * FILLER.length)];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function floor2(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}
function money(n: number): string {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const wrap = (len: number, i: number) => ((i % len) + len) % len;

/** The three symbols (top, middle, bottom) each reel shows for these stops. */
function windowFor(strips: JaguarSymbol[][], stops: number[]): JaguarSymbol[][] {
  return stops.map((stop, r) => [-1, 0, 1].map((d) => strips[r][wrap(strips[r].length, stop + d)]));
}

/** The cells (reel, row) the winning lines of a window cover. */
function winningCells(lines: JaguarLineWin[], config: JaguarConfig | null): boolean[][] {
  const cells = [0, 1, 2].map(() => [false, false, false]);
  if (!config) return cells;
  for (const l of lines) config.lines[l.line]?.forEach((row, reel) => (cells[reel][row] = true));
  return cells;
}

// ---------- art ----------

/** A picture that sits where `style` puts it and never takes a touch. */
function Pic({ source, style }: { source: ImageSourcePropType; style: object }) {
  return (
    <View pointerEvents="none" style={style}>
      <Image source={source} style={styles.fillImg} resizeMode="stretch" fadeDuration={0} />
    </View>
  );
}

/** A symbol in its cell: lit when it is part of a win, dimmed when others are, with the wild's multiplier written on it. */
const TILED = new Set<JaguarSymbol>(['RING', 'CHEST', 'WILD2', 'WILD3', 'WILD5']);
const SymbolView = memo(function SymbolView({ s, size, dim, glow }: { s: JaguarSymbol; size: number; dim?: boolean; glow?: boolean }) {
  const n = WILD_NUMBER[s];
  // The symbols that are not on a stone tile have more room round them in their picture, so they are drawn a little bigger.
  const grow = TILED.has(s) ? 1.02 : 1.18;
  return (
    <View style={{ width: size, height: size, opacity: dim ? 0.4 : 1, transform: [{ scale: (glow ? 1.1 : 1) * grow }] }}>
      {glow ? (
        <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <RadialGradient id="jtGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0.45" stopColor="#FFE680" stopOpacity={0.75} />
              <Stop offset="1" stopColor="#FFB020" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={50} cy={50} r={58} fill="url(#jtGlow)" />
        </Svg>
      ) : null}
      <Image source={SYMBOL_IMAGE[s]} style={styles.fillImg} resizeMode="stretch" fadeDuration={0} />
      {n ? (
        <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill} pointerEvents="none">
          <SvgText x={50} y={91} fontSize={30} fontWeight="900" textAnchor="middle" fill="#FFE680" stroke="#4A2300" strokeWidth={4.5} strokeLinejoin="round">
            {`×${n}`}
          </SvgText>
          <SvgText x={50} y={91} fontSize={30} fontWeight="900" textAnchor="middle" fill="#FFE680">
            {`×${n}`}
          </SvgText>
        </Svg>
      ) : null}
    </View>
  );
});

type ReelHandle = {
  start: () => void;
  land: (rows: JaguarSymbol[], delay: number) => Promise<void>;
  set: (rows: JaguarSymbol[]) => void;
};

const LOOP_CELLS = 14;
const LAND_CELLS = 9;

/** One reel: its three symbols, a loop of fillers while it spins, and a landing that overshoots a little like a stone slab dropping. */
const Reel = forwardRef(function Reel({ initial, cell, width, dimmed, glowing, fast }: { initial: JaguarSymbol[]; cell: number; width: number; dimmed: boolean[]; glowing: boolean[]; fast: boolean }, ref: React.Ref<ReelHandle>) {
  const [content, setContent] = useState<JaguarSymbol[]>(initial);
  const y = useRef(new Animated.Value(0)).current;
  const pending = useRef<null | { kind: 'loop' } | { kind: 'land'; resolve: () => void; rows: JaguarSymbol[] }>(null);
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);
  const contentRef = useRef(content);
  contentRef.current = content;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fastRef = useRef(fast);
  fastRef.current = fast;

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      loopRef.current?.stop();
    },
    []
  );

  // Content and offset change together, before paint, so nothing jumps.
  useLayoutEffect(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    if (p.kind === 'loop') {
      y.setValue(-(content.length - 3) * cell);
      const loop = Animated.loop(Animated.timing(y, { toValue: 0, duration: fastRef.current ? 300 : 430, easing: Easing.linear, useNativeDriver: true }));
      loopRef.current = loop;
      loop.start();
      return;
    }
    y.setValue(-(content.length - 3) * cell);
    Animated.timing(y, { toValue: 0, duration: fastRef.current ? 260 : 420, easing: Easing.out(Easing.back(1.15)), useNativeDriver: true }).start(() => {
      y.setValue(0);
      setContent(p.rows);
      p.resolve();
    });
  }, [content, cell, y]);

  useImperativeHandle(ref, () => ({
    start: () => {
      loopRef.current?.stop();
      const showing = contentRef.current.slice(0, 3);
      pending.current = { kind: 'loop' };
      setContent([...showing, ...Array.from({ length: LOOP_CELLS }, filler), ...showing]);
    },
    land: (rows, delay) =>
      new Promise<void>((resolve) => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          timer.current = null;
          loopRef.current?.stop();
          loopRef.current = null;
          pending.current = { kind: 'land', resolve, rows };
          setContent([...rows, ...Array.from({ length: LAND_CELLS }, filler)]);
        }, delay);
      }),
    set: (rows) => {
      loopRef.current?.stop();
      y.setValue(0);
      setContent(rows);
    },
  }));

  const settled = content.length === 3;
  return (
    <View style={{ width, height: cell * 3, overflow: 'hidden' }}>
      <Animated.View style={{ transform: [{ translateY: y }] }}>
        {content.map((s, i) => (
          <View key={i} style={{ width, height: cell, alignItems: 'center', justifyContent: 'center' }}>
            <SymbolView s={s} size={Math.min(width, cell) * 0.98} dim={settled && dimmed[i]} glow={settled && glowing[i]} />
          </View>
        ))}
      </Animated.View>
    </View>
  );
});

/** Gold coins raining down for a big win. */
function CoinShower({ w, h, progress }: { w: number; h: number; progress: Animated.Value }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, overflow: 'hidden' }}>
      {Array.from({ length: 26 }, (_, i) => {
        const d = ((i * 7) % 10) / 26;
        const x = ((i * 41) % 100) / 100;
        const size = 16 + ((i * 3) % 4) * 5;
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: x * (w - size),
              top: -size,
              transform: [
                { translateY: progress.interpolate({ inputRange: [0, d, d + 0.55, 1], outputRange: [0, 0, h + size * 2, h + size * 2] }) },
                { rotateY: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${720 + i * 40}deg`] }) },
              ],
            }}
          >
            <Svg width={size} height={size} viewBox="0 0 20 20">
              <Circle cx={10} cy={10} r={9} fill={GOLD} stroke={GOLD_DEEP} strokeWidth={1.5} />
              <Circle cx={10} cy={10} r={6} fill="none" stroke={GOLD_DEEP} strokeWidth={0.8} />
            </Svg>
          </Animated.View>
        );
      })}
    </View>
  );
}

// ---------- the screen ----------

type FreeState = { game: number; total: number; spirit: number } | null;
type Overlay = { kind: 'intro'; text: string; sub: string } | { kind: 'summary'; total: number; scatter: number } | null;

export default function JaguarTempleScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();
  const soundOn = useSoundEnabled();

  const [config, setConfig] = useState<JaguarConfig | null>(null);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [busy, setBusy] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [autoLeft, setAutoLeft] = useState(0);
  const [shownBalance, setShownBalance] = useState(coins);
  const [winShown, setWinShown] = useState(0);
  const [free, setFree] = useState<FreeState>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dimmed, setDimmed] = useState<boolean[][]>([0, 1, 2].map(() => [false, false, false]));
  const [glowing, setGlowing] = useState<boolean[][]>([0, 1, 2].map(() => [false, false, false]));
  const [panel, setPanel] = useState<'pays' | 'rules' | 'history' | null>(null);
  const [history, setHistory] = useState<JaguarSpinRow[] | null>(null);
  const [betOpen, setBetOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [bigWin, setBigWin] = useState<number | null>(null);

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
  const configRef = useRef<JaguarConfig | null>(null);
  configRef.current = config;
  const playersRef = useRef<GamePlayers | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runRef = useRef<(buy: boolean) => void>(() => {});
  const reelRefs = [useRef<ReelHandle>(null), useRef<ReelHandle>(null), useRef<ReelHandle>(null)];
  const shownRef = useRef<JaguarSymbol[][] | null>(null);
  const pressSpin = useRef(new Animated.Value(0)).current;
  const spinTurn = useRef(new Animated.Value(0)).current;
  const spinLoop = useRef<Animated.CompositeAnimation | null>(null);
  const shower = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 100000;
  const maxPayout = config?.maxPayout ?? NO_LIMIT;
  const buyPrice = config?.buyPrice ?? 49;
  const levels = useMemo(() => BET_LEVELS.filter((b) => b >= minStake && b <= maxStake), [minStake, maxStake]);
  const buyCost = round2(bet * buyPrice);
  const locked = busy || autoLeft > 0;

  const strips = config?.strips ?? FALLBACK_STRIPS;
  const initialWindow = useMemo(() => windowFor(strips, [0, 0, 0]), [strips]);

  const play = useCallback((name: GameCue) => {
    try {
      playersRef.current?.[name]?.play();
    } catch {
      // A missed sound effect is harmless.
    }
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchJaguarTempleConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => {});
    try {
      playersRef.current = createGamePlayers('jaguartemple');
    } catch {
      playersRef.current = null;
    }
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    pulseLoop.start();
    return () => {
      pulseLoop.stop();
      mountedRef.current = false;
      const players = playersRef.current;
      playersRef.current = null;
      if (players) Object.values(players).forEach((p) => p.remove());
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (autoTimer.current) clearTimeout(autoTimer.current);
      spinLoop.current?.stop();
    };
  }, [pulse]);

  useEffect(() => {
    if (!busyRef.current) setShownBalance(coins);
  }, [coins]);

  // A bet the limits do not allow comes down to the nearest that they do.
  useEffect(() => {
    if (levels.length && !levels.includes(bet)) setBet(levels.reduce((best, b) => (Math.abs(b - bet) < Math.abs(best - bet) ? b : best), levels[0]));
  }, [levels, bet]);

  const clearLights = () => {
    setDimmed([0, 1, 2].map(() => [false, false, false]));
    setGlowing([0, 1, 2].map(() => [false, false, false]));
  };
  const lightLines = (lines: JaguarLineWin[]) => {
    const cells = winningCells(lines, configRef.current);
    setGlowing(cells);
    setDimmed(cells.map((col) => col.map((x) => !x)));
  };

  const countUp = useCallback(
    async (from: number, to: number) => {
      if (from === to) return;
      const steps = quickRef.current || turboRef.current ? 6 : 16;
      for (let i = 1; i <= steps && mountedRef.current; i++) {
        setWinShown(round2(from + ((to - from) * i) / steps));
        if (i % 4 === 0) play('tick');
        await wait(quickRef.current || turboRef.current ? 30 : 45);
      }
      setWinShown(to);
    },
    [play]
  );

  const pause = (ms: number) => wait(quickRef.current ? Math.min(ms, 120) : turboRef.current ? ms * 0.45 : ms);

  const startSpinning = () => {
    spinLoop.current?.stop();
    spinTurn.setValue(0);
    spinLoop.current = Animated.loop(Animated.timing(spinTurn, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }));
    spinLoop.current.start();
  };
  const stopSpinning = () => {
    spinLoop.current?.stop();
    spinLoop.current = null;
    spinTurn.setValue(0);
  };

  /** Spins the three reels to `stops` of `reelStrips` and resolves when the last one has landed. */
  const landReels = useCallback(
    async (reelStrips: JaguarSymbol[][], stops: number[], startedAt: number) => {
      const rows = windowFor(reelStrips, stops);
      shownRef.current = rows;
      const fast = turboRef.current || quickRef.current;
      const minSpin = fast ? 380 : 950;
      await wait(Math.max(0, minSpin - (Date.now() - startedAt)));
      const gap = fast ? 110 : 260;
      await Promise.all(reelRefs.map((r, i) => r.current?.land(rows[i], i * gap).then(() => play('land'))));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [play]
  );

  /** One spin or one bought bonus, from the press to the last free game. */
  const run = useCallback(
    async (buy: boolean) => {
      const cfg = configRef.current;
      if (busyRef.current || !cfg) return;
      const stake = betRef.current;
      const cost = buy ? round2(stake * cfg.buyPrice) : stake;
      if (cost > balanceRef.current) {
        showToast('Not enough balance');
        setAutoLeft(0);
        return;
      }
      busyRef.current = true;
      quickRef.current = false;
      setBusy(true);
      setBigWin(null);
      clearLights();
      setWinShown(0);
      setShownBalance((b) => round2(b - cost));
      play('start');
      startSpinning();
      reelRefs.forEach((r) => r.current?.start());
      const started = Date.now();

      let outcome: JaguarOutcome;
      let payout = 0;
      try {
        const res = await spinJaguarTemple(stake, buy);
        outcome = res.outcome;
        payout = Number(res.spin.payout);
      } catch (err) {
        if (shownRef.current) reelRefs.forEach((r, i) => r.current?.set(shownRef.current![i]));
        stopSpinning();
        setShownBalance((v) => round2(v + cost));
        setAutoLeft(0);
        showToast(errorMessage(err));
        busyRef.current = false;
        setBusy(false);
        return;
      }
      if (!mountedRef.current) return;

      await landReels(cfg.strips, outcome.stops, started);
      stopSpinning();
      if (!mountedRef.current) return;

      // the base game's lines
      let running = 0;
      if (outcome.lineWin > 0) {
        lightLines(outcome.lines);
        const target = round2(floor2(stake * outcome.lineWin));
        noteResult('jaguartemple', outcome.lineWin);
        play(outcome.lineWin >= 10 ? 'big' : 'win');
        await countUp(0, target);
        running = target;
        await pause(1100);
        clearLights();
      }

      // the free games
      if (outcome.feature) {
        play('special');
        setOverlay({ kind: 'intro', text: buy ? 'BONUS BOUGHT' : 'FREE GAMES', sub: `${cfg.freeGames} free games · the Jaguar Spirit grows with every win` });
        await wait(quickRef.current ? 400 : 2300);
        setOverlay(null);
        let total = round2(running + floor2(stake * outcome.scatterWin));
        if (outcome.scatterWin > 0) {
          setWinShown(total);
          play('win');
        }
        setFree({ game: 0, total, spirit: 1 });
        for (let g = 0; g < outcome.freeGames.length && mountedRef.current; g++) {
          const fg: JaguarFreeGame = outcome.freeGames[g];
          setFree({ game: g + 1, total, spirit: fg.spirit });
          clearLights();
          play('start');
          startSpinning();
          reelRefs.forEach((r) => r.current?.start());
          await landReels(cfg.freeStrips, fg.stops, Date.now());
          stopSpinning();
          if (fg.lineWin > 0) {
            lightLines(fg.lines);
            const gain = round2(floor2(stake * fg.win));
            noteResult('jaguartemple', fg.win);
            play(fg.win >= 10 ? 'big' : 'win');
            const next = round2(total + gain);
            await countUp(total, next);
            total = next;
            setFree({ game: g + 1, total, spirit: fg.spirit });
            await pause(1000);
          } else {
            await pause(380);
          }
        }
        clearLights();
        setFree(null);
        running = total;
        play('special');
        setOverlay({ kind: 'summary', total: payout, scatter: round2(floor2(stake * outcome.scatterWin)) });
        await wait(quickRef.current ? 500 : 3200);
        setOverlay(null);
      }

      // the whole spin: it is paid at once, then a big win gets its banner
      const won = payout;
      if (won > 0 && won !== running) setWinShown(won);
      setShownBalance((v) => round2(v + won));
      refreshWallet().catch(() => {});
      setHistory(null);
      if (won >= stake * 15) {
        setBigWin(won);
        shower.setValue(0);
        Animated.timing(shower, { toValue: 1, duration: 2600, easing: Easing.linear, useNativeDriver: true }).start();
        play('big');
        await wait(quickRef.current ? 600 : 2600);
        setBigWin(null);
      }
      busyRef.current = false;
      setBusy(false);
      quickRef.current = false;

      if (autoRef.current > 0) {
        const next = autoRef.current - 1;
        setAutoLeft(next);
        if (next > 0) autoTimer.current = setTimeout(() => mountedRef.current && runRef.current(false), turboRef.current ? 250 : 800);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [countUp, landReels, play, refreshWallet, showToast]
  );
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
    run(false);
  };

  const startAuto = (n: number) => {
    setAutoOpen(false);
    setAutoLeft(n);
    autoRef.current = n;
    run(false);
  };

  const openPanel = (p: 'pays' | 'rules' | 'history') => {
    setPanel(p);
    if (p === 'history') {
      setHistory(null);
      fetchJaguarTempleHistory(30)
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
          {/* the jungle and the hero */}
          <Pic source={A.scene} style={box(0, 0, 412, 300)} />
          <Pic source={A.hero} style={box(0, 0, 412, 250)} />
          {free ? <View style={[box(0, 0, 412, 250), { backgroundColor: 'rgba(60,10,90,0.28)' }]} pointerEvents="none" /> : null}
          {/* the orb shows the Jaguar Spirit in the free games */}
          <View style={[box(ORB_C.x - 40, ORB_C.y - 40, 80, 80), { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="none">
            {free ? (
              <>
                <Text style={[styles.orbSpirit, { fontSize: u(30) }]}>×{free.spirit}</Text>
                <Text style={[styles.orbCaption, { fontSize: u(8.5) }]}>SPIRIT</Text>
              </>
            ) : null}
          </View>

          {/* the reels */}
          <Pic source={A.board} style={box(REELS.x, REELS.y, REELS.w, REELS.h)} />
          <View style={[box(REELS.x, REELS.y, REELS.w, REELS.h), { flexDirection: 'row' }]}>
            {[0, 1, 2].map((r) => (
              <Reel key={r} ref={reelRefs[r]} initial={initialWindow[r]} cell={u(CELL_H)} width={u(COL_W)} dimmed={dimmed[r]} glowing={glowing[r]} fast={turbo} />
            ))}
          </View>
          <Pic source={A.frame} style={box(FRAME_AT.x, FRAME_AT.y, 412, 372)} />
          {free ? (
            <View style={[box(90, 586, 232, 22), { alignItems: 'center', justifyContent: 'center', borderRadius: u(11), backgroundColor: 'rgba(40,6,70,0.82)', borderWidth: 1, borderColor: 'rgba(255,230,128,0.8)' }]} pointerEvents="none">
              <Text style={[styles.freeBanner, { fontSize: u(13) }]}>FREE GAME {free.game}/{config?.freeGames ?? 10}</Text>
            </View>
          ) : null}
          <Pic source={A.logo} style={box(71, 196, 270, 80)} />

          {/* the buy-bonus badge */}
          <Pressable
            onPress={withTapSound(() => !locked && setBuyOpen(true))}
            style={[box(322, 22, 80, 80), locked && { opacity: 0.55 }]}
            accessibilityRole="button"
            accessibilityLabel="Buy bonus"
          >
            <Animated.View style={{ flex: 1, transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }] }}>
              <Image source={A.buy} style={styles.fillImg} resizeMode="stretch" fadeDuration={0} />
            </Animated.View>
          </Pressable>

          {/* the panel */}
          <Pic source={A.panel} style={box(PANEL_AT.x, PANEL_AT.y, 412, 182)} />
          <View style={[box(96, 618, 220, 34), styles.winPlate]} pointerEvents="none">
            <Text style={[styles.winLabel, { fontSize: u(17) }]}>WIN</Text>
            <Text style={[styles.winValue, { fontSize: u(19) }]} testID="jt-win">
              {money(winShown)}
            </Text>
          </View>

          {/* bet, spin, auto, turbo */}
          <Pressable onPress={withTapSound(() => !locked && setBetOpen(true))} style={[box(42, 672, 56, 56), locked && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel="Bet">
            <Image source={A.btn} style={styles.fillImg} resizeMode="stretch" fadeDuration={0} />
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <View style={styles.btnIcon}>
                <MaterialCommunityIcons name="layers" size={u(26)} color="#FFE9A8" />
              </View>
            </View>
          </Pressable>
          <Text style={[box(18, 732, 104, 22), styles.btnLabel, { fontSize: u(13) }]} pointerEvents="none" testID="jt-bet">
            Bet ₹{bet.toLocaleString('en-IN')}
          </Text>

          <Pressable
            onPress={onSpin}
            onPressIn={() => Animated.timing(pressSpin, { toValue: 1, duration: 60, useNativeDriver: true }).start()}
            onPressOut={() => Animated.timing(pressSpin, { toValue: 0, duration: 120, useNativeDriver: true }).start()}
            style={box(SPIN_C.x - spinSize / 2, SPIN_C.y - spinSize / 2, spinSize, spinSize)}
            accessibilityRole="button"
            accessibilityLabel={busy ? 'Hurry' : autoLeft > 0 ? 'Stop auto spin' : 'Spin'}
          >
            <Animated.View style={{ flex: 1, transform: [{ scale: pressSpin.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] }) }] }}>
              <Image source={busy || autoLeft > 0 ? A.spinLit : A.spin} style={styles.fillImg} resizeMode="stretch" fadeDuration={0} />
              <Animated.View style={[StyleSheet.absoluteFill, styles.spinIcon, { transform: [{ rotate: spinTurn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]} pointerEvents="none">
                <MaterialCommunityIcons name="autorenew" size={u(46)} color="#FFE9A8" />
              </Animated.View>
              {autoLeft > 0 ? (
                <View style={[StyleSheet.absoluteFill, styles.spinIcon]} pointerEvents="none">
                  <Text style={[styles.autoCount, { fontSize: u(21) }]}>{autoLeft}</Text>
                </View>
              ) : null}
            </Animated.View>
          </Pressable>

          <Pressable onPress={withTapSound(() => (autoLeft > 0 ? setAutoLeft(0) : !busy && setAutoOpen(true)))} style={box(290, 674, 52, 52)} accessibilityRole="button" accessibilityLabel="Auto spin">
            <Image source={autoLeft > 0 ? A.btnOn : A.btn} style={styles.fillImg} resizeMode="stretch" fadeDuration={0} />
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <View style={styles.btnIcon}>
                <MaterialCommunityIcons name="autorenew" size={u(26)} color={autoLeft > 0 ? '#06310F' : '#FFE9A8'} />
              </View>
            </View>
          </Pressable>
          <Pressable onPress={withTapSound(() => setTurbo((t) => !t))} style={box(348, 674, 52, 52)} accessibilityRole="button" accessibilityLabel="Turbo" accessibilityState={{ selected: turbo }}>
            <Image source={turbo ? A.btnOn : A.btn} style={styles.fillImg} resizeMode="stretch" fadeDuration={0} />
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <View style={styles.btnIcon}>
                <MaterialCommunityIcons name="flash" size={u(27)} color={turbo ? '#06310F' : '#FFE9A8'} />
              </View>
            </View>
          </Pressable>
          <Text style={[box(280, 730, 132, 18), styles.btnLabel, { fontSize: u(10.5), color: 'rgba(255,246,220,0.7)' }]} pointerEvents="none">
            {turbo ? 'Turbo ON' : 'Turbo'}
          </Text>

          <Text style={[box(70, 758, 272, 24), styles.balance, { fontSize: u(17) }]} pointerEvents="none" testID="jt-balance">
            Balance ₹{shownBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>

          {bigWin !== null ? (
            <View style={[box(0, 150, 412, 400), { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="none">
              <CoinShower w={u(412)} h={u(400)} progress={shower} />
              <Text style={[styles.bigWinText, { fontSize: u(40) }]}>BIG WIN</Text>
              <Text style={[styles.bigWinAmount, { fontSize: u(34) }]}>{money(bigWin)}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {overlay ? (
        <View style={styles.overlay} pointerEvents="none">
          {overlay.kind === 'intro' ? (
            <>
              <Text style={styles.overlayTitle}>{overlay.text}</Text>
              <Text style={styles.overlaySub}>{overlay.sub}</Text>
            </>
          ) : (
            <>
              <Text style={styles.overlayTitle}>TOTAL WIN</Text>
              <Text style={styles.overlayAmount}>{money(overlay.total)}</Text>
              {overlay.scatter > 0 ? <Text style={styles.overlaySub}>includes {money(overlay.scatter)} for the sun stones</Text> : null}
            </>
          )}
        </View>
      ) : null}

      {toast ? (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      {/* bet */}
      <Modal visible={betOpen} transparent animationType="fade" onRequestClose={() => setBetOpen(false)} supportedOrientations={['portrait', 'landscape']}>
        <Pressable style={styles.scrim} onPress={() => setBetOpen(false)}>
          <Pressable style={[styles.card, { width: Math.min(W - 40, 360) }]} onPress={() => {}}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>BET</Text>
              <Pressable onPress={withPopupSound(() => setBetOpen(false))} hitSlop={10} accessibilityLabel="Close">
                <MaterialCommunityIcons name="close" size={22} color={GOLD} />
              </Pressable>
            </View>
            <View style={styles.betGrid}>
              {levels.map((b) => (
                <TapPressable
                  key={b}
                  onPress={() => {
                    setBet(b);
                    setBetOpen(false);
                  }}
                  style={[styles.betChip, b === bet && styles.betChipOn]}
                  accessibilityLabel={`Bet ${b}`}
                >
                  <Text style={[styles.betChipText, b === bet && { color: '#2A1600' }]}>₹{b.toLocaleString('en-IN')}</Text>
                </TapPressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* auto */}
      <Modal visible={autoOpen} transparent animationType="fade" onRequestClose={() => setAutoOpen(false)} supportedOrientations={['portrait', 'landscape']}>
        <Pressable style={styles.scrim} onPress={() => setAutoOpen(false)}>
          <Pressable style={[styles.card, { width: Math.min(W - 40, 320) }]} onPress={() => {}}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>AUTO SPIN</Text>
              <Pressable onPress={withPopupSound(() => setAutoOpen(false))} hitSlop={10} accessibilityLabel="Close">
                <MaterialCommunityIcons name="close" size={22} color={GOLD} />
              </Pressable>
            </View>
            <View style={styles.betGrid}>
              {AUTO_OPTIONS.map((n) => (
                <TapPressable key={n} onPress={() => startAuto(n)} style={styles.betChip} accessibilityLabel={`Auto ${n}`}>
                  <Text style={styles.betChipText}>{n} spins</Text>
                </TapPressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* buy bonus */}
      <Modal visible={buyOpen} transparent animationType="fade" onRequestClose={() => setBuyOpen(false)} supportedOrientations={['portrait', 'landscape']}>
        <Pressable style={styles.scrim} onPress={() => setBuyOpen(false)}>
          <Pressable style={[styles.card, { width: Math.min(W - 40, 360) }]} onPress={() => {}}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>BUY BONUS</Text>
              <Pressable onPress={withPopupSound(() => setBuyOpen(false))} hitSlop={10} accessibilityLabel="Close">
                <MaterialCommunityIcons name="close" size={22} color={GOLD} />
              </Pressable>
            </View>
            <Text style={styles.cardText}>
              Start the {config?.freeGames ?? 10} free games at once, without waiting for the sun stones. You also get the sun stones' {config?.scatterPay ?? 9.8}× pay.
            </Text>
            <View style={styles.costRow}>
              <Text style={styles.costLabel}>Price</Text>
              <Text style={styles.costValue}>
                {money(buyCost)} <Text style={styles.costSub}>({buyPrice}× your ₹{bet} bet)</Text>
              </Text>
            </View>
            <TapPressable
              onPress={() => {
                setBuyOpen(false);
                if (buyCost > shownBalance) showToast('Not enough balance');
                else run(true);
              }}
              style={[styles.confirm, buyCost > shownBalance && { opacity: 0.5 }]}
              accessibilityLabel="Buy the bonus"
            >
              <Text style={styles.confirmText}>BUY · {money(buyCost)}</Text>
            </TapPressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* rules, pays, history */}
      <Modal visible={panel !== null} transparent animationType="fade" onRequestClose={() => setPanel(null)} supportedOrientations={['portrait', 'landscape']}>
        <Pressable style={styles.scrim} onPress={() => setPanel(null)}>
          <Pressable style={[styles.sheet, { maxHeight: H * 0.86, width: Math.min(W - 24, 470) }]} onPress={() => {}}>
            <View style={styles.tabs}>
              {(
                [
                  ['pays', 'PAYS'],
                  ['rules', 'RULES'],
                  ['history', 'MY SPINS'],
                ] as const
              ).map(([id, text]) => (
                <TapPressable key={id} onPress={withTapSound(() => openPanel(id))} style={[styles.tab, panel === id && styles.tabOn]}>
                  <Text style={[styles.tabText, panel === id && styles.tabTextOn]}>{text}</Text>
                </TapPressable>
              ))}
              <View style={{ flex: 1 }} />
              <Pressable onPress={withPopupSound(() => setPanel(null))} hitSlop={10} style={{ padding: 6 }} accessibilityLabel="Close">
                <MaterialCommunityIcons name="close" size={20} color={GOLD} />
              </Pressable>
            </View>
            <View style={styles.soundRow}>
              <MaterialCommunityIcons name={soundOn ? 'volume-high' : 'volume-off'} size={18} color={GOLD} />
              <Text style={styles.soundLabel}>Game sounds</Text>
              <Switch value={soundOn} onValueChange={withTapSound(setSoundEnabled)} trackColor={{ false: '#3E3A33', true: '#8A6A1E' }} thumbColor={soundOn ? GOLD : '#BDB5A5'} accessibilityLabel="Game sounds" />
            </View>
            <ScrollView nestedScrollEnabled contentContainerStyle={{ padding: 14 }}>
              {panel === 'history' ? <History spins={history} /> : panel === 'rules' ? <Rules config={config} bet={bet} /> : <Paytable config={config} bet={bet} />}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Paytable({ config, bet }: { config: JaguarConfig | null; bet: number }) {
  const pays = config?.pays ?? { CHEST: 25, HEAD: 8, RING: 4, COIN: 2, DAGGER: 1, VASE: 1 };
  const order: JaguarSymbol[] = ['CHEST', 'HEAD', 'RING', 'COIN', 'DAGGER', 'VASE'];
  return (
    <View>
      <Text style={styles.ruleHead}>Three of a kind on a line (your bet ₹{bet})</Text>
      {order.map((s) => (
        <View key={s} style={styles.payRow}>
          <Image source={SYMBOL_IMAGE[s]} style={styles.payImg} resizeMode="contain" />
          <Text style={styles.payName}>{SYMBOL_LABEL[s]}</Text>
          <Text style={styles.payValue}>
            {pays[s]}× · ₹{round2(pays[s] * bet).toLocaleString('en-IN')}
          </Text>
        </View>
      ))}
      <View style={styles.payRow}>
        <Image source={SYMBOL_IMAGE.WILD3} style={styles.payImg} resizeMode="contain" />
        <Text style={styles.payName}>Jaguar Wild</Text>
        <Text style={styles.payValue}>×2 ×3 ×5</Text>
      </View>
      <View style={styles.payRow}>
        <Image source={SYMBOL_IMAGE.SUN} style={styles.payImg} resizeMode="contain" />
        <Text style={styles.payName}>Sun Stone</Text>
        <Text style={styles.payValue}>{config?.scatterPay ?? 9.8}× + free games</Text>
      </View>
      <Text style={styles.ruleLine}>A line wins when its three cells show the same symbol (a Jaguar Wild stands in for any symbol). All wins are for the whole bet, line by line.</Text>
    </View>
  );
}

function Rules({ config, bet }: { config: JaguarConfig | null; bet: number }) {
  const free = config?.freeGames ?? 10;
  return (
    <View>
      <Text style={styles.ruleHead}>Lines</Text>
      <Text style={styles.ruleLine}>Five lines: the three rows and the two diagonals. A spin can win on several lines; every line pays for the whole bet.</Text>
      <Text style={styles.ruleHead}>Jaguar Wild</Text>
      <Text style={styles.ruleLine}>Stands in for any symbol and carries ×2, ×3 or ×5. A line with wilds pays its symbol's pay times the wilds' numbers added together. In the base game the wild lands on the third reel; in the free games, on every reel.</Text>
      <Text style={styles.ruleHead}>Free games</Text>
      <Text style={styles.ruleLine}>
        A Sun Stone on every reel pays {config?.scatterPay ?? 9.8}× and starts {free} free games on richer reels. The Jaguar Spirit starts at ×1 and grows by one after every free game that wins; it multiplies that game's win.
      </Text>
      <Text style={styles.ruleHead}>Buy bonus</Text>
      <Text style={styles.ruleLine}>
        Start the free games straight away for {config?.buyPrice ?? 49}× your bet (₹{round2((config?.buyPrice ?? 49) * bet).toLocaleString('en-IN')} at ₹{bet}). It returns about {config?.buyRtpPercent ?? 89.8}% over time, like the game itself.
      </Text>
      <Text style={styles.ruleHead}>Game info</Text>
      <Text style={styles.ruleLine}>
        Return to player {config?.rtpPercent ?? 89.87}%. About {config?.hitRatePercent ?? 27.8}% of spins win on a line and the free games start about once in {config?.featureChanceOneIn ?? 109} spins. Bet ₹{config?.minStake ?? 1} – ₹{(config?.maxStake ?? 100000).toLocaleString('en-IN')}. Max win per spin {winLimit(config?.maxPayout)}.
      </Text>
      <Text style={styles.ruleLine}>Every spin is drawn from your provably-fair seeds (Settings → Provably Fair).</Text>
    </View>
  );
}

function History({ spins }: { spins: JaguarSpinRow[] | null }) {
  if (spins === null) return <Text style={styles.ruleLine}>Loading…</Text>;
  if (spins.length === 0) return <Text style={styles.ruleLine}>No spins yet.</Text>;
  return (
    <View style={{ gap: 8 }}>
      {spins.map((s) => {
        const payout = Number(s.payout);
        const cost = Number(s.cost);
        const net = round2(payout - cost);
        return (
          <View key={s.id} style={styles.histRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.histMain}>
                {s.bought ? 'Bought bonus' : s.freeGames > 0 ? 'Free games' : 'Spin'} · ₹{Number(s.stake).toLocaleString('en-IN')}
              </Text>
              <Text style={styles.histSub}>{new Date(s.createdAt).toLocaleString()}</Text>
            </View>
            <Text style={[styles.histPay, { color: payout > 0 ? WIN : 'rgba(255,246,220,0.5)' }]}>{payout > 0 ? `+₹${payout.toLocaleString('en-IN')}` : `-₹${cost.toLocaleString('en-IN')}`}</Text>
            {payout > 0 && net < 0 ? <Text style={styles.histNet}>net {net}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // An explicit 100% size: on the website an Image keeps its own pixel size otherwise.
  fillImg: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' },
  root: { flex: 1, backgroundColor: '#08240F' },
  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 8, zIndex: 3, backgroundColor: 'rgba(6,26,12,0.72)', borderBottomWidth: 1, borderBottomColor: 'rgba(246,201,74,0.3)' },
  headBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(30,22,8,0.85)', borderWidth: 1, borderColor: 'rgba(246,201,74,0.55)' },
  deposit: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: 'rgba(60,40,8,0.9)', borderWidth: 1.2, borderColor: 'rgba(246,201,74,0.7)' },
  depositText: { color: GOLD, fontWeight: '800', fontSize: 13 },
  orbSpirit: { color: '#FFFFFF', fontWeight: '900', textShadowColor: '#6A1AA8', textShadowRadius: 8, textShadowOffset: { width: 0, height: 0 } },
  orbCaption: { color: '#FFE9FF', fontWeight: '900', letterSpacing: 1.5, textShadowColor: '#4A0A78', textShadowRadius: 4 },
  freeBanner: { color: '#FFE680', fontWeight: '900', letterSpacing: 2, textShadowColor: '#3A1A00', textShadowRadius: 5, textShadowOffset: { width: 0, height: 1 } },
  winPlate: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.42)', borderWidth: 1, borderColor: 'rgba(246,201,74,0.4)' },
  winLabel: { color: GOLD, fontWeight: '900', letterSpacing: 1.5, textShadowColor: '#3A2200', textShadowRadius: 4 },
  winValue: { color: '#FFFFFF', fontWeight: '900', textShadowColor: '#000', textShadowRadius: 4 },
  btnIcon: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  btnLabel: { color: '#FFF6DC', fontWeight: '800', textAlign: 'center', textShadowColor: '#000', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  spinIcon: { alignItems: 'center', justifyContent: 'center' },
  autoCount: { color: '#FFF6DC', fontWeight: '900', textShadowColor: '#2A0A50', textShadowRadius: 6 },
  balance: { color: '#FFE9A8', fontWeight: '900', textAlign: 'center', textShadowColor: '#000', textShadowRadius: 5, textShadowOffset: { width: 0, height: 1 } },
  bigWinText: { color: GOLD, fontWeight: '900', letterSpacing: 4, textShadowColor: '#5A2A00', textShadowRadius: 10 },
  bigWinAmount: { color: '#FFFFFF', fontWeight: '900', textShadowColor: '#000', textShadowRadius: 8 },
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(10,4,24,0.72)', paddingHorizontal: 24, zIndex: 4 },
  overlayTitle: { color: GOLD, fontWeight: '900', fontSize: 38, letterSpacing: 3, textAlign: 'center', textShadowColor: '#5A2A00', textShadowRadius: 12 },
  overlayAmount: { color: '#FFFFFF', fontWeight: '900', fontSize: 40, marginTop: 6, textShadowColor: '#000', textShadowRadius: 8 },
  overlaySub: { color: 'rgba(255,246,220,0.9)', fontWeight: '700', fontSize: 14, marginTop: 10, textAlign: 'center' },
  toast: { position: 'absolute', alignSelf: 'center', top: '46%', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.86)', borderWidth: 1, borderColor: 'rgba(246,201,74,0.6)', maxWidth: '86%', zIndex: 5 },
  toastText: { color: INK, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 18, backgroundColor: '#16301C', borderWidth: 1.5, borderColor: 'rgba(246,201,74,0.75)', padding: 16 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  cardTitle: { color: GOLD, fontWeight: '900', fontSize: 16, letterSpacing: 2 },
  cardText: { color: 'rgba(255,246,220,0.88)', fontSize: 13.5, lineHeight: 20, fontWeight: '600' },
  costRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.3)', borderWidth: 1, borderColor: 'rgba(246,201,74,0.3)' },
  costLabel: { color: 'rgba(255,246,220,0.7)', fontWeight: '800', fontSize: 13 },
  costValue: { color: '#FFFFFF', fontWeight: '900', fontSize: 17 },
  costSub: { color: 'rgba(255,246,220,0.6)', fontWeight: '700', fontSize: 11 },
  confirm: { marginTop: 14, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8A020', borderWidth: 2, borderColor: '#FFE9A8' },
  confirmText: { color: '#2A1600', fontWeight: '900', fontSize: 16, letterSpacing: 1.5 },
  betGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  betChip: { minWidth: 76, flexGrow: 1, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(246,201,74,0.1)', borderWidth: 1, borderColor: 'rgba(246,201,74,0.5)' },
  betChipOn: { backgroundColor: GOLD, borderColor: '#FFF3B0' },
  betChipText: { color: INK, fontWeight: '900', fontSize: 14 },
  sheet: { borderRadius: 18, backgroundColor: '#13261A', borderWidth: 1.5, borderColor: 'rgba(246,201,74,0.75)', overflow: 'hidden' },
  tabs: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(246,201,74,0.25)' },
  tab: { paddingHorizontal: 12, paddingVertical: 7, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  tabOn: { backgroundColor: 'rgba(246,201,74,0.12)', borderBottomWidth: 2, borderBottomColor: GOLD },
  tabText: { color: 'rgba(255,246,220,0.55)', fontWeight: '900', fontSize: 12, letterSpacing: 1.2 },
  tabTextOn: { color: GOLD },
  soundRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  soundLabel: { flex: 1, color: INK, fontWeight: '700', fontSize: 13 },
  ruleHead: { color: GOLD, fontWeight: '900', fontSize: 13, letterSpacing: 1, marginTop: 12, marginBottom: 4 },
  ruleLine: { color: 'rgba(255,246,220,0.88)', fontSize: 12.5, lineHeight: 19, fontWeight: '600', marginTop: 4 },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  payImg: { width: 46, height: 46 },
  payName: { flex: 1, color: INK, fontWeight: '800', fontSize: 13 },
  payValue: { color: GOLD, fontWeight: '900', fontSize: 13 },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(246,201,74,0.15)' },
  histMain: { color: INK, fontWeight: '800', fontSize: 13 },
  histSub: { color: 'rgba(255,246,220,0.5)', fontSize: 11, marginTop: 2 },
  histPay: { fontWeight: '900', fontSize: 14 },
  histNet: { color: 'rgba(255,246,220,0.5)', fontSize: 10 },
});
