import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  AuthResult,
  BackendUser,
  completePhoneProfile,
  fetchBackendMe,
  requestPhoneOtp,
  selfExcludeBackend,
  setBackendDepositLimits,
  submitBackendKyc,
  verifyPhoneOtp,
} from '../api/backend';
import { ApiClientError, setBackendToken } from '../api/client';

const STORAGE_KEY = 'novaplay:auth:v1';
const UID_MAP_KEY = 'novaplay:auth:uids:v1';
const PASSWORD_STORAGE_KEY = 'novaplay:passwords:v1';
const BACKEND_TOKEN_MAP_KEY = 'novaplay:auth:backendTokens:v1';

// Not real cryptography — there's no need for more than a one-way,
// deterministic equality check for this local device-only shortcut.
function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
}

export type ProfileFields = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  country: string;
};

type AuthState = {
  loading: boolean;
  isAuthenticated: boolean;
  phone: string | null;
  uid: string | null;
  avatarId: number;
  setAvatarId: (id: number) => void;
  pendingPhone: string | null;
  otpSent: boolean;
  otpError: string | null;
  // Only set when the backend's SMS_PROVIDER_MODE=mock — no real SMS is
  // sent, so the code is shown on-screen instead for local testing.
  devOtpCode: string | null;
  // Each returns null on success, or a human-readable error message on failure.
  requestOtp: (phone: string) => Promise<string | null>;
  resendOtp: (phone: string) => Promise<string | null>;
  verifyOtp: (code: string) => Promise<string | null>;
  // Testing shortcut: requests the code and, when the backend is in
  // SMS_PROVIDER_MODE=mock (so it already hands us the code), verifies it
  // immediately — no manual OTP entry. Falls back to the normal
  // request-then-enter-code flow when a real code was actually texted.
  // TODO: remove this shortcut once real OTP delivery is ready for launch.
  quickLogin: (phone: string) => Promise<string | null>;
  verifyIdentityOtp: (code: string) => Promise<string | null>;
  hasLoginPassword: boolean;
  setLoginPassword: (password: string) => Promise<void>;
  loginWithPassword: (phone: string, password: string) => Promise<boolean>;
  logout: () => void;

  backendUser: BackendUser | null;
  // True once OTP verification succeeds for a brand-new phone number —
  // the backend needs name/DOB/country (for the 18+ check) before it will
  // create the account. RootNavigator shows CompleteProfileScreen while
  // this is true.
  needsProfile: boolean;
  completeProfile: (fields: ProfileFields) => Promise<string | null>;
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
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [devOtpCode, setDevOtpCode] = useState<string | null>(null);
  const [hasLoginPassword, setHasLoginPassword] = useState(false);
  const [backendUser, setBackendUser] = useState<BackendUser | null>(null);
  const [needsProfile, setNeedsProfile] = useState(false);

  useEffect(() => {
    if (!uid) {
      setHasLoginPassword(false);
      return;
    }
    let cancelled = false;
    AsyncStorage.getItem(PASSWORD_STORAGE_KEY).then((raw) => {
      if (cancelled) return;
      const passwords: Record<string, string> = raw ? JSON.parse(raw) : {};
      setHasLoginPassword(Boolean(passwords[uid]));
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

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
        // password-login without going through OTP again.
        const tokenMapRaw = await AsyncStorage.getItem(BACKEND_TOKEN_MAP_KEY).catch(() => null);
        const tokenMap: Record<string, string> = tokenMapRaw ? JSON.parse(tokenMapRaw) : {};
        const token = tokenMap[saved.uid];
        if (!token) throw new Error('no backend session for this account, needs re-login');

        await setBackendToken(token);
        const me = await fetchBackendMe();

        if (cancelled) return;
        setPhone(saved.phone);
        setUid(saved.uid);
        setAvatarIdState(saved.avatarId ?? 1);
        setBackendUser(me);
        setIsAuthenticated(true);
      } catch {
        // Corrupt storage, or the backend session is gone/expired — fall
        // back to signed-out so the user re-verifies via OTP.
        await setBackendToken(null);
        await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
      }
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Returns null on success, or the error message on failure — returned
  // directly (rather than left in state) so callers get the real message
  // even though it's an async function whose enclosing render may already
  // be stale by the time it resolves.
  const requestOtpCode = useCallback(async (phoneNumber: string): Promise<string | null> => {
    setOtpError(null);
    setDevOtpCode(null);
    try {
      const result = await requestPhoneOtp(phoneNumber);
      setPendingPhone(phoneNumber);
      setOtpSent(true);
      setDevOtpCode(result.devCode);
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not send the verification code.';
      setOtpError(message);
      return message;
    }
  }, []);

  const requestOtp = requestOtpCode;
  const resendOtp = requestOtpCode;

  // Persists the backend session (JWT + phone->uid map) and flips on
  // isAuthenticated. Shared by the direct-login and complete-profile paths.
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
    setNeedsProfile(false);
    setOtpSent(false);
    setDevOtpCode(null);
    setPendingPhone(null);
  }, []);

  const verifyOtp = useCallback(
    async (code: string): Promise<string | null> => {
      if (!pendingPhone) return 'No code was sent yet.';
      try {
        const result = await verifyPhoneOtp(pendingPhone, code);
        await completeBackendLogin(pendingPhone, result);
        return null;
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 428) {
          // Brand-new phone number — CompleteProfileScreen finishes
          // registration with name/DOB/country; pendingPhone stays set,
          // and the backend remembers this number was verified for the
          // next 10 minutes so the code isn't needed again.
          setNeedsProfile(true);
          return null;
        }
        const message = err instanceof Error ? err.message : 'Could not verify your account. Please try again.';
        setOtpError(message);
        return message;
      }
    },
    [completeBackendLogin, pendingPhone]
  );

  const quickLogin = useCallback(
    async (phoneNumber: string): Promise<string | null> => {
      setOtpError(null);
      setDevOtpCode(null);
      try {
        const otpResult = await requestPhoneOtp(phoneNumber);
        if (!otpResult.devCode) {
          // Real SMS mode — no code to auto-fill, fall back to the normal flow.
          setPendingPhone(phoneNumber);
          setOtpSent(true);
          setDevOtpCode(null);
          return null;
        }
        try {
          const result = await verifyPhoneOtp(phoneNumber, otpResult.devCode);
          await completeBackendLogin(phoneNumber, result);
          return null;
        } catch (err) {
          if (err instanceof ApiClientError && err.status === 428) {
            // Brand-new number — testing shortcut fills a throwaway profile
            // instead of showing CompleteProfileScreen, so Login is truly
            // one tap. Remove once real profile entry is required.
            const result = await completePhoneProfile({
              phone: phoneNumber,
              firstName: 'Test',
              lastName: 'User',
              dateOfBirth: '2000-01-01',
              country: 'IN',
            });
            await completeBackendLogin(phoneNumber, result);
            return null;
          }
          throw err;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not sign you in.';
        setOtpError(message);
        return message;
      }
    },
    [completeBackendLogin]
  );

  const completeProfile = useCallback(
    async (fields: ProfileFields): Promise<string | null> => {
      if (!pendingPhone) return 'Your session expired — please verify your number again.';
      try {
        const result = await completePhoneProfile({ phone: pendingPhone, ...fields });
        await completeBackendLogin(pendingPhone, result);
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : 'Could not create your account. Please try again.';
      }
    },
    [pendingPhone, completeBackendLogin]
  );

  // For an already-authenticated user re-verifying their own number (e.g.
  // before setting a login password) — confirms the code without touching
  // phone/uid/avatar/isAuthenticated. Assumes `requestOtp(phone)` was
  // already called with the user's current number.
  const verifyIdentityOtp = useCallback(
    async (code: string): Promise<string | null> => {
      if (!pendingPhone) return 'No code was sent yet.';
      try {
        await verifyPhoneOtp(pendingPhone, code);
        setPendingPhone(null);
        setOtpSent(false);
        return null;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Incorrect code. Please try again.';
        setOtpError(message);
        return message;
      }
    },
    [pendingPhone]
  );

  const setLoginPassword = useCallback(
    async (password: string) => {
      if (!uid) return;
      const raw = await AsyncStorage.getItem(PASSWORD_STORAGE_KEY).catch(() => null);
      const passwords: Record<string, string> = raw ? JSON.parse(raw) : {};
      passwords[uid] = simpleHash(password);
      await AsyncStorage.setItem(PASSWORD_STORAGE_KEY, JSON.stringify(passwords)).catch(() => {});
      setHasLoginPassword(true);
    },
    [uid]
  );

  const loginWithPassword = useCallback(
    async (phoneNumber: string, password: string) => {
      try {
        const mapRaw = await AsyncStorage.getItem(UID_MAP_KEY);
        const uidMap: Record<string, string> = mapRaw ? JSON.parse(mapRaw) : {};
        const accountUid = uidMap[phoneNumber];
        if (!accountUid) return false;

        const passwordsRaw = await AsyncStorage.getItem(PASSWORD_STORAGE_KEY);
        const passwords: Record<string, string> = passwordsRaw ? JSON.parse(passwordsRaw) : {};
        const storedHash = passwords[accountUid];
        if (!storedHash || storedHash !== simpleHash(password)) return false;

        // This local password is just a device-side shortcut past OTP — the
        // backend session it unlocks must already exist from a prior OTP
        // login, since only that path can mint a real wallet/KYC account.
        const tokenMapRaw = await AsyncStorage.getItem(BACKEND_TOKEN_MAP_KEY);
        const tokenMap: Record<string, string> = tokenMapRaw ? JSON.parse(tokenMapRaw) : {};
        const token = tokenMap[accountUid];
        if (!token) return false;

        await setBackendToken(token);
        const me = await fetchBackendMe();

        setPhone(phoneNumber);
        setUid(accountUid);
        setBackendUser(me);
        setIsAuthenticated(true);
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ phone: phoneNumber, uid: accountUid, avatarId })).catch(() => {});
        return true;
      } catch {
        return false;
      }
    },
    [avatarId]
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
    setNeedsProfile(false);
    setPendingPhone(null);
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
    pendingPhone,
    otpSent,
    otpError,
    devOtpCode,
    requestOtp,
    resendOtp,
    verifyOtp,
    quickLogin,
    verifyIdentityOtp,
    hasLoginPassword,
    setLoginPassword,
    loginWithPassword,
    logout,
    backendUser,
    needsProfile,
    completeProfile,
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
