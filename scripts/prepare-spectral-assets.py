"""Bake uploaded reference GLBs into single untextured spectral meshes.
Build-only numpy; preserves originals and embedded author/license metadata.
"""
import json,struct
from pathlib import Path
import numpy as np

def prepare(name,cell=None):
 raw=Path('public/models/reference/'+name+'.glb').read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);binary=raw[28+n:];verts=[];faces=[];offset=0
 def access(i):
  a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']];size={'VEC3':3,'SCALAR':1}[a['type']];dt=np.dtype(dtype);start=v.get('byteOffset',0)+a.get('byteOffset',0);return np.ndarray((a['count'],size),dt,buffer=binary,offset=start,strides=(v.get('byteStride',size*dt.itemsize),dt.itemsize)).copy()
 def walk(i,parent):
  nonlocal offset
  node=doc['nodes'][i];local=np.array(node.get('matrix',np.eye(4).T.reshape(-1)),dtype=float).reshape(4,4).T;world=parent@local
  if 'mesh'in node:
   for p in doc['meshes'][node['mesh']]['primitives']:
    if p.get('mode',4)!=4:continue
    v=access(p['attributes']['POSITION']);v=(np.c_[v,np.ones(len(v))]@world.T)[:,:3];ix=access(p['indices']).reshape(-1,3) if 'indices'in p else np.arange(len(v)).reshape(-1,3);verts.append(v);faces.append(ix+offset);offset+=len(v)
  for child in node.get('children',[]):walk(child,world)
 for i in doc['scenes'][doc.get('scene',0)]['nodes']:walk(i,np.eye(4))
 v=np.concatenate(verts);f=np.concatenate(faces);extent=np.ptp(v,axis=0);axis=int(np.argmax(extent));center=(v.min(0)+v.max(0))/2;v-=center
 if name=='force-edge':
  # Long blade axis becomes +Y; exported glTF is naturally +Z before transforms.
  if axis!=1:v=v[:,[i for i in range(3)if i!=axis][:1]+[axis]+[i for i in range(3)if i!=axis][1:]]
  v*=.78/np.ptp(v,axis=0)[1]
  # Tip is the narrow end. Keep the widest crossguard near the lower end.
  low=v[v[:,1]<np.quantile(v[:,1],.12)];high=v[v[:,1]>np.quantile(v[:,1],.88)]
  if np.ptp(high[:,0])>np.ptp(low[:,0]):v[:,1]*=-1
 else:v*=2.8/max(extent)
 if cell:
  grid=np.round(v/cell).astype(np.int64);_,inv=np.unique(grid,axis=0,return_inverse=True);counts=np.bincount(inv);new=np.stack([np.bincount(inv,weights=v[:,i])/counts for i in range(3)],axis=1);f=inv[f];f=f[(f[:,0]!=f[:,1])&(f[:,1]!=f[:,2])&(f[:,0]!=f[:,2])];_,keep=np.unique(np.sort(f,axis=1),axis=0,return_index=True);f=f[np.sort(keep)];v=new
 v=v.astype('<f4');f=f.astype('<u2'if len(v)<65536 else '<u4');vb=v.tobytes();ib=f.tobytes();payload=vb+ib;payload+=b'\0'*(-len(payload)%4)
 out={'asset':{**doc['asset'],'generator':'samurai-mobile prepare-spectral-assets.py'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'name':name+' spectral mesh','mesh':0}],'meshes':[{'primitives':[{'attributes':{'POSITION':0},'indices':1,'material':0}]}],'materials':[{'name':'Spectral blue','doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':[.45,.72,1,1],'metallicFactor':0,'roughnessFactor':1}}],'buffers':[{'byteLength':len(payload)}],'bufferViews':[{'buffer':0,'byteOffset':0,'byteLength':len(vb),'target':34962},{'buffer':0,'byteOffset':len(vb),'byteLength':len(ib),'target':34963}],'accessors':[{'bufferView':0,'componentType':5126,'count':len(v),'type':'VEC3','min':v.min(0).tolist(),'max':v.max(0).tolist()},{'bufferView':1,'componentType':5123 if f.dtype.itemsize==2 else 5125,'count':f.size,'type':'SCALAR'}]}
 js=json.dumps(out,separators=(',',':')).encode();js+=b' '*(-len(js)%4);result=struct.pack('<III',0x46546c67,2,28+len(js)+len(payload))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(payload),0x004e4942)+payload
 dest=Path('public/models/fx');dest.mkdir(exist_ok=True);(dest/(name+'.glb')).write_bytes(result);print(name,len(raw),'->',len(result),'bytes;',len(f),'triangles')
prepare('force-edge',.003)
prepare('judgement-cut-end')
