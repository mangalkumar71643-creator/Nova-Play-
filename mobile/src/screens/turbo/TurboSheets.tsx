import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { Image, Modal, ScrollView, StyleSheet, Switch, View, useWindowDimensions } from 'react-native';
import { Text } from '../../components/AppText';
import TapPressable from '../../components/TapPressable';
import { TurboSevensConfig, TurboSpinRow } from '../../api/backend';
import { withPopupSound, withTapSound } from '../../sound/ui';
import { NO_LIMIT, winLimit } from '../../utils/limits';
import { Img } from './TurboReel';

export const GOLD = '#FFC83A';
export const INK = '#FFF3DC';
export const money = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
            <MaterialCommunityIcons name="close" size={22} color={GOLD} />
          </TapPressable>
        </View>
        <View style={styles.chips}>
          {levels.map((b) => (
            <TapPressable key={b} onPress={() => onPick(b)} style={[styles.chip, b === bet && styles.chipOn]} accessibilityLabel={`Bet ${b}`}>
              <Text style={[styles.chipText, b === bet && { color: '#2A1600' }]}>₹{b.toLocaleString('en-IN')}</Text>
            </TapPressable>
          ))}
        </View>
      </TapPressable>
    </Scrim>
  );
}

export const AUTO_OPTIONS = [10, 25, 50, 100];

export function AutoSheet({ visible, onStart, onClose }: { visible: boolean; onStart: (n: number) => void; onClose: () => void }) {
  const { width: W } = useWindowDimensions();
  return (
    <Scrim visible={visible} onClose={onClose}>
      <TapPressable silent style={[styles.card, { width: Math.min(W - 40, 340) }]} onPress={() => {}}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>AUTO SPIN</Text>
          <TapPressable silent onPress={withPopupSound(onClose)} hitSlop={10} accessibilityLabel="Close">
            <MaterialCommunityIcons name="close" size={22} color={GOLD} />
          </TapPressable>
        </View>
        <View style={styles.chips}>
          {AUTO_OPTIONS.map((n) => (
            <TapPressable key={n} onPress={() => onStart(n)} style={styles.chip} accessibilityLabel={`Auto ${n}`}>
              <Text style={styles.chipText}>{n} spins</Text>
            </TapPressable>
          ))}
        </View>
        <Text style={styles.cardText}>Spins at your bet one after another. It stops when your balance cannot cover the bet, or when you press the auto button again.</Text>
      </TapPressable>
    </Scrim>
  );
}

type Tab = 'pays' | 'rules' | 'history';

export function InfoSheet({
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
  config: TurboSevensConfig | null;
  bet: number;
  history: TurboSpinRow[] | null;
  soundOn: boolean;
  onSound: (on: boolean) => void;
  onClose: () => void;
  images: Record<string, Img>;
}) {
  const { width: W, height: H } = useWindowDimensions();
  const tabs: [Tab, string][] = [['pays', 'PAYS'], ['rules', 'RULES'], ['history', 'HISTORY']];
  return (
    <Scrim visible={visible} onClose={onClose}>
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
    </Scrim>
  );
}

function PayRow({ icons, name, value, images }: { icons: string[]; name: string; value: string; images: Record<string, Img> }) {
  return (
    <View style={styles.payRow}>
      <View style={styles.payIcons}>
        {icons.map((s, i) => {
          const img = images[s];
          return img ? <Image key={i} source={img} style={styles.payImg} resizeMode="contain" fadeDuration={0} /> : null;
        })}
      </View>
      <Text style={styles.payName}>{name}</Text>
      <Text style={styles.payValue}>{value}</Text>
    </View>
  );
}

function Pays({ config, bet, images }: { config: TurboSevensConfig | null; bet: number; images: Record<string, Img> }) {
  const pays = config?.pays ?? { FLAME7: 200, RED7: 40, GOLD7: 20, GREEN2BAR: 8, BLUE1BAR: 4 };
  const any = config?.anyPays ?? { ANY7: 8, ANYBAR: 2, ANY: 0.8 };
  const v = (x: number) => `${x}× · ${money(x * bet)}`;
  return (
    <View>
      <Text style={styles.ruleHead}>Three of a kind on the line (your bet {money(bet)})</Text>
      <PayRow images={images} icons={['FLAME7', 'FLAME7', 'FLAME7']} name="Flaming 777" value={v(pays.FLAME7)} />
      <PayRow images={images} icons={['RED7', 'RED7', 'RED7']} name="Red 777" value={v(pays.RED7)} />
      <PayRow images={images} icons={['GOLD7', 'GOLD7', 'GOLD7']} name="Gold 777" value={v(pays.GOLD7)} />
      <PayRow images={images} icons={['GREEN2BAR', 'GREEN2BAR', 'GREEN2BAR']} name="Double BAR" value={v(pays.GREEN2BAR)} />
      <PayRow images={images} icons={['BLUE1BAR', 'BLUE1BAR', 'BLUE1BAR']} name="BAR" value={v(pays.BLUE1BAR)} />
      <Text style={styles.ruleHead}>Any mix</Text>
      <PayRow images={images} icons={['FLAME7', 'RED7', 'GOLD7']} name="Any three 7s" value={v(any.ANY7)} />
      <PayRow images={images} icons={['BLUE1BAR', 'GREEN2BAR', 'BLUE1BAR']} name="Any three BARs" value={v(any.ANYBAR)} />
      <PayRow images={images} icons={['FLAME7', 'BLUE1BAR', 'GREEN2BAR']} name="Any 7s and BARs" value={v(any.ANY)} />
      <Text style={styles.ruleHead}>Bonus reel</Text>
      <PayRow images={images} icons={['X2']} name="×2 on the line win" value="×2" />
      <PayRow images={images} icons={['X5']} name="×5 on the line win" value="×5" />
      <PayRow images={images} icons={['X10']} name="×10 on the line win" value="×10" />
      <PayRow images={images} icons={['CASH2']} name="Cash $+" value={v(config?.cashPays?.CASH2 ?? 2)} />
      <PayRow images={images} icons={['CASH20']} name="Cash $$+" value={v(config?.cashPays?.CASH20 ?? 20)} />
      <PayRow images={images} icons={['RESPIN']} name="Respin wheel" value="1 to 5 respins" />
    </View>
  );
}

