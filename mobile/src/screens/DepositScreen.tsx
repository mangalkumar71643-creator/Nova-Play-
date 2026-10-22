import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, AppState, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import ScreenContainer from '../components/ScreenContainer';
import { ApiClientError } from '../api/client';
import { DepositBonusInfo, UpiDepositStatus, confirmUpiDeposits, fetchDepositBonus, fetchUpiDepositStatus, startUpiCheckout } from '../api/backend';
import { RootStackParamList } from '../navigation/types';
import { KYC_REQUIRED, useAuth } from '../state/AuthContext';
import { useGameState } from '../state/GameStateContext';
import { colors, gradients, radius, spacing, typography } from '../theme';

const CARD_TEXT_COLOR = '#5C3A0E';
const MIN_DEPOSIT = 100;
// Matches the backend's MAX_UPI_DEPOSIT; the server's own value (upi.max) wins once loaded.
const MAX_DEPOSIT = 50000;
// The buttons until the server's own (set in the admin panel) arrive.
const QUICK_AMOUNTS = [100, 200, 300, 500, 1000, 2000, 5000, 10000, 20000, 50000];

// Same rule as backend/src/services/depositBonusService.ts's bonusFor, used
// only to preview the bonus before depositing. The backend works out and
// grants the real amount itself; this is never trusted to credit anything.
/** 7, 7.5 or 1,000 — no ".00" on whole rupees. */
function fmtBonus(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function previewBonus(info: DepositBonusInfo | null, amount: number): number {
  if (!info) return 0;
  if (info.tiers.length === 0) return Math.round(Math.min(amount * info.percent, info.cap) * 100) / 100;
  let bonus = 0;
  for (const t of info.tiers) if (amount >= t.min) bonus = t.bonus;
  return bonus;
}

export default function DepositScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { coins, withdrawable, refreshWallet } = useGameState();
  const [bonusInfo, setBonusInfo] = useState<DepositBonusInfo | null>(null);
  const { backendUser } = useAuth();
  const [amountText, setAmountText] = useState(String(QUICK_AMOUNTS[1]));
  const [busy, setBusy] = useState(false);
  const [upi, setUpi] = useState<UpiDepositStatus | null>(null);
  // Celebration overlay shown when a deposit is confirmed (replaces a plain alert).
  const [successInfo, setSuccessInfo] = useState<{ total: number; bonus: number } | null>(null);
  const successScale = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  // The StockPay UPI payment page opened from here; checked when the app comes back.
  const pendingSession = useRef<string | null>(null);

  const showSuccess = useCallback(
    (total: number, bonus: number) => {
      successScale.setValue(0);
      successOpacity.setValue(0);
      setSuccessInfo({ total, bonus });
      Animated.parallel([
        Animated.spring(successScale, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }),
        Animated.timing(successOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    },
    [successScale, successOpacity]
  );

  const reportUpiResults = useCallback(
    async (sessionId?: string, quiet = false) => {
      try {
        const { results } = await confirmUpiDeposits(sessionId);
        // The webhook may have credited it already (alreadyCredited): when
        // this is the payment the player just made, still say it arrived.
        const done = results.filter((r) => r.status === 'COMPLETED' && (sessionId ? true : !r.alreadyCredited));
        if (results.length > 0) {
          await refreshWallet();
          // A deposit can use up a first-deposit-only bonus.
          fetchDepositBonus().then(setBonusInfo).catch(() => {});
        }
        if (done.length > 0) {
          const total = done.reduce((s, r) => s + r.amount, 0);
          const bonus = done.reduce((s, r) => s + r.bonus, 0);
          showSuccess(total, bonus);
        } else if (!quiet && results.some((r) => r.status === 'PENDING')) {
          Alert.alert('Payment not finished', 'We have not received this payment yet. If you paid, your balance will update shortly.');
        } else if (!quiet && results.some((r) => r.status === 'FAILED')) {
          Alert.alert('Payment cancelled', 'No money was taken.');
        }
      } catch {
        // Checked again next time the app comes back to this screen.
      }
    },
    [refreshWallet, showSuccess]
  );

  useEffect(() => {
    fetchUpiDepositStatus().then(setUpi).catch(() => setUpi(null));
    fetchDepositBonus().then(setBonusInfo).catch(() => setBonusInfo(null));
    // Settle any UPI payment left open last time (e.g. the app was closed while paying).
    reportUpiResults(undefined, true);
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !pendingSession.current) return;
      const sessionId = pendingSession.current;
      pendingSession.current = null;
      reportUpiResults(sessionId);
    });
    return () => sub.remove();
  }, [reportUpiResults]);

  const kycApproved = !KYC_REQUIRED || backendUser?.kycStatus === 'APPROVED';
  const amount = Number(amountText);
  const maxDeposit = upi?.max ?? MAX_DEPOSIT;
  const quickAmounts = bonusInfo?.amounts?.length ? bonusInfo.amounts.filter((a) => a >= MIN_DEPOSIT && a <= maxDeposit) : QUICK_AMOUNTS;
  const isValidAmount = amountText.trim().length > 0 && amount >= MIN_DEPOSIT && amount <= maxDeposit;
  const bonusPreview = isValidAmount ? previewBonus(bonusInfo, amount) : 0;
  // This player's next deposit gets a bonus of some size (a percent, or a slab it can reach).
  const hasOffer = !!bonusInfo && (bonusInfo.percent > 0 || bonusInfo.tiers.some((t) => t.bonus > 0));

  async function handlePayNow() {
    if (!kycApproved) {
      Alert.alert('Verify your identity', 'Complete KYC verification in Settings before depositing.');
      return;
    }
    if (!isValidAmount) return;
    // A payment company is set up but not open to this account: say why,
    // rather than falling through to the old (closed) deposit.
    if (upi && !upi.enabled && upi.gateway) {
      Alert.alert('UPI payment not available', upi.reason ?? 'Please try again later.');
      return;
    }
    setBusy(true);
    if (upi?.enabled) {
      try {
        const { sessionId, url } = await startUpiCheckout(amount);
        pendingSession.current = sessionId;
        await Linking.openURL(url);
      } catch (err) {
        pendingSession.current = null;
        Alert.alert('Payment failed', err instanceof ApiClientError ? err.message : 'Please try again.');
      } finally {
        setBusy(false);
      }
      return;
    }
    // Money comes in only by UPI (RupayEx); there is no other deposit.
    setBusy(false);
    Alert.alert('UPI payment not available', 'UPI deposits are not available right now. Please try again later.');
  }

  return (
    <ScreenContainer scroll={false} contentStyle={{ paddingHorizontal: 0 }}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headerButton} testID="deposit-back-button">
          <MaterialCommunityIcons name="chevron-left" size={28} color={colors.gold} />
        </Pressable>
        <Text style={styles.headerTitle}>Deposit</Text>
        <View style={styles.headerRight}>
          <Pressable onPress={() => navigation.navigate('Help')} style={styles.headerButton} testID="deposit-help-button">
            <MaterialCommunityIcons name="headset" size={24} color={colors.gold} />
          </Pressable>
          <Pressable onPress={() => navigation.navigate('History', { kind: 'deposit' })} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="History" testID="deposit-history-button">
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
            <Text style={styles.balanceValue} testID="deposit-cash-balance">₹{Math.floor(coins)}</Text>
          </LinearGradient>

          <Pressable style={{ flex: 1 }} onPress={() => navigation.navigate('Withdraw')} accessibilityRole="button" accessibilityLabel="Withdraw" testID="deposit-withdraw-card">
            <LinearGradient colors={gradients.peachCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balanceCard}>
              <MaterialCommunityIcons name="chevron-right" size={22} color={CARD_TEXT_COLOR} style={styles.balanceCardArrow} />
              <Text style={styles.balanceLabel}>Withdrawable</Text>
              <Text style={styles.balanceValue}>₹{Math.floor(withdrawable)}</Text>
            </LinearGradient>
          </Pressable>
        </View>

        {!kycApproved ? (
          <View style={styles.kycBanner} testID="deposit-kyc-banner">
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
              Min: ₹{MIN_DEPOSIT}   Max: ₹{maxDeposit.toLocaleString('en-IN')}
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
              testID="deposit-amount-input"
            />
          </View>

          <View style={styles.quickGrid}>
            {quickAmounts.map((value) => {
              const selected = amount === value;
              const chipBonus = previewBonus(bonusInfo, value);
              return (
                <Pressable
                  key={value}
                  style={[styles.quickChip, selected && styles.quickChipSelected]}
                  onPress={() => setAmountText(String(value))}
                  testID={`deposit-quick-amount-${value}`}
                >
                  {chipBonus > 0 ? (
                    <View style={[styles.chipBonusBadge, selected && styles.chipBonusBadgeSelected]}>
                      <Text style={[styles.chipBonusBadgeText, selected && styles.chipBonusBadgeTextSelected]}>+{fmtBonus(chipBonus)}</Text>
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

        {hasOffer ? (
          <View style={{ marginBottom: spacing.xl }} testID="deposit-bonus-preview">
            <Text style={styles.promoTitle}>
              Promotion amount <Text style={{ color: colors.gold }}>*</Text>
            </Text>
            <View style={styles.promoCard}>
              <LinearGradient colors={gradients.peachCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.promoTotalBox}>
                <Text style={styles.promoTotalLabel}>Total</Text>
                <Text style={styles.promoTotalValue}>₹{fmtBonus(isValidAmount ? amount + bonusPreview : 0)}</Text>
              </LinearGradient>
              <View style={styles.promoBonusBox}>
                <Text style={styles.promoBonusText}>
                  {bonusPreview > 0
                    ? bonusInfo!.tiers.length > 0
                      ? `+₹${fmtBonus(bonusPreview)} Bonus`
                      : `+${fmtBonus(bonusInfo!.percent * 100)}% Bonus`
                    : `Deposit ₹${(bonusInfo!.tiers[0]?.min ?? MIN_DEPOSIT).toLocaleString('en-IN')} or more for a bonus`}
                </Text>
                {bonusPreview > 0 ? <MaterialCommunityIcons name="check-circle" size={24} color={colors.positive} /> : null}
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.tipsBlock}>
          <Text style={styles.tipsTitle}>Deposit tips:</Text>
          <Text style={styles.tipsText}>1. Pay securely with any UPI app (Google Pay, PhonePe, Paytm) on the payment page.</Text>
          <Text style={styles.tipsText}>2. Each deposit is credited within 1-5 minutes.</Text>
          <Text style={styles.tipsText}>
            3. After the payment is successful, return here to check your updated balance.
          </Text>
          <Text style={styles.tipsText}>
            4. If your deposit doesn't arrive within 30 minutes, please contact customer support.
          </Text>
        </View>

        <View style={styles.tipsBlock}>
          <Text style={styles.tipsTitle}>Important notes:</Text>
          <Text style={styles.tipsText}>
            Please do not modify the payment amount on the UPI payment page. Avoid reusing saved payment
            details for multiple payments.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.payBar}>
        {upi?.enabled ? (
          <Text style={{ color: colors.gold, textAlign: 'center', fontSize: 12, marginBottom: 6 }} testID="deposit-gateway-note">
            Pay by UPI with {upi.gatewayName}{upi.testMode ? ' · TEST MODE (no real money)' : ''}
          </Text>
        ) : null}
        <Pressable
          onPress={handlePayNow}
          disabled={!isValidAmount || !kycApproved || busy}
          style={{ opacity: !isValidAmount || !kycApproved || busy ? 0.5 : 1 }}
          testID="deposit-pay-now-button"
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

      {successInfo ? (
        <View style={styles.successOverlay} testID="deposit-success-overlay">
          <Animated.View style={[styles.successCard, { opacity: successOpacity }]}>
            <Animated.View style={[styles.successIconWrap, { transform: [{ scale: successScale }] }]}>
              <MaterialCommunityIcons name="check-decagram" size={72} color={colors.positive} />
            </Animated.View>
            <Text style={styles.successTitle}>Deposit Successful!</Text>
            <Text style={styles.successAmount} testID="deposit-success-amount">
              +₹{successInfo.total.toLocaleString('en-IN')}
            </Text>
            {successInfo.bonus > 0 ? (
              <View style={styles.successBonusRow}>
                <MaterialCommunityIcons name="gift-outline" size={16} color={colors.gold} />
                <Text style={styles.successBonusText}>+₹{successInfo.bonus.toLocaleString('en-IN')} bonus added</Text>
              </View>
            ) : null}
            <Text style={styles.successNote}>Your wallet balance has been updated.</Text>
            <Pressable
              onPress={() => setSuccessInfo(null)}
              testID="deposit-success-done-button"
              style={styles.successButtonOuter}
            >
              <LinearGradient
                colors={gradients.goldButton}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.successButton}
              >
                <Text style={styles.successButtonText}>Done</Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </View>
      ) : null}
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
    paddingTop: spacing.lg + 2,
    paddingBottom: spacing.md - 2,
    alignItems: 'center' as const,
    overflow: 'hidden' as const,
  },
  quickChipSelected: { backgroundColor: colors.crimson, borderColor: colors.crimsonLight },
  quickChipText: { color: colors.textSecondary, fontWeight: '700' as const, fontSize: typography.sm },
  quickChipTextSelected: { color: colors.textPrimary },
  chipBonusBadge: {
    position: 'absolute' as const,
    top: 0,
    right: 0,
    backgroundColor: colors.crimson,
    borderTopRightRadius: radius.md,
    borderBottomLeftRadius: radius.md,
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  chipBonusBadgeSelected: { backgroundColor: colors.gold },
  chipBonusBadgeTextSelected: { color: colors.crimson },
  chipBonusBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' as const },
  promoTitle: { color: colors.textPrimary, fontSize: typography.lg, fontWeight: '700' as const, marginBottom: spacing.sm },
  promoCard: {
    flexDirection: 'row' as const,
    alignItems: 'stretch' as const,
    backgroundColor: colors.crimson,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.goldLight,
    overflow: 'hidden' as const,
    minHeight: 84,
  },
  promoTotalBox: { width: '32%' as const, justifyContent: 'center' as const, paddingHorizontal: spacing.lg },
  promoTotalLabel: { color: CARD_TEXT_COLOR, fontSize: typography.md, fontWeight: '700' as const },
  promoTotalValue: { color: CARD_TEXT_COLOR, fontSize: typography.lg, fontWeight: '800' as const },
  promoBonusBox: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  promoBonusText: { color: colors.goldLight, fontSize: typography.lg, fontWeight: '800' as const, flexShrink: 1 },
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
  successOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlay,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: spacing.xl,
  },
  successCard: {
    width: '100%' as const,
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center' as const,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  successIconWrap: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.positive,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: spacing.lg,
  },
  successTitle: { color: colors.textPrimary, fontSize: typography.xl, fontWeight: '800' as const, marginBottom: spacing.sm },
  successAmount: { color: colors.positive, fontSize: typography.xxl, fontWeight: '800' as const, marginBottom: spacing.sm },
  successBonusRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  successBonusText: { color: colors.gold, fontSize: typography.sm, fontWeight: '700' as const },
  successNote: { color: colors.textSecondary, fontSize: typography.sm, textAlign: 'center' as const, marginBottom: spacing.lg },
  successButtonOuter: { alignSelf: 'stretch' as const },
  successButton: { borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: 'center' as const },
  successButtonText: { color: CARD_TEXT_COLOR, fontWeight: '800' as const, fontSize: typography.md, letterSpacing: 1 },
};
