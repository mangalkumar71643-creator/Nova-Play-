import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ImageSourcePropType, ImageBackground, ScrollView, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { gradients } from '../theme';

type Props = {
  children?: React.ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  backgroundImage?: ImageSourcePropType;
};

export default function ScreenContainer({ children, scroll = true, contentStyle, backgroundImage }: Props) {
  const content = scroll ? (
    <ScrollView contentContainerStyle={[styles.scrollContent, contentStyle]} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.fill, contentStyle]}>{children}</View>
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
