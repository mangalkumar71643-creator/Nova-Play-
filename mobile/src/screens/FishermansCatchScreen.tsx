import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { forwardRef, memo, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient as SvgLinearGradient, Path, Polyline, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../api/client';
import { FishFreeSpin, FishLineWin, FishSymbol, FishermanConfig, FishermanSpinRow, fetchFishermanConfig, fetchFishermanHistory, spinFisherman } from '../api/backend';
import { useGameState } from '../state/GameStateContext';
import GameInfoButton from '../components/GameInfoButton';

const GOLD = '#FFD166';
const GOLD_DEEP = '#B8860B';
const WOOD = '#6B3E1E';
const WOOD_DARK = '#3A1F0C';
const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const DEFAULT_BET = 10;
const TOAST_MS = 1800;
/** UK rule: a paid spin may not resolve faster than this, press to result. */
const MIN_SPIN_MS = 2500;
const FREE_SPIN_MS = 2200;
const LINE_COLORS = ['#FF3B4E', '#FFD23F', '#2FE07A', '#22B8FF', '#FF7AE0', '#FF9A3C', '#9B7BFF', '#3CF0D0', '#FF5FA0', '#B8F04A'];
const FILLER: FishSymbol[] = ['JACK', 'QUEEN', 'KING', 'ACE', 'LURE', 'TACKLE', 'ROD', 'FISH'];
const FILLER_VALUES = [0.5, 1, 2, 3, 5, 10];

type Cell = { s: FishSymbol; v: number };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function money(n: number): string {
  return `₹${n.toFixed(2)}`;
}

/** Fish values are shown short on the reels: ₹5, ₹12.5, ₹1.2K. */
function shortMoney(n: number): string {
  if (n >= 1000) return `₹${round2(n / 1000)}K`;
  return `₹${Number.isInteger(n) ? n : round2(n)}`;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

const wrap = (len: number, i: number) => ((i % len) + len) % len;

function cellsFor(strips: FishSymbol[][], stops: number[], values: number[][]): Cell[][] {
  return stops.map((stop, r) => [-1, 0, 1].map((d, row) => ({ s: strips[r][wrap(strips[r].length, stop + d)], v: values[r][row] })));
}

// ---------- symbol art ----------
// Every symbol is drawn on a 100 x 100 canvas.

const LETTER_COLORS: Partial<Record<FishSymbol, [string, string, string]>> = {
  ACE: ['#FFB4B4', '#E8213B', '#7A0010'],
  KING: ['#B9E3FF', '#1E88E5', '#0B3A7A'],
  QUEEN: ['#D9B8FF', '#8E3BE0', '#3D0A6A'],
  JACK: ['#C8F5B0', '#2FA84F', '#0E4A1E'],
};
const LETTER: Partial<Record<FishSymbol, string>> = { ACE: 'A', KING: 'K', QUEEN: 'Q', JACK: 'J' };

export const FishArt = memo(function FishArt({ s, size, value, dim, glow }: { s: FishSymbol; size: number; value?: number; dim?: boolean; glow?: boolean }) {
  // Ids must be unique per drawing: a gradient defined in a hidden screen doesn't paint on web.
  const u = `fc${s}${useId().replace(/:/g, '')}`;
  const letter = LETTER[s];
  const lc = LETTER_COLORS[s];
  return (
    <View style={{ width: size, height: size, opacity: dim ? 0.35 : 1 }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <SvgLinearGradient id={`${u}gold`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFF4B8" />
            <Stop offset="0.5" stopColor="#FFC93C" />
            <Stop offset="1" stopColor="#B07A00" />
          </SvgLinearGradient>
          <SvgLinearGradient id={`${u}fish`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#4C7A2A" />
            <Stop offset="0.45" stopColor="#8DBA3A" />
            <Stop offset="0.75" stopColor="#E9E3A8" />
            <Stop offset="1" stopColor="#FFFDF0" />
          </SvgLinearGradient>
          <SvgLinearGradient id={`${u}wood`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#B8743A" />
            <Stop offset="1" stopColor="#5A2E10" />
          </SvgLinearGradient>
          <SvgLinearGradient id={`${u}box`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#5FD08A" />
            <Stop offset="1" stopColor="#14703A" />
          </SvgLinearGradient>
          <RadialGradient id={`${u}glow`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FFF3B0" stopOpacity={0.9} />
            <Stop offset="1" stopColor="#FFD23F" stopOpacity={0} />
          </RadialGradient>
          {lc && (
            <SvgLinearGradient id={`${u}let`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={lc[0]} />
              <Stop offset="0.5" stopColor={lc[1]} />
              <Stop offset="1" stopColor={lc[2]} />
            </SvgLinearGradient>
          )}
        </Defs>
        {glow && <Circle cx={50} cy={50} r={50} fill={`url(#${u}glow)`} />}
        {letter && lc && (
          <G>
            <SvgText x={52} y={78} fontSize={72} fontWeight="900" fill="#1A0E04" opacity={0.35} textAnchor="middle">
              {letter}
            </SvgText>
            <SvgText x={50} y={75} fontSize={72} fontWeight="900" fill={`url(#${u}let)`} stroke="#FFF6DA" strokeWidth={3} textAnchor="middle">
              {letter}
            </SvgText>
          </G>
        )}
        {s === 'LURE' && (
          <G transform="rotate(-25 50 50)">
            <Path d="M50 10 C 70 22, 72 58, 50 76 C 28 58, 30 22, 50 10 Z" fill="#FF5A2A" stroke="#7A1A00" strokeWidth={2} />
            <Path d="M50 14 C 62 26, 64 52, 50 66 C 38 52, 40 26, 50 14 Z" fill="#FFD23F" />
            <Circle cx={50} cy={30} r={6} fill="#FFFFFF" />
            <Circle cx={50} cy={30} r={3} fill="#111111" />
            <Path d="M50 76 L 50 86 M 50 86 C 50 96, 40 96, 40 88 M 50 86 C 50 96, 60 96, 60 88" stroke="#C9CED8" strokeWidth={3} fill="none" strokeLinecap="round" />
            <Circle cx={50} cy={8} r={3} fill="none" stroke="#C9CED8" strokeWidth={2} />
          </G>
        )}
        {s === 'TACKLE' && (
          <G>
            <Path d="M34 30 C 34 18, 66 18, 66 30" stroke="#2A2A2A" strokeWidth={5} fill="none" />
            <Rect x={12} y={30} width={76} height={56} rx={8} fill={`url(#${u}box)`} stroke="#0B3A1E" strokeWidth={2} />
            <Rect x={12} y={30} width={76} height={18} rx={6} fill="#7BE3A3" opacity={0.8} />
            <Rect x={44} y={44} width={12} height={10} rx={2} fill="#FFD23F" stroke="#8A6A00" strokeWidth={1.5} />
            <Rect x={18} y={60} width={64} height={3} fill="#0B3A1E" opacity={0.4} />
            <Path d="M22 36 L 40 36" stroke="#FFFFFF" strokeOpacity={0.7} strokeWidth={3} strokeLinecap="round" />
          </G>
        )}
        {s === 'ROD' && (
          <G>
            <Line x1={14} y1={92} x2={86} y2={10} stroke="#3A2210" strokeWidth={6} strokeLinecap="round" />
            <Line x1={14} y1={92} x2={86} y2={10} stroke="#B8743A" strokeWidth={3} strokeLinecap="round" />
            <Rect x={10} y={70} width={14} height={22} rx={4} fill="#1A1A1A" transform="rotate(41 17 81)" />
            <Circle cx={34} cy={74} r={11} fill="#C9CED8" stroke="#5A6070" strokeWidth={2} />
            <Circle cx={34} cy={74} r={4} fill="#5A6070" />
            <Path d="M86 10 C 92 30, 90 50, 84 64" stroke="#E6E9F0" strokeWidth={1.5} fill="none" />
            <Path d="M84 64 C 84 72, 76 72, 77 66" stroke="#C9CED8" strokeWidth={2.5} fill="none" strokeLinecap="round" />
            {[0.35, 0.55, 0.75].map((t) => (
              <Circle key={t} cx={14 + 72 * t} cy={92 - 82 * t} r={2.5} fill="none" stroke="#E6E9F0" strokeWidth={1.5} />
            ))}
          </G>
        )}
        {s === 'FISH' && (
          <G transform="translate(0 -6)">
            <Path d="M84 50 L 98 34 L 96 66 Z" fill="#5E8E2A" stroke="#2E4A10" strokeWidth={1.5} />
            <Path d="M10 50 C 22 26, 62 22, 86 50 C 62 76, 22 74, 10 50 Z" fill={`url(#${u}fish)`} stroke="#2E4A10" strokeWidth={2} />
            <Path d="M40 30 C 50 18, 64 22, 68 34" fill="#5E8E2A" stroke="#2E4A10" strokeWidth={1.5} />
            <Path d="M28 40 C 40 46, 58 46, 74 40" stroke="#2E4A10" strokeOpacity={0.35} strokeWidth={2} fill="none" />
            <Circle cx={24} cy={46} r={6} fill="#FFFFFF" />
            <Circle cx={23} cy={46} r={3.2} fill="#111111" />
            <Path d="M11 52 C 16 56, 20 56, 24 54" stroke="#2E4A10" strokeWidth={2} fill="none" />
          </G>
        )}
        {s === 'BONUS' && (
          <G>
            <Path d="M50 14 L 50 56" stroke="#5A2E10" strokeWidth={3} />
            <Path d="M50 16 L 80 30 L 50 44 Z" fill="#FF3B4E" stroke="#7A0010" strokeWidth={1.5} />
            <Path d="M8 58 L 92 58 L 80 84 L 20 84 Z" fill={`url(#${u}wood)`} stroke={WOOD_DARK} strokeWidth={2} />
            <Path d="M14 66 L 86 66" stroke={WOOD_DARK} strokeOpacity={0.5} strokeWidth={1.5} />
            <Path d="M4 88 C 20 82, 30 94, 50 88 C 70 82, 80 94, 96 88" stroke="#7FD3FF" strokeWidth={4} fill="none" strokeLinecap="round" />
            <Rect x={20} y={2} width={60} height={14} rx={7} fill={`url(#${u}gold)`} stroke={GOLD_DEEP} strokeWidth={1.5} />
            <SvgText x={50} y={13} fontSize={11} fontWeight="900" fill="#4A2A00" textAnchor="middle" letterSpacing={1}>
              BONUS
            </SvgText>
          </G>
        )}
        {s === 'WILD' && (
          <G>
            <Circle cx={50} cy={52} r={44} fill="#FFD23F" opacity={0.25} />
            <Path d="M22 92 C 22 70, 78 70, 78 92 Z" fill="#E8522A" stroke="#7A2000" strokeWidth={2} />
            <Rect x={44} y={72} width={12} height={20} fill="#FFD23F" opacity={0.7} />
            <Circle cx={50} cy={52} r={20} fill="#F2C29A" stroke="#8A5A3A" strokeWidth={1.5} />
            <Path d="M32 58 C 36 74, 64 74, 68 58 C 62 64, 38 64, 32 58 Z" fill="#E6E2DA" />
            <Circle cx={43} cy={50} r={2.6} fill="#2A1A10" />
            <Circle cx={57} cy={50} r={2.6} fill="#2A1A10" />
            <Path d="M44 60 C 48 63, 52 63, 56 60" stroke="#8A3A20" strokeWidth={2} fill="none" strokeLinecap="round" />
            <Ellipse cx={50} cy={36} rx={30} ry={6} fill="#F2B705" stroke="#8A6A00" strokeWidth={1.5} />
            <Path d="M34 36 C 34 18, 66 18, 66 36 Z" fill="#FFCC1A" stroke="#8A6A00" strokeWidth={1.5} />
            <Rect x={34} y={30} width={32} height={4} fill="#C0392B" />
            <Line x1={84} y1={8} x2={70} y2={92} stroke="#5A2E10" strokeWidth={3} strokeLinecap="round" />
            <Rect x={6} y={78} width={88} height={18} rx={9} fill={`url(#${u}gold)`} stroke={GOLD_DEEP} strokeWidth={2} />
            <SvgText x={50} y={92} fontSize={14} fontWeight="900" fill="#4A2A00" textAnchor="middle" letterSpacing={3}>
              WILD
            </SvgText>
          </G>
        )}
      </Svg>
      {s === 'FISH' && value !== undefined && value > 0 && (
        <View style={[styles.fishTag, { bottom: size * 0.04, paddingHorizontal: size * 0.06 }]}>
          <Text style={[styles.fishTagText, { fontSize: Math.max(9, size * 0.15) }]} numberOfLines={1}>
            {shortMoney(value)}
          </Text>
        </View>
      )}
    </View>
  );
});

// ---------- reels ----------

type ReelHandle = {
  start: () => void;
  land: (rows: Cell[], delay: number) => Promise<void>;
  set: (rows: Cell[]) => void;
};

const LOOP_CELLS = 16;
const LAND_CELLS = 10;

function fillerCell(free: boolean, bet: number, reel: number): Cell {
  // The Fisherman only lives on reels 2–5 of the free-spin reels.
  const pool: FishSymbol[] = free ? (reel > 0 ? [...FILLER, 'WILD'] : FILLER) : [...FILLER, 'BONUS'];
  const s = pool[Math.floor(Math.random() * pool.length)];
  return { s, v: s === 'FISH' ? FILLER_VALUES[Math.floor(Math.random() * FILLER_VALUES.length)] * bet : 0 };
}

const Reel = forwardRef(function Reel(
  { initial, cell, width, dimmed, glowing, free, bet, reel }: { initial: Cell[]; cell: number; width: number; dimmed: boolean[]; glowing: boolean[]; free: boolean; bet: number; reel: number },
  ref: React.Ref<ReelHandle>
) {
  const [content, setContent] = useState<Cell[]>(initial);
  const y = useRef(new Animated.Value(0)).current;
  const pending = useRef<null | { kind: 'loop' } | { kind: 'land'; resolve: () => void; rows: Cell[] }>(null);
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);
  const contentRef = useRef(content);
  contentRef.current = content;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opts = useRef({ free, bet });
  opts.current = { free, bet };
  const filler = () => fillerCell(opts.current.free, opts.current.bet, reel);

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
      const loop = Animated.loop(Animated.timing(y, { toValue: 0, duration: 480, easing: Easing.linear, useNativeDriver: true }));
      loopRef.current = loop;
      loop.start();
      return;
    }
    y.setValue(-(content.length - 3) * cell);
    Animated.timing(y, { toValue: 0, duration: 460, easing: Easing.out(Easing.back(1.3)), useNativeDriver: true }).start(() => {
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
          <View key={i} style={{ width, height: cell, alignItems: 'center', justifyContent: 'center' }}>
            <FishArt s={c.s} value={c.v} size={Math.min(width, cell) * 0.9} dim={settled && dimmed[i]} glow={settled && glowing[i]} />
          </View>
        ))}
      </Animated.View>
    </View>
  );
});

// ---------- scenery ----------

/** Sunset (or, in free spins, a gold-lit night) over the lake, with hills, sun and water. */
const LakeScene = memo(function LakeScene({ w, h, night }: { w: number; h: number; night: boolean }) {
  const u = useId().replace(/:/g, '');
  const sky = night ? ['#060B2A', '#1A1450', '#4A2A6A'] : ['#2A1A5A', '#C2477A', '#FFB45A'];
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id={`fcSky${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={sky[0]} />
          <Stop offset="0.6" stopColor={sky[1]} />
          <Stop offset="1" stopColor={sky[2]} />
        </SvgLinearGradient>
        <SvgLinearGradient id={`fcWater${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={night ? '#2A2A6A' : '#E07A5A'} />
          <Stop offset="0.25" stopColor={night ? '#10204A' : '#1C6A8A'} />
          <Stop offset="1" stopColor="#04162A" />
        </SvgLinearGradient>
        <RadialGradient id={`fcSun${u}`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={night ? '#FFFFFF' : '#FFF6C8'} />
          <Stop offset="0.5" stopColor={night ? '#E8ECFF' : '#FFC24A'} />
          <Stop offset="1" stopColor={night ? '#E8ECFF' : '#FF7A3A'} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill={`url(#fcSky${u})`} />
      {night &&
        Array.from({ length: 40 }, (_, i) => (
          <Circle key={i} cx={((i * 73) % 100) * (w / 100)} cy={((i * 37) % 40) * (h / 100)} r={(i % 3) * 0.5 + 0.6} fill="#FFFFFF" opacity={0.6} />
        ))}
      <Circle cx={w * 0.72} cy={h * 0.33} r={h * 0.12} fill={`url(#fcSun${u})`} />
      <Path d={`M0 ${h * 0.45} C ${w * 0.15} ${h * 0.32}, ${w * 0.3} ${h * 0.36}, ${w * 0.42} ${h * 0.44} C ${w * 0.55} ${h * 0.34}, ${w * 0.8} ${h * 0.36}, ${w} ${h * 0.44} L ${w} ${h * 0.5} L 0 ${h * 0.5} Z`} fill={night ? '#0A0E2A' : '#3A1A4A'} opacity={0.9} />
      <Rect x={0} y={h * 0.48} width={w} height={h * 0.52} fill={`url(#fcWater${u})`} />
      {Array.from({ length: 9 }, (_, i) => (
        <Rect key={i} x={w * (0.55 + ((i * 7) % 5) * 0.06)} y={h * (0.5 + i * 0.03)} width={w * (0.2 - i * 0.015)} height={1.5} fill="#FFE9B0" opacity={0.45 - i * 0.04} />
      ))}
    </Svg>
  );
});

function Title({ width, free }: { width: number; free: boolean }) {
  const u = useId().replace(/:/g, '');
  return (
    <Svg width={width} height={width * 0.22} viewBox="0 0 360 80">
      <Defs>
        <SvgLinearGradient id={`fcT${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFF8D0" />
          <Stop offset="0.5" stopColor="#FFC93C" />
          <Stop offset="1" stopColor="#C07800" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`fcPlank${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#A0612E" />
          <Stop offset="1" stopColor="#5A2E10" />
        </SvgLinearGradient>
      </Defs>
      <Rect x={20} y={8} width={320} height={56} rx={12} fill={`url(#fcPlank${u})`} stroke={WOOD_DARK} strokeWidth={3} />
      <Path d="M28 28 L 332 28 M28 46 L 332 46" stroke={WOOD_DARK} strokeOpacity={0.35} strokeWidth={1.5} />
      {[30, 330].map((x) => (
        <Circle key={x} cx={x} cy={36} r={4} fill="#C9CED8" stroke="#5A6070" strokeWidth={1} />
      ))}
      <SvgText x={182} y={47} fontSize={30} fontWeight="900" fontStyle="italic" fill="#2A1204" textAnchor="middle" letterSpacing={1}>
        FISHERMAN'S CATCH
      </SvgText>
      <SvgText x={180} y={45} fontSize={30} fontWeight="900" fontStyle="italic" fill={`url(#fcT${u})`} stroke="#5A2E10" strokeWidth={1} textAnchor="middle" letterSpacing={1}>
        FISHERMAN'S CATCH
      </SvgText>
      <SvgText x={180} y={76} fontSize={11} fontWeight="900" fill={free ? '#FFE36B' : '#FFE9D0'} textAnchor="middle" letterSpacing={3}>
        {free ? 'FREE SPINS · FISHERMEN COLLECT' : '10 LINES · BOATS START FREE SPINS'}
      </SvgText>
    </Svg>
  );
}

/** Home tile art: a fish with a cash tag leaping from the lake at sunset. */
export function FishermansCatchTileArt({ size }: { size: number }) {
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size }} pointerEvents="none">
      <LakeScene w={size} h={size} night={false} />
      <View style={{ position: 'absolute', left: size * 0.16, top: size * 0.06, transform: [{ rotate: '-18deg' }] }}>
        <FishArt s="FISH" size={size * 0.62} value={50} />
      </View>
    </View>
  );
}

// ---------- boat & lake props ----------

/** Two layers of rolling waves across the foot of the lake, drifting sideways. */
function Waves({ w, drift, night }: { w: number; drift: Animated.Value; night: boolean }) {
  const layer = (amp: number, len: number, y: number, color: string, opacity: number, speed: number) => {
    const n = Math.ceil((w * 2) / len) + 1;
    let d = `M0 ${y}`;
    for (let i = 0; i < n; i++) d += ` q ${len / 4} ${-amp} ${len / 2} 0 t ${len / 2} 0`;
    d += ` L ${n * len} 40 L 0 40 Z`;
    return (
      <Animated.View style={{ position: 'absolute', left: 0, bottom: 0, transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -len * speed] }) }] }}>
        <Svg width={n * len} height={40}>
          <Path d={d} fill={color} opacity={opacity} />
        </Svg>
      </Animated.View>
    );
  };
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 40, overflow: 'hidden' }}>
      {layer(5, 60, 14, night ? '#1E2A6A' : '#2A86B0', 0.6, 1)}
      {layer(4, 44, 22, night ? '#101A4A' : '#0E5A80', 0.9, 2)}
    </View>
  );
}

