import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { LIMITS } from './types';

const scryptAsync = promisify(crypto.scrypt);
const SESSION_COOKIE_NAME = 'lexicard_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

declare global {
  var _lexicardFallbackAuthSecret: string | undefined;
}

function getAuthSecret(): string {
  const configured = process.env.AUTH_SECRET?.trim();
  if (configured && configured.length >= 16) {
    return configured;
  }
  const dbUrl =
    process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim();
  if (dbUrl) {
    return crypto
      .createHash('sha256')
      .update(`lexicard_session_key:${dbUrl}`)
      .digest('hex');
  }
  if (!globalThis._lexicardFallbackAuthSecret) {
    globalThis._lexicardFallbackAuthSecret = crypto
      .randomBytes(32)
      .toString('hex');
  }
  return globalThis._lexicardFallbackAuthSecret;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const expectedBuffer = Buffer.from(keyHex, 'hex');
  const derivedBuffer = (await scryptAsync(password, salt, 64)) as Buffer;
  if (expectedBuffer.length !== derivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, derivedBuffer);
}

interface SessionPayload {
  uid: string;
  exp: number;
}

export function createSessionToken(userId: string): string {
  const payload: SessionPayload = {
    uid: userId,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url'
  );
  const sig = crypto
    .createHmac('sha256', getAuthSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', getAuthSecret())
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    ) as SessionPayload;
    if (!parsed.uid || typeof parsed.exp !== 'number') return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function getAuthenticatedUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;
  const payload = verifySessionToken(raw);
  return payload ? payload.uid : null;
}

export async function setSessionCookie(userId: string): Promise<void> {
  const token = createSessionToken(userId);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}

export function validateUsername(raw: string): {
  ok: boolean;
  normalized: string;
  original: string;
  error?: string;
} {
  const original = raw.trim();
  const normalized = original.toLowerCase();
  if (
    normalized.length < LIMITS.USERNAME_MIN ||
    normalized.length > LIMITS.USERNAME_MAX
  ) {
    return {
      ok: false,
      normalized,
      original,
      error: `Tên đăng nhập phải từ ${LIMITS.USERNAME_MIN} đến ${LIMITS.USERNAME_MAX} ký tự.`,
    };
  }
  if (!/^[a-z0-9_.-]+$/.test(normalized)) {
    return {
      ok: false,
      normalized,
      original,
      error:
        'Tên đăng nhập chỉ gồm chữ cái không dấu, số, dấu gạch dưới (_), chấm (.) hoặc gạch ngang (-).',
    };
  }
  return { ok: true, normalized, original };
}

export function validatePassword(raw: string): {
  ok: boolean;
  error?: string;
} {
  if (raw.length < LIMITS.PASSWORD_MIN || raw.length > LIMITS.PASSWORD_MAX) {
    return {
      ok: false,
      error: `Mật khẩu phải từ ${LIMITS.PASSWORD_MIN} đến ${LIMITS.PASSWORD_MAX} ký tự.`,
    };
  }
  return { ok: true };
}
