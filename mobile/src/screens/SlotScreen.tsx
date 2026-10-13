import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient as SvgLinearGradient, Path, Polygon, Polyline, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../api/client';
import { SlotConfig, SlotSpin, SlotSymbol, fetchSlotConfig, fetchSlotHistory, spinSlot } from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const GOLD = '#FFD66B';
const GOLD_DEEP = '#B8862B';
const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const DEFAULT_BET = 10;
const AUTO_OPTIONS = [10, 25, 50, 100];
const SOUND_KEY = 'novaplay:slot:sound';
const TOAST_MS = 1800;

// Fallbacks so the reels can draw before the config arrives; the server's
// config (the same strips) replaces them.
const J = 'J', Q = 'Q', K = 'K', A = 'A', EM = 'EMERALD', SA = 'SAPPHIRE', RU = 'RUBY', W = 'WILD';
const FALLBACK_REELS: SlotSymbol[][] = [
  [Q, W, Q, J, EM, RU, K, W, A, K, Q, SA, EM, A, Q, K, RU, Q, EM, K, J, SA, J, A, J, W, SA, A, J],
  [RU, EM, J, EM, A, SA, W, RU, J, Q, K, J, K, J, W, SA, Q, SA, EM, Q, A, Q, K, A, Q, W, J, A, K],
  [EM, Q, K, J, Q, K, RU, EM, SA, J, EM, J, RU, K, J, Q, A, SA, A, Q, W, A, Q, A, SA, W, K, J, W],
];
const FALLBACK_PAYTABLE: Record<SlotSymbol, number> = { J: 0.4, Q: 0.5, K: 0.7, A: 0.9, EMERALD: 1.5, SAPPHIRE: 2.5, RUBY: 4, WILD: 8 };
const FALLBACK_LINES: [number, number, number][] = [
  [1, 1, 1],
  [0, 0, 0],
  [2, 2, 2],
  [0, 1, 2],
  [2, 1, 0],
];
const FALLBACK_MULTIPLIERS = [1, 2, 3, 5, 10, 15];
const LINE_COLORS = ['#FFD66B', '#FF4D6D', '#4DA3FF', '#35E08A', '#C77DFF'];
const MULT_COLORS: Record<number, string> = { 1: '#E6E1F5', 2: '#58E39A', 3: '#5FB4FF', 5: '#C890FF', 10: '#FFA94D', 15: '#FF5C7A' };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------- symbol art ----------

const RUBY_OUT = [[50, 6], [80, 18], [94, 50], [80, 82], [50, 94], [20, 82], [6, 50], [20, 18]];
const RUBY_IN = [[50, 28], [68, 35], [74, 50], [68, 65], [50, 72], [32, 65], [26, 50], [32, 35]];
const pts = (p: number[][]) => p.map(([x, y]) => `${x},${y}`).join(' ');

function Ruby() {
  return (
    <G>
      <Polygon points={pts(RUBY_OUT)} fill="#6E0014" stroke={GOLD} strokeWidth={2.5} strokeLinejoin="round" />
      {RUBY_OUT.map((p, i) => {
        const n = (i + 1) % 8;
        return <Polygon key={i} points={pts([p, RUBY_OUT[n], RUBY_IN[n], RUBY_IN[i]])} fill={i % 2 ? '#B30C31' : '#E3234B'} />;
      })}
      <Polygon points={pts(RUBY_IN)} fill="url(#slRubyTable)" stroke="#FF9AAE" strokeOpacity={0.6} strokeWidth={0.8} />
      <Polygon points="36,36 50,31 44,44" fill="#FFFFFF" opacity={0.65} />
      <Polygon points="58,60 66,52 63,64" fill="#FFFFFF" opacity={0.25} />
    </G>
  );
}

function Sapphire() {
  const girdle = [[6, 38], [28, 38], [50, 38], [72, 38], [94, 38]];
  const top = [[26, 14], [50, 14], [74, 14]];
  const tip = [50, 94];
  return (
    <G>
      <Polygon points="6,38 26,14 74,14 94,38 50,94" fill="#0A1E66" stroke={GOLD} strokeWidth={2.5} strokeLinejoin="round" />
      <Polygon points={pts([girdle[0], top[0], girdle[1]])} fill="#2F63E0" />
      <Polygon points={pts([top[0], top[1], girdle[1]])} fill="#6FA6FF" />
      <Polygon points={pts([top[1], girdle[2], girdle[1]])} fill="#3F7BF0" />
      <Polygon points={pts([top[1], top[2], girdle[3]])} fill="#8DBBFF" />
      <Polygon points={pts([top[1], girdle[3], girdle[2]])} fill="#2A5AD6" />
      <Polygon points={pts([top[2], girdle[4], girdle[3]])} fill="#1E47B8" />
      {girdle.slice(0, 4).map((g, i) => (
        <Polygon key={i} points={pts([g, girdle[i + 1], tip])} fill={['#16389E', '#2F6BEA', '#1C45B6', '#0F2C86'][i]} />
      ))}
      <Polygon points="30,20 44,18 34,32" fill="#FFFFFF" opacity={0.7} />
      <Line x1={6} y1={38} x2={94} y2={38} stroke="#BFD6FF" strokeOpacity={0.6} strokeWidth={0.8} />
    </G>
  );
}

function Emerald() {
  return (
    <G>
      <Polygon points="30,8 70,8 90,28 90,72 70,92 30,92 10,72 10,28" fill="#044023" stroke={GOLD} strokeWidth={2.5} strokeLinejoin="round" />
      <Polygon points="34,18 66,18 80,32 80,68 66,82 34,82 20,68 20,32" fill="#0C8A47" />
      <Polygon points="39,28 61,28 70,37 70,63 61,72 39,72 30,63 30,37" fill="#19B862" />
      <Polygon points="43,37 57,37 61,41 61,59 57,63 43,63 39,59 39,41" fill="url(#slEmTable)" />
      <Polygon points="30,8 70,8 66,18 34,18" fill="#2BD67A" opacity={0.7} />
      <Polygon points="10,28 30,8 34,18 20,32" fill="#51E896" opacity={0.6} />
      <Polygon points="40,30 52,29 42,40" fill="#FFFFFF" opacity={0.6} />
    </G>
  );
}

