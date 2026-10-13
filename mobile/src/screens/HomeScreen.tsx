import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { Image, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import HomePopups from '../components/HomePopups';
import HomeSlider from '../components/HomeSlider';
import { GAME_CATEGORIES } from '../components/GameTile';
import ScreenContainer from '../components/ScreenContainer';
import { AVATARS } from '../data/avatars';
import { BottomTabParamList } from '../navigation/types';
import { useAuth } from '../state/AuthContext';
import { useGameState } from '../state/GameStateContext';

const TOP_BAR_HEIGHT = 69;

const WALLET_BUTTON_ASPECT = 2172 / 724;
const WALLET_BUTTON_HEIGHT = 63;
// The balance text was baked into wallet-button.png at 543x181; these are
// that glyph's position/size scaled into the button's rendered dimensions.
const WALLET_BUTTON_SOURCE_HEIGHT = 181;
const WALLET_BALANCE_SCALE = WALLET_BUTTON_HEIGHT / WALLET_BUTTON_SOURCE_HEIGHT;
const WALLET_BALANCE_LEFT = 132 * WALLET_BALANCE_SCALE;
const WALLET_BALANCE_TOP = 58 * WALLET_BALANCE_SCALE;
const WALLET_BALANCE_WIDTH = 205 * WALLET_BALANCE_SCALE;
const WALLET_BALANCE_HEIGHT = 52 * WALLET_BALANCE_SCALE;

const TOP_BAR_ICON_GAP = 10;
const TOP_BAR_ICON_OFFSET_Y = 7;

const NOVAPLAY_BADGE_SIZE = 40;
const GIFT_ICON_SIZE = 40;
const PROFILE_ICON_SIZE = 44;

const CONTROL_PANEL_ASPECT = 1536 / 530;

// Reference frame the requested top/bottom/height pixel values were measured
// against (the device screenshot used to position this element).
const REFERENCE_HEIGHT = 2800;
const PANEL_TOP = 890;
const PANEL_HEIGHT = 408;

// Measured from a JILI lobby reference screenshot (1280x2800): the gap from
// the red control-panel graphic's bottom edge to the top of its game-icon
// row — reused here so our row sits the same distance below our own panel.
const GAME_GRID_GAP_BELOW_PANEL = 250;

// Category banners below the control panel: full width less this margin on
// each side, each at its own image's shape, with this gap between them.
const BANNER_SIDE = 12;
const BANNER_GAP = 10;

// Home slider images stand on the red stage: their bottom edge rests this far
// down the control-panel image (the middle of its red top surface).
const SLIDER_FLOOR = 0.42;
// The stage graphic's visible bottom edge, as a share of the control-panel
// image's height (361 of 483 px); slide buttons go in the gap below it.
const PANEL_VISIBLE_BOTTOM = 361 / 483;
const MIN_BUTTON_AREA = 44;

// All content and navigation elements were intentionally stripped from this
// screen — new custom buttons/UI go here next.
export default function HomeScreen() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const navigation = useNavigation<BottomTabNavigationProp<BottomTabParamList>>();
  const { avatarId } = useAuth();
  const { coins } = useGameState();
  const panelHeight = screenHeight * (PANEL_HEIGHT / REFERENCE_HEIGHT);
  const panelWidth = panelHeight * CONTROL_PANEL_ASPECT;
  const panelTop = screenHeight * (PANEL_TOP / REFERENCE_HEIGHT);
  const gameGridTop = panelTop + panelHeight + screenHeight * (GAME_GRID_GAP_BELOW_PANEL / REFERENCE_HEIGHT) - 50;
  const bannerWidth = screenWidth - BANNER_SIDE * 2;
  // Stage + slider area, laid out from the top of the scroll content. Its
  // bottom is where the category banners start; it grows a little on short
  // screens so a slide's button always fits under the stage.
  const stageTop = panelTop - TOP_BAR_HEIGHT;
  const stageBottom = stageTop + panelHeight * PANEL_VISIBLE_BOTTOM;
  const stageAreaHeight = Math.max(gameGridTop - TOP_BAR_HEIGHT - BANNER_GAP, stageBottom + MIN_BUTTON_AREA);
  const walletButtonWidth = WALLET_BUTTON_HEIGHT * WALLET_BUTTON_ASPECT;
  const walletButtonLeft = (screenWidth - walletButtonWidth) / 2 - 25;

  return (
    <ScreenContainer scroll={false} backgroundImage={require('../../assets/home-background.webp')}>
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: TOP_BAR_HEIGHT,
          backgroundColor: '#151112',
        }}
      >
        <Image
          source={require('../../assets/novaplay-badge.webp')}
          style={{
            position: 'absolute',
            width: NOVAPLAY_BADGE_SIZE,
            height: NOVAPLAY_BADGE_SIZE,
            left: walletButtonLeft - NOVAPLAY_BADGE_SIZE - TOP_BAR_ICON_GAP,
            top: (TOP_BAR_HEIGHT - NOVAPLAY_BADGE_SIZE) / 2 + TOP_BAR_ICON_OFFSET_Y,
          }}
          resizeMode="contain"
        />
        <Pressable
          onPress={() => navigation.navigate('Wallet')}
          style={{
            position: 'absolute',
            left: walletButtonLeft,
            top: (TOP_BAR_HEIGHT - WALLET_BUTTON_HEIGHT) / 2 + TOP_BAR_ICON_OFFSET_Y + 5,
          }}
        >
          <Image
            source={require('../../assets/wallet-button.webp')}
            style={{ width: walletButtonWidth, height: WALLET_BUTTON_HEIGHT }}
            resizeMode="contain"
          />
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
            style={{
              position: 'absolute',
              left: WALLET_BALANCE_LEFT,
              top: WALLET_BALANCE_TOP,
              width: WALLET_BALANCE_WIDTH,
              height: WALLET_BALANCE_HEIGHT,
              lineHeight: WALLET_BALANCE_HEIGHT,
              color: '#FFFFFF',
              fontSize: 13,
              fontWeight: '800',
            }}
          >
            {coins.toLocaleString('en-IN')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => (navigation as any).navigate('GiftCode')}
          accessibilityRole="button"
          accessibilityLabel="Gift code"
          style={{
            position: 'absolute',
            left: walletButtonLeft + walletButtonWidth + TOP_BAR_ICON_GAP,
            top: (TOP_BAR_HEIGHT - GIFT_ICON_SIZE) / 2 + TOP_BAR_ICON_OFFSET_Y,
          }}
        >
          <Image
            source={require('../../assets/gift-icon.webp')}
            style={{ width: GIFT_ICON_SIZE, height: GIFT_ICON_SIZE }}
            resizeMode="contain"
          />
        </Pressable>
        <Pressable
          onPress={() => (navigation as any).navigate('Profile')}
          style={{
            position: 'absolute',
            left: walletButtonLeft + walletButtonWidth + TOP_BAR_ICON_GAP + GIFT_ICON_SIZE + TOP_BAR_ICON_GAP,
            top: (TOP_BAR_HEIGHT - PROFILE_ICON_SIZE) / 2 + TOP_BAR_ICON_OFFSET_Y,
          }}
        >
          <Image
            source={AVATARS[avatarId - 1]}
            style={{ width: PROFILE_ICON_SIZE, height: PROFILE_ICON_SIZE, borderRadius: PROFILE_ICON_SIZE / 2 }}
            resizeMode="cover"
          />
        </Pressable>
      </View>
      {/* Everything under the top bar scrolls together: the control panel, then the banners. */}
      <ScrollView
        style={{ position: 'absolute', top: TOP_BAR_HEIGHT, left: 0, right: 0, bottom: 0 }}
        contentContainerStyle={{ paddingHorizontal: BANNER_SIDE, paddingBottom: BANNER_GAP * 2, gap: BANNER_GAP }}
        showsVerticalScrollIndicator={false}
      >
        {/* The empty space above the stage and the stage itself; the slider stands on the stage. */}
        <View
          style={{
            width: screenWidth,
            height: stageAreaHeight,
            marginHorizontal: -BANNER_SIDE,
          }}
        >
          <Image
            source={require('../../assets/control-panel.webp')}
            style={{ position: 'absolute', left: (screenWidth - panelWidth) / 2, top: stageTop, width: panelWidth, height: panelHeight }}
            resizeMode="contain"
          />
          <HomeSlider
            width={screenWidth}
            height={stageTop + panelHeight * SLIDER_FLOOR}
            maxImageWidth={Math.min(screenWidth - BANNER_SIDE * 2, panelWidth)}
            panel={{ left: (screenWidth - panelWidth) / 2, top: stageTop, width: panelWidth, height: panelHeight }}
            buttonArea={{ top: stageBottom, height: stageAreaHeight - stageBottom }}
          />
        </View>
        {GAME_CATEGORIES.map((category) => (
          <Pressable
            key={category.id}
            onPress={() => (navigation as any).navigate('GameCategory', { categoryId: category.id })}
            style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}
            accessibilityRole="button"
            accessibilityLabel={category.title}
          >
            <Image source={category.banner} style={{ width: bannerWidth, height: bannerWidth / category.bannerAspect }} resizeMode="contain" />
          </Pressable>
        ))}
      </ScrollView>
      <HomePopups />
    </ScreenContainer>
  );
}
