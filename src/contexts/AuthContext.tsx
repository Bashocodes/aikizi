import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { api, setAuthReady as notifyApiAuthReady } from '../lib/api';

interface UserRecord {
  id: string;
  auth_id: string;
  role: 'viewer' | 'pro' | 'publisher' | 'admin';
  created_at: string;
}

type TokenBalanceStatus = 'idle' | 'loading' | 'fresh' | 'stale' | 'error';

interface TokenBalanceState {
  lastKnownBalance: number | null;
  status: TokenBalanceStatus;
  updatedAt: number;
  isAuthoritative: boolean;
}

interface AuthContextType {
  user: User | null;
  userRecord: UserRecord | null;
  session: Session | null;
  tokenBalance: number | null;
  tokensBalance: number | null;
  tokenBalanceState: TokenBalanceState;
  status: TokenBalanceStatus;
  isAuthoritative: boolean;
  planName: string;
  authReady: boolean;
  isRefreshingBalance: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshTokenBalance: (forceRefresh?: boolean) => Promise<void>;
}

let toastTimeout: NodeJS.Timeout | null = null;

function showToast(message: string) {
  if (toastTimeout) clearTimeout(toastTimeout);

  const existingToast = document.getElementById('auth-toast');
  if (existingToast) existingToast.remove();

  const toast = document.createElement('div');
  toast.id = 'auth-toast';
  toast.className = 'fixed top-4 right-4 z-[9999] bg-red-600 text-white px-6 py-3 rounded-lg shadow-lg font-semibold max-w-md';
  toast.textContent = message;
  document.body.appendChild(toast);

  toastTimeout = setTimeout(() => {
    toast.remove();
  }, 5000);
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export async function getAccessToken(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      console.log('[Auth] Access token fetched, len:', session.access_token.length);
      return session.access_token;
    }
    console.warn('[Auth] No access token available');
    return null;
  } catch (error) {
    console.error('[Auth] Error fetching access token:', error);
    return null;
  }
}

