import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Image, ImageBackground, Linking, PanResponder, Platform, Pressable, Text, View } from 'react-native';
import { API_BASE_URL } from '../api/client';
import { GAME_CATEGORIES } from './GameTile';

type Slide = {
  id: string;
  title: string;
  width: number;
  height: number;
  imageUrl: string;
  /** Optional button under the picture; buttonTarget is the game screen it opens, or DOWNLOAD_TARGET. */
  buttonText?: string | null;
  buttonTarget?: string | null;
  /** For a "Download app" button: the link it opens. */
  buttonUrl?: string | null;
};

// "Download app" slides are for people playing on the website; anyone in the
// installed app already has it, so those slides are left out there.
const DOWNLOAD_TARGET = 'DOWNLOAD';
const SHOW_DOWNLOAD_SLIDES = Platform.OS === 'web';

// Only screens that are real games can be opened from a slide's button.
const GAME_SCREENS = new Set<string>(GAME_CATEGORIES.flatMap((c) => c.games));

const BUTTON_ASPECT = 420 / 147;
const BUTTON_MAX_HEIGHT = 46;

const SLIDE_INTERVAL_MS = 4000;
const SLIDE_ANIM_MS = 450;
const SWIPE_DISTANCE = 40;

// The red dots baked into control-panel.webp (1400x483): their centres and
// size, so the active slide's dot can be lit exactly on top of one.
const PANEL_SOURCE_WIDTH = 1400;
const PANEL_SOURCE_HEIGHT = 483;
const PANEL_DOT_XS = [336, 394.5, 452.5, 510.5, 568.5, 627, 685, 743.5, 800.5];
const PANEL_DOT_Y = 321;
const PANEL_DOT_SIZE = 22;

type Props = {
  /** Width of the slider strip (the full screen). */
  width: number;
  /** Height of the slider strip; slide images rest on its bottom edge. */
  height: number;
  /** Widest a slide image may be drawn. */
  maxImageWidth: number;
  /** Where the control-panel image is drawn, relative to the strip's top-left. */
  panel: { left: number; top: number; width: number; height: number };
  /** The gap under the red stage (same frame) where the current slide's button goes. */
  buttonArea: { top: number; height: number };
};

/**
 * The "Home slider" images set up in the admin panel, standing on the red
 * stage and sliding by themselves. Players can also swipe. The stage's dot
 * row shows which one is up.
 */
