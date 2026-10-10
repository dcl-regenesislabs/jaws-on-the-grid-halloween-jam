import bpy, math
from mathutils import Vector
from pathlib import Path
repo=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(repo/'assets/models/shark.glb'))
scene=bpy.context.scene; scene.frame_set(1)
source=bpy.data.objects['Shark']; deps=bpy.context.evaluated_depsgraph_get()
mesh=bpy.data.meshes.new_from_object(source.evaluated_get(deps)); body=bpy.data.objects.new('SharkBody',mesh)
scene.collection.objects.link(body); body.matrix_world=source.matrix_world.copy()
for ob in list(scene.objects):
 if ob!=body: bpy.data.objects.remove(ob,do_unlink=True)
bpy.context.view_layer.objects.active=body; body.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for face in body.data.polygons: face.use_smooth=True

def material(name,color,roughness=.5):
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Roughness'].default_value=roughness
 return m
dark=material('MouthDepth',(.035,.008,.011)); gum=material('Gum',(.18,.085,.085)); tooth=material('Ivory',(.83,.82,.72)); lip=material('JawSkin',(.62,.66,.65)); eye=material('Eyes',(.002,.005,.008),.12)
# A broad horseshoe upper jaw, a recessed throat and a lower jaw that hinges
# downward from the rear corners. Teeth follow two arches, never a radial ring.
def mesh_object(name,verts,faces,mat,parent=None):
 # Owner requested a smaller jaw relative to the shark, keeping the body scale.
 if name != 'SculptedSnout':
  verts=[(v[0]*.80, v[1]*.80 if parent else -5.1+(v[1]+5.1)*.80, v[2]) for v in verts]
 me=bpy.data.meshes.new(name); me.from_pydata(verts,[],faces); me.update()
 ob=bpy.data.objects.new(name,me); scene.collection.objects.link(ob); ob.data.materials.append(mat); ob.parent=parent
 for p in me.polygons: p.use_smooth=True
 return ob
# Replace the narrow pointed stock head with a fuller great-white snout.
import bmesh
bm=bmesh.new(); bm.from_mesh(body.data)
bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.0001,plane_co=(0,-3.9,0),plane_no=(0,1,0),clear_inner=True)
bm.to_mesh(body.data); bm.free()
back=material('DorsalSlate',(.105,.17,.19),.48)
side=material('FlankGrey',(.32,.40,.41),.5)
# (longitudinal position, half width, top height, underside height)
rings=[(-3.7,1.34,1.20,-1.42),(-4.1,1.43,1.23,-1.43),(-4.7,1.49,1.20,-1.42),(-5.3,1.47,1.08,-1.40),(-5.9,1.34,.86,-1.36),(-6.45,1.17,.60,-1.27),(-6.9,.96,.35,-1.12),(-7.3,.68,.12,-.88),(-7.55,.32,-.13,-.59),(-7.62,.02,-.34,-.38)]
verts=[]; faces=[]; count=40
for y,w,top,bottom in rings:
 for k in range(count):
  a=2*math.pi*k/count
  verts.append((w*math.sin(a),y,(top+bottom)/2+(top-bottom)/2*math.cos(a)))
for j in range(len(rings)-1):
 for k in range(count):faces.append((j*count+k,j*count+(k+1)%count,(j+1)*count+(k+1)%count,(j+1)*count+k))
faces.append(tuple(range((len(rings)-1)*count,len(rings)*count)))
head=mesh_object('SculptedSnout',verts,faces,lip)
head.data.materials.append(back);head.data.materials.append(side)
for face in head.data.polygons:
 z=sum(head.data.vertices[i].co.z for i in face.vertices)/len(face.vertices)
 face.material_index=1 if z>.25 else 2 if z>-.35 else 0
bpy.ops.object.select_all(action='DESELECT'); body.select_set(True);head.select_set(True)
bpy.context.view_layer.objects.active=body;bpy.ops.object.join()
N=32
# Opening in the actual ventral skin, extending into the head.
outline=[]
for k in range(N+1):
 t=k*math.pi/N
 outline.append((1.30*math.cos(t),-4.25-2.2*math.sin(t),-1.30))
