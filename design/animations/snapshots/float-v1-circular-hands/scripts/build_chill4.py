"""chill3 + natural hand orientation. IK hand control frame (verified on both hands): local Y = fingers,
local -X = palm normal, local Z = X x Y. exec'd in the dclrig namespace after build_chill3."""
import math
from mathutils import Vector, Matrix

H = dict(droop=0.25)

# palm-normal angle (left hand, in the frontal x-z plane, 0=outward, 90=up, 180=inward, 270=down) at anchor phases
#   u=0 top: palm inward | u=90 mid-press (moving down): palm down | u=180 bottom (sweeping out): palm outward
#   u=270 rising on the outside: palm outward (edge-leading) | u=360 top again: palm inward (half turn over the top)
_ANCH = [(0.0, math.pi), (0.5 * math.pi, 1.5 * math.pi), (math.pi, 2 * math.pi),
         (1.5 * math.pi, 2 * math.pi), (2 * math.pi, 3 * math.pi)]

def palm_angle(u):
    u = u % (2 * math.pi)
    for (a0, v0), (a1, v1) in zip(_ANCH, _ANCH[1:]):
        if u <= a1 + 1e-9:
            k = (u - a0) / (a1 - a0)
            k = 0.5 - 0.5 * math.cos(math.pi * k)           # smooth between anchors
            return v0 + (v1 - v0) * k
    return _ANCH[-1][1]

def orient_hand(s, u):
    full = 'Left' if s == 'L' else 'Right'
    hand = wpos('Avatar_%sHand' % full)
    elbow = wpos('Avatar_%sForeArm' % full)
    f = (hand - elbow).normalized() + Vector((0, 0, -H['droop']))
    f.normalize()
    th = palm_angle(u)
    if s == 'R':
        th = math.pi - th                                     # mirror across the body midline
    n = Vector((math.cos(th), 0.0, math.sin(th)))
    n = (n - f * n.dot(f))
    if n.length < 1e-4:
        return
    n.normalize()
    X = -n; Y = f; Z = X.cross(Y)
    Rw = Matrix((X, Y, Z)).transposed()                       # columns X, Y, Z in world
    Mw = arm.matrix_world.to_3x3().normalized()
    Ra = Mw.inverted() @ Rw
    pb = arm.pose.bones['CTRL_IK_Avatar_Hand.' + s]
    T = pb.matrix.translation.copy()
    pb.matrix = Matrix.Translation(T) @ Ra.to_4x4()

def chill4_pose(theta, S, S2):
    chill3_pose(theta, S, S2)
    t = math.radians(theta)
    orient_hand('L', t)
    orient_hand('R', t - math.radians(C3['lag']))
    U()
