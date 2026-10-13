import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { forwardRef, memo, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient as SvgLinearGradient, Path, Polygon, Polyline, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../api/client';
import { BookOfPharaohConfig, PharaohFreeSpin, PharaohLineWin, PharaohSpinRow, PharaohSymbol, fetchBookOfPharaohConfig, fetchBookOfPharaohHistory, spinBookOfPharaoh } from '../api/backend';
import { useGameState } from '../state/GameStateContext';
import GameInfoButton from '../components/GameInfoButton';

const GOLD = '#F5C542';
const GOLD_LIGHT = '#FFF1B0';
const GOLD_DEEP = '#9A6A10';
const LAPIS = '#1E4FA8';
const SERIF = 'serif';
const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const DEFAULT_BET = 10;
const TOAST_MS = 1800;
/** UK rule: a paid spin may not resolve faster than this, press to result. */
const MIN_SPIN_MS = 2500;
const FREE_SPIN_MS = 2100;
const LINE_COLORS = ['#FF3B4E', '#FFD23F', '#2FE07A', '#22B8FF', '#FF7AE0', '#FF9A3C', '#9B7BFF', '#3CF0D0', '#FF5FA0', '#B8F04A'];
const FILLER: PharaohSymbol[] = ['TEN', 'JACK', 'QUEEN', 'KING', 'ACE', 'ANKH', 'SCARAB', 'EYE', 'PHARAOH', 'BOOK'];
const SPECIAL_POOL: PharaohSymbol[] = ['TEN', 'JACK', 'QUEEN', 'KING', 'ACE', 'ANKH', 'SCARAB', 'EYE', 'PHARAOH'];
const NAMES: Record<PharaohSymbol, string> = {
  TEN: '10',
  JACK: 'Jack',
  QUEEN: 'Queen',
  KING: 'King',
  ACE: 'Ace',
  ANKH: 'Ankh',
  SCARAB: 'Scarab',
  EYE: 'Eye of Horus',
  PHARAOH: 'Pharaoh',
  BOOK: 'Book',
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function money(n: number): string {
  return `₹${n.toFixed(2)}`;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

const wrap = (len: number, i: number) => ((i % len) + len) % len;

function windowFor(strips: PharaohSymbol[][], stops: number[]): PharaohSymbol[][] {
  return stops.map((stop, r) => [-1, 0, 1].map((d) => strips[r][wrap(strips[r].length, stop + d)]));
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------- symbol art ----------
// Every symbol is drawn on a 100 x 100 canvas.

const RANK: Partial<Record<PharaohSymbol, { text: string; c: [string, string, string] }>> = {
  ACE: { text: 'A', c: ['#FFB0A0', '#D2341E', '#6A0A00'] },
  KING: { text: 'K', c: ['#A8D8FF', '#1E6FD2', '#0A2A6A'] },
  QUEEN: { text: 'Q', c: ['#B8F0C8', '#1E9A50', '#0A4020'] },
  JACK: { text: 'J', c: ['#E8C0FF', '#8A30C8', '#3A0A60'] },
  TEN: { text: '10', c: ['#FFE6A0', '#D88A10', '#6A3A00'] },
};

export const PharaohArt = memo(function PharaohArt({ s, size, dim, glow }: { s: PharaohSymbol; size: number; dim?: boolean; glow?: boolean }) {
  // Ids must be unique per drawing: a gradient defined in a hidden screen doesn't paint on web.
  const u = `bp${s}${useId().replace(/:/g, '')}`;
  const rank = RANK[s];
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" opacity={dim ? 0.3 : 1}>
      <Defs>
        <SvgLinearGradient id={`${u}g`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={GOLD_LIGHT} />
          <Stop offset="0.45" stopColor={GOLD} />
          <Stop offset="1" stopColor={GOLD_DEEP} />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${u}lap`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#6FA8FF" />
          <Stop offset="1" stopColor="#0E2A6A" />
        </SvgLinearGradient>
        <RadialGradient id={`${u}glow`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFF6C0" stopOpacity={0.95} />
          <Stop offset="1" stopColor="#F5C542" stopOpacity={0} />
        </RadialGradient>
        <SvgLinearGradient id={`${u}scar`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#5FE0C0" />
          <Stop offset="0.5" stopColor="#0E8A7A" />
          <Stop offset="1" stopColor="#063A40" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${u}book`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#B8432A" />
          <Stop offset="1" stopColor="#4A120A" />
        </SvgLinearGradient>
        {rank && (
          <SvgLinearGradient id={`${u}r`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={rank.c[0]} />
            <Stop offset="0.5" stopColor={rank.c[1]} />
            <Stop offset="1" stopColor={rank.c[2]} />
          </SvgLinearGradient>
        )}
      </Defs>
      {glow && <Circle cx={50} cy={50} r={50} fill={`url(#${u}glow)`} />}
      {rank && (
        <G>
          <SvgText x={51} y={74} fontSize={rank.text.length > 1 ? 56 : 70} fontWeight="900" fontFamily={SERIF} fill="#2A1A06" opacity={0.4} textAnchor="middle">
            {rank.text}
          </SvgText>
          <SvgText x={50} y={72} fontSize={rank.text.length > 1 ? 56 : 70} fontWeight="900" fontFamily={SERIF} fill={`url(#${u}r)`} stroke={GOLD} strokeWidth={2.5} textAnchor="middle">
            {rank.text}
          </SvgText>
        </G>
      )}
      {s === 'ANKH' && (
        <G>
          <Ellipse cx={50} cy={28} rx={15} ry={19} fill="none" stroke={`url(#${u}g)`} strokeWidth={9} />
          <Rect x={18} y={44} width={64} height={11} rx={3} fill={`url(#${u}g)`} />
          <Path d="M44 52 L 56 52 L 60 94 L 40 94 Z" fill={`url(#${u}g)`} />
          <Ellipse cx={50} cy={28} rx={15} ry={19} fill="none" stroke={GOLD_DEEP} strokeWidth={1.2} />
          <Rect x={46} y={60} width={8} height={4} fill={LAPIS} />
          <Rect x={47} y={70} width={6} height={4} fill="#C0392B" />
        </G>
      )}
      {s === 'SCARAB' && (
        <G>
          <Path d="M14 46 C 4 40, 4 22, 14 18 M86 46 C 96 40, 96 22, 86 18 M18 70 C 6 76, 8 90, 16 92 M82 70 C 94 76, 92 90, 84 92" stroke={GOLD_DEEP} strokeWidth={3} fill="none" strokeLinecap="round" />
          <Ellipse cx={50} cy={22} rx={14} ry={9} fill={`url(#${u}g)`} stroke={GOLD_DEEP} strokeWidth={1.5} />
          <Ellipse cx={50} cy={60} rx={30} ry={33} fill={`url(#${u}scar)`} stroke={GOLD} strokeWidth={3} />
          <Path d="M50 28 L 50 93" stroke={GOLD} strokeWidth={2.5} />
          <Path d="M24 50 C 34 44, 44 44, 50 48 C 56 44, 66 44, 76 50" stroke={GOLD} strokeWidth={2} fill="none" />
          <Ellipse cx={38} cy={58} rx={5} ry={10} fill="#FFFFFF" opacity={0.25} />
        </G>
      )}
      {s === 'EYE' && (
        <G>
          <Path d="M8 46 C 28 22, 72 22, 92 46 C 72 66, 28 66, 8 46 Z" fill="#FFF8E8" stroke={LAPIS} strokeWidth={5} />
          <Circle cx={50} cy={45} r={14} fill={`url(#${u}lap)`} stroke={GOLD} strokeWidth={2} />
          <Circle cx={50} cy={45} r={6} fill="#0A0A1A" />
          <Circle cx={46} cy={41} r={3} fill="#FFFFFF" opacity={0.8} />
          <Path d="M10 30 C 30 14, 70 14, 92 30" stroke={LAPIS} strokeWidth={6} fill="none" strokeLinecap="round" />
          <Path d="M42 62 L 38 90" stroke={LAPIS} strokeWidth={6} strokeLinecap="round" />
          <Path d="M58 62 C 64 72, 76 74, 82 70 C 84 80, 74 86, 66 82" stroke={LAPIS} strokeWidth={5} fill="none" strokeLinecap="round" />
          <Path d="M8 46 C 28 22, 72 22, 92 46" stroke={GOLD} strokeWidth={1.5} fill="none" />
        </G>
      )}
      {s === 'PHARAOH' && (
        <G>
          <Path d="M50 6 C 24 6, 14 28, 14 48 L 8 92 L 92 92 L 86 48 C 86 28, 76 6, 50 6 Z" fill={`url(#${u}g)`} stroke={GOLD_DEEP} strokeWidth={2} />
          {[16, 26, 36, 46, 56, 66, 76].map((y) => (
            <G key={y}>
              <Path d={`M${14 - (y - 16) * 0.12} ${y + 14} L 30 ${y + 14}`} stroke={LAPIS} strokeWidth={4} />
              <Path d={`M70 ${y + 14} L ${86 + (y - 16) * 0.12} ${y + 14}`} stroke={LAPIS} strokeWidth={4} />
            </G>
          ))}
          <Path d="M30 30 C 30 20, 70 20, 70 30 L 70 64 C 70 78, 30 78, 30 64 Z" fill="#E8B048" stroke={GOLD_DEEP} strokeWidth={1.5} />
          <Path d="M36 42 L 46 42 M54 42 L 64 42" stroke="#1A1A2A" strokeWidth={4} strokeLinecap="round" />
          <Path d="M34 38 L 48 38 M52 38 L 66 38" stroke={LAPIS} strokeWidth={2} />
          <Path d="M50 46 L 47 56 L 53 56" stroke={GOLD_DEEP} strokeWidth={2} fill="none" />
          <Path d="M43 63 C 47 66, 53 66, 57 63" stroke="#8A3A1A" strokeWidth={2.5} fill="none" strokeLinecap="round" />
          <Rect x={45} y={74} width={10} height={16} rx={2} fill={LAPIS} stroke={GOLD} strokeWidth={1.5} />
          <Path d="M44 14 C 46 8, 54 8, 56 14 L 50 22 Z" fill="#C0392B" stroke={GOLD_DEEP} strokeWidth={1} />
        </G>
      )}
      {s === 'BOOK' && (
        <G>
          <Rect x={14} y={12} width={72} height={80} rx={6} fill="#2A0A06" transform="translate(4 3)" opacity={0.5} />
          <Rect x={14} y={12} width={72} height={80} rx={6} fill={`url(#${u}book)`} stroke={GOLD} strokeWidth={3} />
          <Rect x={80} y={16} width={6} height={72} fill="#F4E4C0" />
          <Rect x={20} y={18} width={60} height={68} rx={3} fill="none" stroke={GOLD} strokeWidth={1.5} />
          <Ellipse cx={50} cy={52} rx={16} ry={18} fill={`url(#${u}g)`} stroke={GOLD_DEEP} strokeWidth={1.5} />
          <Path d="M50 36 L 50 70 M38 48 C 44 44, 56 44, 62 48" stroke={GOLD_DEEP} strokeWidth={2} fill="none" />
          <Path d="M30 40 C 22 34, 22 24, 30 22 M70 40 C 78 34, 78 24, 70 22" stroke={GOLD} strokeWidth={2.5} fill="none" />
          {[24, 76].map((x) => (
            <Circle key={x} cx={x} cy={80} r={3} fill={GOLD} />
          ))}
        </G>
      )}
    </Svg>
  );
});

// ---------- reels ----------

type ReelHandle = {
  start: () => void;
  land: (rows: PharaohSymbol[], delay: number) => Promise<void>;
  set: (rows: PharaohSymbol[]) => void;
};

const LOOP_CELLS = 16;
const LAND_CELLS = 10;
const filler = () => FILLER[Math.floor(Math.random() * FILLER.length)];

const Reel = forwardRef(function Reel({ initial, cell, width, dimmed, glowing }: { initial: PharaohSymbol[]; cell: number; width: number; dimmed: boolean[]; glowing: boolean[] }, ref: React.Ref<ReelHandle>) {
  const [content, setContent] = useState<PharaohSymbol[]>(initial);
  const y = useRef(new Animated.Value(0)).current;
  const pending = useRef<null | { kind: 'loop' } | { kind: 'land'; resolve: () => void; rows: PharaohSymbol[] }>(null);
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
      const loop = Animated.loop(Animated.timing(y, { toValue: 0, duration: 460, easing: Easing.linear, useNativeDriver: true }));
      loopRef.current = loop;
      loop.start();
      return;
    }
    y.setValue(-(content.length - 3) * cell);
    Animated.timing(y, { toValue: 0, duration: 460, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }).start(() => {
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
            <PharaohArt s={s} size={Math.min(width, cell) * 0.88} dim={settled && dimmed[i]} glow={settled && glowing[i]} />
          </View>
        ))}
      </Animated.View>
    </View>
  );
});

/** The special symbol filling a whole reel: a gold-lit column that unrolls from the middle. */
function ExpandColumn({ s, width, height, progress }: { s: PharaohSymbol; width: number; height: number; progress: Animated.Value }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, top: 0, width, height, transform: [{ scaleY: progress }], opacity: progress.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 1] }) }}
    >
      <LinearGradient colors={['#FFE89A', '#F5C542', '#C88A10', '#F5C542', '#FFE89A']} style={[StyleSheet.absoluteFill, { borderRadius: 6 }]} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'space-around', paddingVertical: 4 }}>
        {[0, 1, 2].map((i) => (
          <PharaohArt key={i} s={s} size={Math.min(width, height / 3) * 0.88} />
        ))}
      </View>
    </Animated.View>
  );
}

