import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  createSupportRequest,
  DepositVerifyResult,
  fetchSupportOrders,
  SupportOrder,
  verifyDepositOrder,
} from '../api/backend';
import { ApiClientError } from '../api/client';
import { showAlert } from '../components/AppAlert';
import AppHeader from '../components/AppHeader';
import ScreenContainer from '../components/ScreenContainer';
import { RootStackParamList, SupportFormKind } from '../navigation/types';
import * as walletService from '../services/walletService';
import { useGameState } from '../state/GameStateContext';
import { colors, gradients, radius, spacing, typography } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const TITLES: Record<SupportFormKind, string> = {
  verify: 'Self Deposit Verify',
  deposit: 'Deposit Not Receive',
  withdraw: 'Withdrawal Problem',
  ifsc: 'IFSC Modify',
  bankName: 'Modify Bank Name',
};
const INTROS: Record<SupportFormKind, string> = {
  verify: 'Pick your deposit (or type its number) and we ask the payment company again. If it was paid, our team is told at once and adds it to your wallet.',
  deposit: 'Paid but the money did not arrive? Pick the deposit, enter the UTR from your UPI app and attach a screenshot of the payment.',
  withdraw: 'Pick the withdrawal, tell us what went wrong and attach a screenshot if you have one.',
  ifsc: 'Change the IFSC code of the bank account your withdrawals are sent to.',
  bankName: "Change the account holder name. It must match the name on your bank account exactly, or the bank can refuse the transfer.",
};
const IFSC_RE = /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const shortDate = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function SupportFormScreen() {
  const navigation = useNavigation<Nav>();
  const { kind } = useRoute<RouteProp<RootStackParamList, 'SupportForm'>>().params;
  const { payoutAccountHolderName, payoutAccountNumber, payoutIfsc, hasPayoutAccount, refreshWallet } = useGameState();

  const usesOrders = kind === 'verify' || kind === 'deposit' || kind === 'withdraw';
  const [orders, setOrders] = useState<SupportOrder[] | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [orderRef, setOrderRef] = useState('');
  const [utr, setUtr] = useState('');
  const [message, setMessage] = useState('');
  const [value, setValue] = useState(kind === 'bankName' ? payoutAccountHolderName ?? '' : '');
  const [image, setImage] = useState<{ uri: string; base64: string; type: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DepositVerifyResult | null>(null);

  useEffect(() => {
    if (!usesOrders) return;
    fetchSupportOrders()
      .then(setOrders)
      .catch((err) => setOrdersError(err instanceof ApiClientError ? err.message : 'Could not load your orders.'));
  }, [usesOrders]);

  const shownOrders = useMemo(
    () => (orders ?? []).filter((o) => (kind === 'withdraw' ? o.kind === 'withdraw' : o.kind === 'deposit')).slice(0, 8),
    [orders, kind]
  );

  async function pickImage() {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5, base64: true });
    if (picked.canceled || !picked.assets[0]?.base64) return;
    const a = picked.assets[0];
    setImage({ uri: a.uri, base64: a.base64!, type: a.mimeType && IMAGE_TYPES.includes(a.mimeType) ? a.mimeType : 'image/jpeg' });
  }

  async function submit() {
    const ref = orderRef.trim();
    if (usesOrders && ref.length < 4) {
      showAlert('Order number needed', 'Pick the order from the list, or type its number.');
      return;
    }
    if (kind === 'deposit' && !/^[A-Za-z0-9]{6,30}$/.test(utr.trim())) {
      showAlert('UTR needed', 'Enter the UTR / reference number from your UPI app (usually 12 digits).');
      return;
    }
    if (kind === 'deposit' && !image) {
      showAlert('Screenshot needed', 'Attach a screenshot of the successful payment.');
      return;
    }
    if (kind === 'withdraw' && message.trim().length < 5) {
      showAlert('Describe the problem', 'Tell us in a few words what went wrong.');
      return;
    }
    if (kind === 'ifsc' && !IFSC_RE.test(value.trim())) {
      showAlert('Invalid IFSC', 'IFSC requires 11 characters, e.g. HDFC0001234.');
      return;
    }
    if (kind === 'bankName' && value.trim().length < 2) {
      showAlert('Enter the name', "Enter the account holder's name as the bank has it.");
      return;
    }

    setBusy(true);
    try {
      if (kind === 'verify') {
        setResult(await verifyDepositOrder(ref));
        refreshWallet().catch(() => {});
      } else if (kind === 'deposit' || kind === 'withdraw') {
        await createSupportRequest({
          category: kind === 'deposit' ? 'DEPOSIT_NOT_RECEIVED' : 'WITHDRAWAL_PROBLEM',
          orderRef: ref,
          utr: kind === 'deposit' ? utr.trim() : undefined,
          message: message.trim() || undefined,
          image: image ? { base64: image.base64, type: image.type } : undefined,
        });
        showAlert('Request submitted', 'Our team will look into it. Follow it under Progress query.', [
          { text: 'Progress query', onPress: () => navigation.replace('SupportProgress') },
        ], { kind: 'success' });
      } else {
        const ifsc = kind === 'ifsc' ? value.trim().toUpperCase() : payoutIfsc!;
        const holder = kind === 'bankName' ? value.trim() : payoutAccountHolderName!;
        await walletService.setPayoutBankAccount(holder, payoutAccountNumber!, ifsc);
        await refreshWallet();
        showAlert('Saved', kind === 'ifsc' ? `Your IFSC is now ${ifsc}.` : `The account holder name is now ${holder}.`, [
          { text: 'Done', onPress: () => navigation.goBack() },
        ], { kind: 'success' });
      }
    } catch (err) {
      showAlert('Could not send', err instanceof ApiClientError ? err.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const needsBank = (kind === 'ifsc' || kind === 'bankName') && !hasPayoutAccount;

  return (
    <ScreenContainer scroll={false} contentStyle={{ paddingHorizontal: 0 }}>
      <AppHeader showBack title={TITLES[kind]} showCoins={false} showNotifications={false} showProfile={false} />
      <ScrollView nestedScrollEnabled contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>{INTROS[kind]}</Text>

        {needsBank ? (
          <View style={styles.card}>
            <Text style={styles.body}>You have no bank account saved yet. Add it on the Withdraw screen first.</Text>
            <Pressable style={styles.linkBtn} onPress={() => navigation.replace('Withdraw')}>
              <Text style={styles.linkText}>Open Withdraw</Text>
            </Pressable>
          </View>
        ) : null}

        {usesOrders ? (
          <>
            <Text style={styles.label}>{kind === 'withdraw' ? 'Your recent withdrawals' : 'Your recent deposits'}</Text>
            {orders === null && !ordersError ? <ActivityIndicator color={colors.gold} style={{ marginVertical: spacing.md }} /> : null}
            {ordersError ? <Text style={styles.muted}>{ordersError}</Text> : null}
            {orders !== null && shownOrders.length === 0 ? <Text style={styles.muted}>Nothing here yet.</Text> : null}
            {shownOrders.map((o) => {
              const selected = o.orderNo === orderRef.trim();
              return (
                <Pressable key={o.orderNo} style={[styles.order, selected && styles.orderSelected]} onPress={() => setOrderRef(o.orderNo)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderNo} numberOfLines={1}>{o.orderNo}</Text>
                    <Text style={styles.muted}>{shortDate(o.createdAt)} · {o.status.toLowerCase()}</Text>
                  </View>
                  <Text style={styles.orderAmount}>₹{o.amount.toLocaleString('en-IN')}</Text>
                  <MaterialCommunityIcons name={selected ? 'radiobox-marked' : 'radiobox-blank'} size={20} color={selected ? colors.gold : colors.textMuted} />
                </Pressable>
              );
            })}
            <Text style={styles.label}>Order number</Text>
            <TextInput style={styles.input} value={orderRef} onChangeText={setOrderRef} placeholder="Pick above or type it" placeholderTextColor={colors.textMuted} autoCapitalize="characters" />
          </>
        ) : null}

        {kind === 'deposit' ? (
          <>
            <Text style={styles.label}>UTR / reference number</Text>
            <TextInput style={styles.input} value={utr} onChangeText={setUtr} placeholder="12-digit UTR from your UPI app" placeholderTextColor={colors.textMuted} autoCapitalize="characters" maxLength={30} />
          </>
        ) : null}

        {kind === 'ifsc' && !needsBank ? (
          <>
            <Text style={styles.muted}>Account ending {payoutAccountNumber?.slice(-4)} · current IFSC {payoutIfsc ?? '—'}</Text>
            <Text style={styles.label}>New IFSC</Text>
            <TextInput style={styles.input} value={value} onChangeText={setValue} placeholder="e.g. HDFC0001234" placeholderTextColor={colors.textMuted} autoCapitalize="characters" maxLength={11} />
          </>
        ) : null}
        {kind === 'bankName' && !needsBank ? (
          <>
            <Text style={styles.muted}>Account ending {payoutAccountNumber?.slice(-4)}</Text>
            <Text style={styles.label}>Account holder name</Text>
            <TextInput style={styles.input} value={value} onChangeText={setValue} placeholder="Name as on your bank account" placeholderTextColor={colors.textMuted} maxLength={120} />
          </>
        ) : null}

        {kind === 'deposit' || kind === 'withdraw' ? (
          <>
            <Text style={styles.label}>{kind === 'withdraw' ? 'What went wrong?' : 'Anything else? (optional)'}</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={message}
              onChangeText={setMessage}
              placeholder={kind === 'withdraw' ? 'e.g. Shows successful but the money is not in my bank' : 'Optional'}
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={1000}
            />
            <Text style={styles.label}>Screenshot{kind === 'withdraw' ? ' (optional)' : ''}</Text>
            <Pressable style={styles.upload} onPress={pickImage}>
              {image ? (
                <Image source={{ uri: image.uri }} style={styles.preview} resizeMode="contain" />
              ) : (
                <>
                  <MaterialCommunityIcons name="image-plus" size={32} color={colors.gold} />
                  <Text style={styles.muted}>Tap to attach a screenshot</Text>
                </>
              )}
            </Pressable>
            {image ? (
              <Pressable onPress={() => setImage(null)}>
                <Text style={[styles.muted, { textAlign: 'center' }]}>Remove screenshot</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}

        {result ? (
          <View style={[styles.card, { borderColor: result.status === 'COMPLETED' || result.status === 'VERIFIED' ? colors.positive : colors.border }]}>
            <Text style={[styles.resultTitle, { color: result.status === 'COMPLETED' || result.status === 'VERIFIED' ? colors.positive : colors.gold }]}>
              {result.status === 'COMPLETED' ? 'Already credited' : result.status === 'VERIFIED' ? 'Payment confirmed' : result.status === 'PENDING' ? 'Not confirmed yet' : result.status === 'REVIEW' ? 'Needs a check' : 'No payment found'}
            </Text>
            <Text style={styles.body}>{result.message}</Text>
            {result.status !== 'COMPLETED' && result.status !== 'VERIFIED' ? (
              <Pressable style={styles.linkBtn} onPress={() => navigation.replace('SupportForm', { kind: 'deposit' })}>
                <Text style={styles.linkText}>Report: Deposit Not Receive</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {!needsBank ? (
          <Pressable onPress={submit} disabled={busy}>
            <LinearGradient colors={gradients.goldButton} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.submit, busy && { opacity: 0.6 }]}>
              {busy ? (
                <ActivityIndicator color="#2A1300" />
              ) : (
                <Text style={styles.submitText}>{kind === 'verify' ? 'Verify' : kind === 'ifsc' || kind === 'bankName' ? 'Save' : 'Submit'}</Text>
              )}
            </LinearGradient>
          </Pressable>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl * 2 },
  intro: { color: colors.textSecondary, fontSize: typography.sm, lineHeight: 20, marginTop: spacing.sm },
  label: { color: colors.textPrimary, fontWeight: '700', fontSize: typography.sm, marginTop: spacing.lg, marginBottom: spacing.sm },
  muted: { color: colors.textMuted, fontSize: typography.xs, marginTop: 2 },
  body: { color: colors.textSecondary, fontSize: typography.sm, lineHeight: 20 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: typography.md,
  },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  order: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    marginBottom: spacing.xs + 2,
  },
  orderSelected: { borderColor: colors.gold, backgroundColor: colors.surfaceAlt },
  orderNo: { color: colors.textPrimary, fontWeight: '700', fontSize: typography.sm },
  orderAmount: { color: colors.gold, fontWeight: '800', fontSize: typography.sm },
  upload: {
    height: 160,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  preview: { width: '100%', height: '100%' },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.lg, gap: spacing.sm },
  resultTitle: { fontWeight: '800', fontSize: typography.md },
  linkBtn: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  linkText: { color: colors.gold, fontWeight: '700', fontSize: typography.sm },
  submit: { borderRadius: 999, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.xl },
  submitText: { color: '#2A1300', fontWeight: '900', fontSize: typography.lg },
});
