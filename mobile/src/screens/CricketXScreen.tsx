import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient as SvgLinearGradient, Path, Polygon, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { ApiClientError } from '../api/client';
import {
  AviatorBetResult,
  AviatorConfig,
  AviatorHistoryEntry,
  AviatorMyBet,
  AviatorRoundView,
  cashOutCricketXBet,
  fetchCricketXConfig,
  fetchCricketXCurrentRound,
  fetchCricketXHistory,
  fetchCricketXMyBets,
  placeCricketXBet,
} from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const GOLD = '#FFD66B';
const DEFAULT_GROWTH = Math.log(2) / 5;
const STAKE_STEPS = [10, 20, 50, 100, 200, 500];
const QUICK = [10, 50, 100, 500];
const AUTO_STEPS = [1.2, 1.5, 2, 3, 5, 10, 20, 50];
/** The ball climbs along its arc for this long, then hovers near the top. */
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
  return '#FF4FA0';
}

// ---------- scene ----------
// A side-on broadcast shot: the batter plays the shot, then the camera
// follows the ball — the stands and outfield scroll past behind it while
// the multiplier climbs. When the round ends the ball drops to the turf.

function seeded(seed: number) {
  let x = seed;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}

/** Sky with the floodlit glow near the roof. Static. */
const Sky = memo(function Sky({ w, h }: { w: number; h: number }) {
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgLinearGradient id="cxSky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#0A1F5C" />
          <Stop offset="0.35" stopColor="#1A47A8" />
          <Stop offset="0.55" stopColor="#0B1F55" />
        </SvgLinearGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill="url(#cxSky)" />
    </Svg>
  );
});

/** One screen-wide tile of the stands: roof with floodlights, crowd tiers
 * and two rows of coloured advertising boards. Repeats as the camera pans. */
const StandsTile = memo(function StandsTile({ w, h }: { w: number; h: number }) {
  const crowd = useMemo(() => {
    const rnd = seeded(7);
    const colors = ['#E8EEF8', '#FF6B6B', '#FFD66B', '#4FC3FF', '#7EE2A3', '#C9A0FF', '#FFFFFF'];
    return Array.from({ length: 260 }, () => {
      const tier = rnd() < 0.55 ? 0 : 1;
      return { x: rnd() * w, y: h * (tier ? 0.44 + rnd() * 0.07 : 0.3 + rnd() * 0.08), c: colors[Math.floor(rnd() * colors.length)], o: 0.35 + rnd() * 0.5 };
    });
  }, [w, h]);
  const lights = 8;
  const boardColors = ['#E53935', '#FDD835', '#43A047', '#FDD835', '#E53935', '#26C6DA'];
  const board = (y: number, bh: number, shift: number) =>
    Array.from({ length: 24 }, (_, i) => (
      <Rect key={`${y}-${i}`} x={(w / 24) * i} y={y} width={w / 24 + 0.5} height={bh} fill={boardColors[(i + shift) % boardColors.length]} />
    ));
  return (
    <Svg width={w} height={h}>
      <Defs>
        <RadialGradient id="cxLamp" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={1} />
          <Stop offset="0.35" stopColor="#CFE8FF" stopOpacity={0.55} />
          <Stop offset="1" stopColor="#8FC8FF" stopOpacity={0} />
        </RadialGradient>
        <SvgLinearGradient id="cxStand" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#1B2A55" />
          <Stop offset="1" stopColor="#0C1433" />
        </SvgLinearGradient>
      </Defs>
      {/* Roof edge and floodlights */}
      <Rect x={0} y={h * 0.2} width={w} height={h * 0.07} fill="#16254F" />
      <Rect x={0} y={h * 0.2} width={w} height={2} fill="#6FA8FF" opacity={0.7} />
      {Array.from({ length: lights }, (_, i) => {
        const cx = (w / lights) * (i + 0.5);
        return (
          <G key={i}>
            <Circle cx={cx} cy={h * 0.235} r={h * 0.07} fill="url(#cxLamp)" />
            {[0, 1, 2, 3].map((k) => (
              <Rect key={k} x={cx - 9 + k * 5} y={h * 0.225} width={3.5} height={h * 0.02} fill="#FFFFFF" />
            ))}
          </G>
        );
      })}
      {/* Stands and crowd */}
      <Rect x={0} y={h * 0.27} width={w} height={h * 0.27} fill="url(#cxStand)" />
      {crowd.map((p, i) => (
        <Rect key={i} x={p.x} y={p.y} width={2.2} height={2.6} fill={p.c} opacity={p.o} />
      ))}
      {board(h * 0.395, h * 0.018, 0)}
      {board(h * 0.525, h * 0.022, 2)}
      <Rect x={0} y={h * 0.547} width={w} height={2} fill="#000000" opacity={0.35} />
    </Svg>
  );
});

