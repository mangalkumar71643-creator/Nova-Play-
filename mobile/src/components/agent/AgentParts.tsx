import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { IconName } from '../../data/models';
import { colors, spacing, typography } from '../../theme';

/** Team level look: the pill's colours and the gem on its left. */
const LEVEL_LOOKS: { pill: readonly [string, string]; gem: readonly [string, string, string]; icon: IconName; iconColor: string }[] = [
  { pill: ['#3B3F7A', '#1E2048'], gem: ['#F6D58E', '#B8862A', '#6B4A12'], icon: 'cards-diamond', iconColor: '#FFF3C4' },
  { pill: ['#6A4BB8', '#2E1F5E'], gem: ['#F2F4FA', '#A9B2C8', '#5C6680'], icon: 'cards-club', iconColor: '#FFFFFF' },
  { pill: ['#9A2036', '#4A0B17'], gem: ['#FFD27A', '#D49A2A', '#7A4E10'], icon: 'cards-heart', iconColor: '#FF3355' },
  { pill: ['#C8952F', '#5C3A0E'], gem: ['#E6C6FF', '#8A4FD6', '#3E1C74'], icon: 'diamond-stone', iconColor: '#FFFFFF' },
];

/** "Lv 2" pill with its gem, as on the team level card and the rules tables. */
export function TeamLevelBadge({ level, scale = 1 }: { level: number; scale?: number }) {
  const look = LEVEL_LOOKS[Math.max(0, Math.min(LEVEL_LOOKS.length - 1, level))];
  const h = 30 * scale;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: h + 8 * scale }}>
      <LinearGradient
        colors={look.pill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.pill, { height: h, borderRadius: h / 2, paddingLeft: h * 0.95, paddingRight: h * 0.45, marginLeft: h * 0.35 }]}
      >
        <Text style={[styles.pillText, { fontSize: 15 * scale }]}>Lv {level}</Text>
      </LinearGradient>
      <View style={[styles.gemWrap, { width: h + 8 * scale, height: h + 8 * scale }]}>
        <LinearGradient
          colors={look.gem}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.gem, { width: h * 0.82, height: h * 0.82, borderRadius: 5 * scale }]}
        />
        <MaterialCommunityIcons name={look.icon} size={h * 0.5} color={look.iconColor} style={styles.gemIcon} />
      </View>
    </View>
  );
}

/** "→ Agent Jackpot ←" section title. */
export function ArrowTitle({ title }: { title: string }) {
  return (
    <View style={styles.arrowTitle}>
      <LinearGradient colors={['transparent', colors.gold]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.arrowLine} />
      <MaterialCommunityIcons name="chevron-right" size={16} color={colors.gold} style={{ marginLeft: -6 }} />
      <Text style={styles.arrowText}>{title}</Text>
      <MaterialCommunityIcons name="chevron-left" size={16} color={colors.gold} style={{ marginRight: -6 }} />
      <LinearGradient colors={[colors.gold, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.arrowLine} />
    </View>
  );
}

/** Maroon card with the gold hairline frame used across the EARN pages. */
export function GoldCard({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <LinearGradient colors={['#4A0B17', '#2A060D', '#1C0408']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.card, style]}>
      {children}
    </LinearGradient>
  );
}

/** A card's title bar: "Referral reward" with an optional (?) on the right. */
export function CardTitle({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <LinearGradient colors={['#6A1222', '#3A0913']} style={styles.cardTitle}>
      <Text style={styles.cardTitleText}>{title}</Text>
      {right ? <View style={styles.cardTitleRight}>{right}</View> : null}
    </LinearGradient>
  );
}

