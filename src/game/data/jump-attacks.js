/** Original airborne variants, borrowing the equipped weapon's contact rules.
 * The uploaded Vergil Aerial Rave is a pose/reference, not these authored combos.
 */
export function jumpAttack(weapon,dual=false){
  const base=weapon.combo[0];
  const names={katana:dual?'二刀・空中交差斬り':'刀・空中斬り',odachi:'大太刀・落下斬り',spear:'槍・空中突き',naginata:'薙刀・空中薙ぎ',kusarigama:'鎖鎌・空中刈り',gauntlet:'手甲・空中射出',shuriken:'手裏剣・空中投げ'};
  return {...base,id:'jump-'+weapon.id+(dual?'-dual':''),name:names[weapon.id],airborne:true,
    clip:'slashHit',clipFrom:.07,clipTo:.66,timeScale:1.8,
    hits:dual?[.35,.65]:[.5],damage:dual?8:weapon.id==='odachi'?20:12,
    posture:weapon.id==='odachi'?18:8,maxWarp:0,lunge:0,passThrough:0,
    reach:weapon.id==='odachi'?3.2:weapon.id==='spear'||weapon.id==='naginata'?3:2.6,arc:weapon.id==='odachi'?360:weapon.id==='naginata'?200:140,
    cancelAt:.85,recoverAt:.95,dualPose:dual?'cross':undefined,dualHands:dual?['Left','Right']:undefined,
    airLanding:weapon.id==='odachi',ring:weapon.id==='odachi',launch:false,hitStop:.055,shake:.09};
}
