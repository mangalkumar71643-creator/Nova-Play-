import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, G, Line, Path, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { ApiClientError } from '../api/client';
import {
  VortexConfig,
  VortexElement,
  VortexOutcome,
  VortexRound,
  VortexSpinResult,
  cashOutVortexRound,
  fetchVortexConfig,
  fetchVortexCurrent,
  fetchVortexHistory,
  spinVortexRound,
  startVortexRound,
} from '../api/backend';
import { useGameState } from '../state/GameStateContext';

// Same wheel and rings as the server (vortexService.ts); the server's own
// config replaces this as soon as it loads.
const FALLBACK_CONFIG: VortexConfig = {
  minStake: 1,
  maxStake: 500,
  maxPayout: 10000,
  rtpPercent: 90,
  wheel: ['WATER', 'EARTH', 'WATER', 'CRASH', 'WATER', 'FIRE', 'WATER', 'EARTH', 'CRASH', 'WATER', 'EARTH', 'WATER', 'CRASH', 'WATER', 'EARTH', 'CRASH', 'FIRE', 'WATER', 'EARTH', 'CRASH'],
  elements: [
    { element: 'WATER', factor: 1.2, sections: 10, chancePercent: 40, ladder: [1, 1.2, 1.44, 1.72, 2.07, 2.48, 2.98, 3.58, 4.29, 5.15, 6.19] },
    { element: 'EARTH', factor: 1.4, sections: 8, chancePercent: 25, ladder: [1, 1.4, 1.96, 2.74, 3.84, 5.37, 7.52, 10.54, 14.75] },
    { element: 'FIRE', factor: 1.7, sections: 5, chancePercent: 10, ladder: [1, 1.7, 2.89, 4.91, 8.35, 14.19] },
  ],
  crashChancePercent: 25,
};

type Look = { name: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; colors: [string, string]; glow: string };
const LOOK: Record<VortexOutcome, Look> = {
  WATER: { name: 'Water', icon: 'water', colors: ['#3FA2FF', '#0B3FA8'], glow: '#4DB2FF' },
  EARTH: { name: 'Earth', icon: 'leaf', colors: ['#39D67A', '#0B6B33'], glow: '#4BEA8C' },
  FIRE: { name: 'Fire', icon: 'fire', colors: ['#FF8A2A', '#B51E08'], glow: '#FF7A2A' },
  CRASH: { name: 'Vortex', icon: 'weather-hurricane', colors: ['#3A1260', '#0C0218'], glow: '#B45CFF' },
};
const ELEMENT_ART: Record<VortexElement, number> = {
  WATER: require('../../assets/vortex/water.webp'),
  EARTH: require('../../assets/vortex/earth.webp'),
  FIRE: require('../../assets/vortex/fire.webp'),
};

/** Element badge art, or the vortex glyph for the losing segment. */
function ElementIcon({ kind, size }: { kind: VortexOutcome; size: number }) {
  if (kind === 'CRASH') return <MaterialCommunityIcons name={LOOK.CRASH.icon} size={size * 0.9} color="#D9A6FF" />;
  return <Image source={ELEMENT_ART[kind]} style={{ width: size, height: size }} />;
}

// Rings from the outside in.
const RING_ORDER: VortexElement[] = ['FIRE', 'EARTH', 'WATER'];
const FILL_KEY: Record<VortexElement, 'water' | 'earth' | 'fire'> = { WATER: 'water', EARTH: 'earth', FIRE: 'fire' };

const STAKE_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const QUICK_STAKES = [10, 50, 100, 500];
const DEFAULT_STAKE = 10;
const WIN_CARD_MS = 3000;
const TOAST_MS = 1800;
const GOLD = '#FFD66B';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

/** Annulus wedge between radii r0 < r1, from angle a0 to a1 (degrees,
 * clockwise from 12 o'clock). */
