import { json, bad } from '../lib/json';
import { requireUser, getAuthedClient } from '../lib/auth';
import type { Env } from '../types';

export async function createPost(env: Env, req: Request, reqId?: string) {
  const logPrefix = reqId ? `[${reqId}] [posts]` : '[posts]';

  try {
    const { user, token } = await requireUser(env, req, reqId);
    const body = await req.json();

    const { analysis, imageBase64, model } = body || {};
    if (!analysis || !imageBase64) {
      return bad('Missing analysis or imageBase64', 400);
    }

    const client = getAuthedClient(env, token);

    const { data: post, error } = await client
      .from('posts')
      .insert({
        user_id: user.id,
        model,
        analysis,
        image_base64: imageBase64,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error(`${logPrefix} insert failed:`, error);
      return bad('Failed to insert post', 500);
    }

    console.log(`${logPrefix} created post id=${post.id}`);
    return json({ ok: true, postId: post.id });
  } catch (err) {
    if (err instanceof Response) {
      return err;
    }
    console.error(`${logPrefix} error:`, err);
    return bad('Internal error', 500);
  }
}
