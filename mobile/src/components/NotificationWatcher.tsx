import { useEffect, useRef } from 'react';
import { AppState, Vibration } from 'react-native';
import { fetchNotifications, markNotificationsRead, PlayerNotification, redeemGiftCode } from '../api/backend';
import { ApiClientError } from '../api/client';
import { BUZZ_THREE_TIMES, postNewMessages, rememberShown, setUpPhoneNotifications, wasShown } from '../services/phoneNotifications';
import { useAuth } from '../state/AuthContext';
import { useGameState } from '../state/GameStateContext';
import { showAlert } from './AppAlert';

const EVERY_MS = 60_000;

/**
 * Messages from NovaPlay (money the admin added, the admin's own messages):
 * while the app is open each unread one pops up — with the phone buzzing
 * three times, unless it already did as a phone notification — and is
 * marked read; one with a gift code gets a Redeem button. While the app is
 * in the background they go to the notification bar instead
 * (phoneNotifications.ts). Checked on start, when the app comes back to the
 * front and every minute; all stay listed under Notifications → Personal.
 */
export default function NotificationWatcher() {
  const { isAuthenticated } = useAuth();
  const { refreshWallet } = useGameState();
  const busy = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    setUpPhoneNotifications();

    async function redeem(code: string) {
      try {
        const r = await redeemGiftCode(code);
        refreshWallet().catch(() => {});
        showAlert('Bonus added!', `₹${r.amount.toLocaleString('en-IN')} is now in your wallet. Good luck! 🍀`, undefined, {
          kind: 'success',
          highlight: `₹${r.amount.toLocaleString('en-IN')}`,
        });
      } catch (err) {
        showAlert('Could not redeem', err instanceof ApiClientError ? err.message : 'Please try again from the gift box on Home.');
      }
    }

    function popUp(n: PlayerNotification) {
      const highlight = n.amount != null ? `₹${n.amount.toLocaleString('en-IN')}` : n.giftCode ?? undefined;
      const message = n.giftCode ? `${n.body}\n\nGift code: ${n.giftCode}` : n.body;
      showAlert(
        n.title,
        message,
        n.giftCode ? [{ text: 'Later', style: 'cancel' }, { text: 'Redeem now', onPress: () => redeem(n.giftCode!) }] : undefined,
        { kind: n.kind === 'WITHDRAWAL_REFUND' ? 'info' : 'success', highlight }
      );
    }

    async function check() {
      if (busy.current) return;
      busy.current = true;
      try {
        if (AppState.currentState !== 'active') {
          await postNewMessages();
          return;
        }
        const { items } = await fetchNotifications();
        const unread = items.filter((n) => !n.readAt).reverse();
        if (unread.length === 0) return;
        await markNotificationsRead(unread.map((n) => n.id));
        refreshWallet().catch(() => {});
        const shownBefore = await Promise.all(unread.map((n) => wasShown(n.id)));
        if (shownBefore.some((s) => !s)) Vibration.vibrate(BUZZ_THREE_TIMES);
        await rememberShown(unread.map((n) => n.id));
        unread.forEach(popUp);
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
