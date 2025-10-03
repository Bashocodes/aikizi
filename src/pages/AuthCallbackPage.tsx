import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const { signInWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const handleCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const hasCode = urlParams.has('code');
      const hasState = urlParams.has('state');
      const hash = window.location.hash;
      const hasAccessToken = hash.includes('access_token');

      console.log('[Auth Callback] URL analysis:', {
        href: window.location.href,
        hasCode,
        hasState,
        hasAccessToken,
      });

      try {
        if (hasCode && hasState) {
          console.log('[Auth Callback] Step 1: PKCE flow detected, exchanging code for session...');

          const { data, error } = await supabase.auth.exchangeCodeForSession(window.location.href);

          if (error) {
            console.error('[Auth Callback] PKCE exchange failed:', error);
            setError(error.message);
            return;
          }

          console.log('[Auth Callback] PKCE exchange successful, user.id:', data.session?.user?.id);
          navigate('/explore', { replace: true });
          return;
        }

        if (hasAccessToken) {
          console.log('[Auth Callback] Step 2: Implicit flow detected, parsing hash tokens...');

          const hashParams = new URLSearchParams(hash.substring(1));
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');

          if (accessToken && refreshToken) {
            const { data, error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (error) {
              console.error('[Auth Callback] setSession failed:', error);
              setError(error.message);
              return;
            }

            console.log('[Auth Callback] Implicit flow successful, user.id:', data.session?.user?.id);
            navigate('/explore', { replace: true });
            return;
          } else {
            console.error('[Auth Callback] Hash has access_token indicator but tokens not found');
          }
        }

        console.log('[Auth Callback] Step 3: Waiting for detectSessionInUrl auto-parse...');
        await new Promise(resolve => setTimeout(resolve, 100));

        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) {
          console.log('[Auth Callback] detectSessionInUrl successful, user.id:', sessionData.session.user.id);
          navigate('/explore', { replace: true });
          return;
        }

        console.log('[Auth Callback] Step 4: Starting retry mechanism...');
        const maxRetries = 10;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          console.log(`[Auth Callback] Retry attempt ${attempt}/${maxRetries}`);
          await new Promise(resolve => setTimeout(resolve, 200));

          const { data: retrySessionData } = await supabase.auth.getSession();
          if (retrySessionData.session) {
            console.log('[Auth Callback] Retry successful, user.id:', retrySessionData.session.user.id);
            navigate('/explore', { replace: true });
            return;
          }
        }

        console.error('[Auth Callback] All handshake attempts failed');
        setError('Unable to complete sign-in. Please try again.');
      } catch (err) {
        console.error('[Auth Callback] Unexpected error during handshake:', err);
        setError(err instanceof Error ? err.message : 'Authentication failed');
      }
    };

    handleCallback();
  }, [navigate]);

  const handleTryAgain = async () => {
    setRetrying(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error('[Auth Callback] Retry sign-in failed:', err);
      setRetrying(false);
    }
  };

  if (error) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-md text-center px-4">
          <div className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            AIKIZI
          </div>
          <div className="backdrop-blur-lg bg-red-50/70 dark:bg-red-900/30 rounded-xl p-6 border border-red-200 dark:border-red-700">
            <p className="text-lg text-red-900 dark:text-red-100 mb-2 font-semibold">Authentication Error</p>
            <p className="text-red-700 dark:text-red-200 mb-4">{error}</p>
            <button
              onClick={handleTryAgain}
              disabled={retrying}
              className="px-6 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-semibold hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {retrying ? 'Retrying...' : 'Try Again'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
          AIKIZI
        </div>
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900 dark:border-white"></div>
        <p className="text-gray-600 dark:text-gray-400 mt-2">Completing sign-in...</p>
      </div>
    </div>
  );
}
