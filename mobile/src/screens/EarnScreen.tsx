import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';
import { AgentSummary, claimAgentRewards, fetchAgentSummary, JackpotEntry } from '../api/backend';
import { ApiClientError } from '../api/client';
import {
  ArrowTitle,
  Bullet,
  CardTitle,
  GoldCard,
  inr,
  inrShort,
  RulesTable,
  TeamLevelBadge,
  useCountdown,
} from '../components/agent/AgentParts';
import ScreenContainer from '../components/ScreenContainer';
import VipBonusPopup, { VipBonusResult } from '../components/VipBonusPopup';
import { AVATARS } from '../data/avatars';
import { IconName } from '../data/models';
import { RootStackParamList } from '../navigation/types';
import { useGameState } from '../state/GameStateContext';
import { colors, gradients, spacing, typography } from '../theme';

type Tab = 'mine' | 'invite' | 'rules';
type Nav = NativeStackNavigationProp<RootStackParamList>;

const RED_BUTTON = ['#FF4A63', '#D11A33', '#8E0E1F'] as const;

function shareText(s: AgentSummary, hindi: boolean) {
  const { inviteeReward, minDeposit } = s.invite;
  return hindi
    ? `🎰 NovaPlay पर मेरे साथ खेलो! साइन अप करते समय मेरा इनवाइट कोड ${s.inviteCode} डालो — पहली ₹${minDeposit} डिपॉज़िट और खेलने के बाद ₹${inviteeReward} इनाम पाओ।`
    : `🎰 Play with me on NovaPlay! Sign up with my invite code ${s.inviteCode} and get ₹${inviteeReward} after your first ₹${minDeposit} deposit and play.`;
}