/** One tile of outfield grass with mowing bands. Repeats as the camera pans. */
const GroundTile = memo(function GroundTile({ w, h }: { w: number; h: number }) {
  const top = h * 0.55;
  const bands = 6;
  return (
    <Svg width={w} height={h}>
      <Defs>
        <SvgLinearGradient id="cxGrass" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#2F9A3E" />
          <Stop offset="1" stopColor="#1C6E2A" />
        </SvgLinearGradient>
      </Defs>
      <Rect x={0} y={top} width={w} height={h - top} fill="url(#cxGrass)" />
      {Array.from({ length: bands }, (_, i) => {
        const y0 = top + ((h - top) / bands) * i;
        return i % 2 ? <Rect key={i} x={0} y={y0} width={w} height={(h - top) / bands} fill="#FFFFFF" opacity={0.05} /> : null;
      })}
    </Svg>
  );
});

/** The pitch strip under the batter, with the popping crease. */
const Pitch = memo(function Pitch({ w, h }: { w: number; h: number }) {
  return (
    <Svg width={w} height={h}>
      <Defs>
        <SvgLinearGradient id="cxPitch" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#D9C79A" />
          <Stop offset="0.8" stopColor="#CDB889" />
          <Stop offset="1" stopColor="#CDB889" stopOpacity={0} />
        </SvgLinearGradient>
      </Defs>
      <Polygon points={`0,${h * 0.6} ${w},${h * 0.6} ${w * 0.85},${h} 0,${h}`} fill="url(#cxPitch)" />
      <Line x1={w * 0.02} y1={h * 0.92} x2={w * 0.72} y2={h * 0.92} stroke="#FFFFFF" strokeWidth={2} opacity={0.85} />
      <Line x1={w * 0.2} y1={h * 0.62} x2={w * 0.06} y2={h * 0.98} stroke="#FFFFFF" strokeWidth={2} opacity={0.7} />
    </Svg>
  );
});

/** Stumps with bails. */
const Stumps = memo(function Stumps({ h }: { h: number }) {
  const w = h * 0.22;
  return (
    <Svg width={w} height={h}>
      {[0, 1, 2].map((i) => (
        <G key={i}>
          <Rect x={w * (0.1 + i * 0.3)} y={h * 0.06} width={w * 0.14} height={h * 0.94} rx={1.5} fill="#F4ECD8" />
          {[0.3, 0.55, 0.8].map((y) => (
            <Rect key={y} x={w * (0.1 + i * 0.3)} y={h * y} width={w * 0.14} height={h * 0.05} fill="#C62828" />
          ))}
        </G>
      ))}
      <Rect x={w * 0.06} y={h * 0.02} width={w * 0.88} height={h * 0.04} rx={1} fill="#F4ECD8" />
    </Svg>
  );
});

type BatterPose = 'stance' | 'hit';

/** Where the ball leaves the bat in the 'hit' pose, as fractions of the batter's height. */
const BAT_CONTACT = { x: 0.57, y: 0.66 };

