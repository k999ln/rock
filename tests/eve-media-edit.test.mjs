import test from 'node:test';
import assert from 'node:assert/strict';
import {mediaKind,mediaOperation,encodeWave} from '../lib/eve-media-edit.ts';
void test('media app chooses only the declared editing operations',()=>{
 assert.equal(mediaKind('image/jpeg'),'image');assert.equal(mediaKind('video/mp4'),'video');assert.equal(mediaKind('audio/wav'),'audio');assert.equal(mediaKind('text/html'),null);
 assert.equal(mediaOperation('image','image'),'photo-layer');assert.equal(mediaOperation('audio','audio'),'audio-mix');assert.equal(mediaOperation('video','video'),'video-sequence');assert.equal(mediaOperation('audio','video'),'video-soundtrack');assert.equal(mediaOperation('video','audio'),'video-soundtrack');assert.throws(()=>mediaOperation('image','audio'));assert.throws(()=>mediaOperation('image','video'));
});
void test('WAV export declares exact stereo length, interleaves and clips samples',()=>{
 const bytes=encodeWave([new Float32Array([-2,0,2]),new Float32Array([1,.5,-1])],44100),v=new DataView(bytes);assert.equal(bytes.byteLength,56);assert.equal(v.getUint32(4,true),48);assert.equal(v.getUint16(22,true),2);assert.equal(v.getUint32(24,true),44100);assert.equal(v.getUint32(40,true),12);assert.equal(v.getInt16(44,true),-32768);assert.equal(v.getInt16(46,true),32767);assert.equal(v.getInt16(52,true),32767);assert.equal(v.getInt16(54,true),-32768);
 assert.throws(()=>encodeWave([],44100));assert.throws(()=>encodeWave([new Float32Array(1),new Float32Array(2)],44100));assert.throws(()=>encodeWave([new Float32Array(1)],0));
});
void test('WebM export adds a seekable duration while keeping original media bytes',async()=>{
 const {webmWithDuration}=await import('../lib/eve-media-edit.ts');
 const bytes=Uint8Array.from(Buffer.from('1a45dfa3801853806701ffffffffffffff1549a966872ad7b1830f42401f43b675ff010203','hex'));
 const output=webmWithDuration(bytes,4000);assert.equal(output.length,bytes.length+11);const duration=Buffer.from(output).indexOf(Buffer.from('448988','hex'));assert.ok(duration>0);assert.equal(new DataView(output.buffer).getFloat64(duration+3,false),4000);assert.deepEqual(output.slice(-8),bytes.slice(-8));assert.deepEqual(webmWithDuration(output,4000),output);assert.throws(()=>webmWithDuration(bytes,-1));
});