/** A red-and-white float bobbing on the water. */
function Bobber({ bob }: { bob: Animated.Value }) {
  return (
    <Animated.View pointerEvents="none" style={{ transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [-3, 3] }) }, { rotate: bob.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '8deg'] }) }] }}>
      <Svg width={18} height={34} viewBox="0 0 18 34">
        <Path d="M9 0 L 9 8" stroke="#E6E9F0" strokeWidth={1.2} />
        <Ellipse cx={9} cy={15} rx={7} ry={8} fill="#E8132B" stroke="#6A0010" strokeWidth={1} />
        <Path d="M2 17 C 4 26, 14 26, 16 17 Z" fill="#FFFFFF" stroke="#8A8E98" strokeWidth={1} />
        <Ellipse cx={6} cy={12} rx={2} ry={3} fill="#FFFFFF" opacity={0.6} />
      </Svg>
    </Animated.View>
  );
}

/** A spinning-reel style button: spool, spokes and crank handle; it turns while the cast plays. */
function FishingReel({ size, turn, lit }: { size: number; turn: Animated.Value; lit: boolean }) {
  const u = useId().replace(/:/g, '');
  const c = 50;
  return (
    <Animated.View style={{ transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={`fcReel${u}`} cx="40%" cy="35%" r="70%">
            <Stop offset="0" stopColor={lit ? '#FFF4C8' : '#9A9EA8'} />
            <Stop offset="0.5" stopColor={lit ? '#E8B23A' : '#5A5E68'} />
            <Stop offset="1" stopColor={lit ? '#8A5A08' : '#2A2E38'} />
          </RadialGradient>
          <SvgLinearGradient id={`fcLine${u}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#B8F0FF" />
            <Stop offset="1" stopColor="#3A9AC8" />
          </SvgLinearGradient>
        </Defs>
        <Circle cx={c} cy={c} r={46} fill={`url(#fcReel${u})`} stroke="#3A2A08" strokeWidth={3} />
        <Circle cx={c} cy={c} r={34} fill={`url(#fcLine${u})`} stroke="#2A5A78" strokeWidth={1.5} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Circle key={i} cx={c} cy={c} r={24 + i * 1.6} fill="none" stroke="#FFFFFF" strokeOpacity={0.25} strokeWidth={0.8} />
        ))}
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <Path key={a} d={`M${c} ${c} L ${c + 22 * Math.cos((a * Math.PI) / 180)} ${c + 22 * Math.sin((a * Math.PI) / 180)}`} stroke="#3A2A08" strokeWidth={3} strokeLinecap="round" />
        ))}
        <Circle cx={c} cy={c} r={9} fill={`url(#fcReel${u})`} stroke="#3A2A08" strokeWidth={2} />
        {/* Crank arm and knob */}
        <Path d={`M${c} ${c} L ${c + 34} ${c - 30}`} stroke="#3A2A08" strokeWidth={7} strokeLinecap="round" />
        <Path d={`M${c} ${c} L ${c + 34} ${c - 30}`} stroke={lit ? '#E8B23A' : '#6A6E78'} strokeWidth={4} strokeLinecap="round" />
        <Circle cx={c + 34} cy={c - 30} r={8} fill="#5A2E10" stroke="#2A1004" strokeWidth={2} />
      </Svg>
    </Animated.View>
  );
}

