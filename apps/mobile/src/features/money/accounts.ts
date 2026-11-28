import type { Account } from './types.ts';

/**
 * Accounts the Lend / Borrow chip offers: open bank and cash accounts. Cards
 * and loans are left out; lending from a credit card is not a P0 case.
 */
export function khataAccounts(accounts: Account[]): Account[] {
  return accounts.filter((a) => !a.archived && a.kind !== 'credit_card');
}

/** The chip's default: the first Cash account, else the first account offered. */
export function defaultKhataAccount(accounts: Account[]): string | null {
  const offered = khataAccounts(accounts);
  return (offered.find((a) => a.kind === 'cash') ?? offered[0])?.id ?? null;
}

/**
 * A random v4 UUID for an entry's client key, so a retry or double tap never
 * saves it twice. Not for secrets: Math.random is enough to avoid collisions
 * between one user's entries.
 */
export function newClientKey(): string {
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
