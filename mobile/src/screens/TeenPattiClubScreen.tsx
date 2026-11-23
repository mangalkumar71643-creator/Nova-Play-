import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClubConfig, ClubLobby as LobbyData, ClubTableResponse, createPrivateClub, fetchClubConfig, fetchClubLobby, fetchMyClubTable, joinClub, joinClubByCode } from '../api/backend';
import { showAlert } from '../components/AppAlert';
import { Text } from '../components/AppText';
import GameBackdrop from '../components/GameBackdrop';
import SoundToggle from '../components/SoundToggle';
import TapPressable from '../components/TapPressable';
import { GOLD, money } from '../components/club/ClubUi';
import { RootStackParamList } from '../navigation/types';
import { useGameState } from '../state/GameStateContext';
import { PlayOptions, SoundSet } from '../sound/engine';
import type { SoundEvent } from '../sound/types';
import { withTapSound } from '../sound/ui';
import ClubLobby from './club/ClubLobby';
import { CodeSheet, CreateSheet, HistorySheet, RulesSheet } from './club/ClubSheets';
import ClubTableView from './club/ClubTableView';
import { clubErrorMessage, useClubTable } from './club/useClubTable';

/*
 * Teen Patti Club: real Teen Patti for 2 or 3 players. This screen is the frame: the top bar, the lobby (quick play and friends'
 * tables) and, once the player sits down, the table (club/ClubTableView.tsx). The rules of a hand and the house's rake are decided
 * by the server (backend teenPattiClubEngine.ts); the app only shows what the server sends and sends the player's moves.
 */

const RULES_SEEN_KEY = 'novaplay:club:rules:v1';

