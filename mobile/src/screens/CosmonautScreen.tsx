import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient as SvgLinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { ApiClientError } from '../api/client';
import {
  AviatorHistoryEntry,
  AviatorRoundView,
  CosmonautBet,
  CosmonautConfig,
  CosmonautMyBet,
  cashOutCosmonautBet,
  fetchCosmonautConfig,
  fetchCosmonautCurrentRound,
  fetchCosmonautHistory,
  fetchCosmonautMyBets,
  placeCosmonautBet,
} from '../api/backend';
import { useGameState } from '../state/GameStateContext';
import GameInfoButton from '../components/GameInfoButton';

const GOLD = '#FFD66B';
const CYAN = '#5CE1FF';
const VIOLET = '#9B7BFF';
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
  if (m < 2) return CYAN;
  if (m < 10) return VIOLET;
  return GOLD;
}

/** Mixes two #RRGGBB colours, t = 0 → a, 1 → b. */
function mix(a: string, b: string, t: number): string {
  const p = (c: string, i: number) => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
  const k = Math.max(0, Math.min(1, t));
  return `#${[0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * k).toString(16).padStart(2, '0')).join('')}`;
}

/** A colour along a list of stops, t in 0…1. */
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
// The cosmonaut stands on the launch pad on the curve of the Earth, lights
// the jetpack and flies up and out: the Earth drops away, stars stream past
// in three layers, the sky shifts from deep blue to violet, magenta and gold
// as the multiplier grows, and the Moon, a ringed planet, a red planet, a
// galaxy and a black hole drift by on a long flight. When the fuel runs out
// the flame dies and the cosmonaut tumbles away.

