import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { api, setAuthReady as notifyApiAuthReady } from '../lib/api';

interface UserRecord {
  id: string;
  auth_id: string;
  role: 'viewer' | 'pro' | 'publisher' | 'admin';
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  userRecord: UserRecord | null;
  session: Session | null;
  tokenBalance: number;
  planName: string;
  authReady: boolean;
  isRefreshingBalance: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshTokenBalance: () => Promise<void>;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userRecord, setUserRecord] = useState<UserRecord | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [planName, setPlanName] = useState('free');
  const [authReady, setAuthReady] = useState(false);
  const [isRefreshingBalance, setIsRefreshingBalance] = useState(false);

  const processingSessionRef = useRef<string | null>(null);
  const lastEventTimeRef = useRef<number>(0);
  const lastBalanceFetchRef = useRef<number>(0);

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

      const response = await api.post('/v1/ensure-account');

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

  const fetchTokenBalance = async (retryCount = 0): Promise<{ tokens_balance: number; plan_name: string }> => {
    const now = Date.now();
    if (now - lastBalanceFetchRef.current < 10000) {
      console.log('[Auth] Balance fetch debounced (< 10s since last fetch)');
      return { tokens_balance: tokenBalance, plan_name: planName };
    }
    lastBalanceFetchRef.current = now;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.warn('[Auth] No session available for get_balance');
        return { tokens_balance: 0, plan_name: 'free' };
      }

      const response = await api.get('/v1/balance');

      if (!response.ok) {
        console.warn('[Auth] get_balance endpoint error:', { error: response.error, retryCount });

        if (retryCount < 2) {
          console.log(`[Auth] Retrying balance fetch (attempt ${retryCount + 1}/2) in 2s...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          return fetchTokenBalance(retryCount + 1);
        }

        return { tokens_balance: 0, plan_name: 'free' };
      }

      const balance = response.balance ?? 0;
      console.log('[Auth] Balance fetched', { balance });

      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        const { data, error } = await supabase
          .from('entitlements')
          .select(`
            user_id,
            plans (name)
          `)
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          console.error('[Auth] Error fetching plan name:', error);
        }

        return {
          tokens_balance: balance,
          plan_name: (data as any)?.plans?.name || 'free'
        };
      }

      return {
        tokens_balance: balance,
        plan_name: 'free'
      };
    } catch (err) {
      console.error('[Auth] Unexpected error fetching token balance:', err);
      return { tokens_balance: 0, plan_name: 'free' };
    }
  };

  const refreshTokenBalance = async () => {
    setIsRefreshingBalance(true);

    try {
      const balance = await fetchTokenBalance();
      setTokenBalance(balance.tokens_balance);
      setPlanName(balance.plan_name);
      console.log('[Auth] Token balance refreshed:', balance.tokens_balance);
    } catch (err) {
      console.error('[Auth] Error refreshing token balance:', err);
    } finally {
      setIsRefreshingBalance(false);
    }
  };

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
    setTokenBalance(0);
    setPlanName('free');
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

          const balance = await fetchTokenBalance();
          if (!isMounted) return;
          setTokenBalance(balance.tokens_balance);
          setPlanName(balance.plan_name);
          console.log('[Auth] Initial balance loaded:', balance.tokens_balance);
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

          const balance = await fetchTokenBalance();
          if (!isMounted) return;
          setTokenBalance(balance.tokens_balance);
          setPlanName(balance.plan_name);
          console.log('[Auth] Balance updated:', balance.tokens_balance);
        })();
      } else {
        setUserRecord(null);
        setTokenBalance(0);
        setPlanName('free');
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
        tokenBalance,
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
