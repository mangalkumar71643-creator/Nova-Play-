import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { ClubConfig, ClubHistoryHand, fetchClubHistory } from '../../api/backend';
import { Text, TextInput } from '../../components/AppText';
import TapPressable from '../../components/TapPressable';
import { ClubCardFace, cardParts } from '../../components/club/ClubCards';
import { ActionButton, GOLD, money } from '../../components/club/ClubUi';
import { withPopupSound } from '../../sound/ui';

/*
 * The sheets of Teen Patti Club: the rules (with the house's cut said plainly), the player's hands, and the two ways to a friends' table.
 * Every number in the rules is taken from the server's config, so the text can never disagree with the game.
 */

function Shell({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const { width, height } = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <TapPressable style={styles.back} onPress={onClose} silent>
        <TapPressable silent onPress={() => {}} style={[styles.card, { width: Math.min(width - 24, 440), maxHeight: height * 0.88 }]}>
          <LinearGradient colors={['#12332A', '#0A1B15']} style={styles.cardFill}>
            <View style={styles.head}>
              <Text style={styles.title}>{title}</Text>
              <TapPressable onPress={withPopupSound(onClose)} hitSlop={10} accessibilityLabel="Close">
                <MaterialCommunityIcons name="close" size={24} color="#FFF4E4" />
              </TapPressable>
            </View>
            {children}
          </LinearGradient>
        </TapPressable>
      </TapPressable>
    </Modal>
  );
}

const c = (rank: number, suit: 'S' | 'H' | 'C' | 'D') => ['S', 'H', 'C', 'D'].indexOf(suit) * 13 + rank - 1;
const RANKS: { name: string; note: string; cards: number[] }[] = [
  { name: 'Trail', note: 'three of a kind (A-A-A is the best)', cards: [c(1, 'S'), c(1, 'H'), c(1, 'D')] },
  { name: 'Pure Sequence', note: 'three in a row, all one suit', cards: [c(1, 'S'), c(13, 'S'), c(12, 'S')] },
  { name: 'Sequence', note: 'three in a row', cards: [c(9, 'C'), c(8, 'D'), c(7, 'S')] },
  { name: 'Color', note: 'three of one suit', cards: [c(1, 'D'), c(9, 'D'), c(4, 'D')] },
  { name: 'Pair', note: 'two of a kind', cards: [c(13, 'S'), c(13, 'D'), c(5, 'C')] },
  { name: 'High Card', note: 'none of the above', cards: [c(1, 'C'), c(11, 'D'), c(7, 'H')] },
];

function Para({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.para}>
      <Text style={styles.paraTitle}>{title}</Text>
      <Text style={styles.paraBody}>{children}</Text>
    </View>
  );
}

