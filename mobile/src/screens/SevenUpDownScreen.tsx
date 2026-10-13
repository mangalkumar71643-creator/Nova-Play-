import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient as SvgLinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { ApiClientError } from '../api/client';
import {
  SevenUpDownArea,
  SevenUpDownConfig,
  SevenUpDownHistoryEntry,
  SevenUpDownRoundView,
  cancelSevenUpDownBets,
  fetchSevenUpDownConfig,
  fetchSevenUpDownCurrent,
  fetchSevenUpDownHistory,
  fetchSevenUpDownMyRound,
  placeSevenUpDownBets,
} from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const W = Dimensions.get('window').width;
const BOARD_PAD = 8;

const CHIP_VALUES = [1, 5, 10, 50, 100, 500];
const CHIP_COLORS: Record<number, string> = {
  1: '#6B7A90',
  5: '#D93A3A',
  10: '#1E9E4A',
  50: '#2563EB',
  100: '#262626',
  500: '#8B2FC9',
};
const DEFAULT_CHIP = 10;

// Shown when the config hasn't loaded yet — same formula as the server
// (rtp * 36 / ways, rounded down at 85% RTP).
const FALLBACK_MULTIPLIERS: Record<SevenUpDownArea, number> = {
  DOWN: 2.04,
  SEVEN: 5.1,
  UP: 2.04,
  N2: 30.6,
  N3: 15.3,
  N4: 10.2,
  N5: 7.65,
  N6: 6.12,
  N8: 6.12,
  N9: 7.65,
  N10: 10.2,
  N11: 15.3,
  N12: 30.6,
};

// Every box on the board has its own background.
const BIG_BOXES: { area: SevenUpDownArea; label: string; watermark: string; colors: [string, string]; border: string }[] =
  [
    { area: 'DOWN', label: '2-6', watermark: 'DOWN', colors: ['#27B556', '#0B5E27'], border: '#6CF09A' },
    { area: 'SEVEN', label: '7', watermark: 'LUCKY', colors: ['#3A8CF0', '#123A85'], border: '#8CC4FF' },
    { area: 'UP', label: '8-12', watermark: 'UP', colors: ['#EE4B3F', '#86130F'], border: '#FF9A90' },
  ];
const NUMBER_CELLS: { area: SevenUpDownArea; n: number; colors: [string, string] }[] = [
  { area: 'N2', n: 2, colors: ['#11968B', '#08433E'] },
  { area: 'N3', n: 3, colors: ['#8B4CF0', '#3F1885'] },
  { area: 'N4', n: 4, colors: ['#E0661E', '#7A2A0A'] },
  { area: 'N5', n: 5, colors: ['#D93A83', '#76123F'] },
  { area: 'N6', n: 6, colors: ['#2F63E8', '#152F80'] },
  { area: 'N8', n: 8, colors: ['#23A04F', '#0D4A23'] },
  { area: 'N9', n: 9, colors: ['#D4921A', '#6E4205'] },
  { area: 'N10', n: 10, colors: ['#1597B8', '#0A3F52'] },
  { area: 'N11', n: 11, colors: ['#A646E8', '#4A1675'] },
  { area: 'N12', n: 12, colors: ['#D63030', '#6E0E0E'] },
];

const BIG_H = W * 0.29;
// The 7 box is the narrowest; size every watermark to fit inside it.
const SEVEN_BOX_W = ((W - BOARD_PAD * 2 - 12) * 26) / 96;
function watermarkSize(text: string): number {
  return Math.min(BIG_H * 0.3, (SEVEN_BOX_W - 8) / (text.length * 0.72));
}
const CELL_W = (W - BOARD_PAD * 2) / 5;
const CELL_H = W * 0.165;

const CUP_W = Math.min(W * 0.58, 260);
const CUP_H = CUP_W * 0.98;
const BASE_H = CUP_W * 0.36;
const DOME_W = CUP_W * 0.8;
const DOME_H = CUP_W * 0.66;
const DIE_SIZE = CUP_W * 0.22;
// Cup dice: 3D cubes resting on the felt, circling it while they roll.
const DIE3D_BOX = DIE_SIZE * 1.3 + DIE_SIZE * 0.14;
const FELT_CY = CUP_H - BASE_H + BASE_H * 0.46;
const DIE_REST = [
  { x: -DIE_SIZE * 0.72, y: -DIE_SIZE * 0.05, tilt: '-4deg' },
  { x: DIE_SIZE * 0.72, y: DIE_SIZE * 0.12, tilt: '3deg' },
];
const ORBIT_RX = CUP_W * 0.17;
const ORBIT_RY = BASE_H * 0.16;
const ORBIT_STEPS = Array.from({ length: 13 }, (_, i) => i / 12);

const HISTORY_COLUMNS = 14;
const WIN_CARD_MS = 3000;
const TOAST_MS = 1600;

function areaWins(area: SevenUpDownArea, total: number): boolean {
  if (area === 'DOWN') return total <= 6;
  if (area === 'UP') return total >= 8;
  if (area === 'SEVEN') return total === 7;
  return total === Number(area.slice(1));
}

function totalColor(total: number): string {
  if (total === 7) return '#2F7BE0';
  return total < 7 ? '#1E9E4A' : '#D93A3A';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

function chipColorFor(amount: number): string {
  const v = [...CHIP_VALUES].reverse().find((c) => c <= amount) ?? CHIP_VALUES[0];
  return CHIP_COLORS[v];
}

function shortAmount(n: number): string {
  if (n >= 1000) return `${round2(n / 1000)}k`;
  return String(round2(n));
}

// ---------- visual pieces ----------

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

const Die = memo(function Die({ value, size }: { value: number; size: number }) {
  // Asian-style dice: the 1 and the 4 have red pips.
  const red = value === 1 || value === 4;
  const pip = value === 1 ? size * 0.28 : size * 0.18;
  const inset = size * 0.2;
  const step = (size - inset * 2) / 2;
  return (
    <LinearGradient
      colors={['#FFFFFF', '#E9E9EC', '#C9C9D0']}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[styles.die, { width: size, height: size, borderRadius: size * 0.2 }]}
    >
      {PIPS[value].map((i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            width: pip,
            height: pip,
            borderRadius: pip / 2,
            left: inset + (i % 3) * step - pip / 2,
            top: inset + Math.floor(i / 3) * step - pip / 2,
            backgroundColor: red ? '#D0142C' : '#17171A',
          }}
        />
      ))}
    </LinearGradient>
  );
});

