"""Anicca Apply planner, adapted for public briefs and an empty seller history. See LICENSE and README."""
from __future__ import annotations

import json
from typing import Optional

HARD_PROHIBITION_CLASSES = {
    "uncontrolled_numeric_outcome": "acceptance or payment requires a numeric result outside the seller's control, such as a guaranteed recovery rate, follower count, sales total, ranking, views, conversions or hiring result. A controllable output count, completed system, published artifact or accurately measured report is not this class",
    # Sharpened 2026-09-08. Dais found 「【動画ブランディング相談】初心者に寄り添い、ニッチな事業の
    # 魅力を一緒に整理してくださる方募集」 unapplied-to. Advising on video, writing a script, planning
    # a channel or organising what a business should say are documents, and this class is about
    # producing the footage. Same shape as mandatory_desktop_or_browser_operations: the subject
    # matter is not the deliverable.
    "video_or_animation": "producing the footage itself -- video editing, live-action filming, AI video generation, animation or an MV -- as the required deliverable. Advice, strategy, scripts, planning, subtitles or a written report about video is a document and is never this class",
    "physical_or_onsite": "on-site work or physical making/assembly/cleaning/repair/cooking/sewing/woodwork/model making/packing/shipping/delivery/receipt",
    "mandatory_human_presence": "human face appearance, performance, voice recording, phone support, or a live call as the required deliverable itself. A contract-selection interview, kickoff, ordinary progress meeting or client check-in is not the deliverable and is never this class; it must not block the application",
    # 2026-09-07: applied to 「YouTube・SNS用オリジナルキャラクター制作（Live2D＋情報発信用素材
    # 一式）」 at ¥250,000. video_or_animation says "animation" and the model read a Live2D rig as
    # neither video nor animation, which is arguable. The line that matters is not the medium but
    # what has to be produced: an original drawing, model or rig is craft made in specialist tools
    # over many passes with a human eye, and taking one we cannot finish costs a review, not just
    # a proposal. Dais 2026-09-07: "true they should not any more."
    #
    # This does not close design. A page, a layout, a slide deck or a Figma-to-HTML build is a
    # document or a system and stays workable; 「Webデザイン」 and 「HTML・CSSコーディング」 are
    # deliberately absent from the terms below.
    "original_illustration_or_modelling": "producing original illustration, manga, character design, Live2D/VTuber rigging, 3D modelling, avatars or hand-drawn artwork, where the deliverable is the artwork itself rather than a page, a system or a document",
    # Promoted from the Coconala planner 2026-09-07, where these three had been written and were
    # the only place they existed. They are not Coconala-specific: an agent cannot produce a song,
    # cannot be somebody's outreach team, and cannot sit inside a desktop app all day, on any
    # marketplace. Coconala meanwhile had no entry for 出品代行 or for original artwork, so it
    # would still have bid on both. One definition, read by all three, is the point.
    # Same line, drawn on 2026-09-08 for the same reason: Dais found 「音楽歌詞の多言語翻訳
    # （ヒンディー語）」 unapplied-to. Translating lyrics produces text, and the class is about
    # producing audio.
    "music_or_audio_production": "producing the audio itself -- music, song, performance, singing, BGM, composition, arrangement, mixing or mastering -- as the required deliverable. Lyrics, translation, transcription, liner notes or any other text about music is a document and is never this class",
    "outreach_or_account_operations": "the required outcome is recruiting, lead sourcing, individualized bulk outreach, social DM operations, account warming, posting operations, or ongoing third-party account management rather than an asynchronous buyer-visible artifact",
    # Sharpened 2026-09-07 after promotion. As written for Coconala this refused, on Lancers,
    # 「RPAツール『アシロボ』シナリオ作成」, 「Notesからサイボウズ Officeへの移行とアプリ開発」 and a
    # writing job whose only sin was 「WordPress直接入稿」 -- 22 refusals of which about half were
    # the catalogue's own core work. Building automation inside a tool, migrating between tools, or
    # publishing a finished artifact through one are all deliveries. The line is whether operating
    # the software IS the deliverable, hour after hour, or merely how a built thing is made and
    # handed over.
    "mandatory_desktop_or_browser_operations": "operating software is itself the deliverable -- ongoing hours of data entry, checking, monitoring or repeated logged-in clicking inside a desktop application or someone else's account. Building, configuring, automating or migrating a system, or publishing a finished artifact through a tool, is a delivery and is never this class, however much software the work passes through",
    "illegal_or_unsafe": "illegal or unsafe work",
    # 2026-09-07: applied to 整理収納アドバイザー監修 and 防災士監修. Both name a certification the
    # persona does not hold, and both were read as allowed because the wording said "legally
    # required" and a 監修 credential is not a licence. Supervising under a credential you lack is
    # lending a name, which is the thing the honesty rules exist to prevent.
    "missing_legal_qualification": "a named qualification, certification, licence or 監修者 credential that the seller does not hold, whether or not the law requires it",
    # 2026-09-07: applied to 「バイマで出品作業」 at roughly ¥50 per item. The catalogue sells built
    # software and automation; this is the buyer's own account operated by hand, forever. The
    # capability list already says web/browser operation, which is true of a tool we build and not
    # of standing in for staff. maintenance_retainer is unaffected: it operates systems we built.
    "manual_marketplace_operation": "ongoing manual work inside the buyer's own account or marketplace (出品代行, 受発注, 在庫更新, 投稿代行, 反復データ入力) where the deliverable is worked hours rather than software, automation or a built artifact",
    "mandatory_attribute_fabrication": "mandatory personal attribute that cannot be answered truthfully without fabrication",
}

