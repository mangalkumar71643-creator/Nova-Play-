import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fetchWalletHistory, WalletHistory, WalletHistoryKind } from '../api/backend';
import ScreenContainer from '../components/ScreenContainer';
import { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing, typography } from '../theme';

type Range = 0 | 1 | 7 | 30;

const RANGES: { label: string; days: Range }[] = [
  { label: 'All', days: 0 },
  { label: '1 Day', days: 1 },
  { label: '7 Days', days: 7 },
  { label: '30 Days', days: 30 },
];

/**
 * Deposit history (from the Deposit screen) or withdrawal history (from the
 * Withdraw screen), each with its all-time total on top. Opened from Wallet
 * with no kind, it shows a Deposit / Withdraw switch instead.
 */
export default function HistoryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const fixedKind = useRoute<RouteProp<RootStackParamList, 'History'>>().params?.kind;
  const [pickedKind, setPickedKind] = useState<WalletHistoryKind>('deposit');
  const kind = fixedKind ?? pickedKind;
  const isDeposit = kind === 'deposit';
  const [range, setRange] = useState<Range>(0);
  const [history, setHistory] = useState<WalletHistory | null>(null);
  const [failed, setFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setFailed(false);
      setHistory(null);
      fetchWalletHistory(kind)
        .then((h) => !cancelled && setHistory(h))
        .catch(() => !cancelled && setFailed(true));
      return () => {
        cancelled = true;
      };
    }, [kind])
  );

  const cutoff = range === 0 ? 0 : Date.now() - range * 24 * 60 * 60 * 1000;
  const records = (history?.items ?? []).filter((t) => new Date(t.createdAt).getTime() >= cutoff);

  return (
    <ScreenContainer scroll={false}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={colors.gold} />
        </Pressable>
        <Text style={styles.headerTitle}>{fixedKind ? (isDeposit ? 'Deposit History' : 'Withdraw History') : 'History'}</Text>
        <View style={styles.backButton} />
      </View>

      {!fixedKind && (
        <View style={styles.switchRow}>
          {(['deposit', 'withdraw'] as const).map((k) => (
            <Pressable key={k} onPress={() => setPickedKind(k)} style={[styles.switchItem, kind === k && styles.switchItemActive]}>
              <Text style={[styles.switchLabel, kind === k && styles.switchLabelActive]}>{k === 'deposit' ? 'Deposit' : 'Withdraw'}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>{isDeposit ? 'Total deposited' : 'Total withdrawn'}</Text>
        <Text style={styles.summaryValue}>₹{(history?.total ?? 0).toLocaleString('en-IN')}</Text>
        <Text style={styles.summaryNote}>
          {history ? `${history.count} ${isDeposit ? 'deposit' : 'withdrawal'}${history.count === 1 ? '' : 's'} so far` : ' '}
        </Text>
        {!isDeposit && !!history?.pending && (
          <Text style={styles.summaryPending}>₹{history.pending.toLocaleString('en-IN')} waiting for approval</Text>
        )}
      </View>

      <View style={styles.tabRow}>
        {RANGES.map((r) => (
          <Pressable key={r.days} style={styles.tab} onPress={() => setRange(r.days)}>
            <Text style={[styles.tabLabel, range === r.days && styles.tabLabelActive]}>{r.label}</Text>
          </Pressable>
        ))}
      </View>

      {!history && !failed ? (
        <View style={styles.body}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : records.length === 0 ? (
        <View style={styles.body}>
          <MaterialCommunityIcons name="clipboard-text-clock-outline" size={64} color={colors.crimsonLight} style={{ opacity: 0.35 }} />
          <Text style={styles.emptyText}>{failed ? 'Could not load. Please try again.' : 'No records'}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {records.map((t) => (
            <View key={t.id} style={styles.row}>
              <View style={styles.rowIconWrap}>
                <MaterialCommunityIcons name={isDeposit ? 'bank-transfer-in' : 'bank-transfer-out'} size={20} color={colors.gold} />
              </View>
              <View style={styles.rowMiddle}>
                <Text style={styles.rowTitle}>{isDeposit ? 'Deposit' : 'Withdrawal'}</Text>
                <Text style={styles.rowTimestamp}>{new Date(t.createdAt).toLocaleString()}</Text>
                {t.status === 'PENDING' ? (
                  <Text style={styles.rowStatusPending}>{isDeposit ? 'Pending' : 'Pending admin approval'}</Text>
                ) : t.status === 'FAILED' ? (
                  <Text style={styles.rowStatusFailed}>{isDeposit ? 'Failed' : 'Rejected — refunded'}</Text>
                ) : (
                  <Text style={styles.rowStatusDone}>{isDeposit ? 'Successful' : 'Paid'}</Text>
                )}
              </View>
              <Text style={[styles.rowAmount, !isDeposit && styles.rowAmountNegative]}>
                {isDeposit ? '+' : '-'}₹{t.amount.toLocaleString('en-IN')}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    backgroundColor: colors.backgroundAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: colors.gold, fontSize: typography.xl, fontWeight: '800' },
  switchRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 3,
  },
  switchItem: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.pill },
  switchItemActive: { backgroundColor: colors.gold },
  switchLabel: { color: colors.textSecondary, fontSize: typography.md, fontWeight: '700' },
  switchLabelActive: { color: colors.background },
  summary: {
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    paddingVertical: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  summaryLabel: { color: colors.textSecondary, fontSize: typography.sm, fontWeight: '600' },
  summaryValue: { color: colors.gold, fontSize: typography.display, fontWeight: '900', marginTop: 2 },
  summaryNote: { color: colors.textMuted, fontSize: typography.xs, marginTop: 2 },
  summaryPending: { color: colors.goldLight, fontSize: typography.xs, fontWeight: '700', marginTop: 4 },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.md,
  },
  tab: { flex: 1, alignItems: 'center' },
  tabLabel: { color: colors.textPrimary, fontSize: typography.lg, fontWeight: '600' },
  tabLabelActive: { color: colors.gold },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxl },
  emptyText: {
    color: colors.crimsonLight,
    opacity: 0.8,
    fontSize: typography.lg,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  list: { paddingTop: spacing.md, paddingBottom: 120 },
  row: {
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
  rowIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  rowMiddle: { flex: 1 },
  rowTitle: { color: colors.textPrimary, fontWeight: '700', fontSize: typography.sm },
  rowTimestamp: { color: colors.textMuted, fontSize: typography.xs, marginTop: 2 },
  rowStatusPending: { color: colors.gold, fontSize: typography.xs, fontWeight: '700', marginTop: 2 },
  rowStatusDone: { color: colors.positive, fontSize: typography.xs, fontWeight: '700', marginTop: 2 },
  rowStatusFailed: { color: colors.negative, fontSize: typography.xs, fontWeight: '700', marginTop: 2 },
  rowAmount: { color: colors.positive, fontWeight: '800', fontSize: typography.md },
  rowAmountNegative: { color: colors.negative },
});
