"""Explicit development profiles. All limits are sampled guards, not isolation."""
from __future__ import annotations
import copy
import json
from pathlib import Path

GIB=1024**3
PROFILES={
 'standard': {'id':'standard','minimumAvailableBytes':4*GIB,'rssLimitBytes':8*GIB,
   'metalPeakLimitBytes':6*GIB,'mlxGuidelineBytes':6*GIB,'cacheLimitBytes':256*1024**2,
   'numLayers':4,'loraRank':8,'loraScale':20.0,'maxSequence':512},
 'small-memory-v1': {'id':'small-memory-v1','minimumAvailableBytes':int(2.5*GIB),'rssLimitBytes':2*GIB,
   'metalPeakLimitBytes':int(1.75*GIB),'mlxGuidelineBytes':int(1.5*GIB),'cacheLimitBytes':64*1024**2,
   'numLayers':2,'loraRank':4,'loraScale':8.0,'maxSequence':512},
 'bounded-warning-hypothesis-v1': {'id':'bounded-warning-hypothesis-v1','minimumAvailableBytes':int(3.25*GIB),
   'runtimeAvailableFloorBytes':2*GIB,'allowWarning':True,'trainingChildWallLimitSeconds':120,'maxTrainingUpdates':8,
   'rssLimitBytes':2*GIB,'metalPeakLimitBytes':int(1.75*GIB),'mlxGuidelineBytes':int(1.5*GIB),
   'cacheLimitBytes':64*1024**2,'numLayers':2,'loraRank':4,'loraScale':8.0,'maxSequence':512},
}

def profile(name):
    if name not in PROFILES: raise ValueError('unknown fixed resource profile')
    return copy.deepcopy(PROFILES[name])

def require_decision(root,name):
    if name=='standard': return None
    p=Path(root)/'resource-profile-decision.json'
    doc=json.loads(p.read_text())
    if doc.get('schema')!='eve.resource-profile-decision/1' or doc.get('profileId')!=name or doc.get('status')!='adopted' or doc.get('originalStandardGateAccepted') is not False or not isinstance(doc.get('reason'),str) or not doc['reason'].strip():
        raise ValueError('explicit reduced-profile decision missing')
    return p

def runtime_problem(sample,policy,rss_bytes=None,metal_peak_bytes=None):
    if sample.get('sampleAgeSeconds',0)>2:return 'resource sample stale'
    level=sample['vmPressureLevel']
    if level not in [1,2,4]:return 'unknown macOS memory pressure level'
    if level==4 or level==2 and not policy.get('allowWarning',False): return 'macOS memory pressure is warning/critical'
    if sample['freeInactiveSpeculativeBytes']<policy.get('runtimeAvailableFloorBytes',512*1024**2): return 'available-page runtime floor'
    if sample['macOSFreePercent']<10: return 'noncompressed pool below10 percent'
    if sample['diskFreeBytes']<12*GIB: return 'remaining run disk floor below12GiB'
    if rss_bytes is not None and rss_bytes>policy['rssLimitBytes']: return 'process RSS profile limit'
    if metal_peak_bytes is not None and metal_peak_bytes>policy['metalPeakLimitBytes']: return 'Metal peak profile limit'
    return None

def worker_failure(error):
    # Input is a frozen local transport. Model JSON syntax is judged downstream,
    # not by raising Python exceptions. Unexpected worker errors halt the trial;
    # MLX allocator messages differ across CPU/Metal versions.
    return {'error':type(error).__name__,'message':str(error)[:200],
            'actualOutputTokens':None,'fatal':True}
