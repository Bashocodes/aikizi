import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { User, Grid2x2 as Grid } from 'lucide-react';

interface Profile {
  user_id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_public: boolean;
}

interface Post {
  id: string;
  title: string;
  slug: string;
  created_at: string;
  media_assets: {
    variants: any;
  };
}

export function PublisherProfilePage() {
  const { handle } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (handle) {
      fetchProfile();
    }
  }, [handle]);

  const fetchProfile = async () => {
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('handle', handle)
        .eq('is_public', true)
        .maybeSingle();

      if (profileError || !profileData) {
        setLoading(false);
        return;
      }

      setProfile(profileData);

      const { data: postsData, error: postsError } = await supabase
        .from('posts')
        .select(`
          id,
          title,
          slug,
          created_at,
          media_assets (variants)
        `)
        .eq('owner_id', profileData.user_id)
        .eq('visibility', 'public')
        .eq('status', 'published')
        .order('created_at', { ascending: false });

      if (!postsError && postsData) {
        setPosts(postsData);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white"></div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-4">Publisher not found</p>
          <button
            onClick={() => navigate('/explore')}
            className="px-6 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-semibold hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
          >
            Back to Explore
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="backdrop-blur-lg bg-white/70 dark:bg-gray-900/70 rounded-2xl p-8 border border-gray-200 dark:border-gray-700 mb-8">
          <div className="flex flex-col md:flex-row gap-6 items-start">
            <div className="w-24 h-24 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.display_name || profile.handle} className="w-full h-full rounded-full object-cover" />
              ) : (
                <User className="w-12 h-12 text-gray-600 dark:text-gray-400" />
              )}
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                {profile.display_name || profile.handle}
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mb-4">@{profile.handle}</p>
              {profile.bio && (
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-6">{profile.bio}</p>
              )}
              <div className="flex gap-6">
                <div>
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">{posts.length}</span>
                  <span className="text-gray-600 dark:text-gray-400 ml-2">Posts</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex items-center gap-2 text-gray-900 dark:text-white">
            <Grid className="w-5 h-5" />
            <h2 className="text-xl font-bold">Posts</h2>
          </div>
        </div>

        {posts.length === 0 ? (
          <div className="text-center py-20 backdrop-blur-lg bg-white/70 dark:bg-gray-900/70 rounded-2xl border border-gray-200 dark:border-gray-700">
            <p className="text-xl text-gray-600 dark:text-gray-400">No posts yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => (
              <div
                key={post.id}
                onClick={() => navigate(`/p/${post.id}-${post.slug}`)}
                className="group cursor-pointer"
              >
                <div className="aspect-square bg-gray-200 dark:bg-gray-800 rounded-lg overflow-hidden mb-3 relative">
                  {post.media_assets?.variants && (
                    <img
                      src={(post.media_assets.variants as any).grid || (post.media_assets.variants as any).thumb}
                      alt={post.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-1">{post.title}</h3>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