export function RulesSheet({ visible, config, onClose }: { visible: boolean; config: ClubConfig | null; onClose: () => void }) {
  const rake = config?.rakePercent ?? 5;
  const turn = config?.turnSeconds ?? 20;
  const side = config?.sideShowSeconds ?? 10;
  const maxStake = config?.maxStakeTimes ?? 16;
  const potLimit = config?.potLimitTimes ?? 250;
  const minBal = config?.minBalanceTimes ?? 60;
  return (
    <Shell visible={visible} title="HOW TO PLAY" onClose={onClose}>
      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.cutBox}>
          <MaterialCommunityIcons name="bank" size={20} color={GOLD} />
          <Text style={styles.cutText}>
            The house keeps {rake}% of every pot (the "rake"), whichever way a hand ends. The winner gets the other {100 - rake}%. It is shown in every result. The house never plays a hand.
          </Text>
        </View>
        <Para title="The hand">
          2 or 3 real players sit at a table (no computer players). Everyone puts the boot in the pot and gets 3 cards face down. Turns go round the table. On your turn you play Blind (you have not looked at your cards) or Seen (you have). The last player left wins the pot, or the better hand wins a Show.
        </Para>
        <Para title="What a move costs">
          The "stake" starts at the boot.{'\n'}Blind: Chaal = the stake, Raise = 2× the stake.{'\n'}Seen: Chaal = 2× the stake, Raise = 4× the stake. A raise doubles the stake.{'\n'}The stake can grow to {maxStake}× the boot, so no single bet is more than {maxStake * 2}× the boot.{'\n'}Pack (fold) any time: what you put in stays in the pot.
        </Para>
        <Para title="Show">
          When only two players are left, a player can pay a chaal and ask for a Show: both hands are turned over and the better hand wins. If the hands are equal, the player who asked for the Show loses.
        </Para>
        <Para title="Side show">
          With three players in, a Seen player can ask the player just before them (who must be Seen too) to compare cards. It costs nothing. If that player says yes, they look at each other's cards and the lower hand packs (equal hands: the player who asked). If they say no, or do not answer in {side} seconds, play goes on.
        </Para>
        <Para title="Pot limit">
          When the pot reaches {potLimit}× the boot, everyone still in is shown and the best hand wins (equal best hands share the pot).
        </Para>
        <Para title="Time">
          You have {turn} seconds for each turn. If you do not move in time you pack. Two hands in a row like that and you are taken off the table.
        </Para>
        <Text style={styles.paraTitle}>Hands, best first</Text>
        {RANKS.map((r) => (
          <View key={r.name} style={styles.rankRow}>
            <View style={styles.rankCards}>
              {r.cards.map((card, i) => (
                <View key={card} style={{ marginLeft: i ? -10 : 0, transform: [{ rotate: `${(i - 1) * 4}deg` }] }}>
                  <ClubCardFace card={card} w={30} />
                </View>
              ))}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rankName}>{r.name}</Text>
              <Text style={styles.rankNote}>{r.note}</Text>
            </View>
          </View>
        ))}
        <Text style={styles.small}>Among sequences A-K-Q is the highest, then A-2-3, then K-Q-J ... down to 4-3-2. Equal kinds are compared card by card, Ace high.</Text>
        <Para title="A fair deal">
          Every hand is dealt from a fresh, random shuffle. Its fingerprint (a SHA-256 hash) is shown to you before the first move, and the secret it was made from is shown when the hand is over, so you can check that the deal was fixed in advance. The house does not play and does not choose any cards.
        </Para>
        <Para title="Sitting down">
          A table needs {minBal}× its boot in your wallet to sit down and to be dealt in again. Each bet is taken from your wallet when you make it, and the pot is paid to the winner when the hand ends. Play only with money you can afford to lose.
        </Para>
      </ScrollView>
    </Shell>
  );
}

const OUTCOME: Record<string, { label: string; color: string }> = {
  WON: { label: 'WON', color: '#4BE08A' },
  LOST: { label: 'LOST', color: '#FF6B6B' },
  PACKED: { label: 'PACKED', color: '#FFB020' },
  LEFT: { label: 'LEFT', color: '#FFB020' },
};
const ENDED: Record<string, string> = { PACK: 'Everyone else packed', SHOW: 'Show', POT_LIMIT: 'Pot limit' };

function HandRow({ hand }: { hand: ClubHistoryHand }) {
  const [open, setOpen] = useState(false);
  const o = OUTCOME[hand.outcome] ?? { label: hand.outcome, color: '#CCC' };
  const net = hand.payout - hand.invested;
  const when = new Date(hand.at);
  return (
    <TapPressable onPress={() => setOpen((v) => !v)} style={styles.histRow} accessibilityRole="button">
      <View style={styles.histTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.histTitle}>
            {hand.boot !== null ? `₹${hand.boot} table` : 'Table'} · {hand.endedBy ? ENDED[hand.endedBy] : ''}
          </Text>
          <Text style={styles.histSub}>{when.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.histNet, { color: net >= 0 ? '#4BE08A' : '#FF6B6B' }]}>
            {net >= 0 ? '+' : ''}
            {money(net)}
          </Text>
          <Text style={[styles.histTag, { color: o.color }]}>{o.label}</Text>
        </View>
      </View>
      {open ? (
        <View style={styles.histBody}>
          <Text style={styles.histSub}>
            Put in {money(hand.invested)} · pot {hand.pot !== null ? money(hand.pot) : '-'} · house {hand.rake !== null ? money(hand.rake) : '-'}
          </Text>
          {hand.players.map((p, i) => (
            <View key={i} style={styles.histPlayer}>
              <Text style={[styles.histName, p.you && { color: GOLD }]} numberOfLines={1}>
                {p.you ? 'You' : p.name}
              </Text>
              <View style={{ flexDirection: 'row', flex: 1, justifyContent: 'center' }}>
                {p.cards ? p.cards.map((card, k) => <View key={k} style={{ marginHorizontal: 2 }}><ClubCardFace card={card} w={24} /></View>) : <Text style={styles.histSub}>{p.packed ? 'packed, cards not shown' : 'cards not shown'}</Text>}
              </View>
              <Text style={[styles.histAmt, { color: p.payout > 0 ? '#4BE08A' : '#9DB3A8' }]}>{p.payout > 0 ? `+${money(p.payout)}` : money(-p.invested)}</Text>
            </View>
          ))}
          {hand.seed && hand.seedHash ? (
            <Text style={styles.seed} selectable>
              Deal check — fingerprint: {hand.seedHash.slice(0, 20)}… secret: {hand.seed.slice(0, 20)}…
            </Text>
          ) : null}
        </View>
      ) : null}
    </TapPressable>
  );
}

