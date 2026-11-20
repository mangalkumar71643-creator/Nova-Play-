import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useState } from 'react';
import { Modal, Pressable, StyleProp, StyleSheet, Switch, View, ViewStyle, useWindowDimensions } from 'react-native';
import { Text } from './AppText';

import { setSoundEnabled, useSoundEnabled } from '../sound/engine';
import { withPopupSound } from '../sound/ui';

type Props = {
  /** The game's info line(s): RTP, bet range, max win and fairness notes. */
  children: React.ReactNode;
  /** Small round "?" only, for tight spots; otherwise "?" with a GAME INFO label. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * A "?" button that keeps a game's RTP and limits off the main screen; tapping
 * it opens them in a small card. The same details stay in each game's RULES.
 */
export default function GameInfoButton({ children, compact, style }: Props) {
  const [open, setOpen] = useState(false);
  const soundOn = useSoundEnabled();
  const { width } = useWindowDimensions();
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Game info"
        style={({ pressed }) => [compact ? styles.compact : styles.button, pressed && { opacity: 0.6 }, style]}
      >
        <View style={styles.circle}>
          <MaterialCommunityIcons name="help" size={compact ? 13 : 15} color="#1A0A00" />
        </View>
        {!compact && <Text style={styles.label}>GAME INFO</Text>}
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.back} onPress={() => setOpen(false)}>
          <Pressable style={[styles.card, { width: Math.min(width - 32, 400) }]} onPress={() => {}}>
            <View style={styles.head}>
              <Text style={styles.title}>GAME INFO</Text>
              <Pressable onPress={withPopupSound(() => setOpen(false))} hitSlop={8} accessibilityLabel="Close">
                <MaterialCommunityIcons name="close" size={22} color="#FFF4E4" />
              </Pressable>
            </View>
            <Text style={styles.body}>{children}</Text>
            <View style={styles.soundRow}>
              <MaterialCommunityIcons name={soundOn ? 'volume-high' : 'volume-off'} size={18} color="#FFD66B" />
              <Text style={styles.soundLabel}>Game sounds</Text>
              <Switch value={soundOn} onValueChange={setSoundEnabled} trackColor={{ false: '#4A3A55', true: '#B8860B' }} thumbColor={soundOn ? '#FFD66B' : '#CFC3D6'} accessibilityLabel="Game sounds" />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,214,107,0.45)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  compact: { alignSelf: 'center', marginTop: 4 },
  circle: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFD66B', alignItems: 'center', justifyContent: 'center' },
  label: { color: '#FFD66B', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#1E1028', borderRadius: 16, borderWidth: 2, borderColor: '#B8860B', padding: 16 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { color: '#FFF4E4', fontSize: 15, fontWeight: '900', letterSpacing: 3 },
  body: { color: '#E8DCEC', fontSize: 13, lineHeight: 20 },
  soundRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,214,107,0.25)' },
  soundLabel: { flex: 1, color: '#FFF4E4', fontSize: 13, fontWeight: '700' },
});
