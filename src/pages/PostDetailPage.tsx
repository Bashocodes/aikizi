import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { Lock, Unlock, Bookmark, Copy, CheckCircle } from 'lucide-react';

interface PostDetail {
  id: string;
  title: string;
  slug: string;
  created_at: string;
  image_base64?: string | null;
  media_assets: {
    variants: any;
  };
  post_meta: {
    prompt_short: string | null;
    prompt_full: string | null;
    mj_version: string | null;
    model_used: string | null;
  };
  post_styles: Array<{
    style_triplet: string;
    artist_oneword: string | null;
    style_tags: string[];
  }>;
  post_subjects: Array<{
    subject_slug: string;
  }>;
  post_tags: Array<{
    tag: string;
  }>;
  sref_codes: {
    locked: boolean;
    price_tokens: number;
    code_encrypted: string | null;
  } | null;
}

export function PostDetailPage() {
  const { id } = useParams();
  const { userRecord, tokenBalance, refreshTokenBalance } = useAuth();
  const [post, setPost] = useState<PostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [srefUnlocked, setSrefUnlocked] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [copiedSref, setCopiedSref] = useState(false);
  const [activeTab, setActiveTab] = useState<'story' | 'motion' | 'dialogue'>('story');

  const postId = id?.split('-')[0];

  useEffect(() => {
    if (postId) {
      fetchPost();
      checkBookmark();
      checkSrefUnlock();
    }
  }, [postId]);

  const fetchPost = async () => {
    try {
      const { data, error } = await supabase
        .from('posts')
        .select(`
          id,
          title,
          slug,
          created_at,
          image_base64,
          media_assets (variants),
          post_meta (prompt_short, prompt_full, mj_version, model_used),
          post_styles (style_triplet, artist_oneword, style_tags),
          post_subjects (subject_slug),
          post_tags (tag),
          sref_codes (locked, price_tokens, code_encrypted)
        `)
        .eq('id', postId)
        .eq('visibility', 'public')
        .maybeSingle();

      if (error) throw error;
      setPost(data);
    } catch (error) {
      console.error('Error fetching post:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkBookmark = async () => {
    if (!profile) return;

    const { data } = await supabase
      .from('bookmarks')
      .select('*')
      .eq('user_id', userRecord.id)
      .eq('post_id', postId)
      .maybeSingle();

    setIsBookmarked(!!data);
  };

  const checkSrefUnlock = async () => {
    if (!profile) return;

    const { data } = await supabase
      .from('sref_unlocks')
      .select('*')
      .eq('user_id', userRecord.id)
      .eq('post_id', postId)
      .maybeSingle();

    setSrefUnlocked(!!data);
  };

  const handleUnlockSref = async () => {
    if (!profile || !post?.sref_codes) {
      return;
    }

    if (tokenBalance < post.sref_codes.price_tokens) {
      alert('Insufficient tokens');
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Please sign in to unlock SREF codes');
        return;
      }

      const response = await api.post('/v1/sref/unlock', {
        post_id: postId,
      });

      if (!response.ok) {
        alert(response.error || 'Failed to unlock SREF code');
        return;
      }

      setSrefUnlocked(true);
      await refreshTokenBalance();

      setPost(prev => prev ? {
        ...prev,
        sref_codes: prev.sref_codes ? {
          ...prev.sref_codes,
          code_encrypted: response.code
        } : null
      } : null);
    } catch (error) {
      console.error('Error unlocking SREF:', error);
      alert('Failed to unlock SREF code. Please try again.');
    }
  };

  const toggleBookmark = async () => {
    if (!profile) return;

    if (isBookmarked) {
      await supabase
        .from('bookmarks')
        .delete()
        .eq('user_id', userRecord.id)
        .eq('post_id', postId);
      setIsBookmarked(false);
    } else {
      await supabase
        .from('bookmarks')
        .insert({ user_id: userRecord.id, post_id: postId });
      setIsBookmarked(true);
    }
  };

  const copySrefToClipboard = () => {
    if (post?.sref_codes?.code_encrypted) {
      navigator.clipboard.writeText(post.sref_codes.code_encrypted);
      setCopiedSref(true);
      setTimeout(() => setCopiedSref(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white"></div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <p className="text-xl text-gray-600 dark:text-gray-400">Post not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid lg:grid-cols-2 gap-8">
          <div className="aspect-square bg-gray-200 dark:bg-gray-800 rounded-2xl overflow-hidden">
            {post.image_base64 ? (
              <img
                src={`data:image/jpeg;base64,${post.image_base64}`}
                alt={post.title}
                className="w-full h-full object-cover"
              />
            ) : post.media_assets?.variants ? (
              <img
                src={(post.media_assets.variants as any).full || (post.media_assets.variants as any).grid}
                alt={post.title}
                className="w-full h-full object-cover"
              />
            ) : null}
          </div>

          <div className="space-y-6">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">{post.title}</h1>
              <button
                onClick={toggleBookmark}
                className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
              >
                <Bookmark className={`w-6 h-6 ${isBookmarked ? 'fill-current text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`} />
              </button>
            </div>

            {post.post_styles[0] && (
              <div className="backdrop-blur-lg bg-white/70 dark:bg-gray-900/70 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2">Style Codes</h3>
                <p className="text-xl font-bold text-gray-900 dark:text-white mb-2">{post.post_styles[0].style_triplet}</p>
                {post.post_styles[0].artist_oneword && (
                  <p className="text-gray-700 dark:text-gray-300">Artist: {post.post_styles[0].artist_oneword}</p>
                )}
                {post.post_styles[0].style_tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {post.post_styles[0].style_tags.map((tag, i) => (
                      <span key={i} className="px-3 py-1 bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-full text-sm">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="backdrop-blur-lg bg-white/70 dark:bg-gray-900/70 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="flex border-b border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setActiveTab('story')}
                  className={`flex-1 py-3 px-4 font-semibold ${activeTab === 'story' ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'text-gray-600 dark:text-gray-400'}`}
                >
                  Story
                </button>
                <button
                  onClick={() => setActiveTab('motion')}
                  className={`flex-1 py-3 px-4 font-semibold ${activeTab === 'motion' ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'text-gray-600 dark:text-gray-400'}`}
                >
                  Motion
                </button>
                <button
                  onClick={() => setActiveTab('dialogue')}
                  className={`flex-1 py-3 px-4 font-semibold ${activeTab === 'dialogue' ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'text-gray-600 dark:text-gray-400'}`}
                >
                  Dialogue
                </button>
              </div>
              <div className="p-6">
                {activeTab === 'story' && (
                  <p className="text-gray-900 dark:text-white leading-relaxed">
                    {post.post_meta.prompt_short || 'No description available'}
                  </p>
                )}
                {activeTab === 'motion' && (
                  <p className="text-gray-600 dark:text-gray-400 italic">
                    Motion analysis coming soon. Join the waitlist to be notified.
                  </p>
                )}
                {activeTab === 'dialogue' && (
                  <p className="text-gray-600 dark:text-gray-400 italic">
                    Dialogue extraction coming soon. Join the waitlist to be notified.
                  </p>
                )}
              </div>
            </div>

            {post.sref_codes && (
              <div className="backdrop-blur-lg bg-gradient-to-r from-gray-900/90 to-gray-800/90 dark:from-white/90 dark:to-gray-100/90 rounded-xl p-6 border border-gray-700 dark:border-gray-300">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white dark:text-gray-900">MidJourney SREF Code</h3>
                  {srefUnlocked ? (
                    <Unlock className="w-6 h-6 text-green-400 dark:text-green-600" />
                  ) : (
                    <Lock className="w-6 h-6 text-white dark:text-gray-900" />
                  )}
                </div>
                {srefUnlocked ? (
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-4 py-3 bg-black/30 dark:bg-white/30 rounded-lg text-white dark:text-gray-900 font-mono">
                      {post.sref_codes.code_encrypted}
                    </code>
                    <button
                      onClick={copySrefToClipboard}
                      className="p-3 bg-white/20 dark:bg-gray-900/20 rounded-lg hover:bg-white/30 dark:hover:bg-gray-900/30 transition-colors"
                    >
                      {copiedSref ? (
                        <CheckCircle className="w-5 h-5 text-green-400 dark:text-green-600" />
                      ) : (
                        <Copy className="w-5 h-5 text-white dark:text-gray-900" />
                      )}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleUnlockSref}
                    className="w-full py-3 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-lg font-semibold hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    Unlock for {post.sref_codes.price_tokens} token{post.sref_codes.price_tokens !== 1 && 's'}
                  </button>
                )}
              </div>
            )}

            {post.post_subjects.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase mb-3">Subjects</h3>
                <div className="flex flex-wrap gap-2">
                  {post.post_subjects.map((subject, i) => (
                    <span key={i} className="px-4 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg">
                      {subject.subject_slug}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {post.post_tags.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase mb-3">Tokens</h3>
                <div className="flex flex-wrap gap-2">
                  {post.post_tags.map((tag, i) => (
                    <span key={i} className="px-3 py-1 bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-sm">
                      #{tag.tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