function Rules({ config }: { config: TurboSevensConfig | null }) {
  return (
    <View>
      <Text style={styles.ruleHead}>The line</Text>
      <Text style={styles.ruleLine}>One payline runs across the middle row of the three reels. Three of a kind pays its price; three different 7s, three different BARs, or a mix of 7s and BARs pay the "any" prices. A blank on the line pays nothing. Wins are for the whole bet.</Text>
      <Text style={styles.ruleHead}>The bonus reel</Text>
      <Text style={styles.ruleLine}>The gold reel on the right spins with the others. ×2, ×5 and ×10 multiply the line's win (they do nothing when the line does not pay). $+ pays 2× and $$+ pays 20× your bet whether the line pays or not.</Text>
      <Text style={styles.ruleHead}>Respin</Text>
      <Text style={styles.ruleLine}>When the RESPIN diamond stops on the bonus reel, the wheel awards 1 to 5 respins. Every respin spins all four reels again, with the bonus reel still working, and its win is added to your spin. (A RESPIN diamond inside a respin counts as an empty stop.)</Text>
      <Text style={styles.ruleHead}>Game info</Text>
      <Text style={styles.ruleLine}>
        Return to player {config ? `${config.rtpPercent}%` : '90%'}. A spin pays something about once in {config ? Math.round(100 / config.hitRatePercent) : 3} spins; the RESPIN diamond comes about once in {config?.respinChanceOneIn ?? 33}. Most a bet can win: {winLimit(config?.maxPayout ?? NO_LIMIT)}.
      </Text>
      <Text style={styles.ruleLine}>Every spin is drawn from your provably-fair seeds (Settings → Provably Fair).</Text>
    </View>
  );
}

function History({ spins }: { spins: TurboSpinRow[] | null }) {
  if (spins === null) return <Text style={styles.ruleLine}>Loading…</Text>;
  if (spins.length === 0) return <Text style={styles.ruleLine}>No spins yet.</Text>;
  return (
    <View style={{ gap: 8 }}>
      {spins.map((s) => {
        const won = s.payout > 0;
        const net = Math.round((s.payout - s.stake) * 100) / 100;
        return (
          <View key={s.id} style={styles.histRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.histMain}>bet {money(s.stake)}</Text>
              <Text style={styles.histSub}>{new Date(s.createdAt).toLocaleString()}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.histPay, { color: won ? '#7DFFB0' : '#FF6B78' }]}>{won ? `+${money(s.payout)}` : `−${money(s.stake)}`}</Text>
              {won && net < 0 ? <Text style={styles.histNet}>net {net}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.74)', alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 18, backgroundColor: '#2A0A14', borderWidth: 1.5, borderColor: 'rgba(255,200,58,0.75)', padding: 16 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  cardTitle: { color: GOLD, fontWeight: '900', fontSize: 16, letterSpacing: 2 },
  cardText: { color: 'rgba(255,243,220,0.86)', fontSize: 13, lineHeight: 19, fontWeight: '600', marginTop: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minWidth: 76, flexGrow: 1, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,200,58,0.1)', borderWidth: 1, borderColor: 'rgba(255,200,58,0.5)' },
  chipOn: { backgroundColor: GOLD, borderColor: '#FFF3B0' },
  chipText: { color: INK, fontWeight: '900', fontSize: 14 },
  sheet: { borderRadius: 18, backgroundColor: '#230810', borderWidth: 1.5, borderColor: 'rgba(255,200,58,0.75)', overflow: 'hidden' },
  tabs: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 10, paddingTop: 12, gap: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,200,58,0.25)' },
  tab: { paddingHorizontal: 12, paddingVertical: 8, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  tabOn: { backgroundColor: 'rgba(255,200,58,0.12)', borderBottomWidth: 2, borderBottomColor: GOLD },
  tabText: { color: 'rgba(255,243,220,0.55)', fontWeight: '900', fontSize: 12, letterSpacing: 1.2 },
  soundRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  soundLabel: { flex: 1, color: INK, fontWeight: '700', fontSize: 13 },
  ruleHead: { color: GOLD, fontWeight: '900', fontSize: 13, letterSpacing: 1, marginTop: 14, marginBottom: 4 },
  ruleLine: { color: 'rgba(255,243,220,0.88)', fontSize: 12.5, lineHeight: 19, fontWeight: '600', marginTop: 5 },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  payIcons: { width: 108, flexDirection: 'row', alignItems: 'center' },
  payImg: { width: 34, height: 34 },
  payName: { flex: 1, color: INK, fontWeight: '800', fontSize: 12.5 },
  payValue: { color: GOLD, fontWeight: '900', fontSize: 12.5 },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,200,58,0.15)' },
  histMain: { color: INK, fontWeight: '800', fontSize: 13 },
  histSub: { color: 'rgba(255,243,220,0.5)', fontSize: 11, marginTop: 2 },
  histPay: { fontWeight: '900', fontSize: 14 },
  histNet: { color: 'rgba(255,243,220,0.5)', fontSize: 10 },
});
