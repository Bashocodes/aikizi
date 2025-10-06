import { json, bad } from '../lib/json';
import { supa } from '../lib/supa';
import type { Env } from '../types';

type Body = { title:string, slug:string, image_id:string, style_triplet:string, subjects:string[], tokens:string[], prompt_short?:string, model_used?:string, seo_snippet?:string };
type CreatePostBody = { user_id:string, cf_image_id:string, analysis_text:string, visibility?:string };

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

export async function createPost(env: Env, req: Request) {
  const sb = supa(env, req.headers.get('authorization')||undefined);
  const { data: authData } = await sb.auth.getUser();
  if (!authData?.user) return bad('auth required', 401);

  const body = await req.json() as CreatePostBody;
  if (!body.cf_image_id || !body.analysis_text) return bad('missing cf_image_id or analysis_text');

  const { data: userRecord } = await sb.from('users').select('id').eq('auth_id', authData.user.id).maybeSingle();
  if (!userRecord) return bad('user record not found', 404);

  const { data: post, error } = await sb
    .from('public_posts')
    .insert({
      user_id: userRecord.id,
      cf_image_id: body.cf_image_id,
      analysis: body.analysis_text,
      visibility: body.visibility || 'public'
    })
    .select('id')
    .single();

  if (error) {
    console.error('[createPost] Insert error:', error);
    return bad('post creation failed: ' + error.message);
  }

  return json({ success: true, post_url: `/gallery/${post.id}`, post_id: post.id });
}

export async function getPublicPosts(env: Env, req: Request) {
  const sb = supa(env, req.headers.get('authorization')||undefined);

  const { data: posts, error } = await sb
    .from('public_posts')
    .select('id, cf_image_id, analysis, created_at, users!public_posts_user_id_fkey(id), profiles!inner(handle, display_name, avatar_url)')
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[getPublicPosts] Query error:', error);
    return bad('failed to fetch posts: ' + error.message);
  }

  return json({ success: true, posts: posts || [] });
}
