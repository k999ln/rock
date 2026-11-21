/** Presentation only. Never changes API names, arguments, hashes or permissions. */
const tools:Record<string,string>={search_gta6_guide:'ゲーム情報を調べる',get_gta6_entry:'項目を詳しく見る',list_gta6_entries:'一覧を見る',gta6_release_times:'発売時刻を確認',write_name_in_arabic:'名前をアラビア文字にする',whoami:'アカウントを確認'};
const fields:Record<string,string>={q:'検索する内容',slug:'項目のID',id:'項目のID',timezone:'タイムゾーン',query:'検索する内容',type:'種類',name:'名前',limit:'件数'};
const choices:Record<string,string>={cheat:'裏技',collectible:'収集アイテム',patch:'更新情報',topic:'話題',zone:'エリア',character:'人物',activity:'活動',location:'場所',vehicle:'乗り物',weapon:'武器',mission:'任務'};
export const noahOperationLabel=(name:string|null)=>tools[name??'']??'操作';
export const noahInputLabel=(name:string)=>fields[name]??'入力内容';
export const noahChoiceLabel=(value:string)=>choices[value]??value;
