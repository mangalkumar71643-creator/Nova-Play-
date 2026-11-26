import React, { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { Animated, Image, ImageSourcePropType, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import type { RingKey } from '../../api/backend';

/*
 * The reel in the middle of the Ring Gauntlet wheel, like the one in Vortex's well: the sentinels of the three rings and the cracked one
 * fall through the middle while a segment is tried (they come in at the top and slide out at the bottom, under the window's shaded
 * edge), and it slows down onto the answer: the sentinel of the ring in play (the segment is survived) or the cracked one (it is
 * failed). Only the reel's position moves, on the native animation driver, so it stays smooth whatever the rest of the screen does.
 */

export type ReelSymbol = RingKey | 'LOST';

export type RingReelHandle = {
  /** Sets the reel running: it speeds up evenly and keeps going until `land`. */
  start: (fast: boolean) => void;
  /** Runs on at the same speed and slows down onto `symbol` (with a small swing past it); resolves once it has settled. */
  land: (symbol: ReelSymbol) => Promise<void>;
  /** Shows `symbol` in the middle at once (no spin). */
  set: (symbol: ReelSymbol) => void;
};

/** The symbols on the reel, top to bottom. They fall (as in Vortex), so the one above the middle comes next. */
const REEL: ReelSymbol[] = ['OUTER', 'LOST', 'MIDDLE', 'INNER'];
const REEL_LEN = REEL.length;
/** Spinning speed, in symbols a second. */
const SPEED = { normal: 8, fast: 12 };
/** How long it takes to get up to speed. */
const ACCEL_MS = 160;
/** How far (in symbols) it slides while slowing down, and how far it swings past the middle before settling. */
const STOP = { normal: 1.6, fast: 1.2 };
const BACK = 0.6;
/** The longest a spin runs while waiting for the server. */
const SPIN_MS = 30000;

/** Where the reel rests (mod REEL_LEN) with `symbol` in the middle (at 0 the item REEL_LEN + 1 is in the middle; see translateY). */
function restFor(symbol: ReelSymbol): number {
  const at = Math.max(0, REEL.indexOf(symbol));
  return (((REEL_LEN + 1 - at) % REEL_LEN) + REEL_LEN) % REEL_LEN;
}

function nextRest(rest: number, atLeast: number): number {
  return rest + REEL_LEN * Math.ceil((atLeast - rest) / REEL_LEN - 1e-9);
}

/** How far the reel has gone `ms` after a spin starts from rest: speeding up evenly, then at `speed`. */
function spinDistance(ms: number, speed: number): number {
  if (ms <= ACCEL_MS) return (speed * ms * ms) / (2000 * ACCEL_MS);
  return (speed * ACCEL_MS) / 2000 + (speed * (ms - ACCEL_MS)) / 1000;
}

/** Ease-out with a small swing past the end. */
function easeOutBack(k: number, back: number): number {
  const x = k - 1;
  return 1 + (back + 1) * x * x * x + back * x * x;
}

type Props = {
  /** Width and height of the round window in the middle of the wheel, in pixels. */
  size: number;
  pictures: Record<ReelSymbol, ImageSourcePropType>;
  /** The symbol shown before anything spins. */
  initial: ReelSymbol;
};

const RingReel = forwardRef<RingReelHandle, Props>(function RingReel({ size, pictures, initial }, ref) {
  const pitch = size * 0.86;
  const pic = size * 0.9;
  const start0 = restFor(initial);
  const pos = useRef(new Animated.Value(start0)).current;
  const resting = useRef(start0);
  const spinning = useRef<{ from: number; at: number; speed: number } | null>(null);
  const anim = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => () => anim.current?.stop(), []);

  useImperativeHandle(
    ref,
    () => ({
      start: (fast) => {
        anim.current?.stop();
        const speed = fast ? SPEED.fast : SPEED.normal;
        const from = resting.current;
        const distance = spinDistance(SPIN_MS, speed);
        spinning.current = { from, at: Date.now(), speed };
        anim.current = Animated.timing(pos, {
          toValue: from + distance,
          duration: SPIN_MS,
          easing: (u) => spinDistance(u * SPIN_MS, speed) / distance,
          useNativeDriver: true,
        });
        anim.current.start();
      },
      land: (symbol) =>
        new Promise<void>((resolve) => {
          const run = spinning.current;
          spinning.current = null;
          // Where the reel is now, from the clock the spin runs on (the last drawn value can be a frame old and would make it hitch).
          pos.stopAnimation();
          const elapsed = run ? Math.min(SPIN_MS, Date.now() - run.at) : 0;
          const from = run ? run.from + spinDistance(elapsed, run.speed) : resting.current;
          const top = run?.speed ?? SPEED.normal;
          const speed = Math.max(top * 0.45, elapsed >= ACCEL_MS ? top : (top * elapsed) / ACCEL_MS);
          const stop = top >= SPEED.fast ? STOP.fast : STOP.normal;
          const target = nextRest(restFor(symbol), from + stop);
          const cruise = Math.max(0, target - stop - from);
          const cruiseMs = (cruise / speed) * 1000;
          const stopMs = (((BACK + 3) * stop) / speed) * 1000;
          const total = cruiseMs + stopMs;
          const span = Math.max(1e-6, target - from);
          pos.setValue(from);
          anim.current = Animated.timing(pos, {
            toValue: target,
            duration: total,
            easing: (u) => {
              const t = u * total;
              if (t <= cruiseMs) return (speed * t) / 1000 / span;
              return (cruise + stop * easeOutBack((t - cruiseMs) / stopMs, BACK)) / span;
            },
            useNativeDriver: true,
          });
          anim.current.start(({ finished }) => {
            const rest = ((target % REEL_LEN) + REEL_LEN) % REEL_LEN;
            resting.current = rest;
            // The same picture (the reel repeats every REEL_LEN symbols), a smaller number.
            if (finished) pos.setValue(rest);
            resolve();
          });
        }),
      set: (symbol) => {
        anim.current?.stop();
        spinning.current = null;
        resting.current = restFor(symbol);
        pos.setValue(resting.current);
      },
    }),
    [pos]
  );

  // The reel falls: as the position grows the strip moves down. It repeats every REEL_LEN symbols, so the position is taken
  // mod REEL_LEN; at 0 the item REEL_LEN + 1 is in the middle, and the items drawn cover the ones above and below it all the way round.
  const translateY = useMemo(() => {
    const base = size / 2 - (REEL_LEN + 1.5) * pitch;
    return Animated.modulo(pos, REEL_LEN).interpolate({ inputRange: [0, REEL_LEN], outputRange: [base, base + REEL_LEN * pitch] });
  }, [pos, size, pitch]);
  const items = useMemo(() => Array.from({ length: REEL_LEN + 3 }, (_, k) => REEL[k % REEL_LEN]), []);

  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }} testID="rg-reel">
      <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: size, transform: [{ translateY }] }}>
        {items.map((symbol, k) => (
          <View key={k} style={{ height: pitch, alignItems: 'center', justifyContent: 'center' }}>
            <Image source={pictures[symbol]} style={{ width: pic, height: pic }} resizeMode="contain" fadeDuration={0} />
          </View>
        ))}
      </Animated.View>
      {/* the window's edge, over the reel: the sentinels slide in and out under it */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id="rgReelShade" cx="50%" cy="50%" r="50%">
              <Stop offset="0.74" stopColor="#07080B" stopOpacity={0} />
              <Stop offset="0.92" stopColor="#07080B" stopOpacity={0.6} />
              <Stop offset="1" stopColor="#07080B" stopOpacity={0.92} />
            </RadialGradient>
          </Defs>
          <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#rgReelShade)" />
        </Svg>
      </View>
    </View>
  );
});

export default memo(RingReel);
