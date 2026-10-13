import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ScreenOrientation from 'expo-screen-orientation';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { ApiClientError } from '../api/client';
import {
  TeenPattiArea,
  TeenPattiConfig,
  TeenPattiHistoryEntry,
  TeenPattiRoundView,
  PlayingCard,
  cancelTeenPattiBets,
  fetchTeenPattiConfig,
  fetchTeenPattiCurrent,
  fetchTeenPattiHistory,
  fetchTeenPattiMyRound,
  placeTeenPattiBets,
} from '../api/backend';
import { useGameState } from '../state/GameStateContext';
import { useAuth } from '../state/AuthContext';

const CHIP_VALUES = [10, 20, 50, 100, 200, 500, 1000];
const CHIP_COLORS: Record<number, string> = {
  10: '#1E9E4A',
  20: '#0FA3A3',
  50: '#2563EB',
  100: '#D4A017',
  200: '#E07A1F',
  500: '#C81E3A',
  1000: '#0F766E',
};
const DEFAULT_CHIP = 10;
const FALLBACK_MULTIPLIERS: Record<TeenPattiArea, number> = { PLAYER_A: 1.8, PLAYER_B: 1.8, TIE: 813.38 };

const WIN_CARD_MS = 3000;
const TOAST_MS = 1600;
const BANNER_MS = 1400;
const BEAD_COLS = 7;
const BEAD_ROWS = 6;
const BEAD_COLOR: Record<string, string> = { PLAYER_A: '#E0447A', PLAYER_B: '#2E86DE', TIE: '#1F9A55' };
const GOLD = '#FFD66B';

/** Six cards, A, B, A, B, A, B, one every DEAL_MS after a short pause. */
const DEAL_START_MS = 500;
const DEAL_MS = 450;
const DEAL_END_MS = DEAL_START_MS + 5 * DEAL_MS + 600;

function areaWins(area: TeenPattiArea, winner: string | null): boolean {
  return !!winner && area === winner;
}

type Side = 'PLAYER_A' | 'PLAYER_B';
const TIE_STEPS = [1, 2, 5, 10, 20, 50];

const STAKE_STEPS = [10, 20, 50, 100, 200, 500];
const SIDE_LOOK: Record<Side, { felt: [string, string]; button: [string, string]; neon: string; label: string; short: string }> = {
  PLAYER_A: { felt: ['#C23A66', '#7E1740'], button: ['#FF5A92', '#C2185B'], neon: '#FF6FA5', label: 'Player A', short: 'A' },
  PLAYER_B: { felt: ['#1F6FCC', '#0D3C80'], button: ['#35C8F2', '#1466B8'], neon: '#4FC3FF', label: 'Player B', short: 'B' },
};

/** Stable pseudo-random 0..1 for a chip key, so a chip keeps its spot. */
function jitter(key: number, salt: number): number {
  const x = Math.sin(key * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** "1:0.74" — what one rupee wins on top of the stake. */
function ratioLabel(multiplier: number): string {
  return `1:${round2(multiplier - 1)}`;
}

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


const RANK_LABEL = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUIT_SYMBOL: Record<string, string> = { S: '♠', H: '♥', C: '♣', D: '♦' };


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

function CardFace({ card, w }: { card: PlayingCard; w: number }) {
  const red = card.suit === 'H' || card.suit === 'D';
  const color = red ? '#D0142C' : '#16161C';
  return (
    <LinearGradient colors={['#FFFFFF', '#E9E9F0']} style={[styles.card, { width: w, height: w * 1.4, borderRadius: w * 0.1 }]}>
      <View style={styles.cardCorner}>
        <Text style={[styles.cardRank, { color, fontSize: w * 0.28 }]}>{RANK_LABEL[card.rank]}</Text>
        <Text style={{ color, fontSize: w * 0.22, marginTop: -3 }}>{SUIT_SYMBOL[card.suit]}</Text>
      </View>
      <Text style={{ color, fontSize: w * 0.62, marginTop: w * 0.12 }}>{SUIT_SYMBOL[card.suit]}</Text>
    </LinearGradient>
  );
}

function CardBack({ w }: { w: number }) {
  return (
    <LinearGradient colors={['#5A1A0E', '#2A0A04']} style={[styles.card, styles.cardBack, { width: w, height: w * 1.4, borderRadius: w * 0.1 }]}>
      <View style={[styles.cardBackInner, { borderRadius: w * 0.07 }]}>
        <View style={[styles.cardBackDiamond, { width: w * 0.42, height: w * 0.42 }]} />
        <Text style={[styles.cardBackMark, { fontSize: w * 0.2 }]}>NP</Text>
      </View>
    </LinearGradient>
  );
}

/** A card that flips from its back to `card` whenever the card changes. */
function FlipCard({ card, w, delay = 0 }: { card: PlayingCard | null; w: number; delay?: number }) {
  const flip = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState<PlayingCard | null>(card);
  // Keyed on the card's value, not the object: every poll brings a fresh
  // object for the same card, which must not restart the flip.
  const cardKey = card ? `${card.rank}${card.suit}` : null;
  const cardRef = useRef(card);
  cardRef.current = card;
  useEffect(() => {
    if (cardKey) {
      setShown(cardRef.current);
      flip.setValue(0);
      Animated.timing(flip, { toValue: 1, duration: 520, delay, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start();
    } else {
      flip.setValue(0);
    }
  }, [cardKey, delay, flip]);
  const scaleX = flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0, 1] });
  const backOpacity = flip.interpolate({ inputRange: [0, 0.5, 0.501, 1], outputRange: [1, 1, 0, 0] });
  const faceOpacity = flip.interpolate({ inputRange: [0, 0.5, 0.501, 1], outputRange: [0, 0, 1, 1] });
  return (
    <Animated.View style={{ width: w, height: w * 1.4, transform: [{ scaleX }] }}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: backOpacity }]}>
        <CardBack w={w} />
      </Animated.View>
      {shown && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: faceOpacity }]}>
          <CardFace card={shown} w={w} />
        </Animated.View>
      )}
    </Animated.View>
  );
}

