import test from 'node:test';
import assert from 'node:assert/strict';
import { HeroStudio,validateHero } from '../src/game/hero/HeroStudio.js';
function studio(){
 const game={player:{weapon:{id:'katana'},elementIndex:0,unlocked:[true,false,true],setWeapon(id){this.weapon={id};}},weapons:{swords:{select:async()=>true}},journey:{practice:false},blessings:{snapshot:()=>[['road','blade']],restore(){throw Error('story blessings must remain');}}};
 const h=new HeroStudio(game);h.save=()=>{};return h;
}
test('loadout saves and validates its individual sword choice',()=>{
 const h=studio();h.sword='classic';const set=h.saveSet(' 単刀3 ');h.sword='oni';h.saveSet('鬼殺し');
 const loaded=validateHero({sets:h.sets});assert.equal(loaded.sets[0].sword,'oni');assert.equal(loaded.sets[1].sword,'classic');assert.equal(set.name,'単刀3');
});
test('old loadouts keep the currently selected sword',async()=>{
 const h=studio();h.sword='classic';const set=validateHero({sets:[{weapon:'katana',element:0,build:'none'}]}).sets[0];
 assert.equal(set.sword,null);await h.applySet(set);assert.equal(h.sword,'classic');
});
test('loadout restores basic style and does not grant locked elements or story blessings',async()=>{
 const h=studio();h.build='draw';await h.applySet({weapon:'katana',sword:'classic',element:1,build:'none',blessings:[]});
 assert.equal(h.sword,'classic');assert.equal(h.build,'none');assert.equal(h.g.player.elementIndex,0);
});
test('failed and superseded downloads do not apply loadout gameplay settings',async()=>{
 const h=studio();h.g.weapons.swords.select=async()=>{throw Error('offline');};
 const set={weapon:'gauntlet',sword:'classic',element:2,build:'none'};await assert.rejects(h.applySet(set),/offline/);
 assert.equal(h.sword,'mythical');assert.equal(h.g.player.weapon.id,'katana');assert.equal(h.g.player.elementIndex,0);
 h.g.weapons.swords.select=async()=>false;assert.equal(await h.applySet(set),false);assert.equal(h.g.player.weapon.id,'katana');
});
