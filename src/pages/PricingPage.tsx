import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Check } from 'lucide-react';

export function PricingPage() {
  const { user, signInWithGoogle } = useAuth();
  const navigate = useNavigate();

  const handleGetStarted = () => {
    if (user) {
      navigate('/decode');
    } else {
      signInWithGoogle();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 dark:text-white mb-4">Simple Pricing</h1>
          <p className="text-xl text-gray-700 dark:text-gray-300">Choose the plan that fits your creative workflow</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          <div className="backdrop-blur-lg bg-white/70 dark:bg-gray-900/70 rounded-2xl p-8 border border-gray-200 dark:border-gray-700 shadow-xl">
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Free</h3>
            <div className="mb-6">
              <span className="text-5xl font-bold text-gray-900 dark:text-white">1,000</span>
              <span className="text-gray-600 dark:text-gray-400 ml-2">tokens</span>
            </div>
            <ul className="space-y-4 mb-8">
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-gray-900 dark:text-white mt-0.5 flex-shrink-0" />
                <span className="text-gray-700 dark:text-gray-300">Decode images (1 token each)</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-gray-900 dark:text-white mt-0.5 flex-shrink-0" />
                <span className="text-gray-700 dark:text-gray-300">Browse posts after sign-in</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-gray-900 dark:text-white mt-0.5 flex-shrink-0" />
                <span className="text-gray-700 dark:text-gray-300">Unlock SREFs with tokens</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-gray-900 dark:text-white mt-0.5 flex-shrink-0" />
                <span className="text-gray-700 dark:text-gray-300">Save private decode history</span>
              </li>
            </ul>
            <button
              onClick={handleGetStarted}
              className="w-full py-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-2 border-gray-300 dark:border-gray-700 rounded-lg font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
            >
              Get Started Free
            </button>
          </div>

          <div className="backdrop-blur-lg bg-gradient-to-br from-gray-900 to-gray-800 dark:from-white dark:to-gray-100 rounded-2xl p-8 border border-gray-700 dark:border-gray-300 shadow-2xl relative">
            <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 px-4 py-1 bg-gray-700 dark:bg-gray-300 text-white dark:text-gray-900 text-sm font-bold rounded-full">
              POPULAR
            </div>
            <h3 className="text-2xl font-bold text-white dark:text-gray-900 mb-2">Pro</h3>
            <div className="mb-6">
              <span className="text-5xl font-bold text-white dark:text-gray-900">10,000</span>
              <span className="text-gray-300 dark:text-gray-700 ml-2">tokens</span>
            </div>
            <ul className="space-y-4 mb-8">
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-white dark:text-gray-900 mt-0.5 flex-shrink-0" />
                <span className="text-gray-200 dark:text-gray-800">Everything in Free</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-white dark:text-gray-900 mt-0.5 flex-shrink-0" />
                <span className="text-gray-200 dark:text-gray-800">10x token bank for heavy usage</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-white dark:text-gray-900 mt-0.5 flex-shrink-0" />
                <span className="text-gray-200 dark:text-gray-800">Priority decoding queue</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-white dark:text-gray-900 mt-0.5 flex-shrink-0" />
                <span className="text-gray-200 dark:text-gray-800">Early access to new features</span>
              </li>
            </ul>
            <button
              onClick={handleGetStarted}
              className="w-full py-3 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-lg font-semibold hover:bg-gray-100 dark:hover:bg-gray-800 transition-all shadow-lg"
            >
              Get Started Free
            </button>
            <p className="text-center text-sm text-gray-400 dark:text-gray-600 mt-4">
              Payment options coming soon
            </p>
          </div>
        </div>

        <div className="mt-16 text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Token Costs</h2>
          <div className="flex flex-wrap justify-center gap-6">
            <div className="px-6 py-3 backdrop-blur-lg bg-white/70 dark:bg-gray-900/70 border border-gray-200 dark:border-gray-700 rounded-lg">
              <span className="text-gray-700 dark:text-gray-300">Decode Image: </span>
              <span className="font-bold text-gray-900 dark:text-white">1 token</span>
            </div>
            <div className="px-6 py-3 backdrop-blur-lg bg-white/70 dark:bg-gray-900/70 border border-gray-200 dark:border-gray-700 rounded-lg">
              <span className="text-gray-700 dark:text-gray-300">Unlock SREF: </span>
              <span className="font-bold text-gray-900 dark:text-white">1 token</span>
            </div>
            <div className="px-6 py-3 backdrop-blur-lg bg-white/70 dark:bg-gray-900/70 border border-gray-200 dark:border-gray-700 rounded-lg">
              <span className="text-gray-700 dark:text-gray-300">Download Image: </span>
              <span className="font-bold text-gray-900 dark:text-white">Free</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
