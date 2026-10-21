import { readFileSync } from 'node:fs';

// Returns a skip reason when any of the given repository files is still git-crypt
// ciphertext (public checkouts and public CI have no key); otherwise false.
const HEADER = Buffer.from('\0GITCRYPT\0');

export function lockedSkip(...paths) {
  for (const path of paths) {
    try {
      const bytes = readFileSync(new URL(`../${path}`, import.meta.url));
      if (bytes.subarray(0, HEADER.length).equals(HEADER))
        return `needs the git-crypt key (${path} is encrypted)`;
    } catch {
      // A missing file is a real failure for the test itself to report.
    }
  }
  return false;
}
