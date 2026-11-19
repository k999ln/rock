"""Optical necessary-condition calculation and axis-aligned packaging screen.

This is not an optical ray-tracer, optical design prescription, STEP model,
manufacturing CAD or hardware test. It must never release a product.
"""
from pathlib import Path
import argparse,json,math,html

SOURCE=Path(__file__).resolve().with_name('optical-layout-input.json')

def aerial_eye_box(aperture,image_width,image_distance,viewer_distance):
    # x_plate = (viewer_distance*x_image - image_distance*x_eye)/(viewer_distance-image_distance)
    if not all(math.isfinite(v) and v>0 for v in [aperture,image_width,image_distance,viewer_distance]) or viewer_distance<=image_distance:
        raise ValueError('INVALID_PLANAR_OPTICAL_GEOMETRY')
    raw=(aperture*(viewer_distance-image_distance)-image_width*viewer_distance)/image_distance
    return {'signedFullImageEyeBoxWidthM':raw,'fullImageEyeBoxWidthM':max(0,raw),'fullImageVisibleSomewhereInModel':raw>=0}

def extents(part):
    if part['shape']=='box':return part['min'],[x+s for x,s in zip(part['min'],part['size'])]
    x,y=part['centerXY'];r=part['radius'];z=part['z'];return [x-r,y-r,z],[x+r,y+r,z+part['height']]

def fits(part,radius,height):
    low,high=extents(part)
    radial=math.hypot(*part['centerXY'])+part['radius'] if part['shape']=='cylinder' else max(math.hypot(x,y) for x in [low[0],high[0]] for y in [low[1],high[1]])
    return {'insideNominalInnerCylinder':radial<=radius and low[2]>=0 and high[2]<=height,'radialClearanceMm':radius-radial,'bottomClearanceMm':height-high[2],'topClearanceMm':low[2]}

def collision(a,b):
    al,ah=extents(a);bl,bh=extents(b)
    if min(ah[2],bh[2])<=max(al[2],bl[2]):return False
    if a['shape']==b['shape']=='box':return all(min(ah[i],bh[i])>max(al[i],bl[i]) for i in [0,1])
    if a['shape']==b['shape']=='cylinder':return math.dist(a['centerXY'],b['centerXY'])<a['radius']+b['radius']
    c,box=(a,b) if a['shape']=='cylinder' else (b,a);low,high=extents(box)
    nearest=[max(low[i],min(high[i],c['centerXY'][i])) for i in [0,1]]
    return math.dist(nearest,c['centerXY'])<c['radius']

def distributed_study():
    """Ideal necessary-ray visibility at a finite grid, not physical coverage."""
    perimeter=[(-1.5,-1.5),(0,-1.5),(1.5,-1.5),(1.5,0),(1.5,1.5),(0,1.5),(-1.5,1.5),(-1.5,0)]
    points=[(x/2,y/2,z) for x in range(-3,4) for y in range(-3,4) for z in [.8,1.2,1.6]]
    results=[]
    for count in [4,8,16]:
        xy=perimeter[::2] if count==4 else perimeter
        heights=[1.2] if count<16 else [1.2,1.8]
        nodes=[(x,y,z) for z in heights for x,y in xy]
        for image_w,image_h in [(.04,.04),(.13,.08)]:
            hits=0;total=len(points)*4
            for px,py,pz in points:
                for yaw in [0,math.pi/2,math.pi,3*math.pi/2]:
                    visible=False
                    for nx,ny,nz in nodes:
                        length=math.hypot(nx,ny);normal=(-nx/length,-ny/length);right=(-normal[1],normal[0])
                        d=(px-nx)*normal[0]+(py-ny)*normal[1]
                        if d<=.2:continue
                        u=(px-nx)*right[0]+(py-ny)*right[1];v=pz-nz
                        bx=aerial_eye_box(.2,image_w,.2,d)['fullImageEyeBoxWidthM']
                        by=aerial_eye_box(.2,image_h,.2,d)['fullImageEyeBoxWidthM']
                        target=(nx+normal[0]*.2-px,ny+normal[1]*.2-py,nz-pz);distance=math.sqrt(sum(a*a for a in target))
                        facing=distance>0 and (math.cos(yaw)*target[0]+math.sin(yaw)*target[1])/distance>=.5
                        if bx>0 and by>0 and abs(u)<=bx/2 and abs(v)<=by/2 and facing:visible=True;break
                    hits+=visible
            results.append({'nodeCount':count,'imageWidthM':image_w,'imageHeightM':image_h,'sampledViewerPoses':total,'necessaryGeometryVisiblePoses':hits,'necessaryGeometryMissedPoses':total-hits,'nominalFraction':hits/total,'physicalAccepted':False})
    return {'ownerAuthorizedComparison':True,'scope':'finite grid, 200mm ideal square apertures, 200mm image offset, forward viewing cone 60deg half angle, no real occlusion/photometry',
      'visibilityMeaning':'At least one local image is visible; not arbitrary images at every room point.',
      'results':results,'coverageGuarantee':False,'physicalNodeBOMComplete':False}