// ---------- scenery ----------

const STARS = Array.from({ length: 44 }, (_, i) => ({ x: ((i * 37) % 100) / 100, y: ((i * 53) % 46) / 100, r: (i % 3) * 0.45 + 0.5, twinkle: i % 4 === 0 }));

/** Night over Giza: starry sky, crescent moon, three pyramids and dunes. In free spins the great pyramid beams light into a violet sky. */
const Desert = memo(function Desert({ w, h, free, pyramids }: { w: number; h: number; free: boolean; pyramids?: boolean }) {
  const u = useId().replace(/:/g, '');
  const base = h * 0.6;
  const big = { x: w * 0.5, top: base - w * 0.34, half: w * 0.36 };
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id={`bpSky${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={free ? '#1A0636' : '#050A26'} />
          <Stop offset="0.45" stopColor={free ? '#4A1460' : '#16245A'} />
          <Stop offset="0.62" stopColor={free ? '#B0482A' : '#3A3060'} />
          <Stop offset="1" stopColor="#140A04" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`bpPyrL${u}`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#8A6430" />
          <Stop offset="1" stopColor="#5A3E1C" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`bpPyrR${u}`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#3A2410" />
          <Stop offset="1" stopColor="#24160A" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`bpBeam${u}`} x1="0" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor="#FFF1B0" stopOpacity={0.85} />
          <Stop offset="1" stopColor="#FFF1B0" stopOpacity={0} />
        </SvgLinearGradient>
        <SvgLinearGradient id={`bpDune${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#6A4A22" />
          <Stop offset="1" stopColor="#1A0E04" />
        </SvgLinearGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill={`url(#bpSky${u})`} />
      {STARS.map((s, i) => (
        <Circle key={i} cx={s.x * w} cy={s.y * h} r={s.r} fill="#FFFFFF" opacity={0.75} />
      ))}
      {/* Crescent moon */}
      <Circle cx={w * 0.84} cy={h * 0.08} r={13} fill="#FFF4D0" />
      <Circle cx={w * 0.84 + 6} cy={h * 0.08 - 3} r={12} fill={free ? '#1A0636' : '#050A26'} />
      {pyramids && free && <Polygon points={`${big.x - 6},${big.top} ${big.x + 6},${big.top} ${big.x + w * 0.12},0 ${big.x - w * 0.12},0`} fill={`url(#bpBeam${u})`} />}
      {/* Small pyramids behind, then the great one */}
      {pyramids && [
        { x: w * 0.16, half: w * 0.2, top: base - w * 0.17 },
        { x: w * 0.86, half: w * 0.24, top: base - w * 0.21 },
        big,
      ].map((p, i) => (
        <G key={i}>
          <Polygon points={`${p.x},${p.top} ${p.x - p.half},${base} ${p.x},${base}`} fill={`url(#bpPyrL${u})`} />
          <Polygon points={`${p.x},${p.top} ${p.x + p.half},${base} ${p.x},${base}`} fill={`url(#bpPyrR${u})`} />
          {Array.from({ length: 6 }, (_, k) => {
            const t = (k + 1) / 7;
            const y = p.top + (base - p.top) * t;
            return <Path key={k} d={`M${p.x - p.half * t} ${y} L ${p.x + p.half * t} ${y}`} stroke="#000000" strokeOpacity={0.18} strokeWidth={1} />;
          })}
          <Polygon points={`${p.x},${p.top} ${p.x - p.half * 0.12},${p.top + (base - p.top) * 0.12} ${p.x + p.half * 0.12},${p.top + (base - p.top) * 0.12}`} fill={GOLD} />
        </G>
      ))}
      <Path d={`M0 ${base - 6} C ${w * 0.25} ${base - 22}, ${w * 0.45} ${base + 6}, ${w * 0.7} ${base - 10} C ${w * 0.85} ${base - 18}, ${w} ${base - 4}, ${w} ${base - 4} L ${w} ${h} L 0 ${h} Z`} fill={`url(#bpDune${u})`} />
    </Svg>
  );
});

/** A few stars that twinkle over the desert sky. */
function Twinkles({ w, h, twinkle }: { w: number; h: number; twinkle: Animated.Value }) {
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, opacity: twinkle }}>
      <Svg width={w} height={h}>
        {STARS.filter((s) => s.twinkle).map((s, i) => (
          <G key={i}>
            <Path d={`M${s.x * w - 5} ${s.y * h} L ${s.x * w + 5} ${s.y * h} M${s.x * w} ${s.y * h - 5} L ${s.x * w} ${s.y * h + 5}`} stroke="#FFFFFF" strokeWidth={1} />
            <Circle cx={s.x * w} cy={s.y * h} r={1.8} fill="#FFFFFF" />
          </G>
        ))}
      </Svg>
    </Animated.View>
  );
}

