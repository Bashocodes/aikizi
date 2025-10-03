import { json, bad } from '../lib/json';
import { supa } from '../lib/supa';
import type { Env } from '../types';

function enc(key: string, text: string){ return btoa(text); }
function dec(key: string, blob: string){ return atob(blob); }

type UploadBody = { post_id:string, code:string, price_tokens:number };
export async function srefUpload(env: Env, req: Request){
  const sb = supa(env, req.headers.get('authorization')||undefined);
  const { data: user } = await sb.auth.getUser(); if(!user?.user) return bad('auth required', 401);
  const body = await req.json() as UploadBody; if(!body?.post_id || !body?.code) return bad('missing');
  const code_encrypted = enc(env.SREF_ENCRYPTION_KEY, body.code);
  const { error } = await sb.from('sref_codes').upsert({ post_id: body.post_id, locked: true, price_tokens: body.price_tokens||5, code_encrypted });
  if (error) return bad('sref upsert failed');
  return json({ ok:true });
}

type UnlockBody = { post_id:string };
export async function srefUnlock(env: Env, req: Request){
  const sb = supa(env, req.headers.get('authorization')||undefined);
  const { data: user } = await sb.auth.getUser(); if(!user?.user) return bad('auth required', 401);
  const body = await req.json() as UnlockBody; if(!body?.post_id) return bad('missing');
  const { data: sref, error } = await sb.from('sref_codes').select('*').eq('post_id', body.post_id).single();
  if (error || !sref) return bad('not found', 404);
  if (sref.locked) {
    const { data: spent, error: spendErr } = await sb.rpc('spend_tokens', { p_cost: sref.price_tokens||5, p_idem_key: `sref:${body.post_id}` });
    if (spendErr) return bad('insufficient or spend failed');
    await sb.from('sref_unlocks').insert({ user_id: null, post_id: body.post_id });
  }
  const code = dec(env.SREF_ENCRYPTION_KEY, sref.code_encrypted||'');
  return json({ ok:true, code });
}
