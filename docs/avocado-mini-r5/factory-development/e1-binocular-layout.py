"""Finite-pupil necessary-condition study, not a continuous/physical proof.
Keep the 3 x 3 m room. A common 20 mm 3D target is an explicitly SMALL
necessary-condition diagnostic; it does not replace the requested room scene.
No assumed vertical Go cone, lens/RR efficiency or comfort acceptance.
The thin-lens approximation is inaccurate at large angles/apertures; model
failure is not a rigorous impossibility proof for all physical lens designs.
"""
from pathlib import Path
import itertools,json,math
import numpy as np
ROOT=Path(__file__).resolve().parents[3]
out=ROOT/'work/mini-spatial-engineering';out.mkdir(parents=True,exist_ok=True)
EPS=1e-9
grid=np.array(list(itertools.product(np.linspace(-1500,1500,13),np.linspace(-1500,1500,13),[1200,1600,1900])),float)
target=np.array([0.,0.,1500.]);box=np.array([(0,0,0),*itertools.product([-10.,10.],repeat=3)])+target
normal=np.array([0.,-1.,1.])/math.sqrt(2)
def reflection(v):return v-2*np.sum(v*normal,axis=-1)[...,None]*normal
def local(points,angle,D,pitch=0.):
    # Local -y points from BS to the fixed target; local z remains room-up.
    c,s=math.cos(angle),math.sin(angle)
    cp,sp=math.cos(pitch),math.sin(pitch)
    r=np.array([[c,-s,0],[s,c,0],[0,0,1.]])@np.array([[1.,0,0],[0,cp,-sp],[0,sp,cp]])
    origin=target-np.array([0.,-D,150.])@r.T
    return (points-origin)@r
def node(angle,m,aperture,pitch=0.):
    f=300.;a=f*(m-1)/m;B=f*(m-1);D=B+150.;obj=B+300.
    rr_distance=1/(1/150.-1/obj)
    success=np.ones(len(grid),bool);fail={};vertical_required=0.
    horizontal=target[:2]-grid[:,:2];norm=np.linalg.norm(horizontal,axis=1)
    right=np.column_stack((-horizontal[:,1]/np.maximum(norm,EPS),horizontal[:,0]/np.maximum(norm,EPS),np.zeros(len(grid))))
    right[norm<EPS]=[1.,0.,0.]
    # Actual finite pupil samples (2 mm radius), both eye centers 64 mm apart.
    for eye in [-32.,32.]:
      for px,pz in [(0,0),(-2,0),(2,0),(0,-2),(0,2)]:
       E=local(grid+right*(eye+px)+np.array([0.,0.,pz]),angle,D,pitch)
       for world_q in box:
        Q=local(world_q,angle,D,pitch)
        nQ=np.dot(Q-np.array([0.,0.,150.]),normal)
        delta=E-Q;den=delta@normal
        safe=np.where(np.abs(den)>EPS,den,np.nan)
        t=-nQ/safe;P=Q+t[:,None]*delta
        # Source virtual point: reflection across z-y=150.
        V=Q-2*nQ*normal
        b=-V[2];aa=f*b/(f+b);mag=1+b/f
        d=reflection(P-Q);dz=np.where(np.abs(d[:,2])>EPS,d[:,2],np.nan)
        L=P-d*(P[:,2]/dz)[:,None]
        ux=d[:,0]/dz;uy=d[:,1]/dz
        tx=ux+L[:,0]/f;ty=uy+L[:,1]/f
        source=L[:,:2]-aa*np.column_stack((tx,ty))
        nominal_source=V[:2]/mag
        folded=reflection(d);fy=np.where(np.abs(folded[:,1])>EPS,folded[:,1],np.nan)
        L2=P+folded*((150.-P[:,1])/fy)[:,None]
        rrX=L2[:,0]+rr_distance*(folded[:,0]/fy-L2[:,0]/150.)
        rrZ=L2[:,2]-150.+rr_distance*(folded[:,2]/fy-(L2[:,2]-150.)/150.)
        r=aperture/2
        bs_fold=(P[:,1]+P[:,2]-150.)/math.sqrt(2)
        # BS clear physical rectangle: width=aperture; fold dimension=4/3 aperture.
        reasons={
          'wrong_side_or_ray_order':~((t<0)&(d[:,2]>0)&(folded[:,1]>0)&(P[:,2]>0)&(L2[:,1]>P[:,1])),
          'magnifier_aperture':L[:,0]**2+L[:,1]**2>r*r,
          'BS_inscribed_clear_ellipse':P[:,0]**2/r**2+bs_fold**2/(r*4/3)**2>1,
          'resolution_aperture':L2[:,0]**2+(L2[:,2]-150.)**2>r*r,
          'RR_assumed_square':(np.abs(rrX)>r)|(np.abs(rrZ)>r),
          'Go_horizontal_cone':np.abs(np.degrees(np.arctan(tx)))>29,
          'source_active_area':(np.abs(source[:,0])>74.71581292/2)|(np.abs(source[:,1])>132.82811186/2),
          'conjugate_mismatch':np.max(np.abs(source-nominal_source),axis=1)>.0001,
          'nonfinite':~np.isfinite(P).all(axis=1)|~np.isfinite(source).all(axis=1),
          'target_outside_virtual_branch':np.full(len(grid),not(0<aa<f)),
        }
        passed=np.ones(len(grid),bool)
        for reason,bad in reasons.items():
            passed&=~bad;fail[reason]=fail.get(reason,0)+int(np.count_nonzero(bad))
        if np.any(passed):vertical_required=max(vertical_required,float(np.max(np.abs(np.degrees(np.arctan(ty[passed]))))))
        success&=passed
    return success,fail,vertical_required
