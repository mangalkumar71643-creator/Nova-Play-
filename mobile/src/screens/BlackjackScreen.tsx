import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, Path, Pattern, RadialGradient, Rect, Stop, Text as SvgText, TextPath, LinearGradient as SvgLinearGradient } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../api/client';
import { BlackjackAction, BlackjackConfig, BlackjackHand, BlackjackOutcome, blackjackAction, dealBlackjack, fetchActiveBlackjack, fetchBlackjackConfig, fetchBlackjackHistory } from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const GOLD = '#F4CF6B';
const GOLD_DEEP = '#B8862B';
const FELT_TEXT = 'rgba(244,207,107,0.78)';
const WIN = '#3EF08F';
const LOSE = '#FF5A6E';
const CHIPS = [1, 5, 10, 25, 100, 500];
const CHIP_COLORS: Record<number, string> = { 1: '#E8E8EE', 5: '#D7263D', 10: '#1F6FEB', 25: '#1E9E4A', 100: '#1A1A1F', 500: '#7C3AED' };
const DEFAULT_BET = 10;
const SOUND_KEY = 'novaplay:blackjack:sound';
const TOAST_MS = 1900;
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♣', '♦'];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

const run = (a: Animated.CompositeAnimation) => new Promise<void>((r) => a.start(() => r()));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function cardValue(card: number): number {
  const r = card % 13;
  return r === 0 ? 1 : Math.min(10, r + 1);
}

function handTotal(cards: number[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const v = cardValue(c);
    total += v;
    if (v === 1) aces++;
  }
  const soft = aces > 0 && total + 10 <= 21;
  return { total: soft ? total + 10 : total, soft };
}

/** Greedy chip breakdown for a stack (largest first, at most `max` chips). */
function chipsFor(amount: number, max = 6): number[] {
  const out: number[] = [];
  let left = Math.round(amount * 100) / 100;
  for (const v of [...CHIPS].reverse()) {
    while (left >= v - 1e-9 && out.length < max) {
      out.push(v);
      left = round2(left - v);
    }
  }
  if (out.length === 0) out.push(1);
  return out.reverse();
}

// ---------- art ----------

