import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { Image, Modal, ScrollView, StyleSheet, Switch, View, useWindowDimensions } from 'react-native';
import { Text } from '../../components/AppText';
import TapPressable from '../../components/TapPressable';
import { GarudaGoldConfig, GarudaSpinRow } from '../../api/backend';
import { withPopupSound, withTapSound } from '../../sound/ui';
import { NO_LIMIT, winLimit } from '../../utils/limits';
import { GOLD, INK, money } from '../turbo/TurboSheets';
import { Img } from './GarudaReel';

/* The info sheet of Garuda Gold: the paytable (at the player's bet), the rules and the player's last spins. */

type Tab = 'pays' | 'rules' | 'history';

export function GarudaInfoSheet({
  visible,
  tab,
  onTab,
  config,
  bet,
  history,
  soundOn,
  onSound,
  onClose,
  images,
}: {
  visible: boolean;
  tab: Tab;
  onTab: (t: Tab) => void;
  config: GarudaGoldConfig | null;
  bet: number;
  history: GarudaSpinRow[] | null;
  soundOn: boolean;
  onSound: (on: boolean) => void;
  onClose: () => void;
  images: Record<string, Img>;
}) {
  const { width: W, height: H } = useWindowDimensions();
  const tabs: [Tab, string][] = [['pays', 'PAYS'], ['rules', 'RULES'], ['history', 'HISTORY']];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <TapPressable silent style={styles.scrim} onPress={onClose}>
        <TapPressable silent style={[styles.sheet, { width: Math.min(W - 24, 440), maxHeight: H * 0.86 }]} onPress={() => {}}>
          <View style={styles.tabs}>
            {tabs.map(([id, text]) => (
              <TapPressable key={id} onPress={() => onTab(id)} style={[styles.tab, tab === id && styles.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: tab === id }}>
                <Text style={[styles.tabText, tab === id && { color: GOLD }]}>{text}</Text>
              </TapPressable>
            ))}
            <View style={{ flex: 1 }} />
            <TapPressable silent onPress={withPopupSound(onClose)} hitSlop={10} accessibilityLabel="Close" style={{ paddingHorizontal: 6, paddingBottom: 6 }}>
              <MaterialCommunityIcons name="close" size={22} color={GOLD} />
            </TapPressable>
          </View>
          <View style={styles.soundRow}>
            <MaterialCommunityIcons name={soundOn ? 'volume-high' : 'volume-off'} size={18} color={GOLD} />
            <Text style={styles.soundLabel}>Game sounds</Text>
            <Switch value={soundOn} onValueChange={withTapSound(onSound)} trackColor={{ false: '#3E3A33', true: '#8A6A1E' }} thumbColor={soundOn ? GOLD : '#BDB5A5'} accessibilityLabel="Game sounds" />
          </View>
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ padding: 14, paddingBottom: 20 }}>
            {tab === 'history' ? <History spins={history} /> : tab === 'rules' ? <Rules config={config} /> : <Pays config={config} bet={bet} images={images} />}
          </ScrollView>
        </TapPressable>
      </TapPressable>
    </Modal>
  );
}

function PayRow({ icons, name, value, images, coin }: { icons: string[]; name: string; value: string; images: Record<string, Img>; coin?: boolean }) {
  return (
    <View style={styles.payRow}>
      <View style={styles.payIcons}>
        {icons.map((s, i) => {
          const img = images[s];
          return img ? <Image key={i} source={img} style={coin ? styles.coinImg : styles.payImg} resizeMode="contain" fadeDuration={0} /> : null;
        })}
      </View>
      <Text style={styles.payName}>{name}</Text>
      <Text style={styles.payValue}>{value}</Text>
    </View>
  );
}

const NAMES: Record<string, string> = { WILD: 'Garuda WILD', RUBY: 'Ruby', SAPPHIRE: 'Sapphire', EMERALD: 'Emerald', A: 'A', K: 'K', Q: 'Q', J: 'J' };

function Pays({ config, bet, images }: { config: GarudaGoldConfig | null; bet: number; images: Record<string, Img> }) {
  const pays = config?.pays ?? { WILD: 25, RUBY: 10, SAPPHIRE: 5, EMERALD: 3, A: 1, K: 0.8, Q: 0.5, J: 0.3 };
  const v = (x: number) => `${x}× · ${money(Math.floor(x * bet * 100 + 1e-9) / 100)}`;
  const order = ['WILD', 'RUBY', 'SAPPHIRE', 'EMERALD', 'A', 'K', 'Q', 'J'] as const;
  return (
    <View>
      <Text style={styles.ruleHead}>Three of a kind on a line (your bet {money(bet)})</Text>
      {order.map((s) => (
        <PayRow key={s} images={images} icons={[s, s, s]} name={NAMES[s]} value={v(pays[s])} />
      ))}
      <Text style={styles.ruleLine}>The WILD stands in for every symbol. The wins of all five lines add up, and the multiplier reel multiplies them.</Text>
      <Text style={styles.ruleHead}>Multiplier reel</Text>
      <PayRow images={images} coin icons={['X1', 'X2', 'X3', 'X5', 'X10']} name="1× to 10×" value="× the line wins" />
      <PayRow images={images} coin icons={['X15', 'X20', 'X25', 'X50', 'X100']} name="15× to 100×" value="× the line wins" />
      <PayRow images={images} coin icons={['NUDGE']} name="NUDGE: the reel nudges up" value="10× to 500×" />
    </View>
  );
}

