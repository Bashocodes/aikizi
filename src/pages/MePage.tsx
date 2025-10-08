import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { User, Coins, LogOut, History, CreditCard, Save, Loader2, AlertCircle, ArrowUpCircle, ArrowDownCircle, Gift, Calendar, RefreshCw } from 'lucide-react';

interface ProfileData {
  user_id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_public: boolean;
}

interface Transaction {
  id: string;
  user_id: string;
  kind: string;
  amount: number;
  ref: any;
  created_at: string;
}

export function MePage() {
  const { user, userRecord, tokenBalance, planName, signOut, refreshTokenBalance, authReady } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [bio, setBio] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [nextResetAt, setNextResetAt] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (authReady && userRecord) {
      loadProfile();
      loadAllTokenData();
    }
  }, [authReady, userRecord]);

  useEffect(() => {
    if (profile) {
      const hasChanges =
        bio !== (profile.bio || '') ||
        displayName !== (profile.display_name || '') ||
        avatarUrl !== (profile.avatar_url || '');
      setIsDirty(hasChanges);
    }
  }, [bio, displayName, avatarUrl, profile]);

  const loadProfile = async () => {
    if (!userRecord) return;

    setIsLoading(true);
    setLoadError(null);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userRecord.id)
        .maybeSingle();

      if (error) {
        console.error('Error loading profile:', error);
        setLoadError('Failed to load profile. Please try again.');
        setIsLoading(false);
        return;
      }

      if (data) {
        setProfile(data);
        setBio(data.bio || '');
        setDisplayName(data.display_name || '');
        setAvatarUrl(data.avatar_url || '');
      } else {
        await createDefaultProfile();
      }
    } catch (err) {
      console.error('Unexpected error loading profile:', err);
      setLoadError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const createDefaultProfile = async () => {
    if (!userRecord || !user) return;

    const defaultHandle = user.email?.split('@')[0] || `user${userRecord.id.slice(0, 8)}`;
    const defaultDisplayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';

    console.log('[MePage] Creating default profile for user:', userRecord.id);

    const { data, error } = await supabase
      .from('profiles')
      .insert({
        user_id: userRecord.id,
        handle: defaultHandle,
        display_name: defaultDisplayName,
        is_public: false,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating default profile:', error);
      setLoadError('Failed to create profile. Please try again.');
    } else if (data) {
      console.log('[MePage] Default profile created:', data);
      setProfile(data);
      setBio(data.bio || '');
      setDisplayName(data.display_name || '');
      setAvatarUrl(data.avatar_url || '');
    }
  };

  const handleSave = async () => {
    if (!userRecord || !profile) return;

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          bio: bio || null,
          display_name: displayName || null,
          avatar_url: avatarUrl || null,
        })
        .eq('user_id', userRecord.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating profile:', error);
        alert('Failed to save profile. Please try again.');
      } else if (data) {
        setProfile(data);
        setSaveSuccess(true);
        setIsDirty(false);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Unexpected error saving profile:', err);
      alert('An unexpected error occurred. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const loadAllTokenData = async () => {
    setLoadingTransactions(true);
    try {
      const [balanceResult, resetResult, transactionsResult] = await Promise.all([
        supabase.rpc('get_balance'),
        supabase.rpc('get_next_reset_at'),
        supabase.rpc('get_transactions', { limit_count: 50 })
      ]);

      if (balanceResult.error) {
        console.warn('[MePage] get_balance RPC error:', balanceResult.error);
      } else {
        await refreshTokenBalance();
      }

      if (resetResult.error) {
        console.warn('[MePage] get_next_reset_at RPC error:', resetResult.error);
      } else {
        setNextResetAt(resetResult.data);
      }

      if (transactionsResult.error) {
        console.warn('[MePage] get_transactions RPC error:', { limit_count: 50, error: transactionsResult.error });
      } else {
        setTransactions(transactionsResult.data || []);
      }
    } catch (err) {
      console.warn('[MePage] Unexpected error loading token data:', err);
    } finally {
      setLoadingTransactions(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadAllTokenData();
    setIsRefreshing(false);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const getTransactionIcon = (kind: string) => {
    switch (kind) {
      case 'welcome_grant':
      case 'monthly_grant':
        return <Gift className="w-5 h-5" />;
      case 'spend':
        return <ArrowDownCircle className="w-5 h-5" />;
      default:
        return <Coins className="w-5 h-5" />;
    }
  };

  const getTransactionLabel = (kind: string, ref: any) => {
    switch (kind) {
      case 'welcome_grant':
        return 'Welcome Bonus';
      case 'monthly_grant':
        return `Monthly Grant (${ref?.period || 'N/A'})`;
      case 'spend':
        return ref?.reason === 'decode' ? 'Image Decode' : 'Token Spend';
      default:
        return kind.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
    }
  };

  if (!authReady || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gray-900 dark:text-white animate-spin" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="backdrop-blur-lg bg-red-50/90 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-xl p-6 flex items-start gap-4">
            <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-red-900 dark:text-red-100 mb-2">Error Loading Profile</h3>
              <p className="text-sm text-red-800 dark:text-red-200 mb-4">{loadError}</p>
              <button
                onClick={() => loadProfile()}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 text-white rounded-lg font-semibold transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">My Profile</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage your account settings and preferences
          </p>
        </div>

        <div className="space-y-6">
          <div className="backdrop-blur-lg bg-white/70 dark:bg-gray-900/70 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-start gap-6">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 flex items-center justify-center flex-shrink-0">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <User className="w-12 h-12 text-white dark:text-gray-900" />
                )}
              </div>

              <div className="flex-1 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your display name"
                    className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={user?.email || ''}
                    disabled
                    className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Avatar URL
                  </label>
                  <input
                    type="url"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://example.com/avatar.jpg"
                    className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Bio
                  </label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Tell us about yourself..."
                    rows={4}
                    maxLength={500}
                    className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white resize-none"
                  />
                  <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                    {bio.length} / 500 characters
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSave}
                    disabled={isSaving || !isDirty}
                    className="flex items-center gap-2 px-6 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-semibold hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Save Changes
                      </>
                    )}
                  </button>
                  {saveSuccess && (
                    <span className="text-sm font-medium text-green-600 dark:text-green-400">
                      Saved successfully!
                    </span>
                  )}
                  {isDirty && !saveSuccess && (
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      You have unsaved changes
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="backdrop-blur-lg bg-white/70 dark:bg-gray-900/70 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Plan & Balance</h2>
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-semibold hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center gap-3 mb-2">
                  <Coins className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">Token Balance</span>
                </div>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">{tokenBalance}</p>
              </div>

              <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center gap-3 mb-2">
                  <CreditCard className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">Current Plan</span>
                </div>
                <p className="text-3xl font-bold text-gray-900 dark:text-white capitalize">{planName}</p>
              </div>

              <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center gap-3 mb-2">
                  <Calendar className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">Next Reset</span>
                </div>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {nextResetAt ? new Date(nextResetAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                </p>
              </div>
            </div>
          </div>

          <div className="backdrop-blur-lg bg-white/70 dark:bg-gray-900/70 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Token History</h2>

            {loadingTransactions ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-gray-900 dark:text-white animate-spin" />
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-8">
                <Coins className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 dark:text-gray-400 mb-2">No transactions yet</p>
                <p className="text-sm text-gray-500 dark:text-gray-500">Your token activity will appear here</p>
              </div>
            ) : (
              <div className="space-y-2">
                {transactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between p-4 bg-gray-100 dark:bg-gray-800 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${
                        transaction.amount > 0
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                      }`}>
                        {getTransactionIcon(transaction.kind)}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {getTransactionLabel(transaction.kind, transaction.ref)}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {formatDate(transaction.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className={`text-lg font-bold ${
                      transaction.amount > 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}>
                      {transaction.amount > 0 ? '+' : ''}{transaction.amount}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="backdrop-blur-lg bg-white/70 dark:bg-gray-900/70 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Quick Actions</h2>

            <div className="space-y-3">
              <Link
                to="/history"
                className="flex items-center gap-3 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors group"
              >
                <History className="w-5 h-5 text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white transition-colors" />
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">View Decode History</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">See all your past image decodes</p>
                </div>
              </Link>

              <Link
                to="/pricing"
                className="flex items-center gap-3 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors group"
              >
                <CreditCard className="w-5 h-5 text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white transition-colors" />
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">Manage Billing</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Upgrade your plan or purchase tokens</p>
                </div>
              </Link>

              <button
                onClick={handleSignOut}
                className="flex items-center gap-3 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors group w-full text-left"
              >
                <LogOut className="w-5 h-5 text-gray-600 dark:text-gray-400 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors" />
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">Sign Out</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Log out of your account</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
