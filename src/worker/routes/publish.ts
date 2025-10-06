import { json, bad } from '../lib/json';
import { supa } from '../lib/supa';
import { requireUser } from '../lib/auth';
import type { Env } from '../types';

type LegacyPublishBody = {
  title: string;
  slug: string;
  image_id: string;
  style_triplet: string;
  subjects: string[];
  tokens: string[];
  prompt_short?: string;
  model_used?: string;
  seo_snippet?: string;
};

type CreatePostPayload = {
  analysis_text: string;
  title?: string | null;
  slug?: string | null;
  cf_image_id?: string | null;
  style_triplet?: string;
  subjects?: string[];
  tags?: string[];
  prompt_short?: string;
  model_used?: string;
};

interface AnalysisData {
  styleCodes?: string[];
  tags?: string[];
  subjects?: string[];
  story?: string;
  [key: string]: any;
}

function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[•]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 50);

  const suffix = Math.random().toString(36).substring(2, 8);
  return `${base}-${suffix}`;
}

async function uploadImageToCloudflare(
  env: Env,
  imageBlob: Blob,
  logPrefix: string
): Promise<{ cf_image_id: string; width: number; height: number; bytes: number }> {
  console.log(`${logPrefix} Uploading image to Cloudflare`);

  const formData = new FormData();
  formData.append('file', imageBlob);

  const uploadUrl = `https://api.cloudflare.com/client/v4/accounts/${env.CF_IMAGES_ACCOUNT_ID}/images/v1`;
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.CF_IMAGES_TOKEN}`
    },
    body: formData
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    console.error(`${logPrefix} Cloudflare upload failed:`, errorText);
    throw new Error('image_upload_failed');
  }

  const uploadResult = await uploadResponse.json() as any;

  if (!uploadResult.success || !uploadResult.result) {
    console.error(`${logPrefix} Invalid upload response:`, uploadResult);
    throw new Error('image_upload_failed');
  }

  const { id, variants } = uploadResult.result;
  const publicVariant = variants?.find((v: any) => v.includes('/public')) || variants?.[0];

  console.log(`${logPrefix} Upload successful cf_image_id=${id}`);

  return {
    cf_image_id: id,
    width: 0,
    height: 0,
    bytes: 0
  };
}

export async function publish(env: Env, req: Request) {
  let authResult;
  try {
    authResult = await requireUser(env, req);
  } catch (error) {
    if (error instanceof Response) return error;
    return bad('auth_required', 401);
  }

  const sb = supa(env, authResult.token);
  const body = await req.json() as LegacyPublishBody;
  if (!body.title || !body.slug || !body.image_id || !body.style_triplet) {
    return bad('missing fields');
  }

  const { data: post, error } = await sb
    .from('posts')
    .insert({
      title: body.title,
      slug: body.slug,
      image_id: body.image_id,
      visibility: 'public',
      status: 'published'
    })
    .select('id')
    .single();

  if (error) return bad('post insert failed');

  await sb.from('post_styles').insert({
    post_id: post.id,
    style_triplet: body.style_triplet
  });

  if (body.subjects?.length) {
    await sb.from('post_subjects').insert(
      body.subjects.map(s => ({ post_id: post.id, subject_slug: s }))
    );
  }

  if (body.tokens?.length) {
    await sb.from('post_tags').insert(
      body.tokens.map(t => ({ post_id: post.id, tag: t }))
    );
  }

  await sb.from('post_meta').insert({
    post_id: post.id,
    prompt_short: body.prompt_short || '',
    model_used: body.model_used || '',
    alt_text: body.title
  });

  return json({ ok: true, post_id: post.id });
}

export async function createPost(env: Env, req: Request, reqId?: string) {
  const logPrefix = reqId ? `[${reqId}] [createPost]` : '[createPost]';

  let authResult;
  try {
    authResult = await requireUser(env, req, reqId);
  } catch (error) {
    if (error instanceof Response) return error;
    return bad('auth_required', 401);
  }

  const contentType = req.headers.get('content-type') || '';
  let payload: CreatePostPayload;
  let imageBlob: Blob | null = null;

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData();
    const analysisText = formData.get('analysis_text') as string;
    const title = formData.get('title') as string | null;
    const slug = formData.get('slug') as string | null;
    const cfImageId = formData.get('cf_image_id') as string | null;
    const imageFile = formData.get('image_blob') as File | null;

    if (!analysisText) {
      console.log(`${logPrefix} Missing analysis_text in FormData`);
      return bad('bad_request');
    }

    payload = {
      analysis_text: analysisText,
      title,
      slug,
      cf_image_id: cfImageId
    };

    if (imageFile) {
      imageBlob = imageFile;
    }
  } else {
    payload = await req.json() as CreatePostPayload;
  }

  if (!payload.analysis_text) {
    console.log(`${logPrefix} Missing analysis_text`);
    return bad('bad_request');
  }

  const sb = supa(env, authResult.token);
  console.log(`${logPrefix} userId=${authResult.user.id} authJwt=true`);

  const { data: userRecord } = await sb
    .from('users')
    .select('id')
    .eq('auth_id', authResult.user.id)
    .maybeSingle();

  if (!userRecord) {
    console.log(`${logPrefix} User record not found for auth_id=${authResult.user.id}`);
    return bad('user_record_not_found', 404);
  }

  let analysisData: AnalysisData = {};
  try {
    analysisData = JSON.parse(payload.analysis_text);
  } catch (e) {
    console.log(`${logPrefix} Failed to parse analysis_text, treating as plain string`);
  }

  const derivedTitle = payload.title ||
    analysisData.styleCodes?.[0] ||
    analysisData.subjects?.[0] ||
    'Decoded Style';

  const derivedSlug = payload.slug || generateSlug(derivedTitle);

  let mediaAssetId: string | null = null;

  if (!payload.cf_image_id && imageBlob) {
    try {
      const uploadResult = await uploadImageToCloudflare(env, imageBlob, logPrefix);

      const { data: mediaAsset, error: mediaError } = await sb
        .from('media_assets')
        .insert({
          provider: 'cloudflare',
          public_id: uploadResult.cf_image_id,
          width: uploadResult.width || 1024,
          height: uploadResult.height || 1024,
          bytes: uploadResult.bytes || 0,
          variants: { public: `https://imagedelivery.net/${env.CF_IMAGES_ACCOUNT_HASH}/${uploadResult.cf_image_id}/public` }
        })
        .select('id')
        .single();

      if (mediaError || !mediaAsset) {
        console.error(`${logPrefix} Media asset insert failed:`, mediaError);
        return bad('media_asset_creation_failed');
      }

      mediaAssetId = mediaAsset.id;
      console.log(`${logPrefix} media_id=${mediaAssetId}`);
    } catch (error: any) {
      console.error(`${logPrefix} Image upload error:`, error.message);
      return bad('image_upload_failed');
    }
  } else if (payload.cf_image_id) {
    const { data: existingAsset } = await sb
      .from('media_assets')
      .select('id')
      .eq('public_id', payload.cf_image_id)
      .maybeSingle();

    if (existingAsset) {
      mediaAssetId = existingAsset.id;
      console.log(`${logPrefix} Using existing media_id=${mediaAssetId}`);
    } else {
      const { data: mediaAsset, error: mediaError } = await sb
        .from('media_assets')
        .insert({
          provider: 'cloudflare',
          public_id: payload.cf_image_id,
          width: 1024,
          height: 1024,
          bytes: 0,
          variants: { public: `https://imagedelivery.net/${env.CF_IMAGES_ACCOUNT_HASH}/${payload.cf_image_id}/public` }
        })
        .select('id')
        .single();

      if (mediaError || !mediaAsset) {
        console.error(`${logPrefix} Media asset insert failed:`, mediaError);
        return bad('media_asset_creation_failed');
      }

      mediaAssetId = mediaAsset.id;
      console.log(`${logPrefix} media_id=${mediaAssetId}`);
    }
  } else {
    console.log(`${logPrefix} No image provided (cf_image_id or image_blob)`);
    return bad('image_required');
  }

  const { data: post, error: postError } = await sb
    .from('posts')
    .insert({
      owner_id: userRecord.id,
      title: derivedTitle,
      slug: derivedSlug,
      image_id: mediaAssetId,
      visibility: 'public',
      status: 'published'
    })
    .select('id, slug')
    .single();

  if (postError) {
    console.error(`${logPrefix} Post insert error:`, postError);
    return bad('post_creation_failed');
  }

  console.log(`${logPrefix} post_id=${post.id} slug=${post.slug}`);

  await sb.from('post_meta').insert({
    post_id: post.id,
    prompt_short: payload.prompt_short || analysisData.story || '',
    model_used: payload.model_used || '',
    alt_text: derivedTitle
  });

  if (payload.style_triplet || analysisData.styleCodes?.length) {
    const styleTriplet = payload.style_triplet || analysisData.styleCodes?.join(' • ') || '';
    if (styleTriplet) {
      await sb.from('post_styles').insert({
        post_id: post.id,
        style_triplet: styleTriplet
      });
    }
  }

  if (payload.subjects?.length || analysisData.subjects?.length) {
    const subjects = payload.subjects || analysisData.subjects || [];
    if (subjects.length > 0) {
      await sb.from('post_subjects').insert(
        subjects.map(s => ({ post_id: post.id, subject_slug: s }))
      );
    }
  }

  if (payload.tags?.length || analysisData.tags?.length) {
    const tags = payload.tags || analysisData.tags || [];
    if (tags.length > 0) {
      await sb.from('post_tags').insert(
        tags.map(t => ({ post_id: post.id, tag: t }))
      );
    }
  }

  return json({
    ok: true,
    post_id: post.id,
    slug: post.slug,
    url: `/p/${post.id}-${post.slug}`
  });
}

