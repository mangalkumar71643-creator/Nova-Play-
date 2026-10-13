import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient as SvgLinearGradient, Path, Polygon, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../api/client';
import { TreasureConfig, TreasureRound, cashOutTreasure, digTreasureMound, fetchTreasureConfig, fetchTreasureCurrent, fetchTreasureHistory, startTreasureRound } from '../api/backend';
import { useGameState } from '../state/GameStateContext';
import GameInfoButton from '../components/GameInfoButton';

const SAND = '#F2D49A';
const SEA = '#1AA8C8';
const GOLD = '#FFD66B';
const GREEN = '#3DFF8A';
const RED = '#FF4D3A';
const WOOD = '#6A3A1A';
const INK = '#2A1404';
const TEXT = '#FFF6E4';
const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const DEFAULT_BET = 10;
const MOUNDS = 16;
const COLS = 4;
const TOAST_MS = 1800;
const MODES = [3, 5, 8];
const MODE_NAME: Record<number, string> = { 3: 'EASY', 5: 'MEDIUM', 8: 'HARD' };
const MODE_COLOR: Record<number, string> = { 3: GREEN, 5: GOLD, 8: RED };

type Item = 'shell' | 'coin' | 'pearl' | 'gem' | 'crown' | 'chest';
/** The treasure shown for the n-th find (cosmetic): it gets richer the deeper the run. */
const ITEM_BY_FIND: Item[] = ['shell', 'shell', 'coin', 'coin', 'pearl', 'pearl', 'gem', 'gem', 'crown', 'crown', 'chest', 'chest', 'chest'];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function floor2(n: number): number {
  return Math.floor(Number((n * 100).toPrecision(12))) / 100;
}

function money(n: number): string {
  return `₹${n.toFixed(2)}`;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

/** Same ladder as the server: 88% / P(no crab in n digs). */
function ladderFor(crabs: number): number[] {
  const out = [1];
  let p = 1;
  for (let k = 0; k < MOUNDS - crabs; k++) {
    p *= (MOUNDS - crabs - k) / (MOUNDS - k);
    out.push(floor2(0.88 / p));
  }
  return out;
}

function fmtX(x: number): string {
  return x >= 1000 ? `${Math.round(x)}x` : `${x.toFixed(2)}x`;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const run = (a: Animated.CompositeAnimation) => new Promise<void>((r) => a.start(() => r()));

// ---------- art ----------

/** A sand mound, or the hole once it's dug. */
const Mound = memo(function Mound({ size, dug }: { size: number; dug: boolean }) {
  const u = `tm${useId().replace(/:/g, '')}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={`${u}s`} cx="0.4" cy="0.3" r="0.8">
          <Stop offset="0" stopColor="#FFF0C8" />
          <Stop offset="0.55" stopColor={SAND} />
          <Stop offset="1" stopColor="#B88A4A" />
        </RadialGradient>
        <RadialGradient id={`${u}h`} cx="0.5" cy="0.4" r="0.6">
          <Stop offset="0" stopColor="#3A2410" />
          <Stop offset="1" stopColor="#7A5428" />
        </RadialGradient>
      </Defs>
      <Ellipse cx={50} cy={80} rx={44} ry={12} fill="#000000" opacity={0.18} />
      {dug ? (
        <>
          <Ellipse cx={50} cy={66} rx={44} ry={22} fill="#C8A060" />
          <Ellipse cx={50} cy={64} rx={34} ry={15} fill={`url(#${u}h)`} />
          {[18, 82, 30, 70].map((x, i) => (
            <Circle key={i} cx={x} cy={i < 2 ? 58 : 78} r={4} fill="#E4C080" />
          ))}
        </>
      ) : (
        <>
          <Path d="M6 76 C 12 40, 34 22, 50 22 C 66 22, 88 40, 94 76 C 70 86, 30 86, 6 76 Z" fill={`url(#${u}s)`} stroke="#A07838" strokeWidth={1.2} />
          <Path d="M30 40 C 36 32, 46 29, 52 30" stroke="#FFFFFF" strokeOpacity={0.55} strokeWidth={3} strokeLinecap="round" fill="none" />
          {[
            [30, 60],
            [62, 50],
            [70, 68],
            [44, 72],
          ].map(([x, y], i) => (
            <Circle key={i} cx={x} cy={y} r={1.6} fill="#A07838" opacity={0.6} />
          ))}
        </>
      )}
    </Svg>
  );
});

