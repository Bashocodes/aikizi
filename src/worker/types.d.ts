export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_KEY: string;
  SUPABASE_JWKS_URL: string;
  SUPABASE_JWT_ISSUER: string;
  CF_IMAGES_ACCOUNT_ID: string;
  CF_IMAGES_TOKEN: string;
  CORS_ORIGIN: string;
  AI_PROVIDER: string;
  OPENAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
  SREF_ENCRYPTION_KEY: string;
  ADMIN_USER_IDS?: string;
}