/** The free-spin multiplier on an orange-and-white life ring. */
function LifeRing({ mult, size, pulse }: { mult: number; size: number; pulse: Animated.AnimatedInterpolation<number> | number }) {
  const c = 50;
  return (
    <Animated.View style={{ transform: [{ scale: pulse }] }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Circle cx={c} cy={c} r={40} fill="none" stroke="#FF6A1A" strokeWidth={18} />
        {[0, 90, 180, 270].map((a) => (
          <Path key={a} d={`M ${c + 31 * Math.cos(((a - 18) * Math.PI) / 180)} ${c + 31 * Math.sin(((a - 18) * Math.PI) / 180)} A 31 31 0 0 1 ${c + 31 * Math.cos(((a + 18) * Math.PI) / 180)} ${c + 31 * Math.sin(((a + 18) * Math.PI) / 180)} L ${c + 49 * Math.cos(((a + 18) * Math.PI) / 180)} ${c + 49 * Math.sin(((a + 18) * Math.PI) / 180)} A 49 49 0 0 0 ${c + 49 * Math.cos(((a - 18) * Math.PI) / 180)} ${c + 49 * Math.sin(((a - 18) * Math.PI) / 180)} Z`} fill="#FFFFFF" />
        ))}
        <Circle cx={c} cy={c} r={49} fill="none" stroke="#8A3A0A" strokeWidth={1.5} />
        <Circle cx={c} cy={c} r={31} fill="#0B2A4A" stroke="#8A3A0A" strokeWidth={1.5} />
        <SvgText x={c} y={c + 9} fontSize={mult >= 10 ? 22 : 26} fontWeight="900" fill="#FFD166" textAnchor="middle">
          x{mult}
        </SvgText>
      </Svg>
    </Animated.View>
  );
}

/** Fisherman meter: hooks hanging from a rope; each collected Fisherman fills one. */
function HookLine({ count, filled, width }: { count: number; filled: number; width: number }) {
  const gap = width / (count + 1);
  return (
    <Svg width={width} height={40}>
      <Path d={`M0 8 Q ${width / 2} 16 ${width} 8`} stroke="#C8A060" strokeWidth={3} fill="none" />
      {Array.from({ length: count }, (_, i) => {
        const x = gap * (i + 1);
        const on = i < filled;
        return (
          <G key={i}>
            <Path d={`M${x} 11 L ${x} 20 C ${x} 30, ${x - 9} 30, ${x - 8} 22`} stroke={on ? '#FFD166' : '#8A8E98'} strokeWidth={2.2} fill="none" strokeLinecap="round" />
            {on && <Ellipse cx={x - 4} cy={32} rx={7} ry={4} fill="#8DBA3A" stroke="#2E4A10" strokeWidth={1} />}
          </G>
        );
      })}
    </Svg>
  );
}

/** The win meter: a fish-shaped wooden catch board with carved figures. */
function CatchBoard({ label, value, color, width }: { label: string; value: string; color: string; width: number }) {
  const u = useId().replace(/:/g, '');
  const h = 56;
  return (
    <View style={{ width, height: h }}>
      <Svg width={width} height={h} viewBox={`0 0 ${width} ${h}`} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinearGradient id={`fcBoard${u}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#B8743A" />
            <Stop offset="1" stopColor="#5A2E10" />
          </SvgLinearGradient>
        </Defs>
        {/* Tail on the right, rounded nose on the left */}
        <Path
          d={`M 14 ${h / 2} C 14 6, ${width * 0.3} 3, ${width - 40} 6 L ${width - 2} 2 L ${width - 18} ${h / 2} L ${width - 2} ${h - 2} L ${width - 40} ${h - 6} C ${width * 0.3} ${h - 3}, 14 ${h - 6}, 14 ${h / 2} Z`}
          fill={`url(#fcBoard${u})`}
          stroke="#2A1004"
          strokeWidth={2}
        />
        <Circle cx={30} cy={h / 2 - 6} r={4} fill="#2A1004" />
        {[0.42, 0.58].map((t) => (
          <Path key={t} d={`M ${width * 0.12} ${h * t} L ${width - 46} ${h * t}`} stroke="#2A1004" strokeOpacity={0.25} strokeWidth={1} />
        ))}
      </Svg>
      <View style={{ position: 'absolute', left: Math.min(46, width * 0.15), right: Math.min(50, width * 0.2), top: 0, bottom: 0, justifyContent: 'center' }}>
        <Text style={[styles.boardLabel, { color }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.boardValue, { color, fontSize: width < 240 ? 16 : 20 }]} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
      </View>
    </View>
  );
}

/** A cash tag flying from a fish on the reels to the catch board. */
function Flyer({ from, to, text, progress }: { from: { x: number; y: number }; to: { x: number; y: number }; text: string; progress: Animated.Value }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transform: [
          { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [from.x - 22, to.x - 22] }) },
          { translateY: progress.interpolate({ inputRange: [0, 0.4, 1], outputRange: [from.y - 10, Math.min(from.y, to.y) - 40, to.y - 10] }) },
          { scale: progress.interpolate({ inputRange: [0, 0.2, 0.9, 1], outputRange: [1, 1.25, 0.9, 0.5] }) },
        ],
        opacity: progress.interpolate({ inputRange: [0, 0.9, 1], outputRange: [1, 1, 0] }),
      }}
    >
      <View style={styles.flyTag}>
        <Text style={styles.flyText}>{text}</Text>
      </View>
    </Animated.View>
  );
}

