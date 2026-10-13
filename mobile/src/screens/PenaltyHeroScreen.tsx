import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient as SvgLinearGradient, Path, Polygon, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../api/client';
import {
  PenaltyConfig,
  PenaltyDifficulty,
  PenaltyRound,
  PenaltyShot,
  cashOutPenalty,
  fetchPenaltyConfig,
  fetchPenaltyCurrent,
  fetchPenaltyHistory,
  kickPenalty,
  startPenaltyRound,
} from '../api/backend';
import { useGameState } from '../state/GameStateContext';
import GameInfoButton from '../components/GameInfoButton';

const PITCH = '#1F8A3A';
const LIME = '#C6FF3A';
const GOLD = '#FFD66B';
const NAVY = '#0A1230';
const WHITE = '#FFFFFF';
const RED = '#FF4D5E';
const GREEN = '#3DFF8A';
const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const DEFAULT_BET = 10;
const KICKS = 5;
const TOAST_MS = 1800;
const ZONE_NAME = ['top left', 'top centre', 'top right', 'bottom left', 'bottom centre', 'bottom right'];
const DIFFS: PenaltyDifficulty[] = ['EASY', 'MEDIUM', 'HARD', 'EXPERT'];
const DIFF_NAME: Record<PenaltyDifficulty, string> = {
  EASY: 'EASY',
  MEDIUM: 'MEDIUM',
  HARD: 'HARD',
  EXPERT: 'EXPERT',
};
const DIFF_COLOR: Record<PenaltyDifficulty, string> = {
  EASY: GREEN,
  MEDIUM: '#5AC8FF',
  HARD: '#FFB23F',
  EXPERT: RED,
};
/** Shown before the config loads; the server's ladder replaces it. */
const FALLBACK_COVER: Record<PenaltyDifficulty, number> = {
  EASY: 1,
  MEDIUM: 2,
  HARD: 3,
  EXPERT: 4,
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function floor2(n: number): number {
  return Math.floor(Number((n * 100).toPrecision(12))) / 100;
}

function money(n: number): string {
  return `₹${n.toFixed(2)}`;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const run = (a: Animated.CompositeAnimation) => new Promise<void>((r) => a.start(() => r()));

// ---------- art ----------

/** A classic black-and-white football. */
export const Ball = memo(function Ball({ size }: { size: number }) {
  const u = `pb${useId().replace(/:/g, '')}`;
  const penta = (cx: number, cy: number, r: number, rot: number) =>
    Array.from({ length: 5 }, (_, i) => {
      const a = rot + (i * 2 * Math.PI) / 5;
      return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
    }).join(' ');
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={`${u}g`} cx="0.38" cy="0.32" r="0.75">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.7" stopColor="#E4E8F0" />
          <Stop offset="1" stopColor="#9AA2B4" />
        </RadialGradient>
      </Defs>
      <Circle cx={50} cy={50} r={47} fill={`url(#${u}g)`} stroke="#2A2E3A" strokeWidth={2} />
      <Polygon points={penta(50, 50, 15, -Math.PI / 2)} fill="#1A1C24" />
      {[0, 1, 2, 3, 4].map((i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        return <Polygon key={i} points={penta(50 + 38 * Math.cos(a), 50 + 38 * Math.sin(a), 12, a + Math.PI / 2)} fill="#1A1C24" />;
      })}
      {[0, 1, 2, 3, 4].map((i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        return <Line key={`l${i}`} x1={50 + 15 * Math.cos(a)} y1={50 + 15 * Math.sin(a)} x2={50 + 27 * Math.cos(a)} y2={50 + 27 * Math.sin(a)} stroke="#2A2E3A" strokeWidth={2} />;
      })}
      <Ellipse cx={34} cy={28} rx={12} ry={7} fill="#FFFFFF" opacity={0.6} />
    </Svg>
  );
});

/** The goalkeeper, arms up and ready, in a neon kit. */
const Keeper = memo(function Keeper({ w, h }: { w: number; h: number }) {
  const u = `pk${useId().replace(/:/g, '')}`;
  return (
    <Svg width={w} height={h} viewBox="0 0 100 130">
      <Defs>
        <SvgLinearGradient id={`${u}j`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#E4FF7A" />
          <Stop offset="1" stopColor="#8ACC10" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${u}s`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#E8B48A" />
          <Stop offset="1" stopColor="#B87A50" />
        </SvgLinearGradient>
      </Defs>
      {/* arms up to the gloves */}
      <Path d="M34 46 L 16 26 L 10 14" stroke={`url(#${u}j)`} strokeWidth={10} strokeLinecap="round" fill="none" />
      <Path d="M66 46 L 84 26 L 90 14" stroke={`url(#${u}j)`} strokeWidth={10} strokeLinecap="round" fill="none" />
      {/* legs */}
      <Path d="M38 86 L 32 112" stroke="#1A1C24" strokeWidth={11} strokeLinecap="round" />
      <Path d="M62 86 L 68 112" stroke="#1A1C24" strokeWidth={11} strokeLinecap="round" />
      <Path d="M33 100 L 31 116" stroke={LIME} strokeWidth={10} strokeLinecap="round" />
      <Path d="M67 100 L 69 116" stroke={LIME} strokeWidth={10} strokeLinecap="round" />
      <Ellipse cx={28} cy={121} rx={10} ry={5} fill="#0A0A10" />
      <Ellipse cx={72} cy={121} rx={10} ry={5} fill="#0A0A10" />
      {/* shorts */}
      <Path d="M32 74 L 68 74 L 70 92 L 52 92 L 50 84 L 48 92 L 30 92 Z" fill="#14161E" />
      {/* jersey */}
      <Path d="M30 40 C 36 34, 64 34, 70 40 L 70 78 L 30 78 Z" fill={`url(#${u}j)`} stroke="#4A6A00" strokeWidth={1.5} />
      <Path d="M30 44 L 36 44 L 36 78 L 30 78 Z" fill="#1A1C24" opacity={0.85} />
      <Path d="M64 44 L 70 44 L 70 78 L 64 78 Z" fill="#1A1C24" opacity={0.85} />
      <SvgText x={50} y={66} fontSize={20} fontWeight="900" fill="#1A1C24" textAnchor="middle">
        1
      </SvgText>
      {/* head */}
      <Path d="M44 34 L 56 34 L 55 40 L 45 40 Z" fill={`url(#${u}s)`} />
      <Circle cx={50} cy={24} r={11} fill={`url(#${u}s)`} />
      <Path d="M39 22 C 40 10, 60 10, 61 22 C 58 16, 42 16, 39 22 Z" fill="#2A1A10" />
      <Circle cx={46} cy={25} r={1.3} fill="#1A0A04" />
      <Circle cx={54} cy={25} r={1.3} fill="#1A0A04" />
      {/* gloves */}
      {[10, 90].map((x) => (
        <G key={x}>
          <Circle cx={x} cy={11} r={9} fill={WHITE} stroke="#FF7A1A" strokeWidth={2.5} />
          <Path d={`M${x - 6} 4 L ${x - 6} -2 M${x - 2} 2 L ${x - 2} -4 M${x + 2} 2 L ${x + 2} -4 M${x + 6} 4 L ${x + 6} -2`} stroke={WHITE} strokeWidth={3} strokeLinecap="round" />
        </G>
      ))}
    </Svg>
  );
});

/** The striker from behind, number 10. */
const Striker = memo(function Striker({ w, h }: { w: number; h: number }) {
  const u = `ps${useId().replace(/:/g, '')}`;
  return (
    <Svg width={w} height={h} viewBox="0 0 80 120">
      <Defs>
        <SvgLinearGradient id={`${u}j`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#3A6AFF" />
          <Stop offset="1" stopColor="#1A2E9A" />
        </SvgLinearGradient>
      </Defs>
      <Path d="M32 80 L 26 112" stroke="#E8B48A" strokeWidth={9} strokeLinecap="round" />
      <Path d="M48 80 L 56 110" stroke="#E8B48A" strokeWidth={9} strokeLinecap="round" />
      <Path d="M27 98 L 25 113" stroke={WHITE} strokeWidth={9} strokeLinecap="round" />
      <Path d="M55 98 L 57 112" stroke={WHITE} strokeWidth={9} strokeLinecap="round" />
      <Ellipse cx={24} cy={116} rx={8} ry={4} fill="#0A0A10" />
      <Ellipse cx={58} cy={115} rx={8} ry={4} fill="#0A0A10" />
      <Path d="M26 66 L 54 66 L 56 86 L 24 86 Z" fill={WHITE} />
      <Path d="M22 30 C 28 24, 52 24, 58 30 L 62 50 L 56 52 L 56 68 L 24 68 L 24 52 L 18 50 Z" fill={`url(#${u}j)`} />
      <SvgText x={40} y={40} fontSize={7} fontWeight="900" fill={GOLD} textAnchor="middle" letterSpacing={1}>
        NOVA
      </SvgText>
      <SvgText x={40} y={60} fontSize={18} fontWeight="900" fill={GOLD} textAnchor="middle">
        10
      </SvgText>
      <Circle cx={40} cy={16} r={10} fill="#2A1A10" />
      <Path d="M30 18 C 30 26, 50 26, 50 18 L 50 22 C 46 28, 34 28, 30 22 Z" fill="#E8B48A" />
    </Svg>
  );
});

// Deterministic crowd so the stands look the same on every render.
function crowd(seed: number, n: number): { x: number; y: number; c: string }[] {
  let s = seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const colors = ['#FF4D5E', '#FFD66B', '#5AC8FF', '#FFFFFF', '#3DFF8A', '#FF9A3A', '#B88AFF', '#E8B48A'];
  return Array.from({ length: n }, () => ({
    x: rnd(),
    y: rnd(),
    c: colors[Math.floor(rnd() * colors.length)],
  }));
}
const CROWD = crowd(7, 360);

type Geo = {
  S: number;
  H: number;
  goalL: number;
  goalW: number;
  barY: number;
  lineY: number;
  goalH: number;
  spotY: number;
};

function geometry(S: number): Geo {
  const H = Math.round(S * 1.02);
  const goalW = S * 0.72;
  const goalH = goalW * 0.4;
  const lineY = H * 0.6;
  return {
    S,
    H,
    goalL: (S - goalW) / 2,
    goalW,
    barY: lineY - goalH,
    lineY,
    goalH,
    spotY: H * 0.88,
  };
}

/** Night stadium: floodlights, a full crowd, ad boards, a striped pitch and the goal. */
const Stadium = memo(function Stadium({ g, tile }: { g: Geo; tile?: boolean }) {
  const u = `st${useId().replace(/:/g, '')}`;
  const { S, H, goalL, goalW, barY, lineY, goalH, spotY } = g;
  const standTop = H * 0.08;
  // Stands and ad boards sit above the crossbar so the goal is clear.
  const standBot = Math.min(H * 0.25, barY - H * 0.06);
  const boardTop = standBot;
  const boardBot = standBot + H * 0.05;
  const post = Math.max(3, S * 0.012);
  // Perspective pitch: wider at the bottom.
  const bands = 9;
  const pitchTop = boardBot;
  const netLines: React.ReactNode[] = [];
  const cols = 14;
  const rows = 6;
  for (let i = 1; i < cols; i++) {
    const x = goalL + (goalW * i) / cols;
    netLines.push(<Line key={`v${i}`} x1={x} y1={barY} x2={x + (x - S / 2) * 0.04} y2={lineY} stroke="#FFFFFF" strokeOpacity={0.22} strokeWidth={0.8} />);
  }
  for (let j = 1; j < rows; j++) {
    const y = barY + (goalH * j) / rows;
    netLines.push(<Line key={`h${j}`} x1={goalL} y1={y} x2={goalL + goalW} y2={y} stroke="#FFFFFF" strokeOpacity={0.22} strokeWidth={0.8} />);
  }
  return (
    <Svg width={S} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id={`${u}sky`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#020414" />
          <Stop offset="1" stopColor="#0E1A3A" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${u}beam`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFBE0" stopOpacity={0.45} />
          <Stop offset="1" stopColor="#FFFBE0" stopOpacity={0} />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${u}pitch`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#1A6A2E" />
          <Stop offset="1" stopColor="#2AA048" />
        </SvgLinearGradient>
        <RadialGradient id={`${u}glow`} cx="0.5" cy="0.6" r="0.6">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.18} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
        <SvgLinearGradient id={`${u}board`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#2A0A5A" />
          <Stop offset="0.5" stopColor="#5A1A9A" />
          <Stop offset="1" stopColor="#2A0A5A" />
        </SvgLinearGradient>
      </Defs>
      <Rect x={0} y={0} width={S} height={H} fill={`url(#${u}sky)`} />
      {/* stands */}
      <Path d={`M0 ${standTop + 14} L ${S} ${standTop + 14} L ${S} ${standBot} L 0 ${standBot} Z`} fill="#141A30" />
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <Line key={k} x1={0} y1={standTop + 14 + ((standBot - standTop - 14) * k) / 6} x2={S} y2={standTop + 14 + ((standBot - standTop - 14) * k) / 6} stroke="#0A0E1E" strokeWidth={1} />
      ))}
      {(tile ? CROWD.slice(0, 120) : CROWD).map((p, i) => (
        <Circle key={i} cx={p.x * S} cy={standTop + 18 + p.y * (standBot - standTop - 22)} r={tile ? S * 0.012 : S * 0.0085} fill={p.c} opacity={0.75} />
      ))}
      <Path d={`M0 ${standTop} L ${S} ${standTop} L ${S} ${standTop + 14} L 0 ${standTop + 14} Z`} fill="#0A0E1E" />
      {/* floodlights */}
      {[0.08, 0.92].map((fx, k) => (
        <G key={fx}>
          <Polygon points={`${fx * S - 18},${standTop - 4} ${fx * S + 18},${standTop - 4} ${S * (k ? 0.55 : 0.45)},${lineY} ${S * (k ? 0.95 : 0.05)},${lineY}`} fill={`url(#${u}beam)`} />
          <Rect x={fx * S - 20} y={standTop - 16} width={40} height={14} rx={3} fill="#2A3048" stroke="#5A6080" strokeWidth={1} />
          {[0, 1, 2, 3].map((i) => (
            <Circle key={i} cx={fx * S - 13 + i * 8.6} cy={standTop - 9} r={3} fill="#FFFBE0" />
          ))}
        </G>
      ))}
      {!tile && [0.2, 0.33, 0.5, 0.67, 0.8].map((x, i) => <Circle key={`star${i}`} cx={x * S} cy={standTop * (0.3 + (i % 2) * 0.3)} r={1} fill="#FFFFFF" opacity={0.6} />)}
      {/* ad boards */}
      <Rect x={0} y={boardTop} width={S} height={boardBot - boardTop} fill={`url(#${u}board)`} />
      {!tile && (
        <SvgText x={S / 2} y={boardBot - (boardBot - boardTop) * 0.28} fontSize={(boardBot - boardTop) * 0.62} fontWeight="900" fill={GOLD} textAnchor="middle" letterSpacing={3}>
          NOVAPLAY · PENALTY HERO · NOVAPLAY
        </SvgText>
      )}
      {/* pitch */}
      <Rect x={0} y={pitchTop} width={S} height={H - pitchTop} fill={`url(#${u}pitch)`} />
      {Array.from({ length: bands }, (_, i) => {
        const y0 = pitchTop + ((H - pitchTop) * i * i) / (bands * bands);
        const y1 = pitchTop + ((H - pitchTop) * (i + 1) * (i + 1)) / (bands * bands);
        return i % 2 ? <Rect key={i} x={0} y={y0} width={S} height={y1 - y0} fill="#000000" opacity={0.08} /> : null;
      })}
      <Ellipse cx={S / 2} cy={lineY + (H - lineY) * 0.4} rx={S * 0.6} ry={(H - lineY) * 0.6} fill={`url(#${u}glow)`} />
      {/* lines: goal line, six-yard box, penalty box, spot */}
      <Line x1={0} y1={lineY} x2={S} y2={lineY} stroke="#FFFFFF" strokeOpacity={0.85} strokeWidth={2} />
      <Path
        d={`M${goalL - S * 0.06} ${lineY} L ${goalL - S * 0.1} ${lineY + (H - lineY) * 0.22} L ${goalL + goalW + S * 0.1} ${lineY + (H - lineY) * 0.22} L ${goalL + goalW + S * 0.06} ${lineY}`}
        stroke="#FFFFFF"
        strokeOpacity={0.75}
        strokeWidth={2}
        fill="none"
      />
      {!tile && <Path d={`M${S * 0.02} ${lineY} L ${-S * 0.06} ${H * 0.97} M${S * 0.98} ${lineY} L ${S * 1.06} ${H * 0.97}`} stroke="#FFFFFF" strokeOpacity={0.6} strokeWidth={2} fill="none" />}
      <Ellipse cx={S / 2} cy={spotY} rx={S * 0.018} ry={S * 0.008} fill="#FFFFFF" />
      {/* goal: back net, net mesh, posts and bar */}
      <Path
        d={`M${goalL} ${barY} L ${goalL + S * 0.04} ${barY - goalH * 0.12} L ${goalL + goalW - S * 0.04} ${barY - goalH * 0.12} L ${goalL + goalW} ${barY} Z`}
        fill="#FFFFFF"
        fillOpacity={0.08}
        stroke="#FFFFFF"
        strokeOpacity={0.3}
        strokeWidth={0.8}
      />
      <Rect x={goalL} y={barY} width={goalW} height={goalH} fill="#0A1230" fillOpacity={0.55} />
      {netLines}
      <Rect x={goalL - post / 2} y={barY - post / 2} width={post} height={goalH + post / 2} fill="#FFFFFF" />
      <Rect x={goalL + goalW - post / 2} y={barY - post / 2} width={post} height={goalH + post / 2} fill="#FFFFFF" />
      <Rect x={goalL - post / 2} y={barY - post / 2} width={goalW + post} height={post} fill="#FFFFFF" />
      <Rect x={goalL + post / 2} y={barY + post / 2} width={goalW - post} height={post * 0.4} fill="#000000" opacity={0.3} />
    </Svg>
  );
});

/** Home tile art: the stadium, the keeper and a ball flying for the top corner. */
export function PenaltyHeroTileArt({ size }: { size: number }) {
  const g = geometry(size);
  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: size,
        height: size,
      }}
      pointerEvents="none"
    >
      <Stadium
        g={{
          ...g,
          H: size,
          lineY: size * 0.55,
          barY: size * 0.55 - g.goalH,
          spotY: size * 0.9,
        }}
        tile
      />
      <View
        style={{
          position: 'absolute',
          left: size / 2 - g.goalH * 0.38,
          top: size * 0.55 - g.goalH * 0.95,
        }}
      >
        <Keeper w={g.goalH * 0.76} h={g.goalH * 0.95} />
      </View>
      <View
        style={{
          position: 'absolute',
          left: g.goalL + g.goalW * 0.72,
          top: size * 0.55 - g.goalH * 0.9,
        }}
      >
        <Ball size={size * 0.12} />
      </View>
    </View>
  );
}

