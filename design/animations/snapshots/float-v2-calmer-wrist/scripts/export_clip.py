import bpy, sys, os
out, ACT, LAST = sys.argv[sys.argv.index('--') + 1:][:3]; LAST = int(LAST)
arm = bpy.data.objects['Armature']
scene = bpy.context.scene
vl = bpy.context.view_layer

# one clip only: drop every other action
for _a in list(bpy.data.actions):
    if _a.name != ACT:
        bpy.data.actions.remove(_a)
if False:
    bpy.data.actions.remove(bpy.data.actions['Starting_Pose'])
act = bpy.data.actions[ACT]
# strip everything but the armature
for o in list(bpy.data.objects):
    if o.name != 'Armature':
        bpy.data.objects.remove(o, do_unlink=True)

if arm.animation_data is None:
    arm.animation_data_create()
arm.animation_data.action = act
arm.animation_data.action_slot = act.slots[0]
scene.render.fps = 30
scene.frame_start = 1; scene.frame_end = LAST; scene.frame_set(1)
for o in scene.objects:
    o.select_set(o == arm)
vl.objects.active = arm

kw = dict(filepath=out, export_format='GLB', use_selection=True, export_def_bones=True,
          export_force_sampling=True, export_frame_step=1, export_frame_range=True,
          export_animation_mode='ACTIVE_ACTIONS', export_animations=True,
          export_anim_slide_to_zero=True, export_apply=False, export_materials='NONE',
          export_cameras=False, export_lights=False, export_yup=True)
try:
    bpy.ops.export_scene.gltf(**kw)
except TypeError as e:
    print('retry without optional kwargs:', e)
    for k in ('export_anim_slide_to_zero', 'export_materials', 'export_animation_mode'):
        kw.pop(k, None)
    bpy.ops.export_scene.gltf(**kw)
print('EXPORTED', out, os.path.getsize(out))
