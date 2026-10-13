import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { Alert, Platform, Pressable, Share, StyleSheet, Switch, Text, View } from 'react-native';
import DailyRewardTrack from '../components/DailyRewardTrack';
import RewardPopup from '../components/RewardPopup';
import ScreenContainer from '../components/ScreenContainer';
import { dailyRewardTrack } from '../data/mockData';
import { BottomTabParamList } from '../navigation/types';
import { useGameState } from '../state/GameStateContext';
import { colors, gradients, radius, spacing, typography } from '../theme';

type Tab = 'daily' | 'invitation' | 'rules';

function comingSoon(label: string) {
  if (Platform.OS === 'web') {
    window.alert(`${label} — coming soon.`);
    return;
  }
  Alert.alert(label, 'Coming soon.');
}

const INVITATION_MILESTONES: { count: number; reward: number }[] = [
  { count: 3, reward: 30 },
  { count: 5, reward: 120 },
  { count: 10, reward: 144 },
  { count: 15, reward: 180 },
  { count: 20, reward: 540 },
];

export default function RewardsScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<BottomTabParamList>>();
  const { streak, claimedToday, claimDailyReward } = useGameState();
  const [tab, setTab] = useState<Tab>('daily');
  const [shareInHindi, setShareInHindi] = useState(false);
  const [popup, setPopup] = useState<{ amount: number; title: string } | null>(null);

  async function handleClaimDaily() {
    if (claimedToday) return;
    const result = await claimDailyReward();
    if (!result) return;
    setPopup({ amount: result.amount, title: `Day ${((result.streak - 1) % dailyRewardTrack.length) + 1} Reward` });
  }

  // No referral backend exists yet, so these totals are genuinely zero
  // rather than numbers baked into a design.
  const totalInvitees = 0;
  const nextMilestone = INVITATION_MILESTONES.find((m) => totalInvitees < m.count) ?? null;

  const handleShare = async () => {
    try {
      await Share.share({
        message: shareInHindi
          ? 'NovaPlay join karo aur coins jeeto!'
          : 'Join me on NovaPlay and earn coins!',
      });
    } catch {
      // user cancelled the share sheet — nothing to do
    }
  };

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.navigate('Home')} style={styles.backButton}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.gold} />
        </Pressable>
        <View style={styles.tabRow}>
          <Pressable style={[styles.tab, tab === 'daily' && styles.tabActive]} onPress={() => setTab('daily')}>
            <Text style={[styles.tabText, tab === 'daily' && styles.tabTextActive]}>Daily Mission</Text>
          </Pressable>
          <Pressable style={[styles.tab, tab === 'invitation' && styles.tabActive]} onPress={() => setTab('invitation')}>
            <Text style={[styles.tabText, tab === 'invitation' && styles.tabTextActive]}>Invitation rewards</Text>
          </Pressable>
          <Pressable style={[styles.tab, tab === 'rules' && styles.tabActive]} onPress={() => setTab('rules')}>
            <Text style={[styles.tabText, tab === 'rules' && styles.tabTextActive]}>Rules</Text>
          </Pressable>
        </View>
      </View>

      {tab === 'daily' ? (
        <>
          <View style={{ marginTop: spacing.lg }}>
            <DailyRewardTrack days={dailyRewardTrack} streak={streak} claimedToday={claimedToday} />
          </View>
          <View style={styles.claimDailyRow}>
            <Pressable
              onPress={handleClaimDaily}
              disabled={claimedToday}
              style={[styles.claimDailyButton, claimedToday && styles.claimDailyButtonDisabled]}
            >
              <MaterialCommunityIcons name="gift" size={18} color={claimedToday ? colors.textMuted : colors.background} />
              <Text style={[styles.claimDailyText, claimedToday && styles.claimDailyTextDisabled]}>
                {claimedToday ? 'Come back tomorrow' : 'Claim Daily Reward'}
              </Text>
            </Pressable>
          </View>
        </>
      ) : null}

      {tab === 'rules' ? (
        <View style={styles.placeholder}>
          <MaterialCommunityIcons name="timer-sand" size={40} color={colors.textMuted} />
          <Text style={styles.placeholderText}>Coming soon.</Text>
        </View>
      ) : null}

      {tab === 'invitation' ? (
        <>
          <View style={styles.leaderboardCard}>
            <Text style={styles.leaderboardTitle}>Invite friends, earn coins</Text>
            <View style={styles.leaderboardEmpty}>
              <MaterialCommunityIcons name="account-group-outline" size={34} color={colors.textMuted} />
              <Text style={styles.leaderboardEmptyText}>
                Invite friends to play NovaPlay together and earn bonus coins.
              </Text>
            </View>
          </View>

          <View style={styles.referralCard}>
            <Text style={styles.referralHeaderTitle}>Referral reward</Text>
            <View style={styles.referralRewardsRow}>
              <View style={styles.referralRewardCell}>
                <Text style={styles.referralRewardAmount}>80 Coins</Text>
                <Text style={styles.referralRewardLabel}>You get</Text>
              </View>
              <MaterialCommunityIcons name="arrow-right-thin" size={22} color={colors.textMuted} />
              <View style={styles.referralRewardCell}>
                <Text style={styles.referralRewardAmount}>20 Coins</Text>
                <Text style={styles.referralRewardLabel}>Friend gets</Text>
              </View>
              <Pressable onPress={() => comingSoon('Invite a friend')} style={styles.referralInviteButton}>
                <LinearGradient colors={gradients.goldButton} style={styles.referralInviteGradient}>
                  <Text style={styles.referralInviteText}>Invite</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>

          <View style={styles.milestoneCard}>
            <Text style={styles.milestoneTitle}>Cumulative invitations</Text>
            <View style={styles.milestoneTrack}>
              {INVITATION_MILESTONES.map((m) => {
                const reached = totalInvitees >= m.count;
                return (
                  <View key={m.count} style={styles.milestoneItem}>
                    <View style={[styles.milestoneCircle, reached && styles.milestoneCircleReached]}>
                      <Text style={styles.milestoneCircleLabel}>{m.count}</Text>
                    </View>
                    <Text style={styles.milestoneAmount}>{m.reward} Coins</Text>
                  </View>
                );
              })}
            </View>
            <Text style={styles.milestoneCaption}>
              {nextMilestone
                ? `Invite ${nextMilestone.count - totalInvitees} more friend${nextMilestone.count - totalInvitees === 1 ? '' : 's'} to unlock ${nextMilestone.reward} Coins`
                : 'All milestones unlocked!'}
            </Text>
          </View>

          <View style={styles.referRow}>
            <Text style={styles.referLabel}>Refer friends with:</Text>
            <Text style={styles.referLangText}>हिंदी में साझा करें</Text>
            <Switch
              value={shareInHindi}
              onValueChange={setShareInHindi}
              trackColor={{ false: colors.surfaceAlt, true: colors.crimson }}
              thumbColor={colors.textPrimary}
            />
          </View>

          <View style={styles.shareRow}>
            <Pressable style={styles.shareButton} onPress={handleShare}>
              <MaterialCommunityIcons name="send" size={18} color={colors.gold} />
              <Text style={styles.shareButtonText}>Share to Telegram</Text>
            </Pressable>
            <Pressable style={styles.shareButton} onPress={handleShare}>
              <MaterialCommunityIcons name="whatsapp" size={18} color={colors.positive} />
              <Text style={styles.shareButtonText}>Share to WhatsApp</Text>
            </Pressable>
          </View>
        </>
      ) : null}

      <RewardPopup visible={!!popup} amount={popup?.amount ?? 0} title={popup?.title} onClose={() => setPopup(null)} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  backButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  tabRow: { flex: 1, flexDirection: 'row', gap: spacing.xs },
  tab: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.md },
  tabActive: { backgroundColor: colors.crimson },
  tabText: { color: colors.textSecondary, fontSize: typography.xs, fontWeight: '700', textAlign: 'center' },
  tabTextActive: { color: colors.gold },
  placeholder: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxxl },
  placeholderText: { color: colors.textMuted, fontSize: typography.md, fontWeight: '700', marginTop: spacing.md },
  claimDailyRow: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  claimDailyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
  },
  claimDailyButtonDisabled: { backgroundColor: colors.surfaceAlt },
  claimDailyText: { color: colors.background, fontWeight: '800', fontSize: typography.sm, marginLeft: spacing.sm },
  claimDailyTextDisabled: { color: colors.textMuted },

  leaderboardCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    padding: spacing.lg,
  },
  leaderboardTitle: { color: colors.textPrimary, fontSize: typography.md, fontWeight: '800' },
  leaderboardEmpty: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  leaderboardEmptyText: { color: colors.textMuted, fontSize: typography.sm, textAlign: 'center' },

  referralCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    padding: spacing.lg,
  },
  referralHeaderTitle: { color: colors.textPrimary, fontSize: typography.md, fontWeight: '800', marginBottom: spacing.md },
  referralRewardsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  referralRewardCell: { alignItems: 'center' },
  referralRewardAmount: { color: colors.gold, fontSize: typography.lg, fontWeight: '800' },
  referralRewardLabel: { color: colors.textMuted, fontSize: typography.xs, marginTop: 2 },
  referralInviteButton: { marginLeft: 'auto' },
  referralInviteGradient: { borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  referralInviteText: { color: colors.background, fontSize: typography.sm, fontWeight: '800' },

  milestoneCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    padding: spacing.lg,
  },
  milestoneTitle: { color: colors.textPrimary, fontSize: typography.md, fontWeight: '800', marginBottom: spacing.lg },
  milestoneTrack: { flexDirection: 'row', justifyContent: 'space-between' },
  milestoneItem: { alignItems: 'center', flex: 1 },
  milestoneCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.surfaceAlt,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  milestoneCircleReached: { borderColor: colors.gold, backgroundColor: colors.gold },
  milestoneCircleLabel: { color: colors.textSecondary, fontSize: typography.xs, fontWeight: '800' },
  milestoneAmount: { color: colors.textMuted, fontSize: typography.xs, marginTop: spacing.xs, fontWeight: '700' },
  milestoneCaption: { color: colors.textSecondary, fontSize: typography.xs, textAlign: 'center', marginTop: spacing.lg },

  referRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  referLabel: { color: colors.textSecondary, fontSize: typography.sm },
  referLangText: { color: colors.gold, fontSize: typography.sm, fontWeight: '700' },
  shareRow: { flexDirection: 'row', gap: spacing.md, marginHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.xl },
  shareButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
  },
  shareButtonText: { color: colors.textPrimary, fontSize: typography.sm, fontWeight: '700' },
});
