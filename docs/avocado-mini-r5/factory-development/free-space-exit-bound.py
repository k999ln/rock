"""Optimistic straight-ray exit condition, independent of any proposed relay.
Four peripheral apertures; ideal unlimited angular control/focus assumed.
Per-target, sampled-pupil visibility is not simultaneous 3D scene acceptance.
"""
from pathlib import Path
import itertools,json
import numpy as np
ROOT=Path(__file__).resolve().parents[3]
eyes=np.array(list(itertools.product(np.linspace(-1500,1500,9),np.linspace(-1500,1500,9),[1200,1600,1900])),float)
targets=np.array(list(itertools.product(np.linspace(-1500,1500,7),np.linspace(-1500,1500,7),[800,1400,2000])),float)
E=np.repeat(eyes,len(targets),axis=0);Q=np.tile(targets,(len(eyes),1))
xy=Q[:,:2]-E[:,:2];length=np.linalg.norm(xy,axis=1);right=np.column_stack((-xy[:,1]/np.maximum(length,1e-9),xy[:,0]/np.maximum(length,1e-9),np.zeros(len(E))))
right[length<1e-9]=[1,0,0]
ports=[{'axis':0,'at':-2000,'center':[ -2000,0,1500]}, {'axis':0,'at':2000,'center':[2000,0,1500]}, {'axis':1,'at':-2000,'center':[0,-2000,1500]}, {'axis':1,'at':2000,'center':[0,2000,1500]}]
required=[];per_ray=[]
for port in ports:
    a=port['axis'];tangent=1-a;rx=np.zeros(len(E));rz=np.zeros(len(E));valid=np.ones(len(E),bool)
    samples=[]
    for eye,pupil_x,pupil_z in itertools.product([-32,32],[-2,0,2],[-2,0,2]):
        # Nine points in a 4 mm square conservatively include a 2 mm-radius disk.
        sample=E+right*(eye+pupil_x)+np.array([0,0,pupil_z]);direction=sample-Q
        denominator=direction[:,a];denominator=np.where(np.abs(denominator)<1e-9,np.nan,denominator)
        t=(port['at']-Q[:,a])/denominator;P=Q+t[:,None]*direction
        valid&=(t<0)&np.isfinite(P).all(axis=1)
        samples.append((np.abs(P[:,tangent]),np.abs(P[:,2]-1500),(t<0)&np.isfinite(P).all(axis=1)))
        rx=np.maximum(rx,np.nan_to_num(np.abs(P[:,tangent]),nan=np.inf,posinf=np.inf))
        rz=np.maximum(rz,np.nan_to_num(np.abs(P[:,2]-1500),nan=np.inf,posinf=np.inf))
    required.append((rx,rz,valid));per_ray.append(samples)
rows=[]
for width,height in [(300,300),(600,600),(1200,1200),(2400,2400),(4000,3000)]:
    same_exit=np.logical_or.reduce([ok&(rx<=width/2)&(rz<=height/2) for rx,rz,ok in required])
    covered=np.ones(len(E),bool)
    for sample in range(len(per_ray[0])):
        covered&=np.logical_or.reduce([ok&(rx<=width/2)&(rz<=height/2) for rx,rz,ok in [port[sample] for port in per_ray]])
    missing=np.flatnonzero(~covered)
    row={'activeSourceCountAssumed':4,'opticalExitCount':4,'exitClearRectangleMm':[width,height],'eyeTargetPairs':len(E),'modeledNecessaryPassPairs':int(covered.sum()),'missingPairs':len(missing),'sameExitForAllPupilSamplesPassPairs':int(same_exit.sum()),'physicalAccepted':False,'wholeRangeAccepted':False}
    if len(missing):
        i=missing[0];row['firstFailure']={'eyeCenterMm':E[i].tolist(),'targetMm':Q[i].tolist(),'perPortRequiredHalfWidthHeightMm':[[float(rx[i]),float(rz[i])] if ok[i] else None for rx,rz,ok in required]}
    rows.append(row)
result={'schema':'rockstaros.mini.free-space-exit-bound/1','serviceRoomMm':[3000,3000],'installationPlaneSeparationMm':4000,'eyeCenters':len(eyes),'targetPoints':len(targets),'targetVolumeMm':{'min':[-1500,-1500,800],'max':[1500,1500,2000]},'pupilWidthSquareMm':4,'eyeSpacingMm':64,'sourceAngleAndFocus':'ideal unlimited; actual Go cone, source depth and relay are NOT supplied','surfacesAtImageLocation':False,'occlusionAndComfortAccepted':False,'continuousProof':False,'results':rows}
out=ROOT/'work/mini-spatial-engineering';out.mkdir(parents=True,exist_ok=True)
(out/'free-space-exit-bound.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
print(json.dumps([{'exitMm':r['exitClearRectangleMm'],'missingPairs':r['missingPairs'],'pairs':r['eyeTargetPairs']} for r in rows],indent=2))
