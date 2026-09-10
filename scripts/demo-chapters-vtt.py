#!/usr/bin/env python3
"""Create optional accessible descriptions from measured real-demo chapters."""
import argparse
import hashlib
import json
import math
from pathlib import Path


def stamp(seconds):
    milliseconds = round(seconds * 1000)
    hours, remainder = divmod(milliseconds, 3600000)
    minutes, remainder = divmod(remainder, 60000)
    seconds, milliseconds = divmod(remainder, 1000)
    return f'{hours:02}:{minutes:02}:{seconds:02}.{milliseconds:03}'


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    for name in ('report', 'plan', 'encoding', 'output'):
        ap.add_argument('--' + name, required=True, type=Path)
    args = ap.parse_args()
    raw = {name: getattr(args, name).read_bytes() for name in ('report', 'plan', 'encoding')}
    report, plan, encoding = (json.loads(raw[name]) for name in ('report', 'plan', 'encoding'))
    assert report['status'] == 'PASS_RAW_DEMO_PENDING_ENCODE_AND_VISUAL_REVIEW'
    assert encoding['status'] == 'PASS_ENCODE_PENDING_VISUAL_REVIEW'
    assert plan['source_commit'] == encoding['source_commit']
    assert plan['qemu'] is True and plan['simulation_only'] is True
    assert encoding['unaltered_input_frames'] is True and encoding['overlay_or_synthetic_scene'] is False
    duration = encoding['encoded_seconds']
    offset = encoding['first_capture_offset_seconds']
    chapters = report['chapters']
    assert 60 <= duration <= 120 and 1 <= len(chapters) <= 20
    cues = []
    previous = -1.0
    for index, chapter in enumerate(chapters):
        original = chapter['seconds']
        assert type(original) in (int, float) and math.isfinite(original) and previous < original
        previous = original
        start = max(0, original - offset)
        end = min(duration, chapters[index + 1]['seconds'] - offset) if index + 1 < len(chapters) else duration
        assert 0 <= start < end <= duration
        title = chapter['title']
        assert isinstance(title, str) and title and not any(t in title for t in ('\n', '-->', '<', '>'))
        cues.append(f'{index + 1}\n{stamp(start)} --> {stamp(end)}\n{title}\n')
    content = 'WEBVTT\n\nNOTE QEMU actual screen recording; synthetic Wallet/Game; optional action descriptions, no spoken audio.\n\n' + '\n'.join(cues)
    with args.output.open('x') as stream:
        stream.write(content)
    proof = {'schema': 'rock-demo-optional-descriptions/1', 'source_commit': plan['source_commit'],
             'status': 'GENERATED_FROM_MEASURED_CHAPTERS_BROWSER_CHECK_PENDING', 'cues': len(cues),
             'video_sha256': encoding['mp4_sha256'], 'video_frames_modified': False,
             'inputs_sha256': {name: hashlib.sha256(value).hexdigest() for name, value in raw.items()},
             'vtt_sha256': hashlib.sha256(content.encode()).hexdigest(),
             'scope': 'Optional HTML captions describing actual operation chapters; no audio transcription or pixels burned into the video.'}
    args.output.with_suffix('.captions.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(proof, ensure_ascii=False))


if __name__ == '__main__':
    main()
