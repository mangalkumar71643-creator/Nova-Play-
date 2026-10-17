import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fetchJackpotHistory, fetchJackpotRanking, JackpotEntry } from '../api/backend';
import { inr, useCountdown } from '../components/agent/AgentParts';
import ScreenContainer from '../components/ScreenContainer';
import { AVATARS } from '../data/avatars';
import { RootStackParamList } from '../navigation/types';
import { colors, spacing, typography } from '../theme';

const MEDALS = ['#FFC93D', '#D9DEF2', '#F0A060'];

function weekLabel(weekKey: string) {
  const start = new Date(`${weekKey}T00:00:00Z`);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  const f = (d: Date) => `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`;
  return `${f(start)} – ${f(end)}`;
}

function RankRow({ e }: { e: JackpotEntry }) {
  return (
    <LinearGradient
      colors={e.isMe ? ['#7A5A1C', '#3A2006'] : ['#4A0B17', '#24050B']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.row, e.isMe && { borderColor: colors.gold }]}
    >
      <View style={styles.rankCell}>
        {e.rank <= 3 ? (
          <>
            <MaterialCommunityIcons name="crown" size={28} color={MEDALS[e.rank - 1]} />
            <Text style={styles.medalNum}>{e.rank}</Text>
          </>
        ) : (
          <Text style={styles.rankText}>{e.rank}</Text>
        )}
      </View>
      <Image source={AVATARS[((e.uid ?? e.rank) % AVATARS.length + AVATARS.length) % AVATARS.length]} style={styles.avatar} />
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>
          {e.name}
          {e.isMe ? ' (You)' : ''}
        </Text>
        <Text style={styles.commission}>Commission {inr(e.commission)}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.prize}>{inr(e.prize)}</Text>
        <Text style={styles.percent}>{e.percent.toFixed(2)}%</Text>
      </View>
    </LinearGradient>
  );
}

