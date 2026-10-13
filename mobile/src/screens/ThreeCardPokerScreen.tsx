import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Path, Pattern, RadialGradient, Rect, Stop, Text as SvgText, TextPath } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../api/client';
import { ThreeCardConfig, ThreeCardHand, ThreeCardHandClass, dealThreeCard, fetchActiveThreeCard, fetchThreeCardConfig, fetchThreeCardHistory, threeCardAction } from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const GOLD = '#E9C46A';
const CREAM = '#FFF6DF';
const INK = '#EEF2FF';
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♣', '♦'];
const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const DEFAULT_BET = 10;
const SOUND_KEY = 'novaplay:threecard:sound';
const TOAST_MS = 1900;
const HAND_NAME: Record<ThreeCardHandClass, string> = {
  STRAIGHT_FLUSH: 'Straight Flush',
  THREE_OF_A_KIND: 'Three of a Kind',
  STRAIGHT: 'Straight',
  FLUSH: 'Flush',
  PAIR: 'Pair',
  HIGH_CARD: 'High Card',
};
const SHORT_NAME: Record<ThreeCardHandClass, string> = {
  STRAIGHT_FLUSH: 'Str. Flush',
  THREE_OF_A_KIND: 'Trips',
  STRAIGHT: 'Straight',
  FLUSH: 'Flush',
  PAIR: 'Pair',
  HIGH_CARD: 'High Card',
};
const FALLBACK_ANTE_PAYS = 0.8;
const FALLBACK_PLAY_PAYS = 0.8;
const FALLBACK_BONUS: ThreeCardConfig['anteBonus'] = [
  { hand: 'STRAIGHT_FLUSH', pays: 5 },
  { hand: 'THREE_OF_A_KIND', pays: 4 },
  { hand: 'STRAIGHT', pays: 1 },
];
const FALLBACK_PAIR_PLUS: ThreeCardConfig['pairPlus'] = [
  { hand: 'STRAIGHT_FLUSH', pays: 40 },
  { hand: 'THREE_OF_A_KIND', pays: 30 },
  { hand: 'STRAIGHT', pays: 5 },
  { hand: 'FLUSH', pays: 3 },
  { hand: 'PAIR', pays: 1 },
];
const CHIP_PAIR_PLUS = '#7C3AED';
const CHIP_ANTE = '#B91C1C';
const CHIP_PLAY = '#0F766E';
/** Slots: 0-2 player, 3-5 dealer. */
const SLOTS = 6;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

function fmtPays(p: number): string {
  return `${Number.isInteger(p) ? p : round2(p)}:1`;
}

const run = (a: Animated.CompositeAnimation) => new Promise<void>((r) => a.start(() => r()));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- art ----------

const CardFace = memo(function CardFace({ card, w }: { card: number; w: number }) {
  const h = w * 1.4;
  const rank = card % 13;
  const suit = Math.floor(card / 13);
  const red = suit === 1 || suit === 3;
  const color = red ? '#D1142F' : '#15161C';
  const label = RANKS[rank];
  const court = rank >= 10;
  const corner = (
    <>
      <Text style={{ color, fontWeight: '900', fontSize: w * (label.length > 1 ? 0.22 : 0.26), lineHeight: w * 0.28 }}>{label}</Text>
      <Text style={{ color, fontSize: w * 0.19, lineHeight: w * 0.21 }}>{SUITS[suit]}</Text>
    </>
  );
  return (
    <LinearGradient colors={['#FFFFFF', '#F7F5EE', '#E9E4D6']} style={[styles.card, { width: w, height: h, borderRadius: w * 0.08 }]}>
      <View style={[styles.cardCorner, { top: w * 0.05, left: w * 0.07 }]}>{corner}</View>
      <View style={[styles.cardCorner, { bottom: w * 0.05, right: w * 0.07, transform: [{ rotate: '180deg' }] }]}>{corner}</View>
      {court ? (
        <View style={[styles.courtFrame, { width: w * 0.54, height: h * 0.54, borderRadius: w * 0.06, borderColor: red ? '#EBA7B2' : '#B7BACB' }]}>
          <MaterialCommunityIcons name="crown" size={w * 0.17} color="#B8862B" />
          <Text style={{ color, fontWeight: '900', fontFamily: 'serif', fontSize: w * 0.3, lineHeight: w * 0.34 }}>{label}</Text>
          <Text style={{ color, fontSize: w * 0.15, lineHeight: w * 0.17 }}>{SUITS[suit]}</Text>
        </View>
      ) : (
        <Text style={{ color, fontSize: w * (rank === 0 ? 0.66 : 0.54), lineHeight: w * (rank === 0 ? 0.74 : 0.62) }}>{SUITS[suit]}</Text>
      )}
    </LinearGradient>
  );
});

const CardBack = memo(function CardBack({ w }: { w: number }) {
  const h = w * 1.4;
  const inset = w * 0.08;
  return (
    <Svg width={w} height={h}>
      <Defs>
        <SvgLinearGradient id="tcBack" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#1E3A8A" />
          <Stop offset="1" stopColor="#0B1437" />
        </SvgLinearGradient>
        <Pattern id="tcFan" width={w * 0.2} height={w * 0.2} patternUnits="userSpaceOnUse">
          <Path d={`M0 ${w * 0.2} A ${w * 0.1} ${w * 0.1} 0 0 1 ${w * 0.2} ${w * 0.2}`} fill="none" stroke={GOLD} strokeOpacity={0.4} strokeWidth={0.8} />
        </Pattern>
      </Defs>
      <Rect x={0.75} y={0.75} width={w - 1.5} height={h - 1.5} rx={w * 0.08} fill="url(#tcBack)" stroke={GOLD} strokeWidth={1.5} />
      <Rect x={inset} y={inset} width={w - inset * 2} height={h - inset * 2} rx={w * 0.05} fill="url(#tcFan)" stroke={GOLD} strokeOpacity={0.6} strokeWidth={1} />
      <Circle cx={w / 2} cy={h / 2} r={w * 0.19} fill="#0B1437" stroke={GOLD} strokeWidth={1.2} />
      <SvgText x={w / 2} y={h / 2 + w * 0.08} fontSize={w * 0.2} fill={GOLD} textAnchor="middle" fontWeight="bold">
        3
      </SvgText>
    </Svg>
  );
});

