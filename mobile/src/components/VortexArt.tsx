import React, { memo, useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient as SvgLinear, Path, RadialGradient, Stop } from 'react-native-svg';
import { VortexElement, VortexRingConfig, VortexSymbol } from '../api/backend';
import { fonts } from '../theme';

/** The drawn parts of Vortex (screens/VortexScreen): the three-ring board, the symbols and the logo. */

export type VortexFill = { water: number; earth: number; fire: number };
export const FILL_KEY: Record<VortexElement, keyof VortexFill> = { WATER: 'water', EARTH: 'earth', FIRE: 'fire' };

export const ELEMENT_LOOK: Record<VortexElement, { name: string; color: string; bright: string; deep: string }> = {
  WATER: { name: 'Water', color: '#2F8CFF', bright: '#9AD6FF', deep: '#0A3A9C' },
  EARTH: { name: 'Earth', color: '#25C565', bright: '#A4FFC0', deep: '#0A6230' },
  FIRE: { name: 'Fire', color: '#FF6A1F', bright: '#FFCB73', deep: '#A81C06' },
};
export const SYMBOL_NAME: Record<VortexSymbol, string> = { WATER: 'Water', EARTH: 'Earth', FIRE: 'Fire', WIND: 'Wind', SKULL: 'Skull' };

/** Each ring's band, as fractions of the board's size (inner radius, outer radius). */
export const RING_BAND: Record<VortexElement, [number, number]> = { FIRE: [0.408, 0.5], EARTH: [0.316, 0.408], WATER: [0.224, 0.316] };
/** Radius of the well in the middle, where the symbols land. */
export const WELL = 0.224;

const ELEMENT_ART: Record<VortexElement, number> = {
  WATER: require('../../assets/vortex/water.webp'),
  EARTH: require('../../assets/vortex/earth.webp'),
  FIRE: require('../../assets/vortex/fire.webp'),
};

// ---------- geometry ----------

function polar(c: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [c + r * Math.cos(a), c + r * Math.sin(a)];
}

