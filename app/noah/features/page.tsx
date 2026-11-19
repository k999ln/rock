import Link from 'next/link';
import styles from '@/components/noah-features.module.css';
export const metadata = { title: '機能一覧 — Noah' };
const groups = [
  {title:'見つける・つながる', description:'タイムラインから、必要なAgentや仲間を探す。', links:[
    ['/noah#timeline','タイムライン','ニュース・Agent・投稿をまとめて見る'],
    ['/noah/agents','Agentを探す','用途・提供元・接続条件を比較'],
    ['/noah/tools','Toolを探す','既存のTool・コードを検索して利用'],
    ['/noah/social#compose','投稿・共有','サインインして投稿やフォローを管理'],
    ['/noah/social#communities','コミュニティー','参加して投稿を読む・共有する'],
    ['/noah/campus','大学別の入口','大学ごとのコミュニティーとTool'],
    ['/noah/community','コミュニティーのホーム','参加状況・接続先を確認'],
  ]},
  {title:'自分のAgentと仕事', description:'Webで保存した設定と、Macで動かすAgentを管理。', links:[
    ['/noah/launch#library','Agentを追加して使う','登録・管理はNoahで、処理は接続したMacで'],
    ['/noah/saved','保存した担当・モデル','Webに保存した担当、役割、LLMの設定'],
    ['/noah/devices','端末・実行先','接続している担当と実行場所を確認'],
    ['/noah/outputs','保存した成果','成果を開き、対応アプリへ渡す'],
    ['/noah/launch#work','Agentの仕事','実行結果と停止操作を確認する'],
  ]},
  {title:'購入・掲載・販売', description:'購入や公開の前に、価格と利用条件を確認。', links:[
    ['/noah/marketplace','マーケットプレイス','掲載されているTool・Agentを選ぶ'],
    ['/noah/purchases','購入履歴','購入・利用権と決済の状態'],
    ['/noah/register','Toolの掲載申請','MCP・APIの接続先や権限を登録'],
    ['/noah/publish','コード・SDKを公開','既存の編集・公開機能を使う'],
    ['/noah/sell','販売管理','販売価格・受取先・返金を管理'],
  ]},
  {title:'接続と利用環境', description:'利用可能な接続先と条件を確認。契約や権限は各画面で必要です。', links:[
    ['/noah/network','接続の管理','接続状態・認証・権限を確認'],
    ['/connect/service','サービスを接続','既存サービスの認証・接続手続き'],
    ['/noah/free-cloud','クラウドの設定','利用資格・プランと既存の検証機能'],
    ['/noah/linux','Linuxの設定','モデル・Agent・利用明細'],
    ['/noah/compute-grid','計算資源','利用先と提供する計算資源'],
    ['/noah/esim','回線','利用できる回線の条件を確認'],
    ['/noah/billing','利用明細','利用量と料金の状態'],
  ]},
  {title:'追加機能とヘルプ', description:'既存の道具と、対応環境を確認。', links:[
    ['/noah/add','機能を追加','追加可能な機能を選ぶ'],
    ['/noah/add/data','データの収集','収集対象と保存先を設定'],
    ['/noah/citations','出典整理','文章の出典を整理する'],
    ['/noah/visual-scribe','ビジュアル記録','記録を見ながら整理する'],
    ['/noah/add/zoom','Zoom連携','会議との連携方法を確認'],
    ['/noah/local-tools','Mac専用の実験機能','ローカル環境で使う機能と手順'],
    ['/noah/help','使い方・制限','保存・対応環境・接続の説明'],
    ['/noah/billing/provider-test','課金接続テスト','検証用の画面。通常の購入とは別です'],
  ]},
];
export default function Page(){return <main className={styles.page}>
  <header><span>NOAH</span><h2>機能一覧</h2><p>探す、使う、届ける。Noahの機能をここから。</p></header>
  {groups.map(group=><section key={group.title}><h3>{group.title}</h3><p>{group.description}</p><div className={styles.links}>
    {group.links.map(([href,label,description])=><Link key={href} href={href}><strong>{label}<span aria-hidden>↗</span></strong><small>{description}</small></Link>)}
  </div></section>)}
</main>;}
