import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ScreenOrientation from 'expo-screen-orientation';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient as SvgLinearGradient,
  Path,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
  TextPath,
} from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { ApiClientError } from '../api/client';
import {
  BaccaratArea,
  BaccaratConfig,
  BaccaratHand,
  BaccaratHistoryEntry,
  BaccaratMyBet,
  BaccaratRoundView,
  PlayingCard,
  cancelBaccaratBets,
  fetchBaccaratConfig,
  fetchBaccaratCurrent,
  fetchBaccaratHistory,
  fetchBaccaratMyBets,
  fetchBaccaratMyRound,
  placeBaccaratBets,
} from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const CHIP_VALUES = [10, 20, 50, 100, 200, 500];
const CHIP_COLORS: Record<number, string> = {
  10: '#1E9E4A',
  20: '#0FA3A3',
  50: '#2563EB',
  100: '#D4A017',
  200: '#E07A1F',
  500: '#C81E3A',
};
const DEFAULT_CHIP = 10;
const FALLBACK_MULTIPLIERS: Record<BaccaratArea, number> = { PLAYER: 1.8, BANKER: 1.75, TIE: 9.43, PLAYER_PAIR: 11.7, BANKER_PAIR: 11.7 };

const WIN_CARD_MS = 3200;
const TOAST_MS = 1600;
const BANNER_MS = 1300;
/** A result first seen this late (ms after the reveal) is shown at once
 * instead of being dealt out card by card. */
const LATE_REVEAL_MS = 3000;
const BEAD_ROWS = 6;

const GOLD = '#FFD66B';
const GOLD_DEEP = '#B8862B';
const SIDE = {
  PLAYER: { main: '#3D7BFF', dark: '#0F2C8C', light: '#9CC0FF', name: 'PLAYER' },
  BANKER: { main: '#F0344F', dark: '#7E0A1E', light: '#FFA3B0', name: 'BANKER' },
  TIE: { main: '#22B868', dark: '#0A5E33', light: '#8EF0BA', name: 'TIE' },
} as const;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

function shortAmount(n: number): string {
  if (n >= 1000) return `${round2(n / 1000)}k`;
  return String(round2(n));
}

function chipColorFor(amount: number): string {
  const v = [...CHIP_VALUES].reverse().find((c) => c <= amount) ?? CHIP_VALUES[0];
  return CHIP_COLORS[v];
}

function areaWins(area: BaccaratArea, hand: BaccaratHand): boolean {
  if (area === 'PLAYER_PAIR') return hand.playerPair;
  if (area === 'BANKER_PAIR') return hand.bankerPair;
  return area === hand.winner;
}

const RANK_LABEL = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUIT_SYMBOL: Record<string, string> = { S: '♠', H: '♥', C: '♣', D: '♦' };
const pointOf = (c: PlayingCard) => (c.rank >= 10 ? 0 : c.rank);
const totalOf = (cards: PlayingCard[]) => cards.reduce((s, c) => s + pointOf(c), 0) % 10;

// ---------- reveal plan ----------

type Side = 'PLAYER' | 'BANKER';
type Step = { side: Side; i: number; dealAt: number; flipAt: number };

/** When each card turns over, in dealing order: P, B, P, B, then the
 * Player's third card and the Banker's third card if the tableau drew them. */
function revealPlan(hand: BaccaratHand): { steps: Step[]; doneAt: number } {
  const steps: Step[] = [
    { side: 'PLAYER', i: 0, dealAt: 0, flipAt: 450 },
    { side: 'BANKER', i: 0, dealAt: 0, flipAt: 1000 },
    { side: 'PLAYER', i: 1, dealAt: 0, flipAt: 1550 },
    { side: 'BANKER', i: 1, dealAt: 0, flipAt: 2100 },
  ];
  let t = 2100;
  if (hand.player.length === 3) {
    steps.push({ side: 'PLAYER', i: 2, dealAt: t + 750, flipAt: t + 1350 });
    t += 1350;
  }
  if (hand.banker.length === 3) {
    steps.push({ side: 'BANKER', i: 2, dealAt: t + 750, flipAt: t + 1350 });
    t += 1350;
  }
  return { steps, doneAt: t + 750 };
}

// ---------- roads ----------

type RoadCell = { c: number; r: number; w: 'PLAYER' | 'BANKER'; ties: number; pp: boolean; bp: boolean; natural: boolean };

/** Big Road: a column per streak, filled downward; a streak longer than the
 * six rows (or blocked below) turns right along its row (the "dragon tail").
 * Ties are marked on the last hand instead of taking a cell. */
function buildBigRoad(oldestFirst: BaccaratHistoryEntry[]): RoadCell[] {
  const taken = new Map<string, RoadCell>();
  let last: RoadCell | null = null;
  let leadTies = 0;
  let streakCol = -1;
  let prev: string | null = null;
  let c = 0;
  let r = 0;
  for (const h of oldestFirst) {
    if (h.winner === 'TIE') {
      if (last) last.ties++;
      else leadTies++;
      continue;
    }
    if (h.winner !== prev) {
      streakCol++;
      while (taken.has(`${streakCol},0`)) streakCol++;
      c = streakCol;
      r = 0;
    } else if (r + 1 < BEAD_ROWS && !taken.has(`${c},${r + 1}`)) {
      r++;
    } else {
      c++;
    }
    const cell: RoadCell = { c, r, w: h.winner, ties: leadTies, pp: h.playerPair, bp: h.bankerPair, natural: h.natural };
    leadTies = 0;
    taken.set(`${c},${r}`, cell);
    last = cell;
    prev = h.winner;
  }
  return [...taken.values()];
}

// ---------- art ----------

const Chip = memo(function Chip({ value, size, label }: { value: number; size: number; label?: string }) {
  const color = CHIP_COLORS[value] ?? chipColorFor(value);
  const r = size / 2;
  const ringR = r - size * 0.1;
  const circ = 2 * Math.PI * ringR;
  const text = label ?? (value >= 1000 ? `${value / 1000}K` : String(value));
  const fontSize = size * (text.length > 3 ? 0.22 : 0.27);
  return (
    <Svg width={size} height={size}>
      <Circle cx={r} cy={r} r={r - 0.5} fill={color} stroke="#00000066" strokeWidth={1} />
      <Circle cx={r} cy={r} r={ringR} fill="none" stroke="#FFFFFF" strokeWidth={size * 0.12} strokeDasharray={`${circ / 16} ${circ / 16}`} />
      <Circle cx={r} cy={r} r={size * 0.3} fill="#141414" stroke="#FFFFFF" strokeOpacity={0.6} strokeWidth={1.2} />
      <SvgText x={r} y={r + fontSize * 0.36} fontSize={fontSize} fontWeight="bold" fill="#FFFFFF" textAnchor="middle">
        {text}
      </SvgText>
    </Svg>
  );
});

const CardFace = memo(function CardFace({ card, w }: { card: PlayingCard; w: number }) {
  const h = w * 1.4;
  const red = card.suit === 'H' || card.suit === 'D';
  const color = red ? '#C8102E' : '#15161C';
  const court = card.rank >= 11;
  const corner = (
    <>
      <Text style={[styles.cardRank, { color, fontSize: w * (card.rank === 10 ? 0.24 : 0.28), lineHeight: w * 0.3 }]}>{RANK_LABEL[card.rank]}</Text>
      <Text style={{ color, fontSize: w * 0.2, lineHeight: w * 0.22 }}>{SUIT_SYMBOL[card.suit]}</Text>
    </>
  );
  return (
    <LinearGradient colors={['#FFFFFF', '#F1F2F7', '#E3E5EE']} style={[styles.card, { width: w, height: h, borderRadius: w * 0.09 }]}>
      <View style={[styles.cardCorner, { top: w * 0.05, left: w * 0.07 }]}>{corner}</View>
      <View style={[styles.cardCorner, { bottom: w * 0.05, right: w * 0.07, transform: [{ rotate: '180deg' }] }]}>{corner}</View>
      {court ? (
        <View style={[styles.courtFrame, { width: w * 0.5, height: h * 0.5, borderRadius: w * 0.05, borderColor: red ? '#E7A3AE' : '#B7BACB' }]}>
          <MaterialCommunityIcons name="crown" size={w * 0.16} color={GOLD_DEEP} />
          <Text style={[styles.courtLetter, { color, fontSize: w * 0.3, lineHeight: w * 0.34 }]}>{RANK_LABEL[card.rank]}</Text>
          <Text style={{ color, fontSize: w * 0.14, lineHeight: w * 0.16 }}>{SUIT_SYMBOL[card.suit]}</Text>
        </View>
      ) : (
        <Text style={{ color, fontSize: w * 0.58, lineHeight: w * 0.66 }}>{SUIT_SYMBOL[card.suit]}</Text>
      )}
    </LinearGradient>
  );
});

const CardBack = memo(function CardBack({ w }: { w: number }) {
  const h = w * 1.4;
  const inset = w * 0.08;
  const cols = 5;
  const d = (w - inset * 2) / cols;
  const rows = Math.floor((h - inset * 2) / d);
  const oy = (h - rows * d) / 2;
  const diamonds: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = inset + d * (c + 0.5);
      const cy = oy + d * (r + 0.5);
      diamonds.push(`${cx},${cy - d / 2} ${cx + d / 2},${cy} ${cx},${cy + d / 2} ${cx - d / 2},${cy}`);
    }
  }
  return (
    <Svg width={w} height={h}>
      <Defs>
        <SvgLinearGradient id="bcBack" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#1E3380" />
          <Stop offset="1" stopColor="#0A133A" />
        </SvgLinearGradient>
      </Defs>
      <Rect x={0.75} y={0.75} width={w - 1.5} height={h - 1.5} rx={w * 0.09} fill="url(#bcBack)" stroke={GOLD} strokeWidth={1.5} />
      <Rect x={inset} y={inset} width={w - inset * 2} height={h - inset * 2} rx={w * 0.05} fill="none" stroke={GOLD} strokeOpacity={0.55} strokeWidth={0.8} />
      {diamonds.map((p, i) => (
        <Polygon key={i} points={p} fill="none" stroke={GOLD} strokeOpacity={0.22} strokeWidth={0.6} />
      ))}
      <Circle cx={w / 2} cy={h / 2} r={w * 0.2} fill="#0A133A" stroke={GOLD} strokeWidth={1.2} />
      <SvgText x={w / 2} y={h / 2 + w * 0.075} fontSize={w * 0.2} fontWeight="bold" fill={GOLD} textAnchor="middle">
        NP
      </SvgText>
    </Svg>
  );
});

