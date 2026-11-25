import React, { memo, useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import TapPressable from '../../components/TapPressable';

/*
 * One tile of the Mines board, drawn (scripts/art/mines/tiles.js): a glossy sapphire block with a gold rim while it is closed (gold when
 * Auto Game has picked it), the open well with a cut diamond or a bomb once it is shown, and the blast behind the bomb that was hit.
 * What it shows pops in with a spring; a hit bomb shakes. A tap makes no touch sound: the game plays its own (gem, bomb).
 */

const ART = {
  tile: require('../../../assets/mines/tile.webp'),
  tileSelected: require('../../../assets/mines/tile-selected.webp'),
  open: require('../../../assets/mines/tile-open.webp'),
  gem: require('../../../assets/mines/gem.webp'),
  bomb: require('../../../assets/mines/bomb.webp'),
  blast: require('../../../assets/mines/blast.webp'),
};

type Props = {
  width: number;
  height: number;
  showContent: boolean;
  isMine: boolean;
  isHit: boolean;
  isSelected: boolean;
  pending: boolean;
  dimmed: boolean;
  disabled: boolean;
  onPress: () => void;
  testID?: string;
};

function MinesTile({ width, height, showContent, isMine, isHit, isSelected, pending, dimmed, disabled, onPress, testID }: Props) {
  const pop = useRef(new Animated.Value(showContent ? 1 : 0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const wasShown = useRef(showContent);

  useEffect(() => {
    if (showContent && !wasShown.current) {
      pop.setValue(0);
      Animated.spring(pop, { toValue: 1, friction: 4.5, tension: 160, useNativeDriver: true }).start();
      if (isHit) {
        shake.setValue(0);
        Animated.sequence(
          [6, -6, 5, -5, 3, -3, 0].map((v) => Animated.timing(shake, { toValue: v, duration: 45, easing: Easing.linear, useNativeDriver: true }))
        ).start();
      }
    }
    if (!showContent) pop.setValue(0);
    wasShown.current = showContent;
  }, [showContent, isHit, pop, shake]);

  const back = showContent ? (isHit ? ART.blast : ART.open) : isSelected ? ART.tileSelected : ART.tile;
  return (
    <TapPressable silent onPress={onPress} disabled={disabled} testID={testID} style={({ pressed }) => [{ width, height }, (pressed || pending) && !showContent && styles.pressed, dimmed && !isSelected && styles.dimmed]}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: shake }] }]}>
        <Image source={back} style={styles.fill} resizeMode="stretch" fadeDuration={0} />
        {showContent ? (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: pop.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }), transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }] }]}>
            <Image source={isMine ? ART.bomb : ART.gem} style={styles.fill} resizeMode="stretch" fadeDuration={0} />
          </Animated.View>
        ) : null}
      </Animated.View>
      {!showContent && pending ? <View style={[StyleSheet.absoluteFill, styles.pendingGlow]} pointerEvents="none" /> : null}
    </TapPressable>
  );
}

export default memo(MinesTile);

const styles = StyleSheet.create({
  fill: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' },
  pressed: { transform: [{ scale: 0.92 }] },
  dimmed: { opacity: 0.45 },
  pendingGlow: { borderRadius: 10, backgroundColor: 'rgba(160,210,255,0.25)' },
});
