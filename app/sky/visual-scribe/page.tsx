import ConversationDiagramWorkspace from '@/components/conversation-diagram-workspace';

export const metadata = {
  title: '会話図解 · Visual Scribe · Sky',
  description: '会話や文字起こしを、ブラウザ内で段落ごとのフロー図へ自動変換する。',
};

export default function VisualScribePage() {
  return <ConversationDiagramWorkspace />;
}