/** EARN → Agent Jackpot: this week's full ranking, and past weeks' winners. */
export default function AgentJackpotScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'AgentJackpot'>>();
  const [tab, setTab] = useState<'ranking' | 'history'>(route.params?.tab ?? 'ranking');
  const [ranking, setRanking] = useState<Awaited<ReturnType<typeof fetchJackpotRanking>> | null>(null);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof fetchJackpotHistory>> | null>(null);
  const [failed, setFailed] = useState(false);
  const countdown = useCountdown(ranking?.endsAt);

  useEffect(() => {
    fetchJackpotRanking()
      .then(setRanking)
      .catch(() => setFailed(true));
    fetchJackpotHistory()
      .then(setHistory)
      .catch(() => setFailed(true));
  }, []);

  return (
    <ScreenContainer scroll={false}>
      <LinearGradient colors={['#3A0B14', '#1A0508']} style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={30} color={colors.gold} />
        </Pressable>
        {(['ranking', 'history'] as const).map((t) => (
          <Pressable key={t} style={styles.tab} onPress={() => setTab(t)}>
            {tab === t ? <LinearGradient colors={['#5A0E1B', '#A0122C']} style={StyleSheet.absoluteFill} /> : null}
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t === 'ranking' ? 'This week' : 'History'}</Text>
            {tab === t ? <View style={styles.tabUnderline} /> : null}
          </Pressable>
        ))}
      </LinearGradient>

      {tab === 'ranking' ? (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
          <LinearGradient colors={['#8A1A2C', '#3A0913']} style={styles.poolCard}>
            <Text style={styles.poolLabel}>AGENT JACKPOT POOL</Text>
            <Text style={styles.poolValue}>{inr(ranking?.pool ?? 0)}</Text>
            <View style={styles.countdown}>
              <MaterialCommunityIcons name="alarm" size={16} color="#FF8A3D" />
              <Text style={styles.countdownText}>Ends in {countdown}</Text>
            </View>
            <Text style={styles.poolHint}>Earn at least {inr(ranking?.minCommission ?? 30)} commission this week to enter the ranking.</Text>
          </LinearGradient>
          {!ranking && !failed ? (
            <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />
          ) : !ranking || ranking.list.length === 0 ? (
            <Text style={styles.empty}>No agent has reached the ranking this week yet. Be the first!</Text>
          ) : (
            ranking.list.map((e) => <RankRow key={e.rank} e={e} />)
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
          {!history && !failed ? (
            <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />
          ) : !history || history.length === 0 ? (
            <Text style={styles.empty}>No finished weeks yet. Results appear here after each Sunday.</Text>
          ) : (
            history.map((w) => (
              <LinearGradient key={w.weekKey} colors={['#4A0B17', '#1C0408']} style={styles.weekCard}>
                <Text style={styles.weekTitle}>{weekLabel(w.weekKey)}</Text>
                <View style={styles.weekStats}>
                  <Text style={styles.weekStat}>Pool {inr(w.pool)}</Text>
                  <Text style={styles.weekStat}>Paid {inr(w.paid)}</Text>
                  <Text style={styles.weekStat}>Rolled over {inr(w.rolledOver)}</Text>
                </View>
                {w.winners.length === 0 ? (
                  <Text style={styles.weekNone}>No agent qualified — the pool moved to the next week.</Text>
                ) : (
                  w.winners.map((e) => <RankRow key={e.rank} e={e} />)
                )}
              </LinearGradient>
            ))
          )}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'stretch', height: 64, borderBottomWidth: 1, borderBottomColor: 'rgba(255,45,85,0.35)' },
  back: { width: 56, alignItems: 'center', justifyContent: 'center' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  tabText: { color: colors.textPrimary, fontSize: typography.md, fontWeight: '600' },
  tabTextActive: { color: colors.goldLight, fontWeight: '800' },
  tabUnderline: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: '#FF2D55' },
  poolCard: { borderRadius: 18, borderWidth: 1.5, borderColor: 'rgba(255,222,140,0.6)', padding: spacing.lg, alignItems: 'center', marginBottom: spacing.lg },
  poolLabel: { color: colors.gold, fontSize: typography.xs, fontWeight: '900', letterSpacing: 2 },
  poolValue: {
    color: colors.goldLight,
    fontSize: 38,
    fontWeight: '900',
    marginTop: 4,
    textShadowColor: 'rgba(255,184,61,0.6)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  countdown: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  countdownText: { color: colors.goldLight, fontSize: typography.md, fontWeight: '700' },
  poolHint: { color: colors.textMuted, fontSize: typography.xs, marginTop: spacing.sm, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,222,140,0.2)',
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  rankCell: { width: 36, alignItems: 'center', justifyContent: 'center' },
  rankText: { color: colors.textSecondary, fontSize: typography.lg, fontWeight: '800' },
  medalNum: { position: 'absolute', top: 9, color: '#5C3A0E', fontSize: 11, fontWeight: '900' },
  avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: colors.gold },
  name: { color: colors.textPrimary, fontSize: typography.sm, fontWeight: '700' },
  commission: { color: colors.textMuted, fontSize: typography.xs, marginTop: 2 },
  prize: { color: colors.goldLight, fontSize: typography.md, fontWeight: '900' },
  percent: { color: '#FF8A9D', fontSize: typography.xs, fontWeight: '700' },
  empty: { color: colors.textMuted, fontSize: typography.sm, textAlign: 'center', marginTop: spacing.xl },
  weekCard: { borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,222,140,0.35)', padding: spacing.md, marginBottom: spacing.lg },
  weekTitle: { color: colors.goldLight, fontSize: typography.lg, fontWeight: '800' },
  weekStats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginVertical: spacing.sm },
  weekStat: { color: colors.textSecondary, fontSize: typography.xs, fontWeight: '600' },
  weekNone: { color: colors.textMuted, fontSize: typography.sm },
});
