import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient as SvgLinearGradient, Path, Pattern, RadialGradient, Rect, Stop, Text as SvgText, TextPath } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../api/client';
import { HoldemConfig, HoldemHand, HoldemHandClass, dealHoldem, fetchActiveHoldem, fetchHoldemConfig, fetchHoldemHistory, holdemAction } from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const GOLD = '#F5C84C';
const CREAM = '#FFF6DF';
const FELT = '#8B1A1A';
const INK = '#FDF3E4';
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♣', '♦'];
const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const DEFAULT_BET = 10;
const SOUND_KEY = 'novaplay:holdem:sound';
const TOAST_MS = 1900;
const HAND_NAME: Record<HoldemHandClass, string> = {
  ROYAL_FLUSH: 'Royal Flush',
  STRAIGHT_FLUSH: 'Straight Flush',
  FOUR_OF_A_KIND: 'Four of a Kind',
  FULL_HOUSE: 'Full House',
  FLUSH: 'Flush',
  STRAIGHT: 'Straight',
  THREE_OF_A_KIND: 'Three of a Kind',
  TWO_PAIR: 'Two Pair',
  PAIR: 'Pair',
  HIGH_CARD: 'High Card',
};
const FALLBACK_PAYS: HoldemConfig['antePays'] = [
  { hand: 'ROYAL_FLUSH', pays: 100 },
  { hand: 'STRAIGHT_FLUSH', pays: 20 },
  { hand: 'FOUR_OF_A_KIND', pays: 10 },
  { hand: 'FULL_HOUSE', pays: 3 },
  { hand: 'FLUSH', pays: 2 },
  { hand: 'STRAIGHT', pays: 0.75 },
  { hand: 'THREE_OF_A_KIND', pays: 0.75 },
  { hand: 'TWO_PAIR', pays: 0.75 },
  { hand: 'PAIR', pays: 0.75 },
  { hand: 'HIGH_CARD', pays: 0.75 },
];
const FALLBACK_CALL_PAYS = 0.75;
/** Slots: 0-1 player, 2-6 board, 7-8 dealer. */
const SLOTS = 9;

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

/** The class of the best hand in five to seven cards, for the live "your hand" label. */
function classOf(cards: number[]): HoldemHandClass {
  const values = cards.map((c) => (c % 13 === 0 ? 14 : (c % 13) + 1));
  const counts = new Map<number, number>();
  values.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
  const bySuit = [0, 1, 2, 3].map((s) => cards.filter((c) => Math.floor(c / 13) === s).map((c) => (c % 13 === 0 ? 14 : (c % 13) + 1)));
  const straightTop = (vals: number[]) => {
    const set = new Set(vals);
    if (set.has(14)) set.add(1);
    for (let t = 14; t >= 5; t--) if ([0, 1, 2, 3, 4].every((k) => set.has(t - k))) return t;
    return 0;
  };
  const flushSuit = bySuit.find((v) => v.length >= 5);
  if (flushSuit) {
    const sf = straightTop(flushSuit);
    if (sf === 14) return 'ROYAL_FLUSH';
    if (sf) return 'STRAIGHT_FLUSH';
  }
  const groups = [...counts.values()].sort((a, b) => b - a);
  if (groups[0] === 4) return 'FOUR_OF_A_KIND';
  if (groups[0] === 3 && (groups[1] ?? 0) >= 2) return 'FULL_HOUSE';
  if (flushSuit) return 'FLUSH';
  if (straightTop(values)) return 'STRAIGHT';
  if (groups[0] === 3) return 'THREE_OF_A_KIND';
  if (groups[0] === 2 && groups[1] === 2) return 'TWO_PAIR';
  if (groups[0] === 2) return 'PAIR';
  return 'HIGH_CARD';
}

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
        <SvgLinearGradient id="chBack" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#1F1F24" />
          <Stop offset="1" stopColor="#050506" />
        </SvgLinearGradient>
        <Pattern id="chWeave" width={w * 0.14} height={w * 0.14} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <Rect x={0} y={0} width={w * 0.14} height={w * 0.14} fill="none" stroke={GOLD} strokeOpacity={0.35} strokeWidth={0.8} />
        </Pattern>
      </Defs>
      <Rect x={0.75} y={0.75} width={w - 1.5} height={h - 1.5} rx={w * 0.08} fill="url(#chBack)" stroke={GOLD} strokeWidth={1.5} />
      <Rect x={inset} y={inset} width={w - inset * 2} height={h - inset * 2} rx={w * 0.05} fill="url(#chWeave)" stroke={GOLD} strokeOpacity={0.6} strokeWidth={1} />
      <Circle cx={w / 2} cy={h / 2} r={w * 0.19} fill="#7F1D1D" stroke={GOLD} strokeWidth={1.2} />
      <SvgText x={w / 2} y={h / 2 + w * 0.09} fontSize={w * 0.24} fill={GOLD} textAnchor="middle" fontWeight="bold">
        ♠
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
      <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: size * 0.26 }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function Background({ w, h }: { w: number; h: number }) {
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id="chBg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#17130C" />
          <Stop offset="0.55" stopColor="#0C0A07" />
          <Stop offset="1" stopColor="#050403" />
        </SvgLinearGradient>
        <RadialGradient id="chLamp" cx="50%" cy="42%" r="55%">
          <Stop offset="0" stopColor={GOLD} stopOpacity={0.16} />
          <Stop offset="1" stopColor={GOLD} stopOpacity={0} />
        </RadialGradient>
        <Pattern id="chDeco" width={46} height={46} patternUnits="userSpaceOnUse">
          <Path d="M23 4 L42 23 L23 42 L4 23 Z" fill="none" stroke={GOLD} strokeOpacity={0.05} strokeWidth={1} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill="url(#chBg)" />
      <Rect x={0} y={0} width={w} height={h} fill="url(#chDeco)" />
      <Rect x={0} y={0} width={w} height={h} fill="url(#chLamp)" />
    </Svg>
  );
}

