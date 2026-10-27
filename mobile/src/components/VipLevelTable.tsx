import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { VipStatus, withdrawalFeeLabel } from '../api/backend';
import { IconName } from '../data/models';
import { colors, gradients, spacing, typography } from '../theme';

const LEVEL_COL = 62;
const ROW_H = 46;
const HEAD_H = 54;
const DEFAULT_FEE = { flat: 6, percent: 0 };

const inr = (n?: number) => (n ? `₹${n.toLocaleString('en-IN')}` : '-');

/** "VIP Level Description": every level's bonuses and withdrawal terms in one table, the player's own row lit. */
export default function VipLevelTable({ visible, onClose, vip }: { visible: boolean; onClose: () => void; vip: VipStatus }) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const width = Math.min(420, screenWidth - spacing.lg * 2);
  const fee = vip.withdrawalFee ?? DEFAULT_FEE;
  const rows = vip.levels.filter((l) => l.level >= 1);

  const columns: { key: string; title: string; width: number; value: (l: VipStatus['levels'][number]) => string }[] = [
    { key: 'xp', title: 'XP\nNeeded', width: 96, value: (l) => l.xpRequired.toLocaleString('en-IN') },
    { key: 'upgrade', title: 'Upgrade\nBonus', width: 96, value: (l) => inr(l.upgradeBonus) },
    { key: 'monthly', title: 'Monthly\nBonus', width: 96, value: (l) => inr(l.weeklyBonus) },
    { key: 'fee', title: 'Withdrawal\nFee', width: 104, value: () => withdrawalFeeLabel(fee) },
    { key: 'limit', title: 'Daily Withdrawal\nLimit', width: 132, value: (l) => inr(l.dailyWithdrawalLimit) },
    { key: 'free', title: 'Free Daily\nWithdrawals', width: 104, value: (l) => (l.freeWithdrawals ? String(l.freeWithdrawals) : '-') },
  ];
  const tableWidth = columns.reduce((s, c) => s + c.width, 0);

  // Sideways scroll position drives the pink indicator under the table.
  const scrollX = useRef(new Animated.Value(0)).current;
  const [viewport, setViewport] = useState(1);
  const track = 140;
  const thumb = Math.max(28, Math.min(track, (viewport / tableWidth) * track));
  const maxScroll = Math.max(1, tableWidth - viewport);
  const thumbX = scrollX.interpolate({ inputRange: [0, maxScroll], outputRange: [0, track - thumb], extrapolate: 'clamp' });

  const notes: { icon: IconName; text: string }[] = [
    { icon: 'star-four-points', text: 'Every ₹1 you bet in a game earns 1 XP. Your VIP level goes up as your XP grows.' },
    { icon: 'arrow-up-bold-circle', text: 'Upgrade bonus: paid once per level, ever, while you are on that level.' },
    { icon: 'calendar-month', text: 'Monthly bonus: once every month for your current level. It opens again on the 1st.' },
    {
      icon: 'bank-transfer-out',
      text: `Free daily withdrawals have no fee. After those, a ${withdrawalFeeLabel(fee)} fee is kept from what is sent to your bank.`,
    },
    { icon: 'clock-outline', text: 'Daily withdrawal limits and free withdrawals reset at midnight (India time).' },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={() => {}} style={{ width, maxHeight: screenHeight * 0.9 }}>
          <LinearGradient colors={['#5E1020', '#34080F', '#1A0408']} locations={[0, 0.4, 1]} style={styles.card}>
            <View pointerEvents="none" style={styles.innerFrame} />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
              <Text style={styles.title}>VIP Level Description</Text>
              <View style={styles.ornament}>
                <LinearGradient colors={['transparent', colors.gold]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ornamentLine} />
                <View style={styles.ornamentGem} />
                <LinearGradient colors={[colors.gold, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ornamentLine} />
              </View>

              <View style={styles.table}>
                <View style={{ width: LEVEL_COL }}>
                  <View style={[styles.headCell, { height: HEAD_H }]}>
                    <Text style={styles.headText}>Level</Text>
                  </View>
                  {rows.map((l, i) => {
                    const mine = l.level === vip.level;
                    return (
                      <View key={l.level} style={[styles.levelCell, i % 2 === 1 && styles.rowAlt, mine && styles.rowMine]}>
                        <Text style={[styles.levelText, mine && { color: '#FFF3C4' }]}>V{l.level}</Text>
                        {mine ? <Text style={styles.youTag}>YOU</Text> : null}
                      </View>
                    );
                  })}
                </View>

                <Animated.ScrollView
                  horizontal
                  bounces={false}
                  showsHorizontalScrollIndicator={false}
                  onLayout={(e) => setViewport(e.nativeEvent.layout.width)}
                  onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
                  scrollEventThrottle={16}
                >
                  <View style={{ width: tableWidth }}>
                    <View style={[styles.headRow, { height: HEAD_H }]}>
                      {columns.map((c) => (
                        <View key={c.key} style={[styles.headCell, { width: c.width, height: HEAD_H }]}>
                          <Text style={styles.headText}>{c.title}</Text>
                        </View>
                      ))}
                    </View>
                    {rows.map((l, i) => {
                      const mine = l.level === vip.level;
                      return (
                        <View key={l.level} style={[styles.row, i % 2 === 1 && styles.rowAlt, mine && styles.rowMine]}>
                          {columns.map((c) => (
                            <View key={c.key} style={[styles.cell, { width: c.width }]}>
                              <Text style={[styles.cellText, mine && styles.cellTextMine]}>{c.value(l)}</Text>
                            </View>
                          ))}
                        </View>
                      );
                    })}
                  </View>
                </Animated.ScrollView>
              </View>

              <View style={styles.indicatorRow}>
                <View style={[styles.indicatorTrack, { width: track }]}>
                  <Animated.View style={[styles.indicatorThumb, { width: thumb, transform: [{ translateX: thumbX }] }]} />
                </View>
              </View>
              <Text style={styles.swipeHint}>Swipe the table sideways to see every column</Text>

              <View style={styles.notes}>
                <Text style={styles.notesTitle}>How it works</Text>
                {notes.map((n) => (
                  <View key={n.icon} style={styles.noteRow}>
                    <MaterialCommunityIcons name={n.icon} size={16} color={colors.gold} style={{ marginTop: 1 }} />
                    <Text style={styles.noteText}>{n.text}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </LinearGradient>

          <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
            <LinearGradient colors={gradients.goldButton} style={styles.closeInner}>
              <MaterialCommunityIcons name="close" size={18} color="#3A2006" />
            </LinearGradient>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(6,1,3,0.88)', alignItems: 'center', justifyContent: 'center' },
  card: { flexShrink: 1, borderRadius: 22, borderWidth: 1.5, borderColor: 'rgba(255,222,140,0.6)', overflow: 'hidden' },
  innerFrame: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: 6,
    bottom: 6,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(255,222,140,0.14)',
  },
  scroll: { padding: spacing.md, paddingTop: spacing.xl },
  title: {
    color: colors.goldLight,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.4,
    textShadowColor: 'rgba(255,184,61,0.6)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  ornament: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, marginBottom: spacing.md, paddingHorizontal: spacing.xl },
  ornamentLine: { flex: 1, height: 1 },
  ornamentGem: { width: 7, height: 7, marginHorizontal: 8, backgroundColor: colors.goldLight, transform: [{ rotate: '45deg' }] },
  table: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,107,134,0.25)',
    overflow: 'hidden',
    backgroundColor: '#22060C',
  },
  headRow: { flexDirection: 'row', backgroundColor: '#4A0E1A' },
  headCell: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#4A0E1A', paddingHorizontal: 4 },
  headText: { color: '#FF6B86', fontSize: typography.xs, fontWeight: '800', textAlign: 'center', lineHeight: 15 },
  levelCell: {
    height: ROW_H,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,107,134,0.25)',
  },
  levelText: { color: colors.gold, fontSize: typography.lg, fontWeight: '900' },
  youTag: {
    color: '#3A2006',
    backgroundColor: colors.gold,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
    paddingHorizontal: 4,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 1,
  },
  row: { flexDirection: 'row', height: ROW_H, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  rowAlt: { backgroundColor: 'rgba(255,255,255,0.025)' },
  rowMine: { backgroundColor: 'rgba(240,185,61,0.16)' },
  cell: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  cellText: { color: colors.textPrimary, fontSize: typography.sm, fontWeight: '600' },
  cellTextMine: { color: '#FFF3C4', fontWeight: '900' },
  indicatorRow: { alignItems: 'center', marginTop: spacing.md },
  indicatorTrack: { height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  indicatorThumb: { height: 5, borderRadius: 3, backgroundColor: '#FF2D55' },
  swipeHint: { color: colors.textMuted, fontSize: typography.xs, textAlign: 'center', marginTop: 6 },
  notes: {
    marginTop: spacing.lg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,222,140,0.18)',
    backgroundColor: 'rgba(0,0,0,0.25)',
    padding: spacing.md,
    gap: spacing.sm,
  },
  notesTitle: { color: colors.goldLight, fontSize: typography.sm, fontWeight: '900' },
  noteRow: { flexDirection: 'row', gap: spacing.sm },
  noteText: { flex: 1, color: colors.textSecondary, fontSize: typography.xs, lineHeight: 17 },
  close: { position: 'absolute', top: -12, right: -8 },
  closeInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,248,220,0.9)',
  },
});
