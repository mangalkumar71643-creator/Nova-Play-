import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  Easing,
  Image,
  ImageBackground,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_BASE_URL } from '../api/client';
import { GAME_CATEGORIES, GameTile } from '../components/GameTile';
import { RootStackParamList } from '../navigation/types';
import { useGameState } from '../state/GameStateContext';

const SIDE = 12;
const TILE_GAP = 10;
const GRID_PER_ROW = 3;
/** In a section's row about this many tiles show, so the next one peeks in and invites a swipe. */
const ROW_TILES_VISIBLE = 3.2;
const BANNER_ASPECT = 2.1;
const SLIDE_INTERVAL_MS = 4000;
const SLIDE_ANIM_MS = 450;
const SWIPE_DISTANCE = 40;
const TABS_HEIGHT = 58;
const GOLD = '#FFD66B';
const RED = '#E8243A';

type Banner = { id: string; title: string; width: number; height: number; imageUrl: string; buttonText?: string | null; buttonTarget?: string | null; buttonUrl?: string | null };

const DOWNLOAD_TARGET = 'DOWNLOAD';
const SHOW_DOWNLOAD_BANNERS = Platform.OS === 'web';
const GAME_SCREENS = new Set<string>(GAME_CATEGORIES.flatMap((c) => c.games));

/**
 * The "Category Slider" banners set up in the admin panel, sliding by
 * themselves every few seconds; players can swipe too. A banner whose
 * button is set to a game opens it when tapped.
 */
