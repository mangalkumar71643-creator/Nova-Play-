import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { Text } from './AppText';
import { fonts } from '../theme';
import TapPressable from './TapPressable';

type Props = {
  label: string;
  width: number;
  height: number;
  onPress?: () => void;
  disabled?: boolean;
  /** Where it sits (e.g. absolute left / top); the press scale is added to it. */
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The red button with a gold rim that the admin can put under a Home Slider picture or an app-open popup ("PLAY").
 * Drawn here (not a picture), so its edges are smooth at any screen size.
 */
export default function PromoButton({ label, width, height, onPress, disabled, style, testID }: Props) {
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
          colors={['#FF6B6B', '#E3162C', '#A1081C', '#C4102A']}
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
              color: '#FFFFFF',
              fontSize: height * 0.38,
              fontFamily: fonts.extra,
              letterSpacing: 0.5,
              paddingHorizontal: width * 0.1,
              textShadowColor: 'rgba(60,0,0,0.75)',
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
