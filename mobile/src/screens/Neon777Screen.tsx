import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient as SvgLinearGradient, Path, Pattern, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../api/client';
import { Neon777Config, Neon777Outcome, Neon777Result, Neon777Special, Neon777SpinRow, Neon777Symbol, fetchNeon777Config, fetchNeon777History, spinNeon777 } from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const NEON_PINK = '#FF2D95';
const NEON_CYAN = '#22E5FF';
const CHROME = '#E6E9F0';
const GOLD = '#FFD166';
const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const DEFAULT_BET = 10;
const AUTO_OPTIONS = [10, 25, 50, 100];
const SOUND_KEY = 'novaplay:neon777:sound';
const TOAST_MS = 1800;

// Fallbacks so the reels can draw before the config arrives; the server's config (the same strips) replaces them.
const BL: Neon777Symbol = 'BLANK', B1: Neon777Symbol = 'BAR1', B2: Neon777Symbol = 'BAR2', B3: Neon777Symbol = 'BAR3', S7: Neon777Symbol = 'BLUE7', R7: Neon777Symbol = 'RED7';
const FALLBACK_STRIPS: Neon777Symbol[][] = [
  [B1, BL, B3, B1, BL, B2, S7, BL, B1, B3, BL, B2, B1, BL, R7, B1, BL, B3, B2, BL, B1, BL, BL],
  [B2, BL, B1, R7, BL, B3, B1, BL, B2, B1, BL, S7, B3, BL, B1, B2, BL, B1, B3, BL, B1, BL, BL],
  [B3, BL, B1, B2, BL, B1, R7, BL, B3, B1, BL, B2, S7, BL, B1, B3, BL, B2, B1, BL, B1, BL, BL],
];
const FALLBACK_SPECIAL: Neon777Special[] = [
  { kind: 'NONE', value: 0, chancePercent: 63.64 },
  { kind: 'MULT', value: 2, chancePercent: 14.55 },
  { kind: 'MULT', value: 5, chancePercent: 4.55 },
  { kind: 'MULT', value: 10, chancePercent: 1.82 },
  { kind: 'BONUS', value: 5, chancePercent: 5.45 },
  { kind: 'BONUS', value: 10, chancePercent: 2.73 },
  { kind: 'BONUS', value: 20, chancePercent: 0.91 },
  { kind: 'RESPIN', value: 0, chancePercent: 6.36 },
];
const FALLBACK_PAYS: Neon777Config['linePays'] = { RED7: 100, BLUE7: 50, ANY7: 20, BAR3: 15, BAR2: 10, BAR1: 5, ANYBAR: 3 };
const RESULT_NAME: Record<Neon777Result, string> = {
  RED7: 'Red 7s',
  BLUE7: 'Blue 7s',
  ANY7: 'Any 7s',
  BAR3: 'Triple BARs',
  BAR2: 'Double BARs',
  BAR1: 'Single BARs',
  ANYBAR: 'Any BARs',
  NONE: '',
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const wrap = (s: unknown[], i: number) => ((i % s.length) + s.length) % s.length;

// ---------- symbol art ----------

export const ReelArt = memo(function ReelArt({ s, size }: { s: Neon777Symbol; size: number }) {
  // Gradient ids unique to this drawing, so copies elsewhere on screen never borrow each other's.
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  if (s === 'BLANK') return <View style={{ width: size, height: size }} />;
  let body: React.ReactNode;
  if (s === 'RED7' || s === 'BLUE7') {
    const red = s === 'RED7';
    body = (
      <G>
        <SvgText x={54} y={88} fontSize={96} fontWeight="900" fontStyle="italic" fill="#000" opacity={0.25} textAnchor="middle">
          7
        </SvgText>
        <SvgText x={50} y={84} fontSize={96} fontWeight="900" fontStyle="italic" fill={red ? `url(#n7Red${uid})` : `url(#n7Blue${uid})`} stroke={GOLD} strokeWidth={4} textAnchor="middle">
          7
        </SvgText>
      </G>
    );
  } else {
    const n = s === 'BAR3' ? 3 : s === 'BAR2' ? 2 : 1;
    const color = s === 'BAR3' ? NEON_PINK : s === 'BAR2' ? '#7CFF4F' : NEON_CYAN;
    const h = 24;
    const top = 50 - (n * h + (n - 1) * 5) / 2;
    body = (
      <G>
        {Array.from({ length: n }, (_, i) => (
          <G key={i}>
            <Rect x={10} y={top + i * (h + 5)} width={80} height={h} rx={6} fill="#141420" stroke={color} strokeWidth={2.5} />
            <SvgText x={50} y={top + i * (h + 5) + 18} fontSize={17} fontWeight="900" fill={color} textAnchor="middle" letterSpacing={3}>
              BAR
            </SvgText>
          </G>
        ))}
      </G>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <SvgLinearGradient id={`n7Red${uid}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FF8A8A" />
          <Stop offset="0.5" stopColor="#E0101F" />
          <Stop offset="1" stopColor="#7A0010" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`n7Blue${uid}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#9BD8FF" />
          <Stop offset="0.5" stopColor="#1565E0" />
          <Stop offset="1" stopColor="#0A2A7A" />
        </SvgLinearGradient>
      </Defs>
      {body}
    </Svg>
  );
});

export const SpecialArt = memo(function SpecialArt({ sp, size, dim }: { sp: Neon777Special; size: number; dim?: boolean }) {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  let body: React.ReactNode;
  if (sp.kind === 'MULT') {
    body = (
      <G>
        <Circle cx={50} cy={50} r={40} fill="#1A0630" stroke={NEON_PINK} strokeWidth={5} />
        <Circle cx={50} cy={50} r={33} fill="none" stroke={NEON_PINK} strokeOpacity={0.4} strokeWidth={2} />
        <SvgText x={50} y={sp.value >= 10 ? 62 : 64} fontSize={sp.value >= 10 ? 34 : 40} fontWeight="900" fill="#FFFFFF" stroke={NEON_PINK} strokeWidth={1.5} textAnchor="middle">
          {`x${sp.value}`}
        </SvgText>
      </G>
    );
  } else if (sp.kind === 'BONUS') {
    body = (
      <G>
        <Circle cx={50} cy={50} r={40} fill={`url(#n7Coin${uid})`} stroke="#8A5A00" strokeWidth={3} />
        <Circle cx={50} cy={50} r={32} fill="none" stroke="#8A5A00" strokeWidth={1.5} strokeDasharray="4 3" />
        <SvgText x={50} y={42} fontSize={14} fontWeight="900" fill="#5A3200" textAnchor="middle" letterSpacing={1}>
          BONUS
        </SvgText>
        <SvgText x={50} y={70} fontSize={26} fontWeight="900" fill="#5A3200" textAnchor="middle">
          {`+${sp.value}x`}
        </SvgText>
      </G>
    );
  } else if (sp.kind === 'RESPIN') {
    body = (
      <G>
        <Circle cx={50} cy={50} r={40} fill="#062A1E" stroke="#3CFFA0" strokeWidth={5} />
        <Path d="M30 44 A 22 22 0 0 1 70 40" stroke="#3CFFA0" strokeWidth={6} fill="none" strokeLinecap="round" />
        <Path d="M66 30 L 72 42 L 60 44 Z" fill="#3CFFA0" />
        <Path d="M70 56 A 22 22 0 0 1 30 60" stroke="#3CFFA0" strokeWidth={6} fill="none" strokeLinecap="round" />
        <Path d="M34 70 L 28 58 L 40 56 Z" fill="#3CFFA0" />
        <SvgText x={50} y={56} fontSize={12} fontWeight="900" fill="#FFFFFF" textAnchor="middle" letterSpacing={0.5}>
          RESPIN
        </SvgText>
      </G>
    );
  } else {
    body = (
      <G opacity={0.35}>
        <Path d="M50 22 L 57 42 L 78 42 L 61 54 L 68 75 L 50 62 L 32 75 L 39 54 L 22 42 L 43 42 Z" fill="none" stroke={NEON_CYAN} strokeWidth={2.5} />
      </G>
    );
  }
  return (
    <View style={{ opacity: dim ? 0.45 : 1 }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={`n7Coin${uid}`} cx="40%" cy="35%" r="70%">
            <Stop offset="0" stopColor="#FFF6C8" />
            <Stop offset="0.6" stopColor="#FFC93C" />
            <Stop offset="1" stopColor="#B7791F" />
          </RadialGradient>
        </Defs>
        {body}
      </Svg>
    </View>
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
      // [showing, random…, showing]: both ends look the same, so the loop wraps without a visible jump.
      const span = content.length - 3;
      y.setValue(-span * cell);
      const loop = Animated.loop(Animated.timing(y, { toValue: 0, duration: p.fast ? 380 : 560, easing: Easing.linear, useNativeDriver: true }));
      loopRef.current = loop;
      loop.start();
    } else {
      y.setValue(-(content.length - 3) * cell);
      Animated.timing(y, { toValue: 0, duration: p.fast ? 260 : 460, easing: Easing.out(Easing.back(1.3)), useNativeDriver: true }).start(() => {
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

function Background({ w, h }: { w: number; h: number }) {
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id="n7Bg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#12001F" />
          <Stop offset="0.55" stopColor="#07010F" />
          <Stop offset="1" stopColor="#020005" />
        </SvgLinearGradient>
        <RadialGradient id="n7GlowP" cx="15%" cy="30%" r="45%">
          <Stop offset="0" stopColor={NEON_PINK} stopOpacity={0.28} />
          <Stop offset="1" stopColor={NEON_PINK} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="n7GlowC" cx="85%" cy="70%" r="45%">
          <Stop offset="0" stopColor={NEON_CYAN} stopOpacity={0.22} />
          <Stop offset="1" stopColor={NEON_CYAN} stopOpacity={0} />
        </RadialGradient>
        <Pattern id="n7Grid" width={40} height={40} patternUnits="userSpaceOnUse">
          <Path d="M40 0 L 0 0 0 40" fill="none" stroke={NEON_CYAN} strokeOpacity={0.06} strokeWidth={1} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill="url(#n7Bg)" />
      <Rect x={0} y={0} width={w} height={h} fill="url(#n7Grid)" />
      <Rect x={0} y={0} width={w} height={h} fill="url(#n7GlowP)" />
      <Rect x={0} y={0} width={w} height={h} fill="url(#n7GlowC)" />
    </Svg>
  );
}

function Logo({ width }: { width: number }) {
  return (
    <Svg width={width} height={width * 0.26} viewBox="0 0 340 88">
      <SvgText x={170} y={64} fontSize={58} fontWeight="900" fontStyle="italic" fill="none" stroke={NEON_PINK} strokeWidth={9} strokeOpacity={0.25} textAnchor="middle" letterSpacing={3}>
        NEON 777
      </SvgText>
      <SvgText x={170} y={64} fontSize={58} fontWeight="900" fontStyle="italic" fill="#FFFFFF" stroke={NEON_PINK} strokeWidth={3} textAnchor="middle" letterSpacing={3}>
        NEON 777
      </SvgText>
      <SvgText x={170} y={84} fontSize={12} fontWeight="900" fill={NEON_CYAN} textAnchor="middle" letterSpacing={5}>
        CLASSIC · SPECIAL REEL
      </SvgText>
    </Svg>
  );
}

function Rays({ size }: { size: number }) {
  const c = size / 2;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id="n7Ray" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFE9F5" stopOpacity={0.6} />
          <Stop offset="1" stopColor={NEON_PINK} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={c} cy={c} r={c * 0.45} fill="url(#n7Ray)" />
      {Array.from({ length: 16 }, (_, i) => {
        const a0 = ((i * 22.5 - 5) * Math.PI) / 180;
        const a1 = ((i * 22.5 + 5) * Math.PI) / 180;
        return <Path key={i} d={`M ${c} ${c} L ${c + c * Math.cos(a0)} ${c + c * Math.sin(a0)} L ${c + c * Math.cos(a1)} ${c + c * Math.sin(a1)} Z`} fill="url(#n7Ray)" />;
      })}
    </Svg>
  );
}

/** Home tile art: three red 7s on a chrome line with neon glow. */
export function Neon777TileArt({ size }: { size: number }) {
  const s = size * 0.3;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size }} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="n7tBg" cx="50%" cy="40%" r="70%">
            <Stop offset="0" stopColor="#3A0B5C" />
            <Stop offset="1" stopColor="#07010F" />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill="url(#n7tBg)" />
        <Rect x={8} y={20} width={84} height={40} rx={8} fill="#F4F1E8" stroke={CHROME} strokeWidth={2} />
        <Rect x={8} y={39} width={84} height={2} fill="#E0101F" opacity={0.7} />
        <Rect x={4} y={16} width={92} height={48} rx={10} fill="none" stroke={NEON_PINK} strokeWidth={1.5} />
      </Svg>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ position: 'absolute', left: size * (0.08 + i * 0.28), top: size * 0.25 }}>
          <ReelArt s="RED7" size={s} />
        </View>
      ))}
    </View>
  );
}

