import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient as SvgLinearGradient, Path, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { ApiClientError } from '../api/client';
import {
  JhandiMundaConfig,
  JhandiMundaHistoryEntry,
  JhandiMundaRoundView,
  JhandiSymbol,
  cancelJhandiMundaBets,
  fetchJhandiMundaConfig,
  fetchJhandiMundaCurrent,
  fetchJhandiMundaHistory,
  fetchJhandiMundaMyRound,
  placeJhandiMundaBets,
} from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const GOLD = '#FFD66B';
const SYMBOLS: JhandiSymbol[] = ['HEART', 'SPADE', 'DIAMOND', 'CLUB', 'FLAG', 'CROWN'];
const SYMBOL_NAME: Record<JhandiSymbol, { en: string; hi: string }> = {
  HEART: { en: 'Heart', hi: 'Paan' },
  SPADE: { en: 'Spade', hi: 'Hukum' },
  DIAMOND: { en: 'Diamond', hi: 'Eent' },
  CLUB: { en: 'Club', hi: 'Chidi' },
  FLAG: { en: 'Flag', hi: 'Jhandi' },
  CROWN: { en: 'Crown', hi: 'Munda' },
};
const FALLBACK_PAYTABLE: Record<string, number> = { 2: 3, 3: 4.5, 4: 6, 5: 10, 6: 20 };
const CHIP_VALUES = [10, 20, 50, 100, 200, 500];
const CHIP_COLORS: Record<number, string> = {
  10: '#1E9E4A',
  20: '#0FA3A3',
  50: '#2563EB',
  100: '#D4A017',
  200: '#E07A1F',
  500: '#C81E3A',
};

const TOAST_MS = 1600;
const WIN_CARD_MS = 3000;
/** After the reveal: the bowl lifts, the dice tumble out, then the board lights up. */
const LIFT_MS = 380;
const TUMBLE_MS = 1000;
const STAGGER_MS = 70;
const SETTLE_MS = LIFT_MS + TUMBLE_MS + STAGGER_MS * 5 + 150;

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

/** Stable pseudo-random 0..1 from a string + salt (dice resting spots). */
function hash01(s: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  const x = Math.sin(h) * 43758.5453;
  return x - Math.floor(x);
}

// ---------- art ----------

/** The six die symbols, drawn in a 100 x 100 box. */
export const SymbolIcon = memo(function SymbolIcon({ symbol, size }: { symbol: JhandiSymbol; size: number }) {
  const id = `jm${symbol}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <SvgLinearGradient id={`${id}r`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FF5468" />
          <Stop offset="1" stopColor="#B0102A" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${id}k`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#3A4257" />
          <Stop offset="1" stopColor="#0E121C" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFE58A" />
          <Stop offset="1" stopColor="#D08A00" />
        </SvgLinearGradient>
      </Defs>
      {symbol === 'HEART' && (
        <Path d="M50 90 C 22 68 6 50 6 31 C 6 16 17 6 31 6 C 40 6 47 12 50 21 C 53 12 60 6 69 6 C 83 6 94 16 94 31 C 94 50 78 68 50 90 Z" fill={`url(#${id}r)`} />
      )}
      {symbol === 'DIAMOND' && <Polygon points="50,4 88,50 50,96 12,50" fill={`url(#${id}r)`} />}
      {symbol === 'SPADE' && (
        <Path
          d="M50 6 C 78 30 94 44 94 60 C 94 73 84 81 72 81 C 63 81 56 77 53 70 C 54 80 58 88 66 95 L 34 95 C 42 88 46 80 47 70 C 44 77 37 81 28 81 C 16 81 6 73 6 60 C 6 44 22 30 50 6 Z"
          fill={`url(#${id}k)`}
        />
      )}
      {symbol === 'CLUB' && (
        <G fill={`url(#${id}k)`}>
          <Circle cx={50} cy={28} r={20} />
          <Circle cx={27} cy={58} r={20} />
          <Circle cx={73} cy={58} r={20} />
          <Path d="M50 44 C 52 70 57 84 66 95 L 34 95 C 43 84 48 70 50 44 Z" />
        </G>
      )}
      {symbol === 'FLAG' && (
        <G>
          <Rect x={14} y={6} width={7} height={90} rx={3} fill="#7A4A1E" />
          <Circle cx={17.5} cy={7} r={5} fill={`url(#${id}g)`} />
          <Path d="M21 12 Q 42 4 60 13 T 94 14 L 94 38 Q 76 30 60 37 T 21 38 Z" fill="#FF8A1F" />
          <Path d="M21 38 Q 42 30 60 37 T 94 38 L 94 60 Q 76 52 60 59 T 21 60 Z" fill="#1F9A48" />
        </G>
      )}
      {symbol === 'CROWN' && (
        <G>
          <Path d="M10 76 L 15 28 L 33 50 L 50 16 L 67 50 L 85 28 L 90 76 Z" fill={`url(#${id}g)`} stroke="#9A6400" strokeWidth={2} strokeLinejoin="round" />
          <Rect x={10} y={76} width={80} height={14} rx={3} fill={`url(#${id}g)`} stroke="#9A6400" strokeWidth={2} />
          <Circle cx={15} cy={26} r={5} fill="#E8334A" />
          <Circle cx={50} cy={14} r={6} fill="#2E86DE" />
          <Circle cx={85} cy={26} r={5} fill="#E8334A" />
          <Circle cx={30} cy={83} r={3.5} fill="#1F9A48" />
          <Circle cx={50} cy={83} r={3.5} fill="#E8334A" />
          <Circle cx={70} cy={83} r={3.5} fill="#1F9A48" />
        </G>
      )}
    </Svg>
  );
});

