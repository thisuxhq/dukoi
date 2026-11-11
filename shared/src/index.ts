/**
 * What the CLI and the phone's admin API agree on. Bump it only when a change
 * breaks older CLIs or phones; the CLI refuses to talk across a mismatch.
 */
export const PROTOCOL_VERSION = 1

export * from './api.ts'
export * from './archive.ts'
export * from './keys.ts'
export * from './signing.ts'
export { DUKOI_VERSION } from './version.ts'
