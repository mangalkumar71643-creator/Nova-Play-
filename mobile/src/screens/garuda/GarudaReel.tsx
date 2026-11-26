import React, { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, ImageSourcePropType, StyleSheet, View } from 'react-native';

/*
 * One reel of Garuda Gold: the symbols in sight, a strip of fillers that falls through while it spins, a landing that carries on at the
 * same speed and settles with a small swing past its stop, like a real reel, and (for the multiplier reel) a NUDGE: the reel steps on,
 * coin by coin, to the coin the server drew. Reels 1-3 show three tiles each; the multiplier reel shows five coins (the middle one
 * counts).
 *
 * Built like Vortex's and Ring Gauntlet's reels so it runs smoothly on phones:
 *  - The cells are mounted once, with the reel. A spin never adds or removes a picture (the reel used to mount some 70 pictures at
 *    every spin and drop them again while landing, which made phones skip frames just as the reels moved).
 *  - Only the strip's position moves, on the native animation driver, wrapped round the strip (Animated.modulo).
 *  - The speed is the same from the moment it is up to speed until it slows down onto its stop (the landing used to start at twice the
 *    spinning speed), and it is slow enough to see the symbols go by (they used to jump two thirds of a tile a frame).
 *  - The symbols it lands on are written into cells that are still out of sight above the window, so nothing in sight ever changes.
 */

export type Img = ImageSourcePropType | null;
export type ReelHandle = {
  start: () => void;
  land: (rows: string[], delay: number) => Promise<void>;
  /** Steps the reel on through `path` (top to bottom, the coins that pass) until `rows` is in sight. */
  nudge: (rows: string[], path: string[], stepMs: number) => Promise<void>;
  set: (rows: string[]) => void;
};

/** How long it takes to get up to speed. */
const ACCEL_MS = 180;
/** How far (in rows) it slides while slowing down, and how far past its stop it swings before settling. */
const STOP_ROWS = 1.3;
const BACK = 1.6;
/** The longest a spin runs while waiting for the server. */
const SPIN_MS = 30000;

const Cell = memo(function Cell({ img, w, h, dim, glow }: { img: Img; w: number; h: number; dim: boolean; glow: boolean }) {
  if (!img) return <View style={{ width: w, height: h }} />;
  return (
    <View style={{ width: w, height: h, opacity: dim ? 0.38 : 1, transform: [{ scale: glow ? 1.06 : 1 }] }}>
      <Image source={img} style={styles.fill} resizeMode="stretch" fadeDuration={0} />
    </View>
  );
});

interface Props {
  /** How many symbols are in sight (3 for reels 1-3, 5 for the multiplier reel). */
  rows: number;
  initial: string[];
  /** The reel's width and the height of one row. */
  width: number;
  rowH: number;
  /** The picture's size in a row (it may be larger than the row, as the coins are). */
  imgW: number;
  imgH: number;
  images: Record<string, Img>;
  fillers: string[];
  dimmed: boolean[];
  glowing: boolean[];
  fast: boolean;
  /** Spinning speed in rows a second, normal and turbo. */
  speed: { normal: number; fast: number };
  testID?: string;
}

/** How far the reel has gone `ms` after a spin starts from rest: speeding up evenly, then at `speed` (rows a second). */
function spinDistance(ms: number, speed: number): number {
  if (ms <= ACCEL_MS) return (speed * ms * ms) / (2000 * ACCEL_MS);
  return (speed * ACCEL_MS) / 2000 + (speed * (ms - ACCEL_MS)) / 1000;
}

/** Ease-out with a swing past the end; it starts at (back + 3) x the average speed. */
function easeOutBack(k: number, back: number): number {
  const x = k - 1;
  return 1 + (back + 1) * x * x * x + back * x * x;
}

/** Cells in the strip: room for the window, the cells written ahead of it (a NUDGE writes up to 9 + 5) and a margin. */
function stripLength(rows: number): number {
  return rows >= 5 ? 22 : 12;
}

