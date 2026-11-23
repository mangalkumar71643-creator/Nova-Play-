import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo } from 'react';
import { Animated, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient as SvgGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { Text } from '../AppText';
import TapPressable from '../TapPressable';

export const GOLD = '#F2C45A';
export const GOLD_DEEP = '#B98225';
export const INK = '#0A1F17';

/** Rupees the way a player reads them: 1,250 · 12,34,567 · 95.50 (no ".00"). */
export function money(n: number): string {
  const whole = Math.abs(n % 1) < 0.005;
  const fixed = whole ? String(Math.round(Math.abs(n))) : Math.abs(n).toFixed(2);
  const [int, dec] = fixed.split('.');
  // Indian grouping: the last three digits, then pairs.
  const grouped = int.length > 3 ? `${int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${int.slice(-3)}` : int;
  return `${n < 0 ? '-' : ''}₹${grouped}${dec ? `.${dec}` : ''}`;
}

/** A short amount for a crowded place (a chip on the table): 1.2K, 25K, 1.5L. */
export function shortMoney(n: number): string {
  if (n >= 100000) return `₹${+(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${+(n / 1000).toFixed(1)}K`;
  return money(n);
}

const TONES: [string, string][] = [
  ['#5B8DEF', '#2B4FA8'],
  ['#E0588E', '#9E2A5C'],
  ['#F2A33A', '#B26A12'],
  ['#3FBF8A', '#1C7A55'],
  ['#9B6BE8', '#5A32A8'],
  ['#E8604C', '#A12B1C'],
  ['#2EC4D6', '#127B8C'],
  ['#C7D44B', '#7C8A14'],
];
export const toneFor = (key: number | string): number => {
  if (typeof key === 'number') return Math.abs(key) % TONES.length;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % TONES.length;
};

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * A player's round portrait: a gradient disc with their initial inside a gold rim. While it is their turn a ring runs down around
 * it (`progress`, 1 -> 0, driven by the screen) and the rim glows; a packed player is dimmed; the winner wears a crown.
 */
export const Avatar = memo(function Avatar({
  name,
  tone,
  size,
  progress,
  ringColor = '#37D67A',
  active = false,
  dim = false,
  crown = false,
  you = false,
}: {
  name: string;
  tone: number;
  size: number;
  progress?: Animated.Value;
  ringColor?: string;
  active?: boolean;
  dim?: boolean;
  crown?: boolean;
  you?: boolean;
}) {
  const r = size / 2;
  const ring = size * 0.045;
  const circ = 2 * Math.PI * (r - ring / 2);
  const [c1, c2] = TONES[tone % TONES.length];
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  const dash = progress ? progress.interpolate({ inputRange: [0, 1], outputRange: [circ, 0] }) : 0;
  return (
    <View style={{ width: size, height: size, opacity: dim ? 0.45 : 1 }}>
      <Svg width={size} height={size}>
        <Defs>
          <SvgGradient id={`av${tone}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={c1} />
            <Stop offset="1" stopColor={c2} />
          </SvgGradient>
          <SvgGradient id="rim" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FFF0B8" />
            <Stop offset="0.5" stopColor={GOLD} />
            <Stop offset="1" stopColor={GOLD_DEEP} />
          </SvgGradient>
        </Defs>
        <Circle cx={r} cy={r} r={r - ring / 2} fill="#0B1A14" stroke={active ? ringColor : 'url(#rim)'} strokeOpacity={active ? 0.25 : 1} strokeWidth={ring} />
        <Circle cx={r} cy={r} r={r - ring * 1.6} fill={`url(#av${tone})`} />
        <Ellipse cx={r} cy={r * 0.62} rx={r * 0.62} ry={r * 0.3} fill="#FFFFFF" fillOpacity={0.16} />
        {active && progress ? (
          <AnimatedCircle
            cx={r}
            cy={r}
            r={r - ring / 2}
            fill="none"
            stroke={ringColor}
            strokeWidth={ring}
            strokeLinecap="round"
            strokeDasharray={`${circ} ${circ}`}
            strokeDashoffset={dash as unknown as number}
            transform={`rotate(-90 ${r} ${r})`}
          />
        ) : null}
        <SvgText x={r} y={r + size * 0.17} fontSize={size * 0.46} fontWeight="700" fill="#FFFFFF" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif">
          {initial}
        </SvgText>
      </Svg>
      {you ? (
        <View style={[styles.youDot, { right: size * 0.02, bottom: size * 0.02, width: size * 0.26, height: size * 0.26, borderRadius: size * 0.13 }]}>
          <MaterialCommunityIcons name="account" size={size * 0.17} color="#0A1F17" />
        </View>
      ) : null}
      {crown ? (
        <View style={{ position: 'absolute', top: -size * 0.3, left: 0, right: 0, alignItems: 'center' }}>
          <MaterialCommunityIcons name="crown" size={size * 0.46} color={GOLD} style={styles.crown} />
        </View>
      ) : null}
    </View>
  );
});

/** The pile of chips in the middle of the table. */
export const ChipPile = memo(function ChipPile({ size }: { size: number }) {
  const w = size;
  const h = size * 0.78;
  const chip = (cx: number, cy: number, a: string, b: string, k: string) => (
    <>
      <Ellipse cx={cx} cy={cy + 3.2} rx={19} ry={7.2} fill="#00000066" />
      <Ellipse cx={cx} cy={cy + 2} rx={19} ry={7.2} fill={b} />
      <Ellipse cx={cx} cy={cy} rx={19} ry={7.2} fill={`url(#${k})`} stroke="#FFFFFF" strokeOpacity={0.9} strokeWidth={0.8} />
      <Ellipse cx={cx} cy={cy} rx={10.5} ry={3.9} fill="none" stroke="#00000055" strokeWidth={0.8} />
    </>
  );
  return (
    <Svg width={w} height={h} viewBox="0 0 100 78">
      <Defs>
        {[
          ['cg', '#FFE9A0', '#C98A1C'],
          ['cr', '#FF6A6A', '#B3121F'],
          ['cb', '#6FB2FF', '#1C4FB0'],
        ].map(([id, a, b]) => (
          <SvgGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={a} />
            <Stop offset="1" stopColor={b} />
          </SvgGradient>
        ))}
      </Defs>
      {chip(30, 58, '#6FB2FF', '#12358a', 'cb')}
      {chip(30, 52, '#FF6A6A', '#8a0d17', 'cr')}
      {chip(72, 60, '#FF6A6A', '#8a0d17', 'cr')}
      {chip(72, 54, '#6FB2FF', '#12358a', 'cb')}
      {chip(50, 46, '#FFE9A0', '#9a6410', 'cg')}
      {chip(50, 40, '#FFE9A0', '#9a6410', 'cg')}
      {chip(50, 34, '#FFE9A0', '#9a6410', 'cg')}
    </Svg>
  );
});

/** One chip flying across the table (a bet going to the pot, the pot going to the winner). */
export const FlyingChip = memo(function FlyingChip({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Defs>
        <SvgGradient id="fc" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFE9A0" />
          <Stop offset="1" stopColor="#C98A1C" />
        </SvgGradient>
      </Defs>
      <Circle cx={20} cy={20} r={18} fill="url(#fc)" stroke="#FFFFFF" strokeWidth={1.4} />
      <Circle cx={20} cy={20} r={12} fill="none" stroke="#7A4A05" strokeOpacity={0.6} strokeWidth={1.2} strokeDasharray="3 3" />
      <Path d="M20 12 L24 20 L20 28 L16 20 Z" fill="#7A4A05" fillOpacity={0.55} />
    </Svg>
  );
});

type Tone = 'gold' | 'green' | 'red' | 'blue' | 'purple' | 'dark';
const TONES_BTN: Record<Tone, { colors: [string, string]; border: string; text: string; sub: string }> = {
  gold: { colors: ['#FFE08A', '#D79A2B'], border: '#FFF3C4', text: '#2A1A00', sub: '#5A3A06' },
  green: { colors: ['#43E08C', '#13874F'], border: '#B9FFD9', text: '#032614', sub: '#064A2A' },
  red: { colors: ['#FF6B6B', '#B3121F'], border: '#FFC2C2', text: '#FFFFFF', sub: '#FFD9D9' },
  blue: { colors: ['#5FA8FF', '#1F58B8'], border: '#C6E0FF', text: '#FFFFFF', sub: '#D6E8FF' },
  purple: { colors: ['#B58BFF', '#5E33B8'], border: '#E0CFFF', text: '#FFFFFF', sub: '#E9DDFF' },
  dark: { colors: ['#2B3A34', '#121C18'], border: '#4B5F56', text: '#E8F1EC', sub: '#9DB3A8' },
};

/** A button of the table: a gradient face with a bright rim, its name and (small, under it) what it costs. */
export function ActionButton({
  label,
  sub,
  tone,
  onPress,
  disabled,
  flex = 1,
  height = 56,
  icon,
  style,
}: {
  label: string;
  sub?: string;
  tone: Tone;
  onPress?: () => void;
  disabled?: boolean;
  flex?: number;
  height?: number;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  style?: StyleProp<ViewStyle>;
}) {
  const t = TONES_BTN[tone];
  return (
    <TapPressable silent onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={sub ? `${label} ${sub}` : label} style={[flex > 0 ? { flex } : null, { height, opacity: disabled ? 0.38 : 1 }, style]}>
      {({ pressed }) => (
        <View style={[styles.btnShadow, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
          <LinearGradient colors={t.colors} style={[styles.btn, { borderColor: t.border }]}>
            <View style={styles.btnGloss} />
            <View style={styles.btnRow}>
              {icon ? <MaterialCommunityIcons name={icon} size={17} color={t.text} style={{ marginRight: 4 }} /> : null}
              <Text style={[styles.btnLabel, { color: t.text, fontSize: label.length > 6 ? 12.5 : 15 }]} numberOfLines={1} adjustsFontSizeToFit>
                {label}
              </Text>
            </View>
            {sub ? (
              <Text style={[styles.btnSub, { color: t.sub }]} numberOfLines={1} adjustsFontSizeToFit>
                {sub}
              </Text>
            ) : null}
          </LinearGradient>
        </View>
      )}
    </TapPressable>
  );
}

/** A small rounded label (BLIND, SEEN, PACKED, DEALER ...). */
export function Tag({ text, color, bg, icon }: { text: string; color: string; bg: string; icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }) {
  return (
    <View style={[styles.tag, { backgroundColor: bg, borderColor: color }]}>
      {icon ? <MaterialCommunityIcons name={icon} size={10} color={color} style={{ marginRight: 2 }} /> : null}
      <Text style={[styles.tagText, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  youDot: { position: 'absolute', backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FFF3C4' },
  crown: { textShadowColor: '#000', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  btnShadow: { flex: 1, borderRadius: 14, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 5 },
  btn: { flex: 1, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, overflow: 'hidden' },
  btnGloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '46%', backgroundColor: 'rgba(255,255,255,0.18)' },
  btnRow: { flexDirection: 'row', alignItems: 'center' },
  btnLabel: { fontSize: 15, fontWeight: '900', letterSpacing: 0.4 },
  btnSub: { fontSize: 11, fontWeight: '800', marginTop: 1 },
  tag: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, borderWidth: 1, paddingHorizontal: 5, paddingVertical: 1 },
  tagText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
});
