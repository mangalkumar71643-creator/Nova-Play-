import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import BottomTabs from './BottomTabs';
import { AuthStackParamList, RootStackParamList } from './types';
import AviatorScreen from '../screens/AviatorScreen';
import BalanceRecordsScreen from '../screens/BalanceRecordsScreen';
import ChickenRoadScreen from '../screens/ChickenRoadScreen';
import MinesScreen from '../screens/MinesScreen';
import SevenUpDownScreen from '../screens/SevenUpDownScreen';
import PlinkoScreen from '../screens/PlinkoScreen';
import DragonTigerScreen from '../screens/DragonTigerScreen';
import VortexScreen from '../screens/VortexScreen';
import AndarBaharScreen from '../screens/AndarBaharScreen';
import TeenPattiScreen from '../screens/TeenPattiScreen';
import CricketXScreen from '../screens/CricketXScreen';
import RocketScreen from '../screens/RocketScreen';
import GoalRushScreen from '../screens/GoalRushScreen';
import BigCatchScreen from '../screens/BigCatchScreen';
import CosmonautScreen from '../screens/CosmonautScreen';
import SkyJetScreen from '../screens/SkyJetScreen';
import NightRacerScreen from '../screens/NightRacerScreen';
import AirshipScreen from '../screens/AirshipScreen';
import GatesOfZeusScreen from '../screens/GatesOfZeusScreen';
import WolfMoonScreen from '../screens/WolfMoonScreen';
import PenaltyHeroScreen from '../screens/PenaltyHeroScreen';
import LuckyCupsScreen from '../screens/LuckyCupsScreen';
import BombSquadScreen from '../screens/BombSquadScreen';
import VaultHeistScreen from '../screens/VaultHeistScreen';
import TreasureDigScreen from '../screens/TreasureDigScreen';
import LuckyWheelScreen from '../screens/LuckyWheelScreen';
import ScratchCardScreen from '../screens/ScratchCardScreen';
import DiceDuelScreen from '../screens/DiceDuelScreen';
import ColorBallScreen from '../screens/ColorBallScreen';
import FortuneSixScreen from '../screens/FortuneSixScreen';
import FruitMachineScreen from '../screens/FruitMachineScreen';
import FishermansCatchScreen from '../screens/FishermansCatchScreen';
import BookOfPharaohScreen from '../screens/BookOfPharaohScreen';
import MoneyComingScreen from '../screens/MoneyComingScreen';
import GiftCodeScreen from '../screens/GiftCodeScreen';
import JhandiMundaScreen from '../screens/JhandiMundaScreen';
import RouletteScreen from '../screens/RouletteScreen';
import K3LotteryScreen from '../screens/K3LotteryScreen';
import WinGoScreen from '../screens/WinGoScreen';
import FiveDLotteryScreen from '../screens/FiveDLotteryScreen';
import TrxWinScreen from '../screens/TrxWinScreen';
import BaccaratScreen from '../screens/BaccaratScreen';
import SlotScreen from '../screens/SlotScreen';
import AcesScreen from '../screens/AcesScreen';
import DiceScreen from '../screens/DiceScreen';
import LimboScreen from '../screens/LimboScreen';
import BlackjackScreen from '../screens/BlackjackScreen';
import KenoScreen from '../screens/KenoScreen';
import HiloScreen from '../screens/HiloScreen';
import DragonTowerScreen from '../screens/DragonTowerScreen';
import VideoPokerScreen from '../screens/VideoPokerScreen';
import DiamondsScreen from '../screens/DiamondsScreen';
import PumpScreen from '../screens/PumpScreen';
import CoinFlipScreen from '../screens/CoinFlipScreen';
import CasinoHoldemScreen from '../screens/CasinoHoldemScreen';
import ThreeCardPokerScreen from '../screens/ThreeCardPokerScreen';
import CandyBlastScreen from '../screens/CandyBlastScreen';
import Neon777Screen from '../screens/Neon777Screen';
import GameCategoryScreen from '../screens/GameCategoryScreen';
import CompleteProfileScreen from '../screens/CompleteProfileScreen';
import DepositScreen from '../screens/DepositScreen';
import HelpScreen from '../screens/HelpScreen';
import HistoryScreen from '../screens/HistoryScreen';
import LoginScreen from '../screens/LoginScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import OtpScreen from '../screens/OtpScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';
import WithdrawScreen from '../screens/WithdrawScreen';
import LoadingState from '../components/LoadingState';
import ScreenContainer from '../components/ScreenContainer';
import { colors } from '../theme';
import { useAuth } from '../state/AuthContext';

const Stack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.background,
    text: colors.textPrimary,
    border: colors.border,
    primary: colors.gold,
  },
};

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Otp" component={OtpScreen} />
    </AuthStack.Navigator>
  );
}

function MainNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="MainTabs" component={BottomTabs} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="Help" component={HelpScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="BalanceRecords" component={BalanceRecordsScreen} />
      <Stack.Screen name="History" component={HistoryScreen} />
      <Stack.Screen name="Deposit" component={DepositScreen} />
      <Stack.Screen name="Withdraw" component={WithdrawScreen} />
      <Stack.Screen name="Aviator" component={AviatorScreen} />
      <Stack.Screen name="ChickenRoad" component={ChickenRoadScreen} />
      <Stack.Screen name="Mines" component={MinesScreen} />
      <Stack.Screen name="SevenUpDown" component={SevenUpDownScreen} />
      <Stack.Screen name="Plinko" component={PlinkoScreen} />
      <Stack.Screen name="DragonTiger" component={DragonTigerScreen} />
      <Stack.Screen name="Vortex" component={VortexScreen} />
      <Stack.Screen name="AndarBahar" component={AndarBaharScreen} />
      <Stack.Screen name="TeenPatti" component={TeenPattiScreen} />
      <Stack.Screen name="CricketX" component={CricketXScreen} />
      <Stack.Screen name="Rocket" component={RocketScreen} />
      <Stack.Screen name="GoalRush" component={GoalRushScreen} />
      <Stack.Screen name="BigCatch" component={BigCatchScreen} />
      <Stack.Screen name="Cosmonaut" component={CosmonautScreen} />
      <Stack.Screen name="SkyJet" component={SkyJetScreen} />
      <Stack.Screen name="NightRacer" component={NightRacerScreen} />
      <Stack.Screen name="Airship" component={AirshipScreen} />
      <Stack.Screen name="GatesOfZeus" component={GatesOfZeusScreen} />
      <Stack.Screen name="WolfMoon" component={WolfMoonScreen} />
      <Stack.Screen name="PenaltyHero" component={PenaltyHeroScreen} />
      <Stack.Screen name="LuckyCups" component={LuckyCupsScreen} />
      <Stack.Screen name="BombSquad" component={BombSquadScreen} />
      <Stack.Screen name="VaultHeist" component={VaultHeistScreen} />
      <Stack.Screen name="TreasureDig" component={TreasureDigScreen} />
      <Stack.Screen name="LuckyWheel" component={LuckyWheelScreen} />
      <Stack.Screen name="ScratchCard" component={ScratchCardScreen} />
      <Stack.Screen name="DiceDuel" component={DiceDuelScreen} />
      <Stack.Screen name="ColorBall" component={ColorBallScreen} />
      <Stack.Screen name="FortuneSix" component={FortuneSixScreen} />
      <Stack.Screen name="FruitMachine" component={FruitMachineScreen} />
      <Stack.Screen name="FishermansCatch" component={FishermansCatchScreen} />
      <Stack.Screen name="BookOfPharaoh" component={BookOfPharaohScreen} />
      <Stack.Screen name="MoneyComing" component={MoneyComingScreen} />
      <Stack.Screen name="GiftCode" component={GiftCodeScreen} />
      <Stack.Screen name="JhandiMunda" component={JhandiMundaScreen} />
      <Stack.Screen name="Roulette" component={RouletteScreen} />
      <Stack.Screen name="K3Lottery" component={K3LotteryScreen} />
      <Stack.Screen name="WinGo" component={WinGoScreen} />
      <Stack.Screen name="FiveDLottery" component={FiveDLotteryScreen} />
      <Stack.Screen name="TrxWin" component={TrxWinScreen} />
      <Stack.Screen name="Baccarat" component={BaccaratScreen} />
      <Stack.Screen name="Slot" component={SlotScreen} />
      <Stack.Screen name="Aces" component={AcesScreen} />
      <Stack.Screen name="Dice" component={DiceScreen} />
      <Stack.Screen name="Limbo" component={LimboScreen} />
      <Stack.Screen name="Blackjack" component={BlackjackScreen} />
      <Stack.Screen name="Keno" component={KenoScreen} />
      <Stack.Screen name="Hilo" component={HiloScreen} />
      <Stack.Screen name="DragonTower" component={DragonTowerScreen} />
      <Stack.Screen name="VideoPoker" component={VideoPokerScreen} />
      <Stack.Screen name="Diamonds" component={DiamondsScreen} />
      <Stack.Screen name="Pump" component={PumpScreen} />
      <Stack.Screen name="CoinFlip" component={CoinFlipScreen} />
      <Stack.Screen name="CasinoHoldem" component={CasinoHoldemScreen} />
      <Stack.Screen name="ThreeCardPoker" component={ThreeCardPokerScreen} />
      <Stack.Screen name="CandyBlast" component={CandyBlastScreen} />
      <Stack.Screen name="Neon777" component={Neon777Screen} />
      <Stack.Screen name="GameCategory" component={GameCategoryScreen} />
    </Stack.Navigator>
  );
}

export default function RootNavigator() {
  const { loading, isAuthenticated, needsProfile } = useAuth();

  return (
    <NavigationContainer theme={navigationTheme}>
      {loading ? (
        <ScreenContainer scroll={false}>
          <LoadingState />
        </ScreenContainer>
      ) : needsProfile ? (
        <CompleteProfileScreen />
      ) : isAuthenticated ? (
        <MainNavigator />
      ) : (
        <AuthNavigator />
      )}
    </NavigationContainer>
  );
}
