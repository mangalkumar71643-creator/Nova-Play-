import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient as SvgLinearGradient, Path, Pattern, Polygon, RadialGradient, Rect, Stop, TSpan, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../api/client';
import { CandyCell, CandyConfig, CandyOutcome, CandyRound, CandySpinRow, CandyStep, CandySym, CandySymbol, fetchCandyConfig, fetchCandyHistory, spinCandy } from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const PINK = '#FF4FA3';
const PINK_DEEP = '#C2185B';
const CREAM = '#FFF4FA';
const GOLD = '#FFD66B';
const COLS = 6;
const ROWS = 5;
const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const DEFAULT_BET = 10;
const AUTO_OPTIONS = [10, 25, 50, 100];
const SOUND_KEY = 'novaplay:candy:sound';
const TOAST_MS = 1800;
const NAME: Record<CandySymbol, string> = {
  HEART: 'Heart candy',
  PURPLE: 'Purple candy',
  GREEN: 'Green candy',
  BLUE: 'Blue candy',
  APPLE: 'Apple',
  PLUM: 'Plum',
  WATERMELON: 'Watermelon',
  GRAPES: 'Grapes',
  BANANA: 'Banana',
};
const FALLBACK_PAYTABLE: CandyConfig['paytable'] = [
  { symbol: 'HEART', pays: [10, 25, 50] },
  { symbol: 'PURPLE', pays: [2.5, 10, 25] },
  { symbol: 'GREEN', pays: [2, 5, 15] },
  { symbol: 'BLUE', pays: [1.5, 2, 12] },
  { symbol: 'APPLE', pays: [1, 1.5, 10] },
  { symbol: 'PLUM', pays: [0.8, 1.2, 8] },
  { symbol: 'WATERMELON', pays: [0.5, 1, 5] },
  { symbol: 'GRAPES', pays: [0.4, 0.9, 4] },
  { symbol: 'BANANA', pays: [0.25, 0.75, 2] },
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const run = (a: Animated.CompositeAnimation) => new Promise<void>((r) => a.start(() => r()));

// ---------- symbol art (100 x 100) ----------

function Gloss({ cx, cy, rx, ry }: { cx: number; cy: number; rx: number; ry: number }) {
  return <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#FFFFFF" opacity={0.55} transform={`rotate(-25 ${cx} ${cy})`} />;
}

function SymbolDefs() {
  return (
    <Defs>
      <RadialGradient id="cbHeart" cx="40%" cy="35%" r="70%">
        <Stop offset="0" stopColor="#FF8FA3" />
        <Stop offset="0.6" stopColor="#E0103A" />
        <Stop offset="1" stopColor="#8A0620" />
      </RadialGradient>
      <RadialGradient id="cbPurple" cx="40%" cy="35%" r="75%">
        <Stop offset="0" stopColor="#E9A8FF" />
        <Stop offset="0.6" stopColor="#9B2FD6" />
        <Stop offset="1" stopColor="#4E0E7A" />
      </RadialGradient>
      <RadialGradient id="cbGreen" cx="40%" cy="35%" r="75%">
        <Stop offset="0" stopColor="#B6FFB0" />
        <Stop offset="0.6" stopColor="#1FB84A" />
        <Stop offset="1" stopColor="#0B6425" />
      </RadialGradient>
      <RadialGradient id="cbBlue" cx="40%" cy="35%" r="75%">
        <Stop offset="0" stopColor="#B3E5FF" />
        <Stop offset="0.6" stopColor="#1E88E5" />
        <Stop offset="1" stopColor="#0B3F8A" />
      </RadialGradient>
      <RadialGradient id="cbApple" cx="38%" cy="35%" r="70%">
        <Stop offset="0" stopColor="#FF9A8A" />
        <Stop offset="0.6" stopColor="#E53935" />
        <Stop offset="1" stopColor="#8E1512" />
      </RadialGradient>
      <RadialGradient id="cbPlum" cx="38%" cy="35%" r="70%">
        <Stop offset="0" stopColor="#C9A3FF" />
        <Stop offset="0.6" stopColor="#5E2CA5" />
        <Stop offset="1" stopColor="#2A0F55" />
      </RadialGradient>
      <RadialGradient id="cbGrape" cx="38%" cy="35%" r="70%">
        <Stop offset="0" stopColor="#E7B3FF" />
        <Stop offset="0.7" stopColor="#8E24AA" />
        <Stop offset="1" stopColor="#4A0E5E" />
      </RadialGradient>
      <SvgLinearGradient id="cbBanana" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor="#FFF59D" />
        <Stop offset="0.6" stopColor="#FDD835" />
        <Stop offset="1" stopColor="#E0A800" />
      </SvgLinearGradient>
      <RadialGradient id="cbBomb" cx="38%" cy="32%" r="75%">
        <Stop offset="0" stopColor="#FFFFFF" />
        <Stop offset="0.25" stopColor="#FFD54F" />
        <Stop offset="0.5" stopColor="#FF4FA3" />
        <Stop offset="0.75" stopColor="#7C4DFF" />
        <Stop offset="1" stopColor="#1E88E5" />
      </RadialGradient>
    </Defs>
  );
}

export const CandyArt = memo(function CandyArt({ s, m, size }: { s: CandySym; m?: number; size: number }) {
  let body: React.ReactNode = null;
  switch (s) {
    case 'HEART':
      body = (
        <G>
          <Path d="M50 90 C 18 66 6 48 6 31 C 6 17 17 7 31 7 C 40 7 46 12 50 20 C 54 12 60 7 69 7 C 83 7 94 17 94 31 C 94 48 82 66 50 90 Z" fill="url(#cbHeart)" stroke="#7A0418" strokeWidth={2.5} />
          <Gloss cx={30} cy={27} rx={12} ry={6} />
        </G>
      );
      break;
    case 'PURPLE':
      body = (
        <G>
          <Polygon points="30,8 70,8 92,30 92,70 70,92 30,92 8,70 8,30" fill="url(#cbPurple)" stroke="#3E0A63" strokeWidth={2.5} />
          <Polygon points="36,20 64,20 80,36 80,64 64,80 36,80 20,64 20,36" fill="none" stroke="#F3D1FF" strokeOpacity={0.5} strokeWidth={2} />
          <Gloss cx={34} cy={28} rx={13} ry={6} />
        </G>
      );
      break;
    case 'GREEN':
      body = (
        <G>
          <Polygon points="50,6 94,38 77,92 23,92 6,38" fill="url(#cbGreen)" stroke="#07501C" strokeWidth={2.5} />
          <Polygon points="50,22 78,42 67,78 33,78 22,42" fill="none" stroke="#DFFFD9" strokeOpacity={0.5} strokeWidth={2} />
          <Gloss cx={36} cy={34} rx={12} ry={5} />
        </G>
      );
      break;
    case 'BLUE':
      body = (
        <G>
          <Ellipse cx={50} cy={50} rx={43} ry={32} fill="url(#cbBlue)" stroke="#08306B" strokeWidth={2.5} transform="rotate(-20 50 50)" />
          <Ellipse cx={50} cy={50} rx={30} ry={20} fill="none" stroke="#E1F5FF" strokeOpacity={0.5} strokeWidth={2} transform="rotate(-20 50 50)" />
          <Gloss cx={34} cy={36} rx={13} ry={5} />
        </G>
      );
      break;
    case 'APPLE':
      body = (
        <G>
          <Path d="M50 28 C 38 18 12 20 12 50 C 12 76 32 94 42 92 C 46 91 48 89 50 89 C 52 89 54 91 58 92 C 68 94 88 76 88 50 C 88 20 62 18 50 28 Z" fill="url(#cbApple)" stroke="#6D0E0B" strokeWidth={2.5} />
          <Path d="M50 29 C 50 20 52 12 56 6" stroke="#5D3A1A" strokeWidth={4} strokeLinecap="round" fill="none" />
          <Path d="M55 16 C 64 6 78 8 82 12 C 74 20 62 20 55 16 Z" fill="#43A047" stroke="#1B5E20" strokeWidth={1.5} />
          <Gloss cx={30} cy={42} rx={9} ry={5} />
        </G>
      );
      break;
    case 'PLUM':
      body = (
        <G>
          <Ellipse cx={50} cy={56} rx={38} ry={36} fill="url(#cbPlum)" stroke="#1E0A40" strokeWidth={2.5} />
          <Path d="M50 22 C 44 40 44 70 50 92" stroke="#1E0A40" strokeOpacity={0.45} strokeWidth={2} fill="none" />
          <Path d="M50 22 C 50 14 53 9 57 6" stroke="#5D3A1A" strokeWidth={3.5} strokeLinecap="round" fill="none" />
          <Path d="M55 12 C 62 4 74 6 76 10 C 70 16 60 16 55 12 Z" fill="#66BB6A" stroke="#1B5E20" strokeWidth={1.2} />
          <Gloss cx={32} cy={42} rx={9} ry={5} />
        </G>
      );
      break;
    case 'WATERMELON':
      body = (
        <G>
          <Path d="M6 34 A 44 44 0 0 0 94 34 Z" fill="#2E7D32" stroke="#1B4D1E" strokeWidth={2.5} />
          <Path d="M13 34 A 37 37 0 0 0 87 34 Z" fill="#DCEDC8" />
          <Path d="M18 34 A 32 32 0 0 0 82 34 Z" fill="#F4435E" />
          {[
            [34, 44],
            [50, 50],
            [66, 44],
            [42, 58],
            [58, 58],
          ].map(([x, y], i) => (
            <Ellipse key={i} cx={x} cy={y} rx={2.6} ry={4} fill="#1A1A1A" />
          ))}
          <Path d="M24 38 L 76 38" stroke="#FFFFFF" strokeOpacity={0.35} strokeWidth={3} strokeLinecap="round" />
        </G>
      );
      break;
    case 'GRAPES':
      body = (
        <G>
          <Path d="M50 16 C 50 10 52 6 56 4" stroke="#5D3A1A" strokeWidth={3.5} strokeLinecap="round" fill="none" />
          <Path d="M54 10 C 64 2 78 6 80 10 C 72 18 60 16 54 10 Z" fill="#66BB6A" stroke="#1B5E20" strokeWidth={1.2} />
          {[
            [34, 30],
            [50, 28],
            [66, 30],
            [26, 46],
            [42, 46],
            [58, 46],
            [74, 46],
            [34, 62],
            [50, 62],
            [66, 62],
            [42, 78],
            [58, 78],
            [50, 92],
          ].map(([x, y], i) => (
            <G key={i}>
              <Circle cx={x} cy={y} r={9.5} fill="url(#cbGrape)" stroke="#3B0A4D" strokeWidth={1.4} />
              <Circle cx={x - 3} cy={y - 3} r={2.4} fill="#FFFFFF" opacity={0.6} />
            </G>
          ))}
        </G>
      );
      break;
    case 'BANANA':
      body = (
        <G>
          <Path d="M14 30 C 16 70 50 90 86 76 C 90 74 90 70 86 70 C 58 76 34 60 26 28 C 25 22 14 22 14 30 Z" fill="url(#cbBanana)" stroke="#9A6B00" strokeWidth={2.5} />
          <Path d="M22 32 C 28 58 50 72 78 72" stroke="#FFFDE7" strokeOpacity={0.7} strokeWidth={3} fill="none" strokeLinecap="round" />
          <Path d="M14 30 L 12 22 L 20 21 L 22 27 Z" fill="#5D3A1A" />
          <Circle cx={87} cy={73} r={3} fill="#5D3A1A" />
        </G>
      );
      break;
    case 'SCATTER':
      body = (
        <G>
          <Rect x={46} y={60} width={8} height={38} rx={3} fill="#FFF3E0" stroke="#C9A27A" strokeWidth={1.2} />
          <Circle cx={50} cy={38} r={34} fill="#FFFFFF" stroke={PINK_DEEP} strokeWidth={3} />
          <Path d="M50 38 m 0 -4 a 4 4 0 1 1 -4 4 a 8 8 0 1 1 12 -6 a 12 12 0 1 1 -18 10 a 16 16 0 1 1 22 -16 a 20 20 0 1 1 -28 20 a 24 24 0 1 1 34 -22" fill="none" stroke={PINK} strokeWidth={5.5} strokeLinecap="round" />
          <Path d="M50 38 m 4 2 a 6 6 0 1 1 -8 -6 a 10 10 0 1 1 14 8 a 14 14 0 1 1 -20 -12" fill="none" stroke="#7C4DFF" strokeWidth={3} strokeLinecap="round" opacity={0.8} />
          <Gloss cx={34} cy={20} rx={10} ry={5} />
        </G>
      );
      break;
    case 'BOMB':
      body = (
        <G>
          <Circle cx={50} cy={52} r={40} fill="url(#cbBomb)" stroke="#FFFFFF" strokeWidth={3} />
          <Circle cx={50} cy={52} r={30} fill="#2A0845" opacity={0.3} />
          <Path d="M66 18 C 72 10 78 10 82 6" stroke="#FFD54F" strokeWidth={3} strokeLinecap="round" fill="none" />
          <Circle cx={83} cy={6} r={4} fill="#FFF59D" />
          <SvgText x={50} y={(m ?? 0) >= 100 ? 62 : 65} fontSize={(m ?? 0) >= 100 ? 28 : (m ?? 0) >= 10 ? 34 : 40} fontWeight="900" fill="#FFF59D" stroke="#3B0764" strokeWidth={3} textAnchor="middle">
            {`${m ?? ''}x`}
          </SvgText>
          <Gloss cx={32} cy={28} rx={10} ry={5} />
        </G>
      );
      break;
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <SymbolDefs />
      {body}
    </Svg>
  );
});

// ---------- decoration ----------

function Background({ w, h, free }: { w: number; h: number; free: boolean }) {
  const clouds = [
    [0.12, 0.16, 0.2],
    [0.82, 0.1, 0.24],
    [0.55, 0.22, 0.16],
    [0.2, 0.86, 0.26],
    [0.86, 0.9, 0.22],
  ];
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id="cbSky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={free ? '#2B0B57' : '#FF9CCB'} />
          <Stop offset="0.5" stopColor={free ? '#5B1A8C' : '#C98BFF'} />
          <Stop offset="1" stopColor={free ? '#12042A' : '#7B4BE0'} />
        </SvgLinearGradient>
        <RadialGradient id="cbSun" cx="50%" cy="45%" r="50%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={free ? 0.18 : 0.4} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
        <Pattern id="cbDots" width={34} height={34} patternUnits="userSpaceOnUse">
          <Circle cx={8} cy={8} r={2.2} fill="#FFFFFF" opacity={free ? 0.35 : 0.22} />
          <Circle cx={25} cy={25} r={1.4} fill="#FFFFFF" opacity={free ? 0.5 : 0.18} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill="url(#cbSky)" />
      <Rect x={0} y={0} width={w} height={h} fill="url(#cbDots)" />
      <Circle cx={w / 2} cy={h * 0.45} r={Math.max(w, h) * 0.5} fill="url(#cbSun)" />
      {clouds.map(([x, y, r], i) => {
        const cx = x * w;
        const cy = y * h;
        const s = r * w;
        return (
          <G key={i} opacity={free ? 0.18 : 0.55}>
            <Circle cx={cx} cy={cy} r={s * 0.45} fill="#FFFFFF" />
            <Circle cx={cx - s * 0.45} cy={cy + s * 0.12} r={s * 0.32} fill="#FFE3F1" />
            <Circle cx={cx + s * 0.45} cy={cy + s * 0.1} r={s * 0.34} fill="#FFE3F1" />
          </G>
        );
      })}
      {/* candy canes in the bottom corners */}
      {[0.04, 0.96].map((x, i) => (
        <G key={i} opacity={0.5} transform={`translate(${x * w} ${h * 0.62}) scale(${i ? -1 : 1} 1)`}>
          <Path d="M0 0 L 0 -90 A 18 18 0 0 1 36 -90" stroke="#FFFFFF" strokeWidth={10} fill="none" strokeLinecap="round" />
          <Path d="M0 0 L 0 -90 A 18 18 0 0 1 36 -90" stroke="#E91E63" strokeWidth={10} strokeDasharray="10 10" fill="none" strokeLinecap="butt" />
        </G>
      ))}
    </Svg>
  );
}

