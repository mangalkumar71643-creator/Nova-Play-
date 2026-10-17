import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AgentRewardKind, fetchAgentClaims, fetchAgentRewards } from '../api/backend';
import { inr } from '../components/agent/AgentParts';
import ScreenContainer from '../components/ScreenContainer';
import { RootStackParamList } from '../navigation/types';
import { colors, spacing, typography } from '../theme';

const KINDS: { key: AgentRewardKind | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'BET', label: 'Bet' },
  { key: 'DEPOSIT', label: 'Deposit' },
  { key: 'TASK', label: 'Task' },
  { key: 'INVITE', label: 'Invite' },
  { key: 'JACKPOT', label: 'Jackpot' },
];

const KIND_LABEL: Record<AgentRewardKind, string> = {
  BET: 'Bet rebate',
  DEPOSIT: 'Top up rebate',
  TASK: 'Cumulative invitations',
  INVITE: 'Joining reward',
  JACKPOT: 'Agent jackpot',
};

/** India-time month key, e.g. "2026-10". */
function monthKey(offset = 0) {
  const now = new Date(Date.now() + 5.5 * 3_600_000);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return d.toISOString().slice(0, 7);
}

function stamp(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** EARN → Reward details (every reward, by kind and month) and Withdrawal History (claims). */
export default function AgentRewardsScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'AgentRewards'>>();
  const [tab, setTab] = useState<'details' | 'withdrawals'>(route.params?.tab ?? 'details');
  const [kind, setKind] = useState<AgentRewardKind | 'ALL'>(route.params?.kind ?? 'ALL');
  const [month, setMonth] = useState(monthKey());
  const [monthOpen, setMonthOpen] = useState(false);
  const [rewards, setRewards] = useState<Awaited<ReturnType<typeof fetchAgentRewards>> | null>(null);
  const [claims, setClaims] = useState<Awaited<ReturnType<typeof fetchAgentClaims>> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (tab !== 'details') return;
    setRewards(null);
    setFailed(false);
    fetchAgentRewards(month, kind === 'ALL' ? undefined : kind)
      .then(setRewards)
      .catch(() => setFailed(true));
  }, [tab, kind, month]);

  useEffect(() => {
    if (tab !== 'withdrawals') return;
    setClaims(null);
    setFailed(false);
    fetchAgentClaims()
      .then(setClaims)
      .catch(() => setFailed(true));
  }, [tab]);

  const empty = (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <LinearGradient colors={['#B0152F', '#5A0E1B']} style={styles.emptyBack} />
        <LinearGradient colors={['#7E3A46', '#3A1820']} style={styles.emptyFront}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.emptyLine} />
          ))}
        </LinearGradient>
      </View>
      <Text style={styles.emptyText}>{failed ? 'Could not load' : 'No records'}</Text>
    </View>
  );

  return (
    <ScreenContainer scroll={false}>
      <LinearGradient colors={['#3A0B14', '#1A0508']} style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={30} color={colors.gold} />
        </Pressable>
        {(['details', 'withdrawals'] as const).map((t) => (
          <Pressable key={t} style={styles.tab} onPress={() => setTab(t)}>
            {tab === t ? <LinearGradient colors={['#5A0E1B', '#A0122C']} style={StyleSheet.absoluteFill} /> : null}
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t === 'details' ? 'Reward details' : 'Withdrawal History'}</Text>
            {tab === t ? <View style={styles.tabUnderline} /> : null}
          </Pressable>
        ))}
      </LinearGradient>

      {tab === 'details' ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.kindBar} contentContainerStyle={styles.kindRow}>
            {KINDS.map((k) => (
              <Pressable key={k.key} onPress={() => setKind(k.key)} style={styles.kind}>
                <Text style={[styles.kindText, kind === k.key && styles.kindTextActive]}>{k.label}</Text>
                {kind === k.key ? <View style={styles.kindUnderline} /> : null}
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.monthRow}>
            <Pressable onPress={() => setMonthOpen(true)} style={styles.monthBtn}>
              <Text style={styles.monthText}>{month}</Text>
              <MaterialCommunityIcons name="menu-down" size={26} color="#FF6B86" />
            </Pressable>
            <Text style={styles.totalText}>Total commission:{inr(rewards?.total ?? 0)}</Text>
          </View>
          <View style={styles.thead}>
            <Text style={[styles.th, { flex: 1.5, textAlign: 'left' }]}>Time</Text>
            <Text style={[styles.th, { flex: 1.1 }]}>Number of invitees</Text>
            <Text style={[styles.th, { flex: 1.2, textAlign: 'right' }]}>Commission amount</Text>
          </View>
          {!rewards && !failed ? (
            <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />
          ) : !rewards || rewards.items.length === 0 ? (
            empty
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
              {rewards.items.map((r) => (
                <View key={r.id} style={styles.row}>
                  <View style={{ flex: 1.5 }}>
                    <Text style={styles.td}>{stamp(r.earnedAt)}</Text>
                    <Text style={styles.tdSub}>{KIND_LABEL[r.kind]}</Text>
                  </View>
                  <Text style={[styles.td, { flex: 1.1, textAlign: 'center' }]}>{r.invitees || '-'}</Text>
                  <View style={{ flex: 1.2, alignItems: 'flex-end' }}>
                    <Text style={styles.tdAmount}>{inr(r.amount)}</Text>
                    <Text style={[styles.tdSub, { color: r.claimed ? colors.positive : colors.gold }]}>{r.claimed ? 'Claimed' : 'To claim'}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </>
      ) : (
        <>
          <View style={[styles.thead, { marginTop: spacing.lg }]}>
            <Text style={[styles.th, { flex: 1.5, textAlign: 'left' }]}>Time</Text>
            <Text style={[styles.th, { flex: 1.2 }]}>Commission amount</Text>
            <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>State</Text>
          </View>
          {!claims && !failed ? (
            <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />
          ) : !claims || claims.length === 0 ? (
            empty
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
              {claims.map((c) => (
                <View key={c.id} style={[styles.row, { paddingVertical: spacing.xl }]}>
                  <Text style={[styles.td, { flex: 1.5 }]}>{stamp(c.createdAt)}</Text>
                  <Text style={[styles.tdAmount, { flex: 1.2, textAlign: 'center' }]}>{inr(c.amount)}</Text>
                  <Text style={[styles.tdDone, { flex: 1, textAlign: 'right' }]}>{c.status}</Text>
                </View>
              ))}
            </ScrollView>
          )}
        </>
      )}

      <Modal visible={monthOpen} transparent animationType="fade" onRequestClose={() => setMonthOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMonthOpen(false)}>
          <View style={styles.monthSheet}>
            {Array.from({ length: 12 }, (_, i) => monthKey(-i)).map((m) => (
              <Pressable
                key={m}
                onPress={() => {
                  setMonth(m);
                  setMonthOpen(false);
                }}
                style={[styles.monthOption, m === month && styles.monthOptionActive]}
              >
                <Text style={[styles.monthOptionText, m === month && { color: colors.goldLight }]}>{m}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
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
  kindBar: { flexGrow: 0, backgroundColor: '#0E0305' },
  kindRow: { paddingHorizontal: spacing.md },
  kind: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, alignItems: 'center' },
  kindText: { color: colors.textPrimary, fontSize: typography.lg, fontWeight: '500' },
  kindTextActive: { color: colors.goldLight, fontWeight: '700' },
  kindUnderline: { height: 2, alignSelf: 'stretch', backgroundColor: colors.goldLight, marginTop: 4 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: '#0E0305' },
  monthBtn: { flexDirection: 'row', alignItems: 'center' },
  monthText: { color: '#FF6B86', fontSize: typography.lg, fontWeight: '600' },
  totalText: { color: '#FF6B86', fontSize: typography.md, fontWeight: '600' },
  thead: { flexDirection: 'row', backgroundColor: '#3A0913', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  th: { color: '#FF6B86', fontSize: typography.sm, fontWeight: '600', textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,107,134,0.2)',
  },
  td: { color: colors.textPrimary, fontSize: typography.sm, fontWeight: '600' },
  tdSub: { color: colors.textMuted, fontSize: typography.xs, marginTop: 2 },
  tdAmount: { color: colors.goldLight, fontSize: typography.md, fontWeight: '800' },
  tdDone: { color: colors.positive, fontSize: typography.md, fontWeight: '800' },
  empty: { alignItems: 'center', marginTop: 120 },
  emptyIcon: { width: 100, height: 110 },
  emptyBack: { position: 'absolute', right: 6, top: 0, width: 72, height: 86, borderRadius: 10 },
  emptyFront: { position: 'absolute', left: 6, top: 18, width: 72, height: 86, borderRadius: 10, padding: 12, justifyContent: 'center', gap: 10 },
  emptyLine: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.35)' },
  emptyText: { color: '#8A2A3B', fontSize: typography.xl, fontWeight: '600', marginTop: spacing.md },
  backdrop: { flex: 1, backgroundColor: 'rgba(6,1,3,0.7)', justifyContent: 'center', alignItems: 'center' },
  monthSheet: { width: 220, backgroundColor: '#2A060D', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,222,140,0.4)', paddingVertical: spacing.sm },
  monthOption: { paddingVertical: 10, alignItems: 'center' },
  monthOptionActive: { backgroundColor: 'rgba(240,185,61,0.12)' },
  monthOptionText: { color: colors.textPrimary, fontSize: typography.md, fontWeight: '600' },
});
