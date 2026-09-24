from pathlib import Path
import json,csv,shutil,hashlib
R=Path(__file__).resolve().parents[2]; W=R/'work/colony_v1'; P=R/'outputs/RockstarOS_Colony_C0_1'
P.mkdir(exist_ok=True)
def write(name,data):
    (P/name).parent.mkdir(parents=True,exist_ok=True)
    (P/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
for name in ['runtime','contracts']:
    shutil.copytree(W/name,P/name,dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__','*.pyc','*.sqlite*','test-evidence'))
for name in ['os_inventory.md','os_inventory.json','habitat_architecture.md','sources.json']:
    shutil.copy2(W/name,P/name)
(P/'evidence').mkdir(exist_ok=True)
for name in ['test_results.json','test_results.txt','process_evidence.json']:
    shutil.copy2(W/'qa/final'/name,P/'evidence'/name)
shutil.copy2(W/'qa/demo/demo.json',P/'evidence/demo.json')
sources=json.loads((P/'sources.json').read_text())
sources['sources'].append({'id':'S9','title':'Gateway Deep Space Logistics','publisher':'NASA','url':'https://www.nasa.gov/gateway-deep-space-logistics/','verified_paraphrase':'NASA describes deep-space logistics as transportation of cargo, equipment and consumables.','design_inference':'Separate launch injection, cargo transfer, receiving, and equipment commissioning in the project.','limits':'This does not establish available cargo capacity, a vehicle selection, or a mission schedule for this project.'})
write('sources.json',sources)
write('mission_profile.json',{'schema':'rockstaros-colony-mission-profile/1','version':'C0.1','mission':{'destination':None,'initialOccupants':None,'maximumOccupants':None,'stayDurationDays':None,'resupplyIntervalDays':None,'resupplyOutageDays':None,'evacuationProfile':None,'orbitOrSite':None,'initialCargoManifest':None,'launchAndRecoverySites':None},'nullMeans':'Decision and supporting engineering are still required, not zero demand.','initialDevelopmentAssumption':{'kind':'uncrewed_ground_software_fixture','occupants':0,'notFinalMissionSelection':True},'simulation':{'mode':'SIM_ONLY','sourceClass':'SYNTHETIC','hardwareConnected':False,'supplyKw':10,'criticalDemandKw':4,'exampleFlexibleDemandKw':5,'meaning':'branch-coverage fixture, not habitat or avokado sizing'},'operationalRelease':{'hardware':False,'humanHabitation':False,'flight':False,'existingRockstarOsIntegration':False}})
rows=[]
def req(n,title,status,evidence,remaining):
    rows.append({'id':f'COL-{n:02d}','requirement':title,'verificationStage':status,'evidence':evidence,'remainingForRealSystem':remaining,'hardwareVerified':False})
T=lambda n:'test_core.ColonyContractTests.test_'+n
req(1,'RockstarOSを現地の設備・仕事・資源・通信の運用核にする','DESIGN_ONLY',[],'既存OSへの登録・Adapter・実設備データの統合')
req(2,'Coreのプロセス停止後も局所制御を進める','SIM_TESTED',['test_process.ProcessSeparationTests.test_local_ticks_continue_after_supervisor_killed'],'同一host上の模型のみ。独立電源・OS・設備保護を実証')
req(3,'AIの提案と操作者の承認を分ける','SIM_TESTED',[T('planner_proposal_cannot_approve_or_dispatch')],'fixture actor検査のみ。本人確認・AI/署名鍵/Controllerの実隔離')
req(4,'承認を命令内容全体に結び付ける','SIM_TESTED',[T('approval_requires_exact_full_command_digest'),T('changed_stored_body_is_not_approved_for_dispatch')],'実OSの権限・署名サービスと接続')
req(5,'期限切れの新規要求を適用しない','SIM_TESTED',[T('controller_independently_rejects_expired_direct_command'),T('expired_queued_command_never_reaches_controller')],'時刻源・不確かさ・機器期限の検証')
req(6,'同一ID同一内容の再到着で再作用しない','SIM_TESTED',[T('exact_replay_survives_controller_reboot_without_reapplying'),T('same_id_changed_payload_conflicts_after_reboot')],'物理作用の照合、長期receipt保持と履歴破損の扱い')
req(7,'設備再起動後に旧世代の新規要求を拒否','SIM_TESTED',[T('reboot_fences_old_unapplied_generation')],'実装機で起動・停電・復元を確認')
req(8,'単一の監督制御権とepochを設備で判定','SIM_TESTED',[T('exclusive_authority_cas_and_epoch_fence')],'認証されたlease発行、分断・自動切替・複数実機試験')
req(9,'期待する設備状態の版を受信時に照合','SIM_TESTED',[T('state_revision_change_rejects_old_command')],'実設備Adapterの状態版と原子的判定')
req(10,'供給変動を局所で再評価し不足を明示','SIM_TESTED',[T('local_resource_budget_is_checked_even_for_signed_fixture'),T('supply_drop_curtails_then_reports_critical_deficit')],'実電気・蓄電・起動過渡・損失・故障試験')
req(11,'監督権失効時も重要負荷を優先','SIM_TESTED',[T('lease_expiry_curtails_local_flexible_load_without_broker')],'設備ごとの許可プロファイルと継続可能時間')
req(12,'古い観測を現在の正常値として使わない','SIM_TESTED',[T('stale_telemetry_blocks_refresh_and_prepare')],'全センサーの時刻・品質・校正・欠測検査')
req(13,'時計異常時に新規指令を止め局所計算を継続','SIM_TESTED',[T('clock_rollback_locally_curtails_and_revokes_authority'),T('nonfinite_clock_preserves_local_priority_and_latches_untrusted')],'時刻再認定手順、独立時計、実時間期限')
req(14,'応答喪失後に再起動しても結果照合を優先','SIM_TESTED',[T('lost_receipt_restart_reconciles_without_resend')],'実トランスポート・機器receiptの照合')
req(15,'送信claim後の停止を結果不明として保持','SIM_TESTED',[T('presend_durable_claim_crash_stays_unknown_with_no_resend')],'物理作用の有無を読出せない機器の現地手順')
req(16,'未送信の承認を再起動後に自動実行しない','SIM_TESTED',[T('restart_cancels_prepared_and_queued')],'実OS仕事との状態連携')
req(17,'模擬設定とreceiptを一括保存する','SIM_TESTED',[T('receipt_insert_failure_rolls_back_desired_state_and_revision')],'物理作用との非原子的境界、全損/破損/停電')
req(18,'対象・モード・型が違う命令を拒否','SIM_TESTED',[T('authenticated_wrong_domain_mode_or_source_rejected'),T('critical_equipment_operation_cannot_be_expressed'),T('extra_envelope_fields_and_digest_mismatch_fail_closed')],'全設備操作を有限の型で登録し境界試験')
req(19,'異なる/壊れた結果を成功と扱わない','SIM_TESTED',[T('wrong_receipt_cannot_be_marked_succeeded'),'test_contract_edges.ReceiptEdgeTests.test_non_json_receipt_leaves_result_uncertain'],'機器身元認証、返却結果の完全な契約検証')
req(20,'設定反映と観測された動作を区別','SIM_TESTED',[T('explicit_prepare_exact_approve_dispatch_and_local_step')],'実機結果・監視観測と仕事合格の接続')
req(21,'3種のJSON Schemaを厳格に定義する','DESIGN_ONLY',['contracts/static_validation.json'],'標準validatorはNOT_RUN。実行時の全schema適合検証を追加')
req(22,'独立保護と局所操作をCore/UI/WANから分離','DESIGN_ONLY',['habitat_architecture.md:H-V01-H-V12'],'故障原因分析、実配線・電源・保護・警報の試験')
req(23,'人数と環境に基づく資源容量を持つ','OPEN',[],'ミッション入力、空気/水/電力/熱/廃棄物の量と故障予備')
req(24,'更新・復元で旧設備権限を復活させない','DESIGN_ONLY',['os_inventory.md'],'既存基盤の統合、機器署名更新、中断/全損復旧')
req(25,'キュー・記録・監査に上限と優先度を持つ','DESIGN_ONLY',[],'容量測定、満杯・破損・遅延・長期断線試験')
req(26,'個人データと設備操作の権限を分離','DESIGN_ONLY',[],'本物の認証/認可、鍵基盤、保存・失効・監査')
req(27,'貨物を検収後だけ使用可能在庫に加える','DESIGN_ONLY',[],'Manifest実装、物理ID、検収・隔離・commissioning試験')
req(28,'ロケット→貨物船→拠点の引渡しを分ける','DESIGN_ONLY',[],'ミッション軌道、貨物船、係留、位置/速度/荷重/熱ICD')
req(29,'rocketstarの両段回収と再使用を成立させる','OPEN',['baseline_reference.json'],'C3未確定項目、推進・構造・熱・帰還・整備と実飛行')
req(30,'A-LINKの通信範囲と性能を実証する','OPEN',[],'RF予算、周波数/波形、地上局、見通し、相互接続、必要衛星数')
req(31,'遅延リンクの転送と設備結果を分離','DESIGN_ONLY',['sources.json:S6-S8'],'BPv7/BPSec/CCSDSプロフィール選定と適合/相互接続')
req(32,'avokado E3を操作窓口として接続','DESIGN_ONLY',['os_inventory.md'],'実Shell、Hub/Coreアダプター、認証、表示・欠測・回線切替試験')
req(33,'ミッション未決定値を実定格として配布しない','DESIGN_ONLY',['mission_profile.json'],'場所・人数・滞在・補給・退避・輸送拠点の決定')
req(34,'実機の継続運転と有人移行条件を検証','OPEN',['habitat_architecture.md:H-V12'],'応答・容量・保護・故障・保守・補給・避難・適合性評価')
req(35,'既存RockstarOSの仕事と指令状態を整合','DESIGN_ONLY',['os_inventory.md'],'sample専用template、UNCERTAIN中active、証拠の受入を統合')
req(36,'無人小型衛星輸送と有人輸送を区別','DESIGN_ONLY',[],'有人機/避難機を別の要求・設計・検証へ分離')
results=json.loads((P/'evidence/test_results.json').read_text());ids={x['id'] for x in results['cases'] if x['status']=='PASS'}
for row in rows:
    if row['verificationStage']=='SIM_TESTED':assert row['evidence'] and all(e in ids for e in row['evidence'])
write('requirements.json',{'schema':'rockstaros-colony-requirements/1','version':'C0.1','statusMeaning':{'SIM_TESTED':'Only listed synthetic behavior tested; hardwareVerified remains false.','DESIGN_ONLY':'Contract or architecture proposed, not deployed.','OPEN':'Mission/hardware evidence needed.'},'items':rows})
with (P/'requirements.csv').open('w',newline='',encoding='utf-8-sig') as f:
    writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader()
    for row in rows:writer.writerow({**row,'evidence':'; '.join(row['evidence'])})
base=R/'outputs/rocketstar_C3_Integrated_Design_Baseline.pdf'
write('baseline_reference.json',{'design':'rocketstar C3','sourceAbsolutePath':str(base),'sha256':hashlib.sha256(base.read_bytes()).hexdigest(),'notIncludedAsRevisedDesign':True,'formerRocketName':'RETURN-1','namingRevisionDate':'2026-09-24','changesToPerformance':False,'manufacturingRelease':False,'flightRelease':False,'note':'C0.1 adds colony system interfaces; does not close C3 physical engineering gaps.'})
(P/'README.md').write_text('''# RockstarOS Colony C0.1

コロニーをRockstarOSで運用するための全体設計と、限定したソフトウェア模型です。

最初に `RockstarOS_Colony_C0_1_Integrated_Design.pdf` を開いてください。編集用本文は同名のMarkdownです。36要求の根拠・残作業は requirements.json / csv、場所・人数等の未入力は mission_profile.json で管理します。

## 何が入っているか

- 統合設計書、3点の構成図、要求台帳、ミッション入力、C3参照
- 既存OS監査（14能力/9不足領域）、設備アーキテクチャ、一次資料9件
- 3つのJSON Schema、静的例、標準validator未実行の記録
- Python標準ライブラリのSIM_ONLYコード、障害試験、35件合格の記録、8場面のデモ記録
- 内容ハッシュのmanifest.json

## 到達していないもの

既存RockstarOSへの組込み、実機ドライバー、実無線、生命維持、構造・熱・推進設計の完成、ロケットの飛行、コロニーの建設・居住適合。実行対象は合成電力だけです。public fixture MACとactor文字列は本物の認証ではなく、同一プロセスからControllerを呼べる模型です。

## 動かす

Python 3.10以上を想定、今回の実行記録はPython 3.12.14です。標準ライブラリのみを使います。ターミナルでこのフォルダーのruntimeへ移動して実行します。

```bash
python3 run_checks.py ../new-test-evidence
python3 -m colony_core demo --output ../new-demo-evidence
```

デモの出力先は新しいディレクトリにしてください。既存SQLite履歴のある場所は上書きしません。テストは一時DBと子プロセスのみを作り、機器・無線・外部サービスを呼びません。Schemaの標準検証には別途jsonschemaパッケージが必要です。本版では未導入・未実行を記録しています。

`SUCCEEDED`は模擬の希望負荷設定を保存した意味です。物理機器が動いた意味ではありません。実際の模擬出力は次の局所stepから得るtelemetryで確認します。古いreceiptも現在の設定を保証しません。

## 実OSへの接続順

1. SIM専用仕事テンプレートと dev.rock.colony.supervisor を登録する。
2. 観測・提案・承認・送信・照合を既存Platform/仕事記録へつなぐ。
3. AI/端末と署名・設備Adapterを権限分離し、実本人確認・鍵・時刻基盤を実装する。
4. 合成結果を実作業合格に数えず、Core停止・分断・再起動を既存OS上で試す。
5. 地上無人の非危険設備を選び、物理ICDと試験を先に整える。

原repo、C3の外観・性能台帳はこのパッケージで変更していません。
''')
print(json.dumps({'requirements':len(rows),'tests':results['testsRun'],'package':str(P)},ensure_ascii=False))
