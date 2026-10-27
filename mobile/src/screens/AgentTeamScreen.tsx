import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fetchAgentTeam } from '../api/backend';
import { inr } from '../components/agent/AgentParts';
import ScreenContainer from '../components/ScreenContainer';
import { AVATARS } from '../data/avatars';
import { colors, spacing, typography } from '../theme';

/** EARN → Team: my subordinates, one level (1-6) at a time. */
export default function AgentTeamScreen() {
  const navigation = useNavigation();
  const [depth, setDepth] = useState(1);
  const [team, setTeam] = useState<Awaited<ReturnType<typeof fetchAgentTeam>> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setTeam(null);
    setFailed(false);
    fetchAgentTeam(depth)
      .then(setTeam)
      .catch(() => setFailed(true));
  }, [depth]);

  const total = team?.counts.reduce((s, c) => s + c.count, 0) ?? 0;

  return (
    <ScreenContainer scroll={false}>
      <LinearGradient colors={['#3A0B14', '#1A0508']} style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={30} color={colors.gold} />
        </Pressable>
        <Text style={styles.title}>My Team</Text>
        <View style={styles.back} />
      </LinearGradient>

      <LinearGradient colors={['#6A1222', '#3A0913']} style={styles.summary}>
        <View style={styles.sumCell}>
          <Text style={styles.sumLabel}>Team size</Text>
          <Text style={styles.sumValue}>{total}</Text>
        </View>
        <View style={styles.sumDivider} />
        <View style={styles.sumCell}>
          <Text style={styles.sumLabel}>Level {depth} members</Text>
          <Text style={styles.sumValue}>{team?.counts.find((c) => c.depth === depth)?.count ?? 0}</Text>
        </View>
      </LinearGradient>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.levels}>
        {Array.from({ length: 6 }, (_, i) => i + 1).map((d) => {
          const active = d === depth;
          const count = team?.counts.find((c) => c.depth === d)?.count;
          return (
            <Pressable key={d} onPress={() => setDepth(d)}>
              <LinearGradient colors={active ? ['#FF4A63', '#A0122C'] : ['#3A0913', '#22060C']} style={styles.levelChip}>
                <Text style={[styles.levelChipText, active && { color: '#FFFFFF' }]}>
                  Level {d}
                  {count !== undefined ? ` (${count})` : ''}
                </Text>
              </LinearGradient>
            </Pressable>
          );
        })}
      </ScrollView>

      {!team && !failed ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />
      ) : !team || team.members.length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="account-group-outline" size={64} color="#8A2A3B" />
          <Text style={styles.emptyText}>{failed ? 'Could not load' : `No level ${depth} members yet`}</Text>
          {depth === 1 && !failed ? <Text style={styles.emptyHint}>Share your invite code from the EARN page to build your team.</Text> : null}
        </View>
      ) : (
        <ScrollView nestedScrollEnabled contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}>
          {team.members.map((m, i) => (
            <LinearGradient key={`${m.name}-${i}`} colors={['#4A0B17', '#24050B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.member}>
              <Image source={AVATARS[(Number(m.name.replace(/\D/g, '')) || i) % AVATARS.length]} style={styles.avatar} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{m.name}</Text>
                <Text style={styles.joined}>Joined {new Date(m.joinedAt).toLocaleDateString()}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.betting}>{inr(m.betting)}</Text>
                <Text style={styles.bettingLabel}>total bets</Text>
                <Text style={[styles.tag, m.deposited ? styles.tagOn : styles.tagOff]}>{m.deposited ? 'Deposited' : 'No deposit yet'}</Text>
              </View>
            </LinearGradient>
          ))}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', height: 64, borderBottomWidth: 1, borderBottomColor: 'rgba(255,45,85,0.35)' },
  back: { width: 56, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: colors.goldLight, fontSize: typography.xl, fontWeight: '800', textAlign: 'center' },
  summary: { flexDirection: 'row', margin: spacing.lg, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,222,140,0.4)', paddingVertical: spacing.lg },
  sumCell: { flex: 1, alignItems: 'center' },
  sumDivider: { width: 1, backgroundColor: 'rgba(255,222,140,0.3)' },
  sumLabel: { color: '#FF8A9D', fontSize: typography.sm, fontWeight: '600' },
  sumValue: { color: colors.goldLight, fontSize: 26, fontWeight: '900', marginTop: 2 },
  levels: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.md },
  levelChip: { borderRadius: 999, paddingHorizontal: spacing.lg, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,107,134,0.35)' },
  levelChipText: { color: '#FF8A9D', fontSize: typography.sm, fontWeight: '700' },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,222,140,0.22)',
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: colors.gold },
  name: { color: colors.textPrimary, fontSize: typography.md, fontWeight: '700' },
  joined: { color: colors.textMuted, fontSize: typography.xs, marginTop: 2 },
  betting: { color: colors.goldLight, fontSize: typography.md, fontWeight: '800' },
  bettingLabel: { color: colors.textMuted, fontSize: 10 },
  tag: { fontSize: 10, fontWeight: '800', marginTop: 4, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, overflow: 'hidden' },
  tagOn: { color: colors.positive, backgroundColor: 'rgba(62,207,142,0.12)' },
  tagOff: { color: colors.textMuted, backgroundColor: 'rgba(255,255,255,0.06)' },
  empty: { alignItems: 'center', marginTop: 80, paddingHorizontal: spacing.xl },
  emptyText: { color: '#B04A5C', fontSize: typography.lg, fontWeight: '600', marginTop: spacing.md },
  emptyHint: { color: colors.textMuted, fontSize: typography.sm, textAlign: 'center', marginTop: spacing.sm },
});
