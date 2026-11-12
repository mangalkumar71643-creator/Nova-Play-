import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, ImageBackground, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient as SvgGradient, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { fetchRanking, Ranking, RankingPeriod } from '../api/backend';
import { AVATARS } from '../data/avatars';
import { useAuth } from '../state/AuthContext';
import { colors, fonts, gradients, tabBar } from '../theme';

const PERIODS: { id: RankingPeriod; tab: string; caption: string; empty: string }[] = [
  { id: 'day', tab: 'Day Rank', caption: 'Won by all players today', empty: 'No winners yet today.' },
  { id: 'week', tab: 'Week Rank', caption: 'Won by all players this week', empty: 'No winners yet this week.' },
  { id: 'month', tab: 'Month Rank', caption: 'Won by all players this month', empty: 'No winners yet this month.' },
];

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** When the day, the week (Monday) or the month ends, India time: the lists start again then. */
function periodEnd(period: RankingPeriod, now: number) {
  const ist = new Date(now + IST_OFFSET_MS); // its UTC fields are the India date
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const d = ist.getUTCDate();
  const istMidnight = (yy: number, mm: number, dd: number) => Date.UTC(yy, mm, dd) - IST_OFFSET_MS;
  if (period === 'day') return istMidnight(y, m, d + 1);
  if (period === 'week') return istMidnight(y, m, d - ((ist.getUTCDay() + 6) % 7) + 7);
  return istMidnight(y, m + 1, 1);
}

const two = (n: number) => String(n).padStart(2, '0');

/** "14:38:33" inside the last day, "3d 14:38" before that. */
function formatLeft(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const min = Math.floor((s % 3600) / 60);
  return days > 0 ? `${days}d ${two(h)}:${two(min)}` : `${two(h)}:${two(min)}:${two(s % 60)}`;
}

/** Time left in a period, ticking each second while the screen is shown. */
function Countdown({ period, active }: { period: RankingPeriod; active: boolean }) {
  const focused = useIsFocused();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!focused) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [focused]);
  return (
    <View style={styles.countdown}>
      <MaterialCommunityIcons name="clock-outline" size={11} color={active ? '#FFB36B' : '#B98A7A'} />
      <Text style={[styles.countdownText, active && styles.countdownTextOn]}>{formatLeft(periodEnd(period, now) - now)}</Text>
    </View>
  );
}

