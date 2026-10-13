import { initialUser } from '../data/mockData';
import { User } from '../data/models';
import { delay } from './delay';

export async function fetchUser(): Promise<User> {
  return delay({ ...initialUser });
}
