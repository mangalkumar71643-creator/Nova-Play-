import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, gradients, radius, shadow, spacing, typography } from '../theme';

type Props = {
  visible: boolean;
  amount: number;
  title?: string;
  onClose: () => void;
};

export default function RewardPopup({ visible, amount, title = 'Daily Reward', onClose }: Props) {
  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      scale.setValue(0.7);
      opacity.setValue(0);
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6 }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, scale, opacity]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.card, { transform: [{ scale }], opacity }]}>
          <LinearGradient colors={gradients.vipCard} style={styles.cardInner}>
            <MaterialCommunityIcons name="close" size={20} color={colors.textMuted} style={styles.close} onPress={onClose} />
            <Text style={styles.title}>{title}</Text>
            <View style={styles.giftWrap}>
              <MaterialCommunityIcons name="gift" size={54} color={colors.gold} />
            </View>
            <Text style={styles.receivedLabel}>You have received</Text>
            <View style={styles.amountRow}>
              <MaterialCommunityIcons name="circle-multiple" size={22} color={colors.gold} />
              <Text style={styles.amount}>{amount.toLocaleString('en-IN')}</Text>
            </View>
            <Text style={styles.subLabel}>Coins</Text>
            <Pressable style={styles.claimedButton} onPress={onClose}>
              <Text style={styles.claimedButtonText}>CLAIMED</Text>
            </Pressable>
          </LinearGradient>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center' },
  card: { width: '82%', borderRadius: radius.xl, overflow: 'hidden', ...shadow.glow },
  cardInner: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  close: { position: 'absolute', top: spacing.md, right: spacing.md },
  title: { color: colors.gold, fontWeight: '800', fontSize: typography.lg, letterSpacing: 1 },
  giftWrap: { marginVertical: spacing.lg },
  receivedLabel: { color: colors.textSecondary, fontSize: typography.sm },
  amountRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  amount: { color: colors.gold, fontSize: typography.xxl, fontWeight: '800', marginLeft: spacing.xs },
  subLabel: { color: colors.textMuted, fontSize: typography.xs, marginTop: 2 },
  claimedButton: {
    marginTop: spacing.xl,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xxl,
  },
  claimedButtonText: { color: colors.textMuted, fontWeight: '800', fontSize: typography.sm, letterSpacing: 1 },
});
