import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ScreenContainer from '../components/ScreenContainer';
import { BottomTabParamList, RootStackParamList } from '../navigation/types';
import { KYC_REQUIRED, useAuth } from '../state/AuthContext';
import { useGameState } from '../state/GameStateContext';
import { colors, gradients, radius, spacing, typography } from '../theme';

const CARD_TEXT_COLOR = '#5C3A0E';

export default function WalletScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<BottomTabParamList>>();
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { coins } = useGameState();
  const { backendUser } = useAuth();

  const kycApproved = !KYC_REQUIRED || backendUser?.kycStatus === 'APPROVED';

  return (
    <ScreenContainer contentStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.navigate('Home')} style={styles.headerButton}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={colors.gold} />
        </Pressable>
        <Text style={styles.headerTitle}>Wallet</Text>
        <View style={styles.headerRight}>
          <Pressable onPress={() => rootNavigation.navigate('Help')} style={styles.headerButton}>
            <MaterialCommunityIcons name="headset" size={24} color={colors.gold} />
          </Pressable>
          <Pressable onPress={() => rootNavigation.navigate('History')} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="History">
            <MaterialCommunityIcons name="clock-time-four-outline" size={24} color={colors.gold} />
          </Pressable>
        </View>
      </View>

      <LinearGradient colors={gradients.goldButton} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balanceCard}>
        <MaterialCommunityIcons
          name="wallet-outline"
          size={110}
          color={CARD_TEXT_COLOR}
          style={styles.balanceCardIcon}
        />
        <Text style={styles.balanceLabel}>My Balance</Text>
        <Text style={styles.balanceValue}>₹{coins.toFixed(2)}</Text>
      </LinearGradient>

      {!kycApproved ? (
        <View style={styles.kycBanner}>
          <MaterialCommunityIcons name="shield-alert-outline" size={18} color={colors.gold} />
          <Text style={styles.kycBannerText}>
            Verify your identity (KYC) in Settings before you can deposit, withdraw or play for real money.
          </Text>
        </View>
      ) : null}

      <View style={styles.tipsBlock}>
        <Text style={styles.tipsTitle}>Deposit tips:</Text>
        <Text style={styles.tipsText}>
          Deposits are credited within 1-5 minutes. Contact customer service to resolve any deposit issues.
        </Text>
      </View>

      <View style={styles.tipsBlock}>
        <Text style={styles.tipsTitle}>Withdraw tips:</Text>
        <Text style={styles.tipsText}>
          Normally, the withdrawal amount will be credited to your account within 2 hours, but it may take
          up to 24 hours at the most.
        </Text>
      </View>

      <View style={styles.actionRow}>
        <Pressable style={{ flex: 1 }} onPress={() => rootNavigation.navigate('Withdraw')} disabled={!kycApproved}>
          <LinearGradient
            colors={gradients.crimsonButton}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.actionButton}
          >
            <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>Withdraw</Text>
          </LinearGradient>
        </Pressable>
        <Pressable style={{ flex: 1 }} onPress={() => rootNavigation.navigate('Deposit')} disabled={!kycApproved}>
          <LinearGradient
            colors={gradients.goldButton}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.actionButton}
          >
            <Text style={styles.actionButtonText}>Deposit</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  headerButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerRight: { flexDirection: 'row' },
  headerTitle: { color: colors.gold, fontSize: typography.xl, fontWeight: '800' },
  balanceCard: {
    borderRadius: radius.lg,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: spacing.xxl,
  },
  balanceCardIcon: { position: 'absolute', right: -10, bottom: -10, opacity: 0.25, transform: [{ rotate: '-8deg' }] },
  balanceLabel: { color: CARD_TEXT_COLOR, fontSize: typography.lg, fontWeight: '700', marginBottom: spacing.md },
  balanceValue: { color: CARD_TEXT_COLOR, fontSize: typography.display, fontWeight: '800' },
  tipsBlock: { marginBottom: spacing.xxl },
  tipsTitle: { color: colors.textPrimary, fontSize: typography.lg, fontWeight: '700', marginBottom: spacing.sm },
  tipsText: { color: colors.textSecondary, fontSize: typography.sm, lineHeight: 20 },
  kycBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  kycBannerText: { color: colors.textSecondary, fontSize: typography.xs, flex: 1, lineHeight: 16 },
  actionRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg, marginBottom: spacing.xxl },
  actionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
  },
  actionButtonText: { color: colors.background, fontWeight: '800', fontSize: typography.md },
});
