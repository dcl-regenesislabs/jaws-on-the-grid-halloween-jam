"""Live Blender review refinement; does not export or replace the game asset."""
import bpy, bmesh, math
from mathutils import Vector
s=bpy.context.scene
assert s.name=='Cinematic Shark Review'
body=s.objects['SharkBody']; jaw=s.objects['LowerJaw']; hinge=s.objects['LowerJawHinge']
for ob in (body,jaw):
    backup=ob.data.copy(); backup.name=ob.name+'_before_anatomy_v2'; backup.use_fake_user=True
    bm=bmesh.new(); bm.from_mesh(ob.data)
    remove=[]
    for f in bm.faces:
        name=ob.data.materials[f.material_index].name
        if name in ('Ivory','Eyes'): remove.append(f)
    bmesh.ops.delete(bm,geom=remove,context='FACES')
    # Remove the separate tubular white lip: a fish lip should blend into skin.
    seen=set()
    for seed in list(bm.verts):
        if seed in seen: continue
        stack=[seed]; component=set()
        while stack:
            v=stack.pop()
            if v in component: continue
            component.add(v); seen.add(v)
            stack.extend(e.other_vert(v) for e in v.link_edges if e.other_vert(v) not in component)
        fs={f for v in component for f in v.link_faces}
        if len(fs)==512 and all(ob.data.materials[f.material_index].name=='JawSkin' for f in fs):
            bmesh.ops.delete(bm,geom=list(component),context='VERTS')
    bm.to_mesh(ob.data); bm.free()
    for p in ob.data.polygons:p.use_smooth=True

def mat(name,col,rough):
    m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*col,1)
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value=(*col,1);p.inputs['Roughness'].default_value=rough
    return m
ivory=mat('Review enamel',(.68,.66,.52),.3)
eye=mat('Review black eyes',(.002,.006,.008),.12)

def teeth(name,upper):
    verts=[];faces=[]
    for k in range(17):
        t=.1+(math.pi-.2)*(k+.5)/17
        base=Vector((1.25*.8*math.cos(t),-2.10*.8*math.sin(t),-.07 if not upper else -1.42))
        if upper:base.y+=-4.42
        tangent=Vector((math.sin(t),math.cos(t),0)).normalized()
        toward=Vector((-math.cos(t)*.45,math.sin(t)*.65,-.7 if upper else 1)).normalized()
        normal=tangent.cross(toward).normalized()
        h=(.28 if upper else .23)*(1-.4*abs(math.cos(t)))
        w=(.17 if upper else .125)*(1-.22*abs(math.cos(t)))
        # Crown shoulders, convex face and a slightly swept tip, rather than flat triangles.
        outline=[(-.5,0),(-.48,.22),(-.26,.62),(.06,1),(.29,.60),(.49,.18),(.5,0)]
        i=len(verts)
        for depth in (-.018,.018):
            verts.extend(base+tangent*(x*w)+toward*(y*h)+normal*depth for x,y in outline)
        verts.append(base+toward*(h*.30)+normal*.045)
        for j in range(7):
            faces.extend([(i+j,i+(j+1)%7,i+7+(j+1)%7,i+7+j),(i+7+j,i+7+(j+1)%7,i+14)])
        faces.append(tuple(i+j for j in reversed(range(7))))
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update()
    ob=bpy.data.objects.new(name,me);s.collection.objects.link(ob);me.materials.append(ivory)
    if not upper: ob.parent=hinge
    return ob
teeth('Review upper teeth',True);teeth('Review lower teeth',False)

# Compact, rounded nose; retain the mouth arch and hinge positions.
for v in body.data.vertices:
    if v.co.y < -6.35:
        v.co.y=-6.35+(v.co.y+6.35)*.68
    # Broaden cheeks beside the mouth, fading away at the shoulders.
    if -6.2<v.co.y<-4.3 and abs(v.co.x)>1.08:
        v.co.x*=1.08
for side in (-1,1):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,radius=1,location=(side*1.19,-6.03,-.62))
    ob=bpy.context.object;ob.name='Review eye';ob.scale=(.10,.145,.125);ob.data.materials.append(eye)
    for p in ob.data.polygons:p.use_smooth=True

# Fine skin variation and a soft grey-to-ivory palette, no white emissive plastic.
for m in set(body.data.materials[:]+jaw.data.materials[:]):
    if not m or not m.use_nodes:continue
    p=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
    if not p:continue
    p.inputs['Emission Strength'].default_value=0
    if m.name in ('JawSkin','Bottom','FlankGrey','DorsalSlate','Top'):
        colors={'JawSkin':(.46,.49,.44),'Bottom':(.46,.49,.44),'FlankGrey':(.18,.24,.25),'DorsalSlate':(.055,.095,.11),'Top':(.055,.095,.11)}
        p.inputs['Base Color'].default_value=(*colors[m.name],1)
        p.inputs['Roughness'].default_value=.42
        noise=m.node_tree.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=95;noise.inputs['Detail'].default_value=2
        bump=m.node_tree.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.16;bump.inputs['Distance'].default_value=.012
        m.node_tree.links.new(noise.outputs['Fac'],bump.inputs['Height']);m.node_tree.links.new(bump.outputs['Normal'],p.inputs['Normal'])
    elif m.name=='Gum':
        p.inputs['Base Color'].default_value=(.13,.065,.052,1);p.inputs['Roughness'].default_value=.43
    elif m.name=='MouthDepth':
        p.inputs['Base Color'].default_value=(.018,.007,.006,1);p.inputs['Roughness'].default_value=.6
s.frame_set(130)
print('Refined review mesh, single tooth rows, compact snout, relocated eyes and skin shading.')