export default function EarnScreen() {
  const navigation = useNavigation<Nav>();
  const { refreshWallet } = useGameState();
  const [tab, setTab] = useState<Tab>('mine');
  const [data, setData] = useState<AgentSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [hindi, setHindi] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [popup, setPopup] = useState<VipBonusResult | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const load = useCallback(() => {
    fetchAgentSummary()
      .then((s) => {
        setData(s);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);
  useFocusEffect(load);

  const invite = async () => {
    if (!data) return;
    try {
      await Share.share({ message: `${shareText(data, hindi)}\n${data.inviteUrl}` });
    } catch {
      // share sheet closed
    }
  };
  const shareTo = (app: 'telegram' | 'whatsapp') => {
    if (!data) return;
    const text = shareText(data, hindi);
    if (app === 'telegram') {
      Linking.openURL(`https://t.me/share/url?url=${encodeURIComponent(data.inviteUrl)}&text=${encodeURIComponent(text)}`).catch(invite);
    } else {
      const msg = encodeURIComponent(`${text}\n${data.inviteUrl}`);
      Linking.openURL(`whatsapp://send?text=${msg}`).catch(() => Linking.openURL(`https://wa.me/?text=${msg}`).catch(invite));
    }
  };

  const claim = async () => {
    if (claiming) return;
    setClaiming(true);
    try {
      const { amount } = await claimAgentRewards();
      setPopup({ kind: 'success', bonus: 'agent', amount });
      refreshWallet().catch(() => {});
    } catch (err) {
      setPopup({ kind: 'error', kicker: 'AGENT REWARDS', message: err instanceof ApiClientError ? err.message : 'Could not claim. Please try again.' });
    } finally {
      setClaiming(false);
      load();
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'mine', label: 'My Rewards' },
    { key: 'invite', label: 'Invitation\nrewards' },
    { key: 'rules', label: 'Rules' },
  ];

  return (
    <ScreenContainer scroll={false}>
      <LinearGradient colors={['#3A0B14', '#1A0508']} style={styles.header}>
        <Pressable onPress={() => navigation.navigate('MainTabs', { screen: 'Home' })} style={styles.back} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={30} color={colors.gold} />
        </Pressable>
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable key={t.key} style={styles.tab} onPress={() => setTab(t.key)}>
              {active ? <LinearGradient colors={['#5A0E1B', '#A0122C']} style={StyleSheet.absoluteFill} /> : null}
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              {active ? <View style={styles.tabUnderline} /> : null}
            </Pressable>
          );
        })}
      </LinearGradient>

      {!data ? (
        <View style={styles.center}>
          {failed ? (
            <Text style={styles.muted} onPress={load}>
              Could not load. Tap to try again.
            </Text>
          ) : (
            <ActivityIndicator color={colors.gold} />
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {tab === 'mine' ? (
            <MyRewards
              data={data}
              hindi={hindi}
              setHindi={setHindi}
              claiming={claiming}
              onClaim={claim}
              onInvite={invite}
              onShare={shareTo}
              onDetail={() => setDetailOpen(true)}
              onHelp={() => setTab('rules')}
              navigation={navigation}
            />
          ) : tab === 'invite' ? (
            <Invitation data={data} onInvite={invite} navigation={navigation} onRules={() => setTab('rules')} />
          ) : (
            <Rules data={data} />
          )}
        </ScrollView>
      )}

      {data && tab === 'invite' && data.jackpot.myCommission < data.jackpot.minCommission ? (
        <LinearGradient colors={['#5A0E1B', '#2A060D']} style={styles.rankBanner}>
          <Text style={styles.rankBannerText}>
            You need to earn <Text style={styles.rankBannerHi}>{(data.jackpot.minCommission - data.jackpot.myCommission).toFixed(2)}</Text> in agency
            commission to participate in the ranking.
          </Text>
          <Pressable onPress={invite}>
            <LinearGradient colors={gradients.goldButton} style={styles.rankBannerBtn}>
              <Text style={styles.rankBannerBtnText}>Go to attend</Text>
            </LinearGradient>
          </Pressable>
        </LinearGradient>
      ) : null}

      {data ? <TeamDetail visible={detailOpen} onClose={() => setDetailOpen(false)} data={data} /> : null}
      <VipBonusPopup result={popup} onClose={() => setPopup(null)} />
    </ScreenContainer>
  );
}

// ---------------- My Rewards ----------------

function MyRewards({
  data,
  hindi,
  setHindi,
  claiming,
  onClaim,
  onInvite,
  onShare,
  onDetail,
  onHelp,
  navigation,
}: {
  data: AgentSummary;
  hindi: boolean;
  setHindi: (v: boolean) => void;
  claiming: boolean;
  onClaim: () => void;
  onInvite: () => void;
  onShare: (app: 'telegram' | 'whatsapp') => void;
  onDetail: () => void;
  onHelp: () => void;
  navigation: Nav;
}) {
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const { team, rates, rewards } = data;
  const privileges: { icon: IconName; color: string; label: string; value: string }[] = [
    { icon: 'hand-coin', color: colors.goldLight, label: 'Bet rebate', value: `up to ${rates.betUpTo}%` },
    { icon: 'cash-multiple', color: '#9BE7A8', label: 'Deposit rebate', value: `up to ${rates.depositUpTo}%` },
    { icon: 'handshake', color: '#FFC9A8', label: 'Invitation rewards', value: `total ${inrShort(rewards.invitation)}` },
    { icon: 'trophy', color: colors.goldLight, label: 'Agent jackpot', value: data.jackpot.myRank ? `rank #${data.jackpot.myRank}` : inrShort(data.jackpot.pool) },
  ];
  const itemWidth = (width - spacing.lg * 2 - 2) / 3;
  const pages = Math.max(1, privileges.length - 2);

  return (
    <View style={{ paddingHorizontal: spacing.lg }}>
      <GoldCard style={{ marginTop: spacing.lg }}>
        <View style={styles.levelTag}>
          <Text style={styles.levelTagText}>My team level</Text>
        </View>
        <Pressable onPress={onHelp} style={styles.helpIcon} hitSlop={8}>
          <MaterialCommunityIcons name="help-circle-outline" size={26} color={colors.gold} />
        </Pressable>
        <View style={styles.levelRow}>
          <Text style={styles.levelLabel}>Team level</Text>
          <TeamLevelBadge level={team.level} />
          <Pressable onPress={onDetail} style={styles.smallBtn}>
            <Text style={styles.smallBtnText}>Detail</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate('AgentTeam')} style={styles.smallBtn}>
            <Text style={styles.smallBtnText}>Team</Text>
          </Pressable>
        </View>
        <Text style={styles.levelNote}>
          {team.size >= data.rules.teamLevels[team.level].teamSize
            ? 'Already achieved this rebate level.'
            : `Invite friends to start earning: Lv ${team.level} needs ${data.rules.teamLevels[team.level].teamSize} team member.`}
        </Text>
        {team.next ? (
          <Text style={styles.levelNext}>
            Next Lv {team.next.level}: team {team.size}/{team.next.teamSize} · betting {inrShort(team.betting)}/{inrShort(team.next.teamBetting)}
          </Text>
        ) : null}

        <View style={styles.privBox}>
          <Text style={styles.privTitle}>My privileges</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={itemWidth}
            decelerationRate="fast"
            onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.round(e.nativeEvent.contentOffset.x / itemWidth))}
            scrollEventThrottle={32}
          >
            {privileges.map((p) => (
              <View key={p.label} style={[styles.privItem, { width: itemWidth }]}>
                <View style={styles.privGlowWrap}>
                  <LinearGradient colors={['rgba(255,45,85,0.0)', 'rgba(255,45,85,0.45)']} style={styles.privBeam} />
                  <LinearGradient colors={['#B0152F', '#4A0B17']} style={styles.privPedestal} />
                  <MaterialCommunityIcons name={p.icon} size={46} color={p.color} style={styles.privIcon} />
                </View>
                <Text style={styles.privLabel}>{p.label}</Text>
                <Text style={styles.privValue}>{p.value}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={styles.dots}>
            <MaterialCommunityIcons name="chevron-left" size={20} color={colors.goldLight} />
            {Array.from({ length: pages }, (_, i) => (
              <View key={i} style={[styles.dot, i === Math.min(page, pages - 1) && styles.dotActive]} />
            ))}
            <MaterialCommunityIcons name="chevron-right" size={20} color={colors.goldLight} />
          </View>
        </View>
      </GoldCard>

      <LinearGradient colors={['#6A1222', '#3A0913']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.claimCard}>
        <View style={{ flex: 1 }}>
          <Pressable onPress={() => navigation.navigate('AgentRewards', { tab: 'withdrawals' })} style={styles.linkRow}>
            <Text style={styles.claimLabel}>Withdrawal rewards</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
          </Pressable>
          <Text style={styles.claimAmount}>{inr(rewards.claimable)}</Text>
        </View>
        <Pressable onPress={onClaim} disabled={claiming} style={{ opacity: claiming ? 0.6 : 1 }}>
          <LinearGradient colors={gradients.goldButton} style={styles.claimBtn}>
            <View style={styles.claimGloss} />
            <Text style={styles.claimBtnText}>{claiming ? 'Claiming…' : 'Claim'}</Text>
          </LinearGradient>
        </Pressable>
      </LinearGradient>

      <View style={styles.totals}>
        <Pressable style={styles.totalCell} onPress={() => navigation.navigate('AgentRewards', { tab: 'details' })}>
          <View style={styles.linkRow}>
            <Text style={styles.totalLabel}>Total rewards</Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color={colors.textMuted} />
          </View>
          <Text style={styles.totalValue}>{inr(rewards.total)}</Text>
        </Pressable>
        <View style={styles.totalDivider} />
        <Pressable style={styles.totalCell} onPress={() => navigation.navigate('AgentRewards', { tab: 'details' })}>
          <View style={styles.linkRow}>
            <Text style={styles.totalLabel}>Today's rewards</Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color={colors.textMuted} />
          </View>
          <Text style={styles.totalValue}>{inr(rewards.today)}</Text>
        </Pressable>
      </View>

      <BigRedButton label="Invite friends to get money" onPress={onInvite} />

      <View style={styles.codeRow}>
        <Text style={styles.codeLabel}>My invite code</Text>
        <Text style={styles.codeValue}>{data.inviteCode}</Text>
      </View>

      <View style={styles.hindiRow}>
        <Text style={styles.hindiLabel}>Refer friends with:</Text>
        <Text style={styles.hindiText}>हिंदी में साझा करें</Text>
        <Switch value={hindi} onValueChange={setHindi} trackColor={{ false: '#3A0913', true: '#C8173A' }} thumbColor={hindi ? colors.goldLight : '#B0152F'} />
      </View>

      <View style={styles.shareRow}>
        <Pressable style={styles.shareBtn} onPress={() => onShare('telegram')}>
          <MaterialCommunityIcons name="send" size={22} color={colors.gold} style={{ transform: [{ rotate: '-30deg' }] }} />
          <Text style={styles.shareText}>Share to Telegram</Text>
        </Pressable>
        <Pressable style={styles.shareBtn} onPress={() => onShare('whatsapp')}>
          <MaterialCommunityIcons name="whatsapp" size={22} color={colors.gold} />
          <Text style={styles.shareText}>Share to WhatsApp</Text>
        </Pressable>
      </View>
    </View>
  );
}

function BigRedButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.redWrap}>
      <LinearGradient colors={RED_BUTTON} style={styles.redBtn}>
        <View style={styles.redGloss} />
        <Text style={styles.redText}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

