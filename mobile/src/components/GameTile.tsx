import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { SymbolIcon } from '../screens/JhandiMundaScreen';
import { RouletteTileArt } from '../screens/RouletteScreen';
import { K3TileArt } from '../screens/K3LotteryScreen';
import { FiveDTileArt } from '../screens/FiveDLotteryScreen';
import { TrxTileArt } from '../screens/TrxWinScreen';
import { BaccaratTileArt } from '../screens/BaccaratScreen';
import { SlotTileArt } from '../screens/SlotScreen';
import { AcesTileArt } from '../screens/AcesScreen';
import { DiceTileArt } from '../screens/DiceScreen';
import { LimboTileArt } from '../screens/LimboScreen';
import { BlackjackTileArt } from '../screens/BlackjackScreen';
import { KenoTileArt } from '../screens/KenoScreen';
import { HiloTileArt } from '../screens/HiloScreen';
import { DragonTowerTileArt } from '../screens/DragonTowerScreen';
import { VideoPokerTileArt } from '../screens/VideoPokerScreen';
import { DiamondsTileArt } from '../screens/DiamondsScreen';
import { PumpTileArt } from '../screens/PumpScreen';
import { CoinFlipTileArt } from '../screens/CoinFlipScreen';
import { CasinoHoldemTileArt } from '../screens/CasinoHoldemScreen';
import { ThreeCardPokerTileArt } from '../screens/ThreeCardPokerScreen';
import { CandyBlastTileArt } from '../screens/CandyBlastScreen';
import { Neon777TileArt } from '../screens/Neon777Screen';
import { RocketTileArt } from '../screens/RocketScreen';
import { GoalRushTileArt } from '../screens/GoalRushScreen';
import { BigCatchTileArt } from '../screens/BigCatchScreen';
import { CosmonautTileArt } from '../screens/CosmonautScreen';
import { SkyJetTileArt } from '../screens/SkyJetScreen';
import { NightRacerTileArt } from '../screens/NightRacerScreen';
import { AirshipTileArt } from '../screens/AirshipScreen';
import { GatesOfZeusTileArt } from '../screens/GatesOfZeusScreen';
import { WolfMoonTileArt } from '../screens/WolfMoonScreen';
import { PenaltyHeroTileArt } from '../screens/PenaltyHeroScreen';
import { LuckyCupsTileArt } from '../screens/LuckyCupsScreen';
import { BombSquadTileArt } from '../screens/BombSquadScreen';
import { VaultHeistTileArt } from '../screens/VaultHeistScreen';
import { TreasureDigTileArt } from '../screens/TreasureDigScreen';
import { LuckyWheelTileArt } from '../screens/LuckyWheelScreen';
import { ScratchCardTileArt } from '../screens/ScratchCardScreen';
import { DiceDuelTileArt } from '../screens/DiceDuelScreen';
import { ColorBallTileArt } from '../screens/ColorBallScreen';
import { FortuneSixTileArt } from '../screens/FortuneSixScreen';
import { FruitMachineTileArt } from '../screens/FruitMachineScreen';
import { FishermansCatchTileArt } from '../screens/FishermansCatchScreen';
import { BookOfPharaohTileArt } from '../screens/BookOfPharaohScreen';
import { MoneyComingTileArt } from '../screens/MoneyComingScreen';
import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { Image, ImageSourcePropType, Pressable, Text, View } from 'react-native';

/** Size of a game tile, the same on the home grid and the category pages. */
export const GAME_ICON_SIZE = 150;