function money(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: n >= 1000 ? 0 : 2 })}`;
}

/** "TOP WINNERS" in gold, over its own dark shadow. */
function Title({ width }: { width: number }) {
  const common = { x: width / 2, textAnchor: 'middle' as const, fontFamily: fonts.black, fontSize: 34, letterSpacing: 2 };
  return (
    <Svg width={width} height={48}>
      <Defs>
        <SvgGradient id="rankTitle" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFF6CF" />
          <Stop offset="0.45" stopColor="#FFD766" />
          <Stop offset="1" stopColor="#E08A12" />
        </SvgGradient>
      </Defs>
      <SvgText {...common} y={39} fill="#3A0A00" opacity={0.85}>
        TOP WINNERS
      </SvgText>
      <SvgText {...common} y={36} fill="url(#rankTitle)">
        TOP WINNERS
      </SvgText>
    </Svg>
  );
}

const COUNTER_CELLS = 8;

/** The period's total winnings as a row of number wheels on a red and gold plate. */
function Counter({ amount }: { amount: number }) {
  const digits = String(Math.max(0, Math.floor(amount))).padStart(COUNTER_CELLS, '0');
  const firstReal = digits.search(/[1-9]/);
  return (
    <LinearGradient colors={['#FFF0B8', '#F0B93D', '#8A5A0E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.counterEdge}>
      <LinearGradient colors={['#E0283F', '#B3152A', '#7A0E1C']} style={styles.counterPlate}>
        <Text style={styles.counterRupee}>₹</Text>
        {digits.split('').map((ch, i) => (
          <LinearGradient key={i} colors={['#2A050A', '#5A0F19', '#2A050A']} style={styles.counterCell}>
            <Text style={[styles.counterDigit, (firstReal < 0 || i < firstReal) && styles.counterDigitDim]}>{ch}</Text>
          </LinearGradient>
        ))}
      </LinearGradient>
    </LinearGradient>
  );
}

type Row = Ranking['top'][number];

const METALS = [
  { ring: gradients.rankGold, block: ['#FFF1BD', '#F3C24B', '#C8922C', '#8A5E12'] as const, ink: '#3A2204', crown: '#FFD766', avatar: 82, height: 104 },
  { ring: gradients.rankSilver, block: ['#F4F7FC', '#B9C4D6', '#8491A6', '#566176'] as const, ink: '#1B2433', crown: '#D8E0EC', avatar: 64, height: 86 },
  { ring: gradients.rankBronze, block: ['#FAD7B0', '#D48B4C', '#A8622C', '#74401A'] as const, ink: '#3A1C08', crown: '#E7A066', avatar: 64, height: 74 },
];

/** One of the first three places: a crown, the player's picture in a metal ring, and a block with the name and the amount. */
function PodiumPlace({ place, row, myAvatar }: { place: 1 | 2 | 3; row?: Row; myAvatar: number }) {
  const metal = METALS[place - 1];
  const ring = metal.avatar + 8;
  return (
    <View style={[styles.place, place === 1 && styles.placeFirst]}>
      <MaterialCommunityIcons name="crown" size={place === 1 ? 30 : 22} color={metal.crown} style={styles.crown} />
      <LinearGradient colors={metal.ring} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ width: ring, height: ring, borderRadius: ring / 2, alignItems: 'center', justifyContent: 'center' }}>
        {row ? (
          <Image source={row.isMe ? AVATARS[myAvatar - 1] : AVATARS[(row.rank - 1) % AVATARS.length]} style={{ width: metal.avatar, height: metal.avatar, borderRadius: metal.avatar / 2 }} />
        ) : (
          <View style={{ width: metal.avatar, height: metal.avatar, borderRadius: metal.avatar / 2, backgroundColor: '#2A0A0F', alignItems: 'center', justifyContent: 'center' }}>
            <MaterialCommunityIcons name="account" size={metal.avatar * 0.6} color="#6E4A50" />
          </View>
        )}
      </LinearGradient>
      <LinearGradient colors={metal.ring} style={styles.placeNumber}>
        <Text style={[styles.placeNumberText, { color: metal.ink }]}>{place}</Text>
      </LinearGradient>
      <LinearGradient colors={metal.block} style={[styles.block, { height: metal.height }]}>
        <View style={styles.blockShine} pointerEvents="none" />
        <View style={styles.blockName}>
          <Text style={styles.blockNameText} numberOfLines={1}>
            {row ? (row.isMe ? 'You' : row.name) : '—'}
          </Text>
        </View>
        <Text style={[styles.blockWon, { color: metal.ink }, place === 1 && styles.blockWonFirst]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {row ? money(row.won) : '—'}
        </Text>
        {place === 1 && row ? <Text style={[styles.blockTag, { color: metal.ink }]}>CHAMPION</Text> : null}
      </LinearGradient>
    </View>
  );
}

/** The top three on a lit stage: second, first, third. */
function Podium({ top, width, myAvatar }: { top: Row[]; width: number; myAvatar: number }) {
  return (
    <View style={styles.podium}>
      <Svg width={width} height={250} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="rankStage" cx="50%" cy="42%" rx="52%" ry="55%">
            <Stop offset="0" stopColor="#FFB23E" stopOpacity="0.5" />
            <Stop offset="0.5" stopColor="#FF3B4F" stopOpacity="0.2" />
            <Stop offset="1" stopColor="#FF3B4F" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={250} fill="url(#rankStage)" />
      </Svg>
      <View style={styles.podiumRow}>
        <PodiumPlace place={2} row={top[1]} myAvatar={myAvatar} />
        <PodiumPlace place={1} row={top[0]} myAvatar={myAvatar} />
        <PodiumPlace place={3} row={top[2]} myAvatar={myAvatar} />
      </View>
      <LinearGradient colors={['#B41D31', '#5E0D18', '#2A070C']} style={styles.stage}>
        <LinearGradient colors={['rgba(255,233,168,0)', 'rgba(255,233,168,0.95)', 'rgba(255,233,168,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.stageEdge} />
      </LinearGradient>
    </View>
  );
}

/**
 * Players ranked by what they won in games today, this week and this month (India time): the period's total,
 * the first three on a stage, the rest in a list, and the player's own place pinned at the bottom.
 */
export default function RankingScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { avatarId } = useAuth();
  const [period, setPeriod] = useState<RankingPeriod>('day');
  const [lists, setLists] = useState<Partial<Record<RankingPeriod, Ranking>>>({});
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (p: RankingPeriod) => {
    setFailed(false);
    try {
      const r = await fetchRanking(p);
      setLists((prev) => ({ ...prev, [p]: r }));
    } catch {
      setFailed(true);
    }
  }, []);

  // Fresh each time the tab is opened and when the period is changed.
  useFocusEffect(
    useCallback(() => {
      load(period);
    }, [load, period])
  );

  const ranking = lists[period];
  const info = PERIODS.find((p) => p.id === period)!;
  const top = ranking?.top ?? [];
  const rest = top.slice(3);

  return (
    <ImageBackground source={require('../../assets/home-background.webp')} style={styles.fill} resizeMode="cover">
      {/* Period tabs, each with the time left until its list starts again. */}
      <LinearGradient colors={['#1C0609', '#2A090E']} style={[styles.tabs, { paddingTop: insets.top }]}>
        {PERIODS.map((p) => {
          const on = p.id === period;
          return (
            <Pressable key={p.id} onPress={() => setPeriod(p.id)} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={p.tab}>
              {on ? <LinearGradient colors={['#8A1626', '#4A0C16']} style={StyleSheet.absoluteFill} /> : null}
              <Text style={[styles.tabText, on && styles.tabTextOn]}>{p.tab}</Text>
              <Countdown period={p.id} active={on} />
              {on ? <LinearGradient colors={['#FFE9A8', '#F0B93D']} style={styles.tabLine} /> : null}
            </Pressable>
          );
        })}
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load(period);
              setRefreshing(false);
            }}
            colors={[colors.gold]}
            tintColor={colors.gold}
            progressBackgroundColor={colors.surface}
          />
        }
      >
        <View style={styles.hero}>
          <Title width={width} />
          <Counter amount={ranking?.totalWon ?? 0} />
          <Text style={styles.caption}>{info.caption}</Text>
        </View>

        {!ranking ? (
          <View style={styles.wait}>
            {failed ? (
              <>
                <Text style={styles.emptyTitle}>Could not load the ranking.</Text>
                <Pressable onPress={() => load(period)} style={styles.retry}>
                  <Text style={styles.retryText}>TRY AGAIN</Text>
                </Pressable>
              </>
            ) : (
              <ActivityIndicator color={colors.gold} size="large" />
            )}
          </View>
        ) : (
          <>
            <Podium top={top} width={width} myAvatar={avatarId} />

            {top.length === 0 ? (
              <View style={styles.emptyCard}>
                <MaterialCommunityIcons name="trophy-outline" size={30} color={colors.gold} />
                <Text style={styles.emptyTitle}>{info.empty}</Text>
                <Text style={styles.emptyHint}>Win in any game to take the first place.</Text>
              </View>
            ) : null}

            <View style={styles.list}>
              {rest.map((p) => (
                <LinearGradient key={p.rank} colors={p.isMe ? ['#6A1422', '#3A0A12'] : ['#3C0B14', '#22070B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.row, p.isMe && styles.rowMe]}>
                  <Text style={styles.rowRank}>{p.rank}</Text>
                  <Image source={p.isMe ? AVATARS[avatarId - 1] : AVATARS[(p.rank - 1) % AVATARS.length]} style={styles.rowAvatar} />
                  <View style={styles.rowWho}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {p.isMe ? 'You' : p.name}
                    </Text>
                    <Text style={styles.rowSub}>Total won</Text>
                  </View>
                  <Text style={styles.rowWon}>{money(p.won)}</Text>
                </LinearGradient>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* The player's own place, always in view. */}
      <LinearGradient colors={['#5E1320', '#2C090E']} style={styles.me}>
        <LinearGradient colors={['rgba(255,233,168,0)', 'rgba(255,233,168,0.9)', 'rgba(255,233,168,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.meEdge} />
        <Image source={AVATARS[avatarId - 1]} style={styles.meAvatar} />
        <View style={styles.meWho}>
          <Text style={styles.meLabel}>YOUR RANK</Text>
          <Text style={styles.meValue} numberOfLines={1}>
            {ranking?.me.rank ? `#${ranking.me.rank}  ·  Won ${money(ranking.me.won)}` : 'Not ranked yet'}
          </Text>
        </View>
        <Pressable onPress={() => (navigation as any).navigate('GameCategory')} accessibilityRole="button" accessibilityLabel="Play now">
          {({ pressed }) => (
            <LinearGradient colors={gradients.goldButton} style={[styles.mePlay, { transform: [{ scale: pressed ? 0.95 : 1 }] }]}>
              <Text style={styles.mePlayText}>PLAY NOW</Text>
            </LinearGradient>
          )}
        </Pressable>
      </LinearGradient>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#120204' },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(240,185,61,0.3)' },
  tab: { flex: 1, height: 56, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  tabText: { fontFamily: fonts.bold, fontSize: 14, color: '#E3CFC4' },
  tabTextOn: { color: colors.goldLight },
  tabLine: { position: 'absolute', left: 18, right: 18, bottom: 0, height: 2.5, borderRadius: 2 },
  countdown: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  countdownText: { fontFamily: fonts.semi, fontSize: 10.5, color: '#B98A7A' },
  countdownTextOn: { color: '#FFB36B' },

  content: { paddingBottom: 24 },
  hero: { alignItems: 'center', paddingTop: 14 },
  counterEdge: { borderRadius: 16, padding: 2.5, marginTop: 4, elevation: 6, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  counterPlate: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 13.5, paddingVertical: 7, paddingHorizontal: 10 },
  counterRupee: { fontFamily: fonts.black, fontSize: 26, color: '#FFE38A', marginRight: 3, textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2 },
  counterCell: { width: 27, height: 40, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,222,140,0.45)' },
  counterDigit: { fontFamily: fonts.black, fontSize: 25, color: '#FFE38A', textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1.5 }, textShadowRadius: 2 },
  counterDigitDim: { opacity: 0.4 },
  caption: { fontFamily: fonts.semi, fontSize: 11.5, color: '#EBCFA8', marginTop: 9 },

  wait: { alignItems: 'center', paddingTop: 70, gap: 14 },
  retry: { borderWidth: 1.5, borderColor: colors.gold, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 22 },
  retryText: { fontFamily: fonts.extra, fontSize: 12, color: colors.gold, letterSpacing: 0.6 },

  podium: { marginTop: 14, height: 250, justifyContent: 'flex-end' },
  podiumRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 14, gap: 8 },
  place: { flex: 1, alignItems: 'center' },
  placeFirst: { flex: 1.18 },
  crown: { marginBottom: -4, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3 },
  placeNumber: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: -12, borderWidth: 1.5, borderColor: '#2A0A0F', zIndex: 2 },
  placeNumberText: { fontFamily: fonts.black, fontSize: 11 },
  block: { alignSelf: 'stretch', marginTop: -6, borderTopLeftRadius: 14, borderTopRightRadius: 14, alignItems: 'center', paddingTop: 15, paddingHorizontal: 6, overflow: 'hidden' },
  blockShine: { position: 'absolute', left: 0, right: 0, top: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.55)' },
  blockName: { maxWidth: '100%', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 9, paddingHorizontal: 8, paddingVertical: 2.5 },
  blockNameText: { fontFamily: fonts.bold, fontSize: 10, color: '#FFFFFF' },
  blockWon: { fontFamily: fonts.black, fontSize: 14, marginTop: 5 },
  blockWonFirst: { fontSize: 16.5 },
  blockTag: { fontFamily: fonts.extra, fontSize: 8.5, letterSpacing: 1.2, marginTop: 3, opacity: 0.75 },
  stage: { height: 12, marginHorizontal: 8, borderBottomLeftRadius: 10, borderBottomRightRadius: 10 },
  stageEdge: { height: 1.5 },

  emptyCard: { alignItems: 'center', marginTop: 18, marginHorizontal: 16, paddingVertical: 18, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,222,140,0.25)', backgroundColor: 'rgba(42,9,14,0.85)', gap: 5 },
  emptyTitle: { fontFamily: fonts.bold, fontSize: 14, color: '#FFEFD2', textAlign: 'center' },
  emptyHint: { fontFamily: fonts.semi, fontSize: 11.5, color: '#D9B0A8', textAlign: 'center' },

  list: { marginTop: 14, paddingHorizontal: 12, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', height: 60, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,222,140,0.18)', paddingRight: 14 },
  rowMe: { borderColor: 'rgba(255,222,140,0.75)' },
  rowRank: { width: 46, textAlign: 'center', fontFamily: fonts.italic, fontSize: 20, color: colors.gold },
  rowAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.2, borderColor: 'rgba(240,185,61,0.7)' },
  rowWho: { flex: 1, marginLeft: 10 },
  rowName: { fontFamily: fonts.bold, fontSize: 13, color: '#FFFFFF' },
  rowSub: { fontFamily: fonts.semi, fontSize: 10, color: '#C9A0A6', marginTop: 2 },
  rowWon: { fontFamily: fonts.extra, fontSize: 14, color: colors.goldLight },

  // The tab bar's raised middle reaches up over the bottom of this bar: that much is left empty.
  me: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 9, paddingBottom: 9 + tabBar.hump * 0.6 },
  meEdge: { position: 'absolute', left: 0, right: 0, top: 0, height: 1.2 },
  meAvatar: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: colors.gold },
  meWho: { flex: 1, marginLeft: 10 },
  meLabel: { fontFamily: fonts.bold, fontSize: 9.5, letterSpacing: 0.8, color: colors.gold },
  meValue: { fontFamily: fonts.extra, fontSize: 13.5, color: '#FFFFFF', marginTop: 2 },
  mePlay: { borderRadius: 999, paddingVertical: 8, paddingHorizontal: 16 },
  mePlayText: { fontFamily: fonts.black, fontSize: 11.5, color: '#3A2204', letterSpacing: 0.5 },
});
