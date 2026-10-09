"""Neck-deep tread with CIRCULAR hand paths: hands go down through the middle, open out at the bottom and
rise up the outside (frontal-plane circle). Arms via the rig's IK controls. 48-frame loop (1.6 s).
exec'd in the dclrig namespace (needs build_swim / build_chill helpers)."""
import math
from mathutils import Vector

C3 = dict(drop=-0.05, bob=0.035, lean=20, rock=2.0, roll=2.0,
          cx=0.36, r=0.28, zc=1.16, fwd=-0.34, lag=18,
          pole_back=0.55, pole_out=0.55, pole_dz=-0.30,
          thigh=40, thigh_amp=14, knee=118, knee_amp=20, foot=-4,
          head_turn=8, head_nod=3)

def set_world(name, target):
    pb = arm.pose.bones[name]
    M = pb.matrix.copy()
    M.translation = arm.matrix_world.inverted() @ Vector(target)
    pb.matrix = M

def chill3_pose(theta, S, S2):
    t = math.radians(theta)            # one hand circle per loop
    p = 2 * t                          # legs: two cycles per loop
    upright_prep()
    setprop(UB, 'FK > IK Arm L', 1.0); setprop(UB, 'FK > IK Arm R', 1.0)
    move(UB, dz=C3['drop'] - C3['bob'] * math.cos(t))
    rw(UB, 'X', C3['lean'] + C3['rock'] * math.sin(t))
    rw(UB, 'Y', C3['roll'] * math.sin(t + math.radians(90)))
    U()
    for s, side, off in (('L', 1.0, 0.0), ('R', -1.0, math.radians(C3['lag']))):
        sh = wpos('Avatar_%sArm' % ('Left' if s == 'L' else 'Right'))
        u = t - off
        # frontal-plane circle: u=0 top (centre line x=cx), u=90 inner side (near midline), 180 bottom, 270 outer side
        x = side * (C3['cx'] - C3['r'] * math.sin(u))
        z = C3['zc'] + C3['r'] * math.cos(u)
        set_world('CTRL_IK_Avatar_Hand.' + s, (x, sh.y + C3['fwd'], z))
        set_world('CTRL_IK_Avatar_Elbow.' + s, (side * C3['pole_out'], sh.y + C3['pole_back'], sh.z + C3['pole_dz']))
        ps = p + (0.0 if s == 'L' else math.pi)
        rl('CTRL_FK_Avatar_UpLeg.' + s, 'X', S2['thigh' + s] * (C3['thigh'] + C3['thigh_amp'] * math.sin(ps + math.radians(200))))
        rl('CTRL_FK_Avatar_Leg.' + s, 'X', S2['knee' + s] * (C3['knee'] + C3['knee_amp'] * math.sin(ps + math.radians(290))))
        rl('CTRL_FK_Avatar_Foot.' + s, 'X', S2['foot' + s] * C3['foot'])
    rl('CTRL_Avatar_Head', 'Y', S2['hturn'] * C3['head_turn'] * math.sin(t))
    rl('CTRL_Avatar_Head', 'X', C3['head_nod'] * math.sin(t + math.radians(90)))
    U()
