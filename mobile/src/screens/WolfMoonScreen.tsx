import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { forwardRef, memo, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient as SvgLinearGradient, Path, Polygon, Polyline, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../api/client';
import { WolfCell, WolfConfig, WolfLineWin, WolfOutcome, WolfPayer, WolfSpinRow, WolfSym, fetchWolfConfig, fetchWolfHistory, spinWolf } from '../api/backend';
import { useGameState } from '../state/GameStateContext';
import GameInfoButton from '../components/GameInfoButton';

const SILVER = '#E8EEF8';
const MOONLIGHT = '#FFF6D8';
const GOLD = '#FFD66B';
const TURQ = '#3CD8C8';
const RUST = '#C8582A';
const NIGHT = '#0E0A2A';
const SERIF = 'serif';
const COLS = 5;
const ROWS = 3;
const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const DEFAULT_BET = 10;
const TOAST_MS = 1800;
/** UK rule: a paid spin may not resolve faster than this, press to result. */
const MIN_SPIN_MS = 2500;
const LINE_COLORS = ['#FFD66B', '#3CD8C8', '#FF7A5A', '#B88AFF', '#7CFF9A', '#FF9AE0', '#5AB8FF', '#FFB23F', '#E8EEF8', '#FF5A7A'];
const FILLER: WolfSym[] = ['BUFFALO', 'EAGLE', 'COUGAR', 'HORSE', 'ACE', 'KING', 'QUEEN', 'JACK', 'WILD', 'MOON'];
const NAME: Record<WolfPayer, string> = { BUFFALO: 'Buffalo', EAGLE: 'Eagle', COUGAR: 'Cougar', HORSE: 'Horse', ACE: 'A', KING: 'K', QUEEN: 'Q', JACK: 'J' };
const FALLBACK_JACKPOTS = { MINI: 20, MAJOR: 100, MEGA: 1000 };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

function money(n: number): string {
  return `₹${n.toFixed(2)}`;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const run = (a: Animated.CompositeAnimation) => new Promise<void>((r) => a.start(() => r()));

// ---------- symbol art (100 x 100) ----------

const LETTER: Partial<Record<WolfSym, [string, string, string]>> = {
  ACE: ['#FFD0B8', RUST, '#5A1A04'],
  KING: ['#C8FFF8', TURQ, '#0A4A44'],
  QUEEN: ['#E8D8FF', '#8A5AD8', '#2A0A5A'],
  JACK: ['#FFF4C0', '#D8A030', '#5A3A04'],
};

export const WolfArt = memo(function WolfArt({ s, v, j, size, bet }: { s: WolfSym; v?: number; j?: 'MINI' | 'MAJOR'; size: number; bet?: number }) {
  const u = `wm${s}${useId().replace(/:/g, '')}`;
  const letter = LETTER[s];
  let body: React.ReactNode = null;
  if (letter) {
    const txt = s === 'ACE' ? 'A' : s === 'KING' ? 'K' : s === 'QUEEN' ? 'Q' : 'J';
    body = (
      <G>
        <SvgText x={52} y={78} fontSize={72} fontWeight="900" fontFamily={SERIF} fill="#000" opacity={0.35} textAnchor="middle">
          {txt}
        </SvgText>
        <SvgText x={50} y={75} fontSize={72} fontWeight="900" fontFamily={SERIF} fill={`url(#${u}l)`} stroke={SILVER} strokeWidth={2} textAnchor="middle">
          {txt}
        </SvgText>
        {/* turquoise stud */}
        <Circle cx={82} cy={20} r={6} fill={TURQ} stroke={SILVER} strokeWidth={1.5} />
      </G>
    );
  } else if (s === 'BUFFALO') {
    body = (
      <G>
        <Path d="M14 30 C 6 22, 8 10, 18 8 C 16 16, 20 22, 28 26 Z M86 30 C 94 22, 92 10, 82 8 C 84 16, 80 22, 72 26 Z" fill="#EDE4D0" stroke="#5A4A30" strokeWidth={1.5} />
        <Path d="M22 28 C 26 14, 74 14, 78 28 C 86 34, 84 50, 76 56 C 74 74, 64 92, 50 92 C 36 92, 26 74, 24 56 C 16 50, 14 34, 22 28 Z" fill={`url(#${u}b)`} stroke="#1A0E04" strokeWidth={2} />
        <Path d="M26 26 C 34 14, 66 14, 74 26 C 64 36, 36 36, 26 26 Z" fill="#3A2210" />
        <Circle cx={36} cy={46} r={3.5} fill="#FFD66B" />
        <Circle cx={64} cy={46} r={3.5} fill="#FFD66B" />
        <Ellipse cx={50} cy={78} rx={13} ry={9} fill="#2A1608" />
        <Circle cx={45} cy={78} r={2.5} fill="#0A0402" />
        <Circle cx={55} cy={78} r={2.5} fill="#0A0402" />
      </G>
    );
  } else if (s === 'EAGLE') {
    body = (
      <G>
        <Path d="M20 92 C 18 60, 26 30, 50 16 C 66 8, 82 12, 88 24 C 90 30, 86 34, 80 34 L 92 44 C 84 48, 74 46, 70 42 C 70 60, 64 80, 56 92 Z" fill={`url(#${u}e)`} stroke="#2A1A0A" strokeWidth={1.8} />
        <Path d="M50 16 C 66 8, 82 12, 88 24 C 90 30, 86 34, 80 34 C 70 34, 58 30, 50 16 Z" fill="#FFFFFF" stroke="#6A6A72" strokeWidth={1} />
        <Path d="M80 34 L 96 40 C 92 48, 84 48, 78 42 Z" fill="#F0B81A" stroke="#7A4A04" strokeWidth={1.2} />
        <Circle cx={72} cy={24} r={3.2} fill="#1A0A04" />
        <Circle cx={73} cy={23} r={1} fill="#FFFFFF" />
        <Path d="M30 60 C 40 56, 50 58, 56 64 M28 74 C 38 70, 48 72, 54 78" stroke="#2A1A0A" strokeWidth={1.2} fill="none" opacity={0.6} />
      </G>
    );
  } else if (s === 'COUGAR') {
    body = (
      <G>
        <Path d="M22 22 L 30 8 L 40 22 Z M78 22 L 70 8 L 60 22 Z" fill="#C8884A" stroke="#4A2A0A" strokeWidth={1.5} />
        <Path d="M18 40 C 18 20, 82 20, 82 40 C 82 62, 70 86, 50 90 C 30 86, 18 62, 18 40 Z" fill={`url(#${u}c)`} stroke="#3A1A04" strokeWidth={2} />
        <Path d="M38 58 C 42 70, 58 70, 62 58 C 58 76, 42 76, 38 58 Z" fill="#F4E4C8" />
        <Ellipse cx={36} cy={44} rx={6} ry={4} fill="#E8E030" />
        <Ellipse cx={64} cy={44} rx={6} ry={4} fill="#E8E030" />
        <Ellipse cx={36} cy={44} rx={1.6} ry={3.6} fill="#1A0A04" />
        <Ellipse cx={64} cy={44} rx={1.6} ry={3.6} fill="#1A0A04" />
        <Path d="M45 58 L 55 58 L 50 64 Z" fill="#5A2A1A" />
      </G>
    );
  } else if (s === 'HORSE') {
    body = (
      <G>
        <Path d="M30 92 C 28 70, 30 50, 40 34 L 36 14 L 48 26 C 60 20, 74 24, 82 40 C 88 52, 90 62, 86 68 C 80 72, 72 68, 70 62 C 64 66, 58 70, 58 92 Z" fill={`url(#${u}h)`} stroke="#1A0A04" strokeWidth={1.8} />
        <Path d="M40 34 C 32 40, 24 56, 26 74 C 22 60, 22 44, 36 30 Z" fill="#1A0E06" />
        <Circle cx={64} cy={40} r={3} fill="#0A0402" />
        <Ellipse cx={82} cy={62} rx={3} ry={2} fill="#0A0402" />
        <Path d="M58 52 L 84 50" stroke={TURQ} strokeWidth={2.5} />
      </G>
    );
  } else if (s === 'WILD') {
    body = (
      <G>
        <Circle cx={66} cy={30} r={22} fill={`url(#${u}m)`} />
        <Path d="M10 92 L 20 70 C 22 60, 28 52, 36 48 L 34 30 L 42 40 L 46 28 L 52 42 C 60 44, 62 52, 58 60 C 66 64, 74 72, 76 92 Z" fill="#2A2E44" stroke="#0A0A18" strokeWidth={1.5} />
        <Path d="M34 30 L 26 20 L 30 34 Z" fill="#2A2E44" />
        <Path d="M46 28 C 44 22, 46 16, 50 12 C 50 20, 52 26, 52 30 Z" fill="#2A2E44" />
        <Rect x={6} y={74} width={88} height={22} rx={6} fill={RUST} stroke={GOLD} strokeWidth={2} />
        <SvgText x={50} y={91} fontSize={18} fontWeight="900" fill={MOONLIGHT} textAnchor="middle" fontFamily={SERIF} letterSpacing={2}>
          WILD
        </SvgText>
      </G>
    );
  } else if (s === 'SCATTER') {
    body = (
      <G>
        <Rect x={4} y={4} width={92} height={92} rx={14} fill={`url(#${u}s)`} stroke={GOLD} strokeWidth={2.5} />
        <Circle cx={50} cy={50} r={14} fill="#FFE8A0" />
        <Path d="M4 70 L 18 50 L 30 54 L 36 40 L 52 40 L 58 52 L 72 48 L 82 58 L 96 56 L 96 96 L 4 96 Z" fill="#8A2A14" />
        <Path d="M4 80 L 24 66 L 46 72 L 70 64 L 96 74 L 96 96 L 4 96 Z" fill="#5A1A0A" />
        <Rect x={10} y={76} width={80} height={16} rx={5} fill={NIGHT} stroke={GOLD} strokeWidth={1.5} />
        <SvgText x={50} y={88} fontSize={11} fontWeight="900" fill={GOLD} textAnchor="middle" fontFamily={SERIF} letterSpacing={2}>
          BONUS
        </SvgText>
      </G>
    );
  } else if (s === 'MOON') {
    const label = j ? j : bet !== undefined && v !== undefined ? `₹${round2(v * bet)}` : `${v ?? 1}x`;
    body = (
      <G>
        <Circle cx={50} cy={50} r={47} fill={j ? (j === 'MAJOR' ? '#FF7A3A' : TURQ) : '#FFF6D8'} opacity={0.25} />
        <Circle cx={50} cy={50} r={40} fill={`url(#${u}m)`} stroke={j ? GOLD : SILVER} strokeWidth={j ? 3.5 : 2} />
        <Circle cx={36} cy={36} r={6} fill="#C8C0A0" opacity={0.5} />
        <Circle cx={62} cy={60} r={8} fill="#C8C0A0" opacity={0.45} />
        <Circle cx={60} cy={30} r={3.5} fill="#C8C0A0" opacity={0.5} />
        <SvgText x={50} y={label.length > 6 ? 57 : 59} fontSize={label.length > 6 ? 16 : label.length > 4 ? 19 : 24} fontWeight="900" fill={j ? (j === 'MAJOR' ? '#8A2A04' : '#04403A') : '#3A2A10'} stroke="#FFFFFF" strokeWidth={0.6} textAnchor="middle" fontFamily={j ? SERIF : undefined}>
          {label}
        </SvgText>
      </G>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        {letter && (
          <SvgLinearGradient id={`${u}l`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={letter[0]} />
            <Stop offset="0.5" stopColor={letter[1]} />
            <Stop offset="1" stopColor={letter[2]} />
          </SvgLinearGradient>
        )}
        <SvgLinearGradient id={`${u}b`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#8A5A2A" />
          <Stop offset="1" stopColor="#3A1E0A" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${u}e`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#8A5A2A" />
          <Stop offset="1" stopColor="#3A2010" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${u}c`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#E0A060" />
          <Stop offset="1" stopColor="#8A5020" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${u}h`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#C88A5A" />
          <Stop offset="1" stopColor="#5A2A10" />
        </SvgLinearGradient>
        <RadialGradient id={`${u}m`} cx="40%" cy="38%" r="65%">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.6" stopColor={j === 'MAJOR' ? '#FFC07A' : j === 'MINI' ? '#B8FFF0' : '#FFF2C8'} />
          <Stop offset="1" stopColor={j === 'MAJOR' ? '#E06A1A' : j === 'MINI' ? '#2AB8A8' : '#D8C890'} />
        </RadialGradient>
        <SvgLinearGradient id={`${u}s`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#3A1A5A" />
          <Stop offset="0.6" stopColor="#E8783A" />
          <Stop offset="1" stopColor="#FFC870" />
        </SvgLinearGradient>
      </Defs>
      {body}
    </Svg>
  );
});

// ---------- reels ----------

type ReelHandle = {
  start: () => void;
  land: (rows: WolfCell[], delay: number) => Promise<void>;
  set: (rows: WolfCell[]) => void;
};

const LOOP_CELLS = 14;
const LAND_CELLS = 9;
const filler = (): WolfCell => {
  const s = FILLER[Math.floor(Math.random() * FILLER.length)];
  return s === 'MOON' ? { s, v: [1, 2, 3, 5][Math.floor(Math.random() * 4)] } : { s };
};

const Reel = forwardRef(function Reel({ initial, cell, width, dimmed, bet }: { initial: WolfCell[]; cell: number; width: number; dimmed: boolean[]; bet: number }, ref: React.Ref<ReelHandle>) {
  const [content, setContent] = useState<WolfCell[]>(initial);
  const y = useRef(new Animated.Value(0)).current;
  const pending = useRef<null | { kind: 'loop' } | { kind: 'land'; resolve: () => void; rows: WolfCell[] }>(null);
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);
  const contentRef = useRef(content);
  contentRef.current = content;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const loop = Animated.loop(Animated.timing(y, { toValue: 0, duration: 420, easing: Easing.linear, useNativeDriver: true }));
      loopRef.current = loop;
      loop.start();
      return;
    }
    y.setValue(-(content.length - 3) * cell);
    Animated.timing(y, { toValue: 0, duration: 440, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }).start(() => {
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
        {content.map((c, i) => (
          <View key={i} style={{ width, height: cell, alignItems: 'center', justifyContent: 'center', opacity: settled && dimmed[i] ? 0.3 : 1 }}>
            <WolfArt s={c.s} v={c.v} j={c.j} size={Math.min(width, cell) * 0.9} bet={bet} />
          </View>
        ))}
      </Animated.View>
    </View>
  );
});

// ---------- scenery ----------

/** Desert at night: a huge moon, stars, red mesas, saguaros and a wolf howling on a rock. */
const Desert = memo(function Desert({ w, h, free }: { w: number; h: number; free: boolean }) {
  const u = useId().replace(/:/g, '');
  const stars = useMemo(() => Array.from({ length: 50 }, (_, i) => ({ x: ((i * 37) % 100) / 100, y: ((i * 53) % 55) / 100, r: (i % 3) * 0.5 + 0.5 })), []);
  const ground = h * 0.78;
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id={`wmSky${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={free ? '#2A0A1A' : '#0A0A2A'} />
          <Stop offset="0.55" stopColor={free ? '#7A1A2A' : '#3A1E5A'} />
          <Stop offset="1" stopColor={free ? '#E8683A' : '#8A3A4A'} />
        </SvgLinearGradient>
        <RadialGradient id={`wmMoon${u}`} cx="45%" cy="40%" r="60%">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.7" stopColor={MOONLIGHT} />
          <Stop offset="1" stopColor="#E8D8A0" />
        </RadialGradient>
        <RadialGradient id={`wmHalo${u}`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={MOONLIGHT} stopOpacity={0.45} />
          <Stop offset="1" stopColor={MOONLIGHT} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill={`url(#wmSky${u})`} />
      {stars.map((s, i) => (
        <Circle key={i} cx={s.x * w} cy={s.y * h} r={s.r} fill="#FFFFFF" opacity={0.7} />
      ))}
      <Circle cx={w * 0.72} cy={h * 0.13} r={w * 0.3} fill={`url(#wmHalo${u})`} />
      <Circle cx={w * 0.72} cy={h * 0.13} r={w * 0.13} fill={`url(#wmMoon${u})`} />
      <Circle cx={w * 0.68} cy={h * 0.11} r={w * 0.02} fill="#D8C890" opacity={0.5} />
      <Circle cx={w * 0.76} cy={h * 0.16} r={w * 0.028} fill="#D8C890" opacity={0.45} />
      {/* Wolf howling on a rock against the moon */}
      <G transform={`translate(${w * 0.62} ${h * 0.12}) scale(${w / 400})`}>
        <Path d="M0 60 L 70 60 L 60 40 L 10 44 Z" fill="#140A1E" />
        <Path d="M14 44 L 18 26 C 20 18, 26 14, 32 12 L 30 2 L 36 8 L 40 0 L 44 10 C 52 12, 54 20, 50 26 C 58 28, 62 36, 60 44 Z" fill="#140A1E" />
        <Path d="M40 0 L 52 -12 L 46 4 Z" fill="#140A1E" />
      </G>
      {/* Mesas */}
      <Path d={`M0 ${ground - h * 0.1} L ${w * 0.08} ${ground - h * 0.1} L ${w * 0.12} ${ground - h * 0.04} L ${w * 0.3} ${ground - h * 0.05} L ${w * 0.34} ${ground} L 0 ${ground} Z`} fill="#5A1E1A" opacity={0.85} />
      <Path d={`M${w * 0.6} ${ground} L ${w * 0.66} ${ground - h * 0.08} L ${w * 0.9} ${ground - h * 0.09} L ${w * 0.96} ${ground - h * 0.03} L ${w} ${ground - h * 0.03} L ${w} ${ground} Z`} fill="#4A1814" opacity={0.85} />
      <Rect x={0} y={ground} width={w} height={h - ground} fill="#1E0A10" />
      {/* Saguaros */}
      {[0.06, 0.92].map((x) => (
        <G key={x} transform={`translate(${x * w} ${ground})`} opacity={0.9}>
          <Rect x={-4} y={-60} width={8} height={60} rx={4} fill="#1A2A1A" />
          <Path d="M-4 -30 C -16 -30, -16 -42, -16 -48" stroke="#1A2A1A" strokeWidth={7} fill="none" strokeLinecap="round" />
          <Path d="M4 -38 C 14 -38, 14 -48, 14 -54" stroke="#1A2A1A" strokeWidth={7} fill="none" strokeLinecap="round" />
        </G>
      ))}
    </Svg>
  );
});

function Logo({ width }: { width: number }) {
  const u = useId().replace(/:/g, '');
  return (
    <Svg width={width} height={width * 0.22} viewBox="0 0 360 80">
      <Defs>
        <SvgLinearGradient id={`wmL${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.5" stopColor="#C8D0E0" />
          <Stop offset="1" stopColor="#6A7A98" />
        </SvgLinearGradient>
      </Defs>
      <SvgText x={182} y={52} fontSize={46} fontWeight="900" fill="#000" opacity={0.5} textAnchor="middle" letterSpacing={6} fontFamily={SERIF}>
        WOLF MOON
      </SvgText>
      <SvgText x={180} y={50} fontSize={46} fontWeight="900" fill={`url(#wmL${u})`} stroke={NIGHT} strokeWidth={1.5} textAnchor="middle" letterSpacing={6} fontFamily={SERIF}>
        WOLF MOON
      </SvgText>
      <SvgText x={180} y={72} fontSize={11} fontWeight="900" fill={TURQ} textAnchor="middle" letterSpacing={4} fontFamily={SERIF}>
        25 LINES · MONEY RESPIN · 3 JACKPOTS
      </SvgText>
    </Svg>
  );
}

/** Home tile art: the wolf howling at the moon over the mesas. */
export function WolfMoonTileArt({ size }: { size: number }) {
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size }} pointerEvents="none">
      <Desert w={size} h={size} free={false} />
      <View style={{ position: 'absolute', left: size * 0.06, top: size * 0.1 }}>
        <WolfArt s="WILD" size={size * 0.46} />
      </View>
      <View style={{ position: 'absolute', left: size * 0.58, top: size * 0.3 }}>
        <WolfArt s="MOON" j="MAJOR" size={size * 0.32} />
      </View>
    </View>
  );
}

// ---------- screen ----------

const START: WolfCell[][] = [
  [{ s: 'ACE' }, { s: 'BUFFALO' }, { s: 'SCATTER' }],
  [{ s: 'KING' }, { s: 'WILD' }, { s: 'EAGLE' }],
  [{ s: 'MOON', v: 5 }, { s: 'COUGAR' }, { s: 'QUEEN' }],
  [{ s: 'HORSE' }, { s: 'WILD' }, { s: 'JACK' }],
  [{ s: 'BUFFALO' }, { s: 'MOON', j: 'MINI', v: 20 }, { s: 'ACE' }],
];

type RespinView = { board: (WolfCell | null)[][]; left: number; fresh: Set<string> };

export default function WolfMoonScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<WolfConfig | null>(null);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [busy, setBusy] = useState(false);
  const [shownBalance, setShownBalance] = useState(coins);
  const [winLines, setWinLines] = useState<WolfLineWin[]>([]);
  const [winShown, setWinShown] = useState(0);
  const [result, setResult] = useState<'win' | 'return' | null>(null);
  const [free, setFree] = useState<{ index: number; total: number; giant: WolfSym | null; won: number } | null>(null);
  const [respin, setRespin] = useState<RespinView | null>(null);
  const [banner, setBanner] = useState<{ title: string; sub?: string; tone?: 'jackpot' } | null>(null);
  const [panel, setPanel] = useState<'pay' | 'history' | null>(null);
  const [history, setHistory] = useState<WolfSpinRow[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sessionNet, setSessionNet] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [cells, setCells] = useState<WolfCell[][]>(START);

  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const sessionStart = useRef(Date.now());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerAnim = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const reels = [useRef<ReelHandle>(null), useRef<ReelHandle>(null), useRef<ReelHandle>(null), useRef<ReelHandle>(null), useRef<ReelHandle>(null)];

  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const lines = config?.lines ?? [];
  const jackpots = config?.jackpots ?? FALLBACK_JACKPOTS;
  const betLevels = useMemo(() => BET_LEVELS.filter((b) => b >= minStake && b <= maxStake), [minStake, maxStake]);

  useEffect(() => {
    if (!busyRef.current) setShownBalance(coins);
  }, [coins]);

  useEffect(() => {
    mountedRef.current = true;
    fetchWolfConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => mountedRef.current && setToast('Could not load the game — check your connection.'));
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => {
      mountedRef.current = false;
      clearInterval(clock);
      loop.stop();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [glow]);

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const flashBanner = useCallback(
    async (title: string, sub?: string, hold = 1100, tone?: 'jackpot') => {
      setBanner({ title, sub, tone });
      bannerAnim.setValue(0);
      await run(Animated.spring(bannerAnim, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }));
      await wait(hold);
      await run(Animated.timing(bannerAnim, { toValue: 0, duration: 180, useNativeDriver: true }));
      if (mountedRef.current) setBanner(null);
    },
    [bannerAnim]
  );

  const countUp = useCallback(async (from: number, to: number) => {
    const steps = Math.min(26, Math.max(6, Math.round(to - from)));
    for (let i = 1; i <= steps; i++) {
      if (!mountedRef.current) return;
      setWinShown(round2(from + ((to - from) * i) / steps));
      await wait(26);
    }
  }, []);

  /** Spins the reels to `target`, stopping left to right with the last landing `lastAt` ms after `t0`. */
  const spinTo = useCallback(
    async (target: WolfCell[][], t0: number, lastAt: number) => {
      const elapsed = Date.now() - t0;
      await Promise.all(target.map((rows, i) => reels[i].current?.land(rows, Math.max(0, lastAt - (4 - i) * 240 - elapsed))));
      if (mountedRef.current) setCells(target);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const spin = useCallback(async () => {
    if (busyRef.current || !config) return;
    if (bet > shownBalance) {
      showToast('Insufficient balance');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setWinLines([]);
    setWinShown(0);
    setResult(null);
    setRespin(null);
    setShownBalance((b) => round2(b - bet));
    const t0 = Date.now();
    reels.forEach((r) => r.current?.start());

    let res: { spin: WolfSpinRow; outcome: WolfOutcome };
    try {
      res = await spinWolf(bet);
    } catch (err) {
      reels.forEach((r, i) => r.current?.set(cells[i]));
      setShownBalance((b) => round2(b + bet));
      showToast(errorMessage(err));
      busyRef.current = false;
      setBusy(false);
      return;
    }
    if (!mountedRef.current) return;
    const { outcome } = res;
    const payout = Number(res.spin.payout);
    const scale = (x: number) => round2(x * bet);

    // Base spin: the last reel lands no sooner than MIN_SPIN_MS after the press.
    await spinTo(outcome.base.grid, t0, MIN_SPIN_MS - 440);
    if (!mountedRef.current) return;
    let shown = 0;
    if (outcome.base.lines.length) {
      setWinLines(outcome.base.lines);
      shown = scale(outcome.base.lineWin);
      await countUp(0, shown);
      await wait(700);
    }

    // Free spins: reels 2-4 spin as one giant symbol.
    if (outcome.freeSpins.length) {
      await flashBanner(`${outcome.freeSpins.length} FREE SPINS`, 'GIANT SYMBOLS ON REELS 2–4', 1300);
      setWinLines([]);
      let won = 0;
      for (let i = 0; i < outcome.freeSpins.length; i++) {
        if (!mountedRef.current) return;
        const fs = outcome.freeSpins[i];
        setFree({ index: i + 1, total: outcome.freeSpins.length, giant: null, won });
        setWinLines([]);
        const ft0 = Date.now();
        reels.forEach((r) => r.current?.start());
        await spinTo(fs.grid, ft0, 1900);
        setFree({ index: i + 1, total: outcome.freeSpins.length, giant: fs.giant, won });
        if (fs.lines.length) {
          setWinLines(fs.lines);
          const add = scale(fs.lineWin);
          await countUp(shown, round2(shown + add));
          shown = round2(shown + add);
          won = round2(won + add);
          setFree({ index: i + 1, total: outcome.freeSpins.length, giant: fs.giant, won });
          await wait(700);
        } else await wait(450);
      }
      await flashBanner('FREE SPINS WIN', money(won), 1300);
      setFree(null);
      setWinLines([]);
    }

    // Money Respin: the moons stay, the rest empties, 3 respins that reset on every new moon.
    if (outcome.respin) {
      const r = outcome.respin;
      setWinLines([]);
      await flashBanner('MONEY RESPIN', `${outcome.moons} MOONS · 3 RESPINS`, 1300);
      const board = r.start.map((col) => col.map((c) => (c ? { ...c } : null)));
      setRespin({ board, left: 3, fresh: new Set() });
      await wait(700);
      for (const step of r.steps) {
        if (!mountedRef.current) return;
        await wait(650);
        const fresh = new Set<string>();
        for (const [c, row, cell] of step.landed) {
          board[c][row] = cell;
          fresh.add(`${c},${row}`);
        }
        setRespin({ board: board.map((col) => [...col]), left: step.left, fresh });
        await wait(step.landed.length ? 650 : 250);
      }
      // Collect, jackpots, and the MEGA for a full board.
      if (r.minis) await flashBanner('MINI JACKPOT', `${r.minis > 1 ? `${r.minis} × ` : ''}${money(scale(jackpots.MINI))}`, 1100, 'jackpot');
      if (r.majors) await flashBanner('MAJOR JACKPOT', `${r.majors > 1 ? `${r.majors} × ` : ''}${money(scale(jackpots.MAJOR))}`, 1300, 'jackpot');
      if (r.mega) await flashBanner('MEGA JACKPOT', money(scale(jackpots.MEGA)), 1800, 'jackpot');
      await countUp(shown, round2(shown + scale(r.win)));
      shown = round2(shown + scale(r.win));
      // The finished respin board stays up until the next spin or a bet change.
    }

    // UK rule: no paid spin resolves in under MIN_SPIN_MS.
    await wait(Math.max(0, MIN_SPIN_MS - (Date.now() - t0)));
    // The server's payout (rounded down, capped) is the one that counts.
    setWinShown(payout);
    // Only a return above the stake is celebrated; a smaller one is shown plainly.
    setResult(payout > bet ? 'win' : payout > 0 ? 'return' : null);
    if (payout >= bet * 20 && !outcome.respin && !outcome.freeSpins.length) await flashBanner(payout >= bet * 100 ? 'MEGA WIN' : 'BIG WIN', money(payout), 1300);
    setShownBalance((b) => round2(b + payout));
    setSessionNet((n) => round2(n + payout - bet));
    refreshWallet();
    if (panel === 'history') fetchWolfHistory(30).then((h) => mountedRef.current && setHistory(h)).catch(() => {});
    busyRef.current = false;
    if (mountedRef.current) setBusy(false);
    // reels are stable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, bet, shownBalance, cells, panel, jackpots, flashBanner, countUp, spinTo, refreshWallet, showToast]);

  const stepBet = (dir: 1 | -1) => {
    if (busy) return;
    setRespin(null);
    const idx = Math.max(0, betLevels.indexOf(bet));
    setBet(betLevels[Math.max(0, Math.min(betLevels.length - 1, idx + dir))] ?? bet);
  };

  const openHistory = () => {
    setPanel('history');
    setHistory(null);
    fetchWolfHistory(30)
      .then((h) => mountedRef.current && setHistory(h))
      .catch(() => mountedRef.current && setHistory([]));
  };

  // ---------- layout ----------
  const cabW = Math.min(W - 12, 470);
  const gap = 3;
  // Cabinet border 2.5, frame margin 8 + border 2 + padding 6 on each side; each reel window has a 1px border.
  const reelsW = cabW - 37;
  const reelW = Math.floor((reelsW - gap * 4) / 5) - 2;
  const pitch = reelW + 2 + gap;
  const boardW = pitch * 5 - gap;
  const cell = Math.floor(Math.min(reelW * 1.02, 92));
  const reelsH = cell * 3;
  const minutes = Math.floor((now - sessionStart.current) / 60000);
  const seconds = Math.floor(((now - sessionStart.current) % 60000) / 1000);

  const litCells = useMemo(() => {
    const lit = [0, 1, 2, 3, 4].map(() => [false, false, false]);
    winLines.forEach((w) => lines[w.line]?.forEach((row, reel) => reel < w.count && (lit[reel][row] = true)));
    return lit;
  }, [winLines, lines]);
  const dimFor = (reel: number) => (winLines.length > 0 ? litCells[reel].map((x) => !x) : [false, false, false]);
  const respinTotal = respin ? respin.board.flat().reduce((s, c) => s + (c && !c.j ? c.v ?? 0 : 0), 0) : 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={free ? ['#2A0A1A', '#0A0408'] : ['#0E0A2A', '#05030F']} style={StyleSheet.absoluteFill} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={SILVER} />
          <MaterialCommunityIcons name="moon-full" size={18} color={MOONLIGHT} />
          <Text style={styles.title}>WOLF MOON</Text>
        </Pressable>
        <View style={styles.balancePill}>
          <MaterialCommunityIcons name="wallet" size={15} color={GOLD} />
          <Text style={styles.balanceText}>{money(shownBalance)}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24, alignItems: 'center' }} scrollEnabled={!busy}>
        <View style={[styles.cabinet, { width: cabW }]}>
          <Desert w={cabW} h={reelsH + 250} free={!!free} />
          <View style={{ alignItems: 'center', marginTop: 4 }}>
            <Logo width={cabW * 0.9} />
          </View>

          {/* Jackpot bar */}
          <View style={styles.jackpots}>
            {(
              [
                ['MINI', jackpots.MINI, TURQ],
                ['MAJOR', jackpots.MAJOR, '#FF8A4A'],
                ['MEGA', jackpots.MEGA, GOLD],
              ] as const
            ).map(([name, x, color]) => (
              <View key={name} style={[styles.jackpot, { borderColor: color }]}>
                <Text style={[styles.jackpotName, { color }]}>{name}</Text>
                <Text style={styles.jackpotValue} numberOfLines={1} adjustsFontSizeToFit>
                  {money(round2(x * bet))}
                </Text>
              </View>
            ))}
          </View>

          {/* Status: free spins, money respin, or the rules */}
          <View style={styles.statusRow}>
            {respin ? (
              <>
                <View style={[styles.statusPill, { borderColor: GOLD }]}>
                  <Text style={styles.statusLabel}>RESPINS</Text>
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    {[0, 1, 2].map((i) => (
                      <View key={i} style={[styles.respinDot, i < respin.left && styles.respinDotOn]} />
                    ))}
                  </View>
                </View>
                <View style={[styles.statusPill, { borderColor: GOLD }]}>
                  <Text style={styles.statusLabel}>MOONS</Text>
                  <Text style={styles.statusValue}>{money(round2(respinTotal * bet))}</Text>
                </View>
              </>
            ) : free ? (
              <>
                <View style={[styles.statusPill, { borderColor: RUST }]}>
                  <Text style={styles.statusLabel}>FREE SPIN</Text>
                  <Text style={styles.statusValue}>
                    {free.index}/{free.total}
                  </Text>
                </View>
                <View style={[styles.statusPill, { borderColor: RUST }]}>
                  <Text style={styles.statusLabel}>FEATURE WIN</Text>
                  <Text style={styles.statusValue}>{money(free.won)}</Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.statusPill}>
                  <WolfArt s="MOON" v={5} size={20} />
                  <Text style={styles.statusLabel}>6+ = MONEY RESPIN</Text>
                </View>
                <View style={styles.statusPill}>
                  <WolfArt s="SCATTER" size={20} />
                  <Text style={styles.statusLabel}>REELS 1·3·5 = FREE SPINS</Text>
                </View>
              </>
            )}
          </View>

          {/* Reels in a weathered wood frame with turquoise studs */}
          <View style={[styles.reelFrame, { marginHorizontal: 8 }]}>
            <LinearGradient colors={['#6A4A2A', '#3A2412', '#1E1008']} style={[StyleSheet.absoluteFill, { borderRadius: 12 }]} />
            {[0, 1, 2, 3].map((k) => (
              <View key={k} style={[styles.stud, { left: k % 2 ? undefined : 3, right: k % 2 ? 3 : undefined, top: k < 2 ? 3 : undefined, bottom: k < 2 ? undefined : 3 }]} />
            ))}
            <View style={{ flexDirection: 'row', gap }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <View key={i} style={styles.reelWindow}>
                  <LinearGradient colors={free ? ['#3A1420', '#1A0810'] : ['#1E1A3A', '#0E0A20']} style={StyleSheet.absoluteFill} />
                  <Reel ref={reels[i]} initial={START[i]} cell={cell} width={reelW} dimmed={dimFor(i)} bet={bet} />
                </View>
              ))}
            </View>
            {/* Giant symbol over reels 2-4 in free spins */}
            {free?.giant && !respin && (
              <View pointerEvents="none" style={[styles.giant, { left: 6 + pitch, width: pitch * 3 - gap, height: reelsH + 2 }]}>
                <LinearGradient colors={['#5A1A2A', '#2A0A14']} style={[StyleSheet.absoluteFill, { borderRadius: 8 }]} />
                <View>
                  <WolfArt s={free.giant} size={Math.min(reelW * 3, reelsH) * 0.95} bet={bet} />
                </View>
              </View>
            )}
            {/* Money Respin board */}
            {respin && (
              <View pointerEvents="none" style={[styles.respinBoard, { left: 6, top: 6, width: boardW, height: reelsH + 2 }]}>
                {respin.board.map((col, c) =>
                  col.map((m, r) => {
                    const isNew = respin.fresh.has(`${c},${r}`);
                    return (
                      <View key={`${c},${r}`} style={{ position: 'absolute', left: c * pitch + 1, top: r * cell + 1, width: reelW, height: cell, alignItems: 'center', justifyContent: 'center' }}>
                        {m ? (
                          <Animated.View style={isNew ? { transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }] } : undefined}>
                            <WolfArt s="MOON" v={m.v} j={m.j} size={Math.min(reelW, cell) * 0.92} bet={bet} />
                          </Animated.View>
                        ) : (
                          <View style={styles.emptySlot} />
                        )}
                      </View>
                    );
                  })
                )}
              </View>
            )}
            {lines.length > 0 && !respin && (
              <Svg width={boardW} height={reelsH + 2} style={{ position: 'absolute', left: 6, top: 6 }} pointerEvents="none">
                {winLines.map((w) => {
                  const pts = lines[w.line].map((row, reel) => `${reel * pitch + 1 + reelW / 2},${row * cell + 1 + cell / 2}`).join(' ');
                  const color = LINE_COLORS[w.line % LINE_COLORS.length];
                  return (
                    <G key={w.line}>
                      <Polyline points={pts} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
                      <Polyline points={pts} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                    </G>
                  );
                })}
              </Svg>
            )}
          </View>

          {/* Win meter */}
          <View style={styles.meter}>
            <Text style={[styles.meterLabel, result === 'win' && { color: GOLD }]}>{result === 'return' ? 'RETURNED' : busy ? 'WIN' : result === 'win' ? 'WIN' : 'HOWL AT THE MOON'}</Text>
            <Text style={[styles.meterValue, (result === 'win' || (busy && winShown > 0)) && { color: GOLD }]}>{winShown > 0 || result ? money(winShown) : '— — —'}</Text>
          </View>
        </View>

        {/* Line wins */}
        <View style={[styles.lineWins, { width: cabW }]}>
          {winLines.length === 0 ? (
            <Text style={styles.hint}>25 lines · wolf is wild on reels 2–4</Text>
          ) : (
            winLines.slice(0, 6).map((w) => (
              <View key={w.line} style={[styles.chip, { borderColor: LINE_COLORS[w.line % LINE_COLORS.length] }]}>
                <Text style={[styles.chipText, { color: LINE_COLORS[w.line % LINE_COLORS.length] }]}>
                  L{w.line + 1} {w.count}× {NAME[w.symbol]}
                </Text>
                <Text style={styles.chipText}>{money(round2(w.pay * bet))}</Text>
              </View>
            ))
          )}
        </View>

        {/* Session (UK: time played and net position, always on show) */}
        <View style={[styles.session, { width: cabW }]}>
          <MaterialCommunityIcons name="timer-outline" size={15} color="#C8D0E0" />
          <Text style={styles.sessionText}>
            Session {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </Text>
          <Text style={styles.sessionSep}>·</Text>
          <Text style={[styles.sessionText, { color: sessionNet > 0 ? '#7CFF9A' : sessionNet < 0 ? '#FF9AA6' : '#C8D0E0' }]}>
            Net {sessionNet >= 0 ? '+' : '−'}
            {money(Math.abs(sessionNet))}
          </Text>
        </View>

        {/* Controls: no autoplay or turbo (UK) */}
        <View style={[styles.controls, { width: cabW }]}>
          <Pressable onPress={() => setPanel('pay')} style={styles.sideBtn} hitSlop={6}>
            <MaterialCommunityIcons name="information-outline" size={20} color={TURQ} />
            <Text style={styles.sideText}>PAYS</Text>
          </Pressable>
          <View style={styles.betBox}>
            <Text style={styles.betLabel}>TOTAL BET</Text>
            <View style={styles.betRow}>
              <Pressable onPress={() => stepBet(-1)} disabled={busy} style={[styles.betBtn, busy && styles.dim]} hitSlop={6}>
                <MaterialCommunityIcons name="minus" size={18} color={NIGHT} />
              </Pressable>
              <Text style={styles.betValue}>{money(bet)}</Text>
              <Pressable onPress={() => stepBet(1)} disabled={busy} style={[styles.betBtn, busy && styles.dim]} hitSlop={6}>
                <MaterialCommunityIcons name="plus" size={18} color={NIGHT} />
              </Pressable>
            </View>
          </View>
          <Pressable onPress={spin} disabled={busy || !config} style={({ pressed }) => [styles.spinWrap, pressed && { transform: [{ scale: 0.95 }] }]}>
            <Animated.View style={[styles.spinHalo, { opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.8] }) }]} />
            <LinearGradient colors={busy || !config ? ['#6A6A7A', '#3A3A4A'] : ['#FFFFFF', MOONLIGHT, '#C8B880']} style={styles.spinBtn}>
              <MaterialCommunityIcons name={busy ? 'dots-horizontal' : 'moon-waxing-crescent'} size={30} color={NIGHT} />
              {!busy && <Text style={styles.spinText}>SPIN</Text>}
            </LinearGradient>
          </Pressable>
          <Pressable onPress={openHistory} style={styles.sideBtn} hitSlop={6}>
            <MaterialCommunityIcons name="history" size={20} color={TURQ} />
            <Text style={styles.sideText}>HISTORY</Text>
          </Pressable>
        </View>

        <GameInfoButton>
          RTP {config ? `${config.rtpPercent}%` : '88%'} · bet {money(minStake)}–{money(maxStake)} · max win {config?.maxWinX ?? 5000}x, ₹{config?.maxPayout ?? 10000} per spin{'\n'}
          No autoplay or turbo · each paid spin takes at least 2.5 seconds · provably fair
        </GameInfoButton>
      </ScrollView>

      {banner && (
        <Animated.View pointerEvents="none" style={[styles.banner, { opacity: bannerAnim, transform: [{ scale: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]}>
          <LinearGradient colors={banner.tone === 'jackpot' ? ['#FFF4C8', GOLD, '#B87800'] : ['#3A1E5A', '#14081E']} style={[styles.bannerInner, banner.tone === 'jackpot' && { borderColor: '#FFFFFF' }]}>
            {banner.tone !== 'jackpot' && <WolfArt s="WILD" size={56} />}
            <Text style={[styles.bannerText, banner.tone === 'jackpot' && { color: '#3A1A00' }]}>{banner.title}</Text>
            {banner.sub ? <Text style={[styles.bannerSub, banner.tone === 'jackpot' && { color: '#5A2A00' }]}>{banner.sub}</Text> : null}
          </LinearGradient>
        </Animated.View>
      )}

      {toast && (
        <View pointerEvents="none" style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      <Modal visible={panel !== null} transparent animationType="fade" onRequestClose={() => setPanel(null)}>
        <Pressable style={styles.modalBack} onPress={() => setPanel(null)}>
          <Pressable style={[styles.modalCard, { width: Math.min(W - 24, 440) }]} onPress={() => {}}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{panel === 'pay' ? 'PAYTABLE' : 'MY SPINS'}</Text>
              <Pressable onPress={() => setPanel(null)} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={22} color={SILVER} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 480 }}>{panel === 'pay' ? <Paytable bet={bet} config={config} /> : <History spins={history} />}</ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Paytable({ bet, config }: { bet: number; config: WolfConfig | null }) {
  if (!config) return <Text style={styles.payNote}>Loading…</Text>;
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.payNote}>Prizes at a {money(bet)} total bet, per line. Lines pay left to right from reel 1, 3 or more in a row.</Text>
      <View style={styles.payRow}>
        <View style={{ width: 44 }} />
        {['3×', '4×', '5×'].map((h) => (
          <Text key={h} style={[styles.payValue, { color: TURQ }]}>
            {h}
          </Text>
        ))}
      </View>
      {config.paytable.map(({ symbol, pays }) => (
        <View key={symbol} style={styles.payRow}>
          <WolfArt s={symbol} size={40} />
          {pays.map((p, i) => (
            <Text key={i} style={styles.payValue}>
              {money(round2(p * bet))}
            </Text>
          ))}
        </View>
      ))}
      <Text style={styles.paySection}>WILD</Text>
      <View style={[styles.payRow, { gap: 10 }]}>
        <WolfArt s="WILD" size={44} />
        <Text style={[styles.payNote, { flex: 1 }]}>The howling wolf lands on reels 2, 3 and 4 and stands in for every paying symbol.</Text>
      </View>
      <Text style={styles.paySection}>FREE SPINS</Text>
      <View style={[styles.payRow, { gap: 10 }]}>
        <WolfArt s="SCATTER" size={44} />
        <Text style={[styles.payNote, { flex: 1 }]}>A canyon on each of reels 1, 3 and 5 gives {config.freeSpins} free spins. In free spins reels 2–4 spin together as one giant 3×3 symbol.</Text>
      </View>
      <Text style={styles.paySection}>MONEY RESPIN</Text>
      <View style={[styles.payRow, { gap: 6 }]}>
        <WolfArt s="MOON" v={5} size={40} bet={bet} />
        <WolfArt s="MOON" j="MINI" v={20} size={40} />
        <WolfArt s="MOON" j="MAJOR" v={100} size={40} />
      </View>
      <Text style={styles.payNote}>
        {config.moonsToTrigger} or more moons start the Money Respin. The moons stay and you get {config.respins} respins; every new moon resets them to {config.respins}. Moons pay their cash value ({config.moonValues[0]}x–{config.moonValues[config.moonValues.length - 1]}x the bet) or a jackpot: MINI {config.jackpots.MINI}x ({money(round2(config.jackpots.MINI * bet))}), MAJOR {config.jackpots.MAJOR}x ({money(round2(config.jackpots.MAJOR * bet))}). Fill all 15 squares for the MEGA jackpot, {config.jackpots.MEGA}x ({money(round2(config.jackpots.MEGA * bet))}).
      </Text>
      <Text style={styles.paySection}>GAME INFO</Text>
      <Text style={styles.payNote}>
        Return to player {config.rtpPercent}% (measured by simulation). Max win {config.maxWinX}x the bet and ₹{config.maxPayout} per spin. No autoplay or turbo; each paid spin takes at least 2.5 seconds. Every spin comes from your provably-fair seeds.
      </Text>
    </View>
  );
}

function History({ spins }: { spins: WolfSpinRow[] | null }) {
  if (spins === null) return <Text style={styles.payNote}>Loading…</Text>;
  if (spins.length === 0) return <Text style={styles.payNote}>No spins yet.</Text>;
  return (
    <View>
      {spins.map((s) => {
        const payout = Number(s.payout);
        const d = new Date(s.createdAt);
        const tags = [s.freeSpins ? 'FREE SPINS' : '', s.moneyRespin ? 'MONEY RESPIN' : '', s.jackpot ? `${s.jackpot} JACKPOT` : ''].filter(Boolean).join(' · ');
        return (
          <View key={s.id} style={styles.histRow}>
            <Text style={styles.histTime}>{d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            <Text style={styles.histStake}>{money(Number(s.stake))}</Text>
            <Text style={styles.histTags} numberOfLines={1}>
              {tags}
            </Text>
            <Text style={[styles.histWin, { color: payout > 0 ? '#7CFF9A' : '#8A8FA8' }]}>{payout > 0 ? `+${money(payout)}` : '—'}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05030F' },
  topBar: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  title: { color: SILVER, fontSize: 18, fontWeight: '900', letterSpacing: 3, fontFamily: SERIF },
  balancePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(60,216,200,0.1)', borderWidth: 1, borderColor: 'rgba(60,216,200,0.45)' },
  balanceText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  cabinet: { borderRadius: 18, borderWidth: 2.5, borderColor: '#8A6A3A', overflow: 'hidden', marginTop: 4, paddingBottom: 10 },
  jackpots: { flexDirection: 'row', gap: 6, marginHorizontal: 10, marginTop: 2 },
  jackpot: { flex: 1, alignItems: 'center', paddingVertical: 4, borderRadius: 10, borderWidth: 1.5, backgroundColor: 'rgba(5,3,15,0.75)' },
  jackpotName: { fontSize: 10, fontWeight: '900', letterSpacing: 2, fontFamily: SERIF },
  jackpotValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 6, marginHorizontal: 10, marginVertical: 8 },
  statusPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 32, borderRadius: 16, borderWidth: 1.2, borderColor: 'rgba(60,216,200,0.5)', backgroundColor: 'rgba(5,3,15,0.7)' },
  statusLabel: { color: '#D8E0F0', fontSize: 9.5, fontWeight: '900', letterSpacing: 1 },
  statusValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  respinDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: GOLD, backgroundColor: 'transparent' },
  respinDotOn: { backgroundColor: GOLD },
  reelFrame: { borderRadius: 12, borderWidth: 2, borderColor: '#2A1608', padding: 6 },
  stud: { position: 'absolute', width: 7, height: 7, borderRadius: 3.5, backgroundColor: TURQ, borderWidth: 1, borderColor: SILVER },
  reelWindow: { borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(232,238,248,0.15)' },
  giant: { position: 'absolute', top: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 2, borderColor: GOLD, overflow: 'hidden' },
  respinBoard: { position: 'absolute', borderRadius: 8, backgroundColor: 'rgba(8,4,24,0.96)' },
  emptySlot: { width: '82%', height: '82%', borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(255,246,216,0.15)', backgroundColor: 'rgba(255,246,216,0.04)' },
  meter: { marginHorizontal: 12, marginTop: 10, alignItems: 'center', paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(5,3,15,0.8)', borderWidth: 1.5, borderColor: '#8A6A3A' },
  meterLabel: { color: '#C8D0E0', fontSize: 10, fontWeight: '900', letterSpacing: 3, fontFamily: SERIF },
  meterValue: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', fontFamily: SERIF },
  lineWins: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 8, minHeight: 26 },
  hint: { color: '#A8B0C8', fontSize: 11, fontWeight: '700' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, borderWidth: 1.5, backgroundColor: 'rgba(0,0,0,0.35)' },
  chipText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  session: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)' },
  sessionText: { color: '#C8D0E0', fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sessionSep: { color: '#5A6070', fontSize: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingHorizontal: 4 },
  sideBtn: { alignItems: 'center', gap: 2, width: 58 },
  sideText: { color: TURQ, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  betBox: { alignItems: 'center', gap: 4 },
  betLabel: { color: '#A8B0C8', fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  betRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(5,3,15,0.8)', borderRadius: 20, borderWidth: 1.5, borderColor: '#8A6A3A', paddingHorizontal: 6, paddingVertical: 4 },
  betBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: SILVER, alignItems: 'center', justifyContent: 'center' },
  betValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', minWidth: 70, textAlign: 'center' },
  dim: { opacity: 0.4 },
  spinWrap: { width: 86, height: 86, alignItems: 'center', justifyContent: 'center' },
  spinHalo: { position: 'absolute', width: 86, height: 86, borderRadius: 43, backgroundColor: MOONLIGHT },
  spinBtn: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  spinText: { color: NIGHT, fontSize: 11, fontWeight: '900', letterSpacing: 3, fontFamily: SERIF, marginTop: -2 },
  banner: { position: 'absolute', top: '28%', alignSelf: 'center' },
  bannerInner: { paddingHorizontal: 26, paddingVertical: 14, borderRadius: 16, borderWidth: 3, borderColor: TURQ, alignItems: 'center' },
  bannerText: { color: MOONLIGHT, fontSize: 28, fontWeight: '900', letterSpacing: 2, fontFamily: SERIF },
  bannerSub: { color: TURQ, fontSize: 13, fontWeight: '900', marginTop: 2, letterSpacing: 1 },
  toast: { position: 'absolute', bottom: 120, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14 },
  toastText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  modalBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  modalCard: { backgroundColor: '#140E2A', borderRadius: 16, borderWidth: 2, borderColor: '#8A6A3A', padding: 14 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { color: MOONLIGHT, fontSize: 16, fontWeight: '900', letterSpacing: 3, fontFamily: SERIF },
  payRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 1, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(232,238,248,0.12)' },
  payValue: { flex: 1, color: '#FFFFFF', fontSize: 13, fontWeight: '900', textAlign: 'right' },
  paySection: { color: TURQ, fontSize: 12, fontWeight: '900', letterSpacing: 2, marginTop: 8, fontFamily: SERIF },
  payNote: { color: '#C8D0E0', fontSize: 12, lineHeight: 17, flexShrink: 1 },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)', gap: 6 },
  histTime: { color: '#98A0B0', fontSize: 11, width: 52 },
  histStake: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', width: 62 },
  histTags: { color: TURQ, fontSize: 9.5, fontWeight: '900', flex: 1 },
  histWin: { fontSize: 12, fontWeight: '900' },
});
