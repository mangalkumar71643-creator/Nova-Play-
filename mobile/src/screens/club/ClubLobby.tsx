import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ActivityIndicator, Image, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ClubConfig, ClubLobby as LobbyData, ClubLobbyBoot } from '../../api/backend';
import { Text } from '../../components/AppText';
import TapPressable from '../../components/TapPressable';
import { GOLD, GOLD_DEEP, money } from '../../components/club/ClubUi';

const EMBLEM = require('../../../assets/teenpatticlub/emblem.webp');

/*
 * The lobby of Teen Patti Club: pick a boot and 2 or 3 players for a quick game, or make / join a friends' table. It says plainly
 * what the house takes (the rake) and shows who is waiting, so a player never sits down to an empty room without knowing.
 */

function SizeButton({ boot, size, balance, onJoin, busy }: { boot: ClubLobbyBoot; size: ClubLobbyBoot['sizes'][number]; balance: number; onJoin: (boot: number, seats: number) => void; busy: boolean }) {
  const locked = balance < boot.minBalance;
  return (
    <TapPressable
      onPress={() => onJoin(boot.boot, size.seats)}
      disabled={locked || busy}
      accessibilityRole="button"
      accessibilityLabel={`${size.seats} players, boot ${boot.boot}`}
      style={({ pressed }) => [styles.sizeBtn, locked && { opacity: 0.4 }, pressed && { transform: [{ scale: 0.97 }] }]}
    >
      <LinearGradient colors={size.waiting > 0 ? ['#3FE08C', '#13874F'] : ['#FFE08A', '#D79A2B']} style={styles.sizeFill}>
        <View style={styles.sizeGloss} />
        <Text style={[styles.sizeLabel, size.waiting > 0 && { color: '#04301A' }]}>{size.seats} PLAYERS</Text>
        <Text style={[styles.sizeSub, size.waiting > 0 && { color: '#064A2A' }]}>{size.waiting > 0 ? `${size.waiting} waiting · join` : size.playing > 0 ? `${size.playing} playing` : 'be the first'}</Text>
      </LinearGradient>
    </TapPressable>
  );
}

function BootCard({ boot, balance, onJoin, busy }: { boot: ClubLobbyBoot; balance: number; onJoin: (boot: number, seats: number) => void; busy: boolean }) {
  const locked = balance < boot.minBalance;
  return (
    <LinearGradient colors={['#14392E', '#0B1F18']} style={styles.bootCard}>
      <View style={styles.medalWrap}>
        <LinearGradient colors={['#FFF0B8', GOLD, GOLD_DEEP]} style={styles.medal}>
          <View style={styles.medalInner}>
            <Text style={styles.medalAmount} numberOfLines={1} adjustsFontSizeToFit>
              {money(boot.boot)}
            </Text>
            <Text style={styles.medalLabel}>BOOT</Text>
          </View>
        </LinearGradient>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.bootLine}>Max bet {money(boot.maxBet)}</Text>
        <Text style={styles.bootSub}>Pot limit {money(boot.potLimit)}</Text>
        {locked ? (
          <View style={styles.lockRow}>
            <MaterialCommunityIcons name="lock" size={13} color="#FF9B9B" />
            <Text style={styles.lockText}>Needs {money(boot.minBalance)} in wallet</Text>
          </View>
        ) : (
          <Text style={styles.bootSub}>Sit with {money(boot.minBalance)}+</Text>
        )}
      </View>
      <View style={{ gap: 7, width: 132 }}>
        {boot.sizes.map((s) => (
          <SizeButton key={s.seats} boot={boot} size={s} balance={balance} onJoin={onJoin} busy={busy} />
        ))}
      </View>
    </LinearGradient>
  );
}

