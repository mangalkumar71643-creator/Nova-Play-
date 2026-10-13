import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Line, LinearGradient as SvgLinearGradient, Path, Polygon, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../api/client';
import { ScratchConfig, ScratchTicketRow, buyScratchTicket, fetchScratchConfig, fetchScratchHistory } from '../api/backend';
import { useGameState } from '../state/GameStateContext';
import GameInfoButton from '../components/GameInfoButton';

const GOLD = '#FFD66B';
const DEEP_GOLD = '#B8860B';
const GREEN = '#3DFF8A';
const TEXT = '#FFF4E4';
const INK = '#2A0410';
const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const DEFAULT_BET = 10;
const TOAST_MS = 1800;
/** No paid ticket resolves faster than this, press to result. */
const MIN_TICKET_MS = 2500;
/** Each panel's foil is a CHUNKS x CHUNKS grid of flakes that the finger rubs off. */
const CHUNKS = 7;
const FULL = '1'.repeat(CHUNKS * CHUNKS);
/** A panel uncovers itself once this share of its foil is gone. */
const CLEAR_SHARE = 0.55;
const GAP = 8;

/** Used until the config arrives; the server's table replaces it. */
const FALLBACK_SYMBOLS = [
  { key: 'COIN', multiplier: 1, chance: 0.2 },
  { key: 'CHERRY', multiplier: 2, chance: 0.12 },
  { key: 'BELL', multiplier: 5, chance: 0.03 },
  { key: 'CLOVER', multiplier: 10, chance: 0.01 },
  { key: 'HORSESHOE', multiplier: 20, chance: 0.0035 },
  { key: 'DIAMOND', multiplier: 50, chance: 0.0012 },
  { key: 'SEVEN', multiplier: 100, chance: 0.0004 },
  { key: 'CROWN', multiplier: 1000, chance: 0.00002 },
];

const SYMBOL_NAME: Record<string, string> = {
  COIN: 'Gold Coin',
  CHERRY: 'Cherries',
  BELL: 'Bell',
  CLOVER: 'Clover',
  HORSESHOE: 'Horseshoe',
  DIAMOND: 'Diamond',
  SEVEN: 'Lucky 7',
  CROWN: 'Crown',
};