function wedge(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r1, a0);
  const [x1, y1] = polar(cx, cy, r1, a1);
  const [x2, y2] = polar(cx, cy, r0, a1);
  const [x3, y3] = polar(cx, cy, r0, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r1} ${r1} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${r0} ${r0} 0 ${large} 0 ${x3} ${y3} Z`;
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

// ---------- art ----------

/** The spinning outer wheel: one coloured wedge per segment with its icon. */
const Wheel = memo(function Wheel({ size, wheel }: { size: number; wheel: VortexOutcome[] }) {
  const c = size / 2;
  const seg = 360 / wheel.length;
  const r1 = size * 0.485;
  const r0 = size * 0.4;
  const iconR = (r0 + r1) / 2;
  const iconSize = size * 0.068;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          {(Object.keys(LOOK) as VortexOutcome[]).map((k) => (
            <RadialGradient key={k} id={`w${k}`} cx="50%" cy="50%" r="50%">
              <Stop offset={String(r0 / r1 - 0.05)} stopColor={LOOK[k].colors[1]} />
              <Stop offset="1" stopColor={LOOK[k].colors[0]} />
            </RadialGradient>
          ))}
        </Defs>
        <Circle cx={c} cy={c} r={r1 + size * 0.012} fill="#1A0630" stroke="#E6B450" strokeWidth={size * 0.012} />
        {wheel.map((k, i) => (
          <Path key={i} d={wedge(c, c, r0, r1, i * seg, (i + 1) * seg)} fill={`url(#w${k})`} stroke="#E6B450" strokeOpacity={0.75} strokeWidth={1.2} />
        ))}
        <Circle cx={c} cy={c} r={r0} fill="none" stroke="#E6B450" strokeWidth={size * 0.008} />
      </Svg>
      {wheel.map((k, i) => {
        const deg = i * seg + seg / 2;
        const [x, y] = polar(c, c, iconR, deg);
        return (
          <View key={i} style={{ position: 'absolute', left: x - iconSize / 2, top: y - iconSize / 2, transform: [{ rotate: `${deg}deg` }] }}>
            <ElementIcon kind={k} size={iconSize} />
          </View>
        );
      })}
    </View>
  );
});

/** Rim bulbs that twinkle in two alternating sets. */
function RimLights({ size, count }: { size: number; count: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 450, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [t]);
  const c = size / 2;
  const r = size * 0.497;
  const dots = (odd: boolean) => (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      {Array.from({ length: count }, (_, i) => i)
        .filter((i) => i % 2 === (odd ? 1 : 0))
        .map((i) => {
          const [x, y] = polar(c, c, r, (i * 360) / count);
          return <Circle key={i} cx={x} cy={y} r={size * 0.011} fill="#FFF3C4" />;
        })}
    </Svg>
  );
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { width: size, height: size }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: t }]}>{dots(false)}</Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: t.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>{dots(true)}</Animated.View>
    </View>
  );
}

/** One element's ring: its badge at 12 o'clock, then one slot per section
 * labelled with what the ring is worth once that section is filled. Lit
 * slots take the element's colour; `pulse` flashes them when one is added. */
function ElementRing({ size, rIn, rOut, element, ladder, filled, pulse }: { size: number; rIn: number; rOut: number; element: VortexElement; ladder: number[]; filled: number; pulse: Animated.Value }) {
  const c = size / 2;
  const sections = ladder.length - 1;
  const slots = sections + 1;
  const step = 360 / slots;
  const band = rOut - rIn;
  const rMid = (rIn + rOut) / 2;
  const fs = Math.min(band * 0.42, (2 * Math.PI * rMid) / slots / 3.2);
  const look = LOOK[element];
  const lit = (j: number) => j >= 1 && j <= filled;
  const slotPath = (j: number) => wedge(c, c, rIn + 2, rOut - 2, (j - 0.5) * step + 1, (j + 0.5) * step - 1);
  const badge = band * 0.95;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={c} cy={c} r={rMid} stroke="#1C1E24" strokeWidth={band} fill="none" />
        <Circle cx={c} cy={c} r={rOut} stroke="#3A3D47" strokeWidth={1.5} fill="none" />
        <Circle cx={c} cy={c} r={rIn} stroke="#0C0D10" strokeWidth={2} fill="none" />
        {Array.from({ length: sections }, (_, i) => i + 1)
          .filter(lit)
          .map((j) => (
            <Path key={`f${j}`} d={slotPath(j)} fill={look.colors[0]} fillOpacity={0.78} />
          ))}
        {Array.from({ length: slots }, (_, j) => {
          const a = (j + 0.5) * step;
          const [x0, y0] = polar(c, c, rMid - band * 0.18, a);
          const [x1, y1] = polar(c, c, rMid + band * 0.18, a);
          return <Line key={`t${j}`} x1={x0} y1={y0} x2={x1} y2={y1} stroke="#5A5E69" strokeWidth={1.5} strokeLinecap="round" />;
        })}
        {Array.from({ length: sections }, (_, i) => i + 1).map((j) => {
          const a = j * step;
          const [x, y] = polar(c, c, rMid, a);
          const rot = a > 90 && a < 270 ? a - 180 : a;
          return (
            <SvgText
              key={`l${j}`}
              x={x}
              y={y + fs * 0.36}
              fontSize={fs}
              fontWeight="900"
              fontFamily="sans-serif"
              textAnchor="middle"
              fill={lit(j) ? '#FFFFFF' : '#7C808C'}
              rotation={rot}
              origin={`${x}, ${y}`}
            >
              {`${ladder[j]}X`}
            </SvgText>
          );
        })}
        <Circle cx={c} cy={c - rMid} r={badge / 2 + 2} fill="#15171B" stroke="#3A3D47" strokeWidth={1.5} />
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: pulse }]}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          {Array.from({ length: sections }, (_, i) => i + 1)
            .filter(lit)
            .map((j) => (
              <Path key={j} d={slotPath(j)} fill={look.glow} fillOpacity={0.6} />
            ))}
        </Svg>
      </Animated.View>
      <View style={{ position: 'absolute', left: c - badge / 2, top: c - rMid - badge / 2 }}>
        <ElementIcon kind={element} size={badge} />
      </View>
    </View>
  );
}

