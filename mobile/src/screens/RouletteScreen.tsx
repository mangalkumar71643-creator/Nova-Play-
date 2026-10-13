import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ScreenOrientation from 'expo-screen-orientation';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, GestureResponderEvent, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient as SvgLinearGradient, Path, Polygon, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { ApiClientError } from '../api/client';
import {
  RouletteConfig,
  RouletteHistoryEntry,
  RouletteRoundView,
  cancelRouletteBets,
  fetchRouletteConfig,
  fetchRouletteCurrent,
  fetchRouletteHistory,
  fetchRouletteMyRound,
  placeRouletteBets,
} from '../api/backend';
import { useGameState } from '../state/GameStateContext';

// ---------- table ----------

const GOLD = '#E9C46A';
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
/** Pockets clockwise from the zero, European single-zero wheel. */
const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const SEG = 360 / 37;

const CHIP_VALUES = [10, 20, 50, 100, 200, 500];
const CHIP_COLORS: Record<number, string> = {
  10: '#2E8B57',
  20: '#1C8FB0',
  50: '#2F55D4',
  100: '#1B1B1B',
  200: '#8E44AD',
  500: '#C0392B',
};

/** After the reveal the ball keeps running and lands this much later; the
 * wheel stays zoomed in for a moment after that. */
const LAND_MS = 6000;
const FOCUS_HOLD_MS = 2400;
const TOAST_MS = 1600;
const WIN_CARD_MS = 3200;
const BANNER_MS = 1300;

function colorOf(n: number): 'RED' | 'BLACK' | 'GREEN' {
  return n === 0 ? 'GREEN' : RED_NUMBERS.has(n) ? 'RED' : 'BLACK';
}
const POCKET_FILL = { RED: '#C2102A', BLACK: '#141414', GREEN: '#0E8A43' } as const;

/** Every bet spot and the numbers it covers (mirrors the server's table). */
function buildSpots(): Map<string, number[]> {
  const m = new Map<string, number[]>();
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  for (let n = 0; n <= 36; n++) m.set(`S:${n}`, [n]);
  for (let n = 1; n <= 33; n++) m.set(`SP:${n}-${n + 3}`, [n, n + 3]);
  for (let n = 1; n <= 35; n++) if (n % 3 !== 0) m.set(`SP:${n}-${n + 1}`, [n, n + 1]);
  for (const n of [1, 2, 3]) m.set(`SP:0-${n}`, [0, n]);
  for (let n = 1; n <= 34; n += 3) m.set(`ST:${n}`, [n, n + 1, n + 2]);
  m.set('TR:0-1-2', [0, 1, 2]);
  m.set('TR:0-2-3', [0, 2, 3]);
  for (let n = 1; n <= 32; n++) if (n % 3 !== 0) m.set(`CO:${n}`, [n, n + 1, n + 3, n + 4]);
  m.set('CO:0', [0, 1, 2, 3]);
  for (let n = 1; n <= 31; n += 3) m.set(`LN:${n}`, range(n, n + 5));
  for (let d = 1; d <= 3; d++) m.set(`DZ${d}`, range(12 * d - 11, 12 * d));
  for (let c = 1; c <= 3; c++) m.set(`COL${c}`, range(1, 36).filter((n) => n % 3 === c % 3));
  m.set('RED', [...RED_NUMBERS]);
  m.set('BLACK', range(1, 36).filter((n) => !RED_NUMBERS.has(n)));
  m.set('ODD', range(1, 36).filter((n) => n % 2 === 1));
  m.set('EVEN', range(1, 36).filter((n) => n % 2 === 0));
  m.set('LOW', range(1, 18));
  m.set('HIGH', range(19, 36));
  return m;
}
const SPOTS = buildSpots();

