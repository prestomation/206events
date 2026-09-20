/**
 * Seal the four platform API keys to the managed fleet's public key.
 *
 * Run by `.github/workflows/secret-export.yml`. Read that file first — it
 * explains why this transfer exists and how the two ends meet.
 *
 * The envelope format is the specification in `sealEnvelope`
 * (`tools/cli/src/secret-transfer.ts` in prestomation/mycity.events). RSA-OAEP
 * alone carries about 190 bytes, so a one-time AES-256-GCM key seals the
 * payload and RSA seals that key. Keep the two sides in step.
 *
 * This script never prints a secret value. It prints the envelope and the
 * first 8 characters of the SHA-256 of each value, which is what proves the
 * value that lands is the value that left.
 */

import { createCipheriv, createHash, constants, publicEncrypt, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

const KEYS = [
    'TICKETMASTER_API_KEY',
    'EVENTBRITE_TOKEN',
    'DICE_API_KEY',
    'CANDLELIGHT_ALGOLIA_API_KEY',
];

const PUBLIC_KEY_PATH = '.github/secret-transfer-pubkey.pem';

const publicKeyPem = readFileSync(PUBLIC_KEY_PATH, 'utf8').trim();
if (!publicKeyPem.includes('BEGIN PUBLIC KEY')) {
    console.error(`${PUBLIC_KEY_PATH} does not hold a PEM public key — paste the one the keygen round printed.`);
    process.exit(1);
}

const payload = {};
const missing = [];
for (const name of KEYS) {
    const value = process.env[name];
    if (!value) {
        missing.push(name);
        continue;
    }
    payload[name] = value;
}
if (missing.length > 0) {
    console.error(`these repository secrets are empty or absent: ${missing.join(', ')}`);
    process.exit(1);
}

const plaintext = JSON.stringify(payload);
const key = randomBytes(32);
const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', key, iv);
const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

const envelope = {
    v: 1,
    alg: 'RSA-OAEP-SHA256+A256GCM',
    ek: publicEncrypt(
        { key: publicKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
        key,
    ).toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ct: ct.toString('base64'),
};

const shortHash = (value) => createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 8);

const lines = [
    '## Sealed envelope',
    '',
    'Pass this ONE line to the fleet as `aws_args`, with `filter: import`.',
    '',
    '```',
    Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64'),
    '```',
    '',
    '## Proof',
    '',
    '| key | sha256[0:8] |',
    '|---|---|',
    ...KEYS.map((name) => `| \`${name}\` | \`${shortHash(payload[name])}\` |`),
    '',
    'The import run prints the same table. Every hash must match.',
];
console.log(lines.join('\n'));
