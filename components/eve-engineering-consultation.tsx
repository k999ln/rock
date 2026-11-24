'use client';

import NoahBrowserAccess from './noah-browser-access';
import NoahCloudAgent from './noah-cloud-agent';
import { NoahLocaleProvider, useNoahLocale } from './noah-locale';
import { NOAH_EVE_HERMES_PROJECT } from '@/lib/noah-cloud-contract';
import styles from './noah-engineering-eve.module.css';

function Consultation({ draft, deviceHref, backHref }: ConsultationProps) {
  const { t } = useNoahLocale();
  return <main id="eve-compose" className={styles.consultation}>
    <nav><a href={backHref}>← {t('Agentエンジニアリング')}</a></nav>
    <h1>Eve</h1>
    <NoahCloudAgent projectId={NOAH_EVE_HERMES_PROJECT} profile="hermes" providerFamilyId={null} eveDraft={draft} />
    <a href={deviceHref}>{t('自分の端末でEveに相談する')}</a>
  </main>;
}

type ConsultationProps = { draft: string; deviceHref: string; backHref: string };
export default function EveEngineeringConsultation(props: ConsultationProps) {
  return <NoahLocaleProvider><NoahBrowserAccess><Consultation {...props} /></NoahBrowserAccess></NoahLocaleProvider>;
}
