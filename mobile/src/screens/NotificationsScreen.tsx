import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fetchNotifications, markNotificationsRead, PlayerNotification } from '../api/backend';
import ScreenContainer from '../components/ScreenContainer';
import { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing, typography } from '../theme';

type Tab = 'platform' | 'personal';

export default function NotificationsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [tab, setTab] = useState<Tab>('personal');
  // Personal: messages about the player's own money (bonus / deposit added by NovaPlay, returned withdrawals).
  const [personal, setPersonal] = useState<PlayerNotification[]>([]);

  useFocusEffect(
    useCallback(() => {
      fetchNotifications()
        .then(({ items, unread }) => {
          setPersonal(items);
          if (unread > 0) markNotificationsRead().catch(() => {});
        })
        .catch(() => {});
    }, [])
  );
  const shown = tab === 'personal' ? personal : [];

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

      {shown.length > 0 ? (
        <ScrollView contentContainerStyle={styles.list}>
          {shown.map((n) => (
            <View key={n.id} style={styles.item}>
              <View style={styles.itemTop}>
                <Text style={styles.itemTitle}>{n.title}</Text>
                {!n.readAt ? <View style={styles.dot} /> : null}
              </View>
              {n.amount != null ? <Text style={styles.itemAmount}>₹{n.amount.toLocaleString('en-IN')}</Text> : null}
              <Text style={styles.itemBody}>{n.body}</Text>
              {n.giftCode ? (
                <Text selectable style={styles.itemCode}>
                  Gift code: {n.giftCode}
                </Text>
              ) : null}
              <Text style={styles.itemTime}>
                {new Date(n.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          ))}
        </ScrollView>
      ) : (
        <View style={styles.body}>
          <MaterialCommunityIcons name="text-box-multiple-outline" size={64} color={colors.crimsonLight} style={{ opacity: 0.35 }} />
          <Text style={styles.emptyText}>You have not received any {tab} notifications.</Text>
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.md, gap: spacing.sm },
  item: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  itemTitle: { flex: 1, color: colors.textPrimary, fontWeight: '800', fontSize: typography.md },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.crimsonLight },
  itemAmount: { color: colors.gold, fontWeight: '900', fontSize: typography.xl, marginTop: spacing.xs },
  itemBody: { color: colors.textSecondary, fontSize: typography.sm, lineHeight: 20, marginTop: spacing.xs },
  itemCode: { color: colors.gold, fontWeight: '800', fontSize: typography.md, marginTop: spacing.sm },
  itemTime: { color: colors.textMuted, fontSize: typography.xs, marginTop: spacing.sm },
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