/** Treasures found in the sand. */
const Treasure = memo(function Treasure({ kind, size }: { kind: Item; size: number }) {
  const u = `ti${useId().replace(/:/g, '')}`;
  let body: React.ReactNode;
  if (kind === 'shell') {
    body = (
      <G>
        <Path d="M50 82 L 18 46 C 22 26, 78 26, 82 46 Z" fill="#FFB0C0" stroke="#C8607A" strokeWidth={2} />
        {[-24, -12, 0, 12, 24].map((dx, i) => (
          <Path key={i} d={`M50 80 L ${50 + dx} 32`} stroke="#C8607A" strokeWidth={2} />
        ))}
        <Rect x={40} y={78} width={20} height={8} rx={3} fill="#E88AA0" />
      </G>
    );
  } else if (kind === 'coin') {
    body = (
      <G>
        <Circle cx={50} cy={52} r={32} fill={`url(#${u}g)`} stroke="#8A5A00" strokeWidth={2.5} />
        <Circle cx={50} cy={52} r={24} fill="none" stroke="#FFF4C0" strokeOpacity={0.7} strokeWidth={2} />
        <SvgText x={50} y={64} fontSize={32} fontWeight="900" fill="#8A5A00" textAnchor="middle">
          ₹
        </SvgText>
      </G>
    );
  } else if (kind === 'pearl') {
    body = (
      <G>
        <Path d="M14 60 C 20 84, 80 84, 86 60 Z" fill="#8A6A9A" stroke="#4A2A5A" strokeWidth={2} />
        <Path d="M14 60 C 22 30, 78 30, 86 60 Z" fill="#B89AC8" stroke="#4A2A5A" strokeWidth={2} />
        <Circle cx={50} cy={58} r={16} fill={`url(#${u}p)`} />
        <Circle cx={44} cy={52} r={5} fill="#FFFFFF" opacity={0.9} />
      </G>
    );
  } else if (kind === 'gem') {
    body = (
      <G>
        <Polygon points="50,86 14,40 30,20 70,20 86,40" fill={`url(#${u}d)`} stroke="#0A3A8A" strokeWidth={2} />
        <Polygon points="30,20 40,40 60,40 70,20" fill="#C8F0FF" opacity={0.6} />
        <Polygon points="14,40 86,40 50,86" fill="#1A5ACA" opacity={0.35} />
      </G>
    );
  } else if (kind === 'crown') {
    body = (
      <G>
        <Path d="M14 74 L 10 30 L 32 50 L 50 22 L 68 50 L 90 30 L 86 74 Z" fill={`url(#${u}g)`} stroke="#8A5A00" strokeWidth={2.5} />
        <Rect x={14} y={70} width={72} height={12} rx={3} fill="#D8A020" stroke="#8A5A00" strokeWidth={2} />
        {[30, 50, 70].map((x, i) => (
          <Circle key={i} cx={x} cy={76} r={4} fill={['#FF3A5A', '#3A8AFF', '#3ADC6A'][i]} />
        ))}
      </G>
    );
  } else {
    body = (
      <G>
        <Rect x={12} y={44} width={76} height={40} rx={4} fill="#8A4A1A" stroke={INK} strokeWidth={2.5} />
        <Path d="M12 46 C 12 22, 88 22, 88 46 Z" fill="#A85A24" stroke={INK} strokeWidth={2.5} />
        <Rect x={12} y={44} width={76} height={6} fill={GOLD} />
        <Rect x={44} y={40} width={12} height={16} rx={2} fill={GOLD} stroke="#8A5A00" strokeWidth={1.5} />
        <Circle cx={30} cy={36} r={6} fill={GOLD} />
        <Circle cx={66} cy={34} r={5} fill={GOLD} />
        <Circle cx={50} cy={30} r={4} fill="#FFF4C0" />
      </G>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={`${u}g`} cx="0.35" cy="0.3" r="0.8">
          <Stop offset="0" stopColor="#FFF8D0" />
          <Stop offset="0.5" stopColor={GOLD} />
          <Stop offset="1" stopColor="#B87800" />
        </RadialGradient>
        <RadialGradient id={`${u}p`} cx="0.4" cy="0.35" r="0.7">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#C8C0D8" />
        </RadialGradient>
        <SvgLinearGradient id={`${u}d`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#8AE0FF" />
          <Stop offset="1" stopColor="#1A4ACA" />
        </SvgLinearGradient>
      </Defs>
      <Circle cx={50} cy={54} r={44} fill={GOLD} opacity={0.18} />
      {body}
    </Svg>
  );
});

/** The crab: red shell, eye stalks and raised claws. */
const Crab = memo(function Crab({ size }: { size: number }) {
  const u = `tc${useId().replace(/:/g, '')}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={`${u}r`} cx="0.4" cy="0.3" r="0.8">
          <Stop offset="0" stopColor="#FF9A7A" />
          <Stop offset="0.6" stopColor="#E8341A" />
          <Stop offset="1" stopColor="#8A1004" />
        </RadialGradient>
      </Defs>
      {[-1, 1].map((s) => (
        <G key={s}>
          {[0, 1, 2].map((i) => (
            <Path key={i} d={`M${50 + s * 22} ${64 + i * 6} l ${s * 16} ${4 + i * 3} l ${s * 4} ${8}`} stroke="#B8200A" strokeWidth={4} strokeLinecap="round" fill="none" />
          ))}
          <Path d={`M${50 + s * 18} 52 L ${50 + s * 32} 36`} stroke="#C82A10" strokeWidth={6} strokeLinecap="round" />
          <Path
            d={`M${50 + s * 32} 36 C ${50 + s * 26} 18, ${50 + s * 46} 12, ${50 + s * 46} 26 L ${50 + s * 38} 28 L ${50 + s * 44} 34 C ${50 + s * 42} 40, ${50 + s * 34} 42, ${50 + s * 32} 36 Z`}
            fill={`url(#${u}r)`}
            stroke="#6A0A00"
            strokeWidth={1.5}
          />
          <Path d={`M${50 + s * 8} 46 L ${50 + s * 10} 32`} stroke="#B8200A" strokeWidth={3} />
          <Circle cx={50 + s * 10} cy={30} r={5} fill="#FFFFFF" stroke="#6A0A00" strokeWidth={1} />
          <Circle cx={50 + s * 11} cy={30} r={2.4} fill="#000000" />
        </G>
      ))}
      <Ellipse cx={50} cy={60} rx={26} ry={18} fill={`url(#${u}r)`} stroke="#6A0A00" strokeWidth={2} />
      <Path d="M42 64 Q 50 70 58 64" stroke="#6A0A00" strokeWidth={2} fill="none" strokeLinecap="round" />
    </Svg>
  );
});