/** The oval table: wooden rail with gold trim over red felt, with the dealer rule printed on an arc. */
function Table({ w, h }: { w: number; h: number }) {
  const rail = Math.max(10, w * 0.035);
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="chFelt" cx="50%" cy="45%" r="60%">
          <Stop offset="0" stopColor="#B32424" />
          <Stop offset="0.7" stopColor={FELT} />
          <Stop offset="1" stopColor="#4A0B0B" />
        </RadialGradient>
        <SvgLinearGradient id="chRail" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#6B3F1D" />
          <Stop offset="0.5" stopColor="#3B2210" />
          <Stop offset="1" stopColor="#1E1108" />
        </SvgLinearGradient>
        <Path id="chArc" d={`M${w * 0.14} ${h * 0.6} Q ${w / 2} ${h * 0.72} ${w * 0.86} ${h * 0.6}`} />
      </Defs>
      <Rect x={0} y={0} width={w} height={h} rx={h * 0.22} fill="url(#chRail)" />
      <Rect x={rail * 0.35} y={rail * 0.35} width={w - rail * 0.7} height={h - rail * 0.7} rx={h * 0.2} fill="none" stroke={GOLD} strokeOpacity={0.55} strokeWidth={1.2} />
      <Rect x={rail} y={rail} width={w - rail * 2} height={h - rail * 2} rx={h * 0.19} fill="url(#chFelt)" />
      <Rect x={rail + 7} y={rail + 7} width={w - rail * 2 - 14} height={h - rail * 2 - 14} rx={h * 0.17} fill="none" stroke={GOLD} strokeOpacity={0.35} strokeWidth={1} strokeDasharray="5 4" />
      <SvgText fill={GOLD} fillOpacity={0.55} fontSize={Math.max(8, w * 0.024)} fontWeight="bold" letterSpacing={1}>
        <TextPath href="#chArc" startOffset="50%" textAnchor="middle">
          DEALER QUALIFIES WITH 4s OR BETTER
        </TextPath>
      </SvgText>
    </Svg>
  );
}

function Logo({ width }: { width: number }) {
  return (
    <Svg width={width} height={width * 0.2} viewBox="0 0 300 60">
      <Defs>
        <SvgLinearGradient id="chLogo" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFF6D2" />
          <Stop offset="0.55" stopColor={GOLD} />
          <Stop offset="1" stopColor="#9A6A12" />
        </SvgLinearGradient>
      </Defs>
      <SvgText x={150} y={30} fontSize={27} fontWeight="bold" fontFamily="serif" fill="url(#chLogo)" stroke="#2A1600" strokeWidth={0.8} textAnchor="middle" letterSpacing={3}>
        CASINO HOLD'EM
      </SvgText>
      <Path d="M60 44 L118 44 M182 44 L240 44" stroke={GOLD} strokeOpacity={0.5} strokeWidth={1.2} />
      <SvgText x={150} y={48} fontSize={11} fontWeight="bold" fill={CREAM} fillOpacity={0.8} textAnchor="middle" letterSpacing={3}>
        ♠ ♥ POKER ♣ ♦
      </SvgText>
    </Svg>
  );
}