export default function ClubLobby({
  config,
  lobby,
  balance,
  busy,
  refreshing,
  onRefresh,
  onJoin,
  onResume,
  onCreate,
  onCode,
  onRules,
  onHistory,
}: {
  config: ClubConfig | null;
  lobby: LobbyData | null;
  balance: number;
  busy: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onJoin: (boot: number, seats: number) => void;
  onResume: () => void;
  onCreate: () => void;
  onCode: () => void;
  onRules: () => void;
  onHistory: () => void;
}) {
  const rake = lobby?.rakePercent ?? config?.rakePercent ?? 5;
  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} colors={[GOLD]} />}
    >
      <LinearGradient colors={['#1A4A3A', '#0C241C']} style={styles.hero}>
        <Image source={EMBLEM} style={styles.heroEmblem} resizeMode="contain" />
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>Real Teen Patti</Text>
          <Text style={styles.heroText}>Play 3-card Teen Patti against real players, 2 or 3 at a table: Blind, Seen, Chaal, Raise, Show and Side Show.</Text>
          <View style={styles.chips}>
            <View style={styles.chip}>
              <MaterialCommunityIcons name="account-group" size={13} color={GOLD} />
              <Text style={styles.chipText}>Real players only</Text>
            </View>
            <View style={styles.chip}>
              <MaterialCommunityIcons name="bank" size={13} color={GOLD} />
              <Text style={styles.chipText}>House cut {rake}%</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      {lobby?.mine ? (
        <TapPressable onPress={onResume} style={styles.resume} accessibilityRole="button">
          <MaterialCommunityIcons name="cards-playing" size={22} color="#04301A" />
          <View style={{ flex: 1 }}>
            <Text style={styles.resumeTitle}>You are at a ₹{lobby.mine.boot} table</Text>
            <Text style={styles.resumeSub}>Tap to go back to your seat</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#04301A" />
        </TapPressable>
      ) : null}

      <Text style={styles.section}>QUICK PLAY</Text>
      {!lobby ? (
        <ActivityIndicator color={GOLD} style={{ marginVertical: 30 }} />
      ) : (
        lobby.boots.map((b) => <BootCard key={b.boot} boot={b} balance={balance} onJoin={onJoin} busy={busy} />)
      )}

      <Text style={styles.section}>PLAY WITH FRIENDS</Text>
      <View style={styles.friends}>
        <TapPressable onPress={onCreate} style={[styles.friendBtn, { borderColor: GOLD }]} accessibilityRole="button">
          <MaterialCommunityIcons name="plus-circle" size={24} color={GOLD} />
          <Text style={styles.friendTitle}>Make a table</Text>
          <Text style={styles.friendSub}>Get a code to share</Text>
        </TapPressable>
        <TapPressable onPress={onCode} style={[styles.friendBtn, { borderColor: '#3FE08C' }]} accessibilityRole="button">
          <MaterialCommunityIcons name="key-variant" size={24} color="#3FE08C" />
          <Text style={styles.friendTitle}>Enter a code</Text>
          <Text style={styles.friendSub}>Join your friends</Text>
        </TapPressable>
      </View>

      <View style={styles.links}>
        <TapPressable onPress={onRules} style={styles.link} accessibilityRole="button">
          <MaterialCommunityIcons name="book-open-variant" size={18} color={GOLD} />
          <Text style={styles.linkText}>Rules & house cut</Text>
        </TapPressable>
        <TapPressable onPress={onHistory} style={styles.link} accessibilityRole="button">
          <MaterialCommunityIcons name="history" size={18} color={GOLD} />
          <Text style={styles.linkText}>My hands</Text>
        </TapPressable>
      </View>
      <Text style={styles.foot}>
        Each pot is shared by the players: the winner gets the pot less the house's {rake}% rake. Cards are dealt at random and the house never plays. Play only with money you can afford to lose.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 14, paddingBottom: 40, gap: 12 },
  hero: { borderRadius: 18, borderWidth: 1.5, borderColor: '#D9A93E', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, overflow: 'hidden' },
  heroEmblem: { width: 74, height: 74, opacity: 0.95 },
  heroTitle: { color: GOLD, fontSize: 22, fontWeight: '900', letterSpacing: 0.5 },
  heroText: { color: '#CFE3D8', fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(242,196,90,0.4)' },
  chipText: { color: '#FFE9B0', fontSize: 11, fontWeight: '800' },
  resume: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#3FE08C', borderRadius: 14, padding: 12 },
  resumeTitle: { color: '#04301A', fontSize: 15, fontWeight: '900' },
  resumeSub: { color: '#064A2A', fontSize: 12, fontWeight: '700' },
  section: { color: GOLD, fontSize: 12, fontWeight: '900', letterSpacing: 1.4, marginTop: 6 },
  bootCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(242,196,90,0.45)', padding: 12 },
  medalWrap: { shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 5, shadowOffset: { width: 0, height: 3 }, elevation: 5 },
  medal: { width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center' },
  medalInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#0D2A20', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  medalAmount: { color: GOLD, fontSize: 19, fontWeight: '900' },
  medalLabel: { color: '#9DB3A8', fontSize: 8, fontWeight: '900', letterSpacing: 1.2, marginTop: -1 },
  bootLine: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  bootSub: { color: '#9DB3A8', fontSize: 11.5 },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lockText: { color: '#FF9B9B', fontSize: 11.5, fontWeight: '700' },
  sizeBtn: { borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  sizeFill: { borderRadius: 12, paddingVertical: 7, alignItems: 'center', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)' },
  sizeGloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '45%', backgroundColor: 'rgba(255,255,255,0.2)' },
  sizeLabel: { color: '#2A1A00', fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
  sizeSub: { color: '#5A3A06', fontSize: 10.5, fontWeight: '800', marginTop: 1 },
  friends: { flexDirection: 'row', gap: 10 },
  friendBtn: { flex: 1, borderWidth: 1.5, borderRadius: 16, paddingVertical: 14, alignItems: 'center', gap: 2, backgroundColor: 'rgba(255,255,255,0.05)' },
  friendTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', marginTop: 2 },
  friendSub: { color: '#9DB3A8', fontSize: 11.5 },
  links: { flexDirection: 'row', gap: 10, marginTop: 4 },
  link: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  linkText: { color: '#E8F1EC', fontSize: 13, fontWeight: '800' },
  foot: { color: '#6F8A7E', fontSize: 11.5, lineHeight: 17, textAlign: 'center', marginTop: 4 },
});
