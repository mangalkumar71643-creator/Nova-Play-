import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient as SvgLinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { ApiClientError } from '../api/client';
import {
  AviatorBetResult,
  AviatorHistoryEntry,
  SkyJetConfig,
  SkyJetJackpotInfo,
  SkyJetMyBet,
  SkyJetRoundView,
  cashOutSkyJetBet,
  fetchSkyJetConfig,
  fetchSkyJetCurrentRound,
  fetchSkyJetHistory,
  fetchSkyJetJackpot,
  fetchSkyJetMyBets,
  placeSkyJetBet,
} from '../api/backend';
import { useGameState } from '../state/GameStateContext';
import GameInfoButton from '../components/GameInfoButton';

const GOLD = '#FFD66B';
const AMBER = '#FFB23F';
const SKY = '#4FC3FF';
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
  if (m < 2) return SKY;
  if (m < 10) return '#B06CFF';
  return GOLD;
}

function mix(a: string, b: string, t: number): string {
  const p = (c: string, i: number) => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
  const k = Math.max(0, Math.min(1, t));
  return `#${[0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * k).toString(16).padStart(2, '0')).join('')}`;
}

function ramp(stops: string[], t: number): string {
  const k = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(k));
  return mix(stops[i], stops[i + 1], k - i);
}

function seeded(seed: number) {
  let x = seed;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}

