"""Explicit local V4L2 hand observer. Model/package must already be installed.
Image coordinates only: model world landmarks are not room calibration.
No images/files/uploads, gesture action authority, display or model downloads.
Reference API: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/python
"""
import argparse,hashlib,importlib.metadata,json,math,os,re,signal,stat,sys,time,uuid
from pathlib import Path

def require(ok,message):
    if not ok:raise ValueError(message)

def observe(args):
    require(sys.platform.startswith('linux') and args.allow_local_capture,'Explicit Linux local capture required')
    path=Path(args.profile);st=path.stat();require(st.st_uid==os.getuid() and not st.st_mode&0o022 and st.st_size<=32768,'Owner-controlled profile required')
    raw=path.read_bytes();p=json.loads(raw)
    require(p.get('schema')=='rockstaros.hand-observer-profile/1','Hand profile required')
    require(isinstance(p.get('calibrationId'),str) and 0<len(p['calibrationId'])<=120 and type(p.get('placeEpoch'))is int and p['placeEpoch']>=0,'OS place/session binding required')
    require(type(p.get('expiresUnixMs'))is int and time.time()*1000<p['expiresUnixMs'],'Profile expired')
    model=Path(p.get('modelPath',''));require(model.is_absolute() and model.is_file(),'Existing model file required')
    st=model.stat();require(not st.st_mode&0o022 and st.st_size<=100_000_000,'Model file must not be group/world writable')
    model_data=model.read_bytes();require(re.fullmatch('[a-f0-9]{64}',p.get('modelSha256','')) and hashlib.sha256(model_data).hexdigest()==p['modelSha256'],'Pinned model hash required')
    require(isinstance(p.get('mediapipeVersion'),str) and importlib.metadata.version('mediapipe')==p['mediapipeVersion'],'Exact installed MediaPipe version required')
    import cv2
    import mediapipe as mp
    require(cv2.__version__==p.get('opencvVersion'),'Exact installed OpenCV version required')
    device=p.get('cameraById');require(isinstance(device,str) and Path(device).parent==Path('/dev/v4l/by-id'),'Exact camera by-id required')
    resolved=Path(device).resolve(strict=True);st=resolved.stat();require(stat.S_ISCHR(st.st_mode) and os.major(st.st_rdev)==81,'V4L2 device required')
    size=p.get('resolution');require(isinstance(size,list) and len(size)==2 and all(type(x)is int and 64<=x<=1280 for x in size) and size[0]*size[1]<=1280*720,'Bounded camera mode required')
    options=mp.tasks.vision.HandLandmarkerOptions(base_options=mp.tasks.BaseOptions(model_asset_buffer=model_data),running_mode=mp.tasks.vision.RunningMode.VIDEO,num_hands=2,min_hand_detection_confidence=.8,min_hand_presence_confidence=.8,min_tracking_confidence=.8)
    cap=cv2.VideoCapture(str(resolved),cv2.CAP_V4L2);running=True;boot=str(uuid.uuid4());last=-1
    def stop(*_):
        nonlocal running
        running=False
    signal.signal(signal.SIGINT,stop);signal.signal(signal.SIGTERM,stop)
    try:
        require(cap.isOpened(),'Camera unavailable');cap.set(cv2.CAP_PROP_FRAME_WIDTH,size[0]);cap.set(cv2.CAP_PROP_FRAME_HEIGHT,size[1]);cap.set(cv2.CAP_PROP_BUFFERSIZE,1)
        require([int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))]==size,'Camera mode mismatch')
        with mp.tasks.vision.HandLandmarker.create_from_options(options) as detector:
            for sequence in range(args.frames):
                if not running:break
                require(time.time()*1000<p['expiresUnixMs'],'Profile expired during capture')
                ok,image=cap.read();received=time.monotonic_ns();require(ok and image is not None and [image.shape[1],image.shape[0]]==size,'Frame unavailable or changed mode')
                timestamp=received//1_000_000
                if timestamp<=last:image.fill(0);continue
                last=timestamp;rgb=cv2.cvtColor(image,cv2.COLOR_BGR2RGB)
                media_image=mp.Image(image_format=mp.ImageFormat.SRGB,data=rgb)
                result=detector.detect_for_video(media_image,timestamp);finished=time.monotonic_ns();hands=[]
                for hand in result.hand_landmarks:
                    points=[[float(k.x),float(k.y)] for k in hand]
                    require(len(points)==21 and all(math.isfinite(v) and -.5<=v<=1.5 for xy in points for v in xy),'Invalid landmark result')
                    hands.append(points)
                image.fill(0);rgb.fill(0);del media_image,result
                print(json.dumps({'schema':'rockstaros.hand-image-observation/1','source':'v4l2-mediapipe-hand','bootId':boot,'sequence':sequence,'profileSha256':hashlib.sha256(raw).hexdigest(),'modelSha256':p['modelSha256'],'calibrationId':p['calibrationId'],'placeEpoch':p['placeEpoch'],'receivedMonoNs':str(received),'inferenceFinishedMonoNs':str(finished),'coordinateFrame':'image_normalized_x_right_y_down','landmarks':hands,'positionErrorBoundM':None,'exposureSynchronized':False,'spatialActionEligible':False,'physicalAccepted':False},separators=(',',':')),flush=True)
    finally:cap.release()

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--profile',required=True);parser.add_argument('--allow-local-capture',action='store_true');parser.add_argument('--frames',type=int,default=100)
    args=parser.parse_args();require(1<=args.frames<=300,'Frame bound invalid');observe(args)
