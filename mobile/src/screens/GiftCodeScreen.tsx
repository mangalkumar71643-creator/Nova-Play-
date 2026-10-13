import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { ActivityIndicator, Image, Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { redeemGiftCode } from '../api/backend';
import { ApiClientError } from '../api/client';
import ScreenContainer from '../components/ScreenContainer';
import { useGameState } from '../state/GameStateContext';
import { colors, gradients, radius, spacing, typography } from '../theme';

const RULES = [
  'The bonus is added to your balance as soon as the code is accepted.',
  'Bonus money has to be played in a game once before it can be withdrawn.',
  'Each code can be used only once per account.',
  'Every code can be claimed by a limited number of players. Once it is used up, it stops working.',
];

/** Opened from the gift box on Home: enter a code made in the admin panel to get its bonus. */
export default function GiftCodeScreen() {
  const navigation = useNavigation();
  const { refreshWallet } = useGameState();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const confirm = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setResult({ ok: false, text: 'Please enter the gift code.' });
      return;
    }
    Keyboard.dismiss();
    setBusy(true);
    setResult(null);
    try {
      const { amount } = await redeemGiftCode(trimmed);
      setResult({ ok: true, text: `₹${amount.toLocaleString('en-IN')} has been added to your balance.` });
      setCode('');
      refreshWallet().catch(() => {});
    } catch (err) {
      setResult({ ok: false, text: err instanceof ApiClientError ? err.message : 'Could not check the code. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenContainer scroll={false} contentStyle={{ paddingHorizontal: 0 }}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Back">
          <MaterialCommunityIcons name="chevron-left" size={28} color={colors.gold} />
        </Pressable>
        <Text style={styles.headerTitle}>Gift Code</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <LinearGradient colors={['#4A0E18', '#25070C', '#120305']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <Image source={require('../../assets/gift-icon.webp')} style={styles.heroIcon} resizeMode="contain" />
          <View style={{ flex: 1 }}>
            <Text style={styles.heroSmall}>Got a gift code?</Text>
            <Text style={styles.heroBig}>Get your bonus</Text>
          </View>
        </LinearGradient>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Hi! We have a gift for you</Text>
          <TextInput
            value={code}
            onChangeText={(t) => {
              setCode(t.toUpperCase());
              setResult(null);
            }}
            placeholder="Please enter the gift code"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={20}
            returnKeyType="done"
            onSubmitEditing={confirm}
            style={styles.input}
            accessibilityLabel="Gift code"
          />
          {result && <Text style={[styles.result, { color: result.ok ? colors.positive : colors.negative }]}>{result.text}</Text>}
          <Pressable
            onPress={confirm}
            disabled={busy}
            style={({ pressed }) => ({ alignSelf: 'center', marginTop: spacing.lg, transform: [{ scale: pressed ? 0.97 : 1 }] })}
            accessibilityRole="button"
            accessibilityLabel="Confirm"
          >
            <LinearGradient colors={gradients.crimsonButton} style={styles.confirm}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmText}>Confirm</Text>}
            </LinearGradient>
          </Pressable>
        </View>

        <View style={styles.rules}>
          {RULES.map((rule, i) => (
            <Text key={i} style={styles.rule}>
              {i + 1}. {rule}
            </Text>
          ))}
        </View>
      </ScrollView>
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
  headerTitle: { color: colors.gold, fontSize: typography.xl, fontWeight: '800' as const },
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: 140 },
  hero: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  heroIcon: { width: 76, height: 76 },
  heroSmall: { color: colors.textSecondary, fontSize: typography.md, fontStyle: 'italic' as const },
  heroBig: { color: colors.crimsonLight, fontSize: typography.xxl, fontWeight: '900' as const, fontStyle: 'italic' as const, marginTop: 2 },
  card: {
    backgroundColor: 'rgba(20, 3, 6, 0.85)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    marginBottom: spacing.xl,
  },
  cardTitle: { color: colors.textPrimary, fontSize: typography.lg, fontWeight: '700' as const, marginBottom: spacing.lg },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    fontSize: typography.lg,
    fontWeight: '700' as const,
    letterSpacing: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  result: { fontSize: typography.sm, fontWeight: '600' as const, marginTop: spacing.md },
  confirm: { width: 220, height: 48, borderRadius: radius.md, alignItems: 'center' as const, justifyContent: 'center' as const },
  confirmText: { color: '#FFFFFF', fontSize: typography.lg, fontWeight: '800' as const, letterSpacing: 0.5 },
  rules: { gap: spacing.sm, paddingHorizontal: spacing.xs },
  rule: { color: colors.textSecondary, fontSize: typography.sm, lineHeight: 19 },
};
