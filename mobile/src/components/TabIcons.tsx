import React from 'react';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * The tab bar's icons, drawn here as gold pictures with a dark edge and a highlight (no image files):
 * a house, a trophy, a crown, coins and the gift box of the middle button. A selected tab's icon
 * (`active`) gets its red parts; the others stay all gold.
 */
type IconProps = { size: number; active?: boolean };

const EDGE = '#4E2503';
const RED_EDGE = '#4A0309';

/** The gold, deep gold and accent (red when active, bronze otherwise) fills; ids end in `k`, one per icon and state. */
function Fills({ k, active }: { k: string; active: boolean }) {
  return (
    <Defs>
      <LinearGradient id={`g${k}`} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#FFF7CC" />
        <Stop offset="0.38" stopColor="#FFD75E" />
        <Stop offset="0.72" stopColor="#F2A72B" />
        <Stop offset="1" stopColor="#B56F14" />
      </LinearGradient>
      <LinearGradient id={`d${k}`} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#F4B840" />
        <Stop offset="1" stopColor="#9A5A0C" />
      </LinearGradient>
      {active ? (
        <LinearGradient id={`a${k}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FF9C9C" />
          <Stop offset="0.45" stopColor="#EC2B42" />
          <Stop offset="1" stopColor="#8E0B19" />
        </LinearGradient>
      ) : (
        <LinearGradient id={`a${k}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#E7AE4E" />
          <Stop offset="1" stopColor="#8A5410" />
        </LinearGradient>
      )}
    </Defs>
  );
}

/** A four-point sparkle centred on (cx, cy). */
function sparkle(cx: number, cy: number, s: number) {
  const q = s * 0.18;
  return `M${cx} ${cy - s} Q${cx + q} ${cy - q} ${cx + s} ${cy} Q${cx + q} ${cy + q} ${cx} ${cy + s} Q${cx - q} ${cy + q} ${cx - s} ${cy} Q${cx - q} ${cy - q} ${cx} ${cy - s} Z`;
}

const HOUSE_ROOF = 'M5.5 24 L24 7.2 L42.5 24';

export function HomeIcon({ size, active = false }: IconProps) {
  const k = active ? 'H1' : 'H0';
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Fills k={k} active={active} />
      <Rect x={31} y={9.5} width={4.6} height={8} fill={`url(#d${k})`} stroke={EDGE} strokeWidth={1.3} />
      <Path d="M10.5 23 L24 11 L37.5 23 V39.8 C37.5 41 36.5 42 35.3 42 H12.7 C11.5 42 10.5 41 10.5 39.8 Z" fill={`url(#g${k})`} stroke={EDGE} strokeWidth={1.3} strokeLinejoin="round" />
      <Path d="M20 42 V32 C20 29.8 21.8 28 24 28 C26.2 28 28 29.8 28 32 V42 Z" fill={active ? '#6A0D18' : '#6B3F0A'} stroke={EDGE} strokeWidth={1} />
      <Circle cx={26.1} cy={35.6} r={0.95} fill="#FFE38A" />
      <Path d={HOUSE_ROOF} fill="none" stroke={active ? RED_EDGE : EDGE} strokeWidth={7.2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d={HOUSE_ROOF} fill="none" stroke={`url(#a${k})`} strokeWidth={4.6} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M8.6 21.9 L24 8" fill="none" stroke="#FFFFFF" strokeOpacity={0.5} strokeWidth={1.1} strokeLinecap="round" />
      <Path d="M13.7 26 V37.5" fill="none" stroke="#FFFFFF" strokeOpacity={0.55} strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

const CUP_HANDLE_LEFT = 'M15 11 H9.2 C9.2 17.8 11.2 21 16 22';
const CUP_HANDLE_RIGHT = 'M33 11 H38.8 C38.8 17.8 36.8 21 32 22';
const CUP_STAR = 'M24 12 L25.35 15.54 L29.14 15.73 L26.19 18.11 L27.17 21.77 L24 19.7 L20.83 21.77 L21.81 18.11 L18.86 15.73 L22.65 15.54 Z';

export function TrophyIcon({ size, active = false }: IconProps) {
  const k = active ? 'T1' : 'T0';
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Fills k={k} active={active} />
      <G fill="none" strokeLinecap="round">
        <Path d={CUP_HANDLE_LEFT} stroke={EDGE} strokeWidth={4.6} />
        <Path d={CUP_HANDLE_LEFT} stroke={`url(#g${k})`} strokeWidth={2.2} />
        <Path d={CUP_HANDLE_RIGHT} stroke={EDGE} strokeWidth={4.6} />
        <Path d={CUP_HANDLE_RIGHT} stroke={`url(#g${k})`} strokeWidth={2.2} />
      </G>
      <Rect x={12} y={38.6} width={24} height={4.4} rx={1.6} fill={`url(#d${k})`} stroke={EDGE} strokeWidth={1.3} />
      <Path d="M17.5 33 H30.5 L32.5 39 H15.5 Z" fill={`url(#g${k})`} stroke={EDGE} strokeWidth={1.3} strokeLinejoin="round" />
      <Rect x={21.3} y={27.5} width={5.4} height={6.2} fill={`url(#d${k})`} stroke={EDGE} strokeWidth={1.3} />
      <Path d="M13.5 7 H34.5 V15.5 C34.5 23.8 29.8 28.8 24 28.8 C18.2 28.8 13.5 23.8 13.5 15.5 Z" fill={`url(#g${k})`} stroke={EDGE} strokeWidth={1.3} strokeLinejoin="round" />
      <Rect x={12.3} y={5.6} width={23.4} height={3.6} rx={1.6} fill={`url(#g${k})`} stroke={EDGE} strokeWidth={1.3} />
      <Path d={CUP_STAR} fill={`url(#a${k})`} stroke={active ? RED_EDGE : EDGE} strokeWidth={0.9} strokeLinejoin="round" />
      <Path d="M17.2 11.4 V15.8 C17.2 19.2 18.3 21.8 20 23.6" fill="none" stroke="#FFFFFF" strokeOpacity={0.7} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

export function CrownIcon({ size, active = false }: IconProps) {
  const k = active ? 'C1' : 'C0';
  const accentEdge = active ? RED_EDGE : EDGE;
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Fills k={k} active={active} />
      <Path d="M8.2 33.5 L5.6 15 L15.8 22.6 L24 9.4 L32.2 22.6 L42.4 15 L39.8 33.5 Z" fill={`url(#g${k})`} stroke={EDGE} strokeWidth={1.3} strokeLinejoin="round" />
      <Circle cx={5.6} cy={13.8} r={2.7} fill={`url(#g${k})`} stroke={EDGE} strokeWidth={1.2} />
      <Circle cx={42.4} cy={13.8} r={2.7} fill={`url(#g${k})`} stroke={EDGE} strokeWidth={1.2} />
      <Circle cx={24} cy={8} r={3.2} fill={`url(#a${k})`} stroke={accentEdge} strokeWidth={1.1} />
      <Rect x={7.6} y={33} width={32.8} height={7.4} rx={2.2} fill={`url(#d${k})`} stroke={EDGE} strokeWidth={1.3} />
      <Circle cx={24} cy={36.7} r={2.1} fill={`url(#a${k})`} stroke={accentEdge} strokeWidth={0.8} />
      <Circle cx={15} cy={36.7} r={1.5} fill="#FFF2B8" />
      <Circle cx={33} cy={36.7} r={1.5} fill="#FFF2B8" />
      <Path d="M24 19.2 L27.6 25 L24 30.8 L20.4 25 Z" fill={`url(#a${k})`} stroke={accentEdge} strokeWidth={0.9} strokeLinejoin="round" />
      <Path d="M9.4 19 L10.7 29.5" fill="none" stroke="#FFFFFF" strokeOpacity={0.6} strokeWidth={1.3} strokeLinecap="round" />
      <Path d="M23.2 21.8 L22 25" fill="none" stroke="#FFFFFF" strokeOpacity={0.7} strokeWidth={0.8} strokeLinecap="round" />
    </Svg>
  );
}

/** The rupee sign of the app's typeface, as a shape (centred on the coin below). */
const RUPEE =
  'M26.05 20.67V18.09H28.98Q29.91 18.09 30.28 17.67Q30.66 17.26 30.66 16.68Q30.66 16.1 30.28 15.68Q29.91 15.26 28.98 15.26H26.05V13.64H35.05V15.26H31.91L32.36 14.35Q33.17 14.77 33.64 15.56Q34.11 16.35 34.11 17.19Q34.11 18.29 33.55 19.07Q32.98 19.84 31.94 20.25Q30.91 20.67 29.48 20.67Z' +
  'M30.67 23.8 L28.04 19.67H31.66L34.33 23.8Z' +
  'M26.05 17.26V15.64H35.05V17.26Z';

/** One coin of the pile, its top face at height y. */
function PileCoin({ k, y }: { k: string; y: number }) {
  return (
    <>
      <Path d={`M6 ${y} A9.5 3.3 0 0 0 25 ${y} V${y + 3.6} A9.5 3.3 0 0 1 6 ${y + 3.6} Z`} fill={`url(#d${k})`} stroke={EDGE} strokeWidth={1.2} strokeLinejoin="round" />
      <Ellipse cx={15.5} cy={y} rx={9.5} ry={3.3} fill={`url(#g${k})`} stroke={EDGE} strokeWidth={1.2} />
    </>
  );
}

export function EarnIcon({ size, active = false }: IconProps) {
  const k = active ? 'E1' : 'E0';
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Fills k={k} active={active} />
      <PileCoin k={k} y={38.6} />
      <PileCoin k={k} y={34.2} />
      <PileCoin k={k} y={29.8} />
      <Circle cx={30.5} cy={18.6} r={12.6} fill={`url(#g${k})`} stroke={EDGE} strokeWidth={1.3} />
      <Circle cx={30.5} cy={18.6} r={9.5} fill="none" stroke="#B56F14" strokeWidth={1.1} />
      <Path d={RUPEE} fill={active ? '#8E0B19' : '#6B3A06'} />
      <Path d="M22.4 13.4 A9.6 9.6 0 0 1 30 9" fill="none" stroke="#FFFFFF" strokeOpacity={0.75} strokeWidth={1.5} strokeLinecap="round" />
      {active ? <Path d={sparkle(43, 6, 3.4)} fill="#FFF7CC" /> : null}
    </Svg>
  );
}

/** The middle button: a red gift box with a gold ribbon and bow. */
export function GiftIcon({ size }: { size: number }) {
  const k = 'G';
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Fills k={k} active />
      <Defs>
        <LinearGradient id="giftLid" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFB0B0" />
          <Stop offset="0.5" stopColor="#F23A50" />
          <Stop offset="1" stopColor="#A80F20" />
        </LinearGradient>
      </Defs>
      <Rect x={12} y={31} width={40} height={25} rx={3.5} fill={`url(#a${k})`} stroke={RED_EDGE} strokeWidth={1.4} />
      <Rect x={12.7} y={32.5} width={38.6} height={4.5} fill="#000000" fillOpacity={0.2} />
      <Rect x={27.5} y={31} width={9} height={25} fill={`url(#g${k})`} stroke={EDGE} strokeWidth={1} />
      <Rect x={8.5} y={22.5} width={47} height={10.5} rx={3.5} fill="url(#giftLid)" stroke={RED_EDGE} strokeWidth={1.4} />
      <Rect x={27} y={22.5} width={10} height={10.5} fill={`url(#g${k})`} stroke={EDGE} strokeWidth={1} />
      <Path d="M32 22.5 C27 8.5 10.5 9.5 13 17.5 C14.8 23 26 23.4 32 22.5 Z" fill={`url(#g${k})`} stroke={EDGE} strokeWidth={1.3} strokeLinejoin="round" />
      <Path d="M32 22.5 C37 8.5 53.5 9.5 51 17.5 C49.2 23 38 23.4 32 22.5 Z" fill={`url(#g${k})`} stroke={EDGE} strokeWidth={1.3} strokeLinejoin="round" />
      <Path d="M28.4 20.4 C25.5 14.6 17.6 14 17.8 17.2 C18 19.8 24.5 20.7 28.4 20.4 Z" fill="#A8630F" />
      <Path d="M35.6 20.4 C38.5 14.6 46.4 14 46.2 17.2 C46 19.8 39.5 20.7 35.6 20.4 Z" fill="#A8630F" />
      <Rect x={28} y={17.5} width={8} height={7.5} rx={2.4} fill={`url(#g${k})`} stroke={EDGE} strokeWidth={1.2} />
      <Path d="M12.5 26.2 H24" fill="none" stroke="#FFFFFF" strokeOpacity={0.55} strokeWidth={1.6} strokeLinecap="round" />
      <Path d="M16 39.5 V51" fill="none" stroke="#FFFFFF" strokeOpacity={0.35} strokeWidth={1.6} strokeLinecap="round" />
      <Path d={sparkle(55, 10, 4.6)} fill="#FFF7CC" />
      <Path d={sparkle(8, 12.5, 3.4)} fill="#FFF7CC" />
      <Path d={sparkle(58, 40, 2.6)} fill="#FFE38A" />
    </Svg>
  );
}

/** A soft gold light behind a selected icon. */
export function IconGlow({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id="tabGlow" cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0" stopColor="#FFC850" stopOpacity={0.6} />
          <Stop offset="0.55" stopColor="#FFC850" stopOpacity={0.18} />
          <Stop offset="1" stopColor="#FFC850" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={50} cy={50} r={50} fill="url(#tabGlow)" />
    </Svg>
  );
}
