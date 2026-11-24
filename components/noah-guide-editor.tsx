'use client';
import { useEffect, useRef, useState } from 'react';
import { normalizedNoahGuide, NOAH_GUIDE_LIMIT } from '@/lib/noah-author-guide';

export default function NoahGuideEditor({ value, onChange, publication = false }: {
  value: string; onChange: (text: string) => void; publication?: boolean;
}) {
  const [error, setError] = useState('');
  const revision = useRef(0);
  useEffect(() => () => { revision.current++; }, []);
  async function importFile(file: File | undefined) {
    const attempt = ++revision.current;
    setError('');
    if (!file) return;
    try {
      if (!/\.md$/i.test(file.name) || file.size > NOAH_GUIDE_LIMIT * 4) throw new Error('2,000文字以内のMarkdownファイル（.md）を選んでください。');
      const text = normalizedNoahGuide(await file.text());
      if (!text) throw new Error('使い方ガイドは1〜2,000文字で入力してください。');
      if (revision.current === attempt) onChange(text);
    } catch (e) {
      if (revision.current === attempt) setError(e instanceof Error ? e.message : 'ガイドを読み込めませんでした。');
    }
  }
  return <details>
    <summary>使い方ガイド（任意）</summary>
    <label>使い方のMarkdown
      <textarea rows={5} maxLength={NOAH_GUIDE_LIMIT} value={value} onChange={event => {
        revision.current++; setError(''); onChange(event.currentTarget.value);
      }} placeholder={'# 使い方\n1. 用意するもの\n2. 操作と結果'} />
    </label>
    <small>{publication ? '審査を通った動画に、この版のガイドが付きます。' : 'このガイドは自分用に保存します。公開時に使うか選べます。'} 見出し、箇条書き、番号付き手順に対応しています。</small>
    <label>Markdownファイルを読み込む
      <input type="file" accept=".md,text/markdown" onChange={event => {
        const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void importFile(file);
      }} />
    </label>
    {error && <p role="alert">{error}</p>}
  </details>;
}
