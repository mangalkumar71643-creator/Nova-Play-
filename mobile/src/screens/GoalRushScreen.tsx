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
  cashOutGoalRushBet,
  fetchGoalRushConfig,
  fetchGoalRushCurrentRound,
  fetchGoalRushHistory,
  fetchGoalRushMyBets,
  placeGoalRushBet,
} from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const GOLD = '#FFD66B';
const PINK = '#FF3DA6';
const GREEN = '#2FE07A';
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
// A floodlit stadium at night: the striker's shot lifts the ball off the
// penalty spot and it soars, spinning, while the stands stream past below.
// When the round ends the keeper's glove snatches it out of the air.

function seeded(seed: number) {
  let x = seed;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}

/** Night sky over the stadium with two floodlight glows. Static. */
const StadiumBackdrop = memo(function StadiumBackdrop({ w, h }: { w: number; h: number }) {
  const u = useId().replace(/:/g, '');
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgLinearGradient id={`grSky${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#020A14" />
          <Stop offset="0.6" stopColor="#06233A" />
          <Stop offset="1" stopColor="#0B3B3A" />
        </SvgLinearGradient>
        <RadialGradient id={`grGlow${u}`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFFBE0" stopOpacity={0.4} />
          <Stop offset="1" stopColor="#FFFBE0" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill={`url(#grSky${u})`} />
      <Ellipse cx={w * 0.08} cy={h * 0.1} rx={w * 0.38} ry={h * 0.32} fill={`url(#grGlow${u})`} />
      <Ellipse cx={w * 0.92} cy={h * 0.1} rx={w * 0.38} ry={h * 0.32} fill={`url(#grGlow${u})`} />
    </Svg>
  );
});

/** One screen-high tile of crowd and stand tiers; tiles stack and scroll down as the ball climbs. */
const CrowdTile = memo(function CrowdTile({ w, h, seed, rows, big, dim }: { w: number; h: number; seed: number; rows: number; big: number; dim: number }) {
  const fans = useMemo(() => {
    const rnd = seeded(seed);
    const colours = ['#E8F0FF', '#FF3B4E', '#2F7BFF', '#FFD23F', '#FFFFFF', '#9AA8C7'];
    const out: { x: number; y: number; r: number; c: string; o: number }[] = [];
    for (let row = 0; row < rows; row++) {
      const y = ((row + 0.5) / rows) * h;
      const n = Math.round(w / (7 * big));
      for (let i = 0; i < n; i++) {
        if (rnd() < 0.15) continue;
        out.push({ x: ((i + rnd() * 0.6) / n) * w, y: y + (rnd() - 0.5) * 3, r: (1.2 + rnd() * 0.8) * big, c: colours[Math.floor(rnd() * colours.length)], o: (0.35 + rnd() * 0.5) * dim });
      }
    }
    return out;
  }, [w, h, seed, rows, big, dim]);
  return (
    <Svg width={w} height={h}>
      {Array.from({ length: rows }, (_, row) => (
        <Rect key={`t${row}`} x={0} y={(row / rows) * h} width={w} height={h / rows - 2} fill="#0E2A40" opacity={0.35 * dim} />
      ))}
      {fans.map((f, i) => (
        <Circle key={i} cx={f.x} cy={f.y} r={f.r} fill={f.c} opacity={f.o} />
      ))}
    </Svg>
  );
});

/** A floodlight pylon: a lamp bank on a lattice mast. */
const Floodlight = memo(function Floodlight({ h }: { h: number }) {
  const w = h * 0.32;
  return (
    <Svg width={w} height={h}>
      <Rect x={w * 0.44} y={h * 0.18} width={w * 0.12} height={h * 0.82} fill="#1B3550" />
      {Array.from({ length: 8 }, (_, i) => (
        <Line key={i} x1={w * 0.44} y1={h * (0.18 + i * 0.1)} x2={w * 0.56} y2={h * (0.28 + i * 0.1)} stroke="#2E5378" strokeWidth={1} />
      ))}
      <Rect x={0} y={0} width={w} height={h * 0.18} rx={3} fill="#22405E" />
      {[0, 1].map((r) =>
        [0, 1, 2, 3].map((c) => <Circle key={`${r}${c}`} cx={w * (0.14 + c * 0.24)} cy={h * (0.05 + r * 0.08)} r={w * 0.08} fill="#FFFBE0" />)
      )}
    </Svg>
  );
});

/** The pitch at the foot of the shot: mown stripes, the box and the penalty spot. */
const Pitch = memo(function Pitch({ w, h }: { w: number; h: number }) {
  const u = useId().replace(/:/g, '');
  return (
    <Svg width={w} height={h}>
      <Defs>
        <SvgLinearGradient id={`grGrass${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#1E8C45" />
          <Stop offset="1" stopColor="#0E5A2A" />
        </SvgLinearGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill={`url(#grGrass${u})`} />
      {Array.from({ length: 6 }, (_, i) => (
        <Rect key={i} x={(i * w) / 6} y={0} width={w / 12} height={h} fill="#FFFFFF" opacity={0.05} />
      ))}
      <Line x1={0} y1={h * 0.06} x2={w} y2={h * 0.06} stroke="#FFFFFF" strokeOpacity={0.7} strokeWidth={2} />
      <Rect x={w * 0.12} y={h * 0.06} width={w * 0.76} height={h * 0.62} fill="none" stroke="#FFFFFF" strokeOpacity={0.7} strokeWidth={2} />
      <Path d={`M ${w * 0.36} ${h * 0.68} Q ${w * 0.5} ${h * 0.95} ${w * 0.64} ${h * 0.68}`} fill="none" stroke="#FFFFFF" strokeOpacity={0.7} strokeWidth={2} />
      <Circle cx={w * 0.5} cy={h * 0.48} r={3} fill="#FFFFFF" />
    </Svg>
  );
});

/** The goal at the top of the pitch, seen from behind the penalty spot. */
const Goal = memo(function Goal({ w, h }: { w: number; h: number }) {
  return (
    <Svg width={w} height={h}>
      {Array.from({ length: 9 }, (_, i) => (
        <Line key={`v${i}`} x1={(i * w) / 8} y1={h * 0.1} x2={(i * w) / 8} y2={h} stroke="#FFFFFF" strokeOpacity={0.25} strokeWidth={1} />
      ))}
      {Array.from({ length: 5 }, (_, i) => (
        <Line key={`h${i}`} x1={0} y1={h * (0.1 + i * 0.225)} x2={w} y2={h * (0.1 + i * 0.225)} stroke="#FFFFFF" strokeOpacity={0.25} strokeWidth={1} />
      ))}
      <Rect x={0} y={0} width={w * 0.04} height={h} fill="#FFFFFF" />
      <Rect x={w * 0.96} y={0} width={w * 0.04} height={h} fill="#FFFFFF" />
      <Rect x={0} y={0} width={w} height={h * 0.1} fill="#FFFFFF" />
    </Svg>
  );
});

/** A classic black-and-white football, turned `spin` degrees. */
function Ball({ size, spin }: { size: number; spin: number }) {
  const u = useId().replace(/:/g, '');
  const c = size / 2;
  const r = size / 2 - 1;
  const patch = (cx: number, cy: number, pr: number, rot: number) =>
    Array.from({ length: 5 }, (_, i) => {
      const a = ((rot + i * 72 - 90) * Math.PI) / 180;
      return `${cx + Math.cos(a) * pr},${cy + Math.sin(a) * pr}`;
    }).join(' ');
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={`grBall${u}`} cx="38%" cy="32%" r="75%">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.7" stopColor="#E3E8F0" />
          <Stop offset="1" stopColor="#8E99AD" />
        </RadialGradient>
      </Defs>
      <Circle cx={c} cy={c} r={r} fill={`url(#grBall${u})`} />
      <G transform={`rotate(${spin} ${c} ${c})`}>
        <Polygon points={patch(c, c, r * 0.3, 0)} fill="#1A1F2B" />
        {Array.from({ length: 5 }, (_, i) => {
          const a = ((i * 72 - 90) * Math.PI) / 180;
          return <Polygon key={i} points={patch(c + Math.cos(a) * r * 0.82, c + Math.sin(a) * r * 0.82, r * 0.22, i * 72 + 36)} fill="#1A1F2B" />;
        })}
        {Array.from({ length: 5 }, (_, i) => {
          const a = ((i * 72 - 90) * Math.PI) / 180;
          return <Line key={i} x1={c + Math.cos(a) * r * 0.3} y1={c + Math.sin(a) * r * 0.3} x2={c + Math.cos(a) * r * 0.62} y2={c + Math.sin(a) * r * 0.62} stroke="#1A1F2B" strokeWidth={size * 0.025} />;
        })}
      </G>
      <Circle cx={c} cy={c} r={r} fill="none" stroke="#5C667A" strokeWidth={1} />
    </Svg>
  );
}

/** The keeper's glove clamping onto the ball, `t` seconds after the save. */
function Save({ size, t }: { size: number; t: number }) {
  const u = useId().replace(/:/g, '');
  const c = size / 2;
  const k = Math.min(1, t / 0.5);
  const ease = 1 - Math.pow(1 - k, 3);
  const g = size * 0.42 * (0.6 + 0.4 * ease);
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={`grFlash${u}`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.9} />
          <Stop offset="0.5" stopColor="#FFE36B" stopOpacity={0.45} />
          <Stop offset="1" stopColor="#FFE36B" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={c} cy={c} r={size * (0.15 + 0.3 * ease)} fill={`url(#grFlash${u})`} opacity={Math.max(0, 1 - k)} />
      <Circle cx={c} cy={c} r={size * (0.12 + 0.36 * ease)} fill="none" stroke="#FFFFFF" strokeWidth={2.5} opacity={Math.max(0, 0.8 - k)} />
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        const r0 = size * (0.2 + 0.12 * ease);
        const r1 = size * (0.26 + 0.2 * ease);
        return <Line key={i} x1={c + Math.cos(a) * r0} y1={c + Math.sin(a) * r0} x2={c + Math.cos(a) * r1} y2={c + Math.sin(a) * r1} stroke="#FFE9B0" strokeWidth={2} strokeLinecap="round" opacity={Math.max(0, 1 - k)} />;
      })}
      {/* Glove: palm, four fingers and a thumb wrapped over the ball */}
      <G opacity={Math.min(1, k * 3)}>
        <Rect x={c - g * 0.42} y={c - g * 0.05} width={g * 0.84} height={g * 0.62} rx={g * 0.2} fill="#1E9BFF" />
        {[0, 1, 2, 3].map((i) => (
          <Rect key={i} x={c - g * 0.42 + i * g * 0.215} y={c - g * 0.62} width={g * 0.19} height={g * 0.7} rx={g * 0.095} fill="#1E9BFF" stroke="#0B5FB3" strokeWidth={1.5} />
        ))}
        <Rect x={c + g * 0.32} y={c - g * 0.12} width={g * 0.2} height={g * 0.5} rx={g * 0.1} fill="#1E9BFF" stroke="#0B5FB3" strokeWidth={1.5} transform={`rotate(-35 ${c + g * 0.42} ${c + g * 0.13})`} />
        <Rect x={c - g * 0.42} y={c + g * 0.42} width={g * 0.84} height={g * 0.2} rx={g * 0.05} fill="#FFD23F" />
      </G>
    </Svg>
  );
}

