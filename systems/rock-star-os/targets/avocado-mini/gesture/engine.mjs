/** Untrusted single-camera landmarks -> view-only gesture proposals.
 * No physical units, identity, emotion, approval, graph writes or device effects.
 * Handedness scores are NOT tracking confidence and never authorize an action.
 */
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
const validHand = (hand) => hand && ['Left', 'Right'].includes(hand.handedness)
  && Array.isArray(hand.landmarks) && hand.landmarks.length === 21
  && hand.landmarks.every((p) => p && finite(p.x) && finite(p.y) && finite(p.z)
    && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1 && Math.abs(p.z) <= 2);

export class GestureEngine {
  constructor({sessionId, sceneRevision, stableFrames = 3, maxGapMs = 200} = {}) {
    if (typeof sessionId !== 'string' || !/^[a-z0-9-]{1,64}$/.test(sessionId)
      || !Number.isSafeInteger(sceneRevision) || sceneRevision < 0
      || !Number.isInteger(stableFrames) || stableFrames < 2 || stableFrames > 8
      || !Number.isInteger(maxGapMs) || maxGapMs < 50 || maxGapMs > 500) throw Error('invalid_gesture_configuration');
    Object.assign(this, {sessionId, sceneRevision, stableFrames, maxGapMs});
    this.sequence = 0; this.lastTime = -1; this.active = null; this.candidate = null;
    this.count = 0; this.lastHand = null; this.lastPoint = null; this.stopped = false;
  }
  event(kind, phase, data = {}) {
    return {schema: 'mini-gesture-preview/1', sessionId: this.sessionId, sceneRevision: this.sceneRevision,
      sequence: ++this.sequence, kind, phase, data, scope: 'VIEW_ONLY',
      calibrated: false, physicalExecutionAllowed: false, approvalGranted: false, preferenceInferred: false};
  }
  cancel(reason = 'cancelled') {
    const event = this.active ? this.event('select', 'CANCEL', {reason}) : null;
    this.active = null; this.candidate = null; this.count = 0; this.lastHand = null; this.lastPoint = null;
    return event ? [event] : [];
  }
  changeScene(revision) {
    if (!Number.isSafeInteger(revision) || revision <= this.sceneRevision) throw Error('scene_revision_must_increase');
    const events = this.cancel('scene_changed'); this.sceneRevision = revision; return events;
  }
  frame(frame) {
    if (!frame || !finite(frame.timestampMs) || frame.timestampMs < 0 || frame.timestampMs <= this.lastTime) {
      return this.cancel('invalid_or_reordered_frame');
    }
    const gap = this.lastTime >= 0 && frame.timestampMs - this.lastTime > this.maxGapMs;
    this.lastTime = frame.timestampMs;
    if (gap) return this.cancel('tracking_gap');
    if (!Array.isArray(frame.hands) || frame.hands.length !== 1 || !validHand(frame.hands[0])) {
      this.stopped = false; return this.cancel('hand_missing_or_ambiguous');
    }
    const hand = frame.hands[0], p = hand.landmarks;
    const width = distance(p[5], p[17]);
    if (width < .035 || width > .6) return this.cancel('hand_geometry_unusable');
    const point = {x: (p[4].x + p[8].x) / 2, y: (p[4].y + p[8].y) / 2};
    if ((this.lastHand && this.lastHand !== hand.handedness)
      || (this.lastPoint && distance(point, this.lastPoint) > .2)) return this.cancel('tracking_continuity_lost');
    this.lastHand = hand.handedness; this.lastPoint = point;
    const ratio = distance(p[4], p[8]) / width;
    const open = [8,12,16,20].every((tip) => distance(p[tip],p[0]) > 1.15 * distance(p[tip-2],p[0]))
      && distance(p[4],p[8]) > width * .55;
    const pose = open ? 'stop' : ratio < (this.active ? .45 : .28) ? 'pinch' : 'release';
    this.count = this.candidate === pose ? this.count + 1 : 1; this.candidate = pose;
    if (pose !== 'stop') this.stopped = false;
    if (pose === 'stop' && this.count >= this.stableFrames && !this.stopped) {
      const events = this.cancel('palm_stop'); this.stopped = true;
      return [...events, this.event('stop','CANCEL',{reason:'palm_stop'})];
    }
    if (pose === 'pinch') {
      if (!this.active && this.count >= this.stableFrames) {
        this.active = {point, angle: angle(p[0],p[9])};
        return [this.event('select','BEGIN', {x:point.x,y:point.y})];
      }
      if (this.active) return [this.event('transform','UPDATE', {
        dx: point.x - this.active.point.x, dy: point.y - this.active.point.y,
        rotationRadians: wrap(angle(p[0],p[9]) - this.active.angle)})];
    }
    if (pose === 'release' && this.active && this.count >= this.stableFrames) {
      this.active = null;
      return [this.event('select','END')]; // Ends only a local view gesture; never a Core COMMIT.
    }
    return [];
  }
}
