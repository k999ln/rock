package dev.rock.core;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Offline, stateless test functions. Never calls a Broker, provider, filesystem or network. */
public final class OutputTestTools {
    private OutputTestTools() {}
    public static final int INPUT_LIMIT = 12000;
    public static final class Scenario {
        public final String id, title, inputLabel, sample, optionLabel, option, scope;
        public final boolean simulated;
        Scenario(String id, String title, boolean simulated, String scope, String inputLabel, String sample, String optionLabel, String option) {
            this.id=id; this.title=title; this.simulated=simulated; this.scope=scope;
            this.inputLabel=inputLabel; this.sample=sample; this.optionLabel=optionLabel; this.option=option;
        }
        public String mode() { return simulated ? "模擬結果" : "端末内の実処理"; }
    }
    private static Scenario s(String id, String title, boolean simulated, String scope, String label, String sample, String optionLabel, String option) {
        return new Scenario(id,title,simulated,scope,label,sample,optionLabel,option);
    }
    public static final List<Scenario> SCENARIOS = Collections.unmodifiableList(Arrays.asList(
        s("csv", "CSV整形", false, "UTF-8のCSVを整形。指定列で重複排除・文字順ソート、全セルの外側の空白を除去。数式は文字として出力します。", "CSV", "id,name\n2, beta \n1, alpha\n2,beta", "重複判定・並び替えの列", "id"),
        s("citations", "引用・出典整理", false, "既存のArticle Toolと同じ変換です。出典の内容調査は含みません。", "原稿", "小さく試します。（出典: [Python公式](https://docs.python.org/3/)）\n\n結果を確認します。（出典: [Python公式](https://docs.python.org/3/)）", "", ""),
        s("article", "無料記事の作成", false, "入力原稿を無料部分・まとめ・案内に整形します。AI執筆や投稿ではありません。", "原稿", "# 小さく始める自動化\n\n毎日の作業を一つ選びます。入力を整理し、結果を自分で確認します。\n\n## 次の一歩\n繰り返して改善します。\n\n## 記録する\n結果の違いを記録し、少量の試験から対象を広げていきます。", "まとめ（箇条書き3〜5個）", "- 作業を選ぶ\n- 入力を整理する\n- 結果を確認する"),
        s("coconala", "案件チェック", true, "案件確認画面の模擬結果です。実際の審査・応募・受注ではありません。", "依頼内容", "単発の原稿作成。チャットでやり取り。", "提案", "テーマに沿った原稿を納品します。"),
        s("fashion", "ブランド企画", true, "入力を差し込む企画テンプレートです。AIや市場調査、画像生成、投稿は実行しません。", "ブランド方針", "静かで無機質な服。完全受注生産。", "商品", "黒いウールのワイドスラックス"),
        s("mercari", "出品原稿・試算", false, "テスト商品の原稿と見込み額を計算します。手数料500円・送料750円・原価1000円は固定の試験値です。", "商品名と説明", "試験用の黒いジャケット、サイズM。", "仮の販売価格（円）", "5000"),
        s("legal", "法律相談の整理", false, "入力を受付メモに整形します。法的判断、調査、弁護士への送信は行いません。", "相談メモ", "契約内容を専門家へ確認したい。", "希望", "相談前に事実を整理する。"),
        s("patent", "発明の整理", false, "入力を発明メモに整形します。先行技術調査・特許性判断・出願は行いません。", "発明名", "省電力の試験用センサー", "仕組み", "変化があるときだけ測定周期を短くする。"),
        s("delivery", "納品前の照合", false, "テキストの文字数・UTF-8バイト数・SHA-256を実計算します。ファイル照合・ZIP・送信は含みません。", "照合するテキスト", "納品テストの原稿です。", "", ""),
        s("subscriptions", "サブスク台帳", false, "入力した架空契約の年額を計算します。銀行や実契約に接続しません。", "試験契約名", "制作ツール（架空）", "仮の月額（円）", "1200"),
        s("market", "Market", true, "架空のPAPER注文と残高の表示テストです。実注文・約定・台帳記帳はありません。", "試験価格（PAPER単位）", "1200", "数量", "2"),
        s("wallet", "Wallet", true, "架空残高10,000からの予約・使用・解除を計算します。実残高・送金・正式な取引記録ではありません。", "予約額", "1000", "使用額", "700"),
        s("zema", "Zemaの仕事", true, "依頼→処理→レビュー待ちの模擬進捗です。Brokerに仕事を作らず、本人の実行同意を代用しません。", "依頼", "記事の出典を整理する", "成果物名", "確認用原稿"),
        s("cloud-ai", "クラウドAI", true, "AI応答画面を試すテンプレートです。本物の推論は行いません。実生成には接続鍵と利用枠が必要です。", "依頼", "新商品の紹介文を作りたい", "補足", "短く、落ち着いた文体"),
        s("whisper", "音声文字起こし", true, "架空の文字起こし結果です。マイク収録や音声認識は行いません。", "試験テーマ", "新商品の打合せ", "話者名（架空）", "話者A"),
        s("local-ai", "端末内AI", true, "端末内AIの計画表示を模擬します。model未導入でも確認できますが、LLMの推論結果ではありません。", "依頼", "資料を整理して記事にする", "補足", "まず下書きまで"),
        s("browser", "ブラウザ自動化", true, "ページ読取結果の形式を模擬します。URLは開かず、実ページの取得やクリックは行いません。", "試験URL", "https://example.com/", "試験目的", "見出しの一覧を確認" )
    ));
    public static String run(String id, String input, String option) {
        Scenario scenario = SCENARIOS.stream().filter(item -> item.id.equals(id)).findFirst().orElseThrow(() -> new IllegalArgumentException("未対応のテストです。"));
        check(input); if (!scenario.optionLabel.isEmpty()) check(option);
        String body;
        switch (id) {
            case "csv": body = cleanCsv(input, option); break;
            case "citations": body = ArticleTools.citations(input); break;
            case "article": body = ArticleTools.freeArticle(input,20,option,500,"詳細手順（試験用）","https://note.com/test/n/test"); break;
            case "coconala": body = "依頼: " + input + "\n提案: " + option + "\n\n確認項目:\n・納品物と期限\n・修正回数\n・連絡手段\n\n判定: 模擬のレビュー待ち\n応募・受注: 未実施"; break;
            case "fashion": body = "企画テンプレート\n\n方針: " + input + "\n商品: " + option + "\n\n【投稿案】\n" + option + "。\n" + input + "\n仕様と納期を確認してから公開します。\n\n【制作指示】\n正面・素材・着用時の3カット。\n\n画像生成・公開: 未実施"; break;
            case "mercari": body = "【試験用の出品原稿】\n" + input + "\n\n仮の販売価格: " + amount(option,1000000) + "円\n見込み利益: " + (amount(option,1000000)-2250) + "円\n（固定試験値: 手数料500 / 送料750 / 原価1000円）\n\n在庫確認・出品・売上: 未実施"; break;
            case "legal": body = "【法律相談の受付メモ】\n状況: " + input + "\n希望: " + option + "\n\n未確認: 地域・期限・契約書・関係者\n法的評価・事実認定・送信は未実施です。"; break;
            case "patent": body = "【発明メモ】\n名称: " + input + "\n仕組み: " + option + "\n\n追記する項目: 解決する課題・構成要素・効果・既知技術との差・公開歴\n\n先行技術調査・出願: 未実施"; break;
            case "delivery": body = "文字数: " + input.codePointCount(0,input.length()) + "\nUTF-8: " + input.getBytes(StandardCharsets.UTF_8).length + " bytes\nSHA-256: " + sha256(input) + "\n\n送信・納品: 未実施"; break;
            case "subscriptions": body = "架空契約: " + input + "\n月額: " + amount(option,1000000) + "円\n年額換算: " + amount(option,1000000)*12 + "円\n\n実支払・更新・解約: 未実施"; break;
            case "market": {
                long total=amount(input,1000000)*amount(option,10000);
                body="PAPER買い注文の表示例\n仮注文額: "+total+"\n開始残高: 100000\n残高検査: "+(total<=100000?"範囲内":"不足")+"\n\n約定・外部注文・Wallet反映: 未実施"; break;
            }
            case "wallet": {
                long reserved=amount(input,10000),spent=amount(option,10000);
                if(spent>reserved) throw new IllegalArgumentException("使用額が予約額を超えています。");
                body="架空残高: 10000\n予約: "+reserved+"\n予約中の利用可能額: "+(10000-reserved)+"\n使用: "+spent+"\n予約から戻す額: "+(reserved-spent)+"\n終了残高: "+(10000-spent)+"\n\n正式台帳・送金: 未実施"; break;
            }
            case "zema": body="依頼: "+input+"\n\n1. 受付（模擬）\n2. Tool選択（模擬）\n3. 処理済み（模擬）\n4. レビュー待ち（模擬）\n\n成果物: "+option+"\n本番仕事: 未作成\n本番完了: 未判定"; break;
            case "cloud-ai": case "local-ai": body="【模擬AI応答・推論なし】\n依頼: "+input+"\n条件: "+option+"\n\n確認用の計画テンプレート:\n1. 入力を整理\n2. 必要なToolを選択\n3. 下書きを作成\n4. 本人が内容を確認\n\nモデルの回答: なし\n外部送信・費用: なし"; break;
            case "whisper": body="【模擬文字起こし・録音なし】\nテーマ: "+input+"\n[00:00] "+option+": 本日の確認事項を整理します。\n[00:04] "+option+": 次の作業を決めます。\n\n音声ファイル: なし\n音声認識: 未実施"; break;
            case "browser": body="【模擬ページ読取・通信なし】\n試験URL: "+input+"\n目的: "+option+"\n\n仮の見出し: 商品の紹介 / 使い方 / 問合せ\nHTTP要求・ページ取得・クリック: 未実施"; break;
            default: throw new IllegalArgumentException("未対応のテストです。");
        }
        return "【"+scenario.mode()+" / テスト専用】\n"+body;
    }
    private static void check(String value) {
        if(value==null||value.trim().isEmpty()||value.length()>INPUT_LIMIT) throw new IllegalArgumentException("入力は1〜12,000文字にしてください。");
    }
    private static long amount(String value,long max) {
        try { long n=Long.parseLong(value.trim()); if(n<0||n>max) throw new NumberFormatException(); return n; }
        catch(NumberFormatException e) { throw new IllegalArgumentException("0〜"+max+"の整数で入力してください。"); }
    }
    private static String sha256(String value) {
        try { StringBuilder out=new StringBuilder(); for(byte b:MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))) out.append(String.format(java.util.Locale.ROOT,"%02x",b&255)); return out.toString(); }
        catch(java.security.NoSuchAlgorithmException e) { throw new IllegalStateException("SHA-256を利用できません。",e); }
    }
    private static String cleanCsv(String source,String key) {
        List<List<String>> rows=parseCsv(source); List<String> headers=rows.remove(0);
        int index=headers.indexOf(key.trim());
        if(index<0) throw new IllegalArgumentException("指定した列がありません。");
        if(new java.util.HashSet<>(headers).size()!=headers.size()||headers.contains("")||headers.size()>100) throw new IllegalArgumentException("列名は空欄・重複なしにしてください。");
        Map<String,List<String>> unique=new LinkedHashMap<>();
        for(List<String> row:rows) { if(row.size()!=headers.size()) throw new IllegalArgumentException("CSVの列数が一致しません。"); unique.putIfAbsent(row.get(index),row); }
        List<List<String>> clean=new ArrayList<>(unique.values()); clean.sort(Comparator.comparing(row->row.get(index))); clean.add(0,headers);
        StringBuilder out=new StringBuilder();
        for(List<String> row:clean) {
            List<String> cells=new ArrayList<>();
            for(String value:row) { if(!value.isEmpty()&&"=+@-".indexOf(value.charAt(0))>=0) value="'"+value; cells.add(value.contains(",")||value.contains("\n")||value.contains("\"")?"\""+value.replace("\"","\"\"")+"\"":value); }
            out.append(String.join(",",cells)).append('\n');
        }
        return "入力行: "+rows.size()+" → 出力行: "+(clean.size()-1)+"\n\n"+out;
    }
    private static List<List<String>> parseCsv(String raw) {
        String source=raw.replace("\r\n","\n").replace('\r','\n');
        if(source.startsWith("\uFEFF")) source=source.substring(1);
        List<List<String>> rows=new ArrayList<>(); List<String> row=new ArrayList<>(); StringBuilder cell=new StringBuilder(); boolean quoted=false,closed=false;
        for(int i=0;i<source.length();i++) {
            char c=source.charAt(i);
            if(quoted) {
                if(c=='"') { if(i+1<source.length()&&source.charAt(i+1)=='"') { cell.append('"');i++; } else { quoted=false;closed=true; } }
                else cell.append(c);
            } else if(c==','||c=='\n') {
                row.add(cell.toString().trim());cell.setLength(0);closed=false;
                if(row.size()>100) throw new IllegalArgumentException("CSVは100列までです。");
                if(c=='\n') { rows.add(row);row=new ArrayList<>(); }
            } else if(c=='"'&&cell.length()==0&&!closed) quoted=true;
            else { if(closed||c=='"') throw new IllegalArgumentException("CSVの引用符を確認してください。"); cell.append(c); }
        }
        if(quoted) throw new IllegalArgumentException("CSVの引用符が閉じていません。");
        if(cell.length()>0||!row.isEmpty()||closed) { row.add(cell.toString().trim());rows.add(row); }
        if(rows.size()<2) throw new IllegalArgumentException("見出しとデータ行を入力してください。");
        return rows;
    }
}