/** Ring slice between radii r0 < r1, from angle a0 to a1 (degrees, clockwise from 12 o'clock). */
function wedge(c: number, r0: number, r1: number, a0: number, a1: number): string {
  const [x0, y0] = polar(c, r1, a0);
  const [x1, y1] = polar(c, r1, a1);
  const [x2, y2] = polar(c, r0, a1);
  const [x3, y3] = polar(c, r0, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r1} ${r1} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${r0} ${r0} 0 ${large} 0 ${x3} ${y3} Z`;
}

/** Half the angle the element's badge takes at the top of its ring. */
function badgeHalfAngle(element: VortexElement): number {
  const [k0, k1] = RING_BAND[element];
  return (Math.asin(Math.min(1, ((k1 - k0) * 0.56) / ((k0 + k1) / 2))) * 180) / Math.PI;
}

/** Where section `index` of `count` sits on its ring: sections run clockwise from the badge at the top. */
function sectionAngles(element: VortexElement, index: number, count: number): [number, number] {
  const step = 360 / count;
  const gap = 1.1;
  const badge = badgeHalfAngle(element) + 0.6;
  return [index === 0 ? badge : index * step + gap, index === count - 1 ? 360 - badge : (index + 1) * step - gap];
}

function sectionPath(size: number, element: VortexElement, index: number, count: number): string {
  const [k0, k1] = RING_BAND[element];
  const [a0, a1] = sectionAngles(element, index, count);
  return wedge(size / 2, k0 * size + 3, k1 * size - 3, a0, a1);
}

/** The text on a ring's section: its multiplier, or what a hit on the full ring gives. */
export function sectionLabel(ring: VortexRingConfig, index: number): string {
  if (index < ring.ladder.length) return `${ring.ladder[index]}X`;
  return ring.bonus > 0 ? `+${ring.bonus}X` : 'BONUS';
}

// ---------- symbols ----------

function WindOrb({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id="windBody" cx="36%" cy="30%" r="75%">
          <Stop offset="0" stopColor="#E3E8F2" />
          <Stop offset="0.45" stopColor="#8D96A8" />
          <Stop offset="1" stopColor="#3A404E" />
        </RadialGradient>
      </Defs>
      <Circle cx={50} cy={50} r={48} fill="#262A34" />
      <Circle cx={50} cy={50} r={44.5} fill="url(#windBody)" />
      <Circle cx={50} cy={50} r={46.2} fill="none" stroke="#C5CCDA" strokeOpacity={0.9} strokeWidth={3} />
      <G fill="none" stroke="#FFFFFF" strokeWidth={6.2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M 21 43 H 55 a 10.5 10.5 0 1 0 -10.5 -10.5" />
        <Path d="M 16 56 H 67 a 10.5 10.5 0 1 1 -10.5 10.5" />
        <Path d="M 24 69 H 39" strokeOpacity={0.85} />
      </G>
      <Ellipse cx={40} cy={21} rx={22} ry={8.5} fill="#FFFFFF" fillOpacity={0.28} />
    </Svg>
  );
}

function SkullOrb({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id="skullBody" cx="38%" cy="30%" r="78%">
          <Stop offset="0" stopColor="#8A1B45" />
          <Stop offset="0.5" stopColor="#4A0A24" />
          <Stop offset="1" stopColor="#170208" />
        </RadialGradient>
        <SvgLinear id="skullBone" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#D9CFC9" />
        </SvgLinear>
      </Defs>
      <Circle cx={50} cy={50} r={48} fill="#1B0610" />
      <Circle cx={50} cy={50} r={44.5} fill="url(#skullBody)" />
      <Circle cx={50} cy={50} r={46.2} fill="none" stroke="#E0355F" strokeOpacity={0.95} strokeWidth={3} />
      <Path
        d="M 50 21 C 32 21 23 33 23 46 C 23 55 27 61 33 65 L 33 73 C 33 76.5 35.5 79 39 79 L 61 79 C 64.5 79 67 76.5 67 73 L 67 65 C 73 61 77 55 77 46 C 77 33 68 21 50 21 Z"
        fill="url(#skullBone)"
      />
      <Ellipse cx={39.5} cy={47} rx={8} ry={8.8} fill="#1B0610" />
      <Ellipse cx={60.5} cy={47} rx={8} ry={8.8} fill="#1B0610" />
      <Circle cx={39.5} cy={48} r={3} fill="#FF3B5C" />
      <Circle cx={60.5} cy={48} r={3} fill="#FF3B5C" />
      <Path d="M 50 56 L 45.5 64.5 L 54.5 64.5 Z" fill="#1B0610" />
      <G stroke="#1B0610" strokeWidth={2.4} strokeLinecap="round">
        <Line x1={43} y1={71} x2={43} y2={78.5} />
        <Line x1={50} y1={71} x2={50} y2={78.5} />
        <Line x1={57} y1={71} x2={57} y2={78.5} />
      </G>
      <Ellipse cx={40} cy={20} rx={20} ry={7} fill="#FFFFFF" fillOpacity={0.14} />
    </Svg>
  );
}

/** One symbol as a round badge. */
export const SymbolOrb = memo(function SymbolOrb({ symbol, size }: { symbol: VortexSymbol; size: number }) {
  if (symbol === 'WIND') return <WindOrb size={size} />;
  if (symbol === 'SKULL') return <SkullOrb size={size} />;
  return <Image source={ELEMENT_ART[symbol]} style={{ width: size, height: size }} />;
});

// ---------- the board ----------

const RING_ORDER: VortexElement[] = ['FIRE', 'EARTH', 'WATER'];

/** The board with nothing on it: the dark disc, its three rings, the section marks and the well. */
export const BoardBase = memo(function BoardBase({ size, rings }: { size: number; rings: VortexRingConfig[] }) {
  const c = size / 2;
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgLinear id="vxDisc" x1="0.15" y1="0" x2="0.85" y2="1">
          <Stop offset="0" stopColor="#2C303C" />
          <Stop offset="0.5" stopColor="#21242E" />
          <Stop offset="1" stopColor="#171920" />
        </SvgLinear>
        <SvgLinear id="vxRim" x1="0.15" y1="0" x2="0.85" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.16} />
          <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0.03} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0.5} />
        </SvgLinear>
        <RadialGradient id="vxWell" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#191B23" />
          <Stop offset="0.72" stopColor="#111319" />
          <Stop offset="1" stopColor="#090A0E" />
        </RadialGradient>
      </Defs>
      <Circle cx={c} cy={c} r={c - 1.5} fill="url(#vxDisc)" />
      <Circle cx={c} cy={c} r={c - 1.5} fill="none" stroke="url(#vxRim)" strokeWidth={2.5} />
      {RING_ORDER.map((el, i) => {
        const [k0, k1] = RING_BAND[el];
        const rIn = k0 * size;
        const rMid = ((k0 + k1) / 2) * size;
        const band = (k1 - k0) * size;
        const ring = rings.find((r) => r.element === el);
        const count = (ring?.ladder.length ?? 0) + 1;
        return (
          <G key={el}>
            {/* Each ring sits a little deeper than the one outside it. */}
            <Circle cx={c} cy={c} r={k1 * size - (i === 0 ? 3 : 0)} fill="#000000" fillOpacity={i === 0 ? 0 : 0.1} />
            <Circle cx={c} cy={c} r={rIn} fill="none" stroke="#0B0C10" strokeWidth={3.5} />
            <Circle cx={c} cy={c} r={rIn + 2.6} fill="none" stroke="url(#vxRim)" strokeWidth={1.4} />
            {Array.from({ length: count - 1 }, (_, j) => {
              const a = ((j + 1) * 360) / count;
              const [x0, y0] = polar(c, rMid - band * 0.17, a);
              const [x1, y1] = polar(c, rMid + band * 0.17, a);
              return <Line key={j} x1={x0} y1={y0} x2={x1} y2={y1} stroke="#4A4F5F" strokeWidth={2.4} strokeLinecap="round" />;
            })}
            <Circle cx={c} cy={c - rMid} r={band * 0.5} fill="#15171D" stroke="#0B0C10" strokeWidth={2} />
          </G>
        );
      })}
      <Circle cx={c} cy={c} r={WELL * size - 1.5} fill="url(#vxWell)" />
    </Svg>
  );
});

/**
 * What is on the board: every filled section in its element's colour (the last one, which is what the ring is
 * worth, brightest), the section texts, and each element's badge at the top of its ring.
 */
export const BoardRings = memo(function BoardRings({ size, rings, fill }: { size: number; rings: VortexRingConfig[]; fill: VortexFill }) {
  const c = size / 2;
  const fontSize = size * 0.041;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          {rings.map((ring) => {
            const [k0, k1] = RING_BAND[ring.element];
            const look = ELEMENT_LOOK[ring.element];
            return (
              <RadialGradient key={ring.element} id={`vxFill${ring.element}`} cx={c} cy={c} r={k1 * size} gradientUnits="userSpaceOnUse">
                <Stop offset={k0 / k1} stopColor={look.deep} />
                <Stop offset={(k0 / k1 + 1) / 2} stopColor={look.color} />
                <Stop offset="1" stopColor={look.bright} />
              </RadialGradient>
            );
          })}
        </Defs>
        {rings.map((ring) => {
          const level = fill[FILL_KEY[ring.element]];
          const count = ring.ladder.length + 1;
          return Array.from({ length: Math.min(level, ring.ladder.length) }, (_, i) => (
            <Path
              key={`${ring.element}${i}`}
              d={sectionPath(size, ring.element, i, count)}
              fill={`url(#vxFill${ring.element})`}
              fillOpacity={i === level - 1 ? 1 : 0.5}
              stroke={ELEMENT_LOOK[ring.element].bright}
              strokeOpacity={i === level - 1 ? 0.9 : 0.25}
              strokeWidth={1.2}
            />
          ));
        })}
      </Svg>
      {rings.map((ring) => {
        const [k0, k1] = RING_BAND[ring.element];
        const rMid = ((k0 + k1) / 2) * size;
        const level = fill[FILL_KEY[ring.element]];
        const count = ring.ladder.length + 1;
        const boxW = size * 0.3;
        const boxH = fontSize * 1.5;
        const badge = (k1 - k0) * size * 0.9;
        return (
          <React.Fragment key={ring.element}>
            {Array.from({ length: count }, (_, i) => {
              const [a0, a1] = sectionAngles(ring.element, i, count);
              const a = (a0 + a1) / 2;
              const [x, y] = polar(c, rMid, a);
              // Never upside down: the lower half of the ring is read from the other side.
              const turn = a > 90 && a < 270 ? a - 180 : a;
              const lit = i < Math.min(level, ring.ladder.length);
              const label = sectionLabel(ring, i);
              return (
                <View
                  key={i}
                  style={{ position: 'absolute', left: x - boxW / 2, top: y - boxH / 2, width: boxW, height: boxH, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: `${turn}deg` }] }}
                >
                  <Text
                    allowFontScaling={false}
                    numberOfLines={1}
                    style={[
                      styles.sectionText,
                      { fontSize: label.length > 5 ? fontSize * 0.88 : fontSize, lineHeight: boxH },
                      lit && (i === level - 1 ? styles.sectionTextOn : styles.sectionTextPast),
                    ]}
                  >
                    {label}
                  </Text>
                </View>
              );
            })}
            <View style={{ position: 'absolute', left: c - badge / 2, top: c - rMid - badge / 2 }}>
              <SymbolOrb symbol={ring.element} size={badge} />
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
});