type Pt = [number, number];
type PoseDef = {
  backLeg: [Pt, Pt, Pt];
  frontLeg: [Pt, Pt, Pt];
  backShoe: Pt;
  frontShoe: Pt;
  /** Back shoulder, chest curve control, front shoulder, front hip, back hip. */
  torso: [Pt, Pt, Pt, Pt, Pt];
  head: Pt;
  backArm: [Pt, Pt, Pt];
  frontArm: [Pt, Pt, Pt];
  /** Handle top, handle bottom (where the blade starts), blade toe. */
  bat: [Pt, Pt, Pt];
  gloves: [Pt, Pt];
};

// Right-hander, side-on, facing the bowler on the right (viewBox 105 x 150).
const POSES: Record<BatterPose, PoseDef> = {
  // Ready stance: knees soft, feet apart, head still, bat lifted back.
  stance: {
    backLeg: [[47, 84], [43, 111], [37, 137]],
    frontLeg: [[60, 84], [68, 110], [73, 137]],
    backShoe: [36, 142],
    frontShoe: [77, 142],
    torso: [[49, 47], [58, 40], [69, 47], [65, 86], [46, 86]],
    head: [63, 29],
    backArm: [[51, 49], [41, 61], [44, 74]],
    frontArm: [[66, 50], [61, 64], [49, 73]],
    bat: [[53, 73], [38, 75], [5, 70]],
    gloves: [[48, 73], [43, 75]],
  },
  // Front-foot drive at the moment of contact: stride in, head over the ball.
  hit: {
    backLeg: [[49, 86], [39, 112], [27, 137]],
    frontLeg: [[60, 86], [74, 108], [81, 137]],
    backShoe: [26, 142],
    frontShoe: [86, 142],
    torso: [[55, 49], [65, 42], [76, 53], [67, 89], [48, 88]],
    head: [72, 33],
    backArm: [[59, 53], [65, 65], [73, 71]],
    frontArm: [[72, 55], [78, 63], [75, 70]],
    bat: [[73, 64], [77, 77], [90, 113]],
    gloves: [[75, 69], [74, 73]],
  },
};