function Crown() {
  return (
    <G>
      <Circle cx={50} cy={52} r={44} fill="url(#slWildGlow)" />
      <Path d="M 16 64 L 12 26 L 32 44 L 50 16 L 68 44 L 88 26 L 84 64 Z" fill="url(#slGold)" stroke="#7A4A00" strokeWidth={2} strokeLinejoin="round" />
      <Rect x={15} y={62} width={70} height={11} rx={3} fill="url(#slGold)" stroke="#7A4A00" strokeWidth={2} />
      <Circle cx={12} cy={25} r={4.5} fill="#FFF3C4" stroke="#7A4A00" strokeWidth={1.2} />
      <Circle cx={50} cy={14} r={5} fill="#FFF3C4" stroke="#7A4A00" strokeWidth={1.2} />
      <Circle cx={88} cy={25} r={4.5} fill="#FFF3C4" stroke="#7A4A00" strokeWidth={1.2} />
      <Circle cx={33} cy={54} r={5} fill="#1FBF6A" stroke="#0A4D2A" strokeWidth={1} />
      <Circle cx={50} cy={50} r={6.5} fill="#E3234B" stroke="#6E0014" strokeWidth={1} />
      <Circle cx={67} cy={54} r={5} fill="#3F7BF0" stroke="#0A1E66" strokeWidth={1} />
      <Rect x={14} y={76} width={72} height={18} rx={5} fill="#B3102F" stroke={GOLD} strokeWidth={1.8} />
      <SvgText x={50} y={90} fontSize={14} fontWeight="bold" fill="#FFE9A8" textAnchor="middle" letterSpacing={2}>
        WILD
      </SvgText>
    </G>
  );
}

const LETTER_FILL: Record<string, [string, string]> = {
  A: ['#FF6B6B', '#9E0F1F'],
  K: ['#C99BFF', '#5B21B6'],
  Q: ['#5FF0DC', '#0E7C74'],
  J: ['#FFC266', '#C2560A'],
};

function Letter({ ch }: { ch: string }) {
  return (
    <G>
      <SvgText x={52} y={78} fontSize={72} fontWeight="bold" fontFamily="serif" fill="#000000" opacity={0.35} textAnchor="middle">
        {ch}
      </SvgText>
      <SvgText x={50} y={75} fontSize={72} fontWeight="bold" fontFamily="serif" fill={`url(#slL${ch})`} stroke={GOLD} strokeWidth={2.4} textAnchor="middle">
        {ch}
      </SvgText>
    </G>
  );
}