/** Static ball-over-stadium art for the lobby tile. */
export function GoalRushTileArt({ size }: { size: number }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <StadiumBackdrop w={size} h={size} />
      <View style={{ position: 'absolute', left: 0, top: size * 0.3 }}>
        <CrowdTile w={size} h={size * 0.3} seed={7} rows={4} big={0.8} dim={1} />
      </View>
      <View style={{ position: 'absolute', left: 0, top: size * 0.6 }}>
        <Pitch w={size} h={size * 0.4} />
      </View>
      <View style={{ position: 'absolute', left: size * 0.52, top: size * 0.1 }}>
        <Ball size={size * 0.3} spin={20} />
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

export default function GoalRushScreen() {
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
  /** When this client saw the keeper save it; drives the save animation. */
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
    fetchGoalRushHistory(30)
      .then((h) => mountedRef.current && setHistory(h))
      .catch(() => {});
    fetchGoalRushMyBets()
      .then((b) => mountedRef.current && setMyBets(b.slice(0, 15)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchGoalRushConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => {});
    loadLists();
    return () => {
      mountedRef.current = false;
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [loadLists]);

  // Round polling, quicker while the ball is in the air.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;
    const loop = async () => {
      let delay = 700;
      try {
        const sentAt = Date.now();
        const v = await fetchGoalRushCurrentRound();
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

  // Smooth frames while the ball flies or the countdown runs.
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

  // Saved: refresh wallet and lists.
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
        const bet = await placeGoalRushBet(p.amount, p.autoOn ? p.autoAt : undefined);
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
        const res = await cashOutGoalRushBet(p.bet.id);
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

  // Auto cash-out: once the ball passes a panel's target, cash out (the
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
  const saveS = crashed && crashSeenRef.current ? (Date.now() - crashSeenRef.current) / 1000 : 0;
  // How far the camera has climbed, in px: speeds up the longer it flies.
  const climb = SH * (0.9 * flightS + 0.08 * flightS * flightS);
  const nearOff = (climb * 0.9) % SH;
  const farOff = (climb * 0.35) % SH;
  const pitchH = SH * 0.34;
  const pitchY = SH - pitchH + climb * 1.4;
  const goalW = SW * 0.3;
  const goalH = goalW * 0.42;
  const goalY = pitchY - goalH * 0.92;
  const lightH = SH * 0.55;
  const lightY = SH * 0.02 + climb * 0.12;
  // Ball: rests on the penalty spot, then is struck and settles into a gentle hover.
  const ballSize = SH * 0.2;
  const LIFT_S = 1.3;
  const lift = Math.min(1, flightS / LIFT_S);
  const ease = lift * lift * (3 - 2 * lift);
  const startX = SW * 0.5;
  const startY = SH - pitchH + pitchH * 0.48 - ballSize * 0.85;
  const hover = localPhase === 'FLYING' && lift >= 1 ? Math.sin(srvNow / 380) : 0;
  const cruiseX = SW * 0.62 + hover * SW * 0.01;
  const cruiseY = SH * 0.3 + hover * SH * 0.015;
  const ballX = startX + (cruiseX - startX) * ease;
  const ballY = startY + (cruiseY - startY) * ease;
  const ready = localPhase === 'BETTING' && view && flyStart - srvNow < 1500;
  const bob = ready ? Math.abs(Math.sin(srvNow / 120)) * -3 : 0;
  // Spins faster once it's in the air, and stops dead when it's caught.
  const spin = crashed ? (Math.log(view?.crashMultiplier ?? 1) / growth) * 540 : flightS * 540;
  const saveSize = SH * 0.55;
  const betLeft = localPhase === 'BETTING' ? Math.max(0, (flyStart - srvNow) / 1000) : 0;
  const betTotal = config?.bettingDurationSeconds ?? 6;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#062033', '#02101C']} style={StyleSheet.absoluteFill} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color="#FFFFFF" />
          <MaterialCommunityIcons name="soccer" size={22} color={GREEN} />
          <Text style={styles.title}>GOAL RUSH</Text>
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

        {/* Stadium scene */}
        <View style={[styles.scene, { width: SW, height: SH }]}>
          <StadiumBackdrop w={SW} h={SH} />
          {/* Far and near crowd layers, each two tiles stacked so they loop */}
          {[
            { off: farOff, seed: 11, rows: 10, big: 0.7, dim: 0.35 },
            { off: nearOff, seed: 23, rows: 5, big: 1.2, dim: 0.75 },
          ].map((L) => (
            <View key={L.seed} pointerEvents="none" style={[styles.crowdCol, { height: SH * 2, top: -SH + L.off }]}>
              <CrowdTile w={SW} h={SH} seed={L.seed} rows={L.rows} big={L.big} dim={L.dim} />
              <CrowdTile w={SW} h={SH} seed={L.seed} rows={L.rows} big={L.big} dim={L.dim} />
            </View>
          ))}
          {lightY < SH && (
            <>
              <View pointerEvents="none" style={{ position: 'absolute', left: SW * 0.02, top: lightY }}>
                <Floodlight h={lightH} />
              </View>
              <View pointerEvents="none" style={{ position: 'absolute', right: SW * 0.02, top: lightY }}>
                <Floodlight h={lightH} />
              </View>
            </>
          )}
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
          {goalY < SH && (
            <View pointerEvents="none" style={{ position: 'absolute', left: SW * 0.5 - goalW / 2, top: goalY }}>
              <Goal w={goalW} h={goalH} />
            </View>
          )}
          {pitchY < SH && (
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: pitchY, width: SW, height: pitchH }}>
              <Pitch w={SW} h={pitchH} />
            </View>
          )}

          {/* Ball with its flight trail, and the keeper's save where it was caught */}
          {localPhase === 'FLYING' && (
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(255,255,255,0)', 'rgba(127,255,170,0.12)', 'rgba(255,255,255,0.35)']}
              start={{ x: 0, y: 1 }}
              end={{ x: 1, y: 0 }}
              style={{ position: 'absolute', left: ballX - SW * 0.32, top: ballY + ballSize * 0.5, width: SW * 0.32, height: ballSize * 0.35, borderRadius: ballSize, transform: [{ rotate: '-28deg' }] }}
            />
          )}
          <View pointerEvents="none" style={{ position: 'absolute', left: ballX - ballSize / 2, top: ballY + bob }}>
            <Ball size={ballSize} spin={spin} />
          </View>
          {crashed && saveS < 1.6 && (
            <View pointerEvents="none" style={{ position: 'absolute', left: ballX - saveSize / 2, top: ballY + ballSize * 0.8 - saveSize / 2 }}>
              <Save size={saveSize} t={saveS} />
            </View>
          )}

          {/* Multiplier */}
          {localPhase !== 'BETTING' && (
            <View pointerEvents="none" style={styles.multWrap}>
              {crashed && <Text style={styles.boomText}>SAVED!</Text>}
              <Text style={[styles.bigMult, { fontSize: SH * 0.19, color: crashed ? '#FF4F6D' : '#FFFFFF', textShadowColor: crashed ? 'rgba(0,0,0,0.6)' : multColor(liveMult) }]}>
                {liveMult.toFixed(2)}x
              </Text>
            </View>
          )}

          {localPhase === 'BETTING' && (
            <View pointerEvents="none" style={styles.nextWrap}>
              <Text style={styles.nextText}>NEXT KICK IN</Text>
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
            sub = 'bet next kick';
            colors = ['#FF5A6A', '#C21F31'];
          } else if (p.cashedAt) {
            label = 'CASHED OUT';
            sub = `@ ${p.cashedAt.toFixed(2)}x`;
            colors = ['#3A4A7A', '#26335C'];
          } else if (lostBet) {
            label = 'SAVED';
            sub = `-₹${Number(p.bet!.amount).toFixed(2)}`;
            colors = ['#5A2A3A', '#3A1422'];
          } else if (p.bet) {
            label = 'WAITING';
            sub = 'for the kick';
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

  scene: { alignSelf: 'center', borderRadius: 18, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(47,224,122,0.45)' },
  crowdCol: { position: 'absolute', left: 0, right: 0 },
  multWrap: { position: 'absolute', top: '6%', left: 0, right: 0, alignItems: 'center' },
  bigMult: { fontWeight: '900', fontStyle: 'italic', letterSpacing: -1, textShadowRadius: 16, textShadowOffset: { width: 0, height: 0 } },
  boomText: { color: '#FFD6A0', fontSize: 16, fontWeight: '900', letterSpacing: 3, textShadowColor: '#000', textShadowRadius: 6, marginBottom: -4 },
  nextWrap: { position: 'absolute', top: '8%', alignSelf: 'center', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 16, backgroundColor: 'rgba(5,10,30,0.6)' },
  nextText: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '900', letterSpacing: 2 },
  countText: { color: GOLD, fontSize: 34, fontWeight: '900', marginTop: 2 },
  countTrack: { width: 160, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden', marginTop: 6 },
  countFill: { height: '100%', backgroundColor: GREEN, borderRadius: 4 },

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
