"""Prepare supplied Oni/classic/dual katana meshes for the +Z guard-origin mount.

python scripts/prepare-extra-katanas.py PROFILE INPUT OUTPUT [--scabbard]
Preserves source attribution and PBR maps; excludes display duplicates/props.
"""
import argparse, copy, io, json, struct
from pathlib import Path
import numpy as np
from PIL import Image

p=argparse.ArgumentParser();p.add_argument('profile',choices=['oni','classic','dual']);p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--scabbard',action='store_true');args=p.parse_args()
data=args.source.read_bytes();size=struct.unpack_from('<I',data,12)[0];src=json.loads(data[20:20+size]);binary=data[28+size:]
DT={5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'};WIDTH={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
def read(i):
 a=src['accessors'][i];v=src['bufferViews'][a['bufferView']];dt=np.dtype(DT[a['componentType']]);w=WIDTH[a['type']]
 return np.ndarray((a['count'],w),dtype=dt,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*dt.itemsize),dt.itemsize)).copy()
# Only the classic sword needs its per-part transforms. The other profiles
# contain complete blades/covers in a single mesh-local frame.
worlds={}
def walk(i,M):
 n=src['nodes'][i];M=M@np.array(n.get('matrix',np.eye(4).flatten(order='F'))).reshape(4,4,order='F')
 if 'mesh' in n:worlds[n['mesh']]=M
 for child in n.get('children',[]):walk(child,M)
if args.profile=='classic':
 for child in src['nodes'][3]['children']:walk(child,np.eye(4))
if args.profile=='oni':
 origin=np.array([-.39 if args.scabbard else -.33,.19 if args.scabbard else -.165,0]);rotation=np.array([[0,1,0],[0,0,1],[1,0,0]]);scale=.702
 selected=[0]
elif args.profile=='classic':
 origin=np.array([0,8.5,-6.8 if args.scabbard else -.59]);rotation=np.array([[0,0,-1],[1,0,0],[0,-1,0]]);scale=.0338
 selected=[1,10] if args.scabbard else [0,2,3,4,5,6,7,8,9]
else:
 origin=np.array([.035,0,.02]);rotation=np.array([[0,0,1],[0,-1,0],[1,0,0]]);scale=.94
 selected=[82] if args.scabbard else [81]
out={'asset':copy.deepcopy(src['asset']),'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'name':args.profile+' katana '+('scabbard' if args.scabbard else 'blade'),'children':[]}],'meshes':[],'materials':[],'textures':[],'images':[],'samplers':src.get('samplers',[]),'accessors':[],'bufferViews':[]}
out['asset']['generator']='samurai-mobile prepare-extra-katanas.py';chunks=bytearray();materials={}
def view(payload,target=None):
 chunks.extend(b'\0'*((-len(chunks))%4));v={'buffer':0,'byteOffset':len(chunks),'byteLength':len(payload)}
 if target:v['target']=target
 out['bufferViews'].append(v);chunks.extend(payload);return len(out['bufferViews'])-1
def attribute(values,kind):
 index=kind=='indices';small=index and values.max()<65536;values=values.astype('<u2' if small else '<u4' if index else '<f4');a={'bufferView':view(values.tobytes(),34963 if index else 34962),'componentType':5123 if small else 5125 if index else 5126,'count':len(values),'type':{1:'SCALAR',2:'VEC2',3:'VEC3',4:'VEC4'}[values.shape[1]]}
 if kind=='POSITION':a.update(min=values.min(0).tolist(),max=values.max(0).tolist())
 out['accessors'].append(a);return len(out['accessors'])-1
for mesh_index in selected:
 primitives=[]
 for pr in src['meshes'][mesh_index]['primitives']:
  attrs={k:read(v) for k,v in pr['attributes'].items() if k in ['POSITION','NORMAL','TANGENT','TEXCOORD_0']};indices=read(pr['indices']).reshape(-1,3)
  if args.profile=='oni':
   # Sword lies below the isolated cover in the supplied mesh-local Y frame.
   cover=attrs['POSITION'][indices,1].mean(1)>0;indices=indices[cover if args.scabbard else ~cover]
  used,indices=np.unique(indices,return_inverse=True);attrs={k:v[used] for k,v in attrs.items()};M=worlds.get(mesh_index,np.eye(4));transform=rotation@M[:3,:3]
  attrs['POSITION']=((attrs['POSITION']@M[:3,:3].T+M[:3,3]-origin)@rotation.T)*scale
  if args.scabbard and args.profile in ['oni','classic']:
   # Slightly widen the game sheath so its lip and walls clear the steel.
   widening=1.2 if args.profile=='oni' else 1.08
   attrs['POSITION'][:,0]*=widening;transform=np.diag([widening,1,1])@transform
  for kind in ['NORMAL','TANGENT']:
   if kind in attrs:
    norm=np.linalg.inv(transform).T if kind=='NORMAL' else transform
    attrs[kind][:,:3]=attrs[kind][:,:3]@norm.T;attrs[kind][:,:3]/=np.maximum(np.linalg.norm(attrs[kind][:,:3],axis=1,keepdims=True),1e-8)
  old=pr.get('material',0)
  if old not in materials:materials[old]=len(out['materials']);out['materials'].append(copy.deepcopy(src['materials'][old]))
  primitives.append({'attributes':{k:attribute(v,k) for k,v in attrs.items()},'indices':attribute(indices.reshape(-1,1),'indices'),'material':materials[old]})
 name=src['meshes'][mesh_index].get('name',str(mesh_index));out['meshes'].append({'name':name,'primitives':primitives});out['nodes'][0]['children'].append(len(out['nodes']));out['nodes'].append({'name':name,'mesh':len(out['meshes'])-1})
textures={}
for material in out['materials']:
 for block in [material,material.get('pbrMetallicRoughness',{})]:
  for key,value in block.items():
   if not key.endswith('Texture') or not isinstance(value,dict):continue
   old=value['index']
   if old not in textures:
    t=copy.deepcopy(src['textures'][old]);image=src['images'][t['source']];v=src['bufferViews'][image['bufferView']];im=Image.open(io.BytesIO(binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]));im.thumbnail((1024,1024) if key=='baseColorTexture' else (512,512),Image.Resampling.LANCZOS);
    if key=='baseColorTexture' and material.get('alphaMode','OPAQUE')=='OPAQUE':im=im.convert('RGB')
    buf=io.BytesIO();fmt='JPEG' if key=='baseColorTexture' and im.mode=='RGB' else 'PNG';im.save(buf,format=fmt,**({'quality':88,'optimize':True} if fmt=='JPEG' else {'optimize':True}));t['source']=len(out['images']);textures[old]=len(out['textures']);out['textures'].append(t);out['images'].append({'bufferView':view(buf.getvalue()),'mimeType':'image/jpeg' if fmt=='JPEG' else 'image/png'})
   value['index']=textures[old]
out['buffers']=[{'byteLength':len(chunks)}];chunks.extend(b'\0'*((-len(chunks))%4));js=json.dumps(out,ensure_ascii=False,separators=(',',':')).encode();js+=b' '*((-len(js))%4);packed=struct.pack('<III',0x46546c67,2,28+len(js)+len(chunks))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(chunks),0x004e4942)+chunks;args.output.write_bytes(packed);print(args.output.name,len(packed),'bytes',len(out['meshes']),'meshes')