function CategoryBanners({ width }: { width: number }) {
  const navigation = useNavigation();
  const [banners, setBanners] = useState<Banner[]>([]);

  // Fetched each time the screen is shown and when the app comes back to the
  // front, so banners added in the admin panel appear without a restart.
  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/popups?kind=CATEGORY_SLIDER`);
      if (!res.ok) return;
      const rows: Banner[] = (await res.json()).filter((r: Banner) => SHOW_DOWNLOAD_BANNERS || r.buttonTarget !== DOWNLOAD_TARGET);
      setBanners((prev) => (JSON.stringify(prev) === JSON.stringify(rows) ? prev : rows));
    } catch {
      // Keep whatever was showing if the server can't be reached.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && load());
    return () => sub.remove();
  }, [load]);

  const n = banners.length;
  // Pages are [last, ...banners, first] so sliding past either end wraps with no jump; pos 1..n is real.
  const pages = n > 1 ? [banners[n - 1], ...banners, banners[0]] : banners;
  const [pos, setPos] = useState(1);
  const [dragging, setDragging] = useState(false);
  const offset = useRef(new Animated.Value(-width)).current;
  const posRef = useRef(1);
  const widthRef = useRef(width);
  widthRef.current = width;
  const height = Math.round(width / BANNER_ASPECT);

  const goTo = useCallback(
    (target: number) => {
      Animated.timing(offset, { toValue: -target * widthRef.current, duration: SLIDE_ANIM_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
        const settled = target > n ? 1 : target < 1 ? n : target;
        offset.setValue(-settled * widthRef.current);
        posRef.current = settled;
        setPos(settled);
      });
    },
    [n, offset],
  );

  useEffect(() => {
    posRef.current = 1;
    setPos(1);
    offset.setValue(n > 1 ? -width : 0);
  }, [n, width, offset]);

  useEffect(() => {
    if (n < 2 || dragging) return;
    const t = setTimeout(() => goTo(posRef.current + 1), SLIDE_INTERVAL_MS);
    return () => clearTimeout(t);
  }, [pos, n, dragging, goTo]);

  const goToRef = useRef(goTo);
  goToRef.current = goTo;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderGrant: () => {
        offset.stopAnimation();
        setDragging(true);
      },
      onPanResponderMove: (_e, g) => offset.setValue(-posRef.current * widthRef.current + g.dx),
      onPanResponderRelease: (_e, g) => {
        setDragging(false);
        goToRef.current(posRef.current + (g.dx < -SWIPE_DISTANCE ? 1 : g.dx > SWIPE_DISTANCE ? -1 : 0));
      },
      onPanResponderTerminate: () => {
        setDragging(false);
        goToRef.current(posRef.current);
      },
    }),
  ).current;

  if (n === 0) return null;

  const open = (b: Banner) => {
    if (b.buttonTarget && GAME_SCREENS.has(b.buttonTarget)) (navigation as any).navigate(b.buttonTarget);
  };
  const active = (pos - 1 + n) % n;

  return (
    <View style={{ width, height: height + 16, marginTop: 4 }}>
      <View style={[styles.bannerFrame, { width, height }]} {...(n > 1 ? pan.panHandlers : {})}>
        <Animated.View style={{ flexDirection: 'row', width: width * pages.length, height, transform: [{ translateX: offset }] }}>
          {pages.map((b, i) => (
            <Pressable key={`${b.id}-${i}`} onPress={() => open(b)} disabled={!b.buttonTarget} style={{ width, height }} accessibilityLabel={b.title}>
              <Image source={{ uri: `${API_BASE_URL}${b.imageUrl}` }} style={{ width, height }} resizeMode="cover" />
              {!!b.buttonText && (
                <LinearGradient colors={['#FF5A5A', RED, '#9A0A1A']} style={styles.bannerButton}>
                  <Text style={styles.bannerButtonText} numberOfLines={1}>
                    {b.buttonText}
                  </Text>
                </LinearGradient>
              )}
            </Pressable>
          ))}
        </Animated.View>
      </View>
      {n > 1 && (
        <View style={styles.dots} pointerEvents="none">
          {banners.map((b, i) => (
            <View key={b.id} style={[styles.dot, i === active && styles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * The game lobby, opened from a category banner on Home: the admin's category
 * banners at the top, a tab for every category (the tapped one picked), and
 * every category's games below, each in its own swipeable row. Tapping a tab
 * jumps to that category; scrolling moves the picked tab along.
 */
export default function GameCategoryScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'GameCategory'>>();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { coins } = useGameState();
  const startId = GAME_CATEGORIES.some((c) => c.id === route.params?.categoryId) ? route.params!.categoryId : GAME_CATEGORIES[0].id;
  const [activeId, setActiveId] = useState(startId);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ [startId]: false });

  const scrollRef = useRef<ScrollView>(null);
  const tabsRef = useRef<ScrollView>(null);
  // Heights of the banner block and of each category section. A section's top is worked out by
  // adding up what's above it: onLayout reports a view's size changing, but not a view being
  // pushed down when something above it grows (banners loading, a section opened to "All").
  const [bannerH, setBannerH] = useState(0);
  const sectionH = useRef<Record<string, number>>({});
  const openedAt = useRef(Date.now());
  const tabX = useRef<Record<string, { x: number; w: number }>>({});
  const jumpedToStart = useRef(false);
  // While a tab tap scrolls the page, the scroll handler leaves the picked tab alone.
  const jumping = useRef(false);

  const contentWidth = width - SIDE * 2;
  const rowTile = Math.floor((contentWidth - TILE_GAP * 3) / ROW_TILES_VISIBLE);
  const gridTile = Math.floor((contentWidth - TILE_GAP * (GRID_PER_ROW - 1)) / GRID_PER_ROW);

  const showTab = useCallback(
    (id: string) => {
      const t = tabX.current[id];
      if (t) tabsRef.current?.scrollTo({ x: Math.max(0, t.x - (width - t.w) / 2), animated: true });
    },
    [width],
  );

  const sectionTop = useCallback(
    (id: string) => {
      let y = bannerH + TABS_HEIGHT;
      for (const c of GAME_CATEGORIES) {
        if (c.id === id) return y;
        y += sectionH.current[c.id] ?? 0;
      }
      return y;
    },
    [bannerH],
  );

  const jumpTo = useCallback(
    (id: string, animated = true) => {
      const y = sectionTop(id);
      jumping.current = true;
      setActiveId(id);
      showTab(id);
      // The tabs stick at the top, so the section's top goes just under them.
      scrollRef.current?.scrollTo({ y: Math.max(0, y - TABS_HEIGHT), animated });
      setTimeout(() => (jumping.current = false), animated ? 600 : 80);
    },
    [showTab, sectionTop],
  );

  const onSectionLayout = (id: string) => (e: LayoutChangeEvent) => {
    sectionH.current[id] = e.nativeEvent.layout.height;
    // Open on the tapped category once every section has been laid out.
    if (!jumpedToStart.current && GAME_CATEGORIES.every((c) => sectionH.current[c.id] !== undefined)) {
      jumpedToStart.current = true;
      if (startId !== GAME_CATEGORIES[0].id) setTimeout(() => jumpTo(startId, false), 30);
    }
  };

  // Banners that arrive just after the screen opens push everything down; keep the tapped category in view.
  useEffect(() => {
    if (jumpedToStart.current && startId !== GAME_CATEGORIES[0].id && Date.now() - openedAt.current < 4000) jumpTo(startId, false);
    // Only when the banner block changes size.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bannerH]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (jumping.current) return;
    const y = e.nativeEvent.contentOffset.y + TABS_HEIGHT + 24;
    let current = GAME_CATEGORIES[0].id;
    for (const c of GAME_CATEGORIES) if (sectionTop(c.id) <= y) current = c.id;
    if (current !== activeId) {
      setActiveId(current);
      showTab(current);
    }
  };

  return (
    <ImageBackground source={require('../../assets/home-background.webp')} style={styles.fill} resizeMode="cover">
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back} hitSlop={8} accessibilityLabel="Back">
          <MaterialCommunityIcons name="chevron-left" size={26} color={GOLD} />
        </Pressable>
        <Text style={styles.topTitle}>GAMES</Text>
        <Pressable onPress={() => (navigation as any).navigate('Wallet')} style={styles.balance} accessibilityLabel="Wallet">
          <MaterialCommunityIcons name="wallet" size={16} color={GOLD} />
          <Text style={styles.balanceText}>₹{coins.toLocaleString('en-IN')}</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        stickyHeaderIndices={[1]}
        onScroll={onScroll}
        scrollEventThrottle={32}
        // Room under the last category so a tab tap can bring any category up under the tabs.
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 32, height * 0.55) }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingHorizontal: SIDE }} onLayout={(e) => setBannerH(e.nativeEvent.layout.height)}>
          <CategoryBanners width={contentWidth} />
        </View>

        {/* Category tabs (stick to the top while the games scroll) */}
        <View style={styles.tabsWrap}>
          <ScrollView ref={tabsRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: SIDE, gap: 8, alignItems: 'center' }}>
            {GAME_CATEGORIES.map((c) => {
              const on = c.id === activeId;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => jumpTo(c.id)}
                  onLayout={(e) => (tabX.current[c.id] = { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width })}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={c.title}
                >
                  <LinearGradient colors={on ? ['#FF5A6A', RED, '#8A0A16'] : ['#3A0A10', '#22060A']} style={[styles.tab, on && styles.tabOn]}>
                    <Text style={[styles.tabText, on && styles.tabTextOn]}>{c.title}</Text>
                  </LinearGradient>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Every category's games */}
        {GAME_CATEGORIES.map((c) => {
          const open = !!expanded[c.id];
          return (
            <View key={c.id} onLayout={onSectionLayout(c.id)} style={styles.section}>
              <View style={styles.sectionHead}>
                <View style={styles.diamond} />
                <Text style={styles.sectionTitle}>{c.title}</Text>
                <Pressable onPress={() => setExpanded((e) => ({ ...e, [c.id]: !open }))} hitSlop={8} style={styles.allBtn} accessibilityLabel={`${open ? 'Show fewer' : 'Show all'} ${c.title}`}>
                  <Text style={styles.allText}>{open ? 'Less' : `All ${c.games.length}`}</Text>
                  <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-right'} size={20} color={GOLD} />
                </Pressable>
              </View>
              {open ? (
                <View style={[styles.grid, { paddingHorizontal: SIDE }]}>
                  {c.games.map((id) => (
                    <GameTile key={id} id={id} size={gridTile} />
                  ))}
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: SIDE, gap: TILE_GAP }}>
                  {c.games.map((id) => (
                    <GameTile key={id} id={id} size={rowTile} />
                  ))}
                </ScrollView>
              )}
            </View>
          );
        })}
      </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#120204' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: SIDE, paddingBottom: 8, backgroundColor: 'rgba(21,17,18,0.96)' },
  back: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(20,4,6,0.85)', borderWidth: 1.2, borderColor: 'rgba(255,214,107,0.6)' },
  topTitle: { flex: 1, color: '#FFF4DC', fontSize: 18, fontWeight: '900', letterSpacing: 3 },
  balance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: 'rgba(40,6,10,0.9)',
    borderWidth: 1.2,
    borderColor: 'rgba(255,214,107,0.55)',
  },
  balanceText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  bannerFrame: { borderRadius: 16, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,214,107,0.45)', backgroundColor: '#2A0408' },
  bannerButton: { position: 'absolute', right: 10, bottom: 10, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, borderWidth: 1.5, borderColor: '#FFE0A0' },
  bannerButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 7 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
  dotActive: { width: 18, backgroundColor: RED },
  tabsWrap: { height: TABS_HEIGHT, justifyContent: 'center', backgroundColor: 'rgba(18,2,4,0.94)' },
  tab: { height: 42, paddingHorizontal: 18, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.2, borderColor: 'rgba(255,255,255,0.08)' },
  tabOn: { borderColor: '#FF9AA6' },
  tabText: { color: '#C88A90', fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },
  tabTextOn: { color: '#FFF4DC', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
  section: { paddingTop: 14 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: SIDE + 4, marginBottom: 10 },
  diamond: { width: 11, height: 11, backgroundColor: RED, transform: [{ rotate: '45deg' }], borderRadius: 2 },
  sectionTitle: { flex: 1, color: '#FFE8EA', fontSize: 19, fontWeight: '700', letterSpacing: 0.5 },
  allBtn: { flexDirection: 'row', alignItems: 'center' },
  allText: { color: GOLD, fontSize: 17, fontWeight: '900', fontFamily: 'serif' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: TILE_GAP },
});