export function HistorySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [hands, setHands] = useState<ClubHistoryHand[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    fetchClubHistory(40)
      .then(setHands)
      .catch(() => setError('Could not load your hands.'));
  }, []);
  useEffect(() => {
    if (visible) load();
    else setHands(null);
  }, [visible, load]);
  return (
    <Shell visible={visible} title="MY HANDS" onClose={onClose}>
      {error ? (
        <Text style={styles.empty}>{error}</Text>
      ) : hands === null ? (
        <ActivityIndicator color={GOLD} style={{ margin: 30 }} />
      ) : hands.length === 0 ? (
        <Text style={styles.empty}>You have not played a hand yet.</Text>
      ) : (
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ padding: 12, gap: 8 }} showsVerticalScrollIndicator={false}>
          {hands.map((h) => (
            <HandRow key={h.id} hand={h} />
          ))}
        </ScrollView>
      )}
    </Shell>
  );
}

export function CreateSheet({
  visible,
  config,
  balance,
  onClose,
  onCreate,
}: {
  visible: boolean;
  config: ClubConfig | null;
  balance: number;
  onClose: () => void;
  onCreate: (boot: number, seats: number) => void;
}) {
  const boots = config?.boots ?? [];
  const [boot, setBoot] = useState(10);
  const [seats, setSeats] = useState(3);
  const info = boots.find((b) => b.boot === boot);
  const short = info && balance < info.minBalance;
  return (
    <Shell visible={visible} title="PLAY WITH FRIENDS" onClose={onClose}>
      <View style={styles.form}>
        <Text style={styles.label}>Boot amount</Text>
        <View style={styles.wrap}>
          {boots.map((b) => (
            <TapPressable key={b.boot} onPress={() => setBoot(b.boot)} style={[styles.choice, boot === b.boot && styles.choiceOn]} accessibilityRole="button" accessibilityState={{ selected: boot === b.boot }}>
              <Text style={[styles.choiceText, boot === b.boot && styles.choiceTextOn]}>{money(b.boot)}</Text>
            </TapPressable>
          ))}
        </View>
        <Text style={styles.label}>Players</Text>
        <View style={styles.wrap}>
          {[2, 3].map((n) => (
            <TapPressable key={n} onPress={() => setSeats(n)} style={[styles.choice, { flex: 1 }, seats === n && styles.choiceOn]} accessibilityRole="button" accessibilityState={{ selected: seats === n }}>
              <Text style={[styles.choiceText, seats === n && styles.choiceTextOn]}>{n} players</Text>
            </TapPressable>
          ))}
        </View>
        <Text style={styles.hint}>
          You get a code to send to your friends. They join with it, nobody else is matched with your table, and as host you can start with fewer players than seats.
          {info ? `\nYou need ${money(info.minBalance)} in your wallet to sit at this table.` : ''}
        </Text>
        {short ? <Text style={[styles.hint, { color: '#FF9B9B' }]}>Your balance is {money(balance)} - add money or pick a smaller boot.</Text> : null}
        <ActionButton label="CREATE TABLE" tone="gold" height={54} disabled={!!short} onPress={() => onCreate(boot, seats)} flex={0} style={{ alignSelf: 'stretch', marginTop: 6 }} />
      </View>
    </Shell>
  );
}