/** Stage card slot: empty while betting, dealt face-down while dealing,
 * flipped on the reveal. */
function DealtCard({ phase, card, w, from }: { phase: string; card: PlayingCard | null; w: number; from: 1 | -1 }) {
  const deal = useRef(new Animated.Value(phase === 'BETTING' ? 0 : 1)).current;
  useEffect(() => {
    if (phase === 'BETTING') {
      deal.setValue(0);
    } else {
      Animated.timing(deal, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }
  }, [phase, deal]);
  return (
    <View style={[styles.cardSlot, { width: w + 6, height: w * 1.4 + 6, borderRadius: w * 0.12 }]}>
      <Animated.View
        style={{
          opacity: deal,
          transform: [
            { translateX: deal.interpolate({ inputRange: [0, 1], outputRange: [from * 140, 0] }) },
            { translateY: deal.interpolate({ inputRange: [0, 1], outputRange: [-60, 0] }) },
            { rotate: deal.interpolate({ inputRange: [0, 1], outputRange: [`${from * 35}deg`, '0deg'] }) },
          ],
        }}
      >
        <FlipCard card={card} w={w} />
      </Animated.View>
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function Clock({ secs, fraction, size }: { secs: number; fraction: Animated.Value; size: number }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const urgent = secs <= 3;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinearGradient id="clockGold" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FFF1B8" />
            <Stop offset="1" stopColor="#C98A1C" />
          </SvgLinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r + 2} fill="#2A0C06" />
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#4A2412" strokeWidth={5} />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={urgent ? '#FF4B3E' : 'url(#clockGold)'}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={fraction.interpolate({ inputRange: [0, 1], outputRange: [c, 0] })}
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <Text style={[styles.clockText, { fontSize: size * 0.4 }, urgent && { color: '#FF5A4E' }]}>{secs}</Text>
    </View>
  );
}

/** Gold coins bursting out of a winning box. */
function WinBurst() {
  const t = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 90, useNativeDriver: true }).start();
  }, [t, pop]);
  return (
    <View pointerEvents="none" style={styles.burstWrap}>
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        return (
          <Animated.View
            key={i}
            style={[
              styles.coin,
              {
                opacity: t.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
                transform: [
                  { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(a) * 70] }) },
                  { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(a) * 45] }) },
                ],
              },
            ]}
          />
        );
      })}
      <Animated.Text style={[styles.winText, { transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] }]}>
        WIN
      </Animated.Text>
    </View>
  );
}

type AreaState = 'normal' | 'win' | 'lose';

/** A dealt card flying from the Joker slot into its lane. `instant` skips
 * the flight for cards that were already down when the screen caught up. */
function LaneCard({ card, w, from, instant, match }: { card: PlayingCard; w: number; from: { x: number; y: number }; instant: boolean; match: boolean }) {
  const t = useRef(new Animated.Value(instant ? 1 : 0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!instant) Animated.timing(t, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    // Mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!match) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.25, duration: 420, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [match, pulse]);
  return (
    <Animated.View
      style={{
        opacity: t.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 1] }),
        transform: [
          { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [from.x, 0] }) },
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [from.y, 0] }) },
          { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['-30deg', '0deg'] }) },
          { scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
        ],
      }}
    >
      <CardFace card={card} w={w} />
      {match && <Animated.View pointerEvents="none" style={[styles.matchRing, { borderRadius: w * 0.12, opacity: pulse }]} />}
    </Animated.View>
  );
}

// ---------- screen ----------

type PlacedChip = { key: number; area: TeenPattiArea; amount: number; id?: string };
type Flight = { id: number; value: number; area: TeenPattiArea; from: { x: number; y: number }; to: { x: number; y: number }; anim: Animated.Value };

