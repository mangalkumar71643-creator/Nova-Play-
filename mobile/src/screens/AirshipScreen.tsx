import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient as SvgLinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { ApiClientError } from '../api/client';
import {
  AviatorBetResult,
  AviatorConfig,
  AviatorHistoryEntry,
  AviatorMyBet,
  AviatorRoundView,
  cashOutAirshipBet,
  fetchAirshipConfig,
  fetchAirshipCurrentRound,
  fetchAirshipHistory,
  fetchAirshipMyBets,
  placeAirshipBet,
} from '../api/backend';
import { useGameState } from '../state/GameStateContext';
import GameInfoButton from '../components/GameInfoButton';

const BRASS = '#D8A84A';
const BRASS_LIGHT = '#FFE2A0';
const BRASS_DARK = '#7A5418';
const SERIF = 'serif';
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
  if (m < 2) return BRASS_LIGHT;
  if (m < 10) return '#7AD8FF';
  return '#FF9A5A';
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

// ---------- scene ----------
// A steampunk airship moored to a brass mast above the rooftops at dusk.
// When it casts off it climbs into a gathering storm: the town drops away,
// cloud banks stream past and darken, lightning flickers in the distance
// and rain sets in as the multiplier grows. When the round ends a bolt
// strikes the airship and it goes down in flames.

