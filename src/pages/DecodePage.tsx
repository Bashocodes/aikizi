import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { Upload, Sparkles, CheckCircle, ExternalLink, AlertCircle, X, Copy } from 'lucide-react';

interface DecodeResult {
  styleCodes: string[];
  tags: string[];
  subjects: string[];
  story: string;
  mix: string;
  expand: string;
  sound: string;
}

type DecodeStatus = 'idle' | 'decoding' | 'done' | 'error';

const MODEL_OPTIONS = [
  { label: 'GPT-5 (default)', value: 'gpt-5' },
  { label: 'GPT-5 Mini', value: 'gpt-5-mini' },
  { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' },
  { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
];

export function DecodePage() {
  const { userRecord, tokenBalance, refreshTokenBalance } = useAuth();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [isDecoding, setIsDecoding] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [result, setResult] = useState<DecodeResult | null>(null);
  const [publishedPostId, setPublishedPostId] = useState<string | null>(null);
  const [insufficientTokens, setInsufficientTokens] = useState(false);
  const [decodeStatus, setDecodeStatus] = useState<DecodeStatus>('idle');
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [activePromptTab, setActivePromptTab] = useState<'story' | 'mix' | 'expand' | 'sound'>('story');
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);
  const [spentTokens, setSpentTokens] = useState<number>(0);
  const navigate = useNavigate();
  const abortControllerRef = useRef<AbortController | null>(null);

  const isPublisher = userRecord?.role === 'publisher' || userRecord?.role === 'admin';

  useEffect(() => {
    const saved = sessionStorage.getItem('aikizi:model');
    if (saved && MODEL_OPTIONS.some(opt => opt.value === saved)) {
      setSelectedModel(saved);
    } else {
      setSelectedModel('gpt-5');
    }
  }, []);

  useEffect(() => {
    if (selectedModel) {
      sessionStorage.setItem('aikizi:model', selectedModel);
    }
  }, [selectedModel]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

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
      setDecodeError(null);
      setDecodeStatus('idle');
      setSpentTokens(0);
    }
  };


  const handleDecode = async () => {
    if (!selectedFile) {
      alert('Please select an image');
      return;
    }

    if (!selectedModel) {
      alert('Please choose a model');
      return;
    }

    if (tokenBalance < 1) {
      setInsufficientTokens(true);
      return;
    }

    if (isDecoding) {
      console.log('[DecodePage] Already decoding, ignoring double-click');
      return;
    }

    if (abortControllerRef.current) {
      console.log('[DecodePage] Aborting previous decode');
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setIsDecoding(true);
    setInsufficientTokens(false);
    setDecodeError(null);
    setDecodeStatus('decoding');

    console.log('[DecodePage] Starting decode flow', { tokenBalance, model: selectedModel });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        alert('Please sign in to decode images');
        setIsDecoding(false);
        return;
      }

      const reader = new FileReader();
      reader.readAsDataURL(selectedFile);
      const imageDataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
      });

      abortControllerRef.current = new AbortController();

      const response = await api.post('/decode',
        {
          imageUrl: imageDataUrl,
          model: selectedModel,
        },
        {
          signal: abortControllerRef.current.signal,
        }
      );

      abortControllerRef.current = null;

      if (!response.ok) {
        console.error('[DecodePage] Decode failed', { error: response.error });

        if (response.error?.includes('auth required')) {
          setDecodeError('Authorization failed. Please sign out and back in.');
        } else if (response.error?.includes('insufficient tokens')) {
          setInsufficientTokens(true);
        } else if (response.error?.includes('decode timeout')) {
          setDecodeError('The model took too long. Please try again.');
        } else if (response.error?.includes('invalid input')) {
          setDecodeError('Invalid input. Please check your image and try again.');
        } else {
          setDecodeError(response.error || 'Failed to decode image. Please try again.');
        }

        setIsDecoding(false);
        setDecodeStatus('error');
        await refreshTokenBalance();
        return;
      }

      if (response.decode?.normalized) {
        console.log('[DecodePage] POST /v1/decode result: 200 (sync)');
        setResult(response.decode.normalized);
        setSpentTokens(response.decode.spentTokens || 1);
        setIsDecoding(false);
        setDecodeStatus('done');
        await refreshTokenBalance();
      } else {
        console.error('[DecodePage] Unexpected response format');
        setDecodeError('Unexpected response from server. Please try again.');
        setIsDecoding(false);
        setDecodeStatus('error');
        await refreshTokenBalance();
      }
    } catch (error: any) {
      console.error('[DecodePage] Error in decode flow:', error);

      if (error.name === 'AbortError') {
        console.log('[DecodePage] Decode was aborted by user');
      } else {
        setDecodeError('Failed to decode image. Please try again.');
      }

      setIsDecoding(false);
      setDecodeStatus('error');
      await refreshTokenBalance();
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

      const title = result.styleCodes[0] || 'Decoded Style';
      const slug = title
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
          title,
          slug,
          image_base64: imageBase64,
          style_triplet: result.styleCodes.join(' • '),
          artist_oneword: result.subjects[0] || '',
          style_tags: result.styleCodes,
          subjects: result.subjects,
          tags: result.tags,
          prompt_short: result.story,
          sref_code: result.styleCodes[0] || null,
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

          {decodeError && (
            <div className="mt-4 backdrop-blur-lg bg-yellow-50/90 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-1">
                  Decode Error
                </h3>
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  {decodeError}
                </p>
              </div>
              <button
                onClick={() => setDecodeError(null)}
                className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-700 dark:hover:text-yellow-300"
              >
                <X className="w-5 h-5" />
              </button>
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
                        setDecodeError(null);
                        setDecodeStatus(null);
                        setJobId(null);
                        setConsecutive401s(0);
                        stopPolling();
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
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 block">Choose AI Model</span>
                <div className="space-y-2">
                  {MODEL_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                    >
                      <input
                        type="radio"
                        name="model"
                        value={option.value}
                        checked={selectedModel === option.value}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        className="w-4 h-4 text-gray-900 dark:text-white"
                      />
                      <span className="text-gray-900 dark:text-white font-medium">{option.label}</span>
                    </label>
                  ))}
                </div>
                {!selectedModel && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">Please choose a model</p>
                )}
              </label>
            </div>

            <button
              onClick={handleDecode}
              disabled={!selectedFile || !selectedModel || tokenBalance < 1 || isDecoding}
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

            {isDecoding && (
              <div className="backdrop-blur-lg bg-gray-100/70 dark:bg-gray-800/70 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900 dark:border-white"></div>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Decoding...
                  </span>
                </div>
              </div>
            )}
          </div>

          {result && (
            <div className="space-y-6">
              <div className="backdrop-blur-lg bg-white/70 dark:bg-gray-900/70 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase mb-3">Style Codes</h3>
                <div className="flex flex-wrap gap-2">
                  {result.styleCodes.map((code, i) => (
                    <span key={i} className="px-4 py-2 bg-gradient-to-r from-gray-900 to-gray-800 dark:from-white dark:to-gray-100 text-white dark:text-gray-900 rounded-lg font-mono text-sm">
                      {code}
                    </span>
                  ))}
                </div>
              </div>

              <div className="backdrop-blur-lg bg-white/70 dark:bg-gray-900/70 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase mb-3">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {result.tags.map((tag, i) => (
                    <span key={i} className="px-3 py-1 bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-sm">
                      {tag}
                    </span>
                  ))}
                </div>
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
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase">Prompts</h3>
                  <div className="flex gap-2">
                    {(['story', 'mix', 'expand', 'sound'] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActivePromptTab(tab)}
                        className={`px-3 py-1 rounded-lg text-sm font-semibold transition-colors ${
                          activePromptTab === tab
                            ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                            : 'bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700'
                        }`}
                      >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="relative">
                  <p className="text-gray-900 dark:text-white leading-relaxed pr-12">
                    {result[activePromptTab]}
                  </p>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(result[activePromptTab]);
                      setCopiedPrompt(activePromptTab);
                      setTimeout(() => setCopiedPrompt(null), 2000);
                    }}
                    className="absolute top-0 right-0 p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                    title="Copy to clipboard"
                  >
                    {copiedPrompt === activePromptTab ? (
                      <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                    ) : (
                      <Copy className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

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
                            setDecodeError(null);
                            setDecodeStatus(null);
                            setJobId(null);
                            setConsecutive401s(0);
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