function Logo({ width }: { width: number }) {
  return (
    <Svg width={width} height={width * 0.24} viewBox="0 0 360 86">
      <Defs>
        <SvgLinearGradient id="cbLogo" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFE0F0" />
          <Stop offset="0.45" stopColor="#FF4FA3" />
          <Stop offset="1" stopColor="#B0105E" />
        </SvgLinearGradient>
        <SvgLinearGradient id="cbLogo2" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFF8C4" />
          <Stop offset="0.5" stopColor="#FFC93C" />
          <Stop offset="1" stopColor="#E07A00" />
        </SvgLinearGradient>
      </Defs>
      <SvgText x={182} y={60} fontSize={44} fontWeight="bold" fill="#5A0B35" opacity={0.5} textAnchor="middle" letterSpacing={1}>
        CANDY BLAST
      </SvgText>
      <SvgText x={180} y={58} fontSize={44} fontWeight="bold" fill="url(#cbLogo)" stroke="#FFFFFF" strokeWidth={2.5} textAnchor="middle" letterSpacing={1}>
        CANDY
        <TSpan fill="url(#cbLogo2)"> BLAST</TSpan>
      </SvgText>
      <SvgText x={180} y={80} fontSize={12} fontWeight="bold" fill="#FFFFFF" textAnchor="middle" letterSpacing={4}>
        8+ ANYWHERE WINS
      </SvgText>
    </Svg>
  );
}