/** A fish leaping across the lake on a big catch. */
function JumpingFish({ width, progress }: { width: number; progress: Animated.Value }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transform: [
          { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-60, width + 10] }) },
          { translateY: progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [150, 20, 150] }) },
          { rotate: progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-35deg', '0deg', '35deg'] }) },
        ],
      }}
    >
      <FishArt s="FISH" size={64} />
    </Animated.View>
  );
}

// ---------- screen ----------

const START: Cell[][] = [
  [{ s: 'ACE', v: 0 }, { s: 'ROD', v: 0 }, { s: 'KING', v: 0 }],
  [{ s: 'FISH', v: 50 }, { s: 'TACKLE', v: 0 }, { s: 'QUEEN', v: 0 }],
  [{ s: 'LURE', v: 0 }, { s: 'BONUS', v: 0 }, { s: 'JACK', v: 0 }],
  [{ s: 'KING', v: 0 }, { s: 'FISH', v: 20 }, { s: 'ACE', v: 0 }],
  [{ s: 'JACK', v: 0 }, { s: 'LURE', v: 0 }, { s: 'FISH', v: 100 }],
];

type FreeState = { active: boolean; played: number; total: number; collected: number; multiplier: number; won: number };
const NO_FREE: FreeState = { active: false, played: 0, total: 0, collected: 0, multiplier: 1, won: 0 };

