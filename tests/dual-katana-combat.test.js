import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerCombat } from '../src/game/combat/PlayerCombat.js';
import { WEAPONS } from '../src/game/data/weapons.js';

test('dual selection cancels old attacks and replaces locomotion overrides without losing poses',()=>{
 const pose={pose:true};let cancels=0;
 const p=Object.assign(Object.create(PlayerCombat.prototype),{
  weapon:WEAPONS.katana,game:{weapons:{swords:{id:'mythical'}}},_sets:new Map(),
  _make:config=>({config,cancel(){cancels++;}}),cast:{cancel(){}},kickMove:{cancel(){}},
  arts:{cancel(){}},_toFree(){this.state='free';},_held:{warp:{active:true}},
  character:{locomotion:{overrides:[pose]}}
 });
 p._useSet(p._setFor(p.weapon));p.moves=[...p.combo,p.heavy,p.counter,p.execute,p.cast,p.kickMove];p._moveOverrides=[...p.moves];p.character.locomotion.overrides.push(...p.moves);
 const single=p.combo;
 p.game.weapons.swords.id='dual';p.refreshSwordMoves();
 assert.equal(p.combo.length,3);assert.equal(p.combo[0].config.id,'dual-left');
 assert.equal(p.character.locomotion.overrides.length,p.moves.length+1);
 assert.ok(p.character.locomotion.overrides.includes(pose));assert.equal(p._held.warp.active,false);
 assert.ok(single.every(move=>!p.character.locomotion.overrides.includes(move)));assert.ok(cancels>0);
 const dual=p.combo;p.game.weapons.swords.id='oni';p.refreshSwordMoves();assert.equal(p.combo,single);
 p.game.weapons.swords.id='dual';p.refreshSwordMoves();assert.equal(p.combo,dual);
 assert.equal(new Set(p.character.locomotion.overrides).size,p.character.locomotion.overrides.length);
});