/** A betting chip with its amount. */
function Chip({ size, color, label }: { size: number; color: string; label: string }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 40 40" style={StyleSheet.absoluteFill}>
        <Circle cx={20} cy={20} r={19} fill={color} stroke="#FFFFFF" strokeWidth={1} />
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return <Rect key={i} x={20 + Math.cos(a) * 15.5 - 2.2} y={20 + Math.sin(a) * 15.5 - 3.5} width={4.4} height={7} fill="#FFFFFF" opacity={0.9} transform={`rotate(${(a * 180) / Math.PI + 90} ${20 + Math.cos(a) * 15.5} ${20 + Math.sin(a) * 15.5})`} />;
        })}
        <Circle cx={20} cy={20} r={11} fill={color} stroke="#FFFFFF" strokeOpacity={0.6} strokeWidth={0.8} strokeDasharray="2 2" />
      </Svg>
      <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: size * (label.length > 3 ? 0.22 : 0.27) }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Midnight-blue room with an Art Deco fan pattern and a warm lamp over the table. */
function Background({ w, h }: { w: number; h: number }) {
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id="tcBg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#0E1630" />
          <Stop offset="0.55" stopColor="#080D1F" />
          <Stop offset="1" stopColor="#04060F" />
        </SvgLinearGradient>
        <RadialGradient id="tcLamp" cx="50%" cy="42%" r="55%">
          <Stop offset="0" stopColor={GOLD} stopOpacity={0.14} />
          <Stop offset="1" stopColor={GOLD} stopOpacity={0} />
        </RadialGradient>
        <Pattern id="tcDeco" width={56} height={28} patternUnits="userSpaceOnUse">
          <Path d="M0 28 A28 28 0 0 1 56 28 M8 28 A20 20 0 0 1 48 28 M16 28 A12 12 0 0 1 40 28 M28 0 L28 28" fill="none" stroke={GOLD} strokeOpacity={0.05} strokeWidth={1} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill="url(#tcBg)" />
      <Rect x={0} y={0} width={w} height={h} fill="url(#tcDeco)" />
      <Rect x={0} y={0} width={w} height={h} fill="url(#tcLamp)" />
    </Svg>
  );
}

/** The table: dealer on the straight side, a round player side, leather rail with gold trim over royal-blue felt. */
function Table({ w, h, arcY }: { w: number; h: number; arcY: number }) {
  const rail = Math.max(10, w * 0.035);
  const shape = (inset: number) => {
    const x0 = inset;
    const x1 = w - inset;
    const y0 = inset;
    const r = h * 0.1;
    const bottom = h - inset;
    return `M${x0 + r} ${y0} L${x1 - r} ${y0} Q${x1} ${y0} ${x1} ${y0 + r} L${x1} ${h * 0.58} C${x1} ${bottom - h * 0.06} ${w * 0.78} ${bottom} ${w / 2} ${bottom} C${w * 0.22} ${bottom} ${x0} ${bottom - h * 0.06} ${x0} ${h * 0.58} L${x0} ${y0 + r} Q${x0} ${y0} ${x0 + r} ${y0} Z`;
  };
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="tcFelt" cx="50%" cy="42%" r="62%">
          <Stop offset="0" stopColor="#2F5BC4" />
          <Stop offset="0.65" stopColor="#1B3A8C" />
          <Stop offset="1" stopColor="#0B1A4A" />
        </RadialGradient>
        <SvgLinearGradient id="tcRail" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#2A2A33" />
          <Stop offset="0.5" stopColor="#15151B" />
          <Stop offset="1" stopColor="#08080B" />
        </SvgLinearGradient>
        <Path id="tcArc" d={`M${w * 0.16} ${arcY} Q ${w / 2} ${arcY + h * 0.08} ${w * 0.84} ${arcY}`} />
      </Defs>
      <Path d={shape(0)} fill="url(#tcRail)" />
      <Path d={shape(rail * 0.4)} fill="none" stroke={GOLD} strokeOpacity={0.6} strokeWidth={1.2} />
      <Path d={shape(rail)} fill="url(#tcFelt)" />
      <Path d={shape(rail + 7)} fill="none" stroke={GOLD} strokeOpacity={0.35} strokeWidth={1} strokeDasharray="5 4" />
      <SvgText fill={GOLD} fillOpacity={0.6} fontSize={Math.max(8, w * 0.024)} fontWeight="bold" letterSpacing={1}>
        <TextPath href="#tcArc" startOffset="50%" textAnchor="middle">
          DEALER PLAYS WITH QUEEN HIGH OR BETTER
        </TextPath>
      </SvgText>
    </Svg>
  );
}

function Logo({ width }: { width: number }) {
  return (
    <Svg width={width} height={width * 0.2} viewBox="0 0 300 60">
      <Defs>
        <SvgLinearGradient id="tcLogo" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFF6D2" />
          <Stop offset="0.55" stopColor={GOLD} />
          <Stop offset="1" stopColor="#9A6A12" />
        </SvgLinearGradient>
      </Defs>
      <SvgText x={150} y={30} fontSize={25} fontWeight="bold" fontFamily="serif" fill="url(#tcLogo)" stroke="#1A1200" strokeWidth={0.8} textAnchor="middle" letterSpacing={2.5}>
        THREE CARD POKER
      </SvgText>
      <Path d="M52 44 L104 44 M196 44 L248 44" stroke={GOLD} strokeOpacity={0.5} strokeWidth={1.2} />
      <SvgText x={150} y={48} fontSize={11} fontWeight="bold" fill={CREAM} fillOpacity={0.8} textAnchor="middle" letterSpacing={3}>
        ♠ ♥ PAIR PLUS ♣ ♦
      </SvgText>
    </Svg>
  );
}