/** One card on the table: slides in from the shoe when dealt and turns over
 * (with a little lift) when faceUp flips to true. Sideways cards are the
 * third cards, laid across like at a real baccarat table. */
function TableCard({
  card,
  w,
  dealt,
  faceUp,
  sideways,
  from,
  delay = 0,
}: {
  card: PlayingCard | null;
  w: number;
  dealt: boolean;
  faceUp: boolean;
  sideways: boolean;
  from: { x: number; y: number };
  delay?: number;
}) {
  const deal = useRef(new Animated.Value(dealt ? 1 : 0)).current;
  const flip = useRef(new Animated.Value(faceUp ? 1 : 0)).current;
  useEffect(() => {
    if (dealt) Animated.timing(deal, { toValue: 1, duration: 420, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    else deal.setValue(0);
  }, [dealt, delay, deal]);
  useEffect(() => {
    if (faceUp) Animated.timing(flip, { toValue: 1, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start();
    else flip.setValue(0);
  }, [faceUp, flip]);

  const h = w * 1.4;
  const boxW = sideways ? h : w;
  const boxH = sideways ? w : h;
  const backOpacity = flip.interpolate({ inputRange: [0, 0.5, 0.501, 1], outputRange: [1, 1, 0, 0] });
  const faceOpacity = flip.interpolate({ inputRange: [0, 0.5, 0.501, 1], outputRange: [0, 0, 1, 1] });
  return (
    <View style={{ width: boxW, height: boxH }}>
      <Animated.View
        style={{
          position: 'absolute',
          left: (boxW - w) / 2,
          top: (boxH - h) / 2,
          width: w,
          height: h,
          opacity: deal.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 1] }),
          transform: [
            { translateX: deal.interpolate({ inputRange: [0, 1], outputRange: [from.x, 0] }) },
            { translateY: deal.interpolate({ inputRange: [0, 1], outputRange: [from.y, 0] }) },
            { rotate: deal.interpolate({ inputRange: [0, 1], outputRange: ['-70deg', sideways ? '90deg' : '0deg'] }) },
            { perspective: 700 },
            { rotateY: flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '90deg', '0deg'] }) },
            { scale: flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.14, 1] }) },
          ],
        }}
      >
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: backOpacity }]}>
          <CardBack w={w} />
        </Animated.View>
        {card && (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: faceOpacity }]}>
            <CardFace card={card} w={w} />
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

function Clock({ secs, fraction, size }: { secs: number; fraction: Animated.Value; size: number }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const urgent = secs <= 3;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinearGradient id="bcClock" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FFF1B8" />
            <Stop offset="1" stopColor="#C98A1C" />
          </SvgLinearGradient>
          <RadialGradient id="bcClockFace" cx="50%" cy="40%" r="60%">
            <Stop offset="0" stopColor="#1E2B63" />
            <Stop offset="1" stopColor="#070C22" />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r + 3} fill="url(#bcClockFace)" stroke={GOLD_DEEP} strokeWidth={1} />
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#26316A" strokeWidth={5} />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={urgent ? '#FF4B3E' : 'url(#bcClock)'}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={fraction.interpolate({ inputRange: [0, 1], outputRange: [c, 0] })}
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <Text style={[styles.clockText, { fontSize: size * 0.38 }, urgent && { color: '#FF5A4E' }]}>{secs}</Text>
    </View>
  );
}

/** The card shoe the dealer deals from. */
function Shoe({ w }: { w: number }) {
  const h = w * 0.72;
  return (
    <Svg width={w} height={h}>
      <Defs>
        <SvgLinearGradient id="bcShoe" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#3A2A1C" />
          <Stop offset="1" stopColor="#120A05" />
        </SvgLinearGradient>
        <SvgLinearGradient id="bcShoeGold" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#8C5E17" />
          <Stop offset="0.5" stopColor="#FFE39A" />
          <Stop offset="1" stopColor="#8C5E17" />
        </SvgLinearGradient>
      </Defs>
      {/* cards peeking out of the mouth */}
      <Rect x={w * 0.05} y={h * 0.22} width={w * 0.34} height={h * 0.5} rx={3} fill="#1E3380" stroke={GOLD} strokeWidth={1} transform={`rotate(-8 ${w * 0.2} ${h * 0.45})`} />
      <Path d={`M ${w * 0.18} ${h * 0.12} L ${w * 0.98} ${h * 0.02} L ${w * 0.98} ${h * 0.96} L ${w * 0.18} ${h * 0.86} Z`} fill="url(#bcShoe)" stroke="url(#bcShoeGold)" strokeWidth={2} />
      <Path d={`M ${w * 0.18} ${h * 0.12} L ${w * 0.3} ${h * 0.3} L ${w * 0.3} ${h * 0.72} L ${w * 0.18} ${h * 0.86} Z`} fill="#0A0603" stroke="url(#bcShoeGold)" strokeWidth={1.2} />
      <Rect x={w * 0.42} y={h * 0.4} width={w * 0.44} height={h * 0.18} rx={h * 0.09} fill="none" stroke="url(#bcShoeGold)" strokeWidth={1.2} />
      <SvgText x={w * 0.64} y={h * 0.535} fontSize={h * 0.13} fontWeight="bold" fill={GOLD} textAnchor="middle" letterSpacing={1}>
        SHOE
      </SvgText>
    </Svg>
  );
}

/** Gold coins bursting out of a winning box. */
function WinBurst({ k }: { k: number }) {
  const t = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 950, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 90, useNativeDriver: true }).start();
  }, [t, pop]);
  return (
    <View pointerEvents="none" style={styles.burstWrap}>
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <Animated.View
            key={i}
            style={[
              styles.coin,
              {
                opacity: t.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
                transform: [
                  { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(a) * 64 * k] }) },
                  { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(a) * 38 * k] }) },
                ],
              },
            ]}
          />
        );
      })}
      <Animated.View style={[styles.winBadge, { top: 4 * k, paddingHorizontal: 10 * k, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] }]}>
        <Text style={[styles.winBadgeText, { fontSize: 10 * k }]}>WIN</Text>
      </Animated.View>
    </View>
  );
}

// ---------- layout helpers ----------

type Box = { area: BaccaratArea; title: string; sub?: string; x0: number; x1: number };

/** The table's curve: a gentle parabola, highest at the centre. */
function makeArc(cx: number, halfSpan: number, depth: number) {
  const a = depth / (halfSpan * halfSpan);
  const y = (x: number, y0: number) => y0 + a * (x - cx) * (x - cx);
  const slope = (x: number) => 2 * a * (x - cx);
  /** An exact quadratic Bézier for the parabola between x0 and x1. */
  const seg = (x0: number, x1: number, y0: number) => {
    const xm = (x0 + x1) / 2;
    return { x0, y0: y(x0, y0), xm, cy: y(x0, y0) + slope(x0) * (xm - x0), x1, y1: y(x1, y0) };
  };
  const band = (x0: number, x1: number, top: number, bottom: number) => {
    const t = seg(x0, x1, top);
    const b = seg(x0, x1, bottom);
    return `M ${t.x0} ${t.y0} Q ${t.xm} ${t.cy} ${t.x1} ${t.y1} L ${b.x1} ${b.y1} Q ${b.xm} ${b.cy} ${b.x0} ${b.y0} Z`;
  };
  const curve = (x0: number, x1: number, y0: number) => {
    const s = seg(x0, x1, y0);
    return `M ${s.x0} ${s.y0} Q ${s.xm} ${s.cy} ${s.x1} ${s.y1}`;
  };
  return { y, band, curve };
}

const BOX_FILL: Record<BaccaratArea, [string, string]> = {
  PLAYER: [SIDE.PLAYER.main, SIDE.PLAYER.dark],
  BANKER: [SIDE.BANKER.main, SIDE.BANKER.dark],
  TIE: [SIDE.TIE.main, SIDE.TIE.dark],
  PLAYER_PAIR: ['#2A56C9', '#0B1E63'],
  BANKER_PAIR: ['#C4243C', '#5C0716'],
};

// ---------- screen ----------

type PlacedChip = { key: number; area: BaccaratArea; amount: number; id?: string };
type Flight = { id: number; value: number; area: BaccaratArea; from: { x: number; y: number }; to: { x: number; y: number }; anim: Animated.Value };
type Reveal = { period: string; hand: BaccaratHand; start: number; steps: Step[]; doneAt: number };

