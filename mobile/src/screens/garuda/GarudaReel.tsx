import React, { forwardRef, memo, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, ImageSourcePropType, StyleSheet, View } from 'react-native';

/*
 * One reel of Garuda Gold: the symbols in sight, a loop of fillers while it spins, a landing that overshoots a little like a real
 * reel settling, and (for the multiplier reel) a NUDGE: the reel steps on, coin by coin, to the coin the server drew.
 * Reels 1-3 show three tiles each; the multiplier reel shows five coins (the middle one counts).
 */

export type Img = ImageSourcePropType | null;
export type ReelHandle = {
  start: () => void;
  land: (rows: string[], delay: number) => Promise<void>;
  /** Steps the reel on through `path` (top to bottom, the coins that pass) until `rows` is in sight. */
  nudge: (rows: string[], path: string[], stepMs: number) => Promise<void>;
  set: (rows: string[]) => void;
};

const LOOP_CELLS = 14;
const LAND_CELLS = 9;

const Cell = memo(function Cell({ img, w, h, dim, glow }: { img: Img; w: number; h: number; dim?: boolean; glow?: boolean }) {
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
  testID?: string;
}

const GarudaReel = forwardRef(function GarudaReel({ rows, initial, width, rowH, imgW, imgH, images, fillers, dimmed, glowing, fast, testID }: Props, ref: React.Ref<ReelHandle>) {
  const [content, setContent] = useState<string[]>(initial);
  const y = useRef(new Animated.Value(0)).current;
  const pending = useRef<null | { kind: 'loop' } | { kind: 'land' | 'nudge'; resolve: () => void; rows: string[]; ms: number }>(null);
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);
  const contentRef = useRef(content);
  contentRef.current = content;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fastRef = useRef(fast);
  fastRef.current = fast;
  const fillersRef = useRef(fillers);
  fillersRef.current = fillers;
  const filler = () => fillersRef.current[Math.floor(Math.random() * fillersRef.current.length)];

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      loopRef.current?.stop();
    },
    []
  );

  // Content and offset change together, before paint, so nothing jumps.
  useLayoutEffect(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    y.setValue(-(content.length - rows) * rowH);
    if (p.kind === 'loop') {
      const loop = Animated.loop(Animated.timing(y, { toValue: 0, duration: fastRef.current ? 300 : 430, easing: Easing.linear, useNativeDriver: true }));
      loopRef.current = loop;
      loop.start();
      return;
    }
    const easing = p.kind === 'nudge' ? Easing.out(Easing.quad) : Easing.out(Easing.back(1.1));
    Animated.timing(y, { toValue: 0, duration: p.ms, easing, useNativeDriver: true }).start(() => {
      y.setValue(0);
      setContent(p.rows);
      p.resolve();
    });
  }, [content, rowH, rows, y]);

  useImperativeHandle(ref, () => ({
    start: () => {
      loopRef.current?.stop();
      const showing = contentRef.current.slice(0, rows);
      pending.current = { kind: 'loop' };
      setContent([...showing, ...Array.from({ length: LOOP_CELLS }, filler), ...showing]);
    },
    land: (target, delay) =>
      new Promise<void>((resolve) => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          timer.current = null;
          loopRef.current?.stop();
          loopRef.current = null;
          pending.current = { kind: 'land', resolve, rows: target, ms: fastRef.current ? 240 : 400 };
          setContent([...target, ...Array.from({ length: LAND_CELLS }, filler)]);
        }, delay);
      }),
    nudge: (target, path, stepMs) =>
      new Promise<void>((resolve) => {
        loopRef.current?.stop();
        const showing = contentRef.current.slice(0, rows);
        // The reel moves down: what is in sight now leaves at the bottom, the path passes, the target ends in sight.
        pending.current = { kind: 'nudge', resolve, rows: target, ms: Math.max(300, stepMs * (path.length + rows)) };
        setContent([...target, ...path, ...showing]);
      }),
    set: (target) => {
      loopRef.current?.stop();
      y.setValue(0);
      setContent(target);
    },
  }));

  const settled = content.length === rows;
  return (
    <View style={{ width, height: rowH * rows, overflow: 'hidden' }} testID={testID}>
      <Animated.View style={{ transform: [{ translateY: y }] }}>
        {content.map((s, i) => (
          <View key={i} style={{ width, height: rowH, alignItems: 'center', justifyContent: 'center' }}>
            <Cell img={images[s] ?? null} w={imgW} h={imgH} dim={settled && dimmed[i]} glow={settled && glowing[i]} />
          </View>
        ))}
      </Animated.View>
    </View>
  );
});

export default GarudaReel;

const styles = StyleSheet.create({
  fill: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' },
});
