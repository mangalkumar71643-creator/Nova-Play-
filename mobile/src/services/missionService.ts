import { initialMissions } from '../data/mockData';
import { Mission } from '../data/models';
import { delay } from './delay';

export async function fetchMissions(): Promise<Mission[]> {
  return delay([...initialMissions]);
}