export async function savePost(env: Env, req: Request, reqId?: string) {
  const logPrefix = reqId ? `[${reqId}] [savePost]` : '[savePost]';

  let authResult;
  try {
    authResult = await requireUser(env, req, reqId);
  } catch (error) {
    if (error instanceof Response) return error;
    return bad('auth_required', 401);
  }

  const payload = await req.json() as CreatePostPayload;

  if (!payload.analysis_text) {
    console.log(`${logPrefix} Missing analysis_text`);
    return bad('bad_request');
  }

  const sb = supa(env, authResult.token);

  const { data: userRecord } = await sb
    .from('users')
    .select('id')
    .eq('auth_id', authResult.user.id)
    .maybeSingle();

  if (!userRecord) {
    return bad('user_record_not_found', 404);
  }

  let analysisData: AnalysisData = {};
  try {
    analysisData = JSON.parse(payload.analysis_text);
  } catch (e) {
    console.log(`${logPrefix} Failed to parse analysis_text`);
  }

  const derivedTitle = payload.title || analysisData.styleCodes?.[0] || 'Draft';
  const derivedSlug = payload.slug || generateSlug(derivedTitle);

  let mediaAssetId: string | null = null;

  if (payload.cf_image_id) {
    const { data: existingAsset } = await sb
      .from('media_assets')
      .select('id')
      .eq('public_id', payload.cf_image_id)
      .maybeSingle();

    mediaAssetId = existingAsset?.id || null;
  }

  const { data: post, error: postError } = await sb
    .from('posts')
    .insert({
      owner_id: userRecord.id,
      title: derivedTitle,
      slug: derivedSlug,
      image_id: mediaAssetId,
      visibility: 'private',
      status: 'draft'
    })
    .select('id, slug')
    .single();

  if (postError) {
    console.error(`${logPrefix} Post insert error:`, postError);
    return bad('post_creation_failed');
  }

  console.log(`${logPrefix} draft post_id=${post.id}`);

  return json({
    ok: true,
    post_id: post.id,
    slug: post.slug,
    url: `/p/${post.id}-${post.slug}`
  });
}

export async function getPublicPosts(env: Env, req: Request) {
  const sb = supa(env, req.headers.get('authorization') || undefined);

  const { data: posts, error } = await sb
    .from('posts')
    .select(`
      id,
      title,
      slug,
      created_at,
      media_assets!posts_image_id_fkey (
        variants,
        public_id
      ),
      post_styles!post_styles_post_id_fkey (
        style_triplet,
        artist_oneword
      ),
      users!posts_owner_id_fkey (
        id
      ),
      profiles:users!posts_owner_id_fkey (
        handle,
        display_name,
        avatar_url
      )
    `)
    .eq('visibility', 'public')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[getPublicPosts] Query error:', error);
    return bad('failed to fetch posts: ' + error.message);
  }

  return json({ success: true, posts: posts || [] });
}
