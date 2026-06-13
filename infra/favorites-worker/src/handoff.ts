import { signClaims, verifyClaims } from './jwt.js'

// A short-lived, single-purpose token that hands a freshly-authenticated
// identity from the production worker (the only registered Google OAuth
// callback) to the staging worker, which sets its own session cookie on its
// own host. Signed with HANDOFF_SECRET — a dedicated secret shared by prod and
// staging, separate from each worker's session JWT_SECRET — so a leaked session
// cookie can never be replayed as a handoff and vice-versa.
export interface HandoffTicket {
  sub: string
  email: string
  name: string
  picture: string
  // Unique ticket id, used by the consumer to enforce one-time use (a ticket
  // captured from a URL can't be replayed within its TTL).
  jti: string
}

// 60 seconds: long enough to survive the redirect chain, short enough that a
// ticket captured from a URL (logs, browser history) is useless almost
// immediately.
export const HANDOFF_TICKET_TTL_SECONDS = 60

const HANDOFF_AUDIENCE = 'handoff'

// The jti is minted here so callers don't have to; the consumer reads it back
// off the verified ticket to enforce single use.
export async function signHandoffTicket(ticket: Omit<HandoffTicket, 'jti'>, secret: string): Promise<string> {
  return signClaims({ ...ticket, jti: crypto.randomUUID(), aud: HANDOFF_AUDIENCE }, secret, HANDOFF_TICKET_TTL_SECONDS)
}

export async function verifyHandoffTicket(token: string, secret: string): Promise<HandoffTicket | null> {
  const payload = await verifyClaims(token, secret)
  if (!payload || payload.aud !== HANDOFF_AUDIENCE) return null
  const { sub, email, name, picture, jti } = payload
  if (
    typeof sub !== 'string' ||
    typeof email !== 'string' ||
    typeof name !== 'string' ||
    typeof picture !== 'string' ||
    typeof jti !== 'string'
  ) {
    return null
  }
  return { sub, email, name, picture, jti }
}