/** The island: sky, sun, sea, palms and the sandy dig site. */
const Island = memo(function Island({ S, H, siteY, siteH, tile }: { S: number; H: number; siteY: number; siteH: number; tile?: boolean }) {
  const u = `tl${useId().replace(/:/g, '')}`;
  const palm = (x: number, flip: number, h: number) => (
    <G>
      <Path
        d={`M${x} ${siteY + 10} C ${x + flip * 6} ${siteY - h * 0.4}, ${x - flip * 4} ${siteY - h * 0.7}, ${x + flip * 10} ${siteY - h}`}
        stroke="#7A4A1A"
        strokeWidth={S * 0.022}
        fill="none"
        strokeLinecap="round"
      />
      {[-60, -20, 20, 60, 100, 140].map((a, i) => {
        const r = ((a + (flip < 0 ? 180 : 0)) * Math.PI) / 180;
        const tx = x + flip * 10;
        const ty = siteY - h;
        return (
          <Path
            key={i}
            d={`M${tx} ${ty} Q ${tx + Math.cos(r) * h * 0.3} ${ty + Math.sin(r) * h * 0.3 - h * 0.12}, ${tx + Math.cos(r) * h * 0.55} ${ty + Math.sin(r) * h * 0.55 + h * 0.08}`}
            stroke="#2A8A3A"
            strokeWidth={S * 0.03}
            fill="none"
            strokeLinecap="round"
          />
        );
      })}
      <Circle cx={x + flip * 10} cy={siteY - h + 4} r={S * 0.012} fill="#5A3A10" />
      <Circle cx={x + flip * 6} cy={siteY - h + 6} r={S * 0.012} fill="#5A3A10" />
    </G>
  );
  return (
    <Svg width={S} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id={`${u}sky`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FF9A4A" />
          <Stop offset="0.5" stopColor="#FFC87A" />
          <Stop offset="1" stopColor="#8AD8E8" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${u}sea`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#3AC8E0" />
          <Stop offset="1" stopColor="#0A6A9A" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${u}sand`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F8DCA0" />
          <Stop offset="1" stopColor="#D8A860" />
        </SvgLinearGradient>
        <RadialGradient id={`${u}sun`} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#FFF8D0" />
          <Stop offset="0.6" stopColor="#FFD66B" />
          <Stop offset="1" stopColor="#FF9A4A" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={S} height={H} fill={`url(#${u}sky)`} />
      <Circle cx={S * 0.78} cy={siteY * 0.36} r={S * 0.12} fill={`url(#${u}sun)`} />
      <Rect x={0} y={siteY * 0.55} width={S} height={H} fill={`url(#${u}sea)`} />
      {!tile &&
        Array.from({ length: 6 }, (_, i) => (
          <Path
            key={i}
            d={`M${(i % 3) * S * 0.33 + S * 0.05} ${siteY * (0.62 + Math.floor(i / 3) * 0.12)} q 8 -4 16 0 q 8 4 16 0`}
            stroke="#FFFFFF"
            strokeOpacity={0.5}
            strokeWidth={1.5}
            fill="none"
          />
        ))}
      {/* island */}
      <Ellipse cx={S / 2} cy={siteY + siteH / 2 + 8} rx={S * 0.62} ry={siteH * 0.62} fill="#FFFFFF" opacity={0.45} />
      <Ellipse cx={S / 2} cy={siteY + siteH / 2 + 4} rx={S * 0.58} ry={siteH * 0.6} fill={`url(#${u}sand)`} />
      {palm(S * 0.05, 1, siteY * 0.55)}
      {palm(S * 0.95, -1, siteY * 0.6)}
      {/* treasure-map dashes across the site */}
      {!tile && (
        <Path
          d={`M${S * 0.12} ${siteY + siteH * 0.95} C ${S * 0.3} ${siteY + siteH * 0.7}, ${S * 0.6} ${siteY + siteH * 1.0}, ${S * 0.88} ${siteY + siteH * 0.82}`}
          stroke="#B8302A"
          strokeOpacity={0.35}
          strokeWidth={2}
          strokeDasharray="6 6"
          fill="none"
        />
      )}
    </Svg>
  );
});

/** Home tile art: the island with a chest dug up and a crab beside it. */
export function TreasureDigTileArt({ size }: { size: number }) {
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size }} pointerEvents="none">
      <Island S={size} H={size} siteY={size * 0.42} siteH={size * 0.3} tile />
      <View style={{ position: 'absolute', left: size * 0.12, top: size * 0.4 }}>
        <Mound size={size * 0.3} dug={false} />
      </View>
      <View style={{ position: 'absolute', left: size * 0.36, top: size * 0.32 }}>
        <Treasure kind="chest" size={size * 0.34} />
      </View>
      <View style={{ position: 'absolute', left: size * 0.64, top: size * 0.42 }}>
        <Crab size={size * 0.26} />
      </View>
    </View>
  );
}

/** Springs its content up out of the sand when it first appears. */
function PopIn({ children }: { children: React.ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }).start();
  }, [v]);
  return (
    <Animated.View style={{ transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }, { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, -4] }) }] }}>
      {children}
    </Animated.View>
  );
}

// ---------- screen ----------

