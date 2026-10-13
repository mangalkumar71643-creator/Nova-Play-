import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { BalanceRecord, BalanceRecordFilter, fetchBalanceRecords } from '../api/backend';
import ScreenContainer from '../components/ScreenContainer';
import { RootStackParamList } from '../navigation/types';
import { colors, spacing, typography } from '../theme';

function recordLabel(r: BalanceRecord): string {
  switch (r.type) {
    case 'GAME_STAKE':
    case 'BET_STAKE':
      return 'Bet';
    case 'GAME_PAYOUT':
    case 'BET_PAYOUT':
      return 'Game win';
    case 'BET_REFUND':
      return 'Bet refund';
    case 'DEPOSIT':
      return r.status === 'COMPLETED' ? 'Deposit' : r.status === 'PENDING' ? 'Deposit (pending)' : 'Deposit (failed)';
    case 'WITHDRAWAL':
      return r.status === 'PENDING' ? 'Withdrawal (pending)' : r.status === 'FAILED' ? 'Withdrawal (rejected)' : 'Withdrawal';
    case 'WITHDRAWAL_REVERSAL':
      return 'Withdrawal refunded';
    case 'DEPOSIT_BONUS':
      return 'Deposit bonus';
    case 'BONUS':
      if (r.provider === 'gift-code') return 'Gift code';
      if (r.provider === 'admin-credit') return 'Balance added';
      if (r.provider === 'vip-upgrade') return 'VIP upgrade bonus';
      if (r.provider === 'vip-weekly') return 'VIP weekly bonus';
      return 'Bonus';
    default:
      return r.type;
  }
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatMoney(n: number) {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

/** Every change to the balance — each bet, win, bonus, deposit and withdrawal — with the balance after it. */
export default function BalanceRecordsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [tab, setTab] = useState<BalanceRecordFilter>('all');
  const [records, setRecords] = useState<BalanceRecord[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // Ignores replies from a tab the player has already left.
  const requestId = useRef(0);

  const load = useCallback(async (filter: BalanceRecordFilter, before?: string) => {
    const id = ++requestId.current;
    setLoading(true);
    setFailed(false);
    try {
      const page = await fetchBalanceRecords(filter, before);
      if (id !== requestId.current) return;
      setRecords((prev) => (before ? [...prev, ...page.items] : page.items));
      setHasMore(page.hasMore);
    } catch {
      if (id === requestId.current) setFailed(true);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setRecords([]);
      load(tab);
    }, [tab, load])
  );

  const loadMore = () => {
    if (!loading && hasMore && records.length) load(tab, records[records.length - 1].id);
  };

  return (
    <ScreenContainer scroll={false}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={colors.gold} />
        </Pressable>
        <Text style={styles.headerTitle}>Detail</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.tabRow}>
        {(['all', 'income', 'expense'] as const).map((t) => (
          <Pressable key={t} style={styles.tab} onPress={() => setTab(t)}>
            <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
              {t === 'all' ? 'All' : t === 'income' ? 'Income' : 'Expense'}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.tableHeader}>
        <Text style={[styles.tableHeaderCell, styles.tableHeaderType]}>Type</Text>
        <Text style={[styles.tableHeaderCell, styles.tableHeaderMuted]}>Change</Text>
        <Text style={[styles.tableHeaderCell, styles.tableHeaderMuted]}>Balance</Text>
      </View>

      {records.length === 0 ? (
        <View style={styles.body}>
          {loading ? (
            <ActivityIndicator color={colors.gold} />
          ) : (
            <>
              <MaterialCommunityIcons name="text-box-multiple-outline" size={64} color={colors.crimsonLight} style={{ opacity: 0.35 }} />
              <Text style={styles.emptyText}>{failed ? 'Could not load. Please try again.' : 'No record'}</Text>
            </>
          )}
        </View>
      ) : (
        <FlatList
          data={records}
          keyExtractor={(r) => r.id}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          contentContainerStyle={{ paddingBottom: 120 }}
          ListFooterComponent={loading ? <ActivityIndicator color={colors.gold} style={{ marginVertical: spacing.lg }} /> : null}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.cellType}>
                <Text style={styles.rowType} numberOfLines={1}>
                  {recordLabel(item)}
                </Text>
                <Text style={styles.rowDate}>{formatDate(item.createdAt)}</Text>
              </View>
              <Text
                style={[styles.cellChange, item.change > 0 ? styles.changeUp : item.change < 0 ? styles.changeDown : styles.changeNone]}
                numberOfLines={1}
              >
                {item.change > 0 ? '+' : item.change < 0 ? '-' : ''}₹{formatMoney(Math.abs(item.change || item.amount))}
              </Text>
              <Text style={styles.cellBalance} numberOfLines={1}>
                {formatMoney(item.balanceAfter)}
              </Text>
            </View>
          )}
        />
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
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: colors.crimsonDark,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  tableHeaderCell: { flex: 1, fontSize: typography.md, fontWeight: '700' },
  tableHeaderType: { color: colors.gold, flex: 1.3 },
  tableHeaderMuted: { color: colors.crimsonLight, textAlign: 'center' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cellType: { flex: 1.3 },
  rowType: { color: colors.textPrimary, fontSize: typography.md, fontWeight: '600' },
  rowDate: { color: colors.textSecondary, fontSize: typography.xs, marginTop: 3 },
  cellChange: { flex: 1, textAlign: 'center', fontSize: typography.md, fontWeight: '700' },
  changeUp: { color: colors.positive },
  changeDown: { color: colors.negative },
  changeNone: { color: colors.textMuted },
  cellBalance: { flex: 1, textAlign: 'center', color: colors.goldLight, fontSize: typography.md, fontWeight: '600' },
  emptyText: {
    color: colors.crimsonLight,
    opacity: 0.8,
    fontSize: typography.lg,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