const EVEN_ROW = ['LOW', 'EVEN', 'RED', 'BLACK', 'ODD', 'HIGH'] as const;
const EVEN_LABEL: Record<string, string> = { LOW: '1-18', EVEN: 'EVEN', ODD: 'ODD', HIGH: '19-36' };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function floor2(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

function shortAmount(n: number): string {
  if (n >= 1000) return `${round2(n / 1000)}k`;
  return String(round2(n));
}

function chipColorFor(amount: number): string {
  const v = [...CHIP_VALUES].reverse().find((c) => c <= amount) ?? CHIP_VALUES[0];
  return CHIP_COLORS[v];
}

/** Clockwise angle (deg, 0 = top) of a number's pocket on the wheel head. */
function pocketAngle(n: number): number {
  return WHEEL_ORDER.indexOf(n) * SEG;
}

function polar(c: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [c + r * Math.cos(a), c + r * Math.sin(a)];
}

function sectorPath(c: number, r0: number, r1: number, a0: number, a1: number): string {
  const [x0, y0] = polar(c, r1, a0);
  const [x1, y1] = polar(c, r1, a1);
  const [x2, y2] = polar(c, r0, a1);
  const [x3, y3] = polar(c, r0, a0);
  return `M${x0} ${y0} A${r1} ${r1} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${r0} ${r0} 0 0 0 ${x3} ${y3} Z`;
}

// ---------- wheel art ----------

/** The fixed bowl: wooden rim, gold inlay, ball track and the diamonds. */
const WheelBowl = memo(function WheelBowl({ z }: { z: number }) {
  const c = z / 2;
  return (
    <Svg width={z} height={z}>
      <Defs>
        <RadialGradient id="rwWood" cx="50%" cy="50%" r="50%">
          <Stop offset="0.8" stopColor="#8A4A20" />
          <Stop offset="0.9" stopColor="#5E2B0E" />
          <Stop offset="0.97" stopColor="#3A1805" />
          <Stop offset="1" stopColor="#1A0A02" />
        </RadialGradient>
        <SvgLinearGradient id="rwGold" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFF0B3" />
          <Stop offset="0.35" stopColor="#D9A93F" />
          <Stop offset="0.65" stopColor="#8C6214" />
          <Stop offset="1" stopColor="#F4D47A" />
        </SvgLinearGradient>
        <RadialGradient id="rwTrack" cx="50%" cy="50%" r="50%">
          <Stop offset="0.78" stopColor="#1B0E06" />
          <Stop offset="0.86" stopColor="#4A2C14" />
          <Stop offset="0.93" stopColor="#6B4322" />
          <Stop offset="1" stopColor="#2A1608" />
        </RadialGradient>
      </Defs>
      <Circle cx={c} cy={c} r={z * 0.5} fill="url(#rwWood)" />
      <Circle cx={c} cy={c} r={z * 0.474} fill="none" stroke="url(#rwGold)" strokeWidth={z * 0.014} />
      <Circle cx={c} cy={c} r={z * 0.462} fill="url(#rwTrack)" />
      <Circle cx={c} cy={c} r={z * 0.462} fill="none" stroke="#120802" strokeWidth={z * 0.004} />
      <Circle cx={c} cy={c} r={z * 0.378} fill="#120904" />
      <Circle cx={c} cy={c} r={z * 0.376} fill="none" stroke="url(#rwGold)" strokeWidth={z * 0.005} />
      {Array.from({ length: 8 }, (_, i) => {
        const a = i * 45 + 22.5;
        const [x, y] = polar(c, z * 0.408, a);
        const long = i % 2 === 0;
        const hw = z * (long ? 0.01 : 0.016);
        const hh = z * (long ? 0.02 : 0.01);
        return (
          <G key={i} rotation={a} origin={`${x}, ${y}`}>
            <Polygon points={`${x},${y - hh} ${x + hw},${y} ${x},${y + hh} ${x - hw},${y}`} fill="url(#rwGold)" stroke="#6B4A10" strokeWidth={0.6} />
          </G>
        );
      })}
    </Svg>
  );
});

/** The spinning head: numbered ring, pockets with frets, cone and turret. */
const WheelHead = memo(function WheelHead({ z }: { z: number }) {
  const c = z / 2;
  const rOut = z * 0.366;
  const rNum = z * 0.29;
  const rPocket = z * 0.212;
  const fs = z * 0.036;
  return (
    <Svg width={z} height={z}>
      <Defs>
        <RadialGradient id="rhCone" cx="42%" cy="38%" r="62%">
          <Stop offset="0" stopColor="#B06A34" />
          <Stop offset="0.55" stopColor="#6A3312" />
          <Stop offset="1" stopColor="#2E1204" />
        </RadialGradient>
        <SvgLinearGradient id="rhGold" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFF3C0" />
          <Stop offset="0.4" stopColor="#DDAE45" />
          <Stop offset="0.75" stopColor="#8C6214" />
          <Stop offset="1" stopColor="#F2D27A" />
        </SvgLinearGradient>
        <RadialGradient id="rhKnob" cx="35%" cy="30%" r="70%">
          <Stop offset="0" stopColor="#FFF8DA" />
          <Stop offset="0.45" stopColor="#E0B04A" />
          <Stop offset="1" stopColor="#7A520E" />
        </RadialGradient>
        <RadialGradient id="rhPocketShade" cx="50%" cy="50%" r="50%">
          <Stop offset="0.55" stopColor="#000000" stopOpacity={0.55} />
          <Stop offset="0.8" stopColor="#000000" stopOpacity={0.15} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0.35} />
        </RadialGradient>
      </Defs>
      {WHEEL_ORDER.map((n, i) => {
        const a0 = i * SEG - SEG / 2;
        const a1 = a0 + SEG;
        const fill = POCKET_FILL[colorOf(n)];
        return (
          <G key={n}>
            <Path d={sectorPath(c, rNum, rOut, a0, a1)} fill={fill} />
            <Path d={sectorPath(c, rPocket, rNum, a0, a1)} fill={fill} />
          </G>
        );
      })}
      {/* Pockets sit lower than the numbers */}
      <Circle cx={c} cy={c} r={rNum} fill="url(#rhPocketShade)" />
      {WHEEL_ORDER.map((n, i) => {
        const a = i * SEG;
        const [x, y] = polar(c, z * 0.328, a);
        return (
          <SvgText
            key={`t${n}`}
            x={x}
            y={y + fs * 0.36}
            fontSize={fs}
            fontWeight="bold"
            fill="#FFFFFF"
            textAnchor="middle"
            rotation={a}
            origin={`${x}, ${y}`}
          >
            {n}
          </SvgText>
        );
      })}
      {/* Frets between pockets and between numbers */}
      {WHEEL_ORDER.map((_, i) => {
        const a = i * SEG - SEG / 2;
        const [x0, y0] = polar(c, rPocket, a);
        const [x1, y1] = polar(c, rNum, a);
        const [x2, y2] = polar(c, rOut, a);
        return (
          <G key={`f${i}`}>
            <Line x1={x0} y1={y0} x2={x1} y2={y1} stroke="url(#rhGold)" strokeWidth={z * 0.006} />
            <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#E4C06A" strokeWidth={z * 0.0025} opacity={0.8} />
          </G>
        );
      })}
      <Circle cx={c} cy={c} r={rOut} fill="none" stroke="url(#rhGold)" strokeWidth={z * 0.008} />
      <Circle cx={c} cy={c} r={rNum} fill="none" stroke="url(#rhGold)" strokeWidth={z * 0.005} />
      {/* Cone and turret */}
      <Circle cx={c} cy={c} r={rPocket} fill="url(#rhCone)" />
      <Circle cx={c} cy={c} r={rPocket} fill="none" stroke="url(#rhGold)" strokeWidth={z * 0.008} />
      {Array.from({ length: 8 }, (_, i) => {
        const [x0, y0] = polar(c, z * 0.075, i * 45 + 22.5);
        const [x1, y1] = polar(c, z * 0.195, i * 45 + 22.5);
        return <Line key={`s${i}`} x1={x0} y1={y0} x2={x1} y2={y1} stroke="#E4C06A" strokeWidth={z * 0.004} opacity={0.35} />;
      })}
      <Circle cx={c} cy={c} r={z * 0.07} fill="url(#rhGold)" opacity={0.9} />
      {[0, 90, 180, 270].map((a) => {
        const [x1, y1] = polar(c, z * 0.14, a);
        return (
          <G key={`a${a}`}>
            <Line x1={c} y1={c} x2={x1} y2={y1} stroke="url(#rhGold)" strokeWidth={z * 0.022} strokeLinecap="round" />
            <Circle cx={x1} cy={y1} r={z * 0.022} fill="url(#rhKnob)" />
          </G>
        );
      })}
      <Circle cx={c} cy={c} r={z * 0.042} fill="url(#rhKnob)" />
    </Svg>
  );
});

/** Fixed room light on top of everything (it doesn't turn with the head). */
const WheelGloss = memo(function WheelGloss({ z }: { z: number }) {
  const c = z / 2;
  return (
    <Svg width={z} height={z}>
      <Defs>
        <SvgLinearGradient id="rgGloss" x1="0.15" y1="0.1" x2="0.6" y2="0.7">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.22} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </SvgLinearGradient>
      </Defs>
      <Circle cx={c} cy={c} r={z * 0.462} fill="url(#rgGloss)" />
      <Ellipse cx={c - z * 0.15} cy={c - z * 0.2} rx={z * 0.1} ry={z * 0.04} fill="#FFFFFF" opacity={0.08} rotation={-35} origin={`${c - z * 0.15}, ${c - z * 0.2}`} />
    </Svg>
  );
});

const BallArt = memo(function BallArt({ d }: { d: number }) {
  return (
    <Svg width={d} height={d}>
      <Defs>
        <RadialGradient id="rbBall" cx="35%" cy="32%" r="70%">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.55" stopColor="#E6E6E6" />
          <Stop offset="1" stopColor="#8E8E8E" />
        </RadialGradient>
      </Defs>
      <Circle cx={d / 2} cy={d / 2} r={d / 2 - 0.5} fill="url(#rbBall)" />
    </Svg>
  );
});

type WheelMode = { kind: 'rest'; number: number | null } | { kind: 'spin'; key: string; landLocal: number; result: number | null };

const decel = (x: number) => 1 - Math.pow(1 - x, 2.2);
const smooth = (x: number) => x * x * (3 - 2 * x);

/**
 * Wheel head turning slowly all the time; the ball rests in the last
 * winning pocket, is launched round the track when betting closes and is
 * steered (invisibly, while it is still fast) into the revealed pocket.
 * Ball angle = wheel angle + ψ, where ψ is the ball's angle on the head, so
 * once it stops it is exactly in its pocket and turns with the wheel.
 */
