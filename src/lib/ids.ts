/**
 * UUID generation. Every primary key in the database is one of these rather
 * than an auto-incrementing number, so that a future sync layer can merge
 * records created offline on two devices without collisions (PLAN.md §4).
 */

/**
 * `crypto.randomUUID` exists in every browser this app targets and in Node 19+,
 * but it is only exposed on secure origins. `crypto.getRandomValues` is
 * available either way, so the fallback covers the app being served over plain
 * HTTP on a LAN address — which is exactly how it gets opened on a phone during
 * development.
 */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  // Set the version (4) and variant bits required by RFC 4122.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