function inr(n: number): string {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ---------- scene ----------
// The jet sits at the end of a runway at golden hour, lights the
// afterburner and climbs: the runway falls away, cloud banks stream past
// below and behind, and the sky darkens from sunset through the
// stratosphere into near-space, where stars and an aurora come out. When
// the round ends the jet is hit and goes up in a fireball.

/** The jet, side-on, nose right. */
const Jet = memo(function Jet({ size }: { size: number }) {
  const u = useId().replace(/:/g, '');
  return (
    <Svg width={size} height={size * 0.42} viewBox="0 0 120 50">
      <Defs>
        <SvgLinearGradient id={`sjBody${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#E8EEF6" />
          <Stop offset="0.45" stopColor="#9AA8BC" />
          <Stop offset="1" stopColor="#4A566A" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`sjCan${u}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFF2B8" />
          <Stop offset="0.4" stopColor="#FFB23F" />
          <Stop offset="1" stopColor="#5A2A0A" />
        </SvgLinearGradient>
      </Defs>
      {/* Far wing and tailplane */}
      <Path d="M52 26 L 36 10 L 46 10 L 68 24 Z" fill="#5A667A" />
      <Path d="M14 22 L 4 14 L 10 14 L 22 21 Z" fill="#5A667A" />
      {/* Fuselage */}
      <Path d="M8 24 C 20 18, 60 16, 92 18 C 104 19, 114 22, 119 25 C 114 28, 104 30, 92 31 C 60 32, 20 31, 8 28 Z" fill={`url(#sjBody${u})`} stroke="#2A3242" strokeWidth={1.2} />
      {/* Intake and panel lines */}
      <Path d="M56 27 L 72 26 L 72 31 L 58 31 Z" fill="#2A3242" />
      <Path d="M30 21 L 30 30 M76 19 L 76 31" stroke="#2A3242" strokeWidth={0.6} opacity={0.6} />
      {/* Canopy */}
      <Path d="M80 18 C 86 11, 98 11, 104 19 C 96 19, 88 19, 80 18 Z" fill={`url(#sjCan${u})`} stroke="#2A3242" strokeWidth={1} />
      {/* Fin */}
      <Path d="M10 22 L 4 4 L 14 4 L 28 20 Z" fill={`url(#sjBody${u})`} stroke="#2A3242" strokeWidth={1} />
      <Rect x={7} y={7} width={6} height={3} fill="#E8132B" />
      {/* Near wing and tailplane */}
      <Path d="M48 28 L 30 44 L 42 44 L 70 29 Z" fill={`url(#sjBody${u})`} stroke="#2A3242" strokeWidth={1} />
      <Path d="M14 27 L 6 36 L 13 36 L 24 28 Z" fill={`url(#sjBody${u})`} stroke="#2A3242" strokeWidth={1} />
      {/* Nozzle */}
      <Rect x={2} y={22} width={8} height={7} rx={2} fill="#3A3A42" />
    </Svg>
  );
});

/** Afterburner cone; `power` 0…1.3 sets its length, `flick` 0…1 makes it waver. */
function Afterburner({ h, power, flick }: { h: number; power: number; flick: number }) {
  const u = useId().replace(/:/g, '');
  const len = h * (1.2 + power * 3) * (0.9 + flick * 0.2);
  return (
    <Svg width={len + 4} height={h}>
      <Defs>
        <SvgLinearGradient id={`sjAb${u}`} x1="1" y1="0" x2="0" y2="0">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.2" stopColor="#8AE8FF" />
          <Stop offset="0.55" stopColor="#FF9A3C" />
          <Stop offset="1" stopColor="#FF3A6A" stopOpacity={0} />
        </SvgLinearGradient>
      </Defs>
      <Path d={`M${len + 4} ${h * 0.1} C ${len * 0.6} ${h * 0.05}, ${len * 0.2} ${h * 0.35}, 0 ${h / 2} C ${len * 0.2} ${h * 0.65}, ${len * 0.6} ${h * 0.95}, ${len + 4} ${h * 0.9} Z`} fill={`url(#sjAb${u})`} />
      {[0.82, 0.64, 0.46].map((x, i) => (
        <Ellipse key={x} cx={len * x} cy={h / 2} rx={h * 0.12} ry={h * (0.3 - i * 0.06)} fill="#FFFFFF" opacity={0.55 - i * 0.12} />
      ))}
    </Svg>
  );
}

/** A cloud bank tile; tiles stack and scroll as the jet climbs. */
const CloudTile = memo(function CloudTile({ w, h, seed, tint, alpha }: { w: number; h: number; seed: number; tint: string; alpha: number }) {
  const clouds = useMemo(() => {
    const rnd = seeded(seed);
    return Array.from({ length: 5 }, () => {
      const cx = rnd() * w;
      const cy = rnd() * h;
      const s = 0.6 + rnd() * 0.8;
      return { cx, cy, s, puffs: Array.from({ length: 5 }, (_, k) => ({ dx: (k - 2) * 22 * s + (rnd() - 0.5) * 10, dy: (rnd() - 0.5) * 10 * s, r: (16 + rnd() * 14) * s })) };
    });
  }, [w, h, seed]);
  return (
    <Svg width={w} height={h}>
      {clouds.map((c, i) => (
        <G key={i} opacity={alpha}>
          {c.puffs.map((p, k) => (
            <Circle key={k} cx={c.cx + p.dx} cy={c.cy + p.dy} r={p.r} fill={tint} />
          ))}
          <Ellipse cx={c.cx} cy={c.cy + 10 * c.s} rx={60 * c.s} ry={10 * c.s} fill={tint} />
        </G>
      ))}
    </Svg>
  );
});

/** The runway at take-off: tarmac in perspective, centre line and edge lights. */
const Runway = memo(function Runway({ w, h }: { w: number; h: number }) {
  const u = useId().replace(/:/g, '');
  return (
    <Svg width={w} height={h}>
      <Defs>
        <SvgLinearGradient id={`sjGround${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#5A4A3A" />
          <Stop offset="1" stopColor="#1A140E" />
        </SvgLinearGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill={`url(#sjGround${u})`} />
      <Path d={`M${w * 0.42} 0 L ${w * 0.58} 0 L ${w * 1.1} ${h} L ${-w * 0.1} ${h} Z`} fill="#2A2C34" />
      {Array.from({ length: 6 }, (_, i) => {
        const t0 = (i + 0.2) / 6;
        const t1 = (i + 0.55) / 6;
        return <Path key={i} d={`M${w * 0.5} ${h * t0 * t0} L ${w * 0.5} ${h * t1 * t1}`} stroke="#FFFFFF" strokeWidth={1 + t1 * 4} opacity={0.85} />;
      })}
      {Array.from({ length: 8 }, (_, i) => {
        const t = (i + 0.5) / 8;
        return (
          <G key={i}>
            <Circle cx={w * (0.42 - 0.52 * t)} cy={h * t} r={1 + t * 2.5} fill="#FFD66B" />
            <Circle cx={w * (0.58 + 0.52 * t)} cy={h * t} r={1 + t * 2.5} fill="#FFD66B" />
          </G>
        );
      })}
    </Svg>
  );
});

/** The fireball where the jet was hit, `t` seconds after. */
function Explosion({ size, t }: { size: number; t: number }) {
  const u = useId().replace(/:/g, '');
  const c = size / 2;
  const k = Math.min(1, t / 0.9);
  const e = 1 - Math.pow(1 - k, 3);
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={`sjBoom${u}`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.3" stopColor="#FFE36B" />
          <Stop offset="0.6" stopColor="#FF6A1A" />
          <Stop offset="1" stopColor="#8A1A0A" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={c} cy={c} r={size * (0.12 + 0.38 * e)} fill={`url(#sjBoom${u})`} opacity={Math.max(0, 1 - k * 0.8)} />
      <Circle cx={c} cy={c} r={size * (0.1 + 0.42 * e)} fill="none" stroke="#FFFFFF" strokeWidth={2} opacity={Math.max(0, 0.8 - k)} />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2 + i;
        const r = size * (0.08 + 0.45 * e) * (0.7 + (i % 3) * 0.15);
        return <Rect key={i} x={c + Math.cos(a) * r} y={c + Math.sin(a) * r + t * t * 30} width={4} height={2} fill="#3A3A42" transform={`rotate(${i * 40 + t * 400} ${c + Math.cos(a) * r} ${c + Math.sin(a) * r})`} />;
      })}
      {Array.from({ length: 5 }, (_, i) => (
        <Circle key={`s${i}`} cx={c + (i - 2) * size * 0.08} cy={c - size * 0.1 * e - i * 3} r={size * (0.05 + 0.08 * e)} fill="#2A2A2E" opacity={Math.max(0, 0.6 * k - 0.1) * (1 - k * 0.5)} />
      ))}
    </Svg>
  );
}

/** Lobby tile: the jet climbing over golden clouds under a gold jackpot band. */
export function SkyJetTileArt({ size }: { size: number }) {
  const u = useId().replace(/:/g, '');
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={size} height={size}>
        <Defs>
          <SvgLinearGradient id={`sjTile${u}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#0A1A4A" />
            <Stop offset="0.55" stopColor="#E86A3A" />
            <Stop offset="1" stopColor="#FFC870" />
          </SvgLinearGradient>
        </Defs>
        <Rect x={0} y={0} width={size} height={size} fill={`url(#sjTile${u})`} />
        {[0.15, 0.5, 0.82].map((x, i) => (
          <G key={x}>
            <Circle cx={size * x} cy={size * (0.8 + (i % 2) * 0.05)} r={size * 0.13} fill="#FFE8D0" opacity={0.85} />
            <Circle cx={size * (x + 0.1)} cy={size * (0.84 + (i % 2) * 0.05)} r={size * 0.1} fill="#FFE8D0" opacity={0.85} />
          </G>
        ))}
        <Line x1={0} y1={size * 0.78} x2={size * 0.36} y2={size * 0.52} stroke="#FFFFFF" strokeWidth={3} opacity={0.5} strokeLinecap="round" />
      </Svg>
      <View style={{ position: 'absolute', left: size * 0.2, top: size * 0.28, transform: [{ rotate: '-30deg' }] }}>
        <Jet size={size * 0.7} />
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

export default function SkyJetScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<SkyJetConfig | null>(null);
  const [view, setView] = useState<SkyJetRoundView | null>(null);
  const [history, setHistory] = useState<AviatorHistoryEntry[]>([]);
  const [myBets, setMyBets] = useState<SkyJetMyBet[]>([]);
  const [jackpot, setJackpot] = useState<SkyJetJackpotInfo | null>(null);
  const [jackpotWin, setJackpotWin] = useState<number | null>(null);
  const [panels, setPanels] = useState<[PanelState, PanelState]>([initialPanel(10), initialPanel(20)]);
  const [toast, setToast] = useState<{ text: string; good: boolean } | null>(null);
  const [, setFrame] = useState(0);

  const offsetRef = useRef(0);
  const mountedRef = useRef(true);
  const panelsRef = useRef(panels);
  panelsRef.current = panels;
  const periodRef = useRef<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** When this client saw the jet hit; drives the explosion. */
  const crashSeenRef = useRef(0);
  /** Jackpot wins already shown, so each is celebrated once. */
  const seenJackpots = useRef<Set<string> | null>(null);
  const jpAnim = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;

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

  const celebrate = useCallback(
    (amount: number) => {
      setJackpotWin(amount);
      jpAnim.setValue(0);
      Animated.sequence([
        Animated.spring(jpAnim, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }),
        Animated.delay(2600),
        Animated.timing(jpAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start(() => mountedRef.current && setJackpotWin(null));
    },
    [jpAnim]
  );

  const loadLists = useCallback(() => {
    fetchSkyJetHistory(30)
      .then((h) => mountedRef.current && setHistory(h))
      .catch(() => {});
    fetchSkyJetJackpot()
      .then((j) => mountedRef.current && setJackpot(j))
      .catch(() => {});
    fetchSkyJetMyBets()
      .then((b) => {
        if (!mountedRef.current) return;
        setMyBets(b.slice(0, 15));
        // Celebrate a jackpot this player has just won (not ones from before the screen opened).
        const won = b.filter((x) => Number(x.jackpotPayout) > 0);
        if (seenJackpots.current === null) {
          seenJackpots.current = new Set(won.map((x) => x.id));
          return;
        }
        const fresh = won.filter((x) => !seenJackpots.current!.has(x.id));
        fresh.forEach((x) => seenJackpots.current!.add(x.id));
        if (fresh.length) {
          celebrate(fresh.reduce((s, x) => s + Number(x.jackpotPayout), 0));
          refreshWallet();
        }
      })
      .catch(() => {});
  }, [celebrate, refreshWallet]);

  useEffect(() => {
    mountedRef.current = true;
    fetchSkyJetConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => {});
    loadLists();
    const glint = Animated.loop(Animated.timing(shimmer, { toValue: 1, duration: 2200, easing: Easing.linear, useNativeDriver: true }));
    glint.start();
    return () => {
      mountedRef.current = false;
      glint.stop();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [loadLists, shimmer]);

  // Round polling, quicker while the jet flies.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;
    const loop = async () => {
      let delay = 700;
      try {
        const sentAt = Date.now();
        const v = await fetchSkyJetCurrentRound();
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

  // Hit: refresh wallet and lists (the jackpot draws happen then).
  const crashedPeriod = view?.phase === 'CRASHED' ? view.periodNumber : null;
  useEffect(() => {
    if (!crashedPeriod) return;
    crashSeenRef.current = Date.now();
    setTimeout(() => {
      if (!mountedRef.current) return;
      refreshWallet();
      loadLists();
    }, 700);
  }, [crashedPeriod, refreshWallet, loadLists]);

  const placeBet = useCallback(
    async (i: 0 | 1, fromQueue = false) => {
      const p = panelsRef.current[i];
      if (p.busy || (p.bet && !fromQueue)) return;
      if (p.amount > coins && !fromQueue) return showToast('Insufficient balance');
      setPanel(i, { busy: true });
      try {
        const bet = await placeSkyJetBet(p.amount, p.autoOn ? p.autoAt : undefined);
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
        const res = await cashOutSkyJetBet(p.bet.id);
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
  const SH = Math.min(SW * 0.82, 350);
  const crashed = localPhase === 'CRASHED';
  const flightS = localPhase === 'BETTING' ? 0 : crashed && view?.crashMultiplier ? Math.log(view.crashMultiplier) / growth : elapsed;
  const boomS = crashed && crashSeenRef.current ? (Date.now() - crashSeenRef.current) / 1000 : 0;
  const climb = SH * (0.9 * flightS + 0.08 * flightS * flightS);
  const alt = Math.log(Math.max(1, liveMult)) / Math.log(60);
  const skyTop = ramp(['#1A2A6A', '#0A1A4A', '#04082A', '#02020E'], alt);
  const skyBottom = ramp(['#FF9A5A', '#E86A6A', '#3A2A7A', '#0A1030'], alt);
  const cloudTint = ramp(['#FFE8D8', '#F4D8E8', '#B8C0E8', '#6A7098'], alt);
  const starAlpha = Math.max(0, Math.min(1, (alt - 0.35) / 0.4));
  const aurora = Math.max(0, Math.min(1, (alt - 0.6) / 0.3));
  const near = (climb * 1.0) % SH;
  const far = (climb * 0.4) % SH;
  const runwayH = SH * 0.4;
  const runwayY = SH - runwayH + climb * 1.3;
  const jetW = SW * 0.34;
  const jetH = jetW * 0.42;
  const LIFT_S = 1.4;
  const lift = Math.min(1, flightS / LIFT_S);
  const ease = lift * lift * (3 - 2 * lift);
  const padX = SW * 0.28 - jetW / 2;
  const padY = SH - runwayH * 0.55 - jetH * 0.7;
  const hover = localPhase === 'FLYING' && lift >= 1 ? Math.sin(srvNow / 420) : 0;
  const cruiseX = SW * 0.5 - jetW / 2 + hover * SW * 0.01;
  const cruiseY = SH * 0.45 + hover * SH * 0.02;
  const jetX = padX + (cruiseX - padX) * ease;
  const jetY = padY + (cruiseY - padY) * ease;
  const tilt = localPhase === 'BETTING' ? 0 : -22 * ease + hover * 2;
  const ready = localPhase === 'BETTING' && view && flyStart - srvNow < 1500;
  const shake = ready ? Math.sin(srvNow / 25) * 1.2 : 0;
  const flick = (Math.sin(srvNow / 31) + Math.sin(srvNow / 19)) / 4 + 0.5;
  const power = localPhase === 'FLYING' ? Math.min(1.3, 0.8 + flightS * 0.03) : ready ? 0.3 : 0.05;
  const betLeft = localPhase === 'BETTING' ? Math.max(0, (flyStart - srvNow) / 1000) : 0;
  const betTotal = config?.bettingDurationSeconds ?? 6;
  const altitudeFt = Math.round(climb * 2.5);
  const abH = jetH * 0.22;
  const stars = useMemo(() => {
    const rnd = seeded(41);
    return Array.from({ length: 50 }, () => ({ x: rnd(), y: rnd() * 0.7, r: 0.5 + rnd() * 1.1 }));
  }, []);
  const pool = view?.jackpot ?? jackpot?.amount ?? 0;
  const glintX = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-80, W] });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#0A1230', '#020410']} style={StyleSheet.absoluteFill} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color="#FFFFFF" />
          <MaterialCommunityIcons name="airplane-takeoff" size={20} color={AMBER} />
          <Text style={styles.title}>SKY JET</Text>
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
        {/* Jackpot meter */}
        <View style={[styles.jackpot, { width: SW }]}>
          <LinearGradient colors={['#3A2604', '#1A1002']} style={[StyleSheet.absoluteFill, { borderRadius: 14 }]} />
          <Animated.View pointerEvents="none" style={[styles.glint, { transform: [{ translateX: glintX }, { rotate: '20deg' }] }]} />
          <MaterialCommunityIcons name="crown" size={22} color={GOLD} />
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.jackpotLabel}>JACKPOT</Text>
            <Text style={styles.jackpotValue}>{inr(pool)}</Text>
          </View>
          <MaterialCommunityIcons name="crown" size={22} color={GOLD} />
        </View>
        {jackpot && jackpot.wins.length > 0 && (
          <Text style={styles.jackpotWins} numberOfLines={1}>
            Last jackpots: {jackpot.wins.slice(0, 3).map((w) => `${w.player} ${inr(Number(w.amount))}`).join('  ·  ')}
          </Text>
        )}

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

        {/* Sky scene */}
        <View style={[styles.scene, { width: SW, height: SH }]}>
          <LinearGradient colors={[skyTop, skyBottom]} style={StyleSheet.absoluteFill} />
          {starAlpha > 0 && (
            <Svg width={SW} height={SH} style={[StyleSheet.absoluteFill, { opacity: starAlpha }]} pointerEvents="none">
              {stars.map((s, i) => (
                <Circle key={i} cx={s.x * SW} cy={s.y * SH} r={s.r} fill="#FFFFFF" opacity={0.5 + ((i * 7) % 5) / 10} />
              ))}
            </Svg>
          )}
          {aurora > 0 && (
            <Svg width={SW} height={SH} style={[StyleSheet.absoluteFill, { opacity: aurora * 0.8 }]} pointerEvents="none">
              <Defs>
                <SvgLinearGradient id="sjAur" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#5CFFB0" stopOpacity={0} />
                  <Stop offset="0.6" stopColor="#5CFFB0" stopOpacity={0.5} />
                  <Stop offset="1" stopColor="#B06CFF" stopOpacity={0} />
                </SvgLinearGradient>
              </Defs>
              {[0, 1].map((k) => (
                <Path
                  key={k}
                  d={`M0 ${SH * (0.18 + k * 0.1)} C ${SW * 0.25} ${SH * (0.05 + k * 0.1) + Math.sin(srvNow / 900 + k) * 10}, ${SW * 0.6} ${SH * (0.35 + k * 0.05)}, ${SW} ${SH * (0.15 + k * 0.1)} L ${SW} ${SH * (0.38 + k * 0.1)} C ${SW * 0.6} ${SH * (0.55 + k * 0.05)}, ${SW * 0.25} ${SH * (0.25 + k * 0.1)}, 0 ${SH * (0.4 + k * 0.1)} Z`}
                  fill="url(#sjAur)"
                />
              ))}
            </Svg>
          )}
          {/* Cloud banks, far then near, each two tiles stacked so they loop */}
          {[
            { off: far, seed: 3, a: 0.45 },
            { off: near, seed: 19, a: 0.85 },
          ].map((L) => (
            <View key={L.seed} pointerEvents="none" style={[styles.cloudCol, { height: SH * 2, top: -SH + L.off }]}>
              <CloudTile w={SW} h={SH} seed={L.seed} tint={cloudTint} alpha={L.a * (1 - aurora * 0.6)} />
              <CloudTile w={SW} h={SH} seed={L.seed} tint={cloudTint} alpha={L.a * (1 - aurora * 0.6)} />
            </View>
          ))}
          {runwayY < SH && (
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: runwayY }}>
              <Runway w={SW} h={runwayH} />
            </View>
          )}
          {/* Contrail */}
          {localPhase === 'FLYING' && (
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.18)', 'rgba(255,255,255,0.5)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ position: 'absolute', left: jetX - SW * 0.55, top: jetY + jetH * 0.52, width: SW * 0.58, height: jetH * 0.16, borderRadius: jetH, transform: [{ rotate: `${tilt}deg` }], transformOrigin: 'right' }}
            />
          )}
          {/* Jet with afterburner */}
          {!crashed && (
            <View pointerEvents="none" style={{ position: 'absolute', left: jetX + shake, top: jetY, width: jetW, height: jetH, transform: [{ rotate: `${tilt}deg` }] }}>
              <View style={{ position: 'absolute', right: jetW * 0.985, top: jetH * 0.51 - abH / 2 }}>
                <Afterburner h={abH} power={power} flick={flick} />
              </View>
              <Jet size={jetW} />
            </View>
          )}
          {crashed && boomS < 1.6 && (
            <View pointerEvents="none" style={{ position: 'absolute', left: jetX + jetW / 2 - SH * 0.3, top: jetY + jetH / 2 - SH * 0.3 }}>
              <Explosion size={SH * 0.6} t={boomS} />
            </View>
          )}

          <View pointerEvents="none" style={styles.gauge}>
            <MaterialCommunityIcons name="altimeter" size={12} color={AMBER} />
            <Text style={styles.gaugeText}>ALT {localPhase === 'BETTING' ? '0' : altitudeFt.toLocaleString()} ft</Text>
          </View>

          {crashed && boomS < 0.3 && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,200,120,0.35)' }]} />}

          {localPhase !== 'BETTING' && (
            <View pointerEvents="none" style={styles.multWrap}>
              {crashed && <Text style={styles.boomText}>JET DOWN!</Text>}
              <Text style={[styles.bigMult, { fontSize: SH * 0.18, color: crashed ? '#FF4F6D' : '#FFFFFF', textShadowColor: crashed ? 'rgba(0,0,0,0.6)' : multColor(liveMult) }]}>
                {liveMult.toFixed(2)}x
              </Text>
            </View>
          )}

          {localPhase === 'BETTING' && (
            <View pointerEvents="none" style={styles.nextWrap}>
              <Text style={styles.nextText}>TAKE-OFF IN</Text>
              <Text style={styles.countText}>{betLeft.toFixed(1)}s</Text>
              <View style={styles.countTrack}>
                <View style={[styles.countFill, { width: `${Math.min(100, (betLeft / betTotal) * 100)}%` }]} />
              </View>
            </View>
          )}
        </View>

        {/* Two bet panels, cockpit style */}
        {([0, 1] as const).map((i) => {
          const p = panels[i];
          const live = p.bet && localPhase === 'FLYING' && !p.cashedAt;
          const lostBet = p.bet && crashed && !p.cashedAt;
          let label = 'BET';
          let sub = `₹${p.amount.toFixed(2)}`;
          let colors: [string, string] = ['#2FA8FF', '#0E5AB8'];
          if (live) {
            label = 'CASH OUT';
            sub = `₹${round2(Number(p.bet!.amount) * liveMult).toFixed(2)}`;
            colors = ['#FFB23F', '#E07A10'];
          } else if (p.queued) {
            label = 'CANCEL';
            sub = 'bet next flight';
            colors = ['#FF5A6A', '#C21F31'];
          } else if (p.cashedAt) {
            label = 'CASHED OUT';
            sub = `@ ${p.cashedAt.toFixed(2)}x`;
            colors = ['#2A3448', '#1A2232'];
          } else if (lostBet) {
            label = 'JET DOWN';
            sub = `-₹${Number(p.bet!.amount).toFixed(2)}`;
            colors = ['#5A2A3A', '#3A1422'];
          } else if (p.bet) {
            label = 'WAITING';
            sub = 'for take-off';
            colors = ['#2A3448', '#1A2232'];
          }
          const locked = !!p.bet || p.queued;
          return (
            <View key={i} style={styles.panel}>
              <LinearGradient colors={['#20262E', '#12161C']} style={[StyleSheet.absoluteFill, { borderRadius: 16 }]} />
              {[0, 1, 2, 3].map((k) => (
                <View key={k} style={[styles.rivet, { left: k % 2 ? undefined : 5, right: k % 2 ? 5 : undefined, top: k < 2 ? 5 : undefined, bottom: k < 2 ? undefined : 5 }]} />
              ))}
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
                    trackColor={{ true: AMBER, false: '#3A3F4C' }}
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
                  <Text style={styles.mainLabel} numberOfLines={1} adjustsFontSizeToFit>
                    {p.busy ? '…' : label}
                  </Text>
                  <Text style={styles.mainSub}>{sub}</Text>
                </LinearGradient>
              </Pressable>
            </View>
          );
        })}

        <Text style={styles.helpText}>
          {config ? `${config.jackpotSharePercent}%` : '1%'} of every bet feeds the jackpot. After each flight every bet gets one draw — win or lose — and the chance grows with the stake (₹10 is 1 in{' '}
          {config ? Math.round(config.jackpotOddsStake / 10).toLocaleString() : '5,000'}).
        </Text>

        {/* My bets */}
        <Text style={styles.sectionTitle}>MY BETS</Text>
        {myBets.length === 0 ? (
          <Text style={styles.emptyText}>No bets yet — place one above.</Text>
        ) : (
          myBets.map((b) => {
            const won = b.status === 'WON';
            const pending = b.status === 'PENDING';
            const jp = Number(b.jackpotPayout);
            return (
              <View key={b.id} style={styles.betRow}>
                <Text style={styles.betTime}>{new Date(b.createdAt).toLocaleTimeString()}</Text>
                <Text style={styles.betAmt}>₹{Number(b.amount).toFixed(2)}</Text>
                <Text style={[styles.betMult, { color: won ? '#8AD8FF' : pending ? '#FFFFFF' : '#FF7A8A' }]}>
                  {won ? `${Number(b.cashoutMultiplier).toFixed(2)}x` : pending ? '—' : `${Number(b.round.crashMultiplier).toFixed(2)}x`}
                </Text>
                <Text style={[styles.betWin, { color: jp > 0 ? GOLD : won ? '#8AD8FF' : '#8A8FA8' }]}>
                  {won ? `+₹${Number(b.payout).toFixed(2)}` : pending ? 'live' : '—'}
                  {jp > 0 ? `\n👑 +₹${jp.toFixed(2)}` : ''}
                </Text>
              </View>
            );
          })
        )}
        <GameInfoButton>
          Provably fair · RTP {config ? 100 - config.houseEdgePercent : 88}% incl. jackpot · bet ₹{minStake}–₹{maxStake} · max win ₹{config?.maxPayout ?? 10000} per bet
        </GameInfoButton>
      </ScrollView>

      {jackpotWin !== null && (
        <Animated.View pointerEvents="none" style={[styles.jpOverlay, { opacity: jpAnim, transform: [{ scale: jpAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }]}>
          <LinearGradient colors={['#FFF4B8', '#FFC93C', '#B87800']} style={styles.jpCard}>
            <MaterialCommunityIcons name="crown" size={40} color="#5A3A00" />
            <Text style={styles.jpTitle}>JACKPOT!</Text>
            <Text style={styles.jpAmount}>+{inr(jackpotWin)}</Text>
          </LinearGradient>
        </Animated.View>
      )}

      {toast && (
        <View pointerEvents="none" style={[styles.toast, toast.good && styles.toastGood]}>
          <Text style={[styles.toastText, toast.good && { color: '#062A4A' }]}>{toast.text}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#020410' },
  topBar: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', fontStyle: 'italic', letterSpacing: 2 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  balancePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.4)' },
  balanceText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  depositBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: GOLD },

  jackpot: { alignSelf: 'center', height: 56, borderRadius: 14, borderWidth: 2, borderColor: GOLD, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, overflow: 'hidden', marginTop: 2 },
  glint: { position: 'absolute', top: -20, width: 40, height: 100, backgroundColor: 'rgba(255,255,255,0.18)' },
  jackpotLabel: { color: GOLD, fontSize: 10, fontWeight: '900', letterSpacing: 4 },
  jackpotValue: { color: '#FFF4C8', fontSize: 24, fontWeight: '900', fontVariant: ['tabular-nums'], textShadowColor: '#FFB23F', textShadowRadius: 10 },
  jackpotWins: { color: 'rgba(255,214,107,0.75)', fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 4, marginHorizontal: 14 },

  histRow: { gap: 6, paddingHorizontal: 10, paddingVertical: 6 },
  histChip: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 12, borderWidth: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  histText: { fontSize: 12, fontWeight: '900' },

  scene: { alignSelf: 'center', borderRadius: 18, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,178,63,0.5)' },
  cloudCol: { position: 'absolute', left: 0, right: 0 },
  gauge: { position: 'absolute', left: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: 'rgba(0,0,10,0.6)', borderWidth: 1, borderColor: 'rgba(255,178,63,0.45)' },
  gaugeText: { color: AMBER, fontSize: 12, fontWeight: '900', fontVariant: ['tabular-nums'] },
  multWrap: { position: 'absolute', top: '6%', left: 0, right: 0, alignItems: 'center' },
  bigMult: { fontWeight: '900', fontStyle: 'italic', letterSpacing: -1, textShadowRadius: 16, textShadowOffset: { width: 0, height: 0 } },
  boomText: { color: '#FFD6A0', fontSize: 16, fontWeight: '900', letterSpacing: 3, textShadowColor: '#000', textShadowRadius: 6, marginBottom: -4 },
  nextWrap: { position: 'absolute', top: '7%', alignSelf: 'center', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 16, backgroundColor: 'rgba(5,10,30,0.6)', borderWidth: 1, borderColor: 'rgba(255,178,63,0.35)' },
  nextText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '900', letterSpacing: 2 },
  countText: { color: GOLD, fontSize: 34, fontWeight: '900', marginTop: 2 },
  countTrack: { width: 160, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden', marginTop: 6 },
  countFill: { height: '100%', backgroundColor: AMBER, borderRadius: 4 },

  panel: { flexDirection: 'row', gap: 10, marginHorizontal: 10, marginTop: 10, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,178,63,0.25)', overflow: 'hidden' },
  rivet: { position: 'absolute', width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#5A6272' },
  panelLeft: { flex: 1, gap: 6 },
  stakeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 20, padding: 3, borderWidth: 1, borderColor: 'rgba(255,178,63,0.2)' },
  roundBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  stakeText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  quickRow: { flexDirection: 'row', gap: 4 },
  quick: { flex: 1, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  quickOn: { backgroundColor: 'rgba(255,178,63,0.22)', borderWidth: 1, borderColor: AMBER },
  quickText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  autoRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  autoLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '800' },
  miniBtn: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  autoValue: { color: GOLD, fontSize: 13, fontWeight: '900', minWidth: 48, textAlign: 'center' },
  mainWrap: { width: '42%' },
  mainBtn: { flex: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 4 },
  mainLabel: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', letterSpacing: 1 },
  mainSub: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '800', marginTop: 2 },
  pressed: { transform: [{ scale: 0.97 }] },
  dim: { opacity: 0.4 },
  helpText: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginHorizontal: 14, marginTop: 8, lineHeight: 15 },

  sectionTitle: { color: GOLD, fontSize: 13, fontWeight: '900', letterSpacing: 2, marginTop: 16, marginHorizontal: 14 },
  emptyText: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginHorizontal: 14, marginTop: 6 },
  betRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  betTime: { flex: 1.2, color: 'rgba(255,255,255,0.55)', fontSize: 12 },
  betAmt: { flex: 1, color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  betMult: { flex: 1, fontSize: 13, fontWeight: '900', textAlign: 'center' },
  betWin: { flex: 1.1, fontSize: 13, fontWeight: '800', textAlign: 'right' },

  jpOverlay: { position: 'absolute', top: '28%', alignSelf: 'center' },
  jpCard: { alignItems: 'center', paddingHorizontal: 34, paddingVertical: 16, borderRadius: 20, borderWidth: 3, borderColor: '#FFF8D0' },
  jpTitle: { color: '#3A1A00', fontSize: 32, fontWeight: '900', fontStyle: 'italic', letterSpacing: 2 },
  jpAmount: { color: '#3A1A00', fontSize: 24, fontWeight: '900', marginTop: 2 },
  toast: { position: 'absolute', alignSelf: 'center', top: '40%', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.88)', borderWidth: 1, borderColor: '#FF4F6D' },
  toastGood: { backgroundColor: '#8AD8FF', borderColor: SKY },
  toastText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
