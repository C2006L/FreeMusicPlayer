const DEFAULT_API_PORT = 18080
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1'])

const pageHost = () => (typeof window !== 'undefined' ? window.location.hostname : '')
const isLoopback = (host: string) => !host || LOOPBACK_HOSTS.has(host)

/**
 * Resolve the backend base URL.
 * - `VITE_APP_BASE_API` wins when it points at a non-loopback host.
 * - A configured `localhost` address is rewritten to the current page host when
 *   the page itself is opened from another device (phone/tablet on the LAN),
 *   so the default localhost development setup keeps working unchanged.
 * - Missing configuration falls back to the current host plus the default port.
 */
export const resolveApiBase = (configured?: string): string => {
  const raw = String(configured ?? import.meta.env.VITE_APP_BASE_API ?? '').trim().replace(/\/+$/, '')
  if (!raw) {
    const host = pageHost() || 'localhost'
    const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:'
    return `${protocol}//${host}:${DEFAULT_API_PORT}`
  }
  const host = pageHost()
  if (isLoopback(host)) return raw
  try {
    const url = new URL(raw)
    if (isLoopback(url.hostname)) {
      url.hostname = host
      return url.toString().replace(/\/+$/, '')
    }
  } catch {
    // Relative or malformed configuration: keep it unchanged.
  }
  return raw
}

/** Rewrite absolute loopback media URLs returned by the backend for LAN access. */
export const resolveResourceUrl = (value?: string): string => {
  const raw = String(value || '')
  if (!raw || !/^https?:\/\//i.test(raw)) return raw
  const host = pageHost()
  if (isLoopback(host)) return raw
  try {
    const url = new URL(raw)
    if (isLoopback(url.hostname)) {
      url.hostname = host
      return url.toString()
    }
  } catch {
    // Keep the original value.
  }
  return raw
}
