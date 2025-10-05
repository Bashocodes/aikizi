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

  // Insert with minimal data first - just what we know for sure
  const { data: mediaAsset, error } = await client
    .from('media_assets')
    .insert({
      user_id: user.id,
      cf_image_id: cfImageId,
      provider: 'cloudflare',
      public_id: cfImageId, // Keep both for compatibility
      status: 'pending', // Track upload status
      variants: {}
    })
    .select()
    .single();

  if (error) {
    console.error(`${logPrefix} insert failed code=${error.code} msg=${error.message}`);
    return bad('Failed to create media asset record', 500);
  }

  console.log(`${logPrefix} media asset created id=${mediaAsset.id} status=pending`);

  return json({
    uploadURL,
    mediaAssetId: mediaAsset.id,
    cfImageId
  });
}

/**
 * Verify upload completed and fetch authoritative metadata from Cloudflare
 */
async function fetchCloudflareMetadata(env: Env, cfImageId: string, reqId?: string) {
  const logPrefix = reqId ? `[${reqId}] [cf-meta]` : '[cf-meta]';
  
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_IMAGES_ACCOUNT_ID}/images/v1/${cfImageId}`;
  
  console.log(`${logPrefix} Fetching CF metadata for ${cfImageId}`);
  
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${env.CF_IMAGES_TOKEN}` }
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`${logPrefix} CF API error: ${res.status} ${text}`);
    return null;
  }

  const data = await res.json();
  const image = data?.result;
  
  if (!image) {
    console.error(`${logPrefix} No image data in CF response`);
    return null;
  }

  console.log(`${logPrefix} Got metadata: w=${image.width} h=${image.height} format=${image.meta?.format}`);
  
  return {
    width: image.width || null,
    height: image.height || null,
    bytes: image.size || null,
    format: image.meta?.format || extractFormatFromFilename(image.filename) || 'unknown',
    uploaded: image.uploaded || new Date().toISOString(),
    requireSignedURLs: image.requireSignedURLs || false,
    variants: image.variants || []
  };
}

function extractFormatFromFilename(filename?: string): string | null {
  if (!filename) return null;
  const ext = filename.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg'].includes(ext || '')) return 'jpeg';
  if (ext === 'png') return 'png';
  if (ext === 'webp') return 'webp';
  if (ext === 'gif') return 'gif';
  return null;
}

export async function ingestComplete(env: Env, req: Request, reqId?: string) {
  const logPrefix = reqId ? `[${reqId}] [ingest]` : '[ingest]';

  const { user, token } = await requireUser(env, req, reqId);

  console.log(`${logPrefix} ingestComplete userId=${user.id}`);

  const body = await req.json();
  const { mediaAssetId, cfImageId } = body;

  if (!mediaAssetId || !cfImageId) {
    console.error(`${logPrefix} Missing required fields`);
    return bad('Missing mediaAssetId or cfImageId', 400);
  }

  // CRITICAL: Verify upload actually succeeded by fetching from Cloudflare
  const metadata = await fetchCloudflareMetadata(env, cfImageId, reqId);
  
  if (!metadata) {
    console.error(`${logPrefix} Image not found in Cloudflare - upload may have failed`);
    
    // Mark as failed in DB
    const client = getAuthedClient(env, token);
    await client
      .from('media_assets')
      .update({ status: 'failed' })
      .eq('id', mediaAssetId)
      .eq('user_id', user.id);
    
    return bad('Upload verification failed - image not found in Cloudflare', 400);
  }

  console.log(`${logPrefix} Upload verified, updating with authoritative metadata`);

  const client = getAuthedClient(env, token);

  // Update with authoritative metadata from Cloudflare
  const updatePayload = {
    cf_image_id: cfImageId,
    width: metadata.width,
    height: metadata.height,
    bytes: metadata.bytes,
    format: metadata.format,
    status: 'completed',
    variants: metadata.variants.reduce((acc: any, v: string) => {
      // Parse variant URLs to extract variant names
      const match = v.match(/\/([^/]+)$/);
      if (match) {
        acc[match[1]] = v;
      }
      return acc;
    }, {})
  };

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

  console.log(`${logPrefix} ingest-complete success id=${mediaAsset.id} format=${mediaAsset.format} status=${mediaAsset.status}`);

  return json({ 
    ok: true, 
    mediaAssetId: mediaAsset.id,
    metadata: {
      width: mediaAsset.width,
      height: mediaAsset.height,
      format: mediaAsset.format,
      bytes: mediaAsset.bytes
    }
  });
}

export async function ensureVariants(env: Env, req: Request) {
  return json({ ok: true });
}