/** Title plaque: a winged scarab over the name, set in black and gold. */
function Title({ width, free }: { width: number; free: boolean }) {
  const u = useId().replace(/:/g, '');
  return (
    <Svg width={width} height={width * 0.3} viewBox="0 0 360 108">
      <Defs>
        <SvgLinearGradient id={`bpT${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={GOLD_LIGHT} />
          <Stop offset="0.5" stopColor={GOLD} />
          <Stop offset="1" stopColor={GOLD_DEEP} />
        </SvgLinearGradient>
        <SvgLinearGradient id={`bpWing${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#4A8AFF" />
          <Stop offset="1" stopColor="#0E2A6A" />
        </SvgLinearGradient>
      </Defs>
      {/* Wings: lapis feathers edged in gold */}
      {[-1, 1].map((d) => (
        <G key={d}>
          <Path d={`M${180 + d * 14} 22 C ${180 + d * 60} 4, ${180 + d * 120} 6, ${180 + d * 150} 18 C ${180 + d * 120} 26, ${180 + d * 70} 34, ${180 + d * 14} 34 Z`} fill={`url(#bpWing${u})`} stroke={GOLD} strokeWidth={1.5} />
          {[0, 1, 2, 3, 4].map((k) => (
            <Path key={k} d={`M${180 + d * (34 + k * 22)} ${12 - k * 0.5} L ${180 + d * (30 + k * 22)} ${30 - k * 1.2}`} stroke={GOLD} strokeWidth={1} opacity={0.8} />
          ))}
        </G>
      ))}
      <Ellipse cx={180} cy={22} rx={14} ry={15} fill="#0E8A7A" stroke={GOLD} strokeWidth={2} />
      <Circle cx={180} cy={8} r={7} fill="#E84A1A" stroke={GOLD} strokeWidth={1.5} />
      <Path d="M180 9 L 180 36 M168 20 C 174 17, 186 17, 192 20" stroke={GOLD} strokeWidth={1.5} fill="none" />
      {/* Name plate */}
      <Rect x={24} y={42} width={312} height={46} rx={6} fill="#0A0604" stroke={GOLD} strokeWidth={2.5} />
      <Rect x={29} y={47} width={302} height={36} rx={4} fill="none" stroke={GOLD_DEEP} strokeWidth={1} />
      <SvgText x={181} y={76} fontSize={30} fontWeight="900" fontFamily={SERIF} fill="#000000" textAnchor="middle" letterSpacing={2}>
        BOOK OF PHARAOH
      </SvgText>
      <SvgText x={180} y={75} fontSize={30} fontWeight="900" fontFamily={SERIF} fill={`url(#bpT${u})`} textAnchor="middle" letterSpacing={2}>
        BOOK OF PHARAOH
      </SvgText>
      <SvgText x={180} y={102} fontSize={10.5} fontWeight="900" fontFamily={SERIF} fill={free ? '#FFD9A0' : '#E6D6B0'} textAnchor="middle" letterSpacing={3}>
        {free ? 'FREE SPINS · THE SPECIAL SYMBOL EXPANDS' : '10 LINES · 3 BOOKS OPEN THE TOMB'}
      </SvgText>
    </Svg>
  );
}

const GLYPHS = ['ankh', 'eye', 'bird', 'wave', 'sun', 'feather'] as const;

/** A carved band of hieroglyphs in gold on lapis. */
const GlyphBand = memo(function GlyphBand({ width }: { width: number }) {
  const n = Math.floor(width / 22);
  const step = width / n;
  return (
    <Svg width={width} height={18}>
      <Rect x={0} y={0} width={width} height={18} fill="#0E2A6A" />
      <Rect x={0} y={0} width={width} height={2} fill={GOLD} />
      <Rect x={0} y={16} width={width} height={2} fill={GOLD} />
      {Array.from({ length: n }, (_, i) => {
        const cx = step * i + step / 2;
        const g = GLYPHS[i % GLYPHS.length];
        return (
          <G key={i} stroke={GOLD} strokeWidth={1.3} fill="none" strokeLinecap="round">
            {g === 'ankh' && <Path d={`M${cx} 8 L ${cx} 14 M${cx - 3} 8.5 L ${cx + 3} 8.5 M${cx} 8 C ${cx - 3} 6, ${cx - 2} 3, ${cx} 3 C ${cx + 2} 3, ${cx + 3} 6, ${cx} 8`} />}
            {g === 'eye' && <Path d={`M${cx - 5} 8 C ${cx - 2} 5, ${cx + 2} 5, ${cx + 5} 8 C ${cx + 2} 11, ${cx - 2} 11, ${cx - 5} 8 M${cx - 1} 11 L ${cx - 2} 14`} />}
            {g === 'bird' && <Path d={`M${cx - 4} 13 L ${cx + 2} 13 L ${cx + 4} 9 L ${cx + 1} 5 L ${cx - 1} 6 M${cx - 1} 13 L ${cx - 1} 15`} />}
            {g === 'wave' && <Path d={`M${cx - 5} 9 L ${cx - 3} 7 L ${cx - 1} 9 L ${cx + 1} 7 L ${cx + 3} 9 L ${cx + 5} 7`} />}
            {g === 'sun' && <Circle cx={cx} cy={9} r={3.5} />}
            {g === 'feather' && <Path d={`M${cx} 14 L ${cx} 4 C ${cx + 3} 6, ${cx + 3} 10, ${cx} 12`} />}
          </G>
        );
      })}
    </Svg>
  );
});

/** A column striped in lapis and gold like the pharaoh's headdress, either side of the reels. */
const NemesColumn = memo(function NemesColumn({ width, height }: { width: number; height: number }) {
  const u = useId().replace(/:/g, '');
  const stripes = Math.floor(height / 10);
  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgLinearGradient id={`bpNem${u}`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#000000" stopOpacity={0.35} />
          <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0.15} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0.35} />
        </SvgLinearGradient>
      </Defs>
      {Array.from({ length: stripes }, (_, i) => (
        <Rect key={i} x={0} y={(i * height) / stripes} width={width} height={height / stripes} fill={i % 2 ? '#1E4FA8' : GOLD} />
      ))}
      <Rect x={0} y={0} width={width} height={height} fill={`url(#bpNem${u})`} />
      <Rect x={0.5} y={0.5} width={width - 1} height={height - 1} fill="none" stroke={GOLD_DEEP} strokeWidth={1} />
    </Svg>
  );
});

