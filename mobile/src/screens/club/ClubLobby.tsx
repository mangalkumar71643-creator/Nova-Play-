import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ClubConfig, ClubLobby as LobbyData, ClubLobbyBoot, ClubOpenTable } from '../../api/backend';
import { Text } from '../../components/AppText';
import TapPressable from '../../components/TapPressable';
import { GOLD, GOLD_DEEP, money } from '../../components/club/ClubUi';

const EMBLEM = require('../../../assets/teenpatticlub/emblem.webp');
const SIZE_KEY = 'novaplay:club:size:v1';

/*
 * The lobby of Teen Patti Club: choose how many players the table seats (2 to 5), then a boot for a quick game; or sit at a table another
 * player opened, or make one of your own (any boot, any size, open to everybody or for friends only with a code). It says plainly what the
 * house takes (the rake) and who is waiting, so a player never sits down to an empty room without knowing.
 */

/** A boot's amount in a round medal: the longer it is the smaller it is drawn (adjustsFontSizeToFit does not work on the web). */
const medalFont = (label: string) => (label.length <= 3 ? 20 : label.length === 4 ? 17 : label.length === 5 ? 15 : 13);

function PlayButton({ boot, seats, balance, busy, onJoin }: { boot: ClubLobbyBoot; seats: number; balance: number; busy: boolean; onJoin: (boot: number, seats: number) => void }) {
  const size = boot.sizes.find((s) => s.seats === seats);
  const waiting = size?.waiting ?? 0;
  const playing = size?.playing ?? 0;
  const locked = balance < boot.minBalance;
  return (
    <TapPressable
      onPress={() => onJoin(boot.boot, seats)}
      disabled={locked || busy || !size}
      accessibilityRole="button"
      accessibilityLabel={`${seats} players, boot ${boot.boot}`}
      style={({ pressed }) => [styles.playBtn, locked && { opacity: 0.4 }, pressed && { transform: [{ scale: 0.97 }] }]}
    >
      <LinearGradient colors={waiting > 0 ? ['#3FE08C', '#13874F'] : ['#FFE08A', '#D79A2B']} style={styles.playFill}>
        <View style={styles.playGloss} />
        <Text style={[styles.playLabel, waiting > 0 && { color: '#04301A' }]}>PLAY</Text>
        <Text style={[styles.playSub, waiting > 0 && { color: '#064A2A' }]}>{waiting > 0 ? `${waiting} waiting` : playing > 0 ? `${playing} playing` : 'be the first'}</Text>
      </LinearGradient>
    </TapPressable>
  );
}

function BootCard({ boot, seats, balance, busy, onJoin }: { boot: ClubLobbyBoot; seats: number; balance: number; busy: boolean; onJoin: (boot: number, seats: number) => void }) {
  const locked = balance < boot.minBalance;
  return (
    <LinearGradient colors={['#14392E', '#0B1F18']} style={styles.bootCard}>
      <View style={styles.medalWrap}>
        <LinearGradient colors={['#FFF0B8', GOLD, GOLD_DEEP]} style={styles.medal}>
          <View style={styles.medalInner}>
            <Text style={[styles.medalAmount, { fontSize: medalFont(money(boot.boot)) }]} numberOfLines={1}>
              {money(boot.boot)}
            </Text>
            <Text style={styles.medalLabel}>BOOT</Text>
          </View>
        </LinearGradient>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.bootLine}>Max bet {money(boot.maxBet)}</Text>
        <Text style={styles.bootSub}>Pot limit {money(boot.potLimit)}</Text>
        {locked ? (
          <View style={styles.lockRow}>
            <MaterialCommunityIcons name="lock" size={13} color="#FF9B9B" />
            <Text style={styles.lockText}>Needs {money(boot.minBalance)}</Text>
          </View>
        ) : (
          <Text style={styles.bootSub}>Sit with {money(boot.minBalance)}+</Text>
        )}
      </View>
      <PlayButton boot={boot} seats={seats} balance={balance} busy={busy} onJoin={onJoin} />
    </LinearGradient>
  );
}

