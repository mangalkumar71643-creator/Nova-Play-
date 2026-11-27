import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { Text } from './AppText';
import { fonts } from '../theme';
import TapPressable from './TapPressable';

/** The button's colour (a custom page's button can be any of these; banners and popups use red). */
export type PromoTone = 'red' | 'gold' | 'green' | 'blue' | 'purple';

const FACE: Record<PromoTone, [string, string, string, string]> = {
  red: ['#FF6B6B', '#E3162C', '#A1081C', '#C4102A'],
  gold: ['#FFF1B8', '#F2C14E', '#C88A16', '#E0A830'],
  green: ['#6EE7A8', '#1DB36B', '#0B7A45', '#15924F'],
  blue: ['#7DB8FF', '#2F7BFF', '#1446B8', '#2160D8'],
  purple: ['#C99BFF', '#8B3DFF', '#5A16B0', '#7428D8'],
};

type Props = {
  label: string;
  /** Its colour; red when not given. */
  tone?: PromoTone;
  width: number;
  height: number;
  onPress?: () => void;
  disabled?: boolean;
  /** Where it sits (e.g. absolute left / top); the press scale is added to it. */
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The red button with a gold rim that the admin can put under a Home Slider picture or an app-open popup ("PLAY"), and in
 * other colours on a custom page. Drawn here (not a picture), so its edges are smooth at any screen size.
 */
export default function PromoButton({ label, tone = 'red', width, height, onPress, disabled, style, testID }: Props) {
  const face = FACE[tone] ?? FACE.red;
  const dark = tone === 'gold';
  return (
    <TapPressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      style={({ pressed }) => [style, { transform: [{ scale: pressed ? 0.95 : 1 }] }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <LinearGradient
        colors={['#FFE9A8', '#E3A92E', '#8F5A0C']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ width, height, borderRadius: height / 2, padding: 2 }}
      >
        <LinearGradient
          colors={face}
          locations={[0, 0.45, 0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ flex: 1, borderRadius: height / 2 - 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
        >
          {/* The light on the top half. */}
          <View
            pointerEvents="none"
            style={{ position: 'absolute', left: height * 0.3, right: height * 0.3, top: 1.5, height: '42%', borderRadius: height, backgroundColor: 'rgba(255,255,255,0.22)' }}
          />
          <Text
            numberOfLines={1}
            style={{
              color: dark ? '#4A2A00' : '#FFFFFF',
              fontSize: height * 0.38,
              fontFamily: fonts.extra,
              letterSpacing: 0.5,
              paddingHorizontal: width * 0.1,
              textShadowColor: dark ? 'rgba(255,246,210,0.7)' : 'rgba(60,0,0,0.75)',
              textShadowOffset: { width: 0, height: 1.5 },
              textShadowRadius: 3,
            }}
          >
            {label}
          </Text>
        </LinearGradient>
      </LinearGradient>
    </TapPressable>
  );
}
