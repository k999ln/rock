/**
 * 稼ぎ方の設計図（審査者だけ。task 122 の 5 段目「設計図の並び・止まっている工程・帳簿を、審査者だけが見る画面」の最初の分）。
 * 一覧（並びの順）と、1 件の説明画面（?id=）。説明画面には、工程を「何を待つか」で段に並べた図を出す。
 * 本人の評価（2026-11-22）「エージェントのピン画像にはわかりにくすぎる、遷移先の説明画面ならいい」。設計図は会社が自分で回す物なので、公開のグリッドには出さない。
 */
import { noahSignInHref } from '@/lib/noah-navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import capabilities from '@/data/noah-business-capabilities.json';
import NoahBlueprintLevels from '@/components/noah-blueprint-levels';
import { noahBlueprintLevels, noahPlanBlueprints, type NoahBlueprint, type NoahBlueprintPlan, type NoahVerifiedCapabilities } from '@/lib/noah-business';
import { noahIntakeDependencies } from '@/lib/noah-intake-server';
import styles from '@/components/noah-service.module.css';
import own from '@/components/noah-blueprint-levels.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: '稼ぎ方の設計図 — Noah', robots: { index: false, follow: false } };

const MODELS: Record<NoahBlueprint['model'], string> = { affiliate: '紹介（アフィリエイト）', gig: '受注', digital: 'デジタル商品', ads: '広告収益', commerce: '物販', app: 'アプリ', oshi: '推し活' };
const HREF = '/noah/review/business';

async function reviewer(deps: ReturnType<typeof noahIntakeDependencies>): Promise<boolean> {
  try {
    const owner = await deps.authenticate(new Request(`https://avoado.si${HREF}`, { headers: await headers() }));
    return deps.reviewers.includes(owner);
  } catch { return false; } // Account or service unavailable: never render the plans.
}

export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  const deps = noahIntakeDependencies();
  if (!(await reviewer(deps))) {
    return <main className={styles.page}><h1>稼ぎ方の設計図</h1><p>審査担当のアカウントで開いてください。<a href={noahSignInHref(HREF)}>ログイン</a></p></main>;
  }
  const { id } = await searchParams;
  const plans = noahPlanBlueprints(capabilities.verified as NoahVerifiedCapabilities);
  const plan = typeof id === 'string' ? plans.find((p) => p.id === id) : undefined;
  return plan ? <Detail plan={plan} showMaterials={deps.explainLabels} /> : <List plans={plans} />;
}

function Detail({ plan, showMaterials }: { plan: NoahBlueprintPlan; showMaterials: boolean }) {
  const levels = noahBlueprintLevels(plan.steps).length, people = plan.humanSteps + plan.tapSteps + plan.reviewSteps;
  const notes = [...new Set(plan.steps.flatMap((s) => (s.waitNote ? [s.waitNote] : [])))];
  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>{MODELS[plan.model]}</p>
      <h1>{plan.label}</h1>
      <p className={own.summary}>工程 {plan.steps.length} を {levels} 段で進めます。本人の工程は {people}（登録・押す・確かめる）。横に並んだ工程は同時に進み、本人の工程は、その結果を使う工程だけを止めます。</p>
      <p className={own.legend}><span className={own.legendAuto}>自動の工程</span><span className={own.legendPerson}>本人の工程</span><span>押すと、理由と待つ物が開きます</span></p>
      {plan.hold && <p className={own.hold}>{plan.hold}</p>}
      <NoahBlueprintLevels steps={plan.steps} showMaterials={showMaterials} />
      {notes.length > 0 && (
        <section className={own.notes} aria-labelledby="waits">
          <h2 id="waits">待つ相手の前提</h2>
          <p>違っていたら、lib/noah-business.ts の NOAH_STEP_WAITS と、その工程の待つ物を直します。</p>
          <ul>{notes.map((note) => <li key={note}>{note}</li>)}</ul>
        </section>
      )}
      <Link className={own.back} href={HREF}>設計図の一覧へ戻る</Link>
    </main>
  );
}

function List({ plans }: { plans: readonly NoahBlueprintPlan[] }) {
  const models = Object.keys(MODELS) as NoahBlueprint['model'][];
  return (
    <main className={styles.page}>
      <h1>稼ぎ方の設計図</h1>
      <p className={own.summary}>上ほど、お金と手間が少なく、すぐ回せる物です（並びの式は spec-122 の 4 章）。押すと、工程を「何を待つか」で段に並べた説明が開きます。</p>
      {models.map((model, index) => {
        const rows = plans.filter((p) => p.model === model);
        return (
          <details key={model} className={own.group} open={index === 0}>
            <summary>{MODELS[model]}<small>{rows.length} 件</small></summary>
            <ul className={own.rows}>
              {rows.map((p) => (
                <li key={p.id}>
                  <Link href={`${HREF}?id=${encodeURIComponent(p.id)}`}>
                    <span>{p.label}</span>
                    <span>工程 {p.steps.length} → {noahBlueprintLevels(p.steps).length} 段・本人 {p.humanSteps + p.tapSteps + p.reviewSteps}{p.hold ? '・後回し' : ''}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </main>
  );
}