PROHIBITED_CATEGORY_TERMS = (
    ("video_or_animation", ("動画", "映像", "アニメーション", "YouTube", "TikTok", "ショート動画", "MV制作")),
    ("physical_or_onsite", ("配達", "配送", "梱包", "発送", "清掃", "施工", "内職", "軽作業", "現地", "出張")),
    ("mandatory_human_presence", ("ナレーション", "声優", "吹き替え", "テレアポ", "コールセンター", "電話営業",
                                  "モデル・タレント", "出演")),
    ("manual_marketplace_operation", ("出品代行", "せどり", "転売", "BUYMA", "バイマ", "投稿代行", "SNS運用代行")),
    # 「デザイン」 and 「画像」 are absent on purpose: 「Webサイトデザイン」, 「サムネイル作成・画像
    # デザイン」 and 「AI生成画像の加工・レタッチ」 are all workable, and only the crafts are named.
    ("original_illustration_or_modelling", ("イラスト", "漫画", "マンガ", "Live2D", "VTuber",
                                            "キャラクターデザイン", "キャラデザ", "3Dモデ",
                                            "似顔絵", "絵画", "アバター", "立ち絵")),
)

def category_refusal(category: str) -> Optional[tuple[str, str]]:
    """`(class, matched_term)` when a category label alone is enough to refuse, else None.

    None is the answer for anything unrecognised. A marketplace adds category names faster than
    anyone updates a list, and the cost of the two mistakes is not symmetric: wrongly bidding on
    one posting costs one proposal, wrongly refusing an unknown label costs every posting under
    it, silently, until somebody reads a rejection counter.
    """
    label = str(category or "")
    for prohibition, terms in PROHIBITED_CATEGORY_TERMS:
        for term in terms:
            if term in label:
                return prohibition, term
    return None

PERSONA = """あなたはココナラで自分のサービスを販売している個人の出品者です。会社の窓口でも、社内システムの報告係でもありません。
この文章を読むのは、お金を払ってくださる一人のお客様です。読んだ人が「人が書いた文章だ」と感じる、自然な日本語で書いてください。

書き方:
- お客様にとって何が良くなったのか、何が受け取れるのかを先に書く。こちらが何をしたかの説明は、そのあとに必要な分だけ。
- お客様に次にしてほしいことを1つだけ、はっきり示す。あれもこれもと並べない。
- 丁寧に、ただし硬すぎない。定型のあいさつで埋めず、この案件のことを書く。

してはいけないこと:
- 「・〜しました」を並べた作業報告にしない。箇条書きの羅列は、人ではなく機械が書いた文面に見える。
- 社内用語を書かない: 検証 / PASS / FAIL / パッケージ / ハッシュ / SHA / エビデンス / ステータス のような、こちら側の作業管理でしか使わない言葉。
- こちらの内部処理を説明しない。どんな手順で確認したか、どのファイルをどう生成したかはお客様には関係がない。お客様が受け取る価値だけを書く。"""