/** Sections to light up for a moment (a hit, a payout, or what a Skull takes away). */
export type SectionFlash = { element: VortexElement; index: number };

export const BoardFlash = memo(function BoardFlash({ size, rings, sections, color }: { size: number; rings: VortexRingConfig[]; sections: SectionFlash[]; color: string }) {
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      {sections.map((s) => {
        const ring = rings.find((r) => r.element === s.element);
        if (!ring) return null;
        return <Path key={`${s.element}${s.index}`} d={sectionPath(size, s.element, s.index, ring.ladder.length + 1)} fill={color} fillOpacity={0.85} stroke="#FFFFFF" strokeOpacity={0.9} strokeWidth={1.5} />;
      })}
    </Svg>
  );
});

/** A soft light in the well, in `color` (shown for a moment when a symbol lands). */
export const WellGlow = memo(function WellGlow({ size, color }: { size: number; color: string }) {
  const d = WELL * 2 * size;
  return (
    <Svg width={d} height={d}>
      <Defs>
        <RadialGradient id="vxGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={0.85} />
          <Stop offset="0.6" stopColor={color} stopOpacity={0.3} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={d / 2} cy={d / 2} r={d / 2} fill="url(#vxGlow)" />
    </Svg>
  );
});

/** The well's edge, drawn over the symbols so they slide in and out under it. */
export const WellShade = memo(function WellShade({ size }: { size: number }) {
  const d = WELL * 2 * size;
  return (
    <Svg width={d} height={d}>
      <Defs>
        <RadialGradient id="vxShade" cx="50%" cy="50%" r="50%">
          <Stop offset="0.62" stopColor="#090A0E" stopOpacity={0} />
          <Stop offset="0.9" stopColor="#090A0E" stopOpacity={0.75} />
          <Stop offset="1" stopColor="#090A0E" stopOpacity={1} />
        </RadialGradient>
      </Defs>
      <Circle cx={d / 2} cy={d / 2} r={d / 2} fill="url(#vxShade)" />
      <Circle cx={d / 2} cy={d / 2} r={d / 2 - 1.5} fill="none" stroke="#000000" strokeOpacity={0.7} strokeWidth={3} />
    </Svg>
  );
});

