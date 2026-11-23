import React from 'react';
import { Animated, View } from 'react-native';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';

const GOLD = '#FFD23A';
const GOLD_DEEP = '#8A5200';

/** Gold coins raining down for a big win. */
export function CoinShower({ w, h, progress }: { w: number; h: number; progress: Animated.Value }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, overflow: 'hidden' }}>
      {Array.from({ length: 26 }, (_, i) => {
        const d = ((i * 7) % 10) / 26;
        const x = ((i * 41) % 100) / 100;
        const size = 16 + ((i * 3) % 4) * 5;
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: x * (w - size),
              top: -size,
              transform: [
                { translateY: progress.interpolate({ inputRange: [0, d, d + 0.55, 1], outputRange: [0, 0, h + size * 2, h + size * 2] }) },
                { rotateY: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${720 + i * 40}deg`] }) },
              ],
            }}
          >
            <Svg width={size} height={size} viewBox="0 0 20 20">
              <Circle cx={10} cy={10} r={9} fill={GOLD} stroke={GOLD_DEEP} strokeWidth={1.5} />
              <Circle cx={10} cy={10} r={6} fill="none" stroke={GOLD_DEEP} strokeWidth={0.8} />
            </Svg>
          </Animated.View>
        );
      })}
    </View>
  );
}

const SEG_COLORS = ['#7B2CBF', '#E8A020', '#D1213C', '#16A34A', '#2563EB'];

/** The respin wheel: five segments (1 to 5 respins), a hub and a pointer at the top. `turn` is the rotation in degrees. */
export function RespinWheel({ size, turn }: { size: number; turn: Animated.Value }) {
  const c = 100;
  const r = 92;
  const polar = (rad: number, deg: number): [number, number] => [c + rad * Math.sin((deg * Math.PI) / 180), c - rad * Math.cos((deg * Math.PI) / 180)];
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={{ width: size, height: size, transform: [{ rotate: turn.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] }) }] }}>
        <Svg width={size} height={size} viewBox="0 0 200 200">
          <Circle cx={c} cy={c} r={98} fill="#2a1500" stroke={GOLD} strokeWidth={3} />
          {SEG_COLORS.map((col, i) => {
            const a0 = i * 72;
            const a1 = (i + 1) * 72;
            const [x0, y0] = polar(r, a0);
            const [x1, y1] = polar(r, a1);
            const [tx, ty] = polar(60, a0 + 36);
            return (
              <G key={i}>
                <Path d={`M${c} ${c} L${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`} fill={col} stroke="#FFE9A8" strokeWidth={1.6} />
                <SvgText x={tx} y={ty + 9} rotation={a0 + 36} origin={`${tx}, ${ty}`} fontSize={28} fontWeight="900" textAnchor="middle" fill="#FFFFFF" stroke="#000" strokeWidth={1.2}>
                  {String(i + 1)}
                </SvgText>
              </G>
            );
          })}
          <Circle cx={c} cy={c} r={22} fill="#3a1d00" stroke={GOLD} strokeWidth={3} />
          <SvgText x={c} y={c + 4} fontSize={9} fontWeight="900" textAnchor="middle" fill={GOLD}>
            RESPIN
          </SvgText>
        </Svg>
      </Animated.View>
      {/* the pointer does not turn */}
      <Svg width={size} height={size} viewBox="0 0 200 200" style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
        <Path d="M100 4 L88 -14 L112 -14 Z" fill="#FFE27A" stroke="#6a3a00" strokeWidth={2} transform="translate(0 22)" />
      </Svg>
    </View>
  );
}
