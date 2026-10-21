import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

type Props = {
  /** True when the server reports the least-payout rule for this game. */
  active: boolean;
  /** The game's name, e.g. "Dragon Tiger". */
  game: string;
};

/**
 * The shared-table games (7 Up Down, Dragon Tiger, Andar Bahar, Teen Patti,
 * Roulette, Baccarat) have no rules page of their own, so while the
 * least-payout rule is on this card states it every time the game opens,
 * before the player can bet.
 */
export default function ResultRuleNotice({ active, game }: Props) {
  const [open, setOpen] = useState(false);
  const { width } = useWindowDimensions();
  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)} supportedOrientations={['portrait', 'landscape']}>
      <View style={styles.back}>
        <View style={[styles.card, { width: Math.min(width - 32, 420) }]}>
          <Text style={styles.title}>{game}: how the result is decided</Text>
          <Text style={styles.body}>
            Least payout wins: when betting closes, the result is the one that pays the least in total on all players&apos; bets. Ties are decided at random.
          </Text>
          <Text style={styles.body}>
            The result is not a random deal or spin: the more money is on a bet, the less likely it is to win.
          </Text>
          <Pressable onPress={() => setOpen(false)} style={({ pressed }) => [styles.ok, pressed && { opacity: 0.7 }]} accessibilityRole="button">
            <Text style={styles.okText}>I understand</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 16, padding: 18, gap: 10, backgroundColor: '#2A0F12', borderWidth: 1, borderColor: '#F5B942' },
  title: { color: '#F5B942', fontSize: 16, fontWeight: '900' },
  body: { color: '#FFF4E4', fontSize: 13.5, lineHeight: 19 },
  ok: { marginTop: 4, alignSelf: 'stretch', alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: '#F5B942' },
  okText: { color: '#1A0A00', fontSize: 14, fontWeight: '900' },
});
