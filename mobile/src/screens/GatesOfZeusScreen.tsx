import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient as SvgLinearGradient, Path, Polygon, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../api/client';
import { ZeusCell, ZeusConfig, ZeusOutcome, ZeusRound, ZeusSpinRow, ZeusStep, ZeusSym, ZeusSymbol, fetchZeusConfig, fetchZeusHistory, spinZeus } from '../api/backend';
import GameInfoButton from '../components/GameInfoButton';
import { useGameState } from '../state/GameStateContext';

const GOLD = '#FFD66B';
const GOLD_LIGHT = '#FFF4C8';
const GOLD_DEEP = '#A8740E';
const SKY = '#7AC8FF';
const IVORY = '#FFF8EC';
const NAVY = '#0E1A3A';
const SERIF = 'serif';
const COLS = 6;
const ROWS = 5;
const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const DEFAULT_BET = 10;
const SOUND_KEY = 'novaplay:zeus:sound';
const TOAST_MS = 1800;
/** UK rule: a paid spin may not resolve faster than this, press to result. */
const MIN_SPIN_MS = 2500;
const NAME: Record<ZeusSymbol, string> = {
  CROWN: 'Crown',
  HOURGLASS: 'Hourglass',
  RING: 'Ring',
  CHALICE: 'Chalice',
  YELLOW: 'Topaz',
  RED: 'Ruby',
  PURPLE: 'Amethyst',
  GREEN: 'Emerald',
  BLUE: 'Sapphire',
};
const FALLBACK_PAYTABLE: ZeusConfig['paytable'] = [
  { symbol: 'CROWN', pays: [10, 25, 50] },
  { symbol: 'HOURGLASS', pays: [2.5, 10, 25] },
  { symbol: 'RING', pays: [2, 5, 15] },
  { symbol: 'CHALICE', pays: [1.5, 2, 12] },
  { symbol: 'YELLOW', pays: [1, 1.5, 10] },
  { symbol: 'RED', pays: [0.8, 1.2, 8] },
  { symbol: 'PURPLE', pays: [0.5, 1, 5] },
  { symbol: 'GREEN', pays: [0.4, 0.9, 4] },
  { symbol: 'BLUE', pays: [0.25, 0.75, 2] },
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

/** Gem colours [light, main, dark]. */
const GEM: Record<'BLUE' | 'GREEN' | 'PURPLE' | 'RED' | 'YELLOW', [string, string, string]> = {
  BLUE: ['#C8ECFF', '#1E7BE0', '#0A2A6A'],
  GREEN: ['#C8FFD8', '#1EB85A', '#0A4A24'],
  PURPLE: ['#F0C8FF', '#9A3AD8', '#3A0A5A'],
  RED: ['#FFC8C8', '#E0202A', '#6A0408'],
  YELLOW: ['#FFF8C0', '#F0B81A', '#7A4A04'],
};

/** Orb colour by value tier. */
function orbColors(m: number): [string, string, string] {
  if (m >= 100) return ['#FFF2B0', '#FF8A1A', '#8A1A04'];
  if (m >= 20) return ['#FFD0F8', '#C83AD8', '#4A0A5A'];
  if (m >= 6) return ['#D0F0FF', '#2A9AF0', '#0A2A6A'];
  return ['#D8FFD0', '#3AC84A', '#0A4A14'];
}

export const ZeusArt = memo(function ZeusArt({ s, m, size }: { s: ZeusSym; m?: number; size: number }) {
  const u = `zs${s}${useId().replace(/:/g, '')}`;
  let defs: React.ReactNode = null;
  let body: React.ReactNode = null;
  const gold = (
    <SvgLinearGradient id={`${u}gold`} x1="0" y1="0" x2="0" y2="1">
      <Stop offset="0" stopColor={GOLD_LIGHT} />
      <Stop offset="0.45" stopColor={GOLD} />
      <Stop offset="1" stopColor={GOLD_DEEP} />
    </SvgLinearGradient>
  );
  if (s === 'BLUE' || s === 'GREEN' || s === 'PURPLE' || s === 'RED' || s === 'YELLOW') {
    const [l, c, d] = GEM[s];
    defs = (
      <RadialGradient id={`${u}g`} cx="38%" cy="32%" r="75%">
        <Stop offset="0" stopColor={l} />
        <Stop offset="0.55" stopColor={c} />
        <Stop offset="1" stopColor={d} />
      </RadialGradient>
    );
    const shapes: Record<typeof s, React.ReactNode> = {
      // Sapphire: hexagon
      BLUE: (
        <G>
          <Polygon points="50,8 88,30 88,70 50,92 12,70 12,30" fill={`url(#${u}g)`} stroke={d} strokeWidth={2.5} />
          <Polygon points="50,24 74,38 74,62 50,76 26,62 26,38" fill={l} opacity={0.28} />
          <Path d="M50 8 L 50 24 M88 30 L 74 38 M88 70 L 74 62 M50 92 L 50 76 M12 70 L 26 62 M12 30 L 26 38" stroke={l} strokeWidth={1.5} opacity={0.7} />
        </G>
      ),
      // Emerald: octagon step cut
      GREEN: (
        <G>
          <Polygon points="30,8 70,8 92,30 92,70 70,92 30,92 8,70 8,30" fill={`url(#${u}g)`} stroke={d} strokeWidth={2.5} />
          <Polygon points="36,22 64,22 78,36 78,64 64,78 36,78 22,64 22,36" fill="none" stroke={l} strokeWidth={1.5} opacity={0.7} />
          <Rect x={36} y={36} width={28} height={28} fill={l} opacity={0.25} />
        </G>
      ),
      // Amethyst: tall diamond
      PURPLE: (
        <G>
          <Polygon points="50,4 86,50 50,96 14,50" fill={`url(#${u}g)`} stroke={d} strokeWidth={2.5} />
          <Path d="M14 50 L 86 50 M50 4 L 34 50 L 50 96 L 66 50 Z" stroke={l} strokeWidth={1.4} fill="none" opacity={0.7} />
        </G>
      ),
      // Ruby: brilliant, flat top
      RED: (
        <G>
          <Polygon points="24,14 76,14 94,38 50,94 6,38" fill={`url(#${u}g)`} stroke={d} strokeWidth={2.5} />
          <Path d="M6 38 L 94 38 M24 14 L 36 38 L 50 14 L 64 38 L 76 14 M36 38 L 50 94 L 64 38" stroke={l} strokeWidth={1.4} fill="none" opacity={0.7} />
        </G>
      ),
      // Topaz: round brilliant
      YELLOW: (
        <G>
          <Circle cx={50} cy={50} r={42} fill={`url(#${u}g)`} stroke={d} strokeWidth={2.5} />
          <Polygon points="50,22 74,36 74,64 50,78 26,64 26,36" fill="none" stroke={l} strokeWidth={1.5} opacity={0.75} />
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <Line key={a} x1={50 + 28 * Math.cos(((a - 90) * Math.PI) / 180)} y1={50 + 28 * Math.sin(((a - 90) * Math.PI) / 180)} x2={50 + 42 * Math.cos(((a - 60) * Math.PI) / 180)} y2={50 + 42 * Math.sin(((a - 60) * Math.PI) / 180)} stroke={l} strokeWidth={1.2} opacity={0.6} />
          ))}
        </G>
      ),
    };
    body = (
      <G>
        {shapes[s]}
        <Ellipse cx={34} cy={28} rx={10} ry={5} fill="#FFFFFF" opacity={0.6} transform="rotate(-30 34 28)" />
      </G>
    );
  } else if (s === 'CHALICE') {
    defs = gold;
    body = (
      <G>
        <Path d="M18 12 L 82 12 C 82 40, 68 54, 56 58 L 56 74 C 64 76, 72 80, 74 88 L 26 88 C 28 80, 36 76, 44 74 L 44 58 C 32 54, 18 40, 18 12 Z" fill={`url(#${u}gold)`} stroke={GOLD_DEEP} strokeWidth={2.2} />
        <Ellipse cx={50} cy={13} rx={32} ry={5} fill="#5A1A0A" stroke={GOLD_DEEP} strokeWidth={1.5} />
        {[34, 50, 66].map((x, i) => (
          <Circle key={x} cx={x} cy={32} r={4.5} fill={i === 1 ? '#1E7BE0' : '#E0202A'} stroke={GOLD_LIGHT} strokeWidth={1.2} />
        ))}
        <Ellipse cx={32} cy={24} rx={4} ry={9} fill="#FFFFFF" opacity={0.45} />
      </G>
    );
  } else if (s === 'RING') {
    defs = (
      <>
        {gold}
        <RadialGradient id={`${u}e`} cx="38%" cy="32%" r="75%">
          <Stop offset="0" stopColor="#C8FFD8" />
          <Stop offset="0.55" stopColor="#1EB85A" />
          <Stop offset="1" stopColor="#0A4A24" />
        </RadialGradient>
      </>
    );
    body = (
      <G>
        <Ellipse cx={50} cy={62} rx={34} ry={28} fill="none" stroke={`url(#${u}gold)`} strokeWidth={11} />
        <Ellipse cx={50} cy={62} rx={34} ry={28} fill="none" stroke={GOLD_DEEP} strokeWidth={1.2} />
        <Path d="M34 30 L 66 30 L 60 40 L 40 40 Z" fill={`url(#${u}gold)`} stroke={GOLD_DEEP} strokeWidth={1.5} />
        <Polygon points="50,6 68,20 62,34 38,34 32,20" fill={`url(#${u}e)`} stroke="#0A4A24" strokeWidth={2} />
        <Ellipse cx={44} cy={16} rx={5} ry={3} fill="#FFFFFF" opacity={0.6} />
      </G>
    );
  } else if (s === 'HOURGLASS') {
    defs = (
      <>
        {gold}
        <SvgLinearGradient id={`${u}sand`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFE8A0" />
          <Stop offset="1" stopColor="#E0A030" />
        </SvgLinearGradient>
      </>
    );
    body = (
      <G>
        <Rect x={16} y={6} width={68} height={10} rx={3} fill={`url(#${u}gold)`} stroke={GOLD_DEEP} strokeWidth={1.5} />
        <Rect x={16} y={84} width={68} height={10} rx={3} fill={`url(#${u}gold)`} stroke={GOLD_DEEP} strokeWidth={1.5} />
        <Path d="M26 16 L 74 16 C 74 34, 56 44, 54 50 C 56 56, 74 66, 74 84 L 26 84 C 26 66, 44 56, 46 50 C 44 44, 26 34, 26 16 Z" fill="#D8F0FF" opacity={0.45} stroke="#8AB8D8" strokeWidth={1.5} />
        <Path d="M34 26 L 66 26 C 62 36, 52 42, 50 48 C 48 42, 38 36, 34 26 Z" fill={`url(#${u}sand)`} />
        <Path d="M30 84 C 34 72, 46 66, 50 66 C 54 66, 66 72, 70 84 Z" fill={`url(#${u}sand)`} />
        <Line x1={50} y1={48} x2={50} y2={68} stroke="#E0A030" strokeWidth={1.5} />
        {[18, 82].map((x) => (
          <Rect key={x} x={x - 3} y={16} width={6} height={68} fill={`url(#${u}gold)`} stroke={GOLD_DEEP} strokeWidth={1} />
        ))}
      </G>
    );
  } else if (s === 'CROWN') {
    defs = gold;
    body = (
      <G>
        <Path d="M10 34 L 28 54 L 40 18 L 50 46 L 60 18 L 72 54 L 90 34 L 82 80 L 18 80 Z" fill={`url(#${u}gold)`} stroke={GOLD_DEEP} strokeWidth={2.2} strokeLinejoin="round" />
        <Rect x={16} y={78} width={68} height={12} rx={3} fill={`url(#${u}gold)`} stroke={GOLD_DEEP} strokeWidth={2} />
        {[10, 40, 60, 90].map((x, i) => (
          <Circle key={x} cx={x} cy={i === 0 || i === 3 ? 32 : 16} r={5} fill={GOLD_LIGHT} stroke={GOLD_DEEP} strokeWidth={1.2} />
        ))}
        <Circle cx={50} cy={64} r={7} fill="#E0202A" stroke={GOLD_LIGHT} strokeWidth={1.5} />
        <Circle cx={30} cy={66} r={4.5} fill="#1E7BE0" stroke={GOLD_LIGHT} strokeWidth={1.2} />
        <Circle cx={70} cy={66} r={4.5} fill="#1EB85A" stroke={GOLD_LIGHT} strokeWidth={1.2} />
      </G>
    );
  } else if (s === 'SCATTER') {
    defs = (
      <>
        {gold}
        <RadialGradient id={`${u}halo`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.6" stopColor="#8AD8FF" />
          <Stop offset="1" stopColor="#1A4AA8" />
        </RadialGradient>
      </>
    );
    // Zeus: white hair and beard, gold laurel, lightning behind.
    body = (
      <G>
        <Circle cx={50} cy={50} r={47} fill={`url(#${u}halo)`} stroke={`url(#${u}gold)`} strokeWidth={4} />
        <Path d="M78 8 L 64 40 L 76 40 L 60 70" stroke="#FFF8C0" strokeWidth={4} fill="none" strokeLinejoin="round" />
        <Path d="M24 34 C 22 16, 40 8, 50 8 C 60 8, 78 16, 76 34 C 82 44, 80 54, 74 58 L 26 58 C 20 54, 18 44, 24 34 Z" fill="#F4F4FA" stroke="#9AA4B8" strokeWidth={1.5} />
        <Path d="M32 38 C 32 28, 68 28, 68 38 L 68 54 C 68 62, 32 62, 32 54 Z" fill="#F0C8A0" stroke="#A8784A" strokeWidth={1.2} />
        <Path d="M36 42 L 46 41 M54 41 L 64 42" stroke="#4A4A5A" strokeWidth={3} strokeLinecap="round" />
        <Circle cx={41} cy={46} r={1.8} fill="#1A4AA8" />
        <Circle cx={59} cy={46} r={1.8} fill="#1A4AA8" />
        <Path d="M26 56 C 28 80, 42 92, 50 94 C 58 92, 72 80, 74 56 C 66 62, 58 60, 50 62 C 42 60, 34 62, 26 56 Z" fill="#F4F4FA" stroke="#9AA4B8" strokeWidth={1.5} />
        <Path d="M42 66 C 46 70, 54 70, 58 66" stroke="#9AA4B8" strokeWidth={1.5} fill="none" />
        <Path d="M22 30 C 30 22, 40 18, 50 18 C 60 18, 70 22, 78 30" stroke={`url(#${u}gold)`} strokeWidth={4} fill="none" />
        {[28, 38, 50, 62, 72].map((x, i) => (
          <Ellipse key={x} cx={x} cy={i === 2 ? 17 : i % 4 === 0 ? 27 : 20} rx={4} ry={2.5} fill="#7ABA3A" stroke={GOLD_DEEP} strokeWidth={0.6} />
        ))}
        <Rect x={22} y={80} width={56} height={14} rx={7} fill={NAVY} stroke={`url(#${u}gold)`} strokeWidth={2} />
        <SvgText x={50} y={91} fontSize={10} fontWeight="900" fill={GOLD} textAnchor="middle" fontFamily={SERIF} letterSpacing={2}>
          ZEUS
        </SvgText>
      </G>
    );
  } else if (s === 'ORB') {
    const [l, c, d] = orbColors(m ?? 2);
    defs = (
      <RadialGradient id={`${u}o`} cx="38%" cy="32%" r="72%">
        <Stop offset="0" stopColor="#FFFFFF" />
        <Stop offset="0.25" stopColor={l} />
        <Stop offset="0.7" stopColor={c} />
        <Stop offset="1" stopColor={d} />
      </RadialGradient>
    );
    const txt = `${m ?? 2}x`;
    body = (
      <G>
        <Circle cx={50} cy={50} r={46} fill={c} opacity={0.25} />
        <Circle cx={50} cy={50} r={40} fill={`url(#${u}o)`} stroke={GOLD} strokeWidth={3} />
        <Path d="M20 40 L 34 46 L 28 56 L 44 62 M80 34 L 68 44 L 76 52 L 62 62" stroke="#FFFFFF" strokeWidth={1.6} fill="none" opacity={0.75} />
        <Ellipse cx={36} cy={30} rx={10} ry={5} fill="#FFFFFF" opacity={0.6} transform="rotate(-30 36 30)" />
        <SvgText x={51} y={62} fontSize={txt.length > 3 ? 26 : 32} fontWeight="900" fill="#000000" opacity={0.35} textAnchor="middle" fontFamily={SERIF}>
          {txt}
        </SvgText>
        <SvgText x={50} y={60} fontSize={txt.length > 3 ? 26 : 32} fontWeight="900" fill="#FFFFFF" stroke={d} strokeWidth={1.5} textAnchor="middle" fontFamily={SERIF}>
          {txt}
        </SvgText>
      </G>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>{defs}</Defs>
      {body}
    </Svg>
  );
});

// ---------- decoration ----------

/** Olympus: golden cloud sky between marble columns; a stormy night in free spins. */
const Background = memo(function Background({ w, h, free }: { w: number; h: number; free: boolean }) {
  const u = useId().replace(/:/g, '');
  const colW = Math.max(26, w * 0.09);
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id={`zbSky${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={free ? '#0A0A2A' : '#2A4A9A'} />
          <Stop offset="0.45" stopColor={free ? '#2A1A5A' : '#8A9AE0'} />
          <Stop offset="1" stopColor={free ? '#0A0618' : '#F0C88A'} />
        </SvgLinearGradient>
        <SvgLinearGradient id={`zbCol${u}`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#B8B0A8" />
          <Stop offset="0.4" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#9A928A" />
        </SvgLinearGradient>
        <RadialGradient id={`zbGlow${u}`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={free ? '#8AD8FF' : '#FFF4C8'} stopOpacity={0.45} />
          <Stop offset="1" stopColor={free ? '#8AD8FF' : '#FFF4C8'} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill={`url(#zbSky${u})`} />
      <Circle cx={w / 2} cy={h * 0.32} r={Math.max(w, h) * 0.45} fill={`url(#zbGlow${u})`} />
      {/* Clouds */}
      {[
        [0.1, 0.18, 0.22],
        [0.88, 0.12, 0.26],
        [0.5, 0.06, 0.2],
        [0.15, 0.94, 0.3],
        [0.82, 0.96, 0.3],
        [0.5, 1.0, 0.36],
      ].map(([x, y, r], i) => (
        <G key={i} opacity={free ? 0.35 : 0.75}>
          <Circle cx={x * w} cy={y * h} r={r * w * 0.45} fill={free ? '#3A3A6A' : '#FFF4E0'} />
          <Circle cx={x * w - r * w * 0.45} cy={y * h + r * w * 0.12} r={r * w * 0.32} fill={free ? '#2A2A5A' : '#FFE8C8'} />
          <Circle cx={x * w + r * w * 0.45} cy={y * h + r * w * 0.1} r={r * w * 0.34} fill={free ? '#2A2A5A' : '#FFE8C8'} />
        </G>
      ))}
      {free && <Path d={`M${w * 0.78} 0 L ${w * 0.72} ${h * 0.1} L ${w * 0.8} ${h * 0.11} L ${w * 0.7} ${h * 0.24}`} stroke="#BFE8FF" strokeWidth={2.5} fill="none" opacity={0.6} />}
      {/* Marble columns either side */}
      {[0, w - colW].map((x, i) => (
        <G key={i} opacity={free ? 0.55 : 0.95}>
          <Rect x={x + colW * 0.1} y={h * 0.08} width={colW * 0.8} height={h} fill={`url(#zbCol${u})`} />
          {[0.3, 0.5, 0.7].map((t) => (
            <Line key={t} x1={x + colW * t} y1={h * 0.1} x2={x + colW * t} y2={h} stroke="#8A827A" strokeWidth={1} opacity={0.5} />
          ))}
          <Rect x={x} y={h * 0.06} width={colW} height={h * 0.025} fill="#E8E0D8" stroke="#A8A098" strokeWidth={1} />
          <Path d={`M${x} ${h * 0.06} C ${x - 6} ${h * 0.04}, ${x + 4} ${h * 0.02}, ${x + colW * 0.3} ${h * 0.045} M${x + colW} ${h * 0.06} C ${x + colW + 6} ${h * 0.04}, ${x + colW - 4} ${h * 0.02}, ${x + colW * 0.7} ${h * 0.045}`} stroke="#A8A098" strokeWidth={3} fill="none" />
        </G>
      ))}
    </Svg>
  );
});

function Logo({ width }: { width: number }) {
  const u = useId().replace(/:/g, '');
  return (
    <Svg width={width} height={width * 0.24} viewBox="0 0 360 86">
      <Defs>
        <SvgLinearGradient id={`zl${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={GOLD_LIGHT} />
          <Stop offset="0.5" stopColor={GOLD} />
          <Stop offset="1" stopColor={GOLD_DEEP} />
        </SvgLinearGradient>
      </Defs>
      <Path d="M30 14 L 18 40 L 28 40 L 16 70" stroke="#BFE8FF" strokeWidth={4} fill="none" strokeLinejoin="round" />
      <Path d="M330 14 L 342 40 L 332 40 L 344 70" stroke="#BFE8FF" strokeWidth={4} fill="none" strokeLinejoin="round" />
      <SvgText x={182} y={52} fontSize={40} fontWeight="900" fill="#1A1004" opacity={0.6} textAnchor="middle" letterSpacing={2} fontFamily={SERIF}>
        GATES OF ZEUS
      </SvgText>
      <SvgText x={180} y={50} fontSize={40} fontWeight="900" fill={`url(#zl${u})`} stroke="#5A3A04" strokeWidth={1.2} textAnchor="middle" letterSpacing={2} fontFamily={SERIF}>
        GATES OF ZEUS
      </SvgText>
      <SvgText x={180} y={76} fontSize={12} fontWeight="900" fill="#FFFFFF" textAnchor="middle" letterSpacing={4} fontFamily={SERIF}>
        8+ ANYWHERE · MULTIPLIER ORBS
      </SvgText>
    </Svg>
  );
}

function Rays({ size }: { size: number }) {
  const c = size / 2;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id="zbRay" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={GOLD_LIGHT} stopOpacity={0.75} />
          <Stop offset="1" stopColor={GOLD} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={c} cy={c} r={c * 0.45} fill="url(#zbRay)" />
      {Array.from({ length: 16 }, (_, i) => {
        const a0 = ((i * 22.5 - 5) * Math.PI) / 180;
        const a1 = ((i * 22.5 + 5) * Math.PI) / 180;
        return <Path key={i} d={`M ${c} ${c} L ${c + c * Math.cos(a0)} ${c + c * Math.sin(a0)} L ${c + c * Math.cos(a1)} ${c + c * Math.sin(a1)} Z`} fill="url(#zbRay)" />;
      })}
    </Svg>
  );
}

/** A lightning bolt striking down the board. */
function Strike({ w, h, x }: { w: number; h: number; x: number }) {
  const pts = [`${x},0`];
  for (let i = 1; i < 8; i++) pts.push(`${x + (i % 2 ? -1 : 1) * w * 0.06 * (0.6 + (i % 3) * 0.3)},${(h * i) / 8}`);
  pts.push(`${x},${h}`);
  const d = `M${pts.join(' L ')}`;
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Path d={d} stroke="#8AD8FF" strokeWidth={10} fill="none" opacity={0.35} strokeLinejoin="round" />
      <Path d={d} stroke="#FFFFFF" strokeWidth={3} fill="none" strokeLinejoin="round" />
    </Svg>
  );
}

/** Home tile art: Zeus over gold clouds with an orb and the crown. */
export function GatesOfZeusTileArt({ size }: { size: number }) {
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size }} pointerEvents="none">
      <Background w={size} h={size} free={false} />
      <View style={{ position: 'absolute', left: size * 0.2, top: size * 0.04 }}>
        <ZeusArt s="SCATTER" size={size * 0.6} />
      </View>
      <View style={{ position: 'absolute', left: size * 0.04, top: size * 0.46 }}>
        <ZeusArt s="ORB" m={100} size={size * 0.3} />
      </View>
      <View style={{ position: 'absolute', left: size * 0.66, top: size * 0.46 }}>
        <ZeusArt s="CROWN" size={size * 0.3} />
      </View>
    </View>
  );
}

