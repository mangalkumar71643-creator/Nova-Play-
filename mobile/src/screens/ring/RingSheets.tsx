import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { Modal, ScrollView, StyleSheet, Switch, View, useWindowDimensions } from 'react-native';
import { Text } from '../../components/AppText';
import TapPressable from '../../components/TapPressable';
import { RingGauntletConfig, RingGauntletRound, RingKey, RingSegment } from '../../api/backend';
import { withPopupSound, withTapSound } from '../../sound/ui';
import { NO_LIMIT, winLimit } from '../../utils/limits';
import { RING_COLOR, RING_HINT, RING_NAME, RING_ORDER, SHAPE_OF } from './RingWheel';

export const PINK = '#FF4F93';
export const INK = '#EDEFF5';
export const MUTED = 'rgba(237,239,245,0.62)';
export const money = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${(n * 100).toFixed(n >= 0.1 ? 1 : 2)}%`;
const SHAPE_ICON: Record<'SQUARE' | 'TRIANGLE' | 'CIRCLE', 'square-outline' | 'triangle-outline' | 'circle-outline'> = { SQUARE: 'square-outline', TRIANGLE: 'triangle-outline', CIRCLE: 'circle-outline' };

export function ShapeIcon({ ring, size = 18 }: { ring: RingKey; size?: number }) {
  return <MaterialCommunityIcons name={SHAPE_ICON[SHAPE_OF[ring]]} size={size} color={RING_COLOR[ring].main} />;
}

function Scrim({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <TapPressable silent style={styles.scrim} onPress={onClose}>
        {children}
      </TapPressable>
    </Modal>
  );
}

export function BetSheet({ visible, levels, bet, onPick, onClose }: { visible: boolean; levels: number[]; bet: number; onPick: (b: number) => void; onClose: () => void }) {
  const { width: W } = useWindowDimensions();
  return (
    <Scrim visible={visible} onClose={onClose}>
      <TapPressable silent style={[styles.card, { width: Math.min(W - 40, 360) }]} onPress={() => {}}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>BET</Text>
          <TapPressable silent onPress={withPopupSound(onClose)} hitSlop={10} accessibilityLabel="Close">
            <MaterialCommunityIcons name="close" size={22} color={PINK} />
          </TapPressable>
        </View>
        <View style={styles.chips}>
          {levels.map((b) => (
            <TapPressable key={b} onPress={() => onPick(b)} style={[styles.chip, b === bet && styles.chipOn]} accessibilityLabel={`Bet ${b}`}>
              <Text style={[styles.chipText, b === bet && { color: '#2A0A18' }]}>₹{b.toLocaleString('en-IN')}</Text>
            </TapPressable>
          ))}
        </View>
      </TapPressable>
    </Scrim>
  );
}

export const AUTO_ROUNDS = [10, 25, 50, 100];

export function AutoSheet({
  visible,
  ring,
  steps,
  rounds,
  target,
  onRounds,
  onTarget,
  onStart,
  onClose,
}: {
  visible: boolean;
  ring: RingKey;
  steps: RingSegment[];
  rounds: number;
  target: number;
  onRounds: (n: number) => void;
  onTarget: (n: number) => void;
  onStart: () => void;
  onClose: () => void;
}) {
  const { width: W } = useWindowDimensions();
  const seg = steps[Math.max(0, Math.min(steps.length - 1, target - 1))];
  const col = RING_COLOR[ring];
  return (
    <Scrim visible={visible} onClose={onClose}>
      <TapPressable silent style={[styles.card, { width: Math.min(W - 40, 360) }]} onPress={() => {}}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>AUTOPLAY</Text>
          <TapPressable silent onPress={withPopupSound(onClose)} hitSlop={10} accessibilityLabel="Close">
            <MaterialCommunityIcons name="close" size={22} color={PINK} />
          </TapPressable>
        </View>
        <Text style={styles.label}>ROUNDS</Text>
        <View style={styles.chips}>
          {AUTO_ROUNDS.map((n) => (
            <TapPressable key={n} onPress={() => onRounds(n)} style={[styles.chip, n === rounds && styles.chipOn]} accessibilityLabel={`${n} rounds`}>
              <Text style={[styles.chipText, n === rounds && { color: '#2A0A18' }]}>{n}</Text>
            </TapPressable>
          ))}
        </View>
        <View style={styles.ringLine}>
          <ShapeIcon ring={ring} />
          <Text style={styles.label}>CASH OUT AT SEGMENT ({RING_NAME[ring].toUpperCase()})</Text>
        </View>
        <View style={styles.chips}>
          {steps.map((s) => (
            <TapPressable key={s.step} onPress={() => onTarget(s.step)} style={[styles.chip, s.step === target && { backgroundColor: col.main, borderColor: col.light }]} accessibilityLabel={`Segment ${s.step}, ${s.label}`}>
              <Text style={[styles.chipText, s.step === target && { color: col.ink }]}>{s.label}</Text>
            </TapPressable>
          ))}
        </View>
        <Text style={styles.cardText}>
          Every round climbs to {seg?.label ?? ''} and cashes out there{seg && seg.kind !== 'x' ? ' (the last segment pays at once)' : ''}. A round gets there {pct(seg?.reach ?? 0)} of the time. Autoplay stops when your balance cannot cover the bet, or when you press the button.
        </Text>
        <TapPressable onPress={withTapSound(onStart)} style={styles.confirm} accessibilityRole="button" accessibilityLabel="Start autoplay">
          <Text style={styles.confirmText}>START · {rounds} ROUNDS</Text>
        </TapPressable>
      </TapPressable>
    </Scrim>
  );
}

type Tab = 'rules' | 'odds' | 'history';

export function InfoSheet({
  visible,
  tab,
  onTab,
  config,
  history,
  soundOn,
  onSound,
  onClose,
}: {
  visible: boolean;
  tab: Tab;
  onTab: (t: Tab) => void;
  config: RingGauntletConfig | null;
  history: RingGauntletRound[] | null;
  soundOn: boolean;
  onSound: (on: boolean) => void;
  onClose: () => void;
}) {
  const { width: W, height: H } = useWindowDimensions();
  const tabs: [Tab, string][] = [['rules', 'HOW TO PLAY'], ['odds', 'ODDS'], ['history', 'MY ROUNDS']];
  return (
    <Scrim visible={visible} onClose={onClose}>
      <TapPressable silent style={[styles.sheet, { width: Math.min(W - 24, 440), maxHeight: H * 0.86 }]} onPress={() => {}}>
        <View style={styles.tabs}>
          {tabs.map(([id, text]) => (
            <TapPressable key={id} onPress={() => onTab(id)} style={[styles.tab, tab === id && styles.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: tab === id }}>
              <Text style={[styles.tabText, tab === id && { color: PINK }]}>{text}</Text>
            </TapPressable>
          ))}
          <View style={{ flex: 1 }} />
          <TapPressable silent onPress={withPopupSound(onClose)} hitSlop={10} accessibilityLabel="Close" style={{ paddingHorizontal: 6, paddingBottom: 6 }}>
            <MaterialCommunityIcons name="close" size={22} color={PINK} />
          </TapPressable>
        </View>
        <View style={styles.soundRow}>
          <MaterialCommunityIcons name={soundOn ? 'volume-high' : 'volume-off'} size={18} color={PINK} />
          <Text style={styles.soundLabel}>Game sounds</Text>
          <Switch value={soundOn} onValueChange={withTapSound(onSound)} trackColor={{ false: '#3a3b44', true: '#8c2c55' }} thumbColor={soundOn ? PINK : '#b9bbc6'} accessibilityLabel="Game sounds" />
        </View>
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ padding: 14, paddingBottom: 20 }}>
          {tab === 'history' ? <History rounds={history} /> : tab === 'odds' ? <Odds config={config} /> : <Rules config={config} />}
        </ScrollView>
      </TapPressable>
    </Scrim>
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;
/** "a, b, c or d" */
const orList = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`);

