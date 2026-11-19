import type { LinuxModel } from './sky-linux-models.ts';

export type NoahCatalogItem = {
  id: string; kind: 'agent' | 'model'; name: string; description: string;
  model: LinuxModel; agent: { name: string; instructions: string; modelId: string };
};

// Recipes are data. They grant no Tool, shell, network or account permissions.
const recipes = [
  { id: 'organize', name: '段取りを考えるAgent', description: '依頼を手順・必要なもの・確認事項に整理します。', instructions: '依頼を読み、実行する順番、必要なもの、本人に確認することを日本語で短く整理してください。外部操作は実行せず、提案する文章だけを返してください。' },
  { id: 'summarize', name: '要約するAgent', description: '貼り付けた文章の要点を短くまとめます。', instructions: '渡された文章だけを使って、日本語で要点を短くまとめてください。資料にない事実は補わず、不明な点は不明と書いてください。' },
  { id: 'draft', name: '下書きを作るAgent', description: '伝えたい内容から文章の下書きを作ります。', instructions: '依頼に沿って読みやすい日本語の下書きを作ってください。外部への投稿や送信は行わず、確認が必要な情報は明記してください。' },
];
export function noahDeviceCatalog(models: LinuxModel[]): NoahCatalogItem[] {
  const unique = models.filter((m, i) => models.findIndex(other => other.id === m.id) === i);
  return unique.flatMap(model => [
    { id: `model:${model.id}`, kind: 'model' as const, name: model.name,
      description: '端末内で文章を生成するLLM。Eveで使う文章担当も一緒に追加します。', model,
      agent: { name: `${model.name}の文章担当`, instructions: '依頼に沿って日本語で回答してください。不明なことは不明と伝え、外部操作を行ったとは述べないでください。', modelId: model.id } },
    ...recipes.map(recipe => ({ id: `agent:${recipe.id}:${model.id}`, kind: 'agent' as const,
      name: recipe.name, description: recipe.description, model,
      agent: { name: recipe.name, instructions: recipe.instructions, modelId: model.id } })),
  ]);
}
