import { Mail, TrendingUp, Users, Zap } from 'lucide-react';

export function InvestorsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">Investors</h1>
          <p className="text-xl text-gray-700 dark:text-gray-300 max-w-3xl mx-auto">
            Building the future of visual style discovery with AI-powered decoding and searchable creative libraries.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <div className="backdrop-blur-lg bg-white/70 dark:bg-gray-900/70 rounded-2xl p-8 border border-gray-200 dark:border-gray-700 text-center">
            <div className="w-12 h-12 bg-gray-900 dark:bg-white rounded-lg flex items-center justify-center mx-auto mb-4">
              <TrendingUp className="w-6 h-6 text-white dark:text-gray-900" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Market Opportunity</h3>
            <p className="text-gray-700 dark:text-gray-300">
              AI-powered creative tools market growing rapidly with millions of creators seeking better workflows.
            </p>
          </div>

          <div className="backdrop-blur-lg bg-white/70 dark:bg-gray-900/70 rounded-2xl p-8 border border-gray-200 dark:border-gray-700 text-center">
            <div className="w-12 h-12 bg-gray-900 dark:bg-white rounded-lg flex items-center justify-center mx-auto mb-4">
              <Users className="w-6 h-6 text-white dark:text-gray-900" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Target Audience</h3>
            <p className="text-gray-700 dark:text-gray-300">
              MidJourney users, designers, and creative professionals building visual reference libraries.
            </p>
          </div>

          <div className="backdrop-blur-lg bg-white/70 dark:bg-gray-900/70 rounded-2xl p-8 border border-gray-200 dark:border-gray-700 text-center">
            <div className="w-12 h-12 bg-gray-900 dark:bg-white rounded-lg flex items-center justify-center mx-auto mb-4">
              <Zap className="w-6 h-6 text-white dark:text-gray-900" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Revenue Model</h3>
            <p className="text-gray-700 dark:text-gray-300">
              Token-based economy with free and pro tiers, scalable pricing for high-volume users.
            </p>
          </div>
        </div>

        <div className="backdrop-blur-lg bg-gradient-to-r from-gray-900/90 to-gray-800/90 dark:from-white/90 dark:to-gray-100/90 rounded-2xl p-12 border border-gray-700 dark:border-gray-300 text-center">
          <h2 className="text-3xl font-bold text-white dark:text-gray-900 mb-4">Interested in Learning More?</h2>
          <p className="text-gray-300 dark:text-gray-700 mb-8 text-lg max-w-2xl mx-auto">
            Contact us to receive our pitch deck, financial projections, and team information.
          </p>
          <a
            href="mailto:investors@aikizi.com"
            className="inline-flex items-center gap-2 px-8 py-4 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-lg font-semibold text-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all shadow-lg"
          >
            <Mail className="w-5 h-5" />
            investors@aikizi.com
          </a>
        </div>
      </div>
    </div>
  );
}
