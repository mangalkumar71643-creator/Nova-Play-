import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Mission } from '../data/models';
import { colors, radius, spacing, typography } from '../theme';

type Props = { mission: Mission; onClaim: () => void };

export default function MissionCard({ mission, onClaim }: Props) {
  const ready = mission.progress >= mission.target && !mission.claimed;
  const progressFraction = Math.min(1, mission.progress / mission.target);

  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <MaterialCommunityIcons name={mission.icon} size={22} color={colors.gold} />
      </View>
      <View style={styles.middle}>
        <Text style={styles.title}>{mission.title}</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressFraction * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {Math.min(mission.progress, mission.target)}/{mission.target} · +{mission.reward} coins
        </Text>
      </View>
      <Pressable
        onPress={onClaim}
        disabled={!ready}
        style={[styles.claimButton, mission.claimed && styles.claimButtonDone, !ready && !mission.claimed && styles.claimButtonDisabled]}
      >
        <Text style={[styles.claimText, (mission.claimed || !ready) && styles.claimTextMuted]}>
          {mission.claimed ? 'Claimed' : ready ? 'Claim' : 'In progress'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  middle: { flex: 1, marginRight: spacing.sm },
  title: { color: colors.textPrimary, fontWeight: '700', fontSize: typography.sm },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.surfaceAlt,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  progressFill: { height: 5, borderRadius: 3, backgroundColor: colors.gold },
  progressText: { color: colors.textMuted, fontSize: typography.xs, marginTop: spacing.xs },
  claimButton: {
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  claimButtonDisabled: { backgroundColor: colors.surfaceAlt },
  claimButtonDone: { backgroundColor: colors.surfaceAlt },
  claimText: { color: colors.background, fontWeight: '800', fontSize: typography.xs },
  claimTextMuted: { color: colors.textMuted },
});
