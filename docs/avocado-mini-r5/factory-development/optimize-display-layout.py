"""Finite pose set-cover study. Necessary rays only; never a visibility guarantee.
Keeps the 3x3m service domain fixed; larger installation footprint is explicit.
No artificial light-power increase, sensor accuracy or manufacturing inference.
"""
import argparse,json,math
from pathlib import Path

def dot(a,b):return sum(x*y for x,y in zip(a,b))
def sub(a,b):return tuple(x-y for x,y in zip(a,b))
def unit(a):
 n=math.sqrt(dot(a,a));return tuple(x/n for x in a)
def cross(a,b):return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def poses(step,yaws):
 n=round(3/step)
 return [(x,y,z,yaw,pitch) for x in [-1.5+i*3/n for i in range(n+1)] for y in [-1.5+i*3/n for i in range(n+1)] for z in [.8,1.2,1.6] for yaw in [i*2*math.pi/yaws for i in range(yaws)] for pitch in [-math.pi/6,0,math.pi/6]]
def candidates(half):
 nodes=[]
 for side in range(4):
  for along in sorted(set([-half,-1.5,-.75,0,.75,1.5,half])):
   for h in [.6,1.2,1.8,2.4]:
    pos=[(-half,along,h),(half,along,h),(along,-half,h),(along,half,h)][side]
    normal=unit(sub((0,0,1.2),pos));right=unit(cross(normal,(0,0,1)));up=cross(right,normal)
    nodes.append({'id':f's{side}-p{along}-z{h}','positionM':pos,'normal':normal,'right':right,'up':up})
 return nodes

def visible(p,node,aperture,w=.13,h=.08):
 eye=p[:3];yaw,pitch=p[3:];q=sub(eye,node['positionM']);d=dot(q,node['normal']);s=.2
 if d<=s:return False
 bx=(aperture*(d-s)-w*d)/s;by=(aperture*(d-s)-h*d)/s
 if bx<=0 or by<=0 or abs(dot(q,node['right']))>bx/2 or abs(dot(q,node['up']))>by/2:return False
 target=sub(tuple(a+s*b for a,b in zip(node['positionM'],node['normal'])),eye)
 gaze=(math.cos(pitch)*math.cos(yaw),math.cos(pitch)*math.sin(yaw),math.sin(pitch))
 return dot(gaze,unit(target))>=.5

def solve(allposes,nodes,aperture):
 masks=[sum(1<<i for i,p in enumerate(allposes) if visible(p,n,aperture)) for n in nodes]
 uncovered=(1<<len(allposes))-1;chosen=[]
 while uncovered:
  best=max(range(len(nodes)),key=lambda i:(masks[i]&uncovered).bit_count())
  gain=(masks[best]&uncovered).bit_count()
  if not gain:break
  chosen.append({**nodes[best],'newlyCoveredPoses':gain});uncovered &= ~masks[best]
 return {'apertureM':aperture,'candidateNodeCount':len(nodes),'selectedNodeCount':len(chosen),'selectedNodes':chosen,'sampledPoses':len(allposes),'missedPoses':uncovered.bit_count(),'missExamples':[list(p) for i,p in enumerate(allposes) if uncovered>>i&1][:12],'greedyMinimumProven':False}

def main(output):
 coarse=poses(.5,8);fine=poses(.25,16);runs=[]
 for half in [1.5,2.0]:
  nodes=candidates(half)
  for aperture in [.2,.42,.8,1.2]:
   r=solve(coarse,nodes,aperture);r['installationFootprintM']=[2*half,2*half];chosen=r['selectedNodes']
   missed=[p for p in fine if not any(visible(p,n,aperture) for n in chosen)]
   r['denserSample']={'sampledPoses':len(fine),'missedPoses':len(missed)}
   if r['missedPoses']==0:
    repair=solve(missed,nodes,aperture) if missed else {'selectedNodes':[],'missedPoses':0}
    r['refinementRepair']={'additionalNodes':repair['selectedNodes'],'totalSelectedNodes':len(chosen)+len(repair['selectedNodes']),'sampledPoses':len(fine),'missedPoses':repair['missedPoses'],'physicalAccepted':False}
   runs.append(r)
 result={'schema':'rockstaros.mini-layout-optimization/1','serviceDomainXYM':[[-1.5,-1.5],[1.5,1.5]],'eyeHeightsM':[.8,1.2,1.6],'imageSizeM':[.13,.08],'imageOffsetM':.2,'gazePitchDeg':[-30,0,30],'viewerConeHalfAngleDeg':60,'classification':'ideal_finite_geometric_study','continuousCoverageProven':False,'arbitraryObjectPlacementSolved':False,'physicalAccepted':False,'glareEvaluated':False,'runs':runs,'limitations':['No occlusion, diffraction, optical efficiency, eye pupil or tolerances','Larger installation footprint is extra space outside unchanged service domain','At least one node-local image, not arbitrary room-space imagery','Greedy layout not optimum; finite positions and headings cannot prove continuity','Aperture envelope is hypothetical, not selected or available display product']}
 out=Path(output);out.mkdir(parents=True,exist_ok=True);(out/'optimized-display-layout.json').write_text(json.dumps(result,indent=2)+'\n')
 for r in runs:print({k:r[k] for k in ['installationFootprintM','apertureM','selectedNodeCount','missedPoses','denserSample']})
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--output',required=True);main(p.parse_args().output)
