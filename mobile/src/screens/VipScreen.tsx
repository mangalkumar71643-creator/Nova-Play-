import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { claimVipBonus, fetchVipStatus, VipStatus } from '../api/backend';
import { ApiClientError } from '../api/client';
import LoadingState from '../components/LoadingState';
import ScreenContainer from '../components/ScreenContainer';
import { AVATARS } from '../data/avatars';
import { IconName, VipLevelDef } from '../data/models';
import { BottomTabParamList } from '../navigation/types';
import { vipLevels as VIP_LOOKS } from '../data/mockData';
import { useAuth } from '../state/AuthContext';
import { useGameState } from '../state/GameStateContext';
import { colors, gradients, radius, spacing, typography } from '../theme';

const ITEM_WIDTH = 210;
const DIAMOND_SIZE = 104;
const DESCRIPTION_IMAGE_ASPECT = 784 / 1168;

function buildPrivileges(level: VipLevelDef): { icon: IconName; label: string; value: string }[] {
  const items: { icon: IconName; label: string; value: string }[] = [];
  if (level.weeklyBonus) items.push({ icon: 'calendar-week', label: 'Weekly Bonus', value: `₹${level.weeklyBonus.toLocaleString('en-IN')}` });
  if (level.upgradeBonus) items.push({ icon: 'trending-up', label: 'Upgrade Bonus', value: `₹${level.upgradeBonus.toLocaleString('en-IN')}` });
  return items;
}

function BenefitRow({
  icon,
  title,
  amount,
  level,
  reached,
  claimed,
  lockedText,
  onClaim,
}: {
  icon: IconName;
  title: string;
  amount: number;
  level: number;
  reached: boolean;
  claimed: boolean;
  /** Shown instead of "Reach VIP n" when the bonus can't be taken for another reason. */
  lockedText?: string;
  onClaim: () => void;
}) {
  const statusText = !reached ? lockedText ?? `Reach VIP ${level}` : claimed ? 'Claimed' : 'Tap to claim';
  return (
    <Pressable style={styles.benefitRow} onPress={reached && !claimed ? onClaim : undefined}>
      <View style={styles.benefitIconWrap}>
        <MaterialCommunityIcons name={icon} size={20} color={colors.gold} />
      </View>
      <View style={styles.benefitMiddle}>
        <Text style={styles.benefitTitle}>{title}</Text>
        <Text style={styles.benefitAmount}>₹{amount.toLocaleString('en-IN')}</Text>
      </View>
      <Text style={[styles.benefitStatus, reached && !claimed && styles.benefitStatusActive]}>{statusText}</Text>
    </Pressable>
  );
}

function DiamondBadge({
  level,
  scale,
  opacity,
}: {
  level: VipLevelDef;
  scale: Animated.AnimatedInterpolation<number>;
  opacity: Animated.AnimatedInterpolation<number>;
}) {
  const pulse = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(800),
        Animated.timing(shimmer, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    pulseLoop.start();
    shimmerLoop.start();
    return () => {
      pulseLoop.stop();
      shimmerLoop.stop();
    };
  }, [pulse, shimmer]);

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const shimmerTranslate = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-DIAMOND_SIZE, DIAMOND_SIZE] });

  return (
    <Animated.View style={[styles.diamondWrap, { transform: [{ scale }], opacity, shadowColor: level.gradient[1] }]}>
      <Animated.View style={[styles.diamondRotate, { transform: [{ rotate: '45deg' }, { scale: pulseScale }] }]}>
        <LinearGradient colors={level.gradient} style={styles.diamond}>
          <View style={styles.diamondInner}>
            <MaterialCommunityIcons name={level.icon} size={32} color={colors.background} />
          </View>
          <Animated.View pointerEvents="none" style={[styles.diamondShimmer, { transform: [{ translateX: shimmerTranslate }] }]} />
        </LinearGradient>
      </Animated.View>
    </Animated.View>
  );
}