/** Shared gradients; defined once per SVG since IDs are per-document. */
function SymbolDefs() {
  return (
    <Defs>
      <RadialGradient id="slRubyTable" cx="40%" cy="35%" r="70%">
        <Stop offset="0" stopColor="#FF8FA5" />
        <Stop offset="0.5" stopColor="#F0284F" />
        <Stop offset="1" stopColor="#A10A2B" />
      </RadialGradient>
      <RadialGradient id="slEmTable" cx="40%" cy="35%" r="70%">
        <Stop offset="0" stopColor="#B8FFD6" />
        <Stop offset="1" stopColor="#1FBF6A" />
      </RadialGradient>
      <SvgLinearGradient id="slGold" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#FFF3B0" />
        <Stop offset="0.5" stopColor="#F5C542" />
        <Stop offset="1" stopColor="#B7791F" />
      </SvgLinearGradient>
      <RadialGradient id="slWildGlow" cx="50%" cy="50%" r="50%">
        <Stop offset="0" stopColor="#FFE38A" stopOpacity={0.55} />
        <Stop offset="1" stopColor="#FFB020" stopOpacity={0} />
      </RadialGradient>
      {Object.entries(LETTER_FILL).map(([ch, [a, b]]) => (
        <SvgLinearGradient key={ch} id={`slL${ch}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={a} />
          <Stop offset="1" stopColor={b} />
        </SvgLinearGradient>
      ))}
    </Defs>
  );
}

export const SymbolArt = memo(function SymbolArt({ symbol, size }: { symbol: SlotSymbol; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <SymbolDefs />
      {symbol === 'RUBY' ? <Ruby /> : symbol === 'SAPPHIRE' ? <Sapphire /> : symbol === 'EMERALD' ? <Emerald /> : symbol === 'WILD' ? <Crown /> : <Letter ch={symbol} />}
    </Svg>
  );
});

// ---------- reels ----------

type ReelHandle<T> = {
  /** Starts spinning from whatever is showing. */
  start: (fast: boolean) => void;
  /** Lands on `rows` (top to bottom) after `delay` ms. */
  land: (rows: T[], delay: number, fast: boolean) => Promise<void>;
  /** Snaps straight to `rows` with no animation. */
  set: (rows: T[]) => void;
  /** Starts a landing that is still waiting on its delay right now. */
  hurry: () => void;
};

type ReelProps<T> = {
  initial: T[];
  filler: () => T;
  cell: number;
  width: number;
  render: (item: T, index: number) => React.ReactNode;
  onStop?: () => void;
};

const LOOP_CELLS = 18;
const LAND_CELLS = 9;

function ReelInner<T>({ initial, filler, cell, width, render, onStop }: ReelProps<T>, ref: React.Ref<ReelHandle<T>>) {
  const [content, setContent] = useState<T[]>(initial);
  const y = useRef(new Animated.Value(0)).current;
  const pending = useRef<null | { kind: 'loop'; fast: boolean } | { kind: 'land'; fast: boolean; resolve: () => void }>(null);
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);
  const contentRef = useRef(content);
  contentRef.current = content;
  const fillerRef = useRef(filler);
  fillerRef.current = filler;
  const onStopRef = useRef(onStop);
  onStopRef.current = onStop;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const landNow = useRef<null | (() => void)>(null);

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
      // [showing, random…, showing]: both ends look the same, so the loop
      // wraps without a visible jump, and it starts from what was on screen.
      const span = content.length - 3;
      y.setValue(-span * cell);
      const loop = Animated.loop(Animated.timing(y, { toValue: 0, duration: p.fast ? 420 : 640, easing: Easing.linear, useNativeDriver: true }));
      loopRef.current = loop;
      loop.start();
    } else {
      y.setValue(-(content.length - 3) * cell);
      Animated.timing(y, {
        toValue: 0,
        duration: p.fast ? 260 : 460,
        easing: Easing.out(Easing.back(1.3)),
        useNativeDriver: true,
      }).start(() => {
        onStopRef.current?.();
        p.resolve();
      });
    }
  }, [content, cell, y]);

  useImperativeHandle(ref, () => ({
    start: (fast) => {
      loopRef.current?.stop();
      const showing = contentRef.current.slice(0, 3);
      pending.current = { kind: 'loop', fast };
      setContent([...showing, ...Array.from({ length: LOOP_CELLS }, () => fillerRef.current()), ...showing]);
    },
    land: (rows, delay, fast) =>
      new Promise<void>((resolve) => {
        if (timer.current) clearTimeout(timer.current);
        const go = () => {
          timer.current = null;
          landNow.current = null;
          loopRef.current?.stop();
          loopRef.current = null;
          pending.current = { kind: 'land', fast, resolve };
          setContent([...rows, ...Array.from({ length: LAND_CELLS }, () => fillerRef.current())]);
        };
        landNow.current = go;
        timer.current = setTimeout(go, delay);
      }),
    hurry: () => {
      if (!landNow.current) return;
      if (timer.current) clearTimeout(timer.current);
      landNow.current();
    },
    set: (rows) => {
      loopRef.current?.stop();
      y.setValue(0);
      setContent(rows);
    },
  }));

  return (
    <View style={{ width, height: cell * 3, overflow: 'hidden' }}>
      <Animated.View style={{ transform: [{ translateY: y }] }}>
        {content.map((item, i) => (
          <View key={i} style={{ width, height: cell, alignItems: 'center', justifyContent: 'center' }}>
            {render(item, i)}
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

const Reel = forwardRef(ReelInner) as <T>(p: ReelProps<T> & { ref?: React.Ref<ReelHandle<T>> }) => React.ReactElement;

// ---------- decoration ----------

function Background({ w, h, reelTop, reelH }: { w: number; h: number; reelTop: number; reelH: number }) {
  const lattice: string[] = [];
  const step = 34;
  for (let y = 0; y < h + step; y += step) {
    for (let x = ((y / step) % 2) * (step / 2); x < w + step; x += step) {
      lattice.push(`M ${x} ${y - 7} L ${x + 7} ${y} L ${x} ${y + 7} L ${x - 7} ${y} Z`);
    }
  }
  const cx = w / 2;
  const archW = Math.min(w * 0.9, 380);
  const archTop = Math.max(20, reelTop - 150);
  const archBase = reelTop + reelH * 0.5;
  const aw = archW / 2;
  // A Mughal (onion) arch framing the reels.
  const arch = `M ${cx - aw} ${archBase} L ${cx - aw} ${archTop + 120} C ${cx - aw} ${archTop + 60} ${cx - aw * 0.35} ${archTop + 55} ${cx} ${archTop} C ${cx + aw * 0.35} ${archTop + 55} ${cx + aw} ${archTop + 60} ${cx + aw} ${archTop + 120} L ${cx + aw} ${archBase}`;
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id="slBg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#2A0B45" />
          <Stop offset="0.55" stopColor="#140526" />
          <Stop offset="1" stopColor="#070111" />
        </SvgLinearGradient>
        <RadialGradient id="slGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#8A3CD6" stopOpacity={0.55} />
          <Stop offset="1" stopColor="#8A3CD6" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill="url(#slBg)" />
      <Path d={lattice.join(' ')} fill="none" stroke={GOLD} strokeOpacity={0.06} strokeWidth={1} />
      <Circle cx={cx} cy={reelTop + reelH / 2} r={Math.max(w, reelH) * 0.7} fill="url(#slGlow)" />
      <Path d={arch} fill="none" stroke={GOLD} strokeOpacity={0.3} strokeWidth={2} />
      <Path d={arch} fill="none" stroke={GOLD} strokeOpacity={0.12} strokeWidth={8} transform={`translate(0 6)`} />
      <Circle cx={cx} cy={archTop - 8} r={5} fill={GOLD} opacity={0.45} />
      {Array.from({ length: 22 }, (_, i) => {
        const sx = ((i * 137.5) % 100) / 100;
        const sy = ((i * 61.8) % 100) / 100;
        return <Circle key={i} cx={sx * w} cy={sy * h} r={i % 3 === 0 ? 1.8 : 1} fill="#FFE9A8" opacity={0.35} />;
      })}
    </Svg>
  );
}

function Logo({ width }: { width: number }) {
  const h = width * 0.26;
  return (
    <Svg width={width} height={h} viewBox="0 0 360 94">
      <Defs>
        <SvgLinearGradient id="slLogoGold" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFF6C8" />
          <Stop offset="0.45" stopColor="#FFD35A" />
          <Stop offset="1" stopColor="#B7791F" />
        </SvgLinearGradient>
      </Defs>
      <Path d="M 158 30 L 154 8 L 168 20 L 180 2 L 192 20 L 206 8 L 202 30 Z" fill="url(#slLogoGold)" stroke="#7A4A00" strokeWidth={1.5} />
      <Circle cx={180} cy={22} r={3.5} fill="#E3234B" />
      <SvgText x={182} y={73} fontSize={40} fontWeight="bold" fontFamily="serif" fill="#000" opacity={0.4} textAnchor="middle" letterSpacing={4}>
        ROYAL GEMS
      </SvgText>
      <SvgText x={180} y={71} fontSize={40} fontWeight="bold" fontFamily="serif" fill="url(#slLogoGold)" stroke="#6A3D00" strokeWidth={1.2} textAnchor="middle" letterSpacing={4}>
        ROYAL GEMS
      </SvgText>
      <Line x1={70} y1={84} x2={150} y2={84} stroke={GOLD} strokeOpacity={0.6} strokeWidth={1.2} />
      <Line x1={210} y1={84} x2={290} y2={84} stroke={GOLD} strokeOpacity={0.6} strokeWidth={1.2} />
      <Polygon points="180,79 186,84 180,89 174,84" fill={GOLD} />
    </Svg>
  );
}

/** Golden light rays behind the big-win banner. */
function Rays({ size }: { size: number }) {
  const c = size / 2;
  const rays = Array.from({ length: 16 }, (_, i) => {
    const a0 = ((i * 22.5 - 5) * Math.PI) / 180;
    const a1 = ((i * 22.5 + 5) * Math.PI) / 180;
    return `M ${c} ${c} L ${c + c * Math.cos(a0)} ${c + c * Math.sin(a0)} L ${c + c * Math.cos(a1)} ${c + c * Math.sin(a1)} Z`;
  });
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id="slRay" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFE9A0" stopOpacity={0.6} />
          <Stop offset="1" stopColor="#FFB020" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={c} cy={c} r={c * 0.45} fill="url(#slRay)" />
      {rays.map((d, i) => (
        <Path key={i} d={d} fill="url(#slRay)" />
      ))}
    </Svg>
  );
}

// ---------- screen ----------

type WinShow = { lines: number[]; payout: number; baseWin: number; multiplier: number; stake: number };

export default function SlotScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<SlotConfig | null>(null);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [spinning, setSpinning] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [autoLeft, setAutoLeft] = useState(0);
  const [autoOpen, setAutoOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [shownBalance, setShownBalance] = useState(coins);
  const [win, setWin] = useState<WinShow | null>(null);
  const [winCount, setWinCount] = useState(0);
  const [bigWin, setBigWin] = useState<{ label: string; amount: number } | null>(null);
  const [grid, setGrid] = useState<SlotSymbol[] | null>(null);
  const [panel, setPanel] = useState<'pay' | 'history' | null>(null);
  const [history, setHistory] = useState<SlotSpin[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const reels = [useRef<ReelHandle<SlotSymbol>>(null), useRef<ReelHandle<SlotSymbol>>(null), useRef<ReelHandle<SlotSymbol>>(null)];
  const multReel = useRef<ReelHandle<number>>(null);
  const mountedRef = useRef(true);
  const spinningRef = useRef(false);
  const quickStopRef = useRef<null | (() => void)>(null);
  const autoRef = useRef(0);
  autoRef.current = autoLeft;
  const turboRef = useRef(turbo);
  turboRef.current = turbo;
  const betRef = useRef(bet);
  betRef.current = bet;
  const balanceRef = useRef(shownBalance);
  balanceRef.current = shownBalance;
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;
  const playersRef = useRef<{ tick: AudioPlayer; win: AudioPlayer } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const bigAnim = useRef(new Animated.Value(0)).current;
  const multStamp = useRef(new Animated.Value(0)).current;
  const raysSpin = useRef(new Animated.Value(0)).current;

  const reelStrips = config?.reels ?? FALLBACK_REELS;
  const paytable = config?.paytable ?? FALLBACK_PAYTABLE;
  const paylines = config?.paylines ?? FALLBACK_LINES;
  const multValues = config?.multipliers ?? FALLBACK_MULTIPLIERS;
  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const betLevels = useMemo(() => BET_LEVELS.filter((b) => b >= minStake && b <= maxStake), [minStake, maxStake]);

  const initialRows = useMemo(() => FALLBACK_REELS.map((strip, i) => [0, 1, 2].map((r) => strip[(i * 7 + r) % strip.length])), []);
  const initialMult = useMemo(() => [2, 1, 3], []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const play = useCallback((name: 'tick' | 'win') => {
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
    fetchSlotConfig()
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
    };
  }, []);

  // The shown balance runs locally during a spin (stake off at the start,
  // win on at the reveal) and follows the wallet while idle.
  useEffect(() => {
    if (!spinningRef.current) setShownBalance(coins);
  }, [coins]);

  useEffect(() => {
    if (!bigWin) return;
    raysSpin.setValue(0);
    const loop = Animated.loop(Animated.timing(raysSpin, { toValue: 1, duration: 8000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [bigWin, raysSpin]);

  // Count the win up once the reels have stopped.
  useEffect(() => {
    if (!win || win.payout <= 0) return;
    setWinCount(0);
    const start = Date.now();
    const dur = win.payout / win.stake >= 10 ? 1600 : 700;
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / dur);
      setWinCount(round2(win.payout * (1 - (1 - t) * (1 - t))));
      if (t >= 1) clearInterval(id);
    }, 40);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 420, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 420, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => {
      clearInterval(id);
      loop.stop();
    };
  }, [win, pulse]);

  const doSpin = useCallback(async () => {
    if (spinningRef.current) {
      quickStopRef.current?.();
      return;
    }
    const stake = betRef.current;
    if (stake > balanceRef.current) {
      showToast('Insufficient balance');
      setAutoLeft(0);
      return;
    }
    spinningRef.current = true;
    setSpinning(true);
    setWin(null);
    setBigWin(null);
    setWinCount(0);
    setShownBalance((b) => round2(b - stake));
    const fast = turboRef.current;
    reels.forEach((r) => r.current?.start(fast));
    multReel.current?.start(fast);
    const startedAt = Date.now();

    let spin: SlotSpin;
    try {
      spin = await spinSlot(stake);
    } catch (err) {
      // Nothing was charged: put the reels back where they were.
      const rows = grid ? [0, 1, 2].map((c) => [grid[c], grid[3 + c], grid[6 + c]]) : initialRows;
      reels.forEach((r, i) => r.current?.set(rows[i]));
      multReel.current?.set(initialMult);
      spinningRef.current = false;
      setSpinning(false);
      setShownBalance((b) => round2(b + stake));
      setAutoLeft(0);
      showToast(errorMessage(err));
      return;
    }
    if (!mountedRef.current) return;

    const cols = [0, 1, 2].map((c) => [spin.grid[c], spin.grid[3 + c], spin.grid[6 + c]]);
    const minSpin = fast ? 250 : 650;
    const first = Math.max(0, minSpin - (Date.now() - startedAt));
    const gap = fast ? 110 : 260;
    const multRows = [pick(multValues.filter((m) => m !== spin.multiplier)), spin.multiplier, pick(multValues.filter((m) => m !== spin.multiplier))];
    const done = Promise.all([
      ...reels.map((r, i) => r.current?.land(cols[i], first + i * gap, fast) ?? Promise.resolve()),
      multReel.current?.land(multRows, first + 3 * gap + (fast ? 60 : 160), fast) ?? Promise.resolve(),
    ]);
    // A tap on SPIN while the reels run stops the ones still spinning at once.
    quickStopRef.current = () => {
      quickStopRef.current = null;
      reels.forEach((r) => r.current?.hurry());
      multReel.current?.hurry();
    };
    await done;
    quickStopRef.current = null;
    if (!mountedRef.current) return;

    const payout = Number(spin.payout);
    setGrid(spin.grid);
    setShownBalance((b) => round2(b + payout));
    spinningRef.current = false;
    setSpinning(false);
    const show: WinShow = { lines: spin.winLines, payout, baseWin: Number(spin.baseWin), multiplier: spin.multiplier, stake };
    setWin(show);
    if (payout > 0) {
      play('win');
      if (spin.multiplier > 1) {
        multStamp.setValue(0);
        Animated.spring(multStamp, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
      }
      const ratio = payout / stake;
      if (ratio >= 15) {
        setBigWin({ label: ratio >= 40 ? 'MEGA WIN' : 'BIG WIN', amount: payout });
        bigAnim.setValue(0);
        Animated.spring(bigAnim, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }).start();
      }
    }
    refreshWallet().catch(() => {});

    if (autoRef.current > 0) {
      const next = autoRef.current - 1;
      setAutoLeft(next);
      if (next > 0) {
        const pause = payout <= 0 ? 280 : payout / stake >= 15 ? 2600 : 1100;
        setTimeout(() => {
          if (mountedRef.current && autoRef.current > 0) {
            setBigWin(null);
            doSpinRef.current();
          }
        }, fast ? pause / 2 : pause);
      }
    }
    // reels / refs are stable for the life of the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, initialRows, initialMult, multValues, play, refreshWallet, showToast, bigAnim, multStamp]);

  const doSpinRef = useRef(doSpin);
  doSpinRef.current = doSpin;

  const changeBet = (dir: 1 | -1) => {
    if (spinning || autoLeft > 0) return;
    const i = betLevels.indexOf(bet);
    const next = betLevels[Math.max(0, Math.min(betLevels.length - 1, (i < 0 ? betLevels.indexOf(DEFAULT_BET) : i) + dir))];
    if (next !== undefined) setBet(next);
  };

  const startAuto = (n: number) => {
    setAutoOpen(false);
    setAutoLeft(n);
    autoRef.current = n;
    if (!spinningRef.current) doSpin();
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    AsyncStorage.setItem(SOUND_KEY, next ? 'on' : 'off').catch(() => {});
  };

  const openPanel = (p: 'pay' | 'history') => {
    setPanel(p);
    if (p === 'history') {
      setHistory(null);
      fetchSlotHistory(30)
        .then((h) => mountedRef.current && setHistory(h))
        .catch(() => mountedRef.current && setHistory([]));
    }
  };

  const reelFiller = useCallback((i: number) => () => pick(reelStrips[i]), [reelStrips]);
  const fillers = useMemo(() => [reelFiller(0), reelFiller(1), reelFiller(2)], [reelFiller]);
  const multFiller = useCallback(() => pick(multValues), [multValues]);

  // ---------- layout ----------
  const frameW = Math.min(W - 36, 440);
  const pad = 10;
  const gapR = 4;
  const cell = Math.floor(Math.min((frameW - pad * 2 - gapR * 3 - 8) / 3.62, (H - insets.top - insets.bottom - 380) / 3));
  const multW = Math.round(cell * 0.62);
  const reelsW = cell * 3 + gapR * 2;
  const innerW = reelsW + gapR * 2 + 8 + multW;
  const boxW = innerW + pad * 2;
  const boxH = cell * 3 + pad * 2;
  const headerH = insets.top + 50;
  const logoW = Math.min(W * 0.86, 360);
  const logoH = logoW * 0.26;
  const blockH = logoH + 6 + cell * 3 + pad * 2 + 12 + 54;
  const spare = Math.max(0, H - insets.bottom - 18 - 92 - 16 - headerH - blockH);
  const logoTop = headerH + spare * 0.3;
  const reelTop = logoTop + logoH + 6;
  const stripTop = reelTop + boxH + 12 + spare * 0.2;
  const boxLeft = (W - boxW) / 2;
  const symbolSize = cell * 0.84;
  const winLines = win?.lines ?? [];
  const winningCells = new Set<number>();
  for (const li of winLines) paylines[li].forEach((row, reel) => winningCells.add(row * 3 + reel));
  const showingWin = !!win && win.payout > 0 && !spinning;

  const lineY = (row: number) => pad + row * cell + cell / 2;
  const lineX = (reel: number) => pad + reel * (cell + gapR) + cell / 2;

  return (
    <View style={styles.root}>
      <Background w={W} h={H} reelTop={reelTop} reelH={boxH} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 6, height: headerH }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtn} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={GOLD} />
        </Pressable>
        <View style={styles.headBalance}>
          <MaterialCommunityIcons name="wallet" size={16} color={GOLD} />
          <Text style={styles.headBalanceText} numberOfLines={1}>
            ₹{shownBalance.toFixed(2)}
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        <Pressable onPress={toggleSound} style={styles.headBtn} hitSlop={6} accessibilityLabel="Sound">
          <MaterialCommunityIcons name={soundOn ? 'volume-high' : 'volume-off'} size={20} color={GOLD} />
        </Pressable>
        <Pressable onPress={() => openPanel('history')} style={styles.headBtn} hitSlop={6} accessibilityLabel="My history">
          <MaterialCommunityIcons name="history" size={20} color={GOLD} />
        </Pressable>
        <Pressable onPress={() => openPanel('pay')} style={styles.headBtn} hitSlop={6} accessibilityLabel="Paytable">
          <MaterialCommunityIcons name="information-variant" size={22} color={GOLD} />
        </Pressable>
      </View>

      <View style={{ position: 'absolute', top: logoTop, left: (W - logoW) / 2 }} pointerEvents="none">
        <Logo width={logoW} />
      </View>

      {/* Reel box */}
      <View style={{ position: 'absolute', top: reelTop, left: boxLeft, width: boxW, height: boxH }}>
        <Svg width={boxW} height={boxH} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <SvgLinearGradient id="slFrame" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#FFF1B8" />
              <Stop offset="0.35" stopColor="#E9B949" />
              <Stop offset="0.7" stopColor="#8C5E17" />
              <Stop offset="1" stopColor="#F3D27A" />
            </SvgLinearGradient>
            <RadialGradient id="slWell" cx="50%" cy="40%" r="75%">
              <Stop offset="0" stopColor="#3A1060" />
              <Stop offset="1" stopColor="#12041F" />
            </RadialGradient>
          </Defs>
          <Rect x={2} y={2} width={boxW - 4} height={boxH - 4} rx={16} fill="#0B0216" stroke="url(#slFrame)" strokeWidth={4} />
          <Rect x={pad - 3} y={pad - 3} width={reelsW + 6} height={cell * 3 + 6} rx={10} fill="url(#slWell)" stroke={GOLD} strokeOpacity={0.55} strokeWidth={1.2} />
          <Rect x={pad + reelsW + gapR + 4} y={pad - 3} width={multW + 6} height={cell * 3 + 6} rx={10} fill="#16061F" stroke={GOLD} strokeOpacity={0.55} strokeWidth={1.2} />
          {[1, 2].map((i) => (
            <Line key={i} x1={pad + i * (cell + gapR) - gapR / 2} y1={pad} x2={pad + i * (cell + gapR) - gapR / 2} y2={pad + cell * 3} stroke={GOLD} strokeOpacity={0.25} strokeWidth={1} />
          ))}
          {[
            [8, 8],
            [boxW - 8, 8],
            [8, boxH - 8],
            [boxW - 8, boxH - 8],
          ].map(([x, y], i) => (
            <Polygon key={i} points={`${x},${y - 6} ${x + 6},${y} ${x},${y + 6} ${x - 6},${y}`} fill={GOLD} stroke="#7A4A00" strokeWidth={0.8} />
          ))}
        </Svg>

        <View style={{ position: 'absolute', left: pad, top: pad, flexDirection: 'row', gap: gapR }}>
          {[0, 1, 2].map((i) => (
            <Reel<SlotSymbol>
              key={i}
              ref={reels[i]}
              initial={initialRows[i]}
              filler={fillers[i]}
              cell={cell}
              width={cell}
              onStop={() => play('tick')}
              render={(s, idx) => {
                const final = !spinning && idx < 3 && grid !== null;
                const cellIndex = idx * 3 + i;
                const lit = showingWin && final && winningCells.has(cellIndex);
                const dim = showingWin && final && !winningCells.has(cellIndex);
                return (
                  <Animated.View
                    style={{
                      opacity: dim ? 0.35 : 1,
                      transform: [{ scale: lit ? pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) : 1 }],
                    }}
                  >
                    <SymbolArt symbol={s} size={symbolSize} />
                  </Animated.View>
                );
              }}
            />
          ))}
        </View>

        {/* Multiplier reel */}
        <View style={{ position: 'absolute', left: pad + reelsW + gapR + 7, top: pad }}>
          <Reel<number>
            ref={multReel}
            initial={initialMult}
            filler={multFiller}
            cell={cell}
            width={multW}
            render={(m, idx) => {
              const centre = idx === 1 && !spinning;
              return (
                <Text
                  style={[
                    styles.multText,
                    { color: MULT_COLORS[m] ?? '#FFFFFF', fontSize: multW * (m >= 10 ? 0.36 : 0.42), opacity: centre || spinning ? 1 : 0.45 },
                  ]}
                >
                  x{m}
                </Text>
              );
            }}
          />
          <View pointerEvents="none" style={[styles.multWindow, { top: cell - 2, width: multW, height: cell + 4 }]} />
        </View>

        {/* Win lines */}
        {showingWin && (
          <Svg width={boxW} height={boxH} style={StyleSheet.absoluteFill} pointerEvents="none">
            {winLines.map((li) => {
              const p = paylines[li].map((row, reel) => `${lineX(reel)},${lineY(row)}`);
              const all = [`${pad - 4},${lineY(paylines[li][0])}`, ...p, `${pad + reelsW + 2},${lineY(paylines[li][2])}`].join(' ');
              return (
                <G key={li}>
                  <Polyline points={all} fill="none" stroke={LINE_COLORS[li]} strokeOpacity={0.35} strokeWidth={11} strokeLinejoin="round" strokeLinecap="round" />
                  <Polyline points={all} fill="none" stroke={LINE_COLORS[li]} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
                </G>
              );
            })}
          </Svg>
        )}

        {/* Payline markers */}
        {paylines.map((line, li) => {
          const lit = showingWin && winLines.includes(li);
          const offset = li === 3 || li === 4 ? 20 : 0;
          return (
            <React.Fragment key={li}>
              <View style={[styles.lineMark, { left: -15, top: lineY(line[0]) - 9 + (li === 3 ? offset : li === 4 ? -offset : 0), backgroundColor: lit ? LINE_COLORS[li] : '#1A0830', borderColor: LINE_COLORS[li] }]}>
                <Text style={[styles.lineMarkText, { color: lit ? '#1A0830' : LINE_COLORS[li] }]}>{li + 1}</Text>
              </View>
            </React.Fragment>
          );
        })}
      </View>

      {/* Win / balance strip */}
      <View style={[styles.winStrip, { top: stripTop, left: boxLeft, width: boxW }]}>
        <View style={styles.stripCell}>
          <Text style={styles.stripLabel}>BET</Text>
          <Text style={styles.stripValue}>₹{bet}</Text>
        </View>
        <View style={[styles.stripCell, styles.stripWin]}>
          <Text style={styles.stripLabel}>WIN</Text>
          <View style={styles.row}>
            <Text style={[styles.stripWinValue, win && win.payout > 0 && { color: GOLD }]}>₹{(win && win.payout > 0 ? winCount : 0).toFixed(2)}</Text>
            {showingWin && win.multiplier > 1 && (
              <Animated.Text style={[styles.multStamp, { color: MULT_COLORS[win.multiplier], transform: [{ scale: multStamp.interpolate({ inputRange: [0, 1], outputRange: [2.4, 1] }) }], opacity: multStamp }]}>
                {' '}
                x{win.multiplier}
              </Animated.Text>
            )}
          </View>
        </View>
        <View style={styles.stripCell}>
          <Text style={styles.stripLabel}>LINES</Text>
          <Text style={styles.stripValue}>5</Text>
        </View>
      </View>

      {/* Controls */}
      <View style={[styles.controls, { bottom: insets.bottom + 18, left: boxLeft, width: boxW }]}>
        <View style={styles.betBox}>
          <Pressable onPress={() => changeBet(-1)} style={[styles.betBtn, (spinning || autoLeft > 0) && styles.dim]} hitSlop={6} accessibilityLabel="Lower bet">
            <MaterialCommunityIcons name="minus" size={20} color="#2A1600" />
          </Pressable>
          <View style={styles.betValueBox}>
            <Text style={styles.betLabel}>TOTAL BET</Text>
            <Text style={styles.betValue}>₹{bet}</Text>
          </View>
          <Pressable onPress={() => changeBet(1)} style={[styles.betBtn, (spinning || autoLeft > 0) && styles.dim]} hitSlop={6} accessibilityLabel="Raise bet">
            <MaterialCommunityIcons name="plus" size={20} color="#2A1600" />
          </Pressable>
        </View>

        <Pressable
          onPress={() => {
            if (autoLeft > 0) setAutoLeft(0);
            else doSpin();
          }}
          style={({ pressed }) => [styles.spinBtn, pressed && { transform: [{ scale: 0.95 }] }]}
          accessibilityLabel={autoLeft > 0 ? 'Stop auto spin' : 'Spin'}
        >
          <LinearGradient colors={autoLeft > 0 ? ['#FF7A8A', '#B3102F'] : ['#FFF1B0', '#F5C542', '#B7791F']} style={styles.spinInner}>
            {autoLeft > 0 ? (
              <>
                <MaterialCommunityIcons name="stop" size={26} color="#FFFFFF" />
                <Text style={styles.spinAutoText}>{autoLeft}</Text>
              </>
            ) : (
              <MaterialCommunityIcons name={spinning ? 'lightning-bolt' : 'sync'} size={40} color="#3A1E00" />
            )}
          </LinearGradient>
        </Pressable>

        <View style={styles.sideBtns}>
          <Pressable onPress={() => (autoLeft > 0 ? setAutoLeft(0) : setAutoOpen((o) => !o))} style={[styles.sideBtn, autoLeft > 0 && styles.sideBtnOn]}>
            <MaterialCommunityIcons name="autorenew" size={16} color={autoLeft > 0 ? '#2A1600' : GOLD} />
            <Text style={[styles.sideBtnText, autoLeft > 0 && { color: '#2A1600' }]}>AUTO</Text>
          </Pressable>
          <Pressable onPress={() => setTurbo((t) => !t)} style={[styles.sideBtn, turbo && styles.sideBtnOn]}>
            <MaterialCommunityIcons name="lightning-bolt" size={16} color={turbo ? '#2A1600' : GOLD} />
            <Text style={[styles.sideBtnText, turbo && { color: '#2A1600' }]}>TURBO</Text>
          </Pressable>
        </View>
      </View>

      {autoOpen && (
        <View style={[styles.autoPop, { bottom: insets.bottom + 126, right: boxLeft }]}>
          <Text style={styles.autoPopTitle}>AUTO SPIN</Text>
          <View style={styles.autoGrid}>
            {AUTO_OPTIONS.map((n) => (
              <Pressable key={n} onPress={() => startAuto(n)} style={styles.autoOpt}>
                <Text style={styles.autoOptText}>{n}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {bigWin && (
        <Pressable style={styles.bigWrap} onPress={() => setBigWin(null)}>
          <Animated.View
            pointerEvents="none"
            style={{ position: 'absolute', opacity: bigAnim, transform: [{ rotate: raysSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}
          >
            <Rays size={Math.max(W, 420) * 1.2} />
          </Animated.View>
          <Animated.View style={[styles.center, { transform: [{ scale: bigAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }], opacity: bigAnim }]}>
            <Svg width={Math.min(W * 0.9, 360)} height={70} viewBox="0 0 360 70">
              <Defs>
                <SvgLinearGradient id="slBig" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#FFF6C8" />
                  <Stop offset="0.5" stopColor="#FFC93C" />
                  <Stop offset="1" stopColor="#C9780F" />
                </SvgLinearGradient>
              </Defs>
              <SvgText x={180} y={54} fontSize={52} fontWeight="bold" fontFamily="serif" fill="url(#slBig)" stroke="#5A2E00" strokeWidth={2} textAnchor="middle" letterSpacing={4}>
                {bigWin.label}
              </SvgText>
            </Svg>
            <Text style={styles.bigAmount}>₹{winCount.toFixed(2)}</Text>
            <View style={styles.row}>
              {(['RUBY', 'WILD', 'SAPPHIRE', 'EMERALD'] as SlotSymbol[]).map((s, i) => (
                <View key={i} style={{ marginHorizontal: 4, transform: [{ rotate: `${(i - 1.5) * 12}deg` }] }}>
                  <SymbolArt symbol={s} size={46} />
                </View>
              ))}
            </View>
          </Animated.View>
        </Pressable>
      )}

      {panel && (
        <Pressable style={styles.scrim} onPress={() => setPanel(null)}>
          <Pressable style={[styles.sheet, { maxHeight: H * 0.82, width: Math.min(W - 24, 460) }]} onPress={() => {}}>
            <View style={styles.tabs}>
              {(
                [
                  ['pay', 'PAYTABLE'],
                  ['history', 'MY HISTORY'],
                ] as const
              ).map(([id, label]) => (
                <Pressable key={id} onPress={() => openPanel(id)} style={[styles.tab, panel === id && styles.tabOn]}>
                  <Text style={[styles.tabText, panel === id && styles.tabTextOn]}>{label}</Text>
                </Pressable>
              ))}
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => setPanel(null)} hitSlop={10} style={{ padding: 6 }}>
                <MaterialCommunityIcons name="close" size={20} color={GOLD} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 14 }}>
              {panel === 'pay' ? (
                <Paytable paytable={paytable} paylines={paylines} multipliers={multValues} rtp={config?.rtpPercent ?? 89.83} minStake={minStake} maxStake={maxStake} maxPayout={config?.maxPayout ?? 10000} />
              ) : (
                <History spins={history} />
              )}
            </ScrollView>
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

const SYMBOL_ORDER: SlotSymbol[] = ['WILD', 'RUBY', 'SAPPHIRE', 'EMERALD', 'A', 'K', 'Q', 'J'];

function Paytable({
  paytable,
  paylines,
  multipliers,
  rtp,
  minStake,
  maxStake,
  maxPayout,
}: {
  paytable: Record<SlotSymbol, number>;
  paylines: [number, number, number][];
  multipliers: number[];
  rtp: number;
  minStake: number;
  maxStake: number;
  maxPayout: number;
}) {
  return (
    <View>
      <Text style={styles.ruleHead}>Symbols — 3 on a payline</Text>
      <View style={styles.payGrid}>
        {SYMBOL_ORDER.map((s) => (
          <View key={s} style={styles.payCell}>
            <SymbolArt symbol={s} size={48} />
            <Text style={styles.payValue}>{paytable[s]}x</Text>
          </View>
        ))}
      </View>
      <Text style={styles.ruleLine}>Pays are multiples of your total bet. WILD stands in for every symbol, and three WILDs pay 8x.</Text>
      <Text style={styles.ruleHead}>5 paylines</Text>
      <View style={styles.linesRow}>
        {paylines.map((line, li) => (
          <View key={li} style={styles.lineCard}>
            {[0, 1, 2].map((row) => (
              <View key={row} style={styles.row}>
                {[0, 1, 2].map((reel) => (
                  <View key={reel} style={[styles.lineDot, line[reel] === row && { backgroundColor: LINE_COLORS[li] }]} />
                ))}
              </View>
            ))}
            <Text style={[styles.lineCardText, { color: LINE_COLORS[li] }]}>{li + 1}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.ruleHead}>Multiplier reel</Text>
      <View style={[styles.row, { flexWrap: 'wrap', gap: 6 }]}>
        {multipliers.map((m) => (
          <View key={m} style={[styles.multChip, { borderColor: MULT_COLORS[m] ?? GOLD }]}>
            <Text style={[styles.multChipText, { color: MULT_COLORS[m] ?? GOLD }]}>x{m}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.ruleLine}>The fourth reel spins with every bet. The value it stops on multiplies the total of all winning lines.</Text>
      <Text style={styles.ruleHead}>Game info</Text>
      <Text style={styles.ruleLine}>Return to player {rtp}%. Bet ₹{minStake} – ₹{maxStake}. Max win per spin ₹{maxPayout}.</Text>
      <Text style={styles.ruleLine}>Tap SPIN while the reels run to stop them at once. Every spin is drawn from your provably-fair seeds (Settings → Provably Fair).</Text>
    </View>
  );
}

function History({ spins }: { spins: SlotSpin[] | null }) {
  if (spins === null) return <Text style={styles.muted}>Loading…</Text>;
  if (spins.length === 0) return <Text style={styles.muted}>No spins yet.</Text>;
  return (
    <View style={{ gap: 8 }}>
      {spins.map((s) => {
        const payout = Number(s.payout);
        const d = new Date(s.createdAt);
        return (
          <View key={s.id} style={styles.histRow}>
            <View style={styles.miniGrid}>
              {s.grid.map((sym, i) => (
                <SymbolArt key={i} symbol={sym} size={16} />
              ))}
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.histMain}>
                Bet ₹{Number(s.stake).toFixed(2)} · x{s.multiplier}
              </Text>
              <Text style={styles.histSub}>
                {d.toLocaleDateString()} {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {s.winLines.length} line{s.winLines.length === 1 ? '' : 's'}
              </Text>
            </View>
            <Text style={[styles.histPay, { color: payout > 0 ? '#4ADE80' : 'rgba(230,220,255,0.5)' }]}>{payout > 0 ? `+₹${payout.toFixed(2)}` : '—'}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** Home-screen tile art: the three gems. */
export function SlotTileArt({ size }: { size: number }) {
  const s = size * 0.26;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ transform: [{ rotate: '-10deg' }, { translateY: 4 }] }}>
        <SymbolArt symbol="EMERALD" size={s} />
      </View>
      <SymbolArt symbol="RUBY" size={s * 1.15} />
      <View style={{ transform: [{ rotate: '10deg' }, { translateY: 4 }] }}>
        <SymbolArt symbol="SAPPHIRE" size={s} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#070111' },
  row: { flexDirection: 'row', alignItems: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.4 },

  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 6 },
  headBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(30,8,52,0.85)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.45)' },
  headBalance: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: 'rgba(30,8,52,0.9)', borderWidth: 1.2, borderColor: GOLD },
  headBalanceText: { color: GOLD, fontWeight: '900', fontSize: 14 },

  multText: { fontWeight: '900', fontFamily: 'serif', textShadowColor: '#000', textShadowRadius: 4 },
  multWindow: { position: 'absolute', left: 0, borderRadius: 8, borderWidth: 2, borderColor: GOLD, backgroundColor: 'rgba(255,214,107,0.08)' },
  lineMark: { position: 'absolute', width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  lineMarkText: { fontSize: 10, fontWeight: '900' },

  winStrip: { position: 'absolute', flexDirection: 'row', height: 54, borderRadius: 14, backgroundColor: 'rgba(14,3,26,0.9)', borderWidth: 1.2, borderColor: 'rgba(255,214,107,0.5)', overflow: 'hidden' },
  stripCell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stripWin: { flex: 1.6, borderLeftWidth: 1, borderRightWidth: 1, borderColor: 'rgba(255,214,107,0.25)' },
  stripLabel: { color: 'rgba(230,220,255,0.6)', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  stripValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', marginTop: 1 },
  stripWinValue: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', marginTop: 1 },
  multStamp: { fontSize: 20, fontWeight: '900', fontFamily: 'serif' },

  controls: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  betBox: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6, borderRadius: 16, backgroundColor: 'rgba(14,3,26,0.9)', borderWidth: 1.2, borderColor: 'rgba(255,214,107,0.5)' },
  betBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: GOLD },
  betValueBox: { alignItems: 'center', minWidth: 58 },
  betLabel: { color: 'rgba(230,220,255,0.6)', fontSize: 8.5, fontWeight: '800', letterSpacing: 1 },
  betValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  spinBtn: { width: 92, height: 92, borderRadius: 46, padding: 4, backgroundColor: '#5A2E00', elevation: 10, shadowColor: GOLD, shadowOpacity: 0.8, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } },
  spinInner: { flex: 1, borderRadius: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFF3C4' },
  spinAutoText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14, marginTop: -2 },
  sideBtns: { gap: 8 },
  sideBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 84, height: 34, borderRadius: 12, justifyContent: 'center', backgroundColor: 'rgba(14,3,26,0.9)', borderWidth: 1.2, borderColor: 'rgba(255,214,107,0.5)' },
  sideBtnOn: { backgroundColor: GOLD, borderColor: '#FFF3C4' },
  sideBtnText: { color: GOLD, fontWeight: '900', fontSize: 11, letterSpacing: 1 },

  autoPop: { position: 'absolute', padding: 12, borderRadius: 14, backgroundColor: '#1A0830', borderWidth: 1.5, borderColor: GOLD },
  autoPopTitle: { color: GOLD, fontWeight: '900', fontSize: 11, letterSpacing: 2, textAlign: 'center', marginBottom: 8 },
  autoGrid: { flexDirection: 'row', gap: 8 },
  autoOpt: { width: 46, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,214,107,0.12)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.5)' },
  autoOptText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },

  bigWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5,0,12,0.72)', alignItems: 'center', justifyContent: 'center' },
  bigAmount: { color: '#FFFFFF', fontSize: 38, fontWeight: '900', marginVertical: 10, textShadowColor: GOLD_DEEP, textShadowRadius: 12 },

  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  sheet: { borderRadius: 18, backgroundColor: '#150626', borderWidth: 1.5, borderColor: GOLD, overflow: 'hidden' },
  tabs: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,214,107,0.25)' },
  tab: { paddingHorizontal: 12, paddingVertical: 7, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  tabOn: { backgroundColor: 'rgba(255,214,107,0.14)', borderBottomWidth: 2, borderBottomColor: GOLD },
  tabText: { color: 'rgba(230,220,255,0.6)', fontWeight: '900', fontSize: 12, letterSpacing: 1.2 },
  tabTextOn: { color: GOLD },
  ruleHead: { color: GOLD, fontWeight: '900', fontSize: 13, letterSpacing: 1, marginTop: 12, marginBottom: 6 },
  ruleLine: { color: 'rgba(235,228,255,0.85)', fontSize: 12.5, lineHeight: 19, fontWeight: '600', marginTop: 4 },
  payGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  payCell: { width: '22%', flexGrow: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.2)' },
  payValue: { color: GOLD, fontWeight: '900', fontSize: 13, marginTop: 2 },
  linesRow: { flexDirection: 'row', justifyContent: 'space-between' },
  lineCard: { alignItems: 'center', padding: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)', gap: 2 },
  lineDot: { width: 9, height: 9, margin: 1.5, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)' },
  lineCardText: { fontWeight: '900', fontSize: 11, marginTop: 2 },
  multChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1.2 },
  multChipText: { fontWeight: '900', fontSize: 13 },
  muted: { color: 'rgba(230,220,255,0.6)', textAlign: 'center', marginTop: 20, fontWeight: '700' },
  histRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.15)' },
  miniGrid: { width: 54, flexDirection: 'row', flexWrap: 'wrap', gap: 1, padding: 1, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.35)' },
  histMain: { color: '#FFFFFF', fontWeight: '800', fontSize: 12.5 },
  histSub: { color: 'rgba(230,220,255,0.6)', fontWeight: '600', fontSize: 11, marginTop: 2 },
  histPay: { fontWeight: '900', fontSize: 13 },

  toast: { position: 'absolute', alignSelf: 'center', top: '45%', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.85)', borderWidth: 1, borderColor: GOLD_DEEP },
  toastText: { color: '#FFE08A', fontSize: 14, fontWeight: '700' },
});
