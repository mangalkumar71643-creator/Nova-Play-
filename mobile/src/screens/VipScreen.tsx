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
import { pedestalHeight as pedestalHeightFor, VipArc, VipEmblem, VipPedestal, VipRays, VipStage, vipTier } from '../components/VipEmblem';
import ScreenContainer from '../components/ScreenContainer';
import { AVATARS } from '../data/avatars';
import { IconName, VipLevelDef } from '../data/models';
import { BottomTabParamList } from '../navigation/types';
import { vipLevels as VIP_LOOKS } from '../data/mockData';
import { useAuth } from '../state/AuthContext';
import { useGameState } from '../state/GameStateContext';
import { colors, gradients, radius, spacing, typography } from '../theme';

const DESCRIPTION_IMAGE_ASPECT = 784 / 1168;

function buildPrivileges(level: VipLevelDef): { icon: IconName; label: string; value: string }[] {
  const items: { icon: IconName; label: string; value: string }[] = [];
  if (level.weeklyBonus) items.push({ icon: 'gift', label: 'Weekly Bonus', value: `₹${level.weeklyBonus.toLocaleString('en-IN')}` });
  if (level.upgradeBonus) items.push({ icon: 'arrow-up-bold-circle', label: 'Upgrade Bonus', value: `₹${level.upgradeBonus.toLocaleString('en-IN')}` });
  items.push({ icon: 'star-four-points', label: 'Level XP', value: level.xpRequired.toLocaleString('en-IN') });
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
  return (
    <LinearGradient colors={['#561021', '#2A060D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.benefitRow}>
      <LinearGradient colors={['#7E1B2E', '#3A0913']} style={styles.benefitIconWrap}>
        <MaterialCommunityIcons name={icon} size={26} color={colors.goldLight} />
      </LinearGradient>
      <View style={styles.benefitMiddle}>
        <Text style={styles.benefitTitle}>{title}</Text>
        <Text style={styles.benefitAmount}>₹{amount.toLocaleString('en-IN')}</Text>
      </View>
      {reached && !claimed ? (
        <Pressable onPress={onClaim}>
          <LinearGradient colors={gradients.goldButton} style={styles.claimPill}>
            <Text style={styles.claimPillText}>Claim</Text>
          </LinearGradient>
        </Pressable>
      ) : claimed ? (
        <View style={styles.receivedPill}>
          <Text style={styles.receivedPillText}>Received</Text>
        </View>
      ) : (
        <Text style={styles.benefitStatus}>{lockedText ?? `VIP ${level} can claim`}</Text>
      )}
    </LinearGradient>
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
  // Centre emblem large, its neighbours peeking in at the sides.
  const itemWidth = Math.round(screenWidth * 0.44);
  const emblemSize = Math.round(itemWidth * 0.86);
  const pedestalHeight = pedestalHeightFor(itemWidth);
  // Where the pedestal's top sits, measured from the emblem box's top.
  const stageY = Math.round(emblemSize * 0.86 + pedestalHeight * 0.2);

  // Stage lighting: beams pulse and sway, sparks rise off the pedestal.
  const pulse = useRef(new Animated.Value(0)).current;
  const sway = useRef(new Animated.Value(0)).current;
  const sparks = useRef(Array.from({ length: 7 }, () => new Animated.Value(0))).current;
  useEffect(() => {
    const loops = [
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(sway, { toValue: 1, duration: 3200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(sway, { toValue: 0, duration: 3200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      ),
      ...sparks.map((v, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 380),
            Animated.timing(v, { toValue: 1, duration: 2400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
          ])
        )
      ),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [pulse, sway, sparks]);
  const beamOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  const beamSway = sway.interpolate({ inputRange: [0, 1], outputRange: ['-4deg', '4deg'] });

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
      const index = Math.max(0, Math.min(scrollLevels.length - 1, Math.round(value / itemWidth)));
      const level = scrollLevels[index]?.level;
      if (level && level !== focusedLevelRef.current) {
        focusedLevelRef.current = level;
        setFocusedLevel(level);
      }
    });
    return () => scrollX.removeListener(id);
  }, [vip, scrollX, itemWidth]);

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
  const privileges = buildPrivileges(current);
  const hasBenefits = Boolean(current.weeklyBonus || current.upgradeBonus);

  const handleMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / itemWidth);
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
      <View style={styles.hero}>
        <LinearGradient
          colors={['#8A1A2C', '#5A0E1B', '#2A060D', colors.background]}
          locations={[0, 0.38, 0.78, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.header}>
          <Pressable onPress={() => navigation.navigate('Home')} style={styles.backButton}>
            <MaterialCommunityIcons name="chevron-left" size={30} color={colors.goldLight} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Image source={AVATARS[avatarId - 1]} style={styles.avatar} />
            <View style={styles.headerText}>
              <Text style={styles.username} numberOfLines={1}>
                {playerName}
              </Text>
              <LinearGradient colors={vipTier(vip.level).ribbon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.vipBadge}>
                <MaterialCommunityIcons name="crown" size={13} color="#FFFFFF" />
                <Text style={styles.vipBadgeText}>VIP {vip.level}</Text>
              </LinearGradient>
            </View>
          </View>
          <View style={styles.backButton} />
        </View>

        <VipArc width={screenWidth} focused={focusedLevel} playerLevel={vip.level} maxLevel={scrollLevels[scrollLevels.length - 1].level} />

        <View>
        <View pointerEvents="none" style={[styles.stage, { top: stageY - pedestalHeight * 0.1 }]}>
          <VipStage width={screenWidth} height={pedestalHeight * 1.3} />
        </View>
        <Animated.FlatList
          data={scrollLevels}
          keyExtractor={(item) => String(item.level)}
          horizontal
          snapToInterval={itemWidth}
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: (screenWidth - itemWidth) / 2 }}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
            useNativeDriver: true,
          })}
          onMomentumScrollEnd={handleMomentumEnd}
          scrollEventThrottle={16}
          getItemLayout={(_, index) => ({ length: itemWidth, offset: itemWidth * index, index })}
          renderItem={({ item, index }) => {
            const inputRange = [(index - 1) * itemWidth, index * itemWidth, (index + 1) * itemWidth];
            const scale = scrollX.interpolate({ inputRange, outputRange: [0.74, 1, 0.74], extrapolate: 'clamp' });
            const opacity = scrollX.interpolate({ inputRange, outputRange: [0.7, 1, 0.7], extrapolate: 'clamp' });
            const focus = scrollX.interpolate({ inputRange, outputRange: [0, 1, 0], extrapolate: 'clamp' });
            const tier = vipTier(item.level);
            const achieved = vip.xp >= item.xpRequired;
            const pct = item.xpRequired > 0 ? Math.min(1, vip.xp / item.xpRequired) : 1;
            return (
              <View style={{ width: itemWidth, alignItems: 'center' }}>
                <Animated.View style={{ alignItems: 'center', opacity, transform: [{ scale }] }}>
                  <View style={{ width: emblemSize, height: emblemSize, zIndex: 2 }}>
                    <Animated.View
                      pointerEvents="none"
                      style={{
                        position: 'absolute',
                        width: itemWidth,
                        height: emblemSize * 2,
                        left: (emblemSize - itemWidth) / 2,
                        top: stageY - emblemSize,
                        opacity: Animated.multiply(focus, beamOpacity),
                        transform: [{ rotate: beamSway }],
                      }}
                    >
                      <VipRays width={itemWidth} height={emblemSize} />
                    </Animated.View>
                    <VipEmblem level={item.level} size={emblemSize} />
                    <LinearGradient colors={tier.ribbon} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.ribbon}>
                      <Text style={styles.ribbonText}>V{item.level}</Text>
                    </LinearGradient>
                  </View>
                  <View style={{ width: itemWidth, height: pedestalHeight, marginTop: -Math.round(emblemSize * 0.14) }}>
                    <VipPedestal width={itemWidth} />
                    <View style={[styles.capsule, { top: pedestalHeight * 0.38, width: itemWidth * 0.8 }]}>
                      {achieved ? (
                        <Text style={styles.capsuleDone}>Achieved</Text>
                      ) : (
                        <>
                          <View style={styles.capsuleRow}>
                            <Text style={styles.capsuleLevel}>V{vip.level}</Text>
                            <View style={styles.capsuleTrack}>
                              <LinearGradient colors={gradients.goldButton} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: `${Math.round(pct * 100)}%`, height: '100%' }} />
                            </View>
                            <Text style={styles.capsuleLevel}>V{item.level}</Text>
                          </View>
                          <Text style={styles.capsuleXp}>
                            {vip.xp.toLocaleString('en-US')}/{item.xpRequired.toLocaleString('en-US')}
                          </Text>
                        </>
                      )}
                    </View>
                  </View>
                </Animated.View>
              </View>
            );
          }}
        />
        <View pointerEvents="none" style={[styles.sparkField, { left: (screenWidth - itemWidth) / 2, width: itemWidth, top: stageY - emblemSize, height: emblemSize }]}>
          {sparks.map((v, i) => (
            <Animated.View
              key={i}
              style={[
                styles.spark,
                {
                  left: `${12 + ((i * 37) % 76)}%`,
                  opacity: v.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 1, 0.6, 0] }),
                  transform: [
                    { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -emblemSize * (0.55 + (i % 3) * 0.12)] }) },
                    { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] }) },
                  ],
                },
              ]}
            />
          ))}
        </View>
        </View>
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
            <LinearGradient colors={['#5E1222', '#330811']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.privilegeCard}>
              {vip.level < current.level ? (
                <View style={styles.privilegeLock}>
                  <MaterialCommunityIcons name="lock" size={13} color={colors.goldLight} />
                </View>
              ) : null}
              <LinearGradient colors={['#8A2034', '#3A0913']} style={styles.privilegeIconWrap}>
                <MaterialCommunityIcons name={priv.icon} size={34} color={colors.goldLight} />
              </LinearGradient>
              <Text style={styles.privilegeLabel}>{priv.label}</Text>
              <Text style={styles.privilegeValue}>{priv.value}</Text>
            </LinearGradient>
            {i < privileges.length - 1 ? (
              <MaterialCommunityIcons name="chevron-right" size={22} color={colors.goldDark} style={styles.privilegeChevron} />
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
                icon="hand-coin"
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
                icon="hand-coin"
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
        <LinearGradient colors={['#FF4A63', '#D11A33', '#8E0E1F']} style={styles.levelUpButton}>
          <View style={styles.levelUpShine} />
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
  hero: { paddingBottom: spacing.md, overflow: 'hidden' },
  stage: { position: 'absolute', left: 0, right: 0 },
  sparkField: { position: 'absolute' },
  spark: {
    position: 'absolute',
    bottom: 0,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#FFD1DA',
    shadowColor: '#FF2D55',
    shadowOpacity: 1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  progressHint: { color: colors.textMuted, fontSize: typography.xs, textAlign: 'center', marginTop: spacing.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  headerText: { alignItems: 'flex-start' },
  avatar: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: '#5A0E1B' },
  username: { color: colors.textPrimary, fontSize: typography.lg, fontWeight: '800', letterSpacing: 0.3 },
  vipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  vipBadgeText: { color: '#FFFFFF', fontSize: typography.sm, fontWeight: '900', fontStyle: 'italic' },
  ribbon: {
    position: 'absolute',
    bottom: '9%',
    alignSelf: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 3,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  ribbonText: {
    color: '#FFFFFF',
    fontSize: typography.lg,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  capsule: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(10,2,5,0.72)',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,138,153,0.35)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  capsuleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'stretch' },
  capsuleLevel: { color: colors.textPrimary, fontSize: typography.xs, fontWeight: '800' },
  capsuleTrack: { flex: 1, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  capsuleXp: { color: colors.textSecondary, fontSize: typography.xs, fontWeight: '700', marginTop: 1 },
  capsuleDone: { color: colors.textPrimary, fontSize: typography.sm, fontWeight: '800', paddingVertical: 4 },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionTitle: { color: colors.textPrimary, fontSize: typography.lg, fontWeight: '800' },
  sectionLink: { color: colors.crimsonLight, fontSize: typography.xs, fontWeight: '700' },
  privilegesRow: { paddingHorizontal: spacing.lg, alignItems: 'center' },
  privilegeCard: {
    width: 124,
    borderWidth: 1,
    borderColor: 'rgba(240,185,61,0.35)',
    borderRadius: 16,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  privilegeLock: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(10,2,5,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(240,185,61,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  privilegeIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,222,140,0.35)',
  },
  privilegeLabel: {
    color: colors.textPrimary,
    fontSize: typography.sm,
    fontWeight: '700',
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  privilegeValue: { color: colors.goldLight, fontSize: typography.md, fontWeight: '900', marginTop: 2 },
  privilegeChevron: { marginHorizontal: 2 },
  benefitsList: { marginHorizontal: spacing.lg, gap: spacing.md },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(240,185,61,0.25)',
    borderRadius: 16,
    padding: spacing.md,
  },
  benefitIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,222,140,0.3)',
  },
  benefitMiddle: { flex: 1 },
  benefitTitle: { color: colors.textSecondary, fontSize: typography.sm, fontWeight: '700' },
  benefitAmount: { color: colors.goldLight, fontSize: typography.xl, fontWeight: '900', marginTop: 2 },
  benefitStatus: { color: colors.textMuted, fontSize: typography.sm, fontWeight: '700', maxWidth: 120, textAlign: 'right' },
  claimPill: { borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  claimPillText: { color: '#3A2006', fontSize: typography.md, fontWeight: '900' },
  receivedPill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  receivedPillText: { color: colors.textMuted, fontSize: typography.md, fontWeight: '700' },
  levelUpButtonWrap: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    borderRadius: radius.pill,
    shadowColor: '#FF2D4A',
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  levelUpButton: {
    borderRadius: radius.pill,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,190,200,0.45)',
  },
  levelUpShine: { position: 'absolute', top: 0, left: 0, right: 0, height: '48%', backgroundColor: 'rgba(255,255,255,0.14)' },
  levelUpLabel: { color: colors.textPrimary, fontSize: typography.xl, fontWeight: '800', letterSpacing: 0.5 },
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
