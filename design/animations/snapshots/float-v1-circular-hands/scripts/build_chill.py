"""Upright 'chilling' dog-paddle tread: body vertical, head up, slow under-water paw circles and bicycle legs.
60-frame loop (2.0 s), frames 1..61; arms/legs go round twice per loop, bob/head once. exec'd in the dclrig namespace."""
import math
from mathutils import Vector

UB = 'CTRL_Avatar_UpperBody'
C = dict(drop=-0.25, bob=0.03, lean=3.0, rock=2.0, roll=2.5,
         arm_fwd=28, arm_fwd_amp=12, arm_out=18, arm_out_amp=8, el=78, el_amp=14,
         thigh=32, thigh_amp=14, knee=62, knee_amp=24, foot=22,
         head_turn=12, head_nod=4)

def upright_prep():
    reset_all(); fk_legs()

def detect_signs_upright():
    """Signs for the standing body (the prone signs from the swim don't carry over)."""
    S2 = {}
    for s, full in (('L', 'Left'), ('R', 'Right')):
        # positive thigh rotation swings the foot FORWARD (-Y)
        S2['thigh' + s] = auto_sign('CTRL_FK_Avatar_UpLeg.' + s, 'X', lambda f=full: -wpos('Avatar_%sFoot' % f).y, upright_prep)
        # positive knee rotation folds the foot BACK (+Y)
        S2['knee' + s]  = auto_sign('CTRL_FK_Avatar_Leg.' + s, 'X', lambda f=full: wpos('Avatar_%sFoot' % f).y, upright_prep)
        # positive ankle rotation points the toes DOWN
        S2['foot' + s]  = auto_sign('CTRL_FK_Avatar_Foot.' + s, 'X', lambda f=full: -(wpos('Avatar_%sToeBase' % f).z - wpos('Avatar_%sFoot' % f).z), upright_prep)
    S2['hturn'] = 1
    return S2

def chill_pose(theta, S, S2):
    t = math.radians(theta)            # loop phase 0..360 (bob, head)
    p = 2 * t                          # paddle phase: two cycles per loop
    upright_prep()
    move(UB, dz=C['drop'] + C['bob'] * math.sin(t))               # translate BEFORE rotating
    rw(UB, 'X', C['lean'] + C['rock'] * math.sin(t + math.radians(60)))
    rw(UB, 'Y', C['roll'] * math.sin(t + math.radians(120)))
    for s, off in (('L', 0.0), ('R', math.pi)):
        ps = p + off
        n = 'CTRL_FK_Avatar_Arm.' + s
        # upper arm hangs down-forward and circles gently under the surface
        rw(n, 'X', -(C['arm_fwd'] + C['arm_fwd_amp'] * math.sin(ps)))
        arm_dir_out(n, s, C['arm_out'] + C['arm_out_amp'] * math.cos(ps))
        rl('CTRL_FK_Avatar_ForeArm.' + s, 'X', S['elbow' + s] * (C['el'] + C['el_amp'] * math.sin(ps + math.radians(90))))
        # bicycle legs, antiphase
        rl('CTRL_FK_Avatar_UpLeg.' + s, 'X', S2['thigh' + s] * (C['thigh'] + C['thigh_amp'] * math.sin(ps + math.radians(200))))
        rl('CTRL_FK_Avatar_Leg.' + s, 'X', S2['knee' + s] * (C['knee'] + C['knee_amp'] * math.sin(ps + math.radians(290))))
        rl('CTRL_FK_Avatar_Foot.' + s, 'X', S2['foot' + s] * C['foot'])
    rl('CTRL_Avatar_Head', 'Y', S2['hturn'] * C['head_turn'] * math.sin(t))
    rl('CTRL_Avatar_Head', 'X', C['head_nod'] * math.sin(t + math.radians(90)))
    U()