/** A side-on batter, holding the bat in both gloves. */
const Batter = memo(function Batter({ h, pose }: { h: number; pose: BatterPose }) {
  const w = h * 0.7;
  const s = h / 150;
  const p = POSES[pose];
  const P = ([x, y]: Pt) => `${(x * s).toFixed(1)},${(y * s).toFixed(1)}`;
  const limb = (pts: Pt[]) => `M ${P(pts[0])} Q ${P(pts[1])} ${P(pts[2])}`;
  // The blade as a quad around the handle-bottom -> toe line.
  const [, b0, b1] = p.bat;
  const dx = b1[0] - b0[0];
  const dy = b1[1] - b0[1];
  const len = Math.hypot(dx, dy);
  const nx = (-dy / len) * 3.6;
  const ny = (dx / len) * 3.6;
  const blade = [
    [b0[0] + nx * 0.8, b0[1] + ny * 0.8],
    [b1[0] + nx, b1[1] + ny],
    [b1[0] - nx, b1[1] - ny],
    [b0[0] - nx * 0.8, b0[1] - ny * 0.8],
  ] as Pt[];
  const skin = '#C98E62';
  return (
    <Svg width={w} height={h}>
      <Defs>
        <SvgLinearGradient id="cxKit" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#D3DAE6" />
        </SvgLinearGradient>
        <SvgLinearGradient id="cxBat" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#F6E2B0" />
          <Stop offset="1" stopColor="#C9A55E" />
        </SvgLinearGradient>
      </Defs>
      <Ellipse cx={56 * s} cy={146 * s} rx={40 * s} ry={4 * s} fill="#000000" opacity={0.28} />
      {/* Legs: trousers into pads, then shoes */}
      {[p.backLeg, p.frontLeg].map((leg, i) => (
        <G key={i}>
          <Path d={limb(leg)} stroke={i ? 'url(#cxKit)' : '#E4E8F0'} strokeWidth={13 * s} strokeLinecap="round" fill="none" />
          <Path d={`M ${P(leg[1])} L ${P(leg[2])}`} stroke="#F7F8FB" strokeWidth={14 * s} strokeLinecap="round" fill="none" />
          {[0.3, 0.55, 0.8].map((t) => {
            const x = leg[1][0] + (leg[2][0] - leg[1][0]) * t;
            const y = leg[1][1] + (leg[2][1] - leg[1][1]) * t;
            return <Line key={t} x1={(x - 6) * s} y1={y * s} x2={(x + 6) * s} y2={y * s} stroke="#B8C0CF" strokeWidth={0.9} />;
          })}
        </G>
      ))}
      {[p.backShoe, p.frontShoe].map(([x, y], i) => (
        <G key={i}>
          <Ellipse cx={x * s} cy={y * s} rx={9 * s} ry={4.2 * s} fill="#F2F4F8" />
          <Rect x={(x - 9) * s} y={(y + 2) * s} width={18 * s} height={2 * s} rx={1 * s} fill="#2A3346" />
        </G>
      ))}
      {/* Torso */}
      <Path d={`M ${P(p.torso[0])} Q ${P(p.torso[1])} ${P(p.torso[2])} L ${P(p.torso[3])} L ${P(p.torso[4])} Z`} fill="url(#cxKit)" />
      {/* Back arm (behind the handle) */}
      <Path d={limb(p.backArm)} stroke="#E4E8F0" strokeWidth={7.5 * s} strokeLinecap="round" fill="none" />
      <Path d={`M ${P(p.backArm[1])} L ${P(p.backArm[2])}`} stroke={skin} strokeWidth={5.5 * s} strokeLinecap="round" fill="none" />
      {/* Bat: blade, then the rubber grip through both gloves */}
      <Polygon points={blade.map(P).join(' ')} fill="url(#cxBat)" stroke="#9C7B3C" strokeWidth={0.8} strokeLinejoin="round" />
      <Line x1={p.bat[0][0] * s} y1={p.bat[0][1] * s} x2={b0[0] * s} y2={b0[1] * s} stroke="#1F2533" strokeWidth={3.2 * s} strokeLinecap="round" />
      {/* Front arm, then the gloves wrapped round the handle */}
      <Path d={limb(p.frontArm)} stroke="url(#cxKit)" strokeWidth={8 * s} strokeLinecap="round" fill="none" />
      <Path d={`M ${P(p.frontArm[1])} L ${P(p.frontArm[2])}`} stroke={skin} strokeWidth={6 * s} strokeLinecap="round" fill="none" />
      {p.gloves.map(([x, y], i) => (
        <G key={i}>
          <Circle cx={x * s} cy={y * s} r={4.6 * s} fill="#FFFFFF" stroke="#AEB7C8" strokeWidth={0.8} />
          <Rect x={(x - 3.5) * s} y={(y - 1) * s} width={7 * s} height={1.6 * s} fill="#1E4FA8" opacity={0.85} />
        </G>
      ))}
      {/* Helmet, face and grille, looking at the bowler */}
      <Circle cx={p.head[0] * s} cy={p.head[1] * s} r={11.5 * s} fill="#1B2E6B" />
      <Path d={`M ${P([p.head[0] - 11, p.head[1] + 2])} L ${P([p.head[0] + 14, p.head[1] + 1])}`} stroke="#14224F" strokeWidth={3 * s} strokeLinecap="round" />
      <Rect x={(p.head[0] + 3) * s} y={(p.head[1] + 2) * s} width={8 * s} height={9 * s} rx={2 * s} fill={skin} />
      {[3, 6, 9].map((dy) => (
        <Line key={dy} x1={(p.head[0] + 7) * s} y1={(p.head[1] + dy) * s} x2={(p.head[0] + 14) * s} y2={(p.head[1] + dy) * s} stroke="#9AA4B8" strokeWidth={1.2} />
      ))}
      <Line x1={(p.head[0] + 13) * s} y1={(p.head[1] + 2) * s} x2={(p.head[0] + 13) * s} y2={(p.head[1] + 11) * s} stroke="#9AA4B8" strokeWidth={1.2} />
    </Svg>
  );
});

