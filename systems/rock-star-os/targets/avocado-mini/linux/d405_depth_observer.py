"""Device-bound passive D405 depth observer. No hand inference or action authority.
Source API profile: RealSense SDK 2.56.5; not installed/executed on the current host.
"""
import argparse,hashlib,importlib.metadata,json,math,os,re,signal,sys,time,uuid
from pathlib import Path

def require(ok,message):
    if not ok:raise ValueError(message)

def main(args):
    require(args.allow_local_capture,'Explicit local camera approval required')
    require(sys.platform.startswith('linux'),'Linux host required for this recorded integration profile')
    path=Path(args.profile);st=path.stat();require(st.st_uid==os.getuid() and not st.st_mode&0o022 and st.st_size<=32768,'Owner-controlled profile required')
    raw=path.read_bytes();p=json.loads(raw)
    require(p.get('schema')=='rockstaros.d405-observer-profile/1' and p.get('model')=='D405','D405 profile required')
    require(isinstance(p.get('serial'),str) and re.fullmatch(r'[A-Za-z0-9_-]{1,64}',p['serial']),'Exact received-device serial required')
    require(isinstance(p.get('calibrationId'),str) and 0<len(p['calibrationId'])<=120 and type(p.get('placeEpoch'))is int and p['placeEpoch']>=0,'OS calibration/place binding required')
    require(type(p.get('expiresUnixMs'))is int and time.time()*1000<p['expiresUnixMs'],'Profile expired')
    pixels=p.get('samplePixels');require(isinstance(pixels,list) and 1<=len(pixels)<=16 and all(isinstance(v,list) and len(v)==2 and all(type(x)is int for x in v) and 0<=v[0]<1280 and 0<=v[1]<720 for v in pixels),'Bounded depth pixels required')
    version=importlib.metadata.version('pyrealsense2');require(version=='2.56.5' or version.startswith('2.56.5.'),'Requalify SDK versions outside selected 2.56.5 API profile')
    import pyrealsense2 as rs
    ctx=rs.context();devices=[d for d in ctx.query_devices() if d.get_info(rs.camera_info.serial_number)==p['serial']]
    require(len(devices)==1 and re.search(r'\bD405$',devices[0].get_info(rs.camera_info.name)),'Exact D405 not present')
    sensor=devices[0].first_depth_sensor()
    def keep_passive():
        for name in ['emitter_enabled','laser_power']:
            option=getattr(rs.option,name,None)
            if option is not None and sensor.supports(option):
                sensor.set_option(option,0);require(sensor.get_option(option)==0,'Emitter disable readback failed')
    keep_passive()
    config=rs.config();config.enable_device(p['serial']);config.enable_stream(rs.stream.depth,1280,720,rs.format.z16,30)
    pipeline=rs.pipeline(ctx);running=True;boot=str(uuid.uuid4());started=False;last_frame=-1
    def stop(*_):
        nonlocal running
        running=False
    signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
    try:
        active=pipeline.start(config);started=True;keep_passive()
        profile=active.get_stream(rs.stream.depth).as_video_stream_profile();intrinsics=profile.get_intrinsics()
        require(intrinsics.width==1280 and intrinsics.height==720,'Actual depth mode mismatch')
        intr={'width':intrinsics.width,'height':intrinsics.height,'fx':intrinsics.fx,'fy':intrinsics.fy,'ppx':intrinsics.ppx,'ppy':intrinsics.ppy,'model':str(intrinsics.model),'coeffs':list(intrinsics.coeffs)}
        require(all(math.isfinite(x) for x in [intr['fx'],intr['fy'],intr['ppx'],intr['ppy'],*intr['coeffs']]) and intr['fx']>0 and intr['fy']>0,'Invalid device intrinsics')
        intrinsic_hash=hashlib.sha256(json.dumps(intr,sort_keys=True).encode()).hexdigest()
        for seq in range(args.frames):
            if not running:break
            require(time.time()*1000<p['expiresUnixMs'],'Profile expired during acquisition')
            frames=pipeline.wait_for_frames(2000);depth=frames.get_depth_frame();require(bool(depth),'Depth frame missing')
            received=time.monotonic_ns();number=int(depth.get_frame_number());require(number>last_frame,'Device frame counter reset/replayed');last_frame=number
            timestamp=float(depth.get_timestamp());require(math.isfinite(timestamp) and timestamp>=0,'Invalid frame timestamp')
            points=[]
            for pixel in pixels:
                distance=float(depth.get_distance(*pixel))
                if not(math.isfinite(distance) and .07<=distance<=.5):continue
                point=list(rs.rs2_deproject_pixel_to_point(intrinsics,pixel,distance))
                require(len(point)==3 and all(math.isfinite(x) for x in point),'Invalid deprojected depth')
                points.append({'pixel':pixel,'pointCameraM':point,'positionErrorBoundM':None})
            print(json.dumps({'schema':'rockstaros.depth-observation/1','source':'realsense-d405','bootId':boot,'sequence':seq,'deviceFrameNumber':str(number),'deviceSerialSha256':hashlib.sha256(p['serial'].encode()).hexdigest(),'profileSha256':hashlib.sha256(raw).hexdigest(),'calibrationId':p['calibrationId'],'placeEpoch':p['placeEpoch'],'receivedMonoNs':str(received),'sdkFrameTimestampMs':timestamp,'sdkTimestampDomain':str(depth.get_frame_timestamp_domain()),'intrinsicsSha256':intrinsic_hash,'coordinateFrame':'camera_x_right_y_down_z_forward','units':'m','points':points,'spatialActionEligible':False,'physicalAccepted':False,'sdkVersion':version},separators=(',',':')),flush=True)
    finally:
        if started:pipeline.stop()

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--profile',required=True);parser.add_argument('--allow-local-capture',action='store_true');parser.add_argument('--frames',type=int,default=100)
    args=parser.parse_args();require(1<=args.frames<=10000,'Frame bound invalid');main(args)
