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
import { MoneyComingConfig, MoneyComingOutcome, MoneyComingSpecial, MoneyComingSpinRow, fetchMoneyComingConfig, fetchMoneyComingHistory, spinMoneyComing } from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const ACCENT = '#22C55E';
const ACCENT2 = '#FFD24A';
const CHROME = '#F7E7B0';
const GOLD = '#FFD166';
const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const DEFAULT_BET = 10;
const AUTO_OPTIONS = [10, 25, 50, 100];
const SOUND_KEY = 'novaplay:moneycoming:sound';
const TOAST_MS = 1800;

// Fallbacks so the reels can draw before the config arrives; the server's config (the same strips) replaces them.
const unpack = (s: string) => s.split(',');
const FALLBACK_STRIPS: string[][] = [
  unpack(',1,,1,,1,,,1,,1,,1,,,1,,1,,1,,,1,,1,,1,,1,5,,1,,1,,1,,,1,,1,,1,,,1,,1,,1,,10,1,,1,,1,,1,5'),
  unpack(',,,,0,,,,,0,,,,,0,,,,,0,,,,,0,,,,,0,,,,,0,,,,,0,,,,,00,0,,,,0,,,,,0,,,,,0'),
  unpack(',,0,,,,,,,,,,0,,,,,,,,,,0,,,,,,,,,,0,,,,,,,'),
];
const FALLBACK_SPECIAL: MoneyComingSpecial[] = [
  { kind: 'NONE', value: 0, chancePercent: 74.07 },
  { kind: 'MULT', value: 2, chancePercent: 11.11 },
  { kind: 'MULT', value: 5, chancePercent: 3.7 },
  { kind: 'MULT', value: 10, chancePercent: 0.93 },
  { kind: 'WHEEL', value: 0, chancePercent: 3.7 },
  { kind: 'RESPIN', value: 0, chancePercent: 6.48 },
];
const FALLBACK_WHEEL = [2, 5, 3, 2, 8, 3, 2, 5, 10, 3, 2, 5, 3, 20, 2, 5, 3, 2, 10, 8];
/** Example lines for the paytable, top first: [reel 1, reel 2, reel 3]. */
const PAY_EXAMPLES: string[][] = [
  ['10', '00', '0'],
  ['5', '00', '0'],
  ['1', '00', '0'],
  ['10', '00', ''],
  ['5', '00', ''],
  ['5', '0', '0'],
  ['1', '00', ''],
  ['10', '0', ''],
  ['5', '0', ''],
  ['1', '0', ''],
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** The number a line reads (blanks skipped, at least two symbols) and what it pays in bets. */
function readLine(line: string[]): { reads: number; pays: number } {
  const shown = line.filter((s) => s !== '');
  if (shown.length < 2) return { reads: 0, pays: 0 };
  const reads = Number(shown.join(''));
  return { reads, pays: reads / 10 };
}

const wrap = (s: unknown[], i: number) => ((i % s.length) + s.length) % s.length;

// ---------- symbol art ----------

/** A gold embossed number on the cream reel. */
export const ReelArt = memo(function ReelArt({ s, size }: { s: string; size: number }) {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  if (s === '') return <View style={{ width: size, height: size }} />;
  const fs = s.length >= 2 ? 62 : 84;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <SvgLinearGradient id={`mcGold${uid}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFF7C2" />
          <Stop offset="0.35" stopColor="#FFD34D" />
          <Stop offset="0.6" stopColor="#E59A0B" />
          <Stop offset="1" stopColor="#FFE07A" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`mcRed${uid}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FF7A6B" />
          <Stop offset="0.55" stopColor="#D61F1F" />
          <Stop offset="1" stopColor="#7C0A0A" />
        </SvgLinearGradient>
      </Defs>
      <SvgText x={53} y={50 + fs * 0.36 + 3} fontSize={fs} fontWeight="900" fill="#000" opacity={0.22} textAnchor="middle" letterSpacing={-2}>
        {s}
      </SvgText>
      <SvgText
        x={50}
        y={50 + fs * 0.36}
        fontSize={fs}
        fontWeight="900"
        fill={s === '0' || s === '00' ? `url(#mcGold${uid})` : `url(#mcRed${uid})`}
        stroke={s === '0' || s === '00' ? '#7A4A00' : GOLD}
        strokeWidth={3.5}
        textAnchor="middle"
        letterSpacing={-2}
      >
        {s}
      </SvgText>
    </Svg>
  );
});

export const SpecialArt = memo(function SpecialArt({ sp, size, dim }: { sp: MoneyComingSpecial; size: number; dim?: boolean }) {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  let body: React.ReactNode;
  if (sp.kind === 'MULT') {
    body = (
      <G>
        <Circle cx={50} cy={50} r={40} fill={`url(#mcMult${uid})`} stroke={GOLD} strokeWidth={5} />
        <SvgText x={50} y={sp.value >= 10 ? 62 : 64} fontSize={sp.value >= 10 ? 34 : 40} fontWeight="900" fill="#FFFFFF" stroke="#7C0A0A" strokeWidth={1.5} textAnchor="middle">
          {`x${sp.value}`}
        </SvgText>
      </G>
    );
  } else if (sp.kind === 'WHEEL') {
    const colors = ['#E11D48', '#F59E0B', '#22C55E', '#3B82F6', '#A855F7', '#F97316', '#14B8A6', '#EAB308'];
    body = (
      <G>
        <Circle cx={50} cy={50} r={41} fill={GOLD} />
        {colors.map((c, i) => {
          const a0 = ((i * 45 - 90) * Math.PI) / 180;
          const a1 = (((i + 1) * 45 - 90) * Math.PI) / 180;
          return <Path key={i} d={`M 50 50 L ${50 + 37 * Math.cos(a0)} ${50 + 37 * Math.sin(a0)} A 37 37 0 0 1 ${50 + 37 * Math.cos(a1)} ${50 + 37 * Math.sin(a1)} Z`} fill={c} />;
        })}
        <Circle cx={50} cy={50} r={17} fill="#7A0A0A" stroke={GOLD} strokeWidth={3} />
        <SvgText x={50} y={54} fontSize={10} fontWeight="900" fill="#FFFFFF" textAnchor="middle">
          LUCKY
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
      <G opacity={0.32}>
        <Circle cx={50} cy={50} r={30} fill="none" stroke={GOLD} strokeWidth={3} />
        <SvgText x={50} y={63} fontSize={36} fontWeight="900" fill={GOLD} textAnchor="middle">
          ₹
        </SvgText>
      </G>
    );
  }
  return (
    <View style={{ opacity: dim ? 0.45 : 1 }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={`mcMult${uid}`} cx="40%" cy="35%" r="70%">
            <Stop offset="0" stopColor="#FF7A6B" />
            <Stop offset="0.6" stopColor="#D61F1F" />
            <Stop offset="1" stopColor="#6E0808" />
          </RadialGradient>
        </Defs>
        {body}
      </Svg>
    </View>
  );
});

/** The Lucky Wheel: 20 equal segments, labelled with their multipliers, segment 0 at the top. */
const LuckyWheel = memo(function LuckyWheel({ size, segments }: { size: number; segments: number[] }) {
  const c = size / 2;
  const r = c - 8;
  const n = segments.length;
  const colorOf = (m: number) => (m >= 20 ? '#E11D48' : m >= 10 ? '#A855F7' : m >= 8 ? '#3B82F6' : m >= 5 ? '#16A34A' : m >= 3 ? '#F59E0B' : '#0F766E');
  return (
    <Svg width={size} height={size}>
      <Circle cx={c} cy={c} r={c - 1} fill={GOLD} />
      <Circle cx={c} cy={c} r={c - 5} fill="#7A4A00" />
      {segments.map((m, i) => {
        const a0 = ((i - 0.5) * (360 / n) - 90) * (Math.PI / 180);
        const a1 = ((i + 0.5) * (360 / n) - 90) * (Math.PI / 180);
        const am = (i * (360 / n) - 90) * (Math.PI / 180);
        const tx = c + r * 0.72 * Math.cos(am);
        const ty = c + r * 0.72 * Math.sin(am);
        return (
          <G key={i}>
            <Path d={`M ${c} ${c} L ${c + r * Math.cos(a0)} ${c + r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${c + r * Math.cos(a1)} ${c + r * Math.sin(a1)} Z`} fill={colorOf(m)} stroke={GOLD} strokeWidth={1.5} />
            <SvgText x={tx} y={ty + 5} fontSize={size * 0.05} fontWeight="900" fill="#FFFFFF" textAnchor="middle" transform={`rotate(${i * (360 / n)} ${tx} ${ty})`}>
              {`x${m}`}
            </SvgText>
          </G>
        );
      })}
      {Array.from({ length: n }, (_, i) => {
        const a = ((i + 0.5) * (360 / n) - 90) * (Math.PI / 180);
        return <Circle key={i} cx={c + (c - 4.5) * Math.cos(a)} cy={c + (c - 4.5) * Math.sin(a)} r={2.2} fill="#FFF7C2" />;
      })}
      <Circle cx={c} cy={c} r={size * 0.12} fill="#7A0A0A" stroke={GOLD} strokeWidth={4} />
      <SvgText x={c} y={c + size * 0.025} fontSize={size * 0.065} fontWeight="900" fill={GOLD} textAnchor="middle">
        LUCKY
      </SvgText>
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
  // Scattered coins and notes, fixed so they don't move between renders.
  const bits = useMemo(() => {
    let x = 17;
    const rnd = () => {
      x = (x * 9301 + 49297) % 233280;
      return x / 233280;
    };
    return Array.from({ length: 22 }, () => ({ x: rnd() * w, y: rnd() * h, r: 6 + rnd() * 10, note: rnd() < 0.35, a: rnd() * 60 - 30, o: 0.08 + rnd() * 0.12 }));
  }, [w, h]);
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id="mcBg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#0B3D24" />
          <Stop offset="0.55" stopColor="#062616" />
          <Stop offset="1" stopColor="#02120A" />
        </SvgLinearGradient>
        <RadialGradient id="mcGlow" cx="50%" cy="38%" r="55%">
          <Stop offset="0" stopColor="#FFD24A" stopOpacity={0.22} />
          <Stop offset="1" stopColor="#FFD24A" stopOpacity={0} />
        </RadialGradient>
        <Pattern id="mcDiag" width={22} height={22} patternUnits="userSpaceOnUse">
          <Path d="M0 22 L 22 0" stroke="#FFD24A" strokeOpacity={0.05} strokeWidth={1} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill="url(#mcBg)" />
      <Rect x={0} y={0} width={w} height={h} fill="url(#mcDiag)" />
      <Rect x={0} y={0} width={w} height={h} fill="url(#mcGlow)" />
      {bits.map((b, i) =>
        b.note ? (
          <Rect key={i} x={b.x - b.r * 1.6} y={b.y - b.r * 0.8} width={b.r * 3.2} height={b.r * 1.6} rx={2} fill="#7CE3A0" opacity={b.o} transform={`rotate(${b.a} ${b.x} ${b.y})`} />
        ) : (
          <Circle key={i} cx={b.x} cy={b.y} r={b.r} fill="#FFD24A" opacity={b.o} />
        )
      )}
    </Svg>
  );
}

function Logo({ width }: { width: number }) {
  return (
    <Svg width={width} height={width * 0.26} viewBox="0 0 340 88">
      <Defs>
        <SvgLinearGradient id="mcLogo" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFF7C2" />
          <Stop offset="0.45" stopColor="#FFD34D" />
          <Stop offset="0.7" stopColor="#D98A06" />
          <Stop offset="1" stopColor="#FFE58A" />
        </SvgLinearGradient>
      </Defs>
      <SvgText x={172} y={64} fontSize={40} fontWeight="900" fill="#000" opacity={0.35} textAnchor="middle" letterSpacing={1}>
        MONEY COMING
      </SvgText>
      <SvgText x={170} y={60} fontSize={40} fontWeight="900" fill="url(#mcLogo)" stroke="#6B3A00" strokeWidth={2} textAnchor="middle" letterSpacing={1}>
        MONEY COMING
      </SvgText>
      <SvgText x={170} y={82} fontSize={10} fontWeight="900" fill="#7CE3A0" textAnchor="middle" letterSpacing={2.5}>
        NUMBERS · SPECIAL REEL · LUCKY WHEEL
      </SvgText>
    </Svg>
  );
}

function Rays({ size }: { size: number }) {
  const c = size / 2;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id="mcRay" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFF7C2" stopOpacity={0.6} />
          <Stop offset="1" stopColor={ACCENT2} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={c} cy={c} r={c * 0.45} fill="url(#mcRay)" />
      {Array.from({ length: 16 }, (_, i) => {
        const a0 = ((i * 22.5 - 5) * Math.PI) / 180;
        const a1 = ((i * 22.5 + 5) * Math.PI) / 180;
        return <Path key={i} d={`M ${c} ${c} L ${c + c * Math.cos(a0)} ${c + c * Math.sin(a0)} L ${c + c * Math.cos(a1)} ${c + c * Math.sin(a1)} Z`} fill="url(#mcRay)" />;
      })}
    </Svg>
  );
}

/** Home tile art: 10 | 00 | 0 on a gold-framed line over green, with coins. */
export function MoneyComingTileArt({ size }: { size: number }) {
  const s = size * 0.3;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size }} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="mctBg" cx="50%" cy="40%" r="70%">
            <Stop offset="0" stopColor="#167A45" />
            <Stop offset="1" stopColor="#03180C" />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill="url(#mctBg)" />
        <Circle cx={12} cy={12} r={7} fill="#FFD24A" opacity={0.55} />
        <Circle cx={90} cy={16} r={5} fill="#FFD24A" opacity={0.45} />
        <Circle cx={86} cy={70} r={6} fill="#FFD24A" opacity={0.35} />
        <Rect x={8} y={20} width={84} height={40} rx={8} fill="#FFF8E6" stroke="#FFD24A" strokeWidth={2.5} />
        <Rect x={8} y={39} width={84} height={2} fill="#D61F1F" opacity={0.6} />
      </Svg>
      {['10', '00', '0'].map((t, i) => (
        <View key={i} style={{ position: 'absolute', left: size * (0.08 + i * 0.28), top: size * 0.25 }}>
          <ReelArt s={t} size={s} />
        </View>
      ))}
    </View>
  );
}

