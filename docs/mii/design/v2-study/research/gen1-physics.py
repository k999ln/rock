"""31-gen1-physics.md の数値を再現する。python3 gen1-physics.py"""
import math
H_FIX=2.3  # 器具下面の高さ [m]
def lux(lm,diag):
    w=diag/math.sqrt(1+(9/16)**2); return lm/(w*w*9/16)
def gsd_mm(res,fov_deg,theta_deg,H=H_FIX):
    t=math.radians(theta_deg); return (H/math.cos(t)**2)*math.radians(1)/(res/fov_deg)*1000
if __name__=="__main__":
    for lm in (300,500,700,900,1500):
        print(lm,[round(lux(lm,d)) for d in (1.0,1.5,2.0,2.5)])
    for res in (1920,2592,4056):
        print(res,[round(gsd_mm(res,160,t),1) for t in (0,45,60)])
    print("throw ratio floor", round(H_FIX/(2.0/math.sqrt(1+(9/16)**2)),2))
    print("natural convection dT", round(95/(0.2*6)),"K")
