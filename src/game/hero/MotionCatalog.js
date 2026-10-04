/** Stable IDs identify reusable authored reconstructions, not recovered DMC assets. */
export const MOTIONS=Object.freeze({
 k1:{name:'黒雨・抜き付け',reference:'閻魔刀地上連斬'},k2:{name:'黒雨・斬り返し',reference:'閻魔刀地上連斬'},k3:{name:'黒雨・立ち上がり斬り',reference:'斬り上げ'},k4:{name:'黒雨・二連斬',reference:'地上連斬'},k5:{name:'黒雨・袈裟締め',reference:'地上連斬の締め'},
 branchB:{name:'黒雨・間合い二連',reference:'Combo B'},branchC:{name:'黒雨・三連返し',reference:'Combo C'},heavy:{name:'黒雨・疾走居合',reference:'Rapid Slash'},launcher:{name:'黒雨・昇竜斬',reference:'Upper Slash'},rising:{name:'黒雨・疾走昇斬',reference:'Rising Star'},'jump-katana':{name:'黒雨・空中二連',reference:'Aerial Rave A'},'dive-katana':{name:'黒雨・落下斬',reference:'空中下降斬撃'},counter:{name:'黒雨・弾き返し',reference:'刀の返し斬り'},execute:{name:'黒雨・止め斬り',reference:'刀の締め'},
 stance:{name:'黒雨・次元斬の構え',reference:'Judgement Cut添付画像'},judgement:{name:'黒雨・次元斬',reference:'Judgement Cut'},end:{name:'黒雨・次元斬絶',reference:'Judgement Cut End'},sheathed:{name:'黒雨・納刀直立',reference:'鞘を携えた歩行'},walk:{name:'黒雨・鞘携行歩き',reference:'1329-24歩行'},sheath:{name:'黒雨・納刀所作',reference:'単刀参考録画'},dodge:{name:'黒雨・残影回避',reference:'独自の回避適応'}
});
export function nameMotion(clip,id){if(clip&&MOTIONS[id])clip.name=MOTIONS[id].name;return clip;}
