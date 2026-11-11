// Where the install script puts the standalone CLI: ~/.dukoi/bin/dukoi, with
// the dashboard and templates beside it in ~/.dukoi. See scripts/build-cli.ts.
import { basename, dirname, join } from 'node:path'

/** A path inside ~/.dukoi when this is the standalone CLI, otherwise null. */
export function installedPath(...parts: string[]): string | null {
  if (!basename(process.execPath).startsWith('dukoi')) return null
  return join(dirname(process.execPath), '..', ...parts)
}