export type GameId =
  | 'WinGo'
  | 'Aviator'
  | 'ChickenRoad'
  | 'Mines'
  | 'SevenUpDown'
  | 'Plinko'
  | 'DragonTiger'
  | 'Vortex'
  | 'AndarBahar'
  | 'TeenPatti'
  | 'CricketX'
  | 'JhandiMunda'
  | 'Roulette'
  | 'K3Lottery'
  | 'FiveDLottery'
  | 'TrxWin'
  | 'Baccarat'
  | 'Slot'
  | 'Aces'
  | 'Dice'
  | 'Limbo'
  | 'Blackjack'
  | 'Keno'
  | 'Hilo'
  | 'DragonTower'
  | 'VideoPoker'
  | 'Diamonds'
  | 'Pump'
  | 'CoinFlip'
  | 'CasinoHoldem'
  | 'ThreeCardPoker'
  | 'CandyBlast'
  | 'Neon777'
  | 'Rocket'
  | 'GoalRush'
  | 'BigCatch'
  | 'Cosmonaut'
  | 'SkyJet'
  | 'NightRacer'
  | 'Airship'
  | 'GatesOfZeus'
  | 'WolfMoon'
  | 'PenaltyHero'
  | 'LuckyCups'
  | 'BombSquad'
  | 'VaultHeist'
  | 'TreasureDig'
  | 'LuckyWheel'
  | 'ScratchCard'
  | 'DiceDuel'
  | 'ColorBall'
  | 'FortuneSix'
  | 'FruitMachine'
  | 'FishermansCatch'
  | 'BookOfPharaoh'
  | 'MoneyComing';

export type GameCategory = {
  id: string;
  title: string;
  games: GameId[];
  banner: ImageSourcePropType;
  /** The banner image's width / height, so it keeps its shape at any width. */
  bannerAspect: number;
};

export const GAME_CATEGORIES: GameCategory[] = [
  { id: 'card-table', title: 'Card & Table', games: ['AndarBahar', 'TeenPatti', 'DragonTiger', 'Baccarat', 'Blackjack', 'Roulette', 'Hilo', 'VideoPoker', 'CasinoHoldem', 'ThreeCardPoker'], banner: require('../../assets/banners/card-table.webp'), bannerAspect: 763 / 155 },
  { id: 'dice-instant', title: 'Dice & Instant', games: ['Dice', 'Limbo', 'Plinko', 'SevenUpDown', 'Diamonds', 'Keno', 'LuckyWheel', 'ScratchCard', 'DiceDuel', 'ColorBall'], banner: require('../../assets/banners/dice-instant.webp'), bannerAspect: 763 / 143 },
  { id: 'lottery', title: 'Lottery', games: ['WinGo', 'K3Lottery', 'FiveDLottery', 'TrxWin', 'JhandiMunda', 'FortuneSix'], banner: require('../../assets/banners/lottery.webp'), bannerAspect: 763 / 143 },
  { id: 'mines-cashout', title: 'Mines & Cash-out', games: ['Mines', 'ChickenRoad', 'DragonTower', 'Pump', 'CoinFlip', 'PenaltyHero', 'LuckyCups', 'BombSquad', 'VaultHeist', 'TreasureDig'], banner: require('../../assets/banners/mines-cashout.webp'), bannerAspect: 763 / 139 },
  { id: 'slots', title: 'Slots', games: ['Slot', 'Aces', 'CandyBlast', 'Neon777', 'MoneyComing', 'FruitMachine', 'FishermansCatch', 'BookOfPharaoh', 'GatesOfZeus', 'WolfMoon'], banner: require('../../assets/banners/slots.webp'), bannerAspect: 763 / 131 },
  { id: 'crash', title: 'Crash', games: ['Aviator', 'CricketX', 'Vortex', 'Rocket', 'GoalRush', 'BigCatch', 'Cosmonaut', 'SkyJet', 'NightRacer', 'Airship'], banner: require('../../assets/banners/crash.webp'), bannerAspect: 763 / 141 },
];

/** Games drawn with a supplied icon image instead of their built-in tile art. */
const ICONS: Partial<Record<GameId, ImageSourcePropType>> = {
  Aviator: require('../../assets/icons/aviator.webp'),
  Vortex: require('../../assets/icons/vortex.webp'),
  ChickenRoad: require('../../assets/icons/chicken-road.webp'),
  Mines: require('../../assets/icons/mines.webp'),
};

