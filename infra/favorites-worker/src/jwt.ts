import type { JWTPayload } from './types.js'

function base64UrlEncode(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4)
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, c => c.charCodeAt(0))
}

async function getKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  return crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  )
}

// Low-level HS256 sign/verify over an arbitrary claims object. `exp` is added
// automatically and enforced on verify. Both signJWT (session) and the handoff
// ticket build on this so there is a single crypto implementation to audit.
export async function signClaims(
  claims: Record<string, unknown>,
  secret: string,
  expiresInSeconds: number,
): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const fullPayload = { ...claims, exp: now + expiresInSeconds }

  const enc = new TextEncoder()
  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify(header)))
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(fullPayload)))
  const signingInput = `${headerB64}.${payloadB64}`

  const key = await getKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(signingInput))
  const sigB64 = base64UrlEncode(new Uint8Array(sig))

  return `${signingInput}.${sigB64}`
}

export async function verifyClaims(
  token: string,
  secret: string,
): Promise<Record<string, unknown> | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [headerB64, payloadB64, sigB64] = parts
    const signingInput = `${headerB64}.${payloadB64}`
    const enc = new TextEncoder()

    const key = await getKey(secret)
    const sig = base64UrlDecode(sigB64)
    const valid = await crypto.subtle.verify('HMAC', key, sig, enc.encode(signingInput))
    if (!valid) return null

    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64))) as Record<string, unknown>
    const now = Math.floor(Date.now() / 1000)
    if (typeof payload.exp !== 'number' || payload.exp <= now) return null

    return payload
  } catch {
    return null
  }
}

export async function signJWT(payload: Omit<JWTPayload, 'exp'>, secret: string, expiresInSeconds: number): Promise<string> {
  return signClaims({ ...payload }, secret, expiresInSeconds)
}

export async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  const payload = await verifyClaims(token, secret)
  if (!payload || typeof payload.sub !== 'string') return null
  return { sub: payload.sub, exp: payload.exp as number }
}