// Faces seen alongside each front face (top, right). Opposite faces sum to
// 7, so every pair here is a real neighbouring pair on a die.
const SIDE_FACES: Record<number, [number, number]> = {
  1: [2, 3],
  2: [3, 1],
  3: [1, 2],
  4: [1, 5],
  5: [1, 3],
  6: [2, 4],
};
const PIP_UV: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.27, 0.27], [0.73, 0.73]],
  3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
  5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
  6: [[0.27, 0.25], [0.73, 0.25], [0.27, 0.5], [0.73, 0.5], [0.27, 0.75], [0.73, 0.75]],
};

type Pt = [number, number];

/** Closed path through `pts` with every corner rounded off by up to `r`
 * (quadratic curve through the corner), so faces meet cleanly. */
function roundedPoly(pts: Pt[], r: number): string {
  const n = pts.length;
  let d = '';
  for (let i = 0; i < n; i++) {
    const prev = pts[(i + n - 1) % n];
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    const toPrev = [prev[0] - cur[0], prev[1] - cur[1]];
    const toNext = [next[0] - cur[0], next[1] - cur[1]];
    const lp = Math.hypot(toPrev[0], toPrev[1]);
    const ln = Math.hypot(toNext[0], toNext[1]);
    const rp = Math.min(r, lp / 2);
    const rn = Math.min(r, ln / 2);
    const a: Pt = [cur[0] + (toPrev[0] / lp) * rp, cur[1] + (toPrev[1] / lp) * rp];
    const b: Pt = [cur[0] + (toNext[0] / ln) * rn, cur[1] + (toNext[1] / ln) * rn];
    d += `${i === 0 ? 'M' : 'L'} ${a[0].toFixed(2)} ${a[1].toFixed(2)} Q ${cur[0].toFixed(2)} ${cur[1].toFixed(2)} ${b[0].toFixed(2)} ${b[1].toFixed(2)} `;
  }
  return `${d}Z`;
}

/** A die drawn as one rounded block: a bevelled silhouette with the front,
 * top and right faces inset on it, each face's pips projected onto it. */
const Die3D = memo(function Die3D({ value, size }: { value: number; size: number }) {
  const a = size;
  const dx = a * 0.3; // depth, going back-right...
  const dy = a * 0.24; // ...and up
  const pad = a * 0.07;
  const width = a + dx + pad * 2;
  const height = a + dy + pad * 2;
  const [top, right] = SIDE_FACES[value];

  const front = (u: number, v: number): Pt => [pad + u * a, pad + dy + v * a];
  // top: v = 1 is the edge shared with the front face
  const topF = (u: number, v: number): Pt => [pad + u * a + (1 - v) * dx, pad + dy - (1 - v) * dy];
  // right: u = 0 is the edge shared with the front face
  const rightF = (u: number, v: number): Pt => [pad + a + u * dx, pad + dy - u * dy + v * a];

  const silhouette: Pt[] = [front(0, 1), front(0, 0), topF(0, 0), topF(1, 0), rightF(1, 1), front(1, 1)];
  const inset = (face: (u: number, v: number) => Pt, e: number): Pt[] => [
    face(e, e),
    face(1 - e, e),
    face(1 - e, 1 - e),
    face(e, 1 - e),
  ];

  const pips = (face: (u: number, v: number) => Pt, n: number, shade: number) => {
    const red = n === 1 || n === 4;
    const r = n === 1 ? 0.13 : 0.085;
    const ring = (cu: number, cv: number, rr: number) => {
      const pts: Pt[] = [];
      for (let k = 0; k < 16; k++) {
        const t = (k / 16) * Math.PI * 2;
        pts.push(face(cu + rr * Math.cos(t), cv + rr * Math.sin(t)));
      }
      return `M ${pts.map((q) => `${q[0].toFixed(2)} ${q[1].toFixed(2)}`).join(' L ')} Z`;
    };
    return PIP_UV[n].map(([cu, cv], i) => (
      <React.Fragment key={i}>
        <Path d={ring(cu, cv, r)} fill={red ? '#B80F2A' : '#15151B'} fillOpacity={shade} />
        {/* Light catching the lower-right rim makes each pip read as a dimple. */}
        <Path d={ring(cu + r * 0.25, cv + r * 0.25, r * 0.55)} fill={red ? '#E8465E' : '#4A4A56'} fillOpacity={0.55 * shade} />
      </React.Fragment>
    ));
  };

  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgLinearGradient id="d3edge" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#E9E9EE" />
          <Stop offset="1" stopColor="#A7A7B3" />
        </SvgLinearGradient>
        <SvgLinearGradient id="d3front" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#E6E6EC" />
        </SvgLinearGradient>
        <SvgLinearGradient id="d3top" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#F3F3F7" />
        </SvgLinearGradient>
        <SvgLinearGradient id="d3right" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#D2D2DA" />
          <Stop offset="1" stopColor="#ADADB9" />
        </SvgLinearGradient>
      </Defs>
      {/* Bevelled body: one rounded outline, so every corner meets. */}
      <Path d={roundedPoly(silhouette, a * 0.16)} fill="url(#d3edge)" />
      <Path d={roundedPoly(inset(rightF, 0.07), a * 0.08)} fill="url(#d3right)" />
      <Path d={roundedPoly(inset(topF, 0.07), a * 0.08)} fill="url(#d3top)" />
      <Path d={roundedPoly(inset(front, 0.045), a * 0.14)} fill="url(#d3front)" />
      {pips(topF, top, 0.7)}
      {pips(rightF, right, 0.65)}
      {pips(front, value, 1)}
    </Svg>
  );
});

const Chip = memo(function Chip({ value, size, label }: { value: number; size: number; label?: string }) {
  const color = CHIP_COLORS[value] ?? chipColorFor(value);
  const r = size / 2;
  const ringR = r - size * 0.1;
  const circ = 2 * Math.PI * ringR;
  const text = label ?? String(value);
  const fontSize = size * (text.length > 3 ? 0.22 : 0.28);
  return (
    <Svg width={size} height={size}>
      <Circle cx={r} cy={r} r={r - 0.5} fill={color} stroke="#00000055" strokeWidth={1} />
      <Circle
        cx={r}
        cy={r}
        r={ringR}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={size * 0.13}
        strokeDasharray={`${circ / 16} ${circ / 16}`}
      />
      <Circle cx={r} cy={r} r={size * 0.3} fill="#FFFFFF" stroke={color} strokeWidth={1.5} />
      <SvgText x={r} y={r + fontSize * 0.36} fontSize={fontSize} fontWeight="bold" fill={color} textAnchor="middle">
        {text}
      </SvgText>
    </Svg>
  );
});

