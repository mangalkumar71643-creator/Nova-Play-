import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { DailyRewardDay } from '../data/models';
import { colors, radius, spacing, typography } from '../theme';

type Props = { days: DailyRewardDay[]; streak: number; claimedToday: boolean };

export default function DailyRewardTrack({ days, streak, claimedToday }: Props) {
  const currentDayNumber = (streak % days.length) + 1;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {days.map((d) => {
        const isClaimed = d.day < currentDayNumber || (d.day === currentDayNumber && claimedToday);
        const isCurrent = d.day === currentDayNumber && !claimedToday;
        return (
          <View key={d.day} style={[styles.card, isCurrent && styles.cardCurrent, isClaimed && styles.cardClaimed]}>
            <Text style={[styles.dayLabel, isCurrent && styles.dayLabelCurrent]}>Day {d.day}</Text>
            {isClaimed ? (
              <MaterialCommunityIcons name="check-circle" size={22} color={colors.positive} />
            ) : (
              <MaterialCommunityIcons name="circle-multiple" size={22} color={isCurrent ? colors.gold : colors.textMuted} />
            )}
            <Text style={[styles.amount, isCurrent && styles.amountCurrent]}>+{d.amount}</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  card: {
    width: 68,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
  },
  cardCurrent: { borderColor: colors.gold, backgroundColor: colors.surfaceRaised },
  cardClaimed: { opacity: 0.6 },
  dayLabel: { color: colors.textMuted, fontSize: typography.xs, fontWeight: '700', marginBottom: spacing.xs },
  dayLabelCurrent: { color: colors.gold },
  amount: { color: colors.textSecondary, fontSize: typography.xs, fontWeight: '700', marginTop: spacing.xs },
  amountCurrent: { color: colors.gold },
});
