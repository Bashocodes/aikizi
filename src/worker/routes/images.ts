import { json, bad } from '../lib/json';
import { requireUser, getAuthedClient } from '../lib/auth';
import type { Env } from '../types';

export async function directUpload(env: Env, req: Request, reqId?: string) {
  const logPrefix = reqId ? `[${reqId}] [images]` : '[images]';

  const { user, token } = await requireUser(env, req, reqId);

  console.log(`${logPrefix} directUpload userId=${user.id}`);

  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_IMAGES_ACCOUNT_ID}/images/v2/direct_upload`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.CF_IMAGES_TOKEN}` }
  });

  if (!res.ok) {
    console.error(`${logPrefix} CF Images error:`, await res.text());
    return bad('Cloudflare Images error', 502);
  }

  const data = await res.json();
  const cfImageId = data?.result?.id;
  const uploadURL = data?.result?.uploadURL;

  if (!cfImageId || !uploadURL) {
    console.error(`${logPrefix} Invalid CF Images response`);
    return bad('Invalid CF Images response', 502);
  }

  const client = getAuthedClient(env, token);

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
    console.error(`${logPrefix} insert failed code=${error.code} msg=${error.message}`);
    return bad('Failed to create media asset record', 500);
  }

  console.log(`${logPrefix} media asset created id=${mediaAsset.id} user=${user.id}`);

  return json({
    uploadURL,
    mediaAssetId: mediaAsset.id,
    cfImageId
  });
}

export async function ingestComplete(env: Env, req: Request, reqId?: string) {
  const logPrefix = reqId ? `[${reqId}] [images]` : '[images]';

  const { user, token } = await requireUser(env, req, reqId);

  console.log(`${logPrefix} ingestComplete userId=${user.id}`);

  const body = await req.json();
  const { mediaAssetId, cfImageId, width, height, bytes } = body;

  if (!mediaAssetId || !cfImageId) {
    console.error(`${logPrefix} Missing required fields`);
    return bad('Missing mediaAssetId or cfImageId', 400);
  }

  console.log(`${logPrefix} ingestComplete received w=${width} h=${height} bytes=${bytes}`);

  const client = getAuthedClient(env, token);

  const updatePayload: any = {};
  if (cfImageId) updatePayload.cf_image_id = cfImageId;
  if (width !== undefined && width !== null) updatePayload.width = width;
  if (height !== undefined && height !== null) updatePayload.height = height;
  if (bytes !== undefined && bytes !== null) updatePayload.bytes = bytes;

  const { data: mediaAsset, error } = await client
    .from('media_assets')
    .update(updatePayload)
    .eq('id', mediaAssetId)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    console.error(`${logPrefix} update failed code=${error.code} msg=${error.message}`);
    return bad('Failed to update media asset', 500);
  }

  console.log(`${logPrefix} ingest-complete updated meta id=${mediaAsset.id} w=${mediaAsset.width} h=${mediaAsset.height} bytes=${mediaAsset.bytes}`);

  return json({ ok: true, mediaAssetId: mediaAsset.id });
}

export async function ensureVariants(env: Env, req: Request) {
  return json({ ok: true });
}
