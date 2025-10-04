import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { requireUser } from '../_shared/auth.ts';
import { withCORS, preflight } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return preflight(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const { user } = await requireUser(req, supabaseUrl, supabaseAnonKey);

    const url = new URL(req.url);
    const jobId = url.searchParams.get('id');
    const cancel = url.searchParams.get('cancel') === '1';

    if (!jobId) {
      return withCORS(
        JSON.stringify({ error: 'id parameter required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
        req
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: userData } = await supabase
      .from('users')
      .select('id')
      .eq('auth_id', user.id)
      .single();

    if (!userData) {
      return withCORS(
        JSON.stringify({ error: 'user not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
        req
      );
    }

    const { data: job, error: jobError } = await supabase
      .from('decode_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('user_id', userData.id)
      .single();

    if (jobError || !job) {
      return withCORS(
        JSON.stringify({ error: 'job not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
        req
      );
    }

    if (cancel && job.status === 'queued') {
      console.log('[FN decode-status] Canceling job:', jobId);

      await supabase
        .from('decode_jobs')
        .update({ status: 'canceled', updated_at: new Date().toISOString() })
        .eq('id', jobId);

      await supabase.rpc('refund_tokens', { p_user_id: userData.id, p_amount: 1 });

      return withCORS(
        JSON.stringify({ status: 'canceled' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
        req
      );
    }

    const response: any = { status: job.status };

    if (job.status === 'completed' && job.result_json) {
      response.result = job.result_json;
    }

    if (job.status === 'failed' && job.error) {
      response.error = job.error;
    }

    console.log('[FN decode-status] Job status:', job.status, 'for job:', jobId);

    return withCORS(
      JSON.stringify(response),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
      req
    );
  } catch (error) {
    if (error instanceof Response) {
      return withCORS(error.body, { status: error.status, headers: error.headers }, req);
    }

    console.error('[FN decode-status] Unexpected error:', error);
    return withCORS(
      JSON.stringify({ error: 'internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
      req
    );
  }
});
