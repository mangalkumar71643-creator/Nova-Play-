import { dailyRewardTrack, initialAchievements } from '../data/mockData';
import { Achievement, DailyRewardDay } from '../data/models';
import { delay } from './delay';

export async function fetchDailyRewardTrack(): Promise<DailyRewardDay[]> {
  return delay([...dailyRewardTrack]);
}

export async function fetchAchievements(): Promise<Achievement[]> {
  return delay([...initialAchievements]);
}
