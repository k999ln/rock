import type { ZoomDemoResult } from './sky-add-zoom-demo.ts';

/** Content schema for a private same-panel result. Job and owner proof live outside this payload. */
export type SkyZoomMeetingNotesArtifact = ZoomDemoResult & {
  schema: 'sky.zoom.meeting-notes/1';
  inputSource: 'manual.text';
  returnSlot: 'embedded.private';
};

const safeText = (value: unknown, maximum: number) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;

export function parseSkyZoomMeetingNotesArtifact(text: string): SkyZoomMeetingNotesArtifact | null {
  if (text.length > 20_000) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return null; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const value = parsed as Partial<SkyZoomMeetingNotesArtifact>;
  if (value.schema !== 'sky.zoom.meeting-notes/1' || value.inputSource !== 'manual.text'
    || value.returnSlot !== 'embedded.private' || !safeText(value.summary, 6000)
    || !Array.isArray(value.decisions) || value.decisions.length > 80
    || !value.decisions.every((item) => safeText(item, 6000))
    || !Array.isArray(value.owners) || value.owners.length > 80
    || !value.owners.every((item) => safeText(item, 6000))) return null;
  return value as SkyZoomMeetingNotesArtifact;
}

/** Local deterministic demo only; this does not save a Eve artifact or prove an Agent ran. */
export function createSkyZoomDemoArtifact(result: ZoomDemoResult): SkyZoomMeetingNotesArtifact {
  const candidate = {
    schema: 'sky.zoom.meeting-notes/1',
    inputSource: 'manual.text',
    returnSlot: 'embedded.private',
    summary: result.summary,
    decisions: result.decisions,
    owners: result.owners,
  } as const;
  const parsed = parseSkyZoomMeetingNotesArtifact(JSON.stringify(candidate));
  if (!parsed) throw new Error('ZOOM_DEMO_ARTIFACT_INVALID');
  return parsed;
}
