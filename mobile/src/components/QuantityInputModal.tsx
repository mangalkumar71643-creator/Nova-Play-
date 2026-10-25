import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

/**
 * The lottery games' bet sheet (Win Go, TRX Win, K3, 5D): tap the Quantity
 * box and type a number on the number pad instead of tapping + again and
 * again. The bet is balance x quantity x multiplier, so this shows the total
 * as it is typed and keeps it within the most one bet may be.
 * Sits in the upper part of the screen so the number pad never covers it.
 */
type Props = {
  visible: boolean;
  value: number;
  /** The sheet's Balance chip (1, 10, 50, 100). */
  unit: number;
  /** The sheet's X1…X100 chip. */
  mult: number;
  /** Most one bet may total. */
  maxTotal: number;
  color: string;
  onConfirm: (qty: number) => void;
  onClose: () => void;
};

const money = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function QuantityInputModal({ visible, value, unit, mult, maxTotal, color, onConfirm, onClose }: Props) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    if (visible) setText(String(value));
  }, [visible, value]);

  const qty = Number(text);
  const total = unit * qty * mult;
  const tooBig = total > maxTotal;
  const valid = Number.isInteger(qty) && qty >= 1 && !tooBig;
  const maxQty = Math.max(1, Math.floor(maxTotal / (unit * mult)));

  const confirm = () => {
    if (valid) onConfirm(qty);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable style={styles.card} onPress={() => {}}>
            <Text style={styles.title}>Quantity</Text>
            <TextInput
              value={text}
              onChangeText={(t) => setText(t.replace(/[^0-9]/g, '').slice(0, 7))}
              keyboardType="number-pad"
              placeholder="1"
              placeholderTextColor="#9AA5A0"
              style={[styles.input, { borderColor: tooBig ? '#E5484D' : color }]}
              autoFocus
              selectTextOnFocus
              onSubmitEditing={confirm}
              returnKeyType="done"
            />
            <Text style={[styles.total, tooBig && { color: '#E5484D' }]}>
              {money(unit)} × {Number.isFinite(qty) && text !== '' ? qty.toLocaleString('en-IN') : '–'} × {mult} = {money(Number.isFinite(total) ? total : 0)}
            </Text>
            <Text style={[styles.hint, tooBig && { color: '#E5484D' }]}>
              {tooBig ? `Too much — at most ${money(maxTotal)} per bet (quantity up to ${maxQty.toLocaleString('en-IN')} here)` : `At most ${money(maxTotal)} per bet`}
            </Text>
            <View style={styles.row}>
              <Pressable onPress={onClose} style={[styles.btn, styles.cancel]}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={confirm} disabled={!valid} style={[styles.btn, { backgroundColor: color }, !valid && { opacity: 0.45 }]}>
                <Text style={styles.confirmText}>OK</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'flex-start', paddingTop: '14%', paddingHorizontal: 24 },
  card: { width: '100%', maxWidth: 360, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, alignItems: 'stretch' },
  title: { color: '#1F2A24', fontSize: 17, fontWeight: '900', textAlign: 'center', marginBottom: 12 },
  input: {
    borderWidth: 2,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 24,
    fontWeight: '900',
    color: '#1F2A24',
    textAlign: 'center',
    backgroundColor: '#F6F8F7',
  },
  total: { color: '#1F2A24', fontSize: 15, fontWeight: '800', textAlign: 'center', marginTop: 12 },
  hint: { color: '#7A8680', fontSize: 12, textAlign: 'center', marginTop: 4 },
  row: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  cancel: { backgroundColor: '#EEF1EF' },
  cancelText: { color: '#6B7770', fontSize: 15, fontWeight: '800' },
  confirmText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
});
