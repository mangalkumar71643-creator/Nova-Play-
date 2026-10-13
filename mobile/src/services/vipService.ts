import { vipLevels } from '../data/mockData';
import { VipLevelDef } from '../data/models';
import { delay } from './delay';

export async function fetchVipLevels(): Promise<VipLevelDef[]> {
  return delay([...vipLevels]);
}
