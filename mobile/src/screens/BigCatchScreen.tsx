import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient as SvgLinearGradient, Path, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { ApiClientError } from '../api/client';
import {
  AviatorHistoryEntry,
  AviatorRoundView,
  BigCatchBet,
  BigCatchConfig,
  BigCatchMyBet,
  cashOutBigCatchBet,
  fetchBigCatchConfig,
  fetchBigCatchCurrentRound,
  fetchBigCatchHistory,
  fetchBigCatchMyBets,
  placeBigCatchBet,
} from '../api/backend';
import { useGameState } from '../state/GameStateContext';
import GameInfoButton from '../components/GameInfoButton';

const GOLD = '#FFD66B';
const AQUA = '#3CF0D0';
const DEFAULT_GROWTH = Math.log(2) / 5;
const STAKE_STEPS = [10, 20, 50, 100, 200, 500];
const QUICK = [10, 50, 100, 500];
const AUTO_STEPS = [1.2, 1.5, 2, 3, 5, 10, 20, 50];
const TOAST_MS = 1800;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

function multColor(m: number): string {
  if (m < 2) return '#4FC3FF';
  if (m < 10) return AQUA;
  return GOLD;
}

/** Mixes two #RRGGBB colours, t = 0 → a, 1 → b. */
function mix(a: string, b: string, t: number): string {
  const p = (c: string, i: number) => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
  const k = Math.max(0, Math.min(1, t));
  return `#${[0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * k).toString(16).padStart(2, '0')).join('')}`;
}

function seeded(seed: number) {
  let x = seed;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}

// ---------- scene ----------
// A bass takes the hook under the boat and dives, pulling the line down
// into the deep. The camera follows it: rocks and weed stream up past the
// sides, the water darkens, and glowing deep-sea creatures drift by on a
// long run. When the round ends the line snaps and the bass darts away.

