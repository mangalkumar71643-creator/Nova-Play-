import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, RefreshControl, ScrollView, View, useWindowDimensions } from 'react-native';
import { Text } from '../components/AppText';
import { API_BASE_URL } from '../api/client';
import PromoButton from '../components/PromoButton';
import ScreenContainer from '../components/ScreenContainer';
import TapPressable from '../components/TapPressable';
import { RootStackParamList } from '../navigation/types';
import { colors, spacing, typography } from '../theme';
import { opener } from '../utils/promoTarget';

/*
 * One of the admin's own pages (Admin → Pages), opened from a banner, an app-open popup, a Promotion card, a category banner or a
 * button on another page. The page is the admin's: pictures shown full width (their own designs, like a poster), headings, text
 * and buttons, top to bottom; a button or a picture opens a game, Deposit or another page (utils/promoTarget.ts).
 */

type Block =
  | { type: 'image'; imageUrl: string; width: number; height: number; target: string | null }
  | { type: 'text'; text: string; style: 'heading' | 'body' | 'note'; align: 'left' | 'center' }
  | { type: 'button'; label: string; target: string };
type Page = { id: string; title: string; blocks: Block[] };

/** The widest the page is drawn (tablets and the website keep a phone's column, centred). */
const MAX_WIDTH = 560;

export default function CustomPageScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'CustomPage'>>();
  const id = route.params?.id;
  const { width } = useWindowDimensions();
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/pages/${encodeURIComponent(id ?? '')}`);
      if (res.status === 404) {
        setPage(null);
        setError('This page is not available any more.');
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      setPage(await res.json());
      setError(null);
    } catch {
      setError((e) => e ?? 'Could not load the page. Check your connection and pull down to try again.');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const contentW = Math.min(width, MAX_WIDTH);
  const buttonW = Math.min(320, contentW * 0.8);

  const block = (b: Block, i: number) => {
    if (b.type === 'image') {
      const open = opener(navigation, b.target);
      const picture = (
        <Image source={{ uri: `${API_BASE_URL}${b.imageUrl}` }} style={{ width: contentW, height: (contentW * b.height) / b.width }} resizeMode="cover" fadeDuration={150} />
      );
      return open ? (
        <TapPressable key={i} onPress={open} accessibilityRole="button" testID={`page-image-${i}`}>
          {picture}
        </TapPressable>
      ) : (
        <View key={i} testID={`page-image-${i}`}>
          {picture}
        </View>
      );
    }
    if (b.type === 'button') {
      const open = opener(navigation, b.target);
      return (
        <View key={i} style={{ alignItems: 'center', marginVertical: spacing.md }}>
          <PromoButton label={b.label} width={buttonW} height={50} onPress={open ?? undefined} disabled={!open} testID={`page-button-${i}`} />
        </View>
      );
    }
    const style =
      b.style === 'heading'
        ? { color: colors.gold, fontSize: typography.xl, fontWeight: '900' as const, paddingTop: spacing.lg, paddingBottom: spacing.xs }
        : b.style === 'note'
          ? { color: colors.textSecondary, fontSize: typography.sm, lineHeight: 18, paddingVertical: spacing.xs }
          : { color: colors.textPrimary, fontSize: typography.md, lineHeight: 21, paddingVertical: spacing.sm };
    return (
      <Text key={i} style={[style, { paddingHorizontal: spacing.lg, textAlign: b.align === 'center' ? 'center' : 'left' }]}>
        {b.text}
      </Text>
    );
  };

  return (
    <ScreenContainer scroll={false} contentStyle={{ paddingHorizontal: 0 }}>
      <View style={styles.header}>
        <TapPressable onPress={() => navigation.goBack()} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Back">
          <MaterialCommunityIcons name="chevron-left" size={28} color={colors.gold} />
        </TapPressable>
        <Text style={styles.headerTitle} numberOfLines={1} testID="page-title">
          {page?.title ?? ''}
        </Text>
        <View style={styles.headerButton} />
      </View>
      {page ? (
        <ScrollView
          contentContainerStyle={{ alignItems: 'center', paddingBottom: spacing.xl * 2 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.gold} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ width: contentW }}>{page.blocks.map(block)}</View>
        </ScrollView>
      ) : error ? (
        <ScrollView contentContainerStyle={styles.center} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.gold} />}>
          <MaterialCommunityIcons name="file-document-outline" size={44} color={colors.textSecondary} />
          <Text style={styles.message}>{error}</Text>
        </ScrollView>
      ) : (
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = {
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  headerButton: { width: 36, height: 36, alignItems: 'center' as const, justifyContent: 'center' as const },
  headerTitle: { flex: 1, textAlign: 'center' as const, color: colors.gold, fontSize: typography.xl, fontWeight: '800' as const },
  center: { flexGrow: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: spacing.xl },
  message: { color: colors.textSecondary, fontSize: typography.md, textAlign: 'center' as const, marginTop: spacing.md, lineHeight: 21 },
};
