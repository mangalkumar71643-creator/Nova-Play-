import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { BottomTabBarHeightCallbackContext, BottomTabBarProps, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useContext, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import HomeScreen from '../screens/HomeScreen';
import RankingScreen from '../screens/RankingScreen';
import EarnScreen from '../screens/EarnScreen';
import VipScreen from '../screens/VipScreen';
import WalletScreen from '../screens/WalletScreen';
import PromotionScreen from '../screens/PromotionScreen';
import { colors, fonts, tabBar } from '../theme';
import { BottomTabParamList } from './types';
import { IconName } from '../data/models';

const Tab = createBottomTabNavigator<BottomTabParamList>();

type TabName = keyof BottomTabParamList;

const TAB_ICONS: Record<TabName, IconName> = {
  Home: 'home-variant',
  Ranking: 'trophy',
  Earn: 'hand-coin',
  Promotion: 'gift',
  Wallet: 'wallet',
  Vip: 'crown',
};
const TAB_LABELS: Record<TabName, string> = {
  Home: 'HOME',
  Ranking: 'RANKING',
  Earn: 'EARN',
  Promotion: 'PROMOTION',
  Wallet: 'WALLET',
  Vip: 'VIP',
};
/** The tab drawn as the raised round button in the middle of the bar. */
const CENTER: TabName = 'Promotion';

/** Height of the bar's flat part (icons and labels), above the phone's own buttons. */
const BAR_HEIGHT = tabBar.height;
/** How far the middle of the bar rises above its flat part, around the round button. */
const HUMP = tabBar.hump;
const HUMP_HALF_WIDTH = 60;
const CENTER_SIZE = 62;

/**
 * The bar's shape: a dark red panel whose top edge rises in the middle around the round Promotion button,
 * with a gold line along that edge.
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
    </Svg>
  );
}

function SideTab({ name, focused, onPress, onLongPress }: { name: TabName; focused: boolean; onPress: () => void; onLongPress: () => void }) {
  const lift = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(lift, { toValue: focused ? 1 : 0, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
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
          focused && styles.iconWrapOn,
          { transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }, { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }] },
        ]}
      >
        <MaterialCommunityIcons name={TAB_ICONS[name]} size={25} color={focused ? colors.goldLight : '#C79A7C'} />
      </Animated.View>
      <Text style={[styles.label, focused && styles.labelOn]} numberOfLines={1}>
        {TAB_LABELS[name]}
      </Text>
    </Pressable>
  );
}

function CenterTab({ focused, onPress, onLongPress }: { focused: boolean; onPress: () => void; onLongPress: () => void }) {
  // A slow glow behind the button, so it reads as the bar's main action.
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
          <View style={[styles.centerButton, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
            <Animated.View
              pointerEvents="none"
              style={[styles.centerGlow, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.7] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] }) }] }]}
            />
            <LinearGradient colors={['#FFF3C4', '#F0B93D', '#8A5A0E']} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={styles.centerRing}>
              <LinearGradient colors={focused ? ['#FF7D8A', '#E3243B', '#8A0E1E'] : ['#FF5E6E', '#C4172C', '#6E0B18']} style={styles.centerFace}>
                <View style={styles.centerShine} pointerEvents="none" />
                <MaterialCommunityIcons name={TAB_ICONS[CENTER]} size={30} color="#FFF3C4" />
              </LinearGradient>
            </LinearGradient>
          </View>
          <Text style={[styles.label, styles.centerLabel, focused && styles.labelOn]} numberOfLines={1}>
            {TAB_LABELS[CENTER]}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/** The app's own tab bar: Home, Ranking, the raised Promotion button, VIP, Earn. */
function PremiumTabBar({ state, navigation }: BottomTabBarProps) {
  const bottomInset = useSafeAreaInsets().bottom;
  const { width } = useWindowDimensions();
  const reportHeight = useContext(BottomTabBarHeightCallbackContext);
  const height = BAR_HEIGHT + bottomInset;

  const tab = (name: TabName) => {
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
      <SideTab key={name} name={name} focused={focused} onPress={onPress} onLongPress={onLongPress} />
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
  iconWrap: { width: 46, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  iconWrapOn: { backgroundColor: 'rgba(240,185,61,0.14)', borderWidth: 1, borderColor: 'rgba(255,222,140,0.4)' },
  label: { fontFamily: fonts.bold, fontSize: 9.5, letterSpacing: 0.6, color: '#C79A7C', marginTop: 3 },
  labelOn: { color: colors.goldLight },
  centerTab: { width: CENTER_SIZE + 26, height: BAR_HEIGHT + HUMP, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 7 },
  centerButton: { width: CENTER_SIZE, height: CENTER_SIZE, alignItems: 'center', justifyContent: 'center', marginBottom: -1 },
  centerGlow: { position: 'absolute', width: CENTER_SIZE + 10, height: CENTER_SIZE + 10, borderRadius: (CENTER_SIZE + 10) / 2, backgroundColor: 'rgba(240,185,61,0.35)' },
  centerRing: { width: CENTER_SIZE, height: CENTER_SIZE, borderRadius: CENTER_SIZE / 2, alignItems: 'center', justifyContent: 'center', elevation: 8, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  centerFace: { width: CENTER_SIZE - 7, height: CENTER_SIZE - 7, borderRadius: (CENTER_SIZE - 7) / 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  centerShine: { position: 'absolute', top: -CENTER_SIZE * 0.42, width: CENTER_SIZE, height: CENTER_SIZE * 0.8, borderRadius: CENTER_SIZE / 2, backgroundColor: 'rgba(255,255,255,0.16)' },
  centerLabel: { marginTop: 2 },
});
