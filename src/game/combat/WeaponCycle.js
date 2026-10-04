import { WEAPONS, WEAPON_ORDER } from '../data/weapons.js';
export function weaponCycle(){return WEAPON_ORDER.filter(id=>WEAPONS[id]?.available);}
export function nextWeapon(player){const order=weaponCycle();return order[(order.indexOf(player.weapon.id)+1)%order.length];}
