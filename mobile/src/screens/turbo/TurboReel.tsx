import React, { forwardRef, memo, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, ImageSourcePropType, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

/*
 * One reel of Turbo Sevens: its three symbols, a loop of fillers while it spins, and a landing that overshoots a little like a real reel
 * settling. The same component draws the three main reels and the bonus reel (their pictures and fillers differ).
 */

export type Img = ImageSourcePropType | null;
export type ReelHandle = {
  start: () => void;
  land: (rows: string[], delay: number) => Promise<void>;
  set: (rows: string[]) => void;
};

const LOOP_CELLS = 14;
const LAND_CELLS = 9;

const SymbolView = memo(function SymbolView({ img, size, dim, glow }: { img: Img; size: number; dim?: boolean; glow?: boolean }) {
  if (!img) return <View style={{ width: size, height: size }} />;
  return (
    <View style={{ width: size, height: size, opacity: dim ? 0.42 : 1, transform: [{ scale: glow ? 1.08 : 1 }] }}>
      {glow ? (
        <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <RadialGradient id="tsGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0.4" stopColor="#FFE680" stopOpacity={0.8} />
              <Stop offset="1" stopColor="#FFB020" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={50} cy={50} r={58} fill="url(#tsGlow)" />
        </Svg>
      ) : null}
      <Image source={img} style={styles.fill} resizeMode="stretch" fadeDuration={0} />
    </View>
  );
});

interface Props {
  initial: string[];
  cell: number;
  width: number;
  images: Record<string, Img>;
  fillers: string[];
  dimmed: boolean[];
  glowing: boolean[];
  fast: boolean;
}

const TurboReel = forwardRef(function TurboReel({ initial, cell, width, images, fillers, dimmed, glowing, fast }: Props, ref: React.Ref<ReelHandle>) {
  const [content, setContent] = useState<string[]>(initial);
  const y = useRef(new Animated.Value(0)).current;
  const pending = useRef<null | { kind: 'loop' } | { kind: 'land'; resolve: () => void; rows: string[] }>(null);
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
    if (p.kind === 'loop') {
      y.setValue(-(content.length - 3) * cell);
      const loop = Animated.loop(Animated.timing(y, { toValue: 0, duration: fastRef.current ? 300 : 430, easing: Easing.linear, useNativeDriver: true }));
      loopRef.current = loop;
      loop.start();
      return;
    }
    y.setValue(-(content.length - 3) * cell);
    Animated.timing(y, { toValue: 0, duration: fastRef.current ? 240 : 400, easing: Easing.out(Easing.back(1.1)), useNativeDriver: true }).start(() => {
      y.setValue(0);
      setContent(p.rows);
      p.resolve();
    });
  }, [content, cell, y]);

  useImperativeHandle(ref, () => ({
    start: () => {
      loopRef.current?.stop();
      const showing = contentRef.current.slice(0, 3);
      pending.current = { kind: 'loop' };
      setContent([...showing, ...Array.from({ length: LOOP_CELLS }, filler), ...showing]);
    },
    land: (rows, delay) =>
      new Promise<void>((resolve) => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          timer.current = null;
          loopRef.current?.stop();
          loopRef.current = null;
          pending.current = { kind: 'land', resolve, rows };
          setContent([...rows, ...Array.from({ length: LAND_CELLS }, filler)]);
        }, delay);
      }),
    set: (rows) => {
      loopRef.current?.stop();
      y.setValue(0);
      setContent(rows);
    },
  }));

  const settled = content.length === 3;
  return (
    <View style={{ width, height: cell * 3, overflow: 'hidden' }}>
      <Animated.View style={{ transform: [{ translateY: y }] }}>
        {content.map((s, i) => (
          <View key={i} style={{ width, height: cell, alignItems: 'center', justifyContent: 'center' }}>
            <SymbolView img={images[s] ?? null} size={Math.min(width, cell) * 0.92} dim={settled && dimmed[i]} glow={settled && glowing[i]} />
          </View>
        ))}
      </Animated.View>
    </View>
  );
});

export default TurboReel;

const styles = StyleSheet.create({
  fill: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' },
});
