import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { toast } from '../lib/toast';
import { Upload, Sparkles, AlertCircle, X, Copy, CheckCircle } from 'lucide-react';

interface DecodeResult {
  styleCodes: string[];
  tags: string[];
  subjects: string[];
  story: string;
  mix: string;
  expand: string;
  sound: string;
}

const MODEL_OPTIONS = [
  { label: 'GPT-5 (default)', value: 'gpt-5' },
  { label: 'GPT-5 Mini', value: 'gpt-5-mini' },
  { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' },
  { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
];

export function DecodePage() {
  const { tokenBalance, refreshTokenBalance } = useAuth();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('gpt-5');
  const [isDecoding, setIsDecoding] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [result, setResult] = useState<DecodeResult | null>(null);
  const [insufficientTokens, setInsufficientTokens] = useState(false);
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [activePromptTab, setActivePromptTab] = useState<'story' | 'mix' | 'expand' | 'sound'>('story');
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: string; message: string } | null>(null);

  useEffect(() => {
    const handleToast = (event: Event) => {
      const customEvent = event as CustomEvent<{ type: string; message: string }>;
      if (!customEvent.detail) return;
      setToastMessage(customEvent.detail);
      setTimeout(() => setToastMessage(null), 4000);
    };
    window.addEventListener('toast', handleToast);
    return () => window.removeEventListener('toast', handleToast);
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_FILE_SIZE = 25 * 1024 * 1024;
    const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

    if (file.size > MAX_FILE_SIZE) {
      toast.error('File size must be under 25MB');
      return;
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Only PNG, JPEG, and WebP images are supported');
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setResult(null);
    setDecodeError(null);
    setImageBase64(null);
    setInsufficientTokens(false);
  };

  const handleDecode = async () => {
    if (!selectedFile) {
      alert('Please upload an image first');
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

    setIsDecoding(true);
    setInsufficientTokens(false);
    setDecodeError(null);

    console.log('[decode] starting decode', { model: selectedModel });

    try {
      const reader = new FileReader();
      reader.readAsDataURL(selectedFile);
      const imageDataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
      });

      const [mimePrefix, base64Data] = imageDataUrl.split(',');
      if (!base64Data) {
        throw new Error('Unable to read image data');
      }

      const mimeType = mimePrefix.match(/:(.*?);/)?.[1] || 'image/jpeg';
      setImageBase64(base64Data);

      const response = await api.post('/decode', {
        base64: base64Data,
        mimeType,
        model: selectedModel,
      });

      if (response && typeof response === 'object') {
        if ('ok' in response && response.ok === false) {
          if (response.error?.includes('insufficient tokens')) {
            setInsufficientTokens(true);
          } else {
            setDecodeError(response.error || 'Failed to decode image');
          }
          return;
        }

        if ('success' in response && response.success === false) {
          const message = response.error || 'Failed to decode image';
          if (message?.includes('insufficient tokens')) {
            setInsufficientTokens(true);
          } else {
            setDecodeError(message);
          }
          return;
        }
      }

        const extractContent = (payload: unknown): unknown => {
          if (!payload || typeof payload !== 'object') return payload;
          const record = payload as Record<string, unknown>;
          const resultEntry = record.result;

          if (resultEntry && typeof resultEntry === 'object') {
            const resultRecord = resultEntry as Record<string, unknown>;
            if (typeof resultRecord.content === 'string') {
              return resultRecord.content;
            }
          }

          if (typeof resultEntry === 'string') {
            return resultEntry;
          }

          if (record.analysis !== undefined) {
            return record.analysis;
          }

          if (record.content !== undefined) {
            return record.content;
          }

          return record;
        };

        const normalizeResult = (data: unknown): DecodeResult => {
          if (!data) {
            return {
              styleCodes: [],
              tags: [],
              subjects: [],
            story: '',
            mix: '',
            expand: '',
            sound: '',
          };
        }

          if (typeof data === 'string') {
            try {
              const cleaned = data
                .replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .trim();
              const parsed = JSON.parse(cleaned);
              return normalizeResult(parsed);
            } catch {
              return {
                styleCodes: [],
                tags: [],
                subjects: [],
                story: data,
                mix: '',
                expand: '',
                sound: '',
              };
            }
          }

          const record = data as Record<string, unknown>;
          const prompts = (record.prompts as Record<string, unknown> | undefined) || undefined;

          return {
            styleCodes: (record.styleCodes as string[] | undefined) || (record.style_codes as string[] | undefined) || [],
            tags: (record.tags as string[] | undefined) || [],
            subjects: (record.subjects as string[] | undefined) || [],
            story: (record.story as string | undefined) || (prompts?.story as string | undefined) || '',
            mix: (record.mix as string | undefined) || (prompts?.mix as string | undefined) || '',
            expand: (record.expand as string | undefined) || (prompts?.expand as string | undefined) || '',
            sound: (record.sound as string | undefined) || (prompts?.sound as string | undefined) || '',
          };
        };

      const rawContent = extractContent(response);
      const normalized = normalizeResult(rawContent);
      setResult(normalized);
      console.log('[decode] analysis success', { hasResult: true });
      console.log('[decode] ready to post');
    } catch (error) {
      console.error('Decode error:', error);
      setDecodeError('Failed to decode image. Please try again.');
    } finally {
      setIsDecoding(false);
      await refreshTokenBalance();
    }
  };

  const handlePost = async () => {
    if (!result || !imageBase64) {
      toast.error('Decode an image before posting');
      return;
    }

    setIsPosting(true);

    try {
      const response = await api.post('/posts/create', {
        analysis: result,
        imageBase64,
        model: selectedModel,
      });

      if (response && typeof response === 'object') {
        if ('ok' in response && response.ok === false) {
          toast.error(response.error || 'Failed to create post');
          return;
        }

        if ('success' in response && response.success === false) {
          toast.error(response.error || 'Failed to create post');
          return;
        }
      }

      toast.success('Posted successfully');
    } catch (error) {
      console.error('Post error:', error);
      toast.error('Failed to create post');
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Decode an Image
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Upload an image to extract style codes, subjects, and prompts. Cost: 1 token per decode.
          </p>
          <div className="mt-4 flex items-center gap-4">
            <div className="px-4 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg">
              <span className="text-sm text-gray-600 dark:text-gray-400">Your Balance:</span>
              <span className="ml-2 font-bold text-gray-900 dark:text-white">
                {tokenBalance} tokens
              </span>
            </div>
          </div>

          {insufficientTokens && (
            <div className="mt-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-red-900 dark:text-red-100 mb-1">
                  Insufficient Tokens
                </h3>
                <p className="text-sm text-red-800 dark:text-red-200 mb-3">
                  You need at least 1 token to decode an image.
                </p>
                <Link
                  to="/pricing"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors"
                >
                  View Pricing Plans
                </Link>
              </div>
            </div>
          )}

          {decodeError && (
            <div className="mt-4 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-1">
                  Decode Error
                </h3>
                <p className="text-sm text-yellow-800 dark:text-yellow-200">{decodeError}</p>
              </div>
              <button
                onClick={() => setDecodeError(null)}
                className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
              <label className="block">
                <div className="mb-4">
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Upload Image
                  </span>
                </div>
                {previewUrl ? (
                  <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-800">
                    <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <label className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-12 text-center cursor-pointer hover:border-gray-400 transition-colors block">
                    <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 dark:text-gray-400 mb-2">
                      Click to upload or drag and drop
                    </p>
                    <p className="text-sm text-gray-500">JPEG, PNG, WEBP up to 25MB</p>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </label>
                )}
              </label>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
              <label className="block">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 block">
                  Choose AI Model
                </span>
                <div className="space-y-2">
                  {MODEL_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors"
                    >
                      <input
                        type="radio"
                        name="model"
                        value={option.value}
                        checked={selectedModel === option.value}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        className="w-4 h-4"
                      />
                      <span className="text-gray-900 dark:text-white font-medium">
                        {option.label}
                      </span>
                    </label>
                  ))}
                </div>
              </label>
            </div>

            {result ? (
              <button
                onClick={handlePost}
                disabled={isPosting || !imageBase64}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isPosting ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Posting...
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    Post
                  </>
                )}
              </button>
            ) : (
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
            )}
          </div>

          {result && (
            <div className="space-y-6">
              {previewUrl && (
                <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase mb-3">
                    Analysis Summary
                  </h3>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="aspect-square rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-800">
                      <img src={previewUrl} alt="Analyzed preview" className="w-full h-full object-cover" />
                    </div>
                    <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                      <div>
                        <span className="font-semibold">Model:</span>{' '}
                        {MODEL_OPTIONS.find((option) => option.value === selectedModel)?.label || selectedModel}
                      </div>
                      <div>
                        <span className="font-semibold">Style codes:</span> {result.styleCodes.length}
                      </div>
                      <div>
                        <span className="font-semibold">Tags:</span> {result.tags.length}
                      </div>
                      <div>
                        <span className="font-semibold">Subjects:</span> {result.subjects.length}
                      </div>
                      {result.story && (
                        <div>
                          <span className="font-semibold">Story snippet:</span>
                          <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                            {result.story.length > 200 ? `${result.story.slice(0, 200)}…` : result.story}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <h3 className="text-sm font-semibold text-green-600 dark:text-green-400">
                    Saved to your history
                  </h3>
                </div>
                <Link
                  to="/me"
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white underline"
                >
                  View all decodes →
                </Link>
              </div>

              <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase mb-3">
                  Style Codes
                </h3>
                <div className="flex flex-wrap gap-2">
                  {result.styleCodes.map((code, i) => (
                    <span
                      key={i}
                      className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-mono text-sm"
                    >
                      {code}
                    </span>
                  ))}
                </div>
              </div>

              <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase mb-3">
                  Tags
                </h3>
                <div className="flex flex-wrap gap-2">
                  {result.tags.map((tag, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-sm"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase mb-3">
                  Subjects
                </h3>
                <div className="flex flex-wrap gap-2">
                  {result.subjects.map((subject, i) => (
                    <span
                      key={i}
                      className="px-4 py-2 bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg"
                    >
                      {subject}
                    </span>
                  ))}
                </div>
              </div>

              <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase">
                    Prompts
                  </h3>
                  <div className="flex gap-2">
                    {(['story', 'mix', 'expand', 'sound'] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActivePromptTab(tab)}
                        className={`px-3 py-1 rounded-lg text-sm font-semibold transition-colors ${
                          activePromptTab === tab
                            ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                            : 'bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
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
            </div>
          )}
        </div>
      </div>

      {toastMessage && (
        <div className={`fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 max-w-md ${
          toastMessage.type === 'error' ? 'bg-red-600 text-white' :
          toastMessage.type === 'success' ? 'bg-green-600 text-white' :
          'bg-blue-600 text-white'
        }`}>
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="font-medium">{toastMessage.message}</p>
            </div>
            <button
              onClick={() => setToastMessage(null)}
              className="text-white/80 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