/** The swirling vortex in the middle: spiral arms, always turning. */
const Swirl = memo(function Swirl({ size }: { size: number }) {
  const c = size / 2;
  const arms = useMemo(
    () =>
      Array.from({ length: 4 }, (_, a) => {
        const pts: string[] = [];
        for (let i = 0; i <= 40; i++) {
          const t = i / 40;
          const ang = a * 90 + t * 300;
          const [x, y] = polar(c, c, size * 0.48 * t, ang);
          pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
        }
        return pts.join(' ');
      }),
    [c, size]
  );
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id="swirlCore" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#F4D8FF" stopOpacity={0.95} />
          <Stop offset="0.35" stopColor="#9B3DFF" stopOpacity={0.75} />
          <Stop offset="1" stopColor="#1A0033" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={c} cy={c} r={c} fill="url(#swirlCore)" />
      <G>
        {arms.map((d, i) => (
          <Path key={i} d={d} stroke={i % 2 ? '#62E0FF' : '#D08CFF'} strokeOpacity={0.8} strokeWidth={size * 0.035} strokeLinecap="round" fill="none" />
        ))}
      </G>
    </Svg>
  );
});

function WinCard({ amount, multiplier, title, onClose }: { amount: number; multiplier: number; title: string; onClose: () => void }) {
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }).start();
  }, [pop]);
  return (
    <Animated.View style={[styles.winWrap, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]}>
      <LinearGradient colors={['#3B0F63', '#16042A']} style={styles.winCard}>
        <Text style={styles.winTitle}>{title}</Text>
        <Text style={styles.winAmount}>₹{amount.toFixed(2)}</Text>
        <Text style={styles.winMult}>x{multiplier.toFixed(2)}</Text>
      </LinearGradient>
      <Pressable onPress={onClose} style={styles.winClose} hitSlop={10}>
        <MaterialCommunityIcons name="close" size={20} color={GOLD} />
      </Pressable>
    </Animated.View>
  );
}

// ---------- screen ----------

type WinInfo = { amount: number; multiplier: number; title: string };