function fmtX(m: number): string {
  return m <= 0 ? '0' : `${m}x`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function floor2(n: number): number {
  return Math.floor(Number((n * 100).toPrecision(12))) / 100;
}

function money(n: number): string {
  return `₹${n.toFixed(2)}`;
}

function shortMoney(n: number): string {
  return Number.isInteger(n) ? `₹${n.toLocaleString('en-IN')}` : `₹${n.toFixed(2)}`;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const run = (a: Animated.CompositeAnimation) => new Promise<void>((r) => a.start(() => r()));

// ---------- art ----------

/** One prize symbol, drawn in a 100x100 box. */
const SymbolArt = memo(function SymbolArt({ k, size }: { k: string; size: number }) {
  const u = `sy${useId().replace(/:/g, '')}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={`${u}gold`} cx="0.38" cy="0.32" r="0.75">
          <Stop offset="0" stopColor="#FFFBE0" />
          <Stop offset="0.45" stopColor="#FFD24A" />
          <Stop offset="1" stopColor="#B07200" />
        </RadialGradient>
        <RadialGradient id={`${u}red`} cx="0.35" cy="0.3" r="0.75">
          <Stop offset="0" stopColor="#FF8A8A" />
          <Stop offset="0.5" stopColor="#E0102A" />
          <Stop offset="1" stopColor="#6A0010" />
        </RadialGradient>
        <RadialGradient id={`${u}green`} cx="0.35" cy="0.3" r="0.8">
          <Stop offset="0" stopColor="#B8FFB0" />
          <Stop offset="0.5" stopColor="#2AB040" />
          <Stop offset="1" stopColor="#0A5A1A" />
        </RadialGradient>
        <SvgLinearGradient id={`${u}blue`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#E0FAFF" />
          <Stop offset="0.4" stopColor="#5AD0FF" />
          <Stop offset="1" stopColor="#1040B0" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${u}silver`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.5" stopColor="#B8C0D0" />
          <Stop offset="1" stopColor="#5A6478" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${u}seven`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FF6A6A" />
          <Stop offset="0.55" stopColor="#E0001E" />
          <Stop offset="1" stopColor="#7A0010" />
        </SvgLinearGradient>
      </Defs>
      {k === 'COIN' && (
        <G>
          <Circle cx={50} cy={52} r={40} fill="#8A5A00" />
          <Circle cx={50} cy={49} r={40} fill={`url(#${u}gold)`} stroke="#8A5A00" strokeWidth={2.5} />
          <Circle cx={50} cy={49} r={31} fill="none" stroke="#B07A00" strokeWidth={2} strokeDasharray="3 3" />
          <Polygon points="50,25 56.5,41 74,42 60.5,53 65,70 50,60.5 35,70 39.5,53 26,42 43.5,41" fill="#C88A00" stroke="#8A5A00" strokeWidth={1.5} />
          <Ellipse cx={38} cy={30} rx={10} ry={5} fill="#FFFFFF" opacity={0.55} transform="rotate(-30 38 30)" />
        </G>
      )}
      {k === 'CHERRY' && (
        <G>
          <Path d="M36,62 Q40,34 64,16 M64,16 Q62,40 68,62" stroke="#2A7A1A" strokeWidth={4.5} fill="none" strokeLinecap="round" />
          <Path d="M64,16 Q80,8 88,22 Q74,28 64,16 Z" fill={`url(#${u}green)`} stroke="#0A5A1A" strokeWidth={1.5} />
          <Circle cx={34} cy={68} r={19} fill={`url(#${u}red)`} stroke="#5A0010" strokeWidth={1.5} />
          <Circle cx={68} cy={70} r={19} fill={`url(#${u}red)`} stroke="#5A0010" strokeWidth={1.5} />
          <Ellipse cx={27} cy={61} rx={6} ry={4} fill="#FFFFFF" opacity={0.7} />
          <Ellipse cx={61} cy={63} rx={6} ry={4} fill="#FFFFFF" opacity={0.7} />
        </G>
      )}
      {k === 'BELL' && (
        <G>
          <Circle cx={50} cy={13} r={6} fill={`url(#${u}gold)`} stroke="#8A5A00" strokeWidth={1.5} />
          <Circle cx={50} cy={82} r={9} fill={`url(#${u}gold)`} stroke="#8A5A00" strokeWidth={1.5} />
          <Path d="M50,17 C30,17 27,36 27,52 C27,64 21,70 15,75 L85,75 C79,70 73,64 73,52 C73,36 70,17 50,17 Z" fill={`url(#${u}gold)`} stroke="#8A5A00" strokeWidth={2} />
          <Path d="M20,70 L80,70" stroke="#B07200" strokeWidth={3} />
          <Path d="M38,28 C34,36 33,46 33,56" stroke="#FFFFFF" strokeWidth={4} strokeLinecap="round" opacity={0.6} fill="none" />
        </G>
      )}
      {k === 'CLOVER' && (
        <G>
          <Path d="M50,52 Q56,74 46,92" stroke="#1A6A1A" strokeWidth={5} fill="none" strokeLinecap="round" />
          {[0, 90, 180, 270].map((deg) => (
            <G key={deg} transform={`rotate(${deg} 50 48)`}>
              <Path d="M50,48 C40,40 30,34 34,24 C38,16 48,18 50,26 C52,18 62,16 66,24 C70,34 60,40 50,48 Z" fill={`url(#${u}green)`} stroke="#0A4A12" strokeWidth={1.5} />
            </G>
          ))}
          <Circle cx={50} cy={48} r={4} fill="#9AF07A" />
        </G>
      )}
      {k === 'HORSESHOE' && (
        <G>
          <Path d="M27,18 L27,52 A23,23 0 0 0 73,52 L73,18" stroke="#3A4250" strokeWidth={17} fill="none" />
          <Path d="M27,18 L27,52 A23,23 0 0 0 73,52 L73,18" stroke={`url(#${u}silver)`} strokeWidth={13} fill="none" />
          {[
            [27, 26],
            [27, 42],
            [31, 62],
            [73, 26],
            [73, 42],
            [69, 62],
            [50, 75],
          ].map(([x, y], i) => (
            <Circle key={i} cx={x} cy={y} r={2.2} fill="#2A3040" />
          ))}
          <Rect x={18} y={12} width={18} height={7} rx={2} fill={`url(#${u}gold)`} stroke="#8A5A00" strokeWidth={1} />
          <Rect x={64} y={12} width={18} height={7} rx={2} fill={`url(#${u}gold)`} stroke="#8A5A00" strokeWidth={1} />
        </G>
      )}
      {k === 'DIAMOND' && (
        <G>
          <Polygon points="28,24 72,24 90,42 50,90 10,42" fill={`url(#${u}blue)`} stroke="#0A2A7A" strokeWidth={2} strokeLinejoin="round" />
          <Polygon points="28,24 72,24 62,42 38,42" fill="#C8F4FF" opacity={0.7} />
          <Path d="M10,42 L90,42 M38,42 L50,90 L62,42 M28,24 L38,42 M72,24 L62,42" stroke="#0A2A7A" strokeWidth={1.2} opacity={0.7} fill="none" />
          <Polygon points="80,12 82,18 88,20 82,22 80,28 78,22 72,20 78,18" fill="#FFFFFF" />
        </G>
      )}
      {k === 'SEVEN' && (
        <G>
          <SvgText x={52} y={88} fontSize={92} fontWeight="900" fill="#5A0008" textAnchor="middle">
            7
          </SvgText>
          <SvgText x={50} y={85} fontSize={92} fontWeight="900" fill={`url(#${u}seven)`} stroke="#FFD24A" strokeWidth={2.5} textAnchor="middle">
            7
          </SvgText>
        </G>
      )}
      {k === 'CROWN' && (
        <G>
          <Polygon points="12,72 18,26 35,50 50,16 65,50 82,26 88,72" fill={`url(#${u}gold)`} stroke="#8A5A00" strokeWidth={2} strokeLinejoin="round" />
          <Rect x={12} y={70} width={76} height={14} rx={3} fill={`url(#${u}gold)`} stroke="#8A5A00" strokeWidth={2} />
          <Circle cx={18} cy={24} r={5} fill="#FFF4C0" stroke="#8A5A00" strokeWidth={1} />
          <Circle cx={50} cy={14} r={6} fill="#FFF4C0" stroke="#8A5A00" strokeWidth={1} />
          <Circle cx={82} cy={24} r={5} fill="#FFF4C0" stroke="#8A5A00" strokeWidth={1} />
          <Circle cx={30} cy={77} r={4} fill={`url(#${u}red)`} />
          <Polygon points="50,72 55,77 50,82 45,77" fill={`url(#${u}blue)`} />
          <Circle cx={70} cy={77} r={4} fill={`url(#${u}red)`} />
          <Circle cx={50} cy={52} r={6} fill={`url(#${u}red)`} stroke="#8A5A00" strokeWidth={1} />
        </G>
      )}
    </Svg>
  );
});

/**
 * The gold foil over one panel. `mask` holds a '1' for every flake still on;
 * the foil is drawn through a clip of round flakes, so rubbed-off spots get the
 * ragged edge of a real scratch. Once the panel is revealed the rest fades away.
 */
