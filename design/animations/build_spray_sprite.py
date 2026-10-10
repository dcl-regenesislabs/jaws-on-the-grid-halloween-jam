"""Render a tiny rounded droplet sprite from geometry in background Blender."""
import bpy
from pathlib import Path

root = Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12)
drop = bpy.context.object
drop.scale = (.72, .72, 1)
for p in drop.data.polygons:
    p.use_smooth = True
mat = bpy.data.materials.new('WaterWhite')
mat.use_nodes = True
nodes = mat.node_tree.nodes
shader = nodes.get('Principled BSDF')
shader.inputs['Base Color'].default_value = (.75, .93, 1, 1)
shader.inputs['Emission Color'].default_value = (.75, .93, 1, 1)
shader.inputs['Emission Strength'].default_value = 1
drop.data.materials.append(mat)
bpy.ops.object.camera_add(location=(0, -5, 0), rotation=(1.5707963, 0, 0))
scene = bpy.context.scene
scene.camera = bpy.context.object
scene.camera.data.type = 'ORTHO'
scene.camera.data.ortho_scale = 2.5
scene.render.engine = 'CYCLES'
scene.cycles.samples = 16
scene.render.film_transparent = True
scene.render.resolution_x = scene.render.resolution_y = 64
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.filepath = str(root / 'assets/images/cinematic-droplet.png')
bpy.ops.render.render(write_still=True)