/** A simple bordered table: header row and rows of cells (strings or nodes). */
export function RulesTable({
  head,
  rows,
  flex,
}: {
  head: React.ReactNode[];
  rows: React.ReactNode[][];
  flex?: number[];
}) {
  const cell = (c: React.ReactNode, i: number, header: boolean) => (
    <View key={i} style={[styles.tCell, { flex: flex?.[i] ?? 1 }, i > 0 && styles.tCellDivider]}>
      {typeof c === 'string' || typeof c === 'number' ? <Text style={header ? styles.tHeadText : styles.tText}>{c}</Text> : c}
    </View>
  );
  return (
    <View style={styles.table}>
      <LinearGradient colors={['#5A1020', '#3A0913']} style={[styles.tRow, styles.tHead]}>
        {head.map((h, i) => cell(h, i, true))}
      </LinearGradient>
      {rows.map((r, ri) => (
        <View key={ri} style={[styles.tRow, ri % 2 === 1 && styles.tRowAlt]}>
          {r.map((c, i) => cell(c, i, false))}
        </View>
      ))}
    </View>
  );
}

export function Bullet({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <View style={styles.bullet}>
      <Text style={[styles.bulletDot, color ? { color } : null]}>•</Text>
      <Text style={[styles.bulletText, color ? { color } : null]}>{children}</Text>
    </View>
  );
}

/** "1d 20:22:05" until `endsAt`, ticking every second. */
export function useCountdown(endsAt?: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!endsAt) return '';
  const left = Math.max(0, Date.parse(endsAt) - now);
  const d = Math.floor(left / 86_400_000);
  const h = Math.floor((left % 86_400_000) / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d > 0 ? `${d}d ` : ''}${pad(h)}:${pad(m)}:${pad(s)}`;
}

export const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** ₹22K / ₹1.2L style for tight spots. */
export function inrShort(n: number) {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1).replace(/\.0$/, '')}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1).replace(/\.0$/, '')}L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return inr(n);
}

const styles = StyleSheet.create({
  pill: { justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,222,140,0.8)' },
  pillText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontStyle: 'italic',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  gemWrap: { position: 'absolute', left: 0, alignItems: 'center', justifyContent: 'center' },
  gem: { transform: [{ rotate: '45deg' }], borderWidth: 1.5, borderColor: '#FFF1C2' },
  gemIcon: { position: 'absolute' },
  arrowTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: spacing.lg, paddingHorizontal: spacing.lg },
  arrowLine: { flex: 1, height: 1, maxWidth: 70 },
  arrowText: {
    color: colors.goldLight,
    fontSize: 22,
    fontWeight: '800',
    marginHorizontal: spacing.sm,
    textShadowColor: 'rgba(255,184,61,0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  card: { borderRadius: 18, borderWidth: 1.5, borderColor: 'rgba(255,222,140,0.55)', overflow: 'hidden' },
  cardTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,222,140,0.45)',
  },
  cardTitleText: { color: colors.goldLight, fontSize: typography.xl, fontWeight: '800', letterSpacing: 0.4 },
  cardTitleRight: { position: 'absolute', right: spacing.md },
  table: { borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,107,134,0.3)', overflow: 'hidden', backgroundColor: '#22060C' },
  tRow: { flexDirection: 'row', minHeight: 48, borderTopWidth: 1, borderTopColor: 'rgba(255,107,134,0.18)' },
  tHead: { borderTopWidth: 0, minHeight: 52 },
  tRowAlt: { backgroundColor: 'rgba(255,255,255,0.025)' },
  tCell: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, paddingVertical: 8 },
  tCellDivider: { borderLeftWidth: 1, borderLeftColor: 'rgba(255,107,134,0.18)' },
  tHeadText: { color: '#FFE2E8', fontSize: typography.sm, fontWeight: '800', textAlign: 'center' },
  tText: { color: colors.textPrimary, fontSize: typography.sm, fontWeight: '600', textAlign: 'center' },
  bullet: { flexDirection: 'row', gap: 6, marginTop: 6 },
  bulletDot: { color: colors.textSecondary, fontSize: typography.md, lineHeight: 20 },
  bulletText: { flex: 1, color: colors.textSecondary, fontSize: typography.sm, lineHeight: 20 },
});
