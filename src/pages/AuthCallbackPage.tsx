import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const { signInWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const handleCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const hasCode = urlParams.has('code');
      const hasState = urlParams.has('state');

      console.log('[Auth Callback] URL analysis:', {
        href: window.location.href,
        hasCode,
        hasState,
      });

      try {
        console.log('[Auth Callback] Waiting for Supabase auto-parse (detectSessionInUrl)...');

        const maxAttempts = 33;
        const pollInterval = 150;
        let attempts = 0;

        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          attempts++;

          const { data: { session } } = await supabase.auth.getSession();

          if (session) {
            console.log('[Auth Callback] Session detected, user.id:', session.user.id);

            const dest = sessionStorage.getItem('postLogin') || '/explore';
            sessionStorage.removeItem('postLogin');

            console.log('[Auth Callback] Cleaning URL and navigating to:', dest);

            window.history.replaceState({}, '', dest);

            try {
              navigate(dest, { replace: true });
            } catch (err) {
              console.warn('[Auth Callback] Router navigation failed, using hard redirect:', err);
              window.location.replace(dest);
            }
            return;
          }

          console.log(`[Auth Callback] Attempt ${attempts}/${maxAttempts}: No session yet...`);
        }

        console.error('[Auth Callback] Timeout: Session not detected after', maxAttempts * pollInterval, 'ms');
        setError('Unable to complete sign-in. Please try again.');
      } catch (err) {
        console.error('[Auth Callback] Unexpected error during callback:', err);
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
        <p className="text-gray-600 dark:text-gray-400 mt-2">Signing you in...</p>
      </div>
    </div>
  );
}