/** The cosmonaut, side-on, jetpack on the back. */
const Cosmonaut = memo(function Cosmonaut({ size }: { size: number }) {
  const u = useId().replace(/:/g, '');
  return (
    <Svg width={size} height={size * 1.2} viewBox="0 0 100 120">
      <Defs>
        <SvgLinearGradient id={`csSuit${u}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.6" stopColor="#DCE3EE" />
          <Stop offset="1" stopColor="#9AA6BA" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`csVisor${u}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFF2B8" />
          <Stop offset="0.35" stopColor="#F5A623" />
          <Stop offset="0.7" stopColor="#7A3A9A" />
          <Stop offset="1" stopColor="#1A1040" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`csPack${u}`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#5A6478" />
          <Stop offset="0.5" stopColor="#8A94A8" />
          <Stop offset="1" stopColor="#4A5468" />
        </SvgLinearGradient>
      </Defs>
      {/* Jetpack: tank and two nozzles */}
      <Rect x={14} y={40} width={22} height={40} rx={6} fill={`url(#csPack${u})`} stroke="#2A3040" strokeWidth={1.5} />
      <Rect x={17} y={44} width={6} height={30} rx={3} fill="#C8D0DC" opacity={0.5} />
      <Path d="M16 80 L 22 80 L 24 90 L 14 90 Z M27 80 L 33 80 L 35 90 L 25 90 Z" fill="#3A4252" stroke="#1A2030" strokeWidth={1} />
      {/* Legs */}
      <Path d="M38 82 C 36 94, 34 102, 30 110 L 40 113 C 46 104, 48 94, 50 86 Z" fill={`url(#csSuit${u})`} stroke="#6A7488" strokeWidth={1.2} />
      <Path d="M52 84 C 56 94, 60 100, 66 106 L 72 99 C 66 94, 62 88, 60 80 Z" fill={`url(#csSuit${u})`} stroke="#6A7488" strokeWidth={1.2} />
      <Rect x={27} y={108} width={15} height={8} rx={3} fill="#3A4252" />
      <Rect x={66} y={97} width={10} height={13} rx={3} fill="#3A4252" transform="rotate(-40 71 103)" />
      {/* Body */}
      <Path d="M32 46 C 32 36, 64 34, 66 46 L 64 84 C 56 90, 40 90, 34 84 Z" fill={`url(#csSuit${u})`} stroke="#6A7488" strokeWidth={1.4} />
      {/* Chest panel */}
      <Rect x={44} y={54} width={16} height={12} rx={2} fill="#2A3448" stroke="#6A7488" strokeWidth={1} />
      <Circle cx={48} cy={60} r={1.8} fill="#FF4F6D" />
      <Circle cx={53} cy={60} r={1.8} fill="#5CFF9A" />
      <Rect x={56} y={58} width={2.5} height={5} fill={CYAN} />
      {/* Flag patch */}
      <Rect x={36} y={50} width={6} height={4} fill="#E8132B" />
      {/* Arm reaching forward */}
      <Path d="M58 50 C 70 50, 80 46, 88 40 L 92 46 C 84 54, 72 60, 60 60 Z" fill={`url(#csSuit${u})`} stroke="#6A7488" strokeWidth={1.2} />
      <Circle cx={91} cy={42} r={5} fill="#3A4252" />
      {/* Helmet */}
      <Circle cx={52} cy={26} r={20} fill={`url(#csSuit${u})`} stroke="#6A7488" strokeWidth={1.5} />
      <Path d="M54 14 C 70 14, 74 30, 68 38 C 62 42, 50 40, 48 30 C 46 22, 48 14, 54 14 Z" fill={`url(#csVisor${u})`} stroke="#2A2040" strokeWidth={1.2} />
      <Path d="M58 18 C 64 18, 67 22, 67 26" stroke="#FFFFFF" strokeWidth={2.2} strokeLinecap="round" fill="none" opacity={0.85} />
      <Rect x={40} y={8} width={4} height={8} rx={2} fill="#9AA6BA" />
    </Svg>
  );
});

/** Jetpack flame; `power` 0…1.3 sets its length, `flick` 0…1 makes it waver. */
function Flame({ w, power, flick }: { w: number; power: number; flick: number }) {
  const u = useId().replace(/:/g, '');
  const len = w * (0.6 + power * 1.4) * (0.88 + flick * 0.24);
  return (
    <Svg width={w} height={len + 4}>
      <Defs>
        <SvgLinearGradient id={`csFl${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.25" stopColor="#FFE36B" />
          <Stop offset="0.6" stopColor="#FF7A1A" />
          <Stop offset="1" stopColor="#FF2A6A" stopOpacity={0} />
        </SvgLinearGradient>
      </Defs>
      <Path d={`M${w * 0.1} 0 L ${w * 0.9} 0 C ${w * 0.8} ${len * 0.4}, ${w * 0.6} ${len * 0.8}, ${w * 0.5} ${len} C ${w * 0.4} ${len * 0.8}, ${w * 0.2} ${len * 0.4}, ${w * 0.1} 0 Z`} fill={`url(#csFl${u})`} />
      <Path d={`M${w * 0.3} 0 L ${w * 0.7} 0 C ${w * 0.62} ${len * 0.3}, ${w * 0.55} ${len * 0.5}, ${w * 0.5} ${len * 0.6} C ${w * 0.45} ${len * 0.5}, ${w * 0.38} ${len * 0.3}, ${w * 0.3} 0 Z`} fill="#FFFFFF" opacity={0.8} />
    </Svg>
  );
}

/** One screen-high tile of stars; tiles stack and scroll down as the cosmonaut climbs. */
const StarTile = memo(function StarTile({ w, h, seed, n, big }: { w: number; h: number; seed: number; n: number; big: number }) {
  const stars = useMemo(() => {
    const rnd = seeded(seed);
    return Array.from({ length: n }, () => ({ x: rnd() * w, y: rnd() * h, r: (0.4 + rnd() * 0.9) * big, o: 0.35 + rnd() * 0.6, tint: rnd() }));
  }, [w, h, seed, n, big]);
  return (
    <Svg width={w} height={h}>
      {stars.map((s, i) => (
        <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill={s.tint < 0.15 ? '#FFD6A0' : s.tint < 0.3 ? '#A8D8FF' : '#FFFFFF'} opacity={s.o} />
      ))}
    </Svg>
  );
});

/** The curve of the Earth with its blue atmosphere, and the launch pad on top. */
const Earth = memo(function Earth({ w, h }: { w: number; h: number }) {
  const u = useId().replace(/:/g, '');
  const r = w * 1.4;
  const cy = h * 0.42 + r;
  return (
    <Svg width={w} height={h}>
      <Defs>
        <RadialGradient id={`csAtm${u}`} cx="50%" cy="50%" r="50%">
          <Stop offset="0.9" stopColor="#5CC8FF" stopOpacity={0.6} />
          <Stop offset="1" stopColor="#5CC8FF" stopOpacity={0} />
        </RadialGradient>
        <SvgLinearGradient id={`csLand${u}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#1E5AA8" />
          <Stop offset="0.5" stopColor="#0E3A7A" />
          <Stop offset="1" stopColor="#06204A" />
        </SvgLinearGradient>
      </Defs>
      <Circle cx={w / 2} cy={cy} r={r * 1.06} fill={`url(#csAtm${u})`} />
      <Circle cx={w / 2} cy={cy} r={r} fill={`url(#csLand${u})`} />
      {/* Continents and cloud bands */}
      <Path d={`M${w * 0.08} ${h * 0.52} C ${w * 0.2} ${h * 0.46}, ${w * 0.3} ${h * 0.5}, ${w * 0.34} ${h * 0.58} C ${w * 0.26} ${h * 0.64}, ${w * 0.12} ${h * 0.62}, ${w * 0.08} ${h * 0.52} Z`} fill="#3A8A4A" opacity={0.8} />
      <Path d={`M${w * 0.66} ${h * 0.5} C ${w * 0.78} ${h * 0.45}, ${w * 0.92} ${h * 0.5}, ${w * 0.95} ${h * 0.6} C ${w * 0.84} ${h * 0.66}, ${w * 0.7} ${h * 0.6}, ${w * 0.66} ${h * 0.5} Z`} fill="#4A9A4A" opacity={0.8} />
      <Path d={`M0 ${h * 0.66} C ${w * 0.3} ${h * 0.6}, ${w * 0.6} ${h * 0.7}, ${w} ${h * 0.64}`} stroke="#FFFFFF" strokeOpacity={0.35} strokeWidth={6} fill="none" strokeLinecap="round" />
      {/* Launch pad */}
      <Rect x={w * 0.38} y={h * 0.4} width={w * 0.24} height={h * 0.05} rx={3} fill="#3A4252" stroke="#8A94A8" strokeWidth={1.2} />
      <Rect x={w * 0.6} y={h * 0.08} width={w * 0.025} height={h * 0.33} fill="#5A6478" />
      {Array.from({ length: 6 }, (_, i) => (
        <Line key={i} x1={w * 0.6} y1={h * (0.1 + i * 0.05)} x2={w * 0.625} y2={h * (0.14 + i * 0.05)} stroke="#8A94A8" strokeWidth={1} />
      ))}
      <Circle cx={w * 0.612} cy={h * 0.07} r={3} fill="#FF4F6D" />
    </Svg>
  );
});

type BodyKind = 'moon' | 'ringed' | 'red' | 'galaxy' | 'hole';

/** A planet, galaxy or black hole passing by. */
const Body = memo(function Body({ kind, size }: { kind: BodyKind; size: number }) {
  const u = useId().replace(/:/g, '');
  const c = size / 2;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={`csB${u}`} cx="35%" cy="35%" r="70%">
          <Stop offset="0" stopColor={kind === 'moon' ? '#F4F4F0' : kind === 'ringed' ? '#FFE0A0' : '#FF9A6A'} />
          <Stop offset="1" stopColor={kind === 'moon' ? '#6A6A72' : kind === 'ringed' ? '#A0602A' : '#7A1A0A'} />
        </RadialGradient>
        <RadialGradient id={`csG${u}`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.95} />
          <Stop offset="0.3" stopColor="#FF9AE8" stopOpacity={0.6} />
          <Stop offset="1" stopColor="#5A2AFF" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`csH${u}`} cx="50%" cy="50%" r="50%">
          <Stop offset="0.35" stopColor="#000000" />
          <Stop offset="0.5" stopColor="#FF8A2A" />
          <Stop offset="0.65" stopColor="#FFD66B" stopOpacity={0.5} />
          <Stop offset="1" stopColor="#FF4FA0" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {kind === 'moon' && (
        <G>
          <Circle cx={c} cy={c} r={c * 0.9} fill={`url(#csB${u})`} />
          {[
            [0.6, 0.7, 0.12],
            [1.2, 0.9, 0.18],
            [0.9, 1.35, 0.1],
            [1.35, 1.3, 0.08],
          ].map(([x, y, r], i) => (
            <Circle key={i} cx={c * x} cy={c * y} r={c * r} fill="#000000" opacity={0.15} />
          ))}
        </G>
      )}
      {kind === 'ringed' && (
        <G>
          <Ellipse cx={c} cy={c} rx={c * 0.98} ry={c * 0.26} fill="none" stroke="#E8C890" strokeWidth={c * 0.08} opacity={0.6} transform={`rotate(-18 ${c} ${c})`} />
          <Circle cx={c} cy={c} r={c * 0.55} fill={`url(#csB${u})`} />
          {[0.35, 0.55].map((t) => (
            <Path key={t} d={`M${c * 0.5} ${c * (0.6 + t)} Q ${c} ${c * (0.5 + t)} ${c * 1.5} ${c * (0.6 + t)}`} stroke="#8A4A1A" strokeWidth={c * 0.05} opacity={0.4} fill="none" />
          ))}
          <Path d={`M${c * 0.02} ${c * 1.12} A ${c * 0.98} ${c * 0.26} -18 0 0 ${c * 1.98} ${c * 0.88}`} stroke="#E8C890" strokeWidth={c * 0.08} fill="none" opacity={0.85} transform={`rotate(0 ${c} ${c})`} />
        </G>
      )}
      {kind === 'red' && (
        <G>
          <Circle cx={c} cy={c} r={c * 0.8} fill={`url(#csB${u})`} />
          <Ellipse cx={c * 0.8} cy={c * 0.8} rx={c * 0.2} ry={c * 0.12} fill="#5A0A00" opacity={0.3} />
          <Ellipse cx={c * 1.25} cy={c * 1.2} rx={c * 0.15} ry={c * 0.1} fill="#5A0A00" opacity={0.3} />
        </G>
      )}
      {kind === 'galaxy' && (
        <G transform={`rotate(-25 ${c} ${c})`}>
          <Ellipse cx={c} cy={c} rx={c} ry={c * 0.45} fill={`url(#csG${u})`} />
          {[0, 180].map((a) => (
            <Path key={a} d={`M${c} ${c} C ${c + c * 0.4} ${c - c * 0.3}, ${c + c * 0.9} ${c}, ${c + c * 0.7} ${c + c * 0.3}`} stroke="#FFD6F0" strokeWidth={2} fill="none" opacity={0.7} transform={`rotate(${a} ${c} ${c})`} />
          ))}
        </G>
      )}
      {kind === 'hole' && (
        <G>
          <Circle cx={c} cy={c} r={c} fill={`url(#csH${u})`} />
          <Ellipse cx={c} cy={c} rx={c * 0.95} ry={c * 0.18} fill="none" stroke="#FFD66B" strokeWidth={c * 0.06} opacity={0.8} />
          <Circle cx={c} cy={c} r={c * 0.33} fill="#000000" />
        </G>
      )}
    </Svg>
  );
});

/** Lobby tile: the cosmonaut flying past a ringed planet, flame lit. */
export function CosmonautTileArt({ size }: { size: number }) {
  const u = useId().replace(/:/g, '');
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={size} height={size}>
        <Defs>
          <SvgLinearGradient id={`csTile${u}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#1A0A4A" />
            <Stop offset="0.6" stopColor="#3A1A7A" />
            <Stop offset="1" stopColor="#0A0420" />
          </SvgLinearGradient>
        </Defs>
        <Rect x={0} y={0} width={size} height={size} fill={`url(#csTile${u})`} />
        {Array.from({ length: 24 }, (_, i) => (
          <Circle key={i} cx={((i * 37) % 100) * (size / 100)} cy={((i * 61) % 100) * (size / 100)} r={(i % 3) * 0.5 + 0.6} fill="#FFFFFF" opacity={0.7} />
        ))}
      </Svg>
      <View style={{ position: 'absolute', left: size * 0.02, top: size * 0.06 }}>
        <Body kind="ringed" size={size * 0.42} />
      </View>
      <View style={{ position: 'absolute', left: size * 0.36, top: size * 0.52, transform: [{ rotate: '35deg' }] }}>
        <Flame w={size * 0.12} power={0.8} flick={0.5} />
      </View>
      <View style={{ position: 'absolute', left: size * 0.36, top: size * 0.1, transform: [{ rotate: '35deg' }] }}>
        <Cosmonaut size={size * 0.46} />
      </View>
    </View>
  );
}

// ---------- bet panel ----------

type PanelState = {
  amount: number;
  autoOn: boolean;
  autoAt: number;
  halfOn: boolean;
  halfTarget: number;
  bet: CosmonautBet | null;
  queued: boolean;
  /** Multiplier half the stake was taken at (by hand or Auto ½), and what it paid. */
  halfAt: number | null;
  halfPaid: number;
  cashedAt: number | null;
  busy: boolean;
};

function initialPanel(amount: number): PanelState {
  return { amount, autoOn: false, autoAt: 3, halfOn: false, halfTarget: 1.5, bet: null, queued: false, halfAt: null, halfPaid: 0, cashedAt: null, busy: false };
}

/** Bodies that drift past: each comes into view at multiplier `at` and takes until `at * PASS` to cross. */
const BODIES: { kind: BodyKind; at: number; x: number; k: number }[] = [
  { kind: 'moon', at: 1.35, x: 0.66, k: 0.3 },
  { kind: 'ringed', at: 2.4, x: 0.02, k: 0.48 },
  { kind: 'red', at: 4.4, x: 0.68, k: 0.28 },
  { kind: 'galaxy', at: 8.5, x: 0.06, k: 0.55 },
  { kind: 'hole', at: 18, x: 0.56, k: 0.42 },
];
const PASS = 1.9;

// ---------- screen ----------

export default function CosmonautScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<CosmonautConfig | null>(null);
  const [view, setView] = useState<AviatorRoundView | null>(null);
  const [history, setHistory] = useState<AviatorHistoryEntry[]>([]);
  const [myBets, setMyBets] = useState<CosmonautMyBet[]>([]);
  const [panels, setPanels] = useState<[PanelState, PanelState]>([initialPanel(10), initialPanel(20)]);
  const [toast, setToast] = useState<{ text: string; good: boolean } | null>(null);
  const [, setFrame] = useState(0);

  const offsetRef = useRef(0);
  const mountedRef = useRef(true);
  const panelsRef = useRef(panels);
  panelsRef.current = panels;
  const periodRef = useRef<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** When this client saw the fuel run out; drives the tumble. */
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
    fetchCosmonautHistory(30)
      .then((h) => mountedRef.current && setHistory(h))
      .catch(() => {});
    fetchCosmonautMyBets()
      .then((b) => mountedRef.current && setMyBets(b.slice(0, 15)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchCosmonautConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => {});
    loadLists();
    return () => {
      mountedRef.current = false;
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [loadLists]);

  // Round polling, quicker while in flight.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;
    const loop = async () => {
      let delay = 700;
      try {
        const sentAt = Date.now();
        const v = await fetchCosmonautCurrentRound();
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

  // Smooth frames while flying or counting down.
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

  // Out of fuel: refresh wallet and lists (an Auto ½ may have paid at settle).
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
      if (p.autoOn && p.halfOn && p.halfTarget >= p.autoAt) return showToast('Auto ½ must be below the auto cash-out');
      setPanel(i, { busy: true });
      try {
        const bet = await placeCosmonautBet(p.amount, p.autoOn ? p.autoAt : undefined, p.halfOn ? p.halfTarget : undefined);
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
        const res = await cashOutCosmonautBet(p.bet.id, half);
        if (!mountedRef.current) return;
        if (res.half) {
          setPanel(i, { busy: false, halfAt: res.multiplier, halfPaid: res.payout });
          showToast(`½ banked: +₹${res.payout.toFixed(2)} @ ${res.multiplier.toFixed(2)}x`, true);
        } else {
          setPanel(i, { busy: false, cashedAt: res.multiplier, ...(res.halfAt ? { halfAt: res.halfAt, halfPaid: res.halfPaid ?? 0 } : {}) });
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

  // Auto ½ and auto cash-out: once the flight passes a panel's targets,
  // claim them (the server pays exactly the target).
  useEffect(() => {
    if (localPhase !== 'FLYING') return;
    panels.forEach((p, i) => {
      if (!p.bet || p.cashedAt || p.busy) return;
      if (p.bet.autoCashoutAt && liveMult >= Number(p.bet.autoCashoutAt)) return cashOut(i as 0 | 1);
      if (p.bet.autoHalfAt && !p.halfAt && liveMult >= Number(p.bet.autoHalfAt)) cashOut(i as 0 | 1, true);
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
  const stepTarget = (i: 0 | 1, key: 'autoAt' | 'halfTarget', dir: 1 | -1) => {
    const steps = AUTO_STEPS.filter((v) => v >= minAuto);
    const idx = Math.max(0, steps.indexOf(panels[i][key]));
    setPanel(i, { [key]: steps[Math.max(0, Math.min(steps.length - 1, idx + dir))] ?? panels[i][key] });
  };

  // ---- scene geometry ----
  const SW = W - 20;
  const SH = Math.min(SW * 0.9, 380);
  const crashed = localPhase === 'CRASHED';
  const flightS = localPhase === 'BETTING' ? 0 : crashed && view?.crashMultiplier ? Math.log(view.crashMultiplier) / growth : elapsed;
  const fallS = crashed && crashSeenRef.current ? (Date.now() - crashSeenRef.current) / 1000 : 0;
  // How far the camera has climbed, in px: faster the longer the flight.
  const climb = SH * (0.85 * flightS + 0.07 * flightS * flightS);
  const layers = [
    { off: (climb * 0.15) % SH, seed: 5, n: 70, big: 0.8 },
    { off: (climb * 0.45) % SH, seed: 17, n: 34, big: 1.2 },
    { off: (climb * 1.1) % SH, seed: 31, n: 12, big: 1.9 },
  ];
  // The sky warms with the multiplier: deep blue → violet → magenta → gold.
  const heat = Math.log(Math.max(1, liveMult)) / Math.log(100);
  const skyTop = ramp(['#050B2A', '#1A0A4A', '#3A0A5A', '#5A0A3A', '#3A1A04'], heat);
  const skyBottom = ramp(['#0E2A6A', '#3A1A8A', '#8A1A7A', '#C83A4A', '#C8801A'], heat);
  const earthH = SH * 0.5;
  const earthY = SH - earthH + climb * 1.25;
  // The cosmonaut: on the pad while bets go in, lifts off, then holds the frame's centre.
  const csW = SW * 0.26;
  const csH = csW * 1.2;
  const LIFT_S = 1.2;
  const lift = Math.min(1, flightS / LIFT_S);
  const ease = lift * lift * (3 - 2 * lift);
  const padX = SW * 0.5 - csW * 0.5;
  const padY = SH - earthH + earthH * 0.4 - csH * 0.96;
  const hover = localPhase === 'FLYING' && lift >= 1 ? Math.sin(srvNow / 450) : 0;
  const cruiseX = SW * 0.38 + hover * SW * 0.015;
  const cruiseY = SH * 0.42 + hover * SH * 0.02;
  let csX = padX + (cruiseX - padX) * ease;
  let csY = padY + (cruiseY - padY) * ease;
  let csRot = localPhase === 'BETTING' ? 0 : 30 * ease + hover * 3;
  if (crashed) {
    // Out of fuel: tumbles away, spinning.
    csX += fallS * SW * 0.25;
    csY += fallS * fallS * SH * 0.5;
    csRot += fallS * 420;
  }
  const ready = localPhase === 'BETTING' && view && flyStart - srvNow < 1500;
  const shake = ready ? Math.sin(srvNow / 30) * 1.5 : 0;
  const flick = (Math.sin(srvNow / 37) + Math.sin(srvNow / 23)) / 4 + 0.5;
  const power = localPhase === 'FLYING' ? Math.min(1.3, 0.7 + flightS * 0.04) : ready ? 0.25 : 0;
  const betLeft = localPhase === 'BETTING' ? Math.max(0, (flyStart - srvNow) / 1000) : 0;
  const betTotal = config?.bettingDurationSeconds ?? 6;
  const distanceKm = Math.round(climb * 12);
  // Flame sits under the jetpack nozzles; follows the body's rotation.
  const rad = (csRot * Math.PI) / 180;
  const nozzle = { x: csX + csW * 0.245, y: csY + csH * 0.75 };
  const pivot = { x: csX + csW / 2, y: csY + csH / 2 };
  const nx = pivot.x + (nozzle.x - pivot.x) * Math.cos(rad) - (nozzle.y - pivot.y) * Math.sin(rad);
  const ny = pivot.y + (nozzle.x - pivot.x) * Math.sin(rad) + (nozzle.y - pivot.y) * Math.cos(rad);
  const flameW = csW * 0.3;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#0A0A2A', '#02020C']} style={StyleSheet.absoluteFill} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color="#FFFFFF" />
          <MaterialCommunityIcons name="rocket-launch" size={20} color={CYAN} />
          <Text style={styles.title}>COSMONAUT</Text>
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
          <LinearGradient colors={[skyTop, skyBottom]} style={StyleSheet.absoluteFill} />
          {layers.map((L) => (
            <View key={L.seed} pointerEvents="none" style={[styles.starCol, { height: SH * 2, top: -SH + L.off }]}>
              <StarTile w={SW} h={SH} seed={L.seed} n={L.n} big={L.big} />
              <StarTile w={SW} h={SH} seed={L.seed} n={L.n} big={L.big} />
            </View>
          ))}
          {/* Planets and the rest drift by on a long flight */}
          {BODIES.map((b) => {
            const size = SW * b.k;
            const pass = Math.log(liveMult / b.at) / Math.log(PASS);
            if (localPhase === 'BETTING' || pass < 0 || pass > 1) return null;
            const y = -size + pass * (SH + size);
            return (
              <View key={b.kind} pointerEvents="none" style={{ position: 'absolute', left: SW * b.x, top: y }}>
                <Body kind={b.kind} size={size} />
              </View>
            );
          })}
          {/* Speed streaks once it's really moving */}
          {localPhase === 'FLYING' && flightS > 3 && (
            <Svg width={SW} height={SH} style={StyleSheet.absoluteFill} pointerEvents="none">
              {Array.from({ length: 9 }, (_, i) => {
                const x = ((i * 0.37 + 0.07) % 1) * SW;
                const y = ((((climb * 2.4) / SH + i * 0.23) % 1.3) - 0.3) * SH;
                return <Line key={i} x1={x} y1={y} x2={x} y2={y + SH * 0.14} stroke="#FFFFFF" strokeOpacity={Math.min(0.3, flightS / 40)} strokeWidth={1.2} strokeLinecap="round" />;
              })}
            </Svg>
          )}
          {earthY < SH && (
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: earthY }}>
              <Earth w={SW} h={earthH} />
            </View>
          )}

          {/* Jetpack flame, then the cosmonaut */}
          {power > 0 && !crashed && (
            <View pointerEvents="none" style={{ position: 'absolute', left: nx - flameW / 2, top: ny, transform: [{ rotate: `${csRot}deg` }], transformOrigin: 'top' }}>
              <Flame w={flameW} power={power} flick={flick} />
            </View>
          )}
          {csY < SH + 20 && (
            <View pointerEvents="none" style={{ position: 'absolute', left: csX + shake, top: csY, transform: [{ rotate: `${csRot}deg` }] }}>
              <Cosmonaut size={csW} />
            </View>
          )}
          {crashed && fallS < 1 && (
            <Svg width={SW} height={SH} style={StyleSheet.absoluteFill} pointerEvents="none">
              {Array.from({ length: 8 }, (_, i) => {
                const a = (i / 8) * Math.PI * 2;
                const r = 10 + fallS * 70;
                return <Circle key={i} cx={nx + Math.cos(a) * r} cy={ny + Math.sin(a) * r} r={3 * (1 - fallS)} fill="#FFB23F" opacity={1 - fallS} />;
              })}
            </Svg>
          )}

          {/* Distance gauge */}
          <View pointerEvents="none" style={styles.gauge}>
            <MaterialCommunityIcons name="arrow-up-bold" size={12} color={CYAN} />
            <Text style={styles.gaugeText}>{localPhase === 'BETTING' ? '0' : distanceKm.toLocaleString()} km</Text>
          </View>

          {crashed && fallS < 0.35 && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,80,60,0.22)' }]} />}

          {/* Multiplier */}
          {localPhase !== 'BETTING' && (
            <View pointerEvents="none" style={styles.multWrap}>
              {crashed && <Text style={styles.boomText}>OUT OF FUEL!</Text>}
              <Text style={[styles.bigMult, { fontSize: SH * 0.17, color: crashed ? '#FF4F6D' : '#FFFFFF', textShadowColor: crashed ? 'rgba(0,0,0,0.6)' : multColor(liveMult) }]}>
                {liveMult.toFixed(2)}x
              </Text>
            </View>
          )}

          {localPhase === 'BETTING' && (
            <View pointerEvents="none" style={styles.nextWrap}>
              <Text style={styles.nextText}>LIFT-OFF IN</Text>
              <Text style={styles.countText}>{betLeft.toFixed(1)}s</Text>
              <View style={styles.countTrack}>
                <View style={[styles.countFill, { width: `${Math.min(100, (betLeft / betTotal) * 100)}%` }]} />
              </View>
            </View>
          )}
        </View>

        {/* Two bet consoles */}
        {([0, 1] as const).map((i) => {
          const p = panels[i];
          const live = p.bet && localPhase === 'FLYING' && !p.cashedAt;
          const lostBet = p.bet && crashed && !p.cashedAt;
          const riding = p.bet ? (p.halfAt ? Number(p.bet.amount) / 2 : Number(p.bet.amount)) : 0;
          let label = 'BET';
          let sub = `₹${p.amount.toFixed(2)}`;
          let colors: [string, string] = ['#5C7CFF', '#3A2AC8'];
          if (live) {
            label = 'CASH OUT';
            sub = `₹${round2(riding * liveMult).toFixed(2)}`;
            colors = ['#FFB23F', '#E07A10'];
          } else if (p.queued) {
            label = 'CANCEL';
            sub = 'bet next flight';
            colors = ['#FF5A6A', '#C21F31'];
          } else if (p.cashedAt) {
            label = 'CASHED OUT';
            sub = `@ ${p.cashedAt.toFixed(2)}x`;
            colors = ['#2A2A5A', '#1A1A3A'];
          } else if (lostBet) {
            label = 'OUT OF FUEL';
            sub = p.halfAt ? `kept ₹${p.halfPaid.toFixed(2)}` : `-₹${Number(p.bet!.amount).toFixed(2)}`;
            colors = ['#5A2A3A', '#3A1422'];
          } else if (p.bet) {
            label = 'WAITING';
            sub = 'for lift-off';
            colors = ['#2A2A5A', '#1A1A3A'];
          }
          const locked = !!p.bet || p.queued;
          const canHalf = !!live && !p.halfAt && !p.busy;
          return (
            <View key={i} style={styles.panel}>
              <LinearGradient colors={['#1A1C3A', '#0C0E22']} style={[StyleSheet.absoluteFill, { borderRadius: 16 }]} />
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
                {(
                  [
                    ['Auto', 'autoOn', 'autoAt'],
                    ['Auto ½', 'halfOn', 'halfTarget'],
                  ] as const
                ).map(([name, onKey, valKey]) => (
                  <View key={name} style={styles.autoRow}>
                    <Text style={styles.autoLabel}>{name}</Text>
                    <Switch
                      value={p[onKey]}
                      disabled={locked}
                      onValueChange={(v) => setPanel(i, { [onKey]: v })}
                      trackColor={{ true: onKey === 'halfOn' ? VIOLET : '#5C7CFF', false: '#2A2C4C' }}
                      thumbColor="#FFFFFF"
                      style={{ transform: [{ scale: 0.75 }] }}
                    />
                    <Pressable onPress={() => stepTarget(i, valKey, -1)} disabled={locked || !p[onKey]} style={[styles.miniBtn, (locked || !p[onKey]) && styles.dim]}>
                      <MaterialCommunityIcons name="minus" size={14} color="#FFFFFF" />
                    </Pressable>
                    <Text style={[styles.autoValue, !p[onKey] && { opacity: 0.4 }]}>{p[valKey].toFixed(2)}x</Text>
                    <Pressable onPress={() => stepTarget(i, valKey, 1)} disabled={locked || !p[onKey]} style={[styles.miniBtn, (locked || !p[onKey]) && styles.dim]}>
                      <MaterialCommunityIcons name="plus" size={14} color="#FFFFFF" />
                    </Pressable>
                  </View>
                ))}
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
                {/* Half cash-out: bank half now, let the rest fly */}
                <Pressable onPress={() => cashOut(i, true)} disabled={!canHalf} style={({ pressed }) => [styles.halfBtn, !canHalf && styles.halfOff, pressed && styles.pressed]}>
                  <MaterialCommunityIcons name="circle-half-full" size={14} color={canHalf ? '#1A0A40' : 'rgba(255,255,255,0.5)'} />
                  <Text style={[styles.halfText, !canHalf && { color: 'rgba(255,255,255,0.5)' }]}>
                    {p.halfAt ? `½ @ ${p.halfAt.toFixed(2)}x` : live ? `½ OUT ₹${round2((Number(p.bet!.amount) / 2) * liveMult).toFixed(2)}` : '½ OUT'}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        })}

        <Text style={styles.helpText}>½ OUT banks half your stake at the live multiplier and leaves the other half flying — once per bet. Auto ½ does it for you at the multiplier you set.</Text>

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
                <Text style={[styles.betMult, { color: won ? '#A8C0FF' : pending ? '#FFFFFF' : '#FF7A8A' }]}>
                  {b.halfCashoutMultiplier ? `½${Number(b.halfCashoutMultiplier).toFixed(2)} ` : ''}
                  {won ? `${Number(b.cashoutMultiplier).toFixed(2)}x` : pending ? '—' : `${Number(b.round.crashMultiplier).toFixed(2)}x`}
                </Text>
                <Text style={[styles.betWin, { color: paid > 0 ? '#A8C0FF' : '#8A8FA8' }]}>{paid > 0 ? `+₹${paid.toFixed(2)}` : pending ? 'live' : '—'}</Text>
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
          <Text style={[styles.toastText, toast.good && { color: '#140A3A' }]}>{toast.text}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#02020C' },
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

  scene: { alignSelf: 'center', borderRadius: 18, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(155,123,255,0.5)' },
  starCol: { position: 'absolute', left: 0, right: 0 },
  gauge: { position: 'absolute', left: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: 'rgba(0,0,20,0.6)', borderWidth: 1, borderColor: 'rgba(92,225,255,0.4)' },
  gaugeText: { color: CYAN, fontSize: 12, fontWeight: '900', fontVariant: ['tabular-nums'] },
  multWrap: { position: 'absolute', top: '5%', left: 0, right: 0, alignItems: 'center' },
  bigMult: { fontWeight: '900', fontStyle: 'italic', letterSpacing: -1, textShadowRadius: 18, textShadowOffset: { width: 0, height: 0 } },
  boomText: { color: '#FFD6A0', fontSize: 16, fontWeight: '900', letterSpacing: 3, textShadowColor: '#000', textShadowRadius: 6, marginBottom: -4 },
  nextWrap: { position: 'absolute', top: '6%', alignSelf: 'center', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 16, backgroundColor: 'rgba(5,5,30,0.6)', borderWidth: 1, borderColor: 'rgba(92,225,255,0.3)' },
  nextText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '900', letterSpacing: 2 },
  countText: { color: GOLD, fontSize: 34, fontWeight: '900', marginTop: 2 },
  countTrack: { width: 160, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden', marginTop: 6 },
  countFill: { height: '100%', backgroundColor: CYAN, borderRadius: 4 },

  panel: { flexDirection: 'row', gap: 10, marginHorizontal: 10, marginTop: 10, padding: 10, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(92,225,255,0.22)', overflow: 'hidden' },
  panelLeft: { flex: 1, gap: 5 },
  stakeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 20, padding: 3, borderWidth: 1, borderColor: 'rgba(92,225,255,0.15)' },
  roundBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  stakeText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  quickRow: { flexDirection: 'row', gap: 4 },
  quick: { flex: 1, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  quickOn: { backgroundColor: 'rgba(92,124,255,0.25)', borderWidth: 1, borderColor: '#5C7CFF' },
  quickText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  autoRow: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 26 },
  autoLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '800', width: 42 },
  miniBtn: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  autoValue: { color: GOLD, fontSize: 12, fontWeight: '900', minWidth: 44, textAlign: 'center' },
  mainCol: { width: '42%', gap: 6 },
  mainBtn: { flex: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 4 },
  mainLabel: { color: '#FFFFFF', fontSize: 19, fontWeight: '900', letterSpacing: 1 },
  mainSub: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '800', marginTop: 2 },
  halfBtn: { height: 32, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: VIOLET },
  halfOff: { backgroundColor: 'rgba(255,255,255,0.08)' },
  halfText: { color: '#1A0A40', fontSize: 12, fontWeight: '900' },
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
  toastGood: { backgroundColor: '#C8B8FF', borderColor: VIOLET },
  toastText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
