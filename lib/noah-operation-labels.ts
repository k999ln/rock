/** Presentation only. Never changes API names, arguments, hashes or permissions. */
const tools:Record<string,string>={search_gta6_guide:'ゲーム情報を調べる',get_gta6_entry:'項目を詳しく見る',list_gta6_entries:'一覧を見る',gta6_release_times:'発売時刻を確認',write_name_in_arabic:'名前をアラビア文字にする',whoami:'アカウントを確認',search_beevr:'BeevRの情報を検索',get_pricing:'料金を確認',list_services:'サービス一覧を見る',list_case_studies:'事例を探す',get_case_study:'事例を詳しく見る',list_articles:'記事一覧を見る',get_article:'記事を読む',about_beevr:'BeevRについて',lookup:'情報を検索',stats:'統計を見る',publish:'公開する',configure:'設定する'};
const fields:Record<string,string>={q:'検索する内容',slug:'項目のID',id:'項目のID',timezone:'タイムゾーン',query:'検索する内容',type:'種類',name:'名前',limit:'件数'};
const choices:Record<string,string>={cheat:'裏技',collectible:'収集アイテム',patch:'更新情報',topic:'話題',zone:'エリア',character:'人物',activity:'活動',location:'場所',vehicle:'乗り物',weapon:'武器',mission:'任務'};
export function noahOperationLabel(name: string | null): string {
  if (!name?.trim()) return '操作';
  if (Object.hasOwn(tools, name)) return tools[name];
  // Preserve unknown provider names instead of inventing a capability or a number.
  return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim() || name;
}
export const noahInputLabel=(name:string)=>fields[name]??'入力内容';
export const noahChoiceLabel=(value:string)=>choices[value]??value;
