/**
 * PIN hashing for the on-device app lock. A salted SHA-256 via WebCrypto:
 * enough to keep the PIN unreadable to anyone poking through the phone's
 * IndexedDB, which matches what the lock honestly is — a deterrent, not
 * bank-grade security (BRIEF Part 2 rules out accounts; the product owner
 * chose this middle ground knowingly).
 */

import type { AppLock } from '../db/schema'

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function digestHex(saltHex: string, pin: string): Promise<string> {
  const data = new TextEncoder().encode(`${saltHex}:${pin}`)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return toHex(new Uint8Array(hash))
}

export function isValidPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin)
}

export async function createLock(pin: string, hint: string): Promise<AppLock> {
  if (!isValidPin(pin)) throw new Error('PIN must be 4–8 digits')
  const salt = new Uint8Array(16)
  crypto.getRandomValues(salt)
  const saltHex = toHex(salt)
  return { saltHex, hashHex: await digestHex(saltHex, pin), hint }
}

export async function verifyPin(lock: AppLock, pin: string): Promise<boolean> {
  return (await digestHex(lock.saltHex, pin)) === lock.hashHex
}
