import React from 'react';
import { Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import { BACKDROPS, BACKDROPS_WIDE, BACKDROP_BASE, BackdropTheme } from '../theme/backdrops';

type Props = {
  theme: BackdropTheme;
  /** 0..1: how much darker to make it (for the screens whose own art sits right on top). */
  dim?: number;
};

/**
 * A game's full-screen premium background (the same family as the Home screen's: a deep base in the game's own colour,
 * glowing light arcs along the edges, drifting sparks, a vignette). The pictures are drawn by
 * scripts/backdrops/make-backdrops.py. Put it first inside the screen's root view; it fills the parent and never takes touches.
 * A sideways game gets the landscape picture where the theme has one.
 */
export default function GameBackdrop({ theme, dim = 0 }: Props) {
  const { width, height } = useWindowDimensions();
  const source = (width > height ? BACKDROPS_WIDE[theme] : undefined) ?? BACKDROPS[theme];
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: BACKDROP_BASE[theme] }]}>
      <Image source={source} resizeMode="cover" fadeDuration={0} style={styles.picture} />
      {dim > 0 ? <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${dim})` }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // An explicit 100% size: on the website an Image keeps its own pixel size otherwise.
  picture: { width: '100%', height: '100%' },
});