/** What the last segment of each ring does, from the game's own table (the numbers are the server's, never written here). */
function lastSegmentText(config: RingGauntletConfig | null): string {
  const head = 'The last segment of a ring ends the round with a win as soon as you survive it.';
  if (!config) return head;
  const plus: string[] = [];
  for (const k of ['INNER', 'MIDDLE'] as RingKey[]) {
    const steps = config.rings.find((r) => r.ring === k)?.steps ?? [];
    const last = steps[steps.length - 1];
    const before = steps[steps.length - 2];
    if (last?.kind === 'plus' && before) {
      plus.push(`on the ${RING_NAME[k].toLowerCase()} "${last.label}" adds ${round2(last.multiplier - before.multiplier)} to the ${before.label} before it (${round2(last.multiplier)}X)`);
    }
  }
  let text = head;
  if (plus.length) text += ` ${plus.join(', ').replace(/^on/, 'On')}.`;
  const outer = config.rings.find((r) => r.ring === 'OUTER');
  const lastPlain = outer ? outer.steps[outer.steps.length - 2] : undefined;
  if (outer?.wheel.length && lastPlain) {
    const adds = outer.wheel.map((w) => `+${w.add}`);
    const totals = outer.wheel.map((w) => `${round2(lastPlain.multiplier + w.add)}X`);
    text += ` On the outer ring BONUS spins a wheel that adds ${orList(adds)} to the ${lastPlain.label} (${orList(totals)}).`;
  }
  return text;
}