// ---------- board ----------

type BoardCell = {
  id: number;
  s: ZeusSym;
  m?: number;
  col: number;
  row: number;
  y: Animated.Value;
  scale: Animated.Value;
  opacity: Animated.Value;
  lit: boolean;
};

const DEMO_GRID: ZeusCell[][] = [
  [{ s: 'CROWN' }, { s: 'GREEN' }, { s: 'BLUE' }, { s: 'RED' }, { s: 'CHALICE' }],
  [{ s: 'YELLOW' }, { s: 'SCATTER' }, { s: 'HOURGLASS' }, { s: 'PURPLE' }, { s: 'BLUE' }],
  [{ s: 'RING' }, { s: 'BLUE' }, { s: 'ORB', m: 10 }, { s: 'GREEN' }, { s: 'YELLOW' }],
  [{ s: 'RED' }, { s: 'CHALICE' }, { s: 'PURPLE' }, { s: 'CROWN' }, { s: 'GREEN' }],
  [{ s: 'BLUE' }, { s: 'YELLOW' }, { s: 'RING' }, { s: 'SCATTER' }, { s: 'HOURGLASS' }],
  [{ s: 'PURPLE' }, { s: 'HOURGLASS' }, { s: 'RED' }, { s: 'BLUE' }, { s: 'RING' }],
];