export default function FishermansCatchScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<FishermanConfig | null>(null);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [busy, setBusy] = useState(false);
  const [shownBalance, setShownBalance] = useState(coins);
  const [meter, setMeter] = useState<{ label: string; amount: number | null; tone: 'idle' | 'win' | 'return' | 'lose' }>({ label: 'TIGHT LINES', amount: null, tone: 'idle' });
  const [winLines, setWinLines] = useState<FishLineWin[]>([]);
  const [collecting, setCollecting] = useState(false);
  const [free, setFree] = useState<FreeState>(NO_FREE);
  const [banner, setBanner] = useState<{ title: string; sub?: string } | null>(null);
  const [panel, setPanel] = useState<'pay' | 'history' | null>(null);
  const [history, setHistory] = useState<FishermanSpinRow[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sessionNet, setSessionNet] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [cells, setCells] = useState<Cell[][]>(START);
  const [sceneH, setSceneH] = useState(0);
  const [flyers, setFlyers] = useState<{ id: string; from: { x: number; y: number }; to: { x: number; y: number }; text: string }[]>([]);
  const [jumping, setJumping] = useState(false);

  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const sessionStart = useRef(Date.now());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerAnim = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;
  const reelTurn = useRef(new Animated.Value(0)).current;
  const flyProg = useRef(new Animated.Value(0)).current;
  const jumpProg = useRef(new Animated.Value(0)).current;
  const reelFrameY = useRef(0);
  const boardY = useRef(0);
  const geom = useRef({ cabW: 0, reelW: 0, cell: 0, reelGap: 3, frame: 10, boardW: 0 });
  const hullId = `fcHull${useId().replace(/:/g, '')}`;
  const reels = [useRef<ReelHandle>(null), useRef<ReelHandle>(null), useRef<ReelHandle>(null), useRef<ReelHandle>(null), useRef<ReelHandle>(null)];

  const lineCount = config?.lineCount ?? 10;
  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const perLevel = config?.fishermenPerLevel ?? 4;
  const multipliers = config?.multipliers ?? [1, 2, 3, 10];
  const lines = config?.lines ?? [];
  const betLevels = useMemo(() => BET_LEVELS.filter((b) => b >= minStake && b <= maxStake), [minStake, maxStake]);

  useEffect(() => {
    if (!busyRef.current) setShownBalance(coins);
  }, [coins]);

  useEffect(() => {
    mountedRef.current = true;
    fetchFishermanConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => mountedRef.current && setToast('Could not load the game — check your connection.'));
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 420, useNativeDriver: true }),
      ])
    );
    const waves = Animated.loop(Animated.timing(drift, { toValue: 1, duration: 4000, easing: Easing.linear, useNativeDriver: true }));
    const bobbing = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    waves.start();
    bobbing.start();
    return () => {
      mountedRef.current = false;
      clearInterval(clock);
      loop.stop();
      waves.stop();
      bobbing.stop();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [pulse, drift, bob]);

  // The cast reel turns while a spin plays out.
  useEffect(() => {
    if (!busy) {
      reelTurn.stopAnimation();
      reelTurn.setValue(0);
      return;
    }
    reelTurn.setValue(0);
    const turning = Animated.loop(Animated.timing(reelTurn, { toValue: 1, duration: 700, easing: Easing.linear, useNativeDriver: true }));
    turning.start();
    return () => turning.stop();
  }, [busy, reelTurn]);

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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

  /** Spins the reels to `target`, stopping left to right with the last landing at `lastAt` ms after `t0`. */
  const spinReelsTo = useCallback(
    async (target: Cell[][], t0: number, lastAt: number) => {
      const elapsed = Date.now() - t0;
      await Promise.all(target.map((rows, i) => reels[i].current?.land(rows, Math.max(0, lastAt - (4 - i) * 260 - elapsed))));
      if (mountedRef.current) setCells(target);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /** Fish values on the reels fly as cash tags into the catch board when the Fishermen collect. */
  const flyToBoard = useCallback(
    async (target: Cell[][]) => {
      const g = geom.current;
      const to = { x: 10 + g.boardW / 2, y: boardY.current + 28 };
      const list: { id: string; from: { x: number; y: number }; to: { x: number; y: number }; text: string }[] = [];
      target.forEach((rows, reel) =>
        rows.forEach((c, row) => {
          if (c.s !== 'FISH' || !(c.v && c.v > 0)) return;
          list.push({
            id: `${reel}-${row}-${Date.now()}`,
            from: { x: g.frame + 8 + reel * (g.reelW + 2 + g.reelGap) + g.reelW / 2 + 1, y: reelFrameY.current + 8 + row * g.cell + g.cell / 2 + 1 },
            to,
            text: shortMoney(c.v),
          });
        })
      );
      if (!list.length || !mountedRef.current) return;
      flyProg.setValue(0);
      setFlyers(list);
      await new Promise<void>((r) => Animated.timing(flyProg, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start(() => r()));
      if (mountedRef.current) setFlyers([]);
    },
    [flyProg]
  );

  /** A fish leaps across the lake on a big catch. */
  const leap = useCallback(async () => {
    if (!mountedRef.current) return;
    jumpProg.setValue(0);
    setJumping(true);
    await new Promise<void>((r) => Animated.timing(jumpProg, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }).start(() => r()));
    if (mountedRef.current) setJumping(false);
  }, [jumpProg]);

  const spin = useCallback(async () => {
    if (busyRef.current || !config) return;
    if (bet > shownBalance) {
      showToast('Insufficient balance');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setWinLines([]);
    setCollecting(false);
    setMeter({ label: 'CASTING…', amount: null, tone: 'idle' });
    setShownBalance((b) => round2(b - bet));
    const t0 = Date.now();
    reels.forEach((r) => r.current?.start());

    let result: Awaited<ReturnType<typeof spinFisherman>>;
    try {
      result = await spinFisherman(bet);
    } catch (err) {
      reels.forEach((r, i) => r.current?.set(cells[i]));
      setShownBalance((b) => round2(b + bet));
      setMeter({ label: 'TIGHT LINES', amount: null, tone: 'idle' });
      showToast(errorMessage(err));
      busyRef.current = false;
      setBusy(false);
      return;
    }
    if (!mountedRef.current) return;
    const { outcome } = result;
    const payout = Number(result.spin.payout);
    const scale = (stakes: number) => round2(stakes * bet);

    // Base spin: the last reel lands no sooner than MIN_SPIN_MS after the press.
    const baseCells = cellsFor(config.baseStrips, outcome.stops, outcome.fishValues.map((r) => r.map(scale)));
    await spinReelsTo(baseCells, t0, MIN_SPIN_MS - 460);
    if (!mountedRef.current) return;
    setWinLines(outcome.lines);
    let shown = 0;
    if (outcome.baseWin > 0) {
      shown = scale(outcome.baseWin);
      await countUp('WIN', 0, shown);
      await wait(500);
    }

    // Free spins
    if (outcome.freeSpinsAwarded > 0) {
      await wait(400);
      await flashBanner(`${outcome.freeSpinsAwarded} FREE SPINS!`, `${outcome.boats} boats landed`, 1300);
      setWinLines([]);
      let state: FreeState = { active: true, played: 0, total: outcome.freeSpinsAwarded, collected: 0, multiplier: 1, won: 0 };
      setFree(state);
      for (const fs of outcome.freeSpins as FishFreeSpin[]) {
        if (!mountedRef.current) return;
        setWinLines([]);
        setCollecting(false);
        const ft0 = Date.now();
        reels.forEach((r) => r.current?.start());
        const target = cellsFor(config.freeStrips, fs.stops, fs.fishValues.map((r) => r.map(scale)));
        await spinReelsTo(target, ft0, FREE_SPIN_MS - 460);
        state = { ...state, played: state.played + 1 };
        setFree(state);
        if (fs.lines.length) setWinLines(fs.lines);
        const lineWin = scale(fs.win - fs.collect);
        if (lineWin > 0) {
          await countUp('WIN', shown, round2(shown + lineWin));
          shown = round2(shown + lineWin);
          state = { ...state, won: round2(state.won + lineWin) };
          setFree(state);
        }
        if (fs.fishermen > 0) {
          setCollecting(true);
          const got = scale(fs.collect);
          if (got > 0) {
            await flyToBoard(target);
            await flashBanner(`+${money(got)}`, `${fs.fishermen} fisherman${fs.fishermen > 1 ? 'men' : ''} collected${fs.multiplier > 1 ? ` · x${fs.multiplier}` : ''}`, 700);
            await countUp('WIN', shown, round2(shown + got));
            shown = round2(shown + got);
            state = { ...state, won: round2(state.won + got) };
          } else {
            await wait(500);
          }
          state = { ...state, collected: fs.collected };
          setFree(state);
        }
        if (fs.retrigger > 0) {
          const nextMult = multipliers[Math.min(Math.floor(fs.collected / perLevel), multipliers.length - 1)];
          await flashBanner(`+${fs.retrigger} FREE SPINS`, `Multiplier now x${nextMult}`, 1100);
          state = { ...state, total: state.total + fs.retrigger, multiplier: nextMult };
          setFree(state);
        }
        await wait(fs.win > 0 ? 450 : 250);
      }
      setCollecting(false);
      if (state.won > 0) void leap();
      await flashBanner('FEATURE WIN', money(state.won), 1500);
      setFree(NO_FREE);
    }

    // Only a return above the stake is celebrated; a smaller one is shown plainly.
    if (payout > bet) {
      if (shown !== payout) await countUp('WIN', shown, payout);
      if (payout >= bet * 10 && outcome.freeSpinsAwarded === 0) void leap();
      if (payout >= bet * 20 && outcome.freeSpinsAwarded === 0) await flashBanner(payout >= bet * 100 ? 'MEGA WIN' : 'BIG WIN', money(payout), 1300);
      setMeter({ label: 'WIN', amount: payout, tone: 'win' });
    } else if (payout > 0) {
      setMeter({ label: 'RETURNED', amount: payout, tone: 'return' });
    } else {
      setMeter({ label: 'NO CATCH', amount: null, tone: 'lose' });
    }

    setShownBalance((b) => round2(b + payout));
    setSessionNet((n) => round2(n + payout - bet));
    refreshWallet();
    if (panel === 'history') fetchFishermanHistory(30).then((h) => mountedRef.current && setHistory(h)).catch(() => {});
    busyRef.current = false;
    if (mountedRef.current) setBusy(false);
    // reels are stable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, bet, shownBalance, cells, panel, multipliers, perLevel, flashBanner, countUp, spinReelsTo, flyToBoard, leap, refreshWallet, showToast]);

  const stepBet = (dir: 1 | -1) => {
    if (busy) return;
    const idx = Math.max(0, betLevels.indexOf(bet));
    setBet(betLevels[Math.max(0, Math.min(betLevels.length - 1, idx + dir))] ?? bet);
  };

  const openHistory = () => {
    setPanel('history');
    setHistory(null);
    fetchFishermanHistory(30)
      .then((h) => mountedRef.current && setHistory(h))
      .catch(() => mountedRef.current && setHistory([]));
  };

  // ---------- layout ----------
  const cabW = Math.min(W - 12, 470);
  const frame = 10;
  const reelGap = 3;
  // Frame: 2px border + 4px padding on each side, then 4px padding inside; each reel window has a 1px border.
  const reelsW = cabW - frame * 2 - 20;
  const reelW = Math.floor((reelsW - reelGap * 4 - 10) / 5);
  const cell = Math.floor(Math.min(reelW * 1.02, 96));
  const reelsH = cell * 3;
  geom.current = { cabW, reelW, cell, reelGap, frame, boardW: free.active ? (cabW - 26) * 0.5 : cabW - 20 };

  const litCells = useMemo(() => {
    const lit = [0, 1, 2, 3, 4].map(() => [false, false, false]);
    winLines.forEach((w) => lines[w.line]?.forEach((row, reel) => reel < w.count && (lit[reel][row] = true)));
    return lit;
  }, [winLines, lines]);
  const dimFor = (reel: number) => {
    if (collecting) return cells[reel].map((c) => c.s !== 'FISH' && c.s !== 'WILD');
    return winLines.length > 0 ? litCells[reel].map((x) => !x) : [false, false, false];
  };
  const glowFor = (reel: number) => (collecting ? cells[reel].map((c) => c.s === 'WILD') : [false, false, false]);

  const levelIndex = Math.min(Math.floor(free.collected / perLevel), multipliers.length - 1);
  const inLevel = levelIndex >= multipliers.length - 1 ? perLevel : free.collected % perLevel;
  const minutes = Math.floor((now - sessionStart.current) / 60000);
  const seconds = Math.floor(((now - sessionStart.current) % 60000) / 1000);
  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const meterColor = meter.tone === 'win' ? '#D8FFB0' : meter.tone === 'return' ? '#FFE0A0' : '#FFF1D0';
  const boardW = geom.current.boardW;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={free.active ? ['#060B2A', '#02040F'] : ['#1A0F3A', '#05030F']} style={StyleSheet.absoluteFill} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color="#FFFFFF" />
          <MaterialCommunityIcons name="fish" size={20} color={GOLD} />
          <Text style={styles.title}>FISHERMAN'S CATCH</Text>
        </Pressable>
        <View style={styles.balancePill}>
          <MaterialCommunityIcons name="anchor" size={15} color={GOLD} />
          <Text style={styles.balanceText}>{money(shownBalance)}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24, alignItems: 'center' }} scrollEnabled={!busy}>
        <View style={[styles.cabinet, { width: cabW }]} onLayout={(e) => setSceneH(Math.round(e.nativeEvent.layout.height))}>
          {sceneH > 0 && <LakeScene w={cabW} h={sceneH} night={free.active} />}
          <Waves w={cabW} drift={drift} night={free.active} />
          <View style={{ alignItems: 'center', marginTop: 6 }}>
            <Title width={cabW * 0.94} free={free.active} />
          </View>

          {/* Free spins: spins left, the Fisherman hook line and the life-ring multiplier */}
          {free.active && (
            <View style={styles.freeBar}>
              <View style={styles.freeBox}>
                <Text style={styles.freeLabel}>FREE SPINS</Text>
                <Text style={styles.freeValue}>
                  {free.played}/{free.total}
                </Text>
              </View>
              <View style={styles.hookBox}>
                <HookLine count={perLevel} filled={inLevel} width={cabW * 0.36} />
                <View style={{ flexDirection: 'row', gap: 4, marginTop: -4 }}>
                  {multipliers.slice(1).map((m, i) => (
                    <Text key={m} style={[styles.levelText, levelIndex >= i + 1 && styles.levelOn]}>
                      x{m}
                    </Text>
                  ))}
                </View>
              </View>
              <LifeRing mult={free.multiplier} size={52} pulse={free.multiplier > 1 ? pulseScale : 1} />
            </View>
          )}

          {/* Reels in a wooden frame */}
          <View style={[styles.reelFrame, { marginHorizontal: frame }]} onLayout={(e) => (reelFrameY.current = e.nativeEvent.layout.y)}>
            <LinearGradient colors={['#A0612E', WOOD, WOOD_DARK]} style={[StyleSheet.absoluteFill, { borderRadius: 14 }]} />
            <View style={{ flexDirection: 'row', gap: reelGap, padding: 4 }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <View key={i} style={styles.reelWindow}>
                  <LinearGradient colors={free.active ? ['#1A2A5A', '#0E1A3A'] : ['#CFEFFF', '#8FD0F0', '#4FA8D8']} style={StyleSheet.absoluteFill} />
                  <Reel ref={reels[i]} reel={i} initial={START[i]} cell={cell} width={reelW} dimmed={dimFor(i)} glowing={glowFor(i)} free={free.active} bet={bet} />
                </View>
              ))}
            </View>
            {lines.length > 0 && (
              <Svg width={reelsW} height={reelsH + 2} style={{ position: 'absolute', left: 8, top: 8 }} pointerEvents="none">
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
            {/* Rope tied along the top of the frame */}
            <View pointerEvents="none" style={styles.rope} />
          </View>

          {/* Catch boards */}
          <View style={styles.boardRow} onLayout={(e) => (boardY.current = e.nativeEvent.layout.y)}>
            <CatchBoard label={meter.label} value={meter.amount === null ? '~ ~ ~' : money(meter.amount)} color={meterColor} width={boardW} />
            {free.active && <CatchBoard label="FEATURE" value={money(free.won)} color="#FFE36B" width={(cabW - 26) * 0.5} />}
          </View>
          <View style={{ height: 44 }} />
          <View pointerEvents="none" style={{ position: 'absolute', right: cabW * 0.2, bottom: 4, height: 34, width: 18 }}>
            <Bobber bob={bob} />
          </View>

          {/* Cash tags flying to the board, and the leaping fish */}
          {flyers.map((f) => (
            <Flyer key={f.id} from={f.from} to={f.to} text={f.text} progress={flyProg} />
          ))}
          {jumping && <JumpingFish width={cabW} progress={jumpProg} />}
        </View>

        {/* Line wins */}
        <View style={[styles.lineWinsRow, { width: cabW }]}>
          {winLines.length === 0 ? (
            <Text style={styles.lineWinHint}>{lineCount} lines · 3+ boats start free spins</Text>
          ) : (
            winLines.map((w) => (
              <View key={w.line} style={[styles.lineChip, { borderColor: LINE_COLORS[w.line] }]}>
                <Text style={[styles.lineChipText, { color: LINE_COLORS[w.line] }]}>
                  L{w.line + 1} {w.count}×
                </Text>
                <FishArt s={w.symbol} size={18} />
                <Text style={styles.lineChipText}>{money(round2((w.pays * bet) / lineCount))}</Text>
              </View>
            ))
          )}
        </View>

        {/* The boat: bait board, reel and the tackle crates */}
        <View style={[styles.boat, { width: cabW }]}>
          <Svg width={cabW} height={132} style={StyleSheet.absoluteFill} viewBox={`0 0 ${cabW} 132`}>
            <Defs>
              <SvgLinearGradient id={hullId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#A86A34" />
                <Stop offset="0.6" stopColor="#6B3E1E" />
                <Stop offset="1" stopColor="#3A1F0C" />
              </SvgLinearGradient>
            </Defs>
            <Path d={`M 4 10 L ${cabW - 4} 10 C ${cabW - 14} 80, ${cabW - 50} 128, ${cabW / 2} 128 C 50 128, 14 80, 4 10 Z`} fill={`url(#${hullId})`} stroke="#2A1004" strokeWidth={2.5} />
            {[34, 58, 82, 104].map((y) => (
              <Path key={y} d={`M ${14 + (y - 10) * 0.18} ${y} L ${cabW - 14 - (y - 10) * 0.18} ${y}`} stroke="#2A1004" strokeOpacity={0.3} strokeWidth={1.2} />
            ))}
            <Rect x={0} y={2} width={cabW} height={12} rx={6} fill="#C88A48" stroke="#2A1004" strokeWidth={2} />
            <Path d={`M 10 8 Q ${cabW / 4} 16 ${cabW / 2} 8 Q ${(cabW * 3) / 4} 16 ${cabW - 10} 8`} stroke="#E8D8B0" strokeWidth={2.5} fill="none" strokeDasharray="5 3" />
          </Svg>
          <View style={styles.boatRow}>
            {/* Bait board hanging on two ropes */}
            <View style={{ alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', gap: 52 }}>
                <View style={styles.hangRope} />
                <View style={styles.hangRope} />
              </View>
              <View style={styles.baitBoard}>
                <Text style={styles.baitLabel}>BAIT</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Pressable onPress={() => stepBet(-1)} disabled={busy} style={[styles.knot, busy && styles.dim]} hitSlop={8}>
                    <MaterialCommunityIcons name="minus" size={16} color="#3A1F0C" />
                  </Pressable>
                  <Text style={styles.baitValue}>{money(bet)}</Text>
                  <Pressable onPress={() => stepBet(1)} disabled={busy} style={[styles.knot, busy && styles.dim]} hitSlop={8}>
                    <MaterialCommunityIcons name="plus" size={16} color="#3A1F0C" />
                  </Pressable>
                </View>
              </View>
            </View>

            {/* Cast: the fishing reel */}
            <Pressable onPress={spin} disabled={busy || !config} style={({ pressed }) => [{ alignItems: 'center' }, pressed && { transform: [{ scale: 0.94 }] }]}>
              <FishingReel size={78} turn={reelTurn} lit={!busy && !!config} />
              <Text style={[styles.castText, (busy || !config) && { color: '#8A8E98' }]}>{busy ? 'REELING…' : 'CAST'}</Text>
            </Pressable>

            {/* Tackle crates */}
            <View style={{ gap: 8 }}>
              <Pressable onPress={() => setPanel('pay')} style={styles.crate} hitSlop={4}>
                <MaterialCommunityIcons name="toolbox" size={18} color="#FFE9B0" />
                <Text style={styles.crateText}>PAYS</Text>
              </Pressable>
              <Pressable onPress={openHistory} style={styles.crate} hitSlop={4}>
                <MaterialCommunityIcons name="notebook" size={18} color="#FFE9B0" />
                <Text style={styles.crateText}>LOG</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Session (UK: time played and net position, always on show) */}
        <View style={[styles.session, { width: cabW }]}>
          <MaterialCommunityIcons name="timer-outline" size={15} color="#B9C3D6" />
          <Text style={styles.sessionText}>
            Session {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </Text>
          <Text style={styles.sessionSep}>·</Text>
          <Text style={[styles.sessionText, { color: sessionNet > 0 ? '#7CFF9A' : sessionNet < 0 ? '#FF9AA6' : '#B9C3D6' }]}>
            Net {sessionNet >= 0 ? '+' : '−'}
            {money(Math.abs(sessionNet))}
          </Text>
        </View>

        <GameInfoButton>
          RTP {config ? `${config.rtpPercent}%` : '—'} · bet {money(minStake)}–{money(maxStake)} · max win {money(config?.maxPayout ?? 10000)} per spin{'\n'}
          No autoplay or turbo · each paid spin takes at least 2.5 seconds · provably fair
        </GameInfoButton>
      </ScrollView>

      {banner && (
        <Animated.View
          pointerEvents="none"
          style={[styles.banner, { opacity: bannerAnim, transform: [{ scale: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]}
        >
          <LinearGradient colors={['#FFF4B8', '#FFC93C', '#C07800']} style={styles.bannerInner}>
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
              <Text style={styles.modalTitle}>{panel === 'pay' ? 'PAYTABLE' : 'CATCH LOG'}</Text>
              <Pressable onPress={() => setPanel(null)} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={22} color="#FFFFFF" />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 480 }}>{panel === 'pay' ? <Paytable bet={bet} config={config} /> : <History spins={history} />}</ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const PAY_ORDER: FishSymbol[] = ['ROD', 'TACKLE', 'LURE', 'FISH', 'ACE', 'KING', 'QUEEN', 'JACK'];

function Paytable({ bet, config }: { bet: number; config: FishermanConfig | null }) {
  if (!config) return <Text style={styles.payNote}>Loading…</Text>;
  const lineBet = bet / config.lineCount;
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.payNote}>
        Your bet of {money(bet)} plays all {config.lineCount} lines ({money(lineBet)} each). Wins pay left to right from the first reel; prizes are per line at this bet.
      </Text>
      <View style={styles.payHead}>
        <Text style={[styles.payHeadText, { flex: 1 }]} />
        {['3×', '4×', '5×'].map((h) => (
          <Text key={h} style={styles.payHeadText}>
            {h}
          </Text>
        ))}
      </View>
      {PAY_ORDER.map((sym) => {
        const p = config.pays[sym];
        if (!p) return null;
        return (
          <View key={sym} style={styles.payRow}>
            <View style={{ flex: 1 }}>
              <FishArt s={sym} size={34} />
            </View>
            {p.map((x, i) => (
              <Text key={i} style={styles.payValue}>
                {money(round2(x * lineBet))}
              </Text>
            ))}
          </View>
        );
      })}
      <Text style={styles.paySection}>FREE SPINS</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <FishArt s="BONUS" size={40} />
        <Text style={styles.payNote}>
          3, 4 or 5 boats anywhere start {config.freeSpinsFor['3']}, {config.freeSpinsFor['4']} or {config.freeSpinsFor['5']} free spins (about one spin in {Math.round(100 / config.featureChancePercent)}).
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <FishArt s="WILD" size={40} />
        <Text style={styles.payNote}>
          In free spins the Fisherman is wild and collects the cash on every fish on screen. Every {config.fishermenPerLevel} Fishermen collected add {config.retriggerSpins} free spins and raise the multiplier to x
          {config.multipliers.slice(1).join(', then x')}.
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <FishArt s="FISH" size={40} value={bet} />
        <Text style={styles.payNote}>Fish carry {config.fishValues.map((f) => `${f.value}x`).join(', ')} your bet.</Text>
      </View>
      <Text style={styles.payNote}>RTP {config.rtpPercent}%. Results come from your provably-fair seeds on the server.</Text>
    </View>
  );
}

function History({ spins }: { spins: FishermanSpinRow[] | null }) {
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
            <Text style={styles.histTags}>{s.freeSpins > 0 ? `${s.freeSpins} FREE` : ''}</Text>
            <Text style={[styles.histWin, { color: pay > stake ? '#7CFF9A' : pay > 0 ? '#FFD9A0' : '#7A8090' }]}>{pay > 0 ? money(pay) : '—'}</Text>
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
  title: { color: '#FFFFFF', fontSize: 16, fontWeight: '900', fontStyle: 'italic', letterSpacing: 1 },
  balancePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(255,209,102,0.12)', borderWidth: 1, borderColor: 'rgba(255,209,102,0.4)' },
  balanceText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  cabinet: { borderRadius: 22, borderWidth: 3, borderColor: GOLD_DEEP, overflow: 'hidden', marginTop: 4 },
  freeBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, height: 56, marginBottom: 2 },
  hookBox: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 14, paddingHorizontal: 6, paddingBottom: 3 },
  freeBox: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 2, borderWidth: 1, borderColor: GOLD },
  freeLabel: { color: GOLD, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  freeValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  levelText: { color: '#6A6050', fontSize: 11, fontWeight: '900' },
  levelOn: { color: GOLD },
  reelFrame: { borderRadius: 14, borderWidth: 2, borderColor: WOOD_DARK, padding: 4 },
  reelWindow: { borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.35)' },
  fishTag: { position: 'absolute', alignSelf: 'center', backgroundColor: '#FFC93C', borderRadius: 8, borderWidth: 1.5, borderColor: '#8A5A00', paddingVertical: 1 },
  fishTagText: { color: '#3A1F00', fontWeight: '900' },
  lineWinsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 8, minHeight: 26 },
  lineWinHint: { color: '#A9B6CC', fontSize: 11, fontWeight: '700' },
  lineChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, borderWidth: 1.5, backgroundColor: 'rgba(0,0,0,0.35)' },
  lineChipText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  session: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)' },
  sessionText: { color: '#B9C3D6', fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sessionSep: { color: '#5A6070', fontSize: 12 },
  dim: { opacity: 0.4 },
  rope: { position: 'absolute', left: 6, right: 6, top: -3, height: 6, borderRadius: 3, backgroundColor: '#D8BC86', borderWidth: 1, borderColor: '#7A5A2A', borderStyle: 'dashed' },
  boardRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10, marginTop: 10, gap: 6 },
  boardLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 2, opacity: 0.85 },
  boardValue: { fontSize: 20, fontWeight: '900', fontVariant: ['tabular-nums'], textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  flyTag: { width: 44, alignItems: 'center', backgroundColor: '#FFC93C', borderRadius: 9, borderWidth: 2, borderColor: '#FFF3B0', paddingVertical: 2, shadowColor: '#FFD166', shadowOpacity: 0.9, shadowRadius: 8, elevation: 6 },
  flyText: { color: '#3A1F00', fontSize: 11, fontWeight: '900' },
  boat: { height: 132, marginTop: 10 },
  boatRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 12, paddingBottom: 18 },
  hangRope: { width: 2, height: 10, backgroundColor: '#D8BC86' },
  baitBoard: { alignItems: 'center', backgroundColor: '#E8C890', borderRadius: 8, borderWidth: 2, borderColor: '#5A2E10', paddingHorizontal: 8, paddingVertical: 4 },
  baitLabel: { color: '#5A2E10', fontSize: 10, fontWeight: '900', letterSpacing: 3 },
  baitValue: { color: '#2A1004', fontSize: 15, fontWeight: '900', minWidth: 62, textAlign: 'center', fontVariant: ['tabular-nums'] },
  knot: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#D8BC86', borderWidth: 2, borderColor: '#7A5A2A', alignItems: 'center', justifyContent: 'center' },
  castText: { color: '#FFE9B0', fontSize: 13, fontWeight: '900', letterSpacing: 2, marginTop: 2, textShadowColor: '#000', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  crate: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#5A3418', borderRadius: 6, borderWidth: 2, borderColor: '#2A1004', paddingHorizontal: 8, paddingVertical: 5, borderTopColor: '#A0612E' },
  crateText: { color: '#FFE9B0', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  banner: { position: 'absolute', top: '30%', alignSelf: 'center' },
  bannerInner: { paddingHorizontal: 26, paddingVertical: 12, borderRadius: 18, borderWidth: 3, borderColor: '#FFF8D0', alignItems: 'center' },
  bannerText: { color: '#3A1A00', fontSize: 28, fontWeight: '900', fontStyle: 'italic', letterSpacing: 1 },
  bannerSub: { color: '#5A2E00', fontSize: 13, fontWeight: '800', marginTop: 2 },
  toast: { position: 'absolute', bottom: 120, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14 },
  toastText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  modalBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  modalCard: { backgroundColor: '#0B1424', borderRadius: 18, borderWidth: 2, borderColor: GOLD_DEEP, padding: 14 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { color: GOLD, fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  payHead: { flexDirection: 'row', alignItems: 'center' },
  payHeadText: { color: GOLD, fontSize: 11, fontWeight: '900', width: 74, textAlign: 'right' },
  payRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 1, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,209,102,0.15)' },
  payValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '900', width: 74, textAlign: 'right' },
  paySection: { color: GOLD, fontSize: 12, fontWeight: '900', letterSpacing: 2, marginTop: 8 },
  payNote: { color: '#C8D2E2', fontSize: 12, lineHeight: 17, flexShrink: 1 },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)' },
  histTime: { color: '#98A0B0', fontSize: 11, width: 82 },
  histStake: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', width: 70 },
  histTags: { color: GOLD, fontSize: 10, fontWeight: '900', flex: 1 },
  histWin: { fontSize: 12, fontWeight: '900' },
});
