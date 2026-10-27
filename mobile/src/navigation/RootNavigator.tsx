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
import CustomerServiceScreen from '../screens/CustomerServiceScreen';
import SupportFormScreen from '../screens/SupportFormScreen';
import SupportProgressScreen from '../screens/SupportProgressScreen';
import HistoryScreen from '../screens/HistoryScreen';
import LoginScreen from '../screens/LoginScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import OtpScreen from '../screens/OtpScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AgentJackpotScreen from '../screens/AgentJackpotScreen';
import AgentRewardsScreen from '../screens/AgentRewardsScreen';
import AgentTeamScreen from '../screens/AgentTeamScreen';
import WithdrawScreen from '../screens/WithdrawScreen';
import LoadingState from '../components/LoadingState';
import ScreenContainer from '../components/ScreenContainer';
import { colors } from '../theme';
import { useAuth } from '../state/AuthContext';
import { withPullToRefresh } from '../components/PullToRefresh';

// Every game reloads on a pull down (components/PullToRefresh.tsx). Made once here,
// not inline, so a re-render never swaps in a new screen component.
const AviatorScreenWithRefresh = withPullToRefresh(AviatorScreen);
const ChickenRoadScreenWithRefresh = withPullToRefresh(ChickenRoadScreen);
const MinesScreenWithRefresh = withPullToRefresh(MinesScreen);
const SevenUpDownScreenWithRefresh = withPullToRefresh(SevenUpDownScreen);
const PlinkoScreenWithRefresh = withPullToRefresh(PlinkoScreen);
const DragonTigerScreenWithRefresh = withPullToRefresh(DragonTigerScreen);
const VortexScreenWithRefresh = withPullToRefresh(VortexScreen);
const AndarBaharScreenWithRefresh = withPullToRefresh(AndarBaharScreen);
const TeenPattiScreenWithRefresh = withPullToRefresh(TeenPattiScreen);
const CricketXScreenWithRefresh = withPullToRefresh(CricketXScreen);
const RocketScreenWithRefresh = withPullToRefresh(RocketScreen);
const GoalRushScreenWithRefresh = withPullToRefresh(GoalRushScreen);
const BigCatchScreenWithRefresh = withPullToRefresh(BigCatchScreen);
const CosmonautScreenWithRefresh = withPullToRefresh(CosmonautScreen);
const SkyJetScreenWithRefresh = withPullToRefresh(SkyJetScreen);
const NightRacerScreenWithRefresh = withPullToRefresh(NightRacerScreen);
const AirshipScreenWithRefresh = withPullToRefresh(AirshipScreen);
const GatesOfZeusScreenWithRefresh = withPullToRefresh(GatesOfZeusScreen);
const WolfMoonScreenWithRefresh = withPullToRefresh(WolfMoonScreen);
const PenaltyHeroScreenWithRefresh = withPullToRefresh(PenaltyHeroScreen);
const LuckyCupsScreenWithRefresh = withPullToRefresh(LuckyCupsScreen);
const BombSquadScreenWithRefresh = withPullToRefresh(BombSquadScreen);
const VaultHeistScreenWithRefresh = withPullToRefresh(VaultHeistScreen);
const TreasureDigScreenWithRefresh = withPullToRefresh(TreasureDigScreen);
const LuckyWheelScreenWithRefresh = withPullToRefresh(LuckyWheelScreen);
const ScratchCardScreenWithRefresh = withPullToRefresh(ScratchCardScreen);
const DiceDuelScreenWithRefresh = withPullToRefresh(DiceDuelScreen);
const ColorBallScreenWithRefresh = withPullToRefresh(ColorBallScreen);
const FortuneSixScreenWithRefresh = withPullToRefresh(FortuneSixScreen);
const FruitMachineScreenWithRefresh = withPullToRefresh(FruitMachineScreen);
const FishermansCatchScreenWithRefresh = withPullToRefresh(FishermansCatchScreen);
const BookOfPharaohScreenWithRefresh = withPullToRefresh(BookOfPharaohScreen);
const MoneyComingScreenWithRefresh = withPullToRefresh(MoneyComingScreen);
const JhandiMundaScreenWithRefresh = withPullToRefresh(JhandiMundaScreen);
const RouletteScreenWithRefresh = withPullToRefresh(RouletteScreen);
const K3LotteryScreenWithRefresh = withPullToRefresh(K3LotteryScreen);
const WinGoScreenWithRefresh = withPullToRefresh(WinGoScreen);
const FiveDLotteryScreenWithRefresh = withPullToRefresh(FiveDLotteryScreen);
const TrxWinScreenWithRefresh = withPullToRefresh(TrxWinScreen);
const BaccaratScreenWithRefresh = withPullToRefresh(BaccaratScreen);
const SlotScreenWithRefresh = withPullToRefresh(SlotScreen);
const AcesScreenWithRefresh = withPullToRefresh(AcesScreen);
const DiceScreenWithRefresh = withPullToRefresh(DiceScreen);
const LimboScreenWithRefresh = withPullToRefresh(LimboScreen);
const BlackjackScreenWithRefresh = withPullToRefresh(BlackjackScreen);
const KenoScreenWithRefresh = withPullToRefresh(KenoScreen);
const HiloScreenWithRefresh = withPullToRefresh(HiloScreen);
const DragonTowerScreenWithRefresh = withPullToRefresh(DragonTowerScreen);
const VideoPokerScreenWithRefresh = withPullToRefresh(VideoPokerScreen);
const DiamondsScreenWithRefresh = withPullToRefresh(DiamondsScreen);
const PumpScreenWithRefresh = withPullToRefresh(PumpScreen);
const CoinFlipScreenWithRefresh = withPullToRefresh(CoinFlipScreen);
const CasinoHoldemScreenWithRefresh = withPullToRefresh(CasinoHoldemScreen);
const ThreeCardPokerScreenWithRefresh = withPullToRefresh(ThreeCardPokerScreen);
const CandyBlastScreenWithRefresh = withPullToRefresh(CandyBlastScreen);
const Neon777ScreenWithRefresh = withPullToRefresh(Neon777Screen);

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
      <Stack.Screen name="Help" component={CustomerServiceScreen} />
      <Stack.Screen name="FAQ" component={HelpScreen} />
      <Stack.Screen name="SupportForm" component={SupportFormScreen} />
      <Stack.Screen name="SupportProgress" component={SupportProgressScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="BalanceRecords" component={BalanceRecordsScreen} />
      <Stack.Screen name="History" component={HistoryScreen} />
      <Stack.Screen name="Deposit" component={DepositScreen} />
      <Stack.Screen name="Withdraw" component={WithdrawScreen} />
      <Stack.Screen name="AgentRewards" component={AgentRewardsScreen} />
      <Stack.Screen name="AgentTeam" component={AgentTeamScreen} />
      <Stack.Screen name="AgentJackpot" component={AgentJackpotScreen} />
      <Stack.Screen name="Aviator" component={AviatorScreenWithRefresh} />
      <Stack.Screen name="ChickenRoad" component={ChickenRoadScreenWithRefresh} />
      <Stack.Screen name="Mines" component={MinesScreenWithRefresh} />
      <Stack.Screen name="SevenUpDown" component={SevenUpDownScreenWithRefresh} />
      <Stack.Screen name="Plinko" component={PlinkoScreenWithRefresh} />
      <Stack.Screen name="DragonTiger" component={DragonTigerScreenWithRefresh} />
      <Stack.Screen name="Vortex" component={VortexScreenWithRefresh} />
      <Stack.Screen name="AndarBahar" component={AndarBaharScreenWithRefresh} />
      <Stack.Screen name="TeenPatti" component={TeenPattiScreenWithRefresh} />
      <Stack.Screen name="CricketX" component={CricketXScreenWithRefresh} />
      <Stack.Screen name="Rocket" component={RocketScreenWithRefresh} />
      <Stack.Screen name="GoalRush" component={GoalRushScreenWithRefresh} />
      <Stack.Screen name="BigCatch" component={BigCatchScreenWithRefresh} />
      <Stack.Screen name="Cosmonaut" component={CosmonautScreenWithRefresh} />
      <Stack.Screen name="SkyJet" component={SkyJetScreenWithRefresh} />
      <Stack.Screen name="NightRacer" component={NightRacerScreenWithRefresh} />
      <Stack.Screen name="Airship" component={AirshipScreenWithRefresh} />
      <Stack.Screen name="GatesOfZeus" component={GatesOfZeusScreenWithRefresh} />
      <Stack.Screen name="WolfMoon" component={WolfMoonScreenWithRefresh} />
      <Stack.Screen name="PenaltyHero" component={PenaltyHeroScreenWithRefresh} />
      <Stack.Screen name="LuckyCups" component={LuckyCupsScreenWithRefresh} />
      <Stack.Screen name="BombSquad" component={BombSquadScreenWithRefresh} />
      <Stack.Screen name="VaultHeist" component={VaultHeistScreenWithRefresh} />
      <Stack.Screen name="TreasureDig" component={TreasureDigScreenWithRefresh} />
      <Stack.Screen name="LuckyWheel" component={LuckyWheelScreenWithRefresh} />
      <Stack.Screen name="ScratchCard" component={ScratchCardScreenWithRefresh} />
      <Stack.Screen name="DiceDuel" component={DiceDuelScreenWithRefresh} />
      <Stack.Screen name="ColorBall" component={ColorBallScreenWithRefresh} />
      <Stack.Screen name="FortuneSix" component={FortuneSixScreenWithRefresh} />
      <Stack.Screen name="FruitMachine" component={FruitMachineScreenWithRefresh} />
      <Stack.Screen name="FishermansCatch" component={FishermansCatchScreenWithRefresh} />
      <Stack.Screen name="BookOfPharaoh" component={BookOfPharaohScreenWithRefresh} />
      <Stack.Screen name="MoneyComing" component={MoneyComingScreenWithRefresh} />
      <Stack.Screen name="GiftCode" component={GiftCodeScreen} />
      <Stack.Screen name="JhandiMunda" component={JhandiMundaScreenWithRefresh} />
      <Stack.Screen name="Roulette" component={RouletteScreenWithRefresh} />
      <Stack.Screen name="K3Lottery" component={K3LotteryScreenWithRefresh} />
      <Stack.Screen name="WinGo" component={WinGoScreenWithRefresh} />
      <Stack.Screen name="FiveDLottery" component={FiveDLotteryScreenWithRefresh} />
      <Stack.Screen name="TrxWin" component={TrxWinScreenWithRefresh} />
      <Stack.Screen name="Baccarat" component={BaccaratScreenWithRefresh} />
      <Stack.Screen name="Slot" component={SlotScreenWithRefresh} />
      <Stack.Screen name="Aces" component={AcesScreenWithRefresh} />
      <Stack.Screen name="Dice" component={DiceScreenWithRefresh} />
      <Stack.Screen name="Limbo" component={LimboScreenWithRefresh} />
      <Stack.Screen name="Blackjack" component={BlackjackScreenWithRefresh} />
      <Stack.Screen name="Keno" component={KenoScreenWithRefresh} />
      <Stack.Screen name="Hilo" component={HiloScreenWithRefresh} />
      <Stack.Screen name="DragonTower" component={DragonTowerScreenWithRefresh} />
      <Stack.Screen name="VideoPoker" component={VideoPokerScreenWithRefresh} />
      <Stack.Screen name="Diamonds" component={DiamondsScreenWithRefresh} />
      <Stack.Screen name="Pump" component={PumpScreenWithRefresh} />
      <Stack.Screen name="CoinFlip" component={CoinFlipScreenWithRefresh} />
      <Stack.Screen name="CasinoHoldem" component={CasinoHoldemScreenWithRefresh} />
      <Stack.Screen name="ThreeCardPoker" component={ThreeCardPokerScreenWithRefresh} />
      <Stack.Screen name="CandyBlast" component={CandyBlastScreenWithRefresh} />
      <Stack.Screen name="Neon777" component={Neon777ScreenWithRefresh} />
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
