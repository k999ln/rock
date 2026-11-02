# 07 ソフトウェア

## 1. プロセス構成（Hub）

```text
rockstaros（AI/OS domain）                   mii-spatiald（REALTIME domain）
 ├─ runtime（identity · permission ·          ├─ capture-service   Node からの受信・復号・ROI 指示
 │   Work/Job/Receipt · sync）                 ├─ sync-service      PTP master・露光スケジュール・radar TDM
 ├─ eve / noa / amc / jev                      ├─ radar-service
 ├─ local-llm                                  ├─ audio-service     8ch ビームフォーミング・ウェイクワード
 ├─ game-runtime（lib/game-*）                 ├─ perception-service 2D 姿勢・頭ランドマーク・物体
 ├─ display-scene（何を見せるか）              ├─ fusion-service    三角測量・骨格ソルバ・radar fusion
 └─ spatial-bridge ◄──── spatial-bus ────────  ├─ viewer-service    6DoF 頭・両眼・予測 → ViewerPose
         (shared-memory ring, zero-copy)       ├─ room-service      Room Model・投影面・校正
                                               ├─ render-service    off-axis 描画・ワープ・影回避 → HDMI
                                               └─ spatial-bus       SpatialFrame の配信
```

- 同一ホストは shared-memory ring buffer。PoseごとにJSONを投げない。
- Remote（遠隔プレイ・cloud）だけ FlatBuffers で serialize。
- REALTIME は Linux PREEMPT_RT または専用コア固定。AI/OS が落ちても REALTIME は動く（01 §5）。
- 実装言語: REALTIME は C++/Rust、AI/OS は既存 RockstarOS（TypeScript runtime ＋ Python）。

## 2. データ型

```cpp
struct ViewerPose {            // 表示 API の中心（120Hz）
  Vec3 left_eye_world, right_eye_world;
  Vec3 head_position; Quat head_rotation;
  Vec3 linear_velocity, angular_velocity;
  uint64_t predicted_display_time_ns;
  float confidence;             // 0: 消失（最後の値を保持し、表示は安全側）
};

struct Observation {           // Node ごと（内部）
  uint64_t frame_id, timestamp_ns; uint8_t node_id;
  std::array<Keypoint2D,133> keypoints;   // COCO-WholeBody 133 点
  RadarFrame radar;
};

struct SpatialFrame {          // spatial-bus に流す世界（120Hz）
  uint64_t frame_id, capture_time_ns;
  ViewerPose viewer;
  Body bodies[MAX_USERS];       // 3D 関節・速度・骨長制約済み・信頼度
  Object objects[MAX_OBJECTS];  // 道具・マーカー・家具
  RadarTrack radar_tracks[MAX_TRACKS];
  RoomModelRef room;            // 壁・床・投影面（変化時のみ更新）
  uint8_t node_count, node_mask;  // 本数可変: 今使えている Node
};
```

## 3. 追跡パイプライン

1. **2D**: 全 Node の NIR（ビニング）で全身 133 点、頭 ROI（フル解像度）で顔・眼ランドマーク。
2. **視点選択**: 関節ごとに visibility・再投影誤差・視角・遮蔽確率から 2–4 Node を選ぶ。1 台しか見えない関節は radar と運動学で予測を維持し、信頼度を下げる。
3. **三角測量**: 選んだ Node の P_i で最小二乗 → 骨長制約 → 関節角制約 → 時間フィルタ → 運動学予測。
4. **本人プロファイル**: 初回 10 秒（正面に立つ・腕を広げる・左右を向く）で骨長を取り、account に保存（docs/structure/02: account に紐づく）。
5. **頭**: 独立パイプライン。両眼中心推定 → 表示時刻へ予測 → ViewerPose。Body AI が失敗しても頭は落とさない。
6. **radar fusion**: カメラが見失った腕を radar の移動クラスタで継続。カメラの「人影」を radar が否定したら投影像のゴーストとして除外。
7. **複数人**: 本人（account でログインした人、顔で認識）を viewer とし、他の人は bodies に入れる。表示は viewer 1 人に合わせる。

## 4. Spatial API（公開。ゲーム・サービス開発者はセンサーを知らない）

```typescript
interface SpatialWorld { room: RoomModel; humans: Human[]; objects: SpatialObject[]; viewer: ViewerPose; nodeCount: 1|2|3|4|8; quality: 'presence'|'pose2d'|'pose3d'|'pose3d_robust'|'full'; }
interface Human { id: string; joints: Record<JointName, Joint>; velocity: Vec3; confidence: number; isViewer: boolean; }
// 便利関数（lib/mii-spatial-api.ts）
getJointAngle(player, 'right_knee'); getFootPosition(player, 'LEFT'); getBodyRotation(player);
getWeaponTrajectory(player); getFingerRay(player); getClubTrajectory(player);
world.quality  // 09 章: 本数で変わる。ゲームは quality を見て機能を出し分ける
```

- 既存 `lib/mii-*.ts`（3 本）を `lib/mii/spatial-api.ts`, `lib/mii/viewer.ts`, `lib/mii/room.ts` に整理（codex task 22）。
- Game runtime（lib/game-*）はこの API だけを見る。Monitor 版 → Projector 版 → Spatial Display 版と表示を差し替えても API は同じ。

## 5. RockstarOS との接点

[声・指先の限定入力実装](../../avocado-mini-r5/spatial-computer-use-design.md#voice-point-edit)は同じ仕事の依頼内容を確認・CAS保存・読戻しする。既存CameraSessionを使う2D pointerであり、下記SpatialFrameやspatialdの実装・校正・offline保存の証明ではない。

| 機能 | どこ |
| --- | --- |
| 本人認識（顔→account） | viewer-service が顔埋め込みを出し、rockstaros runtime の identity が照合。生画像は出さない |
| 権限 | 「部屋を見る」「録画する」「遠隔に骨格を送る」は permission。Broker が本人承認を持つ |
| 仕事（ヨガ矯正・工場保守…） | docs/services/<name>.md の書式（docs/structure/04 §3）。SpatialFrame は Work の入力型 |
| 遠隔プレイ | 送るのは骨格・向き・手足・衝突体積＋timestamp（映像は送らない）。相手側で Avatar 再生成。50 ms の通信遅延は Pose Prediction で吸収。HAND_CONTACT 等のイベントは server authoritative |
| Receipt | ヨガのセッション・工場の手順完了は Receipt に残す（誰が・いつ・何を） |
| オフライン | Hub の local LLM と cache で動く。復帰時に Receipt 同期（重複防止キー） |
| 表示 scene | AI/OS の display-scene が「何を見せるか」を決め、render-service が「どこにどう描くか」を決める |

## 6. 本数可変のソフト側

- Node の増減は hot-plug。sync-service が PTP 参加と露光スケジュールを更新、fusion-service が node_mask を更新、API の quality が変わる。
- 未校正 Node が繋がったら room-service が増設校正を促す（08 章）。校正完了まで fusion には入れない。
- Node 故障（露光 skew 超過・温度・IMU 転倒）は即 mask から外し、本人へ通知。表示は止めない。