// ---------------- Invitation rewards ----------------

function Invitation({ data, onInvite, onRules, navigation }: { data: AgentSummary; onInvite: () => void; onRules: () => void; navigation: Nav }) {
  const countdown = useCountdown(data.jackpot.endsAt);
  const { invite, jackpot } = data;
  const digits = String(Math.floor(jackpot.pool)).padStart(9, '0').slice(-9).split('');
  const next = invite.milestones.find((m) => !m.reached) ?? null;
  const maxReward = invite.milestones[invite.milestones.length - 1]?.reward ?? 0;
  const lastCount = invite.milestones[invite.milestones.length - 1]?.count ?? 1;
  const progress = Math.min(1, invite.qualified / lastCount);
  const podium = [jackpot.top[1], jackpot.top[0], jackpot.top[2]];

  return (
    <View>
      <LinearGradient colors={['#8A1A2C', '#4A0B17', '#2A060D']} style={styles.jackpot}>
        <Text style={styles.jackpotTitle}>AGENT JACKPOT</Text>
        <LinearGradient colors={['#E8344F', '#8E0E1F']} style={styles.odometer}>
          <View style={styles.odoInner}>
            <Text style={styles.odoRupee}>₹</Text>
            {digits.map((d, i) => (
              <LinearGradient key={i} colors={['#5A0E1B', '#2A060D']} style={styles.odoDigit}>
                <Text style={styles.odoDigitText}>{d}</Text>
              </LinearGradient>
            ))}
          </View>
        </LinearGradient>
        <Text style={styles.jackpotSub}>
          {data.rules.jackpot.poolPercent}% of the bets of players invited this week{' '}
          <Text style={styles.jackpotLink} onPress={onRules}>
            Details
          </Text>
        </Text>
        <View style={styles.countdownPill}>
          <MaterialCommunityIcons name="alarm" size={16} color="#FF8A3D" />
          <Text style={styles.countdownText}>{countdown}</Text>
        </View>
        <View style={styles.sideTabs}>
          <Pressable onPress={() => navigation.navigate('AgentJackpot', { tab: 'history' })} style={[styles.sideTab, styles.sideTabLeft]}>
            <Text style={styles.sideTabText}>History</Text>
          </Pressable>
          <Pressable onPress={onRules} style={[styles.sideTab, styles.sideTabRight]}>
            <Text style={styles.sideTabText}>Rules</Text>
          </Pressable>
        </View>

        <View style={styles.podium}>
          {podium.map((p, i) => (
            <PodiumSpot key={i} entry={p} place={i === 1 ? 1 : i === 0 ? 2 : 3} />
          ))}
        </View>
        <Pressable onPress={() => navigation.navigate('AgentJackpot', { tab: 'ranking' })} style={{ marginHorizontal: spacing.xl, marginTop: spacing.md }}>
          <LinearGradient colors={gradients.goldButton} style={styles.listBtn}>
            <View style={styles.claimGloss} />
            <Text style={styles.listBtnText}>Check the list detail</Text>
          </LinearGradient>
        </Pressable>
      </LinearGradient>

      <View style={{ paddingHorizontal: spacing.lg }}>
        <GoldCard style={{ marginTop: spacing.lg }}>
          <CardTitle title="Referral reward" right={<MaterialCommunityIcons name="help-circle-outline" size={24} color={colors.gold} onPress={onRules} />} />
          <View style={styles.referralBody}>
            <Text style={styles.referralLead}>Invite a friend to get</Text>
            <Text style={styles.referralBig}>{inr(invite.inviterReward)}</Text>
            <Text style={styles.referralFriend}>
              Your friend gets <Text style={styles.referralFriendHi}>{inr(invite.inviteeReward)}</Text>
            </Text>
            <BigRedButton label="Invite friends to get money" onPress={onInvite} />
            <Text style={styles.referralCap}>
              Number of invitations per day{' '}
              <Text style={styles.referralCapHi}>
                {invite.todayLeft}/{invite.dailyCap}
              </Text>
            </Text>
          </View>
        </GoldCard>

        <GoldCard style={{ marginTop: spacing.lg }}>
          <CardTitle title="Cumulative invitations" right={<MaterialCommunityIcons name="help-circle-outline" size={24} color={colors.gold} onPress={onRules} />} />
          <View style={styles.milestones}>
            <View style={styles.milestoneIcons}>
              {invite.milestones.map((m, i) => (
                <View key={m.count} style={styles.milestoneCol}>
                  <MilestoneIcon index={i} reached={m.reached} />
                  <Text style={[styles.milestoneReward, m.reached && { color: colors.positive }]}>{inr(m.reward)}</Text>
                </View>
              ))}
            </View>
            <View style={styles.trackWrap}>
              <View style={styles.track}>
                <LinearGradient colors={gradients.goldButton} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: `${progress * 100}%`, height: '100%' }} />
              </View>
              <View style={styles.trackDots}>
                {invite.milestones.map((m) => (
                  <View key={m.count} style={styles.milestoneCol}>
                    <LinearGradient colors={m.reached ? ['#FFF0B0', colors.gold] : ['#C9A24A', '#7A5A1C']} style={styles.trackDot} />
                    <Text style={styles.trackCount}>{m.count}</Text>
                  </View>
                ))}
              </View>
            </View>
            <Text style={styles.milestoneHint}>
              {next ? (
                <>
                  Invite <Text style={styles.milestoneHintBig}>{next.count - invite.qualified}</Text> friends to get{' '}
                  <Text style={styles.milestoneHintBig}>{inr(next.reward)}</Text> (up to {inr(maxReward)})
                </>
              ) : (
                'All invitation milestones reached!'
              )}
            </Text>
          </View>
        </GoldCard>

        <View style={styles.statRow}>
          <Pressable style={styles.statBox} onPress={() => navigation.navigate('AgentRewards', { tab: 'details', kind: 'INVITE' })}>
            <View style={styles.linkRow}>
              <Text style={styles.statLabel}>Rewards</Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color={colors.textMuted} />
            </View>
            <Text style={styles.statValue}>{inr(invite.rewards)}</Text>
          </Pressable>
          <Pressable style={styles.statBox} onPress={() => navigation.navigate('AgentTeam')}>
            <View style={styles.linkRow}>
              <Text style={styles.statLabel}>Invitees</Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color={colors.textMuted} />
            </View>
            <View style={styles.linkRow}>
              <MaterialCommunityIcons name="account-multiple-outline" size={24} color={colors.textPrimary} />
              <Text style={styles.statValue}> {invite.invitees}</Text>
            </View>
          </Pressable>
        </View>
        <Text style={styles.qualifiedNote}>
          {invite.qualified} of {invite.invitees} invitees qualified (deposited {inr(invite.minDeposit)} and played {invite.wagerMultiple}x).
        </Text>
        <View style={{ height: 96 }} />
      </View>
    </View>
  );
}