const Foil = memo(function Foil({ size, mask, revealed }: { size: number; mask: string; revealed: boolean }) {
  const u = `fo${useId().replace(/:/g, '')}`;
  const op = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (revealed) Animated.timing(op, { toValue: 0, duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    else {
      op.stopAnimation();
      op.setValue(1);
    }
  }, [revealed, op]);
  const c = 100 / CHUNKS;
  const whole = mask === FULL;
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: op }]}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <SvgLinearGradient id={`${u}g`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FFF6C8" />
            <Stop offset="0.22" stopColor="#E8B530" />
            <Stop offset="0.42" stopColor="#FFF0A8" />
            <Stop offset="0.62" stopColor="#C88E18" />
            <Stop offset="0.82" stopColor="#F6D266" />
            <Stop offset="1" stopColor="#9A6608" />
          </SvgLinearGradient>
          <RadialGradient id={`${u}e`} cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor="#FFF8D8" />
            <Stop offset="1" stopColor="#D8A028" />
          </RadialGradient>
          {!whole && (
            <ClipPath id={`${u}c`}>{Array.from(mask, (ch, k) => (ch === '1' ? <Circle key={k} cx={((k % CHUNKS) + 0.5) * c} cy={(Math.floor(k / CHUNKS) + 0.5) * c} r={c * 0.8} /> : null))}</ClipPath>
          )}
        </Defs>
        <G clipPath={whole ? undefined : `url(#${u}c)`}>
          <Rect x={0} y={0} width={100} height={100} fill={`url(#${u}g)`} />
          {/* fine brushed-metal lines */}
          {Array.from({ length: 9 }, (_, i) => (
            <Line key={i} x1={-20 + i * 16} y1={0} x2={i * 16 + 20} y2={100} stroke="#FFFFFF" strokeWidth={1.2} opacity={0.16} />
          ))}
          {/* embossed emblem */}
          <Circle cx={50} cy={50} r={24} fill={`url(#${u}e)`} stroke="#9A6608" strokeWidth={1.5} opacity={0.9} />
          <Polygon points="50,32 54.5,44.5 67,45 57,53 60.5,66 50,58.5 39.5,66 43,53 33,45 45.5,44.5" fill="#C8901A" stroke="#8A5A00" strokeWidth={1.2} />
          <Polygon points="12,14 13.5,18 18,19.5 13.5,21 12,25 10.5,21 6,19.5 10.5,18" fill="#FFFFFF" opacity={0.85} />
          <Polygon points="86,78 87.2,81.5 91,82.8 87.2,84 86,87.5 84.8,84 81,82.8 84.8,81.5" fill="#FFFFFF" opacity={0.8} />
          <Rect x={1} y={1} width={98} height={98} rx={8} fill="none" stroke="#8A5A00" strokeWidth={1.5} opacity={0.6} />
        </G>
      </Svg>
    </Animated.View>
  );
});

type WinLook = 'none' | 'big' | 'plain';

/** One panel: the symbol and its prize printed on the card, under its foil. */
const Panel = memo(function Panel({
  size,
  symbolKey,
  label,
  mask,
  revealed,
  win,
  pulse,
}: {
  size: number;
  symbolKey: string | null;
  label: string;
  mask: string;
  revealed: boolean;
  win: WinLook;
  pulse: Animated.Value;
}) {
  return (
    <View style={[styles.panel, { width: size, height: size }]}>
      <LinearGradient colors={win === 'big' ? ['#FFF6D0', '#FFD86A'] : ['#FFFAEC', '#EED9A8']} style={StyleSheet.absoluteFill} />
      {symbolKey && (
        <View style={{ alignItems: 'center', marginTop: size * 0.04 }}>
          <SymbolArt k={symbolKey} size={size * 0.6} />
          <Text style={[styles.panelLabel, { fontSize: Math.max(10, size * 0.13) }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
      {win === 'big' && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.winRing, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }]} />}
      {win === 'plain' && <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.plainRing]} />}
      <Foil size={size} mask={mask} revealed={revealed} />
    </View>
  );
});

/** A little gold glint thrown off where the finger scratches. */
function Spark({ x, y, onDone }: { x: number; y: number; onDone: () => void }) {
  const a = useRef(new Animated.Value(0)).current;
  const drift = useRef((Math.random() - 0.5) * 24).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 520, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => onDone());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x - 8,
        top: y - 8,
        opacity: a.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }),
        transform: [
          { translateX: a.interpolate({ inputRange: [0, 1], outputRange: [0, drift] }) },
          { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [0, -18] }) },
          { scale: a.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.3, 1.2, 0.5] }) },
        ],
      }}
    >
      <MaterialCommunityIcons name="star-four-points" size={16} color="#FFF4C0" />
    </Animated.View>
  );
}

/** Home tile art: a small ticket with three lucky 7s scratched open. */
export function ScratchCardTileArt({ size }: { size: number }) {
  const card = size * 0.7;
  const q = (card - 6 - 6 - 3) / 3;
  const cells = ['SEVEN', null, 'SEVEN', null, 'SEVEN', null];
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size, alignItems: 'center' }} pointerEvents="none">
      <LinearGradient colors={['#9A0E36', '#3A0412']} style={StyleSheet.absoluteFill} />
      <View
        style={{
          marginTop: size * 0.08,
          width: card,
          padding: 3,
          borderRadius: 8,
          borderWidth: 1.5,
          borderColor: GOLD,
          backgroundColor: '#5A061C',
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 3,
          transform: [{ rotate: '-7deg' }],
        }}
      >
        {cells.map((k, i) => (
          <View key={i} style={{ width: q, height: q, borderRadius: 4, overflow: 'hidden', backgroundColor: '#FFF4D8', alignItems: 'center', justifyContent: 'center' }}>
            {k ? <SymbolArt k={k} size={q * 0.86} /> : <Foil size={q} mask={FULL} revealed={false} />}
          </View>
        ))}
      </View>
    </View>
  );
}

// ---------- screen ----------

type Phase = 'idle' | 'buying' | 'scratching' | 'done';
type Banner = { title: string; sub?: string; tone: 'win' | 'big' };
type Result = { payout: number; m: number; stake: number };

