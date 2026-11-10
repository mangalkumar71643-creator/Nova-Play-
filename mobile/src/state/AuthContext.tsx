import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  AuthResult,
  BackendUser,
  fetchBackendMe,
  registerWithPassword,
  loginWithPhonePassword,
  askPasswordResetCode,
  resetPasswordWithCode,
  selfExcludeBackend,
  setBackendDepositLimits,
  submitBackendKyc,
} from '../api/backend';
import { ApiClientError, setBackendToken } from '../api/client';

const STORAGE_KEY = 'novaplay:auth:v1';
const UID_MAP_KEY = 'novaplay:auth:uids:v1';
const BACKEND_TOKEN_MAP_KEY = 'novaplay:auth:backendTokens:v1';

type AuthState = {
  loading: boolean;
  isAuthenticated: boolean;
  phone: string | null;
  uid: string | null;
  avatarId: number;
  setAvatarId: (id: number) => void;
  /** Mobile number + password. Each returns null on success, else a message ("PASSWORD_NOT_SET" for an old account with no password yet). */
  passwordLogin: (phone: string, password: string) => Promise<string | null>;
  passwordRegister: (phone: string, password: string, inviteCode?: string) => Promise<string | null>;
  /** Forgot password: a code is texted to the number (sms false: it could not be, customer service gives it); then resetPassword with it. */
  askResetCode: (phone: string) => Promise<{ error: string | null; sms: boolean }>;
  resetPassword: (phone: string, code: string, password: string) => Promise<string | null>;
  logout: () => void;

  backendUser: BackendUser | null;
  refreshBackendUser: () => Promise<void>;
  submitKyc: () => Promise<string | null>;
  setDepositLimits: (input: {
    depositLimitDaily?: number | null;
    depositLimitWeekly?: number | null;
    depositLimitMonthly?: number | null;
  }) => Promise<string | null>;
  selfExclude: (days: number) => Promise<string | null>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

// KYC gate is off while the app is in testing (the backend's check in
// responsibleGamblingService.ts is off too). Set back to true — and
// re-enable the backend check — before real money goes live.
export const KYC_REQUIRED = false;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [avatarId, setAvatarIdState] = useState(1);
  const [backendUser, setBackendUser] = useState<BackendUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY).then(async (raw) => {
      if (cancelled || !raw) {
        setLoading(false);
        return;
      }
      try {
        const saved = JSON.parse(raw) as { phone: string; uid?: string; avatarId?: number };
        if (!saved.uid) throw new Error('pre-backend session, needs re-login');

        // The backend JWT is stored per-account (keyed by backend user id,
        // which is what `uid` is now) so it survives app restarts and
        // password-login without typing the password again.
        const tokenMapRaw = await AsyncStorage.getItem(BACKEND_TOKEN_MAP_KEY).catch(() => null);
        const tokenMap: Record<string, string> = tokenMapRaw ? JSON.parse(tokenMapRaw) : {};
        const token = tokenMap[saved.uid];
        if (!token) throw new Error('no backend session for this account, needs re-login');

        await setBackendToken(token);
        // Only a refused token (401/403) ends the session. No internet, a
        // timeout or a server hiccup keeps the player signed in; their
        // profile is fetched again a little later.
        let me: BackendUser | null = null;
        try {
          me = await fetchBackendMe();
        } catch (err) {
          if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) throw err;
          setTimeout(() => {
            fetchBackendMe()
              .then((u) => !cancelled && setBackendUser(u))
              .catch(() => {});
          }, 5000);
        }

        if (cancelled) return;
        setPhone(saved.phone);
        setUid(saved.uid);
        setAvatarIdState(saved.avatarId ?? 1);
        setBackendUser(me);
        setIsAuthenticated(true);
      } catch {
        // Corrupt storage, or the backend session is gone/expired — fall
        // back to signed-out so the user logs in again.
        await setBackendToken(null);
        await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
      }
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persists the backend session (JWT + phone->uid map) and flips on
  // isAuthenticated. Shared by the login and register paths.
  const completeBackendLogin = useCallback(async (phoneNumber: string, result: AuthResult) => {
    await setBackendToken(result.token);

    const tokenMapRaw = await AsyncStorage.getItem(BACKEND_TOKEN_MAP_KEY).catch(() => null);
    const tokenMap: Record<string, string> = tokenMapRaw ? JSON.parse(tokenMapRaw) : {};
    tokenMap[result.user.id] = result.token;
    await AsyncStorage.setItem(BACKEND_TOKEN_MAP_KEY, JSON.stringify(tokenMap)).catch(() => {});

    const uidMapRaw = await AsyncStorage.getItem(UID_MAP_KEY).catch(() => null);
    const uidMap: Record<string, string> = uidMapRaw ? JSON.parse(uidMapRaw) : {};
    uidMap[phoneNumber] = result.user.id;
    await AsyncStorage.setItem(UID_MAP_KEY, JSON.stringify(uidMap)).catch(() => {});

    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ phone: phoneNumber, uid: result.user.id, avatarId: 1 })
    ).catch(() => {});

    setPhone(phoneNumber);
    setUid(result.user.id);
    setAvatarIdState(1);
    setBackendUser(result.user);
    setIsAuthenticated(true);
  }, []);

  const passwordLogin = useCallback(
    async (phoneNumber: string, password: string): Promise<string | null> => {
      try {
        await completeBackendLogin(phoneNumber, await loginWithPhonePassword(phoneNumber, password));
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : 'Could not log you in. Please try again.';
      }
    },
    [completeBackendLogin]
  );

  const passwordRegister = useCallback(
    async (phoneNumber: string, password: string, inviteCode?: string): Promise<string | null> => {
      try {
        await completeBackendLogin(phoneNumber, await registerWithPassword(phoneNumber, password, inviteCode));
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : 'Could not create your account. Please try again.';
      }
    },
    [completeBackendLogin]
  );

  const askResetCode = useCallback(async (phoneNumber: string) => {
    try {
      const r = await askPasswordResetCode(phoneNumber);
      return { error: null, sms: r.sms !== false };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Could not send the code.', sms: false };
    }
  }, []);

  const resetPassword = useCallback(
    async (phoneNumber: string, code: string, password: string): Promise<string | null> => {
      try {
        await completeBackendLogin(phoneNumber, await resetPasswordWithCode(phoneNumber, code, password));
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : 'Could not reset the password. Please try again.';
      }
    },
    [completeBackendLogin]
  );

  const setAvatarId = useCallback(
    (id: number) => {
      setAvatarIdState(id);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ phone, uid, avatarId: id })).catch(() => {});
    },
    [phone, uid]
  );

  const logout = useCallback(() => {
    setIsAuthenticated(false);
    setPhone(null);
    setUid(null);
    setAvatarIdState(1);
    setBackendUser(null);
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    setBackendToken(null).catch(() => {});
  }, []);

  const refreshBackendUser = useCallback(async () => {
    const me = await fetchBackendMe();
    setBackendUser(me);
  }, []);

  const submitKyc = useCallback(async (): Promise<string | null> => {
    try {
      // A real KYC provider would collect an actual document upload here —
      // this backend endpoint is a mock (auto-approve) in dev mode, see
      // backend/src/services/kycService.ts.
      await submitBackendKyc('passport', `doc_${Date.now()}`);
      await refreshBackendUser();
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Could not submit KYC verification.';
    }
  }, [refreshBackendUser]);

  const setDepositLimits = useCallback(
    async (input: {
      depositLimitDaily?: number | null;
      depositLimitWeekly?: number | null;
      depositLimitMonthly?: number | null;
    }): Promise<string | null> => {
      try {
        await setBackendDepositLimits(input);
        await refreshBackendUser();
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : 'Could not update deposit limits.';
      }
    },
    [refreshBackendUser]
  );

  const selfExclude = useCallback(
    async (days: number): Promise<string | null> => {
      try {
        await selfExcludeBackend(days);
        await refreshBackendUser();
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : 'Could not self-exclude.';
      }
    },
    [refreshBackendUser]
  );

  const value: AuthState = {
    loading,
    isAuthenticated,
    phone,
    uid,
    avatarId,
    setAvatarId,
    passwordLogin,
    passwordRegister,
    askResetCode,
    resetPassword,
    logout,
    backendUser,
    refreshBackendUser,
    submitKyc,
    setDepositLimits,
    selfExclude,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
