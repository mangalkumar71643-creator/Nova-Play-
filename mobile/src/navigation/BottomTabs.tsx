import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import HomeScreen from '../screens/HomeScreen';
import RankingScreen from '../screens/RankingScreen';
import RewardsScreen from '../screens/RewardsScreen';
import VipScreen from '../screens/VipScreen';
import WalletScreen from '../screens/WalletScreen';
import { colors } from '../theme';
import { BottomTabParamList } from './types';
import { IconName } from '../data/models';

const Tab = createBottomTabNavigator<BottomTabParamList>();

const TAB_ICONS: Record<keyof BottomTabParamList, IconName> = {
  Home: 'home-variant',
  Ranking: 'trophy-variant',
  Rewards: 'gift',
  Wallet: 'wallet',
  Vip: 'crown',
};

export default function BottomTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.backgroundAlt,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
        tabBarIcon: ({ color, size }) => (
          <MaterialCommunityIcons name={TAB_ICONS[route.name as keyof BottomTabParamList]} size={size - 2} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Ranking" component={RankingScreen} />
      <Tab.Screen name="Rewards" component={RewardsScreen} />
      <Tab.Screen name="Wallet" component={WalletScreen} />
      <Tab.Screen name="Vip" component={VipScreen} options={{ title: 'VIP' }} />
    </Tab.Navigator>
  );
}
