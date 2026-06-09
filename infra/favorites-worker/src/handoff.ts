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
}

// 60 seconds: long enough to survive the redirect chain, short enough that a
// ticket captured from a URL (logs, browser history) is useless almost
// immediately.
export const HANDOFF_TICKET_TTL_SECONDS = 60

const HANDOFF_AUDIENCE = 'handoff'

export async function signHandoffTicket(ticket: HandoffTicket, secret: string): Promise<string> {
  return signClaims({ ...ticket, aud: HANDOFF_AUDIENCE }, secret, HANDOFF_TICKET_TTL_SECONDS)
}

export async function verifyHandoffTicket(token: string, secret: string): Promise<HandoffTicket | null> {
  const payload = await verifyClaims(token, secret)
  if (!payload || payload.aud !== HANDOFF_AUDIENCE) return null
  const { sub, email, name, picture } = payload
  if (
    typeof sub !== 'string' ||
    typeof email !== 'string' ||
    typeof name !== 'string' ||
    typeof picture !== 'string'
  ) {
    return null
  }
  return { sub, email, name, picture }
}
