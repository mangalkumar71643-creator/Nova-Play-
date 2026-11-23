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
  const wait = config?.fillWaitSeconds ?? 15;
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
          2 to 5 real players sit at a table (no computer players). Everyone puts the boot in the pot and gets 3 cards face down. Turns go round the table. On your turn you play Blind (you have not looked at your cards) or Seen (you have). The last player left wins the pot, or the better hand wins a Show.
        </Para>
        <Para title="What a move costs">
          The "stake" starts at the boot.{'\n'}Blind: Chaal = the stake, Raise = 2× the stake.{'\n'}Seen: Chaal = 2× the stake, Raise = 4× the stake. A raise doubles the stake.{'\n'}The stake can grow to {maxStake}× the boot, so no single bet is more than {maxStake * 2}× the boot.{'\n'}Pack (fold) any time: what you put in stays in the pot.
        </Para>
        <Para title="Show">
          When only two players are left, a player can pay a chaal and ask for a Show: both hands are turned over and the better hand wins. If the hands are equal, the player who asked for the Show loses.
        </Para>
        <Para title="Starting a table">
          A table starts when all its seats are taken, or {wait} seconds after the second player sits: others can still sit down while it counts, and between hands. A table you make for friends starts when it is full or when you, the host, start it. A player's own table has the boot and size they chose.
        </Para>
        <Para title="Side show">
          With three or more players in, a Seen player can ask the player just before them (who must be Seen too) to compare cards. It costs nothing. If that player says yes, they look at each other's cards and the lower hand packs (equal hands: the player who asked). If they say no, or do not answer in {side} seconds, play goes on.
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
  onCreate: (boot: number, seats: number, isPrivate: boolean) => void;
}) {
  const cb = config?.customBoot ?? { min: 5, max: 5000, step: 5 };
  const sizes = config?.seats ?? [2, 3, 4, 5];
  const [text, setText] = useState('20');
  const [seats, setSeats] = useState(5);
  const [isPrivate, setIsPrivate] = useState(false);
  const boot = Number(text);
  const valid = text !== '' && Number.isFinite(boot) && boot >= cb.min && boot <= cb.max && boot % cb.step === 0;
  const need = valid ? boot * (config?.minBalanceTimes ?? 60) : 0;
  const short = valid && balance < need;
  const nudge = (dir: 1 | -1) => {
    const base = valid ? boot : Math.max(cb.min, Math.round((Number(text) || cb.min) / cb.step) * cb.step);
    setText(String(Math.min(cb.max, Math.max(cb.min, base + dir * cb.step))));
  };
  const presets = [10, 20, 50, 100, 500];
  return (
    <Shell visible={visible} title="MAKE YOUR OWN TABLE" onClose={onClose}>
      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={styles.form} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Boot amount (what each player puts in first)</Text>
        <View style={styles.bootRow}>
          <TapPressable onPress={() => nudge(-1)} accessibilityRole="button" accessibilityLabel="Less boot" style={styles.stepBtn}>
            <MaterialCommunityIcons name="minus" size={24} color={GOLD} />
          </TapPressable>
          <View style={[styles.bootBox, !valid && text !== '' && { borderColor: '#FF6B6B' }]}>
            <Text style={styles.rupee}>₹</Text>
            <TextInput
              value={text}
              onChangeText={(t) => setText(t.replace(/[^0-9]/g, '').slice(0, 5))}
              keyboardType="number-pad"
              maxLength={5}
              style={styles.bootInput}
              accessibilityLabel="Boot amount"
              placeholder="20"
              placeholderTextColor="#5E7A6E"
            />
          </View>
          <TapPressable onPress={() => nudge(1)} accessibilityRole="button" accessibilityLabel="More boot" style={styles.stepBtn}>
            <MaterialCommunityIcons name="plus" size={24} color={GOLD} />
          </TapPressable>
        </View>
        <View style={styles.wrap}>
          {presets.map((v) => (
            <TapPressable key={v} onPress={() => setText(String(v))} accessibilityRole="button" accessibilityLabel={`Boot ${v}`} style={[styles.choiceSmall, boot === v && styles.choiceOn]}>
              <Text style={[styles.choiceText, boot === v && styles.choiceTextOn]}>{money(v)}</Text>
            </TapPressable>
          ))}
        </View>
        <Text style={[styles.hint, !valid && { color: '#FF9B9B' }]}>
          {valid ? `Any amount in steps of ${money(cb.step)}, from ${money(cb.min)} to ${money(cb.max)}.` : `Use a whole amount in steps of ${money(cb.step)}, from ${money(cb.min)} to ${money(cb.max)}.`}
        </Text>

        <Text style={styles.label}>Players at the table</Text>
        <View style={styles.wrap}>
          {sizes.map((n) => (
            <TapPressable key={n} onPress={() => setSeats(n)} style={[styles.choice, { flex: 1 }, seats === n && styles.choiceOn]} accessibilityRole="button" accessibilityLabel={`${n} players`} accessibilityState={{ selected: seats === n }}>
              <Text style={[styles.choiceText, seats === n && styles.choiceTextOn]}>{n}</Text>
            </TapPressable>
          ))}
        </View>

        <Text style={styles.label}>Who can sit</Text>
        <View style={{ gap: 8 }}>
          {[
            { priv: false, title: 'Open to everybody', note: 'It shows in the lobby, anybody can join' },
            { priv: true, title: 'Friends only', note: 'You get a code to send; only they can join' },
          ].map((o) => (
            <TapPressable key={o.title} onPress={() => setIsPrivate(o.priv)} accessibilityRole="button" accessibilityLabel={o.title} accessibilityState={{ selected: isPrivate === o.priv }} style={[styles.option, isPrivate === o.priv && styles.choiceOn]}>
              <MaterialCommunityIcons name={isPrivate === o.priv ? 'radiobox-marked' : 'radiobox-blank'} size={22} color={isPrivate === o.priv ? GOLD : '#7C9A8C'} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionTitle, isPrivate === o.priv && { color: GOLD }]}>{o.title}</Text>
                <Text style={styles.hint}>{o.note}</Text>
              </View>
            </TapPressable>
          ))}
        </View>

        {valid ? (
          <Text style={styles.hint}>
            You need {money(need)} in your wallet to sit here. Biggest bet {money(boot * (config?.maxStakeTimes ?? 16) * 2)}, pot limit {money(boot * (config?.potLimitTimes ?? 250))}.
            {isPrivate && seats > 2 ? '\nAs host you can start a friends\' table before all seats are taken.' : ''}
          </Text>
        ) : null}
        {short ? <Text style={[styles.hint, { color: '#FF9B9B' }]}>Your balance is {money(balance)} - add money or pick a smaller boot.</Text> : null}
        <ActionButton label="CREATE TABLE" tone="gold" height={54} disabled={!valid || short} onPress={() => onCreate(boot, seats, isPrivate)} flex={0} style={{ alignSelf: 'stretch', marginTop: 6 }} />
      </ScrollView>
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
  choiceSmall: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: '#3C5A4E', backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center' },
  bootRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: { width: 48, height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: GOLD, backgroundColor: 'rgba(242,196,90,0.1)', alignItems: 'center', justifyContent: 'center' },
  bootBox: { flex: 1, height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: GOLD, backgroundColor: 'rgba(0,0,0,0.35)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  rupee: { color: GOLD, fontSize: 24, fontWeight: '900' },
  bootInput: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', minWidth: 90, textAlign: 'center', paddingVertical: 0 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#3C5A4E', backgroundColor: 'rgba(255,255,255,0.05)' },
  optionTitle: { color: '#E8F1EC', fontSize: 14.5, fontWeight: '800' },
  choiceText: { color: '#C7D8CF', fontSize: 15, fontWeight: '800' },
  choiceTextOn: { color: GOLD },
  hint: { color: '#9DB3A8', fontSize: 12.5, lineHeight: 18 },
  codeInput: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', letterSpacing: 8, textAlign: 'center', borderWidth: 1.5, borderColor: GOLD, borderRadius: 14, paddingVertical: 12, backgroundColor: 'rgba(0,0,0,0.35)' },
});
