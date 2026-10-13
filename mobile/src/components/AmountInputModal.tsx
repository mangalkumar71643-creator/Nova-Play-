import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, gradients, radius, shadow, spacing, typography } from '../theme';

type Props = {
  visible: boolean;
  title: string;
  confirmLabel: string;
  helperText?: string;
  defaultValue?: string;
  busy?: boolean;
  onConfirm: (amount: number) => void;
  onClose: () => void;
};

export default function AmountInputModal({
  visible,
  title,
  confirmLabel,
  helperText,
  defaultValue = '',
  busy = false,
  onConfirm,
  onClose,
}: Props) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (visible) setValue(defaultValue);
  }, [visible, defaultValue]);

  const amount = Number(value);
  const isValid = value.trim().length > 0 && amount > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <LinearGradient colors={gradients.vipCard} style={styles.cardInner}>
            <MaterialCommunityIcons name="close" size={20} color={colors.textMuted} style={styles.close} onPress={onClose} />
            <Text style={styles.title}>{title}</Text>
            {helperText ? <Text style={styles.helper}>{helperText}</Text> : null}
            <TextInput
              value={value}
              onChangeText={(t) => setValue(t.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              autoFocus
            />
            <Pressable
              style={[styles.confirmButton, (!isValid || busy) && styles.confirmButtonDisabled]}
              disabled={!isValid || busy}
              onPress={() => onConfirm(amount)}
            >
              <Text style={styles.confirmButtonText}>{busy ? 'Please wait…' : confirmLabel}</Text>
            </Pressable>
          </LinearGradient>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center' },
  card: { width: '85%', borderRadius: radius.xl, overflow: 'hidden', ...shadow.glow },
  cardInner: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  close: { position: 'absolute', top: spacing.md, right: spacing.md },
  title: { color: colors.gold, fontWeight: '800', fontSize: typography.lg, letterSpacing: 1 },
  helper: { color: colors.textSecondary, fontSize: typography.xs, marginTop: spacing.sm, textAlign: 'center' },
  input: {
    marginTop: spacing.lg,
    width: '100%',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    fontSize: typography.xxl,
    fontWeight: '800',
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  confirmButton: {
    marginTop: spacing.xl,
    alignSelf: 'stretch',
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  confirmButtonDisabled: { backgroundColor: colors.surfaceAlt },
  confirmButtonText: { color: colors.background, fontWeight: '800', fontSize: typography.sm, letterSpacing: 1 },
});