/** The airship, side-on, nose right. `prop` turns the propeller. */
const Ship = memo(function Ship({ size, prop }: { size: number; prop: number }) {
  const u = useId().replace(/:/g, '');
  const blade = (deg: number) => (
    <Ellipse cx={8} cy={30} rx={2.5} ry={9} fill={BRASS} stroke={BRASS_DARK} strokeWidth={0.8} transform={`rotate(${deg} 8 30)`} />
  );
  return (
    <Svg width={size} height={size * 0.55} viewBox="0 0 140 77">
      <Defs>
        <SvgLinearGradient id={`asEnv${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#D85A4A" />
          <Stop offset="0.45" stopColor="#8A1E1E" />
          <Stop offset="1" stopColor="#3A0808" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`asBrass${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={BRASS_LIGHT} />
          <Stop offset="0.5" stopColor={BRASS} />
          <Stop offset="1" stopColor={BRASS_DARK} />
        </SvgLinearGradient>
        <SvgLinearGradient id={`asWood${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#8A5A2A" />
          <Stop offset="1" stopColor="#3A2410" />
        </SvgLinearGradient>
      </Defs>
      {/* Tail fins */}
      <Path d="M22 30 L 6 8 L 22 12 L 34 26 Z" fill={`url(#asEnv${u})`} stroke="#2A0404" strokeWidth={1} />
      <Path d="M22 34 L 6 56 L 22 52 L 34 38 Z" fill={`url(#asEnv${u})`} stroke="#2A0404" strokeWidth={1} />
      {/* Envelope */}
      <Path d="M18 32 C 18 14, 60 6, 96 8 C 120 10, 136 20, 136 32 C 136 44, 120 54, 96 56 C 60 58, 18 50, 18 32 Z" fill={`url(#asEnv${u})`} stroke="#2A0404" strokeWidth={1.4} />
      {/* Brass ribs and a highlight */}
      {[34, 52, 70, 88, 106, 122].map((x, i) => (
        <Path key={x} d={`M${x} ${9 + Math.abs(i - 2.5) * 1.6} C ${x + 4} 22, ${x + 4} 42, ${x} ${55 - Math.abs(i - 2.5) * 1.6}`} stroke={BRASS} strokeWidth={1.1} fill="none" opacity={0.8} />
      ))}
      <Path d="M30 22 C 52 12, 96 10, 124 18" stroke="#FFB8A8" strokeWidth={2.5} fill="none" opacity={0.45} strokeLinecap="round" />
      <Path d="M20 32 L 134 32" stroke={BRASS} strokeWidth={1.4} />
      {/* Name band */}
      <Rect x={58} y={27} width={36} height={10} rx={2} fill={`url(#asBrass${u})`} stroke={BRASS_DARK} strokeWidth={0.8} />
      {/* Rigging down to the gondola */}
      {[62, 74, 86, 98].map((x, i) => (
        <Line key={x} x1={x} y1={54} x2={66 + i * 8} y2={63} stroke="#2A1A0A" strokeWidth={0.8} />
      ))}
      {/* Gondola with lit portholes */}
      <Path d="M58 63 L 104 63 L 100 74 C 96 76, 66 76, 62 74 Z" fill={`url(#asWood${u})`} stroke="#1A0E04" strokeWidth={1} />
      <Rect x={58} y={62} width={46} height={3} fill={`url(#asBrass${u})`} />
      {[66, 76, 86, 96].map((x) => (
        <G key={x}>
          <Circle cx={x} cy={69} r={2.6} fill="#FFD68A" stroke={BRASS} strokeWidth={0.8} />
          <Circle cx={x} cy={69} r={4} fill="#FFD68A" opacity={0.25} />
        </G>
      ))}
      {/* Propeller and its hub at the stern */}
      <Rect x={8} y={28} width={12} height={4} fill={`url(#asBrass${u})`} />
      <G>
        {blade(prop)}
        {blade(prop + 120)}
        {blade(prop + 240)}
      </G>
      <Circle cx={8} cy={30} r={2.4} fill={BRASS_DARK} />
      {/* Pennant */}
      <Path d="M96 8 L 96 0 L 106 2 L 96 4" fill="#2A6AD8" stroke="#0A2A6A" strokeWidth={0.5} />
    </Svg>
  );
});

/** A stormy cloud bank tile; tiles stack and scroll as the airship climbs. */
const CloudTile = memo(function CloudTile({ w, h, seed, tint, shade, alpha }: { w: number; h: number; seed: number; tint: string; shade: string; alpha: number }) {
  const clouds = useMemo(() => {
    const rnd = seeded(seed);
    return Array.from({ length: 4 }, () => {
      const cx = rnd() * w;
      const cy = rnd() * h;
      const s = 0.7 + rnd() * 0.9;
      return { cx, cy, s, puffs: Array.from({ length: 6 }, (_, k) => ({ dx: (k - 2.5) * 20 * s + (rnd() - 0.5) * 10, dy: (rnd() - 0.7) * 14 * s, r: (15 + rnd() * 15) * s })) };
    });
  }, [w, h, seed]);
  return (
    <Svg width={w} height={h}>
      {clouds.map((c, i) => (
        <G key={i} opacity={alpha}>
          <Ellipse cx={c.cx} cy={c.cy + 12 * c.s} rx={70 * c.s} ry={14 * c.s} fill={shade} />
          {c.puffs.map((p, k) => (
            <Circle key={k} cx={c.cx + p.dx} cy={c.cy + p.dy} r={p.r} fill={tint} />
          ))}
        </G>
      ))}
    </Svg>
  );
});

/** The town below at dusk: rooftops, chimneys with smoke and the brass mooring mast. */
const Town = memo(function Town({ w, h }: { w: number; h: number }) {
  const u = useId().replace(/:/g, '');
  const roofs = useMemo(() => {
    const rnd = seeded(77);
    const out: { x: number; bw: number; top: number; chimney: boolean; win: number[] }[] = [];
    let x = -10;
    while (x < w) {
      const bw = 26 + rnd() * 30;
      out.push({ x, bw, top: h * (0.45 + rnd() * 0.25), chimney: rnd() < 0.5, win: [rnd(), rnd(), rnd()] });
      x += bw - 4;
    }
    return out;
  }, [w, h]);
  return (
    <Svg width={w} height={h}>
      <Defs>
        <SvgLinearGradient id={`asTown${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#3A2A3A" />
          <Stop offset="1" stopColor="#140A10" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`asMast${u}`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={BRASS_DARK} />
          <Stop offset="0.5" stopColor={BRASS_LIGHT} />
          <Stop offset="1" stopColor={BRASS_DARK} />
        </SvgLinearGradient>
      </Defs>
      {roofs.map((r, i) => (
        <G key={i}>
          <Path d={`M${r.x} ${r.top + 10} L ${r.x + r.bw / 2} ${r.top} L ${r.x + r.bw} ${r.top + 10} L ${r.x + r.bw} ${h} L ${r.x} ${h} Z`} fill={`url(#asTown${u})`} stroke="#0A0408" strokeWidth={1} />
          {r.chimney && (
            <G>
              <Rect x={r.x + r.bw * 0.7} y={r.top - 4} width={5} height={10} fill="#2A1A20" />
              <Circle cx={r.x + r.bw * 0.72 + 3} cy={r.top - 10} r={4} fill="#8A7A8A" opacity={0.35} />
              <Circle cx={r.x + r.bw * 0.72 + 7} cy={r.top - 17} r={5} fill="#8A7A8A" opacity={0.25} />
            </G>
          )}
          {r.win.map((v, k) =>
            v < 0.6 ? <Rect key={k} x={r.x + 5 + k * (r.bw / 3.4)} y={r.top + 16 + (k % 2) * 10} width={4} height={5} fill="#FFC870" opacity={0.85} /> : null
          )}
        </G>
      ))}
      {/* Mooring mast */}
      <Rect x={w * 0.6} y={h * 0.08} width={7} height={h * 0.92} fill={`url(#asMast${u})`} />
      {Array.from({ length: 7 }, (_, i) => (
        <Line key={i} x1={w * 0.6} y1={h * (0.14 + i * 0.12)} x2={w * 0.6 + 7} y2={h * (0.2 + i * 0.12)} stroke={BRASS_DARK} strokeWidth={1} />
      ))}
      <Circle cx={w * 0.6 + 3.5} cy={h * 0.06} r={5} fill={BRASS} stroke={BRASS_DARK} strokeWidth={1} />
      <Circle cx={w * 0.6 + 3.5} cy={h * 0.06} r={2} fill="#FF4A3A" />
    </Svg>
  );
});

/** A forked lightning bolt from (x0,0) to (x1,y1). */
function Bolt({ w, h, x0, x1, y1, seed, width }: { w: number; h: number; x0: number; x1: number; y1: number; seed: number; width: number }) {
  const pts = useMemo(() => {
    const rnd = seeded(seed);
    const n = 8;
    const out = [`${x0},0`];
    for (let i = 1; i < n; i++) {
      const t = i / n;
      out.push(`${x0 + (x1 - x0) * t + (rnd() - 0.5) * w * 0.12},${y1 * t}`);
    }
    out.push(`${x1},${y1}`);
    return out.join(' ');
  }, [w, x0, x1, y1, seed]);
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Path d={`M${pts.replace(/ /g, ' L ')}`} stroke="#B8D8FF" strokeWidth={width * 3} fill="none" opacity={0.35} strokeLinejoin="round" />
      <Path d={`M${pts.replace(/ /g, ' L ')}`} stroke="#FFFFFF" strokeWidth={width} fill="none" strokeLinejoin="round" />
    </Svg>
  );
}

/** Brass altimeter dial; `t` 0…1 sweeps the needle, `label` sits in the middle. */
function Altimeter({ size, t, label }: { size: number; t: number; label: string }) {
  const u = useId().replace(/:/g, '');
  const c = size / 2;
  const a = 135 + 270 * Math.max(0, Math.min(1, t));
  const pt = (deg: number, r: number) => ({ x: c + r * Math.cos((deg * Math.PI) / 180), y: c + r * Math.sin((deg * Math.PI) / 180) });
  const tip = pt(a, c * 0.66);
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={`asRim${u}`} cx="40%" cy="35%" r="70%">
          <Stop offset="0" stopColor={BRASS_LIGHT} />
          <Stop offset="0.6" stopColor={BRASS} />
          <Stop offset="1" stopColor={BRASS_DARK} />
        </RadialGradient>
      </Defs>
      <Circle cx={c} cy={c} r={c - 1} fill={`url(#asRim${u})`} />
      <Circle cx={c} cy={c} r={c * 0.82} fill="#F4E8C8" stroke={BRASS_DARK} strokeWidth={1} />
      {Array.from({ length: 11 }, (_, i) => {
        const deg = 135 + i * 27;
        const p1 = pt(deg, c * 0.66);
        const p2 = pt(deg, c * 0.78);
        return <Line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={i >= 8 ? '#A8201A' : '#2A1A0A'} strokeWidth={i % 2 ? 0.8 : 1.6} />;
      })}
      <Line x1={c} y1={c} x2={tip.x} y2={tip.y} stroke="#1A0E04" strokeWidth={2} strokeLinecap="round" />
      <Circle cx={c} cy={c} r={3.5} fill={BRASS_DARK} />
      <SvgText x={c} y={c + size * 0.24} fontSize={size * 0.1} fontWeight="900" fill="#2A1A0A" textAnchor="middle" fontFamily={SERIF}>
        {label}
      </SvgText>
    </Svg>
  );
}

/** Flames and smoke on the struck envelope, `t` seconds after. */
function Blaze({ size, t }: { size: number; t: number }) {
  const u = useId().replace(/:/g, '');
  const c = size / 2;
  const k = Math.min(1, t / 1.2);
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={`asFire${u}`} cx="50%" cy="60%" r="50%">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.3" stopColor="#FFE36B" />
          <Stop offset="0.65" stopColor="#FF6A1A" />
          <Stop offset="1" stopColor="#8A1A0A" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={c} cy={c} r={size * (0.12 + 0.34 * k)} fill={`url(#asFire${u})`} opacity={Math.max(0, 1 - k * 0.7)} />
      {Array.from({ length: 6 }, (_, i) => (
        <Circle key={i} cx={c + (i - 2.5) * size * 0.07} cy={c - size * (0.12 + 0.18 * k) - (i % 2) * 6} r={size * (0.05 + 0.07 * k)} fill="#2A2228" opacity={0.6 * Math.min(1, t * 2)} />
      ))}
    </Svg>
  );
}

