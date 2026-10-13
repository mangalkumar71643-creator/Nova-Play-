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
  AviatorBetResult,
  AviatorConfig,
  AviatorHistoryEntry,
  AviatorMyBet,
  AviatorRoundView,
  cashOutRocketBet,
  fetchRocketConfig,
  fetchRocketCurrentRound,
  fetchRocketHistory,
  fetchRocketMyBets,
  placeRocketBet,
} from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const GOLD = '#FFD66B';
const PINK = '#FF3DA6';
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
  if (m < 10) return '#B06CFF';
  return PINK;
}

// ---------- scene ----------
// Deep space: the rocket lifts off its pad and climbs while the stars stream
// past and the ringed planet sinks away below. When the round ends it explodes.

function seeded(seed: number) {
  let x = seed;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}

/** Space backdrop with two nebula glows. Static. */
const SpaceBackdrop = memo(function SpaceBackdrop({ w, h }: { w: number; h: number }) {
  const u = useId().replace(/:/g, '');
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgLinearGradient id={`rkSky${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#05020F" />
          <Stop offset="0.55" stopColor="#160A3A" />
          <Stop offset="1" stopColor="#2E1060" />
        </SvgLinearGradient>
        <RadialGradient id={`rkNebPink${u}`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={PINK} stopOpacity={0.35} />
          <Stop offset="1" stopColor={PINK} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`rkNebBlue${u}`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#3DD6FF" stopOpacity={0.25} />
          <Stop offset="1" stopColor="#3DD6FF" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill={`url(#rkSky${u})`} />
      <Ellipse cx={w * 0.82} cy={h * 0.2} rx={w * 0.42} ry={h * 0.34} fill={`url(#rkNebPink${u})`} />
      <Ellipse cx={w * 0.12} cy={h * 0.55} rx={w * 0.36} ry={h * 0.3} fill={`url(#rkNebBlue${u})`} />
    </Svg>
  );
});

/** One screen-high tile of stars; tiles stack and scroll down as the rocket climbs. */
const StarTile = memo(function StarTile({ w, h, seed, count, big }: { w: number; h: number; seed: number; count: number; big: number }) {
  const stars = useMemo(() => {
    const rnd = seeded(seed);
    return Array.from({ length: count }, () => ({ x: rnd() * w, y: rnd() * h, r: (0.4 + rnd() * 0.9) * big, o: 0.35 + rnd() * 0.65 }));
  }, [w, h, seed, count, big]);
  return (
    <Svg width={w} height={h}>
      {stars.map((s, i) => (
        <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#FFFFFF" opacity={s.o} />
      ))}
    </Svg>
  );
});

/** A big ringed planet. */
const Planet = memo(function Planet({ size }: { size: number }) {
  const u = useId().replace(/:/g, '');
  // The ring reaches 1.65r out, so r stays small enough to keep it inside the box.
  const r = size * 0.28;
  const c = size / 2;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={`rkPlanet${u}`} cx="35%" cy="30%" r="75%">
          <Stop offset="0" stopColor="#FFB86B" />
          <Stop offset="0.45" stopColor="#E0574F" />
          <Stop offset="1" stopColor="#4A1240" />
        </RadialGradient>
        <SvgLinearGradient id={`rkRing${u}`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#FFE3B0" stopOpacity={0.1} />
          <Stop offset="0.5" stopColor="#FFE3B0" stopOpacity={0.85} />
          <Stop offset="1" stopColor="#FFE3B0" stopOpacity={0.1} />
        </SvgLinearGradient>
      </Defs>
      {/* Back half of the ring, then the planet, then the front half */}
      <Path d={`M ${c - r * 1.65} ${c} A ${r * 1.65} ${r * 0.42} -14 0 1 ${c + r * 1.65} ${c}`} stroke={`url(#rkRing${u})`} strokeWidth={size * 0.03} fill="none" transform={`rotate(-14 ${c} ${c})`} />
      <Circle cx={c} cy={c} r={r} fill={`url(#rkPlanet${u})`} />
      {[0.35, 0.55, 0.72].map((t) => (
        <Ellipse key={t} cx={c} cy={c - r + 2 * r * t} rx={r * Math.sqrt(1 - (2 * t - 1) ** 2) * 0.98} ry={r * 0.05} fill="#7A1E3A" opacity={0.25} />
      ))}
      <Path d={`M ${c - r * 1.65} ${c} A ${r * 1.65} ${r * 0.42} -14 0 0 ${c + r * 1.65} ${c}`} stroke={`url(#rkRing${u})`} strokeWidth={size * 0.03} fill="none" transform={`rotate(-14 ${c} ${c})`} />
    </Svg>
  );
});

/** A small cratered moon. */
const Moon = memo(function Moon({ size }: { size: number }) {
  const u = useId().replace(/:/g, '');
  const r = size / 2;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={`rkMoon${u}`} cx="35%" cy="30%" r="75%">
          <Stop offset="0" stopColor="#E9F2FF" />
          <Stop offset="1" stopColor="#5C6A9A" />
        </RadialGradient>
      </Defs>
      <Circle cx={r} cy={r} r={r - 1} fill={`url(#rkMoon${u})`} />
      <Circle cx={r * 0.7} cy={r * 0.8} r={r * 0.18} fill="#7C89B8" opacity={0.6} />
      <Circle cx={r * 1.3} cy={r * 1.25} r={r * 0.12} fill="#7C89B8" opacity={0.6} />
      <Circle cx={r * 1.15} cy={r * 0.55} r={r * 0.08} fill="#7C89B8" opacity={0.6} />
    </Svg>
  );
});

