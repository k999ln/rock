# Camera hand input -> existing ephemeral local draft

Source only, **not executed with model or camera**. The owner requires no plate or membrane at the intended image location. Image hand input does not solve optical visibility.

The observer uses the official MediaPipe Python HandLandmarker VIDEO API on an exact Linux V4L2 camera. Use an already installed, reviewed SDK/OpenCV and already supplied model, with exact package versions and model SHA256 in a private copy of `../linux/hand-profile.template.json`. No installation or model download is performed by this source. Camera model, consumption, OS/BSP support and physical error are not accepted.

```sh
node --experimental-strip-types systems/rock-star-os/targets/avocado-mini/spatial/hand-preview-host.mjs \
  --allow-local-capture --allow-local-draft-only PRIVATE_HAND_PROFILE
```

This explicit local command starts a fixed observer child, accepts at most100 frames with a12-second timeout and1.5-second kill grace, and reuses `createLocalDraftApp` from the existing spatial runtime. Raw images are not written/uploaded; hand landmarks stay in the process pipe. Do not save private camera/profile/model data or hand observations to Git.

Only image-normalized x/y are used. MediaPipe's predicted world coordinates are not a measured camera-to-room transform and are deliberately not promoted to one. The existing synthetic spatial-ray path is unchanged. This is a2D image gesture for a small local draft, not a calibrated spatial tap or Eve/Smith Tool execution.

Gesture preview: one hand, valid central image position and plausible palm span -> open for180ms -> arm preview -> pinch below.25 palm-width ratio for60ms -> drag preview -> release above.45 ratio -> relative translation proposal. The host applies the proposal to the existing in-memory draft by revision and reads the result back. The thresholds are tuning candidates and require user/device qualification. A model's handedness score is not interpreted as identity or physical position confidence.

Hand loss, two hands, a large track jump, edge/scale ambiguity or a retrieval gap >100ms cancel the gesture. Malformed, stale, replayed or changed profile/model/place observations revoke the reader. Camera buffer retrieval and inference timing are bounded but do not establish actual exposure time or accuracy. The100ms source age may reject slow inference; no performance result is claimed.

No external app write, persisted work/job, AI call, charge, GPIO/optical power enable or pixel submission is implemented by this CLI. The earlier Go/D405 observer remains a separate hardware observation path; RGB/depth exposure alignment and a calibrated fusion step are not implemented. Neither source may grant the other physical or action acceptance.

For actual spatial operation: accept exact camera/depth synchronization and intrinsic/extrinsic error, hand identity continuity, target selection/occlusion, optical binocular visibility, measured comfort mode and independent stop, then use the existing Broker/workflow with actual action readback and persistence.
