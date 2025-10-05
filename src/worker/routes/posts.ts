import { json, bad } from '../lib/json';
import { requireUser } from '../lib/auth';
import { supa } from '../lib/supa';
import type { Env } from '../types';

export async function createPost(env: Env, req: Request, reqId?: string) {
  const logPrefix = reqId ? `[${reqId}] [posts]` : '[posts]';

  try {
    const { user } = await requireUser(env, req, reqId);
    const body = await req.json();

    const { analysis, image_base64, model } = body || {};
    if (analysis === undefined || analysis === null || typeof image_base64 !== 'string' || !model || typeof model !== 'string') {
      return bad('Missing analysis, image_base64, or model', 400);
    }

    const client = supa(env);

    const sanitizedImage = image_base64.trim();
    if (!sanitizedImage) {
      return bad('image_base64 cannot be empty', 400);
    }

    const { data: profile, error: profileError } = await client
      .from('users')
      .select('id')
      .eq('auth_id', user.id)
      .single();

    if (profileError || !profile) {
      console.error(`${logPrefix} profile lookup failed:`, profileError);
      return bad('User profile not found', 404);
    }

    const { data: post, error } = await client
      .from('posts')
      .insert({
        owner_id: profile.id,
        model,
        analysis,
        image_base64: sanitizedImage,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.error(`${logPrefix} insert failed:`, error);
      return bad('Failed to insert post', 500);
    }

    console.log(`${logPrefix} created post id=${post.id}`);
    return json({ success: true, postId: post.id });
  } catch (err) {
    if (err instanceof Response) {
      return err;
    }
    console.error(`${logPrefix} error:`, err);
    return bad('Internal error', 500);
  }
}