function Rays({ size }: { size: number }) {
  const c = size / 2;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id="cbRay" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFE3F1" stopOpacity={0.7} />
          <Stop offset="1" stopColor="#FF4FA3" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={c} cy={c} r={c * 0.45} fill="url(#cbRay)" />
      {Array.from({ length: 16 }, (_, i) => {
        const a0 = ((i * 22.5 - 5) * Math.PI) / 180;
        const a1 = ((i * 22.5 + 5) * Math.PI) / 180;
        return <Path key={i} d={`M ${c} ${c} L ${c + c * Math.cos(a0)} ${c + c * Math.sin(a0)} L ${c + c * Math.cos(a1)} ${c + c * Math.sin(a1)} Z`} fill="url(#cbRay)" />;
      })}
    </Svg>
  );
}

/** Home tile art: a lollipop, a heart candy and fruit on pink. */
export function CandyBlastTileArt({ size }: { size: number }) {
  const s = size * 0.36;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size }} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinearGradient id="cbtBg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FF9CCB" />
            <Stop offset="1" stopColor="#7B4BE0" />
          </SvgLinearGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill="url(#cbtBg)" />
        <Circle cx={18} cy={20} r={10} fill="#FFFFFF" opacity={0.35} />
        <Circle cx={84} cy={14} r={8} fill="#FFFFFF" opacity={0.3} />
      </Svg>
      <View style={{ position: 'absolute', left: size * 0.32, top: size * 0.04, transform: [{ rotate: '-8deg' }] }}>
        <CandyArt s="SCATTER" size={s * 1.1} />
      </View>
      <View style={{ position: 'absolute', left: size * 0.06, top: size * 0.3 }}>
        <CandyArt s="HEART" size={s * 0.9} />
      </View>
      <View style={{ position: 'absolute', left: size * 0.64, top: size * 0.3 }}>
        <CandyArt s="BOMB" m={10} size={s * 0.8} />
      </View>
    </View>
  );
}

// ---------- board ----------

type BoardCell = {
  id: number;
  s: CandySym;
  m?: number;
  col: number;
  row: number;
  y: Animated.Value;
  scale: Animated.Value;
  opacity: Animated.Value;
  lit: boolean;
};

const DEMO_GRID: CandyCell[][] = [
  [{ s: 'HEART' }, { s: 'GRAPES' }, { s: 'BANANA' }, { s: 'PLUM' }, { s: 'BLUE' }],
  [{ s: 'APPLE' }, { s: 'SCATTER' }, { s: 'PURPLE' }, { s: 'WATERMELON' }, { s: 'BANANA' }],
  [{ s: 'GREEN' }, { s: 'BANANA' }, { s: 'HEART' }, { s: 'GRAPES' }, { s: 'APPLE' }],
  [{ s: 'PLUM' }, { s: 'BLUE' }, { s: 'WATERMELON' }, { s: 'PURPLE' }, { s: 'GRAPES' }],
  [{ s: 'BANANA' }, { s: 'APPLE' }, { s: 'GREEN' }, { s: 'SCATTER' }, { s: 'HEART' }],
  [{ s: 'WATERMELON' }, { s: 'PURPLE' }, { s: 'PLUM' }, { s: 'BANANA' }, { s: 'BLUE' }],
];

