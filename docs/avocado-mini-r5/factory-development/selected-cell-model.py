"""Exact line/rectangular-aperture necessary geometry for selected E0 parts.
Not DCRA optical prescription, radiometry, comfort, spatial-resolution or coverage proof.
"""
import argparse,json,math,runpy
from pathlib import Path
base=runpy.run_path(str(Path(__file__).with_name('optimize-display-layout.py')))
dot,sub,unit,poses=base['dot'],base['sub'],base['unit'],base['poses']

def visible(p,node,cfg):
 x,y,z=node;front=unit((-x,-y,0));right=(-front[1],front[0],0);up=(-front[0]/math.sqrt(2),-front[1]/math.sqrt(2),1/math.sqrt(2));normal=(front[0]/math.sqrt(2),front[1]/math.sqrt(2),1/math.sqrt(2))
 # Reversing plane normal does not change aperture intersection. Source below plate.
 center=(x,y,z);image=tuple(a+cfg['imageOffsetTowardViewerM']*b for a,b in zip(center,front));yaw,pitch=p[3:];gaze=(math.cos(pitch)*math.cos(yaw),math.cos(pitch)*math.sin(yaw),math.sin(pitch))
 if dot(unit(sub(image,p[:3])),gaze)<.5:return False
 head_right=(-math.sin(yaw),math.cos(yaw),0)
 for eye_sign in [-1,1]:
  eye=tuple(a+eye_sign*.032*b for a,b in zip(p[:3],head_right))
  for a in [-1,1]:
   for b in [-1,1]:
    point=tuple(image[i]+a*cfg['imageWidthM']/2*right[i]+b*cfg['imageHeightM']/2*(i==2) for i in range(3))
    direction=sub(eye,point);denominator=dot(normal,direction)
    if abs(denominator)<1e-10:return False
    t=dot(normal,sub(center,point))/denominator
    if t>=0:return False # aperture must be behind real image, eye beyond image
    hit=tuple(point[i]+t*direction[i]-center[i] for i in range(3))
    if max(abs(dot(hit,right)),abs(dot(hit,up)))>cfg['plateClearSquareM']/2:return False
 return True

def main(output):
 selected=json.loads(Path(__file__).with_name('selected-cell.json').read_text());cfg=selected['opticalHypothesis'];ps=poses(.25,16);locations=[(0,-2,1.2),(2,0,1.2),(0,2,1.2),(-2,0,1.2)];runs=[]
 for count in [1,2,4]:
  nodes=locations[:1] if count==1 else [locations[0],locations[2]] if count==2 else locations
  missed=sum(not any(visible(p,n,cfg) for n in nodes) for p in ps)
  runs.append({'opticalCellCount':count,'locationsM':nodes,'sampledViewerPoses':len(ps),'necessaryGeometryMissedPoses':missed,'physicalAccepted':False})
 ronmax=.025;voltage=5;current=2
 report={'schema':'rockstaros.selected-cell-screen/1','selectedParts':'selected-cell.json','serviceDomainM':[3,3],'installationFootprintM':[4,4],'runs':runs,'imageFollowsNodeNotArbitraryWorldAnchor':True,'glareEvaluated':False,'clearApertureAssumptionVerified':False,'continuousCoverageProven':False,'modelLimit':'Corner rays and two eye centres only. No pupil, uncertainty, occluders, DCRA angle acceptance, diffraction or measured optical efficiency. Necessary only.',
 'powerCouponCalculations':{'studyCurrentA':current,'maximumDatasheetRonAt5VBiasOhm':ronmax,'switchDissipationW':current*current*ronmax,'switchVoltageDropV':current*ronmax,'datasheetThetaJaCPerW':72.3,'indicativeDeltaTJUnderDatasheetBoardC':current*current*ronmax*72.3,'actualBoardThermalAccepted':False,'onVoltageVFrom3V3_1k_10k':3.3*10000/11000,'inrushFormula':'I=C*5V/riseTime; OLED input capacitance and measured rise time missing','opticalStopVerified':False},'manufacturingReleased':False}
 out=Path(output);out.mkdir(parents=True,exist_ok=True);(out/'selected-cell-screen.json').write_text(json.dumps(report,indent=2)+'\n')
 for run in runs:print(run)
 print(report['powerCouponCalculations'])
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--output',required=True);main(p.parse_args().output)