export default function VortexScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<VortexConfig>(FALLBACK_CONFIG);
  const [round, setRound] = useState<VortexRound | null>(null);
  const [stake, setStake] = useState(DEFAULT_STAKE);
  const [busy, setBusy] = useState(false);
  const [crashed, setCrashed] = useState(false);
  const [win, setWin] = useState<WinInfo | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'rules' | 'history'>(null);
  const [history, setHistory] = useState<VortexRound[]>([]);

  const rot = useRef(new Animated.Value(0)).current;
  const rotValue = useRef(0);
  const swirlSpin = useRef(new Animated.Value(0)).current;
  const crashAnim = useRef(new Animated.Value(0)).current;
  const multPop = useRef(new Animated.Value(1)).current;
  const pulses = useRef<Record<VortexElement, Animated.Value>>({
    WATER: new Animated.Value(0),
    EARTH: new Animated.Value(0),
    FIRE: new Animated.Value(0),
  }).current;
  const mountedRef = useRef(true);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const crashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swirlLoop = useRef<Animated.CompositeAnimation | null>(null);

  const wheel = config.wheel;
  const segDeg = 360 / wheel.length;
  const elements = useMemo(() => Object.fromEntries(config.elements.map((e) => [e.element, e])) as Record<VortexElement, VortexConfig['elements'][number]>, [config]);
  const playing = round?.status === 'PENDING';

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  // Wheel angle so segment i sits under the pointer at 12 o'clock.
  const restAngleFor = useCallback((segment: number) => -(segment * segDeg + segDeg / 2), [segDeg]);

  /** Ends the vortex scene at once (new spin / leaving the screen). */
  const stopCrashScene = useCallback(() => {
    if (crashTimer.current) clearTimeout(crashTimer.current);
    crashTimer.current = null;
    swirlLoop.current?.stop();
    swirlLoop.current = null;
    crashAnim.stopAnimation();
  }, [crashAnim]);

  /** The vortex swallows the rings, spins for 3 s, then fades away and the
   * board resets for the next round. */
  const playCrashScene = useCallback(() => {
    stopCrashScene();
    setCrashed(true);
    crashAnim.setValue(0);
    swirlSpin.setValue(0);
    swirlLoop.current = Animated.loop(Animated.timing(swirlSpin, { toValue: 1, duration: 1600, easing: Easing.linear, useNativeDriver: true }));
    swirlLoop.current.start();
    Animated.timing(crashAnim, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    crashTimer.current = setTimeout(() => {
      crashTimer.current = null;
      Animated.timing(crashAnim, { toValue: 0, duration: 600, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(({ finished }) => {
        if (!finished) return;
        swirlLoop.current?.stop();
        swirlLoop.current = null;
        if (mountedRef.current) setCrashed(false);
      });
    }, 3000);
  }, [crashAnim, swirlSpin, stopCrashScene]);

  useEffect(() => {
    mountedRef.current = true;
    const id = rot.addListener(({ value }) => {
      rotValue.current = value;
    });
    fetchVortexConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => {});
    fetchVortexCurrent()
      .then((r) => {
        if (!mountedRef.current || !r) return;
        setRound(r);
        const last = r.segments[r.segments.length - 1];
        if (last !== undefined) rot.setValue(restAngleFor(last));
      })
      .catch(() => {});
    return () => {
      mountedRef.current = false;
      rot.removeListener(id);
      stopCrashScene();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
    // Mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!win) return;
    const id = setTimeout(() => setWin(null), WIN_CARD_MS);
    return () => clearTimeout(id);
  }, [win]);

  const loadHistory = useCallback(() => {
    fetchVortexHistory(30)
      .then((h) => mountedRef.current && setHistory(h))
      .catch(() => {});
  }, []);

  // Free spin while the server answers; `landOn` then eases it onto the
  // segment the server landed.
  const freeSpin = useCallback(() => {
    Animated.timing(rot, { toValue: rotValue.current + 3600, duration: 3600, easing: Easing.linear, useNativeDriver: true }).start();
  }, [rot]);

  const landOn = useCallback(
    (segment: number) =>
      new Promise<void>((resolve) => {
        rot.stopAnimation((v) => {
          const rest = restAngleFor(segment) + (Math.random() - 0.5) * segDeg * 0.6;
          // Next angle ≥ v + 2 turns that has the wheel at rest on `segment`.
          const base = v + 720;
          const k = Math.ceil((base - rest) / 360);
          const target = rest + k * 360;
          Animated.timing(rot, { toValue: target, duration: 1900, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => resolve());
        });
      }),
    [rot, restAngleFor, segDeg]
  );

  const stopSpinSoftly = useCallback(() => {
    rot.stopAnimation((v) => {
      Animated.timing(rot, { toValue: v + 120, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    });
  }, [rot]);

  const popMultiplier = useCallback(() => {
    multPop.setValue(1.35);
    Animated.spring(multPop, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }).start();
  }, [multPop]);

  const applyResult = useCallback(
    (res: VortexSpinResult) => {
      setRound(res.round);
      if (res.outcome === 'CRASH') {
        playCrashScene();
        loadHistory();
        return;
      }
      const el = res.outcome as VortexElement;
      pulses[el].setValue(1);
      Animated.timing(pulses[el], { toValue: 0, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      popMultiplier();
      if (res.round.status === 'WON') {
        const reason = res.round.endReason ?? '';
        const title = reason.startsWith('FULL_') ? `${LOOK[reason.slice(5) as VortexElement]?.name.toUpperCase() ?? ''} RING FULL!` : 'MAX WIN!';
        setWin({ amount: Number(res.round.payout), multiplier: Number(res.round.multiplier), title });
        refreshWallet();
        loadHistory();
      }
    },
    [playCrashScene, pulses, popMultiplier, refreshWallet, loadHistory]
  );

  const spin = async () => {
    if (busy) return;
    const current = round;
    const continuing = current?.status === 'PENDING';
    if (!continuing) {
      if (stake < config.minStake || stake > config.maxStake) return showToast(`Bet must be ₹${config.minStake}–₹${config.maxStake}`);
      if (stake > coins) return showToast('Insufficient balance');
    }
    setBusy(true);
    setWin(null);
    if (!continuing) {
      stopCrashScene();
      setCrashed(false);
      crashAnim.setValue(0);
    }
    freeSpin();
    try {
      const res = continuing ? await spinVortexRound(current!.id) : await startVortexRound(stake);
      if (!continuing) refreshWallet();
      if (!mountedRef.current) return;
      await landOn(res.segment);
      if (mountedRef.current) applyResult(res);
    } catch (err) {
      stopSpinSoftly();
      if (mountedRef.current) {
        showToast(errorMessage(err));
        fetchVortexCurrent()
          .then((r) => mountedRef.current && r && setRound(r))
          .catch(() => {});
      }
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const cashOut = async () => {
    if (busy || !round || round.status !== 'PENDING') return;
    setBusy(true);
    try {
      const r = await cashOutVortexRound(round.id);
      if (!mountedRef.current) return;
      setRound(r);
      setWin({ amount: Number(r.payout), multiplier: Number(r.multiplier), title: 'YOU WIN' });
      refreshWallet();
      loadHistory();
    } catch (err) {
      if (mountedRef.current) showToast(errorMessage(err));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const stepStake = (dir: 1 | -1) => {
    const idx = STAKE_STEPS.findIndex((s) => s >= stake);
    const i = idx === -1 ? STAKE_STEPS.length - 1 : idx;
    const next = STAKE_STEPS[Math.max(0, Math.min(STAKE_STEPS.length - 1, dir === 1 && STAKE_STEPS[i] === stake ? i + 1 : dir === 1 ? i : i - 1))];
    setStake(Math.max(config.minStake, Math.min(config.maxStake, next)));
  };

  // ---- sizes ----
  const topH = 50;
  const bottomH = 176 + insets.bottom;
  const avail = H - insets.top - topH - 64 - 34 - bottomH;
  const S = Math.max(220, Math.min(W - 28, avail));
  const c = S / 2;
  const ringBand: Record<VortexElement, [number, number]> = { FIRE: [S * 0.322, S * 0.392], EARTH: [S * 0.252, S * 0.322], WATER: [S * 0.182, S * 0.252] };
  const swirlSize = S * 0.36;

  const multiplier = round ? Number(round.multiplier) : 0;
  const roundStake = round ? Number(round.stake) : stake;
  const potential = round2(roundStake * multiplier);
  const landed = round?.segments ?? [];
  const showFills = !!round && (playing || crashed || round.status === 'WON');

  const centreLabel = crashed ? 'VORTEX!' : playing || round?.status === 'WON' ? `x${multiplier.toFixed(2)}` : 'SPIN';

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#1B0038', '#0A0016', '#05000C']} style={StyleSheet.absoluteFill} />
      <Stars w={W} h={H} />

      {/* Top bar */}
      <View style={[styles.topBar, { marginTop: insets.top, height: topH }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color="#E9D8FF" />
          <Text style={styles.title}>VORTEX</Text>
        </Pressable>
        <View style={styles.topRight}>
          <View style={styles.balancePill}>
            <MaterialCommunityIcons name="wallet" size={15} color={GOLD} />
            <Text style={styles.balanceText}>₹{coins.toFixed(2)}</Text>
          </View>
          <Pressable onPress={() => setSheet('rules')} style={styles.iconBtn} hitSlop={6}>
            <Text style={styles.iconBtnText}>?</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              loadHistory();
              setSheet('history');
            }}
            style={styles.iconBtn}
            hitSlop={6}
          >
            <MaterialCommunityIcons name="history" size={18} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      {/* Element meters */}
      <View style={styles.meters}>
        {(['WATER', 'EARTH', 'FIRE'] as VortexElement[]).map((el) => {
          const e = elements[el];
          const filled = showFills && round ? round[FILL_KEY[el]] : 0;
          return (
            <LinearGradient key={el} colors={[LOOK[el].colors[1], '#12002A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.meter}>
              <ElementIcon kind={el} size={30} />
              <View style={{ marginLeft: 6 }}>
                <Text style={styles.meterMult}>x{(e?.ladder[filled] ?? 1).toFixed(2)}</Text>
                <Text style={styles.meterSub}>
                  {filled}/{e?.sections ?? 0} · x{e?.factor}
                </Text>
              </View>
            </LinearGradient>
          );
        })}
      </View>

      {/* Wheel */}
      <View style={styles.wheelArea}>
        <View style={{ width: S, height: S }}>
          <View pointerEvents="none" style={[styles.wheelGlow, { width: S * 1.08, height: S * 1.08, borderRadius: S * 0.54, left: -S * 0.04, top: -S * 0.04 }]} />
          <Animated.View style={{ width: S, height: S, transform: [{ rotate: rot.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] }) }] }}>
            <Wheel size={S} wheel={wheel} />
          </Animated.View>
          <RimLights size={S} count={wheel.length} />

          {/* Inner disc: rings + vortex */}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
            <Svg width={S} height={S} style={StyleSheet.absoluteFill}>
              <Defs>
                <RadialGradient id="disc" cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor="#1A1C22" />
                  <Stop offset="1" stopColor="#2A2D35" />
                </RadialGradient>
              </Defs>
              <Circle cx={c} cy={c} r={S * 0.398} fill="url(#disc)" />
              <Circle cx={c} cy={c} r={S * 0.176} fill="#17181D" stroke="#34373F" strokeWidth={2} />
            </Svg>
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: crashAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.25] }) }]}>
              {RING_ORDER.map((el) => (
                <ElementRing
                  key={el}
                  size={S}
                  rIn={ringBand[el][0]}
                  rOut={ringBand[el][1]}
                  element={el}
                  ladder={elements[el]?.ladder ?? [1]}
                  filled={showFills && round ? round[FILL_KEY[el]] : 0}
                  pulse={pulses[el]}
                />
              ))}
            </Animated.View>
            <Animated.View
              style={{
                position: 'absolute',
                // Hidden until the vortex hits, then it swallows the rings.
                opacity: crashAnim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.95, 0.9] }),
                transform: [
                  { rotate: swirlSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] }) },
                  { scale: crashAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 2.1] }) },
                ],
              }}
            >
              <Swirl size={swirlSize} />
            </Animated.View>
            <Animated.View style={{ alignItems: 'center', transform: [{ scale: multPop }] }}>
              <Text style={[styles.centreText, { fontSize: S * (centreLabel.length > 6 ? 0.075 : 0.09) }, crashed && styles.centreCrash]}>{centreLabel}</Text>
              {(playing || round?.status === 'WON') && !crashed && <Text style={[styles.centreSub, { fontSize: S * 0.045 }]}>₹{potential.toFixed(2)}</Text>}
            </Animated.View>
          </View>

          {/* Pointer */}
          <View pointerEvents="none" style={[styles.pointer, { left: c - S * 0.045, top: -S * 0.02 }]}>
            <Svg width={S * 0.09} height={S * 0.1}>
              <Path d={`M 0 0 L ${S * 0.09} 0 L ${S * 0.045} ${S * 0.1} Z`} fill={GOLD} stroke="#7A4A00" strokeWidth={2} />
            </Svg>
          </View>

          {/* Crash flash */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.crashFlash,
              { width: S, height: S, borderRadius: S / 2, opacity: crashAnim.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.55, 0.18] }) },
            ]}
          />
        </View>
      </View>

      {/* This round's spins */}
      <View style={styles.trail}>
        {landed.length === 0 ? (
          <Text style={styles.trailHint}>
            Water x{elements.WATER?.factor} · Earth x{elements.EARTH?.factor} · Fire x{elements.FIRE?.factor} · Vortex loses
          </Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trailRow}>
            {landed.map((seg, i) => {
              const k = wheel[seg];
              return (
                <View key={i} style={styles.trailChip}>
                  <ElementIcon kind={k} size={24} />
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* Controls */}
      <View style={[styles.panel, { paddingBottom: insets.bottom + 10 }]}>
        <View style={styles.stakeRow}>
          <Pressable onPress={() => stepStake(-1)} disabled={playing || busy} style={[styles.roundBtn, (playing || busy) && styles.dim]}>
            <MaterialCommunityIcons name="minus" size={20} color="#FFFFFF" />
          </Pressable>
          <View style={styles.stakeBox}>
            <Text style={styles.stakeLabel}>BET</Text>
            <Text style={styles.stakeValue}>₹{(playing ? roundStake : stake).toFixed(2)}</Text>
          </View>
          <Pressable onPress={() => stepStake(1)} disabled={playing || busy} style={[styles.roundBtn, (playing || busy) && styles.dim]}>
            <MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" />
          </Pressable>
          <View style={styles.quickRow}>
            {QUICK_STAKES.map((q) => (
              <Pressable
                key={q}
                disabled={playing || busy || q > config.maxStake}
                onPress={() => setStake(q)}
                style={[styles.quick, stake === q && !playing && styles.quickActive, (playing || busy || q > config.maxStake) && styles.dim]}
              >
                <Text style={styles.quickText}>{q}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.actionRow}>
          <Pressable onPress={spin} disabled={busy} style={({ pressed }) => [styles.actionWrap, pressed && styles.pressed, busy && styles.dim]}>
            <LinearGradient colors={['#B24DFF', '#6A12D8']} style={styles.actionBtn}>
              <MaterialCommunityIcons name="rotate-right" size={24} color="#FFFFFF" />
              <View style={{ marginLeft: 6 }}>
                <Text style={styles.actionText}>{busy ? 'SPINNING…' : 'SPIN'}</Text>
                {!playing && <Text style={styles.actionSub}>₹{stake.toFixed(2)}</Text>}
              </View>
            </LinearGradient>
          </Pressable>
          {playing && (
            <Pressable onPress={cashOut} disabled={busy} style={({ pressed }) => [styles.actionWrap, pressed && styles.pressed, busy && styles.dim]}>
              <LinearGradient colors={['#FFD66B', '#E0901A']} style={styles.actionBtn}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={[styles.actionText, { color: '#3A1E00' }]}>CASH OUT</Text>
                  <Text style={[styles.actionSub, { color: '#3A1E00' }]}>₹{potential.toFixed(2)}</Text>
                </View>
              </LinearGradient>
            </Pressable>
          )}
        </View>
      </View>

      {win && <WinCard amount={win.amount} multiplier={win.multiplier} title={win.title} onClose={() => setWin(null)} />}

      {toast && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      <Modal visible={sheet !== null} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
        <View style={styles.sheetRoot}>
          {/* Sibling, not parent, of the sheet so its ScrollView can scroll. */}
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSheet(null)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{sheet === 'history' ? 'MY BETS' : 'HOW TO PLAY'}</Text>
              <Pressable onPress={() => setSheet(null)} hitSlop={10}>
                <MaterialCommunityIcons name="close" size={22} color="#FFFFFF" />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.sheetBody}>
              {sheet === 'rules' && (
                <>
                  {[
                    'Choose your bet and tap SPIN. Your bet is taken on the first spin.',
                    `The wheel has ${wheel.length} segments: ${wheel.filter((w) => w === 'WATER').length} Water, ${wheel.filter((w) => w === 'EARTH').length} Earth, ${wheel.filter((w) => w === 'FIRE').length} Fire and ${wheel.filter((w) => w === 'CRASH').length} Vortex.`,
                    'Every element you land fills one section of its ring and multiplies your win by that element’s factor.',
                    'Land on the Vortex and the round is lost.',
                    'Tap CASH OUT any time after the first spin to take your win.',
                    'Fill a whole ring and it cashes out for you automatically.',
                  ].map((line, i) => (
                    <View key={i} style={styles.ruleLine}>
                      <Text style={styles.ruleNum}>{i + 1}</Text>
                      <Text style={styles.ruleText}>{line}</Text>
                    </View>
                  ))}
                  <Text style={styles.sheetSection}>ELEMENTS</Text>
                  {config.elements.map((e) => (
                    <View key={e.element} style={styles.elementRow}>
                      <ElementIcon kind={e.element} size={22} />
                      <Text style={styles.elementName}>{LOOK[e.element].name}</Text>
                      <Text style={styles.elementInfo}>
                        x{e.factor} per hit · {e.sections} sections · full ring x{e.ladder[e.sections]}
                      </Text>
                    </View>
                  ))}
                  <View style={styles.elementRow}>
                    <ElementIcon kind="CRASH" size={22} />
                    <Text style={styles.elementName}>Vortex</Text>
                    <Text style={styles.elementInfo}>round lost</Text>
                  </View>
                  <Text style={styles.sheetSection}>GAME LIMITS</Text>
                  {[
                    ['Minimum bet', `₹${config.minStake}`],
                    ['Maximum bet', `₹${config.maxStake}`],
                    ['Maximum win per round', `₹${config.maxPayout}`],
                    ['Return to player', `${config.rtpPercent}%`],
                  ].map(([k, v]) => (
                    <View key={k} style={styles.limitRow}>
                      <Text style={styles.limitKey}>{k}</Text>
                      <Text style={styles.limitVal}>{v}</Text>
                    </View>
                  ))}
                  <Text style={styles.sheetSection}>PROVABLY FAIR</Text>
                  <Text style={styles.ruleText}>
                    Every spin comes from your server seed (shown as a hash before you play), your client seed and the round nonce, so each result can be checked after you rotate your seed.
                  </Text>
                  {round && <Text style={styles.hash}>Seed hash: {round.serverSeedHash}</Text>}
                </>
              )}
              {sheet === 'history' &&
                (history.length === 0 ? (
                  <Text style={styles.ruleText}>No rounds yet.</Text>
                ) : (
                  history.map((h) => {
                    const won = h.status === 'WON';
                    return (
                      <View key={h.id} style={styles.histRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.histTime}>{new Date(h.createdAt).toLocaleString()}</Text>
                          <View style={styles.histSegs}>
                            {h.segments.map((s, i) => (
                              <ElementIcon key={i} kind={wheel[s] ?? 'CRASH'} size={15} />
                            ))}
                          </View>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.histStake}>₹{Number(h.stake).toFixed(2)}</Text>
                          <Text style={[styles.histResult, { color: won ? '#7EE2A3' : '#FF7A8A' }]}>
                            {won ? `x${Number(h.multiplier).toFixed(2)} · +₹${Number(h.payout).toFixed(2)}` : 'Vortex'}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** A fixed field of faint stars behind everything. */
const Stars = memo(function Stars({ w, h }: { w: number; h: number }) {
  const stars = useMemo(() => {
    let seed = 7;
    const rnd = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    return Array.from({ length: 60 }, () => ({ x: rnd() * w, y: rnd() * h, r: 0.5 + rnd() * 1.3, o: 0.2 + rnd() * 0.6 }));
  }, [w, h]);
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      {stars.map((s, i) => (
        <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#FFFFFF" opacity={s.o} />
      ))}
    </Svg>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05000C' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center' },
  title: { color: '#E9D8FF', fontSize: 20, fontWeight: '900', letterSpacing: 4, textShadowColor: '#9B3DFF', textShadowRadius: 10 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  balancePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.4)' },
  balanceText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  iconBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  iconBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },

  meters: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, marginTop: 6, height: 54 },
  meter: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  meterMult: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  meterSub: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '700' },

  wheelArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  wheelGlow: { position: 'absolute', backgroundColor: 'rgba(155,61,255,0.18)', shadowColor: '#9B3DFF', shadowOpacity: 0.9, shadowRadius: 30, shadowOffset: { width: 0, height: 0 } },
  pointer: { position: 'absolute' },
  centreText: { color: '#FFFFFF', fontWeight: '900', textShadowColor: '#2A0050', textShadowRadius: 10, textShadowOffset: { width: 0, height: 2 } },
  centreCrash: { color: '#FFFFFF', textShadowColor: '#FF1F6A', textShadowRadius: 14, backgroundColor: 'rgba(10,0,20,0.7)', paddingHorizontal: 12, borderRadius: 14, overflow: 'hidden' },
  centreSub: { color: GOLD, fontWeight: '900', marginTop: -2, textShadowColor: '#000000', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  crashFlash: { position: 'absolute', left: 0, top: 0, backgroundColor: '#FF1F6A' },

  trail: { height: 34, justifyContent: 'center', paddingHorizontal: 12 },
  trailHint: { color: 'rgba(233,216,255,0.6)', fontSize: 12, textAlign: 'center', fontWeight: '700' },
  trailRow: { gap: 5, alignItems: 'center' },
  trailChip: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1C1E24', overflow: 'hidden' },

  panel: { paddingHorizontal: 12, paddingTop: 10, backgroundColor: 'rgba(20,4,40,0.92)', borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTopWidth: 1, borderColor: 'rgba(178,77,255,0.35)', gap: 10 },
  stakeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  roundBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  stakeBox: { minWidth: 86, alignItems: 'center', paddingVertical: 3, paddingHorizontal: 6, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.35)' },
  stakeLabel: { color: 'rgba(233,216,255,0.6)', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  stakeValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  quickRow: { flex: 1, flexDirection: 'row', gap: 4, justifyContent: 'flex-end' },
  quick: { minWidth: 0, flexShrink: 1, paddingHorizontal: 7, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  quickActive: { borderColor: GOLD, backgroundColor: 'rgba(255,214,107,0.15)' },
  quickText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionWrap: { flex: 1 },
  actionBtn: { height: 58, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  actionText: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', letterSpacing: 1.5 },
  actionSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '800' },
  pressed: { transform: [{ scale: 0.97 }] },
  dim: { opacity: 0.45 },

  winWrap: { position: 'absolute', top: '30%', alignSelf: 'center', alignItems: 'center' },
  winCard: { alignItems: 'center', paddingHorizontal: 34, paddingVertical: 14, borderRadius: 18, borderWidth: 2, borderColor: GOLD },
  winTitle: { color: GOLD, fontSize: 15, fontWeight: '900', letterSpacing: 2 },
  winAmount: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', marginTop: 2 },
  winMult: { color: '#D9B8FF', fontSize: 14, fontWeight: '800' },
  winClose: { marginTop: 8, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#16042A', borderWidth: 2, borderColor: GOLD },
  toast: { position: 'absolute', alignSelf: 'center', top: '45%', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.85)', borderWidth: 1, borderColor: '#9B3DFF' },
  toastText: { color: '#F2E6FF', fontSize: 14, fontWeight: '700' },

  sheetRoot: { flex: 1, justifyContent: 'center', padding: 18, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { maxHeight: '82%', borderRadius: 20, backgroundColor: '#1A0A2E', borderWidth: 1, borderColor: 'rgba(178,77,255,0.4)', overflow: 'hidden' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  sheetTitle: { color: GOLD, fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  sheetBody: { padding: 16, gap: 10 },
  sheetSection: { color: '#D9B8FF', fontSize: 13, fontWeight: '900', letterSpacing: 1.5, marginTop: 8 },
  ruleLine: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  ruleNum: { width: 22, height: 22, borderRadius: 11, textAlign: 'center', lineHeight: 22, color: '#1A0A2E', backgroundColor: GOLD, fontWeight: '900', fontSize: 12, overflow: 'hidden' },
  ruleText: { flex: 1, color: '#E9D8FF', fontSize: 13, lineHeight: 19 },
  elementRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  elementName: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', width: 52 },
  elementInfo: { flex: 1, color: 'rgba(233,216,255,0.75)', fontSize: 12 },
  limitRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  limitKey: { color: 'rgba(233,216,255,0.75)', fontSize: 13 },
  limitVal: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  hash: { color: 'rgba(233,216,255,0.5)', fontSize: 10 },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  histTime: { color: 'rgba(233,216,255,0.6)', fontSize: 11 },
  histSegs: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, marginTop: 3 },
  histStake: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  histResult: { fontSize: 12, fontWeight: '800' },
});