/** One game's tile at `size` points square; tapping it opens the game. */
export function GameTile({ id, size = GAME_ICON_SIZE }: { id: GameId; size?: number }) {
  const navigation = useNavigation();
  const icon = ICONS[id];
  if (icon) {
    return (
      <Pressable onPress={() => (navigation as any).navigate(id)} style={{ width: size, height: size }} accessibilityRole="button">
        <Image source={icon} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
      </Pressable>
    );
  }
  // The built-in tiles are laid out at GAME_ICON_SIZE; shrink or grow them as a whole.
  const k = size / GAME_ICON_SIZE;
  const shift = (size - GAME_ICON_SIZE) / 2;
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ width: GAME_ICON_SIZE, height: GAME_ICON_SIZE, transform: [{ translateX: shift }, { translateY: shift }, { scale: k }] }}>
        {builtInTile(id, navigation)}
      </View>
    </View>
  );
}

function builtInTile(id: GameId, navigation: ReturnType<typeof useNavigation>) {
  switch (id) {
    case 'WinGo':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('WinGo')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            overflow: 'hidden',
          }}
        >
          <Image
            source={require('../../assets/wingo-home-icon.webp')}
            style={{ width: '100%', height: '100%' }}
            resizeMode="contain"
          />
        </Pressable>
      );
    case 'SevenUpDown':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('SevenUpDown')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            backgroundColor: '#0C5230',
            borderWidth: 2,
            borderColor: '#B7791F',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: GAME_ICON_SIZE * 0.36 }}>🎲</Text>
          <Text style={{ color: '#FFD66B', fontSize: 18, fontWeight: '900', marginTop: 2 }}>7 UP DOWN</Text>
        </Pressable>
      );
    case 'Plinko':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('Plinko')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            backgroundColor: '#1B0B45',
            borderWidth: 2,
            borderColor: '#8A4DFF',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* A tiny pin pyramid with a ball, drawn instead of an emoji. */}
          {[1, 2, 3, 4].map((n) => (
            <View key={n} style={{ flexDirection: 'row', gap: 9, marginBottom: 7 }}>
              {Array.from({ length: n }, (_, i) => (
                <View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#E9D8FF' }} />
              ))}
            </View>
          ))}
          <View style={{ position: 'absolute', top: 22, right: 44, width: 14, height: 14, borderRadius: 7, backgroundColor: '#FF3D9A' }} />
          <Text style={{ color: '#FFD66B', fontSize: 20, fontWeight: '900', marginTop: 2, letterSpacing: 2 }}>PLINKO</Text>
        </Pressable>
      );
    case 'DragonTiger':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('DragonTiger')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#D9A441',
            flexDirection: 'row',
          }}
        >
          <View style={{ flex: 1, backgroundColor: '#1F3F9E', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 40 }}>🐉</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: '#9E1F2E', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 40 }}>🐯</Text>
          </View>
          <View style={{ position: 'absolute', bottom: 8, left: 0, right: 0, alignItems: 'center' }}>
            <Text style={{ color: '#FFD66B', fontSize: 15, fontWeight: '900', letterSpacing: 1 }}>DRAGON TIGER</Text>
          </View>
        </Pressable>
      );
    case 'AndarBahar':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('AndarBahar')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#D9A441',
            backgroundColor: '#3A0A2E',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: '#2F6BE0', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#FFFFFF', fontSize: 26, fontWeight: '900' }}>A</Text>
            </View>
            <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: '#E0303F', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#FFFFFF', fontSize: 26, fontWeight: '900' }}>B</Text>
            </View>
          </View>
          <Text style={{ color: '#FFD66B', fontSize: 15, fontWeight: '900', letterSpacing: 1, marginTop: 8 }}>ANDAR BAHAR</Text>
        </Pressable>
      );
    case 'TeenPatti':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('TeenPatti')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            borderWidth: 2,
            borderColor: '#D9A441',
            backgroundColor: '#0E4A2E',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 60 }}>
            {['A♠', 'K♥', 'Q♦'].map((c, i) => (
              <View
                key={c}
                style={{
                  width: 34,
                  height: 48,
                  borderRadius: 5,
                  backgroundColor: '#FFFFFF',
                  marginLeft: i ? -10 : 0,
                  transform: [{ rotate: `${(i - 1) * 14}deg` }, { translateY: i === 1 ? -6 : 0 }],
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: '#CCCCCC',
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '900', color: i === 0 ? '#111111' : '#D0142C' }}>{c}</Text>
              </View>
            ))}
          </View>
          <Text style={{ color: '#FFD66B', fontSize: 15, fontWeight: '900', letterSpacing: 1, marginTop: 6 }}>TEEN PATTI</Text>
        </Pressable>
      );
    case 'CricketX':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('CricketX')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#4FC3FF',
            backgroundColor: '#0B1A3A',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '38%', backgroundColor: '#17702F' }} />
          <MaterialCommunityIcons name="cricket" size={GAME_ICON_SIZE * 0.42} color="#FFFFFF" />
          <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '900', fontStyle: 'italic', letterSpacing: 2, marginTop: 2 }}>
            CRICKET <Text style={{ color: '#FF4F6D' }}>X</Text>
          </Text>
        </Pressable>
      );
    case 'JhandiMunda':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('JhandiMunda')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#FFD66B',
            backgroundColor: '#5A0A22',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View style={{ flexDirection: 'row' }}>
            {(['HEART', 'CROWN', 'FLAG'] as const).map((sym, i) => (
              <View
                key={sym}
                style={{
                  width: GAME_ICON_SIZE * 0.26,
                  height: GAME_ICON_SIZE * 0.26,
                  borderRadius: 6,
                  backgroundColor: '#FFF6E2',
                  marginLeft: i ? -4 : 0,
                  transform: [{ rotate: `${(i - 1) * 12}deg` }, { translateY: i === 1 ? -6 : 0 }],
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: '#C9972E',
                }}
              >
                <SymbolIcon symbol={sym} size={GAME_ICON_SIZE * 0.18} />
              </View>
            ))}
          </View>
          <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '900', letterSpacing: 1, marginTop: 8 }}>
            JHANDI <Text style={{ color: '#FFD66B' }}>MUNDA</Text>
          </Text>
        </Pressable>
      );
    case 'Roulette':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('Roulette')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#E9C46A',
            backgroundColor: '#0A3D22',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <RouletteTileArt size={GAME_ICON_SIZE * 0.62} />
          <Text style={{ color: '#E9C46A', fontSize: 15, fontWeight: '900', letterSpacing: 2, marginTop: 4 }}>ROULETTE</Text>
        </Pressable>
      );
    case 'K3Lottery':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('K3Lottery')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#F4CF6A',
            backgroundColor: '#12743F',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <K3TileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '900', letterSpacing: 1, marginTop: 8 }}>
            K3 <Text style={{ color: '#F4CF6A' }}>LOTTERY</Text>
          </Text>
        </Pressable>
      );
    case 'FiveDLottery':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('FiveDLottery')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#F4CF6A',
            backgroundColor: '#12743F',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <FiveDTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '900', letterSpacing: 1, marginTop: 10 }}>
            5D <Text style={{ color: '#F4CF6A' }}>LOTTERY</Text>
          </Text>
        </Pressable>
      );
    case 'TrxWin':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('TrxWin')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#F4CF6A',
            backgroundColor: '#12743F',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <TrxTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '900', letterSpacing: 1, marginTop: 14 }}>
            TRX <Text style={{ color: '#F4CF6A' }}>WIN GO</Text>
          </Text>
        </Pressable>
      );
    case 'Baccarat':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('Baccarat')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#FFD66B',
            backgroundColor: '#0C1538',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '42%', backgroundColor: '#4A0B1E', borderTopWidth: 2, borderTopColor: '#E9B949' }} />
          <BaccaratTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFD66B', fontSize: 15, fontWeight: '900', letterSpacing: 2, marginTop: 10, fontFamily: 'serif' }}>BACCARAT</Text>
        </Pressable>
      );
    case 'Slot':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('Slot')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#FFD66B',
            backgroundColor: '#2A0B45',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <SlotTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFD66B', fontSize: 15, fontWeight: '900', letterSpacing: 1.5, marginTop: 8, fontFamily: 'serif' }}>ROYAL GEMS</Text>
          <Text style={{ color: 'rgba(235,220,255,0.75)', fontSize: 10, fontWeight: '800', letterSpacing: 2 }}>SLOT</Text>
        </Pressable>
      );
    case 'Aces':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('Aces')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#FFD66B',
            backgroundColor: '#2A0508',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AcesTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFD66B', fontSize: 15, fontWeight: '900', letterSpacing: 1.5, marginTop: 6, fontFamily: 'serif' }}>GOLDEN ACES</Text>
          <Text style={{ color: 'rgba(255,225,215,0.75)', fontSize: 10, fontWeight: '800', letterSpacing: 2 }}>SLOT</Text>
        </Pressable>
      );
    case 'Dice':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('Dice')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#3DF2FF',
            backgroundColor: '#031423',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 18,
          }}
        >
          <DiceTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#E9FBFF', fontSize: 22, fontWeight: '900', letterSpacing: 6, fontFamily: 'serif', textShadowColor: '#0E7490', textShadowRadius: 8 }}>DICE</Text>
        </Pressable>
      );
    case 'Limbo':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('Limbo')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#FF5FD2',
            backgroundColor: '#0A0320',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 18,
          }}
        >
          <LimboTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#F5EEFF', fontSize: 22, fontWeight: '900', letterSpacing: 6, fontFamily: 'serif', textShadowColor: '#C026D3', textShadowRadius: 8 }}>LIMBO</Text>
        </Pressable>
      );
    case 'Blackjack':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('Blackjack')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#F4CF6B',
            backgroundColor: '#04301E',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 16,
          }}
        >
          <BlackjackTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#F4CF6B', fontSize: 18, fontWeight: '900', letterSpacing: 3, fontFamily: 'serif', textShadowColor: '#000', textShadowRadius: 6 }}>BLACKJACK</Text>
        </Pressable>
      );
    case 'Keno':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('Keno')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#FFB547',
            backgroundColor: '#050A24',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 16,
          }}
        >
          <KenoTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFD08A', fontSize: 24, fontWeight: '900', letterSpacing: 7, fontFamily: 'serif', textShadowColor: '#B45309', textShadowRadius: 8 }}>KENO</Text>
        </Pressable>
      );
    case 'Hilo':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('Hilo')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#FF6B4A',
            backgroundColor: '#0C0E12',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 14,
          }}
        >
          <HiloTileArt size={GAME_ICON_SIZE} />
          <Text style={{ fontSize: 24, fontWeight: '900', letterSpacing: 4, fontFamily: 'serif' }}>
            <Text style={{ color: '#7CF5C9' }}>HI</Text>
            <Text style={{ color: '#FFD66B' }}>·</Text>
            <Text style={{ color: '#FF9C84' }}>LO</Text>
          </Text>
        </Pressable>
      );
    case 'DragonTower':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('DragonTower')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#FFD66B',
            backgroundColor: '#031416',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 10,
          }}
        >
          <DragonTowerTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFD66B', fontSize: 15, fontWeight: '900', letterSpacing: 2, fontFamily: 'serif', textAlign: 'center', lineHeight: 17, textShadowColor: '#000', textShadowRadius: 6 }}>{'DRAGON\nTOWER'}</Text>
        </Pressable>
      );
    case 'VideoPoker':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('VideoPoker')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#FFD66B',
            backgroundColor: '#060C3A',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 10,
          }}
        >
          <VideoPokerTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFE58A', fontSize: 15, fontWeight: '900', letterSpacing: 2, fontFamily: 'serif', textAlign: 'center', lineHeight: 17, textShadowColor: '#000', textShadowRadius: 6 }}>{'VIDEO\nPOKER'}</Text>
        </Pressable>
      );
    case 'Diamonds':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('Diamonds')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#D8B4FE',
            backgroundColor: '#12051F',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 16,
          }}
        >
          <DiamondsTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#F5EEFF', fontSize: 19, fontWeight: '900', letterSpacing: 3, fontFamily: 'serif', textShadowColor: '#A855F7', textShadowRadius: 10 }}>DIAMONDS</Text>
        </Pressable>
      );
    case 'Pump':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('Pump')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#F472B6',
            backgroundColor: '#0B0822',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 14,
          }}
        >
          <PumpTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FDF2F8', fontSize: 24, fontWeight: '900', letterSpacing: 6, textShadowColor: '#EC4899', textShadowRadius: 10 }}>PUMP</Text>
        </Pressable>
      );
    case 'CoinFlip':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('CoinFlip')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#FFD66B',
            backgroundColor: '#12040A',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 12,
          }}
        >
          <CoinFlipTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFE58A', fontSize: 16, fontWeight: '900', letterSpacing: 2, fontFamily: 'serif', textAlign: 'center', lineHeight: 18, textShadowColor: '#000', textShadowRadius: 6 }}>{'COIN\nFLIP'}</Text>
        </Pressable>
      );
    case 'CasinoHoldem':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('CasinoHoldem')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#F5C84C',
            backgroundColor: '#2A0606',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 10,
          }}
        >
          <CasinoHoldemTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFF6DF', fontSize: 15, fontWeight: '900', letterSpacing: 2, fontFamily: 'serif', textAlign: 'center', lineHeight: 17, textShadowColor: '#000', textShadowRadius: 6 }}>{"CASINO\nHOLD'EM"}</Text>
        </Pressable>
      );
    case 'ThreeCardPoker':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('ThreeCardPoker')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#E9C46A',
            backgroundColor: '#081336',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 10,
          }}
        >
          <ThreeCardPokerTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFF6DF', fontSize: 14, fontWeight: '900', letterSpacing: 1.5, fontFamily: 'serif', textAlign: 'center', lineHeight: 16, textShadowColor: '#000', textShadowRadius: 6 }}>{'THREE CARD\nPOKER'}</Text>
        </Pressable>
      );
    case 'CandyBlast':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('CandyBlast')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#FFE0F0',
            backgroundColor: '#C98BFF',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 10,
          }}
        >
          <CandyBlastTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '900', letterSpacing: 2, textAlign: 'center', lineHeight: 18, textShadowColor: '#B0105E', textShadowRadius: 6 }}>{'CANDY\nBLAST'}</Text>
        </Pressable>
      );
    case 'Neon777':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('Neon777')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#FF2D95',
            backgroundColor: '#07010F',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 10,
          }}
        >
          <Neon777TileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '900', fontStyle: 'italic', letterSpacing: 2, textAlign: 'center', lineHeight: 19, textShadowColor: '#FF2D95', textShadowRadius: 8 }}>{'NEON\n777'}</Text>
        </Pressable>
      );
    case 'Rocket':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('Rocket')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#B06CFF',
            backgroundColor: '#0B0420',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 10,
          }}
        >
          <RocketTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFFFFF', fontSize: 19, fontWeight: '900', fontStyle: 'italic', letterSpacing: 3, textShadowColor: '#FF3DA6', textShadowRadius: 8 }}>ROCKET</Text>
        </Pressable>
      );
    case 'GoalRush':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('GoalRush')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#2FE07A',
            backgroundColor: '#02101C',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 10,
          }}
        >
          <GoalRushTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '900', fontStyle: 'italic', letterSpacing: 2, textAlign: 'center', lineHeight: 19, textShadowColor: '#2FE07A', textShadowRadius: 8 }}>{'GOAL\nRUSH'}</Text>
        </Pressable>
      );
    case 'BigCatch':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('BigCatch')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#3CF0D0',
            backgroundColor: '#03182A',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 10,
          }}
        >
          <BigCatchTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '900', fontStyle: 'italic', letterSpacing: 2, textAlign: 'center', lineHeight: 19, textShadowColor: '#3CF0D0', textShadowRadius: 8 }}>{'BIG\nCATCH'}</Text>
        </Pressable>
      );
    case 'Cosmonaut':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('Cosmonaut')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#9B7BFF',
            backgroundColor: '#0A0420',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 10,
          }}
        >
          <CosmonautTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '900', fontStyle: 'italic', letterSpacing: 1, textShadowColor: '#9B7BFF', textShadowRadius: 8 }}>COSMONAUT</Text>
        </Pressable>
      );
    case 'SkyJet':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('SkyJet')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#FFB23F',
            backgroundColor: '#0A1A4A',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 10,
          }}
        >
          <SkyJetTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFFFFF', fontSize: 19, fontWeight: '900', fontStyle: 'italic', letterSpacing: 2, textShadowColor: '#FFB23F', textShadowRadius: 8 }}>SKY JET</Text>
        </Pressable>
      );
    case 'NightRacer':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('NightRacer')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#FF2E88',
            backgroundColor: '#0A0420',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 10,
          }}
        >
          <NightRacerTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '900', fontStyle: 'italic', letterSpacing: 2, textAlign: 'center', lineHeight: 19, textShadowColor: '#FF2E88', textShadowRadius: 8 }}>{'NIGHT\nRACER'}</Text>
        </Pressable>
      );
    case 'Airship':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('Airship')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#D8A84A',
            backgroundColor: '#2A1E3A',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 10,
          }}
        >
          <AirshipTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFE2A0', fontSize: 19, fontWeight: '900', letterSpacing: 3, fontFamily: 'serif', textShadowColor: '#000', textShadowRadius: 6 }}>AIRSHIP</Text>
        </Pressable>
      );
    case 'FruitMachine':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('FruitMachine')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#FFD166',
            backgroundColor: '#2A0006',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 10,
          }}
        >
          <FruitMachineTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '900', fontStyle: 'italic', letterSpacing: 2, textAlign: 'center', lineHeight: 19, textShadowColor: '#FF3B4E', textShadowRadius: 8 }}>{'FRUIT\nMACHINE'}</Text>
        </Pressable>
      );
    case 'FishermansCatch':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('FishermansCatch')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#5FD0FF',
            backgroundColor: '#1A0F3A',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 10,
          }}
        >
          <FishermansCatchTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '900', fontStyle: 'italic', letterSpacing: 2, textAlign: 'center', lineHeight: 19, textShadowColor: '#1E88E5', textShadowRadius: 8 }}>{"FISHERMAN'S\nCATCH"}</Text>
        </Pressable>
      );
    case 'BookOfPharaoh':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('BookOfPharaoh')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#F5C542',
            backgroundColor: '#2A1A0A',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 10,
          }}
        >
          <BookOfPharaohTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '900', fontStyle: 'italic', letterSpacing: 2, textAlign: 'center', lineHeight: 19, textShadowColor: '#9A6A10', textShadowRadius: 8 }}>{'BOOK OF\nPHARAOH'}</Text>
        </Pressable>
      );
    case 'GatesOfZeus':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('GatesOfZeus')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#FFD66B',
            backgroundColor: '#1E3A7A',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 8,
          }}
        >
          <GatesOfZeusTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFF4C8', fontSize: 13, fontWeight: '900', letterSpacing: 2, textAlign: 'center', lineHeight: 16, fontFamily: 'serif', textShadowColor: '#000', textShadowRadius: 6 }}>{'GATES OF\nZEUS'}</Text>
        </Pressable>
      );
    case 'WolfMoon':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('WolfMoon')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#3FC1B0',
            backgroundColor: '#2A1640',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 8,
          }}
        >
          <WolfMoonTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFF1D6', fontSize: 14, fontWeight: '900', letterSpacing: 2, textAlign: 'center', lineHeight: 17, textShadowColor: '#000', textShadowRadius: 6 }}>{'WOLF\nMOON'}</Text>
        </Pressable>
      );
    case 'PenaltyHero':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('PenaltyHero')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#C6FF3A',
            backgroundColor: '#0A1230',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 6,
          }}
        >
          <PenaltyHeroTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '900', fontStyle: 'italic', letterSpacing: 1.5, textAlign: 'center', lineHeight: 16, textShadowColor: '#000', textShadowRadius: 6 }}>{'PENALTY\nHERO'}</Text>
        </Pressable>
      );
    case 'LuckyCups':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('LuckyCups')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#FFD66B',
            backgroundColor: '#4A0A1E',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 6,
          }}
        >
          <LuckyCupsTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFF4DC', fontSize: 14, fontWeight: '900', letterSpacing: 2, textAlign: 'center', lineHeight: 16, fontFamily: 'serif', textShadowColor: '#000', textShadowRadius: 6 }}>{'LUCKY\nCUPS'}</Text>
        </Pressable>
      );
    case 'BombSquad':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('BombSquad')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#FFC21A',
            backgroundColor: '#14171C',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 8,
          }}
        >
          <BombSquadTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFC21A', fontSize: 14, fontWeight: '900', letterSpacing: 2, textAlign: 'center', lineHeight: 16, textShadowColor: '#000', textShadowRadius: 6 }}>{'BOMB\nSQUAD'}</Text>
        </Pressable>
      );
    case 'VaultHeist':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('VaultHeist')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#3CE0FF',
            backgroundColor: '#0A0E16',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 6,
          }}
        >
          <VaultHeistTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#E4ECF4', fontSize: 14, fontWeight: '900', letterSpacing: 2, textAlign: 'center', lineHeight: 16, textShadowColor: '#000', textShadowRadius: 6 }}>{'VAULT\nHEIST'}</Text>
        </Pressable>
      );
    case 'TreasureDig':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('TreasureDig')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#FFD66B',
            backgroundColor: '#1AA8C8',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 6,
          }}
        >
          <TreasureDigTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFD66B', fontSize: 14, fontWeight: '900', letterSpacing: 1.5, textAlign: 'center', lineHeight: 16, fontFamily: 'serif', textShadowColor: '#2A1404', textShadowRadius: 6 }}>{'TREASURE\nDIG'}</Text>
        </Pressable>
      );
    case 'LuckyWheel':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('LuckyWheel')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#FFD66B',
            backgroundColor: '#2A0A4A',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 6,
          }}
        >
          <LuckyWheelTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFD66B', fontSize: 14, fontWeight: '900', letterSpacing: 2, textAlign: 'center', lineHeight: 16, textShadowColor: '#000', textShadowRadius: 6 }}>{'LUCKY WHEEL'}</Text>
        </Pressable>
      );
    case 'ScratchCard':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('ScratchCard')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#FFD66B',
            backgroundColor: '#5A0A1E',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 6,
          }}
        >
          <ScratchCardTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFD66B', fontSize: 14, fontWeight: '900', letterSpacing: 1.5, textAlign: 'center', lineHeight: 16, textShadowColor: '#000', textShadowRadius: 6 }}>{'SCRATCH\nCARD'}</Text>
        </Pressable>
      );
    case 'DiceDuel':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('DiceDuel')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#FFD66B',
            backgroundColor: '#0A2440',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 6,
          }}
        >
          <DiceDuelTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFD66B', fontSize: 14, fontWeight: '900', letterSpacing: 2, textAlign: 'center', lineHeight: 16, textShadowColor: '#000', textShadowRadius: 6 }}>{'DICE DUEL'}</Text>
        </Pressable>
      );
    case 'ColorBall':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('ColorBall')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#FFD66B',
            backgroundColor: '#2A0E4A',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 6,
          }}
        >
          <ColorBallTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFD66B', fontSize: 14, fontWeight: '900', letterSpacing: 2, textAlign: 'center', lineHeight: 16, textShadowColor: '#000', textShadowRadius: 6 }}>{'COLOR BALL'}</Text>
        </Pressable>
      );
    case 'FortuneSix':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('FortuneSix')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#FFD66B',
            backgroundColor: '#0A1630',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 6,
          }}
        >
          <FortuneSixTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFD66B', fontSize: 14, fontWeight: '900', letterSpacing: 2, textAlign: 'center', lineHeight: 16, textShadowColor: '#000', textShadowRadius: 6 }}>{'FORTUNE 6'}</Text>
        </Pressable>
      );
    case 'MoneyComing':
      return (
        <Pressable
          onPress={() => (navigation as any).navigate('MoneyComing')}
          style={{
            width: GAME_ICON_SIZE,
            height: GAME_ICON_SIZE,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#FFD24A',
            backgroundColor: '#03180C',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 10,
          }}
        >
          <MoneyComingTileArt size={GAME_ICON_SIZE} />
          <Text style={{ color: '#FFE58A', fontSize: 16, fontWeight: '900', letterSpacing: 1.5, textAlign: 'center', lineHeight: 18, textShadowColor: '#000', textShadowRadius: 6 }}>{'MONEY\nCOMING'}</Text>
        </Pressable>
      );
  }
}