function Rules({ config }: { config: RingGauntletConfig | null }) {
  const rtp = Math.round((config?.rtp ?? 0.9) * 100);
  const parts = config?.maxPartCashouts ?? 3;
  return (
    <View>
      <Text style={styles.ruleHead}>Climb the ring</Text>
      <Text style={styles.ruleLine}>1.  Pick a ring by tapping its badge at the top of the wheel: the square is the outer ring (the biggest numbers, the hardest climb), the triangle the middle ring, the circle the inner ring (the smallest numbers, the easiest climb).</Text>
      <Text style={styles.ruleLine}>2.  Set your bet and press PLAY. The bet is placed and the first segment of the ring is tried at once.</Text>
      <Text style={styles.ruleLine}>3.  Every segment you survive lights up and raises your cash-out value to the number on it. Press PLAY again to try the next segment; fail one and the round is lost.</Text>
      <Text style={styles.ruleLine}>4.  Press CASHOUT whenever you like to take the value shown. PART CASHOUT takes half of what you have now (up to {parts} times a round) and keeps the other half climbing.</Text>
      <Text style={styles.ruleHead}>The last segment</Text>
      <Text style={styles.ruleLine}>{lastSegmentText(config)}</Text>
      <Text style={styles.ruleHead}>Autoplay</Text>
      <Text style={styles.ruleLine}>Hold the PLAY button to set up autoplay: your bet is played on the ring you picked for the number of rounds you choose, each round climbing to the segment you choose and cashing out there.</Text>
      <Text style={styles.ruleHead}>Fair play</Text>
      <Text style={styles.ruleLine}>Whichever ring you pick and wherever you cash out, a bet returns {rtp}% of the stake on average (the house keeps {100 - rtp}%). Every segment is drawn from your own provably-fair seeds (Settings → Provably Fair). Most a bet can win: {winLimit(config?.maxPayout ?? NO_LIMIT)}.</Text>
    </View>
  );
}

