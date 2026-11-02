/** A bounded 2D input surface. Coordinates are not calibrated 3D or owner identity. */
export type MiiSurface = { id: string; left: number; top: number; right: number; bottom: number; editable: boolean };
export type MiiPoint = { x: number; y: number; at: number; source: 'pointer' | 'camera' };
export function resolveMiiPoint(point: MiiPoint, surfaces: MiiSurface[], now: number): string | null {
  if (![point.x, point.y, point.at, now].every(Number.isFinite) || point.at > now || now - point.at > 500 ||
      point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1 || surfaces.length > 32) return null;
  const matches = surfaces.filter(s => [s.left,s.top,s.right,s.bottom].every(Number.isFinite) &&
    s.left >= 0 && s.top >= 0 && s.right <= 1 && s.bottom <= 1 && s.left < s.right && s.top < s.bottom &&
    point.x >= s.left && point.x <= s.right && point.y >= s.top && point.y <= s.bottom);
  return matches.length === 1 ? matches[0].id : null;
}
export function miiFingerPoint(hands: unknown, at: number): MiiPoint | null {
  if (!Array.isArray(hands) || hands.length !== 1) return null;
  const points = hands[0]?.landmarks;
  if (!Array.isArray(points) || points.length !== 21 || points.some(p => !p ||
    ![p.x,p.y,p.z].every(Number.isFinite) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) return null;
  // Mirrored camera image: index fingertip is a screen cursor, never a 3D ray.
  return { x: 1 - points[8].x, y: points[8].y, at, source: 'camera' };
}
export function miiReplacement(text: string): string {
  const value = text.trim();
  // Deliberately deterministic: the transcript is visible and editable before any save.
  const quoted = /^これを[「"]([\s\S]+)[」"]に(?:変更|修正)(?:して)?[。.!！]?$/.exec(value);
  const plain = /^これを\s+([\s\S]+?)\s+に(?:変更|修正)(?:して)?[。.!！]?$/.exec(value);
  const replacement = (quoted?.[1] ?? plain?.[1] ?? value).trim();
  if (!replacement || replacement.length > 1000) throw new Error('MII_REPLACEMENT_INVALID');
  return replacement;
}