/** The spin button: a gold pyramid whose eye capstone glows; rays turn behind it while the reels play. */
function PyramidButton({ size, lit, glow, rays }: { size: number; lit: boolean; glow: Animated.Value; rays: Animated.Value }) {
  const u = useId().replace(/:/g, '');
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.9] }), transform: [{ rotate: rays.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * Math.PI) / 6;
            return <Polygon key={i} points={`50,50 ${50 + 50 * Math.cos(a - 0.09)},${50 + 50 * Math.sin(a - 0.09)} ${50 + 50 * Math.cos(a + 0.09)},${50 + 50 * Math.sin(a + 0.09)}`} fill={lit ? '#FFE89A' : '#8A7A60'} opacity={0.55} />;
          })}
        </Svg>
      </Animated.View>
      <Svg width={size * 0.86} height={size * 0.86} viewBox="0 0 100 100">
        <Defs>
          <SvgLinearGradient id={`bpPyL${u}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={lit ? GOLD_LIGHT : '#B8B0A0'} />
            <Stop offset="1" stopColor={lit ? GOLD : '#6A6458'} />
          </SvgLinearGradient>
          <SvgLinearGradient id={`bpPyR${u}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={lit ? '#C88A10' : '#5A5448'} />
            <Stop offset="1" stopColor={lit ? '#6A4208' : '#2A2620'} />
          </SvgLinearGradient>
        </Defs>
        <Polygon points="50,6 6,90 50,90" fill={`url(#bpPyL${u})`} stroke="#3A2404" strokeWidth={2.5} strokeLinejoin="round" />
        <Polygon points="50,6 94,90 50,90" fill={`url(#bpPyR${u})`} stroke="#3A2404" strokeWidth={2.5} strokeLinejoin="round" />
        {[0.42, 0.58, 0.74].map((t) => (
          <Path key={t} d={`M${50 - 44 * t} ${6 + 84 * t} L ${50 + 44 * t} ${6 + 84 * t}`} stroke="#3A2404" strokeOpacity={0.35} strokeWidth={1.2} />
        ))}
        {/* Eye of Horus capstone */}
        <Path d="M36 40 C 42 32, 58 32, 64 40 C 58 47, 42 47, 36 40 Z" fill="#FFF8E8" stroke="#0E2A6A" strokeWidth={2.2} />
        <Circle cx={50} cy={40} r={5} fill="#0E2A6A" />
        <Circle cx={48.5} cy={38.5} r={1.6} fill="#FFFFFF" />
        <Path d="M46 46 L 44 54 M55 46 C 58 51, 63 51, 64 48" stroke="#0E2A6A" strokeWidth={2} fill="none" strokeLinecap="round" />
      </Svg>
    </View>
  );
}

/** An obelisk-shaped side button. */
function Obelisk({ icon, label, onPress }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; label: string; onPress: () => void }) {
  const u = useId().replace(/:/g, '');
  return (
    <Pressable onPress={onPress} hitSlop={6} style={({ pressed }) => [{ width: 52, height: 96, alignItems: 'center' }, pressed && { transform: [{ scale: 0.94 }] }]}>
      <Svg width={52} height={96} viewBox="0 0 52 96" style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinearGradient id={`bpOb${u}`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#B8945A" />
            <Stop offset="0.5" stopColor="#7A5A2A" />
            <Stop offset="1" stopColor="#4A3214" />
          </SvgLinearGradient>
        </Defs>
        <Polygon points="26,2 36,14 16,14" fill={GOLD} stroke="#3A2404" strokeWidth={1.5} strokeLinejoin="round" />
        <Polygon points="16,14 36,14 42,94 10,94" fill={`url(#bpOb${u})`} stroke="#3A2404" strokeWidth={1.5} strokeLinejoin="round" />
        <Rect x={6} y={90} width={40} height={6} rx={1} fill="#5A3E1C" stroke="#3A2404" strokeWidth={1} />
      </Svg>
      <View style={{ marginTop: 26, alignItems: 'center' }}>
        <MaterialCommunityIcons name={icon} size={18} color={GOLD_LIGHT} />
        <Text style={styles.obeliskText}>{label}</Text>
      </View>
    </Pressable>
  );
}

/** Gold coins raining down the screen on a big win. */
function CoinShower({ w, h, progress }: { w: number; h: number; progress: Animated.Value }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, overflow: 'hidden' }}>
      {Array.from({ length: 22 }, (_, i) => {
        const d = ((i * 7) % 10) / 22;
        const x = ((i * 41) % 100) / 100;
        const size = 16 + ((i * 3) % 4) * 4;
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
              <Path d="M10 6 L 10 14 M8 8 L 12 8" stroke={GOLD_DEEP} strokeWidth={1.2} />
            </Svg>
          </Animated.View>
        );
      })}
    </View>
  );
}

/** Home tile art: the book glowing in front of the pyramids at night. */
export function BookOfPharaohTileArt({ size }: { size: number }) {
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size }} pointerEvents="none">
      <Desert w={size} h={size} free={false} pyramids />
      <View style={{ position: 'absolute', left: size * 0.22, top: size * 0.3 }}>
        <PharaohArt s="BOOK" size={size * 0.56} glow />
      </View>
    </View>
  );
}

/** Opening the book: its pages flick through the symbols and stop on the special one. */
function BookOpening({ special, onDone }: { special: PharaohSymbol; onDone: () => void }) {
  const [shown, setShown] = useState<PharaohSymbol>('ANKH');
  const [done, setDone] = useState(false);
  const open = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let alive = true;
    Animated.timing(open, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    (async () => {
      await wait(500);
      // Flick fast, then slow down onto the special symbol.
      const delays = [70, 70, 70, 80, 80, 90, 100, 110, 130, 150, 180, 220, 270, 330];
      for (let i = 0; i < delays.length; i++) {
        if (!alive) return;
        setShown(i === delays.length - 1 ? special : SPECIAL_POOL[(i * 4 + 3) % SPECIAL_POOL.length]);
        await wait(delays[i]);
      }
      if (!alive) return;
      setDone(true);
      await wait(1400);
      if (alive) onDone();
    })();
    return () => {
      alive = false;
    };
    // Runs once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={styles.bookOverlay} pointerEvents="none">
      <Animated.View style={{ transform: [{ scale: open.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }], opacity: open }}>
        <View style={styles.bookOpen}>
          <LinearGradient colors={['#F8EBCB', '#E6CF98']} style={styles.page}>
            <Text style={styles.pageHiero}>☥ ✦ ☥{'\n'}✦ ☥ ✦</Text>
          </LinearGradient>
          <View style={styles.spine} />
          <LinearGradient colors={['#E6CF98', '#F8EBCB']} style={[styles.page, { alignItems: 'center', justifyContent: 'center' }]}>
            <PharaohArt s={shown} size={96} glow={done} />
          </LinearGradient>
        </View>
        <Text style={styles.bookCaption}>{done ? `${NAMES[special].toUpperCase()} WILL EXPAND` : 'CHOOSING THE SPECIAL SYMBOL…'}</Text>
      </Animated.View>
    </View>
  );
}

