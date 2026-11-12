import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { lockOrientation, onOrientationRequest, Orientation, requestedOrientation } from '../utils/orientation';
import { colors, fonts, gradients } from '../theme';

/**
 * Website only. The sideways games (Teen Patti, Andar Bahar, Dragon Tiger, Baccarat, Roulette) need a wide
 * window. On a computer the page around the game widens it; on a phone's browser the phone has to be turned.
 * While such a game is open and the phone is still upright, this covers the screen and asks for that.
 */
export default function RotateNotice() {
  const { width, height } = useWindowDimensions();
  const [wanted, setWanted] = useState<Orientation>(requestedOrientation());
  useEffect(() => onOrientationRequest(setWanted), []);
  if (Platform.OS !== 'web' || wanted !== 'landscape' || width > height) return null;
  // Inside the computer's phone frame the frame is widened instead (its page is the parent).
  if (typeof window !== 'undefined' && window.parent !== window) return null;
  return (
    <View style={styles.cover}>
      <MaterialCommunityIcons name="phone-rotate-landscape" size={64} color={colors.gold} />
      <Text style={styles.title}>Turn your phone sideways</Text>
      <Text style={styles.text}>This game is played in landscape. Rotate your phone (switch on auto-rotate if it does not turn).</Text>
      <Pressable onPress={() => lockOrientation('landscape')} accessibilityRole="button">
        <LinearGradient colors={gradients.goldButton} style={styles.button}>
          <Text style={styles.buttonText}>TRY FULL SCREEN</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 1000, backgroundColor: 'rgba(15,3,5,0.96)', alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 },
  title: { fontFamily: fonts.black, fontSize: 20, color: '#FFE9B0', textAlign: 'center' },
  text: { fontFamily: fonts.semi, fontSize: 13, color: '#D9B0A8', textAlign: 'center', lineHeight: 19 },
  button: { borderRadius: 999, paddingVertical: 11, paddingHorizontal: 26, marginTop: 6 },
  buttonText: { fontFamily: fonts.black, fontSize: 13, color: '#3A2204', letterSpacing: 0.6 },
});
