import { AdditiveBlending, DoubleSide, Mesh, PlaneGeometry, ShaderMaterial, TextureLoader, Vector3 } from 'three';

// Uploaded video effects reduced to sixteen frames: no video decoders at runtime.
export class EffectAtlas {
  constructor(group) {
    this.geometry = new PlaneGeometry(1, 1);
    this.textures = new Map();
    this.slots = [];
    const loader = new TextureLoader();
    for (const id of ['127578','71330','127577','220078','182612']) {
      const texture = loader.load(`/textures/fx/${id}.webp`);
      this.textures.set(id, texture);
      for (let i=0;i<3;i++) {
        const material = new ShaderMaterial({
          uniforms: { map: {value:texture}, frame:{value:0}, opacity:{value:0} },
          vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
          fragmentShader:'uniform sampler2D map; uniform float frame; uniform float opacity; varying vec2 vUv; void main(){vec2 cell=vec2(mod(frame,4.),3.-floor(frame/4.));vec3 c=texture2D(map,(vUv+cell)/4.).rgb;float a=smoothstep(.025,.15,max(c.r,max(c.g,c.b)));gl_FragColor=vec4(c,a*opacity);}',
          transparent:true, depthWrite:false, blending:AdditiveBlending, side:DoubleSide
        });
        const mesh = new Mesh(this.geometry, material);
        mesh.visible=false; mesh.frustumCulled=false;
        const slot={id,mesh,age:0,life:0,angle:0,to:null,from:new Vector3()};
        mesh.onBeforeRender=(_r,_s,camera)=>{mesh.quaternion.copy(camera.quaternion);mesh.rotateZ(slot.angle);};
        group.add(mesh);this.slots.push(slot);
      }
    }
  }
  spawn(id, at, width=.3, life=.2, angle=0, to=null) {
    const slot=this.slots.find(s=>s.id===id&&!s.mesh.visible);
    if(!slot)return;
    Object.assign(slot,{age:0,life,angle,to:to?.clone()??null});
    slot.from.copy(at);slot.mesh.position.copy(at);
    slot.mesh.scale.set(width,width*9/16,1);
    slot.mesh.visible=true;
    slot.mesh.material.uniforms.frame.value=0;
    slot.mesh.material.uniforms.opacity.value=1;
  }
  travel(from,to,index) {
    this.spawn(['127577','220078','182612'][index%3],from,1.5,.24,index*.8,to);
  }
  update(dt) {
    for(const s of this.slots)if(s.mesh.visible){
      s.age+=dt;const t=s.age/s.life;
      if(t>=1){s.mesh.visible=false;continue;}
      s.mesh.material.uniforms.frame.value=Math.min(15,Math.floor(t*16));
      s.mesh.material.uniforms.opacity.value=1-t*t;
      if(s.to)s.mesh.position.lerpVectors(s.from,s.to,t);
    }
  }
  clear(){for(const s of this.slots)s.mesh.visible=false;}
  dispose(){for(const s of this.slots){s.mesh.removeFromParent();s.mesh.material.dispose();}for(const t of this.textures.values())t.dispose();this.geometry.dispose();}
}