/** The bass in profile, facing right, hook in its jaw. `sway` (−1…1) swings the tail. */
function Bass({ size, sway, hooked }: { size: number; sway: number; hooked: boolean }) {
  const u = useId().replace(/:/g, '');
  const t = sway * 7;
  return (
    <Svg width={size} height={size * 0.62} viewBox="0 0 100 62">
      <Defs>
        <SvgLinearGradient id={`bcBody${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#2E5A1A" />
          <Stop offset="0.45" stopColor="#7AA83A" />
          <Stop offset="0.75" stopColor="#D8E4A0" />
          <Stop offset="1" stopColor="#F4F2DC" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`bcFin${u}`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#4A7A22" />
          <Stop offset="1" stopColor="#8AB848" />
        </SvgLinearGradient>
      </Defs>
      {/* Tail */}
      <Path d={`M22 31 L ${4} ${10 + t} C 8 ${24 + t / 2}, 8 ${38 + t / 2}, 4 ${52 + t} Z`} fill={`url(#bcFin${u})`} stroke="#2A4A12" strokeWidth={1.2} />
      {/* Dorsal fins */}
      <Path d="M36 14 L 40 4 L 46 8 L 50 2 L 56 7 L 60 3 L 64 12 Z" fill={`url(#bcFin${u})`} stroke="#2A4A12" strokeWidth={1} />
      {/* Body */}
      <Path d="M20 31 C 24 14, 50 8, 74 13 C 86 16, 94 22, 96 28 L 88 31 L 96 35 C 92 44, 80 50, 62 50 C 42 51, 24 46, 20 31 Z" fill={`url(#bcBody${u})`} stroke="#22400E" strokeWidth={1.4} />
      {/* Lateral blotches */}
      {[30, 40, 50, 60, 70].map((x, i) => (
        <Ellipse key={x} cx={x} cy={28 + (i % 2)} rx={4.5} ry={3} fill="#1E3A0C" opacity={0.55} />
      ))}
      {/* Gill, pectoral fin, eye */}
      <Path d="M76 18 C 72 26, 72 36, 78 44" stroke="#22400E" strokeWidth={1.4} fill="none" />
      <Path d="M66 36 C 60 40, 58 46, 62 48 C 66 46, 68 42, 68 37 Z" fill={`url(#bcFin${u})`} opacity={0.9} />
      <Circle cx={83} cy={22} r={4.2} fill="#F6D03A" stroke="#22400E" strokeWidth={1} />
      <Circle cx={84} cy={22} r={2.2} fill="#0A0A0A" />
      <Circle cx={84.8} cy={21} r={0.8} fill="#FFFFFF" />
      {/* Open jaw */}
      <Path d="M88 31 L 99 26 L 97 31 L 99 37 Z" fill="#8A2A20" />
      {hooked && (
        <G>
          <Path d="M96 26 C 96 20, 100 20, 100 24" stroke="#C8D0DC" strokeWidth={1.6} fill="none" />
          <Circle cx={96} cy={27} r={1.4} fill="#C8D0DC" />
        </G>
      )}
    </Svg>
  );
}

/** One screen-high tile of rocks and weed down both sides; tiles stack and scroll up as the bass dives. */
const ReefTile = memo(function ReefTile({ w, h, seed, deep }: { w: number; h: number; seed: number; deep: number }) {
  const parts = useMemo(() => {
    const rnd = seeded(seed);
    const rocks: { x: number; y: number; rx: number; ry: number; left: boolean }[] = [];
    const weed: { x: number; y: number; len: number; left: boolean }[] = [];
    for (let i = 0; i < 6; i++) {
      const left = i % 2 === 0;
      const y = ((i + rnd() * 0.6) / 6) * h;
      rocks.push({ x: left ? rnd() * w * 0.06 : w - rnd() * w * 0.06, y, rx: w * (0.07 + rnd() * 0.06), ry: h * (0.05 + rnd() * 0.05), left });
      weed.push({ x: left ? w * (0.04 + rnd() * 0.08) : w * (0.88 + rnd() * 0.08), y: y + h * 0.04, len: h * (0.1 + rnd() * 0.12), left });
    }
    return { rocks, weed };
  }, [w, h, seed]);
  const rock = mix('#3A5A6A', '#0E1A2A', deep);
  const kelp = mix('#2E8A4A', '#0E3A2A', deep);
  return (
    <Svg width={w} height={h}>
      {parts.weed.map((s, i) => (
        <Path key={`w${i}`} d={`M${s.x} ${s.y} C ${s.x + 8} ${s.y - s.len * 0.3}, ${s.x - 8} ${s.y - s.len * 0.6}, ${s.x + 3} ${s.y - s.len}`} stroke={kelp} strokeWidth={4} fill="none" strokeLinecap="round" />
      ))}
      {parts.rocks.map((r, i) => (
        <Ellipse key={`r${i}`} cx={r.x} cy={r.y} rx={r.rx} ry={r.ry} fill={rock} />
      ))}
    </Svg>
  );
});

/** The surface seen from just below: boat hull, light rays and the dusk sky above. */
const Surface = memo(function Surface({ w, h }: { w: number; h: number }) {
  const u = useId().replace(/:/g, '');
  const water = h * 0.42;
  return (
    <Svg width={w} height={h}>
      <Defs>
        <SvgLinearGradient id={`bcSky${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#2A1A50" />
          <Stop offset="0.7" stopColor="#E8784A" />
          <Stop offset="1" stopColor="#FFC870" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`bcRay${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.35} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </SvgLinearGradient>
        <SvgLinearGradient id={`bcHull${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#B83A2A" />
          <Stop offset="1" stopColor="#5A140C" />
        </SvgLinearGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={water} fill={`url(#bcSky${u})`} />
      <Circle cx={w * 0.2} cy={water * 0.78} r={w * 0.06} fill="#FFE3A0" />
      {/* Boat on the surface, rod bent over the side */}
      <Path d={`M${w * 0.34} ${water - 10} L ${w * 0.66} ${water - 10} L ${w * 0.62} ${water + 10} L ${w * 0.38} ${water + 10} Z`} fill={`url(#bcHull${u})`} stroke="#2A0804" strokeWidth={1.5} />
      <Rect x={w * 0.46} y={water - 26} width={w * 0.03} height={16} rx={3} fill="#2A2A3A" />
      <Circle cx={w * 0.475} cy={water - 30} r={5} fill="#E8B48A" />
      <Path d={`M${w * 0.49} ${water - 20} Q ${w * 0.6} ${water - 44} ${w * 0.7} ${water - 30}`} stroke="#3A2A1A" strokeWidth={2} fill="none" />
      {/* Water line and the light shafts below */}
      <Rect x={0} y={water} width={w} height={h - water} fill="#1A8CB0" opacity={0.0} />
      <Path d={`M0 ${water} Q ${w * 0.25} ${water - 4} ${w * 0.5} ${water} T ${w} ${water}`} stroke="#BFF4FF" strokeWidth={2} fill="none" opacity={0.8} />
      {[0.18, 0.42, 0.66, 0.86].map((x) => (
        <Polygon key={x} points={`${w * x - 8},${water} ${w * x + 8},${water} ${w * x + 40},${h} ${w * x - 10},${h}`} fill={`url(#bcRay${u})`} />
      ))}
    </Svg>
  );
});

/** A glowing jellyfish, its bell pulsing with `p` (0…1). */
function Jelly({ size, p, color }: { size: number; p: number; color: string }) {
  const u = useId().replace(/:/g, '');
  const squeeze = 1 - p * 0.15;
  return (
    <Svg width={size} height={size * 1.4} viewBox="0 0 50 70">
      <Defs>
        <RadialGradient id={`bcJ${u}`} cx="50%" cy="40%" r="60%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.9} />
          <Stop offset="1" stopColor={color} stopOpacity={0.5} />
        </RadialGradient>
      </Defs>
      <Circle cx={25} cy={18} r={22} fill={color} opacity={0.18} />
      <Path d={`M${25 - 18 * squeeze} 24 C ${25 - 18 * squeeze} 4, ${25 + 18 * squeeze} 4, ${25 + 18 * squeeze} 24 Z`} fill={`url(#bcJ${u})`} />
      {[-10, -4, 2, 8, 14].map((x, i) => (
        <Path key={x} d={`M${21 + x * 0.6} 24 C ${19 + x * 0.6 + (i % 2 ? 4 : -4) * p} 38, ${23 + x * 0.6} 50, ${21 + x * 0.6 + (i % 2 ? -3 : 3)} 66`} stroke={color} strokeWidth={1.4} fill="none" opacity={0.75} />
      ))}
    </Svg>
  );
}

/** An anglerfish lurking in the dark, its lure glowing. */
function Angler({ size, glow }: { size: number; glow: number }) {
  return (
    <Svg width={size} height={size * 0.7} viewBox="0 0 100 70">
      <Circle cx={86} cy={10} r={12 + glow * 6} fill="#9AFFE8" opacity={0.25} />
      <Circle cx={86} cy={10} r={4} fill="#E8FFF8" />
      <Path d="M70 32 C 76 16, 82 10, 86 10" stroke="#1A2A3A" strokeWidth={1.6} fill="none" />
      <Path d="M10 36 C 14 18, 44 12, 70 24 C 80 30, 82 44, 70 52 C 48 64, 18 58, 10 36 Z" fill="#101A26" stroke="#2A3A4A" strokeWidth={1.2} />
      <Path d="M10 36 L 0 24 L 2 48 Z" fill="#101A26" />
      <Circle cx={60} cy={32} r={3} fill="#9AFFE8" opacity={0.8} />
      <Path d="M58 46 L 62 40 L 66 46 L 70 40 L 74 46" stroke="#D8E8F0" strokeWidth={1.2} fill="none" />
    </Svg>
  );
}

/** Lobby tile: a bass leaping out of the lake at sunset with the line taut. */
export function BigCatchTileArt({ size }: { size: number }) {
  const u = useId().replace(/:/g, '');
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={size} height={size}>
        <Defs>
          <SvgLinearGradient id={`bcTile${u}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#2A1A50" />
            <Stop offset="0.5" stopColor="#E8784A" />
            <Stop offset="0.56" stopColor="#1A8CB0" />
            <Stop offset="1" stopColor="#03182A" />
          </SvgLinearGradient>
        </Defs>
        <Rect x={0} y={0} width={size} height={size} fill={`url(#bcTile${u})`} />
        <Circle cx={size * 0.78} cy={size * 0.4} r={size * 0.08} fill="#FFE3A0" />
        <Line x1={size * 0.08} y1={0} x2={size * 0.62} y2={size * 0.34} stroke="#E6EEF8" strokeWidth={1.2} />
        {[0.3, 0.5, 0.7].map((x) => (
          <Circle key={x} cx={size * x} cy={size * 0.62} r={size * 0.02} fill="#BFF4FF" opacity={0.7} />
        ))}
      </Svg>
      <View style={{ position: 'absolute', left: size * 0.22, top: size * 0.2, transform: [{ rotate: '-28deg' }] }}>
        <Bass size={size * 0.62} sway={0.6} hooked />
      </View>
    </View>
  );
}

// ---------- bet panel ----------

type PanelState = {
  amount: number;
  autoOn: boolean;
  autoAt: number;
  bet: BigCatchBet | null;
  queued: boolean;
  /** Multiplier the Half Reel was taken at, and what it paid. */
  halfAt: number | null;
  halfPaid: number;
  cashedAt: number | null;
  busy: boolean;
};

function initialPanel(amount: number): PanelState {
  return { amount, autoOn: false, autoAt: 2, bet: null, queued: false, halfAt: null, halfPaid: 0, cashedAt: null, busy: false };
}

// ---------- screen ----------

export default function BigCatchScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<BigCatchConfig | null>(null);
  const [view, setView] = useState<AviatorRoundView | null>(null);
  const [history, setHistory] = useState<AviatorHistoryEntry[]>([]);
  const [myBets, setMyBets] = useState<BigCatchMyBet[]>([]);
  const [panels, setPanels] = useState<[PanelState, PanelState]>([initialPanel(10), initialPanel(20)]);
  const [toast, setToast] = useState<{ text: string; good: boolean } | null>(null);
  const [, setFrame] = useState(0);

  const offsetRef = useRef(0);
  const mountedRef = useRef(true);
  const panelsRef = useRef(panels);
  panelsRef.current = panels;
  const periodRef = useRef<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** When this client saw the line snap; drives the snap animation. */
  const crashSeenRef = useRef(0);

  const growth = config?.growthRate ?? DEFAULT_GROWTH;
  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const minAuto = config?.minAutoCashout ?? 1.01;

  const showToast = useCallback((text: string, good = false) => {
    setToast({ text, good });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const setPanel = useCallback((i: 0 | 1, patch: Partial<PanelState>) => {
    setPanels((p) => {
      const next = [...p] as [PanelState, PanelState];
      next[i] = { ...next[i], ...patch };
      return next;
    });
  }, []);

  const loadLists = useCallback(() => {
    fetchBigCatchHistory(30)
      .then((h) => mountedRef.current && setHistory(h))
      .catch(() => {});
    fetchBigCatchMyBets()
      .then((b) => mountedRef.current && setMyBets(b.slice(0, 15)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchBigCatchConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => {});
    loadLists();
    return () => {
      mountedRef.current = false;
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [loadLists]);

  // Round polling, quicker while the line is out.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;
    const loop = async () => {
      let delay = 700;
      try {
        const sentAt = Date.now();
        const v = await fetchBigCatchCurrentRound();
        const receivedAt = Date.now();
        if (!alive) return;
        if (v.serverTime) {
          const measured = new Date(v.serverTime).getTime() - (sentAt + receivedAt) / 2;
          offsetRef.current = offsetRef.current === 0 ? measured : offsetRef.current * 0.7 + measured * 0.3;
        }
        setView(v);
        if (v.phase === 'FLYING') delay = 350;
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
  }, []);

  const srvNow = Date.now() + offsetRef.current;
  const flyStart = view ? new Date(view.flyStartTime).getTime() : 0;
  const localPhase = !view ? 'BETTING' : view.phase === 'CRASHED' ? 'CRASHED' : srvNow < flyStart ? 'BETTING' : 'FLYING';
  const elapsed = Math.max(0, (srvNow - flyStart) / 1000);
  const liveMult = localPhase === 'CRASHED' ? view?.crashMultiplier ?? 1 : localPhase === 'FLYING' ? round2(Math.exp(growth * elapsed)) : 1;

  // Smooth frames while the bass runs or the countdown ticks.
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      if (t - last > 33) {
        last = t;
        setFrame((f) => f + 1);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // New round: clear last round's bets and place any queued ones.
  useEffect(() => {
    if (!view) return;
    if (periodRef.current === view.periodNumber) return;
    const first = periodRef.current === null;
    periodRef.current = view.periodNumber;
    if (first) return;
    loadLists();
    refreshWallet();
    panelsRef.current.forEach((p, i) => {
      setPanel(i as 0 | 1, { bet: null, cashedAt: null, halfAt: null, halfPaid: 0 });
      if (p.queued && view.phase === 'BETTING') {
        setPanel(i as 0 | 1, { queued: false });
        placeBet(i as 0 | 1, true);
      }
    });
    // placeBet is stable enough for this once-per-round effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.periodNumber]);

  // Snapped: refresh wallet and lists.
  const crashedPeriod = view?.phase === 'CRASHED' ? view.periodNumber : null;
  useEffect(() => {
    if (!crashedPeriod) return;
    crashSeenRef.current = Date.now();
    setTimeout(() => {
      if (!mountedRef.current) return;
      refreshWallet();
      loadLists();
    }, 600);
  }, [crashedPeriod, refreshWallet, loadLists]);

  const placeBet = useCallback(
    async (i: 0 | 1, fromQueue = false) => {
      const p = panelsRef.current[i];
      if (p.busy || (p.bet && !fromQueue)) return;
      if (p.amount > coins && !fromQueue) return showToast('Insufficient balance');
      setPanel(i, { busy: true });
      try {
        const bet = await placeBigCatchBet(p.amount, p.autoOn ? p.autoAt : undefined);
        if (!mountedRef.current) return;
        setPanel(i, { bet, busy: false });
        refreshWallet();
      } catch (err) {
        if (!mountedRef.current) return;
        setPanel(i, { busy: false });
        showToast(errorMessage(err));
      }
    },
    [coins, refreshWallet, setPanel, showToast]
  );

  const cashOut = useCallback(
    async (i: 0 | 1, half = false) => {
      const p = panelsRef.current[i];
      if (!p.bet || p.busy || p.cashedAt) return;
      if (half && p.halfAt) return;
      setPanel(i, { busy: true });
      try {
        const res = await cashOutBigCatchBet(p.bet.id, half);
        if (!mountedRef.current) return;
        if (res.half) {
          setPanel(i, { busy: false, halfAt: res.multiplier, halfPaid: res.payout });
          showToast(`½ reeled in: +₹${res.payout.toFixed(2)} @ ${res.multiplier.toFixed(2)}x`, true);
        } else {
          setPanel(i, { busy: false, cashedAt: res.multiplier });
          showToast(`+₹${res.payout.toFixed(2)} @ ${res.multiplier.toFixed(2)}x`, true);
        }
        refreshWallet();
      } catch (err) {
        if (!mountedRef.current) return;
        setPanel(i, { busy: false });
        showToast(errorMessage(err));
      }
    },
    [refreshWallet, setPanel, showToast]
  );

  // Auto cash-out: once the line passes a panel's target, cash out the
  // rest (the server pays exactly the target).
  useEffect(() => {
    if (localPhase !== 'FLYING') return;
    panels.forEach((p, i) => {
      if (p.bet && !p.cashedAt && !p.busy && p.bet.autoCashoutAt && liveMult >= Number(p.bet.autoCashoutAt)) cashOut(i as 0 | 1);
    });
  });

  const onMain = (i: 0 | 1) => {
    const p = panels[i];
    if (p.bet && localPhase === 'FLYING' && !p.cashedAt) return cashOut(i);
    // A live bet in this round blocks a new one; once it is cashed out or
    // the round has crashed, a tap queues a bet for the next round.
    if (p.bet && !p.cashedAt && localPhase !== 'CRASHED') return;
    if (p.queued) return setPanel(i, { queued: false });
    if (localPhase === 'BETTING') return placeBet(i);
    setPanel(i, { queued: true });
  };

  const stepStake = (i: 0 | 1, dir: 1 | -1) => {
    const steps = STAKE_STEPS.filter((v) => v >= minStake && v <= maxStake);
    const idx = Math.max(0, steps.indexOf(panels[i].amount));
    setPanel(i, { amount: steps[Math.max(0, Math.min(steps.length - 1, idx + dir))] ?? panels[i].amount });
  };
  const stepAuto = (i: 0 | 1, dir: 1 | -1) => {
    const steps = AUTO_STEPS.filter((v) => v >= minAuto);
    const idx = Math.max(0, steps.indexOf(panels[i].autoAt));
    setPanel(i, { autoAt: steps[Math.max(0, Math.min(steps.length - 1, idx + dir))] ?? panels[i].autoAt });
  };

  // ---- scene geometry ----
  const SW = W - 20;
  const SH = Math.min(SW * 0.85, 360);
  const crashed = localPhase === 'CRASHED';
  const flightS = localPhase === 'BETTING' ? 0 : crashed && view?.crashMultiplier ? Math.log(view.crashMultiplier) / growth : elapsed;
  const snapS = crashed && crashSeenRef.current ? (Date.now() - crashSeenRef.current) / 1000 : 0;
  // How far the camera has dived, in px: faster the longer the run.
  const dive = SH * (0.8 * flightS + 0.06 * flightS * flightS);
  const deep = Math.min(1, flightS / 22);
  const nearOff = (dive * 0.9) % SH;
  const farOff = (dive * 0.4) % SH;
  const surfaceH = SH * 0.5;
  const surfaceY = -dive * 1.3;
  const waterTop = mix('#1A8CB0', '#041228', deep);
  const waterBottom = mix('#0A4A70', '#01040C', deep);
  // The bass: circles the bait while bets go in, strikes at the cast, then dives and holds the camera's centre.
  const fishW = SW * 0.42;
  const fishH = fishW * 0.62;
  const LIFT_S = 1.2;
  const lift = Math.min(1, flightS / LIFT_S);
  const ease = lift * lift * (3 - 2 * lift);
  const circle = localPhase === 'BETTING' ? srvNow / 900 : 0;
  const startX = SW * 0.5 + Math.sin(circle) * SW * 0.08 - fishW / 2;
  const startY = SH * 0.66 + Math.cos(circle * 1.3) * SH * 0.02 - fishH / 2;
  const hover = localPhase === 'FLYING' && lift >= 1 ? Math.sin(srvNow / 420) : 0;
  const cruiseX = SW * 0.3 + hover * SW * 0.02;
  const cruiseY = SH * 0.5 + hover * SH * 0.02;
  let fishX = startX + (cruiseX - startX) * ease;
  let fishY = startY + (cruiseY - startY) * ease;
  if (crashed) {
    // The line has gone: the bass bolts off to the right and down.
    fishX += snapS * snapS * SW * 1.4;
    fishY += snapS * SH * 0.25;
  }
  const sway = Math.sin(srvNow / (localPhase === 'FLYING' ? 90 : 220));
  const fishTilt = localPhase === 'BETTING' ? Math.sin(circle) * 6 : crashed ? 12 : 18 + hover * 4;
  // The line runs from the hook in the bass's jaw up to the rod above.
  const mouthX = fishX + fishW * 0.99;
  const mouthY = fishY + fishH * 0.42 + fishW * Math.sin((fishTilt * Math.PI) / 180) * 0.45;
  const rodX = SW * 0.7;
  const rodY = surfaceY + surfaceH * 0.42 - 30;
  const lineTopY = Math.max(-10, rodY);
  const lineTopX = rodY > -10 ? rodX : SW * 0.62;
  const ready = localPhase === 'BETTING' && view && flyStart - srvNow < 1500;
  const betLeft = localPhase === 'BETTING' ? Math.max(0, (flyStart - srvNow) / 1000) : 0;
  const betTotal = config?.bettingDurationSeconds ?? 6;
  const depthM = Math.round(4 + dive / 6);
  const bubbles = useMemo(() => {
    const rnd = seeded(97);
    return Array.from({ length: 14 }, () => ({ x: rnd(), phase: rnd(), r: 1.5 + rnd() * 3, speed: 0.6 + rnd() * 0.8 }));
  }, []);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#04203A', '#010A14']} style={StyleSheet.absoluteFill} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color="#FFFFFF" />
          <MaterialCommunityIcons name="fish" size={22} color={AQUA} />
          <Text style={styles.title}>BIG CATCH</Text>
        </Pressable>
        <View style={styles.topRight}>
          <View style={styles.balancePill}>
            <MaterialCommunityIcons name="wallet" size={15} color={GOLD} />
            <Text style={styles.balanceText}>₹{coins.toFixed(2)}</Text>
          </View>
          <Pressable onPress={() => navigation.navigate('Deposit')} style={styles.depositBtn}>
            <MaterialCommunityIcons name="plus" size={18} color="#1A1200" />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
        {/* Recent results */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.histRow}>
          {history.map((h) => {
            const m = Number(h.crashMultiplier);
            return (
              <View key={h.periodNumber} style={[styles.histChip, { borderColor: multColor(m) }]}>
                <Text style={[styles.histText, { color: multColor(m) }]}>{m.toFixed(2)}x</Text>
              </View>
            );
          })}
        </ScrollView>

        {/* Underwater scene */}
        <View style={[styles.scene, { width: SW, height: SH }]}>
          <LinearGradient colors={[waterTop, waterBottom]} style={StyleSheet.absoluteFill} />
          {/* Reef down both sides, far and near, each two tiles stacked so they loop */}
          {[
            { off: farOff, seed: 13, k: 0.55 },
            { off: nearOff, seed: 29, k: 1 },
          ].map((L) => (
            <View key={L.seed} pointerEvents="none" style={[styles.reefCol, { height: SH * 2, top: -L.off, opacity: L.k }]}>
              <ReefTile w={SW} h={SH} seed={L.seed} deep={deep} />
              <ReefTile w={SW} h={SH} seed={L.seed} deep={deep} />
            </View>
          ))}
          {surfaceY + surfaceH > 0 && (
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: surfaceY }}>
              <Surface w={SW} h={surfaceH} />
            </View>
          )}
          {/* Deep-water visitors on a long run */}
          {flightS > 7 && (
            <View pointerEvents="none" style={{ position: 'absolute', left: SW * 0.74, top: SH * 1.1 - ((dive * 0.35) % (SH * 1.6)) }}>
              <Jelly size={SW * 0.12} p={(Math.sin(srvNow / 300) + 1) / 2} color="#FF7AE0" />
            </View>
          )}
          {flightS > 11 && (
            <View pointerEvents="none" style={{ position: 'absolute', left: SW * 0.08, top: SH * 1.2 - ((dive * 0.28 + SH * 0.7) % (SH * 1.7)) }}>
              <Jelly size={SW * 0.09} p={(Math.sin(srvNow / 260 + 1) + 1) / 2} color="#7AD8FF" />
            </View>
          )}
          {flightS > 15 && (
            <View pointerEvents="none" style={{ position: 'absolute', left: SW * 0.6, top: SH * 1.15 - ((dive * 0.22 + SH * 0.3) % (SH * 1.8)) }}>
              <Angler size={SW * 0.26} glow={(Math.sin(srvNow / 400) + 1) / 2} />
            </View>
          )}
          {/* Bubbles rising */}
          <Svg width={SW} height={SH} style={StyleSheet.absoluteFill} pointerEvents="none">
            {bubbles.map((b, i) => {
              const y = SH - (((srvNow / 1000) * b.speed * 0.25 + b.phase + dive / SH) % 1) * SH * 1.1;
              return <Circle key={i} cx={b.x * SW + Math.sin(srvNow / 500 + i) * 4} cy={y} r={b.r} fill="none" stroke="#CFF6FF" strokeOpacity={0.45} strokeWidth={1} />;
            })}
          </Svg>

          {/* The line: taut from rod to hook, or snapped and curling away */}
          <Svg width={SW} height={SH} style={StyleSheet.absoluteFill} pointerEvents="none">
            {!crashed ? (
              <Path d={`M${lineTopX} ${lineTopY} Q ${(lineTopX + mouthX) / 2 + (localPhase === 'FLYING' ? 6 : 14)} ${(lineTopY + mouthY) / 2} ${mouthX} ${mouthY}`} stroke="#E6EEF8" strokeWidth={1.4} fill="none" strokeOpacity={0.9} />
            ) : (
              snapS < 1.4 && (
                <G opacity={Math.max(0, 1 - snapS / 1.4)}>
                  <Path
                    d={`M${lineTopX} ${lineTopY} C ${lineTopX + 20} ${SH * 0.2 - snapS * 60}, ${lineTopX - 30} ${SH * 0.32 - snapS * 80}, ${lineTopX + 10 + snapS * 20} ${SH * 0.36 - snapS * 120}`}
                    stroke="#E6EEF8"
                    strokeWidth={1.4}
                    fill="none"
                  />
                  <Circle cx={SW * 0.6} cy={SH * 0.42} r={10 + snapS * 60} fill="none" stroke="#FFFFFF" strokeOpacity={Math.max(0, 0.7 - snapS)} strokeWidth={2} />
                </G>
              )
            )}
          </Svg>

          {/* The bass */}
          {fishX < SW + 10 && (
            <View pointerEvents="none" style={{ position: 'absolute', left: fishX, top: fishY + (ready ? Math.sin(srvNow / 90) * 2 : 0), transform: [{ rotate: `${fishTilt}deg` }] }}>
              <Bass size={fishW} sway={sway} hooked={!crashed} />
            </View>
          )}

          {/* Depth gauge */}
          <View pointerEvents="none" style={styles.depth}>
            <MaterialCommunityIcons name="arrow-down-bold" size={12} color={AQUA} />
            <Text style={styles.depthText}>{localPhase === 'BETTING' ? '4' : depthM} m</Text>
          </View>

          {crashed && snapS < 0.35 && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,60,80,0.25)' }]} />}

          {/* Multiplier */}
          {localPhase !== 'BETTING' && (
            <View pointerEvents="none" style={styles.multWrap}>
              {crashed && <Text style={styles.boomText}>LINE SNAPPED!</Text>}
              <Text style={[styles.bigMult, { fontSize: SH * 0.18, color: crashed ? '#FF4F6D' : '#FFFFFF', textShadowColor: crashed ? 'rgba(0,0,0,0.6)' : multColor(liveMult) }]}>
                {liveMult.toFixed(2)}x
              </Text>
            </View>
          )}

          {localPhase === 'BETTING' && (
            <View pointerEvents="none" style={styles.nextWrap}>
              <Text style={styles.nextText}>NEXT CAST IN</Text>
              <Text style={styles.countText}>{betLeft.toFixed(1)}s</Text>
              <View style={styles.countTrack}>
                <View style={[styles.countFill, { width: `${Math.min(100, (betLeft / betTotal) * 100)}%` }]} />
              </View>
            </View>
          )}
        </View>

        {/* Two bet panels */}
        {([0, 1] as const).map((i) => {
          const p = panels[i];
          const live = p.bet && localPhase === 'FLYING' && !p.cashedAt;
          const lostBet = p.bet && crashed && !p.cashedAt;
          const riding = p.bet ? (p.halfAt ? Number(p.bet.amount) / 2 : Number(p.bet.amount)) : 0;
          let label = 'BET';
          let sub = `₹${p.amount.toFixed(2)}`;
          let colors: [string, string] = ['#22C8B0', '#0E7A6A'];
          if (live) {
            label = 'CASH OUT';
            sub = `₹${round2(riding * liveMult).toFixed(2)}`;
            colors = ['#FFB23F', '#E07A10'];
          } else if (p.queued) {
            label = 'CANCEL';
            sub = 'bet next cast';
            colors = ['#FF5A6A', '#C21F31'];
          } else if (p.cashedAt) {
            label = 'CASHED OUT';
            sub = `@ ${p.cashedAt.toFixed(2)}x`;
            colors = ['#2A4A6A', '#1A3048'];
          } else if (lostBet) {
            label = 'SNAPPED';
            sub = p.halfAt ? `kept ₹${p.halfPaid.toFixed(2)}` : `-₹${Number(p.bet!.amount).toFixed(2)}`;
            colors = ['#5A2A3A', '#3A1422'];
          } else if (p.bet) {
            label = 'WAITING';
            sub = 'for the cast';
            colors = ['#2A4A6A', '#1A3048'];
          }
          const locked = !!p.bet || p.queued;
          const canHalf = !!live && !p.halfAt && !p.busy;
          return (
            <View key={i} style={styles.panel}>
              <View style={styles.panelLeft}>
                <View style={styles.stakeRow}>
                  <Pressable onPress={() => stepStake(i, -1)} disabled={locked} style={[styles.roundBtn, locked && styles.dim]}>
                    <MaterialCommunityIcons name="minus" size={18} color="#FFFFFF" />
                  </Pressable>
                  <Text style={styles.stakeText}>₹{p.amount}</Text>
                  <Pressable onPress={() => stepStake(i, 1)} disabled={locked} style={[styles.roundBtn, locked && styles.dim]}>
                    <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" />
                  </Pressable>
                </View>
                <View style={styles.quickRow}>
                  {QUICK.filter((q) => q <= maxStake).map((q) => (
                    <Pressable key={q} disabled={locked} onPress={() => setPanel(i, { amount: q })} style={[styles.quick, p.amount === q && styles.quickOn, locked && styles.dim]}>
                      <Text style={styles.quickText}>{q}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.autoRow}>
                  <Text style={styles.autoLabel}>Auto</Text>
                  <Switch
                    value={p.autoOn}
                    disabled={locked}
                    onValueChange={(v) => setPanel(i, { autoOn: v })}
                    trackColor={{ true: '#22C8B0', false: '#2A3A4C' }}
                    thumbColor="#FFFFFF"
                    style={{ transform: [{ scale: 0.8 }] }}
                  />
                  <Pressable onPress={() => stepAuto(i, -1)} disabled={locked || !p.autoOn} style={[styles.miniBtn, (locked || !p.autoOn) && styles.dim]}>
                    <MaterialCommunityIcons name="minus" size={14} color="#FFFFFF" />
                  </Pressable>
                  <Text style={[styles.autoValue, !p.autoOn && { opacity: 0.4 }]}>{p.autoAt.toFixed(2)}x</Text>
                  <Pressable onPress={() => stepAuto(i, 1)} disabled={locked || !p.autoOn} style={[styles.miniBtn, (locked || !p.autoOn) && styles.dim]}>
                    <MaterialCommunityIcons name="plus" size={14} color="#FFFFFF" />
                  </Pressable>
                </View>
              </View>
              <View style={styles.mainCol}>
                <Pressable onPress={() => onMain(i)} disabled={p.busy} style={({ pressed }) => [{ flex: 1 }, pressed && styles.pressed]}>
                  <LinearGradient colors={colors} style={styles.mainBtn}>
                    <Text style={styles.mainLabel}>{p.busy ? '…' : label}</Text>
                    <Text style={styles.mainSub}>{sub}</Text>
                  </LinearGradient>
                </Pressable>
                {/* Half Reel: take half now, let the rest ride */}
                <Pressable onPress={() => cashOut(i, true)} disabled={!canHalf} style={({ pressed }) => [styles.halfBtn, !canHalf && styles.halfOff, pressed && styles.pressed]}>
                  <MaterialCommunityIcons name="fishbowl-outline" size={14} color={canHalf ? '#0A2A26' : 'rgba(255,255,255,0.5)'} />
                  <Text style={[styles.halfText, !canHalf && { color: 'rgba(255,255,255,0.5)' }]}>
                    {p.halfAt ? `½ @ ${p.halfAt.toFixed(2)}x` : live ? `½ REEL ₹${round2((Number(p.bet!.amount) / 2) * liveMult).toFixed(2)}` : '½ REEL'}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        })}

        <Text style={styles.helpText}>½ REEL takes half your stake at the live multiplier and leaves the other half on the line — once per bet.</Text>

        {/* My bets */}
        <Text style={styles.sectionTitle}>MY BETS</Text>
        {myBets.length === 0 ? (
          <Text style={styles.emptyText}>No bets yet — place one above.</Text>
        ) : (
          myBets.map((b) => {
            const won = b.status === 'WON';
            const pending = b.status === 'PENDING';
            const paid = Number(b.payout);
            return (
              <View key={b.id} style={styles.betRow}>
                <Text style={styles.betTime}>{new Date(b.createdAt).toLocaleTimeString()}</Text>
                <Text style={styles.betAmt}>₹{Number(b.amount).toFixed(2)}</Text>
                <Text style={[styles.betMult, { color: won ? '#7EE2D0' : pending ? '#FFFFFF' : '#FF7A8A' }]}>
                  {b.halfCashoutMultiplier ? `½${Number(b.halfCashoutMultiplier).toFixed(2)} ` : ''}
                  {won ? `${Number(b.cashoutMultiplier).toFixed(2)}x` : pending ? '—' : `${Number(b.round.crashMultiplier).toFixed(2)}x`}
                </Text>
                <Text style={[styles.betWin, { color: paid > 0 ? '#7EE2D0' : '#8A8FA8' }]}>{paid > 0 ? `+₹${paid.toFixed(2)}` : pending ? 'live' : '—'}</Text>
              </View>
            );
          })
        )}
        <GameInfoButton>
          Provably fair · RTP {config ? 100 - config.houseEdgePercent : 88}% · bet ₹{minStake}–₹{maxStake} · max win ₹{config?.maxPayout ?? 10000} per bet
        </GameInfoButton>
      </ScrollView>

      {toast && (
        <View pointerEvents="none" style={[styles.toast, toast.good && styles.toastGood]}>
          <Text style={[styles.toastText, toast.good && { color: '#06302A' }]}>{toast.text}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#010A14' },
  topBar: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', fontStyle: 'italic', letterSpacing: 2 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  balancePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.4)' },
  balanceText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  depositBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: GOLD },

  histRow: { gap: 6, paddingHorizontal: 10, paddingVertical: 6 },
  histChip: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 12, borderWidth: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  histText: { fontSize: 12, fontWeight: '900' },

  scene: { alignSelf: 'center', borderRadius: 18, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(60,240,208,0.45)' },
  reefCol: { position: 'absolute', left: 0, right: 0 },
  depth: { position: 'absolute', left: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: 'rgba(0,10,20,0.6)', borderWidth: 1, borderColor: 'rgba(60,240,208,0.4)' },
  depthText: { color: AQUA, fontSize: 12, fontWeight: '900', fontVariant: ['tabular-nums'] },
  multWrap: { position: 'absolute', top: '6%', left: 0, right: 0, alignItems: 'center' },
  bigMult: { fontWeight: '900', fontStyle: 'italic', letterSpacing: -1, textShadowRadius: 16, textShadowOffset: { width: 0, height: 0 } },
  boomText: { color: '#FFD6A0', fontSize: 16, fontWeight: '900', letterSpacing: 3, textShadowColor: '#000', textShadowRadius: 6, marginBottom: -4 },
  nextWrap: { position: 'absolute', top: '6%', alignSelf: 'center', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 16, backgroundColor: 'rgba(5,10,30,0.6)' },
  nextText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '900', letterSpacing: 2 },
  countText: { color: GOLD, fontSize: 34, fontWeight: '900', marginTop: 2 },
  countTrack: { width: 160, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden', marginTop: 6 },
  countFill: { height: '100%', backgroundColor: AQUA, borderRadius: 4 },

  panel: { flexDirection: 'row', gap: 10, marginHorizontal: 10, marginTop: 10, padding: 10, borderRadius: 16, backgroundColor: '#0A2234', borderWidth: 1, borderColor: 'rgba(60,240,208,0.18)' },
  panelLeft: { flex: 1, gap: 6 },
  stakeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 20, padding: 3 },
  roundBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  stakeText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  quickRow: { flexDirection: 'row', gap: 4 },
  quick: { flex: 1, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  quickOn: { backgroundColor: 'rgba(60,240,208,0.2)', borderWidth: 1, borderColor: AQUA },
  quickText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  autoRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  autoLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '800' },
  miniBtn: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  autoValue: { color: GOLD, fontSize: 13, fontWeight: '900', minWidth: 48, textAlign: 'center' },
  mainCol: { width: '44%', gap: 6 },
  mainBtn: { flex: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  mainLabel: { color: '#FFFFFF', fontSize: 19, fontWeight: '900', letterSpacing: 1 },
  mainSub: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '800', marginTop: 2 },
  halfBtn: { height: 30, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: AQUA },
  halfOff: { backgroundColor: 'rgba(255,255,255,0.08)' },
  halfText: { color: '#0A2A26', fontSize: 12, fontWeight: '900' },
  pressed: { transform: [{ scale: 0.97 }] },
  dim: { opacity: 0.4 },
  helpText: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginHorizontal: 14, marginTop: 8, lineHeight: 15 },

  sectionTitle: { color: GOLD, fontSize: 13, fontWeight: '900', letterSpacing: 2, marginTop: 16, marginHorizontal: 14 },
  emptyText: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginHorizontal: 14, marginTop: 6 },
  betRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  betTime: { flex: 1.2, color: 'rgba(255,255,255,0.55)', fontSize: 12 },
  betAmt: { flex: 1, color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  betMult: { flex: 1.2, fontSize: 12, fontWeight: '900', textAlign: 'center' },
  betWin: { flex: 1, fontSize: 13, fontWeight: '800', textAlign: 'right' },

  toast: { position: 'absolute', alignSelf: 'center', top: '40%', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.88)', borderWidth: 1, borderColor: '#FF4F6D' },
  toastGood: { backgroundColor: '#7EE2D0', borderColor: AQUA },
  toastText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
