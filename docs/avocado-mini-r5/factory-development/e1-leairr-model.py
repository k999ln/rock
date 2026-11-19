"""Reproducible first-order design calculation. Not optical or product acceptance."""
import json, math
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
P = json.loads(Path(__file__).with_name('e1-leairr-prescription.json').read_text())
s = P['spacing']; f = P['magnifier']['focalLength']; g = P['resolutionLens']['focalLength']
a = s['sourceToMagnifier']; b = f*a/(f-a); m = b/a
u = b+s['magnifierToBeamsplitter']+s['beamsplitterToResolutionLens']
v = 1/(1/g-1/u)
diagonal=P['source']['diagonalInch']*25.4
w=diagonal*9/math.hypot(9,16); h=w*16/9
r1=P['magnifier']['assumedCircularClearDiameter']/2
r2=P['resolutionLens']['assumedCircularClearDiameter']/2
bs=P['beamsplitter']; rx=bs['assumedClearRectangle'][1]/2
ry=bs['assumedClearRectangle'][0]*math.cos(math.radians(bs['incidenceDeg']))/2
rrx,rry=[n/2 for n in P['retroreflector']['requestedCutSize']]
def trace(x,y,tx,ty):
    x1,y1=x+a*tx,y+a*ty
    ux,uy=tx-x1/f,ty-y1/f
    x2,y2=x1+s['magnifierToBeamsplitter']*ux,y1+s['magnifierToBeamsplitter']*uy
    x3,y3=x2+s['beamsplitterToResolutionLens']*ux,y2+s['beamsplitterToResolutionLens']*uy
    x4,y4=x3+s['resolutionLensToRetroreflector']*(ux-x3/g),y3+s['resolutionLensToRetroreflector']*(uy-y3/g)
    checks=[('magnifier',x1*x1+y1*y1<=r1*r1),('BS_projected_ellipse',x2*x2/rx**2+y2*y2/ry**2<=1),('resolution',x3*x3+y3*y3<=r2*r2),('RR_assumed_cut',abs(x4)<=rrx and abs(y4)<=rry)]
    return all(ok for _,ok in checks),[name for name,ok in checks if not ok],ux
positions={'center':(0,0),'left':(-w/2,0),'right':(w/2,0),'top_left':(-w/2,h/2),'top_right':(w/2,h/2),'bottom_left':(-w/2,-h/2),'bottom_right':(w/2,-h/2)}
rows=[]
for name,(x,y) in positions.items():
    passed=[]; rejected={}
    for k in range(5801):
        angle=-29+k*.01
        ok,why,ux=trace(x,y,math.tan(math.radians(angle)),0)
        if ok:passed.append(math.degrees(math.atan(ux)))
        else:
            for stop in why:rejected[stop]=rejected.get(stop,0)+1
    rows.append({'sourcePoint':name,'sourceXYmm':[x,y],'inputVerticalSlope':0,'outputHorizontalAngleIntervalDeg':[min(passed),max(passed)] if passed else None,'rejectedByApertureSamples':rejected})
intervals=[r['outputHorizontalAngleIntervalDeg'] for r in rows]
common=[max(i[0] for i in intervals),min(i[1] for i in intervals)]
result={'schema':'rockstaros.mini.e1-calculation/1','virtualDistanceMm':b,'lateralMagnification':m,'localDepthMagnification':m*m,'nominalSourceActiveAreaAssumptionMm':[w,h],'nominalImageAreaMm':[w*m,h*m],'virtualSourceToResolutionLensMm':u,'calculatedResolutionLensImageDistanceMm':v,'specifiedRRDistanceMm':s['resolutionLensToRetroreflector'],'nominalAerialPlaneDistanceFromBSMm':b+s['magnifierToBeamsplitter'],'noApertureCenterConeBoundDeg':2*math.degrees(math.atan(math.tan(math.radians(29))/m)),'samples':rows,'sampledCommonOutputAngleIntervalDeg':common,'sampledCommonIntervalWidthDeg':max(0,common[1]-common[0]),'commonIntervalMeaning':'intersection of horizontal slopes for seven source points at zero input vertical slope; NOT an observer eyebox or proof all image points reach one eye','sourceAxialSensitivityMmPerMm':m*m,'bsRotationFirstOrderImageShiftMmPerDeg':2*(b+s['magnifierToBeamsplitter'])*math.pi/180,'beamsplitterIdealSingleRSingleTProductCeiling':.25,'wholeRoomCoverageCalculated':False,'physicalAccepted':False,'limits':P['analysisScope']}
out=ROOT/'work/mini-spatial-engineering';out.mkdir(parents=True,exist_ok=True)
(out/'e1-leairr-result.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:result[k] for k in ['virtualDistanceMm','lateralMagnification','nominalImageAreaMm','calculatedResolutionLensImageDistanceMm','noApertureCenterConeBoundDeg','sampledCommonOutputAngleIntervalDeg','physicalAccepted']},indent=2))