type Banner = { title: string; sub: string };
type BigWin = { label: string; amount: number };
type Pop = { text: string; sub?: string; key: number };

export default function CandyBlastScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<CandyConfig | null>(null);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [busy, setBusy] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [autoLeft, setAutoLeft] = useState(0);
  const [autoOpen, setAutoOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [shownBalance, setShownBalance] = useState(coins);
  const [cells, setCells] = useState<BoardCell[]>([]);
  const [free, setFree] = useState<{ index: number; total: number; base: number } | null>(null);
  const [winTotal, setWinTotal] = useState(0);
  const [pop, setPop] = useState<Pop | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [bigWin, setBigWin] = useState<BigWin | null>(null);
  const [bigCount, setBigCount] = useState(0);
  const [panel, setPanel] = useState<'pay' | 'history' | null>(null);
  const [history, setHistory] = useState<CandySpinRow[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const cellsRef = useRef<BoardCell[]>([]);
  const idRef = useRef(1);
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

  const paytable = config?.paytable ?? FALLBACK_PAYTABLE;
  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const betLevels = useMemo(() => BET_LEVELS.filter((b) => b >= minStake && b <= maxStake), [minStake, maxStake]);

  // ---------- layout ----------
  const pad = 8;
  const gap = 3;
  const headerH = insets.top + 50;
  const logoW = Math.min(W * 0.8, 330);
  const logoH = logoW * 0.24;
  const infoH = 30;
  const controlsH = 92;
  const stripH = 54;
  const availH = H - headerH - insets.bottom - 18 - controlsH - stripH - logoH - infoH - 56;
  const cellW = Math.floor(Math.min((Math.min(W - 20, 470) - pad * 2 - gap * (COLS - 1)) / COLS, (availH - pad * 2 - gap * (ROWS - 1)) / ROWS));
  const boardW = cellW * COLS + gap * (COLS - 1);
  const boardH = cellW * ROWS + gap * (ROWS - 1);
  const frameW = boardW + pad * 2;
  const frameH = boardH + pad * 2;
  const frameLeft = (W - frameW) / 2;
  const spare = Math.max(0, H - insets.bottom - 18 - controlsH - headerH - (logoH + 6 + infoH + 6 + frameH + 12 + stripH));
  const logoTop = headerH + spare * 0.42;
  const infoTop = logoTop + logoH + 6;
  const frameTop = infoTop + infoH + 6;
  const stripTop = frameTop + frameH + 12 + spare * 0.08;
  const ctrlW = Math.max(frameW, Math.min(W - 24, 360));
  const colX = (c: number) => c * (cellW + gap);
  const rowY = (r: number) => r * (cellW + gap);

  const timing = useCallback((ms: number) => (hurryRef.current || turboRef.current ? Math.round(ms * 0.45) : ms), []);
  const wait = useCallback((ms: number) => new Promise<void>((r) => setTimeout(r, hurryRef.current ? Math.min(ms, 60) : turboRef.current ? ms * 0.45 : ms)), []);

  const setBoard = useCallback((next: BoardCell[]) => {
    cellsRef.current = next;
    if (mountedRef.current) setCells(next);
  }, []);

  const makeCell = useCallback(
    (cell: CandyCell, col: number, row: number, startY: number): BoardCell => ({
      id: idRef.current++,
      s: cell.s,
      m: cell.m,
      col,
      row,
      y: new Animated.Value(startY),
      scale: new Animated.Value(1),
      opacity: new Animated.Value(1),
      lit: false,
    }),
    []
  );

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
    fetchCandyConfig()
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
    return () => {
      mountedRef.current = false;
      loop.stop();
      const players = playersRef.current;
      playersRef.current = null;
      if (players) Object.values(players).forEach((p) => p.remove());
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [pulse]);

  // First board: laid out once the cell size is known.
  const laidOut = useRef(false);
  useEffect(() => {
    if (laidOut.current || cellW <= 0) return;
    laidOut.current = true;
    setBoard(DEMO_GRID.flatMap((col, c) => col.map((cell, r) => makeCell(cell, c, r, rowY(r)))));
    // rowY depends only on the cell size, fixed for the first layout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellW, makeCell, setBoard]);

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
      Animated.timing(popAnim, { toValue: 1, duration: timing(1000), useNativeDriver: true }).start();
    },
    [popAnim, timing]
  );

  // ---------- board animations ----------

  const dropOut = useCallback(async () => {
    const current = cellsRef.current;
    if (current.length === 0) return;
    await run(
      Animated.parallel(
        current.map((c) =>
          Animated.timing(c.y, { toValue: rowY(c.row) + boardH + cellW, duration: timing(260), delay: timing(c.col * 40), easing: Easing.in(Easing.quad), useNativeDriver: true })
        )
      )
    );
    setBoard([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardH, cellW, setBoard, timing]);

  const dropIn = useCallback(
    async (grid: CandyCell[][]) => {
      const fresh = grid.flatMap((col, c) => col.map((cell, r) => makeCell(cell, c, r, rowY(r) - boardH - gap * 2)));
      setBoard(fresh);
      await frame();
      await frame();
      await run(
        Animated.parallel(
          fresh.map((c) =>
            Animated.timing(c.y, {
              toValue: rowY(c.row),
              duration: timing(360),
              delay: timing(c.col * 60 + (ROWS - 1 - c.row) * 20),
              easing: Easing.out(Easing.back(1.2)),
              useNativeDriver: true,
            })
          )
        )
      );
      play('land');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [boardH, makeCell, play, setBoard, timing]
  );

  const resolveStep = useCallback(
    async (step: CandyStep, next: CandyCell[][]) => {
      const key = (c: number, r: number) => `${c},${r}`;
      const burst = new Set(step.burst.map(([c, r]) => key(c, r)));
      const current = cellsRef.current;

      // 1. Winners swell and burst.
      await run(
        Animated.parallel(
          current
            .filter((c) => burst.has(key(c.col, c.row)))
            .map((c) =>
              Animated.sequence([
                Animated.timing(c.scale, { toValue: 1.3, duration: timing(140), useNativeDriver: true }),
                Animated.parallel([
                  Animated.timing(c.scale, { toValue: 0.2, duration: timing(200), useNativeDriver: true }),
                  Animated.timing(c.opacity, { toValue: 0, duration: timing(200), useNativeDriver: true }),
                ]),
              ])
            )
        )
      );

      // 2. Survivors fall; new symbols drop in above them. Every cell then
      // takes the server's symbol for its square, so the board always matches.
      const survivors = current.filter((c) => !burst.has(key(c.col, c.row))).map((c) => ({ ...c, lit: false }));
      const nextCells: BoardCell[] = [];
      for (let col = 0; col < COLS; col++) {
        const colCells = survivors.filter((c) => c.col === col).sort((a, b) => a.row - b.row);
        const start = ROWS - colCells.length;
        colCells.forEach((c, i) => nextCells.push({ ...c, row: start + i, s: next[col][start + i].s, m: next[col][start + i].m }));
        for (let r = 0; r < start; r++) nextCells.push(makeCell(next[col][r], col, r, rowY(r) - start * (cellW + gap) - gap * 2));
      }
      setBoard(nextCells);
      await frame();
      await frame();
      await run(
        Animated.parallel(
          nextCells.map((c) =>
            Animated.timing(c.y, { toValue: rowY(c.row), duration: timing(340), delay: timing(c.col * 35), easing: Easing.out(Easing.back(1.1)), useNativeDriver: true })
          )
        )
      );
      play('land');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cellW, makeCell, play, setBoard, timing]
  );

  /** Plays one round (base game or a free spin) on the board and returns the running total. */
  const playRound = useCallback(
    async (round: CandyRound, stake: number, before: number) => {
      await dropIn(round.steps.length ? round.steps[0].grid : round.final);
      let total = before;
      for (let i = 0; i < round.steps.length; i++) {
        const step = round.steps[i];
        const next = i + 1 < round.steps.length ? round.steps[i + 1].grid : round.final;
        const win = new Set(step.burst.map(([c, r]) => `${c},${r}`));
        setBoard(cellsRef.current.map((c) => ({ ...c, lit: win.has(`${c.col},${c.row}`) })));
        play('tick');
        total = round2(total + stake * step.win);
        setWinTotal(total);
        showPop(`+₹${round2(stake * step.win).toFixed(2)}`, step.wins.map((w) => `${w.count} ${NAME[w.symbol]}`).join(' · '));
        await wait(820);
        await resolveStep(step, next);
      }
      // Bombs multiply the tumble win once the tumbles end.
      if (round.bombTotal > 0) {
        setBoard(cellsRef.current.map((c) => ({ ...c, lit: c.s === 'BOMB' })));
        const bombs = cellsRef.current.filter((c) => c.s === 'BOMB');
        await run(
          Animated.stagger(
            timing(140),
            bombs.map((c) =>
              Animated.sequence([
                Animated.timing(c.scale, { toValue: 1.35, duration: timing(160), useNativeDriver: true }),
                Animated.spring(c.scale, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
              ])
            )
          )
        );
        play('win');
        total = round2(total + stake * round.tumbleWin * (round.bombTotal - 1));
        setWinTotal(total);
        showPop(`x${round.bombTotal}`, `₹${round2(stake * round.tumbleWin).toFixed(2)} × ${round.bombTotal} = ₹${round2(stake * round.tumbleWin * round.bombTotal).toFixed(2)}`);
        await wait(1300);
        setBoard(cellsRef.current.map((c) => ({ ...c, lit: false })));
      }
      if (round.scatterWin > 0) {
        setBoard(cellsRef.current.map((c) => ({ ...c, lit: c.s === 'SCATTER' })));
        play('win');
        total = round2(total + stake * round.scatterWin);
        setWinTotal(total);
        showPop(`+₹${round2(stake * round.scatterWin).toFixed(2)}`, `${round.scatters} lollipops`);
        await wait(1100);
        setBoard(cellsRef.current.map((c) => ({ ...c, lit: false })));
      }
      // Keep the running total exactly in line with the round's result.
      total = round2(before + stake * round.win);
      setWinTotal(total);
      await wait(round.steps.length ? 150 : 0);
      return total;
    },
    [dropIn, play, resolveStep, setBoard, showPop, timing, wait]
  );

  const showBanner = useCallback(
    async (b: Banner, ms: number) => {
      setBanner(b);
      bannerAnim.setValue(0);
      await run(Animated.spring(bannerAnim, { toValue: 1, friction: 6, tension: 70, useNativeDriver: true }));
      await wait(ms);
      await run(Animated.timing(bannerAnim, { toValue: 0, duration: 220, useNativeDriver: true }));
      if (mountedRef.current) setBanner(null);
    },
    [bannerAnim, wait]
  );

  const doSpin = useCallback(async () => {
    if (busyRef.current) {
      hurryRef.current = true;
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
    setPop(null);
    setBigWin(null);
    setShownBalance((b) => round2(b - stake));

    // Remember the board so a failed spin (nothing charged) can put it back.
    const previous: CandyCell[][] = Array.from({ length: COLS }, (_, c) =>
      Array.from({ length: ROWS }, (_, r) => {
        const cell = cellsRef.current.find((x) => x.col === c && x.row === r);
        return cell ? { s: cell.s, m: cell.m } : DEMO_GRID[c][r];
      })
    );
    const clearing = dropOut();
    let result: { spin: CandySpinRow; outcome: CandyOutcome };
    try {
      result = await spinCandy(stake);
      await clearing;
    } catch (err) {
      await clearing;
      setShownBalance((b) => round2(b + stake));
      setAutoLeft(0);
      showToast(errorMessage(err));
      await dropIn(previous);
      busyRef.current = false;
      setBusy(false);
      return;
    }
    if (!mountedRef.current) return;

    const { spin, outcome } = result;
    let total = await playRound(outcome.base, stake, 0);
    if (outcome.freeSpins.length > 0 && mountedRef.current) {
      hurryRef.current = false;
      play('win');
      await showBanner({ title: 'FREE SPINS', sub: `${outcome.freeSpins.length} SPINS · CANDY BOMBS` }, 1300);
      const base = total;
      for (let i = 0; i < outcome.freeSpins.length && mountedRef.current; i++) {
        setFree({ index: i + 1, total: outcome.freeSpins.length, base });
        await dropOut();
        total = await playRound(outcome.freeSpins[i], stake, total);
        await wait(220);
      }
      const freeWin = round2(total - base);
      await showBanner({ title: 'FREE SPINS WIN', sub: `₹${freeWin.toFixed(2)}` }, 1400);
      setFree(null);
    }
    if (!mountedRef.current) return;

    // The server's payout (rounded down, capped) is the one that counts.
    const payout = Number(spin.payout);
    setWinTotal(payout);
    setShownBalance((b) => round2(b + payout));
    busyRef.current = false;
    hurryRef.current = false;
    setBusy(false);
    if (payout > 0) {
      play('win');
      const ratio = payout / stake;
      if (ratio >= 20) {
        setBigWin({ label: ratio >= 100 ? 'SUGAR WIN' : ratio >= 50 ? 'MEGA WIN' : 'BIG WIN', amount: payout });
        bigAnim.setValue(0);
        Animated.spring(bigAnim, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }).start();
      }
    }
    refreshWallet().catch(() => {});

    if (autoRef.current > 0) {
      const nextLeft = autoRef.current - 1;
      setAutoLeft(nextLeft);
      if (nextLeft > 0) {
        const pause = payout <= 0 ? 250 : payout / stake >= 20 ? 2600 : 900;
        setTimeout(() => {
          if (mountedRef.current && autoRef.current > 0) {
            setBigWin(null);
            doSpinRef.current();
          }
        }, turboRef.current ? pause / 2 : pause);
      }
    }
  }, [bigAnim, dropIn, dropOut, play, playRound, refreshWallet, showBanner, showToast, wait]);

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
      fetchCandyHistory(30)
        .then((h) => mountedRef.current && setHistory(h))
        .catch(() => mountedRef.current && setHistory([]));
    }
  };

  const shownWin = free ? round2(winTotal - free.base) : winTotal;

  return (
    <View style={styles.root}>
      <Background w={W} h={H} free={!!free} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 6, height: headerH }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtn} hitSlop={8} accessibilityLabel="Back">
          <MaterialCommunityIcons name="chevron-left" size={26} color={CREAM} />
        </Pressable>
        <View style={styles.headBalance}>
          <MaterialCommunityIcons name="wallet" size={16} color={CREAM} />
          <Text style={styles.headBalanceText} numberOfLines={1}>
            ₹{shownBalance.toFixed(2)}
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        <Pressable onPress={toggleSound} style={styles.headBtn} hitSlop={6} accessibilityLabel="Sound">
          <MaterialCommunityIcons name={soundOn ? 'volume-high' : 'volume-off'} size={20} color={CREAM} />
        </Pressable>
        <Pressable onPress={() => openPanel('history')} style={styles.headBtn} hitSlop={6} accessibilityLabel="My history">
          <MaterialCommunityIcons name="history" size={20} color={CREAM} />
        </Pressable>
        <Pressable onPress={() => openPanel('pay')} style={styles.headBtn} hitSlop={6} accessibilityLabel="Paytable">
          <MaterialCommunityIcons name="information-variant" size={22} color={CREAM} />
        </Pressable>
      </View>

      <View style={{ position: 'absolute', top: logoTop, left: (W - logoW) / 2 }} pointerEvents="none">
        <Logo width={logoW} />
      </View>

      {/* Info row */}
      <View style={[styles.infoRow, { top: infoTop, left: frameLeft, width: frameW, height: infoH }]}>
        {free ? (
          <>
            <View style={styles.freeTag}>
              <Text style={styles.freeTagText}>
                FREE SPIN {free.index}/{free.total}
              </Text>
            </View>
            <View style={styles.infoPill}>
              <CandyArt s="BOMB" m={2} size={20} />
              <Text style={styles.infoText}>BOMBS MULTIPLY WINS</Text>
            </View>
          </>
        ) : (
          <>
            <View style={styles.infoPill}>
              <CandyArt s="SCATTER" size={20} />
              <Text style={styles.infoText}>{config?.scattersToTrigger ?? 4}+ = {config?.freeSpins ?? 10} FREE SPINS</Text>
            </View>
            <View style={styles.infoPill}>
              <Text style={styles.infoText}>TUMBLE WINS</Text>
            </View>
          </>
        )}
      </View>

      {/* Board */}
      <View style={{ position: 'absolute', top: frameTop, left: frameLeft, width: frameW, height: frameH }}>
        <Svg width={frameW} height={frameH} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <Pattern id="cbStripe" width={16} height={16} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <Rect x={0} y={0} width={8} height={16} fill="#FFFFFF" />
              <Rect x={8} y={0} width={8} height={16} fill={free ? '#9C27B0' : '#E91E63'} />
            </Pattern>
            <SvgLinearGradient id="cbWell" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={free ? '#3A1466' : '#FFFFFF'} stopOpacity={free ? 0.94 : 0.9} />
              <Stop offset="1" stopColor={free ? '#1A0636' : '#FFE3F1'} stopOpacity={free ? 0.96 : 0.86} />
            </SvgLinearGradient>
          </Defs>
          <Rect x={0} y={0} width={frameW} height={frameH} rx={16} fill="url(#cbStripe)" />
          <Rect x={5} y={5} width={frameW - 10} height={frameH - 10} rx={12} fill="url(#cbWell)" stroke="#FFFFFF" strokeWidth={1.5} />
        </Svg>
        <View style={{ position: 'absolute', left: pad, top: pad, width: boardW, height: boardH, overflow: 'hidden' }}>
          {cells.map((c) => (
            <Animated.View
              key={c.id}
              style={{
                position: 'absolute',
                left: colX(c.col),
                top: 0,
                width: cellW,
                height: cellW,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: c.opacity,
                transform: [{ translateY: c.y }, { scale: c.scale }],
              }}
            >
              {c.lit && <Animated.View pointerEvents="none" style={[styles.lit, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }]} />}
              <CandyArt s={c.s} m={c.m} size={cellW * 0.9} />
            </Animated.View>
          ))}
        </View>

        {pop && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.pop,
              {
                top: frameH / 2 - 34,
                opacity: popAnim.interpolate({ inputRange: [0, 0.12, 0.78, 1], outputRange: [0, 1, 1, 0] }),
                transform: [{ translateY: popAnim.interpolate({ inputRange: [0, 1], outputRange: [10, -22] }) }, { scale: popAnim.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0.6, 1.05, 1] }) }],
              },
            ]}
          >
            <Text style={styles.popText}>{pop.text}</Text>
            {pop.sub ? (
              <Text style={styles.popSub} numberOfLines={2}>
                {pop.sub}
              </Text>
            ) : null}
          </Animated.View>
        )}
      </View>

      {/* Win strip */}
      <View style={[styles.winStrip, { top: stripTop, left: frameLeft, width: frameW }]}>
        <View style={styles.stripCell}>
          <Text style={styles.stripLabel}>BET</Text>
          <Text style={styles.stripValue}>₹{bet}</Text>
        </View>
        <View style={[styles.stripCell, styles.stripWin]}>
          <Text style={styles.stripLabel}>{free ? 'FREE SPINS WIN' : 'WIN'}</Text>
          <Text style={[styles.stripWinValue, shownWin > 0 && { color: GOLD }]}>₹{shownWin.toFixed(2)}</Text>
        </View>
        <View style={styles.stripCell}>
          <Text style={styles.stripLabel}>PAYS</Text>
          <Text style={styles.stripValue}>8+</Text>
        </View>
      </View>

      {/* Controls */}
      <View style={[styles.controls, { bottom: insets.bottom + 18, left: (W - ctrlW) / 2, width: ctrlW }]}>
        <View style={styles.betBox}>
          <Pressable onPress={() => changeBet(-1)} style={[styles.betBtn, (busy || autoLeft > 0) && styles.dim]} hitSlop={6} accessibilityLabel="Lower bet">
            <MaterialCommunityIcons name="minus" size={20} color="#5A0B35" />
          </Pressable>
          <View style={styles.betValueBox}>
            <Text style={styles.betLabel}>TOTAL BET</Text>
            <Text style={styles.betValue}>₹{bet}</Text>
          </View>
          <Pressable onPress={() => changeBet(1)} style={[styles.betBtn, (busy || autoLeft > 0) && styles.dim]} hitSlop={6} accessibilityLabel="Raise bet">
            <MaterialCommunityIcons name="plus" size={20} color="#5A0B35" />
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
          <LinearGradient colors={autoLeft > 0 ? ['#FF7A8A', '#B3102F'] : ['#FFE0F0', '#FF4FA3', '#B0105E']} style={styles.spinInner}>
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
            <MaterialCommunityIcons name="autorenew" size={16} color={autoLeft > 0 ? '#5A0B35' : CREAM} />
            <Text style={[styles.sideBtnText, autoLeft > 0 && { color: '#5A0B35' }]}>AUTO</Text>
          </Pressable>
          <Pressable onPress={() => setTurbo((t) => !t)} style={[styles.sideBtn, turbo && styles.sideBtnOn]} accessibilityLabel="Turbo">
            <MaterialCommunityIcons name="lightning-bolt" size={16} color={turbo ? '#5A0B35' : CREAM} />
            <Text style={[styles.sideBtnText, turbo && { color: '#5A0B35' }]}>TURBO</Text>
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
            <LinearGradient colors={['#FF4FA3', '#7B1FA2']} style={styles.bannerInner}>
              <CandyArt s="SCATTER" size={54} />
              <Text style={styles.bannerTitle}>{banner.title}</Text>
              <Text style={styles.bannerSub}>{banner.sub}</Text>
            </LinearGradient>
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
              <Defs>
                <SvgLinearGradient id="cbBig" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#FFF8C4" />
                  <Stop offset="0.5" stopColor="#FFC93C" />
                  <Stop offset="1" stopColor="#E0561B" />
                </SvgLinearGradient>
              </Defs>
              <SvgText x={190} y={56} fontSize={50} fontWeight="bold" fill="url(#cbBig)" stroke="#FFFFFF" strokeWidth={2.5} textAnchor="middle" letterSpacing={3}>
                {bigWin.label}
              </SvgText>
            </Svg>
            <Text style={styles.bigAmount}>₹{bigCount.toFixed(2)}</Text>
            <View style={styles.row}>
              {(['GRAPES', 'HEART', 'APPLE'] as CandySym[]).map((s, i) => (
                <View key={i} style={{ marginHorizontal: 4, transform: [{ rotate: `${(i - 1) * 14}deg` }, { translateY: i === 1 ? -8 : 0 }] }}>
                  <CandyArt s={s} size={i === 1 ? 70 : 56} />
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
                <MaterialCommunityIcons name="close" size={20} color={PINK} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 14 }}>
              {panel === 'pay' ? <Paytable paytable={paytable} bet={bet} config={config} /> : <History spins={history} />}
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

function Paytable({ paytable, bet, config }: { paytable: CandyConfig['paytable']; bet: number; config: CandyConfig | null }) {
  const sc = config?.scatterPays ?? [3, 5, 100];
  const bombs = config?.bombValues ?? [2, 100];
  return (
    <View>
      <Text style={styles.ruleHead}>Pays at ₹{bet} bet</Text>
      <View style={styles.payHeader}>
        <Text style={[styles.payHeadText, { flex: 1.1 }]}>SYMBOL</Text>
        <Text style={styles.payHeadText}>8–9</Text>
        <Text style={styles.payHeadText}>10–11</Text>
        <Text style={styles.payHeadText}>12+</Text>
      </View>
      {paytable.map(({ symbol, pays }) => (
        <View key={symbol} style={styles.payRow}>
          <View style={{ flex: 1.1 }}>
            <CandyArt s={symbol} size={34} />
          </View>
          {pays.map((p, i) => (
            <Text key={i} style={styles.payCellText}>
              ₹{round2(p * bet)}
            </Text>
          ))}
        </View>
      ))}
      <Text style={styles.ruleLine}>There are no lines: a symbol wins when {config?.minCount ?? 8} or more of it are anywhere on the board. More of it pays more.</Text>
      <Text style={styles.ruleHead}>Tumble</Text>
      <Text style={styles.ruleLine}>Winning symbols burst, everything above falls down and new symbols drop in. This repeats — and pays again — until nothing wins.</Text>
      <Text style={styles.ruleHead}>Lollipops & free spins</Text>
      <View style={[styles.row, { gap: 10, marginBottom: 4 }]}>
        <CandyArt s="SCATTER" size={40} />
        <Text style={styles.ruleLine}>
          4 = ₹{round2(sc[0] * bet)} · 5 = ₹{round2(sc[1] * bet)} · 6+ = ₹{round2(sc[2] * bet)}
        </Text>
      </View>
      <Text style={styles.ruleLine}>
        {config?.scattersToTrigger ?? 4} or more lollipops (they never burst) give {config?.freeSpins ?? 10} free spins. {config?.scattersToRetrigger ?? 3}+ during free spins add {config?.freeRetrigger ?? 5} more.
      </Text>
      <Text style={styles.ruleHead}>Candy bombs</Text>
      <View style={[styles.row, { gap: 10, marginBottom: 4 }]}>
        <CandyArt s="BOMB" m={5} size={40} />
        <CandyArt s="BOMB" m={25} size={40} />
        <CandyArt s="BOMB" m={100} size={40} />
      </View>
      <Text style={styles.ruleLine}>
        Only in free spins. Each bomb carries a multiplier from {bombs[0]}x to {bombs[bombs.length - 1]}x. When a free spin's tumbles end with a win, all the bombs on the board are added together and multiply that spin's win.
      </Text>
      <Text style={styles.ruleHead}>Game info</Text>
      <Text style={styles.ruleLine}>
        Return to player {config?.rtpPercent ?? 87.62}% (measured over 4.5 million spins). Bet ₹{config?.minStake ?? 1} – ₹{config?.maxStake ?? 500}. Max win per spin ₹{config?.maxPayout ?? 10000}.
      </Text>
      <Text style={styles.ruleLine}>Tap SPIN during a spin to speed it up. Every spin is drawn from your provably-fair seeds (Settings → Provably Fair).</Text>
    </View>
  );
}

function History({ spins }: { spins: CandySpinRow[] | null }) {
  if (spins === null) return <Text style={styles.muted}>Loading…</Text>;
  if (spins.length === 0) return <Text style={styles.muted}>No spins yet.</Text>;
  return (
    <View style={{ gap: 8 }}>
      {spins.map((s) => {
        const payout = Number(s.payout);
        const d = new Date(s.createdAt);
        return (
          <View key={s.id} style={styles.histRow}>
            <CandyArt s={s.freeSpins > 0 ? 'SCATTER' : payout > 0 ? 'HEART' : 'BANANA'} size={30} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.histMain}>
                Bet ₹{Number(s.stake).toFixed(2)} · {s.tumbles} tumble{s.tumbles === 1 ? '' : 's'}
                {s.freeSpins > 0 ? ` · ${s.freeSpins} free spins` : ''}
              </Text>
              <Text style={styles.histSub}>
                {d.toLocaleDateString()} {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            <Text style={[styles.histPay, { color: payout > 0 ? '#16A34A' : 'rgba(90,11,53,0.45)' }]}>{payout > 0 ? `+₹${payout.toFixed(2)}` : '—'}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#7B4BE0' },
  row: { flexDirection: 'row', alignItems: 'center' },
  dim: { opacity: 0.4 },

  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 6, zIndex: 2 },
  headBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(176,16,94,0.55)', borderWidth: 1.2, borderColor: 'rgba(255,255,255,0.7)' },
  headBalance: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: 'rgba(176,16,94,0.6)', borderWidth: 1.2, borderColor: '#FFFFFF' },
  headBalanceText: { color: CREAM, fontWeight: '900', fontSize: 14 },

  infoRow: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  infoPill: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: 10, borderRadius: 15, backgroundColor: 'rgba(90,11,53,0.45)', borderWidth: 1.2, borderColor: 'rgba(255,255,255,0.6)' },
  infoText: { color: CREAM, fontWeight: '900', fontSize: 10.5, letterSpacing: 1 },
  freeTag: { paddingHorizontal: 12, height: 30, borderRadius: 15, justifyContent: 'center', backgroundColor: '#FF4FA3', borderWidth: 1.5, borderColor: '#FFFFFF' },
  freeTagText: { color: '#FFFFFF', fontWeight: '900', fontSize: 11.5, letterSpacing: 1 },

  lit: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12, borderWidth: 2.5, borderColor: GOLD, backgroundColor: 'rgba(255,214,107,0.3)' },
  pop: { position: 'absolute', alignSelf: 'center', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 6, borderRadius: 22, backgroundColor: 'rgba(90,11,53,0.88)', borderWidth: 2, borderColor: '#FFFFFF', maxWidth: '92%' },
  popText: { color: GOLD, fontSize: 28, fontWeight: '900', textShadowColor: '#000', textShadowRadius: 6 },
  popSub: { color: CREAM, fontSize: 12, fontWeight: '800', textAlign: 'center' },

  winStrip: { position: 'absolute', flexDirection: 'row', height: 54, borderRadius: 14, backgroundColor: 'rgba(90,11,53,0.6)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.75)', overflow: 'hidden' },
  stripCell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stripWin: { flex: 1.7, borderLeftWidth: 1, borderRightWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  stripLabel: { color: 'rgba(255,244,250,0.75)', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  stripValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', marginTop: 1 },
  stripWinValue: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', marginTop: 1 },

  controls: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  betBox: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6, borderRadius: 16, backgroundColor: 'rgba(90,11,53,0.6)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.75)' },
  betBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFE0F0' },
  betValueBox: { alignItems: 'center', minWidth: 58 },
  betLabel: { color: 'rgba(255,244,250,0.75)', fontSize: 8.5, fontWeight: '800', letterSpacing: 1 },
  betValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  spinBtn: { width: 92, height: 92, borderRadius: 46, padding: 4, backgroundColor: '#FFFFFF', elevation: 10, shadowColor: PINK, shadowOpacity: 0.8, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } },
  spinInner: { flex: 1, borderRadius: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFE0F0' },
  spinAutoText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14, marginTop: -2 },
  sideBtns: { gap: 8 },
  sideBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 84, height: 34, borderRadius: 12, justifyContent: 'center', backgroundColor: 'rgba(90,11,53,0.6)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.75)' },
  sideBtnOn: { backgroundColor: '#FFE0F0', borderColor: '#FFFFFF' },
  sideBtnText: { color: CREAM, fontWeight: '900', fontSize: 11, letterSpacing: 1 },

  autoPop: { position: 'absolute', padding: 12, borderRadius: 14, backgroundColor: '#8E1A5C', borderWidth: 1.5, borderColor: '#FFFFFF' },
  autoPopTitle: { color: CREAM, fontWeight: '900', fontSize: 11, letterSpacing: 2, textAlign: 'center', marginBottom: 8 },
  autoGrid: { flexDirection: 'row', gap: 8 },
  autoOpt: { width: 46, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)' },
  autoOptText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },

  bannerWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(40,0,30,0.45)' },
  bannerCard: { borderRadius: 22, borderWidth: 3, borderColor: '#FFFFFF', overflow: 'hidden', minWidth: 260 },
  bannerInner: { paddingHorizontal: 28, paddingVertical: 16, alignItems: 'center' },
  bannerTitle: { color: '#FFFFFF', fontSize: 34, fontWeight: '900', letterSpacing: 2, textShadowColor: '#5A0B35', textShadowRadius: 8 },
  bannerSub: { color: '#FFF59D', fontSize: 14, fontWeight: '900', letterSpacing: 1.5, marginTop: 4 },

  bigWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(40,0,30,0.7)', alignItems: 'center', justifyContent: 'center' },
  bigAmount: { color: '#FFFFFF', fontSize: 38, fontWeight: '900', marginVertical: 10, textShadowColor: PINK, textShadowRadius: 12 },

  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(40,0,30,0.55)', alignItems: 'center', justifyContent: 'center' },
  sheet: { borderRadius: 18, backgroundColor: '#FFF4FA', borderWidth: 2, borderColor: PINK, overflow: 'hidden' },
  tabs: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,79,163,0.3)' },
  tab: { paddingHorizontal: 12, paddingVertical: 7, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  tabOn: { backgroundColor: 'rgba(255,79,163,0.14)', borderBottomWidth: 2, borderBottomColor: PINK },
  tabText: { color: 'rgba(90,11,53,0.5)', fontWeight: '900', fontSize: 12, letterSpacing: 1.2 },
  tabTextOn: { color: PINK_DEEP },
  ruleHead: { color: PINK_DEEP, fontWeight: '900', fontSize: 13, letterSpacing: 1, marginTop: 12, marginBottom: 6 },
  ruleLine: { color: '#4A1030', fontSize: 12.5, lineHeight: 19, fontWeight: '600', marginTop: 4, flexShrink: 1 },
  payHeader: { flexDirection: 'row', paddingHorizontal: 8, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(255,79,163,0.3)' },
  payHeadText: { flex: 1, color: 'rgba(90,11,53,0.6)', fontWeight: '900', fontSize: 11, textAlign: 'center' },
  payRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,79,163,0.25)' },
  payCellText: { flex: 1, color: PINK_DEEP, fontWeight: '900', fontSize: 13, textAlign: 'center' },
  muted: { color: 'rgba(90,11,53,0.6)', textAlign: 'center', marginTop: 20, fontWeight: '700' },
  histRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(255,79,163,0.25)' },
  histMain: { color: '#4A1030', fontWeight: '800', fontSize: 12.5 },
  histSub: { color: 'rgba(90,11,53,0.55)', fontWeight: '600', fontSize: 11, marginTop: 2 },
  histPay: { fontWeight: '900', fontSize: 13 },

  toast: { position: 'absolute', alignSelf: 'center', top: '45%', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(40,0,30,0.88)', borderWidth: 1, borderColor: '#FFFFFF' },
  toastText: { color: CREAM, fontSize: 14, fontWeight: '700' },
});
