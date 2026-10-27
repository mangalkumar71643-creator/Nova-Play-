import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fetchSupportConfig, SupportConfig } from '../api/backend';
import AppHeader from '../components/AppHeader';
import ScreenContainer from '../components/ScreenContainer';
import { RootStackParamList, SupportFormKind } from '../navigation/types';
import { colors, gradients, radius, spacing, typography } from '../theme';
import { openLiveChat } from '../utils/liveChat';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
type Row = { key: string; title: string; icon: IconName; tint: readonly [string, string]; onPress: () => void };

const BLUE = ['#4F8BFF', '#1F5BD8'] as const;
const GREEN = ['#5CC08A', '#2E8B5C'] as const;
const ORANGE = ['#FFC24A', '#F08A1C'] as const;
const SKY = ['#45B6F5', '#1C8AD6'] as const;

/**
 * Customer Service: self-service checks and requests (each a SupportForm),
 * the live chat, the Telegram channel when the admin has set one, and
 * "Progress query" to follow what was sent.
 */
export default function CustomerServiceScreen() {
  const navigation = useNavigation<Nav>();
  const [config, setConfig] = useState<SupportConfig | null>(null);
  const [chatOpening, setChatOpening] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchSupportConfig().then(setConfig).catch(() => {});
    }, [])
  );

  const form = (kind: SupportFormKind) => () => navigation.navigate('SupportForm', { kind });
  const rows: Row[] = [
    { key: 'verify', title: 'Self Deposit Verify', icon: 'robot-happy-outline', tint: BLUE, onPress: form('verify') },
    {
      key: 'chat',
      title: 'LiveChat',
      icon: 'phone-in-talk-outline',
      tint: GREEN,
      onPress: async () => {
        setChatOpening(true);
        await openLiveChat();
        setChatOpening(false);
      },
    },
    { key: 'ifsc', title: 'IFSC Modify', icon: 'card-text-outline', tint: ORANGE, onPress: form('ifsc') },
    { key: 'bankName', title: 'Modify Bank Name', icon: 'bank-outline', tint: ORANGE, onPress: form('bankName') },
    { key: 'deposit', title: 'Deposit Not Receive', icon: 'wallet-outline', tint: ORANGE, onPress: form('deposit') },
    { key: 'withdraw', title: 'Withdrawal Problem', icon: 'bank-transfer-out', tint: ORANGE, onPress: form('withdraw') },
    ...(config?.telegramUrl
      ? [{ key: 'telegram', title: 'Telegram', icon: 'send' as IconName, tint: SKY, onPress: () => Linking.openURL(config.telegramUrl!).catch(() => {}) }]
      : []),
    { key: 'faq', title: 'FAQ', icon: 'help-circle-outline', tint: GREEN, onPress: () => navigation.navigate('FAQ') },
  ];

  return (
    <ScreenContainer scroll={false} contentStyle={{ paddingHorizontal: 0 }}>
      <AppHeader showBack title="Customer service" showCoins={false} showNotifications={false} showProfile={false} />
      <ScrollView nestedScrollEnabled contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={gradients.crimsonButton} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner}>
          <View style={styles.bannerIcon}>
            <MaterialCommunityIcons name="face-agent" size={64} color={colors.goldLight} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>Customer Service</Text>
            <Text style={styles.bannerSub}>Check a deposit, report a problem or chat with our team.</Text>
          </View>
          <MaterialCommunityIcons name="lifebuoy" size={42} color="rgba(255,222,140,0.35)" style={styles.bannerDecor} />
        </LinearGradient>

        <Text style={styles.sectionTitle}>Self service</Text>
        {rows.map((r) => (
          <Pressable key={r.key} style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]} onPress={r.onPress} disabled={r.key === 'chat' && chatOpening}>
            <LinearGradient colors={r.tint} style={styles.rowIcon}>
              <MaterialCommunityIcons name={r.icon} size={26} color="#fff" />
            </LinearGradient>
            <Text style={styles.rowTitle}>{r.title}</Text>
            {r.key === 'chat' && chatOpening ? (
              <ActivityIndicator color={colors.gold} />
            ) : (
              <MaterialCommunityIcons name="chevron-right" size={24} color={colors.textMuted} />
            )}
          </Pressable>
        ))}

        <Text style={styles.sectionTitle}>Kind tips</Text>
        <Text style={styles.tip}>1. Please select the relevant query and submit it for review. After it is submitted, our customer service team handles it as soon as possible.</Text>
        <Text style={styles.tip}>2. After submitting, use [Progress query] to see the status and our reply.</Text>
        <Text style={styles.tip}>3. NovaPlay staff will never ask for your OTP or password.</Text>

        <Pressable onPress={() => navigation.navigate('SupportProgress')}>
          <LinearGradient colors={gradients.goldButton} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.progressBtn}>
            <Text style={styles.progressText}>Progress query</Text>
          </LinearGradient>
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl * 2 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.sm, overflow: 'hidden' },
  bannerIcon: { width: 84, height: 84, borderRadius: 42, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' },
  bannerTitle: { color: colors.goldLight, fontWeight: '900', fontSize: typography.xl },
  bannerSub: { color: colors.textPrimary, fontSize: typography.sm, marginTop: spacing.xs, lineHeight: 20 },
  bannerDecor: { position: 'absolute', right: 10, top: 8 },
  sectionTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: typography.lg, marginTop: spacing.lg, marginBottom: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  rowIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { flex: 1, color: colors.textPrimary, fontWeight: '700', fontSize: typography.md },
  tip: { color: colors.textSecondary, fontSize: typography.sm, lineHeight: 21, marginBottom: spacing.sm },
  progressBtn: { borderRadius: 999, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.lg },
  progressText: { color: '#2A1300', fontWeight: '900', fontSize: typography.lg },
});
