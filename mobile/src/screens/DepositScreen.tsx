import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import ScreenContainer from '../components/ScreenContainer';
import { ApiClientError } from '../api/client';
import { RootStackParamList } from '../navigation/types';
import { KYC_REQUIRED, useAuth } from '../state/AuthContext';
import { useGameState } from '../state/GameStateContext';
import * as walletService from '../services/walletService';
import { colors, gradients, radius, spacing, typography } from '../theme';

const CARD_TEXT_COLOR = '#5C3A0E';
const MIN_DEPOSIT = 100;
const MAX_DEPOSIT = 5000;
const QUICK_AMOUNTS = [100, 200, 300, 500, 1000, 2000, 3000, 5000];

// Mirrors backend/src/config/env.ts's `wallet.firstDepositBonusPercent` /
// `firstDepositBonusCap` defaults — used only to preview what the bonus
// will be before depositing. The backend recomputes and grants the real
// amount independently; this is never trusted to credit anything itself.
const FIRST_DEPOSIT_BONUS_PERCENT = 0.15;
const FIRST_DEPOSIT_BONUS_CAP = 500;

function previewBonus(amount: number): number {
  return Math.round(Math.min(amount * FIRST_DEPOSIT_BONUS_PERCENT, FIRST_DEPOSIT_BONUS_CAP) * 100) / 100;
}