// ---------- screen ----------

type Banner = { title: string; sub: string };
type BigWin = { label: string; amount: number };
type Pop = { text: string; sub?: string; key: number };

const START_ROWS: string[][] = [
  ['', '10', '1'],
  ['0', '00', ''],
  ['', '0', ''],
];

export default function MoneyComingScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<MoneyComingConfig | null>(null);
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
  const [history, setHistory] = useState<MoneyComingSpinRow[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [bulbPhase, setBulbPhase] = useState(0);
  const [wheelShow, setWheelShow] = useState<{ index: number; done: boolean } | null>(null);

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
  const wheelSpin = useRef(new Animated.Value(0)).current;
  const reels = [useRef<ReelHandle<string>>(null), useRef<ReelHandle<string>>(null), useRef<ReelHandle<string>>(null)];
  const specialReel = useRef<ReelHandle<number>>(null);
  const rowsRef = useRef<string[][]>(START_ROWS);
  const specialRowsRef = useRef<number[]>([2, 1, 4]);

  const strips = config?.strips ?? FALLBACK_STRIPS;
  const special = config?.special ?? FALLBACK_SPECIAL;
  const wheelSegments = config?.wheel ?? FALLBACK_WHEEL;
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
    fetchMoneyComingConfig()
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

    let result: { spin: MoneyComingSpinRow; outcome: MoneyComingOutcome };
    try {
      result = await spinMoneyComing(stake);
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
        if (sp.kind === 'WHEEL' && round.wheel !== null) {
          // The Lucky Wheel spins and stops with its segment under the pointer.
          setWheelShow({ index: round.wheel, done: false });
          wheelSpin.setValue(0);
          const n = wheelSegments.length;
          await new Promise<void>((r) =>
            Animated.timing(wheelSpin, { toValue: 5 * 360 - (round.wheel! * 360) / n, duration: turboRef.current || hurryRef.current ? 1100 : 2600, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => r())
          );
          if (!mountedRef.current) return;
          setWheelShow({ index: round.wheel, done: true });
          play('win');
          await wait(1000);
          if (!mountedRef.current) return;
          setWheelShow(null);
        }
        const applies = sp.kind !== 'NONE';
        setSpecialLit(applies);
        play('win');
        total = round2(total + stake * round.win);
        setWinTotal(total);
        const base = `Line reads ${round.reads} = ${round.linePays}x`;
        const sub =
          sp.kind === 'MULT'
            ? `${base} × ${sp.value} = ${round.win}x`
            : sp.kind === 'WHEEL' && round.wheel !== null
              ? `${base} × Lucky Wheel ${wheelSegments[round.wheel]} = ${round.win}x`
              : sp.kind === 'RESPIN'
                ? `${base} · RESPIN!`
                : base;
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
  }, [bigAnim, config?.maxRespins, play, refreshWallet, showBanner, showPop, showToast, special, specialFiller, strips, wait, wheelSegments, wheelSpin]);

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
      fetchMoneyComingHistory(30)
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
          <MaterialCommunityIcons name="chevron-left" size={26} color={ACCENT2} />
        </Pressable>
        <View style={styles.headBalance}>
          <MaterialCommunityIcons name="wallet" size={16} color={ACCENT2} />
          <Text style={styles.headBalanceText} numberOfLines={1}>
            ₹{shownBalance.toFixed(2)}
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        <Pressable onPress={toggleSound} style={styles.headBtn} hitSlop={6} accessibilityLabel="Sound">
          <MaterialCommunityIcons name={soundOn ? 'volume-high' : 'volume-off'} size={20} color={ACCENT2} />
        </Pressable>
        <Pressable onPress={() => openPanel('history')} style={styles.headBtn} hitSlop={6} accessibilityLabel="My history">
          <MaterialCommunityIcons name="history" size={20} color={ACCENT2} />
        </Pressable>
        <Pressable onPress={() => openPanel('pay')} style={styles.headBtn} hitSlop={6} accessibilityLabel="Paytable">
          <MaterialCommunityIcons name="information-variant" size={22} color={ACCENT2} />
        </Pressable>
      </View>

      <View style={{ position: 'absolute', top: logoTop, left: (W - logoW) / 2 }} pointerEvents="none">
        <Logo width={logoW} />
      </View>

      {/* Cabinet */}
      <View style={{ position: 'absolute', top: cabTop, left: cabLeft, width: cabW, height: cabH }}>
        <Svg width={cabW} height={cabH} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <SvgLinearGradient id="mcChrome" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FFF7C2" />
              <Stop offset="0.25" stopColor="#C8901A" />
              <Stop offset="0.5" stopColor="#FFE58A" />
              <Stop offset="0.75" stopColor="#9A6408" />
              <Stop offset="1" stopColor="#F2C94C" />
            </SvgLinearGradient>
          </Defs>
          <Rect x={0} y={0} width={cabW} height={cabH} rx={20} fill="url(#mcChrome)" />
          <Rect x={frame - 4} y={frame - 4} width={cabW - (frame - 4) * 2} height={cabH - (frame - 4) * 2} rx={14} fill="#06301B" stroke={ACCENT} strokeWidth={2} />
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
              <Reel<string> ref={reels[i]} initial={START_ROWS[i]} filler={fillers[i]} cell={cell} width={reelW} render={(s) => <ReelArt s={s} size={cell * 0.86} />} onStop={() => play('tick')} />
            </View>
          ))}
          <View style={[styles.specialWindow, specialLit && { borderColor: GOLD }]}>
            <LinearGradient colors={['#03180C', '#0D4A2A', '#03180C']} style={StyleSheet.absoluteFill} />
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
          <Text style={styles.stripValue}>1000x</Text>
        </View>
      </View>

      {/* Pay glass, when there is room for it */}
      {showPlaque && (
        <View style={[styles.plaque, { top: plaqueTop, left: cabLeft, width: cabW, height: Math.min(96, controlsTop - plaqueTop - 10) }]} pointerEvents="none">
          {[
            [['10', '00', '0'], ['5', '00', '0'], ['1', '00', '0']],
            [['5', '00', ''], ['1', '00', ''], ['5', '0', ''], ['1', '0', '']],
          ].map((row, r) => (
            <View key={r} style={styles.plaqueRow}>
              {row.map((line) => (
                <View key={line.join('|')} style={styles.plaqueItem}>
                  <Text style={styles.plaqueAny}>{line.filter(Boolean).join(' · ')}</Text>
                  <Text style={styles.plaqueVal}>{readLine(line).pays}x</Text>
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
          <LinearGradient colors={autoLeft > 0 ? ['#FF7A8A', '#B3102F'] : ['#7CF0A8', ACCENT, '#0E7A3A']} style={styles.spinInner}>
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
            <MaterialCommunityIcons name="autorenew" size={16} color={autoLeft > 0 ? '#062616' : ACCENT2} />
            <Text style={[styles.sideBtnText, autoLeft > 0 && { color: '#062616' }]}>AUTO</Text>
          </Pressable>
          <Pressable onPress={() => setTurbo((t) => !t)} style={[styles.sideBtn, turbo && styles.sideBtnOn]} accessibilityLabel="Turbo">
            <MaterialCommunityIcons name="lightning-bolt" size={16} color={turbo ? '#062616' : ACCENT2} />
            <Text style={[styles.sideBtnText, turbo && { color: '#062616' }]}>TURBO</Text>
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
              <SvgText x={190} y={56} fontSize={50} fontWeight="900" fontStyle="italic" fill="#FFFFFF" stroke={ACCENT} strokeWidth={3} textAnchor="middle" letterSpacing={3}>
                {bigWin.label}
              </SvgText>
            </Svg>
            <Text style={styles.bigAmount}>₹{bigCount.toFixed(2)}</Text>
            <View style={styles.row}>
              {['10', '00', '0'].map((t, i) => (
                <View key={i} style={{ marginHorizontal: 2, transform: [{ rotate: `${(i - 1) * 10}deg` }, { translateY: i === 1 ? -6 : 0 }] }}>
                  <ReelArt s={t} size={64} />
                </View>
              ))}
            </View>
          </Animated.View>
        </Pressable>
      )}

      {wheelShow && (
        <View pointerEvents="none" style={styles.wheelWrap}>
          <Text style={styles.wheelTitle}>LUCKY WHEEL</Text>
          <View style={{ width: Math.min(W * 0.8, 320), height: Math.min(W * 0.8, 320) }}>
            <Animated.View style={{ transform: [{ rotate: wheelSpin.interpolate({ inputRange: [0, 3600], outputRange: ['0deg', '3600deg'] }) }] }}>
              <LuckyWheel size={Math.min(W * 0.8, 320)} segments={wheelSegments} />
            </Animated.View>
            <View style={styles.wheelPointer}>
              <Svg width={30} height={34}>
                <Path d="M 15 34 L 2 4 Q 15 -2 28 4 Z" fill="#D61F1F" stroke={GOLD} strokeWidth={2.5} />
              </Svg>
            </View>
          </View>
          <Text style={[styles.wheelResult, { opacity: wheelShow.done ? 1 : 0 }]}>WIN × {wheelSegments[wheelShow.index]}</Text>
        </View>
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
                <MaterialCommunityIcons name="close" size={20} color={ACCENT2} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 14 }}>
              {panel === 'pay' ? <Paytable special={special} wheel={wheelSegments} bet={bet} config={config} /> : <History spins={history} />}
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

function PayLine({ line, bet }: { line: string[]; bet: number }) {
  const { reads, pays } = readLine(line);
  return (
    <View style={styles.payRow}>
      <View style={[styles.row, { flex: 1.6, gap: 2 }]}>
        {line.map((s, i) => (
          <View key={i} style={styles.payCell}>
            <ReelArt s={s} size={28} />
          </View>
        ))}
        <Text style={styles.payLabel}>{reads}</Text>
      </View>
      <Text style={styles.payMult}>{pays}x</Text>
      <Text style={styles.payCellText}>₹{round2(pays * bet)}</Text>
    </View>
  );
}

function Paytable({ special, wheel, bet, config }: { special: MoneyComingSpecial[]; wheel: number[]; bet: number; config: MoneyComingConfig | null }) {
  const wheelCounts = wheel.reduce<Record<number, number>>((m, x) => ({ ...m, [x]: (m[x] ?? 0) + 1 }), {});
  return (
    <View>
      <Text style={styles.ruleHead}>How it pays</Text>
      <Text style={styles.ruleLine}>
        Reel 1 shows 1, 5 or 10, reel 2 shows 0 or 00, reel 3 shows 0 (or blank). The middle row is read left to right as one number, blanks skipped, and pays that number ÷ 10 times your bet. At least two numbers must land.
      </Text>
      <Text style={styles.ruleHead}>Line pays at ₹{bet} bet</Text>
      {PAY_EXAMPLES.map((line) => (
        <PayLine key={line.join('|')} line={line} bet={bet} />
      ))}
      <Text style={styles.ruleLine}>Other lines that read the same number pay the same: 1 · 0 · 0 reads 100 like 1 · 00, and 10 · 0 does too.</Text>
      <Text style={styles.ruleHead}>Special Reel</Text>
      <Text style={styles.ruleLine}>It works only when the line wins:</Text>
      <View style={styles.specialGrid}>
        {special
          .filter((s) => s.kind !== 'NONE')
          .map((s, i) => (
            <View key={i} style={styles.specialItem}>
              <SpecialArt sp={s} size={44} />
              <Text style={styles.specialText}>{s.kind === 'MULT' ? `win × ${s.value}` : s.kind === 'WHEEL' ? 'Lucky Wheel' : 'free respin'}</Text>
            </View>
          ))}
      </View>
      <Text style={styles.ruleLine}>
        LUCKY WHEEL spins a wheel of {wheel.length} equal segments and multiplies the win by the one it stops on:{' '}
        {Object.keys(wheelCounts)
          .map(Number)
          .sort((x, y) => x - y)
          .map((m) => `x${m} (${wheelCounts[m]} of ${wheel.length})`)
          .join(', ')}
        .
      </Text>
      <Text style={styles.ruleLine}>
        RESPIN pays the win and spins every reel again for free. A respin can land another RESPIN, up to {config?.maxRespins ?? 5} in a row.
      </Text>
      <Text style={styles.ruleHead}>Game info</Text>
      <Text style={styles.ruleLine}>
        Return to player {config?.rtpPercent ?? 89.73}% (exact, counted over every reel stop). {config?.hitRatePercent ?? 14.26}% of spins win. Bet ₹{config?.minStake ?? 1} – ₹{config?.maxStake ?? 500}. Max win per spin ₹{config?.maxPayout ?? 10000}.
      </Text>
      <Text style={styles.ruleLine}>Tap SPIN during a spin to stop the reels at once. Every spin is drawn from your provably-fair seeds (Settings → Provably Fair).</Text>
    </View>
  );
}

function History({ spins }: { spins: MoneyComingSpinRow[] | null }) {
  if (spins === null) return <Text style={styles.muted}>Loading…</Text>;
  if (spins.length === 0) return <Text style={styles.muted}>No spins yet.</Text>;
  return (
    <View style={{ gap: 8 }}>
      {spins.map((s) => {
        const payout = Number(s.payout);
        const d = new Date(s.createdAt);
        return (
          <View key={s.id} style={styles.histRow}>
            <ReelArt s={payout > 0 ? '10' : '0'} size={30} />
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
  root: { flex: 1, backgroundColor: '#03180C' },
  row: { flexDirection: 'row', alignItems: 'center' },
  dim: { opacity: 0.4 },

  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 6, zIndex: 2 },
  headBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(4,32,18,0.9)', borderWidth: 1.2, borderColor: 'rgba(255,210,74,0.55)' },
  headBalance: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: 'rgba(4,32,18,0.92)', borderWidth: 1.2, borderColor: ACCENT2 },
  headBalanceText: { color: ACCENT2, fontWeight: '900', fontSize: 14 },

  reelWindow: { borderRadius: 8, overflow: 'hidden', borderWidth: 2, borderColor: '#9AA0AE' },
  specialWindow: { borderRadius: 8, overflow: 'hidden', borderWidth: 2, borderColor: ACCENT },
  specialLabel: { position: 'absolute', textAlign: 'center', color: ACCENT, fontWeight: '900', fontSize: 9.5, letterSpacing: 2 },
  lineGlow: { position: 'absolute', borderRadius: 6, borderWidth: 2.5, borderColor: GOLD, backgroundColor: 'rgba(255,209,102,0.12)' },
  respinTag: { position: 'absolute', bottom: -13, alignSelf: 'center', paddingHorizontal: 14, height: 26, borderRadius: 13, justifyContent: 'center', backgroundColor: '#0B3D2A', borderWidth: 1.5, borderColor: '#3CFFA0' },
  respinText: { color: '#3CFFA0', fontWeight: '900', fontSize: 12, letterSpacing: 2 },
  pop: { position: 'absolute', alignSelf: 'center', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(3,28,15,0.94)', borderWidth: 2, borderColor: GOLD, maxWidth: '94%' },
  popText: { color: GOLD, fontSize: 28, fontWeight: '900' },
  popSub: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', textAlign: 'center' },

  winStrip: { position: 'absolute', flexDirection: 'row', height: 54, borderRadius: 14, backgroundColor: 'rgba(4,32,18,0.92)', borderWidth: 1.5, borderColor: 'rgba(34,197,94,0.6)', overflow: 'hidden' },
  stripCell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stripWin: { flex: 1.7, borderLeftWidth: 1, borderRightWidth: 1, borderColor: 'rgba(34,197,94,0.3)' },
  stripLabel: { color: 'rgba(230,233,240,0.6)', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  stripValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', marginTop: 1 },
  stripWinValue: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', marginTop: 1 },

  controls: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  betBox: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6, borderRadius: 16, backgroundColor: 'rgba(4,32,18,0.92)', borderWidth: 1.5, borderColor: 'rgba(255,210,74,0.55)' },
  betBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: ACCENT2 },
  betValueBox: { alignItems: 'center', minWidth: 58 },
  betLabel: { color: 'rgba(230,233,240,0.6)', fontSize: 8.5, fontWeight: '800', letterSpacing: 1 },
  betValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  spinBtn: { width: 92, height: 92, borderRadius: 46, padding: 4, backgroundColor: CHROME, elevation: 10, shadowColor: ACCENT, shadowOpacity: 0.9, shadowRadius: 16, shadowOffset: { width: 0, height: 0 } },
  spinInner: { flex: 1, borderRadius: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#D9FFE6' },
  spinAutoText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14, marginTop: -2 },
  sideBtns: { gap: 8 },
  sideBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 84, height: 34, borderRadius: 12, justifyContent: 'center', backgroundColor: 'rgba(4,32,18,0.92)', borderWidth: 1.5, borderColor: 'rgba(255,210,74,0.55)' },
  sideBtnOn: { backgroundColor: ACCENT2, borderColor: '#FFFFFF' },
  sideBtnText: { color: ACCENT2, fontWeight: '900', fontSize: 11, letterSpacing: 1 },

  autoPop: { position: 'absolute', padding: 12, borderRadius: 14, backgroundColor: '#073A21', borderWidth: 1.5, borderColor: ACCENT2 },
  autoPopTitle: { color: ACCENT2, fontWeight: '900', fontSize: 11, letterSpacing: 2, textAlign: 'center', marginBottom: 8 },
  autoGrid: { flexDirection: 'row', gap: 8 },
  autoOpt: { width: 46, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,210,74,0.12)', borderWidth: 1, borderColor: 'rgba(255,210,74,0.5)' },
  autoOptText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },

  bannerWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  bannerCard: { paddingHorizontal: 28, paddingVertical: 16, borderRadius: 18, borderWidth: 2, borderColor: ACCENT, backgroundColor: '#073A21', alignItems: 'center', minWidth: 240 },
  bannerTitle: { color: '#FFFFFF', fontSize: 32, fontWeight: '900', fontStyle: 'italic', letterSpacing: 2, textShadowColor: ACCENT, textShadowRadius: 12 },
  bannerSub: { color: ACCENT2, fontSize: 14, fontWeight: '900', letterSpacing: 1.5, marginTop: 4 },

  bigWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(2,14,8,0.78)', alignItems: 'center', justifyContent: 'center' },
  bigAmount: { color: '#FFFFFF', fontSize: 38, fontWeight: '900', marginVertical: 10, textShadowColor: ACCENT, textShadowRadius: 12 },

  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  sheet: { borderRadius: 18, backgroundColor: '#04261A', borderWidth: 1.5, borderColor: ACCENT, overflow: 'hidden' },
  tabs: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(34,197,94,0.3)' },
  tab: { paddingHorizontal: 12, paddingVertical: 7, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  tabOn: { backgroundColor: 'rgba(34,197,94,0.14)', borderBottomWidth: 2, borderBottomColor: ACCENT },
  tabText: { color: 'rgba(230,233,240,0.55)', fontWeight: '900', fontSize: 12, letterSpacing: 1.2 },
  tabTextOn: { color: ACCENT },
  ruleHead: { color: ACCENT2, fontWeight: '900', fontSize: 13, letterSpacing: 1, marginTop: 12, marginBottom: 6 },
  ruleLine: { color: 'rgba(240,236,250,0.86)', fontSize: 12.5, lineHeight: 19, fontWeight: '600', marginTop: 4 },
  payRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(34,197,94,0.25)' },
  payLabel: { color: 'rgba(230,233,240,0.6)', fontSize: 10.5, fontWeight: '800', marginLeft: 4 },
  payMult: { flex: 0.6, color: '#FFFFFF', fontWeight: '900', fontSize: 13, textAlign: 'center' },
  payCellText: { flex: 0.8, color: GOLD, fontWeight: '900', fontSize: 13, textAlign: 'right' },
  specialGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  specialItem: { width: 96, alignItems: 'center', paddingVertical: 6, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)' },
  specialText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', marginTop: 2 },
  muted: { color: 'rgba(230,233,240,0.6)', textAlign: 'center', marginTop: 20, fontWeight: '700' },
  histRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)' },
  histMain: { color: '#FFFFFF', fontWeight: '800', fontSize: 12.5 },
  histSub: { color: 'rgba(230,233,240,0.55)', fontWeight: '600', fontSize: 11, marginTop: 2 },
  histPay: { fontWeight: '900', fontSize: 13 },

  plaque: { position: 'absolute', borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(255,210,74,0.45)', backgroundColor: 'rgba(255,210,74,0.06)', justifyContent: 'space-evenly', paddingHorizontal: 8 },
  plaqueRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  plaqueItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  plaqueAny: { color: 'rgba(230,233,240,0.75)', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  plaqueVal: { color: GOLD, fontSize: 13, fontWeight: '900' },

  payCell: { width: 32, height: 32, borderRadius: 6, backgroundColor: '#FFF8E6', alignItems: 'center', justifyContent: 'center' },
  wheelWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(2,18,10,0.82)' },
  wheelTitle: { color: GOLD, fontSize: 30, fontWeight: '900', letterSpacing: 3, marginBottom: 14, textShadowColor: '#000', textShadowRadius: 8 },
  wheelPointer: { position: 'absolute', top: -14, left: 0, right: 0, alignItems: 'center' },
  wheelResult: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', marginTop: 16, textShadowColor: ACCENT, textShadowRadius: 12 },
  toast: { position: 'absolute', alignSelf: 'center', top: '45%', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.88)', borderWidth: 1, borderColor: ACCENT },
  toastText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