const MILESTONE_ICONS: IconName[] = ['circle-multiple', 'database', 'diamond-stone', 'treasure-chest', 'safe-square'];

function MilestoneIcon({ index, reached }: { index: number; reached: boolean }) {
  return (
    <LinearGradient colors={reached ? ['#FFF0B0', colors.gold, colors.goldDark] : ['#6A1222', '#3A0913']} style={styles.milestoneIcon}>
      <MaterialCommunityIcons name={MILESTONE_ICONS[index] ?? 'gift'} size={26} color={reached ? '#5C3A0E' : colors.goldLight} />
    </LinearGradient>
  );
}

const PODIUM_LOOK = {
  1: { colors: ['#F6C85A', '#B8862A'] as const, ring: '#FFD76A', size: 92, crown: '#FFC93D' },
  2: { colors: ['#6F78C8', '#3B3F7A'] as const, ring: '#D9DEF2', size: 76, crown: '#D9DEF2' },
  3: { colors: ['#E0884A', '#8A3E14'] as const, ring: '#F0A060', size: 76, crown: '#F0A060' },
};

function PodiumSpot({ entry, place }: { entry?: JackpotEntry; place: 1 | 2 | 3 }) {
  const look = PODIUM_LOOK[place];
  const avatar = AVATARS[((entry?.uid ?? place) % AVATARS.length + AVATARS.length) % AVATARS.length];
  return (
    <View style={[styles.podiumSpot, place === 1 && { marginTop: -18 }]}>
      <View style={styles.crownWrap}>
        <MaterialCommunityIcons name="crown" size={place === 1 ? 34 : 28} color={look.crown} />
        <Text style={styles.crownNum}>{place}</Text>
      </View>
      <View style={[styles.avatarRing, { width: look.size, height: look.size, borderRadius: look.size / 2, borderColor: look.ring }]}>
        {entry ? (
          <Image source={avatar} style={{ width: look.size - 8, height: look.size - 8, borderRadius: (look.size - 8) / 2 }} />
        ) : (
          <MaterialCommunityIcons name="account-question" size={look.size * 0.5} color="rgba(255,255,255,0.35)" />
        )}
      </View>
      <LinearGradient colors={look.colors} style={styles.podiumCard}>
        <Text style={styles.podiumName} numberOfLines={1}>
          {entry ? entry.name : 'Waiting…'}
        </Text>
        <Text style={styles.podiumCommission}>{entry ? `◎ ${inr(entry.commission)}` : '—'}</Text>
        <Text style={styles.podiumPrize}>{entry ? `${inrShort(entry.prize)}(${entry.percent}%)` : ' '}</Text>
      </LinearGradient>
    </View>
  );
}

// ---------------- Rules ----------------

