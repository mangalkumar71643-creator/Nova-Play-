import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchRanking, Ranking } from '../api/backend';
import AppHeader from '../components/AppHeader';
import ScreenContainer from '../components/ScreenContainer';
import { AVATARS } from '../data/avatars';
import { useAuth } from '../state/AuthContext';
import { useGameState } from '../state/GameStateContext';
import { colors, radius, spacing, typography } from '../theme';

type Tab = 'leaderboard' | 'myrank';

const MEDAL_COLORS = ['#F0B93D', '#C9D1DA', '#CD8B4E'];

function money(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/** Players ranked by what they won in games over the last 7 days (from the server). */
export default function RankingScreen() {
  const { notifications } = useGameState();
  const { avatarId } = useAuth();
  const [tab, setTab] = useState<Tab>('leaderboard');
  const [ranking, setRanking] = useState<Ranking | null>(null);
  const [failed, setFailed] = useState(false);
  const hasUnread = notifications.some((n) => !n.read);

  useFocusEffect(
    useCallback(() => {
      setFailed(false);
      fetchRanking()
        .then(setRanking)
        .catch(() => setFailed(true));
    }, [])
  );

  const myAvatar = AVATARS[avatarId - 1];
  const meCard = ranking && (
    <View style={styles.meCard}>
      <Image source={myAvatar} style={styles.meAvatar} />
      <View style={styles.meInfo}>
        <Text style={styles.meName}>You</Text>
        <Text style={styles.meWon}>Won {money(ranking.me.won)} in {ranking.periodDays} days</Text>
      </View>
      <Text style={styles.meRank}>{ranking.me.rank ? `#${ranking.me.rank}` : '—'}</Text>
    </View>
  );

  return (
    <ScreenContainer>
      <AppHeader title="Ranking" hasUnreadNotifications={hasUnread} showCoins={false} />

      <View style={styles.tabRow}>
        <Pressable onPress={() => setTab('leaderboard')} style={[styles.tab, tab === 'leaderboard' && styles.tabActive]}>
          <Text style={[styles.tabText, tab === 'leaderboard' && styles.tabTextActive]}>Leaderboard</Text>
        </Pressable>
        <Pressable onPress={() => setTab('myrank')} style={[styles.tab, tab === 'myrank' && styles.tabActive]}>
          <Text style={[styles.tabText, tab === 'myrank' && styles.tabTextActive]}>My Rank</Text>
        </Pressable>
      </View>

      {!ranking ? (
        <View style={styles.wrap}>
          {failed ? <Text style={styles.emptyText}>Could not load the ranking. Please try again.</Text> : <ActivityIndicator color={colors.gold} />}
        </View>
      ) : tab === 'leaderboard' ? (
        <View style={styles.wrap}>
          <Text style={styles.periodText}>Top winners · last {ranking.periodDays} days</Text>
          {meCard}
          {ranking.top.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="account-group-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>No winners yet this week.</Text>
              <Text style={styles.emptyHint}>Win in any game to get on the leaderboard.</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {ranking.top.map((p) => (
                <View key={p.rank} style={[styles.row, p.isMe && styles.rowMe]}>
                  {p.rank <= 3 ? (
                    <MaterialCommunityIcons name="crown" size={22} color={MEDAL_COLORS[p.rank - 1]} style={styles.rankCell} />
                  ) : (
                    <Text style={[styles.rankCell, styles.rankText]}>{p.rank}</Text>
                  )}
                  <Image source={AVATARS[(p.rank - 1) % AVATARS.length]} style={styles.rowAvatar} />
                  <Text style={styles.rowName} numberOfLines={1}>
                    {p.isMe ? 'You' : p.name}
                  </Text>
                  <Text style={styles.rowWon}>{money(p.won)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      ) : (
        <View style={styles.wrap}>
          <Text style={styles.myRankBig}>{ranking.me.rank ? `#${ranking.me.rank}` : '—'}</Text>
          <Text style={styles.myRankLabel}>
            {ranking.me.rank ? `out of ${ranking.players} players this week` : 'Not ranked yet'}
          </Text>
          {meCard}
          <Text style={styles.myRankHint}>
            Players are ranked by how much they won in games over the last {ranking.periodDays} days. Win in any game to move up.
          </Text>
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  tabRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, marginTop: spacing.md },
  tab: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.gold },
  tabText: { color: colors.textMuted, fontSize: typography.sm, fontWeight: '700' },
  tabTextActive: { color: colors.gold },
  wrap: { alignItems: 'center', paddingTop: spacing.xl, paddingHorizontal: spacing.lg, paddingBottom: 120 },
  meCard: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    padding: spacing.lg,
  },
  meAvatar: { width: 48, height: 48, borderRadius: 24, marginRight: spacing.md },
  meInfo: { flex: 1 },
  meName: { color: colors.textPrimary, fontWeight: '800', fontSize: typography.md },
  meWon: { color: colors.gold, fontWeight: '700', fontSize: typography.sm, marginTop: spacing.xs },
  meRank: { color: colors.gold, fontWeight: '900', fontSize: typography.xl },
  periodText: { color: colors.textSecondary, fontSize: typography.sm, fontWeight: '700', marginBottom: spacing.md },
  list: { alignSelf: 'stretch', marginTop: spacing.lg, gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  rowMe: { borderColor: colors.gold },
  rankCell: { width: 30, textAlign: 'center' },
  rankText: { color: colors.textSecondary, fontWeight: '800', fontSize: typography.md },
  rowAvatar: { width: 34, height: 34, borderRadius: 17, marginHorizontal: spacing.sm },
  rowName: { flex: 1, color: colors.textPrimary, fontWeight: '700', fontSize: typography.sm },
  rowWon: { color: colors.positive, fontWeight: '800', fontSize: typography.sm },
  emptyState: { alignItems: 'center', marginTop: spacing.xxxl, gap: spacing.sm },
  emptyText: { color: colors.textSecondary, fontSize: typography.sm, fontWeight: '700', textAlign: 'center' },
  emptyHint: { color: colors.textMuted, fontSize: typography.xs, textAlign: 'center', paddingHorizontal: spacing.lg },
  myRankBig: { color: colors.gold, fontSize: 56, fontWeight: '800' },
  myRankLabel: { color: colors.textSecondary, fontSize: typography.sm, marginTop: spacing.xs, marginBottom: spacing.xl },
  myRankHint: { color: colors.textMuted, fontSize: typography.xs, marginTop: spacing.lg, textAlign: 'center' },
});
