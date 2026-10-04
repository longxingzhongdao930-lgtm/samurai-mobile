/** Stable IDs identify reusable authored reconstructions, not recovered DMC assets. */
export const MOTIONS=Object.freeze({
 k1:{name:'黒雨・抜き付け',reference:'閻魔刀地上連斬'},k2:{name:'黒雨・斬り返し',reference:'閻魔刀地上連斬'},k3:{name:'黒雨・立ち上がり斬り',reference:'斬り上げ'},k4:{name:'黒雨・二連斬',reference:'地上連斬'},k5:{name:'黒雨・袈裟締め',reference:'地上連斬の締め'},
 branchB:{name:'黒雨・間合い二連',reference:'Combo B'},branchC:{name:'黒雨・三連返し',reference:'Combo C'},heavy:{name:'黒雨・天翔居合',reference:'添付 heavenly strike 2.fbx'},launcher:{name:'黒雨・昇竜斬',reference:'Upper Slash'},rising:{name:'黒雨・疾走昇斬',reference:'Rising Star'},'jump-katana':{name:'黒雨・空中二連',reference:'Aerial Rave A'},'dive-katana':{name:'黒雨・落下斬',reference:'空中下降斬撃'},counter:{name:'黒雨・弾き返し',reference:'刀の返し斬り'},execute:{name:'黒雨・止め斬り',reference:'刀の締め'},
 'phantom-shot':{name:'黒雨・幻影剣射出',reference:'Summoned Swords（対応映像未特定）'},'phantom-orbit':{name:'黒雨・周回剣',reference:'Spiral Swords（対応映像未特定）'},'phantom-rain':{name:'黒雨・降雨剣',reference:'Heavy Rain Swords（対応映像未特定）'},'phantom-burst':{name:'黒雨・連続射出',reference:'Blistering Swords（対応映像未特定）'},'phantom-storm':{name:'黒雨・包囲剣',reference:'Storm Swords（対応映像未特定）'},
 'aerial-b':{name:'黒雨・空中連斬弐',reference:'0749-21 Aerial Rave B'},
 flourish:{name:'黒雨・血払い納刀',reference:'0746-52 払い→納刀'},
 taunt:{name:'黒雨・掲刀挑発',reference:'0750-07 Carnage/Deadly掲刀所作'},
 stance:{name:'黒雨・次元斬の構え',reference:'Judgement Cut添付画像'},judgement:{name:'黒雨・次元斬',reference:'Judgement Cut'},'judgement-air':{name:'黒雨・空中次元斬',reference:'Judgement Cut空中実演'},'judgement-chain':{name:'黒雨・連続次元斬',reference:'次元斬連続発動'},end:{name:'黒雨・次元斬絶',reference:'Judgement Cut End'},sheathed:{name:'黒雨・納刀直立',reference:'鞘を携えた歩行'},walk:{name:'黒雨・鞘携行歩き',reference:'1329-24歩行'},sheath:{name:'黒雨・納刀所作',reference:'単刀参考録画'},dodge:{name:'黒雨・残影回避',reference:'独自の回避適応'},quickDraw:{name:'黒雨・抜刀一閃',reference:'添付 quick slash.fbx'}
});
export function nameMotion(clip,id){if(clip&&MOTIONS[id])clip.name=MOTIONS[id].name;return clip;}

export function motionDirectory(asset,id){return asset==='vergil'&&!['quickDraw','judgement-air','judgement-chain','taunt','aerial-b','flourish'].includes(id)&&!id.startsWith('phantom-')?'vergil':'katana';}