function Rules({ data }: { data: AgentSummary }) {
  const r = data.rules;
  const { inviterReward, inviteeReward, minDeposit, wagerMultiple } = r.join;
  const pct = (n: number) => `${n.toFixed(2)}%`;
  const maxBuilding = r.milestones.reduce((s, m) => Math.max(s, m.reward + m.count * inviterReward), 0);
  return (
    <View style={{ paddingHorizontal: spacing.lg }}>
      <Text style={styles.h1}>1. How it works?</Text>
      <View style={styles.howRow}>
        {[
          { icon: 'account-multiple-plus' as IconName, label: 'Invite\nfriends' },
          { icon: 'wallet' as IconName, label: 'Let them sign\nup and deposit' },
          { icon: 'cash-multiple' as IconName, label: `Get rewarded\nup to ${inr(maxBuilding)}+` },
        ].map((s, i) => (
          <React.Fragment key={s.label}>
            {i > 0 ? <MaterialCommunityIcons name="chevron-right" size={30} color={colors.gold} style={{ marginTop: 34 }} /> : null}
            <View style={styles.howStep}>
              <LinearGradient colors={['#8A1A2C', '#4A0B17']} style={styles.howCircle}>
                <MaterialCommunityIcons name={s.icon} size={44} color="#E8475F" />
              </LinearGradient>
              <Text style={[styles.howLabel, i === 2 && { color: colors.goldLight }]}>{s.label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>
      <Bullet>Share the game via social media or send your invite link to your friends.</Bullet>
      <Bullet>To earn rewards, your friends must install NovaPlay, sign up with your invite code ({data.inviteCode}) and start playing.</Bullet>
      <Bullet>The invite code has to be entered when the account is created; it can't be added later.</Bullet>

      <Text style={styles.h1}>2. Agent Rating Description</Text>
      <GoldCard style={{ padding: spacing.md }}>
        <AgentTree />
        <View style={styles.legend}>
          {(['A', 'B', 'C', 'D', 'E', 'F'] as const).map((k, i) => (
            <Text key={k} style={styles.legendItem}>
              <Text style={{ color: TREE_COLORS[i], fontWeight: '900' }}>{k}</Text>→YOU: {k} is your LV{i + 1} agent;
            </Text>
          ))}
        </View>
        <View style={styles.dashed} />
        <Text style={styles.treeNote}>
          You receive a percentage of the bets of A, B and C, and of the deposits of A, as commission. Please refer to the tables below for the rates.
        </Text>
      </GoldCard>

      <Text style={styles.h1}>3. Team Classification</Text>
      <RulesTable
        head={['Team Level', 'Team Size', 'Team Betting']}
        flex={[1.2, 1, 1.2]}
        rows={[...r.teamLevels].reverse().map((t) => [<TeamLevelBadge key="b" level={t.level} scale={0.9} />, String(t.teamSize), t.teamBetting.toLocaleString('en-IN')])}
      />
      <Bullet>Rebate Reward & Top Up Reward follow your team level on that day.</Bullet>
      <Bullet>Team size: the number of subordinates you currently have (all 6 levels).</Bullet>
      <Bullet>Team betting: the total betting amount of your subordinates.</Bullet>

      <Text style={styles.h1}>4. Rewards</Text>
      <Text style={styles.h2}>Reward 1: Joining Reward</Text>
      <Bullet>Each time you successfully invite a user, you receive a reward.</Bullet>
      <Bullet>
        After the invited person signs up with your invite code, deposits {inr(minDeposit)} and meets the {wagerMultiple}x wagering requirement (plays{' '}
        {inr(minDeposit * wagerMultiple)}), you receive {inr(inviterReward)} and the invited person receives {inr(inviteeReward)}.
      </Bullet>
      <Text style={styles.h2}>Reward 2: Building Reward</Text>
      <RulesTable
        head={['Invitees', 'Joining\nReward', 'Building\nReward', 'Sum']}
        rows={r.milestones.map((m) => [String(m.count), inr(m.count * inviterReward), inr(m.reward), inr(m.count * inviterReward + m.reward)])}
      />
      <Bullet>When the number of your successful referrals reaches each milestone, you earn the extra Building Reward once.</Bullet>

      <Text style={styles.h2}>Reward 3: Rebate Reward</Text>
      <RulesTable
        head={['Team Level', ...r.teamLevels.map((t) => <TeamLevelBadge key={t.level} level={t.level} scale={0.62} />)]}
        flex={[1.25, 1, 1, 1, 1]}
        rows={Array.from({ length: r.maxDepth }, (_, d) => [`Level ${d + 1}\nSubordinate`, ...r.betRebate.map((row) => pct(row[d] ?? 0))])}
      />
      <Bullet>You earn a percentage of the daily bets of the players in your team.</Bullet>
      <Bullet>The bigger your team and its betting, the higher your team level and rebate rate.</Bullet>
      <Bullet>Invite as many friends as you can to increase your rebate percentage.</Bullet>

      <Text style={styles.h2}>Reward 4: Top Up Reward</Text>
      <RulesTable
        head={['Team Level', 'Level 1\nSubordinate']}
        rows={[...r.teamLevels].reverse().map((t) => [<TeamLevelBadge key="b" level={t.level} scale={0.9} />, pct(r.topUpRebate[t.level])])}
      />
      <Bullet>When your level 1 subordinates deposit on NovaPlay, you receive this percentage of their deposits.</Bullet>

      <Text style={styles.h1}>5. Reward Calculation and Withdrawal</Text>
      <Bullet>A day's Rebate and Top Up rewards are calculated after 00:00 (India time) of the following day.</Bullet>
      <Bullet>Calculated rewards show in "Withdrawal rewards". Tap Claim to move them into your balance.</Bullet>
      <Bullet>Claimed rewards must be played once in any game before they can be withdrawn.</Bullet>

      <ArrowTitle title="Agent Jackpot" />
      <RulesTable
        head={['Rank', 'List']}
        rows={r.jackpot.prizes.map((p) => [p.from === p.to ? String(p.from) : `${p.from}-${p.to}`, pct(p.percent)])}
      />
      <Text style={styles.h1}>Activity Rules:</Text>
      <Bullet>The agent ranking is decided by the total commission an agent earns during the current activity (week).</Bullet>
      <Bullet>
        {r.jackpot.poolPercent}% of the total bets of all new players invited during the activity goes into the agent jackpot pool.
      </Bullet>
      <Bullet>Each activity runs weekly, from 00:00 on Monday to 24:00 on Sunday (India time).</Bullet>
      <Bullet>
        Agents who earn at least {inr(r.jackpot.minCommission)} in commission that week enter the ranking. Prizes are added to your rewards within about an
        hour after the activity ends.
      </Bullet>
      <Bullet>Ranks shared as a range (like 11-20) split that share equally. Any prize not won is added to the next week's pool.</Bullet>
      <Text style={[styles.h2, { marginTop: spacing.lg }]}>Terms and Conditions:</Text>
      <Bullet>
        Rewards are for genuine players. Accounts must be verified with the player's own mobile number and bank account. Multiple or fake accounts,
        self-invites and other unusual activity lead to rewards and winnings being voided.
      </Bullet>
      <View style={{ height: 40 }} />
    </View>
  );
}

const TREE_COLORS = ['#F0B93D', '#2F9E44', '#2E6BD9', '#E03157', '#E03157', '#E03157'];

/** YOU → A1 → B1/B2 → C1-C4 → D1/D2 → E1 → F1, drawn to fit the card. */
function AgentTree() {
  const { width } = useWindowDimensions();
  const w = width - spacing.lg * 2 - spacing.md * 2 - 3;
  const h = 470;
  const X = (f: number) => f * w;
  const nodes: { id: string; x: number; y: number; r: number; color: string; label: string }[] = [
    { id: 'you', x: 0.5, y: 34, r: 30, color: '#6A1222', label: 'YOU' },
    { id: 'A1', x: 0.5, y: 104, r: 19, color: TREE_COLORS[0], label: 'A1' },
    { id: 'B1', x: 0.27, y: 176, r: 19, color: TREE_COLORS[1], label: 'B1' },
    { id: 'B2', x: 0.73, y: 176, r: 19, color: TREE_COLORS[1], label: 'B2' },
    { id: 'C1', x: 0.15, y: 246, r: 16, color: TREE_COLORS[2], label: 'C1' },
    { id: 'C2', x: 0.38, y: 246, r: 16, color: TREE_COLORS[2], label: 'C2' },
    { id: 'C3', x: 0.62, y: 246, r: 16, color: TREE_COLORS[2], label: 'C3' },
    { id: 'C4', x: 0.85, y: 246, r: 16, color: TREE_COLORS[2], label: 'C4' },
    { id: 'D1', x: 0.3, y: 312, r: 16, color: TREE_COLORS[3], label: 'D1' },
    { id: 'D2', x: 0.48, y: 312, r: 16, color: TREE_COLORS[3], label: 'D2' },
    { id: 'E1', x: 0.22, y: 376, r: 16, color: TREE_COLORS[4], label: 'E1' },
    { id: 'E2', x: 0.4, y: 376, r: 16, color: TREE_COLORS[4], label: '…' },
    { id: 'F1', x: 0.13, y: 440, r: 16, color: TREE_COLORS[5], label: 'F1' },
    { id: 'F2', x: 0.31, y: 440, r: 16, color: TREE_COLORS[5], label: '…' },
  ];
  const edges = [
    ['you', 'A1'], ['A1', 'B1'], ['A1', 'B2'], ['B1', 'C1'], ['B1', 'C2'], ['B2', 'C3'], ['B2', 'C4'],
    ['C2', 'D1'], ['C2', 'D2'], ['D1', 'E1'], ['D1', 'E2'], ['E1', 'F1'], ['E1', 'F2'],
  ];
  const at = (id: string) => nodes.find((n) => n.id === id)!;
  return (
    <Svg width={w} height={h}>
      {edges.map(([a, b]) => {
        const p = at(a);
        const q = at(b);
        return <Line key={`${a}${b}`} x1={X(p.x)} y1={p.y} x2={X(q.x)} y2={q.y} stroke="#8A1A2C" strokeWidth={2} />;
      })}
      {nodes.map((n) => (
        <React.Fragment key={n.id}>
          <Circle cx={X(n.x)} cy={n.y} r={n.r} fill={n.color} stroke={n.id === 'you' ? '#F0B93D' : 'rgba(255,255,255,0.35)'} strokeWidth={n.id === 'you' ? 2.5 : 1.5} />
          <SvgText x={X(n.x)} y={n.y + (n.id === 'you' ? 7 : 5)} fill={n.id === 'you' ? '#FFDE8C' : '#FFFFFF'} fontSize={n.id === 'you' ? 18 : 13} fontWeight="bold" textAnchor="middle">
            {n.label}
          </SvgText>
        </React.Fragment>
      ))}
    </Svg>
  );
}

// ---------------- Team level detail ----------------

function TeamDetail({ visible, onClose, data }: { visible: boolean; onClose: () => void; data: AgentSummary }) {
  const { team, rules } = data;
  const next = team.next;
  const bar = (v: number, max: number) => (
    <View style={styles.dTrack}>
      <LinearGradient colors={gradients.goldButton} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: `${Math.min(100, (v / max) * 100)}%`, height: '100%' }} />
    </View>
  );
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={() => {}} style={styles.detailCard}>
          <LinearGradient colors={['#6A1222', '#3A0913', '#1A0408']} style={styles.detailInner}>
            <Text style={styles.detailTitle}>Team level</Text>
            <View style={{ alignItems: 'center', marginTop: spacing.sm }}>
              <TeamLevelBadge level={team.level} scale={1.2} />
            </View>
            <View style={styles.detailStats}>
              <View style={styles.detailStat}>
                <Text style={styles.detailStatLabel}>Team size</Text>
                <Text style={styles.detailStatValue}>{team.size}</Text>
              </View>
              <View style={styles.detailStat}>
                <Text style={styles.detailStatLabel}>Team betting</Text>
                <Text style={styles.detailStatValue}>{inr(team.betting)}</Text>
              </View>
              <View style={styles.detailStat}>
                <Text style={styles.detailStatLabel}>Direct invitees</Text>
                <Text style={styles.detailStatValue}>{team.direct}</Text>
              </View>
            </View>
            {next ? (
              <>
                <Text style={styles.detailNextTitle}>To reach Lv {next.level}</Text>
                <Text style={styles.detailLine}>
                  Team size {team.size} / {next.teamSize}
                </Text>
                {bar(team.size, next.teamSize)}
                <Text style={styles.detailLine}>
                  Team betting {inr(team.betting)} / {inr(next.teamBetting)}
                </Text>
                {bar(team.betting, next.teamBetting)}
              </>
            ) : (
              <Text style={styles.detailNextTitle}>Highest team level reached</Text>
            )}
            <Text style={styles.detailNextTitle}>Your rates now</Text>
            <Text style={styles.detailLine}>
              Bet rebate: L1 {rules.betRebate[team.level][0]}% · L2 {rules.betRebate[team.level][1]}% · L3 {rules.betRebate[team.level][2]}%
            </Text>
            <Text style={styles.detailLine}>Top up rebate (L1 deposits): {rules.topUpRebate[team.level]}%</Text>
            <Pressable onPress={onClose} style={{ marginTop: spacing.lg }}>
              <LinearGradient colors={gradients.goldButton} style={styles.listBtn}>
                <Text style={styles.listBtnText}>OK</Text>
              </LinearGradient>
            </Pressable>
          </LinearGradient>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'stretch', height: 64, borderBottomWidth: 1, borderBottomColor: 'rgba(255,45,85,0.35)' },
  back: { width: 48, alignItems: 'center', justifyContent: 'center' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  tabText: { color: colors.textPrimary, fontSize: typography.md, fontWeight: '600', textAlign: 'center' },
  tabTextActive: { color: colors.goldLight, fontWeight: '800' },
  tabUnderline: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: '#FF2D55' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: colors.textMuted },
  scroll: { paddingBottom: 40 },

  levelTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#C8173A',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderBottomRightRadius: 12,
    transform: [{ skewX: '-10deg' }],
    marginLeft: -4,
  },
  levelTagText: { color: colors.goldLight, fontSize: typography.sm, fontWeight: '700' },
  helpIcon: { position: 'absolute', top: 8, right: 10 },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, marginTop: spacing.sm },
  levelLabel: { color: colors.textPrimary, fontSize: typography.md, fontWeight: '600' },
  smallBtn: {
    backgroundColor: '#5A0E1B',
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,107,134,0.4)',
  },
  smallBtnText: { color: '#FF8A9D', fontSize: typography.sm, fontWeight: '700' },
  levelNote: { color: colors.textPrimary, fontSize: typography.md, textAlign: 'center', marginTop: spacing.md, paddingHorizontal: spacing.md },
  levelNext: { color: colors.textMuted, fontSize: typography.xs, textAlign: 'center', marginTop: 4 },
  privBox: { marginTop: spacing.md, backgroundColor: 'rgba(0,0,0,0.3)', paddingVertical: spacing.md },
  privTitle: { color: colors.textPrimary, fontSize: typography.lg, fontWeight: '600', marginLeft: spacing.lg, marginBottom: spacing.sm },
  privItem: { alignItems: 'center' },
  privGlowWrap: { width: 96, height: 96, alignItems: 'center', justifyContent: 'flex-end' },
  privBeam: { position: 'absolute', bottom: 12, width: 70, height: 80, borderTopLeftRadius: 35, borderTopRightRadius: 35 },
  privPedestal: { width: 84, height: 24, borderRadius: 42, borderWidth: 1, borderColor: 'rgba(255,138,153,0.6)' },
  privIcon: { position: 'absolute', bottom: 16 },
  privLabel: { color: '#FF6B86', fontSize: typography.sm, fontWeight: '600', marginTop: 6 },
  privValue: { color: '#FF6B86', fontSize: typography.sm, fontWeight: '800' },
  dots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: spacing.sm },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#7A1A2C' },
  dotActive: { backgroundColor: '#FF2D55' },

  claimCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,222,140,0.35)',
  },
  linkRow: { flexDirection: 'row', alignItems: 'center' },
  claimLabel: { color: colors.textPrimary, fontSize: typography.lg, fontWeight: '600' },
  claimAmount: {
    color: colors.goldLight,
    fontSize: 34,
    fontWeight: '900',
    marginTop: 2,
    textShadowColor: 'rgba(255,184,61,0.6)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  claimBtn: {
    borderRadius: 12,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,248,220,0.8)',
  },
  claimGloss: { position: 'absolute', top: 0, left: 0, right: 0, height: '48%', backgroundColor: 'rgba(255,255,255,0.22)' },
  claimBtnText: { color: '#5C3A0E', fontSize: typography.lg, fontWeight: '800' },
  totals: {
    flexDirection: 'row',
    marginTop: 2,
    borderRadius: 16,
    backgroundColor: '#3A0913',
    borderWidth: 1,
    borderColor: 'rgba(255,222,140,0.2)',
  },
  totalCell: { flex: 1, alignItems: 'center', paddingVertical: spacing.lg },
  totalDivider: { width: 1, marginVertical: spacing.md, borderLeftWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,222,140,0.35)' },
  totalLabel: { color: '#FF8A9D', fontSize: typography.md, fontWeight: '600' },
  totalValue: { color: colors.goldLight, fontSize: typography.xl, fontWeight: '800', marginTop: 4 },
  redWrap: {
    marginTop: spacing.lg,
    borderRadius: 14,
    shadowColor: '#FF2D4A',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  redBtn: {
    borderRadius: 14,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,190,200,0.45)',
  },
  redGloss: { position: 'absolute', top: 0, left: 0, right: 0, height: '48%', backgroundColor: 'rgba(255,255,255,0.16)' },
  redText: { color: '#FFFFFF', fontSize: typography.lg, fontWeight: '700', letterSpacing: 0.3 },
  codeRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  codeLabel: { color: colors.textMuted, fontSize: typography.sm },
  codeValue: { color: colors.goldLight, fontSize: typography.lg, fontWeight: '900', letterSpacing: 1.5 },
  hindiRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.md },
  hindiLabel: { color: colors.textSecondary, fontSize: typography.sm },
  hindiText: { color: '#FF6B86', fontSize: typography.sm, fontWeight: '700' },
  shareRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  shareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,107,134,0.35)',
    paddingVertical: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  shareText: { color: colors.textPrimary, fontSize: typography.sm, fontWeight: '600' },

  jackpot: { paddingTop: spacing.lg, paddingBottom: spacing.xl, overflow: 'hidden' },
  jackpotTitle: {
    color: colors.goldLight,
    fontSize: 34,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 1,
    fontStyle: 'italic',
    textShadowColor: '#B8862A',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  odometer: { marginHorizontal: spacing.lg, marginTop: spacing.sm, borderRadius: 20, padding: 5, borderWidth: 2, borderColor: colors.gold },
  odoInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: '#2A060D',
    borderRadius: 15,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  odoRupee: { color: colors.goldLight, fontSize: 28, fontWeight: '900', marginRight: 2 },
  odoDigit: { width: 26, height: 40, borderRadius: 5, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,222,140,0.4)' },
  odoDigitText: { color: colors.goldLight, fontSize: 26, fontWeight: '900' },
  jackpotSub: { color: colors.textPrimary, fontSize: typography.xs, textAlign: 'center', marginTop: spacing.sm, paddingHorizontal: spacing.lg },
  jackpotLink: { color: colors.goldLight, textDecorationLine: 'underline', fontWeight: '700' },
  countdownPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    marginTop: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: spacing.lg,
    paddingVertical: 4,
    borderRadius: 8,
  },
  countdownText: { color: colors.goldLight, fontSize: typography.lg, fontWeight: '800' },
  sideTabs: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  sideTab: { backgroundColor: '#8E0E1F', paddingHorizontal: spacing.lg, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,138,153,0.4)' },
  sideTabLeft: { borderTopRightRadius: 14, borderBottomRightRadius: 14 },
  sideTabRight: { borderTopLeftRadius: 14, borderBottomLeftRadius: 14 },
  sideTabText: { color: '#FFC2CC', fontSize: typography.md, fontWeight: '700' },
  podium: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', marginTop: spacing.lg, paddingHorizontal: spacing.sm, gap: 6 },
  podiumSpot: { flex: 1, alignItems: 'center' },
  crownWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: -6, zIndex: 2 },
  crownNum: { position: 'absolute', top: 10, color: '#5C3A0E', fontSize: 12, fontWeight: '900' },
  avatarRing: { borderWidth: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2A060D', zIndex: 1 },
  podiumCard: {
    alignSelf: 'stretch',
    marginTop: -10,
    paddingTop: 14,
    paddingBottom: spacing.md,
    paddingHorizontal: 4,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  podiumName: { color: '#FFFFFF', fontSize: typography.xs, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.25)', paddingHorizontal: 6, borderRadius: 8 },
  podiumCommission: { color: '#FFFFFF', fontSize: typography.sm, fontWeight: '800', marginTop: 4 },
  podiumPrize: { color: '#FFF3C4', fontSize: typography.sm, fontWeight: '900', marginTop: 2 },
  listBtn: {
    borderRadius: 14,
    paddingVertical: spacing.md,
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,248,220,0.8)',
  },
  listBtnText: { color: '#5C3A0E', fontSize: typography.lg, fontWeight: '800' },

  referralBody: { alignItems: 'stretch', padding: spacing.lg },
  referralLead: { color: '#FF8A9D', fontSize: typography.xl, textAlign: 'center' },
  referralBig: {
    color: '#FFC93D',
    fontSize: 64,
    fontWeight: '900',
    textAlign: 'center',
    textShadowColor: '#E0601A',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 4,
  },
  referralFriend: { color: colors.textPrimary, fontSize: typography.lg, textAlign: 'center' },
  referralFriendHi: { color: '#FFC93D', fontWeight: '800', fontSize: typography.xl },
  referralCap: { color: colors.textPrimary, fontSize: typography.md, textAlign: 'center', marginTop: spacing.md },
  referralCapHi: { color: colors.goldLight, fontWeight: '800' },
  milestones: { padding: spacing.lg },
  milestoneIcons: { flexDirection: 'row' },
  milestoneCol: { flex: 1, alignItems: 'center' },
  milestoneIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,222,140,0.5)',
  },
  milestoneReward: { color: colors.goldLight, fontSize: typography.md, fontWeight: '800', marginTop: 4 },
  trackWrap: { marginTop: spacing.md },
  track: { position: 'absolute', top: 7, left: '10%', right: '10%', height: 8, borderRadius: 4, backgroundColor: '#1A0408', overflow: 'hidden' },
  trackDots: { flexDirection: 'row' },
  trackDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: '#FFF1C2' },
  trackCount: { color: colors.textPrimary, fontSize: typography.md, fontWeight: '600', marginTop: 4 },
  milestoneHint: { color: colors.textSecondary, fontSize: typography.md, textAlign: 'center', marginTop: spacing.md },
  milestoneHintBig: { color: colors.goldLight, fontSize: typography.xl, fontWeight: '800' },
  statRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  statBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderRadius: 14,
    backgroundColor: '#2A060D',
    borderWidth: 1,
    borderColor: 'rgba(255,107,134,0.25)',
  },
  statLabel: { color: '#FF8A9D', fontSize: typography.md, fontWeight: '600' },
  statValue: { color: colors.textPrimary, fontSize: typography.xl, fontWeight: '700', marginTop: 4 },
  qualifiedNote: { color: colors.textMuted, fontSize: typography.xs, textAlign: 'center', marginTop: spacing.sm },
  rankBanner: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(255,222,140,0.6)',
  },
  rankBannerText: { flex: 1, color: colors.textPrimary, fontSize: typography.sm, lineHeight: 19 },
  rankBannerHi: { color: colors.goldLight, fontWeight: '900' },
  rankBannerBtn: { borderRadius: 10, paddingHorizontal: spacing.lg, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,248,220,0.8)' },
  rankBannerBtnText: { color: '#5C3A0E', fontSize: typography.sm, fontWeight: '800' },

  h1: { color: colors.textPrimary, fontSize: typography.xl, fontWeight: '700', marginTop: spacing.xl, marginBottom: spacing.md },
  h2: { color: colors.textSecondary, fontSize: typography.md, fontWeight: '700', marginTop: spacing.lg, marginBottom: spacing.sm },
  howRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: spacing.md },
  howStep: { flex: 1, alignItems: 'center' },
  howCircle: { width: 92, height: 92, borderRadius: 46, alignItems: 'center', justifyContent: 'center' },
  howLabel: { color: '#FF6B86', fontSize: typography.sm, textAlign: 'center', marginTop: spacing.sm, fontWeight: '600' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm },
  legendItem: { width: '50%', color: colors.textPrimary, fontSize: typography.xs, marginTop: 6 },
  dashed: { borderTopWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,107,134,0.5)', marginVertical: spacing.md },
  treeNote: { color: '#FF6B86', fontSize: typography.sm, lineHeight: 21 },

  backdrop: { flex: 1, backgroundColor: 'rgba(6,1,3,0.86)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  detailCard: { width: '100%', maxWidth: 400 },
  detailInner: { borderRadius: 22, borderWidth: 1.5, borderColor: 'rgba(255,222,140,0.6)', padding: spacing.lg },
  detailTitle: { color: colors.goldLight, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  detailStats: { flexDirection: 'row', marginTop: spacing.md, backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 14, paddingVertical: spacing.md },
  detailStat: { flex: 1, alignItems: 'center' },
  detailStatLabel: { color: colors.textMuted, fontSize: typography.xs },
  detailStatValue: { color: colors.goldLight, fontSize: typography.md, fontWeight: '800', marginTop: 2 },
  detailNextTitle: { color: colors.goldLight, fontSize: typography.md, fontWeight: '800', marginTop: spacing.lg },
  detailLine: { color: colors.textSecondary, fontSize: typography.sm, marginTop: 6 },
  dTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden', marginTop: 4 },
});