const createDefaultBalanceState = (): TokenBalanceState => ({
  lastKnownBalance: null,
  status: 'idle',
  updatedAt: 0,
  isAuthoritative: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userRecord, setUserRecord] = useState<UserRecord | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [tokenBalanceState, setTokenBalanceState] = useState<TokenBalanceState>(createDefaultBalanceState);
  const [planName, setPlanName] = useState('free');
  const [authReady, setAuthReady] = useState(false);
  const [isRefreshingBalance, setIsRefreshingBalance] = useState(false);

  const processingSessionRef = useRef<string | null>(null);
  const lastEventTimeRef = useRef<number>(0);
  const lastBalanceFetchRef = useRef<number>(0);
  const balanceStateRef = useRef<TokenBalanceState>(createDefaultBalanceState());
  const lastVisibilityOrFocusTriggerRef = useRef<number>(0);

  const ensureAccount = async (userId: string, retryCount = 0): Promise<boolean> => {
    const cacheKey = `ensure:${userId}`;

    if (sessionStorage.getItem(cacheKey) === 'done') {
      console.log('[Auth] Account already ensured (cached), skipping');
      return true;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.warn('[Auth] No session available for ensure_account');
        return false;
      }

      const response = await api.post('/ensure-account');

      if (!response.ok) {
        console.warn('[Auth] ensure_account endpoint error:', { error: response.error, retryCount });

        if (retryCount === 0) {
          console.log('[Auth] Retrying ensure_account after 500ms...');
          await new Promise(resolve => setTimeout(resolve, 500));
          return await ensureAccount(userId, 1);
        }

        showToast('Account setup couldn\'t complete. Reload and try again.');
        return false;
      }

      console.log('[Auth] Account ensured successfully', { userId: response.user_id });
      sessionStorage.setItem(cacheKey, 'done');
      return true;
    } catch (err) {
      console.warn('[Auth] ensure_account unexpected error:', { err, retryCount });

      if (retryCount === 0) {
        console.log('[Auth] Retrying ensure_account after 500ms...');
        await new Promise(resolve => setTimeout(resolve, 500));
        return await ensureAccount(userId, 1);
      }

      showToast('Account setup couldn\'t complete. Reload and try again.');
      return false;
    }
  };

  const fetchUserRecord = async (authId: string) => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('auth_id', authId)
      .maybeSingle();

    if (error) {
      console.error('[Auth] Error fetching user record:', error);
      return null;
    }

    return data;
  };

  const fetchTokenBalance = useCallback(async (
    options: { forceRefresh?: boolean; allowRetry?: boolean } = {}
  ): Promise<boolean> => {
    const { forceRefresh = false, allowRetry = true } = options;
    let allowSessionRetry = allowRetry;
    const now = Date.now();
    if (!forceRefresh && now - lastBalanceFetchRef.current < 10000) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[Auth] Balance fetch debounced (< 10s since last fetch)');
      }
      return false;
    }
    lastBalanceFetchRef.current = now;

    setTokenBalanceState(prev => ({
      ...prev,
      status: 'loading',
    }));

    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession?.access_token) {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[Auth] Balance fetch fallback: no Supabase session');
        }
        setTokenBalanceState(prev => ({
          ...prev,
          status: 'stale',
          isAuthoritative: false,
        }));
        return false;
      }

      let response = await api.get('/balance');

      if (!response.ok) {
        const errorMessage = response.error || 'Unknown balance error';
        const lowerError = errorMessage.toLowerCase();
        const requiresRefresh = allowSessionRetry && (
          response.code === 'TOKEN_EXPIRED' ||
          response.code === 'TOKEN_NOT_YET_VALID' ||
          lowerError.includes('status 401') ||
          lowerError.includes('status 419')
        );

        if (requiresRefresh) {
          const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
          if (!refreshError && refreshed.session) {
            if (process.env.NODE_ENV !== 'production') {
              console.debug('[Auth] Session refreshed after balance error; retrying');
            }
            allowSessionRetry = false;
            response = await api.get('/balance');
          }
        }

        if (!response.ok) {
          if (process.env.NODE_ENV !== 'production') {
            console.debug('[Auth] Balance fetch fallback: API error', {
              error: response.error,
              code: (response as any).code,
            });
          }
          setTokenBalanceState(prev => ({
            ...prev,
            status: response.error ? 'error' : 'stale',
            isAuthoritative: false,
          }));
          return false;
        }
      }

      const payload = response as Record<string, any>;
      const rawBalance = payload.balance ?? payload.tokens_balance;
      const balanceValue = typeof rawBalance === 'number' ? rawBalance : null;
      const updatedAt = Date.now();

      setTokenBalanceState(prev => ({
        lastKnownBalance: balanceValue ?? prev.lastKnownBalance,
        status: 'fresh',
        updatedAt,
        isAuthoritative: true,
      }));

      let resolvedPlanName = typeof payload.plan_name === 'string' ? payload.plan_name : null;

      if (!resolvedPlanName && currentSession.user?.id) {
        const { data, error } = await supabase
          .from('entitlements')
          .select(`
            user_id,
            plans (name)
          `)
          .eq('user_id', currentSession.user.id)
          .maybeSingle();

        if (error) {
          console.error('[Auth] Error fetching plan name:', error);
        }

        resolvedPlanName = (data as any)?.plans?.name || null;
      }

      setPlanName(prev => resolvedPlanName || prev || 'free');

      return balanceValue !== null;
    } catch (err) {
      console.error('[Auth] Unexpected error fetching token balance:', err);
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[Auth] Balance fetch fallback: unexpected error');
      }
      setTokenBalanceState(prev => ({
        ...prev,
        status: 'error',
        isAuthoritative: false,
      }));
      return false;
    }
  }, []);

  const refreshTokenBalance = useCallback(async (forceRefresh = false) => {
    setIsRefreshingBalance(true);

    try {
      if (forceRefresh) {
        lastBalanceFetchRef.current = 0;
      }
      await fetchTokenBalance({ forceRefresh });
    } catch (err) {
      console.error('[Auth] Error refreshing token balance:', err);
    } finally {
      setIsRefreshingBalance(false);
    }
  }, [fetchTokenBalance]);

  useEffect(() => {
    balanceStateRef.current = tokenBalanceState;
  }, [tokenBalanceState]);

  useEffect(() => {
    const triggerRefresh = (reason: string) => {
      const now = Date.now();
      if (now - lastVisibilityOrFocusTriggerRef.current < 300) {
        return;
      }
      lastVisibilityOrFocusTriggerRef.current = now;
      const state = balanceStateRef.current;
      const staleForLong = state.status === 'stale' && state.updatedAt > 0 && now - state.updatedAt > 10000;
      if (process.env.NODE_ENV !== 'production') {
        console.debug(`[Auth] ${reason} -> refreshing balance`, {
          lastKnownBalance: state.lastKnownBalance,
          status: state.status,
          staleForLong,
        });
      }
      refreshTokenBalance(true);
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        triggerRefresh('visibilitychange');
      }
    };

    const handleWindowFocus = () => {
      triggerRefresh('focus');
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshTokenBalance]);

  const tokensBalance = tokenBalanceState.lastKnownBalance;
  const balanceStatus = tokenBalanceState.status;
  const isBalanceAuthoritative = tokenBalanceState.isAuthoritative;

  const signInWithGoogle = async () => {
    const currentPath = window.location.pathname + window.location.search;
    const postLoginPath = currentPath === '/' ? '/explore' : currentPath;
    sessionStorage.setItem('postLogin', postLoginPath);
    console.log('[Auth] Saving postLogin destination:', postLoginPath);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'https://aikizi.xyz/auth/callback',
      },
    });

    if (error) {
      console.error('[Auth] Error signing in:', error);
      throw error;
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('[Auth] Error signing out:', error);
      throw error;
    }
    setUser(null);
    setUserRecord(null);
    setSession(null);
    const resetState = createDefaultBalanceState();
    setTokenBalanceState(resetState);
    balanceStateRef.current = resetState;
    setPlanName('free');
    lastBalanceFetchRef.current = 0;
  };

  useEffect(() => {
    let isMounted = true;

    console.log('[Auth Boot] Origin:', window.location.origin, 'URL:', window.location.href);

    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!isMounted) return;

      setSession(session);
      setUser(session?.user ?? null);
      setAuthReady(true);
      notifyApiAuthReady();

      console.log('[Auth] Initial getSession done, authReady=true', session ? `user.id=${session.user.id}` : 'no session');

      if (session?.user) {
        (async () => {
          const shouldEnsureAccount = !sessionStorage.getItem(`ensure:${session.user.id}`);

          if (shouldEnsureAccount) {
            console.log('[Auth] Initial session: Ensuring account...');
            const accountReady = await ensureAccount(session.user.id);
            if (!isMounted || !accountReady) return;
          }

          const userData = await fetchUserRecord(session.user.id);
          if (!isMounted) return;
          setUserRecord(userData);

          await fetchTokenBalance();
          if (!isMounted) return;
          if (process.env.NODE_ENV !== 'production') {
            console.debug('[Auth] Initial balance load complete', {
              balance: balanceStateRef.current.lastKnownBalance,
              status: balanceStateRef.current.status,
            });
          }
        })();
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;

      const now = Date.now();
      const sessionId = session?.user?.id || null;

      if (sessionId && sessionId === processingSessionRef.current && now - lastEventTimeRef.current < 2000) {
        console.log('[Auth] Debounce: skipped duplicate', event, 'for user:', sessionId);
        return;
      }

      if (sessionId) {
        processingSessionRef.current = sessionId;
        lastEventTimeRef.current = now;
      }

      console.log('[Auth] onAuthStateChange:', event, session ? `user.id=${session.user.id}` : 'no session');

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        (async () => {
          const shouldEnsureAccount = event === 'SIGNED_IN';

          if (shouldEnsureAccount) {
            console.log('[Auth] SIGNED_IN: Ensuring account...');
            const accountReady = await ensureAccount(session.user.id);
            if (!isMounted || !accountReady) return;
          }

          const userData = await fetchUserRecord(session.user.id);
          if (!isMounted) return;
          setUserRecord(userData);

          await fetchTokenBalance();
          if (!isMounted) return;
          if (process.env.NODE_ENV !== 'production') {
            console.debug('[Auth] Balance updated via onAuthStateChange', {
              balance: balanceStateRef.current.lastKnownBalance,
              status: balanceStateRef.current.status,
            });
          }
        })();
      } else {
        setUserRecord(null);
        const resetState = createDefaultBalanceState();
        setTokenBalanceState(resetState);
        balanceStateRef.current = resetState;
        setPlanName('free');
        lastBalanceFetchRef.current = 0;
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        userRecord,
        session,
        tokenBalance: tokensBalance,
        tokensBalance,
        tokenBalanceState,
        status: balanceStatus,
        isAuthoritative: isBalanceAuthoritative,
        planName,
        authReady,
        isRefreshingBalance,
        signInWithGoogle,
        signOut,
        refreshTokenBalance,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