// ---------- screen ----------

const START: PharaohSymbol[][] = [
  ['ACE', 'PHARAOH', 'KING'],
  ['QUEEN', 'BOOK', 'ANKH'],
  ['EYE', 'PHARAOH', 'TEN'],
  ['JACK', 'BOOK', 'SCARAB'],
  ['KING', 'PHARAOH', 'ACE'],
];

type FreeState = { active: boolean; played: number; total: number; won: number; special: PharaohSymbol | null };
const NO_FREE: FreeState = { active: false, played: 0, total: 0, won: 0, special: null };

export default function BookOfPharaohScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W, height: screenH } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<BookOfPharaohConfig | null>(null);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [busy, setBusy] = useState(false);
  const [shownBalance, setShownBalance] = useState(coins);
  const [meter, setMeter] = useState<{ label: string; amount: number | null; tone: 'idle' | 'win' | 'return' | 'lose' }>({ label: 'MAY RA GUIDE YOU', amount: null, tone: 'idle' });
  const [winLines, setWinLines] = useState<PharaohLineWin[]>([]);
  const [bookGlow, setBookGlow] = useState(false);
  const [expand, setExpand] = useState<{ reels: number[]; s: PharaohSymbol } | null>(null);
  const [free, setFree] = useState<FreeState>(NO_FREE);
  const [opening, setOpening] = useState<{ special: PharaohSymbol; done: () => void } | null>(null);
  const [banner, setBanner] = useState<{ title: string; sub?: string } | null>(null);
  const [panel, setPanel] = useState<'pay' | 'history' | null>(null);
  const [history, setHistory] = useState<PharaohSpinRow[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sessionNet, setSessionNet] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [rows, setRows] = useState<PharaohSymbol[][]>(START);
  const [sceneH, setSceneH] = useState(0);
  const [showering, setShowering] = useState(false);

  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const sessionStart = useRef(Date.now());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerAnim = useRef(new Animated.Value(0)).current;
  const twinkle = useRef(new Animated.Value(0.3)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const rays = useRef(new Animated.Value(0)).current;
  const coinFall = useRef(new Animated.Value(0)).current;
  const altarId = `bpAltar${useId().replace(/:/g, '')}`;
  const expandAnim = useRef(new Animated.Value(0)).current;
  const reels = [useRef<ReelHandle>(null), useRef<ReelHandle>(null), useRef<ReelHandle>(null), useRef<ReelHandle>(null), useRef<ReelHandle>(null)];

  const lineCount = config?.lineCount ?? 10;
  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const lines = config?.lines ?? [];
  const betLevels = useMemo(() => BET_LEVELS.filter((b) => b >= minStake && b <= maxStake), [minStake, maxStake]);

  useEffect(() => {
    if (!busyRef.current) setShownBalance(coins);
  }, [coins]);

  useEffect(() => {
    mountedRef.current = true;
    fetchBookOfPharaohConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => mountedRef.current && setToast('Could not load the game — check your connection.'));
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const stars = Animated.loop(
      Animated.sequence([
        Animated.timing(twinkle, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(twinkle, { toValue: 0.2, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    const capstone = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    stars.start();
    capstone.start();
    return () => {
      mountedRef.current = false;
      clearInterval(clock);
      stars.stop();
      capstone.stop();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [twinkle, glow]);

  // The rays behind the pyramid turn while a spin plays out.
  useEffect(() => {
    if (!busy) {
      rays.stopAnimation();
      return;
    }
    rays.setValue(0);
    const turning = Animated.loop(Animated.timing(rays, { toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: true }));
    turning.start();
    return () => turning.stop();
  }, [busy, rays]);

  /** Gold coins rain down the screen; runs alongside the win banner. */
  const shower = useCallback(async () => {
    if (!mountedRef.current) return;
    coinFall.setValue(0);
    setShowering(true);
    await new Promise<void>((r) => Animated.timing(coinFall, { toValue: 1, duration: 2200, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => r()));
    if (mountedRef.current) setShowering(false);
  }, [coinFall]);

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const flashBanner = useCallback(
    async (title: string, sub?: string, hold = 1000) => {
      setBanner({ title, sub });
      bannerAnim.setValue(0);
      await new Promise<void>((r) => Animated.spring(bannerAnim, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }).start(() => r()));
      await wait(hold);
      await new Promise<void>((r) => Animated.timing(bannerAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => r()));
      if (mountedRef.current) setBanner(null);
    },
    [bannerAnim]
  );

  const countUp = useCallback(async (label: string, from: number, to: number) => {
    const steps = Math.min(28, Math.max(6, Math.round(to - from)));
    for (let i = 1; i <= steps; i++) {
      if (!mountedRef.current) return;
      setMeter({ label, amount: round2(from + ((to - from) * i) / steps), tone: 'win' });
      await wait(26);
    }
  }, []);

  /** Spins all reels to `target`, stopping left to right with the last landing `lastAt` ms after `t0`. */
  const spinTo = useCallback(
    async (target: PharaohSymbol[][], t0: number, lastAt: number) => {
      const elapsed = Date.now() - t0;
      await Promise.all(target.map((r, i) => reels[i].current?.land(r, Math.max(0, lastAt - (4 - i) * 260 - elapsed))));
      if (mountedRef.current) setRows(target);
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
    setExpand(null);
    setBookGlow(false);
    setMeter({ label: 'THE REELS TURN…', amount: null, tone: 'idle' });
    setShownBalance((b) => round2(b - bet));
    const t0 = Date.now();
    reels.forEach((r) => r.current?.start());

    let result: Awaited<ReturnType<typeof spinBookOfPharaoh>>;
    try {
      result = await spinBookOfPharaoh(bet);
    } catch (err) {
      reels.forEach((r, i) => r.current?.set(rows[i]));
      setShownBalance((b) => round2(b + bet));
      setMeter({ label: 'MAY RA GUIDE YOU', amount: null, tone: 'idle' });
      showToast(errorMessage(err));
      busyRef.current = false;
      setBusy(false);
      return;
    }
    if (!mountedRef.current) return;
    const { outcome } = result;
    const payout = Number(result.spin.payout);
    const scale = (stakes: number) => round2(stakes * bet);

    await spinTo(windowFor(config.strips, outcome.stops), t0, MIN_SPIN_MS - 460);
    if (!mountedRef.current) return;
    setWinLines(outcome.lines);
    if (outcome.books >= 3) setBookGlow(true);
    let shown = 0;
    if (outcome.baseWin > 0) {
      shown = scale(outcome.baseWin);
      await countUp('WIN', 0, shown);
      await wait(500);
    }

    if (outcome.special) {
      const special = outcome.special;
      await flashBanner(`${config.freeSpins} FREE SPINS!`, `${outcome.books} books found`, 1100);
      setWinLines([]);
      setBookGlow(false);
      await new Promise<void>((done) => setOpening({ special, done }));
      setOpening(null);
      let state: FreeState = { active: true, played: 0, total: config.freeSpins, won: 0, special };
      setFree(state);
      for (const fs of outcome.freeSpins as PharaohFreeSpin[]) {
        if (!mountedRef.current) return;
        setWinLines([]);
        setExpand(null);
        setBookGlow(false);
        const ft0 = Date.now();
        reels.forEach((r) => r.current?.start());
        await spinTo(windowFor(config.strips, fs.stops), ft0, FREE_SPIN_MS - 460);
        state = { ...state, played: state.played + 1 };
        setFree(state);
        if (fs.lines.length) setWinLines(fs.lines);
        const plain = scale(fs.win - fs.expand);
        if (plain > 0) {
          await countUp('WIN', shown, round2(shown + plain));
          shown = round2(shown + plain);
          state = { ...state, won: round2(state.won + plain) };
          setFree(state);
          await wait(350);
        }
        if (fs.expandReels.length > 0) {
          setWinLines([]);
          expandAnim.setValue(0);
          setExpand({ reels: fs.expandReels, s: special });
          await new Promise<void>((r) => Animated.timing(expandAnim, { toValue: 1, duration: 650, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }).start(() => r()));
          const got = scale(fs.expand);
          await flashBanner(`+${money(got)}`, `${NAMES[special]} expands on ${fs.expandReels.length} reels`, 800);
          await countUp('WIN', shown, round2(shown + got));
          shown = round2(shown + got);
          state = { ...state, won: round2(state.won + got) };
          setFree(state);
        }
        if (fs.retrigger > 0) {
          setBookGlow(true);
          await flashBanner(`+${fs.retrigger} FREE SPINS`, 'The book opens again', 1000);
          state = { ...state, total: state.total + fs.retrigger };
          setFree(state);
        }
        await wait(fs.win > 0 ? 500 : 250);
      }
      setExpand(null);
      if (state.won > 0) void shower();
      await flashBanner('TREASURE WON', money(state.won), 1500);
      setFree(NO_FREE);
    }

    // Only a return above the stake is celebrated; a smaller one is shown plainly.
    if (payout > bet) {
      if (shown !== payout) await countUp('WIN', shown, payout);
      if (payout >= bet * 20 && !outcome.special) void shower();
      if (payout >= bet * 20 && !outcome.special) await flashBanner(payout >= bet * 100 ? 'MEGA WIN' : 'BIG WIN', money(payout), 1300);
      setMeter({ label: 'WIN', amount: payout, tone: 'win' });
    } else if (payout > 0) {
      setMeter({ label: 'RETURNED', amount: payout, tone: 'return' });
    } else {
      setMeter({ label: 'THE SANDS WERE SILENT', amount: null, tone: 'lose' });
    }

    setShownBalance((b) => round2(b + payout));
    setSessionNet((n) => round2(n + payout - bet));
    refreshWallet();
    if (panel === 'history') fetchBookOfPharaohHistory(30).then((h) => mountedRef.current && setHistory(h)).catch(() => {});
    busyRef.current = false;
    if (mountedRef.current) setBusy(false);
    // reels are stable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, bet, shownBalance, rows, panel, flashBanner, countUp, spinTo, refreshWallet, showToast, expandAnim, shower]);

  const stepBet = (dir: 1 | -1) => {
    if (busy) return;
    const idx = Math.max(0, betLevels.indexOf(bet));
    setBet(betLevels[Math.max(0, Math.min(betLevels.length - 1, idx + dir))] ?? bet);
  };

  const openHistory = () => {
    setPanel('history');
    setHistory(null);
    fetchBookOfPharaohHistory(30)
      .then((h) => mountedRef.current && setHistory(h))
      .catch(() => mountedRef.current && setHistory([]));
  };

  // ---------- layout ----------
  const cabW = Math.min(W - 12, 470);
  const colW = 16;
  const reelGap = 3;
  // Housing: 6px side margin, a striped column each side, then the gold frame (3px border + 4px padding); each reel window has a 1px border.
  const reelsW = cabW - 12 - colW * 2 - 14;
  const reelW = Math.floor((reelsW - reelGap * 4 - 10) / 5);
  const cell = Math.floor(Math.min(reelW * 1.05, 96));
  const reelsH = cell * 3;

  const litCells = useMemo(() => {
    const lit = [0, 1, 2, 3, 4].map(() => [false, false, false]);
    winLines.forEach((w) => lines[w.line]?.forEach((row, reel) => reel < w.count && (lit[reel][row] = true)));
    return lit;
  }, [winLines, lines]);
  const dimFor = (reel: number) => {
    if (bookGlow) return rows[reel].map((s) => s !== 'BOOK');
    return winLines.length > 0 ? litCells[reel].map((x) => !x) : [false, false, false];
  };
  const glowFor = (reel: number) => (bookGlow ? rows[reel].map((s) => s === 'BOOK') : [false, false, false]);

  const minutes = Math.floor((now - sessionStart.current) / 60000);
  const seconds = Math.floor(((now - sessionStart.current) % 60000) / 1000);
  const meterColor = meter.tone === 'win' ? '#9CFFB0' : meter.tone === 'return' ? '#FFD9A0' : GOLD_LIGHT;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={free.active ? ['#1A0636', '#05020F'] : ['#050A26', '#020308']} style={StyleSheet.absoluteFill} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={GOLD} />
          <Text style={styles.title}>BOOK OF PHARAOH</Text>
        </Pressable>
        <View style={styles.balancePill}>
          <MaterialCommunityIcons name="treasure-chest" size={16} color={GOLD} />
          <Text style={styles.balanceText}>{money(shownBalance)}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24, alignItems: 'center' }} scrollEnabled={!busy}>
        <View style={[styles.cabinet, { width: cabW }]} onLayout={(e) => setSceneH(Math.round(e.nativeEvent.layout.height))}>
          {sceneH > 0 && <Desert w={cabW} h={sceneH} free={free.active} />}
          {sceneH > 0 && <Twinkles w={cabW} h={sceneH} twinkle={twinkle} />}
          <View style={{ alignItems: 'center', marginTop: 8 }}>
            <Title width={cabW * 0.94} free={free.active} />
          </View>

          {/* Free spins: spins left, the special symbol and the treasure, in cartouches */}
          {free.active && (
            <View style={styles.freeBar}>
              <View style={styles.cartouche}>
                <Text style={styles.cartoucheLabel}>FREE SPINS</Text>
                <Text style={styles.cartoucheValue}>
                  {free.played} / {free.total}
                </Text>
                <View style={styles.cartoucheTie} />
              </View>
              <View style={[styles.cartouche, { flexDirection: 'row', gap: 6 }]}>
                <Text style={styles.cartoucheLabel}>SPECIAL</Text>
                {free.special && <PharaohArt s={free.special} size={30} glow />}
                <View style={styles.cartoucheTie} />
              </View>
              <View style={styles.cartouche}>
                <Text style={styles.cartoucheLabel}>TREASURE</Text>
                <Text style={styles.cartoucheValue}>{money(free.won)}</Text>
                <View style={styles.cartoucheTie} />
              </View>
            </View>
          )}

          {/* Tomb housing: hieroglyph bands, striped columns and the gold reel frame */}
          <View style={{ marginHorizontal: 6, marginTop: 4 }}>
            <GlyphBand width={cabW - 12} />
            <View style={{ flexDirection: 'row', backgroundColor: '#0A0604' }}>
              <NemesColumn width={colW} height={reelsH + 16} />
              <View style={styles.reelFrame}>
                <View style={{ flexDirection: 'row', gap: reelGap }}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <View key={i} style={styles.reelWindow}>
                      <LinearGradient colors={free.active ? ['#3A1450', '#1A0A2A'] : ['#1E2A5A', '#0A1030']} style={StyleSheet.absoluteFill} />
                      <Reel ref={reels[i]} initial={START[i]} cell={cell} width={reelW} dimmed={dimFor(i)} glowing={glowFor(i)} />
                      {expand && expand.reels.includes(i) && <ExpandColumn s={expand.s} width={reelW} height={reelsH} progress={expandAnim} />}
                    </View>
                  ))}
                </View>
                {lines.length > 0 && (
                  <Svg width={reelsW} height={reelsH + 2} style={{ position: 'absolute', left: 4, top: 4 }} pointerEvents="none">
                    {winLines.map((w) => {
                      const pts = lines[w.line].map((row, reel) => `${reel * (reelW + 2 + reelGap) + reelW / 2 + 1},${row * cell + cell / 2 + 1}`).join(' ');
                      return (
                        <G key={w.line}>
                          <Polyline points={pts} fill="none" stroke={LINE_COLORS[w.line]} strokeOpacity={0.35} strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" />
                          <Polyline points={pts} fill="none" stroke={LINE_COLORS[w.line]} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
                        </G>
                      );
                    })}
                  </Svg>
                )}
              </View>
              <NemesColumn width={colW} height={reelsH + 16} />
            </View>
            <GlyphBand width={cabW - 12} />
          </View>

          {/* Win cartouche */}
          <View style={styles.meterWrap}>
            <View style={styles.meterCartouche}>
              <Text style={[styles.meterLabel, { color: meterColor }]} numberOfLines={1}>
                {meter.label}
              </Text>
              <Text style={[styles.meterValue, { color: meterColor }]} numberOfLines={1} adjustsFontSizeToFit>
                {meter.amount === null ? '☥  ✦  ☥' : money(meter.amount)}
              </Text>
            </View>
            <View style={styles.meterTie} />
          </View>
        </View>

        {/* Line wins */}
        <View style={[styles.lineWinsRow, { width: cabW }]}>
          {winLines.length === 0 ? (
            <Text style={styles.lineWinHint}>{lineCount} lines · the book is wild and scatter</Text>
          ) : (
            winLines.map((w) => (
              <View key={w.line} style={[styles.lineChip, { borderColor: LINE_COLORS[w.line] }]}>
                <Text style={[styles.lineChipText, { color: LINE_COLORS[w.line] }]}>
                  L{w.line + 1} {w.count}×
                </Text>
                <PharaohArt s={w.symbol} size={18} />
                <Text style={styles.lineChipText}>{money(round2((w.pays * bet) / lineCount))}</Text>
              </View>
            ))
          )}
        </View>

        {/* Altar: obelisks either side of the pyramid, the offering below */}
        <View style={[styles.altar, { width: cabW }]}>
          <Svg width={cabW} height={170} viewBox={`0 0 ${cabW} 170`} style={StyleSheet.absoluteFill}>
            <Defs>
              <SvgLinearGradient id={altarId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#2A1E10" />
                <Stop offset="1" stopColor="#0E0804" />
              </SvgLinearGradient>
            </Defs>
            {/* Three stepped tiers */}
            <Polygon points={`${cabW * 0.3},6 ${cabW * 0.7},6 ${cabW * 0.78},62 ${cabW * 0.22},62`} fill={`url(#${altarId})`} stroke={GOLD_DEEP} strokeWidth={1.5} strokeLinejoin="round" />
            <Polygon points={`${cabW * 0.2},60 ${cabW * 0.8},60 ${cabW * 0.92},114 ${cabW * 0.08},114`} fill={`url(#${altarId})`} stroke={GOLD_DEEP} strokeWidth={1.5} strokeLinejoin="round" />
            <Path d={`M${cabW * 0.3} 6 L ${cabW * 0.7} 6 M${cabW * 0.2} 60 L ${cabW * 0.8} 60`} stroke={GOLD} strokeWidth={2} />
            <Rect x={0} y={112} width={cabW} height={56} rx={6} fill={`url(#${altarId})`} stroke={GOLD} strokeWidth={2} />
            <Rect x={4} y={116} width={cabW - 8} height={48} rx={4} fill="none" stroke={GOLD_DEEP} strokeWidth={1} />
          </Svg>
          <View style={styles.altarTop}>
            <Obelisk icon="script-text-outline" label="PAYS" onPress={() => setPanel('pay')} />
            <Pressable onPress={spin} disabled={busy || !config} style={({ pressed }) => [{ alignItems: 'center' }, pressed && { transform: [{ scale: 0.94 }] }]}>
              <PyramidButton size={96} lit={!busy && !!config} glow={glow} rays={rays} />
              <Text style={[styles.spinText, (busy || !config) && { color: '#8A7A60' }]}>{busy ? '…' : 'SPIN'}</Text>
            </Pressable>
            <Obelisk icon="timer-sand" label="HISTORY" onPress={openHistory} />
          </View>
          <View style={styles.betRow}>
            <Pressable onPress={() => stepBet(-1)} disabled={busy} style={[styles.medal, busy && styles.dim]} hitSlop={8}>
              <Svg width={14} height={14} viewBox="0 0 18 18">
                <Polygon points="14,2 14,16 3,9" fill={GOLD} />
              </Svg>
            </Pressable>
            <View style={styles.betCartouche}>
              <Text style={styles.betLabel}>OFFERING</Text>
              <Text style={styles.betValue}>{money(bet)}</Text>
            </View>
            <Pressable onPress={() => stepBet(1)} disabled={busy} style={[styles.medal, busy && styles.dim]} hitSlop={8}>
              <Svg width={14} height={14} viewBox="0 0 18 18">
                <Polygon points="4,2 4,16 15,9" fill={GOLD} />
              </Svg>
            </Pressable>
          </View>
        </View>

        {/* Session (UK: time played and net position, always on show) */}
        <View style={[styles.session, { width: cabW }]}>
          <MaterialCommunityIcons name="timer-sand" size={14} color="#C8B48A" />
          <Text style={styles.sessionText}>
            Session {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </Text>
          <Text style={styles.sessionSep}>☥</Text>
          <Text style={[styles.sessionText, { color: sessionNet > 0 ? '#7CFF9A' : sessionNet < 0 ? '#FF9AA6' : '#C8B48A' }]}>
            Net {sessionNet >= 0 ? '+' : '−'}
            {money(Math.abs(sessionNet))}
          </Text>
        </View>

        <GameInfoButton>
          RTP {config ? `${config.rtpPercent}%` : '—'} · bet {money(minStake)}–{money(maxStake)} · max win {money(config?.maxPayout ?? 10000)} per spin{'\n'}
          No autoplay or turbo · each paid spin takes at least 2.5 seconds · provably fair
        </GameInfoButton>
      </ScrollView>

      {showering && <CoinShower w={W} h={screenH} progress={coinFall} />}

      {opening && <BookOpening special={opening.special} onDone={opening.done} />}

      {banner && (
        <Animated.View
          pointerEvents="none"
          style={[styles.banner, { opacity: bannerAnim, transform: [{ scale: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]}
        >
          <LinearGradient colors={['#0E2A6A', '#06102E']} style={styles.bannerInner}>
            <Text style={styles.bannerText}>{banner.title}</Text>
            {banner.sub ? <Text style={styles.bannerSub}>{banner.sub}</Text> : null}
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
                <MaterialCommunityIcons name="close" size={22} color="#3A2A10" />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 480 }}>{panel === 'pay' ? <Paytable bet={bet} config={config} /> : <History spins={history} />}</ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const PAY_ORDER: Exclude<PharaohSymbol, 'BOOK'>[] = ['PHARAOH', 'EYE', 'SCARAB', 'ANKH', 'ACE', 'KING', 'QUEEN', 'JACK', 'TEN'];

function Paytable({ bet, config }: { bet: number; config: BookOfPharaohConfig | null }) {
  if (!config) return <Text style={styles.payNote}>Loading…</Text>;
  const lineBet = bet / config.lineCount;
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.payNote}>
        Your bet of {money(bet)} plays all {config.lineCount} lines ({money(lineBet)} each). Wins pay left to right; prizes are per line at this bet.
      </Text>
      <View style={styles.payHead}>
        <Text style={[styles.payHeadText, { flex: 1 }]} />
        {['2×', '3×', '4×', '5×'].map((h) => (
          <Text key={h} style={styles.payHeadText}>
            {h}
          </Text>
        ))}
      </View>
      {PAY_ORDER.map((sym) => (
        <View key={sym} style={styles.payRow}>
          <View style={{ flex: 1 }}>
            <PharaohArt s={sym} size={34} />
          </View>
          {config.pays[sym].map((x, i) => (
            <Text key={i} style={styles.payValue}>
              {x > 0 ? money(round2(x * lineBet)) : '—'}
            </Text>
          ))}
        </View>
      ))}
      <Text style={styles.paySection}>THE BOOK</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <PharaohArt s="BOOK" size={44} />
        <Text style={styles.payNote}>
          Wild for every symbol on a line, and scatter: 3, 4 or 5 anywhere pay {money(config.scatterPays['3'] * bet)}, {money(config.scatterPays['4'] * bet)} or {money(config.scatterPays['5'] * bet)} and open {config.freeSpins} free spins (about one spin in {Math.round(100 / config.featureChancePercent)}).
        </Text>
      </View>
      <Text style={styles.paySection}>EXPANDING SYMBOL</Text>
      <Text style={styles.payNote}>
        Before the free spins the book picks a special symbol. On each free spin where it shows on enough reels (2 for Pharaoh, Eye, Scarab and Ankh; 3 for the rest), it fills those reels and pays on all {config.lineCount} lines — the reels don't need to be next to each other. 3 books in free spins add {config.freeSpins} more.
      </Text>
      <Text style={styles.payNote}>RTP {config.rtpPercent}%. Results come from your provably-fair seeds on the server.</Text>
    </View>
  );
}

function History({ spins }: { spins: PharaohSpinRow[] | null }) {
  if (spins === null) return <Text style={styles.payNote}>Loading…</Text>;
  if (spins.length === 0) return <Text style={styles.payNote}>No spins yet.</Text>;
  return (
    <View style={{ gap: 4 }}>
      {spins.map((s) => {
        const pay = Number(s.payout);
        const stake = Number(s.stake);
        return (
          <View key={s.id} style={styles.histRow}>
            <Text style={styles.histTime}>{new Date(s.createdAt).toLocaleTimeString()}</Text>
            <Text style={styles.histStake}>{money(stake)}</Text>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {s.special ? (
                <>
                  <Text style={styles.histTags}>{s.freeSpins} FREE</Text>
                  <PharaohArt s={s.special} size={16} />
                </>
              ) : null}
            </View>
            <Text style={[styles.histWin, { color: pay > stake ? '#1E6A2A' : pay > 0 ? '#8A5A10' : '#8A7A60' }]}>{pay > 0 ? money(pay) : '—'}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0603' },
  topBar: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 1 },
  title: { color: GOLD, fontSize: 17, fontWeight: '900', fontFamily: SERIF, letterSpacing: 2 },
  balancePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4, backgroundColor: 'rgba(245,197,66,0.12)', borderWidth: 1.5, borderColor: GOLD_DEEP },
  balanceText: { color: GOLD_LIGHT, fontSize: 14, fontWeight: '800', fontFamily: SERIF },
  cabinet: { borderRadius: 10, borderWidth: 3, borderColor: GOLD, overflow: 'hidden', marginTop: 4, paddingBottom: 12 },
  freeBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, height: 46, marginHorizontal: 10, marginBottom: 2 },
  cartouche: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 40, borderRadius: 20, borderWidth: 2, borderColor: GOLD, backgroundColor: 'rgba(14,42,106,0.9)', paddingRight: 6 },
  cartoucheTie: { position: 'absolute', right: 5, top: 7, bottom: 7, width: 3, borderRadius: 2, backgroundColor: GOLD },
  cartoucheLabel: { color: GOLD, fontSize: 8, fontWeight: '900', letterSpacing: 2, fontFamily: SERIF },
  cartoucheValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', fontFamily: SERIF },
  reelFrame: { flex: 1, borderWidth: 3, borderColor: GOLD, padding: 4, backgroundColor: '#1A1208' },
  meterWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 18, marginTop: 12 },
  meterCartouche: { flex: 1, height: 56, borderRadius: 28, borderWidth: 3, borderColor: GOLD, backgroundColor: 'rgba(10,6,4,0.92)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  meterTie: { width: 8, height: 46, marginLeft: -2, borderRadius: 3, backgroundColor: GOLD, borderWidth: 1, borderColor: GOLD_DEEP },
  meterLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 3, fontFamily: SERIF, opacity: 0.85 },
  meterValue: { fontSize: 22, fontWeight: '900', fontFamily: SERIF, fontVariant: ['tabular-nums'] },
  altar: { height: 170, marginTop: 10 },
  altarTop: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: '9%', height: 112 },
  obeliskText: { color: GOLD_LIGHT, fontSize: 7.5, fontWeight: '900', letterSpacing: 0.5, fontFamily: SERIF, marginTop: 2 },
  spinText: { color: GOLD, fontSize: 12, fontWeight: '900', letterSpacing: 4, fontFamily: SERIF, marginTop: -6 },
  betRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, height: 56, marginTop: 2 },
  medal: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#0E2A6A', borderWidth: 2, borderColor: GOLD, alignItems: 'center', justifyContent: 'center' },
  betCartouche: { minWidth: 130, height: 42, borderRadius: 21, borderWidth: 2, borderColor: GOLD, backgroundColor: '#0A0604', alignItems: 'center', justifyContent: 'center' },
  betLabel: { color: GOLD, fontSize: 8, fontWeight: '900', letterSpacing: 3, fontFamily: SERIF },
  betValue: { color: GOLD_LIGHT, fontSize: 16, fontWeight: '900', fontFamily: SERIF },
  bannerInner: { paddingHorizontal: 26, paddingVertical: 12, borderRadius: 8, borderWidth: 3, borderColor: GOLD, alignItems: 'center' },
  bannerText: { color: GOLD_LIGHT, fontSize: 28, fontWeight: '900', fontFamily: SERIF, letterSpacing: 2 },
  bannerSub: { color: GOLD, fontSize: 13, fontWeight: '800', marginTop: 2, fontFamily: SERIF },
  reelWindow: { borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: GOLD_DEEP },
  lineWinsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 8, minHeight: 26 },
  lineWinHint: { color: '#C8B48A', fontSize: 11, fontWeight: '700', fontFamily: SERIF },
  lineChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, borderWidth: 1.5, backgroundColor: 'rgba(0,0,0,0.4)' },
  lineChipText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  dim: { opacity: 0.4 },
  session: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, paddingVertical: 7, borderRadius: 4, backgroundColor: 'rgba(74,58,38,0.45)', borderWidth: 1, borderColor: 'rgba(154,106,16,0.5)' },
  sessionText: { color: '#C8B48A', fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'], fontFamily: SERIF },
  sessionSep: { color: GOLD_DEEP, fontSize: 14 },
  bookOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(5,2,15,0.82)', alignItems: 'center', justifyContent: 'center' },
  bookOpen: { flexDirection: 'row', borderWidth: 4, borderColor: '#7A1E10', borderRadius: 10, backgroundColor: '#7A1E10', padding: 6 },
  page: { width: 130, height: 170, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  pageHiero: { color: '#8A5A20', fontSize: 26, textAlign: 'center', lineHeight: 44 },
  spine: { width: 6, backgroundColor: '#4A0E06' },
  bookCaption: { color: GOLD, fontSize: 14, fontWeight: '900', letterSpacing: 2, textAlign: 'center', marginTop: 14, fontFamily: SERIF },
  banner: { position: 'absolute', top: '30%', alignSelf: 'center' },
  toast: { position: 'absolute', bottom: 120, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14 },
  toastText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  modalBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  modalCard: { backgroundColor: '#F4E2B4', borderRadius: 8, borderWidth: 3, borderColor: GOLD_DEEP, padding: 14 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { color: '#5A2A08', fontSize: 18, fontWeight: '900', letterSpacing: 3, fontFamily: SERIF },
  payHead: { flexDirection: 'row', alignItems: 'center' },
  payHeadText: { color: '#7A4A10', fontSize: 11, fontWeight: '900', width: 62, textAlign: 'right' },
  payRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 1, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(122,74,16,0.3)' },
  payValue: { color: '#2A1A06', fontSize: 12, fontWeight: '900', width: 62, textAlign: 'right' },
  paySection: { color: '#7A2A08', fontSize: 12, fontWeight: '900', letterSpacing: 2, marginTop: 8, fontFamily: SERIF },
  payNote: { color: '#3A2A10', fontSize: 12, lineHeight: 17, flexShrink: 1 },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(122,74,16,0.3)' },
  histTime: { color: '#6A5A40', fontSize: 11, width: 82 },
  histStake: { color: '#2A1A06', fontSize: 12, fontWeight: '700', width: 70 },
  histTags: { color: '#7A2A08', fontSize: 10, fontWeight: '900' },
  histWin: { fontSize: 12, fontWeight: '900' },
});
