import { NOAH_LOCALES, noahTranslate, type NoahLocale } from './noah-i18n.ts';
import type { NoahEngineeringStep } from './noah-engineering.ts';

export const engineeringAdvice = {
  create: {
    tip: '誰の仕事を任せたいですか？ 入力の例と、届けたい成果を一つずつ決めましょう。',
    question: 'NoahでAgentを作ります。誰がどんなときに使うか、何を入力すればどんな成果が返るとよいか、一緒に整理してください。',
  },
  connect: {
    tip: '提供元の接続先と、Agentに渡してよい情報を確かめましょう。',
    question: '外部のAgentをNoahにつなぎます。提供元の資料のどこを見て、接続方法と必要な権限を確かめればよいですか？',
  },
  test: {
    tip: '入力の例と期待する結果を一組用意しましょう。試した後、実際の結果と見比べられます。',
    question: 'NoahでAgentの動きを試します。小さな入力例と、結果を見て合格と判断する条件を一緒に考えてください。',
  },
  publish: {
    tip: '初めて使う人に向けて、使い方、料金、受け取れる成果を説明しましょう。',
    question: 'NoahのストアにAgentを載せます。初めて使う人に、使い方・料金・受け取れる成果が伝わる紹介文を一緒に考えてください。',
  },
} as const satisfies Record<NoahEngineeringStep, { tip: string; question: string }>;

// Only a known stage and a UI language travel in the URL. Eve receives an editable draft.
export function engineeringEveHref(stage: NoahEngineeringStep, locale: NoahLocale) {
  const params = new URLSearchParams({ step: stage, lang: locale });
  return '/noah/engineering?' + params.toString() + '#eve-compose';
}

export function engineeringEveDraft(stage: unknown, language: unknown) {
  if (typeof stage !== 'string' || !Object.hasOwn(engineeringAdvice, stage)) return '';
  const locale = NOAH_LOCALES.find(value => value === language) ?? 'ja';
  return noahTranslate(locale, engineeringAdvice[stage as NoahEngineeringStep].question);
}