rows=[];map_data=[]
for m,ap in [(2.,270.),(1.5,270.),(1.2,270.),(2.,450.),(1.2,450.),(1.2,900.)]:
    masks=[];details=[]
    for k in range(8):
        mask,fails,vert=node(2*math.pi*k/8,m,ap);masks.append(mask);details.append({'node':k,'missContributions':fails,'verticalHalfAngleNeededForSurvivingRaysDeg':vert})
    for count in [1,2,4,8]:
        chosen=list(range(0,8,8//count));covered=np.logical_or.reduce([masks[k] for k in chosen]);miss=np.flatnonzero(~covered)
        row={'magnification':m,'assumedClearLensDiameterMm':ap,'nodes':count,'sampledViewPositions':len(grid),'necessaryGeometryPassPositions':int(covered.sum()),'missingPositions':len(miss),'firstMissingEyeCenterMm':grid[miss[0]].tolist() if len(miss) else None,'GoVerticalConeKnown':False,'continuousOrPhysicalAccepted':False}
        rows.append(row)
        if count==8:map_data.append({'magnification':m,'apertureMm':ap,'eyes':grid.tolist(),'necessaryPass':covered.tolist()})
    rows[-1]['perNodeDiagnostics']=details
optimized=[]
for m,ap in [(2.,270.),(1.2,270.),(1.2,450.),(1.2,900.)]:
    candidates=[]
    for k,pitch in itertools.product(range(16),[-30,0,30]):
        mask,_,_=node(2*math.pi*k/16,m,ap,math.radians(pitch));candidates.append((k*22.5,pitch,mask))
    covered=np.zeros(len(grid),bool);chosen=[]
    for _ in range(8):
        index=max(range(len(candidates)),key=lambda i:np.count_nonzero(candidates[i][2]&~covered));az,pitch,mask=candidates[index]
        if not np.any(mask&~covered):break
        covered|=mask;chosen.append({'azimuthDeg':az,'pitchDeg':pitch,'remainingMissing':int(np.count_nonzero(~covered))})
    optimized.append({'magnification':m,'assumedClearLensDiameterMm':ap,'candidateCount':48,'greedyNodes':chosen,'missingPositions':int(np.count_nonzero(~covered)),'minimumProven':False,'interferenceAndPhysicalAccepted':False})
result={'schema':'rockstaros.mini.e1-binocular-necessary/1','roomSizeMm':[3000,3000],'commonTargetCenterMm':target.tolist(),'diagnosticTargetBoxMm':[20,20,20],'eyeSpacingMm':64,'pupilRadiusMm':2,'sampledPupilPointsPerEye':5,'targetPoints':9,'headDirection':'eyes aimed at common target; looking away is not treated as invisibility correction','sourceGeometry':'6inch 9:16 active area assumption; horizontal +/-29deg; vertical cone unknown','layout':'up to eight nodes around SAME target, radius equals nominal BS-image distance; no arbitrary world placement or moving target','fullRoomSceneRequirementReplaced':False,'mechanicalInterferenceAccepted':False,'occlusionModeled':False,'results':rows,'greedyOrientationStudy':optimized,'physicalAccepted':False,'wholeRangeAccepted':False,'continuousProof':False}
(out/'e1-binocular-layout-result.json').write_text(json.dumps(result,indent=2)+'\n')
(out/'e1-binocular-map.json').write_text(json.dumps(map_data)+'\n')
print(json.dumps({'fixed8':[{'m':r['magnification'],'apertureMm':r['assumedClearLensDiameterMm'],'miss':r['missingPositions']} for r in rows if r['nodes']==8],'greedy8':[{'m':r['magnification'],'apertureMm':r['assumedClearLensDiameterMm'],'miss':r['missingPositions']} for r in optimized]},indent=2))
