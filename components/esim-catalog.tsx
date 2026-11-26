'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, RadioTower, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react';
import type { EsimPublicCatalogState } from '@/lib/esim-public-catalog';
import { PROFILE_CONSENT_TEXT, PROFILE_CONSENT_DETAILS } from '@/lib/noah-profile-contract';
import { useNoahLocale } from './noah-locale';
import styles from '@/components/sky-commerce.module.css';

type PublicPlan = {
  id: string;
  name: string;
  description: string;
  coverageCountryCodes: string[];
  roamingCountryCodes: string[];
  dataAllowance: { kind: 'fixed'; amountMb: number } | { kind: 'unlimited' };
  validityDays: number;
  serviceStarts: 'after_profile_installation' | 'after_first_network_attach';
  installPrerequisites: string[];
  starterAgentPack: {
    id: string;
    version: string;
    packages: Array<{
      packageKey: string;
      name: string | null;
      summary: string | null;
      reviewState: 'active' | 'unavailable';
    }>;
  };
};

type CatalogResponse = {
  catalogVersion?: string;
  commerceState?: 'catalog_not_configured' | 'contract_pending';
  purchaseEnabled: false;
  plans: PublicPlan[];
  error?: string;
};

function formatData(plan: PublicPlan) {
  return plan.dataAllowance.kind === 'unlimited'
    ? '無制限（提供条件の確認が必要）'
    : `${plan.dataAllowance.amountMb.toLocaleString('ja-JP')} MB`;
}

function formatStart(value: PublicPlan['serviceStarts']) {
  return value === 'after_profile_installation' ? 'プロファイル導入後' : '対応網へ初回接続後';
}

