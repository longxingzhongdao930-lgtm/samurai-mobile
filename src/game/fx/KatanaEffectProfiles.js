/** Visible phases measured from the attached reference, authored independently of hit damage. */
export const KATANA_FX_PROFILES = Object.freeze({
 slash:{duration:.18,peak:.45,cutStart:0,cloudEnd:0},
 rift:{duration:.42,peak:.56,cutStart:.12,cloudEnd:.32},
 end:{duration:.40,peak:.30,cutStart:0,cloudEnd:0},
 burst:{duration:.30,peak:.65,cutStart:0,cloudEnd:0}
});
const smooth=(a,b,t)=>{const x=Math.max(0,Math.min(1,(t-a)/(b-a)));return x*x*(3-2*x);};
export function sampleKatanaEffect(kind,age){
 const p=KATANA_FX_PROFILES[kind];if(!p)throw new Error('Unknown effect profile: '+kind);
 if(age<0||age>=p.duration)return {cut:0,cloud:0,scale:1,visible:false};
 const cut=p.peak*smooth(p.cutStart,p.cutStart+.035,age)*(1-smooth(p.duration-.12,p.duration,age));
 const cloud=p.cloudEnd?.65*smooth(0,.035,age)*(1-smooth(.12,p.cloudEnd,age)):0;
 return {cut,cloud,scale:kind==='burst'?.45+age/p.duration*1.6:.9+age/p.duration*.1,visible:true};
}
