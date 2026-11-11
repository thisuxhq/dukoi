// Ed25519 keys, signatures and the pairing code.
//
// Every computer and every phone has one Ed25519 key pair. Public keys travel
// as base64url of the raw 32 bytes. Private keys are stored as PKCS#8 PEM.
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
  sign,
  verify,
} from 'node:crypto'

export interface KeyPair {
  /** base64url of the raw 32-byte public key */
  publicKey: string
  /** PKCS#8 PEM */
  privateKeyPem: string
}

// SPKI prefix for an Ed25519 public key: the raw 32 bytes follow it.
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

export function generateKeyPair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  return {
    publicKey: rawPublicKey(publicKey),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  }
}

export function publicKeyFromPrivate(privateKeyPem: string): string {
  return rawPublicKey(createPublicKey(createPrivateKey(privateKeyPem)))
}

function rawPublicKey(key: KeyObject): string {
  const der = key.export({ type: 'spki', format: 'der' })
  return der.subarray(ED25519_SPKI_PREFIX.length).toString('base64url')
}

function publicKeyObject(publicKey: string): KeyObject {
  const raw = Buffer.from(publicKey, 'base64url')
  if (raw.length !== 32) throw new Error('A public key must be 32 bytes')
  return createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
    format: 'der',
    type: 'spki',
  })
}

export function signText(privateKeyPem: string, text: string): string {
  return sign(null, Buffer.from(text), privateKeyPem).toString('base64url')
}

export function verifyText(publicKey: string, text: string, signature: string): boolean {
  try {
    return verify(
      null,
      Buffer.from(text),
      publicKeyObject(publicKey),
      Buffer.from(signature, 'base64url'),
    )
  } catch {
    return false
  }
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

/**
 * The 6-digit code both screens show while pairing. Both sides compute it from
 * the two public keys, so matching codes mean nobody swapped a key in between.
 */
export function pairingCode(computerKey: string, phoneKey: string): string {
  const digest = createHash('sha256').update(`${computerKey}:${phoneKey}`).digest()
  const n = digest.readUInt32BE(0) % 1_000_000
  return n.toString().padStart(6, '0')
}

/** "482913" → "482 913", easier to compare at a glance. */
export function formatPairingCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`
}
