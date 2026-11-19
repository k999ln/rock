"""Local Linux stereo acquisition adapter, observer only, no Tool/optical control.
Requires OpenCV 4.13.x with ArUco and a measured, exact-device calibration.
Camera read times are NOT exposure timestamps. Output cannot authorize actions.
"""
import argparse,hashlib,json,math,os,signal,stat,sys,time,uuid
from pathlib import Path

def require(ok,message):
    if not ok: raise ValueError(message)

def read_profile(path):
    path=Path(path);st=path.stat()
    require(st.st_uid==os.getuid() and not st.st_mode&0o022,'Calibration must be owner-controlled, not group/world writable')
    require(st.st_size<=65536,'Calibration too large')
    raw=path.read_bytes();p=json.loads(raw)
    require(p.get('schema')=='rockstaros.stereo-marker-calibration/1','Calibration schema required')
    require(p.get('units')=='m' and p.get('dictionary')=='DICT_4X4_50','Explicit metric calibration/dictionary required')
    require(isinstance(p.get('calibrationId'),str) and 0<len(p['calibrationId'])<=120,'Calibration identity required')
    require(isinstance(p.get('expiresUnixMs'),int) and int(time.time()*1000)<p['expiresUnixMs'],'Calibration expired')
    require(isinstance(p.get('markerIds'),list) and 1<=len(p['markerIds'])<=8 and all(type(i) is int and 0<=i<50 for i in p['markerIds']) and len(set(p['markerIds']))==len(p['markerIds']),'Bounded marker IDs required')
    require(type(p.get('placeEpoch')) is int and p['placeEpoch']>=0,'Place epoch required')
    size=p.get('resolution');require(isinstance(size,list) and len(size)==2 and all(type(i)is int and 64<=i<=1920 for i in size) and size[0]*size[1]<=1920*1080,'Resolution invalid')
    require(isinstance(p.get('cameras'),list) and len(p['cameras'])==2,'Two cameras required')
    devices=[]
    for c in p['cameras']:
        s=c.get('device');require(isinstance(s,str) and s.startswith('/dev/v4l/by-id/') and Path(s).parent==Path('/dev/v4l/by-id'),'Exact by-id camera path required')
        d=Path(s).resolve(strict=True);st=d.stat();require(stat.S_ISCHR(st.st_mode) and os.major(st.st_rdev)==81,'V4L2 character device required');devices.append(d)
    require(devices[0]!=devices[1],'Two distinct camera nodes required')
    return p,hashlib.sha256(raw).hexdigest(),devices

def matrices(p,np):
    def arr(v,shape):
        a=np.asarray(v,dtype=np.float64);require(a.shape==shape and np.isfinite(a).all(),'Invalid calibration matrix');return a
    ks=[];ds=[]
    for c in p['cameras']:
        k=arr(c.get('K'),(3,3));require(k[0,0]>0 and k[1,1]>0 and np.allclose(k[2],[0,0,1]) and abs(k[0,1])+abs(k[1,0])<1e-9,'Unsupported camera intrinsics');ks.append(k)
        d=np.asarray(c.get('distortion'),dtype=np.float64);require(d.shape==(5,) and np.isfinite(d).all(),'Five distortion coefficients required');ds.append(d)
    r=arr(p.get('R_left_to_right'),(3,3));t=arr(p.get('T_left_to_right_m'),(3,));require(np.allclose(r@r.T,np.eye(3),atol=1e-6) and abs(np.linalg.det(r)-1)<1e-6 and .01<=np.linalg.norm(t)<=1,'Rigid stereo baseline required')
    return ks,ds,r,t