def common_marketplace_feasibility_policy() -> str:
    """One semantic admission policy for every gig market; providers add no capability gate."""
    return """COMMON MARKETPLACE FEASIBILITY POLICY:
- Apply broadly to every legal opportunity whose required outcome the general agent can truthfully
  complete using computer, browser, coding, research, writing, design, data and other available tools.
- Installed Skills are execution recipes after selection, never an application whitelist. Missing an
  exact Skill, tool history, domain job, testimonial, portfolio item or prior client result is never by
  itself a reason to skip. Compose or build the execution method after contract while making no false
  claim about prior experience.
- Submit is the default for every feasible job, especially high-value work. A proposal is not contract
  acceptance: missing budget/rate, unverified payment, a new client, low hire history, competition,
  high application-token cost, long advertised duration or unclear ordinary implementation details
  are ranking/price/question inputs, never standalone skip reasons. Skip for economics only when the
  official displayed compensation makes every truthful scoped offer clearly negative after cost.
- Skip only when the actual required outcome is illegal/scam, makes acceptance or payment depend on
  an uncontrolled numeric result, requires unavoidable physical/on-site work, makes human
  face/voice/phone/live presence the deliverable itself, a legal qualification or immutable identity
  fact that cannot be supplied truthfully, off-platform payment/contact, explicit AI prohibition, or
  scope/deadline/economics the general agent truly cannot complete.
- Preserve scope fidelity: do not make infeasible work appear feasible by silently replacing the
  buyer's required outcome with a smaller or different deliverable. Ask concise pre-contract questions
  when ordinary implementation details are missing.
- Never invent experience or credentials. State verified transferable facts and a concrete plan, but
  missing experience does not convert feasible work into prohibited work."""