for k in range(1,N):
 t=math.pi+k*math.pi/N
 outline.append((1.30*math.cos(t),-4.25-0.40*math.sin(t),-1.30))
L=len(outline)
verts=[(x,y,-5) for x,y,z in outline]+[(x,y,.25) for x,y,z in outline]
faces=[tuple(reversed(range(L))),tuple(range(L,2*L))]+[(k,(k+1)%L,(k+1)%L+L,k+L) for k in range(L)]
cutter=mesh_object('MouthCut',verts,faces,dark)
# Boolean operands need outward normals (the arch is authored clockwise).
for operand in [body,cutter]:
 bm=bmesh.new();bm.from_mesh(operand.data)
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
 bm.to_mesh(operand.data);bm.free()
bpy.context.view_layer.objects.active=body
mod=body.modifiers.new('True mouth cavity','BOOLEAN'); mod.operation='DIFFERENCE'; mod.solver='EXACT'; mod.object=cutter
bpy.ops.object.modifier_apply(modifier=mod.name); bpy.data.objects.remove(cutter,do_unlink=True)
# Recessed bowl: the viewer sees depth rather than a flat black badge.
verts=outline+[(x*.62,-4.65+(y+4.65)*.55,-.15) for x,y,z in outline]+[(0,-4.6,.2)]
faces=[(k,(k+1)%L,(k+1)%L+L,k+L) for k in range(L)]+[(L+k,L+(k+1)%L,2*L) for k in range(L)]
mesh_object('Throat',verts,faces,dark)
# Tubular gum/skin rails around a jaw arch.
def rail(name,points,radius,mat,parent=None):
 verts=[]
 for i,p in enumerate(points):
  d=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])
  side=Vector((-d.y,d.x,0)).normalized()
  for j in range(8):
   a=j*2*math.pi/8
   verts.append(Vector(p)+radius*(math.cos(a)*side+math.sin(a)*Vector((0,0,1))))
 faces=[(i*8+j,i*8+(j+1)%8,(i+1)*8+(j+1)%8,(i+1)*8+j) for i in range(len(points)-1) for j in range(8)]
 return mesh_object(name,verts,faces,mat,parent)
upper=[(1.30*math.cos(k*math.pi/N),-4.25-2.2*math.sin(k*math.pi/N),-1.35) for k in range(N+1)]
rail('UpperLip',upper,.075,lip)
rail('UpperGum',[(x*.96,y+.06,z-.05) for x,y,z in upper],.055,gum)
# Lower jaw is modelled closed, then rotated open about the rear hinge.
mouth=bpy.data.objects.new('LowerJawHinge',None); scene.collection.objects.link(mouth); mouth.location=(0,-5.1+(-4.25+5.1)*.80,-1.25)
lower=[(1.23*math.cos(k*math.pi/N),-2.03*math.sin(k*math.pi/N),-.12) for k in range(N+1)]
# A tapered chin shell; interior on top, skin on the underside.
verts=lower+[(x*.82,y*.9,z-.32) for x,y,z in lower]+[(0,-.8,-.12),(0,-.8,-.47)]
faces=[(k,k+1,N+1+k+1,N+1+k) for k in range(N)]+[(N+1+k,N+1+k+1,2*(N+1)+1) for k in range(N)]
mesh_object('LowerJawSkin',verts,faces,lip,mouth)
mesh_object('LowerPalate',lower+[(0,-.65,-.1)],[(k,k+1,N+1) for k in range(N)],gum,mouth)
rail('LowerLip',lower,.065,lip,mouth)
# Flattened triangular crowns, wider upper teeth, smaller lower teeth.
def teeth(name,upper_row,parent=None):
 verts=[]; faces=[]
 for row in range(2):
  for k in range(15):
   t=.13+(math.pi-.26)*(k+.5)/15
   w=1.26-row*.10; length=2.13-row*.12
   base=Vector((w*math.cos(t),-length*math.sin(t),-.21 if upper_row else .14))
   if upper_row: base+=Vector((0,-4.25,-1.25))
   toward=Vector((-math.cos(t),math.sin(t),-.25 if upper_row else 1.4)).normalized()
   tangent=Vector((math.sin(t),math.cos(t),0))
   width=(.24 if upper_row else .18)*(1-.2*abs(math.cos(t)))
   height=(.42 if upper_row else .32)*(1-.3*abs(math.cos(t)))*(1-row*.2)
   base+=toward*(row*.12)
   tip=base+toward*height
   i=len(verts); verts += [base-tangent*width/2,base+tangent*width/2,tip+Vector((0,0,-.035)),base+Vector((0,0,.055))]
   faces += [(i,i+1,i+2),(i,i+3,i+1),(i,i+2,i+3),(i+1,i+3,i+2)]
 ob=mesh_object(name,verts,faces,tooth,parent)
 for poly in ob.data.polygons: poly.use_smooth=False
