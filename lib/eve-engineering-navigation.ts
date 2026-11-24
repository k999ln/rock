import { noahEngineeringSteps } from './noah-engineering.ts';
import { engineeringEveHref } from './noah-engineering-eve.ts';
import { NOAH_LOCALES } from './noah-i18n.ts';

export function eveEngineeringNavigation(engineering: unknown, language: unknown) {
  const step = noahEngineeringSteps.find(value => value === engineering) ?? 'create';
  const locale = NOAH_LOCALES.find(value => value === language) ?? 'ja';
  const search = '?' + new URLSearchParams({ engineering: step, lang: locale });
  return {
    locale, search,
    consultation: engineeringEveHref(step, locale),
    catalog: '/noah/engineering/combinations' + search,
    device: '/os/eve' + search + '&mode=device#eve-compose',
  };
}
