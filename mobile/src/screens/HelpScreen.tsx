import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useState } from 'react';
import { Alert, LayoutAnimation, Linking, Platform, Pressable, StyleSheet, Text, UIManager, View } from 'react-native';
import AppHeader from '../components/AppHeader';
import ScreenContainer from '../components/ScreenContainer';
import { API_BASE_URL, ApiClientError } from '../api/client';
import { startChatSession } from '../api/backend';
import { colors, radius, spacing, typography } from '../theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const FAQS: { question: string; answer: string }[] = [
  {
    question: 'What are Coins?',
    answer: 'Coins are NovaPlay’s real-money balance — 1 Coin is backed 1:1 by real money. You must be 18+ and complete identity verification (KYC) to deposit, withdraw or play.',
  },
  {
    question: 'Deposit not arrived',
    answer:
      'A successful deposit is usually credited within a couple of minutes — check Wallet → transaction history. If it still isn’t there after 30 minutes but money left your account, use Live Support below.',
  },
  {
    question: 'Unable to add bank account',
    answer:
      'Account Number must be 9–18 digits and IFSC must be exactly 11 characters in the format HDFC0001234 (4 letters, a zero, then 6 letters/digits). Check for extra spaces.',
  },
  {
    question: 'Unable to withdraw cash',
    answer:
      'Withdrawals need: a saved bank account, KYC approval, an amount within your remaining daily limit, and no pending wagering requirement on a locked deposit bonus. Check all four on the Withdraw screen.',
  },
  {
    question: 'How do I earn a bonus?',
    answer: 'Claim your daily streak reward from Rewards. Daily bonus amounts are fixed and tracked server-side so they can’t be claimed more than once a day.',
  },
  {
    question: 'How does VIP work?',
    answer:
      'Your VIP level rises as you earn XP through gameplay and activity. Higher VIP levels unlock cosmetic badges, avatar frames and bonus daily missions.',
  },
  {
    question: 'How does ranking work?',
    answer:
      'The leaderboard ranks players by their total Coin balance. Play more games and complete missions to climb higher.',
  },
  {
    question: 'How do achievements work?',
    answer:
      'Achievements track your progress toward specific milestones, like playing your first game or reaching a certain level. Completing one unlocks a badge on your profile.',
  },
  {
    question: 'Game rules & fairness',
    answer:
      'Every round is decided by a server-side, provably-fair RNG — the app itself never decides win or loss. You can verify past rounds and rotate your seed from Settings → Provably Fair.',
  },
  {
    question: 'What if I need to stop playing?',
    answer:
      'You can set a daily deposit limit or self-exclude for 30 days from Settings → Identity & Responsible Gambling at any time.',
  },
];

export default function HelpScreen() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [connecting, setConnecting] = useState(false);

  function toggle(index: number) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenIndex((prev) => (prev === index ? null : index));
  }

  async function openLiveSupport() {
    setConnecting(true);
    try {
      const { chatToken } = await startChatSession();
      await Linking.openURL(`${API_BASE_URL}/chat.html?token=${encodeURIComponent(chatToken)}`);
    } catch (err) {
      Alert.alert('Could not connect', err instanceof ApiClientError ? err.message : 'Please try again.');
    } finally {
      setConnecting(false);
    }
  }

  return (
    <ScreenContainer>
      <AppHeader showBack title="Help Center" showCoins={false} showNotifications={false} showProfile={false} />

      <Pressable style={styles.topContactButton} onPress={openLiveSupport} disabled={connecting}>
        <MaterialCommunityIcons name="headset" size={18} color={colors.textPrimary} />
        <Text style={styles.topContactButtonText}>{connecting ? 'Connecting…' : 'Contact Customer Service'}</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>

      <View style={styles.list}>
        {FAQS.map((faq, index) => {
          const open = openIndex === index;
          return (
            <View key={faq.question} style={styles.card}>
              <Pressable onPress={() => toggle(index)} style={styles.questionRow}>
                <Text style={styles.question}>{faq.question}</Text>
                <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.gold} />
              </Pressable>
              {open ? <Text style={styles.answer}>{faq.answer}</Text> : null}
            </View>
          );
        })}
      </View>

      <Pressable style={styles.contactCard} onPress={openLiveSupport} disabled={connecting}>
        <MaterialCommunityIcons name="lifebuoy" size={22} color={colors.gold} />
        <Text style={styles.contactTitle}>Still need help?</Text>
        <Text style={styles.contactBody}>Tap here — it opens a live chat with our team in your browser.</Text>
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  topContactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    backgroundColor: colors.crimson,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
  },
  topContactButtonText: { color: colors.textPrimary, fontWeight: '800', fontSize: typography.sm },
  sectionTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: typography.lg, paddingHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.md },
  list: { paddingHorizontal: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  questionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  question: { color: colors.textPrimary, fontWeight: '700', fontSize: typography.sm, flex: 1, marginRight: spacing.sm },
  answer: { color: colors.textSecondary, fontSize: typography.sm, marginTop: spacing.sm, lineHeight: 20 },
  contactCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.xl,
  },
  contactTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: typography.md, marginTop: spacing.sm },
  contactBody: { color: colors.textMuted, fontSize: typography.xs, marginTop: spacing.xs, textAlign: 'center', paddingHorizontal: spacing.xl },
});
