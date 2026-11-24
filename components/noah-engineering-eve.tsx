'use client';

import { engineeringEveDraft } from '@/lib/noah-engineering-eve';
import type { NoahEngineeringStep } from '@/lib/noah-engineering';
import type { NoahLocale } from '@/lib/noah-i18n';
import { NOAH_EVE_HERMES_PROJECT } from '@/lib/noah-cloud-contract';
import NoahCloudAgent from './noah-cloud-agent';
import { useNoahLocale } from './noah-locale';
import styles from './noah-engineering-eve.module.css';

export default function NoahEngineeringEve({ stage = 'create', draftLocale, emptyDraft = false }: {
  stage?: NoahEngineeringStep;
  draftLocale?: NoahLocale;
  emptyDraft?: boolean;
}) {
  const { locale } = useNoahLocale();
  const language = draftLocale ?? locale;
  return <section id="eve-compose" className={styles.consultation} aria-label="Eve">
    <NoahCloudAgent key={`${stage}-${language}-${emptyDraft}`} projectId={NOAH_EVE_HERMES_PROJECT} profile="hermes" providerFamilyId={null}
      eveDraft={emptyDraft ? '' : engineeringEveDraft(stage, language)} proposeCombination={stage === 'create'} />
  </section>;
}