const CardFace = memo(function CardFace({ card, w }: { card: number; w: number }) {
  const h = w * 1.4;
  const rank = card % 13;
  const suit = Math.floor(card / 13);
  const red = suit === 1 || suit === 3;
  const color = red ? '#C8102E' : '#15161C';
  const label = RANKS[rank];
  const court = rank >= 10;
  const corner = (
    <>
      <Text style={[styles.cardRank, { color, fontSize: w * (label.length > 1 ? 0.25 : 0.29), lineHeight: w * 0.31 }]}>{label}</Text>
      <Text style={{ color, fontSize: w * 0.21, lineHeight: w * 0.23 }}>{SUITS[suit]}</Text>
    </>
  );
  return (
    <LinearGradient colors={['#FFFFFF', '#F6F4EC', '#E8E3D3']} style={[styles.card, { width: w, height: h, borderRadius: w * 0.09 }]}>
      <View style={[styles.cardCorner, { top: w * 0.05, left: w * 0.07 }]}>{corner}</View>
      <View style={[styles.cardCorner, { bottom: w * 0.05, right: w * 0.07, transform: [{ rotate: '180deg' }] }]}>{corner}</View>
      {court ? (
        <View style={[styles.courtFrame, { width: w * 0.52, height: h * 0.52, borderRadius: w * 0.06, borderColor: red ? '#E7A3AE' : '#B7BACB' }]}>
          <MaterialCommunityIcons name="crown" size={w * 0.17} color={GOLD_DEEP} />
          <Text style={[styles.courtLetter, { color, fontSize: w * 0.3, lineHeight: w * 0.34 }]}>{label}</Text>
          <Text style={{ color, fontSize: w * 0.15, lineHeight: w * 0.17 }}>{SUITS[suit]}</Text>
        </View>
      ) : rank === 0 ? (
        <Text style={{ color, fontSize: w * 0.66, lineHeight: w * 0.74 }}>{SUITS[suit]}</Text>
      ) : (
        <Text style={{ color, fontSize: w * 0.54, lineHeight: w * 0.62 }}>{SUITS[suit]}</Text>
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
        <SvgLinearGradient id="bjBack" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#9B1B30" />
          <Stop offset="1" stopColor="#4A0714" />
        </SvgLinearGradient>
        <Pattern id="bjLattice" width={w * 0.16} height={w * 0.16} patternUnits="userSpaceOnUse">
          <Path d={`M0 ${w * 0.08} L${w * 0.08} 0 L${w * 0.16} ${w * 0.08} L${w * 0.08} ${w * 0.16} Z`} fill="none" stroke={GOLD} strokeOpacity={0.35} strokeWidth={0.7} />
        </Pattern>
      </Defs>
      <Rect x={0.75} y={0.75} width={w - 1.5} height={h - 1.5} rx={w * 0.09} fill="url(#bjBack)" stroke="#FFFFFF" strokeWidth={1.5} />
      <Rect x={inset} y={inset} width={w - inset * 2} height={h - inset * 2} rx={w * 0.05} fill="url(#bjLattice)" stroke={GOLD} strokeOpacity={0.7} strokeWidth={1} />
      <Circle cx={w / 2} cy={h / 2} r={w * 0.17} fill="#4A0714" stroke={GOLD} strokeWidth={1.2} />
      <SvgText x={w / 2} y={h / 2 + w * 0.07} fontSize={w * 0.2} fontWeight="bold" fill={GOLD} textAnchor="middle" fontFamily="serif">
        21
      </SvgText>
    </Svg>
  );
});

const Chip = memo(function Chip({ value, size }: { value: number; size: number }) {
  const color = CHIP_COLORS[value] ?? '#1F6FEB';
  const r = size / 2;
  const ringR = r - size * 0.1;
  const circ = 2 * Math.PI * ringR;
  const light = value === 1;
  const text = String(value);
  const fontSize = size * (text.length > 2 ? 0.24 : 0.3);
  return (
    <Svg width={size} height={size}>
      <Circle cx={r} cy={r} r={r - 0.5} fill={color} stroke="#00000077" strokeWidth={1} />
      <Circle cx={r} cy={r} r={ringR} fill="none" stroke={light ? '#1F6FEB' : '#FFFFFF'} strokeWidth={size * 0.12} strokeDasharray={`${circ / 16} ${circ / 16}`} />
      <Circle cx={r} cy={r} r={size * 0.3} fill={light ? '#FFFFFF' : '#141414'} stroke={light ? '#1F6FEB' : '#FFFFFF'} strokeOpacity={0.7} strokeWidth={1.2} />
      <SvgText x={r} y={r + fontSize * 0.36} fontSize={fontSize} fontWeight="bold" fill={light ? '#1F2937' : '#FFFFFF'} textAnchor="middle">
        {text}
      </SvgText>
    </Svg>
  );
});

function ChipStack({ amount, size }: { amount: number; size: number }) {
  const chips = chipsFor(amount);
  return (
    <View style={{ width: size, height: size + (chips.length - 1) * size * 0.12 }}>
      {chips.map((v, i) => (
        <View key={i} style={{ position: 'absolute', left: 0, bottom: i * size * 0.12 }}>
          <Chip value={v} size={size} />
        </View>
      ))}
    </View>
  );
}

function Felt({ w, h, top, cfg }: { w: number; h: number; top: number; cfg: BlackjackConfig | null }) {
  const arcY = top + h * 0.47;
  const r = w * 0.62;
  const arc = `M ${w / 2 - r * 0.86} ${arcY - r * 0.1} A ${r} ${r} 0 0 0 ${w / 2 + r * 0.86} ${arcY - r * 0.1}`;
  const arc2 = `M ${w / 2 - r * 0.7} ${arcY + r * 0.1} A ${r * 0.82} ${r * 0.82} 0 0 0 ${w / 2 + r * 0.7} ${arcY + r * 0.1}`;
  return (
    <Svg width={w} height={top + h + 200} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="bjFelt" cx="50%" cy="42%" r="75%">
          <Stop offset="0" stopColor="#13824F" />
          <Stop offset="0.55" stopColor="#0A5C37" />
          <Stop offset="1" stopColor="#03281A" />
        </RadialGradient>
        <Pattern id="bjWeave" width={4} height={4} patternUnits="userSpaceOnUse">
          <Rect x={0} y={0} width={1} height={1} fill="#FFFFFF" opacity={0.035} />
          <Rect x={2} y={2} width={1} height={1} fill="#000000" opacity={0.05} />
        </Pattern>
        <SvgLinearGradient id="bjWood" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#7A4A24" />
          <Stop offset="0.45" stopColor="#4B2A12" />
          <Stop offset="1" stopColor="#24130A" />
        </SvgLinearGradient>
        <Path id="bjArc" d={arc} />
        <Path id="bjArc2" d={arc2} />
      </Defs>
      <Rect x={0} y={0} width={w} height={top + h + 200} fill="url(#bjFelt)" />
      <Rect x={0} y={0} width={w} height={top + h + 200} fill="url(#bjWeave)" />
      {/* Dealer's rail at the top edge of the table */}
      <Ellipse cx={w / 2} cy={top - w * 0.9} rx={w * 1.05} ry={w * 1.0} fill="none" stroke="url(#bjWood)" strokeWidth={22} />
      <Ellipse cx={w / 2} cy={top - w * 0.9} rx={w * 1.05 + 11} ry={w * 1.0 + 11} fill="none" stroke={GOLD} strokeOpacity={0.55} strokeWidth={1.4} />
      {/* Printed felt lines */}
      <Path d={arc} fill="none" stroke={GOLD} strokeOpacity={0.4} strokeWidth={1.2} transform={`translate(0 ${-18})`} />
      <SvgText fill={FELT_TEXT} fontSize={Math.min(17, w * 0.043)} fontWeight="bold" fontFamily="serif" letterSpacing={2}>
        <TextPath href="#bjArc" startOffset="50%" textAnchor="middle">
          {`BLACKJACK PAYS ${cfg?.blackjackPays ?? 2.2}x`}
        </TextPath>
      </SvgText>
      <SvgText fill={FELT_TEXT} fontSize={Math.min(11, w * 0.029)} fontWeight="bold" letterSpacing={1.6} opacity={0.85}>
        <TextPath href="#bjArc2" startOffset="50%" textAnchor="middle">
          {`DEALER STANDS ON ALL 17s · INSURANCE PAYS ${round2((cfg?.insurancePays ?? 2.9) - 1)} TO 1`}
        </TextPath>
      </SvgText>
    </Svg>
  );
}

function Shoe({ w }: { w: number }) {
  return (
    <Svg width={w} height={w * 0.9} viewBox="0 0 100 90">
      <Defs>
        <SvgLinearGradient id="bjShoe" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#2B2B33" />
          <Stop offset="1" stopColor="#0B0B0F" />
        </SvgLinearGradient>
      </Defs>
      <Rect x={16} y={14} width={70} height={52} rx={4} fill="#4A0714" stroke={GOLD} strokeWidth={1} transform="rotate(-12 50 40)" />
      <Path d="M8 34 L92 20 L96 70 L12 82 Z" fill="url(#bjShoe)" stroke={GOLD} strokeWidth={1.6} />
      <Path d="M14 40 L88 28" stroke={GOLD} strokeOpacity={0.5} strokeWidth={1} />
      <Circle cx={80} cy={58} r={4} fill={GOLD} />
    </Svg>
  );
}

/** Home tile art: an Ace and a King fanned over green felt. */
export function BlackjackTileArt({ size }: { size: number }) {
  const cw = size * 0.3;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size }} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="bjtFelt" cx="50%" cy="38%" r="70%">
            <Stop offset="0" stopColor="#14925A" />
            <Stop offset="1" stopColor="#04301E" />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill="url(#bjtFelt)" />
        <Ellipse cx={50} cy={-62} rx={92} ry={86} fill="none" stroke="#5A3418" strokeWidth={8} />
        <Ellipse cx={50} cy={-62} rx={96} ry={90} fill="none" stroke={GOLD} strokeOpacity={0.6} strokeWidth={0.8} />
      </Svg>
      <View style={{ position: 'absolute', left: size * 0.22, top: size * 0.14, transform: [{ rotate: '-12deg' }] }}>
        <CardFace card={0} w={cw} />
      </View>
      <View style={{ position: 'absolute', left: size * 0.44, top: size * 0.12, transform: [{ rotate: '10deg' }] }}>
        <CardFace card={25} w={cw} />
      </View>
    </View>
  );
}

