/** Discovery metadata only. Host identity, user grants and execution are checked elsewhere. */
export type SkyAddSurface =
  | 'browser.preview'
  | 'macos.zoom.chat'
  | 'zoom.meeting.panel'
  | 'zoom.chat.shortcut'
  | 'zoom.client.panel'
  | 'zoom.unsupported'
  | 'slack.message.shortcut'
  | 'slack.global.shortcut'
  | 'teams.message.action'
  | 'teams.meeting.panel';

export type SkyAddInputSource = 'manual.text' | 'host.visible-chat' | 'host.selected-message' | 'host.meeting-transcript';
export type SkyAddReturnSlot = 'embedded.private' | 'host.chat-draft' | 'host.chat-message';

export type SkyAddHostFit = {
  surface: SkyAddSurface;
  inputSource: SkyAddInputSource;
  returnSlot: SkyAddReturnSlot;
};

export type SkyAddDiscoveryContract = {
  agentId: string;
  fits: readonly SkyAddHostFit[];
};

export function matchesSkyAddHostFit(contract: SkyAddDiscoveryContract, request: SkyAddHostFit): boolean {
  return contract.fits.some((fit) =>
    fit.surface === request.surface
    && fit.inputSource === request.inputSource
    && fit.returnSlot === request.returnSlot);
}
