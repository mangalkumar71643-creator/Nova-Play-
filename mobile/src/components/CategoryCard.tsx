import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { fonts } from '../theme';
import { GAME_ICONS, GameCategory } from './GameTile';

export const CATEGORY_CARD_HEIGHT = 92;
const ICON = 56;
/** How far each game icon slides under its neighbour. */
const OVERLAP = 22;
const FAN_WIDTH = ICON * 3 - OVERLAP * 2;
const FAN_TILT = ['-9deg', '0deg', '9deg'];

/**
 * A game category on Home: its name, three of its games fanned out, and a play button, on a dark red
 * panel with a gold edge. Tapping anywhere opens the category.
 */
export default function CategoryCard({ category, width, onPress }: { category: GameCategory; width: number; onPress: () => void }) {
  const icons = category.games.map((id) => GAME_ICONS[id]).filter(Boolean).slice(0, 3);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ width, transform: [{ scale: pressed ? 0.98 : 1 }] })}
      accessibilityRole="button"
      accessibilityLabel={category.title}
    >
      <LinearGradient colors={['#FFE9A8', '#B8862A', '#5E3D0E', '#B8862A', '#FFE9A8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.edge}>
        <LinearGradient colors={['#4C0E18', '#2B080D', '#170508']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.6 }} style={styles.panel}>
          {/* A red glow behind the game icons. */}
          <Svg width={width} height={CATEGORY_CARD_HEIGHT} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
              <RadialGradient id="glow" cx="68%" cy="50%" rx="38%" ry="95%">
                <Stop offset="0" stopColor="#FF3B4F" stopOpacity="0.42" />
                <Stop offset="1" stopColor="#FF3B4F" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width={width} height={CATEGORY_CARD_HEIGHT} fill="url(#glow)" />
          </Svg>
          <LinearGradient colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0)']} style={styles.gloss} pointerEvents="none" />

          <View style={styles.text}>
            <Text style={[styles.title, width < 350 && styles.titleNarrow]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {category.title}
            </Text>
            <Text style={styles.tagline} numberOfLines={1}>
              {category.tagline}
            </Text>
            <View style={styles.chip}>
              <Text style={styles.chipText}>{category.games.length} GAMES</Text>
            </View>
          </View>

          <View style={styles.fan} pointerEvents="none">
            {icons.map((icon, i) => (
              <Image
                key={i}
                source={icon!}
                resizeMode="contain"
                style={{
                  width: ICON,
                  height: ICON,
                  marginLeft: i === 0 ? 0 : -OVERLAP,
                  zIndex: i === 1 ? 2 : 1,
                  transform: [{ rotate: FAN_TILT[i] }, { translateY: i === 1 ? -3 : 4 }, { scale: i === 1 ? 1.1 : 1 }],
                }}
              />
            ))}
          </View>

          <LinearGradient colors={['#FF7C89', '#D8213A', '#8A0E1E']} style={styles.play}>
            <MaterialCommunityIcons name="play" size={24} color="#FFFFFF" />
          </LinearGradient>
        </LinearGradient>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  edge: { borderRadius: 18, padding: 1.3 },
  panel: { height: CATEGORY_CARD_HEIGHT, borderRadius: 17, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  gloss: { position: 'absolute', left: 0, right: 0, top: 0, height: CATEGORY_CARD_HEIGHT * 0.45 },
  text: { flex: 1, paddingLeft: 14, paddingRight: 4 },
  title: { fontFamily: fonts.italic, fontSize: 18, color: '#FFE9B0', textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  titleNarrow: { fontSize: 16 },
  tagline: { fontFamily: fonts.semi, fontSize: 10, color: '#DDB0B5', marginTop: 3 },
  chip: { alignSelf: 'flex-start', marginTop: 7, paddingHorizontal: 8, paddingVertical: 2.5, borderRadius: 9, borderWidth: 1, borderColor: 'rgba(255,222,140,0.55)', backgroundColor: 'rgba(0,0,0,0.28)' },
  chipText: { fontFamily: fonts.bold, fontSize: 8.5, letterSpacing: 0.6, color: '#FFDE8C' },
  fan: { width: FAN_WIDTH, flexDirection: 'row', alignItems: 'center' },
  play: { width: 38, height: 38, borderRadius: 12, marginLeft: 8, marginRight: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.2, borderColor: 'rgba(255,233,168,0.9)' },
});
