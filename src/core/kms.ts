import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { Hex } from './types';

export interface KvStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

/**
 * Demo stand-in for a KMS/HSM. The private key is never returned, logged or placed in app state;
 * callers only get a public address and a sign() capability. In production this is a real KMS.
 */
export class DemoKms {
  private mem = new Map<string, Hex>();
  constructor(private store?: KvStore) {}

  createKey(): Hex {
    const pk = generatePrivateKey();
    const acct = privateKeyToAccount(pk);
    this.mem.set(acct.address.toLowerCase(), pk);
    try {
      this.store?.setItem(`kms:${acct.address.toLowerCase()}`, pk);
    } catch {
      /* storage unavailable */
    }
    return acct.address;
  }

  has(address: string): boolean {
    return this.load(address) !== null;
  }

  private load(address: string): Hex | null {
    const a = address.toLowerCase();
    const hit = this.mem.get(a);
    if (hit) return hit;
    try {
      const s = this.store?.getItem(`kms:${a}`);
      if (s) {
        this.mem.set(a, s as Hex);
        return s as Hex;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  async signHash(address: string, hash: Hex): Promise<Hex> {
    const pk = this.load(address);
    if (!pk) throw new Error('KMS: key not found (session key must be re-granted)');
    return privateKeyToAccount(pk).signMessage({ message: { raw: hash } });
  }

  async signText(address: string, message: string): Promise<Hex> {
    const pk = this.load(address);
    if (!pk) throw new Error('KMS: key not found');
    return privateKeyToAccount(pk).signMessage({ message });
  }

  destroy(address: string) {
    const a = address.toLowerCase();
    this.mem.delete(a);
    try {
      this.store?.removeItem(`kms:${a}`);
    } catch {
      /* ignore */
    }
  }
}
