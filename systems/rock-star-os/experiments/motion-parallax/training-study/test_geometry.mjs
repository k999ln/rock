import test from 'node:test';
import assert from 'node:assert/strict';
import {project,poseUsable,planeCorners} from './geometry.js';
test('wall points stay fixed for moving eye; depth points change with physically correct sign',()=>{
  assert.deepEqual(project([.2,.1,0],[0,0,2],2,1),[.6,.4]);
  assert.deepEqual(project([.2,.1,0],[.5,0,2],2,1),[.6,.4]);
  assert.ok(project([0,0,-1],[.5,0,2],2,1)[0]>.5);
  assert.equal(project([0,0,3],[0,0,2],2,1),null);
});
test('loss of tracking blanks output; future timestamps and missing samples are not live',()=>{
  assert.equal(poseUsable({pose:{},age_ms:20},79),true);
  assert.equal(poseUsable({pose:{},age_ms:20},81),false);
  assert.equal(poseUsable({pose:{},age_ms:-1},0),false);
  assert.equal(poseUsable(null,0),false);
});
test('plane geometry lies on specified plane',()=>{
  for(const p of planeCorners([1,1,2],1.5))assert.ok(Math.abs(p[0]+p[1]+2*p[2]-1.5)<1e-10);
});
