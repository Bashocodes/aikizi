import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useBackgroundEffects } from './DotGridBackground';
import { Moon, Sun, Menu, X, Coins, Sparkles } from 'lucide-react';
import { useState } from 'react';

export function Navigation() {
  const { user, tokenBalance, authReady, signInWithGoogle, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { enabled: bgEffectsEnabled, toggle: toggleBgEffects } = useBackgroundEffects();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  const handleSignIn = async () => {
    await signInWithGoogle();
    setMobileMenuOpen(false);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
    setMobileMenuOpen(false);
  };

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-lg bg-white/80 dark:bg-gray-900/80 border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link to="/" className="text-2xl font-bold text-gray-900 dark:text-white">
              AIKIZI
            </Link>

            {user && (
              <div className="hidden md:flex items-center gap-6">
                <Link
                  to="/explore"
                  className={`font-medium transition-colors ${
                    isActive('/explore')
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  Explore
                </Link>
                <Link
                  to="/decode"
                  className={`font-medium transition-colors ${
                    isActive('/decode')
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  Decode
                </Link>
              </div>
            )}
          </div>

          <div className="hidden md:flex items-center gap-4">
            <Link
              to="/pricing"
              className={`font-medium transition-colors ${
                isActive('/pricing')
                  ? 'text-gray-900 dark:text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Pricing
            </Link>
            <Link
              to="/guide"
              className={`font-medium transition-colors ${
                isActive('/guide')
                  ? 'text-gray-900 dark:text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Guide
            </Link>

            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? (
                <Sun className="w-5 h-5 text-gray-300" />
              ) : (
                <Moon className="w-5 h-5 text-gray-700" />
              )}
            </button>

            <button
              onClick={toggleBgEffects}
              className={`p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors ${
                !bgEffectsEnabled ? 'opacity-50' : ''
              }`}
              aria-label="Toggle background effects"
              title={bgEffectsEnabled ? 'Disable background effects' : 'Enable background effects'}
            >
              <Sparkles className={`w-5 h-5 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`} />
            </button>

            {authReady && user ? (
              <>
                <Link
                  to="/me"
                  className={`font-medium transition-colors ${
                    isActive('/me')
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  Me
                </Link>
                <Link
                  to="/me"
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    tokenBalance < 5
                      ? 'bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50'
                      : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                  title={tokenBalance < 5 ? 'Low Token Balance - Click to Purchase' : 'Token Balance'}
                >
                  <Coins className={`w-4 h-4 ${
                    tokenBalance < 5
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-gray-600 dark:text-gray-400'
                  }`} />
                  <span className={`font-semibold ${
                    tokenBalance < 5
                      ? 'text-red-900 dark:text-red-100'
                      : 'text-gray-900 dark:text-white'
                  }`}>{tokenBalance}</span>
                </Link>
              </>
            ) : authReady ? (
              <button
                onClick={handleSignIn}
                className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-semibold hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
              >
                Sign In
              </button>
            ) : (
              <div className="w-20 h-10 bg-gray-200 dark:bg-gray-800 rounded-lg animate-pulse"></div>
            )}
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
          >
            {mobileMenuOpen ? (
              <X className="w-6 h-6 text-gray-900 dark:text-white" />
            ) : (
              <Menu className="w-6 h-6 text-gray-900 dark:text-white" />
            )}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-gray-200 dark:border-gray-800">
            <div className="flex flex-col gap-4">
              {authReady && user && (
                <>
                  <Link
                    to="/explore"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`font-medium ${
                      isActive('/explore')
                        ? 'text-gray-900 dark:text-white'
                        : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    Explore
                  </Link>
                  <Link
                    to="/decode"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`font-medium ${
                      isActive('/decode')
                        ? 'text-gray-900 dark:text-white'
                        : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    Decode
                  </Link>
                  <Link
                    to="/me"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`font-medium ${
                      isActive('/me')
                        ? 'text-gray-900 dark:text-white'
                        : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    Me
                  </Link>
                  <Link
                    to="/me"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit"
                  >
                    <Coins className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    <span className="font-semibold text-gray-900 dark:text-white">{tokenBalance}</span>
                  </Link>
                </>
              )}
              <Link
                to="/pricing"
                onClick={() => setMobileMenuOpen(false)}
                className={`font-medium ${
                  isActive('/pricing')
                    ? 'text-gray-900 dark:text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Pricing
              </Link>
              <Link
                to="/guide"
                onClick={() => setMobileMenuOpen(false)}
                className={`font-medium ${
                  isActive('/guide')
                    ? 'text-gray-900 dark:text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Guide
              </Link>
              <button
                onClick={toggleTheme}
                className="flex items-center gap-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white font-medium"
              >
                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </button>
              <button
                onClick={toggleBgEffects}
                className={`flex items-center gap-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white font-medium ${
                  !bgEffectsEnabled ? 'opacity-50' : ''
                }`}
              >
                <Sparkles className="w-5 h-5" />
                {bgEffectsEnabled ? 'Disable Effects' : 'Enable Effects'}
              </button>
              {authReady && user ? (
                null
              ) : authReady ? (
                <button
                  onClick={handleSignIn}
                  className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-semibold hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors w-fit"
                >
                  Sign In
                </button>
              ) : (
                <div className="w-24 h-10 bg-gray-200 dark:bg-gray-800 rounded-lg animate-pulse"></div>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