/** Lobby tile: the airship sailing past storm clouds with a bolt behind it. */
export function AirshipTileArt({ size }: { size: number }) {
  const u = useId().replace(/:/g, '');
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={size} height={size}>
        <Defs>
          <SvgLinearGradient id={`asTile${u}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#2A1E3A" />
            <Stop offset="0.6" stopColor="#8A4A3A" />
            <Stop offset="1" stopColor="#E8A05A" />
          </SvgLinearGradient>
        </Defs>
        <Rect x={0} y={0} width={size} height={size} fill={`url(#asTile${u})`} />
        <Path d={`M${size * 0.82} 0 L ${size * 0.74} ${size * 0.2} L ${size * 0.84} ${size * 0.22} L ${size * 0.72} ${size * 0.46}`} stroke="#FFFFFF" strokeWidth={2.5} fill="none" />
        {[0.1, 0.45, 0.8].map((x) => (
          <G key={x}>
            <Circle cx={size * x} cy={size * 0.82} r={size * 0.14} fill="#5A4A5A" />
            <Circle cx={size * (x + 0.1)} cy={size * 0.86} r={size * 0.11} fill="#4A3A4A" />
          </G>
        ))}
      </Svg>
      <View style={{ position: 'absolute', left: size * 0.06, top: size * 0.2, transform: [{ rotate: '-6deg' }] }}>
        <Ship size={size * 0.86} prop={20} />
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

export default function AirshipScreen() {
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
    fetchAirshipHistory(30)
      .then((h) => mountedRef.current && setHistory(h))
      .catch(() => {});
    fetchAirshipMyBets()
      .then((b) => mountedRef.current && setMyBets(b.slice(0, 15)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchAirshipConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => {});
    loadLists();
    return () => {
      mountedRef.current = false;
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [loadLists]);

  // Round polling, quicker while aloft.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;
    const loop = async () => {
      let delay = 700;
      try {
        const sentAt = Date.now();
        const v = await fetchAirshipCurrentRound();
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
      setPanel(i as 0 | 1, { bet: null, cashedAt: null });
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

  const placeBet = useCallback(
    async (i: 0 | 1, fromQueue = false) => {
      const p = panelsRef.current[i];
      if (p.busy || (p.bet && !fromQueue)) return;
      if (p.amount > coins && !fromQueue) return showToast('Insufficient balance');
      setPanel(i, { busy: true });
      try {
        const bet = await placeAirshipBet(p.amount, p.autoOn ? p.autoAt : undefined);
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
        const res = await cashOutAirshipBet(p.bet.id);
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
  const strikeS = crashed && crashSeenRef.current ? (Date.now() - crashSeenRef.current) / 1000 : 0;
  const climb = SH * (0.7 * flightS + 0.06 * flightS * flightS);
  const storm = Math.min(1, Math.log(Math.max(1, liveMult)) / Math.log(40));
  const skyTop = ramp(['#3A2A5A', '#2A2240', '#1A1626', '#0E0A12'], storm);
  const skyBottom = ramp(['#F0A060', '#A86A5A', '#4A3A4A', '#2A2028'], storm);
  const cloudTint = ramp(['#F4D8C0', '#B8A0A8', '#5A5260', '#38323C'], storm);
  const cloudShade = ramp(['#C89880', '#7A6470', '#3A3440', '#221E26'], storm);
  const near = (climb * 1.0) % SH;
  const far = (climb * 0.4) % SH;
  const townH = SH * 0.48;
  const townY = SH - townH + climb * 1.3;
  const shipW = SW * 0.48;
  const shipH = shipW * 0.55;
  const LIFT_S = 1.6;
  const lift = Math.min(1, flightS / LIFT_S);
  const ease = lift * lift * (3 - 2 * lift);
  const mastX = SW * 0.6 + 3.5;
  const moorX = mastX - shipW * 0.97;
  const moorY = SH - townH + townH * 0.06 - shipH * 0.42;
  const sway = localPhase === 'FLYING' && lift >= 1 ? Math.sin(srvNow / 700) : Math.sin(srvNow / 1100) * 0.4;
  const cruiseX = SW * 0.5 - shipW / 2;
  const cruiseY = SH * 0.4 + sway * SH * 0.02;
  let shipX = moorX + (cruiseX - moorX) * ease;
  let shipY = moorY + (cruiseY - moorY) * ease + (localPhase === 'BETTING' ? sway * 2 : 0);
  let shipRot = localPhase === 'FLYING' ? -4 * ease + sway * 2 : sway;
  if (crashed) {
    shipY += strikeS * strikeS * SH * 0.45;
    shipX -= strikeS * SW * 0.06;
    shipRot = Math.min(30, strikeS * 30);
  }
  const prop = localPhase === 'FLYING' ? (srvNow * 1.4) % 360 : (srvNow * 0.2) % 360;
  const betLeft = localPhase === 'BETTING' ? Math.max(0, (flyStart - srvNow) / 1000) : 0;
  const betTotal = config?.bettingDurationSeconds ?? 6;
  const altitudeM = Math.round(climb * 1.6);
  // Distant lightning: in a stormy sky, a flash in some half-second windows.
  const win = Math.floor(srvNow / 450);
  const flashRnd = seeded(win * 7 + 3)();
  const distantFlash = localPhase === 'FLYING' && storm > 0.25 && flashRnd < storm * 0.3;
  const flashX = seeded(win * 13 + 5)() * SW;
  const rain = Math.max(0, (storm - 0.35) / 0.65);
  const drops = useMemo(() => {
    const rnd = seeded(51);
    return Array.from({ length: 40 }, () => ({ x: rnd(), y: rnd(), l: 8 + rnd() * 10 }));
  }, []);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#1E1420', '#08060A']} style={StyleSheet.absoluteFill} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={BRASS_LIGHT} />
          <MaterialCommunityIcons name="airballoon" size={20} color={BRASS} />
          <Text style={styles.title}>AIRSHIP</Text>
        </Pressable>
        <View style={styles.topRight}>
          <View style={styles.balancePill}>
            <MaterialCommunityIcons name="wallet" size={15} color={BRASS} />
            <Text style={styles.balanceText}>₹{coins.toFixed(2)}</Text>
          </View>
          <Pressable onPress={() => navigation.navigate('Deposit')} style={styles.depositBtn}>
            <MaterialCommunityIcons name="plus" size={18} color="#2A1A00" />
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

        {/* Storm scene in a brass frame */}
        <View style={[styles.frame, { width: SW + 10 }]}>
          <View style={[styles.scene, { width: SW, height: SH }]}>
            <LinearGradient colors={[skyTop, skyBottom]} style={StyleSheet.absoluteFill} />
            {distantFlash && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(200,220,255,0.18)' }]} />}
            {distantFlash && <Bolt w={SW} h={SH} x0={flashX} x1={flashX + SW * 0.08} y1={SH * 0.45} seed={win} width={1.2} />}
            {[
              { off: far, seed: 7, a: 0.55 },
              { off: near, seed: 23, a: 0.9 },
            ].map((L) => (
              <View key={L.seed} pointerEvents="none" style={[styles.cloudCol, { height: SH * 2, top: -SH + L.off }]}>
                <CloudTile w={SW} h={SH} seed={L.seed} tint={cloudTint} shade={cloudShade} alpha={L.a} />
                <CloudTile w={SW} h={SH} seed={L.seed} tint={cloudTint} shade={cloudShade} alpha={L.a} />
              </View>
            ))}
            {townY < SH && (
              <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: townY }}>
                <Town w={SW} h={townH} />
              </View>
            )}
            {/* Mooring line while tied up */}
            {localPhase === 'BETTING' && townY < SH && (
              <Svg width={SW} height={SH} style={StyleSheet.absoluteFill} pointerEvents="none">
                <Path d={`M${shipX + shipW * 0.97} ${shipY + shipH * 0.42} Q ${mastX - 6} ${townY + townH * 0.04} ${mastX} ${townY + townH * 0.06}`} stroke="#2A1A0A" strokeWidth={1.5} fill="none" />
              </Svg>
            )}
            {/* The airship */}
            {shipY < SH + 10 && (
              <View pointerEvents="none" style={{ position: 'absolute', left: shipX, top: shipY, transform: [{ rotate: `${shipRot}deg` }] }}>
                <Ship size={shipW} prop={prop} />
              </View>
            )}
            {crashed && strikeS < 0.45 && <Bolt w={SW} h={SH} x0={shipX + shipW * 0.7} x1={shipX + shipW * 0.55} y1={shipY + shipH * 0.25} seed={7} width={3} />}
            {crashed && strikeS < 2 && (
              <View pointerEvents="none" style={{ position: 'absolute', left: shipX + shipW * 0.55 - SH * 0.25, top: shipY + shipH * 0.25 - SH * 0.25 }}>
                <Blaze size={SH * 0.5} t={strikeS} />
              </View>
            )}
            {/* Rain */}
            {rain > 0 && (
              <Svg width={SW} height={SH} style={[StyleSheet.absoluteFill, { opacity: rain }]} pointerEvents="none">
                {drops.map((d, i) => {
                  const y = ((d.y + srvNow / 900) % 1) * (SH + 20) - 20;
                  const x = ((d.x + srvNow / 4000) % 1) * SW;
                  return <Line key={i} x1={x} y1={y} x2={x - 4} y2={y + d.l} stroke="#C8D8F0" strokeWidth={1} strokeOpacity={0.5} />;
                })}
              </Svg>
            )}

            <View pointerEvents="none" style={{ position: 'absolute', right: 8, bottom: 8 }}>
              <Altimeter size={SH * 0.28} t={storm} label={`${localPhase === 'BETTING' ? 0 : altitudeM.toLocaleString()} m`} />
            </View>

            {crashed && strikeS < 0.25 && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(230,240,255,0.55)' }]} />}

            {localPhase !== 'BETTING' && (
              <View pointerEvents="none" style={styles.multWrap}>
                {crashed && <Text style={styles.boomText}>STRUCK BY LIGHTNING!</Text>}
                <Text style={[styles.bigMult, { fontSize: SH * 0.18, color: crashed ? '#FF5A4A' : '#FFF4DC', textShadowColor: crashed ? 'rgba(0,0,0,0.6)' : multColor(liveMult) }]}>
                  {liveMult.toFixed(2)}x
                </Text>
              </View>
            )}

            {localPhase === 'BETTING' && (
              <View pointerEvents="none" style={styles.nextWrap}>
                <Text style={styles.nextText}>CASTING OFF IN</Text>
                <Text style={styles.countText}>{betLeft.toFixed(1)}s</Text>
                <View style={styles.countTrack}>
                  <View style={[styles.countFill, { width: `${Math.min(100, (betLeft / betTotal) * 100)}%` }]} />
                </View>
              </View>
            )}
          </View>
          {[0, 1, 2, 3].map((k) => (
            <View key={k} style={[styles.bolt, { left: k % 2 ? undefined : 3, right: k % 2 ? 3 : undefined, top: k < 2 ? 3 : undefined, bottom: k < 2 ? undefined : 3 }]} />
          ))}
        </View>

        {/* Two bet panels: brass and mahogany */}
        {([0, 1] as const).map((i) => {
          const p = panels[i];
          const live = p.bet && localPhase === 'FLYING' && !p.cashedAt;
          const lostBet = p.bet && crashed && !p.cashedAt;
          let label = 'BET';
          let sub = `₹${p.amount.toFixed(2)}`;
          let colors: [string, string] = ['#E8B85A', '#9A6A18'];
          let ink = '#2A1600';
          if (live) {
            label = 'CASH OUT';
            sub = `₹${round2(Number(p.bet!.amount) * liveMult).toFixed(2)}`;
            colors = ['#4AC88A', '#1A7A4A'];
            ink = '#FFFFFF';
          } else if (p.queued) {
            label = 'CANCEL';
            sub = 'bet next flight';
            colors = ['#C84A3A', '#7A1A10'];
            ink = '#FFFFFF';
          } else if (p.cashedAt) {
            label = 'CASHED OUT';
            sub = `@ ${p.cashedAt.toFixed(2)}x`;
            colors = ['#4A3A2A', '#2A2016'];
            ink = BRASS_LIGHT;
          } else if (lostBet) {
            label = 'STRUCK';
            sub = `-₹${Number(p.bet!.amount).toFixed(2)}`;
            colors = ['#5A2A2A', '#3A1414'];
            ink = '#FFD0C8';
          } else if (p.bet) {
            label = 'WAITING';
            sub = 'to cast off';
            colors = ['#4A3A2A', '#2A2016'];
            ink = BRASS_LIGHT;
          }
          const locked = !!p.bet || p.queued;
          return (
            <View key={i} style={styles.panel}>
              <LinearGradient colors={['#4A2A1A', '#2A160C']} style={[StyleSheet.absoluteFill, { borderRadius: 14 }]} />
              {[0, 1, 2, 3].map((k) => (
                <View key={k} style={[styles.rivet, { left: k % 2 ? undefined : 5, right: k % 2 ? 5 : undefined, top: k < 2 ? 5 : undefined, bottom: k < 2 ? undefined : 5 }]} />
              ))}
              <View style={styles.panelLeft}>
                <View style={styles.stakeRow}>
                  <Pressable onPress={() => stepStake(i, -1)} disabled={locked} style={[styles.roundBtn, locked && styles.dim]}>
                    <MaterialCommunityIcons name="minus" size={18} color="#2A1600" />
                  </Pressable>
                  <Text style={styles.stakeText}>₹{p.amount}</Text>
                  <Pressable onPress={() => stepStake(i, 1)} disabled={locked} style={[styles.roundBtn, locked && styles.dim]}>
                    <MaterialCommunityIcons name="plus" size={18} color="#2A1600" />
                  </Pressable>
                </View>
                <View style={styles.quickRow}>
                  {QUICK.filter((q) => q <= maxStake).map((q) => (
                    <Pressable key={q} disabled={locked} onPress={() => setPanel(i, { amount: q })} style={[styles.quick, p.amount === q && styles.quickOn, locked && styles.dim]}>
                      <Text style={[styles.quickText, p.amount === q && { color: '#2A1600' }]}>{q}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.autoRow}>
                  <Text style={styles.autoLabel}>Auto</Text>
                  <Switch
                    value={p.autoOn}
                    disabled={locked}
                    onValueChange={(v) => setPanel(i, { autoOn: v })}
                    trackColor={{ true: BRASS, false: '#3A2A1E' }}
                    thumbColor={BRASS_LIGHT}
                    style={{ transform: [{ scale: 0.8 }] }}
                  />
                  <Pressable onPress={() => stepAuto(i, -1)} disabled={locked || !p.autoOn} style={[styles.miniBtn, (locked || !p.autoOn) && styles.dim]}>
                    <MaterialCommunityIcons name="minus" size={14} color="#2A1600" />
                  </Pressable>
                  <Text style={[styles.autoValue, !p.autoOn && { opacity: 0.4 }]}>{p.autoAt.toFixed(2)}x</Text>
                  <Pressable onPress={() => stepAuto(i, 1)} disabled={locked || !p.autoOn} style={[styles.miniBtn, (locked || !p.autoOn) && styles.dim]}>
                    <MaterialCommunityIcons name="plus" size={14} color="#2A1600" />
                  </Pressable>
                </View>
              </View>
              <Pressable onPress={() => onMain(i)} disabled={p.busy} style={({ pressed }) => [styles.mainWrap, pressed && styles.pressed]}>
                <LinearGradient colors={colors} style={styles.mainBtn}>
                  <Text style={[styles.mainLabel, { color: ink }]} numberOfLines={1} adjustsFontSizeToFit>
                    {p.busy ? '…' : label}
                  </Text>
                  <Text style={[styles.mainSub, { color: ink }]}>{sub}</Text>
                </LinearGradient>
              </Pressable>
            </View>
          );
        })}

        <Text style={styles.sectionTitle}>SHIP'S LOG</Text>
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
                <Text style={[styles.betMult, { color: won ? '#8AE8B0' : pending ? '#FFFFFF' : '#FF8A7A' }]}>
                  {won ? `${Number(b.cashoutMultiplier).toFixed(2)}x` : pending ? '—' : `${Number(b.round.crashMultiplier).toFixed(2)}x`}
                </Text>
                <Text style={[styles.betWin, { color: won ? '#8AE8B0' : '#8A8070' }]}>{won ? `+₹${Number(b.payout).toFixed(2)}` : pending ? 'aloft' : '—'}</Text>
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
          <Text style={[styles.toastText, toast.good && { color: '#0A2A16' }]}>{toast.text}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#08060A' },
  topBar: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  title: { color: BRASS_LIGHT, fontSize: 21, fontWeight: '900', letterSpacing: 4, fontFamily: SERIF },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  balancePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: 'rgba(216,168,74,0.12)', borderWidth: 1.5, borderColor: BRASS_DARK },
  balanceText: { color: BRASS_LIGHT, fontSize: 14, fontWeight: '800', fontFamily: SERIF },
  depositBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: BRASS },

  histRow: { gap: 6, paddingHorizontal: 10, paddingVertical: 6 },
  histChip: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 4, borderWidth: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  histText: { fontSize: 12, fontWeight: '900', fontFamily: SERIF },

  frame: { alignSelf: 'center', padding: 5, borderRadius: 16, backgroundColor: BRASS_DARK, borderWidth: 2, borderColor: BRASS },
  bolt: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: BRASS_LIGHT, borderWidth: 1, borderColor: BRASS_DARK },
  scene: { borderRadius: 12, overflow: 'hidden' },
  cloudCol: { position: 'absolute', left: 0, right: 0 },
  multWrap: { position: 'absolute', top: '6%', left: 0, right: 0, alignItems: 'center' },
  bigMult: { fontWeight: '900', fontFamily: SERIF, letterSpacing: 1, textShadowRadius: 16, textShadowOffset: { width: 0, height: 0 } },
  boomText: { color: '#FFE2A0', fontSize: 14, fontWeight: '900', letterSpacing: 3, fontFamily: SERIF, textShadowColor: '#000', textShadowRadius: 6, marginBottom: -2 },
  nextWrap: { position: 'absolute', top: '6%', alignSelf: 'center', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(30,18,10,0.7)', borderWidth: 1.5, borderColor: BRASS },
  nextText: { color: BRASS_LIGHT, fontSize: 13, fontWeight: '900', letterSpacing: 3, fontFamily: SERIF },
  countText: { color: '#FFFFFF', fontSize: 32, fontWeight: '900', fontFamily: SERIF, marginTop: 2 },
  countTrack: { width: 160, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden', marginTop: 6 },
  countFill: { height: '100%', backgroundColor: BRASS, borderRadius: 4 },

  panel: { flexDirection: 'row', gap: 10, marginHorizontal: 10, marginTop: 10, padding: 12, borderRadius: 14, borderWidth: 2, borderColor: BRASS_DARK, overflow: 'hidden' },
  rivet: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: BRASS, borderWidth: 1, borderColor: BRASS_DARK },
  panelLeft: { flex: 1, gap: 6 },
  stakeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 20, padding: 3, borderWidth: 1, borderColor: BRASS_DARK },
  roundBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: BRASS },
  stakeText: { color: BRASS_LIGHT, fontSize: 16, fontWeight: '900', fontFamily: SERIF },
  quickRow: { flexDirection: 'row', gap: 4 },
  quick: { flex: 1, height: 26, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(216,168,74,0.12)', borderWidth: 1, borderColor: 'rgba(216,168,74,0.3)' },
  quickOn: { backgroundColor: BRASS, borderColor: BRASS_LIGHT },
  quickText: { color: BRASS_LIGHT, fontSize: 12, fontWeight: '800' },
  autoRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  autoLabel: { color: 'rgba(255,226,160,0.75)', fontSize: 12, fontWeight: '800', fontFamily: SERIF },
  miniBtn: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: BRASS },
  autoValue: { color: BRASS_LIGHT, fontSize: 13, fontWeight: '900', minWidth: 48, textAlign: 'center' },
  mainWrap: { width: '42%' },
  mainBtn: { flex: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 4, borderWidth: 1.5, borderColor: BRASS_LIGHT },
  mainLabel: { fontSize: 19, fontWeight: '900', letterSpacing: 1, fontFamily: SERIF },
  mainSub: { fontSize: 13, fontWeight: '800', marginTop: 2 },
  pressed: { transform: [{ scale: 0.97 }] },
  dim: { opacity: 0.4 },

  sectionTitle: { color: BRASS, fontSize: 13, fontWeight: '900', letterSpacing: 3, marginTop: 16, marginHorizontal: 14, fontFamily: SERIF },
  emptyText: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginHorizontal: 14, marginTop: 6 },
  betRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: 'rgba(216,168,74,0.12)' },
  betTime: { flex: 1.2, color: 'rgba(255,255,255,0.55)', fontSize: 12 },
  betAmt: { flex: 1, color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  betMult: { flex: 1, fontSize: 13, fontWeight: '900', textAlign: 'center' },
  betWin: { flex: 1, fontSize: 13, fontWeight: '800', textAlign: 'right' },

  toast: { position: 'absolute', alignSelf: 'center', top: '40%', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(20,10,4,0.92)', borderWidth: 1.5, borderColor: '#C84A3A' },
  toastGood: { backgroundColor: '#8AE8B0', borderColor: '#1A7A4A' },
  toastText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
