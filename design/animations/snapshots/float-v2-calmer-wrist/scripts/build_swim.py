"""Front-crawl swim loop. exec'd in the dclrig namespace (ns). 36-frame loop, frames 1..37."""
import math
from mathutils import Vector

UB = 'CTRL_Avatar_UpperBody'
P = dict(pitch=80, drop=-0.35, roll=24, head=-20,
         arm_out=8, arm_out_rec=22, elbow_min=22, elbow_amp=68,
         kick=18, knee_base=12, knee_amp=26, foot=22, spine=0)

def fk_legs():
    setprop(UB, 'FK > IK Leg L', 0.0); setprop(UB, 'FK > IK Leg R', 0.0)

def base_body(pitch=None, drop=0.0):
    reset_all(); fk_legs()
    move(UB, dz=drop)      # translate BEFORE rotating: pose location is in the bone's un-posed frame
    rw(UB, 'X', P['pitch'] if pitch is None else pitch)

# ---- sign detection (done once, on the pitched prone body) ----
def detect_signs():
    S = {}
    prep = lambda: base_body()
    for s, full in (('L', 'Left'), ('R', 'Right')):
        # elbow flexion: hand moves forward (-Y) when arms hang
        S['elbow' + s] = auto_sign('CTRL_FK_Avatar_ForeArm.' + s, 'X', lambda f=full: -wpos('Avatar_%sHand' % f).y)
        # thigh: positive local-X rotation raises the foot (+Z) on the prone body
        S['thigh' + s] = auto_sign('CTRL_FK_Avatar_UpLeg.' + s, 'X', lambda f=full: wpos('Avatar_%sFoot' % f).z, prep)
        # knee: flexion lifts the foot (+Z) on the prone body
        S['knee' + s]  = auto_sign('CTRL_FK_Avatar_Leg.' + s, 'X', lambda f=full: wpos('Avatar_%sFoot' % f).z, prep)
        # foot (ankle) plantar flexion: toes point away (+Y) when trailing
        S['foot' + s]  = auto_sign('CTRL_FK_Avatar_Foot.' + s, 'X', lambda f=full: wpos('Avatar_%sToeBase' % f).y, prep)
    S['head'] = auto_sign('CTRL_Avatar_Head', 'X', lambda: -wpos('Avatar_Head').y - 0.0001 * wpos('Avatar_Head').z, prep)
    # body roll about world Y: positive angle raises which shoulder?
    reset_all(); base_body(); rw(UB, 'Y', 15); U()
    S['roll'] = 1 if wpos('Avatar_RightShoulder').z > wpos('Avatar_LeftShoulder').z else -1   # +1: +roll lifts RIGHT side
    reset_all()
    return S

def arm_dir_out(n, side, deg):
    """Swing the arm sideways (away from the body midline) by deg, whatever its current direction."""
    U()
    pb = arm.pose.bones[n]
    v = ((arm.matrix_world @ pb.tail) - (arm.matrix_world @ pb.head)).normalized()
    a = v.cross(Vector((1, 0, 0)))
    if a.length < 1e-4:
        return
    a.normalize()
    rw(n, a, deg if side == 'L' else -deg)

def swim_pose(phi, S):
    """phi: right-arm stroke phase in degrees (0 = hand entering forward, 90 = pulling under,
    180 = hand at hip / exit, 270 = recovery over the top). Left arm is 180 deg behind."""
    base_body(drop=P['drop'])
    # body roll toward the pulling arm: right arm recovering (sin<0) -> right side up
    rw(UB, 'Y', S['roll'] * P['roll'] * -math.sin(math.radians(phi)))
    for s, off in (('R', 0), ('L', 180)):
        ph = math.radians(phi + off)
        # After the pitch the arm base points back along the body (+Y). Rotating about world X by
        # theta = phi - 180 sweeps it forward(-Y) -> down(-Z) -> back(+Y) -> up(+Z) -> forward.
        rw('CTRL_FK_Avatar_Arm.' + s, 'X', (phi + off) - 180)
        rec = max(0.0, -math.sin(ph))                         # 0..1 while the arm is over the water
        arm_dir_out('CTRL_FK_Avatar_Arm.' + s, s, P['arm_out'] + (P['arm_out_rec'] - P['arm_out']) * rec)
        el = P['elbow_min'] + P['elbow_amp'] * math.sin(ph) ** 2
        rl('CTRL_FK_Avatar_ForeArm.' + s, 'X', S['elbow' + s] * el)
        # flutter kick: 3 beats per arm cycle, legs in antiphase
        pk = math.radians(3 * (phi + off))
        rl('CTRL_FK_Avatar_UpLeg.' + s, 'X', S['thigh' + s] * P['kick'] * math.sin(pk))
        knee = P['knee_base'] + P['knee_amp'] * max(0.0, math.sin(pk + math.radians(70)))
        rl('CTRL_FK_Avatar_Leg.' + s, 'X', S['knee' + s] * knee)
        rl('CTRL_FK_Avatar_Foot.' + s, 'X', S['foot' + s] * P['foot'])
    rl('CTRL_Avatar_Head', 'X', S['head'] * P['head'])
    U()

def report(tag):
    U()
    r3 = lambda v: [round(x, 2) for x in v]
    toes = min(wpos('Avatar_LeftToeBase').z, wpos('Avatar_RightToeBase').z)
    print('POSE', tag, 'hips', r3(wpos('Avatar_Hips')), 'head', r3(wpos('Avatar_Head')),
          'handL', r3(wpos('Avatar_LeftHand')), 'handR', r3(wpos('Avatar_RightHand')),
          'minToeZ', round(toes, 3), 'area', in_area() or 'ok')
