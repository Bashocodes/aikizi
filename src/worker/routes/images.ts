import { json, bad } from '../lib/json';
import { supa } from '../lib/supa';
import { verifyUser } from '../lib/auth';
import type { Env } from '../types';

export async function directUpload(env: Env, req: Request) {
  const user = await verifyUser(env, req);
  if (!user) return bad('Unauthorized', 401);

  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_IMAGES_ACCOUNT_ID}/images/v2/direct_upload`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.CF_IMAGES_TOKEN}` }
  });

  if (!res.ok) {
    console.error('CF Images error:', await res.text());
    return bad('Cloudflare Images error', 502);
  }

  const data = await res.json();
  const cfImageId = data?.result?.id;
  const uploadURL = data?.result?.uploadURL;

  if (!cfImageId || !uploadURL) {
    return bad('Invalid CF Images response', 502);
  }

  const authHeader = req.headers.get('Authorization');
  const jwt = authHeader?.replace('Bearer ', '');
  const client = supa(env, jwt);

  const { data: mediaAsset, error } = await client
    .from('media_assets')
    .insert({
      user_id: user.id,
      cf_image_id: cfImageId,
      provider: 'cloudflare',
      public_id: cfImageId,
      variants: {}
    })
    .select()
    .single();

  if (error) {
    console.error('Media asset creation error:', error);
    return bad('Failed to create media asset record', 500);
  }

  return json({
    uploadURL,
    mediaAssetId: mediaAsset.id,
    cfImageId
  });
}

export async function ingestComplete(env: Env, req: Request) {
  const user = await verifyUser(env, req);
  if (!user) return bad('Unauthorized', 401);

  const body = await req.json();
  const { mediaAssetId, cfImageId } = body;

  if (!mediaAssetId || !cfImageId) {
    return bad('Missing mediaAssetId or cfImageId', 400);
  }

  const imageUrl = `https://api.cloudflare.com/client/v4/accounts/${env.CF_IMAGES_ACCOUNT_ID}/images/v1/${cfImageId}`;
  const res = await fetch(imageUrl, {
    headers: { 'Authorization': `Bearer ${env.CF_IMAGES_TOKEN}` }
  });

  if (!res.ok) {
    console.error('Failed to fetch CF image metadata:', await res.text());
    return bad('Failed to fetch image metadata', 502);
  }

  const data = await res.json();
  const result = data?.result;
  const width = result?.width;
  const height = result?.height;
  const bytes = result?.uploaded ? new Date(result.uploaded).getTime() : null;

  const authHeader = req.headers.get('Authorization');
  const jwt = authHeader?.replace('Bearer ', '');
  const client = supa(env, jwt);

  const { data: mediaAsset, error } = await client
    .from('media_assets')
    .update({
      width,
      height,
      bytes
    })
    .eq('id', mediaAssetId)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    console.error('Media asset update error:', error);
    return bad('Failed to update media asset', 500);
  }

  return json({ mediaAsset });
}

export async function ensureVariants(env: Env, req: Request) {
  return json({ ok: true });
}
