"""Run through live Blender MCP. Create an isolated textured bite review."""
import bpy, math
from mathutils import Vector, Quaternion
source=bpy.context.scene.objects['Meshy Shark']
scene=bpy.data.scenes.new('Meshy Bite Animation')
camera=bpy.context.scene.camera.copy();camera.data=camera.data.copy();scene.collection.objects.link(camera);scene.camera=camera
bpy.context.window.scene=scene
ob=source.copy();ob.data=source.data.copy();ob.name='Shark Bite Mesh';scene.collection.objects.link(ob)
arm=bpy.data.armatures.new('Shark Bite Skeleton');rig=bpy.data.objects.new('Shark Bite Rig',arm);scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active=rig;rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
def bone(name,head,tail,parent=None):
    b=arm.edit_bones.new(name);b.head=head;b.tail=tail
    if parent:b.parent=arm.edit_bones[parent]
bone('Body',(0,0,0),(0,-.3,0))
bone('Jaw',(0,-.49,.12),(0,-.83,.12),'Body')
bone('Tail',(0,.25,0),(0,.72,0),'Body')
bpy.ops.object.mode_set(mode='OBJECT')
mod=ob.modifiers.new('Bite skeleton','ARMATURE');mod.object=rig;ob.parent=rig
groups={n:ob.vertex_groups.new(name=n) for n in ['Body','Jaw','Tail']}
def smooth(t):
    t=max(0,min(1,t));return t*t*(3-2*t)
for v in ob.data.vertices:
    x,y,z=v.co
    jaw=smooth((-y-.38)/.23)*(1-smooth((z-.085)/.075))
    tail=smooth((y-.2)/.38)
    weights={'Jaw':jaw,'Tail':tail,'Body':max(0,1-jaw-tail)}
    total=sum(weights.values())
    for name,w in weights.items():
        if w>0:groups[name].add([v.index],w/total,'REPLACE')
scene.render.fps=30;scene.frame_start=1;scene.frame_end=90
def key(name,axis,deg,frame):
    p=rig.pose.bones[name];p.rotation_mode='QUATERNION'
    basis=p.bone.matrix_local.to_quaternion()
    p.rotation_quaternion=basis.inverted()@Quaternion(Vector(axis),math.radians(deg))@basis
    p.keyframe_insert(data_path='rotation_quaternion',frame=frame,group=name)
for frame,angle in [(1,-27),(12,-27),(32,0),(43,3),(48,3),(54,-27),(64,-27),(80,-20),(90,-27)]:
    key('Jaw',(1,0,0),angle,frame)
for frame,angle in [(1,0),(12,2),(25,-3),(38,3),(48,-3),(54,5),(65,-3),(78,2),(90,0)]:
    key('Tail',(0,0,1),angle,frame)
rig.animation_data.action.name='Bite'
for name,f in [('Rest',1),('Open',32),('Anticipation',48),('Bite contact',54),('Settle',64)]:scene.timeline_markers.new(name,frame=f)
scene.render.resolution_x=1000;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
camera.location=(0,-1.85,-1.15);camera.rotation_euler=(Vector((0,-.25,.05))-camera.location).to_track_quat('-Z','Y').to_euler()
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.shading.type='MATERIAL';area.spaces.active.shading.use_scene_world=False;area.spaces.active.shading.use_scene_lights=False
        area.spaces.active.region_3d.view_perspective='CAMERA'
rig.select_set(False);ob.select_set(True);bpy.context.view_layer.objects.active=ob
scene.frame_set(43)
print('Created Bite: 3 seconds, 3 bones, smooth jaw weights, textures retained.')