/** An ivory die showing one symbol on its top face. */
const Die = memo(function Die({ symbol, size }: { symbol: JhandiSymbol; size: number }) {
  return (
    <View style={[styles.die, { width: size, height: size, borderRadius: size * 0.2 }]}>
      <LinearGradient colors={['#FFFFFF', '#F1E6CC']} style={[StyleSheet.absoluteFill, { borderRadius: size * 0.2 }]} />
      {/* Wrapped so it stacks above the gradient on every platform. */}
      <View>
        <SymbolIcon symbol={symbol} size={size * 0.68} />
      </View>
    </View>
  );
});

/** The leather shaker bowl, upside down over the dice. */
const Bowl = memo(function Bowl({ w }: { w: number }) {
  const h = w * 0.62;
  return (
    <Svg width={w} height={h}>
      <Defs>
        <RadialGradient id="jmBowl" cx="38%" cy="25%" r="85%">
          <Stop offset="0" stopColor="#B06A35" />
          <Stop offset="0.55" stopColor="#6E3514" />
          <Stop offset="1" stopColor="#3B1606" />
        </RadialGradient>
        <SvgLinearGradient id="jmBand" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#8A5A00" />
          <Stop offset="0.5" stopColor="#FFE08A" />
          <Stop offset="1" stopColor="#8A5A00" />
        </SvgLinearGradient>
      </Defs>
      <Path d={`M ${w * 0.04} ${h * 0.86} Q ${w * 0.06} ${h * 0.02} ${w * 0.5} ${h * 0.02} Q ${w * 0.94} ${h * 0.02} ${w * 0.96} ${h * 0.86} Z`} fill="url(#jmBowl)" />
      <Path d={`M ${w * 0.1} ${h * 0.42} Q ${w * 0.5} ${h * 0.3} ${w * 0.9} ${h * 0.42}`} stroke="url(#jmBand)" strokeWidth={h * 0.05} fill="none" />
      <Ellipse cx={w * 0.5} cy={h * 0.86} rx={w * 0.47} ry={h * 0.1} fill="#2A0E03" />
      <Ellipse cx={w * 0.5} cy={h * 0.84} rx={w * 0.47} ry={h * 0.08} fill="none" stroke="url(#jmBand)" strokeWidth={h * 0.035} />
      <Ellipse cx={w * 0.34} cy={h * 0.2} rx={w * 0.12} ry={h * 0.06} fill="#FFFFFF" opacity={0.18} />
    </Svg>
  );
});

