import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

const AnimatedIcon = Animated.createAnimatedComponent(MaterialCommunityIcons);

// Purely decorative, pointer-events disabled — sits on top of the login
// screenshot to give it a "live" premium-game shimmer without touching
// any of the real functional controls underneath.

const SPARKLES: { top: number; left: number; size: number; delay: number; duration: number }[] = [
  { top: 0.04, left: 0.22, size: 14, delay: 0, duration: 1800 },
  { top: 0.025, left: 0.72, size: 12, delay: 400, duration: 2100 },
  { top: 0.13, left: 0.08, size: 16, delay: 800, duration: 1900 },
  { top: 0.1, left: 0.89, size: 14, delay: 200, duration: 2200 },
  { top: 0.22, left: 0.04, size: 12, delay: 1100, duration: 1700 },
  { top: 0.2, left: 0.93, size: 16, delay: 600, duration: 2000 },
  { top: 0.015, left: 0.48, size: 13, delay: 1400, duration: 1900 },
  { top: 0.27, left: 0.4, size: 11, delay: 900, duration: 2300 },
];

function Sparkle({ top, left, size, delay, duration }: (typeof SPARKLES)[number]) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.4)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: duration / 2, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: duration / 2, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(rotate, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: duration / 2, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.timing(scale, { toValue: 0.4, duration: duration / 2, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
      rotate.setValue(0);
    };
  }, [opacity, scale, rotate, delay, duration]);

  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });

  return (
    <AnimatedIcon
      name="star-four-points"
      size={size}
      color="#FFD24D"
      style={{
        position: 'absolute',
        top: `${top * 100}%`,
        left: `${left * 100}%`,
        opacity,
        transform: [{ scale }, { rotate: spin }],
        textShadowColor: '#FFB800',
        textShadowRadius: size * 0.8,
        textShadowOffset: { width: 0, height: 0 },
      }}
    />
  );
}

export default function GameShineOverlay({ width, height }: { width: number; height: number }) {
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const sweepLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(2600),
      ])
    );
    sweepLoop.start();

    return () => {
      sweepLoop.stop();
    };
  }, [sweep]);

  if (!width || !height) return null;

  const heroHeight = height * 0.33;
  const bandWidth = width * 0.55;
  const translateX = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [-bandWidth, width + bandWidth * 0.2],
  });

  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} pointerEvents="none">
      {/* Diagonal light sweep across the logo lockup */}
      <View style={{ position: 'absolute', top: 0, left: 0, width, height: heroHeight, overflow: 'hidden' }}>
        <Animated.View
          style={{
            position: 'absolute',
            top: -heroHeight * 0.5,
            width: bandWidth,
            height: heroHeight * 2,
            transform: [{ translateX }, { rotate: '18deg' }],
          }}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0)', 'rgba(255,239,200,0.4)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0)']}
            locations={[0, 0.35, 0.5, 0.65, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>

      {SPARKLES.map((s, i) => (
        <Sparkle key={i} {...s} />
      ))}
    </View>
  );
}