export function CodeSheet({ visible, onClose, onJoin }: { visible: boolean; onClose: () => void; onJoin: (code: string) => void }) {
  const [code, setCode] = useState('');
  useEffect(() => {
    if (!visible) setCode('');
  }, [visible]);
  const ok = code.trim().length >= 4;
  return (
    <Shell visible={visible} title="ENTER TABLE CODE" onClose={onClose}>
      <View style={styles.form}>
        <Text style={styles.hint}>Type the 6-letter code your friend shared.</Text>
        <TextInput
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
          placeholder="ABC234"
          placeholderTextColor="#5E7A6E"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={8}
          style={styles.codeInput}
          accessibilityLabel="Table code"
          onSubmitEditing={() => ok && onJoin(code)}
        />
        <ActionButton label="JOIN TABLE" tone="green" height={54} disabled={!ok} onPress={() => onJoin(code)} flex={0} style={{ alignSelf: 'stretch' }} />
      </View>
    </Shell>
  );
}

export { cardParts };

const styles = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 20, overflow: 'hidden', borderWidth: 1.5, borderColor: '#D9A93E' },
  cardFill: { paddingBottom: 6 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#3C5A4E' },
  title: { color: GOLD, fontSize: 17, fontWeight: '900', letterSpacing: 1.2 },
  scroll: { padding: 16, gap: 12 },
  cutBox: { flexDirection: 'row', gap: 10, backgroundColor: 'rgba(242,196,90,0.12)', borderColor: 'rgba(242,196,90,0.5)', borderWidth: 1, borderRadius: 12, padding: 12, alignItems: 'flex-start' },
  cutText: { flex: 1, color: '#FFE9B0', fontSize: 13, lineHeight: 19, fontWeight: '600' },
  para: { gap: 3 },
  paraTitle: { color: GOLD, fontSize: 13, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  paraBody: { color: '#DCE9E2', fontSize: 13.5, lineHeight: 20 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  rankCards: { flexDirection: 'row', width: 96, paddingLeft: 2 },
  rankName: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  rankNote: { color: '#9DB3A8', fontSize: 12 },
  small: { color: '#9DB3A8', fontSize: 12, lineHeight: 17 },
  empty: { color: '#9DB3A8', textAlign: 'center', padding: 30, fontSize: 14 },
  histRow: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  histTop: { flexDirection: 'row', alignItems: 'center' },
  histTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  histSub: { color: '#9DB3A8', fontSize: 12, marginTop: 2 },
  histNet: { fontSize: 16, fontWeight: '900' },
  histTag: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8, marginTop: 2 },
  histBody: { marginTop: 10, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#3C5A4E', paddingTop: 10 },
  histPlayer: { flexDirection: 'row', alignItems: 'center' },
  histName: { color: '#DCE9E2', fontSize: 12.5, fontWeight: '700', width: 78 },
  histAmt: { fontSize: 12.5, fontWeight: '800', width: 74, textAlign: 'right' },
  seed: { color: '#6F8A7E', fontSize: 10.5, lineHeight: 15 },
  form: { padding: 18, gap: 12 },
  label: { color: GOLD, fontSize: 12, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: '#3C5A4E', backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center' },
  choiceOn: { borderColor: GOLD, backgroundColor: 'rgba(242,196,90,0.18)' },
  choiceText: { color: '#C7D8CF', fontSize: 15, fontWeight: '800' },
  choiceTextOn: { color: GOLD },
  hint: { color: '#9DB3A8', fontSize: 12.5, lineHeight: 18 },
  codeInput: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', letterSpacing: 8, textAlign: 'center', borderWidth: 1.5, borderColor: GOLD, borderRadius: 14, paddingVertical: 12, backgroundColor: 'rgba(0,0,0,0.35)' },
});
