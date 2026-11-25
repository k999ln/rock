import { looksLikeNoahSecret } from './noah-connect-requirements.ts';
import { parseNoahPin, type NoahPin } from './noah-pin-scene.ts';

export const NOAH_PIN_JSON_BYTES = 2048;
export const NOAH_PIN_SKIP_REASONS = ['unclear', 'no_template', 'not_for_people', 'invalid'] as const;
export const NOAH_PIN_COLUMNS = ['pin_json', 'pin_source_sha256', 'pin_model', 'pin_at', 'pin_skip'] as const;

const encoder = new TextEncoder();

export function parseNoahPinForStorage(value: unknown): NoahPin | null {
  const { pin } = parseNoahPin(value);
  if (!pin || [pin.title, pin.give, pin.get, ...pin.scene.labels].some(looksLikeNoahSecret)) return null;
  return pin;
}

export function parseStoredNoahPin(json: unknown): NoahPin | null {
  if (typeof json !== 'string' || encoder.encode(json).byteLength > NOAH_PIN_JSON_BYTES) return null;
  try {
    return parseNoahPinForStorage(JSON.parse(json));
  } catch {
    return null;
  }
}
