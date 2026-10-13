import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { User } from '../data/models';
import { colors, gradients, radius, shadow, spacing, typography } from '../theme';

type Props = { user: User; coins: number };

export default function ProfileHeaderCard({ user, coins }: Props) {
  const xpPct = Math.min(1, user.xp / user.xpToNextLevel) * 100;
  const winRate = user.gamesPlayed > 0 ? ((user.gamesWon / user.gamesPlayed) * 100).toFixed(1) : '0.0';

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <LinearGradient colors={gradients.goldButton} style={styles.avatar}>
          <Text style={styles.avatarText}>{user.avatarInitial}</Text>
        </LinearGradient>
        <View style={styles.identity}>
          <Text style={styles.username}>{user.username}</Text>
          <Text style={styles.userId}>ID: {user.id.toUpperCase()}</Text>
          <View style={styles.badgeRow}>
            <View style={styles.levelBadge}>
              <MaterialCommunityIcons name="star" size={11} color={colors.gold} />
              <Text style={styles.levelBadgeText}>LEVEL {user.level}</Text>
            </View>
            <View style={styles.vipBadge}>
              <MaterialCommunityIcons name="crown" size={11} color={colors.background} />
              <Text style={styles.vipBadgeText}>VIP {user.vipLevel}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBlock}>
          <MaterialCommunityIcons name="circle-multiple" size={14} color={colors.gold} />
          <Text style={styles.statValue}>{coins.toLocaleString('en-IN')}</Text>
          <Text style={styles.statLabel}>Coins</Text>
        </View>
        <View style={styles.statBlock}>
          <Text style={[styles.statValue, { marginLeft: 0 }]}>
            {user.xp.toLocaleString('en-IN')}/{user.xpToNextLevel.toLocaleString('en-IN')}
          </Text>
          <Text style={styles.statLabel}>XP</Text>
        </View>
      </View>
      <View style={styles.xpTrack}>
        <View style={[styles.xpFill, { width: `${xpPct}%` }]} />
      </View>

      <View style={styles.footerRow}>
        <View style={styles.footerStat}>
          <Text style={styles.footerValue}>{user.gamesPlayed}</Text>
          <Text style={styles.footerLabel}>Games Played</Text>
        </View>
        <View style={styles.footerStat}>
          <Text style={styles.footerValue}>{user.gamesWon}</Text>
          <Text style={styles.footerLabel}>Games Won</Text>
        </View>
        <View style={styles.footerStat}>
          <Text style={styles.footerValue}>{winRate}%</Text>
          <Text style={styles.footerLabel}>Win Rate</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.card,
  },
  topRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.background, fontWeight: '800', fontSize: typography.xl },
  identity: { marginLeft: spacing.lg, flex: 1 },
  username: { color: colors.textPrimary, fontWeight: '800', fontSize: typography.lg },
  userId: { color: colors.textMuted, fontSize: typography.xs, marginTop: 2 },
  badgeRow: { flexDirection: 'row', marginTop: spacing.sm },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    marginRight: spacing.sm,
  },
  levelBadgeText: { color: colors.gold, fontSize: 10, fontWeight: '800', marginLeft: 3 },
  vipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
  },
  vipBadgeText: { color: colors.background, fontSize: 10, fontWeight: '800', marginLeft: 3 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg },
  statBlock: { flexDirection: 'row', alignItems: 'center' },
  statValue: { color: colors.textPrimary, fontWeight: '800', fontSize: typography.sm, marginLeft: 4 },
  statLabel: { color: colors.textMuted, fontSize: typography.xs, marginLeft: 6 },
  xpTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, marginTop: spacing.sm, overflow: 'hidden' },
  xpFill: { height: 6, borderRadius: 3, backgroundColor: colors.gold },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerStat: { alignItems: 'center', flex: 1 },
  footerValue: { color: colors.textPrimary, fontWeight: '800', fontSize: typography.lg },
  footerLabel: { color: colors.textMuted, fontSize: typography.xs, marginTop: 2 },
});
