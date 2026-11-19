import { verifyZoomAppContextHeader, type VerifiedZoomLaunch } from './zoom-app-context.server.ts';

/** Presentation status only. Never carry Zoom uid, meeting identifiers or secrets to the client. */
export type ZoomLaunchPresentation =
  | { status: 'browser-demo' | 'secret-unconfigured' | 'invalid-context' }
  | { status: 'verified-context'; contextType: VerifiedZoomLaunch['type'] };

/** Home URL reads the Zoom header on the server; Sky owner linkage remains a separate gate. */
export async function inspectZoomHomeLaunch(
  header: string | null,
  clientSecret: string | undefined,
  nowMs = Date.now(),
): Promise<ZoomLaunchPresentation> {
  if (!header) return { status: 'browser-demo' };
  if (!clientSecret) return { status: 'secret-unconfigured' };
  try {
    const launch = await verifyZoomAppContextHeader(header, clientSecret, nowMs);
    return { status: 'verified-context', contextType: launch.type };
  } catch {
    return { status: 'invalid-context' };
  }
}