function OpenRow({ t, config, balance, busy, onJoin }: { t: ClubOpenTable; config: ClubConfig | null; balance: number; busy: boolean; onJoin: (id: string) => void }) {
  const need = t.boot * (config?.minBalanceTimes ?? 60);
  const locked = balance < need;
  return (
    <View style={styles.openRow}>
      <View style={styles.openBoot}>
        <Text style={[styles.openBootText, { fontSize: medalFont(money(t.boot)) - 2 }]} numberOfLines={1}>
          {money(t.boot)}
        </Text>
        <Text style={styles.openBootLabel}>BOOT</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.bootLine}>
          {t.players} of {t.seats} seats taken
        </Text>
        <Text style={styles.bootSub}>{locked ? `Needs ${money(need)} in wallet` : t.started ? 'Playing - you are dealt in from the next hand' : 'Waiting for players'}</Text>
      </View>
      <TapPressable
        onPress={() => onJoin(t.id)}
        disabled={locked || busy}
        accessibilityRole="button"
        accessibilityLabel={`Join the table of ${t.seats} with boot ${t.boot}`}
        style={[styles.joinBtn, locked && { opacity: 0.4 }]}
      >
        <Text style={styles.joinText}>JOIN</Text>
      </TapPressable>
    </View>
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
  onJoinOpen,
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
  onJoinOpen: (tableId: string) => void;
  onResume: () => void;
  onCreate: () => void;
  onCode: () => void;
  onRules: () => void;
  onHistory: () => void;
}) {
  const rake = lobby?.rakePercent ?? config?.rakePercent ?? 5;
  const sizes = config?.seats ?? [2, 3, 4, 5];
  const [seats, setSeats] = useState(5);
  useEffect(() => {
    AsyncStorage.getItem(SIZE_KEY)
      .then((v) => {
        const n = Number(v);
        if (n >= 2 && n <= 5) setSeats(n);
      })
      .catch(() => {});
  }, []);
  const pick = (n: number) => {
    setSeats(n);
    AsyncStorage.setItem(SIZE_KEY, String(n)).catch(() => {});
  };
  const wait = config?.fillWaitSeconds ?? 15;
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
          <Text style={styles.heroText}>3-card Teen Patti against real players, 2 to 5 at a table: Blind, Seen, Chaal, Raise, Show and Side Show.</Text>
          <View style={styles.chips}>
            <View style={styles.chip}>
              <MaterialCommunityIcons name="account-group" size={13} color={GOLD} />
              <Text style={styles.chipText}>Real players only</Text>
            </View>
            <View style={styles.chip}>
              <MaterialCommunityIcons name="bank" size={13} color={GOLD} />
              <Text style={styles.chipText}>House cut {rake}%</Text>
            </View>
            {lobby && lobby.online > 0 ? (
              <View style={styles.chip}>
                <View style={styles.liveDot} />
                <Text style={styles.chipText}>{lobby.online} at the tables</Text>
              </View>
            ) : null}
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
      <View style={styles.sizeBox}>
        <Text style={styles.sizeTitle}>Players at the table</Text>
        <View style={styles.sizeRow}>
          {sizes.map((n) => (
            <TapPressable key={n} onPress={() => pick(n)} accessibilityRole="button" accessibilityLabel={`Table of ${n} players`} accessibilityState={{ selected: seats === n }} style={[styles.sizeChip, seats === n && styles.sizeChipOn]}>
              <Text style={[styles.sizeNum, seats === n && styles.sizeNumOn]}>{n}</Text>
            </TapPressable>
          ))}
        </View>
        <Text style={styles.sizeNote}>
          {seats === 2 ? 'Heads-up: the cards are dealt as soon as two players sit.' : `Up to ${seats} play. The cards are dealt ${wait} seconds after the second player sits (at once when all ${seats} seats are taken); others can sit down between hands.`}
        </Text>
      </View>
      {!lobby ? (
        <ActivityIndicator color={GOLD} style={{ marginVertical: 30 }} />
      ) : (
        lobby.boots.map((b) => <BootCard key={b.boot} boot={b} seats={seats} balance={balance} busy={busy} onJoin={onJoin} />)
      )}

      {lobby && lobby.open.length > 0 ? (
        <>
          <Text style={styles.section}>OPEN TABLES · MADE BY PLAYERS</Text>
          {lobby.open.map((t) => (
            <OpenRow key={t.id} t={t} config={config} balance={balance} busy={busy} onJoin={onJoinOpen} />
          ))}
        </>
      ) : null}

      <Text style={styles.section}>YOUR OWN TABLE</Text>
      <View style={styles.friends}>
        <TapPressable onPress={onCreate} style={[styles.friendBtn, { borderColor: GOLD }]} accessibilityRole="button" accessibilityLabel="Make your own table">
          <MaterialCommunityIcons name="plus-circle" size={24} color={GOLD} />
          <Text style={styles.friendTitle}>Make a table</Text>
          <Text style={styles.friendSub}>Your boot, 2 to 5 players</Text>
        </TapPressable>
        <TapPressable onPress={onCode} style={[styles.friendBtn, { borderColor: '#3FE08C' }]} accessibilityRole="button" accessibilityLabel="Enter a table code">
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
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#3FE08C' },
  resume: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#3FE08C', borderRadius: 14, padding: 12 },
  resumeTitle: { color: '#04301A', fontSize: 15, fontWeight: '900' },
  resumeSub: { color: '#064A2A', fontSize: 12, fontWeight: '700' },
  section: { color: GOLD, fontSize: 12, fontWeight: '900', letterSpacing: 1.4, marginTop: 6 },
  sizeBox: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(242,196,90,0.35)', padding: 12, gap: 8 },
  sizeTitle: { color: '#E8F1EC', fontSize: 13.5, fontWeight: '800' },
  sizeRow: { flexDirection: 'row', gap: 8 },
  sizeChip: { flex: 1, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: '#3C5A4E', backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
  sizeChipOn: { borderColor: GOLD, backgroundColor: 'rgba(242,196,90,0.2)' },
  sizeNum: { color: '#C7D8CF', fontSize: 20, fontWeight: '900' },
  sizeNumOn: { color: GOLD },
  sizeNote: { color: '#9DB3A8', fontSize: 11.5, lineHeight: 16 },
  bootCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(242,196,90,0.45)', padding: 12 },
  medalWrap: { shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 5, shadowOffset: { width: 0, height: 3 }, elevation: 5 },
  medal: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center' },
  medalInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#0D2A20', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  medalAmount: { color: GOLD, fontSize: 18, fontWeight: '900' },
  medalLabel: { color: '#9DB3A8', fontSize: 8, fontWeight: '900', letterSpacing: 1.2, marginTop: -1 },
  bootLine: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  bootSub: { color: '#9DB3A8', fontSize: 11.5 },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lockText: { color: '#FF9B9B', fontSize: 11.5, fontWeight: '700' },
  playBtn: { width: 104, borderRadius: 14, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  playFill: { borderRadius: 14, paddingVertical: 9, alignItems: 'center', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)' },
  playGloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '45%', backgroundColor: 'rgba(255,255,255,0.2)' },
  playLabel: { color: '#2A1A00', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  playSub: { color: '#5A3A06', fontSize: 10.5, fontWeight: '800', marginTop: 1 },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(63,224,140,0.45)', backgroundColor: 'rgba(63,224,140,0.07)', padding: 10 },
  openBoot: { width: 62, height: 54, borderRadius: 12, backgroundColor: '#0D2A20', borderWidth: 1.5, borderColor: GOLD, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  openBootText: { color: GOLD, fontSize: 16, fontWeight: '900' },
  openBootLabel: { color: '#9DB3A8', fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  joinBtn: { backgroundColor: '#3FE08C', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
  joinText: { color: '#04301A', fontSize: 14, fontWeight: '900', letterSpacing: 0.8 },
  friends: { flexDirection: 'row', gap: 10 },
  friendBtn: { flex: 1, borderWidth: 1.5, borderRadius: 16, paddingVertical: 14, alignItems: 'center', gap: 2, backgroundColor: 'rgba(255,255,255,0.05)' },
  friendTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', marginTop: 2 },
  friendSub: { color: '#9DB3A8', fontSize: 11.5 },
  links: { flexDirection: 'row', gap: 10, marginTop: 4 },
  link: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  linkText: { color: '#E8F1EC', fontSize: 13, fontWeight: '800' },
  foot: { color: '#6F8A7E', fontSize: 11.5, lineHeight: 17, textAlign: 'center', marginTop: 4 },
});
