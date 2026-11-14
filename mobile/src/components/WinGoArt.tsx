import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';

/** The drawn parts of Win Go (screens/WinGoScreen, also used by Trx Win): balls, clocks, wallet, timer digits. */

export type BallTone = 'GREEN' | 'RED' | 'VIOLET';

export const TONE: Record<BallTone, { light: string; mid: string; dark: string }> = {
  GREEN: { light: '#86F2B6', mid: '#20B661', dark: '#0A7537' },
  RED: { light: '#FFA3AE', mid: '#F0445A', dark: '#B0122A' },
  VIOLET: { light: '#E3BCFF', mid: '#A559E6', dark: '#6623A8' },
};

/** A number's colours: 0 is red and violet, 5 green and violet, the rest red (even) or green (odd). */
export function ballTones(n: number): BallTone[] {
  if (n === 0) return ['RED', 'VIOLET'];
  if (n === 5) return ['GREEN', 'VIOLET'];
  return n % 2 === 0 ? ['RED'] : ['GREEN'];
}

const SERIF = 'serif';

/** Where the chip marks go round a ball's rim (in the 100 x 100 drawing). */
const RIM_MARKS = Array.from({ length: 8 }, (_, i) => {
  const deg = i * 45 + 22.5;
  const a = (deg * Math.PI) / 180;
  return { x: 50 + 39.5 * Math.cos(a), y: 49 + 39.5 * Math.sin(a), deg: deg + 90 };
});

/** A glossy 3D number ball: coloured shell with chip marks, white face, the number in its colours. 0 and 5 are split with violet. */
export const NumberBall = memo(function NumberBall({ n, size }: { n: number; size: number }) {
  const tones = ballTones(n);
  const a = TONE[tones[0]];
  const b = TONE[tones[1] ?? tones[0]];
  const id = `wgb${n}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={`${id}a`} cx="34%" cy="26%" r="82%">
          <Stop offset="0" stopColor={a.light} />
          <Stop offset="0.52" stopColor={a.mid} />
          <Stop offset="1" stopColor={a.dark} />
        </RadialGradient>
        <RadialGradient id={`${id}b`} cx="66%" cy="26%" r="82%">
          <Stop offset="0" stopColor={b.light} />
          <Stop offset="0.52" stopColor={b.mid} />
          <Stop offset="1" stopColor={b.dark} />
        </RadialGradient>
        <RadialGradient id={`${id}f`} cx="50%" cy="38%" r="62%">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.78" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#E3E7E5" />
        </RadialGradient>
        <LinearGradient id={`${id}t`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0.35" stopColor={tones.length > 1 ? a.mid : a.light} />
          <Stop offset={tones.length > 1 ? '0.6' : '1'} stopColor={tones.length > 1 ? b.mid : a.dark} />
        </LinearGradient>
        <RadialGradient id={`${id}g`} cx="50%" cy="0%" r="72%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.8} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={50} cy={95.5} rx={30} ry={3.6} fill="#000000" fillOpacity={0.13} />
      {tones.length === 1 ? (
        <Circle cx={50} cy={49} r={46} fill={`url(#${id}a)`} />
      ) : (
        <G>
          <Path d="M 50 3 A 46 46 0 0 0 50 95 Z" fill={`url(#${id}a)`} />
          <Path d="M 50 3 A 46 46 0 0 1 50 95 Z" fill={`url(#${id}b)`} />
        </G>
      )}
      {RIM_MARKS.map((m, i) => (
        <Rect key={i} x={m.x - 3.4} y={m.y - 6.5} width={6.8} height={13} rx={3.4} fill="#FFFFFF" fillOpacity={0.6} rotation={m.deg} origin={`${m.x}, ${m.y}`} />
      ))}
      <Circle cx={50} cy={49} r={30.5} fill="#000000" fillOpacity={0.12} />
      <Circle cx={50} cy={48} r={29.5} fill={`url(#${id}f)`} />
      <SvgText x={50} y={62} fontSize={41} fontWeight="bold" fontFamily={SERIF} fill={`url(#${id}t)`} textAnchor="middle">
        {String(n)}
      </SvgText>
      <Ellipse cx={50} cy={21} rx={29} ry={13} fill={`url(#${id}g)`} />
    </Svg>
  );
});

