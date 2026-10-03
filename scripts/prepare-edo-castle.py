import bpy,pathlib,re,math,json,sys
from mathutils import Vector
# Blender 4.3: --python scripts/prepare-edo-castle.py -- SOURCE_DIR OUTPUT_DIR
# SOURCE_DIR contains t_all.obj, t_all.mtl and all 96 supplied JPGs.
args=sys.argv[sys.argv.index('--')+1:]
root=pathlib.Path(args[0]);out=pathlib.Path(args[1]);out.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.wm.obj_import(filepath=str(root/'t_all.obj'),forward_axis='NEGATIVE_Z',up_axis='Y')
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
missing=[]
for o in meshes:
 for m in o.data.materials:
  if not m:continue
  m.use_nodes=True
  for n in m.node_tree.nodes:
   if n.type=='TEX_IMAGE' and n.image:
    name=re.split(r'[:\\/]',n.image.filepath)[-1];p=root/name
    if not p.exists():missing.append(name)
    else:n.image=bpy.data.images.load(str(p),check_existing=True)
assert not missing,missing
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();obj=bpy.context.object;obj.name='Tsuyama Castle'
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
original=sum(len(p.vertices)-2 for p in obj.data.polygons)
mod=obj.modifiers.new('Distant castle simplification','DECIMATE');mod.ratio=.42;bpy.ops.object.modifier_apply(modifier=mod.name)
triangles=sum(len(p.vertices)-2 for p in obj.data.polygons)
# Bake the source material colours into one atlas; preserve original UVs for sampling.
obj.data.uv_layers.new(name='CastleAtlas');obj.data.uv_layers.active_index=len(obj.data.uv_layers)-1
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.002);bpy.ops.object.mode_set(mode='OBJECT')
obj.data.uv_layers[0].active_render=True
atlas=bpy.data.images.new('Castle diffuse atlas',width=2048,height=2048)
for m in obj.data.materials:
 if not m:continue
 # Explicitly keep source textures on the original UV layer while baking onto active atlas UVs.
 uv=m.node_tree.nodes.new('ShaderNodeUVMap');uv.uv_map=obj.data.uv_layers[0].name
 for n in list(m.node_tree.nodes):
  if n.type=='TEX_IMAGE':m.node_tree.links.new(uv.outputs['UV'],n.inputs['Vector'])
 target=m.node_tree.nodes.new('ShaderNodeTexImage');target.image=atlas;m.node_tree.nodes.active=target
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=1;scene.cycles.use_denoising=False
scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True;scene.render.bake.margin=3
obj.data.uv_layers.active_index=len(obj.data.uv_layers)-1
bpy.ops.object.bake(type='DIFFUSE')
atlas.filepath_raw=str(out/'castle-atlas.jpg');atlas.file_format='JPEG';atlas.save()
mat=bpy.data.materials.new('Castle atlas');mat.use_nodes=True;bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=.9
tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(out/'castle-atlas.jpg'));mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
obj.data.materials.clear();obj.data.materials.append(mat)
for poly in obj.data.polygons:poly.material_index=0
while len(obj.data.uv_layers)>1:obj.data.uv_layers.remove(obj.data.uv_layers[0])
obj.data.uv_layers[0].active_render=True
bpy.ops.export_scene.gltf(filepath=str(out/'tsuyama-castle.glb'),export_format='GLB',export_image_format='JPEG',export_animations=False)
coords=[obj.matrix_world@Vector(c) for c in obj.bound_box];size=[max(c[i] for c in coords)-min(c[i] for c in coords) for i in range(3)]
json.dump({'originalTriangles':original,'triangles':triangles,'sizeBlenderXYZ':size,'atlas':[2048,2048],'materials':1,'bytes':(out/'tsuyama-castle.glb').stat().st_size},open(out/'stats.json','w'),indent=2)
print('CASTLE_COMPLETE',original,triangles,size,flush=True)
