import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { Search, Filter } from 'lucide-react';

interface Post {
  id: string;
  title: string;
  slug: string;
  created_at: string;
  media_assets: {
    variants: any;
  };
  post_styles: Array<{
    style_triplet: string;
    artist_oneword: string | null;
  }>;
}

interface PublicPost {
  id: string;
  cf_image_id: string;
  analysis: string;
  created_at: string;
  profiles: {
    handle: string;
    display_name: string | null;
  };
}

interface CombinedPost {
  id: string;
  type: 'legacy' | 'public';
  created_at: string;
  imageUrl?: string;
  title?: string;
  slug?: string;
  styleTriplet?: string;
  cf_image_id?: string;
  analysis?: string;
  authorHandle?: string;
  authorName?: string;
}

export function ExplorePage() {
  const [posts, setPosts] = useState<CombinedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const searchQuery = searchParams.get('q') || '';

  useEffect(() => {
    fetchPosts();
  }, [searchQuery]);

  const fetchPosts = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('Fetching posts from Supabase...');

      const [legacyPostsResult, publicPostsResult] = await Promise.allSettled([
        supabase
          .from('posts')
          .select(`
            id,
            title,
            slug,
            created_at,
            media_assets!posts_image_id_fkey (variants),
            post_styles!post_styles_post_id_fkey (style_triplet, artist_oneword)
          `)
          .eq('visibility', 'public')
          .eq('status', 'published')
          .order('created_at', { ascending: false })
          .limit(50),
        api.get('/posts/public')
      ]);

      const combinedPosts: CombinedPost[] = [];

      if (legacyPostsResult.status === 'fulfilled' && legacyPostsResult.value.data) {
        const legacyPosts = legacyPostsResult.value.data as Post[];
        legacyPosts.forEach(post => {
          combinedPosts.push({
            id: post.id,
            type: 'legacy',
            created_at: post.created_at,
            title: post.title,
            slug: post.slug,
            imageUrl: (post.media_assets?.variants as any)?.grid || (post.media_assets?.variants as any)?.thumb,
            styleTriplet: post.post_styles?.[0]?.style_triplet
          });
        });
      }

      if (publicPostsResult.status === 'fulfilled' && publicPostsResult.value.posts) {
        const publicPosts = publicPostsResult.value.posts as PublicPost[];
        publicPosts.forEach(post => {
          combinedPosts.push({
            id: post.id,
            type: 'public',
            created_at: post.created_at,
            cf_image_id: post.cf_image_id,
            analysis: post.analysis,
            authorHandle: post.profiles?.handle,
            authorName: post.profiles?.display_name || post.profiles?.handle
          });
        });
      }

      combinedPosts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      console.log('Combined posts:', { count: combinedPosts.length });
      setPosts(combinedPosts);
    } catch (error) {
      console.error('Error fetching posts:', error);
      setError(error instanceof Error ? error.message : 'Failed to load posts');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      setSearchParams({ q: searchTerm });
    } else {
      setSearchParams({});
    }
  };

  const handlePostClick = (post: CombinedPost) => {
    if (post.type === 'legacy' && post.slug) {
      navigate(`/p/${post.id}-${post.slug}`);
    } else {
      navigate(`/gallery/${post.id}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <form onSubmit={handleSearch} className="flex-1">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search subjects, styles, tokens..."
                className="w-full pl-12 pr-4 py-3 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white"
              />
            </div>
          </form>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="px-6 py-3 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-2"
          >
            <Filter className="w-5 h-5" />
            Filters
          </button>
        </div>

        {error && (
          <div className="text-center py-20">
            <div className="backdrop-blur-lg bg-red-50/70 dark:bg-red-900/30 rounded-xl p-8 border border-red-200 dark:border-red-700 inline-block">
              <p className="text-xl text-red-900 dark:text-red-100 mb-2 font-semibold">Failed to load posts</p>
              <p className="text-red-700 dark:text-red-200 mb-4">{error}</p>
              <button
                onClick={fetchPosts}
                className="px-6 py-2 bg-red-600 dark:bg-red-500 text-white rounded-lg hover:bg-red-700 dark:hover:bg-red-600 transition-colors font-semibold"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {!error && loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="aspect-square bg-gray-200 dark:bg-gray-800 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : !error && posts.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-2xl text-gray-600 dark:text-gray-400 mb-4">No posts yet</p>
            <p className="text-gray-500 dark:text-gray-500">
              Check back soon as publishers start adding content.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => (
              <div
                key={post.id}
                onClick={() => handlePostClick(post)}
                className="group cursor-pointer"
              >
                <div className="aspect-square bg-gray-200 dark:bg-gray-800 rounded-lg overflow-hidden mb-3 relative">
                  {post.type === 'legacy' && post.imageUrl && (
                    <img
                      src={post.imageUrl}
                      alt={post.title || 'Post'}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  )}
                  {post.type === 'public' && post.cf_image_id && (
                    <img
                      src={`https://imagedelivery.net/${import.meta.env.VITE_CF_IMAGES_ACCOUNT_HASH}/${post.cf_image_id}/public`}
                      alt="Decoded image"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1 line-clamp-1">
                  {post.type === 'legacy' ? post.title : `Decoded by @${post.authorHandle}`}
                </h3>
                {post.type === 'legacy' && post.styleTriplet && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1">
                    {post.styleTriplet}
                  </p>
                )}
                {post.type === 'public' && post.analysis && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                    {JSON.parse(post.analysis).story?.slice(0, 100)}...
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