const freshMasks = () => Array.from({ length: 9 }, () => FULL);
const freshChunks = () => Array.from({ length: 9 }, () => new Uint8Array(CHUNKS * CHUNKS).fill(1));

export default function ScratchCardScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<ScratchConfig | null>(null);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [phase, setPhase] = useState<Phase>('idle');
  const [ticket, setTicket] = useState<ScratchTicketRow | null>(null);
  const [masks, setMasks] = useState<string[]>(freshMasks);
  const [revealed, setRevealed] = useState<boolean[]>(() => Array(9).fill(false));
  const [sparks, setSparks] = useState<{ id: number; x: number; y: number }[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [recent, setRecent] = useState<number[]>([]);
  const [shownBalance, setShownBalance] = useState(coins);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [panel, setPanel] = useState<'info' | 'history' | null>(null);
  const [history, setHistory] = useState<ScratchTicketRow[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sessionNet, setSessionNet] = useState(0);
  const [now, setNow] = useState(Date.now());

  const mountedRef = useRef(true);
  const phaseRef = useRef<Phase>('idle');
  const ticketRef = useRef<ScratchTicketRow | null>(null);
  const chunks = useRef(freshChunks());
  const revealedRef = useRef<boolean[]>(Array(9).fill(false));
  const dirty = useRef(new Set<number>());
  const frame = useRef<number | null>(null);
  const lastPt = useRef<{ x: number; y: number } | null>(null);
  const lastSpark = useRef(0);
  const sparkId = useRef(0);
  const t0 = useRef(0);
  const finishing = useRef(false);
  const revealingAll = useRef(false);
  const panelRef = useRef(panel);
  panelRef.current = panel;
  const sessionStart = useRef(Date.now());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const winPulse = useRef(new Animated.Value(0)).current;
  const winLoop = useRef<Animated.CompositeAnimation | null>(null);
  const shimmer = useRef(new Animated.Value(0)).current;
  const bannerAnim = useRef(new Animated.Value(0)).current;

  const S = Math.min(W - 12, 440);
  const G = S - 28;
  const P = (G - GAP * 2) / 3;
  const geo = useRef({ P, R: P * 0.19 });
  geo.current = { P, R: P * 0.19 };

  const symbols = config?.symbols ?? FALLBACK_SYMBOLS;
  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const maxPayout = config?.maxPayout ?? 10000;
  const betLevels = useMemo(() => BET_LEVELS.filter((b) => b >= minStake && b <= maxStake), [minStake, maxStake]);
  const busy = phase === 'buying' || phase === 'scratching';
  const topX = symbols[symbols.length - 1]?.multiplier ?? 1000;

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  useEffect(() => {
    if (phaseRef.current === 'idle' || phaseRef.current === 'done') setShownBalance(coins);
  }, [coins]);

  useEffect(() => {
    mountedRef.current = true;
    fetchScratchConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => mountedRef.current && setToast('Could not load the game — check your connection.'));
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    const sweep = Animated.loop(Animated.sequence([Animated.timing(shimmer, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }), Animated.delay(1300)]));
    sweep.start();
    return () => {
      mountedRef.current = false;
      clearInterval(clock);
      loop.stop();
      sweep.stop();
      winLoop.current?.stop();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [pulse, shimmer]);

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const flashBanner = useCallback(
    async (b: Banner, hold: number) => {
      setBanner(b);
      bannerAnim.setValue(0);
      await run(Animated.spring(bannerAnim, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }));
      await wait(hold);
      await run(Animated.timing(bannerAnim, { toValue: 0, duration: 180, useNativeDriver: true }));
      if (mountedRef.current) setBanner(null);
    },
    [bannerAnim],
  );

  const addSpark = (x: number, y: number) => {
    const id = ++sparkId.current;
    setSparks((s) => [...s.slice(-9), { id, x: x + (Math.random() - 0.5) * 14, y: y + (Math.random() - 0.5) * 14 }]);
  };

  // The handlers below read refs, so the PanResponder (made once) always gets the current ones.
  const h = useRef({ scratch: (_x: number, _y: number) => {}, release: () => {} });

  /** Shows the result once all nine panels are open (never sooner than 2.5s after buying). */
  const finish = async () => {
    const t = ticketRef.current;
    if (finishing.current || !t) return;
    finishing.current = true;
    await wait(Math.max(0, MIN_TICKET_MS - (Date.now() - t0.current)));
    if (!mountedRef.current || ticketRef.current !== t) return;
    const payout = Number(t.payout);
    const m = Number(t.multiplier);
    const stake = Number(t.stake);
    setPhaseBoth('done');
    setResult({ payout, m, stake });
    setRecent((r) => [m, ...r].slice(0, 12));
    setShownBalance((b) => round2(b + payout));
    setSessionNet((v) => round2(v + payout - stake));
    refreshWallet();
    if (panelRef.current === 'history')
      fetchScratchHistory(30)
        .then((rows) => mountedRef.current && setHistory(rows))
        .catch(() => {});
    // Only a return above the stake is celebrated.
    if (payout > stake) {
      winPulse.setValue(0);
      winLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(winPulse, { toValue: 1, duration: 420, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(winPulse, { toValue: 0, duration: 420, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      );
      winLoop.current.start();
      await flashBanner({ title: m >= 20 ? 'BIG WIN!' : 'WIN!', sub: `${fmtX(m)} · ${money(payout)}`, tone: m >= 20 ? 'big' : 'win' }, m >= 20 ? 1500 : 900);
    }
  };

  const reveal = (i: number) => {
    if (revealedRef.current[i]) return;
    revealedRef.current[i] = true;
    setRevealed([...revealedRef.current]);
    const { P: p } = geo.current;
    addSpark((i % 3) * (p + GAP) + p / 2, Math.floor(i / 3) * (p + GAP) + p / 2);
    if (revealedRef.current.every(Boolean)) finish();
  };

  const flush = () => {
    frame.current = null;
    if (dirty.current.size === 0) return;
    const touched = [...dirty.current];
    dirty.current.clear();
    setMasks((prev) => {
      const next = [...prev];
      touched.forEach((i) => (next[i] = Array.from(chunks.current[i], (v) => (v ? '1' : '0')).join('')));
      return next;
    });
    touched.forEach((i) => {
      const left = chunks.current[i].reduce((s, v) => s + v, 0);
      if (1 - left / (CHUNKS * CHUNKS) >= CLEAR_SHARE) reveal(i);
    });
  };

  const scratchPoint = (x: number, y: number) => {
    const { P: p, R } = geo.current;
    const c = p / CHUNKS;
    for (let i = 0; i < 9; i++) {
      if (revealedRef.current[i]) continue;
      const lx = x - (i % 3) * (p + GAP);
      const ly = y - Math.floor(i / 3) * (p + GAP);
      if (lx < -R || ly < -R || lx > p + R || ly > p + R) continue;
      const arr = chunks.current[i];
      for (let k = 0; k < arr.length; k++) {
        if (!arr[k]) continue;
        const dx = ((k % CHUNKS) + 0.5) * c - lx;
        const dy = (Math.floor(k / CHUNKS) + 0.5) * c - ly;
        if (dx * dx + dy * dy <= R * R) {
          arr[k] = 0;
          dirty.current.add(i);
        }
      }
    }
  };

  h.current.scratch = (x: number, y: number) => {
    if (phaseRef.current !== 'scratching' || revealingAll.current) return;
    const prev = lastPt.current ?? { x, y };
    const dist = Math.hypot(x - prev.x, y - prev.y);
    const steps = Math.max(1, Math.ceil(dist / (geo.current.R * 0.5)));
    for (let s = 1; s <= steps; s++) scratchPoint(prev.x + ((x - prev.x) * s) / steps, prev.y + ((y - prev.y) * s) / steps);
    lastPt.current = { x, y };
    const t = Date.now();
    if (dirty.current.size > 0 && t - lastSpark.current > 70) {
      lastSpark.current = t;
      addSpark(x, y);
    }
    if (frame.current === null) frame.current = requestAnimationFrame(flush);
  };
  h.current.release = () => {
    lastPt.current = null;
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => phaseRef.current === 'scratching',
      onMoveShouldSetPanResponder: () => phaseRef.current === 'scratching',
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        lastPt.current = null;
        h.current.scratch(e.nativeEvent.locationX, e.nativeEvent.locationY);
      },
      onPanResponderMove: (e) => h.current.scratch(e.nativeEvent.locationX, e.nativeEvent.locationY),
      onPanResponderRelease: () => h.current.release(),
      onPanResponderTerminate: () => h.current.release(),
    }),
  ).current;

  const buy = async () => {
    if (phaseRef.current === 'buying' || phaseRef.current === 'scratching' || !config) return;
    if (bet > shownBalance) {
      showToast('Insufficient balance');
      return;
    }
    // A fresh, sealed ticket.
    winLoop.current?.stop();
    chunks.current = freshChunks();
    revealedRef.current = Array(9).fill(false);
    finishing.current = false;
    revealingAll.current = false;
    ticketRef.current = null;
    setTicket(null);
    setMasks(freshMasks());
    setRevealed(Array(9).fill(false));
    setResult(null);
    setPhaseBoth('buying');
    t0.current = Date.now();
    setShownBalance((b) => round2(b - bet));
    try {
      const t = await buyScratchTicket(bet);
      if (!mountedRef.current) return;
      ticketRef.current = t;
      setTicket(t);
      setPhaseBoth('scratching');
    } catch (err) {
      if (!mountedRef.current) return;
      showToast(errorMessage(err));
      setPhaseBoth('idle');
      setShownBalance(coins);
      refreshWallet();
    }
  };

  const revealAll = async () => {
    if (phaseRef.current !== 'scratching' || revealingAll.current) return;
    revealingAll.current = true;
    const order = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((i) => !revealedRef.current[i]);
    for (const i of order) {
      if (!mountedRef.current) return;
      reveal(i);
      await wait(160);
    }
  };

  const stepBet = (dir: 1 | -1) => {
    if (busy) return;
    const idx = Math.max(0, betLevels.indexOf(bet));
    setBet(betLevels[Math.max(0, Math.min(betLevels.length - 1, idx + dir))] ?? bet);
  };

  const openHistory = () => {
    setPanel('history');
    setHistory(null);
    fetchScratchHistory(30)
      .then((rows) => mountedRef.current && setHistory(rows))
      .catch(() => mountedRef.current && setHistory([]));
  };

  const stake = ticket ? Number(ticket.stake) : bet;
  const prizeFor = (m: number) => Math.min(floor2(stake * m), maxPayout);
  const winLook: WinLook = result && result.payout > 0 ? (result.payout > result.stake ? 'big' : 'plain') : 'none';
  const opened = revealed.filter(Boolean).length;
  const minutes = Math.floor((now - sessionStart.current) / 60000);
  const seconds = Math.floor(((now - sessionStart.current) % 60000) / 1000);
  const sealed = phase === 'idle' || phase === 'buying';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#4A0A1E', '#16030A']} style={StyleSheet.absoluteFill} />

      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={TEXT} />
          <MaterialCommunityIcons name="ticket-confirmation" size={18} color={GOLD} />
          <Text style={styles.title}>SCRATCH CARD</Text>
        </Pressable>
        <View style={styles.balancePill}>
          <MaterialCommunityIcons name="wallet" size={15} color={GOLD} />
          <Text style={styles.balanceText}>{money(shownBalance)}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24, alignItems: 'center' }} scrollEnabled={phase !== 'scratching'}>
        {/* Recent results */}
        <View style={[styles.recentRow, { width: S }]}>
          {recent.length === 0 ? (
            <Text style={styles.recentEmpty}>Your last tickets show here</Text>
          ) : (
            recent.map((m, i) => (
              <View key={i} style={[styles.recentChip, { borderColor: m > 1 ? GOLD : m > 0 ? '#D8C0C8' : '#6A4A54', opacity: 1 - i * 0.06 }]}>
                <Text style={[styles.recentText, { color: m > 1 ? GOLD : m > 0 ? '#F0E0E4' : '#9A7A84' }]}>{fmtX(m)}</Text>
              </View>
            ))
          )}
        </View>

        {/* The ticket */}
        <View style={[styles.ticket, { width: S }]}>
          <LinearGradient colors={['#8A0E30', '#5A061C', '#2E020E']} style={StyleSheet.absoluteFill} />
          {/* perforated edge notches */}
          <View style={[styles.notch, { left: -9 }]} />
          <View style={[styles.notch, { right: -9 }]} />

          <View style={styles.ticketHead}>
            <View style={styles.headStars}>
              <MaterialCommunityIcons name="star-four-points" size={12} color={GOLD} />
              <Text style={styles.headSmall}>GOLDEN</Text>
              <MaterialCommunityIcons name="star-four-points" size={12} color={GOLD} />
            </View>
            <Text style={styles.headBig}>SCRATCH CARD</Text>
            <LinearGradient colors={['#FFF4C8', GOLD, DEEP_GOLD]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ribbon}>
              <Text style={styles.ribbonText}>MATCH 3 SYMBOLS · WIN UP TO {fmtX(topX)}</Text>
            </LinearGradient>
          </View>

          <View style={[styles.gridFrame, { width: G + 12, height: G + 12 }]}>
            <View style={{ width: G, height: G }}>
              {Array.from({ length: 9 }, (_, i) => {
                const sym = ticket ? ticket.panels[i] : null;
                const k = sym !== null && sym !== undefined ? (symbols[sym]?.key ?? null) : null;
                const isWin = ticket !== null && ticket.prize >= 0 && sym === ticket.prize;
                return (
                  <View key={i} style={{ position: 'absolute', left: (i % 3) * (P + GAP), top: Math.floor(i / 3) * (P + GAP) }}>
                    <Panel
                      size={P}
                      symbolKey={k}
                      label={k && sym !== null ? shortMoney(prizeFor(symbols[sym].multiplier)) : ''}
                      mask={masks[i]}
                      revealed={revealed[i]}
                      win={phase === 'done' && isWin ? winLook : 'none'}
                      pulse={winPulse}
                    />
                  </View>
                );
              })}
              {sealed && (
                <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden', borderRadius: 10 }]}>
                  <Animated.View
                    style={[
                      styles.shine,
                      { height: G * 1.6, top: -G * 0.3, transform: [{ translateX: shimmer.interpolate({ inputRange: [0, 1], outputRange: [-G * 0.6, G * 1.3] }) }, { rotate: '20deg' }] },
                    ]}
                  />
                </View>
              )}
              {sparks.map((s) => (
                <Spark key={s.id} x={s.x} y={s.y} onDone={() => setSparks((list) => list.filter((v) => v.id !== s.id))} />
              ))}
              {/* Touch layer on top: no children, so touch positions are always relative to the grid. */}
              <View style={StyleSheet.absoluteFill} {...pan.panHandlers} />
            </View>
          </View>

          {/* Prize key */}
          <View style={styles.keyGrid}>
            {[...symbols].reverse().map((s) => (
              <View key={s.key} style={styles.keyItem}>
                <SymbolArt k={s.key} size={22} />
                <Text style={[styles.keyX, s.multiplier >= 100 && { color: GOLD }]}>{fmtX(s.multiplier)}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.serial} numberOfLines={1}>
            {ticket ? `TICKET #${ticket.nonce} · ${ticket.serverSeedHash.slice(0, 16)}…` : 'PROVABLY FAIR · 3 OF A KIND WINS'}
          </Text>
        </View>

        {/* Result plate */}
        <View style={styles.plate}>
          {phase === 'done' && result ? (
            result.payout > result.stake ? (
              <Text style={styles.plateWin}>
                WIN {money(result.payout)} <Text style={styles.plateSub}>({fmtX(result.m)})</Text>
              </Text>
            ) : result.payout > 0 ? (
              <Text style={styles.plateText}>RETURNED {money(result.payout)}</Text>
            ) : (
              <Text style={styles.plateText}>NO WIN · TRY ANOTHER TICKET</Text>
            )
          ) : phase === 'scratching' ? (
            <Text style={styles.plateText}>SCRATCH THE GOLD · {opened}/9 OPEN</Text>
          ) : phase === 'buying' ? (
            <Text style={styles.plateText}>PRINTING YOUR TICKET…</Text>
          ) : (
            <Text style={styles.plateText}>BUY A TICKET · MATCH 3 TO WIN</Text>
          )}
        </View>

        {/* Session (time played and net position, always on show) */}
        <View style={[styles.session, { width: S }]}>
          <MaterialCommunityIcons name="timer-outline" size={15} color="#E8C8D0" />
          <Text style={styles.sessionText}>
            Session {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </Text>
          <Text style={styles.sessionSep}>·</Text>
          <Text style={[styles.sessionText, { color: sessionNet > 0 ? GREEN : sessionNet < 0 ? '#FF9AA6' : '#E8C8D0' }]}>
            Net {sessionNet >= 0 ? '+' : '−'}
            {money(Math.abs(sessionNet))}
          </Text>
        </View>

        {/* Controls: no autoplay or turbo */}
        <View style={[styles.controls, { width: S }]}>
          <Pressable onPress={() => setPanel('info')} style={styles.sideBtn} hitSlop={6}>
            <MaterialCommunityIcons name="information-outline" size={20} color={GOLD} />
            <Text style={styles.sideText}>RULES</Text>
          </Pressable>
          <View style={styles.betBox}>
            <Text style={styles.betLabel}>TICKET PRICE</Text>
            <View style={styles.betRow}>
              <Pressable onPress={() => stepBet(-1)} disabled={busy} style={[styles.betBtn, busy && styles.dim]} hitSlop={6}>
                <MaterialCommunityIcons name="minus" size={18} color={INK} />
              </Pressable>
              <Text style={styles.betValue}>{money(bet)}</Text>
              <Pressable onPress={() => stepBet(1)} disabled={busy} style={[styles.betBtn, busy && styles.dim]} hitSlop={6}>
                <MaterialCommunityIcons name="plus" size={18} color={INK} />
              </Pressable>
            </View>
          </View>
          <Pressable
            onPress={phase === 'scratching' ? revealAll : buy}
            disabled={phase === 'buying' || !config}
            style={({ pressed }) => [styles.mainWrap, pressed && { transform: [{ scale: 0.95 }] }]}
          >
            <Animated.View style={[styles.mainHalo, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.7] }) }]} />
            <LinearGradient colors={phase === 'buying' || !config ? ['#6A4A54', '#3A1E28'] : ['#FFF4C8', GOLD, DEEP_GOLD]} style={styles.mainBtn}>
              <MaterialCommunityIcons name={phase === 'buying' ? 'dots-horizontal' : phase === 'scratching' ? 'eye' : 'ticket'} size={24} color={INK} />
              {phase !== 'buying' && <Text style={styles.mainSmall}>{phase === 'scratching' ? 'REVEAL' : 'BUY'}</Text>}
            </LinearGradient>
          </Pressable>
          <Pressable onPress={openHistory} style={styles.sideBtn} hitSlop={6}>
            <MaterialCommunityIcons name="history" size={20} color={GOLD} />
            <Text style={styles.sideText}>HISTORY</Text>
          </Pressable>
        </View>

        <GameInfoButton>
          RTP {config?.rtpPercent ?? 88}% · ticket {money(minStake)}–{money(maxStake)} · max {money(maxPayout)} per ticket{'\n'}
          No autoplay or turbo · each ticket takes at least 2.5 seconds · provably fair
        </GameInfoButton>
      </ScrollView>

      {banner && (
        <Animated.View pointerEvents="none" style={[styles.banner, { opacity: bannerAnim, transform: [{ scale: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }]}>
          <LinearGradient
            colors={banner.tone === 'big' ? ['#FFF4C8', GOLD, '#B87800'] : ['#9A1A40', '#4A0618']}
            style={[styles.bannerInner, { borderColor: banner.tone === 'big' ? '#FFFFFF' : GOLD }]}
          >
            <MaterialCommunityIcons name="star-four-points" size={30} color={banner.tone === 'big' ? '#5A2A00' : GOLD} />
            <Text style={[styles.bannerText, banner.tone === 'big' && { color: '#3A1A00' }]}>{banner.title}</Text>
            {banner.sub ? <Text style={[styles.bannerSub, banner.tone === 'big' && { color: '#5A2A00' }]}>{banner.sub}</Text> : null}
          </LinearGradient>
        </Animated.View>
      )}

      {toast && (
        <View pointerEvents="none" style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      <Modal visible={panel !== null} transparent animationType="fade" onRequestClose={() => setPanel(null)}>
        <Pressable style={styles.modalBack} onPress={() => setPanel(null)}>
          <Pressable style={[styles.modalCard, { width: Math.min(W - 24, 440) }]} onPress={() => {}}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{panel === 'info' ? 'HOW TO PLAY' : 'MY TICKETS'}</Text>
              <Pressable onPress={() => setPanel(null)} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={22} color={TEXT} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 480 }}>{panel === 'info' ? <Rules bet={bet} config={config} /> : <History tickets={history} symbols={symbols} />}</ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Rules({ bet, config }: { bet: number; config: ScratchConfig | null }) {
  if (!config) return <Text style={styles.note}>Loading…</Text>;
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.note}>
        Pick a ticket price and BUY. Scratch the nine gold panels with your finger (or tap REVEAL). Find the same symbol three times and you win that symbol&apos;s prize. A ticket has at most one
        winning symbol.
      </Text>
      <Text style={styles.section}>PRIZES</Text>
      {[...config.symbols].reverse().map((s) => (
        <View key={s.key} style={[styles.tRow, { alignItems: 'center' }]}>
          <View style={{ flex: 1.4, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <SymbolArt k={s.key} size={22} />
            <Text style={styles.tCell}>{SYMBOL_NAME[s.key] ?? s.key}</Text>
          </View>
          <Text style={[styles.tCell, { flex: 0.6 }]}>{fmtX(s.multiplier)}</Text>
          <Text style={[styles.tCell, { flex: 0.9, color: '#D8B8C0' }]}>1 in {Math.round(1 / s.chance).toLocaleString('en-IN')}</Text>
          <Text style={[styles.tCell, { textAlign: 'right' }]}>{money(Math.min(floor2(bet * s.multiplier), config.maxPayout))}</Text>
        </View>
      ))}
      <Text style={styles.section}>GAME INFO</Text>
      <Text style={styles.note}>
        Chance of any prize: about 1 in {(1 / config.symbols.reduce((s, x) => s + x.chance, 0)).toFixed(2)} tickets. A Gold Coin prize returns your ticket price. Tickets return {config.rtpPercent}%
        over time. No autoplay or turbo; each ticket takes at least 2.5 seconds. The prize and the panels come from your provably-fair seeds (server seed hash, client seed and nonce on each ticket).
      </Text>
    </View>
  );
}

function History({ tickets, symbols }: { tickets: ScratchTicketRow[] | null; symbols: { key: string }[] }) {
  if (tickets === null) return <Text style={styles.note}>Loading…</Text>;
  if (tickets.length === 0) return <Text style={styles.note}>No tickets yet.</Text>;
  return (
    <View>
      {tickets.map((t) => {
        const payout = Number(t.payout);
        const d = new Date(t.createdAt);
        const k = t.prize >= 0 ? symbols[t.prize]?.key : null;
        return (
          <View key={t.id} style={styles.histRow}>
            <Text style={styles.histTime}>{d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            <Text style={styles.histStake}>{money(Number(t.stake))}</Text>
            <View style={{ width: 26 }}>{k ? <SymbolArt k={k} size={20} /> : null}</View>
            <Text style={styles.histMult}>{fmtX(Number(t.multiplier))}</Text>
            <Text style={[styles.histWin, { color: payout > 0 ? GREEN : '#9A8A90' }]}>{payout > 0 ? `+${money(payout)}` : '—'}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#16030A' },
  topBar: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  title: { color: TEXT, fontSize: 17, fontWeight: '900', letterSpacing: 2.5 },
  balancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,214,107,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,214,107,0.45)',
  },
  balanceText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  recentRow: { flexDirection: 'row', gap: 5, height: 28, alignItems: 'center', overflow: 'hidden', marginBottom: 6 },
  recentEmpty: { color: '#9A7A84', fontSize: 11, fontWeight: '700' },
  recentChip: { paddingHorizontal: 8, height: 24, borderRadius: 12, borderWidth: 1.5, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  recentText: { fontSize: 11, fontWeight: '900' },
  ticket: { borderRadius: 18, borderWidth: 3, borderColor: GOLD, alignItems: 'center', paddingBottom: 10, overflow: 'hidden' },
  notch: { position: 'absolute', top: '38%', width: 18, height: 18, borderRadius: 9, backgroundColor: '#2A0610', borderWidth: 2, borderColor: GOLD },
  ticketHead: { alignItems: 'center', paddingTop: 10, paddingBottom: 8 },
  headStars: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headSmall: { color: GOLD, fontSize: 11, fontWeight: '900', letterSpacing: 6 },
  headBig: { color: '#FFF4D0', fontSize: 28, fontWeight: '900', letterSpacing: 2, textShadowColor: '#B8860B', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  ribbon: { marginTop: 4, paddingHorizontal: 14, paddingVertical: 4, borderRadius: 10 },
  ribbonText: { color: INK, fontSize: 10.5, fontWeight: '900', letterSpacing: 1 },
  gridFrame: { padding: 6, borderRadius: 14, backgroundColor: 'rgba(20,0,6,0.55)', borderWidth: 1.5, borderColor: 'rgba(255,214,107,0.5)' },
  panel: { borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  panelLabel: { color: '#5A0A1E', fontWeight: '900', marginTop: -2 },
  winRing: { borderRadius: 10, borderWidth: 3.5, borderColor: '#FFB800', backgroundColor: 'rgba(255,214,107,0.18)' },
  plainRing: { borderRadius: 10, borderWidth: 2, borderColor: 'rgba(90,10,30,0.55)' },
  shine: { position: 'absolute', width: 34, backgroundColor: 'rgba(255,255,255,0.32)' },
  keyGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 10, paddingHorizontal: 8 },
  keyItem: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.3)', minWidth: 72 },
  keyX: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  serial: { color: 'rgba(255,214,107,0.6)', fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginTop: 8 },
  plate: { marginTop: 10, paddingHorizontal: 18, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(10,2,6,0.85)', borderWidth: 1.5, borderColor: GOLD },
  plateText: { color: TEXT, fontSize: 13, fontWeight: '900', letterSpacing: 1.5 },
  plateWin: { color: GREEN, fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  plateSub: { color: GOLD, fontSize: 13 },
  session: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)' },
  sessionText: { color: '#E8C8D0', fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sessionSep: { color: '#6A4A54', fontSize: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingHorizontal: 4 },
  sideBtn: { alignItems: 'center', gap: 2, width: 58 },
  sideText: { color: GOLD, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  betBox: { alignItems: 'center', gap: 4 },
  betLabel: { color: '#E0B8C4', fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  betRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(34,4,14,0.9)',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#8A2A4A',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  betBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: TEXT, alignItems: 'center', justifyContent: 'center' },
  betValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', minWidth: 70, textAlign: 'center' },
  dim: { opacity: 0.4 },
  mainWrap: { width: 92, height: 92, alignItems: 'center', justifyContent: 'center' },
  mainHalo: { position: 'absolute', width: 92, height: 92, borderRadius: 46, backgroundColor: GOLD },
  mainBtn: { width: 82, height: 82, borderRadius: 41, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  mainSmall: { color: INK, fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  banner: { position: 'absolute', top: '58%', alignSelf: 'center' },
  bannerInner: { paddingHorizontal: 30, paddingVertical: 12, borderRadius: 16, borderWidth: 3, alignItems: 'center' },
  bannerText: { color: TEXT, fontSize: 32, fontWeight: '900', letterSpacing: 2 },
  bannerSub: { color: GOLD, fontSize: 14, fontWeight: '900', marginTop: 2, letterSpacing: 1 },
  toast: { position: 'absolute', bottom: 120, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14 },
  toastText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  modalBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  modalCard: { backgroundColor: '#2E0614', borderRadius: 16, borderWidth: 2, borderColor: DEEP_GOLD, padding: 14 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { color: TEXT, fontSize: 16, fontWeight: '900', letterSpacing: 3 },
  note: { color: '#E8D0D8', fontSize: 12, lineHeight: 17 },
  section: { color: GOLD, fontSize: 12, fontWeight: '900', letterSpacing: 2, marginTop: 4 },
  tRow: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.12)' },
  tCell: { flex: 1, color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)', gap: 6 },
  histTime: { color: '#B898A8', fontSize: 11, width: 64 },
  histStake: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', width: 66 },
  histMult: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', flex: 1 },
  histWin: { fontSize: 12, fontWeight: '900' },
});
