import React, { memo, useMemo } from 'react';
import { Animated, Image, ImageSourcePropType, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';
import { RingKey, RingSegment } from '../../api/backend';
import TapPressable from '../../components/TapPressable';

/*
 * The wheel of Ring Gauntlet. The plate (scripts/art/ringgauntlet/plate.js) is a picture; everything that moves is drawn live on top of
 * it in the same 380 x 380 units: the lit arcs, the numbers on the segments, the shape badges and, in the middle, what the screen puts
 * there (the reel of sentinels, RingReel.tsx).
 *
 * The lit arc, the red of a failed segment and the glow of a win follow Animated values (the screen runs them): only those few SVG
 * properties change as they move, never the rest of the wheel or of the screen, so they run smoothly on any phone. The arc is one full
 * circle per layer, shown up to the lit angle with a dash.
 */

export const C = 190;
export const TRACK: Record<RingKey, { r0: number; r1: number; n: number }> = {
  OUTER: { r0: 141, r1: 177, n: 8 },
  MIDDLE: { r0: 99, r1: 135, n: 6 },
  INNER: { r0: 62, r1: 93, n: 4 },
};
export const RING_ORDER: RingKey[] = ['OUTER', 'MIDDLE', 'INNER'];
export const RING_COLOR: Record<RingKey, { main: string; light: string; dark: string; ink: string; glow: string }> = {
  OUTER: { main: '#FFC82E', light: '#FFE88A', dark: '#8A5A00', ink: '#2B1A00', glow: '#FFB400' },
  MIDDLE: { main: '#2EE86A', light: '#A6FFC4', dark: '#0B6B2C', ink: '#03210E', glow: '#18D058' },
  INNER: { main: '#2AA8FF', light: '#A8DEFF', dark: '#0A4C8A', ink: '#FFFFFF', glow: '#1C8CFF' },
};
const AnimatedPath = Animated.createAnimatedComponent(Path);

export const SHAPE_OF: Record<RingKey, 'SQUARE' | 'TRIANGLE' | 'CIRCLE'> = { OUTER: 'SQUARE', MIDDLE: 'TRIANGLE', INNER: 'CIRCLE' };
export const RING_NAME: Record<RingKey, string> = { OUTER: 'Outer ring', MIDDLE: 'Middle ring', INNER: 'Inner ring' };
export const RING_HINT: Record<RingKey, string> = { OUTER: 'wildest', MIDDLE: 'balanced', INNER: 'steadiest' };

const mid = (k: RingKey) => (TRACK[k].r0 + TRACK[k].r1) / 2;
const polar = (r: number, deg: number): [number, number] => [C + r * Math.sin((deg * Math.PI) / 180), C - r * Math.cos((deg * Math.PI) / 180)];

/** An arc of a circle from 12 o'clock (or `from`) clockwise to `deg`. */
export function arcPath(r: number, deg: number, from = 0): string {
  const sweep = Math.max(0, Math.min(359.95, deg - from));
  if (sweep <= 0.01) return '';
  const [x0, y0] = polar(r, from);
  const [x1, y1] = polar(r, from + sweep);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/** Where a ring's segment k (1-based) ends, in degrees clockwise from 12 o'clock. */
export const endAngle = (ring: RingKey, step: number) => (360 * step) / TRACK[ring].n;

function Shape({ kind, x, y, r, stroke, width }: { kind: 'SQUARE' | 'TRIANGLE' | 'CIRCLE'; x: number; y: number; r: number; stroke: string; width: number }) {
  if (kind === 'SQUARE') return <Path d={`M${x - r * 0.8} ${y - r * 0.8} h${r * 1.6} v${r * 1.6} h${-r * 1.6} Z`} fill="none" stroke={stroke} strokeWidth={width} strokeLinejoin="round" />;
  if (kind === 'TRIANGLE') return <Path d={`M${x} ${y - r * 0.95} L${x + r * 0.98} ${y + r * 0.7} L${x - r * 0.98} ${y + r * 0.7} Z`} fill="none" stroke={stroke} strokeWidth={width} strokeLinejoin="round" />;
  return <Circle cx={x} cy={y} r={r * 0.85} fill="none" stroke={stroke} strokeWidth={width} />;
}

/** The numbers on the three rings (they only change when a segment is lit). */
const Labels = memo(function Labels({ rings, ring, step }: { rings: Record<RingKey, RingSegment[]>; ring: RingKey; step: number }) {
  return (
    <>
      {RING_ORDER.map((k) =>
        rings[k].map((seg, i) => {
          const t = TRACK[k];
          const a = (360 / t.n) * (i + 0.5);
          const [x, y] = polar(mid(k), a);
          const lit = k === ring && i < step;
          const flip = a > 90 && a < 270 ? 180 : 0;
          const bonus = seg.kind !== 'x';
          return (
            <SvgText
              key={`${k}${i}`}
              x={x}
              y={y + 4.6}
              rotation={a + flip}
              origin={`${x}, ${y}`}
              fontSize={k === 'OUTER' ? 14.5 : k === 'MIDDLE' ? 14 : 13}
              fontWeight="900"
              textAnchor="middle"
              fill={lit ? RING_COLOR[k].ink : bonus ? RING_COLOR[k].light : '#D3D6DF'}
              fillOpacity={lit ? 1 : bonus ? 0.95 : 0.82}
            >
              {seg.label}
            </SvgText>
          );
        })
      )}
    </>
  );
});

interface Props {
  size: number;
  rings: Record<RingKey, RingSegment[]>;
  plate: ImageSourcePropType;
  ring: RingKey;
  /** Segments survived on `ring`: their numbers turn dark on the lit arc. */
  step: number;
  /** Degrees of the lit arc on `ring`, from 12 o'clock (animated by the screen). */
  sweep: Animated.Value;
  /** The segment that was failed (1-based), and how red it is (0 to 1, animated by the screen). */
  failStep: number | null;
  failAlpha: Animated.Value;
  /** What stands in the middle (the reel of sentinels), in a window of `centerSize(size)` pixels. */
  center: React.ReactNode;
  /** Animated scale and tilt (degrees) of the middle: a little bounce on a step, a shake on a loss. */
  guardScale?: Animated.Value;
  guardTilt?: Animated.Value;
  /** A pulse (0 to 1) of light round the lit arc, for a win (animated by the screen). */
  glow: Animated.Value;
  /** Tapping a badge picks that ring (null while a round is on). */
  onPick: ((k: RingKey) => void) | null;
}

/** The size of the window in the middle of the wheel, in pixels. */
export const centerSize = (size: number) => (108 * size) / 380;

/** A full circle of radius r from 12 o'clock clockwise (the lit arc shows the first part of it with a dash). */
const circlePath = (r: number) => `M${C} ${C - r} A${r} ${r} 0 1 1 ${C} ${C + r} A${r} ${r} 0 1 1 ${C} ${C - r}`;

/** One layer of the lit arc: the circle of radius r shown from 12 o'clock to `sweep` degrees. */
function LitLayer({ r, sweep, stroke, width, opacity }: { r: number; sweep: Animated.Value; stroke: string; width: number; opacity: Animated.AnimatedInterpolation<number> | number }) {
  const len = 2 * Math.PI * r;
  const offset = useMemo(() => sweep.interpolate({ inputRange: [0, 360], outputRange: [len, 0], extrapolate: 'clamp' }), [sweep, len]);
  // Nothing at all while the arc is empty (a round line cap would leave a dot at 12 o'clock).
  const shown = useMemo(() => sweep.interpolate({ inputRange: [0, 0.4, 360], outputRange: [0, 1, 1], extrapolate: 'clamp' }), [sweep]);
  const strokeOpacity = useMemo(() => Animated.multiply(shown, opacity), [shown, opacity]);
  return (
    <AnimatedPath
      d={circlePath(r)}
      fill="none"
      stroke={stroke}
      strokeWidth={width}
      strokeLinecap="round"
      strokeDasharray={`${len} ${len}`}
      strokeDashoffset={offset}
      strokeOpacity={strokeOpacity}
    />
  );
}

export default function RingWheel({ size, rings, plate, ring, step, sweep, failStep, failAlpha, center, guardScale, guardTilt, glow, onPick }: Props) {
  const k = size / 380;
  const t = TRACK[ring];
  const w = (t.r1 - t.r0) * 0.66;
  const col = RING_COLOR[ring];
  const glowOpacity = useMemo(() => glow.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0.68] }), [glow]);
  const failArc = failStep ? arcPath(mid(ring), (360 / t.n) * failStep, (360 / t.n) * (failStep - 1)) : '';
  return (
    <View style={{ width: size, height: size }}>
      <Image source={plate} style={styles.fill} resizeMode="stretch" fadeDuration={0} />
      <Svg width={size} height={size} viewBox="0 0 380 380" style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="rgBadge" cx="50%" cy="35%" r="70%">
            <Stop offset="0" stopColor="#2b2d36" />
            <Stop offset="1" stopColor="#0c0d11" />
          </RadialGradient>
        </Defs>
        {/* the lit arc of the ring in play: a soft glow under a solid band and a light line */}
        <LitLayer key={`${ring}-g`} r={mid(ring)} sweep={sweep} stroke={col.glow} width={w * 1.55} opacity={glowOpacity} />
        <LitLayer key={`${ring}-m`} r={mid(ring)} sweep={sweep} stroke={col.main} width={w} opacity={1} />
        <LitLayer key={`${ring}-l`} r={mid(ring) - w * 0.28} sweep={sweep} stroke={col.light} width={1.8} opacity={0.55} />
        {failArc ? <AnimatedPath d={failArc} fill="none" stroke="#FF3B4A" strokeOpacity={failAlpha} strokeWidth={t.r1 - t.r0 - 4} strokeLinecap="butt" /> : null}
        <Labels rings={rings} ring={ring} step={step} />
        {/* the badges at 12 o'clock */}
        {RING_ORDER.map((kk) => {
          const [bx, by] = polar(mid(kk), 0);
          const on = kk === ring;
          const c = RING_COLOR[kk];
          return (
            <G key={kk}>
              {on ? <Circle cx={bx} cy={by} r={19} fill={c.glow} fillOpacity={0.35} /> : null}
              <Circle cx={bx} cy={by} r={14.5} fill="url(#rgBadge)" stroke={on ? c.main : '#8b8f9f'} strokeOpacity={on ? 1 : 0.7} strokeWidth={on ? 3.2 : 2} />
              <Shape kind={SHAPE_OF[kk]} x={bx} y={by + 0.6} r={7.6} stroke={on ? c.light : '#d6d9e3'} width={2.6} />
            </G>
          );
        })}
      </Svg>
      {/* the middle: the reel of sentinels */}
      <Animated.View
        style={[
          styles.guardBox,
          {
            left: (C - 54) * k,
            top: (C - 54) * k,
            width: 108 * k,
            height: 108 * k,
            transform: [{ scale: guardScale ?? 1 }, { rotate: guardTilt ? guardTilt.interpolate({ inputRange: [-30, 30], outputRange: ['-30deg', '30deg'] }) : '0deg' }],
          },
        ]}
        pointerEvents="none"
      >
        {center}
      </Animated.View>
      {/* the badges are the buttons that pick the ring */}
      {onPick
        ? RING_ORDER.map((kk) => {
            const [bx, by] = polar(mid(kk), 0);
            return (
              <TapPressable
                silent
                key={kk}
                onPress={() => onPick(kk)}
                style={{ position: 'absolute', left: (bx - 22) * k, top: (by - 22) * k, width: 44 * k, height: 44 * k }}
                hitSlop={Math.max(0, 22 - 22 * k)}
                accessibilityRole="button"
                accessibilityLabel={`${RING_NAME[kk]} (${SHAPE_OF[kk].toLowerCase()})`}
                accessibilityState={{ selected: kk === ring }}
              />
            );
          })
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' },
  guardBox: { position: 'absolute' },
});