export default function HomeSlider({ width, height, maxImageWidth, panel, buttonArea }: Props) {
  const navigation = useNavigation();
  const [slides, setSlides] = useState<Slide[]>([]);

  // Fetched each time Home is shown and each time the app comes back to the
  // front, so slides added in the admin panel appear without a full restart.
  const loadSlides = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/popups?kind=SLIDER`);
      if (!res.ok) return;
      const rows: Slide[] = (await res.json()).filter((r: Slide) => SHOW_DOWNLOAD_SLIDES || r.buttonTarget !== DOWNLOAD_TARGET);
      // Same list (image URLs carry a version) → keep the slider where it is.
      setSlides((prev) => (JSON.stringify(prev) === JSON.stringify(rows) ? prev : rows));
    } catch {
      // Keep whatever was showing if the server can't be reached.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSlides();
    }, [loadSlides])
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') loadSlides();
    });
    return () => sub.remove();
  }, [loadSlides]);

  const n = slides.length;
  // Pages are [last, ...slides, first] so sliding past either end wraps
  // without a visible jump back; `pos` 1..n is a real slide.
  const pages = n > 1 ? [slides[n - 1], ...slides, slides[0]] : slides;
  const [pos, setPos] = useState(1);
  const [dragging, setDragging] = useState(false);
  const offset = useRef(new Animated.Value(-width)).current;
  const posRef = useRef(1);
  const widthRef = useRef(width);
  widthRef.current = width;

  const goTo = useCallback(
    (target: number) => {
      Animated.timing(offset, {
        toValue: -target * widthRef.current,
        duration: SLIDE_ANIM_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        let settled = target;
        if (target > n) settled = 1;
        if (target < 1) settled = n;
        offset.setValue(-settled * widthRef.current);
        posRef.current = settled;
        setPos(settled);
      });
    },
    [n, offset]
  );

  // Back to the first slide whenever the list or the screen size changes.
  useEffect(() => {
    posRef.current = 1;
    setPos(1);
    offset.setValue(n > 1 ? -width : 0);
  }, [n, width, offset]);

  useEffect(() => {
    if (n < 2 || dragging) return;
    const t = setTimeout(() => goTo(posRef.current + 1), SLIDE_INTERVAL_MS);
    return () => clearTimeout(t);
  }, [pos, n, dragging, goTo]);

  const goToRef = useRef(goTo);
  goToRef.current = goTo;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderGrant: () => {
        offset.stopAnimation();
        setDragging(true);
      },
      onPanResponderMove: (_e, g) => offset.setValue(-posRef.current * widthRef.current + g.dx),
      onPanResponderRelease: (_e, g) => {
        setDragging(false);
        goToRef.current(posRef.current + (g.dx < -SWIPE_DISTANCE ? 1 : g.dx > SWIPE_DISTANCE ? -1 : 0));
      },
      onPanResponderTerminate: () => {
        setDragging(false);
        goToRef.current(posRef.current);
      },
    })
  ).current;

  if (n === 0) return null;

  const scale = panel.width / PANEL_SOURCE_WIDTH;
  // Light the dots from the middle of the row outwards, one per slide.
  const shown = Math.min(n, PANEL_DOT_XS.length);
  const firstDot = Math.floor((PANEL_DOT_XS.length - shown) / 2);
  const active = (pos - 1) % shown;
  const dotSize = PANEL_DOT_SIZE * scale;
  const panelScaleY = panel.height / PANEL_SOURCE_HEIGHT;

  // The showing slide's button, under the stage (it changes with the slide).
  const current = slides[(pos - 1 + n) % n] ?? slides[0];
  const buttonTarget = current.buttonTarget && GAME_SCREENS.has(current.buttonTarget) ? current.buttonTarget : null;
  const downloadUrl = current.buttonTarget === DOWNLOAD_TARGET ? current.buttonUrl : null;
  const onButtonPress = buttonTarget
    ? () => (navigation as any).navigate(buttonTarget)
    : downloadUrl
      ? () => Linking.openURL(downloadUrl).catch(() => {})
      : undefined;
  const buttonHeight = Math.min(BUTTON_MAX_HEIGHT, buttonArea.height - 4);
  const buttonWidth = buttonHeight * BUTTON_ASPECT;

  return (
    <>
      <View style={{ position: 'absolute', left: 0, top: 0, width, height, overflow: 'hidden' }} {...(n > 1 ? pan.panHandlers : {})}>
        <Animated.View style={{ flexDirection: 'row', width: width * pages.length, height, transform: [{ translateX: offset }] }}>
          {pages.map((s, i) => {
            const aspect = s.width / s.height;
            const h = Math.min(height, maxImageWidth / aspect);
            return (
              <View key={`${s.id}-${i}`} style={{ width, height, alignItems: 'center', justifyContent: 'flex-end' }}>
                <Image
                  source={{ uri: `${API_BASE_URL}${s.imageUrl}` }}
                  style={{ width: h * aspect, height: h }}
                  resizeMode="contain"
                  accessibilityLabel={s.title}
                />
              </View>
            );
          })}
        </Animated.View>
      </View>
      {n > 1 &&
        PANEL_DOT_XS.map((x, i) => {
          const slot = i - firstDot;
          const used = slot >= 0 && slot < shown;
          // Dots for the slides keep their baked red; the active one glows; spare ones go dark.
          if (used && slot !== active) return null;
          const isActive = used && slot === active;
          return (
            <View
              key={i}
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: panel.left + x * scale - dotSize / 2,
                top: panel.top + PANEL_DOT_Y * panelScaleY - dotSize / 2,
                width: dotSize,
                height: dotSize,
                borderRadius: dotSize / 2,
                backgroundColor: isActive ? '#FFF4D6' : 'rgba(20,0,0,0.72)',
                shadowColor: '#FFD27A',
                shadowOpacity: isActive ? 1 : 0,
                shadowRadius: dotSize * 0.6,
                shadowOffset: { width: 0, height: 0 },
                elevation: isActive ? 6 : 0,
              }}
            />
          );
        })}
      {!!current.buttonText && (
        <Pressable
          key={current.id}
          onPress={onButtonPress}
          disabled={!onButtonPress}
          style={({ pressed }) => ({
            position: 'absolute',
            left: (width - buttonWidth) / 2,
            top: buttonArea.top + (buttonArea.height - buttonHeight) / 2,
            transform: [{ scale: pressed ? 0.95 : 1 }],
          })}
          accessibilityRole="button"
          accessibilityLabel={current.buttonText}
        >
          <ImageBackground
            source={require('../../assets/slider-button.webp')}
            style={{ width: buttonWidth, height: buttonHeight, alignItems: 'center', justifyContent: 'center' }}
            resizeMode="contain"
          >
            <Text
              numberOfLines={1}
              style={{
                color: '#FFFFFF',
                fontSize: buttonHeight * 0.4,
                fontWeight: '900',
                letterSpacing: 0.5,
                marginTop: -buttonHeight * 0.06,
                paddingHorizontal: buttonWidth * 0.1,
                textShadowColor: 'rgba(60,0,0,0.7)',
                textShadowOffset: { width: 0, height: 1.5 },
                textShadowRadius: 3,
              }}
            >
              {current.buttonText}
            </Text>
          </ImageBackground>
        </Pressable>
      )}
    </>
  );
}
