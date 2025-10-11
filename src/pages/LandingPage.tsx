import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { DotGridBackground } from '../components/DotGridBackground';
import { Sparkles, Image, Lock } from 'lucide-react';

export function LandingPage() {
  const { user, authReady, signInWithGoogle } = useAuth();
  const navigate = useNavigate();

  const handleExplore = () => {
    if (user) {
      navigate('/explore');
    } else {
      signInWithGoogle();
    }
  };

  const handleDecode = () => {
    if (user) {
      navigate('/decode');
    } else {
      signInWithGoogle();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800 relative overflow-hidden">
      <DotGridBackground density="default" mask="radial" parallax={true} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 relative">
        <div className="text-center mb-20">
          <h1 className="text-6xl md:text-7xl font-bold text-gray-900 dark:text-white mb-6 tracking-tight">
            Decode Style.<br />Build Your Visual Library.
          </h1>
          <p className="text-xl md:text-2xl text-gray-700 dark:text-gray-300 mb-10 max-w-3xl mx-auto leading-relaxed">
            AIKIZI turns images into style codes—searchable subjects, tokens and MidJourney-ready insights.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={handleExplore}
              disabled={!authReady}
              className="px-8 py-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-semibold text-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-all transform hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {authReady ? 'Explore' : 'Loading...'}
            </button>
            <button
              onClick={handleDecode}
              disabled={!authReady}
              className="px-8 py-4 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-2 border-gray-300 dark:border-gray-700 rounded-lg font-semibold text-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {authReady ? 'Decode an Image' : 'Loading...'}
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-20 relative">
          <DotGridBackground density="roomy" mask="none" parallax={false} zIndex={0} />
          <div className="backdrop-blur-lg bg-white/70 dark:bg-gray-900/70 rounded-2xl p-8 border border-gray-200 dark:border-gray-700 shadow-xl">
            <div className="w-12 h-12 bg-gray-900 dark:bg-white rounded-lg flex items-center justify-center mb-4">
              <Sparkles className="w-6 h-6 text-white dark:text-gray-900" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">AI-Powered Analysis</h3>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              Extract style triplets, subjects, and tokens from any image using state-of-the-art AI models.
            </p>
          </div>

          <div className="backdrop-blur-lg bg-white/70 dark:bg-gray-900/70 rounded-2xl p-8 border border-gray-200 dark:border-gray-700 shadow-xl">
            <div className="w-12 h-12 bg-gray-900 dark:bg-white rounded-lg flex items-center justify-center mb-4">
              <Image className="w-6 h-6 text-white dark:text-gray-900" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">Searchable Library</h3>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              Filter by subjects, styles, and tokens. Find exactly what inspires you in seconds.
            </p>
          </div>

          <div className="backdrop-blur-lg bg-white/70 dark:bg-gray-900/70 rounded-2xl p-8 border border-gray-200 dark:border-gray-700 shadow-xl">
            <div className="w-12 h-12 bg-gray-900 dark:bg-white rounded-lg flex items-center justify-center mb-4">
              <Lock className="w-6 h-6 text-white dark:text-gray-900" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">MidJourney SREF Codes</h3>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              Unlock style reference codes to recreate stunning visuals in your own MidJourney prompts.
            </p>
          </div>
        </div>

        <div className="backdrop-blur-lg bg-gradient-to-r from-gray-900/90 to-gray-800/90 dark:from-white/90 dark:to-gray-100/90 rounded-2xl p-12 border border-gray-700 dark:border-gray-300 shadow-2xl text-center">
          <h2 className="text-3xl font-bold text-white dark:text-gray-900 mb-4">Go Pro for More Tokens</h2>
          <p className="text-gray-300 dark:text-gray-700 mb-8 text-lg max-w-2xl mx-auto">
            Unlock SREFs and high-volume decoding with 10,000 tokens. Free users start with 1,000 tokens.
          </p>
          <button
            onClick={() => navigate('/pricing')}
            className="px-8 py-4 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-lg font-semibold text-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all transform hover:scale-105 shadow-lg"
          >
            See Pricing
          </button>
        </div>
      </div>
    </div>
  );
}
