import { json, bad } from '../lib/json';
import { requireUser, getAuthedClient } from '../lib/auth';
import type { Env } from '../types';

export async function directUpload(env: Env, req: Request, reqId?: string) {
  const log = reqId ? `[${reqId}] [images]` : '[images]';
  const { user, token } = await requireUser(env, req, reqId);

  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_IMAGES_ACCOUNT_ID}/images/v2/direct_upload`;
  const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${env.CF_IMAGES_TOKEN}` } });
  if (!res.ok) {
    console.error(`${log} CF Images error:`, await res.text());
    return bad('Cloudflare Images error', 502);
  }

  const data = await res.json();
  const cfImageId = data?.result?.id;
  const uploadURL = data?.result?.uploadURL;
  if (!cfImageId || !uploadURL) return bad('Invalid CF Images response', 502);

  const db = getAuthedClient(env, token);
  const { data: mediaAsset, error } = await db
    .from('media_assets')
    .insert({
      user_id: user.id,
      provider: 'cloudflare',
      cf_image_id: cfImageId,
      public_id: cfImageId,
      status: 'pending',
      variants: {}
    })
    .select()
    .single();

  if (error) {
    console.error(`${log} insert failed code=${error.code} msg=${error.message}`);
    return bad('Failed to create media asset record', 500);
  }

  console.log(`${log} direct-upload issued`, {
    userId: user.id,
    mediaAssetId: mediaAsset.id,
    cfImageId,
    urlHost: new URL(uploadURL).host
  });

  return json({ uploadURL, mediaAssetId: mediaAsset.id, cfImageId });
}

/** GET /images/v1/:id from Cloudflare and normalize fields */
async function fetchCloudflareMetadata(env: Env, cfImageId: string, reqId?: string): Promise<null | {
  width: number | null;
  height: number | null;
  bytes: number | null;
  format: string;
  variants: string[];
}> {
  const log = reqId ? `[${reqId}] [cf-meta]` : '[cf-meta]';
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_IMAGES_ACCOUNT_ID}/images/v1/${cfImageId}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${env.CF_IMAGES_TOKEN}` } });
  if (!res.ok) {
    console.error(`${log} CF API error: ${res.status} ${await res.text()}`);
    return null;
  }
  const body = await res.json();
  const img = body?.result;
  if (!img) return null;

  const format = img?.meta?.format ?? ext(img?.filename) ?? 'unknown';
  return {
    width: img?.width ?? null,
    height: img?.height ?? null,
    bytes: img?.size ?? null,
    format,
    variants: Array.isArray(img?.variants) ? img.variants : []
  };
}

function ext(filename?: string): string | null {
  if (!filename) return null;
  const e = filename.split('.').pop()?.toLowerCase();
  if (!e) return null;
  if (e === 'jpg' || e === 'jpeg') return 'jpeg';
  if (e === 'png') return 'png';
  if (e === 'webp') return 'webp';
  if (e === 'gif') return 'gif';
  return null;
}

export async function ingestComplete(env: Env, req: Request, reqId?: string) {
  const log = reqId ? `[${reqId}] [ingest]` : '[ingest]';
  const { user, token } = await requireUser(env, req, reqId);

  const body = await req.json().catch(() => ({}));
  const { mediaAssetId, cfImageId } = body || {};
  if (!mediaAssetId || !cfImageId) return bad('Missing mediaAssetId or cfImageId', 400);

  // Verify the image actually exists on Cloudflare and pull authoritative metadata
  const meta = await fetchCloudflareMetadata(env, cfImageId, reqId);
  const db = getAuthedClient(env, token);

  if (!meta) {
    await db.from('media_assets')
      .update({ status: 'failed' })
      .eq('id', mediaAssetId).eq('user_id', user.id);
    return bad('Upload verification failed - image not found in Cloudflare', 400);
  }

  const variantsObj = meta.variants.reduce((acc: Record<string, string>, url: string) => {
    const name = url.split('/').pop() || `v${Object.keys(acc).length + 1}`;
    acc[name] = url;
    return acc;
  }, {});

  const { data: updated, error } = await db
    .from('media_assets')
    .update({
      status: 'completed',
      cf_image_id: cfImageId,
      width: meta.width,
      height: meta.height,
      bytes: meta.bytes,
      format: meta.format,
      variants: variantsObj
    })
    .eq('id', mediaAssetId)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    console.error(`${log} update failed code=${error.code} msg=${error.message}`);
    return bad('Failed to update media asset', 500);
  }

  console.log(`${log} ingest-complete success id=${updated.id} fmt=${updated.format} w=${updated.width} h=${updated.height}`);
  return json({
    ok: true,
    mediaAssetId: updated.id,
    metadata: { width: updated.width, height: updated.height, bytes: updated.bytes, format: updated.format }
  });
}

export async function ensureVariants() {
  return json({ ok: true });
}
