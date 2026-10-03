"""Blender 4.3: blender -b -t 2 --python scripts/convert-dragon.py -- SOURCE_DIR OUTPUT.glb.
SOURCE_DIR contains Mon_BlackDragon31_Skeleton.FBX and the supplied textures.
"""
import bpy
import sys
from pathlib import Path

source, output = map(Path, sys.argv[sys.argv.index('--') + 1:])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(source / 'Mon_BlackDragon31_Skeleton.FBX'))
for action in list(bpy.data.actions):
    action.name = action.name.split('|')[1].removeprefix('Mon_BlackDragon31_')

# Use the supplied diffuse and normal maps; the packed M maps have no documented
# channel convention and are deliberately not guessed to be glTF metallic maps.
for material in bpy.data.materials:
    suffix = 'a' if material.name.endswith('31a') else 'b'
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output_node = nodes.new('ShaderNodeOutputMaterial')
    shader = nodes.new('ShaderNodeBsdfPrincipled')
    shader.inputs['Metallic'].default_value = 0.35
    shader.inputs['Roughness'].default_value = 0.6
    material.node_tree.links.new(shader.outputs['BSDF'], output_node.inputs['Surface'])
    for kind in ('D', 'N'):
        texture = nodes.new('ShaderNodeTexImage')
        texture.image = bpy.data.images.load(str(source / f'T_Mon_BlackDragon31{suffix}_{kind}.png'))
        if kind == 'D':
            material.node_tree.links.new(texture.outputs['Color'], shader.inputs['Base Color'])
        else:
            texture.image.colorspace_settings.name = 'Non-Color'
            normal = nodes.new('ShaderNodeNormalMap')
            material.node_tree.links.new(texture.outputs['Color'], normal.inputs['Color'])
            material.node_tree.links.new(normal.outputs['Normal'], shader.inputs['Normal'])

# Export all 37 clips with their own zero-based timelines, not their positions
# on the original 5,354-frame authoring timeline.
armature = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
for action in list(bpy.data.actions):
    armature.animation_data.action = action
    action.use_fake_user = True
armature.animation_data.action = None
bpy.context.scene.frame_set(0)
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(output), export_format='GLB', export_animations=True,
    export_animation_mode='ACTIONS', export_anim_slide_to_zero=True,
    export_frame_range=False, export_force_sampling=True,
    export_anim_single_armature=True,
    export_optimize_animation_size=True, export_yup=True,
)
print(f'Exported {len(bpy.data.actions)} clips to {output}')
