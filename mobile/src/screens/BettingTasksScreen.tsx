import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BettingTask, claimBettingTask, fetchBettingTasks } from '../api/backend';
import { ApiClientError } from '../api/client';
import { showAlert } from '../components/AppAlert';
import AppHeader from '../components/AppHeader';
import ScreenContainer from '../components/ScreenContainer';
import { useGameState } from '../state/GameStateContext';
import { colors, gradients, radius, spacing, typography } from '../theme';

// A task's category → the Home category screen its games are on.
const CATEGORY_SCREENS: Record<string, string> = {
  Lottery: 'lottery',
  Slots: 'slots',
  'Card & Table': 'card-table',
  Crash: 'crash',
  'Dice & Instant': 'dice-instant',
  'Mines & Cash-out': 'mines-cashout',
};

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/**
 * Betting tasks (Promotion → Betting tasks): "bet ₹X in <category> today /
 * this week → +₹Y". The bar fills from the player's bets in those games;
 * "Go complete" opens the category, "Claim" pays a finished one (once per
 * day / week, server-checked).
 */
export default function BettingTasksScreen() {
  const navigation = useNavigation<any>();
  const { refreshWallet } = useGameState();
  const [tab, setTab] = useState<'daily' | 'weekly'>('daily');
  const [tasks, setTasks] = useState<BettingTask[] | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setTasks((await fetchBettingTasks()).tasks);
    } catch {
      setTasks((t) => t ?? []);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function claim(t: BettingTask) {
    setClaiming(t.id);
    try {
      const r = await claimBettingTask(t.id);
      refreshWallet().catch(() => {});
      showAlert('Reward claimed!', `${inr(r.amount)} has been added to your wallet.`, undefined, { kind: 'success', highlight: inr(r.amount) });
      await load();
    } catch (err) {
      showAlert('Could not claim', err instanceof ApiClientError ? err.message : 'Please try again.');
      load();
    } finally {
      setClaiming(null);
    }
  }

  const goPlay = (t: BettingTask) => {
    const id = CATEGORY_SCREENS[t.category];
    if (id) navigation.navigate('GameCategory', { categoryId: id });
    else navigation.navigate('MainTabs', { screen: 'Home' });
  };

  const shown = (tasks ?? []).filter((t) => t.period === tab);

  return (
    <ScreenContainer scroll={false} contentStyle={{ paddingHorizontal: 0 }}>
      <AppHeader showBack title="Betting tasks" showCoins={false} showNotifications={false} showProfile={false} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl * 2 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            colors={[colors.gold]}
            tintColor={colors.gold}
            progressBackgroundColor={colors.surface}
          />
        }
      >
        <LinearGradient colors={gradients.crimsonButton} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.intro}>
          <MaterialCommunityIcons name="gift-open" size={44} color={colors.goldLight} />
          <View style={{ flex: 1 }}>
            <Text style={styles.introTitle}>Complete daily and weekly tasks to earn rewards</Text>
            <Text style={styles.introText}>1. Daily tasks reset at midnight (India time). Claim them the same day.</Text>
            <Text style={styles.introText}>2. Weekly tasks reset every Monday. Claim them before the week ends.</Text>
          </View>
        </LinearGradient>

        <View style={styles.tabs}>
          {(['daily', 'weekly'] as const).map((p) => (
            <Pressable key={p} style={[styles.tab, tab === p && styles.tabOn]} onPress={() => setTab(p)}>
              <Text style={[styles.tabText, tab === p && styles.tabTextOn]}>{p === 'daily' ? 'Daily task' : 'Weekly task'}</Text>
            </Pressable>
          ))}
        </View>

        {tasks === null ? <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} /> : null}
        {tasks !== null && shown.length === 0 ? <Text style={styles.empty}>No {tab} tasks right now. Check back soon!</Text> : null}
        {shown.map((t) => {
          const fill = Math.min(1, t.progress / t.target);
          return (
            <View key={t.id} style={styles.card}>
              <MaterialCommunityIcons
                name={t.claimed ? 'check-circle' : t.complete ? 'gift' : 'close-circle-outline'}
                size={28}
                color={t.claimed ? colors.positive : t.complete ? colors.gold : colors.textMuted}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{t.category} bet amount</Text>
                <Text style={styles.cardProgress}>
                  {Math.floor(t.progress).toLocaleString('en-IN')}/{t.target.toLocaleString('en-IN')}
                </Text>
                <View style={styles.bar}>
                  <View style={[styles.barFill, { width: `${fill * 100}%` }]} />
                </View>
              </View>
              <View style={{ alignItems: 'center', gap: 6 }}>
                <Text style={styles.reward}>+{inr(t.reward)}</Text>
                {t.claimed ? (
                  <Text style={styles.claimed}>Claimed</Text>
                ) : t.complete ? (
                  <Pressable onPress={() => claim(t)} disabled={claiming === t.id}>
                    <LinearGradient colors={gradients.goldButton} style={styles.claimBtn}>
                      {claiming === t.id ? <ActivityIndicator color="#2A1300" /> : <Text style={styles.claimText}>Claim</Text>}
                    </LinearGradient>
                  </Pressable>
                ) : (
                  <Pressable onPress={() => goPlay(t)} style={styles.goBtn}>
                    <Text style={styles.goText}>Go complete</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  intro: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.sm },
  introTitle: { color: colors.goldLight, fontWeight: '900', fontSize: typography.md, marginBottom: 4 },
  introText: { color: colors.textPrimary, fontSize: typography.xs, lineHeight: 17 },
  tabs: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, marginTop: spacing.md, marginBottom: spacing.sm, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  tab: { flex: 1, paddingVertical: spacing.md, alignItems: 'center' },
  tabOn: { backgroundColor: colors.crimson },
  tabText: { color: colors.textSecondary, fontWeight: '700', fontSize: typography.md },
  tabTextOn: { color: colors.textPrimary },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl, fontSize: typography.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  cardTitle: { color: colors.textSecondary, fontSize: typography.sm },
  cardProgress: { color: colors.textPrimary, fontSize: typography.md, fontWeight: '700', marginTop: 2 },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, marginTop: 6, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: colors.gold },
  reward: { color: colors.gold, fontWeight: '900', fontSize: typography.md },
  goBtn: { borderWidth: 1.5, borderColor: colors.gold, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  goText: { color: colors.gold, fontWeight: '800', fontSize: typography.sm },
  claimBtn: { borderRadius: 999, paddingVertical: 7, paddingHorizontal: 18, minWidth: 80, alignItems: 'center' },
  claimText: { color: '#2A1300', fontWeight: '900', fontSize: typography.sm },
  claimed: { color: colors.positive, fontWeight: '800', fontSize: typography.sm },
});
