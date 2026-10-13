import { initialNotifications } from '../data/mockData';
import { AppNotification } from '../data/models';
import { delay } from './delay';

export async function fetchNotifications(): Promise<AppNotification[]> {
  return delay([...initialNotifications]);
}