export default function VipScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<BottomTabParamList>>();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { avatarId, backendUser } = useAuth();
  const { refreshWallet } = useGameState();
  const [vip, setVip] = useState<VipStatus | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [focusedLevel, setFocusedLevel] = useState(1);
  const [descriptionVisible, setDescriptionVisible] = useState(false);
  const [bonusHistoryVisible, setBonusHistoryVisible] = useState(false);
  const [historyTab, setHistoryTab] = useState<'month' | 'all'>('month');
  const scrollX = useRef(new Animated.Value(0)).current;
  const focusedLevelRef = useRef(1);

  // Level, XP and claims come from the server: XP is what the player has
  // staked in games, and bonuses are paid into the real balance.
  const loadVip = useCallback(() => {
    fetchVipStatus()
      .then(setVip)
      .catch(() => {});
  }, []);
  useFocusEffect(loadVip);

  // Server numbers, dressed in each level's icon and colours.
  const levels: VipLevelDef[] = (vip?.levels ?? []).map((l) => {
    const look = VIP_LOOKS.find((v) => v.level === l.level) ?? VIP_LOOKS[VIP_LOOKS.length - 1];
    return { ...look, ...l };
  });

  const claim = async (kind: 'upgrade' | 'weekly', level: number) => {
    if (claiming) return;
    setClaiming(true);
    try {
      const { amount } = await claimVipBonus(kind, level);
      Alert.alert('Bonus added', `₹${amount.toLocaleString('en-IN')} has been added to your balance. It has to be played once before it can be withdrawn.`);
      refreshWallet().catch(() => {});
    } catch (err) {
      Alert.alert('Could not claim', err instanceof ApiClientError ? err.message : 'Please try again.');
    } finally {
      setClaiming(false);
      loadVip();
    }
  };

  useEffect(() => {
    const scrollLevels = levels.filter((l) => l.level >= 1);
    if (scrollLevels.length === 0) return;
    const id = scrollX.addListener(({ value }) => {
      const index = Math.max(0, Math.min(scrollLevels.length - 1, Math.round(value / ITEM_WIDTH)));
      const level = scrollLevels[index]?.level;
      if (level && level !== focusedLevelRef.current) {
        focusedLevelRef.current = level;
        setFocusedLevel(level);
      }
    });
    return () => scrollX.removeListener(id);
  }, [vip, scrollX]);

  if (!vip || levels.length === 0) {
    return (
      <ScreenContainer scroll={false}>
        <LoadingState />
      </ScreenContainer>
    );
  }

  const playerName = backendUser?.uid ? `Player${backendUser.uid}` : 'Player';
  const scrollLevels = levels.filter((l) => l.level >= 1);
  const current = levels.find((l) => l.level === focusedLevel) ?? scrollLevels[0];
  const prev = levels.find((l) => l.level === focusedLevel - 1) ?? levels[0];
  const progressTarget = Math.max(1, current.xpRequired - prev.xpRequired);
  const progressValue = Math.max(0, Math.min(progressTarget, vip.xp - prev.xpRequired));
  const progress = progressValue / progressTarget;
  const privileges = buildPrivileges(current);
  const hasBenefits = Boolean(current.weeklyBonus || current.upgradeBonus);

  const handleMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / ITEM_WIDTH);
    const level = scrollLevels[Math.max(0, Math.min(scrollLevels.length - 1, index))]?.level;
    if (level) setFocusedLevel(level);
  };

  const descriptionImageWidth = Math.min(400, screenWidth - spacing.lg * 4);
  const descriptionImageHeight = Math.min(descriptionImageWidth / DESCRIPTION_IMAGE_ASPECT, screenHeight * 0.8);
  const descriptionImageWidthCapped = descriptionImageHeight * DESCRIPTION_IMAGE_ASPECT;

  const bonusCardWidth = Math.min(400, screenWidth - spacing.lg * 4);
  const bonusTopHeight = bonusCardWidth * (114 / 640);
  const vipBonusHistory = vip.history.map((h) => ({
    id: `${h.kind}-${h.level}-${h.createdAt}`,
    title: `VIP ${h.level} ${h.kind === 'upgrade' ? 'Upgrade' : 'Weekly'} Bonus`,
    amount: h.amount,
    timestampISO: h.createdAt,
  }));
  const totalVipRewards = vipBonusHistory.reduce((sum, b) => sum + b.amount, 0);
  const now = new Date();
  const filteredBonusHistory =
    historyTab === 'all'
      ? vipBonusHistory
      : vipBonusHistory.filter((b) => {
          const d = new Date(b.timestampISO);
          return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        });

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.navigate('Home')} style={styles.backButton}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.gold} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Image source={AVATARS[avatarId - 1]} style={styles.avatar} />
          <Text style={styles.username} numberOfLines={1}>
            {playerName}
          </Text>
          <LinearGradient colors={gradients.goldButton} style={styles.vipBadge}>
            <MaterialCommunityIcons name="crown" size={12} color={colors.background} />
            <Text style={styles.vipBadgeText}>VIP {vip.level}</Text>
          </LinearGradient>
        </View>
        <View style={styles.backButton} />
      </View>

      <Animated.FlatList
        data={scrollLevels}
        keyExtractor={(item) => String(item.level)}
        horizontal
        snapToInterval={ITEM_WIDTH}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: (screenWidth - ITEM_WIDTH) / 2 }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
          useNativeDriver: true,
        })}
        onMomentumScrollEnd={handleMomentumEnd}
        scrollEventThrottle={16}
        getItemLayout={(_, index) => ({ length: ITEM_WIDTH, offset: ITEM_WIDTH * index, index })}
        renderItem={({ item, index }) => {
          const inputRange = [(index - 1) * ITEM_WIDTH, index * ITEM_WIDTH, (index + 1) * ITEM_WIDTH];
          const scale = scrollX.interpolate({ inputRange, outputRange: [0.6, 1, 0.6], extrapolate: 'clamp' });
          const opacity = scrollX.interpolate({ inputRange, outputRange: [0.4, 1, 0.4], extrapolate: 'clamp' });
          return (
            <View style={styles.carouselItem}>
              <Animated.View style={[styles.topDot, { opacity, transform: [{ scale }] }]} />
              <Animated.Text style={[styles.dotLabel, { opacity }]}>V{item.level}</Animated.Text>
              <DiamondBadge level={item} scale={scale} opacity={opacity} />
              <Animated.View style={[styles.levelPill, { opacity }]}>
                <Text style={styles.levelPillText}>V{item.level}</Text>
              </Animated.View>
            </View>
          );
        }}
      />

      <View style={styles.progressCard}>
        <View style={styles.progressLabelsRow}>
          <Text style={styles.progressLabelText}>V0</Text>
          <Text style={styles.progressLabelText}>V{current.level}</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
        <Text style={styles.progressCount}>
          {progressValue.toLocaleString('en-US')}/{progressTarget.toLocaleString('en-US')}
        </Text>
        <Text style={styles.progressHint}>Your XP: {vip.xp.toLocaleString('en-IN')} · every ₹1 you bet = 1 XP</Text>
      </View>

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>V{current.level} level privileges</Text>
        <Pressable onPress={() => setDescriptionVisible(true)}>
          <Text style={styles.sectionLink}>View VIP level description ›</Text>
        </Pressable>
      </View>

      <Animated.ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.privilegesRow}>
        {privileges.map((priv, i) => (
          <React.Fragment key={priv.label}>
            <View style={styles.privilegeCard}>
              <View style={styles.privilegeLock}>
                <MaterialCommunityIcons name="lock-outline" size={11} color={colors.gold} />
              </View>
              <MaterialCommunityIcons name={priv.icon} size={36} color={colors.gold} />
              <Text style={styles.privilegeLabel}>{priv.label}</Text>
              <Text style={styles.privilegeValue}>{priv.value}</Text>
            </View>
            {i < privileges.length - 1 ? (
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} style={styles.privilegeChevron} />
            ) : null}
          </React.Fragment>
        ))}
      </Animated.ScrollView>

      {hasBenefits ? (
        <>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>V{current.level} level benefits</Text>
            <Pressable onPress={() => setBonusHistoryVisible(true)}>
              <Text style={styles.sectionLink}>View my bonus history ›</Text>
            </Pressable>
          </View>
          <View style={styles.benefitsList}>
            {current.upgradeBonus ? (
              <BenefitRow
                icon="treasure-chest"
                title="Upgrade Bonus"
                amount={current.upgradeBonus}
                level={current.level}
                reached={vip.level >= current.level}
                claimed={vip.claimedUpgrades.includes(current.level)}
                onClaim={() => claim('upgrade', current.level)}
              />
            ) : null}
            {current.weeklyBonus ? (
              <BenefitRow
                icon="calendar-week"
                title="Weekly Bonus"
                amount={current.weeklyBonus}
                level={current.level}
                reached={vip.level === current.level}
                claimed={vip.weeklyClaimedLevels.includes(current.level)}
                lockedText={vip.level > current.level ? 'Your level is higher' : undefined}
                onClaim={() => claim('weekly', current.level)}
              />
            ) : null}
          </View>
        </>
      ) : null}

      <Pressable style={styles.levelUpButtonWrap} onPress={() => navigation.navigate('Home')}>
        <LinearGradient colors={gradients.crimsonButton} style={styles.levelUpButton}>
          <Text style={styles.levelUpLabel}>Level up now</Text>
        </LinearGradient>
      </Pressable>

      <Modal
        visible={descriptionVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDescriptionVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setDescriptionVisible(false)}>
          <Pressable
            style={{ width: descriptionImageWidthCapped, height: descriptionImageHeight }}
            onPress={() => {}}
          >
            <Pressable onPress={() => setDescriptionVisible(false)} style={styles.closeButton}>
              <MaterialCommunityIcons name="close-circle" size={28} color={colors.gold} />
            </Pressable>
            <Image
              source={require('../../assets/vip-level-description.webp')}
              style={{ width: descriptionImageWidthCapped, height: descriptionImageHeight, borderRadius: radius.lg }}
              resizeMode="contain"
            />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={bonusHistoryVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setBonusHistoryVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setBonusHistoryVisible(false)}>
          <Pressable style={{ width: bonusCardWidth }} onPress={() => {}}>
            <View style={styles.bonusHeaderRow}>
              <MaterialCommunityIcons name="diamond-stone" size={28} color={colors.gold} />
              <View style={styles.bonusHeaderCenter}>
                <Image source={AVATARS[avatarId - 1]} style={styles.bonusAvatar} />
                <Text style={styles.bonusUsername} numberOfLines={1}>
                  {playerName}
                </Text>
                <View style={styles.bonusVipBadge}>
                  <MaterialCommunityIcons name="crown" size={11} color={colors.gold} />
                  <Text style={styles.bonusVipBadgeText}>VIP {vip.level}</Text>
                </View>
              </View>
              <View style={styles.bonusHeaderRight}>
                <MaterialCommunityIcons name="cards-club" size={26} color={colors.crimsonLight} />
                <Text style={styles.bonusHeaderRightLabel}>VIP</Text>
              </View>
              <Pressable onPress={() => setBonusHistoryVisible(false)} style={styles.bonusCloseButton}>
                <MaterialCommunityIcons name="close-circle" size={26} color={colors.gold} />
              </Pressable>
            </View>

            <Image
              source={require('../../assets/vip-bonus-history-top.jpg')}
              style={{ width: bonusCardWidth, height: bonusTopHeight }}
              resizeMode="stretch"
            />
            <LinearGradient colors={gradients.goldButton} style={styles.bonusRewardsBox}>
              <Text style={styles.bonusRewardsLabel}>Total Rewards</Text>
              <Text style={styles.bonusRewardsValue}>₹{totalVipRewards.toLocaleString('en-IN')}</Text>
            </LinearGradient>

            <View style={styles.bonusTabRow}>
              <Pressable style={styles.bonusTab} onPress={() => setHistoryTab('month')}>
                <Text style={[styles.bonusTabText, historyTab === 'month' && styles.bonusTabTextActive]}>Month</Text>
                {historyTab === 'month' ? <View style={styles.bonusTabUnderline} /> : null}
              </Pressable>
              <Pressable style={styles.bonusTab} onPress={() => setHistoryTab('all')}>
                <Text style={[styles.bonusTabText, historyTab === 'all' && styles.bonusTabTextActive]}>ALL</Text>
                {historyTab === 'all' ? <View style={styles.bonusTabUnderline} /> : null}
              </Pressable>
            </View>

            <View style={styles.bonusPanel}>
              {filteredBonusHistory.length === 0 ? (
                <View style={styles.bonusEmpty}>
                  <MaterialCommunityIcons name="clipboard-text-outline" size={56} color={colors.crimsonLight} />
                  <Text style={styles.bonusEmptyText}>No bonus history.</Text>
                </View>
              ) : (
                <View style={styles.bonusHistoryList}>
                  {filteredBonusHistory.map((record) => (
                    <View key={record.id} style={styles.bonusHistoryRow}>
                      <View style={styles.benefitIconWrap}>
                        <MaterialCommunityIcons name="crown-outline" size={18} color={colors.gold} />
                      </View>
                      <View style={styles.benefitMiddle}>
                        <Text style={styles.benefitTitle}>{record.title}</Text>
                        <Text style={styles.bonusHistoryTimestamp}>
                          {new Date(record.timestampISO).toLocaleDateString()}
                        </Text>
                      </View>
                      <Text style={styles.bonusHistoryAmount}>+₹{record.amount.toLocaleString('en-IN')}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  progressHint: { color: colors.textMuted, fontSize: typography.xs, textAlign: 'center', marginTop: spacing.xs },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  backButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  avatar: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: colors.gold },
  username: { color: colors.textPrimary, fontSize: typography.lg, fontWeight: '800', marginTop: spacing.xs },
  vipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginTop: spacing.xs,
  },
  vipBadgeText: { color: colors.background, fontSize: typography.xs, fontWeight: '800' },
  carouselItem: { width: ITEM_WIDTH, alignItems: 'center', justifyContent: 'flex-end' },
  topDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold, marginBottom: spacing.xs },
  dotLabel: { color: colors.textSecondary, fontSize: typography.xs, fontWeight: '700', marginBottom: spacing.md },
  diamondWrap: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 10,
  },
  diamondRotate: {
    width: DIAMOND_SIZE,
    height: DIAMOND_SIZE,
    borderRadius: 18,
    overflow: 'hidden',
    transform: [{ rotate: '45deg' }],
  },
  diamond: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  diamondInner: { transform: [{ rotate: '-45deg' }] },
  levelPill: {
    marginTop: spacing.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  levelPillText: { color: colors.gold, fontSize: typography.md, fontWeight: '800' },
  progressCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  progressLabelsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabelText: { color: colors.gold, fontSize: typography.sm, fontWeight: '800' },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceAlt,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.gold },
  progressCount: { color: colors.textMuted, fontSize: typography.xs, marginTop: spacing.xs, textAlign: 'center' },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: spacing.lg,
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  sectionTitle: { color: colors.textPrimary, fontSize: typography.lg, fontWeight: '800' },
  sectionLink: { color: colors.crimsonLight, fontSize: typography.xs, fontWeight: '700' },
  privilegesRow: { paddingHorizontal: spacing.lg, alignItems: 'center' },
  privilegeCard: {
    width: 128,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  privilegeLock: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privilegeLabel: {
    color: colors.textSecondary,
    fontSize: typography.xs,
    fontWeight: '700',
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  privilegeValue: { color: colors.gold, fontSize: typography.sm, fontWeight: '800', marginTop: spacing.xs },
  privilegeChevron: { marginHorizontal: spacing.xs },
  benefitsList: { marginHorizontal: spacing.lg, gap: spacing.md },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  benefitIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  benefitMiddle: { flex: 1 },
  benefitTitle: { color: colors.textPrimary, fontSize: typography.sm, fontWeight: '700' },
  benefitAmount: { color: colors.gold, fontSize: typography.md, fontWeight: '800', marginTop: 2 },
  benefitStatus: { color: colors.textMuted, fontSize: typography.xs, fontWeight: '600', maxWidth: 110, textAlign: 'right' },
  benefitStatusActive: { color: colors.gold, fontWeight: '800' },
  levelUpButtonWrap: { marginHorizontal: spacing.lg, marginTop: spacing.xxl },
  levelUpButton: { borderRadius: radius.pill, paddingVertical: spacing.lg, alignItems: 'center' },
  levelUpLabel: { color: colors.textPrimary, fontSize: typography.lg, fontWeight: '800' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  closeButton: {
    position: 'absolute',
    top: -14,
    right: -6,
    zIndex: 1,
  },
  diamondShimmer: {
    position: 'absolute',
    top: -20,
    bottom: -20,
    width: DIAMOND_SIZE * 0.3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  bonusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  bonusHeaderCenter: { flex: 1, alignItems: 'center', marginHorizontal: spacing.sm },
  bonusAvatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: colors.gold },
  bonusUsername: { color: colors.textPrimary, fontSize: typography.sm, fontWeight: '700', marginTop: spacing.xs },
  bonusVipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginTop: 2,
  },
  bonusVipBadgeText: { color: colors.gold, fontSize: typography.xs, fontWeight: '700' },
  bonusHeaderRight: { alignItems: 'center' },
  bonusHeaderRightLabel: { color: colors.crimsonLight, fontSize: typography.xs, fontWeight: '700', marginTop: 2 },
  bonusCloseButton: { marginLeft: spacing.sm },
  bonusRewardsBox: { alignItems: 'center', paddingVertical: spacing.lg },
  bonusRewardsLabel: { color: '#5C3A0E', fontSize: typography.md, fontWeight: '700' },
  bonusRewardsValue: { color: '#5C3A0E', fontSize: 48, fontWeight: '800', marginTop: spacing.xs },
  bonusTabRow: {
    flexDirection: 'row',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.gold,
    backgroundColor: colors.background,
  },
  bonusTab: { flex: 1, alignItems: 'center', paddingVertical: spacing.md },
  bonusTabText: { color: colors.textMuted, fontSize: typography.md, fontWeight: '700' },
  bonusTabTextActive: { color: colors.gold },
  bonusTabUnderline: { marginTop: spacing.xs, height: 2, width: '70%', backgroundColor: colors.gold },
  bonusPanel: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.gold,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    backgroundColor: colors.background,
    minHeight: 200,
    padding: spacing.lg,
  },
  bonusEmpty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl },
  bonusEmptyText: { color: colors.gold, fontSize: typography.md, fontWeight: '700', marginTop: spacing.lg },
  bonusHistoryList: { gap: spacing.sm },
  bonusHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  bonusHistoryTimestamp: { color: colors.textMuted, fontSize: typography.xs, marginTop: 2 },
  bonusHistoryAmount: { color: colors.positive, fontSize: typography.md, fontWeight: '800' },
});
