#!/usr/bin/env python3
"""Encode verified original QMP frames with their measured relative timing."""
import argparse,hashlib,json,os,re,shutil,struct,subprocess,tempfile
from pathlib import Path


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--frames',type=Path,required=True);ap.add_argument('--output',type=Path,required=True)
    ap.add_argument('--source-commit',required=True);args=ap.parse_args()
    assert re.fullmatch('[0-9a-f]{40}',args.source_commit)
    folder=args.frames.resolve(strict=True);target=args.output.resolve();assert not target.exists()
    target.parent.mkdir(parents=True,exist_ok=True)
    index=json.loads((folder/'frame-index.json').read_bytes());assert index['status']=='PASS_RAW_CAPTURE'
    frames=index['frames'];assert 1<len(frames)<=481 and 60<=index['recorded_seconds']<=121
    previous=-1.0;lines=['ffconcat version 1.0']
    for i,frame in enumerate(frames):
        assert frame['index']==i and re.fullmatch('[0-9]{4}\\.png',frame['file'])
        path=folder/frame['file'];assert path.is_file() and not path.is_symlink()
        data=path.read_bytes();assert len(data)==frame['bytes'] and hashlib.sha256(data).hexdigest()==frame['sha256']
        assert data[:8]==b'\x89PNG\r\n\x1a\n' and struct.unpack('>II',data[16:24])==(720,960)
        stamp=frame['captured_seconds'];assert type(stamp) in (int,float) and previous<stamp<=index['recorded_seconds'];previous=stamp
        end=frames[i+1]['captured_seconds'] if i+1<len(frames) else index['recorded_seconds']
        assert 0<end-stamp<10
        lines.extend(["file '"+frame['file']+"'",'duration '+format(end-stamp,'.9f')])
    # The final packet closes the measured last-frame interval; it introduces no new image.
    lines.append("file '"+frames[-1]['file']+"'")
    concat='\n'.join(lines)+'\n';ffmpeg=shutil.which('ffmpeg');ffprobe=shutil.which('ffprobe');assert ffmpeg and ffprobe
    with tempfile.NamedTemporaryFile(mode='w',suffix='.ffconcat',prefix='encode-',dir=folder,delete=False) as stream:
        stream.write(concat);input_path=Path(stream.name)
    command=[ffmpeg,'-hide_banner','-nostdin','-v','warning','-n','-f','concat','-safe','1','-i',str(input_path),
             '-fps_mode','vfr','-c:v','libx264','-preset','slow','-crf','18','-pix_fmt','yuv420p','-an',
             '-movflags','+faststart','-metadata','title=RockstarOS 1.0 Developer Preview - QEMU - synthetic Wallet',
             '-metadata','comment=Actual measured QEMU framebuffer; prepared synthetic device; source '+args.source_commit,str(target)]
    try:
        result=subprocess.run(command,capture_output=True,text=True,timeout=180)
    finally:input_path.unlink()
    assert result.returncode==0,result.stderr
    probe=subprocess.run([ffprobe,'-v','error','-show_streams','-show_format','-of','json',str(target)],capture_output=True,text=True,check=True,timeout=30)
    metadata=json.loads(probe.stdout);assert len(metadata['streams'])==1
    video=metadata['streams'][0];assert (video['codec_name'],video['width'],video['height'])==('h264',720,960)
    expected=index['recorded_seconds']-frames[0]['captured_seconds'];actual=float(metadata['format']['duration'])
    assert abs(actual-expected)<=.1,(actual,expected)
    assert int(video['nb_frames'])==len(frames)+1
    report={'schema':'rock-verified-native-demo-encoding/1','status':'PASS_ENCODE_PENDING_VISUAL_REVIEW',
            'source_commit':args.source_commit,'frames_index_sha256':hashlib.sha256((folder/'frame-index.json').read_bytes()).hexdigest(),
            'ffconcat_sha256':hashlib.sha256(concat.encode()).hexdigest(),'source_frames':len(frames),
            'first_capture_offset_seconds':frames[0]['captured_seconds'],'measured_video_seconds':expected,'encoded_seconds':actual,
            'timing_precision':'25 Hz image demuxer timestamp rounding; <=0.1 second duration error',
            'unaltered_input_frames':True,'overlay_or_synthetic_scene':False,'qemu':True,'simulation_only':True,
            'mp4_sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'mp4_bytes':target.stat().st_size,
            'ffmpeg_version':subprocess.check_output([ffmpeg,'-version'],text=True).splitlines()[0],
            'ffmpeg_stderr':result.stderr,'probe':metadata}
    target.with_suffix('.encoding.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:report[k] for k in ('status','encoded_seconds','mp4_sha256','mp4_bytes')}))


if __name__=='__main__':main()
