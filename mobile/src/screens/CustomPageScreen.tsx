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
  BACKGROUND_FADE,
  BACKGROUNDS,
  Block,
  BoxBlock,
  CodeBlock,
  CountdownBlock,
  DividerBlock,
  FaqBlock,
  HeroBlock,
  ListBlock,
  PageBackground,
  PICTURE_WIDTH,
  SHADE,
  Shade,
  SpaceBlock,
  TableBlock,
  TextBlock,
} from './page/PageBlocks';

/*
 * One of the admin's own pages (Admin → Promotion Pages / Pages), opened from a banner, an app-open popup, a Promotion card, a
 * category banner or a button on another page. The page is the admin's: pictures shown full width (their own designs, like a
 * poster, full width or smaller, square or round-cornered), pictures with words and a button on them, text, lists, tables,
 * notice boxes, a countdown, a code to copy, questions & answers and buttons, top to bottom, on the background colour the admin
 * picked and, behind it all, the page's own background picture (it scrolls with the page); a button or a picture opens a game,
 * Deposit, another page or a website (utils/promoTarget.ts); a free design from the admin's design editor is its picture with the
 * areas that open something on it. Blocks this app doesn't know are left out.
 */

type Picture = { imageUrl: string; width: number; height: number };
type Page = { id: string; title: string; background?: PageBackground; backgroundImage?: Picture | null; backgroundShade?: Shade; blocks: Block[] };

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
      // v=3: this app draws pictures with words on them and free designs with their tap areas (older apps get them as pictures,
      // text and buttons)
      const res = await fetch(`${API_BASE_URL}/pages/${encodeURIComponent(id ?? '')}?v=3`);
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
        const share = PICTURE_WIDTH[b.size ?? 'full'] ?? 1;
        const w = Math.round(contentW * share);
        const picture = (
          <Image
            source={{ uri: `${API_BASE_URL}${b.imageUrl}` }}
            style={{ width: w, height: (w * b.height) / b.width, borderRadius: b.rounded ? 14 : 0 }}
            resizeMode="cover"
            fadeDuration={150}
          />
        );
        const around = { alignItems: 'center' as const, marginVertical: share < 1 || b.rounded ? spacing.sm : 0 };
        return open ? (
          <View key={i} style={around}>
            <TapPressable onPress={open} accessibilityRole="button" testID={`page-image-${i}`}>
              {picture}
            </TapPressable>
          </View>
        ) : (
          <View key={i} style={around} testID={`page-image-${i}`}>
            {picture}
          </View>
        );
      }
      case 'hero':
        return <HeroBlock key={i} b={b} width={contentW} uri={`${API_BASE_URL}${b.imageUrl}`} onButton={opener(navigation, b.buttonTarget)} testID={`page-hero-${i}`} />;
      case 'canvas': {
        // the design's picture, full width, its parts one under the other (each a little taller so no hairline shows between
        // two), with its tap areas on it (scaled from the design's units)
        const k = contentW / (b.designWidth || 360);
        const px = contentW / (b.width || 1080);
        let top = 0;
        return (
          <View key={i} style={{ width: contentW, height: b.height * px, overflow: 'hidden' }} testID={`page-canvas-${i}`}>
            {b.parts.map((p, j) => {
              const at = top;
              top += p.height * px;
              return (
                <Image
                  key={j}
                  source={{ uri: `${API_BASE_URL}${p.imageUrl}` }}
                  style={{ position: 'absolute', left: 0, top: at, width: contentW, height: p.height * px + (j < b.parts.length - 1 ? 1 : 0) }}
                  resizeMode="cover"
                  fadeDuration={0}
                />
              );
            })}
            {b.links.map((l, j) => {
              const open = opener(navigation, l.target);
              return open ? (
                <TapPressable
                  key={j}
                  onPress={open}
                  accessibilityRole="button"
                  accessibilityLabel={l.label || 'Open'}
                  testID={`page-link-${i}-${j}`}
                  style={{ position: 'absolute', left: l.x * k, top: l.y * k, width: l.w * k, height: l.h * k }}
                />
              ) : null;
            })}
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
  // the page's own background picture: full width at the top, scrolling with the page, fading into the background colour
  const bg = page?.backgroundImage ?? null;
  const bgH = bg ? (contentW * bg.height) / bg.width : 0;
  const bgShade = SHADE[page?.backgroundShade ?? 'medium'] ?? SHADE.medium;

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
          <View style={{ width: contentW }}>
            {bg ? (
              <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, width: contentW, height: bgH }} testID="page-background-picture">
                <Image source={{ uri: `${API_BASE_URL}${bg.imageUrl}` }} style={{ width: contentW, height: bgH }} resizeMode="cover" fadeDuration={150} />
                {bgShade > 0 ? <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(12,3,5,${bgShade})` }]} /> : null}
                <LinearGradient colors={['rgba(0,0,0,0)', BACKGROUND_FADE[page.background ?? 'dark'] ?? BACKGROUND_FADE.dark]} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: Math.min(180, bgH * 0.3) }} />
              </View>
            ) : null}
            {page.blocks.map(block)}
          </View>
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
