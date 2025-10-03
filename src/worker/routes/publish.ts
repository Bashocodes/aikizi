import { json, bad } from '../lib/json';
import { supa } from '../lib/supa';
import type { Env } from '../types';

type Body = { title:string, slug:string, image_id:string, style_triplet:string, subjects:string[], tokens:string[], prompt_short?:string, model_used?:string, seo_snippet?:string };

export async function publish(env: Env, req: Request){
  const sb = supa(env, req.headers.get('authorization')||undefined);
  const { data: user } = await sb.auth.getUser();
  if (!user?.user) return bad('auth required', 401);
  const body = await req.json() as Body;
  if(!body.title || !body.slug || !body.image_id || !body.style_triplet) return bad('missing fields');

  const { data: post, error } = await sb.from('posts').insert({ title: body.title, slug: body.slug, image_id: body.image_id, visibility: 'public', status: 'published' }).select('id').single();
  if (error) return bad('post insert failed');
  await sb.from('post_styles').insert({ post_id: post.id, style_triplet: body.style_triplet });
  if (body.subjects?.length) await sb.from('post_subjects').insert(body.subjects.map(s=>({ post_id: post.id, subject_slug: s })));
  if (body.tokens?.length) await sb.from('post_tags').insert(body.tokens.map(t=>({ post_id: post.id, tag: t })));
  await sb.from('post_meta').insert({ post_id: post.id, prompt_short: body.prompt_short||'', model_used: body.model_used||'', alt_text: body.title });
  return json({ ok:true, post_id: post.id });
}
