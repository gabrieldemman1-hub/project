/**
 * Sortable-ish unique ids. Time prefix so rows sort roughly by creation, random
 * suffix so two writes in the same millisecond cannot collide.
 */
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

function randomPart(len: number): string {
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length]
  return out
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${randomPart(8)}`
}
