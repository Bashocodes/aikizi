import { supa } from '../lib/supa';
import { json } from '../lib/json';
import type { Env } from '../types';

export async function search(env: Env, req: Request){
  const url = new URL(req.url); const q = url.searchParams.get('q')||'';
  const sb = supa(env);
  const { data: styles } = await sb.from('post_styles').select('post_id,style_triplet').ilike('style_triplet', `%${q}%`).limit(10);
  const { data: subjects } = await sb.from('post_subjects').select('post_id,subject_slug').ilike('subject_slug', `%${q}%`).limit(10);
  const { data: posts } = await sb.from('posts').select('id,title,slug,image_id').ilike('title', `%${q}%`).limit(10);
  return json({ ok:true, q, styles, subjects, posts });
}
