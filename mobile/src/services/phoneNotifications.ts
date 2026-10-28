import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { fetchNotifications, PlayerNotification } from '../api/backend';
import { getBackendToken } from '../api/client';

/**
 * Messages from NovaPlay (money added, the admin's messages) as phone
 * notifications, like an SMS: in the notification bar, with the phone
 * buzzing three times (the channel's vibration pattern).
 *
 * While the app is open NotificationWatcher shows them as a popup instead.
 * When it is in the background (or closed), the background task below
 * checks about every 15 minutes — Android decides the exact time — and
 * posts each new message once. They stay unread, so the popup (with the
 * gift code's Redeem button) still comes up when the app is opened.
 */
const CHANNEL_ID = 'novaplay-messages';
export const BUZZ_THREE_TIMES = [0, 400, 250, 400, 250, 400];
const NOTIFIED_KEY = 'novaplay:notifiedMessages:v1';
const TASK = 'novaplay-check-messages';

// Shown even if one arrives while the app is open (the popup is the main thing then).
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

let ready: Promise<boolean> | null = null;
/** The channel (sound + three buzzes) and Android 13+'s notification permission. Asked once. */
export function setUpPhoneNotifications(): Promise<boolean> {
  if (!ready) {
    ready = (async () => {
      if (Platform.OS === 'web') return false;
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
          name: 'Messages from NovaPlay',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: BUZZ_THREE_TIMES,
          enableVibrate: true,
          lightColor: '#F0B93D',
        });
      }
      const current = await Notifications.getPermissionsAsync();
      const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
      if (granted) {
        await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 }).catch(() => {});
      }
      return granted;
    })().catch(() => false);
  }
  return ready;
}

async function notifiedIds(): Promise<Set<string>> {
  const raw = await AsyncStorage.getItem(NOTIFIED_KEY).catch(() => null);
  try {
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

/** Remembers messages already shown (as a popup or a phone notification), so none is shown twice that way. */
export async function rememberShown(ids: string[]) {
  const seen = await notifiedIds();
  ids.forEach((id) => seen.add(id));
  await AsyncStorage.setItem(NOTIFIED_KEY, JSON.stringify([...seen].slice(-200))).catch(() => {});
}

export async function wasShown(id: string) {
  return (await notifiedIds()).has(id);
}

async function post(n: PlayerNotification) {
  await Notifications.scheduleNotificationAsync({
    content: { title: n.title, body: n.giftCode ? `${n.body}\nGift code: ${n.giftCode}` : n.body, data: { id: n.id } },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
  });
}

/** Posts every unread message not yet shown as a phone notification. */
export async function postNewMessages(): Promise<number> {
  if (!(await getBackendToken())) return 0;
  const { items } = await fetchNotifications();
  const seen = await notifiedIds();
  const fresh = items.filter((n) => !n.readAt && !seen.has(n.id)).reverse();
  for (const n of fresh) await post(n);
  if (fresh.length) await rememberShown(fresh.map((n) => n.id));
  return fresh.length;
}

if (Platform.OS !== 'web') {
  TaskManager.defineTask(TASK, async () => {
    try {
      await postNewMessages();
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}