function starPath(cx: number, cy: number, R: number): string {
  let d = '';
  for (let k = 0; k < 10; k++) {
    const ang = -Math.PI / 2 + (k * Math.PI) / 5;
    const rad = k % 2 === 0 ? R : R * 0.42;
    d += `${k === 0 ? 'M' : 'L'} ${(cx + rad * Math.cos(ang)).toFixed(2)} ${(cy + rad * Math.sin(ang)).toFixed(2)} `;
  }
  return `${d}Z`;
}

/** A ⭐ House result in place of a number ball: a gold ball with a star. */
export const HouseBall = memo(function HouseBall({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id="wghb" cx="34%" cy="26%" r="82%">
          <Stop offset="0" stopColor="#FFF0B3" />
          <Stop offset="0.5" stopColor="#FFC93D" />
          <Stop offset="1" stopColor="#C77A00" />
        </RadialGradient>
        <RadialGradient id="wghg" cx="50%" cy="0%" r="72%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.8} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={50} cy={95.5} rx={30} ry={3.6} fill="#000000" fillOpacity={0.13} />
      <Circle cx={50} cy={49} r={46} fill="url(#wghb)" />
      {RIM_MARKS.map((m, i) => (
        <Rect key={i} x={m.x - 3.4} y={m.y - 6.5} width={6.8} height={13} rx={3.4} fill="#FFFFFF" fillOpacity={0.6} rotation={m.deg} origin={`${m.x}, ${m.y}`} />
      ))}
      <Circle cx={50} cy={48} r={29.5} fill="#FFFFFF" />
      <Path d={starPath(50, 50, 21)} fill="#E59A12" />
      <Ellipse cx={50} cy={21} rx={29} ry={13} fill="url(#wghg)" />
    </Svg>
  );
});

/** The 3D clock on a duration tab: grey, or glowing green when it is the one picked. */
export const ClockIcon = memo(function ClockIcon({ on, size }: { on: boolean; size: number }) {
  const id = on ? 'wgcOn' : 'wgcOff';
  const body = on ? ['#9BF5C2', '#2DC06F', '#0C7638'] : ['#FAFBFB', '#CBD2CF', '#8E9894'];
  const face = on ? ['#48D688', '#0F8443'] : ['#C2C9C6', '#7D8883'];
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={`${id}b`} cx="34%" cy="24%" r="86%">
          <Stop offset="0" stopColor={body[0]} />
          <Stop offset="0.5" stopColor={body[1]} />
          <Stop offset="1" stopColor={body[2]} />
        </RadialGradient>
        <RadialGradient id={`${id}f`} cx="45%" cy="35%" r="70%">
          <Stop offset="0" stopColor={face[0]} />
          <Stop offset="1" stopColor={face[1]} />
        </RadialGradient>
        <RadialGradient id={`${id}g`} cx="50%" cy="0%" r="75%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.85} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {on && <Circle cx={50} cy={51} r={49} fill="#46D98A" fillOpacity={0.28} />}
      <Ellipse cx={50} cy={95} rx={30} ry={3.5} fill="#000000" fillOpacity={0.12} />
      <Circle cx={50} cy={50} r={44} fill={`url(#${id}b)`} />
      <Circle cx={50} cy={51} r={32} fill={`url(#${id}f)`} stroke="#FFFFFF" strokeOpacity={0.95} strokeWidth={3.5} />
      {[0, 90, 180, 270].map((deg) => {
        const t = (deg * Math.PI) / 180;
        return <Circle key={deg} cx={50 + 24 * Math.sin(t)} cy={51 - 24 * Math.cos(t)} r={2.6} fill="#FFFFFF" fillOpacity={0.9} />;
      })}
      <Line x1={50} y1={51} x2={50} y2={32} stroke="#FFFFFF" strokeWidth={5.5} strokeLinecap="round" />
      <Line x1={50} y1={51} x2={64} y2={59} stroke="#FFFFFF" strokeWidth={5.5} strokeLinecap="round" />
      <Circle cx={50} cy={51} r={5} fill="#FFFFFF" />
      <Ellipse cx={50} cy={22} rx={28} ry={12} fill={`url(#${id}g)`} />
    </Svg>
  );
});

