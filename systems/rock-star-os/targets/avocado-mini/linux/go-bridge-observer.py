"""Go enumeration/scalar-calibration observer, no GL window or pixel output.
Uses installed official Bridge Python SDK, explicit pinned library and version.
SDK construction changes its telemetry settings; caller must allow that explicitly.
No installs, downloads, cloud model, recording or display brightness commands.
"""
import argparse,hashlib,importlib.metadata,json,math,os,re,signal,sys,time,uuid
from pathlib import Path

def require(ok,message):
    if not ok:raise ValueError(message)

def main(args):
    require(args.allow_bridge_settings_update,'SDK telemetry-settings update permission required')
    require(sys.platform.startswith('linux') and os.environ.get('DISPLAY') and os.environ.get('XDG_SESSION_TYPE')!='wayland','Recorded Linux X11 host required')
    path=Path(args.profile);st=path.stat();require(st.st_uid==os.getuid() and not st.st_mode&0o022 and st.st_size<=32768,'Owner-controlled profile required')
    raw=path.read_bytes();p=json.loads(raw)
    require(p.get('schema')=='rockstaros.go-bridge-observer/1' and p.get('model')=='Looking Glass Go','Go profile required')
    require(isinstance(p.get('serial'),str) and re.fullmatch(r'[A-Za-z0-9_-]{1,96}',p['serial']),'Received Go serial required')
    require(isinstance(p.get('deviceName'),str) and 0<len(p['deviceName'])<=120,'Received Go device name required')
    require(type(p.get('placeEpoch')) is int and p['placeEpoch']>=0 and isinstance(p.get('calibrationId'),str) and 0<len(p['calibrationId'])<=120,'OS place binding required')
    require(type(p.get('expiresUnixMs')) is int and time.time()*1000<p['expiresUnixMs'],'Profile expired')
    require(isinstance(p.get('sdkVersion'),str) and importlib.metadata.version('bridge-python-sdk')==p['sdkVersion'],'Pinned SDK version mismatch')
    library=Path(p.get('bridgeLibraryPath',''));require(library.is_absolute() and library.is_file(),'Pinned native library path required')
    st=library.stat();require(not st.st_mode&0o022 and st.st_size<=200_000_000,'Native library must not be group/world writable')
    require(hashlib.sha256(library.read_bytes()).hexdigest()==p.get('bridgeLibrarySha256'),'Native library hash mismatch')
    from bridge_python_sdk.BridgeApi import BridgeAPI
    bridge=BridgeAPI(debug=False,library_path=str(library),disableTracking=True)
    started=False;running=True;boot=str(uuid.uuid4());last_subset=None
    def stop(*_):
        nonlocal running
        running=False
    signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
    try:
        require(bridge.initialize('RockstarOS-Mini-Go-observer'),'Bridge initialize failed');started=True
        for sequence in range(args.frames):
            if not running:break
            require(time.time()*1000<p['expiresUnixMs'],'Profile expired during observation')
            matches=[i for i in bridge.get_displays() if bridge.get_device_serial_for_display(i)==p['serial']]
            require(len(matches)==1,'Exact Go disconnected or ambiguous');index=matches[0]
            require(bridge.get_device_name_for_display(index)==p['deviceName'],'Go device name changed')
            dimensions=list(bridge.get_dimensions_for_display(index));require(dimensions==[1440,2560],'Go dimensions mismatch')
            subset={'pitch':bridge.get_pitch_for_display(index),'center':bridge.get_center_for_display(index),'tilt':bridge.get_tilt_for_display(index),'aspect':bridge.get_display_aspect_for_display(index),'viewcone':bridge.get_viewcone_for_display(index),'invview':bridge.get_invview_for_display(index)}
            require(all(math.isfinite(float(v)) for v in subset.values()) and subset['pitch']>0 and subset['aspect']>0 and 0<subset['viewcone']<180,'Invalid scalar calibration')
            subset_hash=hashlib.sha256(json.dumps(subset,sort_keys=True).encode()).hexdigest()
            require(last_subset is None or last_subset==subset_hash,'Go scalar calibration changed; re-pair required');last_subset=subset_hash
            print(json.dumps({'schema':'rockstaros.go-bridge-observation/1','bootId':boot,'sequence':sequence,'profileSha256':hashlib.sha256(raw).hexdigest(),'serialSha256':hashlib.sha256(p['serial'].encode()).hexdigest(),'calibrationId':p['calibrationId'],'placeEpoch':p['placeEpoch'],'receivedMonoNs':str(time.monotonic_ns()),'dimensions':dimensions,'scalarCalibrationSha256':subset_hash,'scalarCalibration':subset,'calibrationComplete':False,'pixelsSubmitted':False,'physicalAccepted':False},separators=(',',':')),flush=True)
            time.sleep(.25)
    finally:
        if started:bridge.uninitialize()

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--profile',required=True);parser.add_argument('--allow-bridge-settings-update',action='store_true');parser.add_argument('--frames',type=int,default=40)
    args=parser.parse_args();require(1<=args.frames<=40,'Frame bound invalid');main(args)