teeth('UpperTeeth',True); teeth('LowerTeeth',False,mouth)
for x in [-1.14,1.14]:
 bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=.13,location=(x,-6.3,-.25))
 ob=bpy.context.object; ob.name='Eye'; ob.data.materials.append(eye)
scene.render.fps=30; scene.frame_start=1; scene.frame_end=265
for parent_group in [True,False]:
 bpy.ops.object.select_all(action='DESELECT')
 selected=[o for o in scene.objects if o.type=='MESH' and ((o.parent==mouth)==parent_group)]
 for o in selected:o.select_set(True)
 bpy.context.view_layer.objects.active=selected[0]; bpy.ops.object.join()
 selected[0].name='LowerJaw' if parent_group else 'SharkBody'
for frame,angle in [(1,12),(45,22),(110,62),(188,65),(198,58),(207,5),(265,5)]:
 mouth.rotation_euler.x=math.radians(angle); mouth.keyframe_insert(data_path='rotation_euler',frame=frame)
mouth.animation_data.action.name='Bite'
# Gentle material fill preserves the head and ivory teeth against the bright
# ocean even when the shared scene happens to be at night.
for mat in bpy.data.materials:
 if not mat.use_nodes: continue
 shader=mat.node_tree.nodes.get('Principled BSDF')
 if shader:
  shader.inputs['Emission Color'].default_value=shader.inputs['Base Color'].default_value
  shader.inputs['Emission Strength'].default_value=.22 if mat.name=='Ivory' else .10
scene.frame_set(130)
deps=bpy.context.evaluated_depsgraph_get(); points=[]; triangles=0
for ob in scene.objects:
 if ob.type!='MESH': continue
 ev=ob.evaluated_get(deps); me=ev.to_mesh(); me.calc_loop_triangles(); triangles+=len(me.loop_triangles)
 points += [ob.matrix_world@v.co for v in me.vertices]; ev.to_mesh_clear()
print('TRIANGLES',triangles,'BOUNDS',[(min(v[i] for v in points),max(v[i] for v in points)) for i in range(3)])
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(repo/'assets/models/shark-cinematic.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_frame_range=True,export_force_sampling=True,export_cameras=False,export_lights=False)
scene.render.engine='CYCLES'; scene.cycles.samples=24; scene.render.resolution_x=1000; scene.render.resolution_y=1000; scene.render.resolution_percentage=100
scene.world.color=(.5,.5,.5)
bpy.ops.object.light_add(type='AREA',location=(0,-9,-9)); bpy.context.object.data.energy=2500; bpy.context.object.data.size=8
bpy.ops.object.camera_add(location=(0,-12,-16)); cam=bpy.context.object; scene.camera=cam; cam.rotation_euler=(Vector((0,-4,0))-cam.location).to_track_quat('-Z','Y').to_euler(); cam.data.lens=42
import tempfile
scene.render.filepath=str(Path(tempfile.gettempdir())/'jaws-cinematic-bite.png'); bpy.ops.render.render(write_still=True)