function Chip({ value, size }: { value: number; size: number }) {
  const color = CHIP_COLORS[value] ?? CHIP_COLORS[[...CHIP_VALUES].reverse().find((c) => c <= value) ?? 10];
  return (
    <View style={[styles.chip, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
      <View style={[styles.chipInner, { width: size * 0.7, height: size * 0.7, borderRadius: size * 0.35 }]}>
        <Text style={[styles.chipText, { fontSize: size * (value >= 100 ? 0.26 : 0.3) }]}>{shortAmount(value)}</Text>
      </View>
    </View>
  );
}

// ---------- dice tray ----------

type TrayPhase = 'BETTING' | 'ROLLING' | 'RESULT';

/**
 * Bowl over the dice while betting, shaking while the dice roll, then lifted
 * away as the six dice tumble out to their resting spots. `lateMs` is how far
 * past the reveal we already are (catching up mid-round skips the tumble).
 */
function DiceTray({
  w,
  h,
  phase,
  dice,
  period,
  lateMs,
  winners,
  lit,
}: {
  w: number;
  h: number;
  phase: TrayPhase;
  dice: JhandiSymbol[] | null;
  period: string;
  lateMs: number;
  winners: Set<JhandiSymbol>;
  lit: boolean;
}) {
  const dieSize = Math.min(w * 0.17, h * 0.3);
  const bowlW = Math.min(w * 0.62, h * 1.25);
  const bowlH = bowlW * 0.62;
  const lift = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const tumbles = useRef(Array.from({ length: 6 }, () => new Animated.Value(0))).current;
  const glow = useRef(new Animated.Value(0.4)).current;

  // Resting spots: two loose rows of three, nudged and turned per round.
  const spots = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        return {
          x: w / 2 + (col - 1) * dieSize * 1.45 + (hash01(period, i) - 0.5) * dieSize * 0.35,
          y: h * 0.52 + (row - 0.5) * dieSize * 1.3 + (hash01(period, i + 10) - 0.5) * dieSize * 0.25,
          rot: (hash01(period, i + 20) - 0.5) * 40,
          spin: 360 + Math.floor(hash01(period, i + 30) * 3) * 180,
        };
      }),
    [w, h, dieSize, period]
  );

  useEffect(() => {
    if (phase !== 'ROLLING') return;
    lift.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shake, { toValue: 1, duration: 70, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -1, duration: 140, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0, duration: 70, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
      shake.setValue(0);
    };
  }, [phase, lift, shake]);

  useEffect(() => {
    if (phase === 'BETTING') {
      Animated.timing(lift, { toValue: 0, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      tumbles.forEach((t) => t.setValue(0));
      return;
    }
    if (phase !== 'RESULT') return;
    if (lateMs > SETTLE_MS) {
      lift.setValue(1);
      tumbles.forEach((t) => t.setValue(1));
      return;
    }
    Animated.timing(lift, { toValue: 1, duration: LIFT_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }).start();
    Animated.stagger(
      STAGGER_MS,
      tumbles.map((t) => Animated.timing(t, { toValue: 1, duration: TUMBLE_MS, easing: Easing.bounce, useNativeDriver: true }))
    ).start();
    // Once per reveal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, period]);

  useEffect(() => {
    if (!lit) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.35, duration: 420, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [lit, glow]);

  const showDice = phase === 'RESULT' && !!dice;
  const bowlTop = h * 0.5 - bowlH * 0.55;

  return (
    <View style={{ width: w, height: h }}>
      {showDice &&
        dice!.map((sym, i) => {
          const s = spots[i];
          const t = tumbles[i];
          const on = lit && winners.has(sym);
          return (
            <Animated.View
              key={i}
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: s.x - dieSize / 2,
                top: s.y - dieSize / 2,
                opacity: lit && !on ? 0.5 : 1,
                transform: [
                  { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [w / 2 - s.x, 0] }) },
                  { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [h * 0.5 - s.y - dieSize * 0.2, 0] }) },
                  { rotate: t.interpolate({ inputRange: [0, 1], outputRange: [`${s.rot - s.spin}deg`, `${s.rot}deg`] }) },
                  { scale: t.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.55, 1.12, 1] }) },
                ],
              }}
            >
              <View style={[styles.dieShadow, { width: dieSize, height: dieSize, borderRadius: dieSize * 0.2 }]} />
              <Die symbol={sym} size={dieSize} />
              {on && <Animated.View style={[styles.dieGlow, { borderRadius: dieSize * 0.24, opacity: glow }]} />}
            </Animated.View>
          );
        })}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: (w - bowlW) / 2,
          top: bowlTop,
          opacity: lift.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 0.6, 0] }),
          transform: [
            { translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -h * 0.7] }) },
            { translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-bowlW * 0.035, bowlW * 0.035] }) },
            { rotate: shake.interpolate({ inputRange: [-1, 1], outputRange: ['-7deg', '7deg'] }) },
          ],
        }}
      >
        <Bowl w={bowlW} />
      </Animated.View>
    </View>
  );
}

// ---------- bet box ----------

type BoxState = 'normal' | 'win' | 'lose';

