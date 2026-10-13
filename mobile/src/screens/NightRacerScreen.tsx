import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient as SvgLinearGradient, Path, Polygon, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { ApiClientError } from '../api/client';
import {
  AviatorHistoryEntry,
  AviatorRoundView,
  NightRacerBet,
  NightRacerConfig,
  NightRacerMyBet,
  cashOutNightRacerBet,
  fetchNightRacerConfig,
  fetchNightRacerCurrentRound,
  fetchNightRacerHistory,
  fetchNightRacerMyBets,
  fetchNightRacerNitroStatus,
  fireNightRacerNitro,
  placeNightRacerBet,
} from '../api/backend';
import { useGameState } from '../state/GameStateContext';
import GameInfoButton from '../components/GameInfoButton';

const GOLD = '#FFD66B';
const PINK = '#FF2E88';
const CYAN = '#2EF2FF';
const DEFAULT_GROWTH = Math.log(2) / 5;
const STAKE_STEPS = [10, 20, 50, 100, 200, 500];
const QUICK = [10, 50, 100, 500];
const AUTO_STEPS = [1.2, 1.5, 2, 3, 5, 10, 20, 50];
const TOAST_MS = 2000;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

function multColor(m: number): string {
  if (m < 2) return CYAN;
  if (m < 10) return '#B06CFF';
  return PINK;
}

function seeded(seed: number) {
  let x = seed;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}

/** A bet's own multiplier with its nitro fired at `nitroAt` (round multiplier `m`). */
function ownMult(nitroAt: number | null, m: number): number {
  if (nitroAt === null) return m;
  return round2(nitroAt * (m / nitroAt) ** 2);
}

// ---------- scene ----------
// A neon city at night seen from the side of a highway. The car waits on
// the line under a start gantry whose red lights come on one by one, then
// launches on green: the skyline, street lamps and lane markings stream
// past faster and faster as the speedometer climbs. When the round ends the
// car spins out in a burst of sparks and smoke.