function Rules({ config }: { config: GarudaGoldConfig | null }) {
  const exCost = config?.exCost ?? 1.5;
  return (
    <View>
      <Text style={styles.ruleHead}>The lines</Text>
      <Text style={styles.ruleLine}>Five fixed lines: the three rows and the two diagonals. Three of a kind on a line, from the first reel to the third, pays its price; the Garuda WILD stands in for every symbol, and three WILDs pay 25×. All wins are for the whole bet and the wins of all lines add up.</Text>
      <Text style={styles.ruleHead}>The multiplier reel</Text>
      <Text style={styles.ruleLine}>The red reel on the right spins with the others. The coin in its gold window multiplies the spin's line wins: 1× to 100×. It does nothing on a spin without a line win.</Text>
      <Text style={styles.ruleHead}>NUDGE</Text>
      <Text style={styles.ruleLine}>When a NUDGE coin stops in the gold window on a winning spin, the NUDGE lamp lights and the reel nudges on to a big multiplier: 10×, 15×, 20×, 25×, 50×, 100× or 500×.</Text>
      <Text style={styles.ruleHead}>EX</Text>
      <Text style={styles.ruleLine}>With EX switched on a spin costs {exCost}× your bet (₹10 becomes ₹15) and the multiplier reel changes: no 1× coin, almost twice as many NUDGE coins, and nudges that reach the big multipliers more often. Wins are still counted on your bet.</Text>
      <Text style={styles.ruleHead}>Game info</Text>
      <Text style={styles.ruleLine}>
        Return to player {config ? `${config.rtpPercent}%` : '90%'} ({config ? `${config.exRtpPercent}%` : '90%'} with EX). A spin wins about once in {config ? Math.round(100 / config.hitRatePercent) : 3}. A NUDGE comes about once in {config?.nudgeChanceOneIn.normal ?? 83} spins ({config?.nudgeChanceOneIn.ex ?? 48} with EX). The most a spin can win is {config?.maxWinStakes ?? 20400}× the bet; most a bet can win here: {winLimit(config?.maxPayout ?? NO_LIMIT)}.
      </Text>
      <Text style={styles.ruleLine}>Every spin is drawn from your provably-fair seeds (Settings → Provably Fair).</Text>
    </View>
  );
}

function History({ spins }: { spins: GarudaSpinRow[] | null }) {
  if (spins === null) return <Text style={styles.ruleLine}>Loading…</Text>;
  if (spins.length === 0) return <Text style={styles.ruleLine}>No spins yet.</Text>;
  return (
    <View style={{ gap: 8 }}>
      {spins.map((s) => {
        const won = s.payout > 0;
        return (
          <View key={s.id} style={styles.histRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.histMain}>
                bet {money(s.stake)}
                {s.extraBet ? ` · EX ${money(s.cost)}` : ''}
                {won && s.multiplier > 1 ? ` · ×${s.multiplier}` : ''}
              </Text>
              <Text style={styles.histSub}>{new Date(s.createdAt).toLocaleString()}</Text>
            </View>
            <Text style={[styles.histPay, { color: won ? '#7DFFB0' : '#FF6B78' }]}>{won ? `+${money(s.payout)}` : `−${money(s.cost)}`}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.74)', alignItems: 'center', justifyContent: 'center' },
  sheet: { borderRadius: 18, backgroundColor: '#1E0E06', borderWidth: 1.5, borderColor: 'rgba(255,200,58,0.75)', overflow: 'hidden' },
  tabs: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 10, paddingTop: 12, gap: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,200,58,0.25)' },
  tab: { paddingHorizontal: 12, paddingVertical: 8, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  tabOn: { backgroundColor: 'rgba(255,200,58,0.12)', borderBottomWidth: 2, borderBottomColor: GOLD },
  tabText: { color: 'rgba(255,243,220,0.55)', fontWeight: '900', fontSize: 12, letterSpacing: 1.2 },
  soundRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  soundLabel: { flex: 1, color: INK, fontWeight: '700', fontSize: 13 },
  ruleHead: { color: GOLD, fontWeight: '900', fontSize: 13, letterSpacing: 1, marginTop: 14, marginBottom: 4 },
  ruleLine: { color: 'rgba(255,243,220,0.88)', fontSize: 12.5, lineHeight: 19, fontWeight: '600', marginTop: 5 },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  payIcons: { width: 124, flexDirection: 'row', alignItems: 'center' },
  payImg: { width: 40, height: 31 },
  coinImg: { width: 24, height: 24 },
  payName: { flex: 1, color: INK, fontWeight: '800', fontSize: 12.5 },
  payValue: { color: GOLD, fontWeight: '900', fontSize: 12.5 },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,200,58,0.15)' },
  histMain: { color: INK, fontWeight: '800', fontSize: 13 },
  histSub: { color: 'rgba(255,243,220,0.5)', fontSize: 11, marginTop: 2 },
  histPay: { fontWeight: '900', fontSize: 14 },
});
