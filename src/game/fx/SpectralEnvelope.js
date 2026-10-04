/** Adapted from squarefeet/ShaderParticleEngine, SPE.shaderChunks.js
 * Copyright (C) 2015 Luke Moody. MIT license: public/licenses/shader-particle-engine-MIT.txt.
 * Modified: fixed four-key opacity envelope for pooled spectral slash lines.
 */
export const SPECTRAL_ENVELOPE = /* glsl */ `
float when_gt(float x,float y){return max(sign(x-y),0.0);}
float when_lt(float x,float y){return min(max(1.0-sign(x-y),0.0),1.0);}
float when_eq(float x,float y){return 1.0-abs(sign(x-y));}
float getFloatOverLifetime(float age,vec4 attr){
 float value=0.0;float deltaAge=age*3.0;
 value+=attr[0]*when_eq(deltaAge,0.0);
 for(int i=0;i<3;++i){float f=float(i);float active=when_gt(deltaAge,f)*(1.0-when_lt(deltaAge,f+1.0));value+=active*mix(attr[i],attr[i+1],deltaAge-f);}
 return value;
}`;
