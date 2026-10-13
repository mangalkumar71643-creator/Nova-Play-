import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ScreenContainer from '../components/ScreenContainer';
import { RootStackParamList } from '../navigation/types';
import { colors, spacing, typography } from '../theme';

type Tab = 'platform' | 'personal';

export default function NotificationsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [tab, setTab] = useState<Tab>('platform');

  return (
    <ScreenContainer scroll={false}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={colors.gold} />
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.tabRow}>
        <Pressable style={styles.tab} onPress={() => setTab('platform')}>
          <Text style={[styles.tabLabel, tab === 'platform' && styles.tabLabelActive]}>Platform</Text>
          {tab === 'platform' ? <View style={styles.tabUnderline} /> : null}
        </Pressable>
        <Pressable style={styles.tab} onPress={() => setTab('personal')}>
          <Text style={[styles.tabLabel, tab === 'personal' && styles.tabLabelActive]}>Personal</Text>
          {tab === 'personal' ? <View style={styles.tabUnderline} /> : null}
        </Pressable>
      </View>

      <View style={styles.body}>
        <MaterialCommunityIcons name="text-box-multiple-outline" size={64} color={colors.crimsonLight} style={{ opacity: 0.35 }} />
        <Text style={styles.emptyText}>You have not received any {tab} notifications.</Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    backgroundColor: colors.backgroundAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: colors.gold, fontSize: typography.xl, fontWeight: '800' },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: spacing.md },
  tabLabel: { color: colors.textSecondary, fontSize: typography.md, fontWeight: '700' },
  tabLabelActive: { color: colors.gold },
  tabUnderline: { marginTop: spacing.sm, height: 2, width: '60%', backgroundColor: colors.gold },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxl },
  emptyText: {
    color: colors.crimsonLight,
    opacity: 0.8,
    fontSize: typography.sm,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
