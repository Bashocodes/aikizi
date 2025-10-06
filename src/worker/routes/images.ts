import { json, bad } from '../lib/json';
import type { Env } from '../types';

export async function directUpload(env: Env) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_IMAGES_ACCOUNT_ID}/images/v2/direct_upload`;
  const res = await fetch(url, { method:'POST', headers: { 'Authorization': `Bearer ${env.CF_IMAGES_TOKEN}` }});
  if (!res.ok) return bad('cf images error', 502);
  const data = await res.json();
  return json({ ok:true, uploadURL: data?.result?.uploadURL, id: data?.result?.id });
}

export async function ensureVariants(env: Env, req: Request) {
  return json({ ok:true });
}