/** The car, side-on, nose right. `spin` turns the wheels; `glow` lights the underglow. */
const Car = memo(function Car({ size, spin }: { size: number; spin: number }) {
  const u = useId().replace(/:/g, '');
  const wheel = (cx: number) => (
    <G>
      <Circle cx={cx} cy={40} r={9} fill="#0A0A10" />
      <Circle cx={cx} cy={40} r={6} fill={`url(#nrRim${u})`} />
      <G transform={`rotate(${spin} ${cx} 40)`}>
        {[0, 72, 144, 216, 288].map((a) => (
          <Line key={a} x1={cx} y1={40} x2={cx + 5.5 * Math.cos((a * Math.PI) / 180)} y2={40 + 5.5 * Math.sin((a * Math.PI) / 180)} stroke="#2A2A34" strokeWidth={1.4} />
        ))}
      </G>
      <Circle cx={cx} cy={40} r={1.6} fill="#E8E8F0" />
    </G>
  );
  return (
    <Svg width={size} height={size * 0.42} viewBox="0 0 120 50">
      <Defs>
        <SvgLinearGradient id={`nrBody${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FF6AB0" />
          <Stop offset="0.45" stopColor={PINK} />
          <Stop offset="1" stopColor="#7A0A3A" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`nrGlass${u}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#B8F8FF" />
          <Stop offset="1" stopColor="#0A2A4A" />
        </SvgLinearGradient>
        <RadialGradient id={`nrRim${u}`} cx="40%" cy="40%" r="60%">
          <Stop offset="0" stopColor="#F0F0F8" />
          <Stop offset="1" stopColor="#6A6A7A" />
        </RadialGradient>
        <RadialGradient id={`nrUnder${u}`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={CYAN} stopOpacity={0.8} />
          <Stop offset="1" stopColor={CYAN} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {/* Underglow */}
      <Ellipse cx={60} cy={46} rx={54} ry={4} fill={`url(#nrUnder${u})`} />
      {/* Body: low wedge with a rear wing */}
      <Path d="M4 36 L 6 28 C 8 24, 14 22, 22 22 L 44 18 C 54 10, 70 9, 82 14 L 100 22 C 110 24, 116 28, 118 34 L 116 40 L 100 40 C 100 33, 86 33, 86 40 L 34 40 C 34 33, 20 33, 20 40 L 6 40 Z" fill={`url(#nrBody${u})`} stroke="#3A0418" strokeWidth={1.2} />
      <Path d="M2 20 L 16 20 L 18 24 L 6 25 Z" fill="#1A0A12" />
      <Rect x={9} y={20} width={3} height={6} fill="#1A0A12" />
      {/* Glass */}
      <Path d="M48 19 C 56 12, 70 12, 80 16 L 88 22 L 50 22 Z" fill={`url(#nrGlass${u})`} stroke="#3A0418" strokeWidth={1} />
      <Path d="M68 14 L 68 22" stroke="#3A0418" strokeWidth={1} />
      {/* Side stripe, intake, lights */}
      <Path d="M24 30 L 96 28" stroke="#FFFFFF" strokeWidth={1.4} opacity={0.6} />
      <Path d="M40 32 L 54 31 L 52 35 L 42 35 Z" fill="#1A0A12" />
      <Path d="M112 27 L 118 30 L 117 33 L 110 31 Z" fill="#FFF8D0" />
      <Rect x={4} y={29} width={5} height={3} rx={1} fill="#FF2A2A" />
      {wheel(27)}
      {wheel(93)}
    </Svg>
  );
});

/** Far skyline: towers with lit windows. One tile wide; tiles repeat as it scrolls. */
const SkylineTile = memo(function SkylineTile({ w, h, seed, near }: { w: number; h: number; seed: number; near: boolean }) {
  const blocks = useMemo(() => {
    const rnd = seeded(seed);
    const out: { x: number; bw: number; bh: number; neon: string | null; win: { x: number; y: number }[] }[] = [];
    let x = 0;
    while (x < w) {
      const bw = (near ? 34 : 22) + rnd() * (near ? 40 : 28);
      const bh = h * ((near ? 0.3 : 0.45) + rnd() * (near ? 0.35 : 0.5));
      const win: { x: number; y: number }[] = [];
      for (let wy = h - bh + 6; wy < h - 6; wy += near ? 9 : 7) for (let wx = x + 4; wx < x + bw - 4; wx += near ? 8 : 6) if (rnd() < 0.42) win.push({ x: wx, y: wy });
      out.push({ x, bw, bh, neon: near && rnd() < 0.5 ? (rnd() < 0.5 ? PINK : CYAN) : null, win });
      x += bw + (near ? 6 : 2);
    }
    return out;
  }, [w, h, seed, near]);
  return (
    <Svg width={w} height={h}>
      {blocks.map((b, i) => (
        <G key={i}>
          <Rect x={b.x} y={h - b.bh} width={b.bw} height={b.bh} fill={near ? '#140A2A' : '#1E1446'} />
          {b.win.map((p, k) => (
            <Rect key={k} x={p.x} y={p.y} width={near ? 3 : 2} height={near ? 4 : 3} fill={k % 7 === 0 ? '#FFB8E0' : '#FFE8A0'} opacity={near ? 0.75 : 0.45} />
          ))}
          {b.neon && <Rect x={b.x + 4} y={h - b.bh + 8} width={b.bw - 8} height={5} rx={2} fill={b.neon} opacity={0.9} />}
          {b.neon && <Rect x={b.x + 2} y={h - b.bh + 6} width={b.bw - 4} height={9} rx={4} fill={b.neon} opacity={0.18} />}
        </G>
      ))}
    </Svg>
  );
});

/** Start gantry with five lights: red as the countdown runs, all green at the start. */
function StartLights({ w, lit, green }: { w: number; lit: number; green: boolean }) {
  return (
    <Svg width={w} height={w * 0.24} viewBox="0 0 200 48">
      <Rect x={10} y={4} width={180} height={34} rx={8} fill="#0E0E16" stroke="#3A3A4A" strokeWidth={2} />
      {[0, 1, 2, 3, 4].map((i) => {
        const on = green || i < lit;
        const color = green ? '#3CFF7A' : '#FF2A3A';
        return (
          <G key={i}>
            {on && <Circle cx={36 + i * 32} cy={21} r={14} fill={color} opacity={0.3} />}
            <Circle cx={36 + i * 32} cy={21} r={10} fill={on ? color : '#2A2A34'} stroke="#000" strokeWidth={1} />
            {on && <Circle cx={33 + i * 32} cy={18} r={3} fill="#FFFFFF" opacity={0.6} />}
          </G>
        );
      })}
      <Rect x={96} y={38} width={8} height={10} fill="#3A3A4A" />
    </Svg>
  );
}

/** Speedometer dial; `t` 0…1 sweeps the needle, `kmh` is printed in the middle. */
function Speedo({ size, t, kmh }: { size: number; t: number; kmh: number }) {
  const u = useId().replace(/:/g, '');
  const c = size / 2;
  const a0 = 135;
  const a = a0 + 270 * Math.max(0, Math.min(1, t));
  const pt = (deg: number, r: number) => ({ x: c + r * Math.cos((deg * Math.PI) / 180), y: c + r * Math.sin((deg * Math.PI) / 180) });
  const tip = pt(a, c * 0.72);
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={`nrDial${u}`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#1A1430" />
          <Stop offset="1" stopColor="#06040E" />
        </RadialGradient>
      </Defs>
      <Circle cx={c} cy={c} r={c - 1} fill={`url(#nrDial${u})`} stroke={CYAN} strokeWidth={1.5} strokeOpacity={0.6} />
      {Array.from({ length: 11 }, (_, i) => {
        const deg = a0 + i * 27;
        const p1 = pt(deg, c * 0.78);
        const p2 = pt(deg, c * 0.9);
        return <Line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={i >= 8 ? PINK : '#C8D0E8'} strokeWidth={i % 2 ? 1 : 2} />;
      })}
      <Line x1={c} y1={c} x2={tip.x} y2={tip.y} stroke={PINK} strokeWidth={2.5} strokeLinecap="round" />
      <Circle cx={c} cy={c} r={4} fill={PINK} />
      <SvgText x={c} y={c + size * 0.28} fontSize={size * 0.17} fontWeight="900" fill="#FFFFFF" textAnchor="middle">
        {kmh}
      </SvgText>
      <SvgText x={c} y={c + size * 0.4} fontSize={size * 0.09} fontWeight="800" fill={CYAN} textAnchor="middle">
        km/h
      </SvgText>
    </Svg>
  );
}

/** Sparks and smoke where the car spun out, `t` seconds after. */
function Wreck({ size, t }: { size: number; t: number }) {
  const u = useId().replace(/:/g, '');
  const c = size / 2;
  const k = Math.min(1, t / 1.1);
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={`nrFlash${u}`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.4" stopColor="#FFB23F" />
          <Stop offset="1" stopColor="#FF2E88" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={c} cy={c} r={size * (0.1 + 0.3 * k)} fill={`url(#nrFlash${u})`} opacity={Math.max(0, 1 - k * 1.3)} />
      {Array.from({ length: 14 }, (_, i) => {
        const a = -Math.PI * (0.1 + (i / 14) * 0.8);
        const r = size * 0.45 * k * (0.6 + (i % 3) * 0.2);
        return <Line key={i} x1={c + Math.cos(a) * r * 0.6} y1={c + Math.sin(a) * r * 0.6 + k * k * 20} x2={c + Math.cos(a) * r} y2={c + Math.sin(a) * r + k * k * 20} stroke="#FFD66B" strokeWidth={2} strokeLinecap="round" opacity={Math.max(0, 1 - k)} />;
      })}
      {Array.from({ length: 6 }, (_, i) => (
        <Circle key={`s${i}`} cx={c + (i - 2.5) * size * 0.07} cy={c - size * 0.18 * k - (i % 2) * 6} r={size * (0.05 + 0.08 * k)} fill="#3A3A44" opacity={0.55 * Math.min(1, t * 2) * (1 - k * 0.4)} />
      ))}
    </Svg>
  );
}

/** Lobby tile: the car blasting past a neon skyline. */
export function NightRacerTileArt({ size }: { size: number }) {
  const u = useId().replace(/:/g, '');
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinearGradient id={`nrTile${u}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#0A0420" />
            <Stop offset="0.6" stopColor="#3A0A4A" />
            <Stop offset="1" stopColor="#0A0410" />
          </SvgLinearGradient>
        </Defs>
        <Rect x={0} y={0} width={size} height={size} fill={`url(#nrTile${u})`} />
      </Svg>
      <View style={{ position: 'absolute', left: 0, top: size * 0.12 }}>
        <SkylineTile w={size} h={size * 0.42} seed={9} near />
      </View>
      <View style={{ position: 'absolute', left: 0, top: size * 0.54, width: size, height: size * 0.46, backgroundColor: '#14141E' }} />
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        {[0.1, 0.3, 0.5].map((y) => (
          <Line key={y} x1={0} y1={size * (0.42 + y * 0.3)} x2={size * 0.35} y2={size * (0.42 + y * 0.3)} stroke={CYAN} strokeWidth={1.5} opacity={0.6} />
        ))}
      </Svg>
      <View style={{ position: 'absolute', left: size * 0.12, top: size * 0.42 }}>
        <Car size={size * 0.8} spin={30} />
      </View>
    </View>
  );
}

// ---------- bet panel ----------

type PanelState = {
  amount: number;
  autoOn: boolean;
  autoAt: number;
  bet: NightRacerBet | null;
  queued: boolean;
  nitroAt: number | null;
  blownAt: number | null;
  cashedAt: number | null;
  busy: boolean;
};

function initialPanel(amount: number): PanelState {
  return { amount, autoOn: false, autoAt: 2, bet: null, queued: false, nitroAt: null, blownAt: null, cashedAt: null, busy: false };
}

// ---------- screen ----------

export default function NightRacerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<NightRacerConfig | null>(null);
  const [view, setView] = useState<AviatorRoundView | null>(null);
  const [history, setHistory] = useState<AviatorHistoryEntry[]>([]);
  const [myBets, setMyBets] = useState<NightRacerMyBet[]>([]);
  const [panels, setPanels] = useState<[PanelState, PanelState]>([initialPanel(10), initialPanel(20)]);
  const [toast, setToast] = useState<{ text: string; good: boolean } | null>(null);
  const [, setFrame] = useState(0);

  const offsetRef = useRef(0);
  const mountedRef = useRef(true);
  const panelsRef = useRef(panels);
  panelsRef.current = panels;
  const periodRef = useRef<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const crashSeenRef = useRef(0);
  /** When this player's engine last blew; drives the smoke on the car. */
  const blownSeenRef = useRef(0);

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
    fetchNightRacerHistory(30)
      .then((h) => mountedRef.current && setHistory(h))
      .catch(() => {});
    fetchNightRacerMyBets()
      .then((b) => mountedRef.current && setMyBets(b.slice(0, 15)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchNightRacerConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => {});
    loadLists();
    return () => {
      mountedRef.current = false;
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [loadLists]);

  // Round polling, quicker while racing.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;
    const loop = async () => {
      let delay = 700;
      try {
        const sentAt = Date.now();
        const v = await fetchNightRacerCurrentRound();
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

  useEffect(() => {
    if (!view) return;
    if (periodRef.current === view.periodNumber) return;
    const first = periodRef.current === null;
    periodRef.current = view.periodNumber;
    if (first) return;
    loadLists();
    refreshWallet();
    panelsRef.current.forEach((p, i) => {
      setPanel(i as 0 | 1, { bet: null, cashedAt: null, nitroAt: null, blownAt: null });
      if (p.queued && view.phase === 'BETTING') {
        setPanel(i as 0 | 1, { queued: false });
        placeBet(i as 0 | 1, true);
      }
    });
    // placeBet is stable enough for this once-per-round effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.periodNumber]);

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

  // Bets running on nitro: ask the server whether the engine has blown.
  const nitroLive = panels.some((p) => p.bet && p.nitroAt !== null && !p.cashedAt && p.blownAt === null);
  useEffect(() => {
    if (!nitroLive || localPhase !== 'FLYING') return;
    let alive = true;
    const timer = setInterval(() => {
      panelsRef.current.forEach((p, i) => {
        if (!p.bet || p.nitroAt === null || p.cashedAt || p.blownAt !== null) return;
        fetchNightRacerNitroStatus(p.bet.id)
          .then((s) => {
            if (!alive || !mountedRef.current || !s.blown || s.blownAt === null) return;
            const cur = panelsRef.current[i];
            if (cur.bet?.id !== p.bet!.id || cur.blownAt !== null || cur.cashedAt) return;
            setPanel(i as 0 | 1, { blownAt: s.blownAt });
            blownSeenRef.current = Date.now();
            showToast(`Engine blown at ${s.blownAt.toFixed(2)}x!`);
          })
          .catch(() => {});
      });
    }, 400);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [nitroLive, localPhase, setPanel, showToast]);

  const placeBet = useCallback(
    async (i: 0 | 1, fromQueue = false) => {
      const p = panelsRef.current[i];
      if (p.busy || (p.bet && !fromQueue)) return;
      if (p.amount > coins && !fromQueue) return showToast('Insufficient balance');
      setPanel(i, { busy: true });
      try {
        const bet = await placeNightRacerBet(p.amount, p.autoOn ? p.autoAt : undefined);
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
      if (!p.bet || p.busy || p.cashedAt || p.blownAt !== null) return;
      setPanel(i, { busy: true });
      try {
        const res = await cashOutNightRacerBet(p.bet.id);
        if (!mountedRef.current) return;
        setPanel(i, { busy: false, cashedAt: res.multiplier });
        showToast(`+₹${res.payout.toFixed(2)} @ ${res.multiplier.toFixed(2)}x`, true);
        refreshWallet();
      } catch (err) {
        if (!mountedRef.current) return;
        const msg = errorMessage(err);
        const blown = /Engine blown at ([\d.]+)x/.exec(msg);
        setPanel(i, { busy: false, ...(blown ? { blownAt: Number(blown[1]) } : {}) });
        if (blown) blownSeenRef.current = Date.now();
        showToast(msg);
      }
    },
    [refreshWallet, setPanel, showToast]
  );

  const nitro = useCallback(
    async (i: 0 | 1) => {
      const p = panelsRef.current[i];
      if (!p.bet || p.busy || p.cashedAt || p.nitroAt !== null) return;
      setPanel(i, { busy: true });
      try {
        const res = await fireNightRacerNitro(p.bet.id);
        if (!mountedRef.current) return;
        setPanel(i, { busy: false, nitroAt: res.nitroAt });
        showToast(`NITRO! Fired at ${res.nitroAt.toFixed(2)}x`, true);
      } catch (err) {
        if (!mountedRef.current) return;
        setPanel(i, { busy: false });
        showToast(errorMessage(err));
      }
    },
    [setPanel, showToast]
  );

  // Auto cash-out on the bet's own multiplier (nitro brings it sooner).
  useEffect(() => {
    if (localPhase !== 'FLYING') return;
    panels.forEach((p, i) => {
      if (p.bet && !p.cashedAt && !p.busy && p.blownAt === null && p.bet.autoCashoutAt && ownMult(p.nitroAt, liveMult) >= Number(p.bet.autoCashoutAt)) cashOut(i as 0 | 1);
    });
  });

  const onMain = (i: 0 | 1) => {
    const p = panels[i];
    if (p.bet && localPhase === 'FLYING' && !p.cashedAt && p.blownAt === null) return cashOut(i);
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
  const raceS = localPhase === 'BETTING' ? 0 : crashed && view?.crashMultiplier ? Math.log(view.crashMultiplier) / growth : elapsed;
  const wreckS = crashed && crashSeenRef.current ? (Date.now() - crashSeenRef.current) / 1000 : 0;
  // Distance covered, in px: speeds up the longer the race runs.
  const dist = SW * (1.2 * raceS + 0.12 * raceS * raceS);
  const roadY = SH * 0.66;
  const farW = SW * 1.6;
  const nearW = SW * 1.4;
  const farOff = (dist * 0.12) % farW;
  const nearOff = (dist * 0.4) % nearW;
  const lampGap = SW * 0.55;
  const lampOff = (dist * 1.0) % lampGap;
  const dashGap = SW * 0.22;
  const dashOff = (dist * 1.6) % dashGap;
  const speedT = Math.min(1, Math.log(Math.max(1, liveMult)) / Math.log(50));
  const kmh = localPhase === 'BETTING' ? 0 : Math.round(60 + speedT * 340);
  const carW = SW * 0.44;
  const carH = carW * 0.42;
  const LIFT_S = 1.2;
  const lift = Math.min(1, raceS / LIFT_S);
  const ease = lift * lift * (3 - 2 * lift);
  const startX = SW * 0.12;
  const cruiseX = SW * 0.3;
  const hover = localPhase === 'FLYING' && lift >= 1 ? Math.sin(srvNow / 300) : 0;
  let carX = startX + (cruiseX - startX) * ease + hover * SW * 0.01;
  const carY = roadY - carH * 0.9 + (localPhase === 'FLYING' ? Math.sin(srvNow / 45) * 0.8 : 0);
  let carRot = 0;
  if (crashed) {
    carX += wreckS * SW * 0.35 * Math.max(0, 1 - wreckS / 2);
    carRot = Math.min(1, wreckS / 0.9) * 200;
  }
  const spin = (dist * 2) % 360;
  const betLeft = localPhase === 'BETTING' ? Math.max(0, (flyStart - srvNow) / 1000) : 0;
  const betTotal = config?.bettingDurationSeconds ?? 6;
  const lights = localPhase === 'BETTING' ? Math.min(5, Math.floor((1 - betLeft / betTotal) * 6)) : 5;
  const green = localPhase === 'FLYING' && raceS < 1.2;
  const myNitro = panels.some((p) => p.bet && p.nitroAt !== null && !p.cashedAt && p.blownAt === null) && localPhase === 'FLYING';
  const smokeS = blownSeenRef.current ? (Date.now() - blownSeenRef.current) / 1000 : 99;
  const flick = (Math.sin(srvNow / 29) + Math.sin(srvNow / 17)) / 4 + 0.5;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#0E0624', '#03020A']} style={StyleSheet.absoluteFill} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color="#FFFFFF" />
          <MaterialCommunityIcons name="car-sports" size={22} color={PINK} />
          <Text style={styles.title}>NIGHT RACER</Text>
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

        {/* Night city scene */}
        <View style={[styles.scene, { width: SW, height: SH }]}>
          <LinearGradient colors={['#0A0420', '#2A0A4A', '#5A1A5A']} style={StyleSheet.absoluteFill} />
          <Svg width={SW} height={SH} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Circle cx={SW * 0.82} cy={SH * 0.14} r={SH * 0.07} fill="#FFE8F0" opacity={0.9} />
            <Circle cx={SW * 0.82} cy={SH * 0.14} r={SH * 0.12} fill="#FF8AC8" opacity={0.12} />
          </Svg>
          {/* Skyline layers, each two tiles side by side so they loop */}
          {[
            { off: farOff, tw: farW, seed: 5, near: false, h: roadY * 0.85 },
            { off: nearOff, tw: nearW, seed: 21, near: true, h: roadY * 0.7 },
          ].map((L) => (
            <View key={L.seed} pointerEvents="none" style={{ position: 'absolute', top: roadY - L.h, left: -L.off, flexDirection: 'row' }}>
              <SkylineTile w={L.tw} h={L.h} seed={L.seed} near={L.near} />
              <SkylineTile w={L.tw} h={L.h} seed={L.seed} near={L.near} />
            </View>
          ))}
          {/* Road, barrier, lamps and lane markings */}
          <Svg width={SW} height={SH} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
              <SvgLinearGradient id="nrRoad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#2A2A38" />
                <Stop offset="1" stopColor="#0E0E16" />
              </SvgLinearGradient>
              <SvgLinearGradient id="nrCone" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#FFE8B0" stopOpacity={0.35} />
                <Stop offset="1" stopColor="#FFE8B0" stopOpacity={0} />
              </SvgLinearGradient>
            </Defs>
            <Rect x={0} y={roadY - 6} width={SW} height={6} fill="#4A4A5A" />
            <Rect x={0} y={roadY - 6} width={SW} height={1.5} fill={CYAN} opacity={0.7} />
            <Rect x={0} y={roadY} width={SW} height={SH - roadY} fill="url(#nrRoad)" />
            {Array.from({ length: Math.ceil(SW / lampGap) + 2 }, (_, k) => {
              const x = k * lampGap - lampOff;
              return (
                <G key={k}>
                  <Polygon points={`${x + 14},${roadY - SH * 0.42} ${x - 12},${roadY} ${x + 44},${roadY}`} fill="url(#nrCone)" />
                  <Rect x={x} y={roadY - SH * 0.45} width={3} height={SH * 0.45} fill="#3A3A4A" />
                  <Rect x={x} y={roadY - SH * 0.45} width={18} height={3} fill="#3A3A4A" />
                  <Rect x={x + 12} y={roadY - SH * 0.44} width={8} height={3} rx={1} fill="#FFF4C8" />
                </G>
              );
            })}
            {Array.from({ length: Math.ceil(SW / dashGap) + 2 }, (_, k) => (
              <Rect key={k} x={k * dashGap - dashOff} y={roadY + (SH - roadY) * 0.48} width={dashGap * 0.5} height={3} fill="#FFFFFF" opacity={0.8} />
            ))}
            <Rect x={0} y={SH - 4} width={SW} height={2} fill={PINK} opacity={0.6} />
            {/* Speed streaks */}
            {localPhase === 'FLYING' &&
              raceS > 2 &&
              Array.from({ length: 8 }, (_, i) => {
                const y = SH * (0.2 + ((i * 0.37) % 0.75));
                const x = SW - (((dist * 3) / SW + i * 0.31) % 1.4) * SW;
                return <Line key={i} x1={x} y1={y} x2={x + SW * 0.18} y2={y} stroke="#FFFFFF" strokeOpacity={Math.min(0.35, raceS / 30)} strokeWidth={1.2} strokeLinecap="round" />;
              })}
          </Svg>

          {/* Nitro flame (this player's bet only) */}
          {myNitro && (
            <Svg width={carW * 0.5} height={carH * 0.4} style={{ position: 'absolute', left: carX - carW * 0.46, top: carY + carH * 0.52 }} pointerEvents="none">
              <Defs>
                <SvgLinearGradient id="nrN2o" x1="1" y1="0" x2="0" y2="0">
                  <Stop offset="0" stopColor="#FFFFFF" />
                  <Stop offset="0.3" stopColor={CYAN} />
                  <Stop offset="1" stopColor="#3A6AFF" stopOpacity={0} />
                </SvgLinearGradient>
              </Defs>
              <Path d={`M${carW * 0.5} ${carH * 0.08} L ${carW * 0.5 * (1 - 0.9 * (0.85 + flick * 0.15))} ${carH * 0.2} L ${carW * 0.5} ${carH * 0.32} Z`} fill="url(#nrN2o)" />
            </Svg>
          )}
          {/* The car */}
          <View pointerEvents="none" style={{ position: 'absolute', left: carX, top: carY, transform: [{ rotate: `${carRot}deg` }] }}>
            <Car size={carW} spin={spin} />
          </View>
          {smokeS < 1.5 && localPhase !== 'BETTING' && (
            <View pointerEvents="none" style={{ position: 'absolute', left: carX + carW * 0.5, top: carY - carH * 0.8 }}>
              <Wreck size={carH * 1.6} t={smokeS} />
            </View>
          )}
          {crashed && wreckS < 1.6 && (
            <View pointerEvents="none" style={{ position: 'absolute', left: carX + carW * 0.6 - SH * 0.3, top: carY + carH * 0.4 - SH * 0.3 }}>
              <Wreck size={SH * 0.6} t={wreckS} />
            </View>
          )}

          {/* Start gantry */}
          {(localPhase === 'BETTING' || green) && (
            <View pointerEvents="none" style={{ position: 'absolute', top: SH * 0.04, alignSelf: 'center' }}>
              <StartLights w={SW * 0.5} lit={lights} green={green} />
            </View>
          )}

          {/* Speedometer */}
          <View pointerEvents="none" style={{ position: 'absolute', right: 8, bottom: 8 }}>
            <Speedo size={SH * 0.3} t={speedT} kmh={kmh} />
          </View>

          {crashed && wreckS < 0.3 && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,120,60,0.3)' }]} />}

          {localPhase !== 'BETTING' && !green && (
            <View pointerEvents="none" style={styles.multWrap}>
              {crashed && <Text style={styles.boomText}>CRASHED!</Text>}
              <Text style={[styles.bigMult, { fontSize: SH * 0.18, color: crashed ? '#FF4F6D' : '#FFFFFF', textShadowColor: crashed ? 'rgba(0,0,0,0.6)' : multColor(liveMult) }]}>
                {liveMult.toFixed(2)}x
              </Text>
            </View>
          )}
          {green && (
            <View pointerEvents="none" style={[styles.multWrap, { top: '30%' }]}>
              <Text style={styles.goText}>GO!</Text>
            </View>
          )}

          {localPhase === 'BETTING' && (
            <View pointerEvents="none" style={styles.nextWrap}>
              <Text style={styles.nextText}>RACE STARTS IN</Text>
              <Text style={styles.countText}>{betLeft.toFixed(1)}s</Text>
            </View>
          )}
        </View>

        {/* Two bet panels */}
        {([0, 1] as const).map((i) => {
          const p = panels[i];
          const blown = p.blownAt !== null;
          const live = p.bet && localPhase === 'FLYING' && !p.cashedAt && !blown;
          const own = ownMult(p.nitroAt, liveMult);
          const lostBet = p.bet && ((crashed && !p.cashedAt) || blown);
          let label = 'BET';
          let sub = `₹${p.amount.toFixed(2)}`;
          let colors: [string, string] = ['#FF2E88', '#A0105A'];
          if (live) {
            label = 'CASH OUT';
            sub = `₹${round2(Number(p.bet!.amount) * own).toFixed(2)}`;
            colors = ['#FFB23F', '#E07A10'];
          } else if (p.queued) {
            label = 'CANCEL';
            sub = 'bet next race';
            colors = ['#FF5A6A', '#C21F31'];
          } else if (p.cashedAt) {
            label = 'CASHED OUT';
            sub = `@ ${p.cashedAt.toFixed(2)}x`;
            colors = ['#2A2A48', '#1A1A30'];
          } else if (lostBet) {
            label = blown ? 'BLOWN' : 'CRASHED';
            sub = `-₹${Number(p.bet!.amount).toFixed(2)}`;
            colors = ['#5A2A3A', '#3A1422'];
          } else if (p.bet) {
            label = 'WAITING';
            sub = 'for the green light';
            colors = ['#2A2A48', '#1A1A30'];
          }
          const locked = !!p.bet || p.queued;
          const canNitro = !!live && p.nitroAt === null && !p.busy;
          return (
            <View key={i} style={styles.panel}>
              <LinearGradient colors={['#1A1030', '#0C0818']} style={[StyleSheet.absoluteFill, { borderRadius: 16 }]} />
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
                    trackColor={{ true: PINK, false: '#2A2A40' }}
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
                    <Text style={styles.mainLabel} numberOfLines={1} adjustsFontSizeToFit>
                      {p.busy ? '…' : label}
                    </Text>
                    <Text style={styles.mainSub}>{sub}</Text>
                  </LinearGradient>
                </Pressable>
                <Pressable onPress={() => nitro(i)} disabled={!canNitro} style={({ pressed }) => [styles.nitroBtn, !canNitro && styles.nitroOff, pressed && styles.pressed]}>
                  <MaterialCommunityIcons name="fire" size={15} color={canNitro ? '#04202A' : p.nitroAt !== null ? CYAN : 'rgba(255,255,255,0.5)'} />
                  <Text style={[styles.nitroText, !canNitro && { color: p.nitroAt !== null ? CYAN : 'rgba(255,255,255,0.5)' }]}>
                    {p.nitroAt !== null ? (live ? `NITRO ${own.toFixed(2)}x` : `NITRO @ ${p.nitroAt.toFixed(2)}x`) : 'NITRO'}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        })}

        <Text style={styles.helpText}>
          NITRO (once per bet, during the race): from that moment your bet's multiplier climbs twice as fast — but your engine can blow at any point, losing the bet. Your auto cash-out counts on your own multiplier.
        </Text>

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
                <Text style={[styles.betMult, { color: won ? '#8AF8FF' : pending ? '#FFFFFF' : '#FF7A8A' }]}>
                  {b.nitroAt ? '🔥' : ''}
                  {won ? `${Number(b.cashoutMultiplier).toFixed(2)}x` : pending ? '—' : b.engineBlownAt ? 'blown' : `${Number(b.round.crashMultiplier).toFixed(2)}x`}
                </Text>
                <Text style={[styles.betWin, { color: won ? '#8AF8FF' : '#8A8FA8' }]}>{won ? `+₹${Number(b.payout).toFixed(2)}` : pending ? 'live' : '—'}</Text>
              </View>
            );
          })
        )}
        <GameInfoButton>
          Provably fair · RTP {config ? 100 - config.houseEdgePercent : 88}% with or without nitro · bet ₹{minStake}–₹{maxStake} · max win ₹{config?.maxPayout ?? 10000} per bet
        </GameInfoButton>
      </ScrollView>

      {toast && (
        <View pointerEvents="none" style={[styles.toast, toast.good && styles.toastGood]}>
          <Text style={[styles.toastText, toast.good && { color: '#04202A' }]}>{toast.text}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#03020A' },
  topBar: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  title: { color: '#FFFFFF', fontSize: 19, fontWeight: '900', fontStyle: 'italic', letterSpacing: 2 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  balancePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.4)' },
  balanceText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  depositBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: GOLD },

  histRow: { gap: 6, paddingHorizontal: 10, paddingVertical: 6 },
  histChip: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 12, borderWidth: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  histText: { fontSize: 12, fontWeight: '900' },

  scene: { alignSelf: 'center', borderRadius: 18, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,46,136,0.55)' },
  multWrap: { position: 'absolute', top: '5%', left: 0, right: 0, alignItems: 'center' },
  bigMult: { fontWeight: '900', fontStyle: 'italic', letterSpacing: -1, textShadowRadius: 18, textShadowOffset: { width: 0, height: 0 } },
  boomText: { color: '#FFD6A0', fontSize: 16, fontWeight: '900', letterSpacing: 3, textShadowColor: '#000', textShadowRadius: 6, marginBottom: -4 },
  goText: { color: '#3CFF7A', fontSize: 56, fontWeight: '900', fontStyle: 'italic', textShadowColor: '#0A4A1A', textShadowRadius: 14 },
  nextWrap: { position: 'absolute', top: '30%', alignSelf: 'center', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(5,2,20,0.65)', borderWidth: 1, borderColor: 'rgba(255,46,136,0.4)' },
  nextText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  countText: { color: GOLD, fontSize: 30, fontWeight: '900', marginTop: 1 },

  panel: { flexDirection: 'row', gap: 10, marginHorizontal: 10, marginTop: 10, padding: 10, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,46,136,0.25)', overflow: 'hidden' },
  panelLeft: { flex: 1, gap: 6 },
  stakeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 20, padding: 3, borderWidth: 1, borderColor: 'rgba(46,242,255,0.15)' },
  roundBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  stakeText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  quickRow: { flexDirection: 'row', gap: 4 },
  quick: { flex: 1, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  quickOn: { backgroundColor: 'rgba(255,46,136,0.22)', borderWidth: 1, borderColor: PINK },
  quickText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  autoRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  autoLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '800' },
  miniBtn: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  autoValue: { color: GOLD, fontSize: 13, fontWeight: '900', minWidth: 48, textAlign: 'center' },
  mainCol: { width: '44%', gap: 6 },
  mainBtn: { flex: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 4 },
  mainLabel: { color: '#FFFFFF', fontSize: 19, fontWeight: '900', letterSpacing: 1 },
  mainSub: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '800', marginTop: 2 },
  nitroBtn: { height: 32, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: CYAN },
  nitroOff: { backgroundColor: 'rgba(255,255,255,0.08)' },
  nitroText: { color: '#04202A', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  pressed: { transform: [{ scale: 0.97 }] },
  dim: { opacity: 0.4 },
  helpText: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginHorizontal: 14, marginTop: 8, lineHeight: 15 },

  sectionTitle: { color: GOLD, fontSize: 13, fontWeight: '900', letterSpacing: 2, marginTop: 16, marginHorizontal: 14 },
  emptyText: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginHorizontal: 14, marginTop: 6 },
  betRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  betTime: { flex: 1.2, color: 'rgba(255,255,255,0.55)', fontSize: 12 },
  betAmt: { flex: 1, color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  betMult: { flex: 1.1, fontSize: 13, fontWeight: '900', textAlign: 'center' },
  betWin: { flex: 1, fontSize: 13, fontWeight: '800', textAlign: 'right' },

  toast: { position: 'absolute', alignSelf: 'center', top: '40%', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.88)', borderWidth: 1, borderColor: '#FF4F6D' },
  toastGood: { backgroundColor: '#8AF8FF', borderColor: CYAN },
  toastText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