/** Home tile art: two hole cards over red felt with a chip. */
export function CasinoHoldemTileArt({ size }: { size: number }) {
  const w = size * 0.3;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size }} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="chtBg" cx="50%" cy="40%" r="70%">
            <Stop offset="0" stopColor="#B32424" />
            <Stop offset="1" stopColor="#2A0606" />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill="url(#chtBg)" />
        <Ellipse cx={50} cy={50} rx={46} ry={36} fill="none" stroke={GOLD} strokeOpacity={0.35} strokeWidth={0.8} strokeDasharray="3 2" />
      </Svg>
      <View style={{ position: 'absolute', left: size * 0.22, top: size * 0.12, transform: [{ rotate: '-12deg' }] }}>
        <CardFace card={0} w={w} />
      </View>
      <View style={{ position: 'absolute', left: size * 0.43, top: size * 0.1, transform: [{ rotate: '10deg' }] }}>
        <CardFace card={12} w={w} />
      </View>
      <View style={{ position: 'absolute', left: size * 0.66, top: size * 0.4 }}>
        <Chip size={size * 0.22} color="#1D4ED8" label="" />
      </View>
    </View>
  );
}

// ---------- screen ----------

type Banner = { title: string; sub: string; tone: 'win' | 'lose' | 'push' };