function CupBase() {
  return (
    <Svg width={CUP_W} height={BASE_H}>
      <Defs>
        <SvgLinearGradient id="baseRim" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#5A5A60" />
          <Stop offset="0.5" stopColor="#1E1E22" />
          <Stop offset="1" stopColor="#050506" />
        </SvgLinearGradient>
        <RadialGradient id="baseFelt" cx="50%" cy="45%" r="60%">
          <Stop offset="0" stopColor="#23B064" />
          <Stop offset="1" stopColor="#0A5530" />
        </RadialGradient>
      </Defs>
      <Ellipse cx={CUP_W / 2} cy={BASE_H / 2} rx={CUP_W / 2 - 1} ry={BASE_H / 2 - 1} fill="url(#baseRim)" />
      <Ellipse
        cx={CUP_W / 2}
        cy={BASE_H / 2}
        rx={CUP_W / 2 - 4}
        ry={BASE_H / 2 - 4}
        fill="none"
        stroke="#8A8A92"
        strokeOpacity={0.5}
        strokeWidth={1.5}
      />
      <Ellipse cx={CUP_W / 2} cy={BASE_H * 0.46} rx={CUP_W * 0.4} ry={BASE_H * 0.34} fill="url(#baseFelt)" />
    </Svg>
  );
}

function Dome() {
  const w = DOME_W;
  const h = DOME_H;
  return (
    <Svg width={w} height={h + h * 0.1}>
      <Defs>
        <SvgLinearGradient id="glass" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.34} />
          <Stop offset="0.35" stopColor="#FFFFFF" stopOpacity={0.06} />
          <Stop offset="0.75" stopColor="#FFFFFF" stopOpacity={0.1} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0.3} />
        </SvgLinearGradient>
      </Defs>
      <Path
        d={`M 1 ${h} L 1 ${h * 0.5} C 1 ${-h * 0.08}, ${w - 1} ${-h * 0.08}, ${w - 1} ${h * 0.5} L ${w - 1} ${h} Z`}
        fill="url(#glass)"
        stroke="#FFFFFF"
        strokeOpacity={0.45}
        strokeWidth={1.5}
      />
      <Path
        d={`M ${w * 0.16} ${h * 0.62} C ${w * 0.14} ${h * 0.3}, ${w * 0.26} ${h * 0.14}, ${w * 0.4} ${h * 0.1}`}
        stroke="#FFFFFF"
        strokeOpacity={0.6}
        strokeWidth={3}
        strokeLinecap="round"
        fill="none"
      />
      <Ellipse cx={w / 2} cy={h} rx={w / 2 - 1} ry={h * 0.08} fill="none" stroke="#FFFFFF" strokeOpacity={0.35} strokeWidth={1.5} />
    </Svg>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING = 62;
const RING_R = 26;
const RING_C = 2 * Math.PI * RING_R;

/** Countdown to the end of betting. Ticks on its own so the rest of the
 * screen doesn't re-render every frame. */