export default function TeenPattiScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const landscape = W > H;
  const { coins, refreshWallet } = useGameState();
  const { backendUser } = useAuth();

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

  const [config, setConfig] = useState<TeenPattiConfig | null>(null);
  const [view, setView] = useState<TeenPattiRoundView | null>(null);
  const [history, setHistory] = useState<TeenPattiHistoryEntry[]>([]);
  const [chips, setChips] = useState<PlacedChip[]>([]);
  const [amounts, setAmounts] = useState<Record<TeenPattiArea, number>>({ PLAYER_A: DEFAULT_CHIP, PLAYER_B: DEFAULT_CHIP, TIE: 5 });
  const [win, setWin] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ text: string; start: boolean } | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [flying, setFlying] = useState<Partial<Record<TeenPattiArea, number>>>({});
  const [, setPhaseTick] = useState(0);

  const offsetRef = useRef(0);
  const periodRef = useRef<string | null>(null);
  const resultHandledRef = useRef<string | null>(null);
  const chipsRef = useRef<PlacedChip[]>([]);
  chipsRef.current = chips;
  const lastRoundRef = useRef<{ area: TeenPattiArea; amount: number }[]>([]);
  const idMapRef = useRef(new Map<number, string>());
  const keyRef = useRef(1);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const winTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<View>(null);
  const sideBtnRefs = useRef<Partial<Record<TeenPattiArea, View | null>>>({});
  const boxRefs = useRef<Partial<Record<TeenPattiArea, View | null>>>({});
  const flightId = useRef(1);

  const bannerAnim = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0.4)).current;
  const clockFraction = useRef(new Animated.Value(1)).current;

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
    fetchTeenPattiMyRound()
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
    fetchTeenPattiConfig()
      .then(setConfig)
      .catch(() => {});
    fetchTeenPattiHistory(100)
      .then((h) => mountedRef.current && setHistory(h))
      .catch(() => {});
    return () => {
      mountedRef.current = false;
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
      if (winTimer.current) clearTimeout(winTimer.current);
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
        const v = await fetchTeenPattiCurrent();
        const receivedAt = Date.now();
        if (!alive) return;
        const measured = new Date(v.serverTime).getTime() - (sentAt + receivedAt) / 2;
        offsetRef.current = first ? measured : offsetRef.current * 0.7 + measured * 0.3;
        setView(v);
        const srvNow = Date.now() + offsetRef.current;
        const nextEdge = Math.min(
          ...[v.betEndTime, v.resultTime, v.endTime].map((t) => new Date(t).getTime()).filter((t) => t > srvNow)
        );
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
      showBanner('Start Betting', true);
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

  // Re-render exactly when betting closes / the cards are due.
  useEffect(() => {
    if (!view) return;
    const srvNow = Date.now() + offsetRef.current;
    const betWait = new Date(view.betEndTime).getTime() - srvNow;
    const resWait = new Date(view.resultTime).getTime() - srvNow;
    const ids: ReturnType<typeof setTimeout>[] = [];
    if (betWait > 0)
      ids.push(
        setTimeout(() => {
          setPhaseTick((x) => x + 1);
          showBanner('Stop Betting', false);
        }, betWait + 20)
      );
    if (resWait > 0) ids.push(setTimeout(() => setPhaseTick((x) => x + 1), resWait + 20));
    return () => ids.forEach(clearTimeout);
  }, [view, showBanner]);

  const srvNow = Date.now() + offsetRef.current;
  const betEndMs = view ? new Date(view.betEndTime).getTime() : 0;
  const bettingOpen = !!view && srvNow < betEndMs;
  const phase: 'BETTING' | 'DEALING' | 'RESULT' = !view
    ? 'BETTING'
    : bettingOpen
      ? 'BETTING'
      : view.phase === 'RESULT' && view.playerA
        ? 'RESULT'
        : 'DEALING';
  const revealed = phase === 'RESULT' && view?.playerA && view?.playerB ? view : null;
  // Cards land one by one from the reveal time; the hands and the board
  // light up once all six are down.
  const dealCards = revealed ? [0, 1, 2].flatMap((j) => [revealed.playerA![j], revealed.playerB![j]]) : [];
  const dealElapsed = revealed ? srvNow - new Date(revealed.resultTime).getTime() : 0;
  const dealtCount = revealed ? Math.max(0, Math.min(6, Math.floor((dealElapsed - DEAL_START_MS) / DEAL_MS) + 1)) : 0;
  const dealDone = !!revealed && dealElapsed >= DEAL_END_MS;
  const boardResult = dealDone ? revealed : null;

  // Tick while cards are being dealt.
  useEffect(() => {
    if (!revealed || dealDone) return;
    const id = setInterval(() => setPhaseTick((x) => x + 1), 80);
    return () => clearInterval(id);
  }, [revealed, dealDone]);

  // Result banner once the matching card lands.
  const bannerFor = boardResult ? boardResult.periodNumber : null;
  useEffect(() => {
    if (!bannerFor || !boardResult?.winner) return;
    showBanner(boardResult.winner === 'TIE' ? 'Tie!' : `${SIDE_LOOK[boardResult.winner].label} Wins!`, boardResult.winner === 'PLAYER_A');
    // Once per round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bannerFor, showBanner]);

  useEffect(() => {
    if (phase !== 'BETTING') return;
    const id = setInterval(() => setPhaseTick((x) => x + 1), 250);
    return () => clearInterval(id);
  }, [phase]);

  // Reveal: road update, then this player's winnings once the deal is done.
  useEffect(() => {
    if (!view || view.phase !== 'RESULT' || !view.playerA || !view.playerB || resultHandledRef.current === view.periodNumber) return;
    const period = view.periodNumber;
    resultHandledRef.current = period;
    const entry: TeenPattiHistoryEntry = { periodNumber: period, playerA: view.playerA, playerB: view.playerB, handA: view.handA!, handB: view.handB!, winner: view.winner! };
    const doneAt = new Date(view.resultTime).getTime() + DEAL_END_MS + 700;
    setTimeout(() => mountedRef.current && setHistory((h) => (h[0]?.periodNumber === period ? h : [entry, ...h].slice(0, 100))), Math.max(0, doneAt - (Date.now() + offsetRef.current)));
    if (chipsRef.current.length > 0) {
      enqueue(async () => {
        try {
          const res = await fetchTeenPattiMyRound(period);
          const won = round2(res.bets.reduce((sum, b) => sum + Number(b.payout), 0));
          if (won > 0) {
            if (winTimer.current) clearTimeout(winTimer.current);
            winTimer.current = setTimeout(() => mountedRef.current && setWin(won), Math.max(0, doneAt + 600 - (Date.now() + offsetRef.current)));
          }
        } catch {
          // Winnings still land in the wallet; only the card is skipped.
        }
        refreshWallet();
      });
    }
  }, [view, enqueue, refreshWallet]);

  useEffect(() => {
    if (win === null) return;
    const id = setTimeout(() => setWin(null), WIN_CARD_MS);
    return () => clearTimeout(id);
  }, [win]);

  useEffect(() => {
    if (!boardResult) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 0.9, duration: 450, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.3, duration: 450, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [boardResult, glow]);

  const areaTotals = useMemo(() => {
    const m: Partial<Record<TeenPattiArea, number>> = {};
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
  const amountsRef = useRef(amounts);
  amountsRef.current = amounts;

  const placeChips = useCallback(
    (entries: { area: TeenPattiArea; amount: number }[]): boolean => {
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
          const res = await placeTeenPattiBets(entries);
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
  const launchFlight = useCallback((area: TeenPattiArea, value: number) => {
    const chipView = sideBtnRefs.current[area];
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
            to: { x: bx - rx + bw / 2 + (Math.random() - 0.5) * bw * 0.3, y: by - ry + bh / 2 + (Math.random() - 0.5) * bh * 0.2 },
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
    (area: TeenPattiArea) => {
      const value = amountsRef.current[area] ?? DEFAULT_CHIP;
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
        await cancelTeenPattiBets([id]);
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
        await cancelTeenPattiBets();
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
    const m = new Map<TeenPattiArea, number>();
    for (const c of lastRoundRef.current) m.set(c.area, round2((m.get(c.area) ?? 0) + c.amount));
    placeChips([...m.entries()].map(([area, amount]) => ({ area, amount })));
  };

  // Bead plate: oldest first, filled down each column.
  const beads = history.slice(0, BEAD_COLS * BEAD_ROWS).reverse();
  const stats = useMemo(() => {
    const n = history.length;
    if (!n) return null;
    const a = history.filter((h) => h.winner === 'PLAYER_A').length;
    const b = history.filter((h) => h.winner === 'PLAYER_B').length;
    return { a: Math.round((a / n) * 100), b: Math.round((b / n) * 100), n };
  }, [history]);

  const areaState = (area: TeenPattiArea): AreaState =>
    !boardResult ? 'normal' : areaWins(area, boardResult.winner) ? 'win' : 'lose';
  const shownTotal = (area: TeenPattiArea) => Math.max(0, round2((areaTotals[area] ?? 0) - (flying[area] ?? 0)));

  const secsLeft = Math.max(0, Math.ceil((betEndMs - srvNow) / 1000));

  if (!landscape) {
    return (
      <View style={[styles.root, styles.rotating]}>
        <MaterialCommunityIcons name="phone-rotate-landscape" size={48} color={GOLD} />
        <Text style={styles.rotatingText}>Turning to landscape…</Text>
      </View>
    );
  }

  // ---- layout ----
  const padX = Math.max(insets.left, insets.right, 12);
  const topH = 44;
  const bottomH = 66 + Math.max(insets.bottom, 6);
  const table = { left: padX, top: topH + 4, width: W - 2 * padX, height: H - topH - bottomH - 8 };
  const rim = Math.max(6, table.height * 0.035);
  const inner = { left: table.left + rim, top: table.top + rim, width: table.width - 2 * rim, height: table.height - 2 * rim };
  const cx = inner.left + inner.width / 2;
  const halfW = inner.width / 2;
  const k = Math.max(0.8, Math.min(1.6, H / 412));
  const cardW = Math.min(inner.height * 0.21, 56 * k);
  const cardGap = cardW * 0.18;
  const cardsTop = inner.top + 14;
  const vsSize = Math.min(56 * k, inner.height * 0.2);
  const deck = { x: cx, y: inner.top + 14 + vsSize / 2 };
  const clockSize = Math.min(54 * k, inner.height * 0.19);
  const pileCY = inner.top + inner.height * 0.64;
  const pileRX = halfW * 0.24;
  const pileRY = inner.height * 0.12;
  const pileChip = Math.min(30 * k, inner.height * 0.1);
  const sideCX = (side: Side) => (side === 'PLAYER_A' ? cx - halfW * 0.5 : cx + halfW * 0.5);
  const slotLeft = (side: Side, j: number) => sideCX(side) - (3 * cardW + 2 * cardGap) / 2 + j * (cardW + cardGap);

  const winner = boardResult?.winner ?? null;
  const statusLabel = phase === 'BETTING' ? 'Place Your Bets' : phase === 'DEALING' ? 'Dealing Cards' : boardResult ? (boardResult.winner === 'TIE' ? 'Tie' : `${SIDE_LOOK[boardResult.winner as Side].label} Wins`) : 'Dealing Cards';
  const tieMult = multipliers.TIE;
  const tieMax = Math.max(minStake, Math.floor((config?.maxPayout ?? 10000) / tieMult));
  const stepsFor = (area: TeenPattiArea) => (area === 'TIE' ? TIE_STEPS.filter((v) => v >= minStake && v <= Math.min(maxStake, tieMax)) : STAKE_STEPS.filter((v) => v >= minStake && v <= maxStake));
  const stepAmount = (area: TeenPattiArea, dir: 1 | -1) => {
    const steps = stepsFor(area);
    const i = Math.max(0, steps.indexOf(amounts[area]));
    const next = steps[Math.max(0, Math.min(steps.length - 1, i + dir))] ?? amounts[area];
    setAmounts((a) => ({ ...a, [area]: next }));
  };
  const recent = history.slice(0, 16).reverse();

  return (
    <View ref={rootRef} collapsable={false} style={styles.root}>
      <LinearGradient colors={['#3A0D16', '#1E060B']} style={StyleSheet.absoluteFill} />

      {/* Top bar */}
      <View style={[styles.topBar, { height: topH, paddingLeft: padX, paddingRight: padX }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={26} color="#F5B942" />
          <Text style={styles.title}>TEEN PATTI 20-20</Text>
        </Pressable>
        <View style={styles.recentRow}>
          {recent.map((h) => (
            <View key={h.periodNumber} style={[styles.recentDot, { backgroundColor: BEAD_COLOR[h.winner] }]}>
              <Text style={styles.recentText}>{h.winner === 'PLAYER_A' ? 'A' : h.winner === 'PLAYER_B' ? 'B' : 'T'}</Text>
            </View>
          ))}
        </View>
        <View style={styles.topRight}>
          <View style={styles.topBalance}>
            <MaterialCommunityIcons name="wallet" size={15} color={GOLD} />
            <Text style={styles.topBalanceText}>₹{displayBalance.toFixed(2)}</Text>
          </View>
          <Pressable onPress={() => navigation.navigate('Deposit')} style={styles.depositPill}>
            <MaterialCommunityIcons name="wallet-plus" size={16} color="#F5B942" />
            <Text style={styles.depositText}>Deposit</Text>
          </Pressable>
        </View>
      </View>

      {/* Table: dark rim, Player A half and Player B half */}
      <View style={[styles.abs, styles.tableRim, { left: table.left, top: table.top, width: table.width, height: table.height, borderRadius: table.height / 2 }]} />
      <View style={[styles.abs, styles.feltWrap, { left: inner.left, top: inner.top, width: inner.width, height: inner.height, borderRadius: inner.height / 2 }]}>
        {(['PLAYER_A', 'PLAYER_B'] as const).map((side) => (
          <LinearGradient key={side} colors={SIDE_LOOK[side].felt} start={{ x: side === 'PLAYER_A' ? 1 : 0, y: 0 }} end={{ x: side === 'PLAYER_A' ? 0 : 1, y: 1 }} style={styles.feltHalf}>
            <Text style={[styles.watermark, { fontSize: inner.height * 0.34, top: '28%', [side === 'PLAYER_A' ? 'left' : 'right']: inner.height * 0.3 }]}>{SIDE_LOOK[side].short}</Text>
            {winner && winner !== side && <View style={styles.loseShade} />}
          </LinearGradient>
        ))}
      </View>
      {winner && winner !== 'TIE' && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.abs,
            styles.winEdge,
            {
              left: winner === 'PLAYER_A' ? inner.left : cx,
              top: inner.top,
              width: halfW,
              height: inner.height,
              borderColor: SIDE_LOOK[winner].neon,
              shadowColor: SIDE_LOOK[winner].neon,
              opacity: glow,
              [winner === 'PLAYER_A' ? 'borderTopLeftRadius' : 'borderTopRightRadius']: inner.height / 2,
              [winner === 'PLAYER_A' ? 'borderBottomLeftRadius' : 'borderBottomRightRadius']: inner.height / 2,
            },
          ]}
        />
      )}

      {/* Per side: name, three card slots, hand name, chip pile, payout */}
      {(['PLAYER_A', 'PLAYER_B'] as const).map((side) => {
        const pcx = sideCX(side);
        const mine = chips.filter((c) => c.area === side).slice(-40);
        const hand = side === 'PLAYER_A' ? boardResult?.handA : boardResult?.handB;
        return (
          <React.Fragment key={side}>
            {[0, 1, 2].map((j) => (
              <View key={j} pointerEvents="none" style={[styles.abs, styles.cardSlot, { left: slotLeft(side, j) - 3, top: cardsTop - 3, width: cardW + 6, height: cardW * 1.4 + 6, borderRadius: cardW * 0.12 }]} />
            ))}
            <View pointerEvents="none" style={[styles.abs, styles.center, { left: pcx - 90, width: 180, top: cardsTop + cardW * 1.4 + 8 }]}>
              {hand ? (
                <View style={[styles.handPill, winner === side && styles.handPillWin]}>
                  <Text style={[styles.handText, { fontSize: 12 * k }, winner === side && styles.handTextWin]}>{hand}</Text>
                </View>
              ) : (
                <Text style={[styles.sideName, { fontSize: 13 * k }]}>{SIDE_LOOK[side].label}</Text>
              )}
            </View>
            <View
              ref={(v) => {
                boxRefs.current[side] = v;
              }}
              collapsable={false}
              pointerEvents="none"
              style={[styles.abs, { left: pcx - pileRX, top: pileCY - pileRY, width: pileRX * 2, height: pileRY * 2 }]}
            >
              {mine.map((c) => {
                const a = jitter(c.key, 1) * Math.PI * 2;
                const r = Math.sqrt(jitter(c.key, 2));
                return (
                  <View key={c.key} style={{ position: 'absolute', left: pileRX + Math.cos(a) * r * (pileRX - pileChip / 2) - pileChip / 2, top: pileRY + Math.sin(a) * r * (pileRY - pileChip / 2) - pileChip / 2 }}>
                    <Chip value={c.amount} size={pileChip} label={shortAmount(c.amount)} />
                  </View>
                );
              })}
            </View>
            <View pointerEvents="none" style={[styles.abs, styles.sideInfo, { left: pcx - 80, width: 160, top: inner.top + inner.height - 50 * k }]}>
              <Text style={[styles.ratio, { fontSize: 19 * k, color: side === 'PLAYER_A' ? '#FFC2D6' : '#BFE6FF' }]}>{ratioLabel(multipliers[side])}</Text>
              <Text style={[styles.sideTotal, { fontSize: 12 * k }]}>₹{shownTotal(side).toFixed(2)}</Text>
            </View>
          </React.Fragment>
        );
      })}

      {/* Centre: VS, status, clock, Tie box */}
      <View pointerEvents="none" style={[styles.abs, styles.vsBadge, { left: cx - vsSize / 2, top: inner.top + 14, width: vsSize, height: vsSize, borderRadius: vsSize / 2 }]}>
        <Text style={[styles.vsText, { fontSize: vsSize * 0.38 }]}>VS</Text>
      </View>
      <View pointerEvents="none" style={[styles.abs, styles.center, { left: cx - 80, width: 160, top: inner.top + 20 + vsSize }]}>
        <Text style={[styles.status, { fontSize: 15 * k }, winner && winner !== 'TIE' && { color: SIDE_LOOK[winner].neon }]} numberOfLines={1}>
          {statusLabel}
        </Text>
        {phase === 'BETTING' && (
          <View style={{ marginTop: 4 }}>
            <Clock secs={secsLeft} fraction={clockFraction} size={clockSize} />
          </View>
        )}
      </View>
      <View
        ref={(v) => {
          boxRefs.current.TIE = v;
        }}
        collapsable={false}
        pointerEvents="none"
        style={[styles.abs, styles.tieBox, winner === 'TIE' && styles.tieBoxWin, { left: cx - 52 * k, width: 104 * k, top: inner.top + inner.height - 58 * k }]}
      >
        <Text style={[styles.tieTitle, { fontSize: 12 * k }]}>TIE {tieMult}x</Text>
        <Text style={[styles.tieAmt, { fontSize: 11 * k }]}>₹{shownTotal('TIE').toFixed(2)}</Text>
      </View>

      {/* Dealt cards */}
      {dealCards.slice(0, dealtCount).map((card, i) => {
        const side: Side = i % 2 === 0 ? 'PLAYER_A' : 'PLAYER_B';
        const j = Math.floor(i / 2);
        const left = slotLeft(side, j);
        const due = DEAL_START_MS + i * DEAL_MS;
        const won = dealDone && winner === side;
        return (
          <View key={`${revealed?.periodNumber}-${i}`} pointerEvents="none" style={[styles.abs, { left, top: cardsTop, zIndex: 10 + i }]}>
            <LaneCard card={card} w={cardW} from={{ x: deck.x - (left + cardW / 2), y: deck.y - (cardsTop + cardW * 0.7) }} instant={dealElapsed - due > 600} match={won} />
          </View>
        );
      })}

      {/* Bottom bar: Player A / Tie / Player B bet buttons, undo / repeat */}
      <View style={[styles.bottomBar, { height: bottomH, paddingBottom: Math.max(insets.bottom, 6), paddingLeft: padX, paddingRight: padX }]}>
        {(['PLAYER_A', 'TIE', 'PLAYER_B'] as const).map((area) => {
          const colors: [string, string] = area === 'TIE' ? ['#F5C542', '#B8860B'] : SIDE_LOOK[area].button;
          return (
            <View key={area} style={styles.sideCtrl}>
              <Pressable onPress={() => stepAmount(area, -1)} style={styles.coinBtn} hitSlop={6}>
                <MaterialCommunityIcons name="minus" size={20} color="#5A3A00" />
              </Pressable>
              <Pressable onPress={() => onAreaPress(area)} style={({ pressed }) => [pressed && styles.pressed, !bettingOpen && styles.dim]}>
                <View
                  ref={(v) => {
                    sideBtnRefs.current[area] = v;
                  }}
                  collapsable={false}
                >
                  <LinearGradient colors={colors} style={[styles.betBtn, area === 'TIE' && styles.tieBtn]}>
                    <Text style={[styles.betBtnName, area === 'TIE' && { color: '#3A2400' }]}>{area === 'TIE' ? 'Tie' : SIDE_LOOK[area].label}</Text>
                    <Text style={[styles.betBtnAmt, area === 'TIE' && { color: '#3A2400' }]}>₹{amounts[area].toFixed(2)}</Text>
                  </LinearGradient>
                </View>
              </Pressable>
              <Pressable onPress={() => stepAmount(area, 1)} style={styles.coinBtn} hitSlop={6}>
                <MaterialCommunityIcons name="plus" size={20} color="#5A3A00" />
              </Pressable>
            </View>
          );
        })}
        <View style={styles.miniActions}>
          <Pressable onPress={undo} style={styles.miniBtn} hitSlop={6}>
            <MaterialCommunityIcons name="undo-variant" size={18} color="#F2E6FF" />
          </Pressable>
          <Pressable onPress={repeat} style={styles.miniBtn} hitSlop={6}>
            <MaterialCommunityIcons name="repeat" size={18} color="#F2E6FF" />
          </Pressable>
        </View>
      </View>

      {/* Chips in flight */}
      {flights.map((f) => (
        <Animated.View
          key={f.id}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: -pileChip / 2,
            top: -pileChip / 2,
            transform: [
              { translateX: f.anim.interpolate({ inputRange: [0, 1], outputRange: [f.from.x, f.to.x] }) },
              {
                translateY: f.anim.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [f.from.y, Math.min(f.from.y, f.to.y) - 40, f.to.y],
                }),
              },
              { scale: f.anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.2, 0.85] }) },
            ],
          }}
        >
          <Chip value={f.value} size={pileChip} />
        </Animated.View>
      ))}

      {banner && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.abs,
            styles.popPill,
            {
              top: inner.top + inner.height * 0.4,
              left: cx - 110,
              width: 220,
              opacity: bannerAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }),
              transform: [{ scale: bannerAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [0.6, 1, 1.1] }) }],
            },
          ]}
        >
          <Text style={styles.popText}>{banner.text}</Text>
        </Animated.View>
      )}

      {win !== null && (
        <View style={styles.winWrap}>
          <LinearGradient colors={['#3B1A06', '#1C0B02']} style={styles.winCard}>
            <Text style={styles.winTitle}>YOU WIN</Text>
            <Text style={styles.winAmount}>₹{win.toFixed(2)}</Text>
          </LinearGradient>
          <Pressable onPress={() => setWin(null)} style={styles.winClose} hitSlop={10}>
            <MaterialCommunityIcons name="close" size={20} color="#FFE08A" />
          </Pressable>
        </View>
      )}

      {toast && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#070006' },
  rotating: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  rotatingText: { color: GOLD, fontSize: 16, fontWeight: '700' },

  abs: { position: 'absolute' },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topBalance: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.35)' },
  topBalanceText: { color: GOLD, fontSize: 13, fontWeight: '900' },
  handPill: { paddingHorizontal: 12, paddingVertical: 3, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  handPillWin: { backgroundColor: 'rgba(60,40,0,0.85)', borderColor: GOLD, borderWidth: 2 },
  handText: { color: '#FFFFFF', fontWeight: '900', letterSpacing: 0.5 },
  handTextWin: { color: GOLD },
  vsBadge: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#2A0C06', borderWidth: 3, borderColor: GOLD },
  vsText: { color: GOLD, fontWeight: '900', fontStyle: 'italic' },
  tieBox: { alignItems: 'center', paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: 1.5, borderColor: 'rgba(255,214,107,0.6)' },
  tieBoxWin: { borderColor: GOLD, borderWidth: 3, backgroundColor: 'rgba(80,55,0,0.8)' },
  tieTitle: { color: GOLD, fontWeight: '900' },
  tieAmt: { color: '#FFFFFF', fontWeight: '800' },
  tieBtn: { width: 96 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recentRow: { flexDirection: 'row', gap: 3, flexShrink: 1, overflow: 'hidden' },
  recentDot: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  recentText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
  tableRim: { backgroundColor: '#1A1115', borderWidth: 2, borderColor: '#4A2A33', shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 12, elevation: 8 },
  feltWrap: { flexDirection: 'row', overflow: 'hidden' },
  feltHalf: { flex: 1, justifyContent: 'center' },
  watermark: { position: 'absolute', top: '6%', color: 'rgba(255,255,255,0.1)', fontWeight: '900', fontStyle: 'italic' },
  winEdge: { borderWidth: 3, shadowOpacity: 1, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } },
  sideInfo: { alignItems: 'center' },
  ratio: { fontWeight: '900', letterSpacing: 1 },
  sideTotal: { color: '#FFFFFF', fontWeight: '800', opacity: 0.9 },
  jokerBox: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  jokerGlow: { borderColor: GOLD, borderWidth: 2, shadowColor: GOLD, shadowOpacity: 0.9, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  status: { color: GOLD, fontWeight: '900', fontStyle: 'italic', textShadowColor: '#000', textShadowRadius: 6, textShadowOffset: { width: 0, height: 2 } },
  countText: { color: '#FFFFFF', fontWeight: '800', marginTop: 2, opacity: 0.85 },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(20,4,8,0.85)', borderTopWidth: 1, borderTopColor: '#4A2A33' },
  sideCtrl: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  coinBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2B632', borderWidth: 2, borderColor: '#FFE08A' },
  betBtnWrap: {},
  betBtn: { width: 120, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)' },
  betBtnName: { color: '#FFFFFF', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  betBtnAmt: { color: 'rgba(255,255,255,0.95)', fontSize: 12, fontWeight: '800' },
  balanceBox: { alignItems: 'center' },
  balanceLabel: { color: 'rgba(255,220,230,0.7)', fontSize: 10, fontWeight: '700' },
  balanceValue: { color: GOLD, fontSize: 15, fontWeight: '900' },
  miniActions: { flexDirection: 'row', gap: 6 },
  miniBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  popPill: { zIndex: 1000, elevation: 30, alignItems: 'center', paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(10,2,6,0.8)', borderWidth: 1.5, borderColor: GOLD },
  popText: { color: GOLD, fontSize: 20, fontWeight: '900', fontStyle: 'italic' },
  stripName: { color: 'rgba(255,255,255,0.92)', fontWeight: '900', letterSpacing: 4, textShadowRadius: 14 },
  jokerLabel: { color: GOLD, fontWeight: '900', letterSpacing: 1.5 },
  jokerSlot: { padding: 3, backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1.5, borderColor: 'rgba(255,214,107,0.7)' },
  countBadge: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#2A0C06', borderWidth: 3, borderColor: GOLD },
  countNum: { color: '#FFFFFF', fontWeight: '900' },
  countLbl: { color: GOLD, fontWeight: '800', letterSpacing: 1, marginTop: -2 },
  lane: { overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,214,107,0.35)', justifyContent: 'center', paddingLeft: 8 },
  laneWin: { borderColor: GOLD, borderWidth: 3 },
  laneLose: { opacity: 0.55 },
  lanePill: { alignItems: 'center', justifyContent: 'center' },
  laneLetter: { color: '#FFFFFF', fontWeight: '900', lineHeight: undefined },
  laneName: { color: 'rgba(255,255,255,0.9)', fontWeight: '900', letterSpacing: 2, marginTop: -4 },
  matchRing: { position: 'absolute', top: -4, left: -4, right: -4, bottom: -4, borderWidth: 3, borderColor: GOLD },
  boxShine: { position: 'absolute', top: 0, left: 0, right: 0, height: '45%' },
  boxLip: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.28)' },
  boxSubBet: { color: GOLD, fontWeight: '900', marginTop: -1 },
  boxHasBet: { borderColor: GOLD, borderWidth: 2 },
  jokerTab: { position: 'absolute', alignItems: 'center', paddingVertical: 2, backgroundColor: 'rgba(40,12,4,0.9)', borderWidth: 1, borderColor: GOLD },
  boxSub: { color: 'rgba(255,255,255,0.7)', fontWeight: '800', letterSpacing: 1, marginTop: -2 },
  absFill: { position: 'absolute', top: 0, left: 0 },
  center: { alignItems: 'center', justifyContent: 'center' },
  stripClip: { overflow: 'hidden' },

  backBtn: { flexDirection: 'row', alignItems: 'center' },
  title: { color: '#E7D9D2', fontWeight: '900', letterSpacing: 1.5 },
  topStatus: { color: GOLD, fontWeight: '800', letterSpacing: 0.5, textShadowColor: '#000', textShadowRadius: 4 },
  depositPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16, backgroundColor: 'rgba(58,10,16,0.85)', borderWidth: 1, borderColor: '#8A2E38' },
  depositText: { color: '#F5B942', fontWeight: '700' },

  clockText: { color: GOLD, fontWeight: '900' },
  vsSmall: { color: GOLD, fontWeight: '900', fontStyle: 'italic', textShadowColor: '#C98A1C', textShadowRadius: 8 },
  namePlate: { position: 'absolute', bottom: -6, paddingHorizontal: 12, paddingVertical: 1, borderRadius: 8, borderWidth: 1, borderColor: '#7A4A00' },
  nameText: { color: '#3A1E00', fontSize: 11, fontWeight: '900', letterSpacing: 2 },

  card: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#C9C9D2', overflow: 'hidden' },
  cardCorner: { position: 'absolute', top: 3, left: 5, alignItems: 'center' },
  cardRank: { fontWeight: '900' },
  cardBack: { borderColor: '#D9A441', borderWidth: 2 },
  cardBackInner: { position: 'absolute', top: 4, left: 4, right: 4, bottom: 4, borderWidth: 1, borderColor: 'rgba(217,164,65,0.6)', alignItems: 'center', justifyContent: 'center' },
  cardBackDiamond: { position: 'absolute', borderWidth: 1.5, borderColor: 'rgba(217,164,65,0.7)', transform: [{ rotate: '45deg' }] },
  cardBackMark: { color: '#D9A441', fontWeight: '900' },
  cardSlot: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,214,107,0.45)', backgroundColor: 'rgba(0,0,0,0.3)' },

  sidePanel: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4, borderRadius: 18, backgroundColor: 'rgba(16,2,20,0.55)', borderWidth: 1, borderColor: 'rgba(255,120,200,0.22)', gap: 1 },
  sideName: { color: '#FFFFFF', fontWeight: '800', marginBottom: 4 },
  sideLabel: { color: '#C9B6EE', fontWeight: '700', letterSpacing: 0.5 },
  sideValue: { color: GOLD, fontWeight: '900', marginBottom: 3 },
  sideValueWhite: { color: '#FFFFFF', fontWeight: '800' },
  beadGrid: { flexDirection: 'row', gap: 2, marginVertical: 4 },
  beadCol: { gap: 2 },
  bead: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  beadEmpty: { backgroundColor: 'rgba(255,255,255,0.06)' },
  beadLatest: { borderWidth: 2, borderColor: GOLD },
  beadText: { color: '#FFFFFF', fontWeight: '900' },
  statRow: { flexDirection: 'row', gap: 6 },
  statLine: { fontWeight: '800' },

  boxHit: { position: 'absolute' },
  boxPressed: { transform: [{ scale: 0.96 }] },
  boxInner: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)' },
  boxWin: { borderColor: GOLD, borderWidth: 3 },
  boxMark: { position: 'absolute', color: '#FFFFFF', opacity: 0.08, fontWeight: '900', textAlign: 'center' },
  boxTitle: { color: 'rgba(255,255,255,0.95)', fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.65)', textShadowRadius: 5, textShadowOffset: { width: 0, height: 2 } },
  boxMult: { color: GOLD, fontWeight: '900', marginTop: 1, textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  boxBet: { position: 'absolute', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.5)' },
  boxBetText: { color: '#FFFFFF', fontWeight: '800' },
  pressed: { transform: [{ scale: 0.95 }] },
  winGlow: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,214,107,0.22)' },
  burstWrap: { position: 'absolute', top: '42%', left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  coin: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFD23F', borderWidth: 1, borderColor: '#B7791F' },
  winText: { color: GOLD, fontSize: 30, fontWeight: '900', fontStyle: 'italic', textShadowColor: '#7A4A00', textShadowRadius: 6, textShadowOffset: { width: 0, height: 2 } },
  loseShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' },

  railText: { color: GOLD, fontWeight: '800' },
  railHint: { color: 'rgba(255,220,255,0.6)', marginTop: 1 },
  chipRail: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  chipBtn: { borderRadius: 30, padding: 2 },
  chipActive: { backgroundColor: GOLD, transform: [{ translateY: -6 }], elevation: 8, shadowColor: GOLD, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  dim: { opacity: 0.35 },
  actions: { flexDirection: 'row', gap: 6 },
  ctrlBtn: { borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(58,22,72,0.9)', borderWidth: 1.5, borderColor: '#7A3A8E' },
  ctrlLabel: { color: '#F2E6FF', fontWeight: '800', marginTop: 1 },

  bannerLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  bannerBar: { position: 'absolute', overflow: 'hidden' },
  bannerText: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    color: GOLD,
    fontSize: 48,
    fontWeight: '900',
    fontStyle: 'italic',
    textShadowColor: '#6A3000',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 4 },
  },

  vsOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,2,12,0.9)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  vsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', width: '100%' },
  vsSide: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  shardWrap: { position: 'absolute', top: '45%', left: '45%' },
  vsResult: { marginTop: 14, color: GOLD, fontSize: 32, fontWeight: '900', letterSpacing: 2, textShadowColor: '#7A3A00', textShadowRadius: 6, textShadowOffset: { width: 0, height: 2 } },

  // Above the dealt cards (they carry their own zIndex) and below them on
  // screen, so the win never hides the cards.
  winWrap: { position: 'absolute', top: '48%', alignSelf: 'center', alignItems: 'center', zIndex: 1000, elevation: 30 },
  winCard: { alignItems: 'center', paddingHorizontal: 34, paddingVertical: 12, borderRadius: 16, borderWidth: 2, borderColor: '#F5B942' },
  winTitle: { color: '#FFE08A', fontSize: 15, fontWeight: '900', letterSpacing: 3 },
  winAmount: { color: '#FFFFFF', fontSize: 26, fontWeight: '900', marginTop: 2 },
  winClose: { marginTop: 8, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1C0B02', borderWidth: 2, borderColor: '#F5B942' },
  toast: { position: 'absolute', alignSelf: 'center', top: '42%', zIndex: 1000, elevation: 30, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.85)', borderWidth: 1, borderColor: '#B7791F' },
  toastText: { color: '#FFE08A', fontSize: 14, fontWeight: '700' },
});
