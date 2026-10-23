import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// Live NovaPlay backend on Vercel.
export const API_BASE_URL = 'https://novaplay-server.vercel.app';

const TOKEN_KEY = 'novaplay:backendToken:v1';

export async function getBackendToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setBackendToken(token: string | null): Promise<void> {
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

export class ApiClientError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// A request that gets no reply in this long is given up on, so a weak
// network never leaves a button stuck on "busy" for good.
const REQUEST_TIMEOUT_MS = 20_000;
const NO_REPLY =
  'No reply from the server — check your internet. If you placed a bet or a payment, check your balance before trying again.';

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getBackendToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // Lets the server turn away versions whose rules text is out of date.
    'X-App-Version': Constants.expoConfig?.version ?? '0.0.0',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  // A caller with its own signal (the crash games' quick polls) sets its own limit.
  const controller = options.signal ? null : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
  let res: Response;
  let body: any;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers, signal: options.signal ?? controller!.signal });
    body = res.status !== 204 ? await res.json().catch(() => null) : null;
  } catch (err) {
    if (controller?.signal.aborted) throw new ApiClientError(0, NO_REPLY);
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (!res.ok) {
    throw new ApiClientError(res.status, body?.error ?? 'Request failed');
  }
  return body as T;
}