// ---------- table state ----------

type Slot = {
  key: number;
  zone: 'D' | 'P';
  hand: number;
  idx: number;
  /** null while the card is face down (the dealer's hole card). */
  card: number | null;
  sideways: boolean;
  x: Animated.Value;
  y: Animated.Value;
  rot: Animated.Value;
  flip: Animated.Value;
  opacity: Animated.Value;
};

type Banner = { title: string; sub: string; tone: 'win' | 'lose' | 'push' | 'bj' };

const OUTCOME_LABEL: Record<BlackjackOutcome, string> = { BLACKJACK: 'BLACKJACK', WIN: 'WIN', PUSH: 'PUSH', LOSE: 'LOSE', BUST: 'BUST' };

export default function BlackjackScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<BlackjackConfig | null>(null);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [hand, setHand] = useState<BlackjackHand | null>(null);
  const [slots, setSlotsState] = useState<Slot[]>([]);
  const [handsShown, setHandsShown] = useState(1);
  const [busy, setBusy] = useState(false);
  const [showOutcome, setShowOutcome] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [shownBalance, setShownBalance] = useState(coins);
  const [panel, setPanel] = useState<'history' | 'rules' | null>(null);
  const [history, setHistory] = useState<BlackjackHand[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const slotsRef = useRef<Slot[]>([]);
  const keyRef = useRef(1);
  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;
  const balanceRef = useRef(shownBalance);
  balanceRef.current = shownBalance;
  const handsShownRef = useRef(1);
  const playersRef = useRef<{ tick: AudioPlayer; win: AudioPlayer; land: AudioPlayer } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerAnim = useRef(new Animated.Value(0)).current;
  const activeGlow = useRef(new Animated.Value(0)).current;

  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;

  // ---------- layout ----------
  const headerH = insets.top + 50;
  const controlsH = 150 + insets.bottom;
  const feltTop = headerH;
  const feltH = H - headerH - controlsH;
  const cardW = Math.round(Math.min(W * 0.2, feltH * 0.16, 92));
  const cardH = cardW * 1.4;
  const dealerY = feltTop + feltH * 0.12;
  const playerY = feltTop + feltH * 0.55;
  const circleY = feltTop + feltH * 0.9;
  const shoeW = Math.min(W * 0.2, 90);
  const shoeX = W - shoeW - 8;
  const shoeY = feltTop - 4;

  const handCenter = useCallback((h: number, count: number) => (count === 1 ? W / 2 : W / 2 + (h === 0 ? -1 : 1) * W * 0.25), [W]);

  const targetFor = useCallback(
    (s: Slot, all: Slot[], count: number) => {
      if (s.zone === 'D') {
        const n = all.filter((o) => o.zone === 'D').length;
        return { x: W / 2 - cardW / 2 + (s.idx - (n - 1) / 2) * cardW * 0.66, y: dealerY, rot: 0 };
      }
      const n = all.filter((o) => o.zone === 'P' && o.hand === s.hand).length;
      const cx = handCenter(s.hand, count);
      const spread = count === 2 ? 0.3 : 0.36;
      const x = cx - cardW / 2 + (s.idx - (n - 1) / 2) * cardW * spread;
      const y = playerY - s.idx * cardW * 0.16 - (s.sideways ? cardW * 0.1 : 0);
      return { x, y, rot: s.sideways ? 90 : (s.idx - (n - 1) / 2) * 2 };
    },
    [W, cardW, dealerY, handCenter, playerY]
  );

  const setSlots = useCallback((next: Slot[]) => {
    slotsRef.current = next;
    if (mountedRef.current) setSlotsState(next);
  }, []);

  const setHands = useCallback((n: number) => {
    handsShownRef.current = n;
    setHandsShown(n);
  }, []);

  const relayout = useCallback(
    (ms = 260) => {
      const all = slotsRef.current;
      return run(
        Animated.parallel(
          all.map((s) => {
            const t = targetFor(s, all, handsShownRef.current);
            return Animated.parallel([
              Animated.timing(s.x, { toValue: t.x, duration: ms, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
              Animated.timing(s.y, { toValue: t.y, duration: ms, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
              Animated.timing(s.rot, { toValue: t.rot, duration: ms, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            ]);
          })
        )
      );
    },
    [targetFor]
  );

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

  const makeSlot = useCallback(
    (zone: 'D' | 'P', h: number, idx: number, card: number | null, sideways = false, placed?: { x: number; y: number; rot: number }): Slot => ({
      key: keyRef.current++,
      zone,
      hand: h,
      idx,
      card,
      sideways,
      x: new Animated.Value(placed ? placed.x : shoeX + shoeW * 0.2),
      y: new Animated.Value(placed ? placed.y : shoeY + shoeW * 0.1),
      rot: new Animated.Value(placed ? placed.rot : -20),
      flip: new Animated.Value(placed && card !== null ? 1 : 0),
      opacity: new Animated.Value(1),
    }),
    [shoeW, shoeX, shoeY]
  );

  /** A card slides out of the shoe to its place (siblings make room) and turns over unless it is the hole card. */
  const dealCard = useCallback(
    async (zone: 'D' | 'P', h: number, idx: number, card: number | null, sideways = false) => {
      const s = makeSlot(zone, h, idx, card, sideways);
      setSlots([...slotsRef.current, s]);
      play('tick');
      await relayout(300);
      if (card !== null) await run(Animated.timing(s.flip, { toValue: 1, duration: 220, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    },
    [makeSlot, play, relayout, setSlots]
  );

  /** Puts a hand on the table at once (resuming a hand after reopening the game). */
  const placeHand = useCallback(
    (hd: BlackjackHand) => {
      const count = hd.hands.length;
      handsShownRef.current = count;
      setHandsShown(count);
      const draft: Slot[] = [];
      hd.dealer.forEach((c, i) => draft.push(makeSlot('D', 0, i, c)));
      if (hd.dealerHidden) draft.push(makeSlot('D', 0, 1, null));
      hd.hands.forEach((seat, h) => seat.cards.forEach((c, i) => draft.push(makeSlot('P', h, i, c, seat.doubled && i === 2))));
      const placed = draft.map((s) => {
        const t = targetFor(s, draft, count);
        return makeSlot(s.zone, s.hand, s.idx, s.card, s.sideways, t);
      });
      setSlots(placed);
    },
    [makeSlot, setSlots, targetFor]
  );

  useEffect(() => {
    mountedRef.current = true;
    fetchBlackjackConfig()
      .then((c) => mountedRef.current && setConfig(c))
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
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(activeGlow, { toValue: 1, duration: 650, useNativeDriver: false }),
        Animated.timing(activeGlow, { toValue: 0, duration: 650, useNativeDriver: false }),
      ])
    );
    glow.start();
    return () => {
      mountedRef.current = false;
      glow.stop();
      const players = playersRef.current;
      playersRef.current = null;
      if (players) Object.values(players).forEach((p) => p.remove());
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [activeGlow]);

  // Pick up an unfinished hand. The table can resize before the reply
  // arrives, so it is placed with the latest layout.
  const placeHandRef = useRef(placeHand);
  placeHandRef.current = placeHand;
  useEffect(() => {
    fetchActiveBlackjack()
      .then(({ hand: open }) => {
        if (!open || !mountedRef.current) return;
        setHand(open);
        setBet(Number(open.stake));
        placeHandRef.current(open);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!busyRef.current) setShownBalance(coins);
  }, [coins]);

  // The table size can settle after the first render (or change); keep the cards where they belong.
  useEffect(() => {
    if (!busyRef.current && slotsRef.current.length > 0) relayout(0);
  }, [relayout]);

  const showBanner = useCallback(
    (b: Banner) => {
      setBanner(b);
      bannerAnim.setValue(0);
      Animated.sequence([
        Animated.spring(bannerAnim, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
        Animated.delay(1500),
        Animated.timing(bannerAnim, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]).start(() => mountedRef.current && setBanner(null));
    },
    [bannerAnim]
  );

  /** Brings the table in line with the server's hand: moves split cards, deals new cards, reveals the dealer and settles. */
  const syncTo = useCallback(
    async (next: BlackjackHand) => {
      // A split: the second card moves over to start the second hand.
      if (next.hands.length === 2 && handsShownRef.current === 1) {
        const second = slotsRef.current.find((s) => s.zone === 'P' && s.hand === 0 && s.idx === 1);
        if (second) {
          setSlots(slotsRef.current.map((s) => (s === second ? { ...s, hand: 1, idx: 0 } : s)));
          setHands(2);
          await relayout(360);
        }
      }
      for (let h = 0; h < next.hands.length; h++) {
        const seat = next.hands[h];
        const have = slotsRef.current.filter((s) => s.zone === 'P' && s.hand === h).length;
        for (let i = have; i < seat.cards.length; i++) {
          await dealCard('P', h, i, seat.cards[i], seat.doubled && i === 2);
          await sleep(90);
        }
      }
      if (next.phase === 'DONE') {
        await sleep(250);
        const hole = slotsRef.current.find((s) => s.zone === 'D' && s.idx === 1);
        if (hole && hole.card === null) {
          const revealed = { ...hole, card: next.dealer[1] };
          setSlots(slotsRef.current.map((s) => (s === hole ? revealed : s)));
          await run(Animated.timing(revealed.flip, { toValue: 1, duration: 260, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
          play('tick');
        }
        for (let i = 2; i < next.dealer.length; i++) {
          await sleep(380);
          await dealCard('D', 0, i, next.dealer[i]);
        }
        await sleep(200);
      }
    },
    [dealCard, play, relayout, setHands, setSlots]
  );

  const settle = useCallback(
    (next: BlackjackHand) => {
      const payout = Number(next.payout);
      const staked = Number(next.totalStake);
      setShowOutcome(true);
      setShownBalance((b) => round2(b + payout));
      const bj = next.hands.some((h) => h.outcome === 'BLACKJACK');
      if (payout > staked) {
        play('win');
        showBanner({ title: bj ? 'BLACKJACK!' : 'YOU WIN', sub: `₹${payout.toFixed(2)}`, tone: bj ? 'bj' : 'win' });
      } else if (payout === staked && payout > 0) {
        showBanner({ title: 'PUSH', sub: `₹${payout.toFixed(2)} returned`, tone: 'push' });
      } else {
        play('land');
        showBanner({ title: next.dealerBlackjack ? 'DEALER BLACKJACK' : 'DEALER WINS', sub: payout > 0 ? `₹${payout.toFixed(2)} back` : `-₹${staked.toFixed(2)}`, tone: 'lose' });
      }
      refreshWallet().catch(() => {});
    },
    [play, refreshWallet, showBanner]
  );

  const clearTable = useCallback(async () => {
    const old = slotsRef.current;
    if (old.length === 0) return;
    await run(
      Animated.parallel(
        old.flatMap((s) => [
          Animated.timing(s.x, { toValue: -cardW * 1.5, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.timing(s.y, { toValue: feltTop - cardH, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.timing(s.opacity, { toValue: 0, duration: 320, useNativeDriver: true }),
        ])
      )
    );
    setSlots([]);
  }, [cardH, cardW, feltTop, setSlots]);

  const doDeal = useCallback(async () => {
    if (busyRef.current) return;
    const stake = bet;
    if (stake < minStake) {
      showToast(`Minimum bet is ₹${minStake}`);
      return;
    }
    if (stake > balanceRef.current) {
      showToast('Insufficient balance');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setShowOutcome(false);
    setBanner(null);
    const clearing = clearTable();
    let next: BlackjackHand;
    try {
      next = await dealBlackjack(stake);
    } catch (err) {
      await clearing;
      showToast(errorMessage(err));
      busyRef.current = false;
      setBusy(false);
      return;
    }
    await clearing;
    if (!mountedRef.current) return;
    setShownBalance((b) => round2(b - stake));
    setHands(1);
    setHand({ ...next, phase: next.phase === 'DONE' ? 'PLAYER' : next.phase, actions: [] });
    // Dealing order: player, dealer up card, player, dealer hole card (face down).
    await dealCard('P', 0, 0, next.hands[0].cards[0]);
    await dealCard('D', 0, 0, next.dealer[0]);
    await dealCard('P', 0, 1, next.hands[0].cards[1]);
    await dealCard('D', 0, 1, null);
    await syncTo(next);
    if (!mountedRef.current) return;
    setHand(next);
    if (next.phase === 'DONE') settle(next);
    busyRef.current = false;
    setBusy(false);
  }, [bet, clearTable, dealCard, minStake, setHands, settle, showToast, syncTo]);

  const doAction = useCallback(
    async (action: BlackjackAction) => {
      if (busyRef.current || !hand) return;
      const seat = hand.hands[hand.active];
      const extra = action === 'double' || action === 'split' ? seat.stake : action === 'insurance' ? Math.floor((Number(hand.stake) / 2) * 100 + 1e-9) / 100 : 0;
      if (extra > balanceRef.current) {
        showToast('Insufficient balance');
        return;
      }
      busyRef.current = true;
      setBusy(true);
      let next: BlackjackHand;
      try {
        next = await blackjackAction(hand.id, action);
      } catch (err) {
        showToast(errorMessage(err));
        // The hand may have moved on elsewhere; pick up its latest state.
        fetchActiveBlackjack()
          .then(({ hand: open }) => {
            if (open && mountedRef.current) {
              setHand(open);
              placeHandRef.current(open);
            }
          })
          .catch(() => {});
        busyRef.current = false;
        setBusy(false);
        return;
      }
      if (!mountedRef.current) return;
      if (extra > 0) setShownBalance((b) => round2(b - extra));
      setHand({ ...next, phase: next.phase === 'DONE' ? 'PLAYER' : next.phase, actions: [] });
      await syncTo(next);
      if (!mountedRef.current) return;
      setHand(next);
      if (next.phase === 'DONE') settle(next);
      busyRef.current = false;
      setBusy(false);
    },
    [hand, settle, showToast, syncTo]
  );

  const live = hand?.status === 'ACTIVE';
  const betting = !live && !busy;

  const addChip = (v: number) => {
    if (!betting) return;
    const next = round2(bet + v);
    if (next > maxStake) {
      showToast(`Maximum bet is ₹${maxStake}`);
      return;
    }
    play('tick');
    setBet(next);
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
      fetchBlackjackHistory(30)
        .then((h) => mountedRef.current && setHistory(h))
        .catch(() => mountedRef.current && setHistory([]));
    }
  };

  // ---------- derived view ----------
  const dealerSlots = slots.filter((s) => s.zone === 'D');
  const dealerVisible = dealerSlots.filter((s) => s.card !== null).map((s) => s.card as number);
  const dealerTotal = dealerVisible.length ? handTotal(dealerVisible) : null;
  const seatsShown = Array.from({ length: handsShown }, (_, h) => slots.filter((s) => s.zone === 'P' && s.hand === h).map((s) => s.card as number));
  const actions = hand && live && !busy ? hand.actions : [];
  const activeSeat = live && hand && hand.phase === 'PLAYER' ? hand.active : -1;
  const totalLabel = (cards: number[]) => {
    const t = handTotal(cards);
    if (cards.length === 2 && t.total === 21) return '21';
    return t.soft && t.total < 21 ? `${t.total - 10}/${t.total}` : String(t.total);
  };

  return (
    <View style={styles.root}>
      <Felt w={W} h={feltH} top={feltTop} cfg={config} />

      {/* Header */}
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

      <View style={{ position: 'absolute', left: shoeX, top: shoeY + 44 }} pointerEvents="none">
        <Shoe w={shoeW} />
      </View>

      {/* Dealer total */}
      {dealerTotal && (
        <View style={[styles.totalBadge, { top: dealerY + cardH + 8, alignSelf: 'center' }]} pointerEvents="none">
          <Text style={styles.totalLabel}>DEALER</Text>
          <Text style={[styles.totalText, dealerTotal.total > 21 && { color: LOSE }]}>{dealerVisible.length === 2 && dealerTotal.total === 21 && showOutcome ? 'BJ' : dealerTotal.total > 21 ? `${dealerTotal.total} BUST` : totalLabel(dealerVisible)}</Text>
        </View>
      )}

      {/* Betting circles and chip stacks */}
      {Array.from({ length: handsShown }, (_, h) => {
        const cx = handCenter(h, handsShown);
        const amount = hand && (live || showOutcome || busy) ? hand.hands[h]?.stake ?? bet : bet;
        const ring = Math.min(W * 0.18, feltH * 0.14, 80);
        return (
          <View key={h} pointerEvents="none" style={{ position: 'absolute', left: cx - ring / 2, top: circleY - ring / 2, width: ring, height: ring, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View
              style={[
                styles.betRing,
                { width: ring, height: ring, borderRadius: ring / 2 },
                activeSeat === h && handsShown === 2 && { borderColor: activeGlow.interpolate({ inputRange: [0, 1], outputRange: ['rgba(244,207,107,0.5)', '#FFF3B0'] }) },
              ]}
            />
            {amount > 0 && <ChipStack amount={amount} size={ring * 0.52} />}
            <View style={styles.stakeTag}>
              <Text style={styles.stakeText}>₹{amount}</Text>
            </View>
          </View>
        );
      })}

      {/* Cards */}
      {slots.map((s) => (
        <Animated.View
          key={s.key}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: cardW,
            height: cardH,
            opacity: s.opacity,
            transform: [{ translateX: s.x }, { translateY: s.y }, { rotate: s.rot.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] }) }],
          }}
        >
          <Animated.View style={[StyleSheet.absoluteFill, styles.cardShadow, { transform: [{ scaleX: s.flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0, 0] }) }] }]}>
            <CardBack w={cardW} />
          </Animated.View>
          {s.card !== null && (
            <Animated.View style={[StyleSheet.absoluteFill, styles.cardShadow, { transform: [{ scaleX: s.flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] }) }] }]}>
              <CardFace card={s.card} w={cardW} />
            </Animated.View>
          )}
        </Animated.View>
      ))}

      {/* Player totals and outcomes */}
      {seatsShown.map((cards, h) => {
        if (cards.length === 0) return null;
        const cx = handCenter(h, handsShown);
        const seat = hand?.hands[h];
        const outcome = showOutcome && seat?.outcome ? seat.outcome : null;
        const t = handTotal(cards);
        return (
          <React.Fragment key={h}>
            <View pointerEvents="none" style={[styles.seatBadgeWrap, { left: cx - 90, top: playerY + cardH + 4 }]}>
              <View style={[styles.totalBadge, styles.totalBadgeStatic, activeSeat === h && styles.totalBadgeActive, t.total > 21 && { borderColor: LOSE }]}>
                <Text style={[styles.totalText, t.total > 21 && { color: LOSE }]}>{t.total > 21 ? `${t.total} BUST` : totalLabel(cards)}</Text>
              </View>
            </View>
            {outcome && (
              <View pointerEvents="none" style={[styles.seatBadgeWrap, { left: cx - 90, top: playerY - (cards.length - 1) * cardW * 0.16 - 34 }]}>
                <View style={[styles.outcomePill, { backgroundColor: outcome === 'BLACKJACK' ? GOLD : outcome === 'WIN' ? WIN : outcome === 'PUSH' ? '#9CA3AF' : LOSE }]}>
                  <Text style={styles.outcomeText} numberOfLines={1}>
                    {OUTCOME_LABEL[outcome]}
                    {seat && seat.payout > 0 ? ` ₹${seat.payout.toFixed(2)}` : ''}
                  </Text>
                </View>
              </View>
            )}
          </React.Fragment>
        );
      })}

      {banner && (
        <View pointerEvents="none" style={[styles.bannerWrap, { top: feltTop + feltH * 0.36 }]}>
          <Animated.View style={{ opacity: bannerAnim, transform: [{ scale: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
            <LinearGradient
              colors={banner.tone === 'bj' ? ['#FFE9A3', '#E0A93B'] : banner.tone === 'win' ? ['#0E5B35', '#063A22'] : banner.tone === 'push' ? ['#374151', '#1F2937'] : ['#5B0E1A', '#2E050C']}
              style={[styles.bannerCard, { borderColor: banner.tone === 'lose' ? LOSE : banner.tone === 'push' ? '#9CA3AF' : GOLD }]}
            >
              <Text style={[styles.bannerTitle, { fontSize: banner.title.length > 12 ? Math.min(22, W * 0.052) : 26 }, banner.tone === 'bj' && { color: '#3A2300' }]} numberOfLines={1}>
                {banner.title}
              </Text>
              <Text style={[styles.bannerSub, banner.tone === 'bj' && { color: '#3A2300' }, banner.tone === 'win' && { color: WIN }]}>{banner.sub}</Text>
            </LinearGradient>
          </Animated.View>
        </View>
      )}

      {/* Controls */}
      <View style={[styles.controls, { height: controlsH, paddingBottom: insets.bottom + 10 }]}>
        <LinearGradient colors={['#3B220F', '#20120A']} style={StyleSheet.absoluteFill} />
        <View style={styles.railEdge} />
        {live && hand?.phase === 'INSURANCE' && !busy ? (
          <View style={styles.insBox}>
            <Text style={styles.insTitle}>INSURANCE?</Text>
            <Text style={styles.insSub}>
              Dealer shows an Ace. Insure for ₹{(Math.floor((Number(hand.stake) / 2) * 100 + 1e-9) / 100).toFixed(2)} — pays {round2((config?.insurancePays ?? 2.9) - 1)} to 1 if the dealer has blackjack.
            </Text>
            <View style={styles.row}>
              <Pressable onPress={() => doAction('noInsurance')} style={[styles.bigBtn, styles.btnDark]} accessibilityLabel="No insurance">
                <Text style={styles.bigBtnText}>NO</Text>
              </Pressable>
              <Pressable onPress={() => doAction('insurance')} style={[styles.bigBtn, styles.btnGold]} accessibilityLabel="Take insurance">
                <Text style={[styles.bigBtnText, { color: '#2A1600' }]}>YES</Text>
              </Pressable>
            </View>
          </View>
        ) : live ? (
          <View style={styles.actionRow}>
            {(
              [
                ['double', 'DOUBLE', 'numeric-2-box-multiple-outline', '#1F6FEB'],
                ['hit', 'HIT', 'plus-thick', '#16A34A'],
                ['stand', 'STAND', 'hand-back-right', '#DC2626'],
                ['split', 'SPLIT', 'call-split', '#7C3AED'],
              ] as const
            ).map(([a, label, icon, color]) => {
              const enabled = actions.includes(a);
              return (
                <Pressable key={a} onPress={() => enabled && doAction(a)} disabled={!enabled} style={[styles.actBtn, !enabled && styles.dim]} accessibilityLabel={label}>
                  <View style={[styles.actCircle, { backgroundColor: color }]}>
                    <MaterialCommunityIcons name={icon} size={26} color="#FFFFFF" />
                  </View>
                  <Text style={styles.actText}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <View style={styles.chipRow}>
              {CHIPS.filter((c) => c >= minStake && c <= maxStake).map((v) => (
                <Pressable key={v} onPress={() => addChip(v)} disabled={!betting} style={({ pressed }) => [{ transform: [{ translateY: pressed ? 2 : 0 }] }, !betting && styles.dim]} accessibilityLabel={`Add ₹${v}`}>
                  <Chip value={v} size={Math.min(48, (W - 40) / 7)} />
                </Pressable>
              ))}
            </View>
            <View style={styles.row}>
              <Pressable onPress={() => betting && setBet(0)} disabled={!betting} style={[styles.smallBtn, !betting && styles.dim]} accessibilityLabel="Clear bet">
                <MaterialCommunityIcons name="close-circle-outline" size={18} color={GOLD} />
                <Text style={styles.smallBtnText}>CLEAR</Text>
              </Pressable>
              <Pressable onPress={() => betting && setBet((b) => Math.min(maxStake, round2(b * 2)))} disabled={!betting} style={[styles.smallBtn, !betting && styles.dim]} accessibilityLabel="Double bet">
                <Text style={styles.smallBtnText}>2×</Text>
              </Pressable>
              <Pressable onPress={doDeal} disabled={!betting || bet <= 0} style={({ pressed }) => [styles.dealBtn, (!betting || bet <= 0) && styles.dim, pressed && { transform: [{ scale: 0.97 }] }]} accessibilityLabel="Deal">
                <LinearGradient colors={['#FFF1B0', '#F5C542', '#B7791F']} style={styles.dealInner}>
                  <Text style={styles.dealText}>{busy ? 'DEALING' : `DEAL ₹${bet}`}</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        )}
      </View>

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
            <ScrollView contentContainerStyle={{ padding: 14 }}>{panel === 'history' ? <History hands={history} /> : <Rules config={config} />}</ScrollView>
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

function Rules({ config }: { config: BlackjackConfig | null }) {
  const win = config?.winPays ?? 1.8;
  const bj = config?.blackjackPays ?? 2.2;
  const ins = round2((config?.insurancePays ?? 2.9) - 1);
  return (
    <View>
      <Text style={styles.ruleHead}>Goal</Text>
      <Text style={styles.ruleLine}>Get closer to 21 than the dealer without going over. Number cards count their number, J, Q and K count 10, and an Ace counts 1 or 11.</Text>
      <Text style={styles.ruleHead}>Your moves</Text>
      <Text style={styles.ruleLine}>HIT — take another card.  STAND — keep your total.  DOUBLE — double your bet on your first two cards and take exactly one more card.  SPLIT — split two cards of the same value into two hands, each with its own bet (once per round; split Aces get one card each).</Text>
      <Text style={styles.ruleHead}>Dealer</Text>
      <Text style={styles.ruleLine}>The dealer checks for blackjack with an Ace or ten showing, draws to 16 and stands on all 17s. When the dealer shows an Ace you are offered insurance for half your bet.</Text>
      <Text style={styles.ruleHead}>Payouts</Text>
      <View style={styles.payBox}>
        {[
          ['Blackjack (Ace + ten on the first two cards)', `${bj}x`],
          ['Win', `${win}x`],
          ['Push (same total)', 'bet back'],
          ['Insurance', `${ins} to 1`],
          ['Max win per hand', `₹${config?.maxPayout ?? 10000}`],
        ].map(([k, v]) => (
          <View key={k} style={styles.payRow}>
            <Text style={styles.payKey}>{k}</Text>
            <Text style={styles.payVal}>{v}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.ruleHead}>Game info</Text>
      <Text style={styles.ruleLine}>
        Unlimited decks. Return to player {config?.rtpPercent ?? 89.22}% with perfect play. Bet ₹{config?.minStake ?? 1} – ₹{config?.maxStake ?? 500}. An unfinished hand waits for you when you come back.
      </Text>
      <Text style={styles.ruleLine}>Every card is drawn from your provably-fair seeds (Settings → Provably Fair).</Text>
    </View>
  );
}

function MiniCard({ card }: { card: number }) {
  const rank = card % 13;
  const suit = Math.floor(card / 13);
  const red = suit === 1 || suit === 3;
  return (
    <View style={styles.mini}>
      <Text style={[styles.miniText, { color: red ? '#C8102E' : '#15161C' }]}>
        {RANKS[rank]}
        {SUITS[suit]}
      </Text>
    </View>
  );
}

function History({ hands }: { hands: BlackjackHand[] | null }) {
  if (hands === null) return <Text style={styles.ruleLine}>Loading…</Text>;
  if (hands.length === 0) return <Text style={styles.ruleLine}>No hands yet.</Text>;
  return (
    <View style={{ gap: 8 }}>
      {hands.map((hd) => {
        const payout = Number(hd.payout);
        const staked = Number(hd.totalStake);
        const net = round2(payout - staked);
        return (
          <View key={hd.id} style={styles.histRow}>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={styles.row}>
                <Text style={styles.histLabel}>D {hd.dealerTotal}</Text>
                {hd.dealer.map((c, i) => (
                  <MiniCard key={i} card={c} />
                ))}
              </View>
              {hd.hands.map((seat, h) => (
                <View key={h} style={styles.row}>
                  <Text style={styles.histLabel}>P {seat.total}</Text>
                  {seat.cards.map((c, i) => (
                    <MiniCard key={i} card={c} />
                  ))}
                  <Text style={styles.histOutcome}>{seat.outcome ?? ''}</Text>
                </View>
              ))}
              <Text style={styles.histSub}>
                Bet ₹{staked.toFixed(2)} · {new Date(hd.createdAt).toLocaleString()}
              </Text>
            </View>
            <Text style={[styles.histPay, { color: net > 0 ? WIN : net < 0 ? 'rgba(255,240,220,0.55)' : '#D1D5DB' }]}>{net > 0 ? `+₹${net.toFixed(2)}` : net < 0 ? `-₹${Math.abs(net).toFixed(2)}` : '±₹0'}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#03281A' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dim: { opacity: 0.4 },
  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 6, zIndex: 3 },
  headBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(20,12,6,0.85)', borderWidth: 1, borderColor: 'rgba(244,207,107,0.45)' },
  headBalance: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: 'rgba(20,12,6,0.9)', borderWidth: 1.2, borderColor: GOLD },
  headBalanceText: { color: GOLD, fontWeight: '900', fontSize: 14 },
  card: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#C9C3AE', overflow: 'hidden' },
  cardShadow: { shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 5, shadowOffset: { width: 1, height: 3 }, elevation: 5 },
  cardCorner: { position: 'absolute', alignItems: 'center' },
  cardRank: { fontWeight: '900' },
  courtFrame: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.2 },
  courtLetter: { fontWeight: '900', fontFamily: 'serif' },
  totalBadge: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 26, borderRadius: 13, backgroundColor: 'rgba(6,20,12,0.88)', borderWidth: 1.2, borderColor: 'rgba(244,207,107,0.7)' },
  totalBadgeStatic: { position: 'relative' },
  totalBadgeActive: { borderColor: '#FFF3B0', backgroundColor: 'rgba(60,44,6,0.92)' },
  totalLabel: { color: 'rgba(244,207,107,0.7)', fontWeight: '900', fontSize: 10, letterSpacing: 1.2 },
  totalText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },
  seatBadgeWrap: { position: 'absolute', width: 180, alignItems: 'center' },
  outcomePill: { paddingHorizontal: 12, height: 26, borderRadius: 13, justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 4, elevation: 4 },
  outcomeText: { color: '#10150F', fontWeight: '900', fontSize: 12, letterSpacing: 0.8 },
  betRing: { position: 'absolute', borderWidth: 2.5, borderColor: 'rgba(244,207,107,0.5)', backgroundColor: 'rgba(0,0,0,0.12)' },
  stakeTag: { position: 'absolute', bottom: -10, paddingHorizontal: 8, height: 20, borderRadius: 10, justifyContent: 'center', backgroundColor: 'rgba(6,20,12,0.9)', borderWidth: 1, borderColor: 'rgba(244,207,107,0.6)' },
  stakeText: { color: GOLD, fontWeight: '900', fontSize: 11 },
  bannerWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  bannerCard: { paddingHorizontal: 30, paddingVertical: 12, borderRadius: 18, borderWidth: 2, alignItems: 'center', minWidth: 210 },
  bannerTitle: { color: '#FFFFFF', fontWeight: '900', fontSize: 26, letterSpacing: 3, fontFamily: 'serif' },
  bannerSub: { color: GOLD, fontWeight: '900', fontSize: 18, marginTop: 2 },
  controls: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingTop: 16, justifyContent: 'center' },
  railEdge: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: GOLD_DEEP },
  chipRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 48, paddingHorizontal: 12, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1.2, borderColor: 'rgba(244,207,107,0.5)' },
  smallBtnText: { color: GOLD, fontWeight: '900', fontSize: 13, letterSpacing: 1 },
  dealBtn: { flex: 1, height: 52, borderRadius: 16, overflow: 'hidden' },
  dealInner: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 2, borderColor: '#FFF3C4' },
  dealText: { color: '#2A1600', fontWeight: '900', fontSize: 19, letterSpacing: 2 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  actBtn: { alignItems: 'center', gap: 6, width: 76 },
  actCircle: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.85)', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 6, elevation: 6 },
  actText: { color: '#FFF3D6', fontWeight: '900', fontSize: 12, letterSpacing: 1.4 },
  insBox: { alignItems: 'center', gap: 8 },
  insTitle: { color: GOLD, fontWeight: '900', fontSize: 18, letterSpacing: 3, fontFamily: 'serif' },
  insSub: { color: 'rgba(255,240,220,0.85)', fontSize: 12, fontWeight: '700', textAlign: 'center', paddingHorizontal: 10 },
  bigBtn: { width: 130, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  btnDark: { backgroundColor: 'rgba(0,0,0,0.4)', borderColor: 'rgba(244,207,107,0.6)' },
  btnGold: { backgroundColor: GOLD, borderColor: '#FFF3C4' },
  bigBtnText: { color: GOLD, fontWeight: '900', fontSize: 16, letterSpacing: 2 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  sheet: { borderRadius: 18, backgroundColor: '#0B2A1B', borderWidth: 1.5, borderColor: GOLD, overflow: 'hidden' },
  tabs: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(244,207,107,0.25)' },
  tab: { paddingHorizontal: 12, paddingVertical: 7, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  tabOn: { backgroundColor: 'rgba(244,207,107,0.14)', borderBottomWidth: 2, borderBottomColor: GOLD },
  tabText: { color: 'rgba(255,240,220,0.6)', fontWeight: '900', fontSize: 12, letterSpacing: 1.2 },
  tabTextOn: { color: GOLD },
  ruleHead: { color: GOLD, fontWeight: '900', fontSize: 13, letterSpacing: 1, marginTop: 12, marginBottom: 6 },
  ruleLine: { color: 'rgba(255,245,230,0.88)', fontSize: 12.5, lineHeight: 19, fontWeight: '600', marginTop: 4 },
  payBox: { borderRadius: 12, padding: 10, backgroundColor: 'rgba(244,207,107,0.07)', borderWidth: 1, borderColor: 'rgba(244,207,107,0.25)', gap: 7 },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  payKey: { color: '#FFF5E6', fontWeight: '700', fontSize: 12.5, flex: 1 },
  payVal: { color: GOLD, fontWeight: '900', fontSize: 13 },
  histRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(244,207,107,0.15)' },
  histLabel: { color: 'rgba(255,240,220,0.7)', fontWeight: '900', fontSize: 11, width: 38 },
  histOutcome: { color: GOLD, fontWeight: '900', fontSize: 10, marginLeft: 4 },
  histSub: { color: 'rgba(255,240,220,0.5)', fontSize: 11 },
  histPay: { fontWeight: '900', fontSize: 14, marginLeft: 8 },
  mini: { paddingHorizontal: 4, height: 22, minWidth: 26, borderRadius: 4, backgroundColor: '#F6F4EC', alignItems: 'center', justifyContent: 'center' },
  miniText: { fontWeight: '900', fontSize: 11 },
  toast: { position: 'absolute', alignSelf: 'center', top: '42%', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.85)', borderWidth: 1, borderColor: GOLD_DEEP, maxWidth: '86%', zIndex: 6 },
  toastText: { color: '#FFE08A', fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
