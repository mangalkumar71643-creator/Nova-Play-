import { BottomTabBarHeightCallbackContext, BottomTabBarProps, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React, { useContext, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Ellipse, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import { CrownIcon, EarnIcon, GiftIcon, HomeIcon, IconGlow, TrophyIcon } from '../components/TabIcons';
import HomeScreen from '../screens/HomeScreen';
import RankingScreen from '../screens/RankingScreen';
import EarnScreen from '../screens/EarnScreen';
import VipScreen from '../screens/VipScreen';
import WalletScreen from '../screens/WalletScreen';
import PromotionScreen from '../screens/PromotionScreen';
import { fonts, tabBar } from '../theme';
import { BottomTabParamList } from './types';

const Tab = createBottomTabNavigator<BottomTabParamList>();

type TabName = keyof BottomTabParamList;
type SideName = 'Home' | 'Ranking' | 'Vip' | 'Earn';

/** The gold icons of the four side tabs (components/TabIcons). */
const SIDE_ICONS: Record<SideName, (p: { size: number; active?: boolean }) => React.JSX.Element> = {
  Home: HomeIcon,
  Ranking: TrophyIcon,
  Vip: CrownIcon,
  Earn: EarnIcon,
};
const TAB_LABELS: Record<TabName, string> = {
  Home: 'HOME',
  Ranking: 'RANKING',
  Earn: 'EARN',
  Promotion: 'PROMOTION',
  Wallet: 'WALLET',
  Vip: 'VIP',
};
/** The tab drawn as the raised gift box in the middle of the bar. */
const CENTER: TabName = 'Promotion';

/** Height of the bar's flat part (icons and labels), above the phone's own buttons. */
const BAR_HEIGHT = tabBar.height;
/** How far the middle of the bar rises above its flat part, around the gift box. */
const HUMP = tabBar.hump;
const HUMP_HALF_WIDTH = 60;
const SIDE_ICON = 38;
const GIFT_SIZE = 62;

/**
 * The bar's shape: a dark red panel whose top edge rises in the middle around the Promotion gift box,
 * with a gold line along that edge and a soft shadow where the box stands.
 */
function BarShape({ width, height }: { width: number; height: number }) {
  const cx = width / 2;
  const edge =
    `M0 ${HUMP} L${cx - HUMP_HALF_WIDTH - 22} ${HUMP} ` +
    `C${cx - HUMP_HALF_WIDTH + 2} ${HUMP} ${cx - HUMP_HALF_WIDTH + 4} 0.75 ${cx - 20} 0.75 L${cx + 20} 0.75 ` +
    `C${cx + HUMP_HALF_WIDTH - 4} 0.75 ${cx + HUMP_HALF_WIDTH - 2} ${HUMP} ${cx + HUMP_HALF_WIDTH + 22} ${HUMP} L${width} ${HUMP}`;
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#5A121E" />
          <Stop offset="0.35" stopColor="#2C090E" />
          <Stop offset="1" stopColor="#120305" />
        </SvgGradient>
        <SvgGradient id="barEdge" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#F0B93D" stopOpacity="0.25" />
          <Stop offset="0.5" stopColor="#FFE9A8" stopOpacity="1" />
          <Stop offset="1" stopColor="#F0B93D" stopOpacity="0.25" />
        </SvgGradient>
      </Defs>
      <Path d={`${edge} L${width} ${height} L0 ${height} Z`} fill="url(#barFill)" />
      <Path d={edge} stroke="url(#barEdge)" strokeWidth={1.5} fill="none" />
      <Ellipse cx={cx} cy={HUMP + BAR_HEIGHT - 26} rx={30} ry={5} fill="#000000" fillOpacity={0.35} />
    </Svg>
  );
}

function SideTab({ name, focused, onPress, onLongPress }: { name: SideName; focused: boolean; onPress: () => void; onLongPress: () => void }) {
  const Icon = SIDE_ICONS[name];
  // A selected tab's icon grows, rises and lights up.
  const lift = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(lift, { toValue: focused ? 1 : 0, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [focused, lift]);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.sideTab}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={TAB_LABELS[name]}
    >
      <Animated.View
        style={[
          styles.iconWrap,
          { transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }, { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] }) }] },
        ]}
      >
        <Animated.View style={[styles.glow, { opacity: lift }]} pointerEvents="none">
          <IconGlow size={SIDE_ICON + 30} />
        </Animated.View>
        {/* In its own view, so it is always drawn over the light behind it. */}
        <View>
          <Icon size={SIDE_ICON} active={focused} />
        </View>
      </Animated.View>
      <Text style={[styles.label, focused && styles.labelOn]} numberOfLines={1}>
        {TAB_LABELS[name]}
      </Text>
    </Pressable>
  );
}

