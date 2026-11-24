'use client';
/**
 * Agent のカード 1 枚。上から: 名前と提供者／1 行説明／印・動く所・料金（必ず 3 つ）／主ボタン（1 枚に 1 つ）。
 * 印とボタンは、サーバーが計算した connect と、その本人の接続だけで決める（カードは、自分で計算しない）。
 * 名前と説明は、提供者が書いた文のまま（文字として出す）。色だけで分けない。
 * 仕様: docs/noah/spec-96-connect-plan.md の 6 章、spec-74-one-click-connect.md の 11.5。
 */
import { NoahAgentPin } from './noah-agent-pin';
import { useNoahLocale } from './noah-locale';
import { noahBadgeText, noahPriceText, noahReadyDetailHref, noahUsersText, type NoahReadyConnection, type NoahReadyItem } from '@/lib/noah-ready-view';
import NoahConnectButton from './noah-connect-button';
import styles from './noah-ready.module.css';

export default function NoahCard({ item, signedIn, ownerScope, connection, onChange }: {
  item: NoahReadyItem; signedIn: boolean; ownerScope: string | null;
  connection: NoahReadyConnection | null; onChange: (connection: NoahReadyConnection) => void;
}) {
  const {t}=useNoahLocale();
  const extras = [noahUsersText(item.users), item.oneTap ? '押すだけで試せる' : null, item.tools > 0 ? `道具 ${item.tools} 個` : null].filter((text): text is string => text !== null);
  return <NoahAgentPin
    id={item.id}
    name={item.name}
    href={noahReadyDetailHref(item.id)}
    summary={item.summary || t('（説明はありません）')}
    meta={<>
      <span className={styles.provider}>{t("提供:")} {item.provider}</span>
      <ul className={styles.facts} aria-label={t("つなぎ方")}>
        <li className={styles.badge}>{t(noahBadgeText(item.connect))}</li>
        <li>{t(item.connect.placeLabel ?? '動く所は未確認')}</li>
        <li>{t(noahPriceText(item.connect.price))}</li>
        {extras.map((text) => <li key={text}>{t(text)}</li>)}
      </ul>
    </>}
    actions={<NoahConnectButton agentId={item.id} listed signedIn={signedIn} ownerScope={ownerScope} connection={connection} onChange={onChange} />}
  />;
}
