"""Single-observer steerable-aperture necessary-ray model, not an optical design.
Pose-dependent image position is explicit. Does not solve room-fixed arbitrary imagery.
"""
import argparse,json,math,runpy
from pathlib import Path
base=runpy.run_path(str(Path(__file__).with_name('optimize-display-layout.py')))
poses,dot,sub,unit=base['poses'],base['dot'],base['sub'],base['unit']

def visible(p,node,aperture,max_steer_deg,error_m):
 q=sub(p[:3],node);d=math.sqrt(dot(q,q));s=.2;w=.13;h=.08
 if d<=s:return False
 # Hypothesis: whole optical assembly can steer, preserving image and source.
 normal=unit(q);rest=unit(sub((0,0,1.2),node))
 if dot(normal,rest)<math.cos(math.radians(max_steer_deg)):return False
 bx=(aperture*(d-s)-w*d)/s;by=(aperture*(d-s)-h*d)/s
 # Binocular eye spacing and uncertainty are conservative design assumptions.
 if bx<.064+2*error_m or by<2*error_m:return False
 image=tuple(a+s*b for a,b in zip(node,normal));ray=sub(image,p[:3]);gaze=(math.cos(p[4])*math.cos(p[3]),math.cos(p[4])*math.sin(p[3]),math.sin(p[4]))
 return dot(gaze,unit(ray))>=.5

def main(output):
 perimeter=[(-2,-2),(0,-2),(2,-2),(2,0),(2,2),(0,2),(-2,2),(-2,0)]
 ps=poses(.25,16);runs=[]
 for count in [4,8,16]:
  xy=perimeter[::2] if count==4 else perimeter
  zs=[1.2] if count<16 else [1.2,2.0]
  nodes=[(x,y,z) for z in zs for x,y in xy]
  for a in [.2,.3,.42]:
   hits=sum(any(visible(p,n,a,80,.04) for n in nodes) for p in ps)
   runs.append({'nodeCount':count,'apertureM':a,'sampledPoses':len(ps),'missedPoses':len(ps)-hits,'positionsM':nodes,'totalApertureAreaM2':count*a*a})
 result={'schema':'rockstaros.mini-tracked-aperture-study/1','classification':'hypothetical_steerable_necessary_geometry','serviceDomainXYM':[[-1.5,-1.5],[1.5,1.5]],'installationFootprintM':[4,4],'imageSizeM':[.13,.08],'imageOffsetM':.2,'maximumSteeringFromRestDeg':80,'binocularSpacingM':.064,'assumedErrorM':.04,'errorDerivation':'hypothetical 15mm tracking + 0.5m/s * 50ms latency =40mm, not measured','oneObserverPerSteeredOutput':True,'fixedImagePositionPreserved':False,'arbitraryRoomImageSolved':False,'continuousCoverageProven':False,'physicalAccepted':False,'glareMeasured':False,'actuatorOrOpticalPrescriptionSelected':False,'runs':runs,'limitations':['Image moves around node with optical assembly; not room-fixed CAD','80deg steering not demonstrated; motors, collision, settling, stray light unmodeled','No vendor aperture performance implied','No power or intensity increase assumed','Position heights and sampled gaze pitches do not cover continuous 3D or every orientation','Not applicable to multiple simultaneous viewers without a new model']}
 out=Path(output);out.mkdir(parents=True,exist_ok=True);(out/'tracked-aperture-comparison.json').write_text(json.dumps(result,indent=2)+'\n')
 for run in runs:print({k:run[k] for k in ['nodeCount','apertureM','sampledPoses','missedPoses','totalApertureAreaM2']})
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--output',required=True);main(p.parse_args().output)