/** Height above the turf of a dropped ball that bounces with restitution `e`. */
function dropHeight(t: number, H: number, g: number, e = 0.42): number {
  const tFall = Math.sqrt((2 * H) / g);
  if (t < tFall) return H - 0.5 * g * t * t;
  let v = e * Math.sqrt(2 * g * H);
  t -= tFall;
  while (v > 1) {
    const T = (2 * v) / g;
    if (t < T) return v * t - 0.5 * g * t * t;
    t -= T;
    v *= e;
  }
  return 0;
}

/** Log-scale distance ruler: 1, 2, 5 … 500, ∞, with a marker at `m`. */
const RULER_TICKS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
function rulerFraction(m: number): number {
  const n = RULER_TICKS.length; // the last segment runs 500 -> ∞
  for (let i = 0; i < n - 1; i++) {
    if (m < RULER_TICKS[i + 1]) return (i + Math.log(Math.max(m, 1) / RULER_TICKS[i]) / Math.log(RULER_TICKS[i + 1] / RULER_TICKS[i])) / n;
  }
  return (n - 1 + Math.min(1, Math.log(m / 500) / Math.log(10))) / n;
}

/** A red leather ball with a white seam, turned by `spin` degrees. */
function Ball({ size, spin }: { size: number; spin: number }) {
  const r = size / 2;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id="leather" cx="35%" cy="32%" r="72%">
          <Stop offset="0" stopColor="#FF8A80" />
          <Stop offset="0.45" stopColor="#E53935" />
          <Stop offset="1" stopColor="#8E0B16" />
        </RadialGradient>
      </Defs>
      <Circle cx={r} cy={r} r={r - 1} fill="url(#leather)" />
      <G rotation={spin} origin={`${r}, ${r}`}>
        <Path d={`M ${r * 0.62} ${r * 0.08} Q ${r * 1.18} ${r} ${r * 0.62} ${r * 1.92}`} stroke="#FFF4E0" strokeWidth={Math.max(1.2, r * 0.05)} fill="none" />
        <Path d={`M ${r * 0.78} ${r * 0.06} Q ${r * 1.34} ${r} ${r * 0.78} ${r * 1.94}`} stroke="#FFF4E0" strokeWidth={Math.max(0.8, r * 0.03)} strokeDasharray={`${r * 0.06},${r * 0.06}`} fill="none" />
      </G>
      <Circle cx={r * 0.7} cy={r * 0.62} r={r * 0.22} fill="#FFFFFF" opacity={0.25} />
    </Svg>
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

export default function CricketXScreen() {
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
  /** When this client saw the ball go down; drives the drop-and-roll. */
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
    fetchCricketXHistory(30)
      .then((h) => mountedRef.current && setHistory(h))
      .catch(() => {});
    fetchCricketXMyBets()
      .then((b) => mountedRef.current && setMyBets(b.slice(0, 15)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchCricketXConfig()
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
        const v = await fetchCricketXCurrentRound();
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

  // Caught: pop the banner, refresh wallet and lists.
  const crashedPeriod = view?.phase === 'CRASHED' ? view.periodNumber : null;
  useEffect(() => {
    if (!crashedPeriod) return;
    // The ball drops to the turf, bounces and rolls on (see the scene geometry).
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
        const bet = await placeCricketXBet(p.amount, p.autoOn ? p.autoAt : undefined);
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
        const res = await cashOutCricketXBet(p.bet.id);
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
  const SH = Math.min(SW * 0.72, 320);
  const crashed = localPhase === 'CRASHED';
  const flightS = localPhase === 'BETTING' ? 0 : crashed && view?.crashMultiplier ? Math.log(view.crashMultiplier) / growth : elapsed;
  // Once down, the ball keeps rolling and the camera eases to a stop with it.
  const downS = crashed && crashSeenRef.current ? (Date.now() - crashSeenRef.current) / 1000 : 0;
  const ROLL_K = 1.4;
  const rollOut = (1 - Math.exp(-ROLL_K * downS)) / ROLL_K;
  // Camera travel in px: pans away from the batter and speeds up in flight.
  const pan = SW * (0.55 * flightS + 0.05 * flightS * flightS + (0.55 + 0.1 * flightS) * 0.6 * rollOut);
  const standsOff = (pan * 0.35) % SW;
  const groundOff = pan % SW;
  const batterH = SH * 0.62;
  const batterX = SW * 0.2 - pan;
  const batterY = SH * 0.96 - batterH;
  const LAUNCH_S = 0.7;
  const launch = Math.min(1, flightS / LAUNCH_S);
  const ease = 1 - Math.pow(1 - launch, 3);
  const ballBig = SH * 0.3;
  const ballSize = SH * 0.06 + (ballBig - SH * 0.06) * ease;
  const contact = { x: batterX + batterH * BAT_CONTACT.x, y: batterY + batterH * BAT_CONTACT.y };
  const centre = { x: SW * 0.55, y: SH * 0.4 + (localPhase === 'FLYING' && launch >= 1 ? Math.sin(srvNow / 450) * SH * 0.015 : 0) };
  const flyX = contact.x + (centre.x - contact.x) * ease;
  const flyY = contact.y + (centre.y - contact.y) * ease;
  // Drop: falls from where it was, bounces lower each time, then rolls on.
  const turfY = SH * 0.87;
  const restSize = ballSize * 0.7;
  const restY = turfY - restSize / 2;
  const dropH = Math.max(0, restY - flyY);
  const GRAV = SH * 5;
  const tFall = Math.sqrt((2 * dropH) / GRAV) || 0.01;
  const lift = crashed ? dropHeight(downS, dropH, GRAV) : 0;
  const shownSize = crashed ? ballSize - (ballSize - restSize) * Math.min(1, downS / tFall) : ballSize;
  const ballX = crashed ? flyX + SW * 0.4 * rollOut : flyX;
  const ballY = crashed ? restY - lift : flyY;
  const rollDeg = crashed ? (((ballX - flyX) + (pan - SW * (0.55 * flightS + 0.05 * flightS * flightS))) / (restSize / 2)) * (180 / Math.PI) : 0;
  const betLeft = localPhase === 'BETTING' ? Math.max(0, (flyStart - srvNow) / 1000) : 0;
  const betTotal = config?.bettingDurationSeconds ?? 6;
  const rulerY = SH * 0.9;
  const rulerX0 = SW * 0.07;
  const rulerX1 = SW * 0.93;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#0A1030', '#050818']} style={StyleSheet.absoluteFill} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color="#FFFFFF" />
          <MaterialCommunityIcons name="cricket" size={22} color={GOLD} />
          <Text style={styles.title}>
            CRICKET <Text style={{ color: '#FF4F6D' }}>X</Text>
          </Text>
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

        {/* Broadcast-style scene */}
        <View style={[styles.scene, { width: SW, height: SH }]}>
          <Sky w={SW} h={SH} />
          <View style={[styles.tileRow, { width: SW * 2 + 1, height: SH, transform: [{ translateX: -standsOff }] }]}>
            <StandsTile w={SW + 1} h={SH} />
            <View style={[styles.tileNext, { left: SW }]}>
              <StandsTile w={SW + 1} h={SH} />
            </View>
          </View>
          <View style={[styles.tileRow, { width: SW * 2 + 1, height: SH, transform: [{ translateX: -groundOff }] }]}>
            <GroundTile w={SW + 1} h={SH} />
            <View style={[styles.tileNext, { left: SW }]}>
              <GroundTile w={SW + 1} h={SH} />
            </View>
          </View>
          {batterX > -SW && (
            <>
              <View pointerEvents="none" style={{ position: 'absolute', left: batterX - SW * 0.35, top: 0 }}>
                <Pitch w={SW * 1.2} h={SH} />
              </View>
              <View pointerEvents="none" style={{ position: 'absolute', left: batterX - batterH * 0.28, top: batterY + batterH * 0.52 }}>
                <Stumps h={batterH * 0.42} />
              </View>
              <View pointerEvents="none" style={{ position: 'absolute', left: batterX, top: batterY }}>
                <Batter h={batterH} pose={localPhase === 'BETTING' ? 'stance' : 'hit'} />
              </View>
            </>
          )}

          {/* Bat-on-ball flash */}
          {localPhase === 'FLYING' && flightS < 0.3 && (
            <View pointerEvents="none" style={{ position: 'absolute', left: contact.x - SH * 0.1, top: contact.y - SH * 0.1, opacity: 1 - flightS / 0.3 }}>
              <Svg width={SH * 0.2} height={SH * 0.2}>
                {Array.from({ length: 8 }, (_, i) => {
                  const a = (i / 8) * Math.PI * 2;
                  const r0 = SH * 0.025;
                  const r1 = SH * (i % 2 ? 0.06 : 0.09);
                  return (
                    <Line key={i} x1={SH * 0.1 + Math.cos(a) * r0} y1={SH * 0.1 + Math.sin(a) * r0} x2={SH * 0.1 + Math.cos(a) * r1} y2={SH * 0.1 + Math.sin(a) * r1} stroke="#D8F1FF" strokeWidth={2} strokeLinecap="round" />
                  );
                })}
                <Circle cx={SH * 0.1} cy={SH * 0.1} r={SH * 0.025} fill="#FFFFFF" opacity={0.9} />
              </Svg>
            </View>
          )}

          {/* Soft shadow on the turf, tighter and darker as the ball comes down */}
          {crashed && (
            <View pointerEvents="none" style={{ position: 'absolute', left: ballX - restSize * 0.55, top: turfY - restSize * 0.1 }}>
              <Svg width={restSize * 1.1} height={restSize * 0.2}>
                <Defs>
                  <RadialGradient id="cxBallShadow" cx="50%" cy="50%" r="50%">
                    <Stop offset="0" stopColor="#000000" stopOpacity={0.45} />
                    <Stop offset="1" stopColor="#000000" stopOpacity={0} />
                  </RadialGradient>
                </Defs>
                <Ellipse
                  cx={restSize * 0.55}
                  cy={restSize * 0.1}
                  rx={restSize * 0.55 * (1 - 0.4 * Math.min(1, lift / Math.max(1, dropH)))}
                  ry={restSize * 0.1}
                  fill="url(#cxBallShadow)"
                  opacity={1 - 0.6 * Math.min(1, lift / Math.max(1, dropH))}
                />
              </Svg>
            </View>
          )}

          {/* Ball with a motion streak; drops, bounces and rolls when the round ends */}
          {localPhase !== 'BETTING' && (
            <View pointerEvents="none" style={{ position: 'absolute', left: ballX - shownSize / 2, top: ballY - shownSize / 2 }}>
              {!crashed && launch > 0.2 && (
                <LinearGradient
                  colors={['rgba(255,255,255,0)', 'rgba(255,230,230,0.45)']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={{ position: 'absolute', left: -shownSize * 1.1, top: shownSize * 0.22, width: shownSize * 1.4, height: shownSize * 0.56, borderRadius: shownSize * 0.3 }}
                />
              )}
              <Ball size={shownSize} spin={flightS * 720 + rollDeg} />
            </View>
          )}

          {/* Multiplier and the distance ruler */}
          {localPhase !== 'BETTING' && (
            <View pointerEvents="none" style={[styles.bigMultWrap, { left: SW * 0.08, top: SH * 0.62 }]}>
              {crashed && <Text style={styles.landed}>BALL DOWN!</Text>}
              <Text style={[styles.bigMult, { fontSize: SH * 0.2, color: crashed ? '#FF4F4F' : '#FFFFFF' }]}>{liveMult.toFixed(2)}x</Text>
            </View>
          )}
          <Svg width={SW} height={SH} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Line x1={rulerX0} y1={rulerY} x2={rulerX1} y2={rulerY} stroke="#FFFFFF" strokeOpacity={0.85} strokeWidth={1.5} />
            {[...RULER_TICKS, Infinity].map((tk, i) => {
              const x = rulerX0 + ((rulerX1 - rulerX0) * i) / RULER_TICKS.length;
              return (
                <G key={i}>
                  <Line x1={x} y1={rulerY - 4} x2={x} y2={rulerY + 4} stroke="#FFFFFF" strokeOpacity={0.85} strokeWidth={1.5} />
                  <SvgText x={x} y={rulerY + 16} fontSize={10} fontWeight="700" fill="#FFFFFF" fillOpacity={0.9} textAnchor="middle">
                    {tk === Infinity ? '∞' : String(tk)}
                  </SvgText>
                </G>
              );
            })}
            <Circle cx={rulerX0 + (rulerX1 - rulerX0) * rulerFraction(liveMult)} cy={rulerY - 9} r={4.5} fill="#E53935" stroke="#FFFFFF" strokeWidth={1} />
          </Svg>

          {localPhase === 'BETTING' && (
            <View pointerEvents="none" style={styles.nextWrap}>
              <Text style={styles.nextText}>NEXT BALL IN</Text>
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
            sub = 'bet next ball';
            colors = ['#FF5A6A', '#C21F31'];
          } else if (p.cashedAt) {
            label = 'CASHED OUT';
            sub = `@ ${p.cashedAt.toFixed(2)}x`;
            colors = ['#3A4A7A', '#26335C'];
          } else if (lostBet) {
            label = 'BALL DOWN';
            sub = `-₹${Number(p.bet!.amount).toFixed(2)}`;
            colors = ['#5A2A3A', '#3A1422'];
          } else if (p.bet) {
            label = 'WAITING';
            sub = 'for the shot';
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
  root: { flex: 1, backgroundColor: '#050818' },
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

  scene: { alignSelf: 'center', borderRadius: 18, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(79,195,255,0.35)' },
  tileRow: { position: 'absolute', left: 0, top: 0 },
  // Overlaps the first tile by 1px so no anti-aliased seam shows.
  tileNext: { position: 'absolute', top: 0 },
  bigMultWrap: { position: 'absolute' },
  bigMult: { fontWeight: '900', fontStyle: 'italic', letterSpacing: -1, textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 8, textShadowOffset: { width: 2, height: 3 } },
  landed: { color: '#FFD6D6', fontSize: 15, fontWeight: '900', letterSpacing: 2, textShadowColor: '#000', textShadowRadius: 5, marginBottom: -4 },
  nextWrap: { position: 'absolute', top: '8%', alignSelf: 'center', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 16, backgroundColor: 'rgba(5,10,30,0.6)' },
  centre: { position: 'absolute', top: '18%', left: 0, right: 0, alignItems: 'center' },
  nextText: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '900', letterSpacing: 2 },
  countText: { color: GOLD, fontSize: 34, fontWeight: '900', marginTop: 2 },
  countTrack: { width: 160, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden', marginTop: 6 },
  countFill: { height: '100%', backgroundColor: '#FF4F6D', borderRadius: 4 },
  caught: { color: '#FF4F4F', fontSize: 26, fontWeight: '900', fontStyle: 'italic', letterSpacing: 2, textShadowColor: '#000', textShadowRadius: 6 },
  multText: { fontSize: 52, fontWeight: '900', textShadowRadius: 18, textShadowOffset: { width: 0, height: 0 } },

  panel: { flexDirection: 'row', gap: 10, marginHorizontal: 10, marginTop: 10, padding: 10, borderRadius: 16, backgroundColor: '#121A3A', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
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