/** Launch pad with gantry. */
const LaunchPad = memo(function LaunchPad({ w, h }: { w: number; h: number }) {
  const u = useId().replace(/:/g, '');
  return (
    <Svg width={w} height={h}>
      <Defs>
        <SvgLinearGradient id={`rkPad${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#4A4F6E" />
          <Stop offset="1" stopColor="#1C1F33" />
        </SvgLinearGradient>
      </Defs>
      <Polygon points={`${w * 0.12},${h * 0.55} ${w * 0.88},${h * 0.55} ${w},${h} 0,${h}`} fill={`url(#rkPad${u})`} />
      <Rect x={w * 0.12} y={h * 0.5} width={w * 0.76} height={h * 0.07} fill="#6B7194" />
      {[0.2, 0.4, 0.6, 0.8].map((t) => (
        <Rect key={t} x={w * t - 2} y={h * 0.5} width={4} height={h * 0.07} fill="#FFD66B" opacity={0.8} />
      ))}
      {/* Gantry tower on the left */}
      <Rect x={w * 0.14} y={0} width={w * 0.05} height={h * 0.5} fill="#2C3150" />
      {Array.from({ length: 6 }, (_, i) => (
        <Line key={i} x1={w * 0.14} y1={(h * 0.5 * i) / 6} x2={w * 0.19} y2={(h * 0.5 * (i + 1)) / 6} stroke="#5A6190" strokeWidth={1.2} />
      ))}
      <Rect x={w * 0.19} y={h * 0.18} width={w * 0.14} height={h * 0.025} fill="#2C3150" />
      <Circle cx={w * 0.165} cy={h * 0.02} r={2.5} fill="#FF4F4F" />
    </Svg>
  );
});

/** The rocket, nose up, with a flickering exhaust flame of `flame` (0 = off). */
function Rocket({ h, flame, flicker }: { h: number; flame: number; flicker: number }) {
  const u = useId().replace(/:/g, '');
  const w = h * 0.5;
  const s = h / 120;
  const flameLen = (26 + 10 * flicker) * flame;
  return (
    <Svg width={w} height={h + 40 * s}>
      <Defs>
        <SvgLinearGradient id={`rkBody${u}`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#B9C2D6" />
          <Stop offset="0.45" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#8E98B3" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`rkRed${u}`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#B3122E" />
          <Stop offset="0.5" stopColor="#FF3B55" />
          <Stop offset="1" stopColor="#8A0C22" />
        </SvgLinearGradient>
        <RadialGradient id={`rkGlass${u}`} cx="35%" cy="35%" r="70%">
          <Stop offset="0" stopColor="#BFF3FF" />
          <Stop offset="0.5" stopColor="#3DA9FF" />
          <Stop offset="1" stopColor="#123A8A" />
        </RadialGradient>
        <SvgLinearGradient id={`rkFlame${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.25" stopColor="#FFE36B" />
          <Stop offset="0.6" stopColor="#FF7A1A" />
          <Stop offset="1" stopColor="#FF2D55" stopOpacity={0} />
        </SvgLinearGradient>
      </Defs>
      {flame > 0 && (
        <G>
          <Path d={`M ${21 * s} ${90 * s} Q ${30 * s} ${(92 + flameLen * 1.4) * s} ${39 * s} ${90 * s} Z`} fill={`url(#rkFlame${u})`} opacity={0.55} />
          <Path d={`M ${23 * s} ${90 * s} Q ${30 * s} ${(92 + flameLen) * s} ${37 * s} ${90 * s} Z`} fill={`url(#rkFlame${u})`} />
        </G>
      )}
      {/* Fins */}
      <Path d={`M ${18 * s} ${58 * s} L ${4 * s} ${86 * s} L ${4 * s} ${96 * s} L ${18 * s} ${84 * s} Z`} fill={`url(#rkRed${u})`} />
      <Path d={`M ${42 * s} ${58 * s} L ${56 * s} ${86 * s} L ${56 * s} ${96 * s} L ${42 * s} ${84 * s} Z`} fill={`url(#rkRed${u})`} />
      {/* Nozzle */}
      <Path d={`M ${22 * s} ${84 * s} L ${38 * s} ${84 * s} L ${40 * s} ${92 * s} L ${20 * s} ${92 * s} Z`} fill="#3A3F55" />
      {/* Body */}
      <Path d={`M ${30 * s} ${2 * s} C ${44 * s} ${16 * s} ${44 * s} ${40 * s} ${42 * s} ${86 * s} L ${18 * s} ${86 * s} C ${16 * s} ${40 * s} ${16 * s} ${16 * s} ${30 * s} ${2 * s} Z`} fill={`url(#rkBody${u})`} />
      {/* Red nose cone */}
      <Path d={`M ${30 * s} ${2 * s} C ${37 * s} ${9 * s} ${40 * s} ${16 * s} ${41 * s} ${24 * s} L ${19 * s} ${24 * s} C ${20 * s} ${16 * s} ${23 * s} ${9 * s} ${30 * s} ${2 * s} Z`} fill={`url(#rkRed${u})`} />
      <Rect x={17.5 * s} y={74 * s} width={25 * s} height={4 * s} fill={`url(#rkRed${u})`} />
      {/* Window */}
      <Circle cx={30 * s} cy={42 * s} r={8.5 * s} fill="#C9D2E6" />
      <Circle cx={30 * s} cy={42 * s} r={6.5 * s} fill={`url(#rkGlass${u})`} />
      <Circle cx={27.5 * s} cy={39.5 * s} r={1.8 * s} fill="#FFFFFF" opacity={0.85} />
      {/* Centre fin */}
      <Rect x={28.5 * s} y={66 * s} width={3 * s} height={18 * s} rx={1.5 * s} fill="#8A0C22" />
    </Svg>
  );
}

/** Fireball, shock ring, rays and debris, `t` seconds after the explosion. */
function Explosion({ size, t }: { size: number; t: number }) {
  const u = useId().replace(/:/g, '');
  const c = size / 2;
  const k = Math.min(1, t / 0.9);
  const ease = 1 - Math.pow(1 - k, 3);
  const debris = useMemo(() => {
    const rnd = seeded(31);
    return Array.from({ length: 14 }, () => ({ a: rnd() * Math.PI * 2, v: 0.25 + rnd() * 0.3, s: 2 + rnd() * 4, spin: rnd() * 360 }));
  }, []);
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={`rkFire${u}`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={1} />
          <Stop offset="0.25" stopColor="#FFE36B" stopOpacity={1} />
          <Stop offset="0.6" stopColor="#FF6A1A" stopOpacity={0.9} />
          <Stop offset="1" stopColor="#B3122E" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={c} cy={c} r={size * (0.12 + 0.36 * ease)} fill="none" stroke="#FFD6A0" strokeWidth={2.5} opacity={Math.max(0, 0.8 - k)} />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        const r0 = size * (0.06 + 0.2 * ease);
        const r1 = size * (0.14 + (i % 2 ? 0.22 : 0.32) * ease);
        return <Line key={i} x1={c + Math.cos(a) * r0} y1={c + Math.sin(a) * r0} x2={c + Math.cos(a) * r1} y2={c + Math.sin(a) * r1} stroke="#FFE9B0" strokeWidth={2} strokeLinecap="round" opacity={Math.max(0, 1 - k * 1.2)} />;
      })}
      <Circle cx={c} cy={c} r={size * (0.08 + 0.26 * ease)} fill={`url(#rkFire${u})`} opacity={Math.max(0, 1 - k * k)} />
      {debris.map((d, i) => {
        const dist = size * d.v * ease;
        const x = c + Math.cos(d.a) * dist;
        const y = c + Math.sin(d.a) * dist + size * 0.25 * k * k;
        return <Rect key={i} x={x - d.s / 2} y={y - d.s / 2} width={d.s} height={d.s * 0.6} fill={i % 3 ? '#C9D2E6' : '#FF3B55'} opacity={Math.max(0, 1 - k * 0.8)} transform={`rotate(${d.spin + t * 400} ${x} ${y})`} />;
      })}
    </Svg>
  );
}

