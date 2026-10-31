import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fetchPromotionPage, PromoBanner, PromoTile } from '../api/backend';
import { API_BASE_URL } from '../api/client';
import ScreenContainer from '../components/ScreenContainer';
import { colors, gradients, radius, spacing, typography } from '../theme';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

// Each tile's colours, by its place in the grid.
const TILE_GRADIENTS: [string, string][] = [
  ['#FF9A7A', '#F0533D'],
  ['#FFD36E', '#F59B23'],
  ['#7BE0C3', '#21A985'],
  ['#FF8FA3', '#E23E5C'],
  ['#C59BFF', '#8C4DEB'],
  ['#FFA27A', '#F4683A'],
  ['#7FB8FF', '#3A7BEF'],
  ['#8FE3FF', '#2DA8E0'],
];

/**
 * The Promotion tab (in the Wallet's old place): the admin's icon grid —
 * each opening a screen — and banner cards, from panel → Promotion.
 */
export default function PromotionScreen() {
  const navigation = useNavigation<any>();
  const [tiles, setTiles] = useState<PromoTile[] | null>(null);
  const [banners, setBanners] = useState<PromoBanner[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const page = await fetchPromotionPage();
      setTiles(page.tiles);
      setBanners(page.banners);
    } catch {
      setTiles((t) => t ?? []);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const open = (key: string) => {
    switch (key) {
      case 'betting-tasks':
        return navigation.navigate('BettingTasks');
      case 'deposit-bonus':
        return navigation.navigate('Deposit');
      case 'invite':
        return navigation.navigate('MainTabs', { screen: 'Earn' });
      case 'betting-rebate':
        return navigation.navigate('AgentRewards', { kind: 'BET' });
      case 'super-jackpot':
        return navigation.navigate('AgentJackpot');
      case 'vip':
        return navigation.navigate('MainTabs', { screen: 'Vip' });
      case 'gift-code':
        return navigation.navigate('GiftCode');
      case 'support':
        return navigation.navigate('Help');
    }
  };
  // A banner opens its game (the admin's choice); "Download app" banners do nothing in the app.
  const openBanner = (b: PromoBanner) => {
    if (b.buttonTarget && b.buttonTarget !== 'DOWNLOAD') navigation.navigate(b.buttonTarget);
  };

  return (
    <ScreenContainer scroll={false} contentStyle={{ paddingHorizontal: 0 }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xl * 2 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            colors={[colors.gold]}
            tintColor={colors.gold}
            progressBackgroundColor={colors.surface}
          />
        }
      >
        <LinearGradient colors={gradients.crimsonButton} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
          <Text style={styles.headerTitle}>Activity</Text>
          <Text style={styles.headerSub}>Please remember to follow the event page.{'\n'}We launch new player activities from time to time.</Text>
        </LinearGradient>

        {tiles === null ? <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} /> : null}
        <View style={styles.grid}>
          {(tiles ?? []).map((t, i) => {
            const [a, b] = TILE_GRADIENTS[i % TILE_GRADIENTS.length];
            return (
              <Pressable key={t.key} style={styles.tile} onPress={() => open(t.key)}>
                <LinearGradient colors={[a, b]} style={styles.tileIcon}>
                  <MaterialCommunityIcons name={t.icon as IconName} size={30} color="#FFFFFF" />
                </LinearGradient>
                <Text style={styles.tileLabel} numberOfLines={2}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {banners.map((b) => (
          <Pressable key={b.id} style={styles.banner} onPress={() => openBanner(b)}>
            <Image source={{ uri: `${API_BASE_URL}${b.imageUrl}` }} style={{ width: '100%', aspectRatio: b.width / b.height }} resizeMode="cover" />
            <Text style={styles.bannerTitle}>{b.title}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.lg },
  headerTitle: { color: colors.goldLight, fontSize: typography.xxl, fontWeight: '900' },
  headerSub: { color: colors.textPrimary, fontSize: typography.sm, marginTop: spacing.sm, lineHeight: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.sm, paddingTop: spacing.md },
  tile: { width: '25%', alignItems: 'center', paddingVertical: spacing.sm },
  tileIcon: { width: 54, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { color: colors.textSecondary, fontSize: typography.xs, textAlign: 'center', marginTop: 6, paddingHorizontal: 2 },
  banner: { marginHorizontal: spacing.lg, marginTop: spacing.md, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  bannerTitle: { color: colors.textPrimary, fontSize: typography.md, fontWeight: '800', padding: spacing.md },
});
