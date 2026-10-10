"""Run in live Blender via MCP. Models use one palette material, no external art."""
import bpy, math, os
from mathutils import Vector

ROOT = r'C:/Users/mateo/orca/manu-kuruk-halloween-jam'
scene = bpy.data.scenes.new('Starting Raft')
bpy.context.window.scene = scene
colors = ['B57A43', 'C38B50', 'D49B5B', '8A542F', '523928', '223C40', '456B69', 'DBB881', 'E9E2C9', 'E9AB35', 'B84D32', '182F32']
palette = bpy.data.images.new('Raft palette', width=64, height=64)
pixels = []
for y in range(64):
    for x in range(64):
        h = colors[min(11, (y // 16) * 4 + x // 16)]
        pixels.extend([int(h[i:i+2],16)/255 for i in (0,2,4)] + [1])
palette.pixels = pixels
palette.pack()
mat = bpy.data.materials.new('Raft palette'); mat.use_nodes = True
bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
bsdf.inputs['Roughness'].default_value = .85
tex = mat.node_tree.nodes.new('ShaderNodeTexImage'); tex.image = palette; tex.interpolation = 'Closest'
mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])

def finish(obj, name, color):
    obj.name = name
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if obj.type != 'MESH': bpy.ops.object.convert(target='MESH')
    obj.data.materials.clear(); obj.data.materials.append(mat)
    uv = obj.data.uv_layers.active or obj.data.uv_layers.new()
    for loop in uv.data: loop.uv = ((color % 4 + .5)/4, (color // 4 + .5)/4)
    return obj

def box(name, pos, size, color, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    o=bpy.context.object; o.dimensions=size
    finish(o,name,color)
    if bevel:
        m=o.modifiers.new('Soft edges','BEVEL'); m.width=bevel; m.segments=1
        bpy.ops.object.modifier_apply(modifier=m.name)
    return o

def cylinder(name, pos, radius, depth, color, rotation=(0,0,0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=radius, depth=depth, location=pos, rotation=rotation)
    return finish(bpy.context.object,name,color)

def rope(name, points, radius=.075, color=7):
    curve=bpy.data.curves.new(name,'CURVE'); curve.dimensions='3D'; curve.bevel_depth=radius; curve.bevel_resolution=0; curve.resolution_u=1
    spl=curve.splines.new('POLY'); spl.points.add(len(points)-1)
    for p,co in zip(spl.points,points): p.co=(*co,1)
    obj=bpy.data.objects.new(name,curve); scene.collection.objects.link(obj)
    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True)
    return finish(obj,name,color)

def export_group(name, objects):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects: o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.join()
    o=bpy.context.object; o.name=name
    scene.cursor.location=(0,0,0); bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # Joining shared material objects leaves one palette slot.
    for p in o.data.polygons: p.material_index=0
    while len(o.data.materials)>1: o.data.materials.pop(index=len(o.data.materials)-1)
    bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT,'assets/models',name+'.glb'), export_format='GLB', use_selection=True, use_active_scene=True, export_yup=True, export_apply=True, export_animations=False, export_cameras=False, export_lights=False)
    o.data.calc_loop_triangles()
    bounds=[o.matrix_world @ Vector(v) for v in o.bound_box]
    print(name, 'triangles',len(o.data.loop_triangles),'bounds', [tuple(round(f(v[i] for v in bounds),3) for i in range(3)) for f in (min,max)])
    return o

# Deck top is the origin plane, preserving the game's existing RAFT_Y.
for row in range(24):
    for col in range(6):
        box('Deck plank',(-10+col*4,-11.5+row,-.22),(3.95,.95,.44),(row+col*2)%3,.035)
for y in (-10.8,10.8):
    box('Edge beam',(0,y,-.45),(24,.44,.55),3,.035)
for x in (-11.65,11.65):
    box('Rim',(x,0,-.12),(.3,24,.3),3,.03)
    for y in (-9,-3,3,9):
        cylinder('Barrel float',(x,y,-.6),.7,2.8,5,(math.pi/2,0,0))
        for dy in (-1,1): cylinder('Barrel band',(x,y+dy,-.6),.735,.13,4,(math.pi/2,0,0))
for x in (-11,11):
    for y in (-11,11):
        cylinder('Mooring post',(x,y,.5),.24,1.5,3)
        cylinder('Post cap',(x,y,1.2),.31,.12,7)
        for z in (.45,.62):
            rope('Lashing',[(x+.29*math.cos(t*math.pi/8),y+.29*math.sin(t*math.pi/8),z) for t in range(17)],.045)
# Four continuous sagging ropes, tied into the lashings at both corner posts.
# Decorative only: they do not block the game's grid movement off the raft.
for side in (-11,11):
    rope('Side rope',[(side,-11+22*k/32,.62-.35*math.sin(k*math.pi/32)) for k in range(33)])
    rope('End rope',[(-11+22*k/32,side,.62-.35*math.sin(k*math.pi/32)) for k in range(33)])
raft=export_group('starting-raft',list(scene.objects))

# Separate broad clickable lectern. Sloped toward the camera to read from above.
before=set(scene.objects)
for x in (-1.85,1.85):
    box('Board foot',(x,0,.12),(.6,1.7,.24),4,.05)
    box('Board leg',(x,0,.95),(.25,.3,1.7),3,.025)
panel=[]
panel.append(box('Frame',(0,0,0),(5.5,3,.2),3,.06))
panel.append(box('Chalk face',(0,0,.12),(5.12,2.62,.08),11,.025))
for y in (-1.4,1.4): panel.append(box('Brass trim',(0,y,.12),(5.35,.08,.08),9))
def text(body, y, size, color):
    bpy.ops.object.text_add(location=(0,y,.175))
    o=bpy.context.object; o.data.body=body; o.data.align_x='CENTER'; o.data.align_y='CENTER'; o.data.size=size; o.data.extrude=.003; o.data.resolution_u=2
    panel.append(finish(o,body,color))
text('SCORE BOARD',.72,.55,8)
text('TOP SURVIVORS',.05,.28,7)
text('TAP TO VIEW',-.88,.32,9)
for x,h in ((-.52,.22),(0,.45),(.52,.14)):
    panel.append(box('Podium',(x,-.48+h/2,.18),(.4,h,.045),9))
from mathutils import Matrix
rot=Matrix.Rotation(math.radians(35),4,'X')
for o in panel: o.matrix_world=Matrix.Translation((0,0,1.85)) @ rot @ o.matrix_world
board=export_group('raft-scoreboard',[o for o in scene.objects if o not in before])
# Working layout only. GLB origins remain local; placement lives in the composite.
board.location=(0,-4,0)
os.makedirs(os.path.join(ROOT,'design/raft'),exist_ok=True)
bpy.data.libraries.write(os.path.join(ROOT,'design/raft/starting-raft.blend'),{scene},fake_user=True)
print('Saved editable raft scene and two GLBs')