type Phase = 'idle' | 'aim' | 'digging' | 'over';
type Banner = { title: string; sub?: string; tone: 'win' | 'lose' };

export default function TreasureDigScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<TreasureConfig | null>(null);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [crabs, setCrabs] = useState(5);
  const [round, setRound] = useState<TreasureRound | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [diggingAt, setDiggingAt] = useState<number | null>(null);
  const [shownBalance, setShownBalance] = useState(coins);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [panel, setPanel] = useState<'info' | 'history' | null>(null);
  const [history, setHistory] = useState<TreasureRound[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sessionNet, setSessionNet] = useState(0);
  const [now, setNow] = useState(Date.now());

  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const sessionStart = useRef(Date.now());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ladderRef = useRef<ScrollView>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const bannerAnim = useRef(new Animated.Value(0)).current;
  const shovel = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;

  const S = Math.min(W - 12, 470);
  const siteW = S * 0.84;
  const cellW = siteW / COLS;
  const siteY = S * 0.3;
  const siteH = cellW * 4;
  const H = Math.round(siteY + siteH + S * 0.12);
  const siteX = (S - siteW) / 2;

  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const maxPayout = config?.maxPayout ?? 10000;
  const betLevels = useMemo(() => BET_LEVELS.filter((b) => b >= minStake && b <= maxStake), [minStake, maxStake]);
  const activeCrabs = round?.crabs ?? crabs;
  const ladder = useMemo(() => config?.modes.find((m) => m.crabs === activeCrabs)?.multipliers ?? ladderFor(activeCrabs), [config, activeCrabs]);
  const steps = MOUNDS - activeCrabs;
  const stake = round ? Number(round.stake) : bet;
  const treasures = round?.treasures ?? 0;
  const pending = round?.status === 'PENDING';
  const lost = round?.status === 'LOST';
  const won = round?.status === 'WON';
  const cashValue = pending && treasures > 0 ? Math.min(floor2(stake * Number(round!.multiplier)), maxPayout) : 0;
  const digs = round?.digs ?? [];
  const crabMounds = round?.crabMounds ?? [];
  // The treasure each safe dig turned up, by the order it was found.
  const itemAt = useMemo(() => {
    const m: Record<number, Item> = {};
    let n = 0;
    digs.forEach((d, i) => {
      if (lost && i === digs.length - 1) return;
      m[d] = ITEM_BY_FIND[Math.min(n++, ITEM_BY_FIND.length - 1)];
    });
    return m;
  }, [digs, lost]);

  useEffect(() => {
    if (!busyRef.current) setShownBalance(coins);
  }, [coins]);

  useEffect(() => {
    mountedRef.current = true;
    fetchTreasureConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => mountedRef.current && setToast('Could not load the game — check your connection.'));
    // Pick up a dig left unfinished.
    fetchTreasureCurrent()
      .then((r) => {
        if (!mountedRef.current || !r) return;
        setRound(r);
        setCrabs(r.crabs);
        setBet(Number(r.stake));
        setPhase('aim');
      })
      .catch(() => {});
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      mountedRef.current = false;
      clearInterval(clock);
      loop.stop();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [pulse]);

  // Keep the next rung of the ladder in view.
  useEffect(() => {
    ladderRef.current?.scrollTo({ x: Math.max(0, (treasures - 1) * 70), animated: true });
  }, [treasures, activeCrabs]);

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const flashBanner = useCallback(
    async (b: Banner, hold = 1000) => {
      setBanner(b);
      bannerAnim.setValue(0);
      await run(Animated.spring(bannerAnim, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }));
      await wait(hold);
      await run(Animated.timing(bannerAnim, { toValue: 0, duration: 180, useNativeDriver: true }));
      if (mountedRef.current) setBanner(null);
    },
    [bannerAnim],
  );

  const settle = useCallback(
    (payout: number) => {
      setShownBalance((b) => round2(b + payout));
      setSessionNet((n) => round2(n + payout));
      refreshWallet();
      if (panel === 'history')
        fetchTreasureHistory(30)
          .then((h) => mountedRef.current && setHistory(h))
          .catch(() => {});
    },
    [refreshWallet, panel],
  );

  const start = useCallback(async () => {
    if (busyRef.current || !config || pending) return;
    if (bet > shownBalance) {
      showToast('Insufficient balance');
      return;
    }
    busyRef.current = true;
    try {
      const r = await startTreasureRound(bet, crabs);
      if (!mountedRef.current) return;
      setRound(r);
      setShownBalance((b) => round2(b - bet));
      setSessionNet((n) => round2(n - bet));
      setPhase('aim');
    } catch (err) {
      showToast(errorMessage(err));
    } finally {
      busyRef.current = false;
    }
  }, [config, pending, bet, shownBalance, crabs, showToast]);

  const dig = useCallback(
    async (mound: number) => {
      if (busyRef.current || phase !== 'aim' || !round || round.status !== 'PENDING' || round.digs.includes(mound)) return;
      busyRef.current = true;
      setPhase('digging');
      setDiggingAt(mound);
      shovel.setValue(0);
      try {
        // Two quick strokes of the shovel while the server answers.
        const strokes = run(
          Animated.sequence([
            Animated.timing(shovel, { toValue: 1, duration: 170, easing: Easing.in(Easing.quad), useNativeDriver: true }),
            Animated.timing(shovel, { toValue: 0, duration: 130, useNativeDriver: true }),
            Animated.timing(shovel, { toValue: 1, duration: 170, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          ]),
        );
        const [res] = await Promise.all([digTreasureMound(round.id, mound), strokes]);
        if (!mountedRef.current) return;
        const r = res.round;
        setDiggingAt(null);
        setRound(r);
        if (res.crab) {
          await run(
            Animated.parallel([
              Animated.sequence([Animated.timing(flash, { toValue: 1, duration: 90, useNativeDriver: true }), Animated.timing(flash, { toValue: 0, duration: 450, useNativeDriver: true })]),
              Animated.sequence([10, -9, 7, -5, 3, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 55, useNativeDriver: true }))),
            ]),
          );
          setPhase('over');
          await flashBanner({ title: 'CRAB!', sub: 'Snapped! The treasure is lost', tone: 'lose' }, 1100);
          if (mountedRef.current) refreshWallet();
        } else {
          await wait(380);
          if (r.status === 'WON') {
            const payout = Number(r.payout);
            setPhase('over');
            await flashBanner({ title: r.treasures >= MOUNDS - r.crabs ? 'ISLAND CLEARED!' : 'MAX WIN!', sub: `${fmtX(Number(r.multiplier))} · ${money(payout)}`, tone: 'win' }, 1500);
            if (mountedRef.current) settle(payout);
          } else if (mountedRef.current) setPhase('aim');
        }
      } catch (err) {
        if (mountedRef.current) {
          setDiggingAt(null);
          showToast(errorMessage(err));
          // Re-sync with the server in case the dig went through.
          fetchTreasureCurrent()
            .then((cur) => {
              if (!mountedRef.current) return;
              setRound(cur);
              setPhase(cur ? 'aim' : 'idle');
              refreshWallet();
            })
            .catch(() => setPhase('aim'));
        }
      } finally {
        busyRef.current = false;
      }
    },
    [phase, round, shovel, flash, shake, flashBanner, settle, refreshWallet, showToast],
  );

  const cashOut = useCallback(async () => {
    if (busyRef.current || phase !== 'aim' || !round || round.status !== 'PENDING' || round.treasures <= 0) return;
    busyRef.current = true;
    try {
      const r = await cashOutTreasure(round.id);
      if (!mountedRef.current) return;
      setRound(r);
      setPhase('over');
      const payout = Number(r.payout);
      settle(payout);
      await flashBanner({ title: 'CASHED OUT', sub: `${fmtX(Number(r.multiplier))} · ${money(payout)}`, tone: 'win' }, 1200);
    } catch (err) {
      showToast(errorMessage(err));
    } finally {
      busyRef.current = false;
    }
  }, [phase, round, settle, flashBanner, showToast]);

  const stepBet = (dir: 1 | -1) => {
    if (pending || phase === 'digging') return;
    const idx = Math.max(0, betLevels.indexOf(bet));
    setBet(betLevels[Math.max(0, Math.min(betLevels.length - 1, idx + dir))] ?? bet);
  };

  const openHistory = () => {
    setPanel('history');
    setHistory(null);
    fetchTreasureHistory(30)
      .then((h) => mountedRef.current && setHistory(h))
      .catch(() => mountedRef.current && setHistory([]));
  };

  const minutes = Math.floor((now - sessionStart.current) / 60000);
  const seconds = Math.floor(((now - sessionStart.current) % 60000) / 1000);
  const canDig = phase === 'aim' && pending;
  const lastDig = digs[digs.length - 1];
  const prompt =
    phase === 'digging'
      ? 'DIGGING…'
      : canDig
        ? treasures === 0
          ? 'TAP A MOUND TO DIG'
          : `NEXT ${fmtX(ladder[treasures + 1] ?? 0)} · OR CASH OUT`
        : lost
          ? 'CRAB! — START A NEW DIG'
          : won
            ? `YOU WON ${money(Number(round!.payout))}`
            : 'CHOOSE CRABS · START DIGGING';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#0A3A4A', '#04161E']} style={StyleSheet.absoluteFill} />

      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={TEXT} />
          <MaterialCommunityIcons name="treasure-chest" size={18} color={GOLD} />
          <Text style={styles.title}>TREASURE DIG</Text>
        </Pressable>
        <View style={styles.balancePill}>
          <MaterialCommunityIcons name="wallet" size={15} color={GOLD} />
          <Text style={styles.balanceText}>{money(shownBalance)}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24, alignItems: 'center' }}>
        <Animated.View style={[styles.stage, { width: S, height: H, transform: [{ translateX: shake }] }]}>
          <Island S={S} H={H} siteY={siteY} siteH={siteH} />

          {/* Wooden sign: the find count and the multiplier */}
          <View style={[styles.sign, { top: 10 }]}>
            <Text style={styles.signTitle}>TREASURE DIG</Text>
            <Text style={styles.signSub}>
              {pending ? `${treasures}/${steps} FOUND · ${treasures ? fmtX(ladder[treasures]) : '—'}` : lost ? 'A CRAB GOT YOU' : won ? 'TREASURE BANKED' : `${activeCrabs} CRABS HIDDEN`}
            </Text>
          </View>

          {/* The dig site */}
          {Array.from({ length: MOUNDS }, (_, i) => {
            const col = i % COLS;
            const row = Math.floor(i / COLS);
            const dug = digs.includes(i);
            const isCrab = (lost && i === lastDig) || (!pending && crabMounds.includes(i));
            const revealedCrab = !pending && crabMounds.includes(i) && !dug;
            const item = itemAt[i];
            const fresh = i === lastDig && phase !== 'idle';
            return (
              <Pressable
                key={i}
                disabled={!canDig || dug}
                accessibilityLabel={`Dig mound ${i + 1}`}
                onPress={() => dig(i)}
                style={({ pressed }) => [
                  styles.cell,
                  { left: siteX + col * cellW, top: siteY + row * cellW, width: cellW, height: cellW },
                  pressed && canDig && !dug && { transform: [{ scale: 0.94 }] },
                ]}
              >
                <View style={revealedCrab ? { opacity: 0.55 } : undefined}>
                  <Mound size={cellW * 0.96} dug={dug || revealedCrab} />
                </View>
                {canDig && !dug && <Animated.View pointerEvents="none" style={[styles.digMark, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] }) }]} />}
                {(dug || revealedCrab) && (isCrab || item) && (
                  <View pointerEvents="none" style={[styles.find, revealedCrab && { opacity: 0.6 }]}>
                    {fresh ? (
                      <PopIn key={`p${i}`}>{isCrab ? <Crab size={cellW * 0.66} /> : <Treasure kind={item!} size={cellW * 0.62} />}</PopIn>
                    ) : isCrab ? (
                      <Crab size={cellW * 0.66} />
                    ) : (
                      <Treasure kind={item!} size={cellW * 0.62} />
                    )}
                  </View>
                )}
                {diggingAt === i && (
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.shovel,
                      {
                        transform: [
                          { rotate: shovel.interpolate({ inputRange: [0, 1], outputRange: ['-35deg', '10deg'] }) },
                          { translateY: shovel.interpolate({ inputRange: [0, 1], outputRange: [-12, 4] }) },
                        ],
                      },
                    ]}
                  >
                    <MaterialCommunityIcons name="shovel" size={cellW * 0.5} color="#5A3A1A" />
                  </Animated.View>
                )}
              </Pressable>
            );
          })}

          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: RED, opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] }) }]} />

          <View pointerEvents="none" style={[styles.prompt, { top: H - 32 }]}>
            <Text style={styles.promptText}>{prompt}</Text>
          </View>
        </Animated.View>

        {/* Multiplier ladder (scrolls; the next find stays in view) */}
        <ScrollView ref={ladderRef} horizontal showsHorizontalScrollIndicator={false} style={{ width: S, marginTop: 10 }} contentContainerStyle={{ gap: 5 }}>
          {Array.from({ length: steps }, (_, i) => {
            const n = i + 1;
            const reached = treasures >= n && (pending || won);
            const next = pending && treasures + 1 === n;
            return (
              <View key={n} style={[styles.rung, reached && styles.rungReached, next && styles.rungNext]}>
                <Text style={[styles.rungLabel, reached && { color: INK }]}>FIND {n}</Text>
                <Text style={[styles.rungMult, reached && { color: INK }]} numberOfLines={1} adjustsFontSizeToFit>
                  {fmtX(ladder[n] ?? 0)}
                </Text>
                <Text style={[styles.rungMoney, reached && { color: INK }]} numberOfLines={1} adjustsFontSizeToFit>
                  {money(Math.min(floor2(stake * (ladder[n] ?? 0)), maxPayout))}
                </Text>
              </View>
            );
          })}
        </ScrollView>

        {/* Crabs on the island */}
        <View style={[styles.modeRow, { width: S }]}>
          {MODES.map((m) => {
            const on = activeCrabs === m;
            const locked = pending || phase === 'digging';
            const first = (config?.modes.find((x) => x.crabs === m)?.multipliers ?? ladderFor(m))[1];
            return (
              <Pressable
                key={m}
                disabled={locked}
                onPress={() => setCrabs(m)}
                style={[styles.mode, on && { borderColor: MODE_COLOR[m], backgroundColor: 'rgba(255,255,255,0.08)' }, locked && !on && styles.dim]}
              >
                <Text style={[styles.modeName, { color: on ? MODE_COLOR[m] : '#D8E4E8' }]}>{MODE_NAME[m]}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
                  <Crab size={18} />
                  <Text style={styles.modeCount}>× {m}</Text>
                </View>
                <Text style={styles.modeSub}>first find {first.toFixed(2)}x</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Session (time played and net position, always on show) */}
        <View style={[styles.session, { width: S }]}>
          <MaterialCommunityIcons name="timer-outline" size={15} color="#D8E4E8" />
          <Text style={styles.sessionText}>
            Session {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </Text>
          <Text style={styles.sessionSep}>·</Text>
          <Text style={[styles.sessionText, { color: sessionNet > 0 ? GREEN : sessionNet < 0 ? '#FF9AA6' : '#D8E4E8' }]}>
            Net {sessionNet >= 0 ? '+' : '−'}
            {money(Math.abs(sessionNet))}
          </Text>
        </View>

        {/* Controls: no autoplay */}
        <View style={[styles.controls, { width: S }]}>
          <Pressable onPress={() => setPanel('info')} style={styles.sideBtn} hitSlop={6}>
            <MaterialCommunityIcons name="information-outline" size={20} color={GOLD} />
            <Text style={styles.sideText}>RULES</Text>
          </Pressable>
          <View style={styles.betBox}>
            <Text style={styles.betLabel}>BET</Text>
            <View style={styles.betRow}>
              <Pressable onPress={() => stepBet(-1)} disabled={pending} style={[styles.betBtn, pending && styles.dim]} hitSlop={6}>
                <MaterialCommunityIcons name="minus" size={18} color={INK} />
              </Pressable>
              <Text style={styles.betValue}>{money(pending ? stake : bet)}</Text>
              <Pressable onPress={() => stepBet(1)} disabled={pending} style={[styles.betBtn, pending && styles.dim]} hitSlop={6}>
                <MaterialCommunityIcons name="plus" size={18} color={INK} />
              </Pressable>
            </View>
          </View>
          {pending ? (
            <Pressable onPress={cashOut} disabled={treasures === 0 || phase !== 'aim'} style={({ pressed }) => [styles.mainWrap, pressed && { transform: [{ scale: 0.95 }] }]}>
              <LinearGradient colors={treasures === 0 || phase !== 'aim' ? ['#5A6A6A', '#2A3434'] : ['#7CFFB0', '#1AC860', '#0A7A3A']} style={styles.mainBtn}>
                <Text style={styles.mainSmall}>{treasures === 0 ? 'DIG A' : 'CASH OUT'}</Text>
                <Text style={styles.mainBig} numberOfLines={1} adjustsFontSizeToFit>
                  {treasures === 0 ? 'MOUND' : money(cashValue)}
                </Text>
              </LinearGradient>
            </Pressable>
          ) : (
            <Pressable onPress={start} disabled={!config || phase === 'digging'} style={({ pressed }) => [styles.mainWrap, pressed && { transform: [{ scale: 0.95 }] }]}>
              <Animated.View style={[styles.mainHalo, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.7] }) }]} />
              <LinearGradient colors={!config ? ['#5A6A6A', '#2A3434'] : ['#FFF4C8', GOLD, '#B87800']} style={styles.mainBtn}>
                <MaterialCommunityIcons name="shovel" size={24} color={INK} />
                <Text style={styles.mainSmall}>DIG</Text>
              </LinearGradient>
            </Pressable>
          )}
          <Pressable onPress={openHistory} style={styles.sideBtn} hitSlop={6}>
            <MaterialCommunityIcons name="history" size={20} color={GOLD} />
            <Text style={styles.sideText}>HISTORY</Text>
          </Pressable>
        </View>

        <GameInfoButton>
          RTP {config?.rtpPercent ?? 88}% at every cash-out point · bet {money(minStake)}–{money(maxStake)} · max {money(maxPayout)} per dig{'\n'}
          No autoplay · the crabs are placed by your provably-fair seeds when the dig starts
        </GameInfoButton>
      </ScrollView>

      {banner && (
        <Animated.View pointerEvents="none" style={[styles.banner, { opacity: bannerAnim, transform: [{ scale: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }]}>
          <LinearGradient
            colors={banner.tone === 'lose' ? ['#7A1A0A', '#2A0804'] : ['#FFF4C8', GOLD, '#B87800']}
            style={[styles.bannerInner, { borderColor: banner.tone === 'lose' ? RED : '#FFFFFF' }]}
          >
            {banner.tone === 'lose' ? <Crab size={52} /> : <Treasure kind="chest" size={52} />}
            <Text style={[styles.bannerText, banner.tone === 'win' && { color: INK }]}>{banner.title}</Text>
            {banner.sub ? <Text style={[styles.bannerSub, banner.tone === 'win' && { color: '#5A3A00' }]}>{banner.sub}</Text> : null}
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
              <Text style={styles.modalTitle}>{panel === 'info' ? 'HOW TO PLAY' : 'MY DIGS'}</Text>
              <Pressable onPress={() => setPanel(null)} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={22} color={TEXT} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 480 }}>{panel === 'info' ? <Rules bet={bet} config={config} /> : <History rounds={history} />}</ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Rules({ bet, config }: { bet: number; config: TreasureConfig | null }) {
  if (!config) return <Text style={styles.note}>Loading…</Text>;
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.note}>
        The island has {config.mounds} sand mounds. Choose how many hide a crab (3, 5 or 8) and your bet, then DIG. Tap a mound to dig it: treasure raises your multiplier; a crab snaps and the bet is
        lost.
      </Text>
      <Text style={styles.note}>
        Cash out after any treasure. Dig up every treasure and the island is cleared and pays out automatically. The crabs are placed by your seeds when the dig starts, and every mound has the same
        chance. Once the round ends the crabs are shown. The kind of treasure you see is only decoration; the multiplier is what pays.
      </Text>
      <Text style={styles.section}>MULTIPLIERS (at {money(bet)})</Text>
      {config.modes.map((m) => (
        <View key={m.crabs} style={{ marginTop: 2 }}>
          <Text style={[styles.tName, { color: MODE_COLOR[m.crabs] }]}>
            {MODE_NAME[m.crabs]} · {m.crabs} crabs
          </Text>
          <View style={styles.tWrap}>
            {m.multipliers.slice(1).map((x, i) => (
              <View key={i} style={styles.tCellBox}>
                <Text style={styles.tHead}>{i + 1}</Text>
                <Text style={styles.tCell}>{fmtX(x)}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
      <Text style={styles.section}>GAME INFO</Text>
      <Text style={styles.note}>
        Return to player {config.rtpPercent}% whenever you cash out. A dig pays at most {money(config.maxPayout)}; reaching it settles the round. No autoplay. Every round is decided by your
        provably-fair seeds (server seed hash, client seed and nonce in each round).
      </Text>
    </View>
  );
}

function History({ rounds }: { rounds: TreasureRound[] | null }) {
  if (rounds === null) return <Text style={styles.note}>Loading…</Text>;
  if (rounds.length === 0) return <Text style={styles.note}>No digs yet.</Text>;
  return (
    <View>
      {rounds.map((r) => {
        const payout = Number(r.payout);
        const d = new Date(r.createdAt);
        return (
          <View key={r.id} style={styles.histRow}>
            <Text style={styles.histTime}>{d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            <Text style={styles.histStake}>{money(Number(r.stake))}</Text>
            <Text style={[styles.histMode, { color: MODE_COLOR[r.crabs] }]}>{r.crabs} CRABS</Text>
            <Text style={styles.histFinds}>
              {r.treasures} found{r.status === 'LOST' ? ' · crab' : ''}
            </Text>
            <Text style={[styles.histWin, { color: payout > 0 ? GREEN : '#8A8FA8' }]}>{payout > 0 ? `+${money(payout)}` : '—'}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#04161E' },
  topBar: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  title: { color: TEXT, fontSize: 18, fontWeight: '900', letterSpacing: 2, fontFamily: 'serif' },
  balancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,214,107,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,214,107,0.5)',
  },
  balanceText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  stage: { borderRadius: 18, overflow: 'hidden', borderWidth: 2.5, borderColor: '#8A5A2A', marginTop: 4 },
  sign: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: WOOD,
    borderWidth: 2.5,
    borderColor: '#3A1E08',
  },
  signTitle: { color: GOLD, fontSize: 20, fontWeight: '900', letterSpacing: 3, fontFamily: 'serif', textShadowColor: '#000', textShadowRadius: 4 },
  signSub: { color: TEXT, fontSize: 10.5, fontWeight: '900', letterSpacing: 1.2 },
  cell: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  digMark: { position: 'absolute', width: '30%', height: '30%', borderRadius: 999, borderWidth: 2, borderColor: '#B8302A', borderStyle: 'dashed' },
  find: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  shovel: { position: 'absolute', top: '-8%', right: '4%' },
  prompt: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(42,20,4,0.75)' },
  promptText: { color: TEXT, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  rung: { width: 65, alignItems: 'center', paddingVertical: 5, borderRadius: 10, borderWidth: 1.5, borderColor: '#1E4A5A', backgroundColor: 'rgba(4,30,40,0.9)' },
  rungReached: { backgroundColor: GOLD, borderColor: GOLD },
  rungNext: { borderColor: GREEN },
  rungLabel: { color: '#8AB0BC', fontSize: 8.5, fontWeight: '900', letterSpacing: 1 },
  rungMult: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  rungMoney: { color: GOLD, fontSize: 9.5, fontWeight: '800' },
  modeRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  mode: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 10, borderWidth: 1.5, borderColor: '#1E4A5A' },
  modeName: { fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  modeCount: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  modeSub: { color: '#8AB0BC', fontSize: 9, fontWeight: '700', marginTop: 1 },
  session: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)' },
  sessionText: { color: '#D8E4E8', fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sessionSep: { color: '#5A7078', fontSize: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingHorizontal: 4 },
  sideBtn: { alignItems: 'center', gap: 2, width: 58 },
  sideText: { color: GOLD, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  betBox: { alignItems: 'center', gap: 4 },
  betLabel: { color: '#A8C0C8', fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  betRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(4,30,40,0.9)',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#1E4A5A',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  betBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: TEXT, alignItems: 'center', justifyContent: 'center' },
  betValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', minWidth: 70, textAlign: 'center' },
  dim: { opacity: 0.4 },
  mainWrap: { width: 92, height: 92, alignItems: 'center', justifyContent: 'center' },
  mainHalo: { position: 'absolute', width: 92, height: 92, borderRadius: 46, backgroundColor: GOLD },
  mainBtn: { width: 82, height: 82, borderRadius: 41, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF', paddingHorizontal: 6 },
  mainSmall: { color: INK, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  mainBig: { color: INK, fontSize: 15, fontWeight: '900' },
  banner: { position: 'absolute', top: '47%', alignSelf: 'center' },
  bannerInner: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 16, borderWidth: 3, alignItems: 'center' },
  bannerText: { color: '#FFE0D4', fontSize: 30, fontWeight: '900', letterSpacing: 2, fontFamily: 'serif' },
  bannerSub: { color: '#FFB0A0', fontSize: 13, fontWeight: '900', marginTop: 2, letterSpacing: 1 },
  toast: { position: 'absolute', bottom: 120, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14 },
  toastText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  modalBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  modalCard: { backgroundColor: '#0A2A34', borderRadius: 16, borderWidth: 2, borderColor: '#8A5A2A', padding: 14 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { color: TEXT, fontSize: 16, fontWeight: '900', letterSpacing: 2, fontFamily: 'serif' },
  note: { color: '#D8E4E8', fontSize: 12, lineHeight: 17 },
  section: { color: GOLD, fontSize: 12, fontWeight: '900', letterSpacing: 2, marginTop: 4, fontFamily: 'serif' },
  tName: { fontSize: 11, fontWeight: '900' },
  tWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.12)' },
  tCellBox: { width: 58, alignItems: 'center', paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.05)' },
  tHead: { color: '#8AB0BC', fontSize: 9, fontWeight: '800' },
  tCell: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)', gap: 6 },
  histTime: { color: '#98B0B8', fontSize: 11, width: 64 },
  histStake: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', width: 58 },
  histMode: { fontSize: 9.5, fontWeight: '900', width: 52 },
  histFinds: { color: '#D8E4E8', fontSize: 11, fontWeight: '700', flex: 1 },
  histWin: { fontSize: 12, fontWeight: '900' },
});
