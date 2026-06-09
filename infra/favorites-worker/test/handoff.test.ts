import { describe, it, expect } from 'vitest'
import { signHandoffTicket, verifyHandoffTicket } from '../src/handoff.js'
import { signClaims } from '../src/jwt.js'

const SECRET = 'test-handoff-secret'
const TICKET = { sub: 'user:google:123', email: 'a@b.com', name: 'Ada', picture: 'https://img/x.png' }

describe('handoff ticket', () => {
  it('round-trips a valid ticket', async () => {
    const token = await signHandoffTicket(TICKET, SECRET)
    const verified = await verifyHandoffTicket(token, SECRET)
    expect(verified).toEqual(TICKET)
  })

  it('rejects a ticket signed with a different secret', async () => {
    const token = await signHandoffTicket(TICKET, SECRET)
    expect(await verifyHandoffTicket(token, 'wrong-secret')).toBeNull()
  })

  it('rejects an expired ticket', async () => {
    // Sign a ticket that is already expired via the low-level signer.
    const token = await signClaims({ ...TICKET, aud: 'handoff' }, SECRET, -1)
    expect(await verifyHandoffTicket(token, SECRET)).toBeNull()
  })

  it('rejects a token without the handoff audience (e.g. a session JWT)', async () => {
    const token = await signClaims({ ...TICKET }, SECRET, 60)
    expect(await verifyHandoffTicket(token, SECRET)).toBeNull()
  })

  it('rejects a token with the wrong audience', async () => {
    const token = await signClaims({ ...TICKET, aud: 'session' }, SECRET, 60)
    expect(await verifyHandoffTicket(token, SECRET)).toBeNull()
  })

  it('rejects a ticket missing required identity claims', async () => {
    const token = await signClaims({ sub: 'user:google:123', aud: 'handoff' }, SECRET, 60)
    expect(await verifyHandoffTicket(token, SECRET)).toBeNull()
  })

  it('rejects a malformed token', async () => {
    expect(await verifyHandoffTicket('not-a-jwt', SECRET)).toBeNull()
  })
})