function Odds({ config }: { config: RingGauntletConfig | null }) {
  if (!config) return <Text style={styles.ruleLine}>Loading…</Text>;
  return (
    <View>
      <Text style={styles.ruleLine}>Chance of getting to each segment from the start. A cash-out there pays the number shown, so every row returns {Math.round(config.rtp * 100)}%.</Text>
      {RING_ORDER.map((k) => {
        const ring = config.rings.find((r) => r.ring === k);
        if (!ring) return null;
        return (
          <View key={k} style={{ marginTop: 14 }}>
            <View style={styles.ringLine}>
              <ShapeIcon ring={k} size={20} />
              <Text style={[styles.ruleHead, { marginTop: 0, color: RING_COLOR[k].main }]}>
                {RING_NAME[k].toUpperCase()} <Text style={styles.hint}>· {RING_HINT[k]}</Text>
              </Text>
            </View>
            {ring.steps.map((s) => (
              <View key={s.step} style={styles.oddsRow}>
                <Text style={styles.oddsStep}>{s.step}</Text>
                <Text style={styles.oddsLabel}>{s.label}</Text>
                <Text style={styles.oddsPays}>{s.kind === 'x' ? `${s.multiplier}×` : s.kind === 'plus' ? `${s.multiplier}×` : `avg ${s.multiplier}×`}</Text>
                <Text style={styles.oddsChance}>{pct(s.reach)}</Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

function History({ rounds }: { rounds: RingGauntletRound[] | null }) {
  if (rounds === null) return <Text style={styles.ruleLine}>Loading…</Text>;
  if (rounds.length === 0) return <Text style={styles.ruleLine}>No rounds yet.</Text>;
  return (
    <View style={{ gap: 8 }}>
      {rounds.map((r) => {
        const won = r.payout > 0;
        const net = Math.round((r.payout - r.stake) * 100) / 100;
        return (
          <View key={r.id} style={styles.histRow}>
            <ShapeIcon ring={r.ring} size={22} />
            <View style={{ flex: 1 }}>
              <Text style={styles.histMain}>
                {r.status === 'LOST' ? `Out on segment ${r.currentStep + 1}` : r.currentStep >= r.steps ? 'Reached the last segment' : `Cashed out at segment ${r.currentStep}`}
                {r.auto ? ' · auto' : ''}
              </Text>
              <Text style={styles.histSub}>
                bet {money(r.stake)} · {new Date(r.createdAt).toLocaleString()}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.histPay, { color: won ? '#7DFFB0' : '#FF6B78' }]}>{won ? `+${money(r.payout)}` : '−' + money(r.stake)}</Text>
              {won && net < 0 ? <Text style={styles.histNet}>net {net}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 18, backgroundColor: '#17181e', borderWidth: 1.5, borderColor: 'rgba(255,79,147,0.7)', padding: 16 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  cardTitle: { color: PINK, fontWeight: '900', fontSize: 16, letterSpacing: 2 },
  cardText: { color: 'rgba(237,239,245,0.8)', fontSize: 12.5, lineHeight: 19, fontWeight: '600', marginTop: 12 },
  label: { color: MUTED, fontWeight: '800', fontSize: 11, letterSpacing: 1.2, marginBottom: 8, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: { minWidth: 70, flexGrow: 1, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  chipOn: { backgroundColor: PINK, borderColor: '#FFC2DA' },
  chipText: { color: INK, fontWeight: '900', fontSize: 14 },
  ringLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  confirm: { marginTop: 14, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#17C653', borderWidth: 2, borderColor: '#B8FFCF' },
  confirmText: { color: '#032B12', fontWeight: '900', fontSize: 15, letterSpacing: 1.5 },
  sheet: { borderRadius: 18, backgroundColor: '#14151a', borderWidth: 1.5, borderColor: 'rgba(255,79,147,0.7)', overflow: 'hidden' },
  tabs: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 10, paddingTop: 12, gap: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(255,79,147,0.28)' },
  tab: { paddingHorizontal: 10, paddingVertical: 8, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  tabOn: { backgroundColor: 'rgba(255,79,147,0.12)', borderBottomWidth: 2, borderBottomColor: PINK },
  tabText: { color: 'rgba(237,239,245,0.55)', fontWeight: '900', fontSize: 11.5, letterSpacing: 1 },
  soundRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  soundLabel: { flex: 1, color: INK, fontWeight: '700', fontSize: 13 },
  ruleHead: { color: PINK, fontWeight: '900', fontSize: 13, letterSpacing: 1, marginTop: 14, marginBottom: 4 },
  ruleLine: { color: 'rgba(237,239,245,0.86)', fontSize: 12.5, lineHeight: 19, fontWeight: '600', marginTop: 5 },
  hint: { color: MUTED, fontWeight: '700', letterSpacing: 0.4, fontSize: 11 },
  oddsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  oddsStep: { width: 22, color: MUTED, fontWeight: '800', fontSize: 12 },
  oddsLabel: { flex: 1, color: INK, fontWeight: '900', fontSize: 13.5 },
  oddsPays: { width: 78, color: 'rgba(237,239,245,0.75)', fontWeight: '700', fontSize: 12, textAlign: 'right' },
  oddsChance: { width: 64, color: '#FFD76A', fontWeight: '900', fontSize: 12.5, textAlign: 'right' },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  histMain: { color: INK, fontWeight: '800', fontSize: 13 },
  histSub: { color: 'rgba(237,239,245,0.5)', fontSize: 11, marginTop: 2 },
  histPay: { fontWeight: '900', fontSize: 14 },
  histNet: { color: 'rgba(237,239,245,0.5)', fontSize: 10 },
});