export default function EsimCatalog({ initialCatalog, initialError }: {
  initialCatalog: EsimPublicCatalogState | null;
  initialError: boolean;
}) {
  const { t } = useNoahLocale();
  const [catalog, setCatalog] = useState<CatalogResponse | null>(initialCatalog);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);

  async function refresh() {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch('/api/esim/catalog', { cache: 'no-store' });
      if (!response.ok) throw new Error('catalog_unavailable');
      const data = await response.json() as CatalogResponse;
      if (data.purchaseEnabled !== false || !Array.isArray(data.plans)) throw new Error('invalid_catalog');
      setCatalog(data);
    } catch {
      setCatalog(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return <main className={styles.shell}>
    <div className={styles.page}>
      <Link href="/connect" className={styles.back}><ArrowLeft size={15} /> 利用開始案内へ戻る</Link>
      <header className={styles.header}>
        <div><span className={styles.eyebrow}>ROCKSTAROS SERVICE ACCESS</span><h1>RockstarOS利用用 SIM / eSIM</h1>
          <p>対応端末にRockstarOSの回線を追加し、NoahでAgentに仕事を頼むための利用案内です。</p>
          <p>購入済みの方は、同じRockstar IDの<Link href="/noah/purchases">購入履歴・eSIM設定</Link>を開いてください。回線を追加した後も、そこで端末の状態と次の操作を確認できます。</p>
        </div>
        <button className={styles.secondary} type="button" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw size={14} />{loading ? '確認中…' : '提供状況を再確認'}
        </button>
      </header>
      <section className={styles.esimCatalog} aria-labelledby="esim-registration-title">
        <div className={styles.esimCatalogTitle}>
          <h2 id="esim-registration-title">{t('登録情報を次のAgentでも使う')}</h2>
          <p>{t('eSIMの申込みとAgentの登録で使う情報を、Noahの「登録情報」にまとめられます。保存・再利用への同意は、回線契約とは別に選べます。')}</p>
        </div>
        <details>
          <summary>{t('保存・再利用の同意内容を読む')}</summary>
          <p>{t(PROFILE_CONSENT_TEXT)}</p>
          {PROFILE_CONSENT_DETAILS.map(section=><div key={section.title}><h3>{t(section.title)}</h3><p>{t(section.text)}</p></div>)}
        </details>
        <p>{t('このページを開いただけでは情報を保存・送信しません。Apple・Googleからの自動取込みと、eSIM事業者への申込連携は準備中です。')}</p>
        <Link href="/noah/profile" className={styles.secondary}>{t('登録情報を確認・保存する')}</Link>
      </section>
      <section className={styles.esimCatalog} aria-labelledby="esim-catalog-title">
        <div className={styles.esimCatalogTitle}>
          <h2 id="esim-catalog-title"><RadioTower size={17} /> 回線とサービス利用条件</h2>
          <p>回線料金とCloud LLM/Agentの従量料金は分けて表示します。販売主体・契約・料金条件が確定し、端末で開通確認できるまでは購入できません。</p>
        </div>
        {error && <p className={styles.error} role="alert"><AlertCircle size={16} /> eSIM情報を取得できません。購入操作は停止中です。時間をおいて再確認してください。</p>}
        {!error && loading && <output className={styles.subtle}>eSIM提供条件を読み込んでいます。</output>}
        {!error && !loading && <output className={styles.esimContractState}>
          <ShieldCheck size={17} />
          {catalog?.commerceState === 'contract_pending'
            ? 'プラン情報は準備中です。供給元との契約・販売条件の確認が終わるまで購入できません。'
            : '供給元・販売条件が未設定です。契約準備中のため購入できません。'}
        </output>}
        {!error && !loading && catalog?.plans?.length === 0 &&
          <p className={styles.noEsimPlans}>現在公開できるeSIMプランはありません。契約や提供条件を確認できていないプランは表示しません。</p>}
        {!error && !loading && !!catalog?.plans?.length && <div className={styles.esimPlanList}>
          {catalog.plans.map((plan) => <article className={styles.esimPlanCard} key={plan.id}>
            <h3>{plan.name}</h3>
            <p>{plan.description}</p>
            <dl>
              <div><dt>利用対象国</dt><dd>{plan.coverageCountryCodes.join('、')}</dd></div>
              <div><dt>ローミング対象</dt><dd>{plan.roamingCountryCodes.length ? plan.roamingCountryCodes.join('、') : '公開条件なし'}</dd></div>
              <div><dt>データ量</dt><dd>{formatData(plan)}</dd></div>
              <div><dt>有効期間</dt><dd>{plan.validityDays}日</dd></div>
              <div><dt>利用開始</dt><dd>{formatStart(plan.serviceStarts)}</dd></div>
            </dl>
            <div>
              <strong>初期エージェントpack: {plan.starterAgentPack.id} v{plan.starterAgentPack.version}</strong>
              <ul>{plan.starterAgentPack.packages.map((item) => <li key={item.packageKey}>
                <strong>{item.name || item.packageKey}</strong>{' '}
                <span>({item.reviewState === 'active' ? '審査有効' : '現在は利用不可'})</span>
                {item.summary && <span> — {item.summary}</span>}
              </li>)}</ul>
              <p className={styles.esimDeviceNote}>ここに示すのは初期候補です。端末への導入、利用権、実行許可を個別に確認します。ほかのAgentもNoahで探せます。</p>
            </div>
            {plan.installPrerequisites.length > 0 && <div><strong>導入前提</strong><ul>{plan.installPrerequisites.map((item) => <li key={item}>{item}</li>)}</ul></div>}
            <button className={styles.secondary} type="button" disabled aria-disabled="true">契約準備中 — 購入できません</button>
          </article>)}
        </div>}
        <p className={styles.esimDeviceNote}><Smartphone size={15} /> 端末、地域SKU、SIMロック、携帯通信会社、対応周波数で利用可否が異なります。実機でeSIMを追加し、通信できることを確認するまで対応済みとは表示しません。物理SIMの販売・配送と他チャネルの権利連携は未接続です。</p>
      </section>
    </div>
  </main>;
}
