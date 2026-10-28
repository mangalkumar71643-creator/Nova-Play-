import { useEffect, useRef } from 'react';
import { AppState, Vibration } from 'react-native';
import { fetchNotifications, markNotificationsRead } from '../api/backend';
import { useAuth } from '../state/AuthContext';
import { useGameState } from '../state/GameStateContext';
import { showAlert } from './AppAlert';

const EVERY_MS = 60_000;
// Three buzzes when a message arrives: wait, buzz, pause, buzz, pause, buzz (ms).
const BUZZ_THREE_TIMES = [0, 400, 250, 400, 250, 400];

/**
 * Shows each unread message (money the admin added: bonus, deposit,
 * returned withdrawal) as a popup while the app is open — on start, when it
 * comes back to the front, and every minute — buzzing the phone three
 * times, then marks it read. They stay
 * listed under Notifications → Personal.
 */
export default function NotificationWatcher() {
  const { isAuthenticated } = useAuth();
  const { refreshWallet } = useGameState();
  const busy = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    async function check() {
      if (busy.current || AppState.currentState !== 'active') return;
      busy.current = true;
      try {
        const { items } = await fetchNotifications();
        const unread = items.filter((n) => !n.readAt).reverse();
        if (unread.length === 0) return;
        await markNotificationsRead(unread.map((n) => n.id));
        refreshWallet().catch(() => {});
        Vibration.vibrate(BUZZ_THREE_TIMES);
        for (const n of unread) {
          showAlert(n.title, n.body, undefined, {
            kind: n.kind === 'WITHDRAWAL_REFUND' ? 'info' : 'success',
            highlight: n.amount != null ? `₹${n.amount.toLocaleString('en-IN')}` : undefined,
          });
        }
      } catch {
        // Offline or signed out: tried again on the next tick.
      } finally {
        busy.current = false;
      }
    }
    check();
    const timer = setInterval(check, EVERY_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [isAuthenticated, refreshWallet]);

  return null;
}