def build(output):
    a=json.loads(SOURCE.read_text());shell=a['shell'];parts=a['components'];o=a['opticalModel'];radius=shell['innerDiameterMm']/2
    required=(o['requiredViewerWidthM']*o['imageDistanceM']+o['imageWidthM']*o['viewerDistanceM'])/(o['viewerDistanceM']-o['imageDistanceM'])
    optics=[{'apertureM':v,**aerial_eye_box(v,o['imageWidthM'],o['imageDistanceM'],o['viewerDistanceM'])} for v in o['aperturesM']]
    packaging=[{'id':p['id'],'geometry':p['geometry'],**fits(p,radius,shell['heightMm'])} for p in parts]
    overlaps=[{'a':p['id'],'b':q['id']} for i,p in enumerate(parts) for q in parts[i+1:] if collision(p,q)]
    report={'schema':'rockstaros.mini-optical-layout-screen/1','classification':a['classification'],'physicalMeasurements':False,
      'modelLimit':'Ideal planar real-image ray passage only; necessary, not sufficient. No diffraction, aberration, brightness, reflectance, eyeball, occlusion or eye-safety model. Not a general impossibility proof.',
      'optics':{'inputs':o,'examples':optics,'requiredApertureForRequestedViewerWidthM':required,
        'requiredApertureExamples':[{'imageWidthM':w,'requiredApertureM':(o['requiredViewerWidthM']*o['imageDistanceM']+w*o['viewerDistanceM'])/(o['viewerDistanceM']-o['imageDistanceM'])} for w in [0.04,0.13,0.4]],
        'candidateAcceptedForProduct':False},
      'packaging':packaging,'axisAlignedIntersections':overlaps,'mandatoryMissing':a['mandatoryMissing'],'opticalCandidateVerdicts':a['opticalCandidateVerdicts'],
      'distributedDisplayComparison':distributed_study(),
      'manufacturingReleased':False,'completeLayoutAccepted':False,'componentFitAloneGrantsAcceptance':False}
    out=Path(output);out.mkdir(parents=True,exist_ok=True)
    (out/'optical-layout-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    scad=['// Research envelope only. Excluded part in red. Never manufacture from this model.','$fn=96;',f'%cylinder(d={shell["innerDiameterMm"]},h={shell["heightMm"]});']
    for p in parts:
        col='[0.85,0.2,0.2,0.35]' if 'excluded' in p['release'] else '[0.45,0.6,0.5,0.7]'
        if p['shape']=='box':geometry=f'translate({json.dumps(p["min"])}) cube({json.dumps(p["size"])});'
        else:geometry=f'translate([{p["centerXY"][0]},{p["centerXY"][1]},{p["z"]}]) cylinder(r={p["radius"]},h={p["height"]});'
        scad.append('// '+p['id']+' / '+p['geometry']);scad.append('color('+col+') '+geometry)
    (out/'mini-research-envelope.scad').write_text('\n'.join(scad)+'\n')
    svg=['<svg xmlns="http://www.w3.org/2000/svg" width="1150" height="780" viewBox="0 0 1150 780"><rect width="1150" height="780" fill="#f3f4f0"/><g font-family="sans-serif" fill="#24342c"><text x="30" y="40" font-size="23">Mini optical and internal layout screening</text><text x="30" y="70" font-size="14">Research envelopes, not a complete assembly or manufacturing release</text>']
    scale=2.8;cx=300;top=120
    svg.append(f'<rect x="{cx-radius*scale}" y="{top}" width="{radius*2*scale}" height="{shell["heightMm"]*scale}" fill="none" stroke="#637567" stroke-width="2"/>')
    for i,p in enumerate(parts):
        low,high=extents(p);color='#b05248' if 'excluded' in p['release'] else '#728c78'
        svg.append(f'<rect x="{cx+low[0]*scale}" y="{top+low[2]*scale}" width="{(high[0]-low[0])*scale}" height="{(high[2]-low[2])*scale}" fill="{color}" fill-opacity=".45" stroke="{color}"/>')
        svg.append(f'<text x="550" y="{145+i*57}" font-size="15">{html.escape(p["id"])}</text><text x="550" y="{165+i*57}" font-size="12">{html.escape(p["geometry"])}</text>')
    svg.extend([f'<text x="30" y="710" font-size="16">Ideal aperture required for 3m viewer width: {required*1000:.1f} mm</text>','<text x="30" y="740" font-size="14">Full-range optics, radio, protected pack and complete layout remain unresolved.</text></g></svg>'])
    (out/'mini-optical-layout.svg').write_text('\n'.join(svg))
    print(json.dumps({'requiredApertureMm':required*1000,'eyeBoxExamples':optics,'outsideShell':[p['id'] for p in packaging if not p['insideNominalInnerCylinder']],'missingCount':len(a['mandatoryMissing']),'manufacturingReleased':False},ensure_ascii=False))
    return report

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',required=True);args=p.parse_args();build(args.output)