const SymbolBox = memo(function SymbolBox({
  symbol,
  w,
  total,
  state,
  count,
  multiplier,
  onPress,
  glow,
}: {
  symbol: JhandiSymbol;
  w: number;
  total: number;
  state: BoxState;
  count: number | null;
  multiplier: number;
  onPress: (s: JhandiSymbol) => void;
  glow: Animated.Value;
}) {
  const pop = useRef(new Animated.Value(1)).current;
  const press = () => {
    pop.setValue(0.92);
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
    onPress(symbol);
  };
  const h = w * 1.02;
  const medal = w * 0.5;
  return (
    <Animated.View style={{ transform: [{ scale: pop }], opacity: state === 'lose' ? 0.45 : 1 }}>
      <Pressable onPress={press} style={[styles.box, { width: w, height: h }]}>
        <LinearGradient colors={['#3B1030', '#1A0716']} style={[StyleSheet.absoluteFill, { borderRadius: 14 }]} />
        <View style={[styles.medal, { width: medal, height: medal, borderRadius: medal / 2 }]}>
          <SymbolIcon symbol={symbol} size={medal * 0.66} />
        </View>
        <Text style={styles.boxName} numberOfLines={1}>
          {SYMBOL_NAME[symbol].en.toUpperCase()}
        </Text>
        <Text style={styles.boxHindi} numberOfLines={1}>
          {SYMBOL_NAME[symbol].hi}
        </Text>
        {total > 0 && (
          <View style={styles.stakeTag}>
            <Chip value={CHIP_VALUES.slice().reverse().find((c) => c <= total) ?? 10} size={18} />
            <Text style={styles.stakeText}>₹{shortAmount(total)}</Text>
          </View>
        )}
        {count !== null && count > 0 && (
          <View style={[styles.countBadge, state === 'win' && styles.countBadgeWin]}>
            <Text style={[styles.countText, state === 'win' && { color: '#1A1200' }]}>×{count}</Text>
          </View>
        )}
        {state === 'win' && (
          <>
            <Animated.View pointerEvents="none" style={[styles.boxGlow, { opacity: glow }]} />
            <View pointerEvents="none" style={styles.payTag}>
              <Text style={styles.payTagText}>{multiplier}x</Text>
            </View>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
});

// ---------- screen ----------

type PlacedChip = { key: number; area: JhandiSymbol; amount: number; id?: string };

export default function JhandiMundaScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<JhandiMundaConfig | null>(null);
  const [view, setView] = useState<JhandiMundaRoundView | null>(null);
  const [history, setHistory] = useState<JhandiMundaHistoryEntry[]>([]);
  const [chips, setChips] = useState<PlacedChip[]>([]);
  const [chip, setChip] = useState(10);
  const [win, setWin] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const offsetRef = useRef(0);
  const periodRef = useRef<string | null>(null);
  const resultHandledRef = useRef<string | null>(null);
  const chipsRef = useRef<PlacedChip[]>([]);
  chipsRef.current = chips;
  const lastRoundRef = useRef<{ area: JhandiSymbol; amount: number }[]>([]);
  const idMapRef = useRef(new Map<number, string>());
  const keyRef = useRef(1);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const winTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const glow = useRef(new Animated.Value(0.4)).current;
  const winPop = useRef(new Animated.Value(0)).current;

  const paytable = config?.paytable ?? FALLBACK_PAYTABLE;
  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const enqueue = useCallback((op: () => Promise<void>) => {
    queueRef.current = queueRef.current.then(op).catch(() => {});
  }, []);

  const syncMyRound = useCallback(() => {
    fetchJhandiMundaMyRound()
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
    fetchJhandiMundaConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => {});
    fetchJhandiMundaHistory(40)
      .then((h) => mountedRef.current && setHistory(h))
      .catch(() => {});
    return () => {
      mountedRef.current = false;
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (winTimer.current) clearTimeout(winTimer.current);
    };
  }, []);

  // Round polling: chained, and quicker around betting close / reveal / next round.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;
    let first = true;
    const loop = async () => {
      let delay = 800;
      try {
        const sentAt = Date.now();
        const v = await fetchJhandiMundaCurrent();
        const receivedAt = Date.now();
        if (!alive) return;
        const measured = new Date(v.serverTime).getTime() - (sentAt + receivedAt) / 2;
        offsetRef.current = first ? measured : offsetRef.current * 0.7 + measured * 0.3;
        setView(v);
        const now = Date.now() + offsetRef.current;
        const nextEdge = Math.min(...[v.betEndTime, v.resultTime, v.endTime].map((t) => new Date(t).getTime()).filter((t) => t > now));
        if (Number.isFinite(nextEdge) && nextEdge - now < 1200) delay = 250;
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
      setWin(null);
    }
    periodRef.current = view.periodNumber;
  }, [view]);

  // Smooth countdown and on-time phase changes.
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 200);
    return () => clearInterval(id);
  }, []);

  const srvNow = Date.now() + offsetRef.current;
  const betEndMs = view ? new Date(view.betEndTime).getTime() : 0;
  const resultMs = view ? new Date(view.resultTime).getTime() : 0;
  const bettingOpen = !!view && srvNow < betEndMs;
  const phase: TrayPhase = !view ? 'BETTING' : bettingOpen ? 'BETTING' : view.phase === 'RESULT' && view.dice ? 'RESULT' : 'ROLLING';
  const revealed = phase === 'RESULT' ? view : null;
  const lateMs = revealed ? srvNow - resultMs : 0;
  const lit = !!revealed && lateMs >= SETTLE_MS;
  const counts = lit ? revealed!.counts : null;
  const winners = useMemo(() => {
    const s = new Set<JhandiSymbol>();
    if (counts) for (const sym of SYMBOLS) if ((paytable[counts[sym]] ?? 0) > 0) s.add(sym);
    return s;
  }, [counts, paytable]);

  useEffect(() => {
    if (!lit) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 0.95, duration: 450, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.3, duration: 450, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [lit, glow]);

  // Reveal: history, then this player's winnings once the dice settle.
  useEffect(() => {
    if (!view || view.phase !== 'RESULT' || !view.dice || !view.counts || resultHandledRef.current === view.periodNumber) return;
    const period = view.periodNumber;
    resultHandledRef.current = period;
    const entry: JhandiMundaHistoryEntry = { periodNumber: period, dice: view.dice, counts: view.counts, serverSeed: view.serverSeed ?? '', serverSeedHash: view.serverSeedHash };
    const settleAt = new Date(view.resultTime).getTime() + SETTLE_MS;
    const wait = (at: number) => Math.max(0, at - (Date.now() + offsetRef.current));
    setTimeout(() => mountedRef.current && setHistory((h) => (h[0]?.periodNumber === period ? h : [entry, ...h].slice(0, 40))), wait(settleAt));
    if (chipsRef.current.length > 0) {
      enqueue(async () => {
        try {
          const res = await fetchJhandiMundaMyRound(period);
          const won = round2(res.bets.reduce((sum, b) => sum + Number(b.payout), 0));
          if (won > 0) {
            if (winTimer.current) clearTimeout(winTimer.current);
            winTimer.current = setTimeout(() => {
              if (!mountedRef.current) return;
              setWin(won);
              winPop.setValue(0);
              Animated.spring(winPop, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }).start();
            }, wait(settleAt + 400));
          }
        } catch {
          // Winnings still land in the wallet; only the popup is skipped.
        }
        refreshWallet();
      });
    }
  }, [view, enqueue, refreshWallet, winPop]);

  useEffect(() => {
    if (win === null) return;
    const id = setTimeout(() => setWin(null), WIN_CARD_MS);
    return () => clearTimeout(id);
  }, [win]);

  const areaTotals = useMemo(() => {
    const m: Partial<Record<JhandiSymbol, number>> = {};
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
  const chipRef = useRef(chip);
  chipRef.current = chip;

  const placeChips = useCallback(
    (entries: { area: JhandiSymbol; amount: number }[]) => {
      if (entries.length === 0) return;
      if (!bettingOpenRef.current) return showToast('Betting closed — wait for the next round');
      const cost = round2(entries.reduce((s, e) => s + e.amount, 0));
      if (cost > displayBalanceRef.current) return showToast('Insufficient balance');
      const totals = { ...areaTotalsRef.current };
      for (const e of entries) {
        totals[e.area] = round2((totals[e.area] ?? 0) + e.amount);
        if ((totals[e.area] ?? 0) > maxStakeRef.current) return showToast(`Max bet per symbol is ₹${maxStakeRef.current}`);
      }
      const added: PlacedChip[] = entries.map((e) => ({ key: keyRef.current++, area: e.area, amount: e.amount }));
      const keys = new Set(added.map((c) => c.key));
      setChips((prev) => [...prev, ...added]);
      enqueue(async () => {
        try {
          const res = await placeJhandiMundaBets(entries);
          res.bets.forEach((b, i) => idMapRef.current.set(added[i].key, b.id));
          if (mountedRef.current) setChips((prev) => prev.map((c) => (keys.has(c.key) ? { ...c, id: idMapRef.current.get(c.key) } : c)));
          refreshWallet();
        } catch (err) {
          if (mountedRef.current) {
            setChips((prev) => prev.filter((c) => !keys.has(c.key)));
            showToast(errorMessage(err));
          }
        }
      });
    },
    [enqueue, refreshWallet, showToast]
  );

  const onSymbolPress = useCallback((area: JhandiSymbol) => placeChips([{ area, amount: chipRef.current }]), [placeChips]);

  const undo = () => {
    const last = chips[chips.length - 1];
    if (!last) return;
    if (!bettingOpen) return showToast('Betting closed');
    setChips((prev) => prev.slice(0, -1));
    enqueue(async () => {
      const id = idMapRef.current.get(last.key);
      if (!id) return;
      try {
        await cancelJhandiMundaBets([id]);
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
        await cancelJhandiMundaBets();
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
    const m = new Map<JhandiSymbol, number>();
    for (const c of lastRoundRef.current) m.set(c.area, round2((m.get(c.area) ?? 0) + c.amount));
    placeChips([...m.entries()].map(([area, amount]) => ({ area, amount })));
  };

  const boxState = (sym: JhandiSymbol): BoxState => (!counts ? 'normal' : winners.has(sym) ? 'win' : 'lose');

  // ---- layout ----
  const pad = 12;
  const trayW = W - pad * 2;
  const trayH = Math.min(trayW * 0.62, 280);
  const boxW = (W - pad * 2 - 16) / 3;
  const chipSize = Math.min(44, (W - pad * 2 - 5 * 8) / 6);
  const secsLeft = Math.max(0, Math.ceil((betEndMs - srvNow) / 1000));
  const betTotalMs = view ? Math.max(1, betEndMs - new Date(view.startTime).getTime()) : 1;
  const betFrac = bettingOpen ? Math.max(0, Math.min(1, (betEndMs - srvNow) / betTotalMs)) : 0;
  const status =
    phase === 'BETTING'
      ? `PLACE YOUR BETS · ${secsLeft}s`
      : phase === 'ROLLING'
        ? 'SHAKING THE DICE…'
        : lit
          ? winners.size > 0
            ? `WINNERS: ${[...winners].map((s) => SYMBOL_NAME[s].en.toUpperCase()).join(', ')}`
            : 'NO SYMBOL CAME TWICE'
          : 'ROLLING…';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#2A0A22', '#12040F']} style={StyleSheet.absoluteFill} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color="#FFFFFF" />
          <Text style={styles.title}>
            JHANDI <Text style={{ color: GOLD }}>MUNDA</Text>
          </Text>
        </Pressable>
        <View style={styles.topRight}>
          <View style={styles.balancePill}>
            <MaterialCommunityIcons name="wallet" size={15} color={GOLD} />
            <Text style={styles.balanceText}>₹{displayBalance.toFixed(2)}</Text>
          </View>
          <Pressable onPress={() => navigation.navigate('Deposit')} style={styles.depositBtn}>
            <MaterialCommunityIcons name="plus" size={18} color="#1A1200" />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
        {/* Recent rounds: the symbol that came most, and how many times */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.histRow}>
          {history.length === 0 && <Text style={styles.histEmpty}>Results will show here</Text>}
          {history.map((h) => {
            const best = SYMBOLS.reduce((a, b) => (h.counts[b] > h.counts[a] ? b : a));
            const n = h.counts[best];
            return (
              <View key={h.periodNumber} style={[styles.histChip, n >= 3 && styles.histChipHot]}>
                <SymbolIcon symbol={best} size={16} />
                <Text style={styles.histText}>×{n}</Text>
              </View>
            );
          })}
        </ScrollView>

        {/* The table with the bowl and dice; the win card hangs off its bottom edge */}
        <View style={styles.tableWrap}>
        <View style={[styles.table, { marginHorizontal: pad, height: trayH }]}>
          <LinearGradient colors={['#8E1537', '#5A0A22', '#3A0616']} style={[StyleSheet.absoluteFill, { borderRadius: 18 }]} />
          <View pointerEvents="none" style={styles.tableInnerRim} />
          <DiceTray
            w={trayW}
            h={trayH}
            phase={phase}
            dice={revealed?.dice ?? null}
            period={view?.periodNumber ?? '-'}
            lateMs={lateMs}
            winners={winners}
            lit={lit}
          />
          <View pointerEvents="none" style={styles.statusWrap}>
            <View style={[styles.statusPill, phase === 'BETTING' && secsLeft <= 3 && styles.statusUrgent]}>
              <Text style={styles.statusText} numberOfLines={1}>
                {status}
              </Text>
            </View>
          </View>
          {phase === 'BETTING' && (
            <View pointerEvents="none" style={styles.timerTrack}>
              <View style={[styles.timerFill, { width: `${betFrac * 100}%` }, secsLeft <= 3 && { backgroundColor: '#FF4B3E' }]} />
            </View>
          )}
          <Text style={styles.periodText}>#{view?.periodNumber.slice(-5) ?? '-----'}</Text>
        </View>
          {win !== null && (
            <View pointerEvents="none" style={styles.winWrap}>
              <Animated.View style={[styles.winCard, { transform: [{ scale: winPop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }]}>
                <LinearGradient colors={['#FFE58A', '#D08A00']} style={[StyleSheet.absoluteFill, { borderRadius: 18 }]} />
                <MaterialCommunityIcons name="crown" size={30} color="#5A2E00" />
                <View>
                  <Text style={styles.winTitle}>YOU WIN</Text>
                  <Text style={styles.winAmount}>₹{win.toFixed(2)}</Text>
                </View>
              </Animated.View>
            </View>
          )}
        </View>

        {/* Pay table */}
        <View style={styles.payRow}>
          <Text style={styles.payLabel}>Same symbol on</Text>
          {Object.entries(paytable)
            .sort((a, b) => Number(a[0]) - Number(b[0]))
            .map(([k, m]) => (
              <View key={k} style={[styles.payCell, counts && [...winners].some((s) => counts[s] === Number(k)) && styles.payCellOn]}>
                <Text style={styles.payK}>{k} dice</Text>
                <Text style={styles.payM}>{m}x</Text>
              </View>
            ))}
        </View>

        {/* Symbol boxes */}
        <View style={[styles.board, { paddingHorizontal: pad }]}>
          {SYMBOLS.map((sym) => (
            <SymbolBox
              key={sym}
              symbol={sym}
              w={boxW}
              total={areaTotals[sym] ?? 0}
              state={boxState(sym)}
              count={counts ? counts[sym] : null}
              multiplier={counts ? paytable[counts[sym]] ?? 0 : 0}
              onPress={onSymbolPress}
              glow={glow}
            />
          ))}
        </View>

        {/* Chips */}
        <View style={styles.chipRail}>
          {CHIP_VALUES.map((v) => {
            const allowed = v >= minStake && v <= maxStake;
            return (
              <Pressable key={v} disabled={!allowed} onPress={() => setChip(v)} style={[styles.chipBtn, chip === v && styles.chipBtnOn, !allowed && { opacity: 0.35 }]}>
                <Chip value={v} size={chipSize} />
              </Pressable>
            );
          })}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          {(
            [
              { label: 'UNDO', icon: 'undo-variant', color: '#F2E6FF', onPress: undo },
              { label: 'REPEAT', icon: 'repeat', color: '#F2E6FF', onPress: repeat },
              { label: 'CLEAR', icon: 'close-thick', color: '#FF6B6B', onPress: clearAll },
            ] as const
          ).map((a) => (
            <Pressable key={a.label} onPress={a.onPress} style={({ pressed }) => [styles.actBtn, pressed && { opacity: 0.7 }]}>
              <MaterialCommunityIcons name={a.icon} size={18} color={a.color} />
              <Text style={styles.actText}>{a.label}</Text>
            </Pressable>
          ))}
          <View style={styles.myBet}>
            <Text style={styles.myBetLabel}>YOUR BET</Text>
            <Text style={styles.myBetValue}>₹{myTotal.toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.rules}>
          <Text style={styles.rulesTitle}>HOW TO PLAY</Text>
          <Text style={styles.rulesText}>
            Put chips on one or more symbols. Six dice are shaken and thrown. A symbol wins when it shows on 2 or more dice — the more dice, the bigger the win. 0 or 1 die
            loses.
          </Text>
          <Text style={styles.rulesText}>
            Bet ₹{minStake}–₹{maxStake} per symbol · max win ₹{config?.maxPayout ?? 10000} per bet · Provably fair: every throw comes from a server seed published after the round.
          </Text>
        </View>
      </ScrollView>

      {toast && (
        <View pointerEvents="none" style={[styles.toast, { bottom: insets.bottom + 30 }]}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#12040F' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, height: 52 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  title: { color: '#FFFFFF', fontSize: 19, fontWeight: '900', fontStyle: 'italic', letterSpacing: 1 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  balancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,214,107,0.35)',
  },
  balanceText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  depositBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' },
  histRow: { paddingHorizontal: 12, paddingVertical: 8, gap: 6, alignItems: 'center' },
  histEmpty: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
  histChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: '#FFF6E2',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  histChipHot: { borderColor: GOLD, backgroundColor: '#FFE9A8' },
  histText: { color: '#3A0616', fontWeight: '900', fontSize: 12 },
  table: { borderRadius: 18, overflow: 'hidden', borderWidth: 3, borderColor: '#C9972E' },
  tableInnerRim: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, margin: 6, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,214,107,0.35)', borderStyle: 'dashed' },
  statusWrap: { position: 'absolute', top: 10, left: 0, right: 0, alignItems: 'center' },
  statusPill: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.5)', maxWidth: '90%' },
  statusUrgent: { borderColor: '#FF4B3E' },
  statusText: { color: GOLD, fontWeight: '900', fontSize: 12, letterSpacing: 1 },
  timerTrack: { position: 'absolute', left: 16, right: 16, bottom: 12, height: 5, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.4)', overflow: 'hidden' },
  timerFill: { height: 5, borderRadius: 3, backgroundColor: GOLD },
  periodText: { position: 'absolute', top: 12, right: 14, color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: '700' },
  die: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#C9B68A', overflow: 'hidden' },
  dieShadow: { position: 'absolute', left: 3, top: 5, backgroundColor: 'rgba(0,0,0,0.35)' },
  dieGlow: { position: 'absolute', left: -4, top: -4, right: -4, bottom: -4, borderWidth: 3, borderColor: GOLD },
  payRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 10, paddingHorizontal: 12, flexWrap: 'wrap' },
  payLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '700', marginRight: 2 },
  payCell: { alignItems: 'center', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'transparent' },
  payCellOn: { borderColor: GOLD, backgroundColor: 'rgba(255,214,107,0.18)' },
  payK: { color: 'rgba(255,255,255,0.7)', fontSize: 9, fontWeight: '700' },
  payM: { color: GOLD, fontSize: 13, fontWeight: '900' },
  board: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  box: { borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,214,107,0.45)', overflow: 'visible' },
  medal: { backgroundColor: '#FFF6E2', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#C9972E', marginBottom: 4 },
  boxName: { color: '#FFFFFF', fontWeight: '900', fontSize: 12, letterSpacing: 1 },
  boxHindi: { color: 'rgba(255,214,107,0.8)', fontWeight: '700', fontSize: 10 },
  stakeTag: {
    position: 'absolute',
    bottom: 5,
    left: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingRight: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  stakeText: { color: '#FFFFFF', fontWeight: '800', fontSize: 11 },
  countBadge: { position: 'absolute', top: 5, right: 5, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.15)' },
  countBadgeWin: { backgroundColor: GOLD },
  countText: { color: '#FFFFFF', fontWeight: '900', fontSize: 12 },
  boxGlow: { position: 'absolute', left: -3, top: -3, right: -3, bottom: -3, borderRadius: 16, borderWidth: 3, borderColor: GOLD },
  payTag: { position: 'absolute', bottom: 5, right: 5, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, backgroundColor: '#1F9A48' },
  payTagText: { color: '#FFFFFF', fontWeight: '900', fontSize: 11 },
  chip: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)', borderStyle: 'dashed' },
  chipInner: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
  chipText: { color: '#FFFFFF', fontWeight: '900' },
  chipRail: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 14 },
  chipBtn: { padding: 2, borderRadius: 30, borderWidth: 2, borderColor: 'transparent' },
  chipBtnOn: { borderColor: GOLD, transform: [{ translateY: -3 }] },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingHorizontal: 12 },
  actBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 62,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  actText: { color: '#F2E6FF', fontSize: 9, fontWeight: '800', marginTop: 1 },
  myBet: { flex: 1, alignItems: 'flex-end' },
  myBetLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  myBetValue: { color: GOLD, fontSize: 18, fontWeight: '900' },
  rules: { marginTop: 16, marginHorizontal: 12, padding: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)' },
  rulesTitle: { color: GOLD, fontWeight: '900', fontSize: 12, letterSpacing: 2, marginBottom: 4 },
  rulesText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, lineHeight: 17, marginTop: 2 },
  tableWrap: { zIndex: 10, elevation: 10 },
  winWrap: { position: 'absolute', left: 0, right: 0, bottom: -34, alignItems: 'center', zIndex: 1000, elevation: 30 },
  winCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 22, paddingVertical: 10, borderRadius: 18, borderWidth: 3, borderColor: '#FFF3C4', overflow: 'hidden' },
  winTitle: { color: '#5A2E00', fontWeight: '900', fontSize: 13, letterSpacing: 3 },
  winAmount: { color: '#3A1A00', fontWeight: '900', fontSize: 26 },
  toast: { position: 'absolute', left: 30, right: 30, alignItems: 'center', zIndex: 1001, elevation: 31 },
  toastText: { color: '#FFFFFF', backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, overflow: 'hidden', fontWeight: '700' },
});