export default function CasinoHoldemScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<HoldemConfig | null>(null);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [hand, setHand] = useState<HoldemHand | null>(null);
  const [cards, setCards] = useState<(number | null)[]>(Array(SLOTS).fill(null));
  const [up, setUp] = useState<boolean[]>(Array(SLOTS).fill(false));
  const [busy, setBusy] = useState(false);
  const [dealing, setDealing] = useState(false);
  const [settled, setSettled] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [shownBalance, setShownBalance] = useState(coins);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [panel, setPanel] = useState<'history' | 'rules' | null>(null);
  const [history, setHistory] = useState<HoldemHand[] | null>(null);
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
  const glow = useRef(new Animated.Value(0)).current;
  const bannerAnim = useRef(new Animated.Value(0)).current;

  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const antePays = config?.antePays ?? FALLBACK_PAYS;
  const callPays = config?.callPays ?? FALLBACK_CALL_PAYS;
  const betLevels = useMemo(() => BET_LEVELS.filter((b) => b >= minStake && b <= maxStake), [minStake, maxStake]);
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

  /** Lays a hand out face up with no animation (resume, or after an error). */
  const showHand = useCallback(
    (h: HoldemHand) => {
      const next: (number | null)[] = Array(SLOTS).fill(null);
      h.playerCards.forEach((c, i) => (next[i] = c));
      h.board.forEach((c, i) => (next[2 + i] = c));
      h.dealerCards.forEach((c, i) => (next[7 + i] = c));
      // An open hand's turn, river and dealer cards lie face down.
      if (h.status === 'ACTIVE') [5, 6, 7, 8].forEach((i) => (next[i] = -1));
      setCards(next);
      setUp(next.map((c) => c !== null && c >= 0));
      flips.forEach((v) => v.setValue(1));
      setSettled(h.status !== 'ACTIVE');
    },
    [flips]
  );

  useEffect(() => {
    mountedRef.current = true;
    fetchHoldemConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => {});
    fetchActiveHoldem()
      .then(({ hand: open }) => {
        if (!open || !mountedRef.current) return;
        setHand(open);
        setBet(Number(open.ante));
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
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => {
      mountedRef.current = false;
      loop.stop();
      const players = playersRef.current;
      playersRef.current = null;
      if (players) Object.values(players).forEach((p) => p.remove());
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [glow, showHand]);

  useEffect(() => {
    if (!busyRef.current) setShownBalance(coins);
  }, [coins]);

  const showBanner = useCallback(
    (b: Banner) => {
      setBanner(b);
      bannerAnim.setValue(0);
      Animated.sequence([
        Animated.spring(bannerAnim, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
        Animated.delay(1700),
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
    if (bet > balanceRef.current) {
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
    let h: HoldemHand;
    try {
      h = await dealHoldem(bet);
    } catch (err) {
      showToast(errorMessage(err));
      if (previous && mountedRef.current) showHand(previous);
      finish();
      return;
    }
    if (!mountedRef.current) return;
    setShownBalance((b) => round2(b - bet));
    setHand(h);
    // Face-down cards land first: player's two, the board's five, the dealer's two.
    setCards(Array(SLOTS).fill(-1));
    await wait(200);
    for (let i = 0; i < 2; i++) await flipTo(i, h.playerCards[i]);
    await wait(120);
    for (let i = 0; i < 3; i++) await flipTo(2 + i, h.board[i]);
    if (!mountedRef.current) return;
    finish();
  }, [bet, flipTo, flips, hand, showHand, showToast]);

  const doAction = useCallback(
    async (action: 'CALL' | 'FOLD') => {
      if (busyRef.current || !hand || hand.status !== 'ACTIVE') return;
      if (action === 'CALL' && Number(hand.ante) * 2 > balanceRef.current) {
        showToast(`You need ₹${(Number(hand.ante) * 2).toFixed(2)} to call`);
        return;
      }
      busyRef.current = true;
      setBusy(true);
      let h: HoldemHand;
      try {
        h = await holdemAction(hand.id, action);
      } catch (err) {
        showToast(errorMessage(err));
        fetchActiveHoldem()
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
      if (action === 'CALL') setShownBalance((b) => round2(b - ante * 2));
      setHand({ ...h, status: 'ACTIVE' });
      // Turn and river, then the dealer's cards.
      await flipTo(5, h.board[3]);
      await wait(action === 'CALL' ? 260 : 60);
      await flipTo(6, h.board[4]);
      await wait(action === 'CALL' ? 420 : 60);
      await flipTo(7, h.dealerCards[0]);
      await flipTo(8, h.dealerCards[1]);
      if (!mountedRef.current) return;
      setHand(h);
      setSettled(true);
      const payout = Number(h.payout);
      if (payout > 0) setShownBalance((b) => round2(b + payout));
      const mine = h.player ? HAND_NAME[h.player.hand] : '';
      const theirs = h.dealer ? HAND_NAME[h.dealer.hand] : '';
      if (h.outcome === 'WIN') {
        play('win');
        showBanner({ title: 'YOU WIN', sub: `${mine} beats ${theirs} · ₹${payout.toFixed(2)}`, tone: 'win' });
      } else if (h.outcome === 'DEALER_NOT_QUALIFIED') {
        play('win');
        showBanner({ title: "DEALER DOESN'T QUALIFY", sub: `Ante paid · ₹${payout.toFixed(2)}`, tone: 'win' });
      } else if (h.outcome === 'TIE') {
        play('tick');
        showBanner({ title: 'PUSH', sub: `Both ${mine} · bets returned`, tone: 'push' });
      } else if (h.outcome === 'LOSE') {
        play('land');
        showBanner({ title: 'DEALER WINS', sub: `${theirs} beats ${mine}`, tone: 'lose' });
      } else {
        play('land');
        showBanner({ title: 'FOLDED', sub: `-₹${ante.toFixed(2)}`, tone: 'lose' });
      }
      refreshWallet().catch(() => {});
      finish();
    },
    [flipTo, hand, play, refreshWallet, showBanner, showToast]
  );

  const changeBet = (dir: -1 | 1) => {
    if (live || busy) return;
    const i = betLevels.indexOf(bet);
    const next = i < 0 ? betLevels.find((b) => (dir > 0 ? b > bet : b >= bet)) ?? bet : betLevels[Math.min(betLevels.length - 1, Math.max(0, i + dir))];
    setBet(next);
  };

  const scaleBet = (k: 0.5 | 2) => {
    if (live || busy) return;
    setBet((b) => Math.min(maxStake, Math.max(minStake, Math.round(b * k))));
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
      fetchHoldemHistory(30)
        .then((h) => mountedRef.current && setHistory(h))
        .catch(() => mountedRef.current && setHistory([]));
    }
  };

  // ---------- layout ----------
  const contentW = Math.min(W - 24, 460);
  const headerH = insets.top + 50;
  const compact = H < 760;
  const logoW = Math.min(contentW * 0.72, 300);
  const tw = tableBox?.w ?? contentW;
  const th = tableBox?.h ?? 420;
  const boardW = Math.min((tw - 80 - 4 * 6) / 5, 60, (th * 0.2) / 1.4);
  const holeW = Math.min(boardW * 1.15, 70);
  const ante = hand ? Number(hand.ante) : bet;
  const called = hand?.action === 'CALL';
  const playerBest = settled && hand?.player ? new Set(hand.player.best) : null;
  const dealerBest = settled && hand?.dealer ? new Set(hand.dealer.best) : null;
  const winnerBest = settled && hand ? (hand.outcome === 'LOSE' ? dealerBest : hand.outcome === 'FOLD' ? null : playerBest) : null;
  const liveClass = live && cards.slice(0, 5).every((c) => c !== null && c >= 0) && up.slice(0, 5).every(Boolean) ? classOf(cards.slice(0, 5) as number[]) : null;

  const slot = (i: number, w: number) => {
    const c = cards[i];
    const inBest = winnerBest && c !== null && c >= 0 ? winnerBest.has(c) : false;
    const dim = settled && winnerBest && !inBest && c !== null;
    return (
      <Animated.View key={i} style={{ transform: [{ scaleX: flips[i] }], opacity: dim ? 0.5 : 1 }}>
        {c === null ? (
          <View style={[styles.slot, { width: w, height: w * 1.4, borderRadius: w * 0.08 }]} />
        ) : (
          <View style={[styles.cardShadow, { borderRadius: w * 0.08 }, inBest && styles.cardBest]}>{up[i] && c >= 0 ? <CardFace card={c} w={w} /> : <CardBack w={w} />}</View>
        )}
      </Animated.View>
    );
  };

  let status: React.ReactNode = null;
  if (settled && hand?.outcome === 'FOLD' && hand.dealer) {
    status = (
      <Text style={styles.statusText}>
        You folded · the dealer had <Text style={{ color: CREAM }}>{HAND_NAME[hand.dealer.hand]}</Text>
      </Text>
    );
  } else if (settled && hand?.player && hand.dealer) {
    status = (
      <Text style={styles.statusText}>
        You: <Text style={{ color: GOLD }}>{HAND_NAME[hand.player.hand]}</Text> · Dealer: <Text style={{ color: hand.dealer.qualifies ? CREAM : '#FCA5A5' }}>{HAND_NAME[hand.dealer.hand]}</Text>
        {hand.dealer.qualifies ? '' : ' (no qualify)'}
      </Text>
    );
  } else if (liveClass) {
    status = (
      <Text style={styles.statusText}>
        Your hand: <Text style={{ color: GOLD }}>{HAND_NAME[liveClass]}</Text> · call or fold
      </Text>
    );
  } else if (!hand && !busy) status = <Text style={styles.statusText}>Beat the dealer's poker hand</Text>;

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
              <Table w={tw} h={th} />
              <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'space-between', paddingVertical: th * 0.06 }]}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={styles.seatLabel}>DEALER</Text>
                  <View style={[styles.row, { gap: 6 }]}>{[7, 8].map((i) => slot(i, holeW))}</View>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <View style={[styles.row, { gap: 6 }]}>{[2, 3, 4, 5, 6].map((i) => slot(i, boardW))}</View>
                </View>
                <View style={{ alignItems: 'center', width: '100%' }}>
                  <View style={[styles.row, { gap: 6 }]}>{[0, 1].map((i) => slot(i, holeW))}</View>
                  <Text style={[styles.seatLabel, { marginTop: 4 }]}>YOU</Text>
                  {/* Bet spots */}
                  <View style={[styles.spots, { left: tw * 0.07 }]}>
                    <View style={styles.spot}>{hand ? <Chip size={34} color="#1D4ED8" label={`${ante}`} /> : null}</View>
                    <Text style={styles.spotLabel}>ANTE</Text>
                  </View>
                  <View style={[styles.spots, { right: tw * 0.07 }]}>
                    <View style={styles.spot}>{called ? <Chip size={34} color="#B91C1C" label={`${ante * 2}`} /> : null}</View>
                    <Text style={styles.spotLabel}>CALL</Text>
                  </View>
                </View>
              </View>
            </>
          )}
        </View>

        <View style={styles.statusBox}>{status}</View>

        {/* Controls, the same height live or not */}
        <View style={{ minHeight: 118, justifyContent: 'flex-end' }}>
          {live && hand ? (
            <View style={styles.actRow}>
              <Pressable onPress={() => doAction('FOLD')} disabled={busy} style={({ pressed }) => [styles.foldBtn, busy && styles.dim, pressed && { transform: [{ scale: 0.97 }] }]} accessibilityLabel="Fold">
                <Text style={styles.foldText}>FOLD</Text>
                <Text style={styles.foldSub}>lose ₹{ante}</Text>
              </Pressable>
              <Pressable onPress={() => doAction('CALL')} disabled={busy} style={({ pressed }) => [styles.callBtn, busy && styles.dim, pressed && { transform: [{ scale: 0.97 }] }]} accessibilityLabel="Call">
                <LinearGradient colors={['#FFF1B0', GOLD, '#B7791F']} style={styles.callInner}>
                  <Text style={styles.callText}>CALL</Text>
                  <Text style={styles.callSub}>bet ₹{ante * 2} more</Text>
                </LinearGradient>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={[styles.betRow, busy && styles.dim]}>
                <View style={styles.betBox}>
                  <Pressable onPress={() => changeBet(-1)} style={styles.betBtn} hitSlop={6} accessibilityLabel="Lower bet">
                    <MaterialCommunityIcons name="minus" size={20} color="#2A1600" />
                  </Pressable>
                  <View style={styles.betValueBox}>
                    <Text style={styles.betLabel}>ANTE</Text>
                    <Text style={styles.betValue}>₹{bet}</Text>
                  </View>
                  <Pressable onPress={() => changeBet(1)} style={styles.betBtn} hitSlop={6} accessibilityLabel="Raise bet">
                    <MaterialCommunityIcons name="plus" size={20} color="#2A1600" />
                  </Pressable>
                </View>
                <Pressable onPress={() => scaleBet(0.5)} style={styles.chip} accessibilityLabel="Half bet">
                  <Text style={styles.chipText}>½</Text>
                </Pressable>
                <Pressable onPress={() => scaleBet(2)} style={styles.chip} accessibilityLabel="Double bet">
                  <Text style={styles.chipText}>2×</Text>
                </Pressable>
              </View>
              <Pressable onPress={doDeal} disabled={busy} style={({ pressed }) => [styles.dealBtn, pressed && { transform: [{ scale: 0.97 }] }]} accessibilityLabel="Deal">
                <LinearGradient colors={['#FFF1B0', GOLD, '#B7791F']} style={styles.dealInner}>
                  <MaterialCommunityIcons name="cards-playing" size={22} color="#2A1600" />
                  <Text style={styles.dealText}>{dealing ? 'DEALING' : 'DEAL'}</Text>
                  <Text style={styles.dealSub}>call is ₹{bet * 2}</Text>
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
              colors={banner.tone === 'win' ? ['#14532D', '#052E16'] : banner.tone === 'push' ? ['#3F3F46', '#18181B'] : ['#7F1D1D', '#2A0606']}
              style={[styles.bannerCard, { borderColor: banner.tone === 'win' ? GOLD : banner.tone === 'push' ? '#D4D4D8' : '#FCA5A5' }]}
            >
              <Text style={styles.bannerTitle}>{banner.title}</Text>
              <Text style={[styles.bannerSub, { color: banner.tone === 'win' ? GOLD : '#F4F4F5' }]}>{banner.sub}</Text>
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
            <ScrollView contentContainerStyle={{ padding: 14 }}>{panel === 'history' ? <History hands={history} /> : <Rules config={config} antePays={antePays} callPays={callPays} />}</ScrollView>
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

function Rules({ config, antePays, callPays }: { config: HoldemConfig | null; antePays: HoldemConfig['antePays']; callPays: number }) {
  return (
    <View>
      <Text style={styles.ruleHead}>How to play</Text>
      <Text style={styles.ruleLine}>Place your ante. You and the dealer each get two cards and three community cards (the flop) are dealt face up. Look at your hand, then fold — losing the ante — or call with a bet of twice the ante.</Text>
      <Text style={styles.ruleLine}>On a call the turn and river are dealt and the dealer shows both cards. You and the dealer each make the best five-card poker hand from your own two cards and the five on the board.</Text>
      <Text style={styles.ruleHead}>Who wins</Text>
      <Text style={styles.ruleLine}>• The dealer needs a pair of 4s or better to qualify. If the dealer doesn't qualify, your ante is paid from the table below and your call is returned.</Text>
      <Text style={styles.ruleLine}>• If the dealer qualifies and your hand is better, your ante is paid from the table and your call pays {fmtPays(callPays)}.</Text>
      <Text style={styles.ruleLine}>• Equal hands return both bets. If the dealer's hand is better, both bets lose.</Text>
      <Text style={styles.ruleHead}>Ante pays</Text>
      <View style={styles.ruleBox}>
        {antePays.map(({ hand, pays }) => (
          <View key={hand} style={styles.ruleRow}>
            <Text style={styles.ruleKey}>{HAND_NAME[hand]}</Text>
            <Text style={styles.ruleVal}>{fmtPays(pays)}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.ruleHead}>Game info</Text>
      <Text style={styles.ruleLine}>
        Return to player {config?.rtpPercent ? `${config.rtpPercent}%` : '—'} of all money bet (ante and calls) when every decision is the best one. Ante ₹{config?.minStake ?? 1} – ₹{config?.maxStake ?? 500}; max win per hand ₹{config?.maxPayout ?? 10000}.
      </Text>
      <Text style={styles.ruleLine}>All nine cards of a hand come from your provably-fair seeds, fixed when the hand is dealt (Settings → Provably Fair).</Text>
    </View>
  );
}

function History({ hands }: { hands: HoldemHand[] | null }) {
  if (hands === null) return <Text style={styles.ruleLine}>Loading…</Text>;
  if (hands.length === 0) return <Text style={styles.ruleLine}>No hands yet.</Text>;
  const label = (h: HoldemHand) => {
    if (h.outcome === 'FOLD') return 'Folded';
    if (h.outcome === 'DEALER_NOT_QUALIFIED') return `Dealer didn't qualify · ${h.player ? HAND_NAME[h.player.hand] : ''}`;
    if (h.outcome === 'WIN') return `Won · ${h.player ? HAND_NAME[h.player.hand] : ''} vs ${h.dealer ? HAND_NAME[h.dealer.hand] : ''}`;
    if (h.outcome === 'TIE') return `Push · ${h.player ? HAND_NAME[h.player.hand] : ''}`;
    return `Lost · ${h.dealer ? HAND_NAME[h.dealer.hand] : ''} vs ${h.player ? HAND_NAME[h.player.hand] : ''}`;
  };
  return (
    <View style={{ gap: 8 }}>
      {hands.map((h) => {
        const payout = Number(h.payout);
        const staked = Number(h.staked);
        return (
          <View key={h.id} style={styles.histRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.histCards}>
                {h.playerCards.map((c, i) => (
                  <CardFace key={`p${i}`} card={c} w={24} />
                ))}
                <View style={{ width: 8 }} />
                {h.board.map((c, i) => (
                  <CardFace key={`b${i}`} card={c} w={24} />
                ))}
              </View>
              <Text style={styles.histMain}>{label(h)}</Text>
              <Text style={styles.histSub}>
                ₹{staked.toFixed(2)} bet · {new Date(h.createdAt).toLocaleString()}
              </Text>
            </View>
            <Text style={[styles.histPay, { color: payout > staked ? GOLD : 'rgba(253,243,228,0.5)' }]}>{payout > 0 ? `+₹${payout.toFixed(2)}` : `-₹${staked.toFixed(2)}`}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050403' },
  dim: { opacity: 0.4 },
  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 6, zIndex: 3 },
  headBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(30,24,14,0.9)', borderWidth: 1, borderColor: 'rgba(245,200,76,0.45)' },
  headBalance: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: 'rgba(30,24,14,0.92)', borderWidth: 1.2, borderColor: GOLD },
  headBalanceText: { color: GOLD, fontWeight: '900', fontSize: 14 },
  body: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  card: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.18)' },
  cardCorner: { position: 'absolute', alignItems: 'center' },
  courtFrame: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.2 },
  cardShadow: { shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 5, borderWidth: 2, borderColor: 'transparent' },
  cardBest: { borderColor: GOLD, shadowColor: GOLD, shadowOpacity: 0.9, shadowRadius: 10 },
  slot: { borderWidth: 1.5, borderColor: 'rgba(245,200,76,0.35)', borderStyle: 'dashed', backgroundColor: 'rgba(0,0,0,0.12)' },
  seatLabel: { color: GOLD, fontWeight: '900', fontSize: 11, letterSpacing: 3, opacity: 0.8, marginBottom: 4 },
  spots: { position: 'absolute', bottom: 0, alignItems: 'center' },
  spot: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: 'rgba(245,200,76,0.55)', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.15)' },
  spotLabel: { color: GOLD, fontWeight: '900', fontSize: 9.5, letterSpacing: 1.5, marginTop: 3, opacity: 0.85 },
  statusBox: { alignItems: 'center', minHeight: 22, justifyContent: 'center', marginBottom: 6 },
  statusText: { color: 'rgba(253,243,228,0.88)', fontWeight: '800', fontSize: 13.5, textAlign: 'center' },
  actRow: { flexDirection: 'row', gap: 10 },
  foldBtn: { flex: 1, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(30,24,14,0.95)', borderWidth: 1.5, borderColor: 'rgba(252,165,165,0.6)' },
  foldText: { color: '#FCA5A5', fontWeight: '900', fontSize: 19, letterSpacing: 2 },
  foldSub: { color: 'rgba(252,165,165,0.7)', fontWeight: '800', fontSize: 11.5 },
  callBtn: { flex: 1.4, height: 64, borderRadius: 18, overflow: 'hidden', shadowColor: GOLD, shadowOpacity: 0.5, shadowRadius: 12, elevation: 8 },
  callInner: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 18, borderWidth: 2, borderColor: '#FFF3C4' },
  callText: { color: '#2A1600', fontWeight: '900', fontSize: 21, letterSpacing: 3 },
  callSub: { color: 'rgba(42,22,0,0.75)', fontWeight: '900', fontSize: 11.5 },
  betRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  betBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6, borderRadius: 16, backgroundColor: 'rgba(30,24,14,0.92)', borderWidth: 1.2, borderColor: 'rgba(245,200,76,0.45)' },
  betBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: GOLD },
  betValueBox: { flex: 1, alignItems: 'center' },
  betLabel: { color: 'rgba(253,243,228,0.55)', fontSize: 9.5, fontWeight: '900', letterSpacing: 1.5 },
  betValue: { color: INK, fontSize: 18, fontWeight: '900' },
  chip: { width: 50, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(30,24,14,0.92)', borderWidth: 1.2, borderColor: 'rgba(245,200,76,0.45)' },
  chipText: { color: GOLD, fontWeight: '900', fontSize: 16 },
  dealBtn: { height: 62, borderRadius: 20, overflow: 'hidden', marginTop: 10, shadowColor: GOLD, shadowOpacity: 0.45, shadowRadius: 14, elevation: 8 },
  dealInner: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 20, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  dealText: { color: '#2A1600', fontSize: 21, fontWeight: '900', letterSpacing: 3 },
  dealSub: { color: 'rgba(42,22,0,0.7)', fontSize: 11, fontWeight: '900' },
  bannerWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 16 },
  bannerCard: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 18, borderWidth: 2, alignItems: 'center', minWidth: 230 },
  bannerTitle: { color: '#FFFFFF', fontWeight: '900', fontSize: 20, letterSpacing: 1.5, fontFamily: 'serif', textAlign: 'center' },
  bannerSub: { fontWeight: '900', fontSize: 15, marginTop: 3, textAlign: 'center' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  sheet: { borderRadius: 18, backgroundColor: '#17130C', borderWidth: 1.5, borderColor: GOLD, overflow: 'hidden' },
  tabs: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(245,200,76,0.25)' },
  tab: { paddingHorizontal: 12, paddingVertical: 7, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  tabOn: { backgroundColor: 'rgba(245,200,76,0.14)', borderBottomWidth: 2, borderBottomColor: GOLD },
  tabText: { color: 'rgba(253,243,228,0.55)', fontWeight: '900', fontSize: 12, letterSpacing: 1.2 },
  tabTextOn: { color: GOLD },
  ruleHead: { color: GOLD, fontWeight: '900', fontSize: 13, letterSpacing: 1, marginTop: 12, marginBottom: 6 },
  ruleLine: { color: 'rgba(253,243,228,0.86)', fontSize: 12.5, lineHeight: 19, fontWeight: '600', marginTop: 4 },
  ruleBox: { borderRadius: 12, padding: 10, backgroundColor: 'rgba(245,200,76,0.07)', borderWidth: 1, borderColor: 'rgba(245,200,76,0.25)', gap: 6 },
  ruleRow: { flexDirection: 'row', alignItems: 'center' },
  ruleKey: { flex: 1, color: INK, fontWeight: '800', fontSize: 12.5 },
  ruleVal: { color: GOLD, fontWeight: '900', fontSize: 12.5 },
  histRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(245,200,76,0.15)' },
  histCards: { flexDirection: 'row', gap: 3, marginBottom: 6 },
  histMain: { color: INK, fontWeight: '800', fontSize: 13 },
  histSub: { color: 'rgba(253,243,228,0.5)', fontSize: 11, marginTop: 3 },
  histPay: { fontWeight: '900', fontSize: 14, marginLeft: 8 },
  toast: { position: 'absolute', alignSelf: 'center', top: '45%', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.85)', borderWidth: 1, borderColor: GOLD, maxWidth: '86%', zIndex: 6 },
  toastText: { color: INK, fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
