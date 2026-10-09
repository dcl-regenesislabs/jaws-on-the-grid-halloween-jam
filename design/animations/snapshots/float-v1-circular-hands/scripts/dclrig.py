"""Helpers for authoring Decentraland emotes on Avatar_File.blend (Blender 5.x). Exec'd into a namespace."""
import bpy, math
from mathutils import Vector, Quaternion

arm   = bpy.data.objects['Armature']
vl    = bpy.context.view_layer
scene = bpy.context.scene
BASE  = {}
PREV  = {}

def U():
    vl.update()
    bpy.context.evaluated_depsgraph_get().update()


PROPS = {
    'CTRL_Avatar_UpperBody': ['FK > IK Arm L', 'FK > IK Arm R',
                              'FK > IK Leg L', 'FK > IK Leg R',
                              'IsoRot Arm  FK L', 'IsoRot Arm  FK R'],
    'CTRL_Avatar_Head': ['Inherit Rotation'],
}

def capture_base():
    scene.frame_set(0)
    for pb in arm.pose.bones:
        BASE[pb.name] = (pb.location.copy(), pb.rotation_quaternion.copy(),
                         pb.rotation_euler.copy(), pb.scale.copy(),
                         {k: pb[k] for k in PROPS.get(pb.name, [])})

def reset_all():
    for pb in arm.pose.bones:
        loc, rq, re, sc, props = BASE[pb.name]
        pb.location = loc; pb.rotation_quaternion = rq
        pb.rotation_euler = re; pb.scale = sc
        for k, v in props.items():
            pb[k] = v
    U()

def wpos(n):  return arm.matrix_world @ arm.pose.bones[n].head
def wtail(n): return arm.matrix_world @ arm.pose.bones[n].tail

def rl(n, axis, deg):
    if isinstance(axis, str):
        axis = {'X': (1, 0, 0), 'Y': (0, 1, 0), 'Z': (0, 0, 1)}[axis]
    pb = arm.pose.bones[n]
    q = Quaternion(axis, math.radians(deg))
    if pb.rotation_mode == 'QUATERNION':
        pb.rotation_quaternion = pb.rotation_quaternion @ q
    else:
        pb.rotation_euler = (pb.rotation_euler.to_quaternion() @ q).to_euler(pb.rotation_mode)

def rw(n, axis, deg):
    if isinstance(axis, str):
        axis = {'X': (1, 0, 0), 'Y': (0, 1, 0), 'Z': (0, 0, 1)}[axis]
    U()
    pb = arm.pose.bones[n]
    M = (arm.matrix_world @ pb.matrix).to_3x3().normalized()
    rl(n, M.inverted() @ Vector(axis), deg)

def move(n, dx=0, dy=0, dz=0):
    U()
    pb = arm.pose.bones[n]
    M = (arm.matrix_world @ pb.matrix).to_3x3().normalized()
    pb.location += (M.inverted() @ Vector((dx, dy, dz))) * 100.0

def setprop(n, key, value):
    arm.pose.bones[n][key] = value

def key_all(frame, deform=False):
    """Key every control bone (+props). Quaternions are kept in the same hemisphere as the previous
    key so interpolation never takes the long way round."""
    U()
    for pb in arm.pose.bones:
        if not pb.name.startswith('CTRL_') and not (deform and pb.bone.use_deform):
            continue
        if pb.rotation_mode == 'QUATERNION':
            q = pb.rotation_quaternion
            p = PREV.get(pb.name)
            if p is not None and q.dot(p) < 0:
                pb.rotation_quaternion = Quaternion((-q.w, -q.x, -q.y, -q.z))
            PREV[pb.name] = pb.rotation_quaternion.copy()
        pb.keyframe_insert('location', frame=frame)
        pb.keyframe_insert('rotation_quaternion' if pb.rotation_mode == 'QUATERNION'
                           else 'rotation_euler', frame=frame)
        pb.keyframe_insert('scale', frame=frame)
        for k in PROPS.get(pb.name, []):
            pb.keyframe_insert('["%s"]' % k, frame=frame)

def new_action(name):
    act = bpy.data.actions.new(name)
    slot = act.slots.new('OBJECT', 'Avatar_Animation')
    if arm.animation_data is None:
        arm.animation_data_create()
    arm.animation_data.action = act
    arm.animation_data.action_slot = slot
    act.use_fake_user = True
    PREV.clear()
    return act

def auto_sign(bone, axis, metric, prep=None):
    reset_all()
    if prep: prep()
    U(); before = metric()
    rl(bone, axis, 15)
    U(); after = metric()
    reset_all()
    return 1 if after > before else -1

def in_area():
    U()
    bad = []
    h = wpos('Avatar_Hips')
    if abs(h.x) > 1.0 or abs(h.y) > 1.0:
        bad.append(('ROOT', tuple(round(v, 2) for v in h)))
    for pb in arm.pose.bones:
        if not pb.bone.use_deform:
            continue
        for p in (wpos(pb.name), wtail(pb.name)):
            if abs(p.x) > 2.0 or abs(p.y) > 2.0 or p.z < 0.0 or p.z > 4.0:
                bad.append((pb.name, tuple(round(v, 2) for v in p)))
    return bad