// ---------- screen ----------

type Phase = 'idle' | 'aim' | 'kicking' | 'over';
type Banner = { title: string; sub?: string; tone: 'goal' | 'save' | 'win' };

export default function PenaltyHeroScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<PenaltyConfig | null>(null);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [difficulty, setDifficulty] = useState<PenaltyDifficulty>('MEDIUM');
  const [round, setRound] = useState<PenaltyRound | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [lastShot, setLastShot] = useState<PenaltyShot | null>(null);
  const [shownBalance, setShownBalance] = useState(coins);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [panel, setPanel] = useState<'info' | 'history' | null>(null);
  const [history, setHistory] = useState<PenaltyRound[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sessionNet, setSessionNet] = useState(0);
  const [now, setNow] = useState(Date.now());

  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const sessionStart = useRef(Date.now());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const bannerAnim = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const ballX = useRef(new Animated.Value(0)).current;
  const ballY = useRef(new Animated.Value(0)).current;
  const ballS = useRef(new Animated.Value(1)).current;
  const ballR = useRef(new Animated.Value(0)).current;
  const ballO = useRef(new Animated.Value(1)).current;
  const keepX = useRef(new Animated.Value(0)).current;
  const keepY = useRef(new Animated.Value(0)).current;
  const keepR = useRef(new Animated.Value(0)).current;
  const sway = useRef(new Animated.Value(0)).current;
  const runX = useRef(new Animated.Value(0)).current;
  const net = useRef(new Animated.Value(0)).current;

  const cabW = Math.min(W - 12, 470);
  const g = useMemo(() => geometry(cabW), [cabW]);
  const zoneW = g.goalW / 3;
  const zoneH = g.goalH / 2;
  const zoneCenter = useCallback(
    (z: number) => ({
      x: g.goalL + zoneW * (z % 3) + zoneW / 2,
      y: g.barY + zoneH * Math.floor(z / 3) + zoneH / 2,
    }),
    [g, zoneW, zoneH],
  );

  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const maxPayout = config?.maxPayout ?? 10000;
  const betLevels = useMemo(() => BET_LEVELS.filter((b) => b >= minStake && b <= maxStake), [minStake, maxStake]);
  const activeDiff = round?.difficulty ?? difficulty;
  const ladder = useMemo(() => {
    const fromServer = config?.difficulties.find((d) => d.difficulty === activeDiff)?.multipliers;
    if (fromServer) return fromServer;
    const p = (6 - FALLBACK_COVER[activeDiff]) / 6;
    return Array.from({ length: KICKS + 1 }, (_, n) => (n ? floor2(0.88 / Math.pow(p, n)) : 1));
  }, [config, activeDiff]);
  const stake = round ? Number(round.stake) : bet;
  const goals = round?.goals ?? 0;
  const pending = round?.status === 'PENDING';
  const cashValue = pending && goals > 0 ? Math.min(floor2(stake * Number(round!.multiplier)), maxPayout) : 0;
  const shots = round?.shots ?? [];

  useEffect(() => {
    if (!busyRef.current) setShownBalance(coins);
  }, [coins]);

  useEffect(() => {
    mountedRef.current = true;
    fetchPenaltyConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => mountedRef.current && setToast('Could not load the game — check your connection.'));
    // Pick up a shoot-out left unfinished.
    fetchPenaltyCurrent()
      .then((r) => {
        if (!mountedRef.current || !r) return;
        setRound(r);
        setDifficulty(r.difficulty);
        setBet(Number(r.stake));
        setPhase('aim');
      })
      .catch(() => {});
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const loops = [
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(sway, {
            toValue: 1,
            duration: 1100,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(sway, {
            toValue: -1,
            duration: 1100,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ),
    ];
    loops.forEach((l) => l.start());
    return () => {
      mountedRef.current = false;
      clearInterval(clock);
      loops.forEach((l) => l.stop());
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [pulse, sway]);

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const flashBanner = useCallback(
    async (b: Banner, hold = 1000) => {
      setBanner(b);
      bannerAnim.setValue(0);
      await run(
        Animated.spring(bannerAnim, {
          toValue: 1,
          friction: 6,
          tension: 90,
          useNativeDriver: true,
        }),
      );
      await wait(hold);
      await run(
        Animated.timing(bannerAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      );
      if (mountedRef.current) setBanner(null);
    },
    [bannerAnim],
  );

  const resetPlayers = useCallback(
    (animated: boolean) => {
      const to = (v: Animated.Value, value: number) =>
        animated
          ? Animated.timing(v, {
              toValue: value,
              duration: 350,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            })
          : Animated.timing(v, {
              toValue: value,
              duration: 0,
              useNativeDriver: true,
            });
      return run(Animated.parallel([to(ballX, 0), to(ballY, 0), to(ballS, 1), to(ballR, 0), to(ballO, 1), to(keepX, 0), to(keepY, 0), to(keepR, 0), to(runX, 0), to(net, 0)]));
    },
    [ballX, ballY, ballS, ballR, ballO, keepX, keepY, keepR, runX, net],
  );

  const settle = useCallback(
    (payout: number) => {
      setShownBalance((b) => round2(b + payout));
      setSessionNet((n) => round2(n + payout));
      refreshWallet();
      if (panel === 'history')
        fetchPenaltyHistory(30)
          .then((h) => mountedRef.current && setHistory(h))
          .catch(() => {});
    },
    [refreshWallet, panel],
  );

  const kickOff = useCallback(async () => {
    if (busyRef.current || !config || pending) return;
    if (bet > shownBalance) {
      showToast('Insufficient balance');
      return;
    }
    busyRef.current = true;
    try {
      const r = await startPenaltyRound(bet, difficulty);
      if (!mountedRef.current) return;
      await resetPlayers(false);
      setRound(r);
      setLastShot(null);
      setShownBalance((b) => round2(b - bet));
      setSessionNet((n) => round2(n - bet));
      setPhase('aim');
    } catch (err) {
      showToast(errorMessage(err));
    } finally {
      busyRef.current = false;
    }
  }, [config, pending, bet, shownBalance, difficulty, resetPlayers, showToast]);

  const shoot = useCallback(
    async (zone: number) => {
      if (busyRef.current || !round || round.status !== 'PENDING') return;
      busyRef.current = true;
      setPhase('kicking');
      setLastShot(null);
      try {
        // Run-up while the server takes the kick.
        const runUp = run(
          Animated.timing(runX, {
            toValue: 1,
            duration: 420,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        );
        const [res] = await Promise.all([kickPenalty(round.id, zone), runUp]);
        if (!mountedRef.current) return;
        const { shot } = res;
        const target = zoneCenter(zone);
        const dive = zoneCenter(shot.dive);
        const startX = g.S / 2;
        const startY = g.spotY - 8;
        const dCol = (shot.dive % 3) - 1;
        const dTop = shot.dive < 3;
        const flight = 520;
        await run(
          Animated.parallel([
            Animated.timing(ballX, {
              toValue: target.x - startX,
              duration: flight,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(ballY, {
              toValue: target.y - startY,
              duration: flight,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(ballS, {
              toValue: 0.5,
              duration: flight,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(ballR, {
              toValue: 2,
              duration: flight,
              useNativeDriver: true,
            }),
            Animated.sequence([
              Animated.delay(90),
              Animated.parallel([
                Animated.timing(keepX, {
                  toValue: (dive.x - g.S / 2) * 0.82,
                  duration: 400,
                  easing: Easing.out(Easing.quad),
                  useNativeDriver: true,
                }),
                Animated.timing(keepY, {
                  toValue: dTop ? -zoneH * 0.55 : dCol === 0 ? zoneH * 0.1 : zoneH * 0.35,
                  duration: 400,
                  easing: Easing.out(Easing.quad),
                  useNativeDriver: true,
                }),
                Animated.timing(keepR, {
                  toValue: dCol * (dTop ? 62 : 82),
                  duration: 400,
                  easing: Easing.out(Easing.quad),
                  useNativeDriver: true,
                }),
              ]),
            ]),
          ]),
        );
        if (!mountedRef.current) return;
        setLastShot(shot);
        setRound(res.round);
        const r = res.round;
        if (shot.saved) {
          // Parried away.
          const away = (zone % 3) - 1 || (Math.random() < 0.5 ? -1 : 1);
          await run(
            Animated.parallel([
              Animated.timing(ballX, {
                toValue: target.x - startX + away * g.S * 0.22,
                duration: 420,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.timing(ballY, {
                toValue: target.y - startY + g.goalH * 0.9,
                duration: 420,
                easing: Easing.in(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.timing(ballO, {
                toValue: 0,
                duration: 420,
                useNativeDriver: true,
              }),
            ]),
          );
          setPhase('over');
          await flashBanner(
            {
              title: 'SAVED!',
              sub: `The keeper covered ${shot.covered.length} of 6 zones`,
              tone: 'save',
            },
            1100,
          );
          if (!mountedRef.current) return;
          refreshWallet();
          await resetPlayers(true);
        } else {
          // Into the net.
          Animated.sequence([
            Animated.timing(net, {
              toValue: 1,
              duration: 120,
              useNativeDriver: true,
            }),
            Animated.spring(net, {
              toValue: 0,
              friction: 3,
              tension: 120,
              useNativeDriver: true,
            }),
          ]).start();
          Animated.sequence([
            Animated.timing(flash, {
              toValue: 1,
              duration: 90,
              useNativeDriver: true,
            }),
            Animated.timing(flash, {
              toValue: 0,
              duration: 420,
              useNativeDriver: true,
            }),
          ]).start();
          await run(
            Animated.timing(ballS, {
              toValue: 0.42,
              duration: 140,
              useNativeDriver: true,
            }),
          );
          if (r.status === 'WON') {
            const payout = Number(r.payout);
            setPhase('over');
            await flashBanner(
              {
                title: r.goals >= KICKS ? 'PERFECT 5/5!' : 'MAX WIN!',
                sub: `${Number(r.multiplier).toFixed(2)}x · ${money(payout)}`,
                tone: 'win',
              },
              1500,
            );
            if (!mountedRef.current) return;
            settle(payout);
          } else {
            await flashBanner(
              {
                title: 'GOAL!',
                sub: `${Number(r.multiplier).toFixed(2)}x · ${money(floor2(Number(r.stake) * Number(r.multiplier)))}`,
                tone: 'goal',
              },
              800,
            );
            if (!mountedRef.current) return;
            setPhase('aim');
          }
          await resetPlayers(true);
        }
      } catch (err) {
        if (mountedRef.current) {
          showToast(errorMessage(err));
          await resetPlayers(true);
          // Re-sync with the server in case the kick went through.
          fetchPenaltyCurrent()
            .then((cur) => {
              if (!mountedRef.current) return;
              setRound(cur);
              setPhase(cur ? 'aim' : 'idle');
              refreshWallet();
            })
            .catch(() => setPhase('aim'));
        }
      } finally {
        busyRef.current = false;
      }
    },
    [round, g, zoneH, zoneCenter, runX, ballX, ballY, ballS, ballR, ballO, keepX, keepY, keepR, net, flash, flashBanner, resetPlayers, settle, refreshWallet, showToast],
  );

  const cashOut = useCallback(async () => {
    if (busyRef.current || !round || round.status !== 'PENDING' || round.goals <= 0) return;
    busyRef.current = true;
    try {
      const r = await cashOutPenalty(round.id);
      if (!mountedRef.current) return;
      setRound(r);
      setPhase('over');
      const payout = Number(r.payout);
      settle(payout);
      await flashBanner(
        {
          title: 'CASHED OUT',
          sub: `${Number(r.multiplier).toFixed(2)}x · ${money(payout)}`,
          tone: 'win',
        },
        1200,
      );
    } catch (err) {
      showToast(errorMessage(err));
    } finally {
      busyRef.current = false;
    }
  }, [round, settle, flashBanner, showToast]);

  const stepBet = (dir: 1 | -1) => {
    if (pending || phase === 'kicking') return;
    const idx = Math.max(0, betLevels.indexOf(bet));
    setBet(betLevels[Math.max(0, Math.min(betLevels.length - 1, idx + dir))] ?? bet);
  };

  const openHistory = () => {
    setPanel('history');
    setHistory(null);
    fetchPenaltyHistory(30)
      .then((h) => mountedRef.current && setHistory(h))
      .catch(() => mountedRef.current && setHistory([]));
  };

  const minutes = Math.floor((now - sessionStart.current) / 60000);
  const seconds = Math.floor(((now - sessionStart.current) % 60000) / 1000);
  const canAim = phase === 'aim' && pending;
  const kW = g.goalH * 0.76;
  const kH = g.goalH * 0.95;
  const ballSize = cabW * 0.1;
  const strikerW = cabW * 0.2;
  const strikerH = strikerW * 1.5;
  const lost = round?.status === 'LOST';
  const won = round?.status === 'WON';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#0A1638', '#03060F']} style={StyleSheet.absoluteFill} />

      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={WHITE} />
          <MaterialCommunityIcons name="soccer" size={18} color={LIME} />
          <Text style={styles.title}>PENALTY HERO</Text>
        </Pressable>
        <View style={styles.balancePill}>
          <MaterialCommunityIcons name="wallet" size={15} color={GOLD} />
          <Text style={styles.balanceText}>{money(shownBalance)}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 24,
          alignItems: 'center',
        }}
      >
        {/* Stadium */}
        <View style={[styles.stadium, { width: cabW, height: g.H }]}>
          <Stadium g={g} />

          {/* Scoreboard */}
          <View style={styles.scoreboard}>
            <Text style={styles.scoreLabel}>SHOOT-OUT</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {Array.from({ length: KICKS }, (_, i) => {
                const s = shots[i];
                return (
                  <View key={i} style={[styles.kickDot, s && (s.saved ? styles.kickMiss : styles.kickGoal)]}>
                    {s ? <MaterialCommunityIcons name={s.saved ? 'close' : 'soccer'} size={13} color={s.saved ? WHITE : NAVY} /> : null}
                  </View>
                );
              })}
            </View>
            <Text style={styles.scoreMult}>{goals > 0 ? `${ladder[goals].toFixed(2)}x` : '—'}</Text>
          </View>

          {/* Covered zones after a kick, so every result can be seen */}
          {lastShot &&
            lastShot.covered.map((z) => {
              const c = zoneCenter(z);
              return (
                <View
                  key={`c${z}`}
                  pointerEvents="none"
                  style={[
                    styles.coveredZone,
                    {
                      left: c.x - zoneW / 2 + 2,
                      top: c.y - zoneH / 2 + 2,
                      width: zoneW - 4,
                      height: zoneH - 4,
                    },
                  ]}
                >
                  <MaterialCommunityIcons name="hand-back-right" size={Math.min(zoneH * 0.5, 26)} color="#FF9A3A" />
                </View>
              );
            })}

          {/* Net bulge where the ball went in */}
          {lastShot && !lastShot.saved && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.goalZone,
                {
                  left: zoneCenter(lastShot.zone).x - zoneW / 2 + 2,
                  top: zoneCenter(lastShot.zone).y - zoneH / 2 + 2,
                  width: zoneW - 4,
                  height: zoneH - 4,
                  transform: [
                    {
                      scale: net.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.08],
                      }),
                    },
                  ],
                },
              ]}
            />
          )}

          {/* Keeper */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: g.S / 2 - kW / 2,
              top: g.lineY - kH,
              width: kW,
              height: kH,
              transform: [
                {
                  translateX: Animated.add(
                    keepX,
                    sway.interpolate({
                      inputRange: [-1, 1],
                      outputRange: [-zoneW * 0.12, zoneW * 0.12],
                    }),
                  ),
                },
                { translateY: keepY },
                {
                  rotate: keepR.interpolate({
                    inputRange: [-90, 90],
                    outputRange: ['-90deg', '90deg'],
                  }),
                },
              ],
            }}
          >
            <Keeper w={kW} h={kH} />
          </Animated.View>

          {/* Aim zones */}
          {[0, 1, 2, 3, 4, 5].map((z) => {
            const c = zoneCenter(z);
            return (
              <Pressable
                key={z}
                disabled={!canAim}
                accessibilityLabel={`Shoot ${ZONE_NAME[z]}`}
                onPress={() => shoot(z)}
                style={({ pressed }) => [
                  styles.zone,
                  {
                    left: c.x - zoneW / 2,
                    top: c.y - zoneH / 2,
                    width: zoneW,
                    height: zoneH,
                  },
                  pressed && canAim && { backgroundColor: 'rgba(198,255,58,0.25)' },
                ]}
              >
                {canAim && (
                  <Animated.View
                    style={[
                      styles.target,
                      {
                        width: Math.min(zoneW, zoneH) * 0.62,
                        height: Math.min(zoneW, zoneH) * 0.62,
                        opacity: pulse.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.45, 1],
                        }),
                        transform: [
                          {
                            scale: pulse.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.9, 1.05],
                            }),
                          },
                        ],
                      },
                    ]}
                  >
                    <View style={styles.targetDot} />
                  </Animated.View>
                )}
              </Pressable>
            );
          })}

          {/* Striker */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: g.S / 2 - strikerW * 1.25,
              top: g.H - strikerH * 0.92,
              transform: [
                {
                  translateX: runX.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, strikerW * 0.45],
                  }),
                },
                {
                  translateY: runX.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -strikerH * 0.12],
                  }),
                },
              ],
            }}
          >
            <Striker w={strikerW} h={strikerH} />
          </Animated.View>

          {/* Ball */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: g.S / 2 - ballSize / 2,
              top: g.spotY - 8 - ballSize / 2,
              width: ballSize,
              height: ballSize,
              opacity: ballO,
              transform: [
                { translateX: ballX },
                { translateY: ballY },
                { scale: ballS },
                {
                  rotate: ballR.interpolate({
                    inputRange: [0, 2],
                    outputRange: ['0deg', '720deg'],
                  }),
                },
              ],
            }}
          >
            <Ball size={ballSize} />
          </Animated.View>

          {/* Floodlight flash on a goal */}
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: '#FFFFFF',
                opacity: flash.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 0.35],
                }),
              },
            ]}
          />

          {/* Prompt */}
          {phase !== 'kicking' && (
            <View pointerEvents="none" style={[styles.prompt, { top: g.lineY + (g.spotY - g.lineY) * 0.32 }]}>
              <Text style={styles.promptText}>
                {canAim
                  ? goals === 0
                    ? 'TAP A ZONE TO SHOOT'
                    : `NEXT GOAL ${ladder[goals + 1]?.toFixed(2)}x · OR CASH OUT`
                  : lost
                    ? 'SAVED — KICK OFF AGAIN'
                    : won
                      ? `YOU WON ${money(Number(round!.payout))}`
                      : 'CHOOSE A KEEPER · KICK OFF'}
              </Text>
            </View>
          )}
        </View>

        {/* Multiplier ladder */}
        <View style={[styles.ladder, { width: cabW }]}>
          {Array.from({ length: KICKS }, (_, i) => {
            const n = i + 1;
            const reached = goals >= n && (pending || won);
            const next = pending && goals + 1 === n;
            return (
              <View key={n} style={[styles.rung, reached && styles.rungReached, next && styles.rungNext]}>
                <Text style={[styles.rungLabel, reached && { color: NAVY }]}>GOAL {n}</Text>
                <Text style={[styles.rungMult, reached && { color: NAVY }]} numberOfLines={1} adjustsFontSizeToFit>
                  {ladder[n]?.toFixed(2)}x
                </Text>
                <Text style={[styles.rungMoney, reached && { color: NAVY }]} numberOfLines={1} adjustsFontSizeToFit>
                  {money(Math.min(floor2(stake * (ladder[n] ?? 0)), maxPayout))}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Keeper difficulty */}
        <View style={[styles.diffRow, { width: cabW }]}>
          {DIFFS.map((d) => {
            const cover = config?.difficulties.find((x) => x.difficulty === d)?.cover ?? FALLBACK_COVER[d];
            const on = activeDiff === d;
            const locked = pending || phase === 'kicking';
            return (
              <Pressable
                key={d}
                disabled={locked}
                onPress={() => setDifficulty(d)}
                style={[
                  styles.diff,
                  on && {
                    borderColor: DIFF_COLOR[d],
                    backgroundColor: 'rgba(255,255,255,0.08)',
                  },
                  locked && !on && styles.dim,
                ]}
              >
                <Text style={[styles.diffName, { color: on ? DIFF_COLOR[d] : '#C8D0E0' }]}>{DIFF_NAME[d]}</Text>
                <View style={{ flexDirection: 'row', gap: 2, marginTop: 3 }}>
                  {[0, 1, 2, 3, 4, 5].map((k) => (
                    <View key={k} style={[styles.coverDot, k < cover && { backgroundColor: DIFF_COLOR[d] }]} />
                  ))}
                </View>
                <Text style={styles.diffSub}>keeper {cover}/6</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Session (time played and net position, always on show) */}
        <View style={[styles.session, { width: cabW }]}>
          <MaterialCommunityIcons name="timer-outline" size={15} color="#C8D0E0" />
          <Text style={styles.sessionText}>
            Session {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </Text>
          <Text style={styles.sessionSep}>·</Text>
          <Text
            style={[
              styles.sessionText,
              {
                color: sessionNet > 0 ? GREEN : sessionNet < 0 ? '#FF9AA6' : '#C8D0E0',
              },
            ]}
          >
            Net {sessionNet >= 0 ? '+' : '−'}
            {money(Math.abs(sessionNet))}
          </Text>
        </View>

        {/* Controls: no autoplay */}
        <View style={[styles.controls, { width: cabW }]}>
          <Pressable onPress={() => setPanel('info')} style={styles.sideBtn} hitSlop={6}>
            <MaterialCommunityIcons name="information-outline" size={20} color={LIME} />
            <Text style={styles.sideText}>RULES</Text>
          </Pressable>
          <View style={styles.betBox}>
            <Text style={styles.betLabel}>BET</Text>
            <View style={styles.betRow}>
              <Pressable onPress={() => stepBet(-1)} disabled={pending} style={[styles.betBtn, pending && styles.dim]} hitSlop={6}>
                <MaterialCommunityIcons name="minus" size={18} color={NAVY} />
              </Pressable>
              <Text style={styles.betValue}>{money(pending ? stake : bet)}</Text>
              <Pressable onPress={() => stepBet(1)} disabled={pending} style={[styles.betBtn, pending && styles.dim]} hitSlop={6}>
                <MaterialCommunityIcons name="plus" size={18} color={NAVY} />
              </Pressable>
            </View>
          </View>
          {pending ? (
            <Pressable onPress={cashOut} disabled={goals === 0 || phase === 'kicking'} style={({ pressed }) => [styles.mainWrap, pressed && { transform: [{ scale: 0.95 }] }]}>
              <LinearGradient colors={goals === 0 || phase === 'kicking' ? ['#5A6070', '#2A3040'] : ['#7CFFB0', '#1AC860', '#0A7A3A']} style={styles.mainBtn}>
                <Text style={styles.mainSmall}>{goals === 0 ? 'SHOOT' : 'CASH OUT'}</Text>
                <Text style={styles.mainBig} numberOfLines={1} adjustsFontSizeToFit>
                  {goals === 0 ? 'FIRST' : money(cashValue)}
                </Text>
              </LinearGradient>
            </Pressable>
          ) : (
            <Pressable onPress={kickOff} disabled={!config || phase === 'kicking'} style={({ pressed }) => [styles.mainWrap, pressed && { transform: [{ scale: 0.95 }] }]}>
              <Animated.View
                style={[
                  styles.mainHalo,
                  {
                    opacity: pulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.25, 0.7],
                    }),
                  },
                ]}
              />
              <LinearGradient colors={!config ? ['#5A6070', '#2A3040'] : ['#F4FFB0', LIME, '#6A9A00']} style={styles.mainBtn}>
                <MaterialCommunityIcons name="soccer" size={24} color={NAVY} />
                <Text style={styles.mainSmall}>KICK OFF</Text>
              </LinearGradient>
            </Pressable>
          )}
          <Pressable onPress={openHistory} style={styles.sideBtn} hitSlop={6}>
            <MaterialCommunityIcons name="history" size={20} color={LIME} />
            <Text style={styles.sideText}>HISTORY</Text>
          </Pressable>
        </View>

        <GameInfoButton>
          RTP {config?.rtpPercent ?? 88}% at every cash-out point · bet {money(minStake)}–{money(maxStake)} · max {money(maxPayout)} per round
          {'\n'}
          No autoplay · the keeper's zones are fixed by your provably-fair seeds before you shoot
        </GameInfoButton>
      </ScrollView>

      {banner && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.banner,
            {
              opacity: bannerAnim,
              transform: [
                {
                  scale: bannerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.5, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={banner.tone === 'save' ? ['#5A0A14', '#2A0408'] : banner.tone === 'win' ? ['#FFF4C8', GOLD, '#B87800'] : ['#1A5A2A', '#0A2A12']}
            style={[
              styles.bannerInner,
              {
                borderColor: banner.tone === 'save' ? RED : banner.tone === 'win' ? WHITE : LIME,
              },
            ]}
          >
            {banner.tone !== 'save' && <Ball size={40} />}
            <Text style={[styles.bannerText, banner.tone === 'win' && { color: '#3A1A00' }, banner.tone === 'save' && { color: '#FFD0D4' }]}>{banner.title}</Text>
            {banner.sub ? <Text style={[styles.bannerSub, banner.tone === 'win' && { color: '#5A2A00' }, banner.tone === 'save' && { color: '#FF9AA6' }]}>{banner.sub}</Text> : null}
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
              <Text style={styles.modalTitle}>{panel === 'info' ? 'HOW TO PLAY' : 'MY SHOOT-OUTS'}</Text>
              <Pressable onPress={() => setPanel(null)} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={22} color={WHITE} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 480 }}>{panel === 'info' ? <Rules bet={bet} config={config} /> : <History rounds={history} />}</ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Rules({ bet, config }: { bet: number; config: PenaltyConfig | null }) {
  if (!config) return <Text style={styles.note}>Loading…</Text>;
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.note}>
        Pick a keeper and your bet, then KICK OFF. Tap one of the goal's 6 zones to shoot. Before every kick the keeper's zones are already fixed: score and your multiplier rises, hit a zone he covers
        and the shot is saved and the bet is lost.
      </Text>
      <Text style={styles.note}>Cash out after any goal. Score all {config.kicks} and the round pays out automatically. Every zone has the same chance, so no zone is luckier than another.</Text>
      <Text style={styles.section}>MULTIPLIERS (at {money(bet)})</Text>
      <View style={styles.tRow}>
        <Text style={[styles.tHead, { width: 64, textAlign: 'left' }]}>KEEPER</Text>
        {Array.from({ length: config.kicks }, (_, i) => (
          <Text key={i} style={styles.tHead}>
            {i + 1}
          </Text>
        ))}
      </View>
      {config.difficulties.map((d) => (
        <View key={d.difficulty} style={styles.tRow}>
          <Text style={[styles.tName, { color: DIFF_COLOR[d.difficulty] }]}>
            {DIFF_NAME[d.difficulty]}
            {'\n'}
            <Text style={styles.tSub}>covers {d.cover}/6</Text>
          </Text>
          {d.multipliers.slice(1).map((m, i) => (
            <Text key={i} style={styles.tCell}>
              {m.toFixed(2)}x
            </Text>
          ))}
        </View>
      ))}
      <Text style={styles.section}>GAME INFO</Text>
      <Text style={styles.note}>
        Return to player {config.rtpPercent}% whenever you cash out. A round pays at most {money(config.maxPayout)}; reaching it settles the round. No autoplay. Your kicks are decided by your
        provably-fair seeds (server seed hash, client seed and nonce in each round).
      </Text>
    </View>
  );
}

function History({ rounds }: { rounds: PenaltyRound[] | null }) {
  if (rounds === null) return <Text style={styles.note}>Loading…</Text>;
  if (rounds.length === 0) return <Text style={styles.note}>No shoot-outs yet.</Text>;
  return (
    <View>
      {rounds.map((r) => {
        const payout = Number(r.payout);
        const d = new Date(r.createdAt);
        return (
          <View key={r.id} style={styles.histRow}>
            <Text style={styles.histTime}>{d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            <Text style={styles.histStake}>{money(Number(r.stake))}</Text>
            <Text style={[styles.histDiff, { color: DIFF_COLOR[r.difficulty] }]}>{DIFF_NAME[r.difficulty]}</Text>
            <View style={{ flexDirection: 'row', gap: 2, flex: 1 }}>
              {(r.shots ?? []).map((s, i) => (
                <MaterialCommunityIcons key={i} name={s.saved ? 'close-circle' : 'soccer'} size={13} color={s.saved ? RED : GREEN} />
              ))}
            </View>
            <Text style={[styles.histWin, { color: payout > 0 ? GREEN : '#8A8FA8' }]}>{payout > 0 ? `+${money(payout)}` : '—'}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#03060F' },
  topBar: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  title: {
    color: WHITE,
    fontSize: 18,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: 2,
  },
  balancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(198,255,58,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(198,255,58,0.45)',
  },
  balanceText: { color: WHITE, fontSize: 14, fontWeight: '800' },
  stadium: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#2A3A6A',
    marginTop: 4,
  },
  scoreboard: {
    position: 'absolute',
    top: 6,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(2,4,20,0.92)',
    borderWidth: 1.5,
    borderColor: '#3A4A8A',
  },
  scoreLabel: {
    color: GOLD,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  scoreMult: {
    color: LIME,
    fontSize: 14,
    fontWeight: '900',
    minWidth: 52,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  kickDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#5A6A9A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kickGoal: { backgroundColor: GREEN, borderColor: GREEN },
  kickMiss: { backgroundColor: RED, borderColor: RED },
  zone: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  target: {
    borderRadius: 999,
    borderWidth: 2,
    borderColor: LIME,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(198,255,58,0.08)',
  },
  targetDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: LIME },
  coveredZone: {
    position: 'absolute',
    borderRadius: 6,
    backgroundColor: 'rgba(255,77,94,0.22)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,154,58,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalZone: {
    position: 'absolute',
    borderRadius: 6,
    backgroundColor: 'rgba(61,255,138,0.25)',
    borderWidth: 2,
    borderColor: GREEN,
  },
  prompt: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  promptText: {
    color: WHITE,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  ladder: { flexDirection: 'row', gap: 5, marginTop: 10 },
  rung: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#2A3A6A',
    backgroundColor: 'rgba(10,18,48,0.85)',
  },
  rungReached: { backgroundColor: GREEN, borderColor: GREEN },
  rungNext: { borderColor: GOLD },
  rungLabel: {
    color: '#8A98C8',
    fontSize: 8.5,
    fontWeight: '900',
    letterSpacing: 1,
  },
  rungMult: { color: WHITE, fontSize: 14, fontWeight: '900' },
  rungMoney: { color: GOLD, fontSize: 10, fontWeight: '800' },
  diffRow: { flexDirection: 'row', gap: 5, marginTop: 8 },
  diff: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#2A3A6A',
  },
  diffName: { fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  diffSub: { color: '#8A98C8', fontSize: 9, fontWeight: '700', marginTop: 2 },
  coverDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2A3A6A',
  },
  session: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  sessionText: {
    color: '#C8D0E0',
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  sessionSep: { color: '#5A6070', fontSize: 12 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingHorizontal: 4,
  },
  sideBtn: { alignItems: 'center', gap: 2, width: 58 },
  sideText: { color: LIME, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  betBox: { alignItems: 'center', gap: 4 },
  betLabel: {
    color: '#A8B0C8',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },
  betRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(10,18,48,0.85)',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#2A3A6A',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  betBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: WHITE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  betValue: {
    color: WHITE,
    fontSize: 15,
    fontWeight: '900',
    minWidth: 70,
    textAlign: 'center',
  },
  dim: { opacity: 0.4 },
  mainWrap: {
    width: 92,
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainHalo: {
    position: 'absolute',
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: LIME,
  },
  mainBtn: {
    width: 82,
    height: 82,
    borderRadius: 41,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: WHITE,
    paddingHorizontal: 6,
  },
  mainSmall: { color: NAVY, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  mainBig: { color: NAVY, fontSize: 15, fontWeight: '900' },
  footNote: {
    color: '#7A8090',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 15,
    paddingHorizontal: 16,
  },
  banner: { position: 'absolute', top: '24%', alignSelf: 'center' },
  bannerInner: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 3,
    alignItems: 'center',
  },
  bannerText: {
    color: WHITE,
    fontSize: 32,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: 2,
  },
  bannerSub: {
    color: LIME,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 2,
    letterSpacing: 1,
  },
  toast: {
    position: 'absolute',
    bottom: 120,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
  },
  toastText: { color: WHITE, fontSize: 13, fontWeight: '700' },
  modalBack: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    backgroundColor: '#0E1838',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#3A4A8A',
    padding: 14,
  },
  modalHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    color: WHITE,
    fontSize: 16,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: 2,
  },
  note: { color: '#C8D0E0', fontSize: 12, lineHeight: 17 },
  section: {
    color: LIME,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 4,
  },
  tRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  tHead: {
    flex: 1,
    color: '#8A98C8',
    fontSize: 10,
    fontWeight: '900',
    textAlign: 'right',
  },
  tName: { width: 64, fontSize: 11, fontWeight: '900' },
  tSub: { color: '#8A98C8', fontSize: 9, fontWeight: '700' },
  tCell: {
    flex: 1,
    color: WHITE,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'right',
  },
  histRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    gap: 6,
  },
  histTime: { color: '#98A0B0', fontSize: 11, width: 64 },
  histStake: { color: WHITE, fontSize: 12, fontWeight: '700', width: 58 },
  histDiff: { fontSize: 9.5, fontWeight: '900', width: 50 },
  histWin: { fontSize: 12, fontWeight: '900' },
});
