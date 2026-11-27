import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '../components/AppText';
import { API_BASE_URL } from '../api/client';
import PromoButton from '../components/PromoButton';
import ScreenContainer from '../components/ScreenContainer';
import TapPressable from '../components/TapPressable';
import { RootStackParamList } from '../navigation/types';
import { colors, spacing, typography } from '../theme';
import { opener } from '../utils/promoTarget';
import {
  BACKGROUNDS,
  Block,
  BoxBlock,
  CodeBlock,
  CountdownBlock,
  DividerBlock,
  FaqBlock,
  ListBlock,
  PageBackground,
  SpaceBlock,
  TableBlock,
  TextBlock,
} from './page/PageBlocks';

/*
 * One of the admin's own pages (Admin → Promotion Pages / Pages), opened from a banner, an app-open popup, a Promotion card, a
 * category banner or a button on another page. The page is the admin's: pictures shown full width (their own designs, like a
 * poster), text, lists, tables, notice boxes, a countdown, a code to copy, questions & answers and buttons, top to bottom, on the
 * background colour the admin picked; a button or a picture opens a game, Deposit, another page or a website
 * (utils/promoTarget.ts). Blocks this app doesn't know are left out.
 */

type Page = { id: string; title: string; background?: PageBackground; blocks: Block[] };

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
    switch (b.type) {
      case 'image': {
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
      case 'button': {
        const open = opener(navigation, b.target);
        return (
          <View key={i} style={{ alignItems: 'center', marginVertical: spacing.md }}>
            <PromoButton label={b.label} tone={b.color} width={buttonW} height={50} onPress={open ?? undefined} disabled={!open} testID={`page-button-${i}`} />
          </View>
        );
      }
      case 'text':
        return <TextBlock key={i} b={b} />;
      case 'list':
        return <ListBlock key={i} b={b} />;
      case 'table':
        return <TableBlock key={i} b={b} />;
      case 'box':
        return <BoxBlock key={i} b={b} />;
      case 'countdown':
        return <CountdownBlock key={i} b={b} />;
      case 'code':
        return <CodeBlock key={i} b={b} testID={`page-code-${i}`} />;
      case 'faq':
        return <FaqBlock key={i} b={b} testID={`page-faq-${i}`} />;
      case 'divider':
        return <DividerBlock key={i} />;
      case 'space':
        return <SpaceBlock key={i} b={b} />;
      default:
        // a block a newer server knows and this app doesn't
        return null;
    }
  };

  const tint = page?.background && page.background !== 'dark' ? BACKGROUNDS[page.background] : null;

  return (
    <ScreenContainer scroll={false} contentStyle={{ paddingHorizontal: 0 }}>
      {tint ? <LinearGradient colors={tint} style={StyleSheet.absoluteFill} pointerEvents="none" /> : null}
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