function TimerRing({ betEndMs, totalMs, offsetRef }: { betEndMs: number; totalMs: number; offsetRef: React.MutableRefObject<number> }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    const remaining = Math.max(0, betEndMs - (Date.now() + offsetRef.current));
    progress.setValue(Math.min(1, remaining / totalMs));
    const anim = Animated.timing(progress, {
      toValue: 0,
      duration: remaining,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    anim.start();
    const tick = () => setSecs(Math.max(0, Math.ceil((betEndMs - (Date.now() + offsetRef.current)) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => {
      anim.stop();
      clearInterval(id);
    };
  }, [betEndMs, totalMs, offsetRef, progress]);

  const dashOffset = progress.interpolate({ inputRange: [0, 1], outputRange: [RING_C, 0] });
  const urgent = secs <= 3;
  return (
    <View style={styles.ring}>
      <Svg width={RING} height={RING}>
        <Circle cx={RING / 2} cy={RING / 2} r={RING_R + 3} fill="#1A0A06" fillOpacity={0.75} />
        <Circle cx={RING / 2} cy={RING / 2} r={RING_R} fill="none" stroke="#4A2412" strokeWidth={5} />
        <AnimatedCircle
          cx={RING / 2}
          cy={RING / 2}
          r={RING_R}
          fill="none"
          stroke={urgent ? '#FF4B3E' : '#FFB21E'}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={`${RING_C} ${RING_C}`}
          strokeDashoffset={dashOffset}
          rotation={-90}
          origin={`${RING / 2}, ${RING / 2}`}
        />
      </Svg>
      <Text style={[styles.ringText, urgent && styles.ringTextUrgent]}>{secs}</Text>
    </View>
  );
}

type AreaState = 'normal' | 'win' | 'lose';

const BetBox = memo(function BetBox({
  area,
  label,
  multiplier,
  watermark,
  colors,
  border,
  total,
  state,
  big,
  onPress,
  glow,
}: {
  area: SevenUpDownArea;
  label: string;
  multiplier: number;
  watermark?: string;
  colors: [string, string];
  border: string;
  total: number;
  state: AreaState;
  big: boolean;
  onPress: (area: SevenUpDownArea) => void;
  glow: Animated.Value;
}) {
  return (
    <Pressable onPress={() => onPress(area)} style={({ pressed }) => [styles.boxOuter, big ? styles.bigOuter : styles.cellOuter, pressed && styles.boxPressed]}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 0.3, y: 1 }} style={[styles.boxFill, { borderColor: state === 'win' ? '#FFD84D' : border + '66' }, state === 'win' && styles.boxWin]}>
        <LinearGradient colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']} style={styles.boxShine} pointerEvents="none" />
        {watermark && (
          <Text style={[styles.watermark, { fontSize: watermarkSize(watermark) }]} numberOfLines={1}>
            {watermark}
          </Text>
        )}
        <Text style={[big ? styles.bigLabel : styles.cellLabel]} numberOfLines={1} adjustsFontSizeToFit>
          {label}
        </Text>
        <Text style={big ? styles.bigMult : styles.cellMult}>{multiplier}x</Text>
        {state === 'win' && <Animated.View pointerEvents="none" style={[styles.winGlow, { opacity: glow }]} />}
        {state === 'lose' && <View pointerEvents="none" style={styles.loseShade} />}
        {total > 0 && (
          <View style={big ? styles.bigChip : styles.cellChip} pointerEvents="none">
            <Chip value={total} size={big ? 34 : 24} label={shortAmount(total)} />
          </View>
        )}
      </LinearGradient>
    </Pressable>
  );
});

// ---------- screen ----------

type PlacedChip = { key: number; area: SevenUpDownArea; amount: number; id?: string };

export default function SevenUpDownScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<SevenUpDownConfig | null>(null);
  const [view, setView] = useState<SevenUpDownRoundView | null>(null);
  const [history, setHistory] = useState<SevenUpDownHistoryEntry[]>([]);
  const [chips, setChips] = useState<PlacedChip[]>([]);
  const [selectedChip, setSelectedChip] = useState(DEFAULT_CHIP);
  const [chipPickerOpen, setChipPickerOpen] = useState(false);
  const [win, setWin] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [rollFaces, setRollFaces] = useState<[number, number]>([3, 5]);
  const [, setPhaseTick] = useState(0);

  const offsetRef = useRef(0);
  const periodRef = useRef<string | null>(null);
  const resultHandledRef = useRef<string | null>(null);
  const chipsRef = useRef<PlacedChip[]>([]);
  chipsRef.current = chips;
  const lastRoundRef = useRef<{ area: SevenUpDownArea; amount: number }[]>([]);
  const idMapRef = useRef(new Map<number, string>());
  const keyRef = useRef(1);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shake = useRef(new Animated.Value(0)).current;
  const rollMode = useRef(new Animated.Value(0)).current;
  const orbit = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const hop = useRef(new Animated.Value(0)).current;
  const domeLift = useRef(new Animated.Value(0)).current;
  const totalPop = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0.2)).current;

  const multipliers = config?.multipliers ?? FALLBACK_MULTIPLIERS;
  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const enqueue = useCallback((op: () => Promise<void>) => {
    queueRef.current = queueRef.current.then(op).catch(() => {});
  }, []);

  const loadHistory = useCallback(() => {
    fetchSevenUpDownHistory(100)
      .then((h) => mountedRef.current && setHistory(h))
      .catch(() => {});
  }, []);

  const syncMyRound = useCallback(() => {
    fetchSevenUpDownMyRound()
      .then((res) => {
        if (!mountedRef.current || res.periodNumber !== periodRef.current) return;
        const synced = res.bets.map((b) => {
          const key = keyRef.current++;
          idMapRef.current.set(key, b.id);
          return { key, area: b.area, amount: Number(b.amount), id: b.id };
        });
        setChips(synced);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchSevenUpDownConfig()
      .then(setConfig)
      .catch(() => {});
    loadHistory();
    return () => {
      mountedRef.current = false;
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [loadHistory]);

  // Round polling: chained so slow responses never overlap, and quicker
  // right around the reveal / next-round moments.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;
    let first = true;
    const loop = async () => {
      let delay = 800;
      try {
        const sentAt = Date.now();
        const v = await fetchSevenUpDownCurrent();
        const receivedAt = Date.now();
        if (!alive) return;
        const measured = new Date(v.serverTime).getTime() - (sentAt + receivedAt) / 2;
        offsetRef.current = first ? measured : offsetRef.current * 0.7 + measured * 0.3;
        setView(v);
        const srvNow = Date.now() + offsetRef.current;
        const nextEdge = Math.min(
          ...[v.betEndTime, v.resultTime, v.endTime].map((t) => new Date(t).getTime()).filter((t) => t > srvNow)
        );
        if (Number.isFinite(nextEdge) && nextEdge - srvNow < 1200) delay = 250;
        if (first) {
          first = false;
          periodRef.current = v.periodNumber;
          syncMyRound();
        }
      } catch {
        delay = 1500;
      }
      if (alive) timer = setTimeout(loop, delay);
    };
    loop();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [syncMyRound]);

  // New round: last round's chips become the "again" set.
  useEffect(() => {
    if (!view) return;
    if (periodRef.current !== null && periodRef.current !== view.periodNumber) {
      const placed = chipsRef.current.filter((c) => c.id);
      if (placed.length > 0) lastRoundRef.current = placed.map((c) => ({ area: c.area, amount: c.amount }));
      setChips([]);
      idMapRef.current.clear();
    }
    periodRef.current = view.periodNumber;
  }, [view]);

  // Re-render exactly when betting closes / the dice are due locally.
  useEffect(() => {
    if (!view) return;
    const srvNow = Date.now() + offsetRef.current;
    const ids = [view.betEndTime, view.resultTime].map((t) => {
      const wait = new Date(t).getTime() - srvNow;
      return wait > 0 ? setTimeout(() => setPhaseTick((x) => x + 1), wait + 20) : null;
    });
    return () => ids.forEach((id) => id && clearTimeout(id));
  }, [view]);

  const srvNow = Date.now() + offsetRef.current;
  const betEndMs = view ? new Date(view.betEndTime).getTime() : 0;
  const bettingOpen = !!view && srvNow < betEndMs;
  const phase: 'BETTING' | 'ROLLING' | 'RESULT' = !view
    ? 'BETTING'
    : bettingOpen
      ? 'BETTING'
      : view.phase === 'RESULT' && view.dice
        ? 'RESULT'
        : 'ROLLING';
  const resultTotal = phase === 'RESULT' && view?.total ? view.total : null;

  // Reveal: record the result, then work out this player's winnings.
  useEffect(() => {
    if (!view || view.phase !== 'RESULT' || !view.dice || resultHandledRef.current === view.periodNumber) return;
    const period = view.periodNumber;
    resultHandledRef.current = period;
    setHistory((h) =>
      h[0]?.periodNumber === period
        ? h
        : [{ periodNumber: period, dice1: view.dice![0], dice2: view.dice![1], total: view.total! }, ...h].slice(0, 100)
    );
    const hadBets = chipsRef.current.length > 0;
    if (hadBets) {
      // Let queued placements finish first so every bet is counted.
      enqueue(async () => {
        try {
          const res = await fetchSevenUpDownMyRound(period);
          const won = round2(res.bets.reduce((sum, b) => sum + Number(b.payout), 0));
          if (mountedRef.current && won > 0) setWin(won);
        } catch {
          // Winnings still land in the wallet; the card is just skipped.
        }
        refreshWallet();
      });
    }
  }, [view, enqueue, refreshWallet]);

  useEffect(() => {
    if (win === null) return;
    const id = setTimeout(() => setWin(null), WIN_CARD_MS);
    return () => clearTimeout(id);
  }, [win]);

  // Cup animations, all on the native driver.
  useEffect(() => {
    if (phase === 'ROLLING') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(shake, { toValue: 1, duration: 70, useNativeDriver: true }),
          Animated.timing(shake, { toValue: -1, duration: 140, useNativeDriver: true }),
          Animated.timing(shake, { toValue: 0, duration: 70, useNativeDriver: true }),
        ])
      );
      loop.start();
      // Dice tumble around the cup: circle it, spin, and hop.
      Animated.timing(rollMode, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      const orbitLoop = Animated.loop(
        Animated.timing(orbit, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true })
      );
      const spinLoop = Animated.loop(
        Animated.timing(spin, { toValue: 1, duration: 420, easing: Easing.linear, useNativeDriver: true })
      );
      const hopLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(hop, { toValue: 1, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(hop, { toValue: 0, duration: 110, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ])
      );
      orbitLoop.start();
      spinLoop.start();
      hopLoop.start();
      const faces = setInterval(
        () => setRollFaces([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]),
        110
      );
      return () => {
        loop.stop();
        shake.setValue(0);
        clearInterval(faces);
        orbitLoop.stop();
        spinLoop.stop();
        hopLoop.stop();
        // Settle: finish the current turn upright and roll back to rest.
        Animated.parallel([
          Animated.timing(spin, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.spring(rollMode, { toValue: 0, friction: 6, tension: 70, useNativeDriver: true }),
          Animated.timing(hop, { toValue: 0, duration: 120, useNativeDriver: true }),
        ]).start(() => spin.setValue(0));
      };
    }
  }, [phase, shake, rollMode, orbit, spin, hop]);

  useEffect(() => {
    Animated.timing(domeLift, {
      toValue: phase === 'RESULT' ? 1 : 0,
      duration: phase === 'RESULT' ? 380 : 250,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    if (phase === 'RESULT') {
      totalPop.setValue(0);
      Animated.spring(totalPop, { toValue: 1, friction: 5, useNativeDriver: true }).start();
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(glow, { toValue: 0.55, duration: 450, useNativeDriver: true }),
          Animated.timing(glow, { toValue: 0.15, duration: 450, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [phase, domeLift, totalPop, glow]);

  const areaTotals = useMemo(() => {
    const m: Partial<Record<SevenUpDownArea, number>> = {};
    for (const c of chips) m[c.area] = round2((m[c.area] ?? 0) + c.amount);
    return m;
  }, [chips]);
  const myTotal = useMemo(() => round2(chips.reduce((s, c) => s + c.amount, 0)), [chips]);
  const unconfirmed = useMemo(() => round2(chips.filter((c) => !c.id).reduce((s, c) => s + c.amount, 0)), [chips]);
  const displayBalance = Math.max(0, round2(coins - unconfirmed));

  const placeChips = useCallback(
    (entries: { area: SevenUpDownArea; amount: number }[]) => {
      if (entries.length === 0) return;
      if (!bettingOpenRef.current) {
        showToast('Betting closed — wait for the next round');
        return;
      }
      const cost = round2(entries.reduce((s, e) => s + e.amount, 0));
      if (cost > displayBalanceRef.current) {
        showToast('Insufficient balance');
        return;
      }
      const totals = { ...areaTotalsRef.current };
      for (const e of entries) {
        totals[e.area] = round2((totals[e.area] ?? 0) + e.amount);
        if ((totals[e.area] ?? 0) > maxStakeRef.current) {
          showToast(`Max bet per box is ₹${maxStakeRef.current}`);
          return;
        }
      }
      const added: PlacedChip[] = entries.map((e) => ({ key: keyRef.current++, area: e.area, amount: e.amount }));
      const keys = new Set(added.map((c) => c.key));
      setChips((prev) => [...prev, ...added]);
      enqueue(async () => {
        try {
          const res = await placeSevenUpDownBets(entries);
          res.bets.forEach((b, i) => idMapRef.current.set(added[i].key, b.id));
          if (mountedRef.current) {
            setChips((prev) => prev.map((c) => (keys.has(c.key) ? { ...c, id: idMapRef.current.get(c.key) } : c)));
          }
          refreshWallet();
        } catch (err) {
          if (mountedRef.current) {
            setChips((prev) => prev.filter((c) => !keys.has(c.key)));
            showToast(errorMessage(err));
          }
        }
      });
    },
    [enqueue, refreshWallet, showToast]
  );

  // Refs so the memoised tap handler always sees current values.
  const bettingOpenRef = useRef(bettingOpen);
  bettingOpenRef.current = bettingOpen;
  const displayBalanceRef = useRef(displayBalance);
  displayBalanceRef.current = displayBalance;
  const areaTotalsRef = useRef(areaTotals);
  areaTotalsRef.current = areaTotals;
  const maxStakeRef = useRef(maxStake);
  maxStakeRef.current = maxStake;
  const selectedChipRef = useRef(selectedChip);
  selectedChipRef.current = selectedChip;

  const onAreaPress = useCallback(
    (area: SevenUpDownArea) => {
      setChipPickerOpen(false);
      placeChips([{ area, amount: selectedChipRef.current }]);
    },
    [placeChips]
  );

  const undo = () => {
    const last = chips[chips.length - 1];
    if (!last) return;
    if (!bettingOpen) return showToast('Betting closed');
    setChips((prev) => prev.slice(0, -1));
    enqueue(async () => {
      const id = idMapRef.current.get(last.key);
      if (!id) return;
      try {
        await cancelSevenUpDownBets([id]);
        refreshWallet();
      } catch (err) {
        if (mountedRef.current) {
          showToast(errorMessage(err));
          syncMyRound();
        }
      }
    });
  };

  const clearAll = () => {
    if (chips.length === 0) return;
    if (!bettingOpen) return showToast('Betting closed');
    setChips([]);
    enqueue(async () => {
      try {
        await cancelSevenUpDownBets();
        refreshWallet();
      } catch (err) {
        if (mountedRef.current) {
          showToast(errorMessage(err));
          syncMyRound();
        }
      }
    });
  };

  const aggregate = (list: { area: SevenUpDownArea; amount: number }[]) => {
    const m = new Map<SevenUpDownArea, number>();
    for (const c of list) m.set(c.area, round2((m.get(c.area) ?? 0) + c.amount));
    return [...m.entries()].map(([area, amount]) => ({ area, amount }));
  };

  const double = () => {
    if (chips.length === 0) return showToast('Place a bet first');
    placeChips(aggregate(chips));
  };

  const again = () => {
    if (lastRoundRef.current.length === 0) return showToast('No bets from the last round');
    placeChips(aggregate(lastRoundRef.current));
  };

  const recent = history.slice(0, HISTORY_COLUMNS).reverse();
  const stats = useMemo(() => {
    const n = history.length;
    if (n === 0) return null;
    const down = history.filter((h) => h.total <= 6).length;
    const seven = history.filter((h) => h.total === 7).length;
    return {
      down: Math.round((down / n) * 100),
      up: Math.round(((n - down - seven) / n) * 100),
      seven: Math.round((seven / n) * 100),
      n,
    };
  }, [history]);

  const shownDice: [number, number] =
    phase === 'RESULT' && view?.dice
      ? view.dice
      : phase === 'ROLLING'
        ? rollFaces
        : history[0]
          ? [history[0].dice1, history[0].dice2]
          : [3, 4];

  const statusText =
    phase === 'BETTING' ? 'PLACE YOUR BETS' : phase === 'ROLLING' ? 'NO MORE BETS' : `RESULT  ${resultTotal ?? ''}`;

  const areaState = (area: SevenUpDownArea): AreaState =>
    resultTotal === null ? 'normal' : areaWins(area, resultTotal) ? 'win' : 'lose';

  const shakeX = shake.interpolate({ inputRange: [-1, 1], outputRange: [-5, 5] });
  const domeY = domeLift.interpolate({ inputRange: [0, 1], outputRange: [0, -CUP_W * 0.5] });
  const domeOpacity = domeLift.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <View style={styles.root}>
      {/* Header */}
      <LinearGradient colors={['#4A1119', '#2A070C']} style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={30} color="#F5B942" />
          <Text style={styles.title}>7 UP DOWN</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('Deposit')} style={styles.depositPill}>
          <MaterialCommunityIcons name="wallet-plus" size={20} color="#F5B942" />
          <Text style={styles.depositText}>Deposit</Text>
        </Pressable>
      </LinearGradient>

      {/* Table */}
      <View style={styles.table}>
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none" viewBox={`0 0 ${W} 300`}>
          <Defs>
            <RadialGradient id="felt" cx="50%" cy="62%" r="70%">
              <Stop offset="0" stopColor="#17904F" />
              <Stop offset="0.7" stopColor="#0B5D32" />
              <Stop offset="1" stopColor="#063A1F" />
            </RadialGradient>
            <SvgLinearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#3A1109" />
              <Stop offset="1" stopColor="#5B2412" />
            </SvgLinearGradient>
            <SvgLinearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#C98A4B" />
              <Stop offset="1" stopColor="#6B3515" />
            </SvgLinearGradient>
          </Defs>
          <Rect x={0} y={0} width={W} height={300} fill="url(#felt)" />
          <Path d={`M0 0 H${W} V92 Q${W / 2} 150 0 92 Z`} fill="url(#wall)" />
          <Path d={`M0 92 Q${W / 2} 150 ${W} 92`} stroke="url(#rim)" strokeWidth={9} fill="none" />
          <Path d={`M0 97 Q${W / 2} 155 ${W} 97`} stroke="#E8B06A" strokeOpacity={0.35} strokeWidth={1.5} fill="none" />
        </Svg>

        {/* Results strip */}
        <View style={styles.historyPanel}>
          <View style={styles.statsRow}>
            <Text style={styles.statText}>
              <Text style={styles.statKey}>2~6 </Text>
              {stats ? `${stats.down}%` : '—'}
            </Text>
            <View style={styles.statDivider} />
            <Text style={styles.statText}>
              <Text style={styles.statKey}>8~12 </Text>
              {stats ? `${stats.up}%` : '—'}
            </Text>
            <View style={styles.statDivider} />
            <Text style={styles.statText}>
              <Text style={styles.statKey}>7 </Text>
              {stats ? `${stats.seven}%` : '—'}
            </Text>
            <Text style={styles.statNote} numberOfLines={1}>
              Last {stats?.n ?? 100} rounds
            </Text>
          </View>
          <View style={styles.historyRow}>
            {recent.map((h, i) => {
              const latest = i === recent.length - 1;
              return (
                <View key={h.periodNumber} style={[styles.historyCol, latest && styles.historyColLatest]}>
                  <View style={[styles.historyBadge, { backgroundColor: totalColor(h.total) }]}>
                    <Text style={styles.historyBadgeText}>{h.total}</Text>
                  </View>
                  <Die value={h.dice1} size={16} />
                  <View style={{ height: 3 }} />
                  <Die value={h.dice2} size={16} />
                </View>
              );
            })}
          </View>
        </View>

        {/* Dice cup */}
        <View style={styles.cupArea}>
          <Text style={styles.feltLogo}>7 UP DOWN</Text>
          <View style={styles.cupBox}>
            <View style={styles.cupBase}>
              <CupBase />
            </View>
            {[0, 1].map((i) => {
              const rest = DIE_REST[i];
              const phaseShift = i * 0.5;
              const orbitX = orbit.interpolate({
                inputRange: ORBIT_STEPS,
                outputRange: ORBIT_STEPS.map((t) => ORBIT_RX * Math.cos(2 * Math.PI * (t + phaseShift))),
              });
              const orbitY = orbit.interpolate({
                inputRange: ORBIT_STEPS,
                outputRange: ORBIT_STEPS.map((t) => ORBIT_RY * Math.sin(2 * Math.PI * (t + phaseShift))),
              });
              const tx = Animated.add(
                rollMode.interpolate({ inputRange: [0, 1], outputRange: [rest.x, 0] }),
                Animated.multiply(orbitX, rollMode)
              );
              const ty = Animated.add(
                rollMode.interpolate({ inputRange: [0, 1], outputRange: [rest.y, 0] }),
                Animated.multiply(orbitY, rollMode)
              );
              const hopY = Animated.multiply(hop.interpolate({ inputRange: [0, 1], outputRange: [0, -DIE_SIZE * 0.22] }), rollMode);
              const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', i === 0 ? '360deg' : '-360deg'] });
              const squash = spin.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [1, 0.8, 1, 0.8, 1] });
              return (
                <Animated.View
                  key={i}
                  pointerEvents="none"
                  style={[styles.dieSlot, { transform: [{ translateX: tx }, { translateY: ty }] }]}
                >
                  <View style={styles.dieShadow} />
                  <Animated.View style={{ transform: [{ translateY: hopY }, { rotate }, { scaleX: squash }] }}>
                    <View style={{ transform: [{ rotate: rest.tilt }] }}>
                      <Die3D value={shownDice[i]} size={DIE_SIZE} />
                    </View>
                  </Animated.View>
                </Animated.View>
              );
            })}
            <Animated.View
              pointerEvents="none"
              style={[styles.dome, { opacity: domeOpacity, transform: [{ translateY: domeY }, { translateX: shakeX }] }]}
            >
              <Dome />
            </Animated.View>
            {resultTotal !== null && (
              <Animated.View style={[styles.totalBadgeWrap, { transform: [{ scale: totalPop }] }]} pointerEvents="none">
                <LinearGradient colors={['#FFE08A', '#D99A1E']} style={styles.totalBadgeRing}>
                  <View style={[styles.totalBadge, { backgroundColor: totalColor(resultTotal) }]}>
                    <Text style={styles.totalBadgeText}>{resultTotal}</Text>
                  </View>
                </LinearGradient>
              </Animated.View>
            )}
          </View>
          {view && phase === 'BETTING' && (
            <View style={styles.ringWrap}>
              <TimerRing betEndMs={betEndMs} totalMs={(config?.betSeconds ?? 13) * 1000} offsetRef={offsetRef} />
            </View>
          )}
          {win !== null && (
            <View style={styles.winWrap}>
              <LinearGradient colors={['#3B1A06', '#1C0B02']} style={styles.winCard}>
                <Text style={styles.winTitle}>YOU WIN</Text>
                <Text style={styles.winAmount}>₹{win.toFixed(2)}</Text>
              </LinearGradient>
              <Pressable onPress={() => setWin(null)} style={styles.winClose} hitSlop={10}>
                <MaterialCommunityIcons name="close" size={20} color="#FFE08A" />
              </Pressable>
            </View>
          )}
        </View>
      </View>

      {/* Info bar */}
      <LinearGradient colors={['#3A170B', '#220C05']} style={styles.infoBar}>
        <Text style={styles.infoPeriod} numberOfLines={1}>
          #{view?.periodNumber.slice(-5) ?? '-----'}
        </Text>
        <Text style={[styles.infoStatus, phase === 'BETTING' && styles.infoStatusLive]} numberOfLines={1}>
          {statusText}
        </Text>
        <Text style={styles.infoLimits} numberOfLines={1}>
          Min <Text style={styles.infoMin}>{minStake}</Text>  Max <Text style={styles.infoMax}>{maxStake}</Text>  Max win <Text style={styles.infoMax}>{config?.maxPayout ?? 10000}</Text>
        </Text>
      </LinearGradient>

      {/* Board */}
      <LinearGradient colors={['#0C5230', '#083A21']} style={styles.board}>
        <View style={styles.bigRow}>
          {BIG_BOXES.map((b) => (
            <View key={b.area} style={b.area === 'SEVEN' ? styles.bigSeven : styles.bigSide}>
              <BetBox
                area={b.area}
                label={b.label}
                multiplier={multipliers[b.area]}
                watermark={b.watermark}
                colors={b.colors}
                border={b.border}
                total={areaTotals[b.area] ?? 0}
                state={areaState(b.area)}
                big
                onPress={onAreaPress}
                glow={glow}
              />
            </View>
          ))}
        </View>
        <View style={styles.grid}>
          {NUMBER_CELLS.map((c) => (
            <View key={c.area} style={styles.cellWrap}>
              <BetBox
                area={c.area}
                label={String(c.n)}
                multiplier={multipliers[c.area]}
                colors={c.colors}
                border="#FFD98A"
                total={areaTotals[c.area] ?? 0}
                state={areaState(c.area)}
                big={false}
                onPress={onAreaPress}
                glow={glow}
              />
            </View>
          ))}
        </View>
        <View style={styles.balanceRow}>
          <Text style={styles.balanceLabel}>
            Balance <Text style={styles.balanceValue}>₹{displayBalance.toFixed(2)}</Text>
          </Text>
          <Text style={styles.balanceLabel}>
            Your Bet <Text style={styles.balanceValue}>₹{myTotal.toFixed(2)}</Text>
          </Text>
        </View>
      </LinearGradient>

      {/* Controls */}
      <LinearGradient colors={['#0A3D23', '#052414']} style={[styles.controls, { paddingBottom: insets.bottom + 10 }]}>
        <Pressable onPress={again} style={styles.ctrlBtn}>
          <MaterialCommunityIcons name="redo" size={24} color="#E9F5EC" />
          <Text style={styles.ctrlLabel}>again</Text>
        </Pressable>
        <Pressable onPress={double} style={styles.ctrlBtn}>
          <Text style={styles.ctrlBig}>x2</Text>
          <Text style={styles.ctrlLabel}>double</Text>
        </Pressable>
        <Pressable onPress={() => setChipPickerOpen((o) => !o)} style={styles.mainChip}>
          <LinearGradient colors={['#FFE08A', '#B7791F']} style={styles.mainChipRing}>
            <Chip value={selectedChip} size={62} />
          </LinearGradient>
        </Pressable>
        <Pressable onPress={undo} style={styles.ctrlBtn}>
          <MaterialCommunityIcons name="undo-variant" size={24} color="#E9F5EC" />
          <Text style={styles.ctrlLabel}>undo</Text>
        </Pressable>
        <Pressable onPress={clearAll} style={styles.ctrlBtn}>
          <MaterialCommunityIcons name="close-thick" size={24} color="#FF4B3E" />
          <Text style={styles.ctrlLabel}>clear</Text>
        </Pressable>
      </LinearGradient>

      {chipPickerOpen && (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setChipPickerOpen(false)} />
          <View style={[styles.chipPicker, { bottom: insets.bottom + 92 }]}>
            {CHIP_VALUES.filter((v) => v >= minStake && v <= maxStake).map((v) => (
              <Pressable
                key={v}
                onPress={() => {
                  setSelectedChip(v);
                  setChipPickerOpen(false);
                }}
                style={[styles.pickerChip, v === selectedChip && styles.pickerChipActive]}
              >
                <Chip value={v} size={46} />
              </Pressable>
            ))}
          </View>
        </>
      )}

      {toast && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}
    </View>
  );
}

const GOLD = '#FFD66B';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#083A21' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingBottom: 8,
    borderBottomWidth: 1.5,
    borderBottomColor: '#7A2A33',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center' },
  title: { color: '#E7D9D2', fontSize: 20, fontWeight: '900', letterSpacing: 1.5, marginLeft: 2 },
  depositPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#3A0A10',
    borderWidth: 1.5,
    borderColor: '#8A2E38',
  },
  depositText: { color: '#F5B942', fontSize: 15, fontWeight: '700' },

  table: { flex: 1, minHeight: 250, overflow: 'hidden' },
  historyPanel: {
    marginTop: 8,
    marginHorizontal: 10,
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: 'rgba(30, 8, 4, 0.85)',
    borderWidth: 1,
    borderColor: '#8A5A2B',
  },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  statText: { color: '#F5C35B', fontSize: 13, fontWeight: '800' },
  statKey: { color: '#F5C35B' },
  statDivider: { width: 1, height: 14, backgroundColor: '#8A5A2B' },
  statNote: { flex: 1, textAlign: 'right', color: '#C9A77A', fontSize: 10 },
  historyRow: { flexDirection: 'row', justifyContent: 'flex-start', gap: 3 },
  historyCol: {
    width: (W - 20 - 12 - 3 * (HISTORY_COLUMNS - 1)) / HISTORY_COLUMNS,
    alignItems: 'center',
    paddingVertical: 2,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  historyColLatest: { borderColor: '#FFD84D', backgroundColor: 'rgba(255,216,77,0.12)' },
  historyBadge: { minWidth: 18, paddingHorizontal: 2, borderRadius: 2, alignItems: 'center', marginBottom: 3 },
  historyBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },

  cupArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  feltLogo: {
    position: 'absolute',
    color: '#FFFFFF',
    opacity: 0.07,
    fontSize: W * 0.13,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: 2,
  },
  cupBox: { width: CUP_W, height: CUP_H, alignItems: 'center' },
  cupBase: { position: 'absolute', bottom: 0 },
  dieSlot: {
    position: 'absolute',
    width: DIE3D_BOX,
    height: DIE3D_BOX,
    left: CUP_W / 2 - DIE3D_BOX / 2,
    top: FELT_CY - DIE3D_BOX * 0.8,
  },
  dieShadow: {
    position: 'absolute',
    left: DIE3D_BOX * 0.1,
    top: DIE3D_BOX * 0.8,
    width: DIE3D_BOX * 0.85,
    height: DIE_SIZE * 0.26,
    borderRadius: DIE_SIZE * 0.13,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  dome: { position: 'absolute', bottom: BASE_H * 0.5 - DOME_H * 0.1 },
  totalBadgeWrap: { position: 'absolute', top: 0 },
  totalBadgeRing: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  totalBadge: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  totalBadgeText: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  die: {
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 3,
    shadowOffset: { width: 1, height: 2 },
  },
  ringWrap: { position: 'absolute', right: 14, top: '38%' },
  ring: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ringText: { position: 'absolute', color: '#FFB21E', fontSize: 26, fontWeight: '900' },
  ringTextUrgent: { color: '#FF4B3E' },
  winWrap: { position: 'absolute', top: 2, alignItems: 'center' },
  winCard: {
    alignItems: 'center',
    paddingHorizontal: 34,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#F5B942',
  },
  winTitle: { color: '#FFE08A', fontSize: 16, fontWeight: '900', letterSpacing: 3 },
  winAmount: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', marginTop: 2 },
  winClose: {
    marginTop: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C0B02',
    borderWidth: 2,
    borderColor: '#F5B942',
  },

  infoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#8A5A2B',
  },
  infoPeriod: { width: 70, color: '#C9A77A', fontSize: 13, fontWeight: '700' },
  infoStatus: { flex: 1, textAlign: 'center', color: '#C9A77A', fontSize: 15, fontWeight: '800', letterSpacing: 1 },
  infoStatusLive: { color: GOLD },
  infoLimits: { color: '#C9A77A', fontSize: 13, fontWeight: '600' },
  infoMin: { color: '#4ADE80', fontWeight: '800' },
  infoMax: { color: '#FF5A4E', fontWeight: '800' },

  board: { paddingHorizontal: BOARD_PAD, paddingTop: 8 },
  bigRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  bigSide: { flex: 35, height: BIG_H },
  bigSeven: { flex: 26, height: BIG_H },
  grid: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: 6, overflow: 'hidden' },
  cellWrap: { width: CELL_W, height: CELL_H, padding: 2 },
  boxOuter: { width: '100%', height: '100%' },
  bigOuter: {},
  cellOuter: {},
  boxPressed: { transform: [{ scale: 0.97 }] },
  boxFill: {
    flex: 1,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  boxWin: { borderWidth: 3 },
  boxShine: { position: 'absolute', top: 0, left: 0, right: 0, height: '45%' },
  watermark: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    right: 4,
    textAlign: 'center',
    color: '#FFFFFF',
    opacity: 0.13,
    fontSize: BIG_H * 0.3,
    fontWeight: '900',
  },
  bigLabel: {
    color: GOLD,
    fontSize: BIG_H * 0.3,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
  bigMult: { color: '#FFF3D6', fontSize: 16, fontWeight: '800', marginTop: 2, opacity: 0.9 },
  cellLabel: {
    color: GOLD,
    fontSize: CELL_H * 0.36,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  cellMult: { color: '#FFF3D6', fontSize: 12, fontWeight: '700', opacity: 0.9 },
  winGlow: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#FFF3B0' },
  loseShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' },
  bigChip: { position: 'absolute', right: 6, bottom: 6 },
  cellChip: { position: 'absolute', right: 1, top: 1 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8 },
  balanceLabel: { color: '#BFE3CB', fontSize: 15, fontWeight: '600' },
  balanceValue: { color: GOLD, fontWeight: '800' },

  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: 10,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderTopColor: '#1F6B40',
  },
  ctrlBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#12281A',
    borderWidth: 2,
    borderColor: '#2F5C40',
  },
  ctrlLabel: { color: '#CFE7D6', fontSize: 10, fontWeight: '600', marginTop: -1 },
  ctrlBig: { color: '#E9F5EC', fontSize: 20, fontWeight: '900', marginTop: -2 },
  mainChip: { marginTop: -18 },
  mainChipRing: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  chipPicker: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 8,
    padding: 10,
    borderRadius: 40,
    backgroundColor: 'rgba(12, 30, 18, 0.96)',
    borderWidth: 1.5,
    borderColor: '#B7791F',
  },
  pickerChip: { borderRadius: 26, padding: 2 },
  pickerChipActive: { backgroundColor: '#FFD84D', transform: [{ translateY: -6 }] },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    top: '46%',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.82)',
    borderWidth: 1,
    borderColor: '#B7791F',
  },
  toastText: { color: '#FFE08A', fontSize: 14, fontWeight: '700' },
});