// ---------- logo, spin button, background ----------

/** "VORTEX" on its purple swirl. */
export const VortexLogo = memo(function VortexLogo({ height }: { height: number }) {
  const w = height * 3.5;
  return (
    <View style={{ width: w, height, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={w} height={height} viewBox="0 0 350 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinear id="vxSwirl" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#B26BFF" />
            <Stop offset="0.5" stopColor="#7A1FF2" />
            <Stop offset="1" stopColor="#3D0A99" />
          </SvgLinear>
        </Defs>
        <G transform="rotate(-11 175 50)">
          <Path d="M 62 56 C 62 30 118 12 196 12 C 252 12 292 24 292 42 C 292 47 289 51 283 55 C 286 40 250 28 194 28 C 128 28 82 42 82 62 C 82 70 88 76 100 81 C 76 77 62 68 62 56 Z" fill="url(#vxSwirl)" />
          <Path d="M 288 46 C 288 72 232 90 154 90 C 98 90 58 78 58 60 C 58 56 60 52 65 48 C 62 63 100 74 156 74 C 222 74 268 60 268 40 C 268 33 263 27 252 22 C 275 26 288 35 288 46 Z" fill="url(#vxSwirl)" fillOpacity={0.9} />
          <Ellipse cx={175} cy={51} rx={64} ry={20} fill="#5B12C9" fillOpacity={0.55} />
        </G>
      </Svg>
      <Text allowFontScaling={false} style={[styles.logoText, { fontSize: height * 0.5, lineHeight: height * 0.62 }]}>
        VORTEX
      </Text>
    </View>
  );
});

/** The spiral on the spin button. */
export const SpinGlyph = memo(function SpinGlyph({ size }: { size: number }) {
  const d = useMemo(() => {
    const c = size / 2;
    const pts: string[] = [];
    const turns = 2.1;
    for (let i = 0; i <= 90; i++) {
      const t = i / 90;
      const [x, y] = polar(c, size * 0.04 + size * 0.34 * t, t * turns * 360 + 200);
      pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`);
    }
    return pts.join(' ');
  }, [size]);
  return (
    <Svg width={size} height={size}>
      <Path d={d} fill="none" stroke="#D9BEFF" strokeOpacity={0.9} strokeWidth={size * 0.085} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
});

/** Faint swirls behind everything. */
export const VortexBackdrop = memo(function VortexBackdrop({ width, height }: { width: number; height: number }) {
  const arcs = useMemo(() => {
    const out: { d: string; w: number }[] = [];
    const spots: [number, number, number][] = [
      [0.08, 0.2, 0.42],
      [0.95, 0.42, 0.5],
      [0.12, 0.82, 0.46],
      [0.9, 0.95, 0.36],
    ];
    spots.forEach(([fx, fy, fr], n) => {
      const cx = fx * width;
      const cy = fy * height;
      const r = fr * width;
      for (let arm = 0; arm < 3; arm++) {
        const pts: string[] = [];
        for (let i = 0; i <= 28; i++) {
          const t = i / 28;
          const a = ((arm * 120 + n * 40 + t * 250) * Math.PI) / 180;
          pts.push(`${i === 0 ? 'M' : 'L'} ${(cx + r * (0.25 + 0.75 * t) * Math.cos(a)).toFixed(1)} ${(cy + r * (0.25 + 0.75 * t) * Math.sin(a)).toFixed(1)}`);
        }
        out.push({ d: pts.join(' '), w: r * 0.16 });
      }
    });
    return out;
  }, [width, height]);
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      {arcs.map((a, i) => (
        <Path key={i} d={a.d} fill="none" stroke="#FFFFFF" strokeOpacity={0.022} strokeWidth={a.w} strokeLinecap="round" />
      ))}
    </Svg>
  );
});

const styles = StyleSheet.create({
  sectionText: { fontFamily: fonts.black, color: '#535868', letterSpacing: 0.4, textAlign: 'center' },
  sectionTextOn: { color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  sectionTextPast: { color: 'rgba(255,255,255,0.8)' },
  logoText: { fontFamily: fonts.italic, color: '#FFFFFF', letterSpacing: 1.5, textShadowColor: 'rgba(20,0,60,0.9)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 8 },
});
