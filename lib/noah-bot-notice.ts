/**
 * 外の道具・Agent を提供している方へ、の説明（/noah/help の `#bot` の節）と、取り下げ・報告の窓口。
 *
 * - Noah が何者で、何を読み、何を送り、どう止めてもらえるかを、1 つの節で読めるようにする。
 * - 文の中の数は、作りの数と同じにする（上限の既定を変えた時は、ここも直す。試験が、ずれを見つける）。
 * - 窓口の宛先は、本人が決める（docs/noah/mvp-launch.md の D8）。**決まるまで、節も、そこへのリンクも、出さない**
 *   （出さない間は、一般には開けない: mvp-launch.md の G5）。宛先は、環境変数にしない（公開してよい文として、ここに書く）。
 * 通信も保存もしない。仕様: docs/noah/spec-97-launch-ops.md の 5 章。
 */
import { NOAH_ASK_LIMITS } from './noah-limits.ts';

/** 窓口の宛先。label は画面に出す文、href は行き先（`mailto:` か `https://`）。 */
export type NoahReportContact = { label: string; href: string };
/** 本人が決めるまで null。 */
export const NOAH_REPORT_CONTACT: NoahReportContact | null = null;

/** 文に出す数。巡回の間隔（lib/noah-probe.ts の `NOAH_PROBE.hostEveryMs`）と、台帳を読む間隔（1 時間）は、ここに写して持つ（画面の側へ、握手の作りを読み込ませない）。 */
export const NOAH_BOT_NOTICE_NUMBERS = {
  /** 台帳を読む間隔（時間）。 */
  registryEveryHours: 1,
  /** 同じ接続先へ、巡回が握手する間隔（時間）。 */
  patrolHostEveryHours: 1,
  /** 1 つの接続先へ、利用者の操作から始める接続（全員を合わせて、1 分に）。 */
  userHandshakesPerMinute: NOAH_ASK_LIMITS.hostHandshakes,
};

export type NoahBotNotice = {
  title: string;
  /** 窓口の文の前までの段。 */
  paragraphs: string[];
  /** 窓口の文（宛先の前・宛先・宛先の後）。宛先が無ければ null。 */
  report: { before: string; contact: NoahReportContact; after: string } | null;
  /** 出どころの段。 */
  source: string;
  /** 節を出すか（宛先が決まっている時だけ）。 */
  shown: boolean;
};

export function noahBotNotice(contact: NoahReportContact | null = NOAH_REPORT_CONTACT): NoahBotNotice {
  const n = NOAH_BOT_NOTICE_NUMBERS;
  return {
    title: '外の道具・Agent を提供している方へ',
    paragraphs: [
      `Noah は、Official MCP Registry に載っている記録を ${n.registryEveryHours} 時間に 1 回ほど読み、鍵の要らない接続先へ、応答するかどうかを確かめる通信を送ります。送るのは、接続の開始（initialize）と、道具の一覧の読み取り（tools/list）だけです。同じ接続先へは、${n.patrolHostEveryHours} 時間に 1 回までです。名乗りは NoahBot/1 です。道具を自動で呼ぶ事はしません。`,
      `利用者が Noah の画面から道具を使う時は、その利用者が入力した内容だけを、名乗り Noah/1 で送ります。利用者の名前・アカウントは送りません。1 つの接続先へ、利用者の操作から始める接続は、全員を合わせて 1 分に ${n.userHandshakesPerMinute} 回までです。`,
      '「混んでいる」（429）と Retry-After を守ります（その時刻まで、定期の確かめも、利用者からの接続も送りません）。認証を求める応答（401）を返す接続先は、一覧に載せません。別の host への転送には従いません。',
    ],
    report: contact ? { before: '一覧から外してほしい時、説明が違う時、迷惑な内容を見つけた時は、', contact, after: ` へ知らせてください。台帳の記録を外した物・非推奨にした物は、${n.registryEveryHours} 時間以内に、Noah の一覧からも外れます。` } : null,
    source: '出どころ: Official MCP Registry。Noah は、このデータを読んで並べています。台帳の運営と、提携や公認の関係はありません。',
    shown: contact !== null,
  };
}