type Banner = { title: string; sub: string };
type BigWin = { label: string; amount: number };
type Pop = { text: string; sub?: string; key: number };

export default function GatesOfZeusScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<ZeusConfig | null>(null);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [busy, setBusy] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [shownBalance, setShownBalance] = useState(coins);
  const [cells, setCells] = useState<BoardCell[]>([]);
  const [free, setFree] = useState<{ index: number; total: number; base: number; mult: number } | null>(null);
  const [winTotal, setWinTotal] = useState(0);
  const [result, setResult] = useState<'win' | 'return' | null>(null);
  const [pop, setPop] = useState<Pop | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [bigWin, setBigWin] = useState<BigWin | null>(null);
  const [bigCount, setBigCount] = useState(0);
  const [strike, setStrike] = useState<number | null>(null);
  const [panel, setPanel] = useState<'pay' | 'history' | null>(null);
  const [history, setHistory] = useState<ZeusSpinRow[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sessionNet, setSessionNet] = useState(0);
  const [now, setNow] = useState(Date.now());

  const cellsRef = useRef<BoardCell[]>([]);
  const idRef = useRef(1);
  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const betRef = useRef(bet);
  betRef.current = bet;
  const balanceRef = useRef(shownBalance);
  balanceRef.current = shownBalance;
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;
  const sessionStart = useRef(Date.now());
  const playersRef = useRef<{ tick: AudioPlayer; win: AudioPlayer; land: AudioPlayer } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const popAnim = useRef(new Animated.Value(0)).current;
  const bannerAnim = useRef(new Animated.Value(0)).current;
  const bigAnim = useRef(new Animated.Value(0)).current;
  const raysSpin = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;

  const paytable = config?.paytable ?? FALLBACK_PAYTABLE;
  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const betLevels = useMemo(() => BET_LEVELS.filter((b) => b >= minStake && b <= maxStake), [minStake, maxStake]);

  // ---------- layout ----------
  const pad = 8;
  const gap = 3;
  const headerH = insets.top + 50;
  const logoW = Math.min(W * 0.84, 340);
  const logoH = logoW * 0.24;
  const infoH = 30;
  const controlsH = 92;
  const stripH = 54;
  const sessionH = 26;
  const availH = H - headerH - insets.bottom - 18 - controlsH - stripH - logoH - infoH - sessionH - 60;
  const cellW = Math.floor(Math.min((Math.min(W - 20, 470) - pad * 2 - gap * (COLS - 1)) / COLS, (availH - pad * 2 - gap * (ROWS - 1)) / ROWS));
  const boardW = cellW * COLS + gap * (COLS - 1);
  const boardH = cellW * ROWS + gap * (ROWS - 1);
  const frameW = boardW + pad * 2;
  const frameH = boardH + pad * 2;
  const frameLeft = (W - frameW) / 2;
  const spare = Math.max(0, H - insets.bottom - 18 - controlsH - headerH - (logoH + 6 + infoH + 6 + frameH + 12 + stripH + 6 + sessionH));
  const logoTop = headerH + spare * 0.4;
  const infoTop = logoTop + logoH + 6;
  const frameTop = infoTop + infoH + 6;
  const stripTop = frameTop + frameH + 12 + spare * 0.08;
  const sessionTop = stripTop + stripH + 6;
  const ctrlW = Math.max(frameW, Math.min(W - 24, 360));
  const colX = (c: number) => c * (cellW + gap);
  const rowY = (r: number) => r * (cellW + gap);

  const wait = useCallback((ms: number) => new Promise<void>((r) => setTimeout(r, ms)), []);

  const setBoard = useCallback((next: BoardCell[]) => {
    cellsRef.current = next;
    if (mountedRef.current) setCells(next);
  }, []);

  const makeCell = useCallback(
    (cell: ZeusCell, col: number, row: number, startY: number): BoardCell => ({
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
    fetchZeusConfig()
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
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      mountedRef.current = false;
      loop.stop();
      clearInterval(clock);
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
      Animated.timing(popAnim, { toValue: 1, duration: 1000, useNativeDriver: true }).start();
    },
    [popAnim]
  );

  /** Zeus strikes the board: a bolt and a white flash. */
  const zap = useCallback(
    async (x: number) => {
      setStrike(x);
      flash.setValue(0);
      await run(
        Animated.sequence([
          Animated.timing(flash, { toValue: 1, duration: 70, useNativeDriver: true }),
          Animated.timing(flash, { toValue: 0.2, duration: 90, useNativeDriver: true }),
          Animated.timing(flash, { toValue: 0.8, duration: 60, useNativeDriver: true }),
          Animated.timing(flash, { toValue: 0, duration: 260, useNativeDriver: true }),
        ])
      );
      if (mountedRef.current) setStrike(null);
    },
    [flash]
  );

  // ---------- board animations ----------

  const dropOut = useCallback(async () => {
    const current = cellsRef.current;
    if (current.length === 0) return;
    await run(
      Animated.parallel(
        current.map((c) => Animated.timing(c.y, { toValue: rowY(c.row) + boardH + cellW, duration: 260, delay: c.col * 40, easing: Easing.in(Easing.quad), useNativeDriver: true }))
      )
    );
    setBoard([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardH, cellW, setBoard]);

  const dropIn = useCallback(
    async (grid: ZeusCell[][]) => {
      const fresh = grid.flatMap((col, c) => col.map((cell, r) => makeCell(cell, c, r, rowY(r) - boardH - gap * 2)));
      setBoard(fresh);
      await frame();
      await frame();
      await run(
        Animated.parallel(
          fresh.map((c) =>
            Animated.timing(c.y, { toValue: rowY(c.row), duration: 360, delay: c.col * 60 + (ROWS - 1 - c.row) * 20, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true })
          )
        )
      );
      play('land');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [boardH, makeCell, play, setBoard]
  );

  const resolveStep = useCallback(
    async (step: ZeusStep, next: ZeusCell[][]) => {
      const key = (c: number, r: number) => `${c},${r}`;
      const burst = new Set(step.burst.map(([c, r]) => key(c, r)));
      const current = cellsRef.current;

      // 1. Winners flare and are struck away.
      await run(
        Animated.parallel(
          current
            .filter((c) => burst.has(key(c.col, c.row)))
            .map((c) =>
              Animated.sequence([
                Animated.timing(c.scale, { toValue: 1.3, duration: 140, useNativeDriver: true }),
                Animated.parallel([Animated.timing(c.scale, { toValue: 0.2, duration: 200, useNativeDriver: true }), Animated.timing(c.opacity, { toValue: 0, duration: 200, useNativeDriver: true })]),
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
          nextCells.map((c) => Animated.timing(c.y, { toValue: rowY(c.row), duration: 340, delay: c.col * 35, easing: Easing.out(Easing.back(1.1)), useNativeDriver: true }))
        )
      );
      play('land');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cellW, makeCell, play, setBoard]
  );

  /** Plays one round (base game or a free spin) on the board and returns the running total. */
  const playRound = useCallback(
    async (round: ZeusRound, stake: number, before: number, inFree: boolean) => {
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
      // Orbs multiply the tumble win once the tumbles end (in free spins, by the running total).
      if (round.orbTotal > 0) {
        setBoard(cellsRef.current.map((c) => ({ ...c, lit: c.s === 'ORB' })));
        const orbs = cellsRef.current.filter((c) => c.s === 'ORB');
        for (const o of orbs) {
          void zap(pad + colX(o.col) + cellW / 2);
          await run(
            Animated.sequence([
              Animated.timing(o.scale, { toValue: 1.4, duration: 160, useNativeDriver: true }),
              Animated.spring(o.scale, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
            ])
          );
        }
        if (inFree) setFree((f) => (f ? { ...f, mult: round.multiplier } : f));
        total = round2(total + stake * round.tumbleWin * (round.multiplier - 1));
        setWinTotal(total);
        showPop(
          `x${round.multiplier}`,
          `${inFree && round.multiplier !== round.orbTotal ? `total x${round.multiplier} · ` : ''}₹${round2(stake * round.tumbleWin).toFixed(2)} × ${round.multiplier} = ₹${round2(stake * round.tumbleWin * round.multiplier).toFixed(2)}`
        );
        await wait(1300);
        setBoard(cellsRef.current.map((c) => ({ ...c, lit: false })));
      }
      if (round.scatterWin > 0) {
        setBoard(cellsRef.current.map((c) => ({ ...c, lit: c.s === 'SCATTER' })));
        total = round2(total + stake * round.scatterWin);
        setWinTotal(total);
        showPop(`+₹${round2(stake * round.scatterWin).toFixed(2)}`, `${round.scatters} Zeus scatters`);
        await wait(1100);
        setBoard(cellsRef.current.map((c) => ({ ...c, lit: false })));
      }
      // Keep the running total exactly in line with the round's result.
      total = round2(before + stake * round.win);
      setWinTotal(total);
      await wait(round.steps.length ? 150 : 0);
      return total;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cellW, dropIn, play, resolveStep, setBoard, showPop, wait, zap]
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
    if (busyRef.current) return;
    const stake = betRef.current;
    if (stake > balanceRef.current) {
      showToast('Insufficient balance');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setWinTotal(0);
    setResult(null);
    setPop(null);
    setBigWin(null);
    setShownBalance((b) => round2(b - stake));
    const t0 = Date.now();

    // Remember the board so a failed spin (nothing charged) can put it back.
    const previous: ZeusCell[][] = Array.from({ length: COLS }, (_, c) =>
      Array.from({ length: ROWS }, (_, r) => {
        const cell = cellsRef.current.find((x) => x.col === c && x.row === r);
        return cell ? { s: cell.s, m: cell.m } : DEMO_GRID[c][r];
      })
    );
    const clearing = dropOut();
    let res: { spin: ZeusSpinRow; outcome: ZeusOutcome };
    try {
      res = await spinZeus(stake);
      await clearing;
    } catch (err) {
      await clearing;
      setShownBalance((b) => round2(b + stake));
      showToast(errorMessage(err));
      await dropIn(previous);
      busyRef.current = false;
      setBusy(false);
      return;
    }
    if (!mountedRef.current) return;

    // The new board lands no sooner than a second into the spin.
    await wait(Math.max(0, 1000 - (Date.now() - t0)));
    const { spin, outcome } = res;
    let total = await playRound(outcome.base, stake, 0, false);
    if (outcome.freeSpins.length > 0 && mountedRef.current) {
      await zap(W / 2);
      await showBanner({ title: 'FREE SPINS', sub: `${outcome.freeSpins.length} SPINS · MULTIPLIERS ADD UP` }, 1400);
      const base = total;
      for (let i = 0; i < outcome.freeSpins.length && mountedRef.current; i++) {
        setFree((f) => ({ index: i + 1, total: outcome.freeSpins.length, base, mult: f?.mult ?? 0 }));
        await dropOut();
        total = await playRound(outcome.freeSpins[i], stake, total, true);
        await wait(220);
      }
      const freeWin = round2(total - base);
      await showBanner({ title: 'FREE SPINS WIN', sub: `₹${freeWin.toFixed(2)}${outcome.finalMultiplier > 0 ? ` · TOTAL x${outcome.finalMultiplier}` : ''}` }, 1500);
      setFree(null);
    }
    if (!mountedRef.current) return;
    // UK rule: no paid spin resolves in under MIN_SPIN_MS.
    await wait(Math.max(0, MIN_SPIN_MS - (Date.now() - t0)));

    // The server's payout (rounded down, capped) is the one that counts.
    const payout = Number(spin.payout);
    setWinTotal(payout);
    setShownBalance((b) => round2(b + payout));
    setSessionNet((n) => round2(n + payout - stake));
    // Only a return above the stake is celebrated; a smaller one is shown plainly.
    setResult(payout > stake ? 'win' : payout > 0 ? 'return' : null);
    if (payout > stake) {
      play('win');
      const ratio = payout / stake;
      if (ratio >= 20) {
        setBigWin({ label: ratio >= 100 ? 'EPIC WIN' : ratio >= 50 ? 'MEGA WIN' : 'BIG WIN', amount: payout });
        bigAnim.setValue(0);
        Animated.spring(bigAnim, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }).start();
      }
    }
    refreshWallet().catch(() => {});
    busyRef.current = false;
    setBusy(false);
  }, [W, bigAnim, dropIn, dropOut, play, playRound, refreshWallet, showBanner, showToast, wait, zap]);

  const changeBet = (dir: 1 | -1) => {
    if (busy) return;
    const i = betLevels.indexOf(bet);
    const next = betLevels[Math.max(0, Math.min(betLevels.length - 1, (i < 0 ? betLevels.indexOf(DEFAULT_BET) : i) + dir))];
    if (next !== undefined) setBet(next);
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
      fetchZeusHistory(30)
        .then((h) => mountedRef.current && setHistory(h))
        .catch(() => mountedRef.current && setHistory([]));
    }
  };

  const shownWin = free ? round2(winTotal - free.base) : winTotal;
  const minutes = Math.floor((now - sessionStart.current) / 60000);
  const seconds = Math.floor(((now - sessionStart.current) % 60000) / 1000);

  return (
    <View style={styles.root}>
      <Background w={W} h={H} free={!!free} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 6, height: headerH }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtn} hitSlop={8} accessibilityLabel="Back">
          <MaterialCommunityIcons name="chevron-left" size={26} color={GOLD_LIGHT} />
        </Pressable>
        <View style={styles.headBalance}>
          <MaterialCommunityIcons name="wallet" size={16} color={GOLD} />
          <Text style={styles.headBalanceText} numberOfLines={1}>
            ₹{shownBalance.toFixed(2)}
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        <Pressable onPress={toggleSound} style={styles.headBtn} hitSlop={6} accessibilityLabel="Sound">
          <MaterialCommunityIcons name={soundOn ? 'volume-high' : 'volume-off'} size={20} color={GOLD_LIGHT} />
        </Pressable>
        <Pressable onPress={() => openPanel('history')} style={styles.headBtn} hitSlop={6} accessibilityLabel="My history">
          <MaterialCommunityIcons name="history" size={20} color={GOLD_LIGHT} />
        </Pressable>
        <Pressable onPress={() => openPanel('pay')} style={styles.headBtn} hitSlop={6} accessibilityLabel="Paytable">
          <MaterialCommunityIcons name="information-variant" size={22} color={GOLD_LIGHT} />
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
            <Animated.View style={[styles.multTag, free.mult > 0 && { transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }] }]}>
              <ZeusArt s="ORB" m={2} size={20} />
              <Text style={styles.multTagText}>TOTAL x{free.mult}</Text>
            </Animated.View>
          </>
        ) : (
          <>
            <View style={styles.infoPill}>
              <ZeusArt s="SCATTER" size={20} />
              <Text style={styles.infoText}>
                {config?.scattersToTrigger ?? 4}+ = {config?.freeSpins ?? 15} FREE SPINS
              </Text>
            </View>
            <View style={styles.infoPill}>
              <ZeusArt s="ORB" m={10} size={20} />
              <Text style={styles.infoText}>UP TO 500x</Text>
            </View>
          </>
        )}
      </View>

      {/* Board in a gold-and-marble temple frame */}
      <View style={{ position: 'absolute', top: frameTop, left: frameLeft, width: frameW, height: frameH }}>
        <Svg width={frameW} height={frameH} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <SvgLinearGradient id="zbFrame" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={GOLD_LIGHT} />
              <Stop offset="0.5" stopColor={GOLD} />
              <Stop offset="1" stopColor={GOLD_DEEP} />
            </SvgLinearGradient>
            <SvgLinearGradient id="zbWell" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={free ? '#1A1A4A' : '#1E3A7A'} stopOpacity={0.94} />
              <Stop offset="1" stopColor={free ? '#0A0A22' : '#0E1A3A'} stopOpacity={0.96} />
            </SvgLinearGradient>
          </Defs>
          <Rect x={0} y={0} width={frameW} height={frameH} rx={10} fill="url(#zbFrame)" />
          <Rect x={3} y={3} width={frameW - 6} height={frameH - 6} rx={8} fill="#EDE6DC" />
          <Rect x={6} y={6} width={frameW - 12} height={frameH - 12} rx={6} fill="url(#zbWell)" stroke={GOLD} strokeWidth={1.2} />
          {/* Greek key along the top and bottom of the marble */}
          {[1.5, frameH - 4.5].map((y) =>
            Array.from({ length: Math.floor(frameW / 12) }, (_, i) => <Path key={`${y}-${i}`} d={`M${8 + i * 12} ${y + 3} L ${8 + i * 12} ${y} L ${14 + i * 12} ${y} L ${14 + i * 12} ${y + 3}`} stroke={GOLD_DEEP} strokeWidth={0.8} fill="none" opacity={0.5} />)
          )}
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
              <ZeusArt s={c.s} m={c.m} size={cellW * 0.9} />
            </Animated.View>
          ))}
        </View>
        {strike !== null && (
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: flash }]}>
            <Strike w={frameW} h={frameH} x={strike} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(220,240,255,0.25)', borderRadius: 10 }]} />
          </Animated.View>
        )}

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
          <Text style={styles.stripLabel}>{free ? 'FREE SPINS WIN' : result === 'return' ? 'RETURNED' : 'WIN'}</Text>
          <Text style={[styles.stripWinValue, (result === 'win' || (busy && shownWin > 0)) && { color: GOLD }]}>₹{shownWin.toFixed(2)}</Text>
        </View>
        <View style={styles.stripCell}>
          <Text style={styles.stripLabel}>{free ? 'MULTIPLIER' : 'PAYS'}</Text>
          <Text style={[styles.stripValue, free && free.mult > 0 && { color: SKY }]}>{free ? `x${free.mult}` : '8+'}</Text>
        </View>
      </View>

      {/* Session (UK: time played and net position, always on show) */}
      <View style={[styles.session, { top: sessionTop, left: frameLeft, width: frameW, height: sessionH }]}>
        <MaterialCommunityIcons name="timer-outline" size={14} color="#D8E0F0" />
        <Text style={styles.sessionText}>
          Session {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </Text>
        <Text style={styles.sessionSep}>·</Text>
        <Text style={[styles.sessionText, { color: sessionNet > 0 ? '#7CFF9A' : sessionNet < 0 ? '#FF9AA6' : '#D8E0F0' }]}>
          Net {sessionNet >= 0 ? '+' : '−'}₹{Math.abs(sessionNet).toFixed(2)}
        </Text>
      </View>

      {/* Controls: no autoplay or turbo (UK) */}
      <View style={[styles.controls, { bottom: insets.bottom + 18, left: (W - ctrlW) / 2, width: ctrlW }]}>
        <View style={styles.betBox}>
          <Pressable onPress={() => changeBet(-1)} style={[styles.betBtn, busy && styles.dim]} hitSlop={6} accessibilityLabel="Lower bet">
            <MaterialCommunityIcons name="minus" size={20} color={NAVY} />
          </Pressable>
          <View style={styles.betValueBox}>
            <Text style={styles.betLabel}>TOTAL BET</Text>
            <Text style={styles.betValue}>₹{bet}</Text>
          </View>
          <Pressable onPress={() => changeBet(1)} style={[styles.betBtn, busy && styles.dim]} hitSlop={6} accessibilityLabel="Raise bet">
            <MaterialCommunityIcons name="plus" size={20} color={NAVY} />
          </Pressable>
        </View>
        <Pressable onPress={doSpin} disabled={busy} style={({ pressed }) => [styles.spinBtn, pressed && { transform: [{ scale: 0.95 }] }]} accessibilityLabel="Spin">
          <LinearGradient colors={busy ? ['#8A8A9A', '#4A4A5A'] : [GOLD_LIGHT, GOLD, GOLD_DEEP]} style={styles.spinInner}>
            <MaterialCommunityIcons name={busy ? 'dots-horizontal' : 'lightning-bolt'} size={40} color={busy ? '#E0E0E8' : NAVY} />
            {!busy && <Text style={styles.spinText}>SPIN</Text>}
          </LinearGradient>
        </Pressable>
        <View style={styles.sideInfo}>
          <Text style={styles.sideInfoLabel}>MAX WIN</Text>
          <Text style={styles.sideInfoValue}>{config?.maxWinX ?? 5000}x</Text>
          <GameInfoButton compact>
            RTP {config ? `${config.rtpPercent}%` : '88%'} · max win {config?.maxWinX ?? 5000}x per spin{'\n'}
            No autoplay or turbo · each paid spin takes at least 2.5 seconds · provably fair
          </GameInfoButton>
        </View>
      </View>

      {banner && (
        <View pointerEvents="none" style={styles.bannerWrap}>
          <Animated.View style={[styles.bannerCard, { opacity: bannerAnim, transform: [{ scale: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }]}>
            <LinearGradient colors={['#1E3A8A', '#0A1030']} style={styles.bannerInner}>
              <ZeusArt s="SCATTER" size={64} />
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
            <ZeusArt s="SCATTER" size={110} />
            <Svg width={Math.min(W * 0.92, 380)} height={72} viewBox="0 0 380 72">
              <Defs>
                <SvgLinearGradient id="zbBig" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={GOLD_LIGHT} />
                  <Stop offset="0.5" stopColor={GOLD} />
                  <Stop offset="1" stopColor={GOLD_DEEP} />
                </SvgLinearGradient>
              </Defs>
              <SvgText x={190} y={56} fontSize={50} fontWeight="900" fill="url(#zbBig)" stroke="#3A2404" strokeWidth={2} textAnchor="middle" letterSpacing={3} fontFamily={SERIF}>
                {bigWin.label}
              </SvgText>
            </Svg>
            <Text style={styles.bigAmount}>₹{bigCount.toFixed(2)}</Text>
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
                <MaterialCommunityIcons name="close" size={20} color={GOLD_DEEP} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 14 }}>{panel === 'pay' ? <Paytable paytable={paytable} bet={bet} config={config} /> : <History spins={history} />}</ScrollView>
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

function Paytable({ paytable, bet, config }: { paytable: ZeusConfig['paytable']; bet: number; config: ZeusConfig | null }) {
  const sc = config?.scatterPays ?? [3, 5, 100];
  const orbs = config?.orbValues ?? [2, 500];
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
            <ZeusArt s={symbol} size={34} />
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
      <Text style={styles.ruleLine}>Winning symbols are struck away, everything above falls and new symbols drop in. This repeats — and pays again — until nothing wins.</Text>
      <Text style={styles.ruleHead}>Multiplier orbs</Text>
      <View style={[styles.row, { gap: 10, marginBottom: 4 }]}>
        <ZeusArt s="ORB" m={5} size={40} />
        <ZeusArt s="ORB" m={25} size={40} />
        <ZeusArt s="ORB" m={100} size={40} />
        <ZeusArt s="ORB" m={500} size={40} />
      </View>
      <Text style={styles.ruleLine}>
        Orbs from {orbs[0]}x to {orbs[orbs.length - 1]}x can land on any spin. When a spin's tumbles end with a win, all the orbs on the board are added together and multiply that spin's win.
      </Text>
      <Text style={styles.ruleHead}>Zeus & free spins</Text>
      <View style={[styles.row, { gap: 10, marginBottom: 4 }]}>
        <ZeusArt s="SCATTER" size={40} />
        <Text style={styles.ruleLine}>
          4 = ₹{round2(sc[0] * bet)} · 5 = ₹{round2(sc[1] * bet)} · 6+ = ₹{round2(sc[2] * bet)}
        </Text>
      </View>
      <Text style={styles.ruleLine}>
        {config?.scattersToTrigger ?? 4} or more Zeus scatters give {config?.freeSpins ?? 15} free spins; {config?.scattersToRetrigger ?? 3}+ during free spins add {config?.freeRetrigger ?? 5} more. In free spins the orbs build a TOTAL multiplier: every winning spin with orbs adds them to the total, and that spin's win is multiplied by the whole total.
      </Text>
      <Text style={styles.ruleHead}>Game info</Text>
      <Text style={styles.ruleLine}>
        Return to player {config?.rtpPercent ?? 88}% (measured over 60 million simulated spins). Bet ₹{config?.minStake ?? 1} – ₹{config?.maxStake ?? 500}. Max win {config?.maxWinX ?? 5000}x the bet, and ₹{config?.maxPayout ?? 10000} per spin.
      </Text>
      <Text style={styles.ruleLine}>No autoplay or turbo; each paid spin takes at least 2.5 seconds. Every spin is drawn from your provably-fair seeds (Settings → Provably Fair).</Text>
    </View>
  );
}

function History({ spins }: { spins: ZeusSpinRow[] | null }) {
  if (spins === null) return <Text style={styles.muted}>Loading…</Text>;
  if (spins.length === 0) return <Text style={styles.muted}>No spins yet.</Text>;
  return (
    <View style={{ gap: 8 }}>
      {spins.map((s) => {
        const payout = Number(s.payout);
        const d = new Date(s.createdAt);
        return (
          <View key={s.id} style={styles.histRow}>
            <ZeusArt s={s.freeSpins > 0 ? 'SCATTER' : payout > 0 ? 'CROWN' : 'BLUE'} size={30} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.histMain}>
                Bet ₹{Number(s.stake).toFixed(2)} · {s.tumbles} tumble{s.tumbles === 1 ? '' : 's'}
                {s.freeSpins > 0 ? ` · ${s.freeSpins} free spins${s.finalMultiplier > 0 ? ` (x${s.finalMultiplier})` : ''}` : ''}
              </Text>
              <Text style={styles.histSub}>
                {d.toLocaleDateString()} {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            <Text style={[styles.histPay, { color: payout > 0 ? '#16A34A' : 'rgba(14,26,58,0.45)' }]}>{payout > 0 ? `+₹${payout.toFixed(2)}` : '—'}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1E2A5A' },
  row: { flexDirection: 'row', alignItems: 'center' },
  dim: { opacity: 0.4 },

  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 6, zIndex: 2 },
  headBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(14,26,58,0.7)', borderWidth: 1.2, borderColor: GOLD },
  headBalance: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: 'rgba(14,26,58,0.75)', borderWidth: 1.2, borderColor: GOLD },
  headBalanceText: { color: GOLD_LIGHT, fontWeight: '900', fontSize: 14 },

  infoRow: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  infoPill: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: 10, borderRadius: 15, backgroundColor: 'rgba(14,26,58,0.7)', borderWidth: 1.2, borderColor: GOLD },
  infoText: { color: GOLD_LIGHT, fontWeight: '900', fontSize: 10.5, letterSpacing: 1, fontFamily: SERIF },
  freeTag: { paddingHorizontal: 12, height: 30, borderRadius: 15, justifyContent: 'center', backgroundColor: '#1E3A8A', borderWidth: 1.5, borderColor: GOLD },
  freeTagText: { color: '#FFFFFF', fontWeight: '900', fontSize: 11.5, letterSpacing: 1 },
  multTag: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: GOLD, borderWidth: 1.5, borderColor: GOLD_LIGHT },
  multTagText: { color: NAVY, fontWeight: '900', fontSize: 13, letterSpacing: 1 },

  lit: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 10, borderWidth: 2.5, borderColor: GOLD, backgroundColor: 'rgba(255,214,107,0.3)' },
  pop: { position: 'absolute', alignSelf: 'center', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(14,26,58,0.92)', borderWidth: 2, borderColor: GOLD, maxWidth: '92%' },
  popText: { color: GOLD, fontSize: 28, fontWeight: '900', fontFamily: SERIF, textShadowColor: '#000', textShadowRadius: 6 },
  popSub: { color: IVORY, fontSize: 12, fontWeight: '800', textAlign: 'center' },

  winStrip: { position: 'absolute', flexDirection: 'row', height: 54, borderRadius: 12, backgroundColor: 'rgba(14,26,58,0.8)', borderWidth: 1.5, borderColor: GOLD, overflow: 'hidden' },
  stripCell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stripWin: { flex: 1.7, borderLeftWidth: 1, borderRightWidth: 1, borderColor: 'rgba(255,214,107,0.4)' },
  stripLabel: { color: 'rgba(255,244,200,0.75)', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  stripValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', marginTop: 1 },
  stripWinValue: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', marginTop: 1, fontFamily: SERIF },

  session: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, backgroundColor: 'rgba(14,26,58,0.55)' },
  sessionText: { color: '#D8E0F0', fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sessionSep: { color: '#8A92A8', fontSize: 12 },

  controls: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  betBox: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6, borderRadius: 14, backgroundColor: 'rgba(14,26,58,0.8)', borderWidth: 1.5, borderColor: GOLD },
  betBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: GOLD },
  betValueBox: { alignItems: 'center', minWidth: 58 },
  betLabel: { color: 'rgba(255,244,200,0.75)', fontSize: 8.5, fontWeight: '800', letterSpacing: 1 },
  betValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  spinBtn: { width: 92, height: 92, borderRadius: 46, padding: 4, backgroundColor: GOLD_LIGHT, elevation: 10, shadowColor: GOLD, shadowOpacity: 0.9, shadowRadius: 16, shadowOffset: { width: 0, height: 0 } },
  spinInner: { flex: 1, borderRadius: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  spinText: { color: NAVY, fontWeight: '900', fontSize: 12, letterSpacing: 3, marginTop: -4, fontFamily: SERIF },
  sideInfo: { width: 84, alignItems: 'center', paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(14,26,58,0.75)', borderWidth: 1.5, borderColor: GOLD },
  sideInfoLabel: { color: 'rgba(255,244,200,0.7)', fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  sideInfoValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },

  bannerWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(4,8,30,0.5)' },
  bannerCard: { borderRadius: 18, borderWidth: 3, borderColor: GOLD, overflow: 'hidden', minWidth: 260 },
  bannerInner: { paddingHorizontal: 28, paddingVertical: 16, alignItems: 'center' },
  bannerTitle: { color: GOLD, fontSize: 32, fontWeight: '900', letterSpacing: 2, fontFamily: SERIF, textShadowColor: '#000', textShadowRadius: 8 },
  bannerSub: { color: '#BFE8FF', fontSize: 13, fontWeight: '900', letterSpacing: 1.5, marginTop: 4 },

  bigWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(4,8,30,0.75)', alignItems: 'center', justifyContent: 'center' },
  bigAmount: { color: '#FFFFFF', fontSize: 38, fontWeight: '900', marginVertical: 10, fontFamily: SERIF, textShadowColor: GOLD, textShadowRadius: 12 },

  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(4,8,30,0.6)', alignItems: 'center', justifyContent: 'center' },
  sheet: { borderRadius: 16, backgroundColor: IVORY, borderWidth: 2, borderColor: GOLD_DEEP, overflow: 'hidden' },
  tabs: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(168,116,14,0.35)' },
  tab: { paddingHorizontal: 12, paddingVertical: 7, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  tabOn: { backgroundColor: 'rgba(255,214,107,0.25)', borderBottomWidth: 2, borderBottomColor: GOLD_DEEP },
  tabText: { color: 'rgba(14,26,58,0.5)', fontWeight: '900', fontSize: 12, letterSpacing: 1.2 },
  tabTextOn: { color: NAVY },
  ruleHead: { color: GOLD_DEEP, fontWeight: '900', fontSize: 13, letterSpacing: 1, marginTop: 12, marginBottom: 6, fontFamily: SERIF },
  ruleLine: { color: '#1A2440', fontSize: 12.5, lineHeight: 19, fontWeight: '600', marginTop: 4, flexShrink: 1 },
  payHeader: { flexDirection: 'row', paddingHorizontal: 8, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(168,116,14,0.35)' },
  payHeadText: { flex: 1, color: 'rgba(14,26,58,0.6)', fontWeight: '900', fontSize: 11, textAlign: 'center' },
  payRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(168,116,14,0.3)' },
  payCellText: { flex: 1, color: NAVY, fontWeight: '900', fontSize: 13, textAlign: 'center' },
  muted: { color: 'rgba(14,26,58,0.6)', textAlign: 'center', marginTop: 20, fontWeight: '700' },
  histRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(168,116,14,0.3)' },
  histMain: { color: '#1A2440', fontWeight: '800', fontSize: 12.5 },
  histSub: { color: 'rgba(14,26,58,0.55)', fontWeight: '600', fontSize: 11, marginTop: 2 },
  histPay: { fontWeight: '900', fontSize: 13 },

  toast: { position: 'absolute', alignSelf: 'center', top: '45%', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(4,8,30,0.9)', borderWidth: 1, borderColor: GOLD },
  toastText: { color: IVORY, fontSize: 14, fontWeight: '700' },
});