/** Home tile art: a fanned straight flush over blue felt with a chip. */
export function ThreeCardPokerTileArt({ size }: { size: number }) {
  const w = size * 0.27;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size }} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="tctBg" cx="50%" cy="40%" r="70%">
            <Stop offset="0" stopColor="#2F5BC4" />
            <Stop offset="1" stopColor="#081336" />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill="url(#tctBg)" />
        <Path d="M10 100 A40 40 0 0 1 90 100 M22 100 A28 28 0 0 1 78 100" fill="none" stroke={GOLD} strokeOpacity={0.3} strokeWidth={0.8} />
      </Svg>
      <View style={{ position: 'absolute', left: size * 0.14, top: size * 0.16, transform: [{ rotate: '-16deg' }] }}>
        <CardFace card={11} w={w} />
      </View>
      <View style={{ position: 'absolute', left: size * 0.36, top: size * 0.09 }}>
        <CardFace card={12} w={w} />
      </View>
      <View style={{ position: 'absolute', left: size * 0.58, top: size * 0.16, transform: [{ rotate: '16deg' }] }}>
        <CardFace card={0} w={w} />
      </View>
      <View style={{ position: 'absolute', left: size * 0.68, top: size * 0.5 }}>
        <Chip size={size * 0.2} color={CHIP_PAIR_PLUS} label="" />
      </View>
    </View>
  );
}

