import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { Image, Modal, Platform, View, useWindowDimensions } from 'react-native';
import { Text } from './AppText';
import { API_BASE_URL } from '../api/client';
import { withPopupSound } from '../sound/ui';
import { DOWNLOAD_TARGET, opener } from '../utils/promoTarget';
import PromoButton from './PromoButton';
import TapPressable from './TapPressable';

type HomePopup = {
  id: string;
  title: string;
  width: number;
  height: number;
  imageUrl: string;
  /** Optional button under the picture (Admin → Popups); buttonTarget is what it opens: a game, Deposit, a custom page, or DOWNLOAD_TARGET. */
  buttonText?: string | null;
  buttonTarget?: string | null;
  /** For a "Download app" button: the link it opens. */
  buttonUrl?: string | null;
};

// A popup whose button downloads the app is for people on the website (the server sends those only to ?web=1);
// anyone in the installed app has it already.
const IS_WEB = Platform.OS === 'web';

// { [popupId]: date the player ticked "Don't show again today" }
const STORAGE_KEY = 'novaplay:popups:hiddenOn';

const CLOSE_SIZE = 34;
const CHECK_ROW_HEIGHT = 44;
const BUTTON_HEIGHT = 46;
const BUTTON_WIDTH = BUTTON_HEIGHT * 2.9;
const BUTTON_GAP = 12;

// Shown once per app launch.
let shownThisLaunch = false;

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

async function readHidden(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * The popups set up in the admin panel, one after another in the admin's
 * order: closing one shows the next. Each has its own "Don't show again
 * today" box. A popup with a game (Admin → Popups → Button) opens it from
 * its PLAY button or from the picture itself, and the rest of this launch's
 * popups are skipped (the player has picked something to do; the deposit
 * offer then waits until they are back on Home, alone, not stacked on a popup).
 */
// Settles once this launch's image popups are all closed (or there are none),
// so the deposit-offer popup (DepositOfferPopup.tsx) comes up after them, not on top.
let markPopupsDone: () => void = () => {};
export const homePopupsDone = new Promise<void>((resolve) => {
  markPopupsDone = resolve;
});

export default function HomePopups() {
  const { width, height } = useWindowDimensions();
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const [queue, setQueue] = useState<HomePopup[]>([]);
  const [dontShow, setDontShow] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (shownThisLaunch) return;
    shownThisLaunch = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/popups${IS_WEB ? '?web=1' : ''}`);
        if (!res.ok) return;
        const popups: HomePopup[] = await res.json();
        const hidden = await readHidden();
        const due = popups.filter((p) => hidden[p.id] !== today() && (IS_WEB || p.buttonTarget !== DOWNLOAD_TARGET));
        due.forEach((p) => Image.prefetch(`${API_BASE_URL}${p.imageUrl}`).catch(() => {}));
        if (!cancelled) setQueue(due);
      } catch {
        // No popups if the server can't be reached; the app carries on.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const current = queue[0];
  useEffect(() => {
    if (loaded && queue.length === 0) markPopupsDone();
  }, [loaded, queue.length]);

  const close = async () => {
    if (!current) return;
    if (dontShow) {
      const hidden = await readHidden();
      // Keep only today's entries so the map doesn't grow forever.
      const kept = Object.fromEntries(Object.entries(hidden).filter(([, day]) => day === today()));
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...kept, [current.id]: today() })).catch(() => {});
    }
    setDontShow(false);
    setQueue((q) => q.slice(1));
  };

  // Only over Home: a popup never comes up on top of a game the player opened.
  if (!current || !isFocused) return null;

  // What the popup opens (a game, Deposit, a custom page or, on the website, the app download): its button and its picture open
  // it; this popup closes (its "Don't show again today" box still counts) and the ones after it are skipped for this launch.
  const go = opener(navigation, current.buttonTarget, IS_WEB && current.buttonTarget === DOWNLOAD_TARGET ? current.buttonUrl : null);
  const open = go
    ? () => {
        close();
        setQueue([]);
        go();
      }
    : undefined;
  const buttonText = current.buttonText?.trim();

  // Fit the image inside the screen, leaving room for the close button, the button (if any) and the checkbox row.
  const aspect = current.width / current.height;
  const buttonSpace = buttonText ? BUTTON_HEIGHT + BUTTON_GAP : 0;
  const imageW = Math.min(width - 40, (height - CLOSE_SIZE - CHECK_ROW_HEIGHT - buttonSpace - 90) * aspect, 420);
  const imageH = imageW / aspect;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: imageW }}>
          <TapPressable
            onPress={withPopupSound(close)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={{
              alignSelf: 'flex-end',
              width: CLOSE_SIZE,
              height: CLOSE_SIZE,
              borderRadius: CLOSE_SIZE / 2,
              marginBottom: 8,
              borderWidth: 1.5,
              borderColor: 'rgba(255,255,255,0.85)',
              backgroundColor: 'rgba(0,0,0,0.35)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MaterialCommunityIcons name="close" size={20} color="#FFFFFF" />
          </TapPressable>
          <TapPressable onPress={open} disabled={!open} accessibilityRole={open ? 'button' : undefined} accessibilityLabel={current.title} testID="home-popup-image">
            <Image
              key={current.id}
              source={{ uri: `${API_BASE_URL}${current.imageUrl}` }}
              style={{ width: imageW, height: imageH, borderRadius: 14, backgroundColor: '#1A1012' }}
              resizeMode="cover"
            />
          </TapPressable>
          {!!buttonText && (
            <PromoButton
              key={current.id}
              label={buttonText}
              width={BUTTON_WIDTH}
              height={BUTTON_HEIGHT}
              onPress={open}
              disabled={!open}
              style={{ alignSelf: 'center', marginTop: BUTTON_GAP }}
              testID="home-popup-button"
            />
          )}
          <TapPressable
            onPress={() => setDontShow((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: dontShow }}
            accessibilityLabel="Don't show again today"
            style={{
              height: CHECK_ROW_HEIGHT,
              flexDirection: 'row',
              alignItems: 'center',
              alignSelf: 'center',
              gap: 10,
              marginTop: 10,
              paddingHorizontal: 18,
              borderRadius: CHECK_ROW_HEIGHT / 2,
              backgroundColor: 'rgba(0,0,0,0.55)',
            }}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 4,
                borderWidth: 2,
                borderColor: '#F3CF7A',
                backgroundColor: dontShow ? '#F3CF7A' : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {dontShow && <MaterialCommunityIcons name="check-bold" size={16} color="#5A0E0A" />}
            </View>
            <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '600' }}>Don't show again today</Text>
          </TapPressable>
        </View>
      </View>
    </Modal>
  );
}
