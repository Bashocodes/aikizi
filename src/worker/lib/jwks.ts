import type { Env } from '../types';

interface JWK {
  kty: string;
  use?: string;
  kid: string;
  alg: string;
  crv?: string;
  x?: string;
  y?: string;
  n?: string;
  e?: string;
}

interface JWKS {
  keys: JWK[];
}

interface JWTHeader {
  alg: string;
  kid: string;
  typ?: string;
}

interface JWTPayload {
  iss: string;
  sub: string;
  aud?: string | string[];
  exp: number;
  iat: number;
  [key: string]: any;
}

const jwksCache = new Map<string, { jwks: JWKS; expiresAt: number }>();
const CACHE_DURATION_MS = 3600 * 1000;

function base64UrlDecode(input: string): Uint8Array {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '==='.slice((base64.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function fetchJWKS(jwksUrl: string): Promise<JWKS> {
  const cached = jwksCache.get(jwksUrl);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.jwks;
  }

  const response = await fetch(jwksUrl, {
    headers: { 'User-Agent': 'AIKIZI-Worker/1.0' }
  });

  if (!response.ok) {
    throw new Error(`JWKS fetch failed: ${response.status}`);
  }

  const jwks = await response.json() as JWKS;

  jwksCache.set(jwksUrl, {
    jwks,
    expiresAt: Date.now() + CACHE_DURATION_MS
  });

  return jwks;
}

function findKey(jwks: JWKS, kid: string): JWK | undefined {
  return jwks.keys.find(key => key.kid === kid);
}

async function importPublicKey(jwk: JWK): Promise<CryptoKey> {
  if (jwk.kty === 'EC' && jwk.crv === 'P-256') {
    return await crypto.subtle.importKey(
      'jwk',
      {
        kty: jwk.kty,
        crv: jwk.crv,
        x: jwk.x!,
        y: jwk.y!,
        ext: true
      },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
  } else if (jwk.kty === 'RSA') {
    return await crypto.subtle.importKey(
      'jwk',
      {
        kty: jwk.kty,
        n: jwk.n!,
        e: jwk.e!,
        alg: jwk.alg,
        ext: true
      },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
  }

  throw new Error(`Unsupported key type: ${jwk.kty}`);
}

async function verifySignature(
  token: string,
  publicKey: CryptoKey,
  algorithm: string
): Promise<boolean> {
  const [headerB64, payloadB64, signatureB64] = token.split('.');
  const message = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlDecode(signatureB64);

  if (algorithm.startsWith('ES')) {
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      signature,
      message
    );
  } else if (algorithm.startsWith('RS')) {
    return await crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      publicKey,
      signature,
      message
    );
  }

  throw new Error(`Unsupported algorithm: ${algorithm}`);
}

export async function verifyAccessTokenViaJWKS(
  token: string,
  env: Env
): Promise<JWTPayload> {
  if (!token) {
    throw new Error('Token is required');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  let header: JWTHeader;
  let payload: JWTPayload;

  try {
    const headerJson = new TextDecoder().decode(base64UrlDecode(parts[0]));
    header = JSON.parse(headerJson);
  } catch (e) {
    throw new Error('Invalid JWT header');
  }

  try {
    const payloadJson = new TextDecoder().decode(base64UrlDecode(parts[1]));
    payload = JSON.parse(payloadJson);
  } catch (e) {
    throw new Error('Invalid JWT payload');
  }

  if (!env.SUPABASE_JWKS_URL) {
    throw new Error('SUPABASE_JWKS_URL not configured');
  }

  if (!env.SUPABASE_JWT_ISSUER) {
    throw new Error('SUPABASE_JWT_ISSUER not configured');
  }

  if (payload.iss !== env.SUPABASE_JWT_ISSUER) {
    throw new Error(`Invalid issuer: expected ${env.SUPABASE_JWT_ISSUER}, got ${payload.iss}`);
  }

  const now = Date.now();
  const nowSeconds = Math.floor(now / 1000);

  if (payload.exp && payload.exp < nowSeconds) {
    throw new Error('Token expired');
  }

  if (payload.nbf && payload.nbf > nowSeconds) {
    throw new Error('Token not yet valid');
  }

  if (!payload.sub) {
    throw new Error('Token missing sub claim');
  }

  const jwks = await fetchJWKS(env.SUPABASE_JWKS_URL);
  const jwk = findKey(jwks, header.kid);

  if (!jwk) {
    throw new Error(`Key not found: ${header.kid}`);
  }

  const publicKey = await importPublicKey(jwk);
  const isValid = await verifySignature(token, publicKey, header.alg);

  if (!isValid) {
    throw new Error('Invalid signature');
  }

  return payload;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode: number = 401
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export async function verifyTokenSafe(
  token: string,
  env: Env,
  reqId?: string
): Promise<JWTPayload> {
  const logPrefix = reqId ? `[${reqId}] [auth]` : '[auth]';

  try {
    const payload = await verifyAccessTokenViaJWKS(token, env);
    const parts = token.split('.');
    let kid = 'unknown';
    try {
      const headerJson = new TextDecoder().decode(base64UrlDecode(parts[0]));
      const header = JSON.parse(headerJson);
      kid = header.kid || 'unknown';
    } catch (e) {
      // ignore
    }
    console.log(`${logPrefix} authOutcome=OK sub=${payload.sub} kid=${kid} exp=${payload.exp}`);
    return payload;
  } catch (error: any) {
    const parts = token.split('.');
    let kid = 'unknown';
    let sub = 'unknown';
    try {
      const headerJson = new TextDecoder().decode(base64UrlDecode(parts[0]));
      const header = JSON.parse(headerJson);
      kid = header.kid || 'unknown';
      const payloadJson = new TextDecoder().decode(base64UrlDecode(parts[1]));
      const payload = JSON.parse(payloadJson);
      sub = payload.sub || 'unknown';
    } catch (e) {
      // ignore parse errors for logging
    }

    if (error.message.includes('expired')) {
      console.log(`${logPrefix} authOutcome=EXPIRED sub=${sub} kid=${kid}`);
      throw new AuthError('TOKEN_EXPIRED', 419);
    } else if (error.message.includes('not yet valid')) {
      console.log(`${logPrefix} authOutcome=NOT_YET_VALID sub=${sub} kid=${kid}`);
      throw new AuthError('TOKEN_NOT_YET_VALID', 401);
    } else if (error.message.includes('Invalid')) {
      console.log(`${logPrefix} authOutcome=INVALID sub=${sub} kid=${kid}`);
      throw new AuthError('invalid_token', 401);
    } else if (error.message.includes('not configured')) {
      console.log(`${logPrefix} authOutcome=CONFIG_ERROR`);
      throw new AuthError('server_config_error', 500);
    }

    console.log(`${logPrefix} authOutcome=FAILED sub=${sub} kid=${kid} reason=${error.message}`);
    throw new AuthError('auth_failed', 401);
  }
}
