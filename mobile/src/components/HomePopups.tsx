import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { Image, Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { API_BASE_URL } from '../api/client';

type HomePopup = { id: string; title: string; width: number; height: number; imageUrl: string };

// { [popupId]: date the player ticked "Don't show again today" }
const STORAGE_KEY = 'novaplay:popups:hiddenOn';

const CLOSE_SIZE = 34;
const CHECK_ROW_HEIGHT = 44;

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
 * today" box.
 */
export default function HomePopups() {
  const { width, height } = useWindowDimensions();
  const [queue, setQueue] = useState<HomePopup[]>([]);
  const [dontShow, setDontShow] = useState(false);

  useEffect(() => {
    if (shownThisLaunch) return;
    shownThisLaunch = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/popups`);
        if (!res.ok) return;
        const popups: HomePopup[] = await res.json();
        const hidden = await readHidden();
        const due = popups.filter((p) => hidden[p.id] !== today());
        due.forEach((p) => Image.prefetch(`${API_BASE_URL}${p.imageUrl}`).catch(() => {}));
        if (!cancelled) setQueue(due);
      } catch {
        // No popups if the server can't be reached; the app carries on.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const current = queue[0];

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

  if (!current) return null;

  // Fit the image inside the screen, leaving room for the close button and the checkbox row.
  const aspect = current.width / current.height;
  const imageW = Math.min(width - 40, (height - CLOSE_SIZE - CHECK_ROW_HEIGHT - 90) * aspect, 420);
  const imageH = imageW / aspect;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: imageW }}>
          <Pressable
            onPress={close}
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
          </Pressable>
          <Image
            key={current.id}
            source={{ uri: `${API_BASE_URL}${current.imageUrl}` }}
            accessibilityLabel={current.title}
            style={{ width: imageW, height: imageH, borderRadius: 14, backgroundColor: '#1A1012' }}
            resizeMode="cover"
          />
          <Pressable
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
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