/** A paytable printed on the felt; the row for the player's hand lights up. */
function Plaque({ title, rows, lit, w }: { title: string; rows: { hand: ThreeCardHandClass; pays: number }[]; lit: ThreeCardHandClass | null; w: number }) {
  return (
    <View style={[styles.plaque, { width: w }]}>
      <Text style={styles.plaqueTitle} numberOfLines={1}>
        {title}
      </Text>
      {rows.map(({ hand, pays }) => {
        const on = lit === hand;
        return (
          <View key={hand} style={[styles.plaqueRow, on && styles.plaqueRowOn]}>
            <Text style={[styles.plaqueKey, on && { color: '#1A1200' }]} numberOfLines={1}>
              {SHORT_NAME[hand]}
            </Text>
            <Text style={[styles.plaqueVal, on && { color: '#1A1200' }]}>{pays}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ---------- screen ----------

type Banner = { title: string; sub: string; extra?: string; tone: 'win' | 'lose' | 'push' };

export default function ThreeCardPokerScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<ThreeCardConfig | null>(null);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [ppBet, setPpBet] = useState(0);
  const [hand, setHand] = useState<ThreeCardHand | null>(null);
  const [cards, setCards] = useState<(number | null)[]>(Array(SLOTS).fill(null));
  const [up, setUp] = useState<boolean[]>(Array(SLOTS).fill(false));
  const [busy, setBusy] = useState(false);
  const [dealing, setDealing] = useState(false);
  const [settled, setSettled] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [shownBalance, setShownBalance] = useState(coins);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [panel, setPanel] = useState<'history' | 'rules' | null>(null);
  const [history, setHistory] = useState<ThreeCardHand[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [tableBox, setTableBox] = useState<{ w: number; h: number } | null>(null);

  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;
  const balanceRef = useRef(shownBalance);
  balanceRef.current = shownBalance;
  const playersRef = useRef<{ tick: AudioPlayer; win: AudioPlayer; land: AudioPlayer } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flips = useRef(Array.from({ length: SLOTS }, () => new Animated.Value(1))).current;
  const bannerAnim = useRef(new Animated.Value(0)).current;

  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const antePays = config?.antePays ?? FALLBACK_ANTE_PAYS;
  const playPays = config?.playPays ?? FALLBACK_PLAY_PAYS;
  const anteBonus = config?.anteBonus ?? FALLBACK_BONUS;
  const pairPlusPays = config?.pairPlus ?? FALLBACK_PAIR_PLUS;
  const betLevels = useMemo(() => BET_LEVELS.filter((b) => b >= minStake && b <= maxStake), [minStake, maxStake]);
  const ppLevels = useMemo(() => [0, ...betLevels], [betLevels]);
  const live = hand?.status === 'ACTIVE';

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const play = useCallback((name: 'tick' | 'win' | 'land') => {
    if (!soundRef.current) return;
    const p = playersRef.current?.[name];
    if (!p) return;
    try {
      p.seekTo(0);
      p.play();
    } catch {
      // A missed sound effect is harmless.
    }
  }, []);

  /** Lays a hand out with no animation (resume, or after an error). */
  const showHand = useCallback(
    (h: ThreeCardHand) => {
      const next: (number | null)[] = Array(SLOTS).fill(null);
      h.playerCards.forEach((c, i) => (next[i] = c));
      h.dealerCards.forEach((c, i) => (next[3 + i] = c));
      // An open hand's dealer cards lie face down.
      if (h.status === 'ACTIVE') [3, 4, 5].forEach((i) => (next[i] = -1));
      setCards(next);
      setUp(next.map((c) => c !== null && c >= 0));
      flips.forEach((v) => v.setValue(1));
      setSettled(h.status !== 'ACTIVE');
    },
    [flips]
  );

  useEffect(() => {
    mountedRef.current = true;
    fetchThreeCardConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => {});
    fetchActiveThreeCard()
      .then(({ hand: open }) => {
        if (!open || !mountedRef.current) return;
        setHand(open);
        setBet(Number(open.ante));
        setPpBet(Number(open.pairPlus));
        showHand(open);
      })
      .catch(() => {});
    AsyncStorage.getItem(SOUND_KEY)
      .then((v) => v === 'off' && setSoundOn(false))
      .catch(() => {});
    try {
      setAudioModeAsync({ playsInSilentMode: false }).catch(() => {});
      playersRef.current = {
        tick: createAudioPlayer(require('../../assets/sounds/plinko-tick.wav')),
        win: createAudioPlayer(require('../../assets/sounds/plinko-win.wav')),
        land: createAudioPlayer(require('../../assets/sounds/plinko-land.wav')),
      };
    } catch {
      playersRef.current = null;
    }
    return () => {
      mountedRef.current = false;
      const players = playersRef.current;
      playersRef.current = null;
      if (players) Object.values(players).forEach((p) => p.remove());
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [showHand]);

  useEffect(() => {
    if (!busyRef.current) setShownBalance(coins);
  }, [coins]);

  const showBanner = useCallback(
    (b: Banner) => {
      setBanner(b);
      bannerAnim.setValue(0);
      Animated.sequence([
        Animated.spring(bannerAnim, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
        Animated.delay(1900),
        Animated.timing(bannerAnim, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]).start(() => mountedRef.current && setBanner(null));
    },
    [bannerAnim]
  );

  /** Turns slot i over to show `card`. */
  const flipTo = useCallback(
    async (i: number, card: number) => {
      await run(Animated.timing(flips[i], { toValue: 0, duration: 80, useNativeDriver: true }));
      setCards((cs) => cs.map((c, k) => (k === i ? card : c)));
      setUp((u) => u.map((x, k) => (k === i ? true : x)));
      play('tick');
      await run(Animated.timing(flips[i], { toValue: 1, duration: 120, useNativeDriver: true }));
    },
    [flips, play]
  );

  const finish = () => {
    busyRef.current = false;
    setBusy(false);
    setDealing(false);
  };

  const doDeal = useCallback(async () => {
    if (busyRef.current) return;
    if (bet + ppBet > balanceRef.current) {
      showToast('Insufficient balance');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setDealing(true);
    setBanner(null);
    setSettled(false);
    const previous = hand;
    // Sweep the old cards away.
    await run(Animated.parallel(flips.map((v) => Animated.timing(v, { toValue: 0, duration: 120, useNativeDriver: true }))));
    setCards(Array(SLOTS).fill(null));
    setUp(Array(SLOTS).fill(false));
    flips.forEach((v) => v.setValue(1));
    let h: ThreeCardHand;
    try {
      h = await dealThreeCard(bet, ppBet);
    } catch (err) {
      showToast(errorMessage(err));
      if (previous && mountedRef.current) showHand(previous);
      finish();
      return;
    }
    if (!mountedRef.current) return;
    setShownBalance((b) => round2(b - bet - ppBet));
    setHand(h);
    // Face-down cards land first, then the player's three turn over.
    setCards(Array(SLOTS).fill(-1));
    await wait(200);
    for (let i = 0; i < 3; i++) await flipTo(i, h.playerCards[i]);
    if (!mountedRef.current) return;
    finish();
  }, [bet, ppBet, flipTo, flips, hand, showHand, showToast]);

  const doAction = useCallback(
    async (action: 'PLAY' | 'FOLD') => {
      if (busyRef.current || !hand || hand.status !== 'ACTIVE') return;
      if (action === 'PLAY' && Number(hand.ante) > balanceRef.current) {
        showToast(`You need ₹${Number(hand.ante).toFixed(2)} to play`);
        return;
      }
      busyRef.current = true;
      setBusy(true);
      let h: ThreeCardHand;
      try {
        h = await threeCardAction(hand.id, action);
      } catch (err) {
        showToast(errorMessage(err));
        fetchActiveThreeCard()
          .then(({ hand: open }) => {
            if (!mountedRef.current) return;
            if (open) setHand(open);
            else refreshWallet().catch(() => {});
          })
          .catch(() => {});
        finish();
        return;
      }
      if (!mountedRef.current) return;
      const ante = Number(h.ante);
      if (action === 'PLAY') setShownBalance((b) => round2(b - ante));
      setHand({ ...h, status: 'ACTIVE' });
      await wait(action === 'PLAY' ? 300 : 60);
      for (let i = 0; i < 3; i++) {
        await flipTo(3 + i, h.dealerCards[i]);
        if (action === 'PLAY') await wait(160);
      }
      if (!mountedRef.current) return;
      setHand(h);
      setSettled(true);
      const payout = Number(h.payout);
      const ppPaid = Number(h.pairPlusPayout);
      if (payout > 0) setShownBalance((b) => round2(b + payout));
      const mine = HAND_NAME[h.player.hand];
      const theirs = h.dealer ? HAND_NAME[h.dealer.hand] : '';
      const extra = ppPaid > 0 ? `Pair Plus paid ₹${ppPaid.toFixed(2)}` : undefined;
      if (h.outcome === 'WIN') {
        play('win');
        showBanner({ title: 'YOU WIN', sub: `${mine} beats ${theirs} · ₹${payout.toFixed(2)}`, extra, tone: 'win' });
      } else if (h.outcome === 'DEALER_NOT_QUALIFIED') {
        play('win');
        showBanner({ title: "DEALER DOESN'T QUALIFY", sub: `Ante paid · ₹${payout.toFixed(2)}`, extra, tone: 'win' });
      } else if (h.outcome === 'TIE') {
        play('tick');
        showBanner({ title: 'PUSH', sub: `Both ${mine} · bets returned`, extra, tone: 'push' });
      } else if (h.outcome === 'LOSE') {
        play(payout > 0 ? 'win' : 'land');
        showBanner({ title: 'DEALER WINS', sub: `${theirs} beats ${mine}`, extra: payout > ppPaid ? `Ante bonus paid ₹${(payout - ppPaid).toFixed(2)}` : extra, tone: payout > 0 ? 'push' : 'lose' });
      } else {
        play(ppPaid > 0 ? 'win' : 'land');
        showBanner({ title: 'FOLDED', sub: `-₹${ante.toFixed(2)} ante`, extra, tone: ppPaid > 0 ? 'push' : 'lose' });
      }
      refreshWallet().catch(() => {});
      finish();
    },
    [flipTo, hand, play, refreshWallet, showBanner, showToast]
  );

  const step = (levels: number[], value: number, dir: -1 | 1) => {
    const i = levels.indexOf(value);
    if (i >= 0) return levels[Math.min(levels.length - 1, Math.max(0, i + dir))];
    return dir > 0 ? levels.find((b) => b > value) ?? value : [...levels].reverse().find((b) => b < value) ?? value;
  };
  const changeBet = (dir: -1 | 1) => {
    if (live || busy) return;
    setBet((b) => step(betLevels, b, dir));
  };
  const changePp = (dir: -1 | 1) => {
    if (live || busy) return;
    setPpBet((b) => step(ppLevels, b, dir));
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    AsyncStorage.setItem(SOUND_KEY, next ? 'on' : 'off').catch(() => {});
  };

  const openPanel = (p: 'history' | 'rules') => {
    setPanel(p);
    if (p === 'history') {
      setHistory(null);
      fetchThreeCardHistory(30)
        .then((h) => mountedRef.current && setHistory(h))
        .catch(() => mountedRef.current && setHistory([]));
    }
  };

  // ---------- layout ----------
  const contentW = Math.min(W - 24, 460);
  const headerH = insets.top + 50;
  const compact = H < 760;
  const logoW = Math.min(contentW * 0.78, 310);
  const tw = tableBox?.w ?? contentW;
  const th = tableBox?.h ?? 460;
  const cardW = Math.min((tw - 90 - 2 * 8) / 3, 68, (th * 0.2) / 1.4);
  const ante = hand ? Number(hand.ante) : bet;
  const pairPlus = hand ? Number(hand.pairPlus) : ppBet;
  const played = hand?.action === 'PLAY';
  // What the player's cards make, once they are face up.
  const playerUp = !!hand && up[0] && up[1] && up[2];
  const myClass = playerUp ? hand!.player.hand : null;
  const bonusLit = myClass && anteBonus.some((r) => r.hand === myClass) ? myClass : null;
  const ppLit = myClass && pairPlus > 0 && pairPlusPays.some((r) => r.hand === myClass) ? myClass : null;
  const winner = settled && hand ? (hand.outcome === 'WIN' || hand.outcome === 'DEALER_NOT_QUALIFIED' ? 'player' : hand.outcome === 'LOSE' ? 'dealer' : null) : null;
  const spot = Math.max(30, Math.min(40, th * 0.075));
  const plaqueW = Math.min(118, (tw * 0.86 - 84) / 2);
  // The dealer rule sits on an arc just under the dealer's cards.
  const arcY = th * 0.04 + 19 + cardW * 1.4 + 16;

  const slot = (i: number) => {
    const c = cards[i];
    const best = (winner === 'player' && i < 3) || (winner === 'dealer' && i >= 3);
    const dim = settled && hand?.outcome === 'FOLD' && i < 3;
    return (
      <Animated.View key={i} style={{ transform: [{ scaleX: flips[i] }], opacity: dim ? 0.5 : 1 }}>
        {c === null ? (
          <View style={[styles.slot, { width: cardW, height: cardW * 1.4, borderRadius: cardW * 0.08 }]} />
        ) : (
          <View style={[styles.cardShadow, { borderRadius: cardW * 0.08 }, best && styles.cardBest]}>{up[i] && c >= 0 ? <CardFace card={c} w={cardW} /> : <CardBack w={cardW} />}</View>
        )}
      </Animated.View>
    );
  };

  const betSpot = (label: string, amount: number, color: string, show: boolean) => (
    <View style={{ alignItems: 'center' }}>
      <View style={[styles.spot, { width: spot + 6, height: spot + 6, borderRadius: (spot + 6) / 2 }]}>{show && amount > 0 ? <Chip size={spot} color={color} label={`${amount}`} /> : null}</View>
      <Text style={styles.spotLabel}>{label}</Text>
    </View>
  );

  let status: React.ReactNode = null;
  if (settled && hand?.outcome === 'FOLD' && hand.dealer) {
    status = (
      <Text style={styles.statusText}>
        You folded · the dealer had <Text style={{ color: CREAM }}>{HAND_NAME[hand.dealer.hand]}</Text>
      </Text>
    );
  } else if (settled && hand?.dealer) {
    status = (
      <Text style={styles.statusText}>
        You: <Text style={{ color: GOLD }}>{HAND_NAME[hand.player.hand]}</Text> · Dealer: <Text style={{ color: hand.dealer.qualifies ? CREAM : '#FCA5A5' }}>{HAND_NAME[hand.dealer.hand]}</Text>
        {hand.dealer.qualifies ? '' : ' (no qualify)'}
      </Text>
    );
  } else if (live && myClass) {
    status = (
      <Text style={styles.statusText}>
        Your hand: <Text style={{ color: GOLD }}>{HAND_NAME[myClass]}</Text> · play or fold
      </Text>
    );
  } else if (!hand && !busy) status = <Text style={styles.statusText}>Beat the dealer's three cards</Text>;

  return (
    <View style={styles.root}>
      <Background w={W} h={H} />

      <View style={[styles.header, { paddingTop: insets.top + 6, height: headerH }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headBtn} hitSlop={8} accessibilityLabel="Back">
          <MaterialCommunityIcons name="chevron-left" size={26} color={GOLD} />
        </Pressable>
        <View style={styles.headBalance}>
          <MaterialCommunityIcons name="wallet" size={16} color={GOLD} />
          <Text style={styles.headBalanceText} numberOfLines={1}>
            ₹{shownBalance.toFixed(2)}
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        <Pressable onPress={toggleSound} style={styles.headBtn} hitSlop={6} accessibilityLabel="Sound">
          <MaterialCommunityIcons name={soundOn ? 'volume-high' : 'volume-off'} size={20} color={GOLD} />
        </Pressable>
        <Pressable onPress={() => openPanel('history')} style={styles.headBtn} hitSlop={6} accessibilityLabel="My hands">
          <MaterialCommunityIcons name="history" size={20} color={GOLD} />
        </Pressable>
        <Pressable onPress={() => openPanel('rules')} style={styles.headBtn} hitSlop={6} accessibilityLabel="Rules">
          <MaterialCommunityIcons name="information-variant" size={22} color={GOLD} />
        </Pressable>
      </View>

      <View style={[styles.body, { paddingTop: headerH, paddingBottom: insets.bottom + 10, width: contentW, alignSelf: 'center' }]}>
        {!compact && (
          <View style={{ alignItems: 'center' }} pointerEvents="none">
            <Logo width={logoW} />
          </View>
        )}

        {/* Table */}
        <View style={{ flex: 1, marginVertical: 6 }} onLayout={(e) => setTableBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
          {tableBox && (
            <>
              <Table w={tw} h={th} arcY={arcY} />
              <View style={[StyleSheet.absoluteFill, { alignItems: 'center', paddingTop: th * 0.04, paddingBottom: th * 0.06 }]}>
                <Text style={styles.seatLabel}>DEALER</Text>
                <View style={[styles.row, { gap: 8 }]}>{[3, 4, 5].map((i) => slot(i))}</View>
                <View style={{ flex: 1, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: tw * 0.07, paddingTop: th * 0.07 }}>
                  <Plaque title="PAIR PLUS" rows={pairPlusPays} lit={ppLit} w={plaqueW} />
                  <View style={{ alignItems: 'center', gap: 2 }}>
                    {betSpot('PAIR PLUS', pairPlus, CHIP_PAIR_PLUS, !!hand)}
                    {betSpot('ANTE', ante, CHIP_ANTE, !!hand)}
                    {betSpot('PLAY', ante, CHIP_PLAY, played)}
                  </View>
                  <Plaque title="ANTE BONUS" rows={anteBonus} lit={bonusLit} w={plaqueW} />
                </View>
                <View style={[styles.row, { gap: 8 }]}>{[0, 1, 2].map((i) => slot(i))}</View>
                <Text style={[styles.seatLabel, { marginTop: 4, marginBottom: 0 }]}>YOU</Text>
              </View>
            </>
          )}
        </View>

        <View style={styles.statusBox}>{status}</View>

        {/* Controls, the same height live or not */}
        <View style={{ minHeight: 122, justifyContent: 'flex-end' }}>
          {live && hand ? (
            <View style={styles.actRow}>
              <Pressable onPress={() => doAction('FOLD')} disabled={busy} style={({ pressed }) => [styles.foldBtn, busy && styles.dim, pressed && { transform: [{ scale: 0.97 }] }]} accessibilityLabel="Fold">
                <Text style={styles.foldText}>FOLD</Text>
                <Text style={styles.foldSub}>lose ₹{ante} ante</Text>
              </Pressable>
              <Pressable onPress={() => doAction('PLAY')} disabled={busy} style={({ pressed }) => [styles.callBtn, busy && styles.dim, pressed && { transform: [{ scale: 0.97 }] }]} accessibilityLabel="Play">
                <LinearGradient colors={['#FFF1B0', GOLD, '#B7791F']} style={styles.callInner}>
                  <Text style={styles.callText}>PLAY</Text>
                  <Text style={styles.callSub}>bet ₹{ante} more</Text>
                </LinearGradient>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={[styles.betRow, busy && styles.dim]}>
                <View style={styles.betBox}>
                  <Pressable onPress={() => changeBet(-1)} style={styles.betBtn} hitSlop={6} accessibilityLabel="Lower ante">
                    <MaterialCommunityIcons name="minus" size={18} color="#1A1200" />
                  </Pressable>
                  <View style={styles.betValueBox}>
                    <Text style={styles.betLabel}>ANTE</Text>
                    <Text style={styles.betValue}>₹{bet}</Text>
                  </View>
                  <Pressable onPress={() => changeBet(1)} style={styles.betBtn} hitSlop={6} accessibilityLabel="Raise ante">
                    <MaterialCommunityIcons name="plus" size={18} color="#1A1200" />
                  </Pressable>
                </View>
                <View style={[styles.betBox, { borderColor: 'rgba(167,139,250,0.6)' }]}>
                  <Pressable onPress={() => changePp(-1)} style={[styles.betBtn, { backgroundColor: '#A78BFA' }]} hitSlop={6} accessibilityLabel="Lower Pair Plus">
                    <MaterialCommunityIcons name="minus" size={18} color="#1A1200" />
                  </Pressable>
                  <View style={styles.betValueBox}>
                    <Text style={styles.betLabel}>PAIR PLUS</Text>
                    <Text style={[styles.betValue, ppBet === 0 && { color: 'rgba(238,242,255,0.45)' }]}>{ppBet === 0 ? 'OFF' : `₹${ppBet}`}</Text>
                  </View>
                  <Pressable onPress={() => changePp(1)} style={[styles.betBtn, { backgroundColor: '#A78BFA' }]} hitSlop={6} accessibilityLabel="Raise Pair Plus">
                    <MaterialCommunityIcons name="plus" size={18} color="#1A1200" />
                  </Pressable>
                </View>
              </View>
              <Pressable onPress={doDeal} disabled={busy} style={({ pressed }) => [styles.dealBtn, pressed && { transform: [{ scale: 0.97 }] }]} accessibilityLabel="Deal">
                <LinearGradient colors={['#FFF1B0', GOLD, '#B7791F']} style={styles.dealInner}>
                  <MaterialCommunityIcons name="cards-playing" size={22} color="#1A1200" />
                  <Text style={styles.dealText}>{dealing ? 'DEALING' : 'DEAL'}</Text>
                  <Text style={styles.dealSub}>₹{bet + ppBet} · play is ₹{bet}</Text>
                </LinearGradient>
              </Pressable>
            </>
          )}
        </View>
      </View>

      {banner && (
        <View pointerEvents="none" style={[styles.bannerWrap, { top: H * 0.4 }]}>
          <Animated.View style={{ opacity: bannerAnim, transform: [{ scale: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
            <LinearGradient
              colors={banner.tone === 'win' ? ['#14532D', '#052E16'] : banner.tone === 'push' ? ['#1E3A8A', '#0B1437'] : ['#7F1D1D', '#2A0606']}
              style={[styles.bannerCard, { borderColor: banner.tone === 'win' ? GOLD : banner.tone === 'push' ? '#C7D2FE' : '#FCA5A5' }]}
            >
              <Text style={styles.bannerTitle}>{banner.title}</Text>
              <Text style={[styles.bannerSub, { color: banner.tone === 'win' ? GOLD : '#F4F4F5' }]}>{banner.sub}</Text>
              {banner.extra ? <Text style={styles.bannerExtra}>{banner.extra}</Text> : null}
            </LinearGradient>
          </Animated.View>
        </View>
      )}

      {panel && (
        <Pressable style={styles.scrim} onPress={() => setPanel(null)}>
          <Pressable style={[styles.sheet, { maxHeight: H * 0.84, width: Math.min(W - 24, 470) }]} onPress={() => {}}>
            <View style={styles.tabs}>
              {(
                [
                  ['history', 'MY HANDS'],
                  ['rules', 'RULES'],
                ] as const
              ).map(([id, label]) => (
                <Pressable key={id} onPress={() => openPanel(id)} style={[styles.tab, panel === id && styles.tabOn]}>
                  <Text style={[styles.tabText, panel === id && styles.tabTextOn]}>{label}</Text>
                </Pressable>
              ))}
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => setPanel(null)} hitSlop={10} style={{ padding: 6 }} accessibilityLabel="Close">
                <MaterialCommunityIcons name="close" size={20} color={GOLD} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 14 }}>
              {panel === 'history' ? <History hands={history} /> : <Rules config={config} antePays={antePays} playPays={playPays} anteBonus={anteBonus} pairPlus={pairPlusPays} />}
            </ScrollView>
          </Pressable>
        </Pressable>
      )}

      {toast && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}
    </View>
  );
}

function PayBox({ rows }: { rows: { hand: ThreeCardHandClass; pays: number }[] }) {
  return (
    <View style={styles.ruleBox}>
      {rows.map(({ hand, pays }) => (
        <View key={hand} style={styles.ruleRow}>
          <Text style={styles.ruleKey}>{HAND_NAME[hand]}</Text>
          <Text style={styles.ruleVal}>{fmtPays(pays)}</Text>
        </View>
      ))}
    </View>
  );
}

function Rules({
  config,
  antePays,
  playPays,
  anteBonus,
  pairPlus,
}: {
  config: ThreeCardConfig | null;
  antePays: number;
  playPays: number;
  anteBonus: ThreeCardConfig['anteBonus'];
  pairPlus: ThreeCardConfig['pairPlus'];
}) {
  return (
    <View>
      <Text style={styles.ruleHead}>How to play</Text>
      <Text style={styles.ruleLine}>Place your ante, and a Pair Plus bet if you like. You and the dealer each get three cards. Look at yours, then fold — losing the ante — or play with a bet equal to the ante.</Text>
      <Text style={styles.ruleHead}>Who wins</Text>
      <Text style={styles.ruleLine}>• The dealer needs queen high or better to qualify. If the dealer doesn't qualify, your ante pays {fmtPays(antePays)} and your play bet is returned.</Text>
      <Text style={styles.ruleLine}>• If the dealer qualifies and your hand is better, your ante pays {fmtPays(antePays)} and your play bet pays {fmtPays(playPays)}.</Text>
      <Text style={styles.ruleLine}>• Equal hands return both bets. If the dealer's hand is better, both bets lose.</Text>
      <Text style={styles.ruleLine}>Hands, best first: straight flush, three of a kind, straight, flush, pair, high card. A-K-Q is the top straight and A-2-3 the lowest.</Text>
      <Text style={styles.ruleHead}>Ante bonus</Text>
      <Text style={styles.ruleLine}>Paid on your ante whenever you play, even if the dealer wins.</Text>
      <PayBox rows={anteBonus} />
      <Text style={styles.ruleHead}>Pair Plus</Text>
      <Text style={styles.ruleLine}>Pays on your three cards alone — the dealer's hand doesn't matter, and it pays even if you fold.</Text>
      <PayBox rows={pairPlus} />
      <Text style={styles.ruleHead}>Game info</Text>
      <Text style={styles.ruleLine}>
        Return to player: ante and play {config?.rtpPercent ? `${config.rtpPercent}%` : '—'} of the money bet when every decision is the best one; Pair Plus {config?.pairPlusRtpPercent ? `${config.pairPlusRtpPercent}%` : '—'}. Bets ₹{config?.minStake ?? 1} – ₹{config?.maxStake ?? 500}; max win per hand ₹{config?.maxPayout ?? 10000}.
      </Text>
      <Text style={styles.ruleLine}>All six cards of a hand come from your provably-fair seeds, fixed when the hand is dealt (Settings → Provably Fair).</Text>
    </View>
  );
}

function History({ hands }: { hands: ThreeCardHand[] | null }) {
  if (hands === null) return <Text style={styles.ruleLine}>Loading…</Text>;
  if (hands.length === 0) return <Text style={styles.ruleLine}>No hands yet.</Text>;
  const label = (h: ThreeCardHand) => {
    const mine = HAND_NAME[h.player.hand];
    const theirs = h.dealer ? HAND_NAME[h.dealer.hand] : '';
    if (h.outcome === 'FOLD') return `Folded · ${mine}`;
    if (h.outcome === 'DEALER_NOT_QUALIFIED') return `Dealer didn't qualify · ${mine}`;
    if (h.outcome === 'WIN') return `Won · ${mine} vs ${theirs}`;
    if (h.outcome === 'TIE') return `Push · ${mine}`;
    return `Lost · dealer's ${theirs} beat ${mine}`;
  };
  return (
    <View style={{ gap: 8 }}>
      {hands.map((h) => {
        const payout = Number(h.payout);
        const staked = Number(h.staked);
        const pp = Number(h.pairPlusPayout);
        return (
          <View key={h.id} style={styles.histRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.histCards}>
                {h.playerCards.map((c, i) => (
                  <CardFace key={`p${i}`} card={c} w={24} />
                ))}
                <Text style={styles.histVs}>vs</Text>
                {h.dealerCards.map((c, i) => (
                  <CardFace key={`d${i}`} card={c} w={24} />
                ))}
              </View>
              <Text style={styles.histMain}>{label(h)}</Text>
              <Text style={styles.histSub}>
                ₹{staked.toFixed(2)} bet{pp > 0 ? ` · Pair Plus +₹${pp.toFixed(2)}` : ''} · {new Date(h.createdAt).toLocaleString()}
              </Text>
            </View>
            <Text style={[styles.histPay, { color: payout > staked ? GOLD : 'rgba(238,242,255,0.5)' }]}>{payout > 0 ? `+₹${payout.toFixed(2)}` : `-₹${staked.toFixed(2)}`}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#04060F' },
  dim: { opacity: 0.4 },
  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 6, zIndex: 3 },
  headBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(14,22,48,0.92)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.45)' },
  headBalance: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: 'rgba(14,22,48,0.94)', borderWidth: 1.2, borderColor: GOLD },
  headBalanceText: { color: GOLD, fontWeight: '900', fontSize: 14 },
  body: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  card: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.18)' },
  cardCorner: { position: 'absolute', alignItems: 'center' },
  courtFrame: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.2 },
  cardShadow: { shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 5, borderWidth: 2, borderColor: 'transparent' },
  cardBest: { borderColor: GOLD, shadowColor: GOLD, shadowOpacity: 0.9, shadowRadius: 10 },
  slot: { borderWidth: 1.5, borderColor: 'rgba(233,196,106,0.35)', borderStyle: 'dashed', backgroundColor: 'rgba(0,0,0,0.12)' },
  seatLabel: { color: GOLD, fontWeight: '900', fontSize: 11, letterSpacing: 3, opacity: 0.8, marginBottom: 4 },
  spot: { borderWidth: 1.5, borderColor: 'rgba(233,196,106,0.6)', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.16)' },
  spotLabel: { color: GOLD, fontWeight: '900', fontSize: 8.5, letterSpacing: 1.2, marginTop: 2, opacity: 0.9 },
  plaque: { paddingVertical: 6, paddingHorizontal: 6, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(233,196,106,0.4)', backgroundColor: 'rgba(4,8,24,0.28)' },
  plaqueTitle: { color: GOLD, fontWeight: '900', fontSize: 9.5, letterSpacing: 1.2, textAlign: 'center', marginBottom: 4 },
  plaqueRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingVertical: 1.5, borderRadius: 5 },
  plaqueRowOn: { backgroundColor: GOLD },
  plaqueKey: { flex: 1, color: 'rgba(238,242,255,0.85)', fontWeight: '800', fontSize: 10 },
  plaqueVal: { color: GOLD, fontWeight: '900', fontSize: 10.5 },
  statusBox: { alignItems: 'center', minHeight: 22, justifyContent: 'center', marginBottom: 6 },
  statusText: { color: 'rgba(238,242,255,0.88)', fontWeight: '800', fontSize: 13.5, textAlign: 'center' },
  actRow: { flexDirection: 'row', gap: 10 },
  foldBtn: { flex: 1, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(14,22,48,0.95)', borderWidth: 1.5, borderColor: 'rgba(252,165,165,0.6)' },
  foldText: { color: '#FCA5A5', fontWeight: '900', fontSize: 19, letterSpacing: 2 },
  foldSub: { color: 'rgba(252,165,165,0.7)', fontWeight: '800', fontSize: 11.5 },
  callBtn: { flex: 1.4, height: 64, borderRadius: 18, overflow: 'hidden', shadowColor: GOLD, shadowOpacity: 0.5, shadowRadius: 12, elevation: 8 },
  callInner: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 18, borderWidth: 2, borderColor: '#FFF3C4' },
  callText: { color: '#1A1200', fontWeight: '900', fontSize: 21, letterSpacing: 3 },
  callSub: { color: 'rgba(26,18,0,0.75)', fontWeight: '900', fontSize: 11.5 },
  betRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  betBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6, borderRadius: 16, backgroundColor: 'rgba(14,22,48,0.94)', borderWidth: 1.2, borderColor: 'rgba(233,196,106,0.45)' },
  betBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: GOLD },
  betValueBox: { flex: 1, alignItems: 'center' },
  betLabel: { color: 'rgba(238,242,255,0.55)', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  betValue: { color: INK, fontSize: 17, fontWeight: '900' },
  dealBtn: { height: 62, borderRadius: 20, overflow: 'hidden', marginTop: 10, shadowColor: GOLD, shadowOpacity: 0.45, shadowRadius: 14, elevation: 8 },
  dealInner: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 20, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  dealText: { color: '#1A1200', fontSize: 21, fontWeight: '900', letterSpacing: 3 },
  dealSub: { color: 'rgba(26,18,0,0.7)', fontSize: 11, fontWeight: '900' },
  bannerWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 16 },
  bannerCard: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 18, borderWidth: 2, alignItems: 'center', minWidth: 230 },
  bannerTitle: { color: '#FFFFFF', fontWeight: '900', fontSize: 20, letterSpacing: 1.5, fontFamily: 'serif', textAlign: 'center' },
  bannerSub: { fontWeight: '900', fontSize: 15, marginTop: 3, textAlign: 'center' },
  bannerExtra: { color: '#C4B5FD', fontWeight: '900', fontSize: 13, marginTop: 3, textAlign: 'center' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  sheet: { borderRadius: 18, backgroundColor: '#0E1630', borderWidth: 1.5, borderColor: GOLD, overflow: 'hidden' },
  tabs: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(233,196,106,0.25)' },
  tab: { paddingHorizontal: 12, paddingVertical: 7, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  tabOn: { backgroundColor: 'rgba(233,196,106,0.14)', borderBottomWidth: 2, borderBottomColor: GOLD },
  tabText: { color: 'rgba(238,242,255,0.55)', fontWeight: '900', fontSize: 12, letterSpacing: 1.2 },
  tabTextOn: { color: GOLD },
  ruleHead: { color: GOLD, fontWeight: '900', fontSize: 13, letterSpacing: 1, marginTop: 12, marginBottom: 6 },
  ruleLine: { color: 'rgba(238,242,255,0.86)', fontSize: 12.5, lineHeight: 19, fontWeight: '600', marginTop: 4 },
  ruleBox: { borderRadius: 12, padding: 10, marginTop: 6, backgroundColor: 'rgba(233,196,106,0.07)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.25)', gap: 6 },
  ruleRow: { flexDirection: 'row', alignItems: 'center' },
  ruleKey: { flex: 1, color: INK, fontWeight: '800', fontSize: 12.5 },
  ruleVal: { color: GOLD, fontWeight: '900', fontSize: 12.5 },
  histRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.15)' },
  histCards: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 6 },
  histVs: { color: 'rgba(238,242,255,0.5)', fontSize: 10, fontWeight: '800', marginHorizontal: 4 },
  histMain: { color: INK, fontWeight: '800', fontSize: 13 },
  histSub: { color: 'rgba(238,242,255,0.5)', fontSize: 11, marginTop: 3 },
  histPay: { fontWeight: '900', fontSize: 14, marginLeft: 8 },
  toast: { position: 'absolute', alignSelf: 'center', top: '45%', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.85)', borderWidth: 1, borderColor: GOLD, maxWidth: '86%', zIndex: 6 },
  toastText: { color: INK, fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
