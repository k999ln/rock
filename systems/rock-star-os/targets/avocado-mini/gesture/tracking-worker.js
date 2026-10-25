importScripts('./runtime/node_modules/@mediapipe/tasks-vision/vision_bundle.js');
const {HandLandmarker, FilesetResolver} = Vision;
let detector = null;
self.onmessage = async ({data}) => {
  if (data.type === 'init') {
    try {
      const wasm = await FilesetResolver.forVisionTasks(new URL('./runtime/node_modules/@mediapipe/tasks-vision/wasm',self.location.href).href);
      detector = await HandLandmarker.createFromOptions(wasm, {
        baseOptions: {modelAssetPath: new URL('./runtime/models/hand_landmarker.task',self.location.href).href,delegate:'CPU'},
        runningMode:'VIDEO', numHands:2, minHandDetectionConfidence:.7, minHandPresenceConfidence:.7, minTrackingConfidence:.7});
      self.postMessage({type:'ready'});
    } catch { self.postMessage({type:'error',reason:'model_unavailable'}); }
    return;
  }
  if (data.type !== 'frame') return;
  try {
    if (!detector) throw Error('not_ready');
    const result = detector.detectForVideo(data.bitmap, data.timestampMs);
    self.postMessage({type:'frame',id:data.id,timestampMs:data.timestampMs,
      hands:result.landmarks.map((points,i) => ({handedness:result.handedness[i]?.[0]?.categoryName,
        landmarks:points.map(({x,y,z})=>({x,y,z}))}))});
  } catch { self.postMessage({type:'error',reason:'tracking_failed'}); }
  finally { data.bitmap?.close(); }
};
