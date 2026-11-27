import { Linking } from 'react-native';
import { GAME_CATEGORIES } from '../components/GameTile';

/*
 * What a banner, an app-open popup, a Promotion card, a category banner or a custom page's button / picture opens (the admin
 * picks it; customPageService.ts on the server):
 *  - a game: its screen name ("Aviator", "WinGo", ...),
 *  - one of the app's own pages: "Deposit", "BettingTasks", "Vip", "Earn", "BettingRebate", "SuperJackpot", "GiftCode", "Help",
 *  - "page:<id>": one of the admin's own pages (Admin → Pages), shown by CustomPageScreen,
 *  - "url:https://...": a website (a Telegram channel, WhatsApp support...), opened in the phone's browser,
 *  - "DOWNLOAD": the app download link (for the website; the caller decides whether to offer it).
 * Anything else opens nothing.
 */

export const DOWNLOAD_TARGET = 'DOWNLOAD';
const GAME_SCREENS = new Set<string>(GAME_CATEGORIES.flatMap((c) => c.games));
const PAGE_PREFIX = 'page:';
const URL_PREFIX = 'url:';

/** The app's own pages a banner can open (the admin panel's APP_TARGETS), and how to get there. */
const APP_PAGES: Record<string, [string, object?]> = {
  Deposit: ['Deposit'],
  BettingTasks: ['BettingTasks'],
  Vip: ['MainTabs', { screen: 'Vip' }],
  Earn: ['MainTabs', { screen: 'Earn' }],
  BettingRebate: ['AgentRewards', { kind: 'BET' }],
  SuperJackpot: ['AgentJackpot'],
  GiftCode: ['GiftCode'],
  Help: ['Help'],
};

type Nav = { navigate: (...args: any[]) => void };

/** The action for `target`, or null when there is nothing this app can open (no target, or one it does not know). */
export function opener(navigation: Nav, target: string | null | undefined, downloadUrl?: string | null): (() => void) | null {
  if (!target) return null;
  if (GAME_SCREENS.has(target)) return () => navigation.navigate(target);
  const appPage = APP_PAGES[target];
  if (appPage) return () => navigation.navigate(...appPage);
  if (target.startsWith(PAGE_PREFIX)) {
    const id = target.slice(PAGE_PREFIX.length);
    return id ? () => navigation.navigate('CustomPage', { id }) : null;
  }
  if (target.startsWith(URL_PREFIX)) {
    const url = target.slice(URL_PREFIX.length);
    return /^https?:\/\/[^\s]+$/i.test(url) ? () => void Linking.openURL(url).catch(() => {}) : null;
  }
  if (target === DOWNLOAD_TARGET && downloadUrl) return () => void Linking.openURL(downloadUrl).catch(() => {});
  return null;
}