const GarudaReel = forwardRef(function GarudaReel(
  { rows, initial, width, rowH, imgW, imgH, images, fillers, dimmed, glowing, fast, speed, testID }: Props,
  ref: React.Ref<ReelHandle>
) {
  const S = stripLength(rows);
  // The strip: cell c shows strip[c]. At position p (in rows; it grows as the reel falls) the window shows cells (j - p) mod S, j = 0..rows-1.
  const [strip, setStrip] = useState<string[]>(() =>
    Array.from({ length: S }, (_, c) => (c < rows ? initial[c] : fillers[Math.floor(Math.random() * fillers.length)]))
  );
  const stripRef = useRef(strip);
  stripRef.current = strip;
  const pos = useRef(new Animated.Value(0)).current;
  /** The position it rests at (an integer, 0..S-1), and the spin in progress. */
  const resting = useRef(0);
  const spinning = useRef<{ from: number; at: number; speed: number } | null>(null);
  const anim = useRef<Animated.CompositeAnimation | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fastRef = useRef(fast);
  fastRef.current = fast;
  const speedRef = useRef(speed);
  speedRef.current = speed;

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      anim.current?.stop();
    },
    []
  );

  const cellAt = (p: number, j: number) => ((((j - p) % S) + S) % S);
  /** Writes `symbols` into cells (cell -> symbol) and returns once the strip holds them (cells out of sight only, or at rest). */
  const write = (cells: Map<number, string>) => {
    const next = stripRef.current.slice();
    cells.forEach((sym, c) => (next[c] = sym));
    stripRef.current = next;
    setStrip(next);
  };

  /** Runs on from where the reel is to rest at `target` (an integer position), at `speedNow` then slowing down; resolves once settled. */
  const runTo = (from: number, target: number, speedNow: number, stopRows: number, onDone: () => void) => {
    const cruise = Math.max(0, target - stopRows - from);
    const cruiseMs = (cruise / speedNow) * 1000;
    const stopMs = (((BACK + 3) * stopRows) / speedNow) * 1000;
    const total = cruiseMs + stopMs;
    const span = Math.max(1e-6, target - from);
    pos.setValue(from);
    anim.current = Animated.timing(pos, {
      toValue: target,
      duration: total,
      easing: (u) => {
        const t = u * total;
        if (t <= cruiseMs) return (speedNow * t) / 1000 / span;
        return (cruise + stopRows * easeOutBack((t - cruiseMs) / stopMs, BACK)) / span;
      },
      useNativeDriver: true,
    });
    anim.current.start(({ finished }) => {
      const rest = ((target % S) + S) % S;
      resting.current = rest;
      // the same picture (the strip repeats every S rows), a smaller number
      if (finished) pos.setValue(rest);
      onDone();
    });
  };

  useImperativeHandle(ref, () => ({
    start: () => {
      if (timer.current) clearTimeout(timer.current);
      anim.current?.stop();
      const v = fastRef.current ? speedRef.current.fast : speedRef.current.normal;
      const from = resting.current;
      const distance = spinDistance(SPIN_MS, v);
      spinning.current = { from, at: Date.now(), speed: v };
      pos.setValue(from);
      anim.current = Animated.timing(pos, {
        toValue: from + distance,
        duration: SPIN_MS,
        easing: (u) => spinDistance(u * SPIN_MS, v) / distance,
        useNativeDriver: true,
      });
      anim.current.start();
    },
    land: (target, delay) =>
      new Promise<void>((resolve) => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          timer.current = null;
          const run = spinning.current;
          spinning.current = null;
          // Where the reel is now, from the clock the spin runs on (the last value the app saw can be a frame old).
          pos.stopAnimation();
          const elapsed = run ? Math.min(SPIN_MS, Date.now() - run.at) : 0;
          const from = run ? run.from + spinDistance(elapsed, run.speed) : resting.current;
          const top = run?.speed ?? (fastRef.current ? speedRef.current.fast : speedRef.current.normal);
          const v = Math.max(top * 0.5, elapsed >= ACCEL_MS ? top : (top * elapsed) / ACCEL_MS);
          // The stop: far enough ahead that the cells it shows are still out of sight above the window now.
          const stopAt = Math.ceil(from + Math.max(rows + 1, STOP_ROWS) + 1e-9);
          const cells = new Map<number, string>();
          target.forEach((sym, j) => cells.set(cellAt(stopAt, j), sym));
          write(cells);
          runTo(from, stopAt, v, STOP_ROWS, resolve);
        }, delay);
      }),
    nudge: (target, path, stepMs) =>
      new Promise<void>((resolve) => {
        anim.current?.stop();
        spinning.current = null;
        const from = resting.current;
        // The reel moves down: what is in sight leaves at the bottom, the path passes (its last coin first), the target ends in sight.
        const steps = path.length + rows;
        const stopAt = from + steps;
        const cells = new Map<number, string>();
        path.forEach((sym, i) => cells.set(cellAt(from, -1 - (path.length - 1 - i)), sym));
        target.forEach((sym, j) => cells.set(cellAt(stopAt, j), sym));
        write(cells);
        pos.setValue(from);
        anim.current = Animated.timing(pos, {
          toValue: stopAt,
          duration: Math.max(300, stepMs * steps),
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        });
        anim.current.start(({ finished }) => {
          const rest = ((stopAt % S) + S) % S;
          resting.current = rest;
          if (finished) pos.setValue(rest);
          resolve();
        });
      }),
    set: (target) => {
      if (timer.current) clearTimeout(timer.current);
      anim.current?.stop();
      spinning.current = null;
      pos.setValue(resting.current);
      const cells = new Map<number, string>();
      target.forEach((sym, j) => cells.set(cellAt(resting.current, j), sym));
      write(cells);
    },
  }));

  // The strip falls: as the position grows it moves down. At position 0 (mod S) the window shows items S..S+rows-1; the items drawn
  // (S + rows of them, item k showing cell k mod S) cover the window wherever the strip is.
  const translateY = useMemo(
    () => Animated.modulo(pos, S).interpolate({ inputRange: [0, S], outputRange: [-S * rowH, 0] }),
    [pos, S, rowH]
  );
  // The cells in sight at rest, for the lights of a win (only lit once the reel has stopped: the screen clears them for a spin).
  const restTop = S - resting.current;
  const items = Array.from({ length: S + rows }, (_, k) => k);
  return (
    <View style={{ width, height: rowH * rows, overflow: 'hidden' }} testID={testID}>
      <Animated.View style={{ position: 'absolute', left: 0, top: 0, width, transform: [{ translateY }] }}>
        {items.map((k) => {
          const row = k - restTop;
          const lit = row >= 0 && row < rows;
          return (
            <View key={k} style={{ width, height: rowH, alignItems: 'center', justifyContent: 'center' }}>
              <Cell img={images[strip[k % S]] ?? null} w={imgW} h={imgH} dim={lit && !!dimmed[row]} glow={lit && !!glowing[row]} />
            </View>
          );
        })}
      </Animated.View>
    </View>
  );
});

/** Re-draws a reel only when what it shows changes (not when the screen counts a win up, for instance). */
function sameProps(a: Props, b: Props): boolean {
  const sameList = (x: boolean[], y: boolean[]) => x.length === y.length && x.every((v, i) => v === y[i]);
  return (
    a.rows === b.rows &&
    a.width === b.width &&
    a.rowH === b.rowH &&
    a.imgW === b.imgW &&
    a.imgH === b.imgH &&
    a.images === b.images &&
    a.fillers === b.fillers &&
    a.fast === b.fast &&
    a.speed.normal === b.speed.normal &&
    a.speed.fast === b.speed.fast &&
    a.testID === b.testID &&
    sameList(a.dimmed, b.dimmed) &&
    sameList(a.glowing, b.glowing)
  );
}

export default memo(GarudaReel, sameProps);

const styles = StyleSheet.create({
  fill: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' },
});