function WheelStage({ z, mode }: { z: number; mode: WheelMode }) {
  const wheelDeg = useRef(new Animated.Value(0)).current;
  const psi0 = useRef(new Animated.Value(0)).current;
  const base = useRef(new Animated.Value(0)).current;
  const corr = useRef(new Animated.Value(0)).current;
  const radius = useRef(new Animated.Value(z * 0.252)).current;
  const ballOpacity = useRef(new Animated.Value(0)).current;
  const psi0Ref = useRef(0);
  const launchRef = useRef<{ key: string; B: number; psi0: number } | null>(null);
  const steeredRef = useRef<string | null>(null);
  const dropTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rTrack = z * 0.425;
  const rPocket = z * 0.252;
  const ballD = z * 0.036;

  useEffect(() => {
    const loop = Animated.loop(Animated.timing(wheelDeg, { toValue: 360, duration: 11000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [wheelDeg]);

  useEffect(
    () => () => {
      if (dropTimer.current) clearTimeout(dropTimer.current);
    },
    []
  );

  const snap = useCallback(
    (n: number) => {
      base.stopAnimation();
      corr.stopAnimation();
      radius.stopAnimation();
      if (dropTimer.current) clearTimeout(dropTimer.current);
      psi0Ref.current = pocketAngle(n);
      psi0.setValue(psi0Ref.current);
      base.setValue(0);
      corr.setValue(0);
      radius.setValue(rPocket);
      ballOpacity.setValue(1);
    },
    [base, corr, radius, psi0, ballOpacity, rPocket]
  );

  const restNumber = mode.kind === 'rest' ? mode.number : null;
  useEffect(() => {
    if (mode.kind !== 'rest') return;
    if (restNumber === null) ballOpacity.setValue(0);
    else snap(restNumber);
    // Only when we come to rest / the resting number changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode.kind, restNumber]);

  const spinKey = mode.kind === 'spin' ? mode.key : null;
  const spinResult = mode.kind === 'spin' ? mode.result : null;

  // Launch: out of the pocket onto the track, then a long deceleration.
  useEffect(() => {
    if (mode.kind !== 'spin' || launchRef.current?.key === mode.key) return;
    const D = mode.landLocal - Date.now();
    launchRef.current = null;
    if (D < 1500) {
      if (mode.result !== null) snap(mode.result);
      return;
    }
    const B = 360 * Math.max(3, Math.round((9 * D) / 7000));
    launchRef.current = { key: mode.key, B, psi0: psi0Ref.current };
    base.setValue(0);
    corr.setValue(0);
    ballOpacity.setValue(1);
    Animated.timing(base, { toValue: -B, duration: D, easing: decel, useNativeDriver: true }).start();
    Animated.timing(radius, { toValue: rTrack, duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    if (dropTimer.current) clearTimeout(dropTimer.current);
    dropTimer.current = setTimeout(() => {
      Animated.timing(radius, { toValue: rPocket, duration: 1700, easing: Easing.bounce, useNativeDriver: true }).start();
    }, D - 1700);
    // Once per spin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinKey]);

  // Steer: add up to one extra lap so the run ends in the right pocket.
  useEffect(() => {
    if (mode.kind !== 'spin' || mode.result === null || steeredRef.current === mode.key) return;
    const launch = launchRef.current;
    if (!launch || launch.key !== mode.key) return;
    steeredRef.current = mode.key;
    const rem = mode.landLocal - Date.now();
    if (rem < 900) {
      snap(mode.result);
      return;
    }
    const end = launch.psi0 - launch.B;
    const d = (((pocketAngle(mode.result) - end) % 360) + 360) % 360;
    Animated.timing(corr, { toValue: d === 0 ? 0 : d - 360, duration: rem, easing: smooth, useNativeDriver: true }).start();
    // Once per spin, when the number arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinKey, spinResult]);

  const ballDeg = useMemo(() => Animated.add(wheelDeg, Animated.add(psi0, Animated.add(base, corr))), [wheelDeg, psi0, base, corr]);
  const rot = (v: Animated.AnimatedInterpolation<number> | Animated.Value | Animated.AnimatedAddition<number>) =>
    v.interpolate({ inputRange: [-100000, 100000], outputRange: ['-100000deg', '100000deg'] });

  return (
    <View style={{ width: z, height: z }}>
      <WheelBowl z={z} />
      <Animated.View renderToHardwareTextureAndroid shouldRasterizeIOS style={[StyleSheet.absoluteFill, { transform: [{ rotate: rot(wheelDeg) }] }]}>
        <WheelHead z={z} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: ballOpacity, transform: [{ rotate: rot(ballDeg) }] }]}>
        <Animated.View
          style={{
            position: 'absolute',
            left: z / 2 - ballD / 2,
            top: z / 2 - ballD / 2,
            transform: [{ translateY: radius.interpolate({ inputRange: [0, z], outputRange: [0, -z] }) }],
          }}
        >
          <View style={{ position: 'absolute', left: ballD * 0.12, top: ballD * 0.2, width: ballD, height: ballD, borderRadius: ballD / 2, backgroundColor: 'rgba(0,0,0,0.45)' }} />
          <BallArt d={ballD} />
        </Animated.View>
      </Animated.View>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <WheelGloss z={z} />
      </View>
    </View>
  );
}

/** Small static wheel for the home-screen tile. */
export const RouletteTileArt = memo(function RouletteTileArt({ size }: { size: number }) {
  return (
    <View style={{ width: size, height: size }}>
      <WheelBowl z={size} />
      <View style={[StyleSheet.absoluteFill, { transform: [{ rotate: '12deg' }] }]}>
        <WheelHead z={size} />
      </View>
      <View style={{ position: 'absolute', left: size * 0.5 - size * 0.025, top: size * 0.07, width: size * 0.05, height: size * 0.05, borderRadius: size * 0.025, backgroundColor: '#FFFFFF' }} />
    </View>
  );
});

// ---------- chips ----------

const ChipArt = memo(function ChipArt({ value, size, label }: { value: number; size: number; label?: string }) {
  const r = size / 2;
  const color = chipColorFor(value);
  const edge = 2 * Math.PI * (r * 0.8);
  const text = label ?? shortAmount(value);
  const fs = size * (text.length >= 4 ? 0.24 : text.length === 3 ? 0.28 : 0.34);
  return (
    <Svg width={size} height={size}>
      <Circle cx={r} cy={r} r={r - 0.5} fill={color} />
      <Circle cx={r} cy={r} r={r * 0.8} fill="none" stroke="#FFFFFF" strokeWidth={r * 0.24} strokeDasharray={`${edge / 12} ${edge / 12}`} opacity={0.92} />
      <Circle cx={r} cy={r} r={r * 0.58} fill={color} stroke="rgba(255,255,255,0.75)" strokeWidth={Math.max(1, r * 0.06)} />
      <Circle cx={r} cy={r} r={r * 0.58} fill="#000000" opacity={0.12} />
      <SvgText x={r} y={r + fs * 0.36} fontSize={fs} fontWeight="bold" fill="#FFFFFF" textAnchor="middle">
        {text}
      </SvgText>
    </Svg>
  );
});

/** A stack of chips on a bet spot; pops when it grows. */
function ChipStack({ amount, size, state, glow }: { amount: number; size: number; state: 'normal' | 'win' | 'lose'; glow: Animated.Value }) {
  const pop = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    pop.setValue(0.7);
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 170, useNativeDriver: true }).start();
  }, [amount, pop]);
  const layers = amount >= 100 ? 2 : amount >= 30 ? 1 : 0;
  return (
    <Animated.View pointerEvents="none" style={{ width: size, height: size, opacity: state === 'lose' ? 0.28 : 1, transform: [{ scale: pop }] }}>
      {Array.from({ length: layers }, (_, i) => (
        <View
          key={i}
          style={{ position: 'absolute', left: 0, top: (layers - i) * 2.5, width: size, height: size, borderRadius: size / 2, backgroundColor: chipColorFor(amount), borderWidth: 1, borderColor: 'rgba(0,0,0,0.35)' }}
        />
      ))}
      <View style={{ position: 'absolute', left: 1, top: 3, width: size, height: size, borderRadius: size / 2, backgroundColor: 'rgba(0,0,0,0.35)' }} />
      <ChipArt value={amount} size={size} />
      {state === 'win' && <Animated.View style={[styles.chipWinRing, { borderRadius: size / 2 + 4, opacity: glow }]} />}
    </Animated.View>
  );
}

// ---------- board ----------

type Geom = ReturnType<typeof boardGeom>;

function boardGeom(cw: number, ch: number, dh: number) {
  const cell = (n: number) => {
    if (n === 0) return { x: 0, y: 0, w: cw, h: 3 * ch };
    const col = Math.ceil(n / 3) - 1;
    const row = 2 - ((n - 1) % 3);
    return { x: cw + col * cw, y: row * ch, w: cw, h: ch };
  };
  const center = (key: string): { x: number; y: number } => {
    if (key.startsWith('S:')) {
      const n = Number(key.slice(2));
      const c = cell(n);
      return { x: c.x + c.w * (n === 0 ? 0.55 : 0.5), y: c.y + c.h / 2 };
    }
    if (key.startsWith('SP:')) {
      const [a, b] = key.slice(3).split('-').map(Number);
      if (a === 0) return { x: cw, y: cell(b).y + ch / 2 };
      const ca = cell(a);
      return b === a + 3 ? { x: ca.x + cw, y: ca.y + ch / 2 } : { x: ca.x + cw / 2, y: ca.y };
    }
    if (key.startsWith('ST:')) return { x: cell(Number(key.slice(3))).x + cw / 2, y: 3 * ch };
    if (key === 'TR:0-1-2') return { x: cw, y: 2 * ch };
    if (key === 'TR:0-2-3') return { x: cw, y: ch };
    if (key === 'CO:0') return { x: cw, y: 3 * ch };
    if (key.startsWith('CO:')) {
      const c = cell(Number(key.slice(3)));
      return { x: c.x + cw, y: c.y };
    }
    if (key.startsWith('LN:')) return { x: cell(Number(key.slice(3))).x + cw, y: 3 * ch };
    if (key.startsWith('DZ')) return { x: cw + (Number(key[2]) - 1) * 4 * cw + 2 * cw, y: 3 * ch + dh / 2 };
    if (key.startsWith('COL')) return { x: 13 * cw + cw / 2, y: (3 - Number(key[3])) * ch + ch / 2 };
    const i = EVEN_ROW.indexOf(key as (typeof EVEN_ROW)[number]);
    return { x: cw + i * 2 * cw + cw, y: 3 * ch + dh + dh / 2 };
  };
  /** Tap inside the number grid -> the spot under the finger: straight in a
   * cell, split on a line, corner where lines cross, street / six line on
   * the bottom edge, and the zero bets along the zero's edge. */
  const resolve = (x: number, y: number): string => {
    const E = 0.24;
    const gx = (x - cw) / cw;
    const gy = y / ch;
    if (gx < -E) return 'S:0';
    const vx = Math.round(gx);
    const vy = Math.round(gy);
    const nearV = Math.abs(gx - vx) <= E && vx >= 0 && vx <= 11;
    const nearH = Math.abs(gy - vy) <= E && vy >= 1 && vy <= 3;
    const col = Math.min(11, Math.max(0, Math.floor(gx)));
    const row = Math.min(2, Math.max(0, Math.floor(gy)));
    const at = (c: number, r: number) => 3 * (c + 1) - r;
    if (nearV && nearH) {
      if (vx === 0) return vy === 3 ? 'CO:0' : vy === 2 ? 'TR:0-1-2' : 'TR:0-2-3';
      if (vy === 3) return `LN:${at(vx - 1, 2)}`;
      return `CO:${at(vx - 1, vy)}`;
    }
    if (nearV) {
      if (vx === 0) return `SP:0-${at(0, row)}`;
      const a = at(vx - 1, row);
      return `SP:${a}-${a + 3}`;
    }
    if (nearH) {
      if (vy === 3) return `ST:${at(col, 2)}`;
      const a = at(col, vy);
      return `SP:${a}-${a + 1}`;
    }
    if (gx < 0) return 'S:0';
    return `S:${at(col, row)}`;
  };
  return { cw, ch, dh, width: 14 * cw, height: 3 * ch + 2 * dh, cell, center, resolve };
}

/** Rects for highlighting the outside boxes themselves. */
function outsideRect(g: Geom, key: string) {
  if (key.startsWith('DZ')) return { x: g.cw + (Number(key[2]) - 1) * 4 * g.cw, y: 3 * g.ch, w: 4 * g.cw, h: g.dh };
  if (key.startsWith('COL')) return { x: 13 * g.cw, y: (3 - Number(key[3])) * g.ch, w: g.cw, h: g.ch };
  const i = EVEN_ROW.indexOf(key as (typeof EVEN_ROW)[number]);
  if (i >= 0) return { x: g.cw + i * 2 * g.cw, y: 3 * g.ch + g.dh, w: 2 * g.cw, h: g.dh };
  return null;
}

const BoardArt = memo(function BoardArt({ cw, ch, dh }: { cw: number; ch: number; dh: number }) {
  const g = boardGeom(cw, ch, dh);
  const fs = Math.min(cw * 0.42, ch * 0.36);
  const ofs = Math.min(dh * 0.36, cw * 0.36);
  const line = 'rgba(233,196,106,0.85)';
  return (
    <Svg width={g.width} height={g.height}>
      <Defs>
        <SvgLinearGradient id="rbRed" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#E0283F" />
          <Stop offset="1" stopColor="#9E0C20" />
        </SvgLinearGradient>
        <SvgLinearGradient id="rbBlack" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#343434" />
          <Stop offset="1" stopColor="#0B0B0B" />
        </SvgLinearGradient>
        <SvgLinearGradient id="rbGreen" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#0B6B33" />
          <Stop offset="1" stopColor="#17A152" />
        </SvgLinearGradient>
      </Defs>
      {/* Zero */}
      <Path d={`M ${cw} 1 L ${cw * 0.42} 1 L 1 ${1.5 * ch} L ${cw * 0.42} ${3 * ch - 1} L ${cw} ${3 * ch - 1} Z`} fill="url(#rbGreen)" stroke={line} strokeWidth={1.2} />
      <SvgText x={cw * 0.6} y={1.5 * ch + fs * 0.36} fontSize={fs * 1.1} fontWeight="bold" fill="#FFFFFF" textAnchor="middle">
        0
      </SvgText>
      {/* Numbers */}
      {Array.from({ length: 36 }, (_, i) => {
        const n = i + 1;
        const c = g.cell(n);
        return (
          <G key={n}>
            <Rect x={c.x + 2} y={c.y + 2} width={c.w - 4} height={c.h - 4} rx={4} fill={RED_NUMBERS.has(n) ? 'url(#rbRed)' : 'url(#rbBlack)'} />
            <SvgText x={c.x + c.w / 2} y={c.y + c.h / 2 + fs * 0.36} fontSize={fs} fontWeight="bold" fill="#FFFFFF" textAnchor="middle">
              {n}
            </SvgText>
          </G>
        );
      })}
      {/* Columns */}
      {[3, 2, 1].map((c, row) => (
        <SvgText key={c} x={13.5 * cw} y={row * ch + ch / 2 + ofs * 0.36} fontSize={ofs * 0.95} fontWeight="bold" fill={GOLD} textAnchor="middle">
          2:1
        </SvgText>
      ))}
      {/* Dozens */}
      {['1st 12', '2nd 12', '3rd 12'].map((t, i) => (
        <SvgText key={t} x={cw + i * 4 * cw + 2 * cw} y={3 * ch + dh / 2 + ofs * 0.36} fontSize={ofs} fontWeight="bold" fill="#FFFFFF" textAnchor="middle" letterSpacing={1}>
          {t}
        </SvgText>
      ))}
      {/* Even chances */}
      {EVEN_ROW.map((k, i) => {
        const x = cw + i * 2 * cw + cw;
        const y = 3 * ch + dh + dh / 2;
        if (k === 'RED' || k === 'BLACK') {
          const hw = cw * 0.55;
          const hh = dh * 0.3;
          return (
            <Polygon
              key={k}
              points={`${x},${y - hh} ${x + hw},${y} ${x},${y + hh} ${x - hw},${y}`}
              fill={k === 'RED' ? 'url(#rbRed)' : 'url(#rbBlack)'}
              stroke={line}
              strokeWidth={1}
            />
          );
        }
        return (
          <SvgText key={k} x={x} y={y + ofs * 0.36} fontSize={ofs} fontWeight="bold" fill="#FFFFFF" textAnchor="middle">
            {EVEN_LABEL[k]}
          </SvgText>
        );
      })}
      {/* Gold lines */}
      {Array.from({ length: 14 }, (_, i) => (
        <Line key={`v${i}`} x1={cw + i * cw} y1={0} x2={cw + i * cw} y2={i === 12 || i === 13 || i === 0 ? 3 * ch : 3 * ch} stroke={line} strokeWidth={1} />
      ))}
      {[0, 1, 2, 3].map((r) => (
        <Line key={`h${r}`} x1={cw} y1={r * ch} x2={14 * cw} y2={r * ch} stroke={line} strokeWidth={1} />
      ))}
      <Line x1={cw} y1={3 * ch + dh} x2={13 * cw} y2={3 * ch + dh} stroke={line} strokeWidth={1} />
      <Line x1={cw} y1={3 * ch + 2 * dh - 0.5} x2={13 * cw} y2={3 * ch + 2 * dh - 0.5} stroke={line} strokeWidth={1} />
      {[1, 5, 9, 13].map((i) => (
        <Line key={`d${i}`} x1={i * cw} y1={3 * ch} x2={i * cw} y2={3 * ch + dh} stroke={line} strokeWidth={1} />
      ))}
      {[1, 3, 5, 7, 9, 11, 13].map((i) => (
        <Line key={`e${i}`} x1={i * cw} y1={3 * ch + dh} x2={i * cw} y2={3 * ch + 2 * dh} stroke={line} strokeWidth={1} />
      ))}
    </Svg>
  );
});

// ---------- screen ----------

type PlacedChip = { key: number; area: string; amount: number; id?: string };

export default function RouletteScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const landscape = W > H;
  const { coins, refreshWallet } = useGameState();

  // Played sideways, like the other tables.
  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
      return () => {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      };
    }, [])
  );

  const [config, setConfig] = useState<RouletteConfig | null>(null);
  const [view, setView] = useState<RouletteRoundView | null>(null);
  const [history, setHistory] = useState<RouletteHistoryEntry[]>([]);
  const [chips, setChips] = useState<PlacedChip[]>([]);
  const [chip, setChip] = useState(10);
  const [win, setWin] = useState<number | null>(null);
  const [lastWin, setLastWin] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ nums: number[]; id: number } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const offsetRef = useRef(0);
  const periodRef = useRef<string | null>(null);
  const resultHandledRef = useRef<string | null>(null);
  const chipsRef = useRef<PlacedChip[]>([]);
  chipsRef.current = chips;
  const lastRoundRef = useRef<{ area: string; amount: number }[]>([]);
  const idMapRef = useRef(new Map<number, string>());
  const keyRef = useRef(1);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const winTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focus = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0.4)).current;
  const winPop = useRef(new Animated.Value(0)).current;
  const bannerAnim = useRef(new Animated.Value(0)).current;
  const badgePop = useRef(new Animated.Value(0)).current;

  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const maxPayout = config?.maxPayout ?? 10000;
  const multFor = useCallback(
    (key: string) => {
      const n = SPOTS.get(key)?.length ?? 1;
      return config?.multipliers?.[String(n)] ?? floor2((0.9 * 37) / n);
    },
    [config]
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const showBanner = useCallback(
    (text: string) => {
      setBanner(text);
      bannerAnim.setValue(0);
      Animated.timing(bannerAnim, { toValue: 1, duration: 380, easing: Easing.out(Easing.back(1.3)), useNativeDriver: true }).start();
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
      bannerTimer.current = setTimeout(() => {
        Animated.timing(bannerAnim, { toValue: 2, duration: 300, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => mountedRef.current && setBanner(null));
      }, BANNER_MS);
    },
    [bannerAnim]
  );

  const enqueue = useCallback((op: () => Promise<void>) => {
    queueRef.current = queueRef.current.then(op).catch(() => {});
  }, []);

  const syncMyRound = useCallback(() => {
    fetchRouletteMyRound()
      .then((res) => {
        if (!mountedRef.current || res.periodNumber !== periodRef.current) return;
        setChips(
          res.bets.map((b) => {
            const key = keyRef.current++;
            idMapRef.current.set(key, b.id);
            return { key, area: b.area, amount: Number(b.amount), id: b.id };
          })
        );
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchRouletteConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => {});
    fetchRouletteHistory(60)
      .then((h) => mountedRef.current && setHistory(h))
      .catch(() => {});
    return () => {
      mountedRef.current = false;
      [toastTimer, winTimer, flashTimer, bannerTimer].forEach((t) => t.current && clearTimeout(t.current));
    };
  }, []);

  // Round polling: chained, and quicker around betting close / reveal / next round.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;
    let first = true;
    const loop = async () => {
      let delay = 800;
      try {
        const sentAt = Date.now();
        const v = await fetchRouletteCurrent();
        const receivedAt = Date.now();
        if (!alive) return;
        const measured = new Date(v.serverTime).getTime() - (sentAt + receivedAt) / 2;
        offsetRef.current = first ? measured : offsetRef.current * 0.7 + measured * 0.3;
        setView(v);
        const now = Date.now() + offsetRef.current;
        const nextEdge = Math.min(...[v.betEndTime, v.resultTime, v.endTime].map((t) => new Date(t).getTime()).filter((t) => t > now));
        if (Number.isFinite(nextEdge) && nextEdge - now < 1200) delay = 200;
        if (first) {
          first = false;
          periodRef.current = v.periodNumber;
          syncMyRound();
        }
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
  }, [syncMyRound]);

  // New round: last round's chips become the REPEAT set.
  useEffect(() => {
    if (!view) return;
    if (periodRef.current !== null && periodRef.current !== view.periodNumber) {
      const placed = chipsRef.current.filter((c) => c.id);
      if (placed.length > 0) lastRoundRef.current = placed.map((c) => ({ area: c.area, amount: c.amount }));
      setChips([]);
      idMapRef.current.clear();
      setWin(null);
      showBanner('PLACE YOUR BETS');
    }
    periodRef.current = view.periodNumber;
  }, [view, showBanner]);

  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 150);
    return () => clearInterval(id);
  }, []);

  // ---- phase ----
  const srvNow = Date.now() + offsetRef.current;
  const betEndMs = view ? new Date(view.betEndTime).getTime() : 0;
  const landMs = view ? new Date(view.resultTime).getTime() + LAND_MS : 0;
  const bettingOpen = !!view && srvNow < betEndMs;
  const spinning = !!view && !bettingOpen && srvNow < landMs;
  const result = view && view.phase === 'RESULT' ? view.result : null;
  const landed = !!view && !bettingOpen && !spinning && result !== null;
  const focusOn = !!view && !bettingOpen && srvNow < landMs + FOCUS_HOLD_MS;
  const boardResult = landed ? result : null;
  const prevResult = history[0]?.result ?? null;

  const wheelMode: WheelMode = spinning
    ? { kind: 'spin', key: view!.periodNumber, landLocal: landMs - offsetRef.current, result }
    : { kind: 'rest', number: landed ? result : prevResult };

  // "No more bets" once, at the close.
  const closedFor = view && !bettingOpen ? view.periodNumber : null;
  useEffect(() => {
    if (closedFor && srvNow < landMs - 2000) showBanner('NO MORE BETS');
    // Once per round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closedFor]);

  useEffect(() => {
    Animated.timing(focus, { toValue: focusOn ? 1 : 0, duration: 650, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start();
  }, [focusOn, focus]);

  useEffect(() => {
    if (!landed) return;
    badgePop.setValue(0);
    Animated.spring(badgePop, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
  }, [landed, badgePop]);

  useEffect(() => {
    if (boardResult === null) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 480, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.3, duration: 480, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [boardResult, glow]);

  // Reveal: history once the ball lands, then this player's winnings.
  useEffect(() => {
    if (!view || view.phase !== 'RESULT' || view.result === null || resultHandledRef.current === view.periodNumber) return;
    const period = view.periodNumber;
    resultHandledRef.current = period;
    const entry: RouletteHistoryEntry = { periodNumber: period, result: view.result, color: view.color ?? colorOf(view.result), serverSeed: view.serverSeed ?? '', serverSeedHash: view.serverSeedHash };
    const land = new Date(view.resultTime).getTime() + LAND_MS;
    const wait = (at: number) => Math.max(0, at - (Date.now() + offsetRef.current));
    setTimeout(() => mountedRef.current && setHistory((h) => (h[0]?.periodNumber === period ? h : [entry, ...h].slice(0, 60))), wait(land + 200));
    if (chipsRef.current.length > 0) {
      enqueue(async () => {
        try {
          const res = await fetchRouletteMyRound(period);
          const won = round2(res.bets.reduce((sum, b) => sum + Number(b.payout), 0));
          if (winTimer.current) clearTimeout(winTimer.current);
          winTimer.current = setTimeout(() => {
            if (!mountedRef.current) return;
            setLastWin(won);
            if (won > 0) {
              setWin(won);
              winPop.setValue(0);
              Animated.spring(winPop, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }).start();
            }
          }, wait(land + FOCUS_HOLD_MS + 300));
        } catch {
          // Winnings still land in the wallet; only the popup is skipped.
        }
        refreshWallet();
      });
    }
  }, [view, enqueue, refreshWallet, winPop]);

  useEffect(() => {
    if (win === null) return;
    const id = setTimeout(() => setWin(null), WIN_CARD_MS);
    return () => clearTimeout(id);
  }, [win]);

  // ---- bets ----
  const spotTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of chips) m.set(c.area, round2((m.get(c.area) ?? 0) + c.amount));
    return m;
  }, [chips]);
  const myTotal = useMemo(() => round2(chips.reduce((s, c) => s + c.amount, 0)), [chips]);
  const unconfirmed = useMemo(() => round2(chips.filter((c) => !c.id).reduce((s, c) => s + c.amount, 0)), [chips]);
  const displayBalance = Math.max(0, round2(coins - unconfirmed));

  const live = useRef({ bettingOpen, displayBalance, spotTotals, maxStake, maxPayout, multFor, chip });
  live.current = { bettingOpen, displayBalance, spotTotals, maxStake, maxPayout, multFor, chip };

  const flashNumbers = useCallback((nums: number[]) => {
    setFlash({ nums, id: Date.now() });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => mountedRef.current && setFlash(null), 450);
  }, []);

  const placeChips = useCallback(
    (entries: { area: string; amount: number }[]) => {
      const L = live.current;
      if (entries.length === 0) return;
      if (!L.bettingOpen) return showToast('No more bets — wait for the next spin');
      const cost = round2(entries.reduce((s, e) => s + e.amount, 0));
      if (cost > L.displayBalance) return showToast('Insufficient balance');
      const totals = new Map(L.spotTotals);
      for (const e of entries) {
        const t = round2((totals.get(e.area) ?? 0) + e.amount);
        totals.set(e.area, t);
        if (t > L.maxStake) return showToast(`Max ₹${L.maxStake} on one spot`);
        if (t * L.multFor(e.area) > L.maxPayout) return showToast(`Max ₹${Math.floor(L.maxPayout / L.multFor(e.area))} on this spot (max win ₹${L.maxPayout})`);
      }
      const added: PlacedChip[] = entries.map((e) => ({ key: keyRef.current++, area: e.area, amount: e.amount }));
      const keys = new Set(added.map((c) => c.key));
      setChips((prev) => [...prev, ...added]);
      enqueue(async () => {
        try {
          const res = await placeRouletteBets(entries);
          res.bets.forEach((b, i) => idMapRef.current.set(added[i].key, b.id));
          if (mountedRef.current) setChips((prev) => prev.map((c) => (keys.has(c.key) ? { ...c, id: idMapRef.current.get(c.key) } : c)));
          refreshWallet();
        } catch (err) {
          if (mountedRef.current) {
            setChips((prev) => prev.filter((c) => !keys.has(c.key)));
            showToast(errorMessage(err));
          }
        }
      });
    },
    [enqueue, refreshWallet, showToast]
  );

  const betOn = useCallback(
    (area: string) => {
      if (!SPOTS.has(area)) return;
      flashNumbers(SPOTS.get(area)!);
      placeChips([{ area, amount: live.current.chip }]);
    },
    [placeChips, flashNumbers]
  );

  const undo = () => {
    const last = chips[chips.length - 1];
    if (!last) return;
    if (!bettingOpen) return showToast('No more bets');
    setChips((prev) => prev.slice(0, -1));
    enqueue(async () => {
      const id = idMapRef.current.get(last.key);
      if (!id) return;
      try {
        await cancelRouletteBets([id]);
        refreshWallet();
      } catch (err) {
        if (mountedRef.current) {
          showToast(errorMessage(err));
          syncMyRound();
        }
      }
    });
  };

  const clearAll = () => {
    if (chips.length === 0) return;
    if (!bettingOpen) return showToast('No more bets');
    setChips([]);
    enqueue(async () => {
      try {
        await cancelRouletteBets();
        refreshWallet();
      } catch (err) {
        if (mountedRef.current) {
          showToast(errorMessage(err));
          syncMyRound();
        }
      }
    });
  };

  const group = (list: { area: string; amount: number }[]) => {
    const m = new Map<string, number>();
    for (const c of list) m.set(c.area, round2((m.get(c.area) ?? 0) + c.amount));
    return [...m.entries()].map(([area, amount]) => ({ area, amount }));
  };
  const repeat = () => {
    if (lastRoundRef.current.length === 0) return showToast('No bets from the last round');
    placeChips(group(lastRoundRef.current));
  };
  const double = () => {
    if (chips.length === 0) return showToast('Place a bet first');
    placeChips(group(chips));
  };

  // ---- layout ----
  const padL = Math.max(insets.left, 10);
  const padR = Math.max(insets.right, 10);
  const topH = 42;
  const bottomH = 60 + Math.max(insets.bottom, 4);
  const midTop = topH;
  const midH = H - topH - bottomH;
  const wheelS = Math.min(midH - 8, W * 0.34);
  const wcx = padL + wheelS / 2;
  const wcy = midTop + midH / 2;
  const Z = Math.min(H * 0.94, W * 0.52);
  const zoomCx = W * 0.4;
  const stripH = 28;
  const boardLeft = padL + wheelS + 14;
  const boardAvailW = W - boardLeft - padR;
  const boardAvailH = midH - stripH - 10;
  const cw = Math.min(boardAvailW / 14, (boardAvailH / 4.44) * 0.9);
  const ch = Math.min(cw * 1.35, (boardAvailH / 4.44) * 1.0, boardAvailH / (3 + 2 * 0.72));
  const dh = ch * 0.72;
  const geom = useMemo(() => boardGeom(cw, ch, dh), [cw, ch, dh]);
  const boardTop = midTop + stripH + 6 + Math.max(0, (boardAvailH - geom.height) / 2);
  const chipOnBoard = Math.min(cw, ch) * 0.7;
  const railChip = Math.min(44, bottomH - 16);
  const secsLeft = Math.max(0, Math.ceil((betEndMs - srvNow) / 1000));
  const betTotalMs = view ? Math.max(1, betEndMs - new Date(view.startTime).getTime()) : 1;
  const betFrac = bettingOpen ? Math.max(0, Math.min(1, (betEndMs - srvNow) / betTotalMs)) : 0;

  const stats = useMemo(() => {
    const n = history.length;
    if (!n) return null;
    const red = history.filter((h) => h.color === 'RED').length;
    const zero = history.filter((h) => h.color === 'GREEN').length;
    return { red: Math.round((red / n) * 100), black: Math.round(((n - red - zero) / n) * 100), zero: Math.round((zero / n) * 100) };
  }, [history]);

  if (!landscape) {
    return (
      <View style={[styles.root, styles.rotating]}>
        <MaterialCommunityIcons name="phone-rotate-landscape" size={48} color={GOLD} />
        <Text style={styles.rotatingText}>Turning to landscape…</Text>
      </View>
    );
  }

  const spotState = (key: string): 'normal' | 'win' | 'lose' => (boardResult === null ? 'normal' : SPOTS.get(key)!.includes(boardResult) ? 'win' : 'lose');
  const status = bettingOpen ? 'PLACE YOUR BETS' : spinning ? 'NO MORE BETS' : result !== null ? `${result} ${colorOf(result)}` : 'SPINNING';
  const outsideKeys = ['DZ1', 'DZ2', 'DZ3', 'COL1', 'COL2', 'COL3', ...EVEN_ROW];
  const highlightNums = flash?.nums ?? [];

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#07140E', '#0B2A1B', '#051009']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />

      {/* Top bar */}
      <View style={[styles.topBar, { height: topH, paddingLeft: padL, paddingRight: padR }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={26} color="#FFFFFF" />
          <View>
            <Text style={styles.title}>ROULETTE</Text>
            <Text style={styles.subtitle}>EUROPEAN · SINGLE ZERO</Text>
          </View>
        </Pressable>
        <View style={[styles.statusPill, bettingOpen && secsLeft <= 5 && { borderColor: '#FF5A4E' }]}>
          {bettingOpen && (
            <Svg width={22} height={22}>
              <Circle cx={11} cy={11} r={9} stroke="rgba(255,255,255,0.15)" strokeWidth={3} fill="none" />
              <Circle
                cx={11}
                cy={11}
                r={9}
                stroke={secsLeft <= 5 ? '#FF5A4E' : GOLD}
                strokeWidth={3}
                fill="none"
                strokeDasharray={`${2 * Math.PI * 9} ${2 * Math.PI * 9}`}
                strokeDashoffset={2 * Math.PI * 9 * (1 - betFrac)}
                strokeLinecap="round"
                rotation={-90}
                origin="11, 11"
              />
            </Svg>
          )}
          <Text style={styles.statusText} numberOfLines={1}>
            {status}
            {bettingOpen ? `  ${secsLeft}s` : ''}
          </Text>
        </View>
        <View style={styles.topRight}>
          <Text style={styles.periodText}>#{view?.periodNumber.slice(-5) ?? '-----'}</Text>
          <View style={styles.balancePill}>
            <MaterialCommunityIcons name="wallet" size={14} color={GOLD} />
            <Text style={styles.balanceText}>₹{displayBalance.toFixed(2)}</Text>
          </View>
          <Pressable onPress={() => navigation.navigate('Deposit')} style={styles.depositBtn}>
            <MaterialCommunityIcons name="plus" size={18} color="#1A1200" />
          </Pressable>
        </View>
      </View>

      {/* Results strip */}
      <View style={[styles.strip, { left: boardLeft, top: midTop + 2, width: boardAvailW, height: stripH }]}>
        <View style={styles.stripNums}>
          {history.slice(0, 16).map((h, i) => (
            <View
              key={h.periodNumber}
              style={[
                styles.stripNum,
                { backgroundColor: POCKET_FILL[h.color] },
                i === 0 && styles.stripNumFirst,
              ]}
            >
              <Text style={[styles.stripNumText, i === 0 && { fontSize: 13 }]}>{h.result}</Text>
            </View>
          ))}
          {history.length === 0 && <Text style={styles.stripEmpty}>Results will show here</Text>}
        </View>
        {stats && (
          <View style={styles.statBar}>
            <View style={{ flex: Math.max(stats.red, 1), backgroundColor: POCKET_FILL.RED }} />
            <View style={{ flex: Math.max(stats.zero, 1), backgroundColor: POCKET_FILL.GREEN }} />
            <View style={{ flex: Math.max(stats.black, 1), backgroundColor: '#3A3A3A' }} />
          </View>
        )}
      </View>

      {/* Board */}
      <View style={[styles.boardFrame, { left: boardLeft - 6, top: boardTop - 6, width: geom.width + 12, height: geom.height + 12 }]}>
        <LinearGradient colors={['#0F6A3B', '#0A4C2A', '#07351D']} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 12 }]} />
      </View>
      <View style={{ position: 'absolute', left: boardLeft, top: boardTop, width: geom.width, height: geom.height }}>
        <BoardArt cw={cw} ch={ch} dh={dh} />

        {/* Numbers lit by a placement or the result */}
        {highlightNums.map((n) => {
          const c = geom.cell(n);
          return <View key={`h${n}-${flash?.id}`} pointerEvents="none" style={[styles.cellFlash, { left: c.x + 2, top: c.y + 2, width: c.w - 4, height: c.h - 4 }]} />;
        })}
        {flash &&
          outsideKeys
            .filter((k) => SPOTS.get(k)!.length === flash.nums.length && SPOTS.get(k)!.every((n, i) => n === flash.nums[i]))
            .map((k) => {
              const r = outsideRect(geom, k)!;
              return <View key={`o${k}`} pointerEvents="none" style={[styles.cellFlash, { left: r.x + 2, top: r.y + 2, width: r.w - 4, height: r.h - 4 }]} />;
            })}
        {boardResult !== null &&
          (() => {
            const c = geom.cell(boardResult);
            return (
              <Animated.View pointerEvents="none" style={[styles.cellWin, { left: c.x + 1, top: c.y + 1, width: c.w - 2, height: c.h - 2, opacity: glow }]} />
            );
          })()}

        {/* Inside bets: one touch surface resolves cell / line / corner */}
        <View
          style={{ position: 'absolute', left: 0, top: 0, width: 13 * cw, height: 3 * ch + ch * 0.2 }}
          onStartShouldSetResponder={() => true}
          onResponderRelease={(e: GestureResponderEvent) => betOn(geom.resolve(e.nativeEvent.locationX, Math.min(e.nativeEvent.locationY, 3 * ch)))}
        />
        {/* Outside bets */}
        {outsideKeys.map((k) => {
          const r = outsideRect(geom, k)!;
          const isCol = k.startsWith('COL');
          return (
            <Pressable
              key={k}
              onPress={() => betOn(k)}
              style={{ position: 'absolute', left: r.x, top: isCol ? r.y : r.y + (k.startsWith('DZ') ? ch * 0.2 : 0), width: r.w, height: isCol ? r.h : r.h - (k.startsWith('DZ') ? ch * 0.2 : 0) }}
            />
          );
        })}

        {/* Chips */}
        {[...spotTotals.entries()].map(([k, amt]) => {
          const p = geom.center(k);
          return (
            <View key={k} pointerEvents="none" style={{ position: 'absolute', left: p.x - chipOnBoard / 2, top: p.y - chipOnBoard / 2 }}>
              <ChipStack amount={amt} size={chipOnBoard} state={spotState(k)} glow={glow} />
            </View>
          );
        })}

        {/* The dolly on the winning number */}
        {boardResult !== null &&
          (() => {
            const c = geom.cell(boardResult);
            // Off to the cell's corner so a winning chip underneath stays visible.
            const d = Math.min(cw, ch) * 0.42;
            return (
              <Animated.View
                pointerEvents="none"
                style={{ position: 'absolute', left: c.x + c.w * 0.74 - d / 2, top: c.y + (boardResult === 0 ? c.h * 0.3 : c.h * 0.26) - d / 2, transform: [{ scale: badgePop }] }}
              >
                <Svg width={d} height={d}>
                  <Defs>
                    <RadialGradient id="rdDolly" cx="35%" cy="30%" r="70%">
                      <Stop offset="0" stopColor="#FFFFFF" />
                      <Stop offset="0.6" stopColor="#F4E3B0" />
                      <Stop offset="1" stopColor="#B08A2E" />
                    </RadialGradient>
                  </Defs>
                  <Circle cx={d / 2} cy={d / 2} r={d / 2 - 1} fill="url(#rdDolly)" stroke="#7A5A10" strokeWidth={1} />
                  <Circle cx={d / 2} cy={d / 2} r={d * 0.2} fill={POCKET_FILL[colorOf(boardResult)]} />
                </Svg>
              </Animated.View>
            );
          })()}
      </View>

      {/* Bottom rail */}
      <View style={[styles.bottom, { height: bottomH, paddingLeft: padL, paddingRight: padR, paddingBottom: Math.max(insets.bottom, 4) }]}>
        <View style={styles.infoBox}>
          <Text style={styles.infoLabel}>TOTAL BET</Text>
          <Text style={styles.infoValue}>₹{myTotal.toFixed(2)}</Text>
          <Text style={styles.infoSub} numberOfLines={1}>
            {lastWin > 0 ? `Last win ₹${lastWin.toFixed(2)}` : `₹${minStake}–₹${maxStake} per spot`}
          </Text>
        </View>
        <View style={styles.chipRail}>
          {CHIP_VALUES.map((v) => {
            const allowed = v >= minStake && v <= maxStake;
            const on = v === chip;
            return (
              <Pressable key={v} disabled={!allowed} onPress={() => setChip(v)} style={[styles.chipBtn, on && styles.chipBtnOn, !allowed && { opacity: 0.35 }]}>
                <ChipArt value={v} size={railChip} />
              </Pressable>
            );
          })}
        </View>
        <View style={styles.actions}>
          {(
            [
              { label: 'UNDO', icon: 'undo-variant', color: '#F2E6FF', onPress: undo },
              { label: 'DOUBLE', icon: 'chevron-double-up', color: GOLD, onPress: double },
              { label: 'REPEAT', icon: 'repeat', color: '#F2E6FF', onPress: repeat },
              { label: 'CLEAR', icon: 'close-thick', color: '#FF6B6B', onPress: clearAll },
            ] as const
          ).map((a) => (
            <Pressable key={a.label} onPress={a.onPress} style={({ pressed }) => [styles.actBtn, pressed && { opacity: 0.65 }]}>
              <MaterialCommunityIcons name={a.icon} size={17} color={a.color} />
              <Text style={styles.actText}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Wheel: sits at the left while betting, comes forward for the spin */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.72)', opacity: focus }]} />
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: wcx - Z / 2,
          top: wcy - Z / 2,
          width: Z,
          height: Z,
          transform: [
            { translateX: focus.interpolate({ inputRange: [0, 1], outputRange: [0, zoomCx - wcx] }) },
            { translateY: focus.interpolate({ inputRange: [0, 1], outputRange: [0, H / 2 - wcy] }) },
            { scale: focus.interpolate({ inputRange: [0, 1], outputRange: [wheelS / Z, 1] }) },
          ],
        }}
      >
        <WheelStage z={Z} mode={wheelMode} />
      </Animated.View>

      {/* Winning number next to the big wheel */}
      {landed && focusOn && result !== null && (
        <Animated.View
          pointerEvents="none"
          style={[styles.resultBadgeWrap, { left: zoomCx + Z / 2 + 18, top: H / 2 - 80, transform: [{ scale: badgePop }], opacity: badgePop }]}
        >
          <View style={[styles.resultBadge, { backgroundColor: POCKET_FILL[colorOf(result)] }]}>
            <Text style={styles.resultNum}>{result}</Text>
          </View>
          <Text style={styles.resultLabel}>{colorOf(result)}</Text>
          {result !== 0 && (
            <Text style={styles.resultSub}>
              {result % 2 ? 'ODD' : 'EVEN'} · {result <= 18 ? '1-18' : '19-36'}
            </Text>
          )}
        </Animated.View>
      )}

      {/* Banner across the board */}
      {banner && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.banner,
            {
              // Over the board while betting; beside the big wheel once it comes forward.
              left: banner === 'PLACE YOUR BETS' ? boardLeft : zoomCx + Z / 2,
              width: banner === 'PLACE YOUR BETS' ? boardAvailW : Math.max(160, W - padR - (zoomCx + Z / 2)),
              top: banner === 'PLACE YOUR BETS' ? boardTop + geom.height * 0.28 : H / 2 - 30,
              opacity: bannerAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }),
              transform: [{ scale: bannerAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [0.7, 1, 1.08] }) }],
            },
          ]}
        >
          <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.8)', 'rgba(0,0,0,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.bannerInner}>
            <Text style={styles.bannerText}>{banner}</Text>
          </LinearGradient>
        </Animated.View>
      )}

      {/* Win: over the resting wheel, so the board stays readable */}
      {win !== null && (
        <View pointerEvents="none" style={[styles.winWrap, { left: padL, width: wheelS, top: wcy - 36 }]}>
          <Animated.View style={[styles.winCard, { transform: [{ scale: winPop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }]}>
            <LinearGradient colors={['#FFE9A3', '#D39A1C', '#A8700A']} style={[StyleSheet.absoluteFill, { borderRadius: 18 }]} />
            <MaterialCommunityIcons name="trophy" size={32} color="#4A2A00" />
            <View>
              <Text style={styles.winTitle}>YOU WIN</Text>
              <Text style={styles.winAmount}>₹{win.toFixed(2)}</Text>
            </View>
          </Animated.View>
        </View>
      )}

      {toast && (
        <View pointerEvents="none" style={[styles.toast, { bottom: bottomH + 10 }]}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#061009' },
  rotating: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  rotatingText: { color: '#FFFFFF', fontWeight: '700' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: 'rgba(233,196,106,0.25)' },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  title: { color: GOLD, fontSize: 17, fontWeight: '900', letterSpacing: 3 },
  subtitle: { color: 'rgba(255,255,255,0.55)', fontSize: 8, fontWeight: '700', letterSpacing: 1.5, marginTop: -2 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(233,196,106,0.55)',
  },
  statusText: { color: '#FFFFFF', fontWeight: '900', fontSize: 12, letterSpacing: 1.5 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  periodText: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '700' },
  balancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(233,196,106,0.35)',
  },
  balanceText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  depositBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' },
  strip: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 8 },
  stripNums: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, overflow: 'hidden' },
  stripNum: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  stripNumFirst: { minWidth: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: GOLD },
  stripNumText: { color: '#FFFFFF', fontWeight: '900', fontSize: 11 },
  stripEmpty: { color: 'rgba(255,255,255,0.4)', fontSize: 11 },
  statBar: { width: 70, height: 6, borderRadius: 3, overflow: 'hidden', flexDirection: 'row' },
  boardFrame: { position: 'absolute', borderRadius: 12, borderWidth: 2, borderColor: '#C9A24A', overflow: 'hidden' },
  cellFlash: { position: 'absolute', borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.35)', borderWidth: 1.5, borderColor: '#FFF3C4' },
  cellWin: { position: 'absolute', borderRadius: 5, borderWidth: 3, borderColor: '#FFE08A', backgroundColor: 'rgba(255,224,138,0.25)' },
  chipWinRing: { position: 'absolute', left: -4, top: -4, right: -4, bottom: -4, borderWidth: 2.5, borderColor: '#FFE08A' },
  banner: { position: 'absolute', alignItems: 'center' },
  bannerInner: { width: '100%', alignItems: 'center', paddingVertical: 10 },
  bannerText: { color: GOLD, fontSize: 21, fontWeight: '900', letterSpacing: 4, textShadowColor: '#000', textShadowRadius: 6 },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(233,196,106,0.25)',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  infoBox: { width: 130 },
  infoLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  infoValue: { color: GOLD, fontSize: 17, fontWeight: '900' },
  infoSub: { color: 'rgba(255,255,255,0.45)', fontSize: 9, fontWeight: '600' },
  chipRail: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipBtn: { padding: 2, borderRadius: 30, borderWidth: 2, borderColor: 'transparent' },
  chipBtnOn: { borderColor: GOLD, transform: [{ translateY: -4 }, { scale: 1.08 }] },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 52,
    height: 40,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(233,196,106,0.3)',
  },
  actText: { color: '#F2E6FF', fontSize: 8, fontWeight: '800', marginTop: 1, letterSpacing: 0.5 },
  resultBadgeWrap: { position: 'absolute', alignItems: 'center', width: 130 },
  resultBadge: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: GOLD },
  resultNum: { color: '#FFFFFF', fontSize: 50, fontWeight: '900' },
  resultLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '900', letterSpacing: 4, marginTop: 8 },
  resultSub: { color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: '800', letterSpacing: 2, marginTop: 2 },
  winWrap: { position: 'absolute', alignItems: 'center', zIndex: 1000, elevation: 30 },
  winCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 18, borderWidth: 3, borderColor: '#FFF3C4', overflow: 'hidden' },
  winTitle: { color: '#4A2A00', fontWeight: '900', fontSize: 13, letterSpacing: 4 },
  winAmount: { color: '#2E1A00', fontWeight: '900', fontSize: 28 },
  toast: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 1001, elevation: 31 },
  toastText: { color: '#FFFFFF', backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, overflow: 'hidden', fontWeight: '700' },
});
