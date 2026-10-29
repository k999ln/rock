import { describeMiiPreviewRead as describe } from '../../../lib/mii-preview-descriptors';

/** Isolated browser fixture: shorten the supplied output declaration on demand. */
export function describeMiiPreviewRead() {
  const declarations = describe();
  const ttl = (window as Window & { __fixtureMiiTtl?: number }).__fixtureMiiTtl;
  if (ttl !== undefined) declarations.output.expiresAt = declarations.output.observedAt + ttl;
  return declarations;
}
