/** Explicit-start camera session with one in-flight frame and finite lifetime. */
export class CameraSession {
  constructor({video, mediaDevices, createWorker, bitmap, schedule, cancelSchedule,
    clock = () => performance.now(), onFrame = () => {}, onStatus = () => {},
    fps = 15, maxFrames = 4500, maxDurationMs = 300000, frameTimeoutMs = 1500} = {}) {
    if (!video || !mediaDevices || ![createWorker,bitmap,schedule,cancelSchedule,clock,onFrame,onStatus].every(x=>typeof x==='function')
      || !Number.isInteger(fps) || fps<1 || fps>30 || !Number.isInteger(maxFrames) || maxFrames<1 || maxFrames>9000
      || !Number.isInteger(maxDurationMs) || maxDurationMs<100 || maxDurationMs>300000
      || !Number.isInteger(frameTimeoutMs) || frameTimeoutMs<100 || frameTimeoutMs>3000) throw Error('invalid_camera_configuration');
    Object.assign(this,{video,mediaDevices,createWorker,bitmap,schedule,cancelSchedule,clock,onFrame,onStatus,
      fps,maxFrames,maxDurationMs,frameTimeoutMs});
    this.generation=0;this.state='idle';this.stream=null;this.worker=null;this.ticket=null;this.pending=null;
    this.timers=new Set();this.waiters=new Set();
  }
  bounded(promise, ms) {
    let timer, rejectWait;
    const timeout=new Promise((_,reject)=>{
      rejectWait=reject;this.waiters.add(reject);
      timer=setTimeout(()=>reject(Error('camera_timeout')),ms);this.timers.add(timer);
    });
    return Promise.race([promise,timeout]).finally(()=>{clearTimeout(timer);this.timers.delete(timer);this.waiters.delete(rejectWait);});
  }
  alive(gen) { return this.generation===gen && this.state!=='idle'; }
  async start() {
    if(this.state!=='idle')throw Error('camera_already_active');
    const gen=++this.generation;this.state='loading';this.onStatus('loading');
    try {
      this.worker=this.createWorker();
      await this.bounded(new Promise((resolve,reject)=>{
        this.worker.onerror=()=>reject(Error('model_unavailable'));
        this.worker.onmessage=({data})=>{
          if(!this.alive(gen))return;
          if(data?.type==='ready')resolve();
          else if(data?.type==='error')reject(Error('model_unavailable'));
        };
        this.worker.postMessage({type:'init'});
      }),15000);
      if(!this.alive(gen))throw Error('camera_stopped');
      this.state='permission';this.onStatus('permission');
      const requested=this.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:this.fps,max:30}}})
        .then(stream=>{if(!this.alive(gen)){stream.getTracks().forEach(track=>track.stop());throw Error('camera_stopped');}return stream;});
      const stream=await this.bounded(requested,10000);
      if(!this.alive(gen)){stream.getTracks().forEach(track=>track.stop());throw Error('camera_stopped');}
      this.stream=stream;
      this.video.srcObject=this.stream;
      for(const track of this.stream.getTracks())track.onended=()=>{if(this.alive(gen))this.stop('camera_ended');};
      await this.bounded(Promise.resolve(this.video.play()),3000);
      if(!this.alive(gen))throw Error('camera_stopped');
      this.state='running';this.sent=0;this.lastSent=-Infinity;this.startedAt=this.clock();
      this.worker.onerror=()=>{if(this.alive(gen))this.stop('tracking_failed');};
      this.worker.onmessage=({data})=>{
        if(!this.alive(gen))return;
        if(data?.type==='error'){this.stop('tracking_failed');return;}
        if(data?.type!=='frame' || !this.pending || data.id!==this.pending.id || data.timestampMs!==this.pending.timestampMs){this.stop('invalid_tracking_response');return;}
        clearTimeout(this.pending.timer);this.timers.delete(this.pending.timer);this.pending=null;
        const now=this.clock();
        if(!Number.isFinite(now) || now<this.startedAt || now<data.timestampMs){this.stop('clock_invalid');return;}
        if(now-this.startedAt>=this.maxDurationMs){this.stop('session_limit');return;}
        if(now-data.timestampMs>this.frameTimeoutMs){this.stop('stale_tracking_response');return;}
        try{this.onFrame({timestampMs:data.timestampMs,hands:data.hands});}catch{this.stop('consumer_failed');}
      };
      this.onStatus('running');this.ticket=this.schedule(()=>this.loop(gen));
    } catch(error) {
      if(this.alive(gen))this.stop('start_failed');
      throw error;
    }
  }
  async loop(gen) {
    if(!this.alive(gen) || this.state!=='running')return;
    const now=this.clock();
    if(!Number.isFinite(now) || now<this.startedAt || now<this.lastSent){this.stop('clock_invalid');return;}
    if(now-this.startedAt>=this.maxDurationMs || this.sent>=this.maxFrames){this.stop('session_limit');return;}
    this.ticket=this.schedule(()=>this.loop(gen));
    if(this.pending || now-this.lastSent<1000/this.fps || this.video.readyState<2)return;
    const id=++this.sent;this.lastSent=now;
    const timer=setTimeout(()=>{if(this.alive(gen))this.stop('frame_timeout');},this.frameTimeoutMs);
    this.timers.add(timer);this.pending={id,timestampMs:now,timer};
    let frame;
    try {
      frame=await this.bitmap(this.video);
      if(!this.alive(gen) || this.pending?.id!==id){frame.close();return;}
      this.worker.postMessage({type:'frame',id,timestampMs:now,bitmap:frame},[frame]);
      frame=null; // Ownership transferred; worker closes it after inference.
    }catch{frame?.close();if(this.alive(gen))this.stop('frame_failed');}
  }
  stop(reason='stopped') {
    ++this.generation;
    for(const reject of this.waiters)reject(Error('camera_stopped'));
    this.waiters.clear();for(const timer of this.timers)clearTimeout(timer);this.timers.clear();
    if(this.ticket!==null)this.cancelSchedule(this.ticket);this.ticket=null;
    if(this.stream)for(const track of this.stream.getTracks()){try{track.onended=null;track.stop();}catch{}}
    this.stream=null;this.video.srcObject=null;this.video.pause?.();
    this.worker?.terminate();this.worker=null;this.pending=null;this.state='idle';this.onStatus(reason);
  }
}
