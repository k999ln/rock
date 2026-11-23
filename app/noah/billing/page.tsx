import { notFound } from 'next/navigation';

// 月次請求のテスト（Sky の試験の画面 components/sky-monthly-sandbox）は、公開の Noah には出さない。
// 中の API（/api/noah/billing）も無く、知らない人が開いても先へ進めなかった（使い勝手の確かめ 3 章の 18、task 128 の D9）。
// Sky の試験は /sky/billing のまま。
export default function Page(): never {
  notFound();
}
