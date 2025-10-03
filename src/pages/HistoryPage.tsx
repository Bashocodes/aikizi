import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Clock, Trash2, ChevronLeft, ChevronRight, Image as ImageIcon, Loader2, X } from 'lucide-react';

interface Decode {
  id: string;
  created_at: string;
  model: string;
  cost_tokens: number;
  normalized_json: {
    style_triplet?: string;
    artist_oneword?: string;
    subjects?: string[];
    tokens?: string[];
    prompt_short?: string;
    sref_hint?: string;
  };
  media_assets?: {
    variants?: {
      original?: string;
    };
  };
}

const ITEMS_PER_PAGE = 20;

export function HistoryPage() {
  const { userRecord } = useAuth();
  const [decodes, setDecodes] = useState<Decode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedDecode, setSelectedDecode] = useState<Decode | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadDecodes();
  }, [userRecord, currentPage]);

  const loadDecodes = async () => {
    if (!userRecord) return;

    setIsLoading(true);

    const { count } = await supabase
      .from('decodes')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userRecord.id);

    setTotalCount(count || 0);

    const from = (currentPage - 1) * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    const { data, error } = await supabase
      .from('decodes')
      .select(`
        *,
        media_assets (
          variants
        )
      `)
      .eq('user_id', userRecord.id)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('Error loading decodes:', error);
    } else {
      setDecodes(data || []);
    }

    setIsLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this decode?')) return;

    setDeletingId(id);

    const { error } = await supabase
      .from('decodes')
      .delete()
      .eq('id', id)
      .eq('user_id', userRecord?.id);

    if (error) {
      console.error('Error deleting decode:', error);
      alert('Failed to delete decode. Please try again.');
    } else {
      setDecodes(decodes.filter(d => d.id !== id));
      setTotalCount(totalCount - 1);
    }

    setDeletingId(null);
  };

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

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

  const getThumbnail = (decode: Decode): string | null => {
    const variants = decode.media_assets?.variants as any;
    return variants?.original || null;
  };

  if (isLoading && decodes.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gray-900 dark:text-white animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">Decode History</h1>
          <p className="text-gray-600 dark:text-gray-400">
            View and manage all your past image decodes
          </p>
          {totalCount > 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
              {totalCount} total decode{totalCount !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {decodes.length === 0 ? (
          <div className="backdrop-blur-lg bg-white/70 dark:bg-gray-900/70 rounded-xl p-12 border border-gray-200 dark:border-gray-700 text-center">
            <ImageIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No decodes yet</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Start decoding images to see your history here
            </p>
            <a
              href="/decode"
              className="inline-block px-6 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-semibold hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
            >
              Decode an Image
            </a>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {decodes.map((decode) => {
                const thumbnail = getThumbnail(decode);
                const data = decode.normalized_json;

                return (
                  <div
                    key={decode.id}
                    className="backdrop-blur-lg bg-white/70 dark:bg-gray-900/70 rounded-xl p-6 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                  >
                    <div className="flex gap-6">
                      <div className="w-32 h-32 flex-shrink-0 bg-gray-200 dark:bg-gray-800 rounded-lg overflow-hidden">
                        {thumbnail ? (
                          <img
                            src={`data:image/jpeg;base64,${thumbnail}`}
                            alt="Decoded"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon className="w-12 h-12 text-gray-400" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                              {data.style_triplet || 'Untitled Decode'}
                            </h3>
                            <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                              <span className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                {formatDate(decode.created_at)}
                              </span>
                              <span>Model: {decode.model}</span>
                              <span className="font-semibold">{decode.cost_tokens} token{decode.cost_tokens !== 1 ? 's' : ''}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setSelectedDecode(decode)}
                              className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-semibold hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
                            >
                              View
                            </button>
                            <button
                              onClick={() => handleDelete(decode.id)}
                              disabled={deletingId === decode.id}
                              className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              aria-label="Delete"
                            >
                              {deletingId === decode.id ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                              ) : (
                                <Trash2 className="w-5 h-5" />
                              )}
                            </button>
                          </div>
                        </div>

                        {data.subjects && data.subjects.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-2">
                            {data.subjects.slice(0, 5).map((subject, i) => (
                              <span
                                key={i}
                                className="px-3 py-1 bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg text-sm"
                              >
                                {subject}
                              </span>
                            ))}
                            {data.subjects.length > 5 && (
                              <span className="px-3 py-1 text-gray-600 dark:text-gray-400 text-sm">
                                +{data.subjects.length - 5} more
                              </span>
                            )}
                          </div>
                        )}

                        {data.prompt_short && (
                          <p className="text-gray-700 dark:text-gray-300 text-sm line-clamp-2">
                            {data.prompt_short}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-4">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>

                <span className="text-gray-700 dark:text-gray-300 font-medium">
                  Page {currentPage} of {totalPages}
                </span>

                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {selectedDecode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Decode Details</h2>
              <button
                onClick={() => setSelectedDecode(null)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X className="w-6 h-6 text-gray-900 dark:text-white" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {getThumbnail(selectedDecode) && (
                <div className="aspect-video bg-gray-200 dark:bg-gray-800 rounded-lg overflow-hidden">
                  <img
                    src={`data:image/jpeg;base64,${getThumbnail(selectedDecode)}`}
                    alt="Decoded"
                    className="w-full h-full object-contain"
                  />
                </div>
              )}

              {selectedDecode.normalized_json.style_triplet && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2">Style Triplet</h3>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {selectedDecode.normalized_json.style_triplet}
                  </p>
                  {selectedDecode.normalized_json.artist_oneword && (
                    <p className="text-gray-700 dark:text-gray-300 mt-2">
                      Artist: {selectedDecode.normalized_json.artist_oneword}
                    </p>
                  )}
                </div>
              )}

              {selectedDecode.normalized_json.subjects && selectedDecode.normalized_json.subjects.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2">Subjects</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedDecode.normalized_json.subjects.map((subject, i) => (
                      <span
                        key={i}
                        className="px-4 py-2 bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg"
                      >
                        {subject}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedDecode.normalized_json.tokens && selectedDecode.normalized_json.tokens.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2">Tokens</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedDecode.normalized_json.tokens.map((token, i) => (
                      <span
                        key={i}
                        className="px-3 py-1 bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-sm"
                      >
                        #{token}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedDecode.normalized_json.prompt_short && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2">Description</h3>
                  <p className="text-gray-900 dark:text-white leading-relaxed">
                    {selectedDecode.normalized_json.prompt_short}
                  </p>
                </div>
              )}

              {selectedDecode.normalized_json.sref_hint && (
                <div className="bg-gradient-to-r from-gray-900/90 to-gray-800/90 dark:from-white/90 dark:to-gray-100/90 rounded-lg p-6">
                  <h3 className="text-sm font-semibold text-white dark:text-gray-900 uppercase mb-2">SREF Hint</h3>
                  <code className="text-white dark:text-gray-900 font-mono">
                    {selectedDecode.normalized_json.sref_hint}
                  </code>
                </div>
              )}

              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Created:</span>
                    <span className="ml-2 text-gray-900 dark:text-white font-medium">
                      {formatDate(selectedDecode.created_at)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Model:</span>
                    <span className="ml-2 text-gray-900 dark:text-white font-medium">
                      {selectedDecode.model}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Cost:</span>
                    <span className="ml-2 text-gray-900 dark:text-white font-medium">
                      {selectedDecode.cost_tokens} token{selectedDecode.cost_tokens !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