def observe(args):
    require(sys.platform.startswith('linux'),'Linux V4L2 host required; this adapter does not access macOS cameras')
    require(args.allow_local_capture,'Explicit --allow-local-capture required')
    import cv2
    import numpy as np
    require(cv2.__version__.startswith('4.13.'),'Recorded API profile requires OpenCV 4.13.x; requalify other versions')
    p,cal_hash,devices=read_profile(args.calibration);ks,ds,r,t=matrices(p,np)
    project=[np.hstack([np.eye(3),np.zeros((3,1))]),np.hstack([r,t.reshape(3,1)])]
    detector=cv2.aruco.ArucoDetector(cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50),cv2.aruco.DetectorParameters())
    caps=[];running=True;boot=str(uuid.uuid4());seq=0
    def stop(*_):
        nonlocal running
        running=False
    signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
    try:
        for device in devices:
            cap=cv2.VideoCapture(str(device),cv2.CAP_V4L2);caps.append(cap)
            require(cap.isOpened(),'Camera unavailable');cap.set(cv2.CAP_PROP_FRAME_WIDTH,p['resolution'][0]);cap.set(cv2.CAP_PROP_FRAME_HEIGHT,p['resolution'][1]);cap.set(cv2.CAP_PROP_BUFFERSIZE,1)
            require([int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))]==p['resolution'],'Actual camera mode differs from calibration')
        while running and seq<args.frames:
            require(int(time.time()*1000)<p['expiresUnixMs'],'Calibration expired during capture')
            begin=time.monotonic_ns()
            for c in caps: require(c.grab(),'Camera grab failed')
            observations=[]
            for c in caps:
                ok,image=c.retrieve();require(ok and image is not None and [image.shape[1],image.shape[0]]==p['resolution'],'Camera image mode changed or lost')
                corners,ids,_=detector.detectMarkers(image);found={}
                if ids is not None:
                    flat=ids.flatten().tolist()
                    for i,marker in enumerate(flat):
                        if marker in p['markerIds']:
                            require(flat.count(marker)==1,'Ambiguous marker identity');found[marker]=corners[i].reshape(4,2).astype(np.float64)
                observations.append(found);image.fill(0)
            received=time.monotonic_ns();points=[]
            # Triangulate matching marker corners, then average in 3D (not pixel centroids).
            for marker in sorted(set(observations[0])&set(observations[1])):
                corners=[cv2.undistortPoints(observations[i][marker].reshape(-1,1,2),ks[i],ds[i]).reshape(4,2) for i in range(2)]
                h=cv2.triangulatePoints(project[0],project[1],corners[0].T,corners[1].T)
                if np.any(np.abs(h[3])<1e-9):continue
                xyz=(h[:3]/h[3]).T;right=(r@xyz.T).T+t
                if not(np.isfinite(xyz).all() and np.all(xyz[:,2]>.05) and np.all(right[:,2]>.05) and np.all(np.linalg.norm(xyz,axis=1)<5)):continue
                residual=0
                for i,coords in enumerate([xyz,right]):
                    projected,_=cv2.projectPoints(coords,np.zeros(3),np.zeros(3),ks[i],ds[i]);residual=max(residual,float(np.max(np.linalg.norm(projected.reshape(4,2)-observations[i][marker],axis=1))))
                if residual>2:continue
                points.append({'markerId':marker,'pointLeftCameraM':xyz.mean(axis=0).tolist(),'maximumReprojectionResidualPx':residual,'positionErrorBoundM':None})
            event={'schema':'rockstaros.stereo-marker-observation/1','source':'v4l2-stereo-marker','bootId':boot,'sequence':seq,'calibrationId':p['calibrationId'],'calibrationSha256':cal_hash,'placeEpoch':p['placeEpoch'],'receivedMonoNs':str(received),'retrievalSpanNs':str(received-begin),'exposureMonoNs':None,'exposureSynchronizationVerified':False,'coordinateFrame':'left_camera_x_right_y_down_z_forward','units':'m','points':points,'spatialActionEligible':False,'trackingState':'observer-only-unvalidated-timing-and-accuracy','physicalAccepted':False}
            print(json.dumps(event,separators=(',',':')),flush=True);seq+=1
    finally:
        for c in caps:c.release()

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--calibration',required=True);parser.add_argument('--allow-local-capture',action='store_true');parser.add_argument('--frames',type=int,default=100)
    args=parser.parse_args();require(1<=args.frames<=10000,'Frame bound invalid');observe(args)