/** A green wallet, for the balance card. */
export const WalletIcon = memo(function WalletIcon({ size }: { size: number }) {
  return (
    <Svg width={size} height={size * 0.82} viewBox="0 0 100 82">
      <Defs>
        <LinearGradient id="wgw" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#3FC57E" />
          <Stop offset="1" stopColor="#157B40" />
        </LinearGradient>
        <LinearGradient id="wgwc" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#1E9150" />
          <Stop offset="1" stopColor="#0E6534" />
        </LinearGradient>
      </Defs>
      <Path d="M 14 24 L 58 6 Q 66 3 69 10 L 74 22 Z" fill="#8BE6B3" />
      <Rect x={4} y={20} width={86} height={58} rx={11} fill="url(#wgw)" />
      <Rect x={58} y={38} width={38} height={24} rx={9} fill="url(#wgwc)" />
      <Circle cx={71} cy={50} r={5.5} fill="#FFFFFF" />
      <Rect x={12} y={27} width={40} height={6} rx={3} fill="#FFFFFF" fillOpacity={0.25} />
    </Svg>
  );
});

/** One digit of the countdown: a white tile with its top-right corner cut off. */
export const DigitBox = memo(function DigitBox({ char, width, height, color }: { char: string; width: number; height: number; color: string }) {
  const cut = Math.min(width, height) * 0.3;
  const r = 4;
  const d = `M ${r} 0 H ${width - cut} L ${width} ${cut} V ${height - r} Q ${width} ${height} ${width - r} ${height} H ${r} Q 0 ${height} 0 ${height - r} V ${r} Q 0 0 ${r} 0 Z`;
  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Path d={d} fill="#F6FFF9" />
      </Svg>
      <View style={styles.digitCenter}>
        <Text allowFontScaling={false} style={[styles.digitText, { color, fontSize: height * 0.68, lineHeight: height }]}>
          {char}
        </Text>
      </View>
    </View>
  );
});

/** A result number in its colour, as in the history table (0 and 5 shade into violet). */
export const ResultNumber = memo(function ResultNumber({ n, size }: { n: number; size: number }) {
  const tones = ballTones(n);
  if (tones.length === 1) {
    return (
      <Text allowFontScaling={false} style={[styles.resultText, { fontSize: size, lineHeight: size * 1.2, color: TONE[tones[0]].mid }]}>
        {n}
      </Text>
    );
  }
  const a = TONE[tones[0]].mid;
  const b = TONE[tones[1]].mid;
  const w = size * 0.75;
  const h = size * 1.2;
  return (
    <Svg width={w} height={h}>
      <Defs>
        <LinearGradient id={`wgr${n}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0.42" stopColor={a} />
          <Stop offset="0.62" stopColor={b} />
        </LinearGradient>
      </Defs>
      <SvgText x={w / 2} y={h * 0.82} fontSize={size} fontWeight="bold" fontFamily={SERIF} fill={`url(#wgr${n})`} textAnchor="middle">
        {String(n)}
      </SvgText>
    </Svg>
  );
});

const styles = StyleSheet.create({
  digitCenter: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  digitText: { fontFamily: SERIF, fontWeight: '900', textAlign: 'center' },
  resultText: { fontFamily: SERIF, fontWeight: '900', textAlign: 'center' },
});