function CenterTab({ focused, onPress, onLongPress }: { focused: boolean; onPress: () => void; onLongPress: () => void }) {
  // A slow breathing light behind the box, so it reads as the bar's main action.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.centerTab}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={TAB_LABELS[CENTER]}
    >
      {({ pressed }) => (
        <>
          <View style={[styles.gift, { transform: [{ scale: pressed ? 0.93 : focused ? 1.06 : 1 }] }]}>
            <Animated.View
              pointerEvents="none"
              style={[styles.giftGlow, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.12] }) }] }]}
            >
              <IconGlow size={GIFT_SIZE + 44} />
            </Animated.View>
            <View>
              <GiftIcon size={GIFT_SIZE} />
            </View>
          </View>
          <Text style={[styles.label, styles.centerLabel]} numberOfLines={1}>
            {TAB_LABELS[CENTER]}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/** The app's own tab bar: Home, Ranking, the raised Promotion gift box, VIP, Earn. */
function PremiumTabBar({ state, navigation }: BottomTabBarProps) {
  const bottomInset = useSafeAreaInsets().bottom;
  const { width } = useWindowDimensions();
  const reportHeight = useContext(BottomTabBarHeightCallbackContext);
  const height = BAR_HEIGHT + bottomInset;

  const tab = (name: SideName | typeof CENTER) => {
    const index = state.routes.findIndex((r) => r.name === name);
    const route = state.routes[index];
    const focused = state.index === index;
    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
    };
    const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });
    return name === CENTER ? (
      <CenterTab key={name} focused={focused} onPress={onPress} onLongPress={onLongPress} />
    ) : (
      <SideTab key={name} name={name as SideName} focused={focused} onPress={onPress} onLongPress={onLongPress} />
    );
  };

  return (
    // The bar's box is its flat part; the raised middle is drawn above it, over the screen.
    <View style={{ height }} onLayout={(e) => reportHeight?.(e.nativeEvent.layout.height)}>
      <View style={{ position: 'absolute', left: 0, right: 0, top: -HUMP, height: height + HUMP }} pointerEvents="none">
        <BarShape width={width} height={height + HUMP} />
      </View>
      <View style={[styles.row, { height: BAR_HEIGHT }]}>
        {tab('Home')}
        {tab('Ranking')}
        {tab(CENTER)}
        {tab('Vip')}
        {tab('Earn')}
      </View>
    </View>
  );
}

export default function BottomTabs() {
  return (
    <Tab.Navigator tabBar={(props) => <PremiumTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Ranking" component={RankingScreen} />
      <Tab.Screen name="Promotion" component={PromotionScreen} />
      <Tab.Screen name="Vip" component={VipScreen} options={{ title: 'VIP' }} />
      <Tab.Screen name="Earn" component={EarnScreen} />
      {/* Not on the bar; opened from the wallet buttons. */}
      <Tab.Screen name="Wallet" component={WalletScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  sideTab: { flex: 1, height: BAR_HEIGHT, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 7 },
  iconWrap: { width: SIDE_ICON, height: SIDE_ICON, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', left: -15, top: -15 },
  label: { fontFamily: fonts.semi, fontSize: 10, letterSpacing: 0.6, color: '#F1E0CF', marginTop: 3 },
  labelOn: { fontFamily: fonts.bold, color: '#FFD766' },
  centerTab: { width: GIFT_SIZE + 30, height: BAR_HEIGHT + HUMP, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 7 },
  gift: { width: GIFT_SIZE, height: GIFT_SIZE, alignItems: 'center', justifyContent: 'center', marginBottom: -3 },
  giftGlow: { position: 'absolute', left: -22, top: -22 },
  centerLabel: { fontFamily: fonts.italic, fontSize: 10.5, color: '#FFD766', letterSpacing: 0.4 },
});
