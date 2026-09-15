import { catalog } from './catalog';
export type LocalPlan = {saved:string[]; checks:Record<string,number[]>};
export const emptyPlan:LocalPlan={saved:[],checks:{}};
export function parsePlan(value:unknown):LocalPlan {
  if (!value || typeof value !== 'object') return {...emptyPlan};
  const p=value as Partial<LocalPlan>;
  const saved=Array.isArray(p.saved)? [...new Set(p.saved.filter(x=>catalog.some(t=>t.id===x)))]:[];
  const checks:Record<string,number[]>={};
  for(const tool of catalog) {
    const raw=p.checks && typeof p.checks==='object'?p.checks[tool.id]:undefined;
    if(Array.isArray(raw)) checks[tool.id]=[...new Set(raw.filter(x=>Number.isInteger(x)&&x>=0&&x<tool.steps.length))];
  }
  return {saved,checks};
}
export function buildPlanMarkdown(id:string,checks:number[]) {
  const t=catalog.find(x=>x.id===id); if(!t) throw new Error('ツールが見つかりません。');
  return `# ${t.name} — avocadoOS 導入プラン\n\n${t.description}\n\n公式ソース: ${t.source}\nライセンス: ${t.license} (${t.licenseUrl})\n実行環境: ${t.environment}\n\n## 準備\n${t.steps.map((s,i)=>`- [${checks.includes(i)?'x':' '}] ${s}`).join('\n')}\n\n## 費用・注意\n${t.cost}\n${t.note}\n\nこの文書は導入プランです。自動実行、収益保証、送金を行いません。\n`;
}