// ---------- screen ----------

type Banner = { title: string; sub: string };
type BigWin = { label: string; amount: number };
type Pop = { text: string; sub?: string; key: number };

const START_ROWS: Neon777Symbol[][] = [
  [B1, R7, B2],
  [BL, R7, B3],
  [B2, R7, BL],
];

export default function Neon777Screen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<Neon777Config | null>(null);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [busy, setBusy] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [autoLeft, setAutoLeft] = useState(0);
  const [autoOpen, setAutoOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [shownBalance, setShownBalance] = useState(coins);
  const [winTotal, setWinTotal] = useState(0);
  const [lineLit, setLineLit] = useState(false);
  const [specialLit, setSpecialLit] = useState(false);
  const [respin, setRespin] = useState<{ index: number } | null>(null);
  const [pop, setPop] = useState<Pop | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [bigWin, setBigWin] = useState<BigWin | null>(null);
  const [bigCount, setBigCount] = useState(0);
  const [panel, setPanel] = useState<'pay' | 'history' | null>(null);
  const [history, setHistory] = useState<Neon777SpinRow[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [bulbPhase, setBulbPhase] = useState(0);

  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const hurryRef = useRef(false);
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
  const playersRef = useRef<{ tick: AudioPlayer; win: AudioPlayer; land: AudioPlayer } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const popAnim = useRef(new Animated.Value(0)).current;
  const bannerAnim = useRef(new Animated.Value(0)).current;
  const bigAnim = useRef(new Animated.Value(0)).current;
  const raysSpin = useRef(new Animated.Value(0)).current;
  const reels = [useRef<ReelHandle<Neon777Symbol>>(null), useRef<ReelHandle<Neon777Symbol>>(null), useRef<ReelHandle<Neon777Symbol>>(null)];
  const specialReel = useRef<ReelHandle<number>>(null);
  const rowsRef = useRef<Neon777Symbol[][]>(START_ROWS);
  const specialRowsRef = useRef<number[]>([2, 1, 4]);

  const strips = config?.strips ?? FALLBACK_STRIPS;
  const special = config?.special ?? FALLBACK_SPECIAL;
  const linePays = config?.linePays ?? FALLBACK_PAYS;
  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const betLevels = useMemo(() => BET_LEVELS.filter((b) => b >= minStake && b <= maxStake), [minStake, maxStake]);

  // ---------- layout ----------
  const headerH = insets.top + 50;
  const cabW = Math.min(W - 20, 440);
  const frame = 12;
  const gap = 6;
  const sepGap = 12;
  const inner = cabW - frame * 2;
  // Each reel window has a 2px border on both sides.
  const reelW = Math.floor((inner - gap * 2 - sepGap - 16) / 3.85);
  const specialW = Math.floor(reelW * 0.85);
  const logoW = Math.min(W * 0.8, 320);
  const logoH = logoW * 0.26;
  const controlsH = 92;
  const stripH = 54;
  const availH = H - headerH - insets.bottom - 18 - controlsH - stripH - logoH - 70;
  const cell = Math.floor(Math.min(reelW * 0.92, (availH - frame * 2 - 24) / 3));
  const reelsH = cell * 3;
  const cabH = reelsH + frame * 2 + 24;
  const cabLeft = (W - cabW) / 2;
  const spare = Math.max(0, H - insets.bottom - 18 - controlsH - headerH - (logoH + 10 + cabH + 14 + stripH));
  const logoTop = headerH + spare * 0.4;
  const cabTop = logoTop + logoH + 10;
  const stripTop = cabTop + cabH + 14 + spare * 0.1;
  const ctrlW = Math.max(cabW, Math.min(W - 24, 360));
  const winW = reelW + 4;
  const spLeftOff = winW * 3 + gap * 2 + sepGap;
  const reelsLeft = frame + (inner - (spLeftOff + specialW + 4)) / 2;
  const cellTop = frame + 12 + 2;
  const controlsTop = H - insets.bottom - 18 - controlsH;
  const plaqueTop = stripTop + stripH + 10;
  const showPlaque = controlsTop - plaqueTop >= 84;

  const wait = useCallback((ms: number) => new Promise<void>((r) => setTimeout(r, hurryRef.current ? Math.min(ms, 60) : turboRef.current ? ms * 0.45 : ms)), []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const play = useCallback((name: 'tick' | 'win' | 'land') => {
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
    fetchNeon777Config()
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
        land: createAudioPlayer(require('../../assets/sounds/plinko-land.wav')),
      };
    } catch {
      playersRef.current = null;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 380, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 380, useNativeDriver: false }),
      ])
    );
    loop.start();
    const bulbs = setInterval(() => mountedRef.current && setBulbPhase((p) => (p + 1) % 2), 500);
    return () => {
      mountedRef.current = false;
      loop.stop();
      clearInterval(bulbs);
      const players = playersRef.current;
      playersRef.current = null;
      if (players) Object.values(players).forEach((p) => p.remove());
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [pulse]);

  useEffect(() => {
    if (!busyRef.current) setShownBalance(coins);
  }, [coins]);

  useEffect(() => {
    if (!bigWin) return;
    raysSpin.setValue(0);
    const loop = Animated.loop(Animated.timing(raysSpin, { toValue: 1, duration: 8000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    setBigCount(0);
    const start = Date.now();
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / 1800);
      setBigCount(round2(bigWin.amount * (1 - (1 - t) * (1 - t))));
      if (t >= 1) clearInterval(id);
    }, 40);
    return () => {
      loop.stop();
      clearInterval(id);
    };
  }, [bigWin, raysSpin]);

  const showPop = useCallback(
    (text: string, sub?: string) => {
      setPop({ text, sub, key: Date.now() });
      popAnim.setValue(0);
      Animated.timing(popAnim, { toValue: 1, duration: turboRef.current ? 700 : 1300, useNativeDriver: true }).start();
    },
    [popAnim]
  );

  const showBanner = useCallback(
    async (b: Banner, ms: number) => {
      setBanner(b);
      bannerAnim.setValue(0);
      await new Promise<void>((r) => Animated.spring(bannerAnim, { toValue: 1, friction: 6, tension: 70, useNativeDriver: true }).start(() => r()));
      await wait(ms);
      await new Promise<void>((r) => Animated.timing(bannerAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => r()));
      if (mountedRef.current) setBanner(null);
    },
    [bannerAnim, wait]
  );

  const fillers = useMemo(() => [0, 1, 2].map((i) => () => pick(strips[i])), [strips]);
  const specialFiller = useCallback(() => Math.floor(Math.random() * special.length), [special]);

  const doSpin = useCallback(async () => {
    if (busyRef.current) {
      hurryRef.current = true;
      reels.forEach((r) => r.current?.hurry());
      specialReel.current?.hurry();
      return;
    }
    const stake = betRef.current;
    if (stake > balanceRef.current) {
      showToast('Insufficient balance');
      setAutoLeft(0);
      return;
    }
    busyRef.current = true;
    hurryRef.current = false;
    setBusy(true);
    setWinTotal(0);
    setLineLit(false);
    setSpecialLit(false);
    setPop(null);
    setBigWin(null);
    setShownBalance((b) => round2(b - stake));
    const fast = turboRef.current;
    reels.forEach((r) => r.current?.start(fast));
    specialReel.current?.start(fast);

    let result: { spin: Neon777SpinRow; outcome: Neon777Outcome };
    try {
      result = await spinNeon777(stake);
    } catch (err) {
      setShownBalance((b) => round2(b + stake));
      setAutoLeft(0);
      showToast(errorMessage(err));
      reels.forEach((r, i) => r.current?.set(rowsRef.current[i]));
      specialReel.current?.set(specialRowsRef.current);
      busyRef.current = false;
      setBusy(false);
      return;
    }
    if (!mountedRef.current) return;

    const { spin, outcome } = result;
    let total = 0;
    for (let i = 0; i < outcome.rounds.length && mountedRef.current; i++) {
      const round = outcome.rounds[i];
      if (i > 0) {
        setRespin({ index: i });
        setLineLit(false);
        setSpecialLit(false);
        await showBanner({ title: 'RESPIN', sub: `FREE SPIN ${i} · UP TO ${config?.maxRespins ?? 5} IN A ROW` }, 450);
        reels.forEach((r) => r.current?.start(turboRef.current));
        specialReel.current?.start(turboRef.current);
        await wait(350);
      }
      const rows = round.stops.map((stop, reel) => [-1, 0, 1].map((d) => strips[reel][wrap(strips[reel], stop + d)]));
      const spRows = [specialFiller(), round.special, specialFiller()];
      const f = turboRef.current || hurryRef.current;
      const gapMs = f ? 90 : 260;
      await Promise.all(reels.map((r, k) => r.current?.land(rows[k], (i > 0 ? 0 : 250) + k * gapMs, f) ?? Promise.resolve()));
      // The Special Reel stops last, with a moment of suspense when the line has won.
      await (specialReel.current?.land(spRows, round.linePays > 0 && !f ? 450 : 80, f) ?? Promise.resolve());
      rowsRef.current = rows;
      specialRowsRef.current = spRows;
      if (!mountedRef.current) return;
      if (round.linePays > 0) {
        const sp = special[round.special];
        setLineLit(true);
        const applies = sp.kind !== 'NONE';
        setSpecialLit(applies);
        play('win');
        total = round2(total + stake * round.win);
        setWinTotal(total);
        const base = `${RESULT_NAME[round.result]} ${round.linePays}x`;
        const sub = sp.kind === 'MULT' ? `${base} × ${sp.value} = ${round.win}x` : sp.kind === 'BONUS' ? `${base} + bonus ${sp.value}x = ${round.win}x` : sp.kind === 'RESPIN' ? `${base} · RESPIN!` : base;
        showPop(`+₹${round2(stake * round.win).toFixed(2)}`, sub);
        await wait(sp.kind === 'RESPIN' ? 1300 : 900);
      } else {
        play('land');
      }
    }
    setRespin(null);
    if (!mountedRef.current) return;

    // The server's payout (rounded down, capped) is the one that counts.
    const payout = Number(spin.payout);
    setWinTotal(payout);
    setShownBalance((b) => round2(b + payout));
    busyRef.current = false;
    hurryRef.current = false;
    setBusy(false);
    if (payout > 0 && payout / stake >= 20) {
      const ratio = payout / stake;
      setBigWin({ label: ratio >= 100 ? 'JACKPOT' : ratio >= 50 ? 'MEGA WIN' : 'BIG WIN', amount: payout });
      bigAnim.setValue(0);
      Animated.spring(bigAnim, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }).start();
    }
    refreshWallet().catch(() => {});

    if (autoRef.current > 0) {
      const next = autoRef.current - 1;
      setAutoLeft(next);
      if (next > 0) {
        const pause = payout <= 0 ? 250 : payout / stake >= 20 ? 2600 : 900;
        setTimeout(() => {
          if (mountedRef.current && autoRef.current > 0) {
            setBigWin(null);
            doSpinRef.current();
          }
        }, turboRef.current ? pause / 2 : pause);
      }
    }
    // reels / refs are stable for the life of the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bigAnim, config?.maxRespins, play, refreshWallet, showBanner, showPop, showToast, special, specialFiller, strips, wait]);

  const doSpinRef = useRef(doSpin);
  doSpinRef.current = doSpin;

  const changeBet = (dir: 1 | -1) => {
    if (busy || autoLeft > 0) return;
    const i = betLevels.indexOf(bet);
    const next = betLevels[Math.max(0, Math.min(betLevels.length - 1, (i < 0 ? betLevels.indexOf(DEFAULT_BET) : i) + dir))];
    if (next !== undefined) setBet(next);
  };

  const startAuto = (n: number) => {
    setAutoOpen(false);
    setAutoLeft(n);
    autoRef.current = n;
    if (!busyRef.current) doSpin();
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
      fetchNeon777History(30)
        .then((h) => mountedRef.current && setHistory(h))
        .catch(() => mountedRef.current && setHistory([]));
    }
  };

  const litOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });
  const bulbCount = Math.max(8, Math.floor(cabW / 26));

  return (
    <View style={styles.root}>
      <Background w={W} h={H} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 6, height: headerH }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtn} hitSlop={8} accessibilityLabel="Back">
          <MaterialCommunityIcons name="chevron-left" size={26} color={NEON_CYAN} />
        </Pressable>
        <View style={styles.headBalance}>
          <MaterialCommunityIcons name="wallet" size={16} color={NEON_CYAN} />
          <Text style={styles.headBalanceText} numberOfLines={1}>
            ₹{shownBalance.toFixed(2)}
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        <Pressable onPress={toggleSound} style={styles.headBtn} hitSlop={6} accessibilityLabel="Sound">
          <MaterialCommunityIcons name={soundOn ? 'volume-high' : 'volume-off'} size={20} color={NEON_CYAN} />
        </Pressable>
        <Pressable onPress={() => openPanel('history')} style={styles.headBtn} hitSlop={6} accessibilityLabel="My history">
          <MaterialCommunityIcons name="history" size={20} color={NEON_CYAN} />
        </Pressable>
        <Pressable onPress={() => openPanel('pay')} style={styles.headBtn} hitSlop={6} accessibilityLabel="Paytable">
          <MaterialCommunityIcons name="information-variant" size={22} color={NEON_CYAN} />
        </Pressable>
      </View>

      <View style={{ position: 'absolute', top: logoTop, left: (W - logoW) / 2 }} pointerEvents="none">
        <Logo width={logoW} />
      </View>

      {/* Cabinet */}
      <View style={{ position: 'absolute', top: cabTop, left: cabLeft, width: cabW, height: cabH }}>
        <Svg width={cabW} height={cabH} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <SvgLinearGradient id="n7Chrome" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" />
              <Stop offset="0.25" stopColor="#B9BECB" />
              <Stop offset="0.5" stopColor="#F2F4F8" />
              <Stop offset="0.75" stopColor="#8D93A3" />
              <Stop offset="1" stopColor="#D9DCE4" />
            </SvgLinearGradient>
          </Defs>
          <Rect x={0} y={0} width={cabW} height={cabH} rx={20} fill="url(#n7Chrome)" />
          <Rect x={frame - 4} y={frame - 4} width={cabW - (frame - 4) * 2} height={cabH - (frame - 4) * 2} rx={14} fill="#16061F" stroke={NEON_PINK} strokeWidth={2} />
          {/* marquee bulbs along the top and bottom of the frame */}
          {Array.from({ length: bulbCount }, (_, i) => {
            const x = 16 + ((cabW - 32) * i) / (bulbCount - 1);
            const on = (i + bulbPhase) % 2 === 0;
            return (
              <G key={i}>
                <Circle cx={x} cy={4.5} r={3} fill={on ? '#FFF3B0' : '#8A6A2A'} />
                <Circle cx={x} cy={cabH - 4.5} r={3} fill={on ? '#8A6A2A' : '#FFF3B0'} />
              </G>
            );
          })}
        </Svg>
        {/* main reels on cream, with the payline */}
        <View style={{ position: 'absolute', top: frame + 12, left: reelsLeft, flexDirection: 'row', alignItems: 'center' }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.reelWindow, { marginRight: i < 2 ? gap : sepGap }]}>
              <LinearGradient colors={['#BDB7A6', '#FBF8EF', '#FFFFFF', '#FBF8EF', '#BDB7A6']} style={StyleSheet.absoluteFill} />
              <Reel<Neon777Symbol> ref={reels[i]} initial={START_ROWS[i]} filler={fillers[i]} cell={cell} width={reelW} render={(s) => <ReelArt s={s} size={cell * 0.86} />} onStop={() => play('tick')} />
            </View>
          ))}
          <View style={[styles.specialWindow, specialLit && { borderColor: GOLD }]}>
            <LinearGradient colors={['#08000F', '#2A0A45', '#08000F']} style={StyleSheet.absoluteFill} />
            <Reel<number> ref={specialReel} initial={[2, 1, 4]} filler={specialFiller} cell={cell} width={specialW} render={(k, idx) => <SpecialArt sp={special[k] ?? special[0]} size={Math.min(cell, specialW) * 0.84} dim={idx !== 1} />} />
          </View>
        </View>
        {/* payline across the main reels, and the Special Reel's middle marker */}
        <View pointerEvents="none" style={{ position: 'absolute', top: cellTop + cell * 1.5 - 1.5, left: reelsLeft - 6, width: winW * 3 + gap * 2 + 12, height: 3 }}>
          <Animated.View style={{ flex: 1, backgroundColor: lineLit ? GOLD : '#E0101F', opacity: lineLit ? litOpacity : 0.65, borderRadius: 2 }} />
        </View>
        {lineLit && (
          <Animated.View pointerEvents="none" style={[styles.lineGlow, { top: cellTop + cell, left: reelsLeft, width: winW * 3 + gap * 2, height: cell, opacity: litOpacity }]} />
        )}
        {specialLit && (
          <Animated.View pointerEvents="none" style={[styles.lineGlow, { top: cellTop + cell, left: reelsLeft + spLeftOff, width: specialW + 4, height: cell, opacity: litOpacity }]} />
        )}
        <Text style={[styles.specialLabel, { top: frame - 3, left: reelsLeft + spLeftOff, width: specialW + 4 }]}>SPECIAL</Text>
        {respin && (
          <View style={styles.respinTag} pointerEvents="none">
            <Text style={styles.respinText}>RESPIN {respin.index}</Text>
          </View>
        )}

        {pop && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.pop,
              {
                top: cabH / 2 - 34,
                opacity: popAnim.interpolate({ inputRange: [0, 0.12, 0.8, 1], outputRange: [0, 1, 1, 0] }),
                transform: [{ translateY: popAnim.interpolate({ inputRange: [0, 1], outputRange: [8, -18] }) }, { scale: popAnim.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0.6, 1.05, 1] }) }],
              },
            ]}
          >
            <Text style={styles.popText}>{pop.text}</Text>
            {pop.sub ? <Text style={styles.popSub}>{pop.sub}</Text> : null}
          </Animated.View>
        )}
      </View>

      {/* Win strip */}
      <View style={[styles.winStrip, { top: stripTop, left: cabLeft, width: cabW }]}>
        <View style={styles.stripCell}>
          <Text style={styles.stripLabel}>BET</Text>
          <Text style={styles.stripValue}>₹{bet}</Text>
        </View>
        <View style={[styles.stripCell, styles.stripWin]}>
          <Text style={styles.stripLabel}>WIN</Text>
          <Text style={[styles.stripWinValue, winTotal > 0 && { color: GOLD }]}>₹{winTotal.toFixed(2)}</Text>
        </View>
        <View style={styles.stripCell}>
          <Text style={styles.stripLabel}>TOP</Text>
          <Text style={styles.stripValue}>{linePays.RED7}x</Text>
        </View>
      </View>

      {/* Pay glass, when there is room for it */}
      {showPlaque && (
        <View style={[styles.plaque, { top: plaqueTop, left: cabLeft, width: cabW, height: Math.min(96, controlsTop - plaqueTop - 10) }]} pointerEvents="none">
          {(
            [
              [
                ['RED7', `${linePays.RED7}`],
                ['BLUE7', `${linePays.BLUE7}`],
                ['ANY7', `${linePays.ANY7}`],
              ],
              [
                ['BAR3', `${linePays.BAR3}`],
                ['BAR2', `${linePays.BAR2}`],
                ['BAR1', `${linePays.BAR1}`],
                ['ANYBAR', `${linePays.ANYBAR}`],
              ],
            ] as [string, string][][]
          ).map((row, r) => (
            <View key={r} style={styles.plaqueRow}>
              {row.map(([k, v]) => (
                <View key={k} style={styles.plaqueItem}>
                  {k === 'ANY7' || k === 'ANYBAR' ? (
                    <Text style={styles.plaqueAny}>{k === 'ANY7' ? 'ANY 7' : 'ANY BAR'}</Text>
                  ) : (
                    <ReelArt s={k as Neon777Symbol} size={24} />
                  )}
                  <Text style={styles.plaqueVal}>{v}x</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}

      {/* Controls */}
      <View style={[styles.controls, { bottom: insets.bottom + 18, left: (W - ctrlW) / 2, width: ctrlW }]}>
        <View style={styles.betBox}>
          <Pressable onPress={() => changeBet(-1)} style={[styles.betBtn, (busy || autoLeft > 0) && styles.dim]} hitSlop={6} accessibilityLabel="Lower bet">
            <MaterialCommunityIcons name="minus" size={20} color="#12001F" />
          </Pressable>
          <View style={styles.betValueBox}>
            <Text style={styles.betLabel}>TOTAL BET</Text>
            <Text style={styles.betValue}>₹{bet}</Text>
          </View>
          <Pressable onPress={() => changeBet(1)} style={[styles.betBtn, (busy || autoLeft > 0) && styles.dim]} hitSlop={6} accessibilityLabel="Raise bet">
            <MaterialCommunityIcons name="plus" size={20} color="#12001F" />
          </Pressable>
        </View>
        <Pressable
          onPress={() => {
            if (autoLeft > 0) setAutoLeft(0);
            else doSpin();
          }}
          style={({ pressed }) => [styles.spinBtn, pressed && { transform: [{ scale: 0.95 }] }]}
          accessibilityLabel={autoLeft > 0 ? 'Stop auto spin' : busy ? 'Speed up' : 'Spin'}
        >
          <LinearGradient colors={autoLeft > 0 ? ['#FF7A8A', '#B3102F'] : ['#FF8AC6', NEON_PINK, '#9C0057']} style={styles.spinInner}>
            {autoLeft > 0 ? (
              <>
                <MaterialCommunityIcons name="stop" size={26} color="#FFFFFF" />
                <Text style={styles.spinAutoText}>{autoLeft}</Text>
              </>
            ) : (
              <MaterialCommunityIcons name={busy ? 'fast-forward' : 'sync'} size={40} color="#FFFFFF" />
            )}
          </LinearGradient>
        </Pressable>
        <View style={styles.sideBtns}>
          <Pressable onPress={() => (autoLeft > 0 ? setAutoLeft(0) : setAutoOpen((o) => !o))} style={[styles.sideBtn, autoLeft > 0 && styles.sideBtnOn]} accessibilityLabel="Auto spin">
            <MaterialCommunityIcons name="autorenew" size={16} color={autoLeft > 0 ? '#12001F' : NEON_CYAN} />
            <Text style={[styles.sideBtnText, autoLeft > 0 && { color: '#12001F' }]}>AUTO</Text>
          </Pressable>
          <Pressable onPress={() => setTurbo((t) => !t)} style={[styles.sideBtn, turbo && styles.sideBtnOn]} accessibilityLabel="Turbo">
            <MaterialCommunityIcons name="lightning-bolt" size={16} color={turbo ? '#12001F' : NEON_CYAN} />
            <Text style={[styles.sideBtnText, turbo && { color: '#12001F' }]}>TURBO</Text>
          </Pressable>
        </View>
      </View>

      {autoOpen && (
        <View style={[styles.autoPop, { bottom: insets.bottom + 126, right: (W - ctrlW) / 2 }]}>
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

      {banner && (
        <View pointerEvents="none" style={styles.bannerWrap}>
          <Animated.View style={[styles.bannerCard, { opacity: bannerAnim, transform: [{ scale: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }]}>
            <Text style={styles.bannerTitle}>{banner.title}</Text>
            <Text style={styles.bannerSub}>{banner.sub}</Text>
          </Animated.View>
        </View>
      )}

      {bigWin && (
        <Pressable style={styles.bigWrap} onPress={() => setBigWin(null)}>
          <Animated.View pointerEvents="none" style={{ position: 'absolute', opacity: bigAnim, transform: [{ rotate: raysSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
            <Rays size={Math.max(W, 420) * 1.2} />
          </Animated.View>
          <Animated.View style={{ alignItems: 'center', opacity: bigAnim, transform: [{ scale: bigAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] }}>
            <Svg width={Math.min(W * 0.92, 380)} height={72} viewBox="0 0 380 72">
              <SvgText x={190} y={56} fontSize={50} fontWeight="900" fontStyle="italic" fill="#FFFFFF" stroke={NEON_PINK} strokeWidth={3} textAnchor="middle" letterSpacing={3}>
                {bigWin.label}
              </SvgText>
            </Svg>
            <Text style={styles.bigAmount}>₹{bigCount.toFixed(2)}</Text>
            <View style={styles.row}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={{ marginHorizontal: 2, transform: [{ rotate: `${(i - 1) * 10}deg` }, { translateY: i === 1 ? -6 : 0 }] }}>
                  <ReelArt s="RED7" size={64} />
                </View>
              ))}
            </View>
          </Animated.View>
        </Pressable>
      )}

      {panel && (
        <Pressable style={styles.scrim} onPress={() => setPanel(null)}>
          <Pressable style={[styles.sheet, { maxHeight: H * 0.84, width: Math.min(W - 24, 470) }]} onPress={() => {}}>
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
              <Pressable onPress={() => setPanel(null)} hitSlop={10} style={{ padding: 6 }} accessibilityLabel="Close">
                <MaterialCommunityIcons name="close" size={20} color={NEON_CYAN} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 14 }}>
              {panel === 'pay' ? <Paytable pays={linePays} special={special} bet={bet} config={config} /> : <History spins={history} />}
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

function PayLine({ symbols, label, pays, bet }: { symbols: Neon777Symbol[]; label?: string; pays: number; bet: number }) {
  return (
    <View style={styles.payRow}>
      <View style={[styles.row, { flex: 1.6, gap: 2 }]}>
        {symbols.map((s, i) => (
          <ReelArt key={i} s={s} size={30} />
        ))}
        {label ? <Text style={styles.payLabel}>{label}</Text> : null}
      </View>
      <Text style={styles.payMult}>{pays}x</Text>
      <Text style={styles.payCellText}>₹{round2(pays * bet)}</Text>
    </View>
  );
}

function Paytable({ pays, special, bet, config }: { pays: Neon777Config['linePays']; special: Neon777Special[]; bet: number; config: Neon777Config | null }) {
  return (
    <View>
      <Text style={styles.ruleHead}>Line pays at ₹{bet} bet</Text>
      <PayLine symbols={['RED7', 'RED7', 'RED7']} pays={pays.RED7} bet={bet} />
      <PayLine symbols={['BLUE7', 'BLUE7', 'BLUE7']} pays={pays.BLUE7} bet={bet} />
      <PayLine symbols={['RED7', 'BLUE7', 'RED7']} label="any mix" pays={pays.ANY7} bet={bet} />
      <PayLine symbols={['BAR3', 'BAR3', 'BAR3']} pays={pays.BAR3} bet={bet} />
      <PayLine symbols={['BAR2', 'BAR2', 'BAR2']} pays={pays.BAR2} bet={bet} />
      <PayLine symbols={['BAR1', 'BAR1', 'BAR1']} pays={pays.BAR1} bet={bet} />
      <PayLine symbols={['BAR1', 'BAR3', 'BAR2']} label="any mix" pays={pays.ANYBAR} bet={bet} />
      <Text style={styles.ruleLine}>Only the middle row (the red line) pays, reading all three reels.</Text>
      <Text style={styles.ruleHead}>Special Reel</Text>
      <Text style={styles.ruleLine}>It works only when the line wins:</Text>
      <View style={styles.specialGrid}>
        {special
          .filter((s) => s.kind !== 'NONE')
          .map((s, i) => (
            <View key={i} style={styles.specialItem}>
              <SpecialArt sp={s} size={44} />
              <Text style={styles.specialText}>{s.kind === 'MULT' ? `win × ${s.value}` : s.kind === 'BONUS' ? `+${s.value}x bet` : 'free respin'}</Text>
            </View>
          ))}
      </View>
      <Text style={styles.ruleLine}>
        RESPIN pays the win and spins every reel again for free. A respin can land another RESPIN, up to {config?.maxRespins ?? 5} in a row.
      </Text>
      <Text style={styles.ruleHead}>Game info</Text>
      <Text style={styles.ruleLine}>
        Return to player {config?.rtpPercent ?? 89.6}% (exact, counted over every reel stop). {config?.hitRatePercent ?? 14.27}% of spins win. Bet ₹{config?.minStake ?? 1} – ₹{config?.maxStake ?? 500}. Max win per spin ₹{config?.maxPayout ?? 10000}.
      </Text>
      <Text style={styles.ruleLine}>Tap SPIN during a spin to stop the reels at once. Every spin is drawn from your provably-fair seeds (Settings → Provably Fair).</Text>
    </View>
  );
}

function History({ spins }: { spins: Neon777SpinRow[] | null }) {
  if (spins === null) return <Text style={styles.muted}>Loading…</Text>;
  if (spins.length === 0) return <Text style={styles.muted}>No spins yet.</Text>;
  return (
    <View style={{ gap: 8 }}>
      {spins.map((s) => {
        const payout = Number(s.payout);
        const d = new Date(s.createdAt);
        return (
          <View key={s.id} style={styles.histRow}>
            <ReelArt s={payout > 0 ? 'RED7' : 'BAR1'} size={30} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.histMain}>
                Bet ₹{Number(s.stake).toFixed(2)}
                {s.respins > 0 ? ` · ${s.respins} respin${s.respins === 1 ? '' : 's'}` : ''}
              </Text>
              <Text style={styles.histSub}>
                {d.toLocaleDateString()} {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            <Text style={[styles.histPay, { color: payout > 0 ? '#3CFFA0' : 'rgba(230,233,240,0.45)' }]}>{payout > 0 ? `+₹${payout.toFixed(2)}` : '—'}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07010F' },
  row: { flexDirection: 'row', alignItems: 'center' },
  dim: { opacity: 0.4 },

  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 6, zIndex: 2 },
  headBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(20,4,34,0.9)', borderWidth: 1.2, borderColor: 'rgba(34,229,255,0.55)' },
  headBalance: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: 'rgba(20,4,34,0.92)', borderWidth: 1.2, borderColor: NEON_CYAN },
  headBalanceText: { color: NEON_CYAN, fontWeight: '900', fontSize: 14 },

  reelWindow: { borderRadius: 8, overflow: 'hidden', borderWidth: 2, borderColor: '#9AA0AE' },
  specialWindow: { borderRadius: 8, overflow: 'hidden', borderWidth: 2, borderColor: NEON_PINK },
  specialLabel: { position: 'absolute', textAlign: 'center', color: NEON_PINK, fontWeight: '900', fontSize: 9.5, letterSpacing: 2 },
  lineGlow: { position: 'absolute', borderRadius: 6, borderWidth: 2.5, borderColor: GOLD, backgroundColor: 'rgba(255,209,102,0.12)' },
  respinTag: { position: 'absolute', bottom: -13, alignSelf: 'center', paddingHorizontal: 14, height: 26, borderRadius: 13, justifyContent: 'center', backgroundColor: '#0B3D2A', borderWidth: 1.5, borderColor: '#3CFFA0' },
  respinText: { color: '#3CFFA0', fontWeight: '900', fontSize: 12, letterSpacing: 2 },
  pop: { position: 'absolute', alignSelf: 'center', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(18,0,31,0.92)', borderWidth: 2, borderColor: GOLD, maxWidth: '94%' },
  popText: { color: GOLD, fontSize: 28, fontWeight: '900' },
  popSub: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', textAlign: 'center' },

  winStrip: { position: 'absolute', flexDirection: 'row', height: 54, borderRadius: 14, backgroundColor: 'rgba(20,4,34,0.92)', borderWidth: 1.5, borderColor: 'rgba(255,45,149,0.6)', overflow: 'hidden' },
  stripCell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stripWin: { flex: 1.7, borderLeftWidth: 1, borderRightWidth: 1, borderColor: 'rgba(255,45,149,0.3)' },
  stripLabel: { color: 'rgba(230,233,240,0.6)', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  stripValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', marginTop: 1 },
  stripWinValue: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', marginTop: 1 },

  controls: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  betBox: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6, borderRadius: 16, backgroundColor: 'rgba(20,4,34,0.92)', borderWidth: 1.5, borderColor: 'rgba(34,229,255,0.55)' },
  betBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: NEON_CYAN },
  betValueBox: { alignItems: 'center', minWidth: 58 },
  betLabel: { color: 'rgba(230,233,240,0.6)', fontSize: 8.5, fontWeight: '800', letterSpacing: 1 },
  betValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  spinBtn: { width: 92, height: 92, borderRadius: 46, padding: 4, backgroundColor: CHROME, elevation: 10, shadowColor: NEON_PINK, shadowOpacity: 0.9, shadowRadius: 16, shadowOffset: { width: 0, height: 0 } },
  spinInner: { flex: 1, borderRadius: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFD1E8' },
  spinAutoText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14, marginTop: -2 },
  sideBtns: { gap: 8 },
  sideBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 84, height: 34, borderRadius: 12, justifyContent: 'center', backgroundColor: 'rgba(20,4,34,0.92)', borderWidth: 1.5, borderColor: 'rgba(34,229,255,0.55)' },
  sideBtnOn: { backgroundColor: NEON_CYAN, borderColor: '#FFFFFF' },
  sideBtnText: { color: NEON_CYAN, fontWeight: '900', fontSize: 11, letterSpacing: 1 },

  autoPop: { position: 'absolute', padding: 12, borderRadius: 14, backgroundColor: '#1A0630', borderWidth: 1.5, borderColor: NEON_CYAN },
  autoPopTitle: { color: NEON_CYAN, fontWeight: '900', fontSize: 11, letterSpacing: 2, textAlign: 'center', marginBottom: 8 },
  autoGrid: { flexDirection: 'row', gap: 8 },
  autoOpt: { width: 46, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(34,229,255,0.12)', borderWidth: 1, borderColor: 'rgba(34,229,255,0.5)' },
  autoOptText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },

  bannerWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  bannerCard: { paddingHorizontal: 28, paddingVertical: 16, borderRadius: 18, borderWidth: 2, borderColor: NEON_PINK, backgroundColor: '#1A0630', alignItems: 'center', minWidth: 240 },
  bannerTitle: { color: '#FFFFFF', fontSize: 32, fontWeight: '900', fontStyle: 'italic', letterSpacing: 2, textShadowColor: NEON_PINK, textShadowRadius: 12 },
  bannerSub: { color: NEON_CYAN, fontSize: 14, fontWeight: '900', letterSpacing: 1.5, marginTop: 4 },

  bigWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5,0,12,0.75)', alignItems: 'center', justifyContent: 'center' },
  bigAmount: { color: '#FFFFFF', fontSize: 38, fontWeight: '900', marginVertical: 10, textShadowColor: NEON_PINK, textShadowRadius: 12 },

  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  sheet: { borderRadius: 18, backgroundColor: '#12031F', borderWidth: 1.5, borderColor: NEON_PINK, overflow: 'hidden' },
  tabs: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,45,149,0.3)' },
  tab: { paddingHorizontal: 12, paddingVertical: 7, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  tabOn: { backgroundColor: 'rgba(255,45,149,0.14)', borderBottomWidth: 2, borderBottomColor: NEON_PINK },
  tabText: { color: 'rgba(230,233,240,0.55)', fontWeight: '900', fontSize: 12, letterSpacing: 1.2 },
  tabTextOn: { color: NEON_PINK },
  ruleHead: { color: NEON_CYAN, fontWeight: '900', fontSize: 13, letterSpacing: 1, marginTop: 12, marginBottom: 6 },
  ruleLine: { color: 'rgba(240,236,250,0.86)', fontSize: 12.5, lineHeight: 19, fontWeight: '600', marginTop: 4 },
  payRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,45,149,0.25)' },
  payLabel: { color: 'rgba(230,233,240,0.6)', fontSize: 10.5, fontWeight: '800', marginLeft: 4 },
  payMult: { flex: 0.6, color: '#FFFFFF', fontWeight: '900', fontSize: 13, textAlign: 'center' },
  payCellText: { flex: 0.8, color: GOLD, fontWeight: '900', fontSize: 13, textAlign: 'right' },
  specialGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  specialItem: { width: 96, alignItems: 'center', paddingVertical: 6, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,45,149,0.25)' },
  specialText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', marginTop: 2 },
  muted: { color: 'rgba(230,233,240,0.6)', textAlign: 'center', marginTop: 20, fontWeight: '700' },
  histRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,45,149,0.2)' },
  histMain: { color: '#FFFFFF', fontWeight: '800', fontSize: 12.5 },
  histSub: { color: 'rgba(230,233,240,0.55)', fontWeight: '600', fontSize: 11, marginTop: 2 },
  histPay: { fontWeight: '900', fontSize: 13 },

  plaque: { position: 'absolute', borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(34,229,255,0.45)', backgroundColor: 'rgba(34,229,255,0.06)', justifyContent: 'space-evenly', paddingHorizontal: 8 },
  plaqueRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  plaqueItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  plaqueAny: { color: 'rgba(230,233,240,0.75)', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  plaqueVal: { color: GOLD, fontSize: 13, fontWeight: '900' },

  toast: { position: 'absolute', alignSelf: 'center', top: '45%', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.88)', borderWidth: 1, borderColor: NEON_PINK },
  toastText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
