import { LinearGradient } from 'expo-linear-gradient';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import React, { useContext } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ImageSourcePropType, ImageBackground, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { gradients } from '../theme';
import KeyboardAwareScrollView from './KeyboardAwareScrollView';

type Props = {
  children?: React.ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  backgroundImage?: ImageSourcePropType;
};

export default function ScreenContainer({ children, scroll = true, contentStyle, backgroundImage }: Props) {
  // The app draws edge to edge: leave room at the bottom for the phone's own
  // buttons — except on a tab screen, whose tab bar already does.
  const insideTabs = useContext(BottomTabBarHeightContext) !== undefined;
  const inset = useSafeAreaInsets().bottom;
  const bottom = insideTabs ? 0 : inset;
  // A spacer after the content, so a screen's own contentStyle padding stays as it is.
  const spacer = bottom > 0 ? <View style={{ height: bottom }} /> : null;
  const content = scroll ? (
    <KeyboardAwareScrollView contentContainerStyle={[styles.scrollContent, contentStyle]} showsVerticalScrollIndicator={false}>
      {children}
      {spacer}
    </KeyboardAwareScrollView>
  ) : (
    <View style={[styles.fill, contentStyle]}>
      {children}
      {spacer}
    </View>
  );

  if (backgroundImage) {
    return (
      <ImageBackground source={backgroundImage} style={styles.fill} resizeMode="cover">
        {content}
      </ImageBackground>
    );
  }

  return (
    <LinearGradient colors={gradients.background} style={styles.fill}>
      {content}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
});
