'use client';
import { useState } from 'react';
import { Zap } from 'lucide-react';
import {
  defaultEstimate,
  estimate,
  limits,
  type EstimateInput,
} from '@/lib/settlement';
const yen = (n: number) =>
  new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(n);
const fields: {
  key: keyof EstimateInput;
  label: string;
  unit: string;
  help?: string;
}[] = [
  {
    key: 'revenue',
    label: '月の収入見込額',
    unit: '円',
    help: '販売先の手数料控除後。実績ではなく自分の仮定を入力。',
  },
  {
    key: 'fx',
    label: '試算用のドル円レート',
    unit: '円 / USD',
    help: '初期値150円は仮定です。市場レートではありません。',
  },
  { key: 'watts', label: '自動化に追加で使う平均電力', unit: 'W' },
  { key: 'hours', label: '月の稼働時間', unit: '時間' },
  { key: 'kwhRate', label: '電気料金の単価', unit: '円 / kWh' },
  { key: 'dataGB', label: '月の追加通信量', unit: 'GB' },
  {
    key: 'dataRate',
    label: '追加通信の単価',
    unit: '円 / GB',
    help: '追加請求がない契約なら0。初回ダウンロードも含めて試算。',
  },
  { key: 'apiCost', label: '有料APIなどの月額費用', unit: '円' },
];
export function CostCalculator() {
  const [values, setValues] = useState<Record<keyof EstimateInput, string>>(
    () =>
      Object.fromEntries(
        Object.entries(defaultEstimate).map(([k, v]) => [k, String(v)]),
      ) as Record<keyof EstimateInput, string>,
  );
  let result: ReturnType<typeof estimate> | null = null;
  try {
    if (Object.values(values).some((v) => v.trim() === ''))
      throw new Error('empty');
    result = estimate(
      Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, Number(v)]),
      ) as EstimateInput,
    );
  } catch {}
  return (
    <div className="calculator-grid">
      <section className="panel">
        <div className="section-heading">
          <h2>あなたの条件で試算</h2>
          <span className="outline-tag">仮の数値</span>
        </div>
        <div className="field-grid">
          {fields.map((f) => (
            <div
              className={'field ' + (f.key === 'revenue' ? 'wide' : '')}
              key={f.key}
            >
              <label htmlFor={f.key}>{f.label}</label>
              <div className="number-input">
                <input
                  id={f.key}
                  type="number"
                  min={f.key === 'fx' ? 0.01 : 0}
                  max={limits[f.key]}
                  step="any"
                  value={values[f.key]}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [f.key]: e.target.value }))
                  }
                  aria-describedby={f.help ? f.key + '-help' : undefined}
                />
                <span>{f.unit}</span>
              </div>
              {f.help && <small id={f.key + '-help'}>{f.help}</small>}
            </div>
          ))}
        </div>
        <p className="subnote">
          収益を予測する機能ではありません。入力された条件だけで計算します。円換算後は1円単位で四捨五入します。
        </p>
      </section>
      <section className="estimate-result" aria-live="polite">
        <div className="eyebrow">YOUR MONTHLY ESTIMATE</div>
        <h2>費用差引後の試算額</h2>
        <div
          className={
            'net-amount ' + (result && result.net < 0 ? 'negative' : '')
          }
        >
          {result ? yen(result.net) : '—'}
        </div>
        <span className="result-caption">
          月あたり / 請求・送金は行われません
        </span>
        {result ? (
          <>
            <dl className="breakdown">
              <div>
                <dt>収入見込額</dt>
                <dd>{yen(result.revenue)}</dd>
              </div>
              <div>
                <dt>LOOP利用料の案</dt>
                <dd>−{yen(result.fee)}</dd>
              </div>
              <div>
                <dt>追加の電気代</dt>
                <dd>−{yen(result.electricity)}</dd>
              </div>
              <div>
                <dt>追加の通信費</dt>
                <dd>−{yen(result.data)}</dd>
              </div>
              <div>
                <dt>APIなどの費用</dt>
                <dd>−{yen(result.api)}</dd>
              </div>
            </dl>
            <div className="fee-note">
              <Zap size={18} />
              <p>
                利用料は月$8.88相当（この条件で{yen(result.feeCap)}
                ）が上限。収入の範囲で控除し、不足分は繰り越さない料金案です。
              </p>
            </div>
            <p className="subnote">
              収入0円ならLOOP利用料も0円。電気・通信などの費用は残るため、手出しが生じる場合があります。税金・機器代等は含みません。
            </p>
          </>
        ) : (
          <p role="alert" className="subnote">
            すべての項目に有効な数値を入力してください。稼働時間は0〜744時間、為替は0より大きな値にしてください。
          </p>
        )}
      </section>
    </div>
  );
}
