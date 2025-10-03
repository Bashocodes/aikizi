import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Upload, Sparkles, CheckCircle, ExternalLink, AlertCircle } from 'lucide-react';

interface DecodeResult {
  style_triplet: string;
  artist_oneword: string | null;
  subjects: string[];
  tokens: string[];
  prompt_short: string;
  sref_hint: string | null;
}

export function DecodePage() {
  const { userRecord, tokenBalance, refreshTokenBalance } = useAuth();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash');
  const [isDecoding, setIsDecoding] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [result, setResult] = useState<DecodeResult | null>(null);
  const [publishedPostId, setPublishedPostId] = useState<string | null>(null);
  const [insufficientTokens, setInsufficientTokens] = useState(false);
  const navigate = useNavigate();

  const isPublisher = userRecord?.role === 'publisher' || userRecord?.role === 'admin';

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 25 * 1024 * 1024) {
        alert('File size must be under 25MB');
        return;
      }
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setResult(null);
    }
  };

  const handleDecode = async () => {
    if (!selectedFile) {
      alert('Please select an image');
      return;
    }

    if (tokenBalance < 1) {
      setInsufficientTokens(true);
      return;
    }

    setIsDecoding(true);
    setInsufficientTokens(false);

    console.log('[DecodePage] Starting decode flow', { tokenBalance });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        alert('Please sign in to decode images');
        return;
      }

      console.log('[DecodePage] Decoding with token spend');

      const reader = new FileReader();
      reader.readAsDataURL(selectedFile);
      const imageDataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
      });

      const idemKey = `decode-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const response = await fetch('/v1/decode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'idem-key': idemKey,
        },
        body: JSON.stringify({
          image_url: imageDataUrl,
          model: selectedModel,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('[DecodePage] Decode failed', { error: data.error });
        if (data.error?.includes('insufficient')) {
          setInsufficientTokens(true);
        } else {
          alert(data.error || 'Failed to decode image. Please try again.');
        }
        await refreshTokenBalance();
        return;
      }

      setResult(data.normalized);

      console.log('[DecodePage] Decode successful, refreshing token balance');
      await refreshTokenBalance();
    } catch (error) {
      console.error('[DecodePage] Error in decode flow:', error);
      alert('Failed to decode image. Please try again.');
      await refreshTokenBalance();
    } finally {
      setIsDecoding(false);
    }
  };

  const handlePublish = async () => {
    if (!result || !selectedFile || !previewUrl) {
      alert('No decode result to publish');
      return;
    }

    setIsPublishing(true);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(selectedFile);

      const imageBase64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Please sign in to publish posts');
        return;
      }

      const slug = result.style_triplet
        .toLowerCase()
        .replace(/[•]/g, '')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, 50) + '-' + Date.now();

      const response = await fetch('/.netlify/functions/publish-post', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          title: result.style_triplet,
          slug,
          image_base64: imageBase64,
          style_triplet: result.style_triplet,
          artist_oneword: result.artist_oneword,
          style_tags: [],
          subjects: result.subjects,
          tags: result.tokens,
          prompt_short: result.prompt_short,
          sref_code: result.sref_hint,
          sref_price: 1,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data.details ? `${data.error}: ${data.details}` : data.error;
        alert(errorMsg || 'Failed to publish post');
        return;
      }

      setPublishedPostId(data.post_id);
      alert('Post published successfully! View it on the Explore page.');
    } catch (error) {
      console.error('Error publishing post:', error);
      alert('Failed to publish post. Please try again.');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">Decode an Image</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Upload an image to extract style codes, subjects, and tokens. Cost: 1 token per decode.
          </p>
          <div className="mt-4 flex items-center gap-4">
            <div className="px-4 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg">
              <span className="text-sm text-gray-600 dark:text-gray-400">Your Balance:</span>
              <span className="ml-2 font-bold text-gray-900 dark:text-white">{tokenBalance} tokens</span>
            </div>
          </div>

          {insufficientTokens && (
            <div className="mt-4 backdrop-blur-lg bg-red-50/90 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-red-900 dark:text-red-100 mb-1">Insufficient Tokens</h3>
                <p className="text-sm text-red-800 dark:text-red-200 mb-3">
                  You need at least 1 token to decode an image. Please purchase more tokens to continue.
                </p>
                <Link
                  to="/pricing"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 text-white rounded-lg font-semibold transition-colors"
                >
                  View Pricing Plans
                </Link>
              </div>
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="backdrop-blur-lg bg-white/70 dark:bg-gray-900/70 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
              <label className="block">
                <div className="mb-4">
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Upload Image</span>
                </div>
                {previewUrl ? (
                  <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-800">
                    <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                    <button
                      onClick={() => {
                        setSelectedFile(null);
                        setPreviewUrl(null);
                        setResult(null);
                      }}
                      className="absolute top-4 right-4 px-4 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-lg font-semibold hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-12 text-center cursor-pointer hover:border-gray-400 dark:hover:border-gray-600 transition-colors">
                    <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 dark:text-gray-400 mb-2">Click to upload or drag and drop</p>
                    <p className="text-sm text-gray-500 dark:text-gray-500">JPEG, PNG, WEBP up to 25MB</p>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </div>
                )}
                {!previewUrl && (
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                )}
              </label>
            </div>

            <div className="backdrop-blur-lg bg-white/70 dark:bg-gray-900/70 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
              <label className="block">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 block">AI Model</span>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white"
                >
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash (Recommended)</option>
                  <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                  <option value="gpt-5-mini">GPT-5 Mini</option>
                  <option value="gpt-5">GPT-5</option>
                </select>
              </label>
            </div>

            <button
              onClick={handleDecode}
              disabled={!selectedFile || tokenBalance < 1 || isDecoding}
              className="w-full py-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-bold text-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isDecoding ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white dark:border-gray-900"></div>
                  Decoding...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Decode (1 token)
                </>
              )}
            </button>
          </div>

          {result && (
            <div className="space-y-6">
              <div className="backdrop-blur-lg bg-white/70 dark:bg-gray-900/70 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase mb-3">Style Triplet</h3>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mb-4">{result.style_triplet}</p>
                {result.artist_oneword && (
                  <p className="text-gray-700 dark:text-gray-300">Artist: {result.artist_oneword}</p>
                )}
              </div>

              <div className="backdrop-blur-lg bg-white/70 dark:bg-gray-900/70 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase mb-3">Subjects</h3>
                <div className="flex flex-wrap gap-2">
                  {result.subjects.map((subject, i) => (
                    <span key={i} className="px-4 py-2 bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg">
                      {subject}
                    </span>
                  ))}
                </div>
              </div>

              <div className="backdrop-blur-lg bg-white/70 dark:bg-gray-900/70 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase mb-3">Tokens</h3>
                <div className="flex flex-wrap gap-2">
                  {result.tokens.map((token, i) => (
                    <span key={i} className="px-3 py-1 bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-sm">
                      #{token}
                    </span>
                  ))}
                </div>
              </div>

              <div className="backdrop-blur-lg bg-white/70 dark:bg-gray-900/70 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase mb-3">Description</h3>
                <p className="text-gray-900 dark:text-white leading-relaxed">{result.prompt_short}</p>
              </div>

              {result.sref_hint && (
                <div className="backdrop-blur-lg bg-gradient-to-r from-gray-900/90 to-gray-800/90 dark:from-white/90 dark:to-gray-100/90 rounded-xl p-6 border border-gray-700 dark:border-gray-300">
                  <h3 className="text-sm font-semibold text-white dark:text-gray-900 uppercase mb-2">SREF Hint</h3>
                  <code className="text-white dark:text-gray-900 font-mono">{result.sref_hint}</code>
                </div>
              )}

              {isPublisher && (
                <>
                  {publishedPostId ? (
                    <div className="space-y-4">
                      <div className="backdrop-blur-lg bg-green-50/70 dark:bg-green-900/30 rounded-xl p-6 border border-green-200 dark:border-green-700 flex items-start gap-3">
                        <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-green-900 dark:text-green-100 mb-1">Published Successfully!</p>
                          <p className="text-sm text-green-800 dark:text-green-200">Your post is now live and visible on the Explore page.</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => navigate('/explore')}
                          className="py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-semibold hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
                        >
                          View on Explore
                          <ExternalLink className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedFile(null);
                            setPreviewUrl(null);
                            setResult(null);
                            setPublishedPostId(null);
                          }}
                          className="py-3 bg-white dark:bg-gray-900 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-700 rounded-lg font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          Decode Another
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={handlePublish}
                      disabled={isPublishing}
                      className="w-full py-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-bold text-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isPublishing ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white dark:border-gray-900"></div>
                          Publishing...
                        </>
                      ) : (
                        'Post Publicly'
                      )}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
