import type { NoahLocale } from './noah-i18n.ts';

export type NoahDetailStarter = {
  host: string;
  headline: string;
  summary: string;
  input: string;
  tool: string;
  field: string;
};

// Enzo’s public read-only search: https://enzos.ai/for-agents
const enzos: Record<NoahLocale, Pick<NoahDetailStarter, 'headline' | 'summary' | 'input'>> = {
  ja: {
    headline: '予算に合う、アメリカの家を探す。',
    summary: 'エリアや好きな建築スタイルで売り物件を探し、候補の購入判断や、公開されている内見動画を確認できます。',
    input: 'ロサンゼルスで、80万ドル以内のミッドセンチュリーの家を探して。',
  },
  en: {
    headline: 'Find a U.S. home within your budget.',
    summary: 'Search homes for sale by location and architectural style. Review buying insights and watch available video tours.',
    input: 'Find mid-century homes in Los Angeles for under $800,000.',
  },
  'zh-CN': {
    headline: '在预算内找到合适的美国住宅。',
    summary: '按地区和建筑风格搜索待售住宅，查看购房参考和可用的看房视频。',
    input: '在洛杉矶找价格低于 80 万美元的世纪中期风格住宅。',
  },
  ko: {
    headline: '예산에 맞는 미국 주택을 찾아보세요.',
    summary: '지역과 건축 양식으로 매물을 검색하고, 구매 판단에 도움이 되는 정보와 공개된 집 소개 영상을 확인할 수 있어요.',
    input: '로스앤젤레스에서 80만 달러 이하의 미드센추리 주택을 찾아줘.',
  },
  es: {
    headline: 'Encuentra una casa en EE. UU. dentro de tu presupuesto.',
    summary: 'Busca viviendas en venta por ubicación y estilo. Consulta información para decidir y mira los recorridos disponibles.',
    input: 'Busca casas de estilo mid-century en Los Ángeles por menos de 800.000 dólares.',
  },
  ar: {
    headline: 'اعثر على منزل في الولايات المتحدة يناسب ميزانيتك.',
    summary: 'ابحث عن منازل للبيع حسب الموقع والطراز المعماري، وراجع معلومات الشراء وشاهد الجولات المصوّرة المتاحة.',
    input: 'ابحث عن منازل بطراز منتصف القرن في لوس أنجلوس بسعر يقل عن 800 ألف دولار.',
  },
};

export function noahDetailStarter(id: string, host: string | null, locale: NoahLocale): NoahDetailStarter | null {
  if (host !== 'enzos.ai' || (id !== 'mcp-registry:ai.enzos/enzos' &&
    id !== 'project-69957b718df64242a0c47fd828938e580bf56dfb89037d0ba82e6e4f4509ddb3')) return null;
  return { ...enzos[locale], host, tool: 'search_homes', field: 'query' };
}
