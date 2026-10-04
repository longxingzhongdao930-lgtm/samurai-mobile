"""Bake the user-supplied Mythical Katana blade into the existing sword mount.

Usage: python scripts/prepare-mythical-katana.py INPUT.glb OUTPUT.glb
Build-only dependencies: numpy, Pillow. No extra browser runtime dependencies.
Retains attribution; excludes the separate cover, unused UVs, and cover textures.
"""
import io
import json
import math
import struct
import sys
from pathlib import Path

import numpy as np
from PIL import Image

source, destination = map(Path, sys.argv[1:3])
data = source.read_bytes()
json_size = struct.unpack_from('<I', data, 12)[0]
src = json.loads(data[20:20 + json_size])
binary = data[28 + json_size:]
out = {'asset': src['asset'], 'scene': 0, 'scenes': [{'nodes': [0]}],
       'nodes': [{'name': 'Mythical Katana — blade only', 'children': []}],
       'meshes': [], 'materials': src['materials'][2:], 'textures': [], 'images': [],
       'samplers': src.get('samplers', []), 'accessors': [], 'bufferViews': []}
out['asset']['generator'] = 'samurai-mobile prepare-mythical-katana.py'
chunks = bytearray()

def view(payload, target=None):
    while len(chunks) % 4:
        chunks.append(0)
    v = {'buffer': 0, 'byteOffset': len(chunks), 'byteLength': len(payload)}
    if target:
        v['target'] = target
    out['bufferViews'].append(v)
    chunks.extend(payload)
    return len(out['bufferViews']) - 1

# Authored blade-local coordinates. The cover and presentation transforms are
# intentionally omitted. Put the guard at zero and match the old +Z reach.
origin = np.array([.093, 0, -.995], dtype=np.float32)
angle = .075
rotation = np.array([[math.cos(angle), 0, math.sin(angle)], [0, 1, 0],
                     [-math.sin(angle), 0, math.cos(angle)]], dtype=np.float32)
scale = .472
components = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
dtypes = {5123: '<u2', 5125: '<u4', 5126: '<f4'}


def accessor(index, semantic):
    a = dict(src['accessors'][index])
    v = src['bufferViews'][a['bufferView']]
    dtype = np.dtype(dtypes[a['componentType']])
    width = components[a['type']]
    values = np.ndarray((a['count'], width), dtype=dtype, buffer=binary,
                        offset=v.get('byteOffset', 0) + a.get('byteOffset', 0),
                        strides=(v.get('byteStride', width * dtype.itemsize), dtype.itemsize)).copy()
    if semantic == 'POSITION':
        values = ((values - origin) @ rotation.T) * scale
    elif semantic in ('NORMAL', 'TANGENT'):
        values[:, :3] = values[:, :3] @ rotation.T
    a.pop('byteOffset', None)
    a['bufferView'] = view(values.tobytes(), 34963 if semantic == 'indices' else 34962)
    if semantic == 'POSITION':
        a['min'], a['max'] = values.min(axis=0).tolist(), values.max(axis=0).tolist()
    else:
        a.pop('min', None)
        a.pop('max', None)
    out['accessors'].append(a)
    return len(out['accessors']) - 1

for mesh in src['meshes'][2:]:
    primitives = []
    for p in mesh['primitives']:
        attrs = {name: accessor(index, name) for name, index in p['attributes'].items()
                 if name in ('POSITION', 'NORMAL', 'TANGENT', 'TEXCOORD_0')}
        primitives.append({'attributes': attrs, 'indices': accessor(p['indices'], 'indices'),
                           'material': p['material'] - 2, 'mode': 4})
    out['meshes'].append({'name': mesh['name'], 'primitives': primitives})
    out['nodes'][0]['children'].append(len(out['nodes']))
    out['nodes'].append({'name': mesh['name'], 'mesh': len(out['meshes']) - 1})

# The blade uses exactly these three texture slots. Preserve packed channels
# and normal maps losslessly after downsampling; only colour uses JPEG.
for old_index in [2, 3, 4]:
    texture = dict(src['textures'][old_index])
    image = src['images'][texture['source']]
    v = src['bufferViews'][image['bufferView']]
    pixels = Image.open(io.BytesIO(binary[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']])).convert('RGB')
    pixels.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
    encoded = io.BytesIO()
    fmt = 'JPEG' if old_index == 2 else 'PNG'
    pixels.save(encoded, format=fmt, **({'quality': 88, 'optimize': True} if fmt == 'JPEG' else {'optimize': True}))
    texture['source'] = len(out['images'])
    out['textures'].append(texture)
    out['images'].append({'bufferView': view(encoded.getvalue()), 'mimeType': 'image/jpeg' if fmt == 'JPEG' else 'image/png'})

for mat in out['materials']:
    for block in [mat, mat.get('pbrMetallicRoughness', {})]:
        for key, value in block.items():
            if key.endswith('Texture') and isinstance(value, dict):
                value['index'] -= 2

out['buffers'] = [{'byteLength': len(chunks)}]
while len(chunks) % 4:
    chunks.append(0)
encoded = json.dumps(out, ensure_ascii=False, separators=(',', ':')).encode()
encoded += b' ' * (-len(encoded) % 4)
packed = struct.pack('<III', 0x46546c67, 2, 28 + len(encoded) + len(chunks))
packed += struct.pack('<II', len(encoded), 0x4e4f534a) + encoded
packed += struct.pack('<II', len(chunks), 0x004e4942) + chunks
destination.write_bytes(packed)
print(f'{source.stat().st_size:,} -> {len(packed):,} bytes; blade only; four meshes, three 1024px textures')
