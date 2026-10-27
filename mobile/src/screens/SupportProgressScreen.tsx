import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fetchMySupportRequests, SupportRequestItem } from '../api/backend';
import { ApiClientError } from '../api/client';
import AppHeader from '../components/AppHeader';
import ScreenContainer from '../components/ScreenContainer';
import { colors, radius, spacing, typography } from '../theme';
import { openLiveChat } from '../utils/liveChat';

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** "Progress query": every request and chat the player sent, its status and the team's latest reply. */
export default function SupportProgressScreen() {
  const [items, setItems] = useState<SupportRequestItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await fetchMySupportRequests());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not load your requests.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <ScreenContainer scroll={false} contentStyle={{ paddingHorizontal: 0 }}>
      <AppHeader showBack title="Progress query" showCoins={false} showNotifications={false} showProfile={false} />
      <ScrollView
        nestedScrollEnabled
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            colors={[colors.gold]}
            tintColor={colors.gold}
            progressBackgroundColor={colors.surface}
          />
        }
      >
        {items === null && !error ? <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} /> : null}
        {error ? <Text style={styles.muted}>{error}</Text> : null}
        {items !== null && items.length === 0 ? <Text style={styles.empty}>You have not sent any requests yet.</Text> : null}
        {(items ?? []).map((t) => {
          const replies = t.messages.filter((m) => m.sender === 'ADMIN');
          const lastReply = replies[replies.length - 1];
          const status = t.status === 'RESOLVED' ? 'Resolved' : lastReply ? 'Replied' : 'In review';
          const statusColor = t.status === 'RESOLVED' ? colors.positive : lastReply ? colors.gold : colors.textSecondary;
          const expanded = open === t.id;
          return (
            <Pressable key={t.id} style={styles.card} onPress={() => setOpen(expanded ? null : t.id)}>
              <View style={styles.top}>
                <Text style={styles.title}>{t.topic}</Text>
                <View style={[styles.badge, { borderColor: statusColor }]}>
                  <Text style={[styles.badgeText, { color: statusColor }]}>{status}</Text>
                </View>
              </View>
              <Text style={styles.muted}>
                {when(t.createdAt)}
                {t.orderRef ? ` · ${t.orderRef}` : ''}
                {t.amount != null ? ` · ₹${t.amount.toLocaleString('en-IN')}` : ''}
              </Text>
              {lastReply && !expanded ? (
                <Text style={styles.reply} numberOfLines={3}>
                  Support: {lastReply.text}
                </Text>
              ) : null}
              {expanded ? (
                <View style={styles.thread}>
                  {t.messages.map((m, i) => (
                    <View key={i} style={[styles.bubble, m.sender === 'USER' ? styles.mine : styles.theirs]}>
                      <Text style={styles.bubbleText}>{m.text}</Text>
                      <Text style={styles.bubbleMeta}>{m.sender === 'USER' ? 'You' : 'Support'} · {when(m.createdAt)}</Text>
                    </View>
                  ))}
                  <Pressable style={styles.chatBtn} onPress={openLiveChat}>
                    <MaterialCommunityIcons name="chat-processing-outline" size={18} color={colors.gold} />
                    <Text style={styles.chatText}>Reply in LiveChat</Text>
                  </Pressable>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl * 2, paddingTop: spacing.sm },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl * 2, fontSize: typography.sm },
  muted: { color: colors.textMuted, fontSize: typography.xs, marginTop: 4 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, color: colors.textPrimary, fontWeight: '800', fontSize: typography.md },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { fontSize: typography.xs, fontWeight: '800' },
  reply: { color: colors.textSecondary, fontSize: typography.sm, marginTop: spacing.sm, lineHeight: 19 },
  thread: { marginTop: spacing.md, gap: spacing.sm },
  bubble: { borderRadius: radius.md, padding: spacing.sm + 2, maxWidth: '90%' },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.crimsonDark },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  bubbleText: { color: colors.textPrimary, fontSize: typography.sm, lineHeight: 19 },
  bubbleMeta: { color: colors.textMuted, fontSize: 10, marginTop: 4 },
  chatBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start', paddingVertical: spacing.xs },
  chatText: { color: colors.gold, fontWeight: '700', fontSize: typography.sm },
});
