import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { Image, ImageSourcePropType, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { VipStatus } from '../api/backend';
import { IconName } from '../data/models';
import { colors, gradients, radius, spacing, typography } from '../theme';
import { nextMonthLabel } from './VipBonusPopup';
import { VipEmblem, vipTier } from './VipEmblem';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatWhen(iso: string) {
  const d = new Date(iso);
  const h = d.getHours();
  const time = `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} · ${time}`;
}

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

function Ornament() {
  return (
    <View style={styles.ornament}>
      <LinearGradient colors={['transparent', colors.gold]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ornamentLine} />
      <View style={styles.ornamentGem} />
      <LinearGradient colors={[colors.gold, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ornamentLine} />
    </View>
  );
}

/** Where the player stands on one kind of bonus right now. */
function StatusCard({ icon, title, state, detail, ready }: { icon: IconName; title: string; state: string; detail: string; ready: boolean }) {
  return (
    <LinearGradient colors={['#4A0B17', '#24050B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.statusCard}>
      <View style={styles.statusTop}>
        <MaterialCommunityIcons name={icon} size={16} color={colors.goldLight} />
        <Text style={styles.statusTitle} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <View style={styles.statusStateRow}>
        <View style={[styles.statusDot, { backgroundColor: ready ? colors.positive : colors.goldDark }]} />
        <Text style={[styles.statusState, ready && { color: colors.positive }]}>{state}</Text>
      </View>
      <Text style={styles.statusDetail}>{detail}</Text>
    </LinearGradient>
  );
}

/** Full-screen card listing every VIP bonus the player has received, with totals and the rules. */
export default function VipBonusHistory({
  visible,
  onClose,
  vip,
  playerName,
  avatar,
}: {
  visible: boolean;
  onClose: () => void;
  vip: VipStatus;
  playerName: string;
  avatar: ImageSourcePropType;
}) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [tab, setTab] = useState<'month' | 'all'>('month');
  const width = Math.min(400, screenWidth - spacing.lg * 2);

  const now = new Date();
  const inThisMonth = (iso: string) => {
    const d = new Date(iso);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  };
  const monthItems = vip.history.filter((h) => inThisMonth(h.createdAt));
  const items = tab === 'month' ? monthItems : vip.history;
  const sum = (list: typeof items) => list.reduce((s, h) => s + h.amount, 0);
  const upgrades = items.filter((h) => h.kind === 'upgrade');
  const monthlies = items.filter((h) => h.kind !== 'upgrade');

  // Current standing for the player's own level.
  const own = vip.levels.find((l) => l.level === vip.level);
  const firstPaying = vip.levels.find((l) => l.upgradeBonus || l.weeklyBonus)?.level ?? 2;
  const monthlyTaken = vip.monthlyClaimed ?? vip.weeklyClaimedLevels.includes(vip.level);
  const next = nextMonthLabel(vip.nextMonthlyAt);
  const monthly = !own?.weeklyBonus
    ? { state: 'Locked', detail: `Starts at VIP ${firstPaying}`, ready: false }
    : monthlyTaken
      ? { state: 'Claimed', detail: next ? `Next opens ${next}` : 'Next opens on the 1st', ready: false }
      : { state: 'Ready to claim', detail: `${rupees(own.weeklyBonus)} for VIP ${vip.level}`, ready: true };
  const upgrade = !own?.upgradeBonus
    ? { state: 'Locked', detail: `Starts at VIP ${firstPaying}`, ready: false }
    : vip.claimedUpgrades.includes(vip.level)
      ? { state: 'Received', detail: 'Next one at the next level', ready: false }
      : { state: 'Ready to claim', detail: `${rupees(own.upgradeBonus)} one time`, ready: true };

  const tier = vipTier(vip.level);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={() => {}} style={{ width, maxHeight: screenHeight * 0.9 }}>
          <LinearGradient colors={['#6A1222', '#3A0913', '#1A0408']} locations={[0, 0.45, 1]} style={styles.card}>
            <View pointerEvents="none" style={styles.innerFrame} />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
              <View style={styles.titleRow}>
                <MaterialCommunityIcons name="crown" size={22} color={colors.gold} />
                <Text style={styles.title}>My Bonus History</Text>
              </View>
              <Ornament />

              <View style={styles.playerRow}>
                <View style={styles.avatarRing}>
                  <Image source={avatar} style={styles.avatar} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.playerName} numberOfLines={1}>
                    {playerName}
                  </Text>
                  <LinearGradient colors={tier.ribbon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.vipPill}>
                    <MaterialCommunityIcons name="crown" size={11} color="#FFFFFF" />
                    <Text style={styles.vipPillText}>VIP {vip.level}</Text>
                  </LinearGradient>
                </View>
                <View style={styles.xpBox}>
                  <Text style={styles.xpLabel}>Your XP</Text>
                  <Text style={styles.xpValue}>{vip.xp.toLocaleString('en-IN')}</Text>
                </View>
              </View>

              <View style={styles.tabs}>
                {(['month', 'all'] as const).map((t) => {
                  const active = tab === t;
                  const label = t === 'month' ? `This Month (${monthItems.length})` : `All Time (${vip.history.length})`;
                  return (
                    <Pressable key={t} style={styles.tab} onPress={() => setTab(t)}>
                      {active ? (
                        <LinearGradient colors={gradients.goldButton} style={styles.tabActive}>
                          <Text style={styles.tabTextActive}>{label}</Text>
                        </LinearGradient>
                      ) : (
                        <Text style={styles.tabText}>{label}</Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>

              <LinearGradient colors={['#FFE7A3', colors.gold, '#C8902C']} style={styles.total}>
                <View pointerEvents="none" style={styles.totalGloss} />
                <Text style={styles.totalLabel}>
                  Total rewards · {tab === 'month' ? `${MONTHS[now.getMonth()]} ${now.getFullYear()}` : 'All time'}
                </Text>
                <Text style={styles.totalValue}>{rupees(sum(items))}</Text>
                <View style={styles.splitRow}>
                  <View style={styles.splitChip}>
                    <MaterialCommunityIcons name="arrow-up-bold-circle" size={14} color="#5C3A0E" />
                    <Text style={styles.splitText}>
                      Upgrade {rupees(sum(upgrades))} · {upgrades.length}×
                    </Text>
                  </View>
                  <View style={styles.splitChip}>
                    <MaterialCommunityIcons name="calendar-month" size={14} color="#5C3A0E" />
                    <Text style={styles.splitText}>
                      Monthly {rupees(sum(monthlies))} · {monthlies.length}×
                    </Text>
                  </View>
                </View>
              </LinearGradient>

              <Text style={styles.sectionLabel}>VIP {vip.level} bonus status</Text>
              <View style={styles.statusRow}>
                <StatusCard icon="calendar-month" title="Monthly bonus" {...monthly} />
                <StatusCard icon="arrow-up-bold-circle" title="Upgrade bonus" {...upgrade} />
              </View>

              <Text style={styles.sectionLabel}>{tab === 'month' ? 'Received this month' : 'All bonuses received'}</Text>
              {items.length === 0 ? (
                <View style={styles.empty}>
                  <LinearGradient colors={['#7E1B2E', '#3A0913']} style={styles.emptyIcon}>
                    <MaterialCommunityIcons name="gift-open-outline" size={34} color={colors.goldLight} />
                  </LinearGradient>
                  <Text style={styles.emptyTitle}>{tab === 'month' ? 'No bonus this month yet' : 'No bonus received yet'}</Text>
                  <Text style={styles.emptyHint}>Claim your VIP bonuses from the level benefits on the VIP page.</Text>
                </View>
              ) : (
                <View style={styles.list}>
                  {items.map((h) => {
                    const isUpgrade = h.kind === 'upgrade';
                    return (
                      <LinearGradient
                        key={`${h.kind}-${h.level}-${h.createdAt}`}
                        colors={['#4E0C18', '#2A060D']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.row}
                      >
                        <View style={styles.rowEmblem}>
                          <VipEmblem level={h.level} size={50} />
                        </View>
                        <View style={styles.rowMiddle}>
                          <Text style={styles.rowTitle} numberOfLines={1}>
                            VIP {h.level} {isUpgrade ? 'Upgrade' : 'Monthly'} Bonus
                          </Text>
                          <View style={[styles.tag, isUpgrade ? styles.tagUpgrade : styles.tagMonthly]}>
                            <Text style={[styles.tagText, { color: isUpgrade ? colors.goldLight : '#FF9DB0' }]}>
                              {isUpgrade ? 'ONE-TIME · LEVEL UP' : 'MONTHLY'}
                            </Text>
                          </View>
                          <Text style={styles.rowWhen}>{formatWhen(h.createdAt)}</Text>
                        </View>
                        <View style={styles.rowRight}>
                          <Text style={styles.rowAmount}>+{rupees(h.amount)}</Text>
                          <View style={styles.rowDone}>
                            <MaterialCommunityIcons name="check-circle" size={12} color={colors.positive} />
                            <Text style={styles.rowDoneText}>Added</Text>
                          </View>
                        </View>
                      </LinearGradient>
                    );
                  })}
                </View>
              )}

              <View style={styles.rules}>
                <Text style={styles.rulesTitle}>How VIP bonuses work</Text>
                {[
                  { icon: 'arrow-up-bold-circle' as const, text: 'Upgrade bonus: paid once per level, ever. Claim it while you are on that level.' },
                  { icon: 'calendar-month' as const, text: 'Monthly bonus: once every month for your current level. It opens again on the 1st.' },
                  { icon: 'cards-playing-outline' as const, text: 'Bonus money must be played once in any game before it can be withdrawn.' },
                ].map((r) => (
                  <View key={r.icon} style={styles.ruleRow}>
                    <MaterialCommunityIcons name={r.icon} size={16} color={colors.gold} style={{ marginTop: 1 }} />
                    <Text style={styles.ruleText}>{r.text}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </LinearGradient>

          <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
            <LinearGradient colors={gradients.goldButton} style={styles.closeInner}>
              <MaterialCommunityIcons name="close" size={18} color="#3A2006" />
            </LinearGradient>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(6,1,3,0.88)', alignItems: 'center', justifyContent: 'center' },
  card: {
    flexShrink: 1,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255,222,140,0.6)',
    overflow: 'hidden',
  },
  innerFrame: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: 6,
    bottom: 6,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(255,222,140,0.16)',
  },
  scroll: { padding: spacing.lg, paddingTop: spacing.xl },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: {
    color: colors.goldLight,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(255,184,61,0.6)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  ornament: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, marginBottom: spacing.md, paddingHorizontal: spacing.xl },
  ornamentLine: { flex: 1, height: 1 },
  ornamentGem: { width: 7, height: 7, marginHorizontal: 8, backgroundColor: colors.goldLight, transform: [{ rotate: '45deg' }] },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,222,140,0.15)',
    padding: spacing.sm,
  },
  avatarRing: { padding: 2, borderRadius: 26, borderWidth: 1.5, borderColor: colors.gold },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  playerName: { color: colors.textPrimary, fontSize: typography.md, fontWeight: '800' },
  vipPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 3,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginTop: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  vipPillText: { color: '#FFFFFF', fontSize: typography.xs, fontWeight: '900', fontStyle: 'italic' },
  xpBox: { alignItems: 'flex-end', paddingRight: spacing.xs },
  xpLabel: { color: colors.textMuted, fontSize: typography.xs, fontWeight: '700' },
  xpValue: { color: colors.goldLight, fontSize: typography.md, fontWeight: '900' },
  tabs: {
    flexDirection: 'row',
    marginTop: spacing.md,
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,222,140,0.2)',
  },
  tab: { flex: 1, alignItems: 'stretch', justifyContent: 'center', minHeight: 36 },
  tabActive: { borderRadius: radius.pill, paddingVertical: 8, alignItems: 'center' },
  tabText: { color: colors.textMuted, fontSize: typography.sm, fontWeight: '800', textAlign: 'center' },
  tabTextActive: { color: '#3A2006', fontSize: typography.sm, fontWeight: '900' },
  total: {
    marginTop: spacing.md,
    borderRadius: 18,
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,248,220,0.8)',
  },
  totalGloss: { position: 'absolute', top: 0, left: 0, right: 0, height: '45%', backgroundColor: 'rgba(255,255,255,0.18)' },
  totalLabel: { color: '#6B4210', fontSize: typography.sm, fontWeight: '800' },
  totalValue: { color: '#4A2A06', fontSize: 44, fontWeight: '900', marginTop: 2 },
  splitRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.xs },
  splitChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  splitText: { color: '#5C3A0E', fontSize: typography.xs, fontWeight: '800' },
  sectionLabel: {
    color: colors.gold,
    fontSize: typography.xs,
    fontWeight: '900',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  statusRow: { flexDirection: 'row', gap: spacing.sm },
  statusCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,222,140,0.25)',
    padding: spacing.sm,
  },
  statusTop: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusTitle: { color: colors.textSecondary, fontSize: typography.xs, fontWeight: '800', flexShrink: 1 },
  statusStateRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusState: { color: colors.goldLight, fontSize: typography.sm, fontWeight: '900' },
  statusDetail: { color: colors.textMuted, fontSize: typography.xs, marginTop: 2 },
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,222,140,0.22)',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  rowEmblem: { width: 50, height: 50, marginRight: spacing.sm },
  rowMiddle: { flex: 1 },
  rowTitle: { color: colors.textPrimary, fontSize: typography.sm, fontWeight: '800' },
  tag: { alignSelf: 'flex-start', borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1, marginTop: 4 },
  tagUpgrade: { borderColor: 'rgba(255,222,140,0.5)', backgroundColor: 'rgba(240,185,61,0.12)' },
  tagMonthly: { borderColor: 'rgba(255,120,145,0.5)', backgroundColor: 'rgba(255,77,106,0.12)' },
  tagText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  rowWhen: { color: colors.textMuted, fontSize: typography.xs, marginTop: 4 },
  rowRight: { alignItems: 'flex-end', marginLeft: spacing.sm },
  rowAmount: {
    color: colors.goldLight,
    fontSize: typography.lg,
    fontWeight: '900',
    textShadowColor: 'rgba(255,184,61,0.55)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  rowDone: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  rowDoneText: { color: colors.positive, fontSize: typography.xs, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: spacing.lg },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,222,140,0.4)',
  },
  emptyTitle: { color: colors.goldLight, fontSize: typography.md, fontWeight: '800', marginTop: spacing.sm },
  emptyHint: { color: colors.textMuted, fontSize: typography.xs, marginTop: 4, textAlign: 'center', paddingHorizontal: spacing.lg },
  rules: {
    marginTop: spacing.lg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,222,140,0.18)',
    backgroundColor: 'rgba(0,0,0,0.25)',
    padding: spacing.md,
    gap: spacing.sm,
  },
  rulesTitle: { color: colors.goldLight, fontSize: typography.sm, fontWeight: '900' },
  ruleRow: { flexDirection: 'row', gap: spacing.sm },
  ruleText: { flex: 1, color: colors.textSecondary, fontSize: typography.xs, lineHeight: 17 },
  close: { position: 'absolute', top: -12, right: -8 },
  closeInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,248,220,0.9)',
  },
});
