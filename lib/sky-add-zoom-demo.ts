import type { SkyAddDiscoveryContract } from './sky-add-host-contract';

export const ZOOM_DEMO_CAPABILITY = {
  id: 'sky.zoom.meeting-notes.preview/1',
  name: '会議メモから決定事項を整理',
  description: '入力したメモから決定事項と担当を抜き出して、このパネルへ返します。',
  dataScope: 'この画面へ本人が入力したテキストのみ',
  output: '決定事項と担当の一覧',
  price: '試作画面では課金なし',
} as const;

export const ZOOM_DEMO_DISCOVERY: SkyAddDiscoveryContract = {
  agentId: ZOOM_DEMO_CAPABILITY.id,
  fits: [
    { surface: 'browser.preview', inputSource: 'manual.text', returnSlot: 'embedded.private' },
    { surface: 'zoom.meeting.panel', inputSource: 'manual.text', returnSlot: 'embedded.private' },
    { surface: 'zoom.chat.shortcut', inputSource: 'manual.text', returnSlot: 'embedded.private' },
    { surface: 'zoom.client.panel', inputSource: 'manual.text', returnSlot: 'embedded.private' },
  ],
};

const matchingWords = /会議|議事|メモ|決定|担当|todo|to.do|action|summary|要約|タスク/i;

export function matchesZoomDemoCapability(intent: string): boolean {
  return matchingWords.test(intent.trim());
}

export type ZoomDemoResult = {
  summary: string;
  decisions: string[];
  owners: string[];
};

export function organizeMeetingNotes(notes: string): ZoomDemoResult {
  const lines = notes
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 80);
  const decisions = lines
    .filter((line) => /^(?:決定|決定事項|decision)\s*[:：]/i.test(line))
    .map((line) => line.replace(/^[^:：]+[:：]\s*/, ''));
  const owners = lines
    .filter((line) => /^(?:担当|owner|action|todo|to.do)\s*[:：]/i.test(line))
    .map((line) => line.replace(/^[^:：]+[:：]\s*/, ''));
  return {
    summary: lines.slice(0, 3).join(' / ') || '内容がありません。',
    decisions,
    owners,
  };
}
