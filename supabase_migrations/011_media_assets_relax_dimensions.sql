/*
  # Relax NOT NULL constraints on media_assets dimensions

  1. Changes
    - Make width, height, bytes columns nullable
    - Allows row creation before browser upload completes
    - Dimensions will be populated via ingest-complete after upload

  2. Rationale
    - Direct upload flow: create row → browser uploads → update dimensions
    - Cannot know dimensions until after Cloudflare processes the upload
    - Prevents 23502 NOT NULL constraint violations

  3. Security
    - No RLS changes
    - Still requires user_id on insert
    - Only owner can update their media assets
*/

ALTER TABLE public.media_assets ALTER COLUMN width DROP NOT NULL;
ALTER TABLE public.media_assets ALTER COLUMN height DROP NOT NULL;
ALTER TABLE public.media_assets ALTER COLUMN bytes DROP NOT NULL;
