import { WEAPONS, WEAPON_ORDER } from '../data/weapons.js';
/** Dual is a katana loadout: keep the existing weapon/save IDs. */
export function weaponCycle(dualAvailable=true){
  const order=WEAPON_ORDER.filter(id=>WEAPONS[id]?.available);
  if(dualAvailable)order.splice(order.indexOf('katana')+1,0,'dual');
  return order;
}
export function nextWeapon(player){
  const swords=player.game.weapons?.swords;
  const order=weaponCycle(Boolean(swords));
  const current=player.weapon.id==='katana'&&swords?.id==='dual'?'dual':player.weapon.id;
  return order[(order.indexOf(current)+1)%order.length];
}