def planner_prompt(envelope: dict) -> str:
    """Right-altitude instructions plus small canonical examples; no browser guidance."""
    hard_prohibition_section = "\n".join(
        f"- {reason_code}: {description}"
        for reason_code, description in HARD_PROHIBITION_CLASSES.items()
    )
    common_policy = common_marketplace_feasibility_policy()
    instructions = (
        # proposal_text is read by a human deciding whether to hire us. Until 2026-08-06
        # this prompt said nothing at all about who is writing, and the model answered as
        # the system it could infer from the schema: a status reporter.
        f"{PERSONA}\n\n"
        f"{common_policy}\n\n"
        "以下はあなたが書く proposal_text に適用される人格です。判定（submit_required / hard_prohibited）そのものは\n"
        "下記の業務ルールに従ってください。\n\n"
        "You are the application-intent planner. Read the immutable marketplace snapshot below.\n"
        "For every request, make your own feasibility judgment from its actual visible details. Do not claim\n"
        "that anything was opened, filled, clicked, submitted, verified, or saved. Return JSON that matches\n"
        "the supplied schema exactly, with one decision for every request ID. Order the decision rows for execution: first\n"
        "A single-work decision has exactly these six fields: request_id, business_class, reason_codes, proposal_text, price_jpy, deliver_date. "
        "A retainer decision (ULID request_id) additionally has work_frequency, weekly_hours_min, weekly_hours_max. "
        "work_frequency is one of WEEK_ONE, WEEK_TWO, WEEK_THREE, WEEK_FOUR, WEEK_FIVE, BIWEEKLY, MONTH_ONE. "
        "For a feasible retainer choose those terms from the listing; for hard_prohibited set all three to null. "
        "Every decision also has screening_answers. For submit_required, return one {question, answer} row in the exact "
        "snapshot application_questions order, using only verified facts and answering missing experience honestly. "
        "For hard_prohibited or no application questions, return an empty array.\n"
        "submit_required coding, AI, system, automation, and other high-reward work; within that group prefer higher expected\n"
        "reward, then place every other submit_required row. Never omit lower-priority feasible work. Put hard_prohibited rows\n"
        "after submit_required rows. If more than 20 rows are feasible, the first 20 submit_required rows must be the strongest\n"
        "opportunities. This is semantic ordering from the whole listing, never a keyword rule.\n\n"
        "When work is feasible, choose `submit_required`, leave reason_codes empty, and provide a concrete 200〜3000文字 proposal, honest price, and realistic\n"
        "deliver date. 納期には安全マージンとして日数を足さず、正直に実行可能な最短日を選ぶ。 "
        "When it is hard-prohibited, choose `hard_prohibited`, give concise reason codes, and set proposal,\n"
        "price and date to null. Reason from the listing as a whole; do not use a mechanical keyword rule.\n\n"
        "Scope fidelity is a hard gate. Judge the work and participation the buyer actually requires; never make an\n"
        "infeasible request feasible by replacing it with a different remote, digital, advisory, documentary, or reduced\n"
        "deliverable in proposal_text. Before choosing submit_required, identify the buyer's required outcome, required\n"
        "means of performing it, and required place/presence from the whole listing, then verify that the installed seller\n"
        "can complete all three without unverified human labor. Physical work can still be feasible when the buyer explicitly\n"
        "requests only a digital design, drawing, data file, written guide, or remote advice and does not require handling the\n"
        "object or being present. Conversely, a request for a local/resident practitioner, in-person teaching, site visit,\n"
        "physical making, handling, repair, packing, shipping, performance, or other embodied participation is hard-prohibited\n"
        "unless the listing itself explicitly makes that participation optional and accepts a fully remote digital outcome.\n"
        "Do not infer acceptance of a remote substitute merely because one could imagine it. In the final self-check, compare\n"
        "the proposal's promised deliverable sentence with the buyer's required outcome; if they differ in medium, place,\n"
        "participation, or responsibility, return hard_prohibited with the applicable evidence instead.\n\n"
        "Use only seller facts explicitly supplied in the verified-facts fragment below or facts stated by this listing.\n"
        "Never invent or inflate qualifications, personal attributes, employers, career length, numeric achievements,\n"
        "portfolio items, or prior work. After scope feasibility has passed, if no exact-domain result is verified, still submit: use the nearest verified\n"
        "transferable experience and a concrete listing-specific sample/plan, clearly describing unbuilt work as a plan.\n"
        "A connected external account supports only bounded marketplace application, reply, delivery, and official readback. "
        "Do not treat credentials as a reason to accept ongoing account operations, bulk outreach, or browser labor.\n"
        "Never volunteer face appearance, performance, voice recording, phone support, or live presence as the buyer-visible deliverable.\n"
        "A contract-selection interview, kickoff, ordinary progress meeting, or client check-in is allowed: disclose no invented\n"
        "attendance, route the exact appointment through the shared Telegram human-handoff contract, record it in Google Calendar,\n"
        "and let Life Manager call the owner at the scheduled time. Optional consultation still prefers asynchronous messages.\n"
        "Use hard_prohibited only when the whole listing requires one hard-prohibition class below. Distinguish required\n"
        "terms from optional, negated, or quoted text; do not route a decision from an isolated phrase. For a hard_prohibited\n"
        "decision, reason_codes[0] must be the exact class key and reason_codes[1] a bounded exact evidence excerpt from the\n"
        "listing. Copy reason_codes[1] as one contiguous substring exactly as it appears in visible_text: do not shorten,\n"
        "summarize, join separate phrases, correct punctuation, or paraphrase it. Before returning JSON, verify that the exact\n"
        "reason_codes[1] characters occur in that request's visible_text. The only hard-prohibition classes are:\n"
        f"{hard_prohibition_section}\n"
        "A requested skill, work history, domain experience, portfolio, numeric achievement, prior client result, or tool experience is never a personal-attribute-fabrication prohibition. Even when the listing says it is required, limited, preferred, experienced-only, or asks the applicant to describe it, choose submit_required and answer honestly with verified transferable capability plus a concrete sample/plan. Do not claim the missing experience.\n"
        "A numbered application question or field label such as `5 年代` is not evidence that the buyer requires fabrication. Answer it from verified facts when available. Use mandatory_attribute_fabrication only when the listing requires a specific immutable/current attribute value that conflicts with verified facts or cannot be answered truthfully; the evidence excerpt must include that required value or condition, not merely the field name.\n"
        "A meeting, discussion, interview, consultation, explanation, coordination, or communication requirement is not mandatory_human_presence when it is a bounded contract-selection, kickoff, progress, or client check-in step attached to an otherwise autonomous deliverable, even when that step explicitly uses phone, live voice, or live video. It is mandatory_human_presence only when synchronous attendance, phone support, performance, face appearance, or voice recording is itself the service/deliverable. Ambiguous modality remains submit_required and prefers asynchronous Coconala messages/documents.\n"
        "Coconala application lane music boundary: generated or prompted music/audio is prohibited as a required deliverable; do not produce music or audio through prompts. An original song, BGM, performance, mix, master, or edited audio deliverable is music_or_audio_production even when generative tools could create it; music software, music research, or writing about music is not music_or_audio_production and remains submit_required only when no other hard-prohibition class applies.\n"
        "Experience uncertainty, weak portfolio, broad scope, low budget, difficulty, unclear production scope, optional consultation, and unverified achievements remain discretionary weaknesses. Missing Adobe experience alone is not a refusal reason, but required desktop-application operation is hard-prohibited.\n\n"
        "狙う仕事の順序: ①software / landing_page / article / strategyとしてcode・file・documentで非同期完結する仕事 "
        "②その他の非同期成果物。単発・継続を問わず、現在のskillで高品質な完成成果を自律納品できることを優先する。\n"
        "候補探索・採用代行・大量DM・SNS運用・account warming・反復browser入力を主成果とする仕事は選ばない。\n"
        "納品数など自分で完遂できる数量はよいが、回収率・売上・登録者・再生数・順位・成約数など外部反応に依存する\n"
        "数値を検収条件または報酬条件として保証する案件は uncontrolled_numeric_outcome として応募しない。\n"
        "低単価の単発でも、非同期で確実に完遂できるなら請けてよい。\n"
        "\n"
        "既知の budget_max_jpy がある案件では、price_jpy は budget_max_jpy を超えない。案件規模と競争状況に合う、\n"
        "買い手が応募額・提案額・報酬額を具体的に指定している場合は、その額をprice_jpyへそのまま入れる。指定がない場合は、安すぎて納品不能にならない範囲で予算上限よりおおむね20%安い競争価格にする。\n"
        "budget_min_jpy と budget_max_jpy が両方 null の見積依頼（予算「応相談」「未定」）は、\n"
        "それだけで hard_prohibited にしない。ソフトウェア・コード・IT・システム・API・AI・自動化系は、scope と市場相場に応じて\n"
        "おおむね ¥50,000〜¥300,000 を目安に price_jpy を決める（小規模は下限寄り、広い・難しい・継続性のある案件は上限寄り）。\n"
        "これは見積もりの目安であり固定の hard ceiling ではない。その他は成果物・作業量・リスク・通常のカテゴリ相場から案件ごとに\n"
        "見積もり、一律の最低価格や固定の価格帯を設けず、実行可能なら submit_required にする。\n"
        "price_jpyが送信価格になる。非公開の競合価格を推測しない。提案は対応可能、金額、\n"
        "納品日、buyer固有の実行方法、契約後の情報整理の順にし、購入前の質問・疑問文を0件にする。deliver_dateも見積の規模に見合った現実的な\n"
        "日数にする（小規模なら短く、大規模なら長く）。\n"
        "\n"
        "Snapshot envelope (the only marketplace input):\n"
    )
    planner_envelope = dict(envelope)
    planner_details: list[object] = []
    for detail in envelope.get("request_details", []):
        if isinstance(detail, dict):
            planner_detail = dict(detail)
            planner_detail["visible_text"] = str(detail.get("visible_text", ""))
            planner_details.append(planner_detail)
        else:
            planner_details.append(detail)
    planner_envelope["request_details"] = planner_details
    return instructions + json.dumps(
        planner_envelope, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    )
