import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleProp, StyleSheet, View, ViewStyle, useWindowDimensions } from 'react-native';
import { Text } from './AppText';
import TapPressable from './TapPressable';

import { useAuth } from '../state/AuthContext';
import type { SoloRule } from '../api/backend';
import { soloRuleText } from '../utils/soloRule';

type Props = {
  /** True when the server reports the least-payout rule for this game. */
  active: boolean;
  /** The game's name, e.g. "Dragon Tiger". */
  game: string;
  /** The tax already taken in the odds shown (the fair odds less this %), when the server reports one (Win Go's rule). */
  taxPercent?: number;
  /** What a round with only one player does (Admin → Result Rules), when the server reports it. */
  solo?: SoloRule;
};

// What a player has been shown already: one flag per player and game, kept on the phone.
const SEEN_KEY = 'novaplay.resultRuleSeen';

// The "?" buttons of the top bars find the card of their game through here.
const openers = new Set<{ game: string; open: () => void }>();

/**
 * The shared-table games (7 Up Down, Dragon Tiger, Andar Bahar, Teen Patti, Roulette, Baccarat) have no rules page of their own
 * for how the result is decided, so while the least-payout rule is on this card states it.
 *
 * It opens by itself the first time a player enters the game (once, until they tap "I understand"), so nobody plays without having
 * been told; after that it stays out of the way and the small "?" button of the game's top bar (ResultRuleButton) opens it.
 */
export default function ResultRuleNotice({ active, game, taxPercent, solo }: Props) {
  const [open, setOpen] = useState(false);
  const { width, height } = useWindowDimensions();
  const { backendUser } = useAuth();
  const key = `${SEEN_KEY}:${backendUser?.uid ?? 'guest'}:${game}`;

  useEffect(() => {
    const entry = { game, open: () => setOpen(true) };
    openers.add(entry);
    return () => {
      openers.delete(entry);
    };
  }, [game]);

  useEffect(() => {
    if (!active) return;
    let gone = false;
    // If it cannot be read whether the player has seen it, they are shown it.
    AsyncStorage.getItem(key)
      .then((seen) => {
        if (!gone && seen !== '1') setOpen(true);
      })
      .catch(() => {
        if (!gone) setOpen(true);
      });
    return () => {
      gone = true;
    };
  }, [active, key]);

  const close = () => {
    setOpen(false);
    AsyncStorage.setItem(key, '1').catch(() => {});
  };

  return (
    <Modal visible={open && active} transparent animationType="fade" onRequestClose={close} supportedOrientations={['portrait', 'landscape']}>
      <View style={styles.back}>
        <View style={[styles.card, { width: Math.min(width - 32, 420) }]}>
          <Text style={styles.title}>{game}: how the result is decided</Text>
          <ScrollView style={{ maxHeight: Math.max(120, height - 150) }} contentContainerStyle={styles.paragraphs}>
            <Text style={styles.body}>
              Least payout wins: when betting closes, the result is the one that pays the least in total on all players&apos; bets. If several results would pay the same, one of them is picked at random.
            </Text>
            <Text style={styles.body}>
              The result is not a random deal or spin: the more money is on a bet, the less likely it is to win.
            </Text>
            {soloRuleText(solo, 'result') ? <Text style={styles.body}>{soloRuleText(solo, 'result')}</Text> : null}
            {taxPercent && taxPercent > 0 ? (
              <Text style={styles.body}>
                Tax: a {taxPercent}% tax is already taken in the odds shown (the fair odds less {taxPercent}%). A winning bet returns the odds shown times the bet, stake included: ₹100 on a 3X box returns ₹300.
              </Text>
            ) : null}
          </ScrollView>
          <TapPressable onPress={close} style={({ pressed }) => [styles.ok, pressed && { opacity: 0.7 }]} accessibilityRole="button">
            <Text style={styles.okText}>I understand</Text>
          </TapPressable>
        </View>
      </View>
    </Modal>
  );
}

/**
 * The small "?" for a game's top bar (next to Deposit): one tap shows how the result is decided, whenever the player wants it.
 * Nothing is drawn while the rule is not on.
 */
export function ResultRuleButton({ active, game, size = 30, style }: Props & { size?: number; style?: StyleProp<ViewStyle> }) {
  if (!active) return null;
  return (
    <TapPressable
      onPress={() => openers.forEach((o) => o.game === game && o.open())}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel="How the result is decided"
      style={[styles.help, { width: size, height: size, borderRadius: size / 2 }, style]}
    >
      <MaterialCommunityIcons name="help" size={Math.round(size * 0.62)} color="#F5B942" />
    </TapPressable>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 16, padding: 18, gap: 10, backgroundColor: '#2A0F12', borderWidth: 1, borderColor: '#F5B942' },
  title: { color: '#F5B942', fontSize: 16, fontWeight: '900' },
  body: { color: '#FFF4E4', fontSize: 13.5, lineHeight: 19 },
  paragraphs: { gap: 10 },
  ok: { marginTop: 4, alignSelf: 'stretch', alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: '#F5B942' },
  okText: { color: '#1A0A00', fontSize: 14, fontWeight: '900' },
  help: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(245,185,66,0.9)', backgroundColor: 'rgba(0,0,0,0.4)' },
});
