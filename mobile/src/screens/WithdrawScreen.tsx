import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import ScreenContainer from '../components/ScreenContainer';
import { ApiClientError } from '../api/client';
import { RootStackParamList } from '../navigation/types';
import { KYC_REQUIRED, useAuth } from '../state/AuthContext';
import { useGameState } from '../state/GameStateContext';
import * as walletService from '../services/walletService';
import { colors, gradients, radius, shadow, spacing, typography } from '../theme';

const CARD_TEXT_COLOR = '#5C3A0E';
const MIN_WITHDRAW = 100;
const QUICK_AMOUNTS = [100, 300, 500, 1000, 2000, 5000, 10000, 20000, 35000];

export default function WithdrawScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const {
    coins,
    withdrawable,
    lockedBonus,
    wageringRequired,
    wageringProgress,
    payoutAccountHolderName,
    payoutAccountNumber,
    hasPayoutAccount,
    dailyWithdrawalLimit,
    remainingWithdrawalLimit,
    refreshWallet,
  } = useGameState();
  const { backendUser } = useAuth();
  const [amountText, setAmountText] = useState(String(QUICK_AMOUNTS[0]));
  const [busy, setBusy] = useState(false);
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [accountInput, setAccountInput] = useState('');
  const [ifscInput, setIfscInput] = useState('');
  const [savingBank, setSavingBank] = useState(false);

  const kycApproved = !KYC_REQUIRED || backendUser?.kycStatus === 'APPROVED';
  const maxWithdraw = Math.min(withdrawable, remainingWithdrawalLimit);
  const amount = Number(amountText);
  const isValidAmount = amountText.trim().length > 0 && amount >= MIN_WITHDRAW && amount <= maxWithdraw;
  const wageringRemaining = Math.max(0, wageringRequired - wageringProgress);

  function openBankModal() {
    setNameInput(payoutAccountHolderName ?? '');
    setAccountInput(payoutAccountNumber ?? '');
    setIfscInput('');
    setBankModalOpen(true);
  }

  async function handleSaveBankAccount() {
    if (nameInput.trim().length < 2) {
      Alert.alert('Enter account holder name', "Enter the account holder's legal name.");
      return;
    }
    if (!/^\d{9,18}$/.test(accountInput.trim())) {
      Alert.alert('Invalid account number', 'Enter a valid bank account number.');
      return;
    }
    if (!/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(ifscInput.trim())) {
      Alert.alert('Invalid IFSC', 'IFSC requires 11 characters, e.g. HDFC0001234.');
      return;
    }
    setSavingBank(true);
    try {
      await walletService.setPayoutBankAccount(nameInput.trim(), accountInput.trim(), ifscInput.trim());
      await refreshWallet();
      setBankModalOpen(false);
    } catch (err) {
      Alert.alert('Could not save bank account', err instanceof ApiClientError ? err.message : 'Please try again.');
    } finally {
      setSavingBank(false);
    }
  }

  async function handleWithdraw() {
    if (!kycApproved) {
      Alert.alert('Verify your identity', 'Complete KYC verification in Settings before withdrawing.');
      return;
    }
    if (!hasPayoutAccount) {
      openBankModal();
      return;
    }
    if (!isValidAmount) return;
    setBusy(true);
    try {
      await walletService.withdraw(amount);
      await refreshWallet();
      Alert.alert(
        'Withdrawal requested',
        `₹${amount.toLocaleString('en-IN')} is on its way to your bank account ending ${payoutAccountNumber?.slice(-4)} — pending admin approval before it's sent.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      Alert.alert('Withdrawal failed', err instanceof ApiClientError ? err.message : 'Please try again.');
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
        <Text style={styles.headerTitle}>Withdraw</Text>
        <View style={styles.headerRight}>
          <Pressable onPress={() => navigation.navigate('Help')} style={styles.headerButton}>
            <MaterialCommunityIcons name="headset" size={24} color={colors.gold} />
          </Pressable>
          <Pressable onPress={() => navigation.navigate('History', { kind: 'withdraw' })} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="History">
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

          <LinearGradient colors={gradients.peachCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Withdrawable</Text>
            <Text style={styles.balanceValue}>₹{Math.floor(withdrawable)}</Text>
          </LinearGradient>
        </View>

        <Text style={styles.withdrawRule}>
          Only your winnings can be withdrawn. Money you deposit has to be played in a game first; whatever comes back from your bets becomes withdrawable.
        </Text>

        {!kycApproved ? (
          <View style={styles.kycBanner}>
            <MaterialCommunityIcons name="shield-alert-outline" size={18} color={colors.gold} />
            <Text style={styles.kycBannerText}>
              Verify your identity (KYC) in Settings before you can withdraw.
            </Text>
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>Bank Account</Text>
        <Pressable style={styles.bankRow} onPress={openBankModal}>
          <MaterialCommunityIcons name={hasPayoutAccount ? 'bank-outline' : 'plus-circle'} size={20} color={colors.gold} />
          <Text style={styles.bankRowText}>
            {hasPayoutAccount
              ? `${payoutAccountHolderName} · •••• ${payoutAccountNumber?.slice(-4)}`
              : 'Add Bank'}
          </Text>
        </Pressable>

        <View style={styles.amountCard}>
          <View style={styles.amountLabelRow}>
            <Text style={styles.amountLabel}>Withdrawal amount:</Text>
            <Text style={styles.amountLimit}>
              Min: ₹{MIN_WITHDRAW}   Max: ₹{Math.floor(maxWithdraw)}
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
              return (
                <Pressable
                  key={value}
                  style={[styles.quickChip, selected && styles.quickChipSelected]}
                  onPress={() => setAmountText(String(value))}
                >
                  <Text style={[styles.quickChipText, selected && styles.quickChipTextSelected]}>
                    ₹{value.toLocaleString('en-IN')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.limitsCard}>
          <View style={styles.limitRow}>
            <Text style={styles.limitLabel}>Remaining today's limit</Text>
            <Text style={styles.limitValue}>₹{remainingWithdrawalLimit.toLocaleString('en-IN')}</Text>
          </View>
          <View style={styles.limitRow}>
            <Text style={styles.limitLabel}>Daily withdrawal limit</Text>
            <Text style={styles.limitValue}>₹{dailyWithdrawalLimit.toLocaleString('en-IN')}</Text>
          </View>
          {lockedBonus > 0 ? (
            <View style={styles.limitRow}>
              <Text style={styles.limitLabel}>Wager requirement left</Text>
              <Text style={styles.limitValue}>₹{wageringRemaining.toLocaleString('en-IN')}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.tipsBlock}>
          <Text style={styles.tipsTitle}>Withdraw tips:</Text>
          <Text style={styles.tipsText}>
            Withdrawals go through a sandbox payment provider in this build — no processing fee is
            deducted right now. Once a real, licensed payment processor is connected, a transfer can take
            up to 24 hours to arrive.
          </Text>
          {lockedBonus > 0 ? (
            <Text style={styles.tipsText}>
              ₹{lockedBonus.toLocaleString('en-IN')} of your balance is a deposit bonus, locked until you've
              staked ₹{wageringRemaining.toLocaleString('en-IN')} more in games.
            </Text>
          ) : null}
        </View>
      </ScrollView>

      <View style={styles.payBar}>
        <Pressable
          onPress={handleWithdraw}
          disabled={(!isValidAmount && hasPayoutAccount) || !kycApproved || busy}
          style={{ opacity: (!isValidAmount && hasPayoutAccount) || !kycApproved || busy ? 0.5 : 1 }}
        >
          <LinearGradient
            colors={gradients.crimsonButton}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.payButton}
          >
            <Text style={styles.payButtonText}>{busy ? 'Processing…' : 'Withdraw'}</Text>
          </LinearGradient>
        </Pressable>
      </View>

      <Modal visible={bankModalOpen} transparent animationType="fade" onRequestClose={() => setBankModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Bank account</Text>
              <Pressable onPress={() => setBankModalOpen(false)} hitSlop={10}>
                <MaterialCommunityIcons name="close" size={22} color={colors.gold} />
              </Pressable>
            </View>

            <Text style={styles.modalLabel}>Account Holder Name</Text>
            <TextInput
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="Enter the Account Holder's Legal Name"
              placeholderTextColor={colors.textMuted}
              style={styles.modalInput}
            />

            <Text style={styles.modalLabel}>Account Number</Text>
            <TextInput
              value={accountInput}
              onChangeText={(t) => setAccountInput(t.replace(/[^0-9]/g, ''))}
              placeholder="Please Enter Account Number"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              style={styles.modalInput}
            />

            <Text style={styles.modalLabel}>IFSC</Text>
            <TextInput
              value={ifscInput}
              onChangeText={(t) => setIfscInput(t.toUpperCase())}
              placeholder="IFSC requires 11 characters"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              maxLength={11}
              style={styles.modalInput}
            />

            <View style={styles.modalNotice}>
              <MaterialCommunityIcons name="alert-circle-outline" size={16} color={colors.negative} />
              <Text style={styles.modalNoticeText}>
                Credit cards will not be supported for cash withdrawals. Please confirm your bank account
                information carefully to avoid withdrawal errors.
              </Text>
            </View>

            <Pressable onPress={handleSaveBankAccount} disabled={savingBank}>
              <LinearGradient
                colors={gradients.crimsonButton}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.modalSaveButton}
              >
                <Text style={styles.modalSaveButtonText}>{savingBank ? 'Saving…' : 'Save & Continue'}</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  withdrawRule: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: spacing.sm, marginHorizontal: spacing.xs },
  balanceCardIcon: { position: 'absolute' as const, right: -6, bottom: -6, opacity: 0.3, transform: [{ rotate: '-8deg' }] },
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
  sectionLabel: { color: colors.textPrimary, fontWeight: '700' as const, fontSize: typography.sm, marginBottom: spacing.sm },
  bankRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  bankRowText: { color: colors.textPrimary, fontWeight: '700' as const, fontSize: typography.sm },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center' as const, justifyContent: 'center' as const, padding: spacing.lg },
  modalCard: {
    width: '100%' as const,
    maxWidth: 420,
    borderRadius: radius.xl,
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.xl,
    ...shadow.glow,
  },
  modalHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: { color: colors.gold, fontSize: typography.xl, fontWeight: '800' as const },
  modalLabel: { color: colors.textPrimary, fontWeight: '700' as const, fontSize: typography.sm, marginBottom: spacing.sm },
  modalInput: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  modalNotice: {
    flexDirection: 'row' as const,
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  modalNoticeText: { flex: 1, color: colors.textSecondary, fontSize: typography.xs, lineHeight: 16 },
  modalSaveButton: { borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: 'center' as const },
  modalSaveButtonText: { color: colors.textPrimary, fontWeight: '800' as const, fontSize: typography.md, letterSpacing: 1 },
  limitsCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  limitRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const },
  limitLabel: { color: colors.textSecondary, fontSize: typography.sm },
  limitValue: { color: colors.textPrimary, fontSize: typography.sm, fontWeight: '700' as const },
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
    minWidth: 100,
    textAlign: 'center' as const,
    padding: 0,
  },
  quickGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.sm },
  quickChip: {
    width: '31%' as const,
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
  tipsBlock: { marginBottom: spacing.xl },
  tipsTitle: { color: colors.textPrimary, fontSize: typography.md, fontWeight: '700' as const, marginBottom: spacing.sm },
  tipsText: { color: colors.textSecondary, fontSize: typography.sm, lineHeight: 20 },
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
