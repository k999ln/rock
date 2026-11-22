'use client';
/**
 * 棚のカードから詳細を開いた事を、1 回だけ数える（/noah/ready/agent?from=<カードの ID>&pos=<位置>）。数えるのは、日・カード・位置の区分の数と、
 * 履歴の利用に同意した本人の、そのカードの回数だけ。切り替え（NOAH_SHELF_SEEN）が閉の間は、サーバーが数えない。何も描かない。仕様: docs/noah/spec-110-shelf.md の 6 章。
 */
import { useEffect } from 'react';

export default function NoahShelfOpened({ from, pos }: { from: string; pos: number }) {
  useEffect(() => {
    void fetch('/api/noah/shelf', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'opened', id: from, pos }) }).catch(() => undefined);
  }, [from, pos]);
  return null;
}
