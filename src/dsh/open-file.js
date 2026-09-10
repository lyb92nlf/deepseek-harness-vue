import { openPath } from './rpc.js'

/**
 * Resolve a workspace-relative path into the Host-facing spelling used by openPath.
 * @param {string | undefined} cwd
 * @param {string} path
 */
export function resolveWorkspacePath(cwd, path) {
  if (path.startsWith('/') || /^[A-Za-z]:[/\\]/.test(path) || path.startsWith('\\\\')) return path
  if (cwd === undefined || cwd === '') return path
  const base = cwd.replace(/[/\\]+$/, '')
  const rel = path.replace(/^[/\\]+/, '')
  return `${base}/${rel}`
}

/**
 * Open a path with the Host OS default application. Failures stay silent,
 * matching the official chat row.
 * @param {string} path
 * @param {string | undefined} cwd
 */
export async function openHostFile(path, cwd) {
  if (typeof path !== 'string' || path.trim() === '') return
  try {
    await openPath(resolveWorkspacePath(cwd, path))
  } catch {
    // Host/OS open failures stay silent in the chat row.
  }
}