export default function TeenPattiClubScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { coins, refreshWallet } = useGameState();
  const club = useClubTable();
  const { table } = club;

  const [config, setConfig] = useState<ClubConfig | null>(null);
  const [lobby, setLobby] = useState<LobbyData | null>(null);
  const [rules, setRules] = useState(false);
  const [history, setHistory] = useState(false);
  const [create, setCreate] = useState(false);
  const [code, setCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // The sounds of this game (its own pack); the bets are the app's chip sound.
  const soundsRef = useRef<SoundSet | null>(null);
  useEffect(() => {
    const set = new SoundSet('teenpatticlub');
    soundsRef.current = set;
    return () => {
      set.release();
      soundsRef.current = null;
    };
  }, []);
  const play = useCallback((ev: SoundEvent, opts?: PlayOptions) => soundsRef.current?.play(ev, opts), []);

  useEffect(() => {
    fetchClubConfig()
      .then(setConfig)
      .catch(() => {});
  }, []);

  // The rules (with the house's cut) open by themselves the first time a player comes in; the "?" button opens them again.
  useEffect(() => {
    AsyncStorage.getItem(RULES_SEEN_KEY)
      .then((seen) => {
        if (seen) return;
        setRules(true);
        AsyncStorage.setItem(RULES_SEEN_KEY, '1').catch(() => {});
      })
      .catch(() => {});
  }, []);

  const loadLobby = useCallback(() => fetchClubLobby().then(setLobby).catch(() => {}), []);
  const seated = !!table;
  useEffect(() => {
    if (seated || !club.checked) return;
    loadLobby();
    const id = setInterval(loadLobby, 3000);
    return () => clearInterval(id);
  }, [seated, club.checked, loadLobby]);

  // The wallet shown elsewhere in the app catches up when a hand ends and when the table is left.
  const handNo = table?.hand?.over ? table.hand.no : 0;
  useEffect(() => {
    if (handNo) refreshWallet().catch(() => {});
  }, [handNo, refreshWallet]);

  const goBack = useCallback(() => navigation.goBack(), [navigation]);

  // A player who did not leave by themselves but is no longer seated (no balance for the next hand, no moves for two hands, connection lost) is told.
  const wasSeated = useRef(false);
  const leavingRef = useRef(false);
  useEffect(() => {
    if (table) {
      wasSeated.current = true;
      return;
    }
    if (wasSeated.current && !leavingRef.current) {
      showAlert('You are off the table', 'You are no longer at the table. This happens when your balance is below what the table needs, when no move was made for two hands, or when the connection was lost for a while. You can sit down again any time.');
      refreshWallet().catch(() => {});
    }
    wasSeated.current = false;
    leavingRef.current = false;
  }, [table, refreshWallet]);

  const leaveNow = useCallback(async () => {
    leavingRef.current = true;
    const err = await club.leave();
    if (err) showAlert('Could not leave', err);
    refreshWallet().catch(() => {});
    loadLobby();
  }, [club, refreshWallet, loadLobby]);

  /** Leaving in the middle of a hand packs the player, so that is asked first. */
  const askLeave = useCallback(() => {
    const h = table?.hand;
    const me = table?.you;
    const inHand = !!h && !h.over && h.players.some((p) => p.seat === me && !p.left && !p.packed);
    if (inHand) {
      showAlert('Leave the table?', 'You are in a hand. If you leave now you pack, and what you have put in stays in the pot.', [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => void leaveNow() },
      ]);
    } else {
      void leaveNow();
    }
  }, [table, leaveNow]);

  const onBack = useCallback(() => {
    if (table) askLeave();
    else goBack();
  }, [table, askLeave, goBack]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        onBack();
        return true;
      });
      return () => sub.remove();
    }, [onBack])
  );

  const enter = useCallback(
    async (job: () => Promise<ClubTableResponse>) => {
      setBusy(true);
      try {
        const res = await job();
        club.apply(res);
        setCreate(false);
        setCode(false);
      } catch (err) {
        showAlert('Could not sit down', clubErrorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [club]
  );
  const onJoin = useCallback((boot: number, seats: number) => void enter(() => joinClub(boot, seats)), [enter]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadLobby(), refreshWallet().catch(() => {})]);
    setRefreshing(false);
  }, [loadLobby, refreshWallet]);

  const onStart = useCallback(async () => {
    const err = await club.start();
    if (err) showAlert('Could not start', err);
  }, [club]);

  const balance = table ? table.balance : lobby?.balance ?? coins;
  const subtitle = table ? `${money(table.boot)} boot · ${table.seats} players` : 'Real players · real Teen Patti';

  return (
    <View style={styles.root}>
      <GameBackdrop theme="emerald" dim={0.3} />
      <View style={{ height: insets.top }} />
      <View style={styles.header}>
        <TapPressable onPress={withTapSound(onBack)} hitSlop={8} accessibilityRole="button" accessibilityLabel={table ? 'Leave the table' : 'Back'} style={styles.iconBtn}>
          <MaterialCommunityIcons name={table ? 'exit-to-app' : 'chevron-left'} size={table ? 24 : 30} color="#FFFFFF" />
        </TapPressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            TEEN PATTI CLUB
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <TapPressable onPress={withTapSound(() => navigation.navigate('Deposit'))} accessibilityRole="button" accessibilityLabel="Wallet balance" style={styles.balance}>
          <Text style={styles.balanceText} numberOfLines={1}>
            {money(balance)}
          </Text>
          <MaterialCommunityIcons name="plus-circle" size={15} color="#3FE08C" />
        </TapPressable>
        <TapPressable onPress={withTapSound(() => setRules(true))} hitSlop={6} accessibilityRole="button" accessibilityLabel="Rules" style={styles.iconBtnSmall}>
          <MaterialCommunityIcons name="help-circle-outline" size={22} color="#FFFFFF" />
        </TapPressable>
        <SoundToggle size={20} style={styles.iconBtnSmall} />
      </View>

      {club.offline && table ? (
        <View style={styles.offline}>
          <MaterialCommunityIcons name="wifi-off" size={14} color="#FFFFFF" />
          <Text style={styles.offlineText}>Connection lost - trying again…</Text>
        </View>
      ) : null}

      <View style={{ flex: 1, paddingBottom: insets.bottom }}>
        {!club.checked ? (
          <ActivityIndicator color={GOLD} style={{ marginTop: 80 }} />
        ) : table ? (
          <ClubTableView table={table} serverNow={club.serverNow} busy={club.busy} onAct={club.act} onStart={onStart} onLeave={askLeave} play={play} />
        ) : (
          <ClubLobby
            config={config}
            lobby={lobby}
            balance={balance}
            busy={busy}
            refreshing={refreshing}
            onRefresh={refresh}
            onJoin={onJoin}
            onResume={() => void enter(() => fetchMyClubTable())}
            onCreate={() => setCreate(true)}
            onCode={() => setCode(true)}
            onRules={() => setRules(true)}
            onHistory={() => setHistory(true)}
          />
        )}
      </View>

      <RulesSheet visible={rules} config={config} onClose={() => setRules(false)} />
      <HistorySheet visible={history} onClose={() => setHistory(false)} />
      <CreateSheet visible={create} config={config} balance={balance} onClose={() => setCreate(false)} onCreate={(boot, seats) => void enter(() => createPrivateClub(boot, seats))} />
      <CodeSheet visible={code} onClose={() => setCode(false)} onJoin={(c) => void enter(() => joinClubByCode(c))} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#04140E' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, height: 54, gap: 2 },
  iconBtn: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  iconBtnSmall: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { color: GOLD, fontSize: 14, fontWeight: '900', letterSpacing: 0.4 },
  subtitle: { color: '#B9CFC4', fontSize: 11.5, fontWeight: '700', marginTop: 1 },
  balance: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(242,196,90,0.6)', paddingHorizontal: 9, height: 30, maxWidth: 112, marginRight: 2 },
  balanceText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '900' },
  offline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#B3261E', paddingVertical: 4 },
  offlineText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
});