/** Static rocket-over-planet art for the lobby tile. */
export function RocketTileArt({ size }: { size: number }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <SpaceBackdrop w={size} h={size} />
      <StarTile w={size} h={size} seed={5} count={40} big={1} />
      <View style={{ position: 'absolute', left: -size * 0.28, top: size * 0.42 }}>
        <Planet size={size * 0.85} />
      </View>
      <View style={{ position: 'absolute', left: size * 0.5, top: size * 0.06, transform: [{ rotate: '22deg' }] }}>
        <Rocket h={size * 0.5} flame={1} flicker={0.6} />
      </View>
    </View>
  );
}

// ---------- bet panel ----------

type PanelState = {
  amount: number;
  autoOn: boolean;
  autoAt: number;
  bet: AviatorBetResult | null;
  queued: boolean;
  cashedAt: number | null;
  busy: boolean;
};

function initialPanel(amount: number): PanelState {
  return { amount, autoOn: false, autoAt: 2, bet: null, queued: false, cashedAt: null, busy: false };
}

// ---------- screen ----------

export default function RocketScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<AviatorConfig | null>(null);
  const [view, setView] = useState<AviatorRoundView | null>(null);
  const [history, setHistory] = useState<AviatorHistoryEntry[]>([]);
  const [myBets, setMyBets] = useState<AviatorMyBet[]>([]);
  const [panels, setPanels] = useState<[PanelState, PanelState]>([initialPanel(10), initialPanel(20)]);
  const [toast, setToast] = useState<{ text: string; good: boolean } | null>(null);
  const [, setFrame] = useState(0);

  const offsetRef = useRef(0);
  const mountedRef = useRef(true);
  const panelsRef = useRef(panels);
  panelsRef.current = panels;
  const periodRef = useRef<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** When this client saw the rocket explode; drives the explosion. */
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
    fetchRocketHistory(30)
      .then((h) => mountedRef.current && setHistory(h))
      .catch(() => {});
    fetchRocketMyBets()
      .then((b) => mountedRef.current && setMyBets(b.slice(0, 15)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchRocketConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => {});
    loadLists();
    return () => {
      mountedRef.current = false;
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [loadLists]);

  // Round polling, quicker while the rocket is flying.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;
    const loop = async () => {
      let delay = 700;
      try {
        const sentAt = Date.now();
        const v = await fetchRocketCurrentRound();
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

  // Smooth frames while the rocket flies or the countdown runs.
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
      setPanel(i as 0 | 1, { bet: null, cashedAt: null });
      if (p.queued && view.phase === 'BETTING') {
        setPanel(i as 0 | 1, { queued: false });
        placeBet(i as 0 | 1, true);
      }
    });
    // placeBet is stable enough for this once-per-round effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.periodNumber]);

  // Exploded: refresh wallet and lists.
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
        const bet = await placeRocketBet(p.amount, p.autoOn ? p.autoAt : undefined);
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
    async (i: 0 | 1) => {
      const p = panelsRef.current[i];
      if (!p.bet || p.busy || p.cashedAt) return;
      setPanel(i, { busy: true });
      try {
        const res = await cashOutRocketBet(p.bet.id);
        if (!mountedRef.current) return;
        setPanel(i, { busy: false, cashedAt: res.multiplier });
        showToast(`+₹${res.payout.toFixed(2)} @ ${res.multiplier.toFixed(2)}x`, true);
        refreshWallet();
      } catch (err) {
        if (!mountedRef.current) return;
        setPanel(i, { busy: false });
        showToast(errorMessage(err));
      }
    },
    [refreshWallet, setPanel, showToast]
  );

  // Auto cash-out: once the rocket passes a panel's target, cash out (the
  // server pays exactly the target).
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
  const SH = Math.min(SW * 0.8, 340);
  const crashed = localPhase === 'CRASHED';
  const flightS = localPhase === 'BETTING' ? 0 : crashed && view?.crashMultiplier ? Math.log(view.crashMultiplier) / growth : elapsed;
  const boomS = crashed && crashSeenRef.current ? (Date.now() - crashSeenRef.current) / 1000 : 0;
  // How far the camera has climbed, in px: speeds up the longer it flies.
  const climb = SH * (0.9 * flightS + 0.08 * flightS * flightS);
  const nearOff = (climb * 0.9) % SH;
  const farOff = (climb * 0.35) % SH;
  const padH = SH * 0.22;
  const padY = SH - padH + climb * 1.4;
  const planetSize = SW * 0.95;
  const planetY = SH * 0.5 + climb * 0.18;
  const moonSize = SH * 0.16;
  const moonY = SH * 0.08 + climb * 0.08;
  // Rocket: sits on the pad, then lifts off and settles into a gentle hover.
  const rocketH = SH * 0.34;
  const rocketW = rocketH * 0.5;
  const LIFT_S = 1.3;
  const lift = Math.min(1, flightS / LIFT_S);
  const ease = lift * lift * (3 - 2 * lift);
  const padTop = SH - padH * 0.5;
  const startX = SW * 0.5;
  const startY = padTop - rocketH * 0.79;
  const hover = localPhase === 'FLYING' && lift >= 1 ? Math.sin(srvNow / 380) : 0;
  const cruiseX = SW * 0.6 + hover * SW * 0.01;
  const cruiseY = SH * 0.3 + hover * SH * 0.015;
  const rocketX = startX + (cruiseX - startX) * ease;
  const rocketY = startY + (cruiseY - startY) * ease;
  const tilt = 18 * ease + hover * 2;
  const shaking = localPhase === 'BETTING' && view && flyStart - srvNow < 1500;
  const shake = shaking ? Math.sin(srvNow / 25) * 1.2 : 0;
  const flicker = (Math.sin(srvNow / 40) + 1) / 2;
  const rocketCentre = { x: rocketX, y: rocketY + rocketH * 0.4 };
  const boomSize = SH * 0.75;
  const betLeft = localPhase === 'BETTING' ? Math.max(0, (flyStart - srvNow) / 1000) : 0;
  const betTotal = config?.bettingDurationSeconds ?? 6;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#120634', '#07031A']} style={StyleSheet.absoluteFill} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color="#FFFFFF" />
          <MaterialCommunityIcons name="rocket-launch" size={22} color={PINK} />
          <Text style={styles.title}>ROCKET</Text>
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

        {/* Space scene */}
        <View style={[styles.scene, { width: SW, height: SH }]}>
          <SpaceBackdrop w={SW} h={SH} />
          {/* Far and near star layers, each two tiles stacked so they loop */}
          {[
            { off: farOff, seed: 11, count: 70, big: 0.8 },
            { off: nearOff, seed: 23, count: 28, big: 1.5 },
          ].map((L) => (
            <View key={L.seed} pointerEvents="none" style={[styles.starCol, { height: SH * 2, top: -SH + L.off }]}>
              <StarTile w={SW} h={SH} seed={L.seed} count={L.count} big={L.big} />
              <StarTile w={SW} h={SH} seed={L.seed} count={L.count} big={L.big} />
            </View>
          ))}
          {/* Speed streaks once it's really moving */}
          {localPhase === 'FLYING' && flightS > LIFT_S && (
            <Svg width={SW} height={SH} style={StyleSheet.absoluteFill} pointerEvents="none">
              {Array.from({ length: 7 }, (_, i) => {
                const x = ((i * 0.37 + 0.11) % 1) * SW;
                const y = ((((climb * 2.2) / SH + i * 0.29) % 1.3) - 0.3) * SH;
                return <Line key={i} x1={x} y1={y} x2={x} y2={y + SH * 0.12} stroke="#FFFFFF" strokeOpacity={0.22} strokeWidth={1.2} strokeLinecap="round" />;
              })}
            </Svg>
          )}
          {moonY < SH && (
            <View pointerEvents="none" style={{ position: 'absolute', left: SW * 0.08, top: moonY }}>
              <Moon size={moonSize} />
            </View>
          )}
          {planetY < SH && (
            <View pointerEvents="none" style={{ position: 'absolute', left: SW * 0.38, top: planetY }}>
              <Planet size={planetSize} />
            </View>
          )}
          {padY < SH && (
            <View pointerEvents="none" style={{ position: 'absolute', left: SW * 0.5 - SW * 0.24, top: padY, width: SW * 0.48, height: padH }}>
              <LaunchPad w={SW * 0.48} h={padH} />
            </View>
          )}

          {/* Rocket, or the explosion where it was */}
          {!(crashed && boomS > 0.08) && (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: rocketX - rocketW / 2 + shake,
                top: rocketY,
                transform: [{ rotate: `${tilt}deg` }],
              }}
            >
              {/* Exhaust glow trailing below the nozzle while it climbs */}
              {localPhase === 'FLYING' && (
                <LinearGradient
                  colors={['rgba(255,200,120,0.4)', 'rgba(255,61,166,0.12)', 'rgba(255,61,166,0)']}
                  style={{ position: 'absolute', left: rocketW * 0.36, top: rocketH * 0.95, width: rocketW * 0.28, height: SH * 0.32, borderRadius: rocketW }}
                />
              )}
              <Rocket h={rocketH} flame={localPhase === 'FLYING' ? 1 : shaking ? 0.45 : 0} flicker={flicker} />
            </View>
          )}
          {crashed && boomS < 1.6 && (
            <View pointerEvents="none" style={{ position: 'absolute', left: rocketCentre.x - boomSize / 2, top: rocketCentre.y - boomSize / 2 }}>
              <Explosion size={boomSize} t={boomS} />
            </View>
          )}

          {/* Multiplier */}
          {localPhase !== 'BETTING' && (
            <View pointerEvents="none" style={styles.multWrap}>
              {crashed && <Text style={styles.boomText}>EXPLODED!</Text>}
              <Text style={[styles.bigMult, { fontSize: SH * 0.19, color: crashed ? '#FF4F6D' : '#FFFFFF', textShadowColor: crashed ? 'rgba(0,0,0,0.6)' : multColor(liveMult) }]}>
                {liveMult.toFixed(2)}x
              </Text>
            </View>
          )}

          {localPhase === 'BETTING' && (
            <View pointerEvents="none" style={styles.nextWrap}>
              <Text style={styles.nextText}>NEXT LAUNCH IN</Text>
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
          let label = `BET`;
          let sub = `₹${p.amount.toFixed(2)}`;
          let colors: [string, string] = ['#2FD16B', '#138A3E'];
          if (live) {
            label = 'CASH OUT';
            sub = `₹${round2(Number(p.bet!.amount) * liveMult).toFixed(2)}`;
            colors = ['#FFB23F', '#E07A10'];
          } else if (p.queued) {
            label = 'CANCEL';
            sub = 'bet next launch';
            colors = ['#FF5A6A', '#C21F31'];
          } else if (p.cashedAt) {
            label = 'CASHED OUT';
            sub = `@ ${p.cashedAt.toFixed(2)}x`;
            colors = ['#3A4A7A', '#26335C'];
          } else if (lostBet) {
            label = 'EXPLODED';
            sub = `-₹${Number(p.bet!.amount).toFixed(2)}`;
            colors = ['#5A2A3A', '#3A1422'];
          } else if (p.bet) {
            label = 'WAITING';
            sub = 'for liftoff';
            colors = ['#3A4A7A', '#26335C'];
          }
          const locked = !!p.bet || p.queued;
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
                    trackColor={{ true: '#2FD16B', false: '#3A3F5C' }}
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
              <Pressable onPress={() => onMain(i)} disabled={p.busy} style={({ pressed }) => [styles.mainWrap, pressed && styles.pressed]}>
                <LinearGradient colors={colors} style={styles.mainBtn}>
                  <Text style={styles.mainLabel}>{p.busy ? '…' : label}</Text>
                  <Text style={styles.mainSub}>{sub}</Text>
                </LinearGradient>
              </Pressable>
            </View>
          );
        })}

        {/* My bets */}
        <Text style={styles.sectionTitle}>MY BETS</Text>
        {myBets.length === 0 ? (
          <Text style={styles.emptyText}>No bets yet — place one above.</Text>
        ) : (
          myBets.map((b) => {
            const won = b.status === 'WON';
            const pending = b.status === 'PENDING';
            return (
              <View key={b.id} style={styles.betRow}>
                <Text style={styles.betTime}>{new Date(b.createdAt).toLocaleTimeString()}</Text>
                <Text style={styles.betAmt}>₹{Number(b.amount).toFixed(2)}</Text>
                <Text style={[styles.betMult, { color: won ? '#7EE2A3' : pending ? '#FFFFFF' : '#FF7A8A' }]}>
                  {won ? `${Number(b.cashoutMultiplier).toFixed(2)}x` : pending ? '—' : `${Number(b.round.crashMultiplier).toFixed(2)}x`}
                </Text>
                <Text style={[styles.betWin, { color: won ? '#7EE2A3' : '#8A8FA8' }]}>{won ? `+₹${Number(b.payout).toFixed(2)}` : pending ? 'live' : '—'}</Text>
              </View>
            );
          })
        )}
        <Text style={styles.footNote}>Provably fair · bet ₹{minStake}–₹{maxStake} · max win ₹{config?.maxPayout ?? 10000} per bet</Text>
      </ScrollView>

      {toast && (
        <View pointerEvents="none" style={[styles.toast, toast.good && styles.toastGood]}>
          <Text style={[styles.toastText, toast.good && { color: '#0B3A1C' }]}>{toast.text}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07031A' },
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

  scene: { alignSelf: 'center', borderRadius: 18, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(176,108,255,0.45)' },
  starCol: { position: 'absolute', left: 0, right: 0 },
  multWrap: { position: 'absolute', top: '6%', left: 0, right: 0, alignItems: 'center' },
  bigMult: { fontWeight: '900', fontStyle: 'italic', letterSpacing: -1, textShadowRadius: 16, textShadowOffset: { width: 0, height: 0 } },
  boomText: { color: '#FFD6A0', fontSize: 16, fontWeight: '900', letterSpacing: 3, textShadowColor: '#000', textShadowRadius: 6, marginBottom: -4 },
  nextWrap: { position: 'absolute', top: '8%', alignSelf: 'center', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 16, backgroundColor: 'rgba(5,10,30,0.6)' },
  nextText: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '900', letterSpacing: 2 },
  countText: { color: GOLD, fontSize: 34, fontWeight: '900', marginTop: 2 },
  countTrack: { width: 160, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden', marginTop: 6 },
  countFill: { height: '100%', backgroundColor: PINK, borderRadius: 4 },

  panel: { flexDirection: 'row', gap: 10, marginHorizontal: 10, marginTop: 10, padding: 10, borderRadius: 16, backgroundColor: '#1A1240', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  panelLeft: { flex: 1, gap: 6 },
  stakeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 20, padding: 3 },
  roundBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  stakeText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  quickRow: { flexDirection: 'row', gap: 4 },
  quick: { flex: 1, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  quickOn: { backgroundColor: 'rgba(255,214,107,0.25)', borderWidth: 1, borderColor: GOLD },
  quickText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  autoRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  autoLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '800' },
  miniBtn: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  autoValue: { color: GOLD, fontSize: 13, fontWeight: '900', minWidth: 48, textAlign: 'center' },
  mainWrap: { width: '42%' },
  mainBtn: { flex: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  mainLabel: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', letterSpacing: 1 },
  mainSub: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '800', marginTop: 2 },
  pressed: { transform: [{ scale: 0.97 }] },
  dim: { opacity: 0.4 },

  sectionTitle: { color: GOLD, fontSize: 13, fontWeight: '900', letterSpacing: 2, marginTop: 16, marginHorizontal: 14 },
  emptyText: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginHorizontal: 14, marginTop: 6 },
  betRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  betTime: { flex: 1.2, color: 'rgba(255,255,255,0.55)', fontSize: 12 },
  betAmt: { flex: 1, color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  betMult: { flex: 1, fontSize: 13, fontWeight: '900', textAlign: 'center' },
  betWin: { flex: 1, fontSize: 13, fontWeight: '800', textAlign: 'right' },
  footNote: { color: 'rgba(255,255,255,0.35)', fontSize: 11, textAlign: 'center', marginTop: 14 },

  toast: { position: 'absolute', alignSelf: 'center', top: '40%', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.88)', borderWidth: 1, borderColor: '#FF4F6D' },
  toastGood: { backgroundColor: '#7EE2A3', borderColor: '#2FD16B' },
  toastText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
