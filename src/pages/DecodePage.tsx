import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { api, logUploadDebug, uploadWithDebug, requestDirectUpload, uploadToCloudflare, markIngestComplete } from '../lib/api';
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
  const [mediaAssetId, setMediaAssetId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('gpt-5');
  const [isUploading, setIsUploading] = useState(false);
  const [isDecoding, setIsDecoding] = useState(false);
  const [result, setResult] = useState<DecodeResult | null>(null);
  const [insufficientTokens, setInsufficientTokens] = useState(false);
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [activePromptTab, setActivePromptTab] = useState<'story' | 'mix' | 'expand' | 'sound'>('story');
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);
  const [lastUploadDebug, setLastUploadDebug] = useState<any>(null);
  const [lastUploadInit, setLastUploadInit] = useState<RequestInit | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [cfImageId, setCfImageId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: string; message: string } | null>(null);

  useEffect(() => {
    const handleToast = (e: any) => {
      setToastMessage(e.detail);
      setTimeout(() => setToastMessage(null), 4000);
    };
    window.addEventListener('toast', handleToast);
    return () => window.removeEventListener('toast', handleToast);
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Cancel any in-progress upload
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }

    // File validation
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

    // Reset state
    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setResult(null);
    setDecodeError(null);
    setMediaAssetId(null);
    setCfImageId(null);
    setUploadSuccess(false);
    setUploadProgress(0);

    // Start upload
    setIsUploading(true);
    const controller = new AbortController();
    setAbortController(controller);

    try {
      // Check auth
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('Please sign in to upload images');
        setIsUploading(false);
        setAbortController(null);
        return;
      }

      console.log('[upload] Step 1: Requesting direct upload URL...');

      const { uploadURL, mediaAssetId: assetId, cfImageId: imageId } = await requestDirectUpload();
      logUploadDebug('direct-upload.received', {
        mediaAssetId: assetId,
        cfImageId: imageId,
        uploadURLHost: new URL(uploadURL).host,
      });
      const uploadResult = await uploadToCloudflare(uploadURL, file, setUploadProgress, controller.signal);
      if (!uploadResult.success) throw new Error(uploadResult.error || 'Upload to Cloudflare failed');
      await markIngestComplete(assetId, imageId);

      setUploadProgress(100);
      setMediaAssetId(assetId);
      setCfImageId(imageId);
      setUploadSuccess(true);
      toast.success('Image uploaded and verified successfully');

    } catch (error: any) {
      console.error('[upload] Upload failed:', error);
      
      if (error.message === 'Upload cancelled') {
        toast.info('Upload cancelled');
      } else if (error.message?.includes('verification failed')) {
        toast.error('Upload appeared to succeed but image not found. Please try again.');
      } else if (error.message?.includes('expired')) {
        toast.error('Upload link expired. Please try again.');
      } else if (error.message?.includes('Network')) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error(error.message || 'Failed to upload image. Please try again.');
      }
      
      // Reset state on error
      setSelectedFile(null);
      setPreviewUrl(null);
      setMediaAssetId(null);
      setCfImageId(null);
      
    } finally {
      setIsUploading(false);
      setAbortController(null);
      setUploadProgress(0);
    }
  };

  const handleCancelUpload = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__aikizi = {
        retryLastUpload: async () => {
          if (!lastUploadDebug || !lastUploadInit) {
            logUploadDebug('manual.retry.nodata');
            console.warn('[UploadDebug] No upload data available for retry');
            return;
          }

          logUploadDebug('manual.retry.begin', {
            uploadURL: lastUploadDebug.uploadURL,
            mediaAssetId: lastUploadDebug.mediaAssetId
          });

          try {
            const res = await uploadWithDebug(lastUploadDebug.uploadURL, lastUploadInit);
            logUploadDebug('manual.retry.result', { status: res.status, ok: res.ok });
            alert(`Retry complete: ${res.ok ? 'Success' : 'Failed'} (${res.status})`);
          } catch (e: any) {
            logUploadDebug('manual.retry.error', { message: e?.message });
            alert(`Retry error: ${e?.message}`);
          }
        }
      };
    }
  }, [lastUploadDebug, lastUploadInit]);

  const handleDecode = async () => {
    if (!selectedFile || !mediaAssetId) {
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

    try {
      const reader = new FileReader();
      reader.readAsDataURL(selectedFile);
      const imageDataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
      });

      const [mimePrefix, base64Data] = imageDataUrl.split(',');
      const mimeType = mimePrefix.match(/:(.*?);/)?.[1] || 'image/jpeg';

      const response = await api.post('/decode', {
        base64: base64Data,
        mimeType: mimeType,
        model: selectedModel,
        input_media_id: mediaAssetId,
      });

      if (!response.success) {
        if (response.error?.includes('insufficient tokens')) {
          setInsufficientTokens(true);
        } else {
          setDecodeError(response.error || 'Failed to decode image');
        }
        setIsDecoding(false);
        await refreshTokenBalance();
        return;
      }

      if (response.result?.content) {
        try {
          const cleaned = response.result.content
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();
          const parsed = JSON.parse(cleaned);

          const normalized = {
            styleCodes: parsed.styleCodes || [],
            tags: parsed.tags || [],
            subjects: parsed.subjects || [],
            story: parsed.prompts?.story || '',
            mix: parsed.prompts?.mix || '',
            expand: parsed.prompts?.expand || '',
            sound: parsed.prompts?.sound || '',
          };

          setResult(normalized);
        } catch (parseError) {
          setResult({
            styleCodes: [],
            tags: [],
            subjects: [],
            story: response.result.content,
            mix: '',
            expand: '',
            sound: '',
          });
        }

        setIsDecoding(false);
        await refreshTokenBalance();
      }
    } catch (error) {
      console.error('Decode error:', error);
      setDecodeError('Failed to decode image. Please try again.');
      setIsDecoding(false);
      await refreshTokenBalance();
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

          {uploadSuccess && !result && (
            <div className="mt-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg p-4 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
              <p className="text-sm text-green-800 dark:text-green-200">
                Image uploaded successfully! Ready to decode.
              </p>
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
                    {isUploading && (
                      <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center p-4">
                        <div className="text-white text-center w-full max-w-xs">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-3"></div>
                          <p className="text-sm mb-3">Uploading... {uploadProgress}%</p>
                          <div className="w-full bg-gray-700 rounded-full h-2 mb-3">
                            <div
                              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${uploadProgress}%` }}
                            ></div>
                          </div>
                          <button
                            onClick={handleCancelUpload}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
                          >
                            Cancel Upload
                          </button>
                        </div>
                      </div>
                    )}
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

            <button
              onClick={handleDecode}
              disabled={!mediaAssetId || !selectedModel || tokenBalance < 1 || isDecoding || isUploading}
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

      {typeof window !== 'undefined' && localStorage.getItem('aikizi_debug') === '1' && lastUploadDebug && (
        <div className="fixed bottom-4 right-4 bg-gray-900 text-white p-4 rounded-lg shadow-2xl max-w-sm border border-gray-700">
          <div className="text-xs font-bold mb-2 text-yellow-400">Upload Debug Panel</div>
          <div className="text-xs space-y-1 mb-3 font-mono">
            <div>File: {lastUploadDebug.fileName}</div>
            <div>Size: {Math.round(lastUploadDebug.size / 1024)} KB</div>
            <div>Type: {lastUploadDebug.type}</div>
            <div>Started: {new Date(lastUploadDebug.startedAt).toLocaleTimeString()}</div>
            <div>Asset ID: {lastUploadDebug.mediaAssetId?.slice(0, 8)}...</div>
          </div>
          <button
            onClick={() => (window as any).__aikizi?.retryLastUpload()}
            className="w-full bg-yellow-600 hover:bg-yellow-700 text-white text-xs py-2 px-3 rounded transition-colors"
          >
            Retry Last Upload
          </button>
          <div className="text-xs text-gray-400 mt-2">
            Console: [UploadDebug] logs
          </div>
        </div>
      )}
    </div>
  );
}