export default function DepositScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { coins, withdrawable, firstDepositBonusClaimed, refreshWallet } = useGameState();
  const { backendUser } = useAuth();
  const [amountText, setAmountText] = useState(String(QUICK_AMOUNTS[1]));
  const [busy, setBusy] = useState(false);

  const kycApproved = !KYC_REQUIRED || backendUser?.kycStatus === 'APPROVED';
  const amount = Number(amountText);
  const isValidAmount = amountText.trim().length > 0 && amount >= MIN_DEPOSIT && amount <= MAX_DEPOSIT;
  const bonusPreview = !firstDepositBonusClaimed && isValidAmount ? previewBonus(amount) : 0;

  async function handlePayNow() {
    if (!kycApproved) {
      Alert.alert('Verify your identity', 'Complete KYC verification in Settings before depositing.');
      return;
    }
    if (!isValidAmount) return;
    setBusy(true);
    try {
      const result = await walletService.deposit(amount);
      await refreshWallet();
      const message =
        result.bonusGranted > 0
          ? `₹${amount.toLocaleString('en-IN')} + ₹${result.bonusGranted.toLocaleString('en-IN')} first-deposit bonus has been added to your balance.`
          : `₹${amount.toLocaleString('en-IN')} has been added to your balance.`;
      Alert.alert('Deposit successful', message, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 403) {
        Alert.alert('Deposits not open yet', 'Adding money is not available right now. Please check back later.');
      } else {
        Alert.alert('Deposit failed', err instanceof ApiClientError ? err.message : 'Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenContainer scroll={false} contentStyle={{ paddingHorizontal: 0 }}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headerButton}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={colors.gold} />
        </Pressable>
        <Text style={styles.headerTitle}>Deposit</Text>
        <View style={styles.headerRight}>
          <Pressable onPress={() => navigation.navigate('Help')} style={styles.headerButton}>
            <MaterialCommunityIcons name="headset" size={24} color={colors.gold} />
          </Pressable>
          <Pressable onPress={() => navigation.navigate('History', { kind: 'deposit' })} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="History">
            <MaterialCommunityIcons name="clock-time-four-outline" size={24} color={colors.gold} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.cardsRow}>
          <LinearGradient colors={gradients.goldButton} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balanceCard}>
            <MaterialCommunityIcons
              name="wallet-outline"
              size={64}
              color={CARD_TEXT_COLOR}
              style={styles.balanceCardIcon}
            />
            <Text style={styles.balanceLabel}>Cash balance</Text>
            <Text style={styles.balanceValue}>₹{Math.floor(coins)}</Text>
          </LinearGradient>

          <Pressable style={{ flex: 1 }} onPress={() => navigation.navigate('Withdraw')} accessibilityRole="button" accessibilityLabel="Withdraw">
            <LinearGradient colors={gradients.peachCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balanceCard}>
              <MaterialCommunityIcons name="chevron-right" size={22} color={CARD_TEXT_COLOR} style={styles.balanceCardArrow} />
              <Text style={styles.balanceLabel}>Withdrawable</Text>
              <Text style={styles.balanceValue}>₹{Math.floor(withdrawable)}</Text>
            </LinearGradient>
          </Pressable>
        </View>

        {!kycApproved ? (
          <View style={styles.kycBanner}>
            <MaterialCommunityIcons name="shield-alert-outline" size={18} color={colors.gold} />
            <Text style={styles.kycBannerText}>
              Verify your identity (KYC) in Settings before you can deposit.
            </Text>
          </View>
        ) : null}

        <View style={styles.amountCard}>
          <View style={styles.amountLabelRow}>
            <Text style={styles.amountLabel}>Deposit amount:</Text>
            <Text style={styles.amountLimit}>
              Min: ₹{MIN_DEPOSIT}   Max: ₹{MAX_DEPOSIT}
            </Text>
          </View>

          <View style={styles.amountInputBox}>
            <Text style={styles.amountInputPrefix}>₹</Text>
            <TextInput
              value={amountText}
              onChangeText={(t) => setAmountText(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              style={styles.amountInput}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <View style={styles.quickGrid}>
            {QUICK_AMOUNTS.map((value) => {
              const selected = amount === value;
              const chipBonus = !firstDepositBonusClaimed ? previewBonus(value) : 0;
              return (
                <Pressable
                  key={value}
                  style={[styles.quickChip, selected && styles.quickChipSelected]}
                  onPress={() => setAmountText(String(value))}
                >
                  {chipBonus > 0 ? (
                    <View style={styles.chipBonusBadge}>
                      <Text style={styles.chipBonusBadgeText}>+₹{chipBonus.toLocaleString('en-IN')}</Text>
                    </View>
                  ) : null}
                  <Text style={[styles.quickChipText, selected && styles.quickChipTextSelected]}>
                    ₹{value.toLocaleString('en-IN')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {bonusPreview > 0 ? (
          <View style={styles.promoCard}>
            <View>
              <Text style={styles.promoTotalLabel}>Total credited</Text>
              <Text style={styles.promoTotalValue}>₹{(amount + bonusPreview).toLocaleString('en-IN')}</Text>
            </View>
            <Text style={styles.promoBonusText}>First deposit bonus{'\n'}+₹{bonusPreview.toLocaleString('en-IN')}</Text>
          </View>
        ) : null}

        <View style={styles.tipsBlock}>
          <Text style={styles.tipsTitle}>Deposit tips:</Text>
          <Text style={styles.tipsText}>1. Each deposit is credited within 1-5 minutes.</Text>
          <Text style={styles.tipsText}>
            2. After the payment is successful, return here to check your updated balance.
          </Text>
          <Text style={styles.tipsText}>
            3. If your deposit doesn't arrive within 30 minutes, please contact customer support.
          </Text>
          {bonusPreview > 0 ? (
            <Text style={styles.tipsText}>
              4. The bonus is playable immediately but only becomes withdrawable after you've staked 3x its
              value in games — track progress in Wallet.
            </Text>
          ) : null}
        </View>

        <View style={styles.tipsBlock}>
          <Text style={styles.tipsTitle}>Important notes:</Text>
          <Text style={styles.tipsText}>
            Please do not modify the payment amount. Avoid reusing saved payment details for
            multiple payments.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.payBar}>
        <Pressable
          onPress={handlePayNow}
          disabled={!isValidAmount || !kycApproved || busy}
          style={{ opacity: !isValidAmount || !kycApproved || busy ? 0.5 : 1 }}
        >
          <LinearGradient
            colors={gradients.crimsonButton}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.payButton}
          >
            <Text style={styles.payButtonText}>{busy ? 'Processing…' : 'Pay Now'}</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = {
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  headerButton: { width: 36, height: 36, alignItems: 'center' as const, justifyContent: 'center' as const },
  headerRight: { flexDirection: 'row' as const },
  headerTitle: { color: colors.gold, fontSize: typography.xl, fontWeight: '800' as const },
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: 140 },
  cardsRow: { flexDirection: 'row' as const, gap: spacing.md, marginBottom: spacing.xl },
  balanceCard: {
    flex: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    overflow: 'hidden' as const,
  },
  balanceCardIcon: { position: 'absolute' as const, right: -6, bottom: -6, opacity: 0.3, transform: [{ rotate: '-8deg' }] },
  balanceCardArrow: { position: 'absolute' as const, top: spacing.md, right: spacing.md, opacity: 0.6 },
  balanceLabel: { color: CARD_TEXT_COLOR, fontSize: typography.sm, fontWeight: '700' as const, marginBottom: spacing.sm },
  balanceValue: { color: CARD_TEXT_COLOR, fontSize: typography.xl, fontWeight: '800' as const },
  kycBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  kycBannerText: { color: colors.textSecondary, fontSize: typography.xs, flex: 1, lineHeight: 16 },
  amountCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  amountLabelRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, marginBottom: spacing.md },
  amountLabel: { color: colors.textPrimary, fontWeight: '700' as const, fontSize: typography.sm },
  amountLimit: { color: colors.textMuted, fontSize: typography.xs },
  amountInputBox: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  amountInputPrefix: { color: colors.gold, fontSize: typography.xxl, fontWeight: '800' as const },
  amountInput: {
    color: colors.gold,
    fontSize: typography.xxl,
    fontWeight: '800' as const,
    minWidth: 80,
    textAlign: 'center' as const,
    padding: 0,
  },
  quickGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.sm },
  quickChip: {
    width: '23%' as const,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    alignItems: 'center' as const,
  },
  quickChipSelected: { backgroundColor: colors.crimson, borderColor: colors.crimsonLight },
  quickChipText: { color: colors.textSecondary, fontWeight: '700' as const, fontSize: typography.sm },
  quickChipTextSelected: { color: colors.textPrimary },
  chipBonusBadge: {
    position: 'absolute' as const,
    top: -8,
    right: -4,
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  chipBonusBadgeText: { color: colors.background, fontSize: 10, fontWeight: '800' as const },
  promoCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.gold,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  promoTotalLabel: { color: colors.textMuted, fontSize: typography.xs },
  promoTotalValue: { color: colors.textPrimary, fontSize: typography.lg, fontWeight: '800' as const },
  promoBonusText: { color: colors.gold, fontSize: typography.xs, fontWeight: '700' as const, textAlign: 'right' as const },
  tipsBlock: { marginBottom: spacing.xl },
  tipsTitle: { color: colors.textPrimary, fontSize: typography.md, fontWeight: '700' as const, marginBottom: spacing.sm },
  tipsText: { color: colors.textSecondary, fontSize: typography.sm, lineHeight: 20, marginBottom: 4 },
  payBar: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  payButton: { borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: 'center' as const },
  payButtonText: { color: colors.textPrimary, fontWeight: '800' as const, fontSize: typography.md, letterSpacing: 1 },
};