export default function BaccaratScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const landscape = W > H;
  const { coins, refreshWallet } = useGameState();

  // Played sideways: lock landscape while this screen is focused and hand
  // the rest of the app back its portrait lock on the way out.
  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
      return () => {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      };
    }, [])
  );

  const [config, setConfig] = useState<BaccaratConfig | null>(null);
  const [view, setView] = useState<BaccaratRoundView | null>(null);
  const [history, setHistory] = useState<BaccaratHistoryEntry[]>([]);
  const [chips, setChips] = useState<PlacedChip[]>([]);
  const [selectedChip, setSelectedChip] = useState(DEFAULT_CHIP);
  const [win, setWin] = useState<{ won: number; returned: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ text: string; start: boolean } | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [flying, setFlying] = useState<Partial<Record<BaccaratArea, number>>>({});
  const [panel, setPanel] = useState<'bets' | 'rules' | null>(null);
  const [myBets, setMyBets] = useState<BaccaratMyBet[] | null>(null);
  const [, setTick] = useState(0);

  const offsetRef = useRef(0);
  const periodRef = useRef<string | null>(null);
  const resultHandledRef = useRef<string | null>(null);
  const settledHandledRef = useRef<string | null>(null);
  const chipsRef = useRef<PlacedChip[]>([]);
  chipsRef.current = chips;
  const lastRoundRef = useRef<{ area: BaccaratArea; amount: number }[]>([]);
  const idMapRef = useRef(new Map<number, string>());
  const keyRef = useRef(1);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<View>(null);
  const chipRefs = useRef<Record<number, View | null>>({});
  const boxRefs = useRef<Partial<Record<BaccaratArea, View | null>>>({});
  const flightId = useRef(1);

  const bannerAnim = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0.35)).current;
  const clockFraction = useRef(new Animated.Value(1)).current;
  const ribbon = useRef(new Animated.Value(0)).current;

  const multipliers = config?.multipliers ?? FALLBACK_MULTIPLIERS;
  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const showBanner = useCallback(
    (text: string, start: boolean) => {
      setBanner({ text, start });
      bannerAnim.setValue(0);
      Animated.timing(bannerAnim, { toValue: 1, duration: 420, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }).start();
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
      bannerTimer.current = setTimeout(() => {
        Animated.timing(bannerAnim, { toValue: 2, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(
          () => mountedRef.current && setBanner(null)
        );
      }, BANNER_MS);
    },
    [bannerAnim]
  );

  const enqueue = useCallback((op: () => Promise<void>) => {
    queueRef.current = queueRef.current.then(op).catch(() => {});
  }, []);

  const syncMyRound = useCallback(() => {
    fetchBaccaratMyRound()
      .then((res) => {
        if (!mountedRef.current || res.periodNumber !== periodRef.current) return;
        setChips(
          res.bets.map((b) => {
            const key = keyRef.current++;
            idMapRef.current.set(key, b.id);
            return { key, area: b.area, amount: Number(b.amount), id: b.id };
          })
        );
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchBaccaratConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => {});
    fetchBaccaratHistory(100)
      .then((h) => mountedRef.current && setHistory(h))
      .catch(() => {});
    return () => {
      mountedRef.current = false;
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
    };
  }, []);

  // Round polling: chained so slow responses never overlap, and quicker
  // right around betting close / reveal / next round.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;
    let first = true;
    const loop = async () => {
      let delay = 800;
      try {
        const sentAt = Date.now();
        const v = await fetchBaccaratCurrent();
        const receivedAt = Date.now();
        if (!alive) return;
        const measured = new Date(v.serverTime).getTime() - (sentAt + receivedAt) / 2;
        offsetRef.current = first ? measured : offsetRef.current * 0.7 + measured * 0.3;
        setView(v);
        const srvNow = Date.now() + offsetRef.current;
        const nextEdge = Math.min(...[v.betEndTime, v.resultTime, v.endTime].map((t) => new Date(t).getTime()).filter((t) => t > srvNow));
        if (Number.isFinite(nextEdge) && nextEdge - srvNow < 1200) delay = 250;
        if (first) {
          first = false;
          periodRef.current = v.periodNumber;
          syncMyRound();
        }
      } catch {
        delay = 1500;
      }
      if (alive) timer = setTimeout(loop, delay);
    };
    loop();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [syncMyRound]);

  // New round: last round's chips become the REPEAT set.
  useEffect(() => {
    if (!view) return;
    if (periodRef.current !== null && periodRef.current !== view.periodNumber) {
      const placed = chipsRef.current.filter((c) => c.id);
      if (placed.length > 0) lastRoundRef.current = placed.map((c) => ({ area: c.area, amount: c.amount }));
      setChips([]);
      idMapRef.current.clear();
      setReveal(null);
      showBanner('PLACE YOUR BETS', true);
    }
    periodRef.current = view.periodNumber;
  }, [view, showBanner]);

  // Countdown ring for this round's betting window.
  useEffect(() => {
    if (!view) return;
    const betEnd = new Date(view.betEndTime).getTime();
    const total = Math.max(1, betEnd - new Date(view.startTime).getTime());
    const remaining = Math.max(0, betEnd - (Date.now() + offsetRef.current));
    clockFraction.setValue(remaining / total);
    const anim = Animated.timing(clockFraction, { toValue: 0, duration: remaining, easing: Easing.linear, useNativeDriver: false });
    anim.start();
    return () => anim.stop();
    // Restart only when the round (not every poll) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.periodNumber, clockFraction]);

  // Re-render exactly when betting closes.
  useEffect(() => {
    if (!view) return;
    const betWait = new Date(view.betEndTime).getTime() - (Date.now() + offsetRef.current);
    if (betWait <= 0) return;
    const id = setTimeout(() => {
      setTick((x) => x + 1);
      showBanner('NO MORE BETS', false);
    }, betWait + 20);
    return () => clearTimeout(id);
  }, [view, showBanner]);

  const srvNow = Date.now() + offsetRef.current;
  const betEndMs = view ? new Date(view.betEndTime).getTime() : 0;
  const bettingOpen = !!view && srvNow < betEndMs;
  const phase: 'BETTING' | 'DEALING' | 'RESULT' = !view ? 'BETTING' : bettingOpen ? 'BETTING' : view.phase === 'RESULT' && view.hand ? 'RESULT' : 'DEALING';

  useEffect(() => {
    if (phase !== 'BETTING') return;
    const id = setInterval(() => setTick((x) => x + 1), 250);
    return () => clearInterval(id);
  }, [phase]);

  // Result: deal the hand out card by card (or all at once if we arrived late).
  useEffect(() => {
    if (!view || view.phase !== 'RESULT' || !view.hand || resultHandledRef.current === view.periodNumber) return;
    resultHandledRef.current = view.periodNumber;
    const plan = revealPlan(view.hand);
    const late = Date.now() + offsetRef.current - new Date(view.resultTime).getTime();
    const start = late > LATE_REVEAL_MS ? Date.now() - plan.doneAt - 1 : Date.now();
    setReveal({ period: view.periodNumber, hand: view.hand, start, ...plan });
  }, [view]);

  const elapsed = reveal ? Date.now() - reveal.start : 0;
  const revealDone = !!reveal && elapsed >= reveal.doneAt;

  // Tick while the cards are turning over.
  useEffect(() => {
    if (!reveal || revealDone) return;
    const id = setInterval(() => setTick((x) => x + 1), 60);
    return () => clearInterval(id);
  }, [reveal, revealDone]);

  // Once every card is out: light the board, update the roads and pay out.
  useEffect(() => {
    if (!reveal || !revealDone || settledHandledRef.current === reveal.period) return;
    settledHandledRef.current = reveal.period;
    const { period, hand } = reveal;
    ribbon.setValue(0);
    Animated.spring(ribbon, { toValue: 1, friction: 6, tension: 70, useNativeDriver: true }).start();
    setHistory((h) => (h[0]?.periodNumber === period ? h : [{ periodNumber: period, ...hand }, ...h].slice(0, 100)));
    if (chipsRef.current.some((c) => c.id)) {
      enqueue(async () => {
        try {
          const res = await fetchBaccaratMyRound(period);
          const won = round2(res.bets.filter((b) => Number(b.paidMultiplier) > 1).reduce((s, b) => s + Number(b.payout), 0));
          const returned = round2(res.bets.filter((b) => Number(b.paidMultiplier) === 1).reduce((s, b) => s + Number(b.payout), 0));
          if ((won > 0 || returned > 0) && mountedRef.current) setTimeout(() => mountedRef.current && setWin({ won, returned }), 700);
        } catch {
          // Winnings still land in the wallet; only the card is skipped.
        }
        refreshWallet();
      });
    }
  }, [reveal, revealDone, enqueue, refreshWallet, ribbon]);

  useEffect(() => {
    if (win === null) return;
    const id = setTimeout(() => setWin(null), WIN_CARD_MS);
    return () => clearTimeout(id);
  }, [win]);

  const boardHand = revealDone && reveal && reveal.period === view?.periodNumber ? reveal.hand : null;

  useEffect(() => {
    if (!boardHand) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 480, useNativeDriver: false }),
        Animated.timing(glow, { toValue: 0.35, duration: 480, useNativeDriver: false }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [boardHand, glow]);

  const areaTotals = useMemo(() => {
    const m: Partial<Record<BaccaratArea, number>> = {};
    for (const c of chips) m[c.area] = round2((m[c.area] ?? 0) + c.amount);
    return m;
  }, [chips]);
  const myTotal = useMemo(() => round2(chips.reduce((s, c) => s + c.amount, 0)), [chips]);
  const unconfirmed = useMemo(() => round2(chips.filter((c) => !c.id).reduce((s, c) => s + c.amount, 0)), [chips]);
  const displayBalance = Math.max(0, round2(coins - unconfirmed));

  const bettingOpenRef = useRef(bettingOpen);
  bettingOpenRef.current = bettingOpen;
  const displayBalanceRef = useRef(displayBalance);
  displayBalanceRef.current = displayBalance;
  const areaTotalsRef = useRef(areaTotals);
  areaTotalsRef.current = areaTotals;
  const maxStakeRef = useRef(maxStake);
  maxStakeRef.current = maxStake;
  const selectedChipRef = useRef(selectedChip);
  selectedChipRef.current = selectedChip;

  const placeChips = useCallback(
    (entries: { area: BaccaratArea; amount: number }[]): boolean => {
      if (entries.length === 0) return false;
      if (!bettingOpenRef.current) {
        showToast('Betting closed — wait for the next round');
        return false;
      }
      const cost = round2(entries.reduce((s, e) => s + e.amount, 0));
      if (cost > displayBalanceRef.current) {
        showToast('Insufficient balance');
        return false;
      }
      const totals = { ...areaTotalsRef.current };
      for (const e of entries) {
        totals[e.area] = round2((totals[e.area] ?? 0) + e.amount);
        if ((totals[e.area] ?? 0) > maxStakeRef.current) {
          showToast(`Max bet per box is ₹${maxStakeRef.current}`);
          return false;
        }
      }
      const added: PlacedChip[] = entries.map((e) => ({ key: keyRef.current++, area: e.area, amount: e.amount }));
      const keys = new Set(added.map((c) => c.key));
      setChips((prev) => [...prev, ...added]);
      enqueue(async () => {
        try {
          const res = await placeBaccaratBets(entries);
          res.bets.forEach((b, i) => idMapRef.current.set(added[i].key, b.id));
          if (mountedRef.current) {
            setChips((prev) => prev.map((c) => (keys.has(c.key) ? { ...c, id: idMapRef.current.get(c.key) } : c)));
          }
          refreshWallet();
        } catch (err) {
          if (mountedRef.current) {
            setChips((prev) => prev.filter((c) => !keys.has(c.key)));
            showToast(errorMessage(err));
          }
        }
      });
      return true;
    },
    [enqueue, refreshWallet, showToast]
  );

  // A chip flies from the rail to the box; the box counts it once it lands.
  const launchFlight = useCallback((area: BaccaratArea, value: number) => {
    const chipView = chipRefs.current[value];
    const boxView = boxRefs.current[area];
    const root = rootRef.current;
    if (!chipView || !boxView || !root) return;
    root.measureInWindow((rx, ry) => {
      chipView.measureInWindow((cx, cy, cw, ch) => {
        boxView.measureInWindow((bx, by, bw, bh) => {
          if (!mountedRef.current) return;
          const id = flightId.current++;
          const anim = new Animated.Value(0);
          const flight: Flight = {
            id,
            value,
            area,
            from: { x: cx - rx + cw / 2, y: cy - ry + ch / 2 },
            to: { x: bx - rx + bw / 2 + (Math.random() - 0.5) * bw * 0.25, y: by - ry + bh * 0.7 },
            anim,
          };
          setFlights((prev) => [...prev, flight]);
          setFlying((prev) => ({ ...prev, [area]: round2((prev[area] ?? 0) + value) }));
          Animated.timing(anim, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
            if (!mountedRef.current) return;
            setFlights((prev) => prev.filter((f) => f.id !== id));
            setFlying((prev) => ({ ...prev, [area]: Math.max(0, round2((prev[area] ?? 0) - value)) }));
          });
        });
      });
    });
  }, []);

  const onAreaPress = useCallback(
    (area: BaccaratArea) => {
      const value = selectedChipRef.current;
      if (placeChips([{ area, amount: value }])) launchFlight(area, value);
    },
    [placeChips, launchFlight]
  );

  const undo = () => {
    const last = chips[chips.length - 1];
    if (!last) return;
    if (!bettingOpen) return showToast('Betting closed');
    setChips((prev) => prev.slice(0, -1));
    enqueue(async () => {
      const id = idMapRef.current.get(last.key);
      if (!id) return;
      try {
        await cancelBaccaratBets([id]);
        refreshWallet();
      } catch (err) {
        if (mountedRef.current) {
          showToast(errorMessage(err));
          syncMyRound();
        }
      }
    });
  };

  const clearAll = () => {
    if (chips.length === 0) return;
    if (!bettingOpen) return showToast('Betting closed');
    setChips([]);
    enqueue(async () => {
      try {
        await cancelBaccaratBets();
        refreshWallet();
      } catch (err) {
        if (mountedRef.current) {
          showToast(errorMessage(err));
          syncMyRound();
        }
      }
    });
  };

  const repeat = () => {
    if (lastRoundRef.current.length === 0) return showToast('No bets from the last round');
    const m = new Map<BaccaratArea, number>();
    for (const c of lastRoundRef.current) m.set(c.area, round2((m.get(c.area) ?? 0) + c.amount));
    placeChips([...m.entries()].map(([area, amount]) => ({ area, amount })));
  };

  const openPanel = (which: 'bets' | 'rules') => {
    setPanel(which);
    if (which === 'bets') {
      setMyBets(null);
      fetchBaccaratMyBets(30)
        .then((b) => mountedRef.current && setMyBets(b))
        .catch(() => mountedRef.current && setMyBets([]));
    }
  };

  const oldestFirst = useMemo(() => [...history].reverse(), [history]);
  const bigRoad = useMemo(() => buildBigRoad(oldestFirst), [oldestFirst]);
  const stats = useMemo(() => {
    const n = history.length;
    const p = history.filter((h) => h.winner === 'PLAYER').length;
    const b = history.filter((h) => h.winner === 'BANKER').length;
    return { n, p, b, t: n - p - b };
  }, [history]);

  if (!landscape) {
    return (
      <View style={[styles.root, styles.rotating]}>
        <MaterialCommunityIcons name="phone-rotate-landscape" size={48} color={GOLD} />
        <Text style={styles.rotatingText}>Turning to landscape…</Text>
      </View>
    );
  }

  // ---------- layout ----------
  const L = insets.left + 8;
  const R = W - insets.right - 8;
  const innerW = R - L;
  const cx = L + innerW / 2;
  const k = Math.max(0.72, Math.min(1.6, Math.min(innerW / 840, H / 400)));
  const topH = 42 * k;
  const bottomLift = Math.max(0, insets.bottom - 4);
  const railH = 80 * k;
  const railTop = H - railH - bottomLift;
  const dealerTop = topH + 2 * k;
  const dealerH = (railTop - dealerTop) * 0.5;
  const feltTop = dealerTop + dealerH + 4 * k;
  const arcDepth = 16 * k;
  const arc = makeArc(cx, innerW / 2, arcDepth);

  // Hand panels and cards.
  const centerW = Math.max(96 * k, innerW * 0.13);
  const panelW = innerW * 0.3;
  const panelH = dealerH - 6 * k;
  const headH = 22 * k;
  const gap = 6 * k;
  const cardW = Math.min((panelH - headH - 12 * k) / 1.4, (panelW - 16 * k - gap * 2) / 3.4);
  const cardH = cardW * 1.4;
  const playerPanel = { left: cx - centerW / 2 - panelW, top: dealerTop + 3 * k, width: panelW, height: panelH };
  const bankerPanel = { left: cx + centerW / 2, top: dealerTop + 3 * k, width: panelW, height: panelH };
  const rowTop = playerPanel.top + headH + (panelH - headH - cardH) / 2;
  const handW = cardW * 2 + cardH + gap * 2;
  const shoeW = Math.min(96 * k, R - (bankerPanel.left + panelW) - 10 * k);
  const shoe = { left: R - shoeW, top: dealerTop + dealerH * 0.18 };
  const shoeMouth = { x: shoe.left + shoeW * 0.2, y: shoe.top + shoeW * 0.72 * 0.45 };

  const slot = (side: Side, i: number) => {
    const panelBox = side === 'PLAYER' ? playerPanel : bankerPanel;
    const x0 = panelBox.left + (panelW - handW) / 2;
    let left: number;
    let top = rowTop;
    let w = cardW;
    let h = cardH;
    if (i === 2) {
      w = cardH;
      h = cardW;
      top = rowTop + (cardH - cardW) / 2;
      left = side === 'PLAYER' ? x0 : x0 + cardW * 2 + gap * 2;
    } else {
      left = side === 'PLAYER' ? x0 + cardH + gap + i * (cardW + gap) : x0 + i * (cardW + gap);
    }
    return { left, top, width: w, height: h, from: { x: shoeMouth.x - (left + w / 2), y: shoeMouth.y - (top + h / 2) } };
  };

  // Bet boxes along the curve of the table.
  const boxTop = feltTop + 24 * k;
  const boxBottom = railTop - 12 * k - arcDepth;
  const bx0 = L + 6 * k;
  const bx1 = R - 6 * k;
  const bGap = 6 * k;
  const ratios: [BaccaratArea, number, string, string?][] = [
    ['PLAYER_PAIR', 0.145, 'P PAIR'],
    ['PLAYER', 0.265, 'PLAYER'],
    ['TIE', 0.18, 'TIE'],
    ['BANKER', 0.265, 'BANKER'],
    ['BANKER_PAIR', 0.145, 'B PAIR'],
  ];
  const usable = bx1 - bx0 - bGap * (ratios.length - 1);
  const boxes: Box[] = [];
  {
    let x = bx0;
    for (const [area, ratio, title] of ratios) {
      const w = usable * ratio;
      boxes.push({ area, title, x0: x, x1: x + w });
      x += w + bGap;
    }
  }
  const boxFrame = (b: Box) => {
    const xm = (b.x0 + b.x1) / 2;
    return { left: b.x0, top: arc.y(xm, boxTop), width: b.x1 - b.x0, height: boxBottom - boxTop };
  };

  // Bottom rail: roads · chips · actions.
  const cell = Math.floor((railH - 16 * k) / BEAD_ROWS);
  const beadCols = 7;
  const roadCols = Math.max(10, Math.floor((innerW * 0.25) / cell));
  const roadsW = (beadCols + roadCols) * cell + 12 * k;
  const ctrlW = 50 * k;
  const ctrlH = 44 * k;
  const actionsW = ctrlW * 3 + 12 * k;
  const chipArea = innerW - roadsW - actionsW - 20 * k;
  const chipSize = Math.min(46 * k, chipArea / CHIP_VALUES.length - 8 * k);

  const beads = history.slice(0, beadCols * BEAD_ROWS).reverse();
  const maxRoadCol = bigRoad.reduce((m, c) => Math.max(m, c.c), 0);
  const roadStart = Math.max(0, maxRoadCol - roadCols + 1);

  // What each card slot shows right now.
  const revealing = reveal && reveal.period === view?.periodNumber ? reveal : null;
  const cardState = (side: Side, i: number) => {
    const hand = revealing?.hand;
    const cards = hand ? (side === 'PLAYER' ? hand.player : hand.banker) : null;
    const step = revealing?.steps.find((s) => s.side === side && s.i === i);
    if (i === 2) {
      const exists = !!step;
      return { exists, dealt: exists && elapsed >= step!.dealAt, faceUp: exists && elapsed >= step!.flipAt, card: cards?.[2] ?? null };
    }
    return { exists: true, dealt: phase !== 'BETTING', faceUp: !!step && elapsed >= step.flipAt, card: cards?.[i] ?? null };
  };
  const shownTotal = (side: Side) => {
    if (!revealing) return null;
    const cards = side === 'PLAYER' ? revealing.hand.player : revealing.hand.banker;
    const up = cards.filter((_, i) => cardState(side, i).faceUp);
    return up.length ? totalOf(up) : null;
  };
  const handState = (side: Side): 'idle' | 'win' | 'lose' => (!boardHand ? 'idle' : boardHand.winner === side ? 'win' : boardHand.winner === 'TIE' ? 'idle' : 'lose');
  const boxState = (area: BaccaratArea): 'normal' | 'win' | 'lose' | 'push' =>
    !boardHand ? 'normal' : areaWins(area, boardHand) ? 'win' : boardHand.winner === 'TIE' && (area === 'PLAYER' || area === 'BANKER') ? 'push' : 'lose';
  const boxTotal = (area: BaccaratArea) => Math.max(0, round2((areaTotals[area] ?? 0) - (flying[area] ?? 0)));

  const secsLeft = Math.max(0, Math.ceil((betEndMs - srvNow) / 1000));
  const statusText = phase === 'BETTING' ? 'PLACE YOUR BETS' : phase === 'DEALING' ? 'NO MORE BETS' : boardHand ? (boardHand.winner === 'TIE' ? 'TIE' : `${boardHand.winner} WINS`) : 'DEALING';

  const arcTextY = feltTop + 13 * k;
  const winnerColor = boardHand ? SIDE[boardHand.winner].main : GOLD;

  return (
    <View ref={rootRef} collapsable={false} style={styles.root}>
      {/* Salon, felt, rail and the painted boxes */}
      <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="bcRoom" cx="50%" cy="12%" r="85%">
            <Stop offset="0" stopColor="#223473" />
            <Stop offset="0.45" stopColor="#0C1538" />
            <Stop offset="1" stopColor="#03050E" />
          </RadialGradient>
          <RadialGradient id="bcFelt" cx="50%" cy="15%" r="90%">
            <Stop offset="0" stopColor="#6E1530" />
            <Stop offset="0.55" stopColor="#420A1C" />
            <Stop offset="1" stopColor="#1C030B" />
          </RadialGradient>
          <SvgLinearGradient id="bcRim" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#7A5214" />
            <Stop offset="0.25" stopColor="#F3D27A" />
            <Stop offset="0.5" stopColor="#FFF0B8" />
            <Stop offset="0.75" stopColor="#F3D27A" />
            <Stop offset="1" stopColor="#7A5214" />
          </SvgLinearGradient>
          <SvgLinearGradient id="bcRail" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#151B38" />
            <Stop offset="1" stopColor="#05070F" />
          </SvgLinearGradient>
          {ratios.map(([area]) => (
            <SvgLinearGradient key={area} id={`bcBox${area}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={BOX_FILL[area][0]} stopOpacity={0.95} />
              <Stop offset="1" stopColor={BOX_FILL[area][1]} stopOpacity={0.95} />
            </SvgLinearGradient>
          ))}
        </Defs>
        <Rect x={0} y={0} width={W} height={H} fill="url(#bcRoom)" />
        {/* art-deco fan behind the dealer */}
        <G opacity={0.16}>
          {Array.from({ length: 5 }, (_, i) => (
            <Path
              key={`a${i}`}
              d={`M ${cx - (60 + i * 55) * k} ${dealerTop + dealerH} A ${(60 + i * 55) * k} ${(60 + i * 55) * k} 0 0 1 ${cx + (60 + i * 55) * k} ${dealerTop + dealerH}`}
              fill="none"
              stroke={GOLD}
              strokeWidth={1}
            />
          ))}
          {Array.from({ length: 13 }, (_, i) => {
            const a = Math.PI + (i / 12) * Math.PI;
            const r0 = 60 * k;
            const r1 = 280 * k;
            const oy = dealerTop + dealerH;
            return <Line key={`r${i}`} x1={cx + Math.cos(a) * r0} y1={oy + Math.sin(a) * r0} x2={cx + Math.cos(a) * r1} y2={oy + Math.sin(a) * r1} stroke={GOLD} strokeWidth={0.8} />;
          })}
        </G>
        {/* felt with its gold rim */}
        <Path d={`${arc.curve(0, W, feltTop)} L ${W} ${H} L 0 ${H} Z`} fill="url(#bcFelt)" />
        <Path d={arc.curve(0, W, feltTop)} fill="none" stroke="url(#bcRim)" strokeWidth={3.5 * k} />
        <Path d={arc.curve(0, W, feltTop + 5 * k)} fill="none" stroke={GOLD} strokeOpacity={0.35} strokeWidth={0.8} />
        <Path id="bcArcText" d={arc.curve(L + 30 * k, R - 30 * k, arcTextY)} fill="none" />
        <SvgText fill={GOLD} fillOpacity={0.8} fontSize={9.5 * k} fontWeight="bold" letterSpacing={1.6 * k}>
          <TextPath href="#bcArcText" startOffset="50%" textAnchor="middle">
            {`TIE PAYS ${multipliers.TIE}x  ·  PAIRS PAY ${multipliers.PLAYER_PAIR}x  ·  PLAYER & BANKER RETURNED ON A TIE`}
          </TextPath>
        </SvgText>
        {/* boxes */}
        {boxes.map((b) => {
          const st = boxState(b.area);
          return (
            <G key={b.area}>
              <Path d={arc.band(b.x0, b.x1, boxTop, boxBottom)} fill={`url(#bcBox${b.area})`} stroke={GOLD} strokeOpacity={st === 'lose' ? 0.35 : 0.9} strokeWidth={1.6 * k} strokeLinejoin="round" />
              <Path d={arc.band(b.x0 + 4 * k, b.x1 - 4 * k, boxTop + 4 * k, boxBottom - 4 * k)} fill="none" stroke="#FFFFFF" strokeOpacity={0.18} strokeWidth={0.8} />
              {st === 'lose' && <Path d={arc.band(b.x0, b.x1, boxTop, boxBottom)} fill="#05060C" fillOpacity={0.62} />}
            </G>
          );
        })}
        {/* rail */}
        <Rect x={0} y={railTop} width={W} height={H - railTop} fill="url(#bcRail)" />
        <Line x1={0} y1={railTop} x2={W} y2={railTop} stroke="url(#bcRim)" strokeWidth={2 * k} />
      </Svg>

      {/* Winning boxes pulse gold */}
      {boardHand && (
        <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
          {boxes
            .filter((b) => boxState(b.area) === 'win')
            .map((b) => (
              <AnimatedPath key={b.area} d={arc.band(b.x0, b.x1, boxTop, boxBottom)} fill={GOLD} fillOpacity={0.12} stroke={GOLD} strokeWidth={4 * k} strokeOpacity={glow} />
            ))}
        </Svg>
      )}

      {/* Top bar */}
      <View style={[styles.topBar, { left: L, right: W - R, height: topH }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.row} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={26 * k} color={GOLD} />
          <View>
            <Text style={[styles.title, { fontSize: 18 * k, letterSpacing: 3 * k }]}>BACCARAT</Text>
            <Text style={[styles.subTitle, { fontSize: 8.5 * k }]}>PUNTO BANCO · #{view?.periodNumber.slice(-5) ?? '-----'}</Text>
          </View>
        </Pressable>
        <View style={[styles.statusPill, { paddingHorizontal: 14 * k, height: 26 * k, borderColor: boardHand ? winnerColor : 'rgba(255,214,107,0.55)' }]}>
          <Text style={[styles.statusText, { fontSize: 11 * k, color: boardHand ? '#FFFFFF' : GOLD }]} numberOfLines={1}>
            {statusText}
          </Text>
        </View>
        <View style={[styles.row, { gap: 6 * k }]}>
          <Pressable onPress={() => openPanel('rules')} style={[styles.iconBtn, { width: 32 * k, height: 32 * k }]} hitSlop={4}>
            <MaterialCommunityIcons name="information-variant" size={20 * k} color={GOLD} />
          </Pressable>
          <Pressable onPress={() => openPanel('bets')} style={[styles.iconBtn, { width: 32 * k, height: 32 * k }]} hitSlop={4}>
            <MaterialCommunityIcons name="history" size={18 * k} color={GOLD} />
          </Pressable>
          <View style={[styles.balancePill, { height: 32 * k, paddingHorizontal: 10 * k }]}>
            <MaterialCommunityIcons name="wallet" size={16 * k} color={GOLD} />
            <View style={{ marginLeft: 6 * k }}>
              <Text style={[styles.balanceValue, { fontSize: 13 * k }]} numberOfLines={1}>
                ₹{displayBalance.toFixed(2)}
              </Text>
              <Text style={[styles.balanceSub, { fontSize: 8.5 * k }]} numberOfLines={1}>
                Bet ₹{myTotal.toFixed(2)}
              </Text>
            </View>
          </View>
          <Pressable onPress={() => navigation.navigate('Deposit')} style={[styles.depositBtn, { width: 32 * k, height: 32 * k }]} hitSlop={4}>
            <MaterialCommunityIcons name="plus" size={20 * k} color="#2A1600" />
          </Pressable>
        </View>
      </View>

      {/* Round stats on the left of the dealer area */}
      <View style={[styles.statPlaque, { left: L, top: dealerTop + 8 * k, width: Math.max(70 * k, playerPanel.left - L - 10 * k), height: panelH - 10 * k }]}>
        <Text style={[styles.plaqueLabel, { fontSize: 8.5 * k }]}>LAST {stats.n}</Text>
        {(['PLAYER', 'BANKER', 'TIE'] as const).map((s) => {
          const n = s === 'PLAYER' ? stats.p : s === 'BANKER' ? stats.b : stats.t;
          return (
            <View key={s} style={[styles.row, { marginTop: 4 * k }]}>
              <View style={[styles.statDot, { width: 14 * k, height: 14 * k, borderRadius: 7 * k, backgroundColor: SIDE[s].main }]}>
                <Text style={[styles.statDotText, { fontSize: 8 * k }]}>{s[0]}</Text>
              </View>
              <Text style={[styles.plaqueValue, { fontSize: 12 * k, marginLeft: 5 * k }]}>{stats.n ? Math.round((n / stats.n) * 100) : 0}%</Text>
            </View>
          );
        })}
        <View style={[styles.plaqueDivider, { marginVertical: 5 * k }]} />
        <Text style={[styles.plaqueLabel, { fontSize: 8 * k }]}>PER BOX</Text>
        <Text style={[styles.plaqueValue, { fontSize: 10.5 * k }]} numberOfLines={1}>
          ₹{minStake}–₹{maxStake}
        </Text>
      </View>

      {/* Card shoe */}
      {shoeW > 40 * k && (
        <View pointerEvents="none" style={[styles.abs, shoe]}>
          <Shoe w={shoeW} />
        </View>
      )}

      {/* Player and Banker hands */}
      {(['PLAYER', 'BANKER'] as const).map((side) => {
        const box = side === 'PLAYER' ? playerPanel : bankerPanel;
        const st = handState(side);
        const total = shownTotal(side);
        const pair = boardHand && (side === 'PLAYER' ? boardHand.playerPair : boardHand.bankerPair);
        return (
          <View key={side} pointerEvents="none" style={[styles.abs, box, { opacity: st === 'lose' ? 0.5 : 1 }]}>
            <LinearGradient
              colors={[`${SIDE[side].dark}CC`, 'rgba(6,9,26,0.55)']}
              style={[StyleSheet.absoluteFill, styles.handPanel, { borderRadius: 12 * k, borderColor: st === 'win' ? GOLD : `${SIDE[side].main}88`, borderWidth: st === 'win' ? 2.5 : 1.2 }]}
            />
            <View style={[styles.handHead, { height: headH, flexDirection: side === 'PLAYER' ? 'row' : 'row-reverse', paddingHorizontal: 10 * k }]}>
              <Text style={[styles.handName, { fontSize: 13 * k, letterSpacing: 3 * k, color: SIDE[side].light }]}>{SIDE[side].name}</Text>
              {pair && (
                <View style={[styles.pairTag, { marginHorizontal: 6 * k, paddingHorizontal: 6 * k }]}>
                  <Text style={[styles.pairTagText, { fontSize: 8.5 * k }]}>PAIR</Text>
                </View>
              )}
              <View style={{ flex: 1 }} />
              {boardHand?.natural && st === 'win' && (
                <Text style={[styles.naturalText, { fontSize: 9 * k, marginHorizontal: 6 * k }]}>NATURAL</Text>
              )}
            </View>
            <View
              style={[
                styles.totalBadge,
                {
                  width: 30 * k,
                  height: 30 * k,
                  borderRadius: 15 * k,
                  top: -6 * k,
                  [side === 'PLAYER' ? 'right' : 'left']: -12 * k,
                  backgroundColor: SIDE[side].main,
                  borderColor: st === 'win' ? '#FFFFFF' : GOLD,
                },
              ]}
            >
              <Text style={[styles.totalText, { fontSize: 15 * k }]}>{total ?? '–'}</Text>
            </View>
          </View>
        );
      })}
      {view &&
        (['PLAYER', 'BANKER'] as const).flatMap((side) =>
          [0, 1, 2].map((i) => {
            const s = slot(side, i);
            const cs = cardState(side, i);
            return (
              <View key={`${view.periodNumber}-${side}-${i}`} pointerEvents="none" style={[styles.abs, { left: s.left, top: s.top, width: s.width, height: s.height }]}>
                {i < 2 && phase === 'BETTING' && <View style={[StyleSheet.absoluteFill, styles.cardSlot, { borderRadius: cardW * 0.1 }]} />}
                {cs.exists && (
                  <TableCard card={cs.card} w={cardW} dealt={cs.dealt} faceUp={cs.faceUp} sideways={i === 2} from={s.from} delay={i < 2 ? (i * 2 + (side === 'BANKER' ? 1 : 0)) * 140 : 0} />
                )}
              </View>
            );
          })
        )}

      {/* Centre: clock while betting, then the score */}
      <View pointerEvents="none" style={[styles.abs, styles.center, { left: cx - centerW / 2, top: dealerTop, width: centerW, height: dealerH }]}>
        {phase === 'BETTING' ? (
          <Clock secs={secsLeft} fraction={clockFraction} size={Math.min(centerW * 0.8, dealerH * 0.62)} />
        ) : boardHand ? (
          <Animated.View style={[styles.center, { transform: [{ scale: ribbon.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }], opacity: ribbon }]}>
            <Text style={[styles.scoreText, { fontSize: 30 * k }]}>
              <Text style={{ color: SIDE.PLAYER.light }}>{boardHand.playerTotal}</Text>
              <Text style={{ color: GOLD }}> : </Text>
              <Text style={{ color: SIDE.BANKER.light }}>{boardHand.bankerTotal}</Text>
            </Text>
            <LinearGradient colors={[`${winnerColor}00`, winnerColor, `${winnerColor}00`]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[styles.winRibbon, { paddingVertical: 3 * k, width: centerW * 1.25 }]}>
              <Text style={[styles.winRibbonText, { fontSize: 12 * k }]} numberOfLines={1}>
                {boardHand.winner === 'TIE' ? 'TIE' : `${boardHand.winner} WINS`}
              </Text>
            </LinearGradient>
          </Animated.View>
        ) : (
          <Text style={[styles.vsText, { fontSize: 26 * k }]}>VS</Text>
        )}
      </View>

      {/* Bet boxes */}
      {boxes.map((b) => {
        const frame = boxFrame(b);
        const st = boxState(b.area);
        const total = boxTotal(b.area);
        const big = b.area === 'PLAYER' || b.area === 'BANKER' || b.area === 'TIE';
        const colors = b.area === 'PLAYER' || b.area === 'PLAYER_PAIR' ? SIDE.PLAYER : b.area === 'TIE' ? SIDE.TIE : SIDE.BANKER;
        return (
          <Pressable
            key={b.area}
            onPress={() => onAreaPress(b.area)}
            style={({ pressed }) => [styles.abs, frame, styles.center, pressed && { transform: [{ scale: 0.97 }] }]}
          >
            <View
              ref={(v) => {
                boxRefs.current[b.area] = v;
              }}
              collapsable={false}
              style={[StyleSheet.absoluteFill, styles.center]}
            >
              <Text style={[styles.boxTitle, { fontSize: (big ? 20 : 12.5) * k, letterSpacing: (big ? 4 : 1.5) * k }]} numberOfLines={1}>
                {b.title}
              </Text>
              <Text style={[styles.boxMult, { fontSize: (big ? 15 : 12) * k, color: big ? GOLD : colors.light }]}>{multipliers[b.area]}x</Text>
              {total > 0 && (
                <>
                  <View style={[styles.stakeTag, { bottom: 6 * k, left: 6 * k, paddingHorizontal: 6 * k }]} pointerEvents="none">
                    <Text style={[styles.stakeText, { fontSize: 10 * k }]}>₹{round2(total)}</Text>
                  </View>
                  <View style={{ position: 'absolute', right: 6 * k, bottom: 5 * k }} pointerEvents="none">
                    <Chip value={total} size={(big ? 32 : 26) * k} label={shortAmount(total)} />
                  </View>
                </>
              )}
              {st === 'win' && <WinBurst k={k} />}
              {st === 'push' && total > 0 && (
                <View style={[styles.pushTag, { top: 4 * k, paddingHorizontal: 6 * k }]} pointerEvents="none">
                  <Text style={[styles.pushText, { fontSize: 8.5 * k }]}>RETURNED</Text>
                </View>
              )}
            </View>
          </Pressable>
        );
      })}

      {/* Bottom rail: roads · chips · actions */}
      <View style={[styles.abs, styles.row, { left: L, top: railTop + 6 * k, height: railH - 12 * k }]}>
        <View style={[styles.roads, { padding: 4 * k, gap: 4 * k }]}>
          <View style={styles.row}>
            {Array.from({ length: beadCols }, (_, c) => (
              <View key={c}>
                {Array.from({ length: BEAD_ROWS }, (_, r) => {
                  const h = beads[c * BEAD_ROWS + r];
                  const latest = !!h && c * BEAD_ROWS + r === beads.length - 1;
                  return (
                    <View key={r} style={[styles.gridCell, { width: cell, height: cell }]}>
                      {h && (
                        <View style={[styles.bead, { width: cell - 2, height: cell - 2, borderRadius: cell, backgroundColor: SIDE[h.winner].main }, latest && styles.beadLatest]}>
                          <Text style={[styles.beadText, { fontSize: cell * 0.55 }]}>{h.winner[0]}</Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
          <View style={[styles.row, { position: 'relative' }]}>
            {Array.from({ length: roadCols }, (_, c) => (
              <View key={c}>
                {Array.from({ length: BEAD_ROWS }, (_, r) => (
                  <View key={r} style={[styles.gridCell, { width: cell, height: cell }]} />
                ))}
              </View>
            ))}
            <Svg width={roadCols * cell} height={BEAD_ROWS * cell} style={StyleSheet.absoluteFill}>
              {bigRoad
                .filter((rc) => rc.c >= roadStart && rc.c < roadStart + roadCols)
                .map((rc) => {
                  const x = (rc.c - roadStart) * cell + cell / 2;
                  const y = rc.r * cell + cell / 2;
                  const rr = cell / 2 - 1.6;
                  return (
                    <G key={`${rc.c},${rc.r}`}>
                      <Circle cx={x} cy={y} r={rr} fill="none" stroke={SIDE[rc.w].main} strokeWidth={Math.max(1.4, cell * 0.16)} />
                      {rc.ties > 0 && <Line x1={x - rr} y1={y + rr} x2={x + rr} y2={y - rr} stroke={SIDE.TIE.main} strokeWidth={1.5} />}
                      {rc.bp && <Circle cx={x - rr * 0.72} cy={y - rr * 0.72} r={cell * 0.13} fill={SIDE.BANKER.main} />}
                      {rc.pp && <Circle cx={x + rr * 0.72} cy={y + rr * 0.72} r={cell * 0.13} fill={SIDE.PLAYER.main} />}
                    </G>
                  );
                })}
            </Svg>
          </View>
        </View>

        <View style={[styles.row, styles.center, { width: chipArea, gap: Math.max(3, 6 * k) }]}>
          {CHIP_VALUES.map((v) => {
            const allowed = v >= minStake && v <= maxStake;
            const active = v === selectedChip;
            return (
              <Pressable key={v} disabled={!allowed} onPress={() => setSelectedChip(v)} style={[styles.chipBtn, active && styles.chipActive, !allowed && styles.dim]}>
                <View
                  ref={(r) => {
                    chipRefs.current[v] = r;
                  }}
                  collapsable={false}
                >
                  <Chip value={v} size={chipSize} />
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.row, { gap: 6 * k, marginLeft: 8 * k }]}>
          {(
            [
              { label: 'UNDO', icon: 'undo-variant', color: '#E8ECFF', onPress: undo },
              { label: 'REPEAT', icon: 'repeat', color: '#E8ECFF', onPress: repeat },
              { label: 'CLEAR', icon: 'close-thick', color: '#FF6B7A', onPress: clearAll },
            ] as const
          ).map((a) => (
            <Pressable key={a.label} onPress={a.onPress} style={({ pressed }) => [styles.ctrlBtn, { width: ctrlW, height: ctrlH, borderRadius: 11 * k }, pressed && styles.pressed]}>
              <MaterialCommunityIcons name={a.icon} size={17 * k} color={a.color} />
              <Text style={[styles.ctrlLabel, { fontSize: 8.5 * k }]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Chips in flight */}
      {flights.map((f) => (
        <Animated.View
          key={f.id}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: -chipSize / 2,
            top: -chipSize / 2,
            transform: [
              { translateX: f.anim.interpolate({ inputRange: [0, 1], outputRange: [f.from.x, f.to.x] }) },
              { translateY: f.anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [f.from.y, Math.min(f.from.y, f.to.y) - 40, f.to.y] }) },
              { scale: f.anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.2, 0.8] }) },
            ],
          }}
        >
          <Chip value={f.value} size={chipSize} />
        </Animated.View>
      ))}

      {/* Place / No more bets */}
      {banner && (
        <View pointerEvents="none" style={[styles.abs, { left: 0, right: 0, top: (boxTop + boxBottom) / 2 - 26 * k, height: 52 * k }, styles.center]}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                opacity: bannerAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }),
                transform: [{ scaleX: bannerAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [0.2, 1, 1.1] }) }],
              },
            ]}
          >
            <LinearGradient
              colors={banner.start ? ['rgba(12,24,80,0)', 'rgba(22,44,130,0.95)', 'rgba(12,24,80,0)'] : ['rgba(90,8,26,0)', 'rgba(140,16,40,0.95)', 'rgba(90,8,26,0)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={[StyleSheet.absoluteFill, styles.bannerBar]}
            />
          </Animated.View>
          <Animated.Text
            style={[
              styles.bannerText,
              {
                fontSize: 28 * k,
                letterSpacing: 5 * k,
                opacity: bannerAnim.interpolate({ inputRange: [0, 0.6, 1, 2], outputRange: [0, 1, 1, 0] }),
                transform: [{ scale: bannerAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [1.8, 1, 1.08] }) }],
              },
            ]}
          >
            {banner.text}
          </Animated.Text>
        </View>
      )}

      {win !== null && (
        <View style={styles.winWrap}>
          <LinearGradient colors={['#1B2A66', '#0A1133']} style={[styles.winCard, { paddingHorizontal: 34 * k, paddingVertical: 12 * k }]}>
            {win.won > 0 ? (
              <>
                <Text style={[styles.winTitle, { fontSize: 14 * k }]}>YOU WIN</Text>
                <Text style={[styles.winAmount, { fontSize: 28 * k }]}>₹{win.won.toFixed(2)}</Text>
                {win.returned > 0 && <Text style={[styles.winSub, { fontSize: 10 * k }]}>+ ₹{win.returned.toFixed(2)} returned on the tie</Text>}
              </>
            ) : (
              <>
                <Text style={[styles.winTitle, { fontSize: 14 * k }]}>TIE · STAKE RETURNED</Text>
                <Text style={[styles.winAmount, { fontSize: 26 * k }]}>₹{win.returned.toFixed(2)}</Text>
              </>
            )}
          </LinearGradient>
          <Pressable onPress={() => setWin(null)} style={styles.winClose} hitSlop={10}>
            <MaterialCommunityIcons name="close" size={20} color={GOLD} />
          </Pressable>
        </View>
      )}

      {panel && (
        <Pressable style={styles.panelScrim} onPress={() => setPanel(null)}>
          <Pressable style={[styles.panelCard, { width: Math.min(innerW * 0.7, 560 * k), height: H * 0.84 }]} onPress={() => {}}>
            <View style={styles.panelTabs}>
              {(
                [
                  ['bets', 'MY BETS'],
                  ['rules', 'HOW TO PLAY'],
                ] as const
              ).map(([id, label]) => (
                <Pressable key={id} onPress={() => openPanel(id)} style={[styles.panelTab, panel === id && styles.panelTabActive]}>
                  <Text style={[styles.panelTabText, panel === id && styles.panelTabTextActive]}>{label}</Text>
                </Pressable>
              ))}
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => setPanel(null)} hitSlop={10} style={styles.panelClose}>
                <MaterialCommunityIcons name="close" size={20} color={GOLD} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 14 }}>
              {panel === 'rules' ? (
                <Rules multipliers={multipliers} minStake={minStake} maxStake={maxStake} maxPayout={config?.maxPayout ?? 10000} />
              ) : (
                <MyBets bets={myBets} />
              )}
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

const AREA_LABEL: Record<BaccaratArea, string> = { PLAYER: 'Player', BANKER: 'Banker', TIE: 'Tie', PLAYER_PAIR: 'Player Pair', BANKER_PAIR: 'Banker Pair' };

function MyBets({ bets }: { bets: BaccaratMyBet[] | null }) {
  if (bets === null) return <Text style={styles.panelMuted}>Loading…</Text>;
  if (bets.length === 0) return <Text style={styles.panelMuted}>No bets yet.</Text>;
  return (
    <View style={{ gap: 8 }}>
      {bets.map((b) => {
        const amount = Number(b.amount);
        const payout = Number(b.payout);
        const paid = Number(b.paidMultiplier);
        const pending = b.status === 'PENDING';
        const outcome = pending
          ? { text: 'Pending', color: '#C9D3FF' }
          : paid > 1
            ? { text: `+₹${payout.toFixed(2)}`, color: '#4ADE80' }
            : paid === 1
              ? { text: `₹${payout.toFixed(2)} returned`, color: GOLD }
              : { text: `-₹${amount.toFixed(2)}`, color: '#FF6B7A' };
        const side = b.area === 'PLAYER' || b.area === 'PLAYER_PAIR' ? SIDE.PLAYER : b.area === 'TIE' ? SIDE.TIE : SIDE.BANKER;
        return (
          <View key={b.id} style={styles.betRow}>
            <View style={[styles.betArea, { backgroundColor: side.dark, borderColor: side.main }]}>
              <Text style={styles.betAreaText} numberOfLines={1}>
                {AREA_LABEL[b.area]}
              </Text>
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.betPeriod}>#{b.periodNumber}</Text>
              <Text style={styles.betMeta}>
                ₹{amount.toFixed(2)} · x{Number(b.multiplier)}
                {b.hand ? `  ·  P ${b.hand.playerTotal} : B ${b.hand.bankerTotal}` : ''}
              </Text>
            </View>
            <Text style={[styles.betOutcome, { color: outcome.color }]}>{outcome.text}</Text>
          </View>
        );
      })}
    </View>
  );
}

function Rules({ multipliers, minStake, maxStake, maxPayout }: { multipliers: Record<BaccaratArea, number>; minStake: number; maxStake: number; maxPayout: number }) {
  const line = (t: string) => (
    <Text key={t} style={styles.ruleLine}>
      •  {t}
    </Text>
  );
  return (
    <View>
      <Text style={styles.ruleHead}>The game</Text>
      {line('Player and Banker get two cards each. The hand closest to 9 wins.')}
      {line('Card values: A = 1, 2–9 as shown, 10 / J / Q / K = 0. Only the last digit of the total counts (7 + 8 = 5).')}
      {line('A total of 8 or 9 on the first two cards is a Natural — nobody draws.')}
      <Text style={styles.ruleHead}>Third card</Text>
      {line('Player draws on 0–5 and stands on 6–7.')}
      {line('If the Player stood, the Banker draws on 0–5.')}
      {line("Otherwise the Banker draws on 0–2; on 3 unless the Player's third card is 8; on 4 if it is 2–7; on 5 if it is 4–7; on 6 if it is 6–7; and stands on 7.")}
      <Text style={styles.ruleHead}>Payouts (total return)</Text>
      <View style={styles.payTable}>
        {(['PLAYER', 'BANKER', 'TIE', 'PLAYER_PAIR', 'BANKER_PAIR'] as const).map((a) => (
          <View key={a} style={styles.payRow}>
            <Text style={styles.payName}>{AREA_LABEL[a]}</Text>
            <Text style={styles.payValue}>x{multipliers[a]}</Text>
          </View>
        ))}
      </View>
      {line('On a Tie, Player and Banker bets are returned.')}
      {line('Pair: the first two cards of that hand have the same rank.')}
      <Text style={styles.ruleHead}>Limits</Text>
      {line(`Bet per box ₹${minStake} – ₹${maxStake}. Max win per box ₹${maxPayout}.`)}
      {line('Every hand is fixed from a server seed before betting opens; its hash is shown up front and the seed is revealed with the cards.')}
    </View>
  );
}

/** Home-screen tile art: two fanned cards making a natural 9. */
export function BaccaratTileArt({ size }: { size: number }) {
  const w = size * 0.3;
  return (
    <View style={{ width: size * 0.7, height: size * 0.5, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', transform: [{ translateX: -w * 0.34 }, { rotate: '-12deg' }] }}>
        <CardFace card={{ rank: 13, suit: 'S' }} w={w} />
      </View>
      <View style={{ position: 'absolute', transform: [{ translateX: w * 0.34 }, { rotate: '12deg' }] }}>
        <CardFace card={{ rank: 9, suit: 'H' }} w={w} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#03050E' },
  rotating: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  rotatingText: { color: GOLD, fontSize: 16, fontWeight: '700' },
  abs: { position: 'absolute' },
  center: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  pressed: { transform: [{ scale: 0.94 }] },
  dim: { opacity: 0.35 },

  topBar: { position: 'absolute', top: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: GOLD, fontWeight: '900', fontFamily: 'serif', textShadowColor: '#6A4300', textShadowRadius: 6 },
  subTitle: { color: 'rgba(214,224,255,0.7)', fontWeight: '700', letterSpacing: 1.2, marginTop: -1 },
  statusPill: { borderRadius: 14, borderWidth: 1, backgroundColor: 'rgba(8,14,40,0.8)', alignItems: 'center', justifyContent: 'center' },
  statusText: { fontWeight: '900', letterSpacing: 2 },
  iconBtn: { borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(12,20,56,0.9)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.5)' },
  balancePill: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, backgroundColor: 'rgba(12,20,56,0.92)', borderWidth: 1.2, borderColor: GOLD },
  balanceValue: { color: GOLD, fontWeight: '900' },
  balanceSub: { color: 'rgba(214,224,255,0.75)', fontWeight: '700' },
  depositBtn: { borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: GOLD },

  statPlaque: { position: 'absolute', borderRadius: 12, backgroundColor: 'rgba(6,10,30,0.7)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.3)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  plaqueLabel: { color: 'rgba(214,224,255,0.7)', fontWeight: '800', letterSpacing: 1 },
  plaqueValue: { color: '#FFFFFF', fontWeight: '900' },
  plaqueDivider: { width: '60%', height: 1, backgroundColor: 'rgba(255,214,107,0.3)' },
  statDot: { alignItems: 'center', justifyContent: 'center' },
  statDotText: { color: '#FFFFFF', fontWeight: '900' },

  handPanel: { borderWidth: 1.2 },
  handHead: { alignItems: 'center' },
  handName: { fontWeight: '900' },
  pairTag: { borderRadius: 6, backgroundColor: GOLD, paddingVertical: 1 },
  pairTagText: { color: '#2A1600', fontWeight: '900', letterSpacing: 1 },
  naturalText: { color: GOLD, fontWeight: '900', letterSpacing: 1.5 },
  totalBadge: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderWidth: 2, elevation: 6, shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  totalText: { color: '#FFFFFF', fontWeight: '900' },
  cardSlot: { borderWidth: 1.2, borderStyle: 'dashed', borderColor: 'rgba(255,214,107,0.35)', backgroundColor: 'rgba(0,0,0,0.18)' },

  card: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#C8CBD6', overflow: 'hidden' },
  cardCorner: { position: 'absolute', alignItems: 'center' },
  cardRank: { fontWeight: '900' },
  courtFrame: { borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,236,190,0.35)' },
  courtLetter: { fontWeight: '900', fontFamily: 'serif' },

  clockText: { color: GOLD, fontWeight: '900' },
  vsText: { color: GOLD, fontWeight: '900', fontStyle: 'italic', fontFamily: 'serif', textShadowColor: '#C98A1C', textShadowRadius: 8 },
  scoreText: { fontWeight: '900', fontFamily: 'serif', textShadowColor: '#000', textShadowRadius: 6 },
  winRibbon: { alignItems: 'center', marginTop: 2 },
  winRibbonText: { color: '#FFFFFF', fontWeight: '900', letterSpacing: 2, textShadowColor: '#000', textShadowRadius: 4 },

  boxTitle: { color: '#FFFFFF', fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 5, textShadowOffset: { width: 0, height: 2 } },
  boxMult: { fontWeight: '900', marginTop: 1, textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  stakeTag: { position: 'absolute', paddingVertical: 1, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.5)' },
  stakeText: { color: '#FFFFFF', fontWeight: '800' },
  pushTag: { position: 'absolute', alignSelf: 'center', borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 1, borderColor: GOLD, paddingVertical: 1 },
  pushText: { color: GOLD, fontWeight: '900', letterSpacing: 1 },
  burstWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  coin: { position: 'absolute', width: 9, height: 9, borderRadius: 5, backgroundColor: '#FFD23F', borderWidth: 1, borderColor: '#B7791F' },
  winBadge: { position: 'absolute', alignSelf: 'center', borderRadius: 9, backgroundColor: GOLD, paddingVertical: 1, borderWidth: 1, borderColor: '#FFF3C4' },
  winBadgeText: { color: '#2A1600', fontWeight: '900', letterSpacing: 2 },

  roads: { flexDirection: 'row', borderRadius: 8, backgroundColor: '#F4F1E8', borderWidth: 1.5, borderColor: GOLD_DEEP },
  gridCell: { borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(40,40,60,0.22)', alignItems: 'center', justifyContent: 'center' },
  bead: { alignItems: 'center', justifyContent: 'center' },
  beadLatest: { borderWidth: 1.5, borderColor: '#111' },
  beadText: { color: '#FFFFFF', fontWeight: '900' },

  chipBtn: { borderRadius: 30, padding: 2 },
  chipActive: { backgroundColor: GOLD, transform: [{ translateY: -5 }], elevation: 8, shadowColor: GOLD, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  ctrlBtn: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16,26,70,0.95)', borderWidth: 1.2, borderColor: 'rgba(255,214,107,0.55)' },
  ctrlLabel: { color: '#E8ECFF', fontWeight: '800', marginTop: 1 },

  bannerBar: {},
  bannerText: { color: GOLD, fontWeight: '900', fontFamily: 'serif', textShadowColor: '#000', textShadowRadius: 8, textShadowOffset: { width: 0, height: 3 } },

  winWrap: { position: 'absolute', top: '26%', alignSelf: 'center', alignItems: 'center' },
  winCard: { alignItems: 'center', borderRadius: 16, borderWidth: 2, borderColor: GOLD },
  winTitle: { color: GOLD, fontWeight: '900', letterSpacing: 3 },
  winAmount: { color: '#FFFFFF', fontWeight: '900', marginTop: 2 },
  winSub: { color: 'rgba(214,224,255,0.8)', fontWeight: '700', marginTop: 2 },
  winClose: { marginTop: 8, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A1133', borderWidth: 2, borderColor: GOLD },

  panelScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  panelCard: { borderRadius: 16, backgroundColor: '#0B1233', borderWidth: 1.5, borderColor: GOLD, overflow: 'hidden' },
  panelTabs: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,214,107,0.25)' },
  panelTab: { paddingHorizontal: 14, paddingVertical: 7, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  panelTabActive: { backgroundColor: 'rgba(255,214,107,0.14)', borderBottomWidth: 2, borderBottomColor: GOLD },
  panelTabText: { color: 'rgba(214,224,255,0.6)', fontWeight: '900', letterSpacing: 1.5, fontSize: 12 },
  panelTabTextActive: { color: GOLD },
  panelClose: { padding: 6 },
  panelMuted: { color: 'rgba(214,224,255,0.6)', textAlign: 'center', marginTop: 20, fontWeight: '700' },
  betRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.15)' },
  betArea: { width: 92, paddingVertical: 6, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  betAreaText: { color: '#FFFFFF', fontWeight: '900', fontSize: 12 },
  betPeriod: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
  betMeta: { color: 'rgba(214,224,255,0.7)', fontWeight: '600', fontSize: 11, marginTop: 2 },
  betOutcome: { fontWeight: '900', fontSize: 13 },
  ruleHead: { color: GOLD, fontWeight: '900', fontSize: 13, letterSpacing: 1, marginTop: 10, marginBottom: 4 },
  ruleLine: { color: 'rgba(230,236,255,0.88)', fontSize: 12.5, lineHeight: 19, fontWeight: '600' },
  payTable: { borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,214,107,0.3)', marginVertical: 6, overflow: 'hidden' },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,214,107,0.2)' },
  payName: { color: '#FFFFFF', fontWeight: '800', fontSize: 12.5 },
  payValue: { color: GOLD, fontWeight: '900', fontSize: 12.5 },

  toast: { position: 'absolute', alignSelf: 'center', top: '42%', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.85)', borderWidth: 1, borderColor: GOLD_DEEP },
  toastText: { color: '#FFE08A', fontSize: 14, fontWeight: '700' },
});
