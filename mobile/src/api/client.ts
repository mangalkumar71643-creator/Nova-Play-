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
const NO_NETWORK = "Can't reach the server — your internet looks slow or off. Check it and try again.";
// On a slow or patchy network a request is tried again after these waits
// (all within REQUEST_TIMEOUT_MS). Any request is retried when the failure
// shows it never left the phone (the server's address could not be looked
// up, or no connection could be made); other failures only for reads, as a
// bet or payment that did reach the server must not be sent twice.
const RETRY_DELAYS_MS = [1000, 2500];
const NOT_SENT = /UnknownHost|resolve host|ENOTFOUND|EAI_AGAIN|ConnectException|Failed to connect|ECONNREFUSED|No address associated/i;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const isRead = !options.method || options.method.toUpperCase() === 'GET';
  let res: Response;
  let body: any;
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers, signal: options.signal ?? controller!.signal });
        body = res.status !== 204 ? await res.json().catch(() => null) : null;
        break;
      } catch (err) {
        if (controller?.signal.aborted) throw new ApiClientError(0, NO_REPLY);
        // The caller's own signal (the crash games' polls): it retries by itself.
        if (options.signal) throw err;
        const message = err instanceof Error ? err.message : String(err);
        if (attempt < RETRY_DELAYS_MS.length && (isRead || NOT_SENT.test(message))) {
          await sleep(RETRY_DELAYS_MS[attempt]);
          if (controller?.signal.aborted) throw new ApiClientError(0, NO_REPLY);
          continue;
        }
        throw new ApiClientError(0, NOT_SENT.test(message) || isRead ? NO_NETWORK : NO_REPLY);
      }
    }
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (!res.ok) {
    throw new ApiClientError(res.status, body?.error ?? 'Request failed');
  }
  return body as T;
}
