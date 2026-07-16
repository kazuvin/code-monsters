import type { Instruction, ReactionBlock, ReactionTrigger, UnitDefinition } from './types';

export const BERSERKER_ATK_SCALE=1.6;
export const BERSERKER_SPEED_SCALE=2;

export const REACTION_TRIGGERS: { id: ReactionTrigger; label: string }[] = [
  { id:'selfAttackHit', label:'自分の攻撃がヒットしたら' },
  { id:'selfHit', label:'自分が攻撃を受けたら' },
  { id:'allyAttackHit', label:'味方の攻撃がヒットしたら' },
  { id:'selfHpLow', label:'自分のHPが30%以下になったら' },
];

export const UNITS: UnitDefinition[] = [
  { id:'volt', name:'ヴォルト', code:'V-01', role:'STRIKER', color:0x39d9ff, maxHp:116, attack:25, defense:7, speed:1.18, price:4, range:10, knockbackPower:8, weight:6, attackType:'melee', rarity:'common', programLimit:4 },
  { id:'bastion', name:'バスティオン', code:'B-07', role:'TANK', color:0xffc247, maxHp:176, attack:16, defense:15, speed:.78, price:4, range:8, knockbackPower:13, weight:14, attackType:'blunt', rarity:'common', programLimit:4 },
  { id:'relay', name:'リレイ', code:'R-11', role:'CHASE', color:0xff6e77, maxHp:110, attack:21, defense:6, speed:1.22, price:4, range:11, knockbackPower:7, weight:5, attackType:'melee', rarity:'common', programLimit:3 },
  { id:'arrow', name:'アロー', code:'A-05', role:'STRIKER', color:0x8df2ff, maxHp:74, attack:20, defense:3, speed:.88, price:5, range:24, knockbackPower:0, weight:2, attackType:'sniper', rarity:'common', programLimit:5 },
  { id:'wrath', name:'ラース', code:'W-13', role:'BERSERKER', color:0xff594d, maxHp:140, attack:20, defense:8, speed:.85, price:5, range:9, knockbackPower:10, weight:9, attackType:'blunt', rarity:'rare', programLimit:4 },
];

export const INSTRUCTIONS: Instruction[] = [
  { id:'attack-low', title:'通常攻撃', short:'攻撃', flavor:'まずは一発。話はそれから。', action:'attack', price:2, rarity:'common', condition:'敵が射程範囲内', target:'敵', tone:'cyan' },
  { id:'knock-away', title:'ちょっと吹き飛ばす', short:'吹き飛ばす', flavor:'どっか遠くへ、ぽん。じゃあね。', action:'heavy', price:4, rarity:'rare', condition:'敵が射程範囲内', target:'敵', tone:'amber', impact:{knockbackPower:120} },
  { id:'approach', title:'前進する', short:'前進', flavor:'届かないなら、こっちから行く。', action:'move', price:1, rarity:'common', condition:'敵が射程範囲外', target:'敵', tone:'amber' },
  { id:'retreat', title:'後退する', short:'後退', flavor:'逃げではない。助走の準備です。', action:'retreat', price:2, rarity:'common', condition:'敵が射程範囲内', target:'敵', tone:'violet' },
  { id:'berserker-mode', title:'バーサーカーモード', short:'バーサーカー', flavor:'理性は置いてきた。ここから全部、全力。', action:'berserk', price:0, rarity:'rare', condition:'自分のHPが30%以下', target:'自分', tone:'amber', fixedFor:'wrath', reactionOnly:true },
  { id:'volt-follow', title:'追撃する', short:'追撃', flavor:'まだ終わってないので、もう一発。', action:'follow', price:0, rarity:'common', condition:'条件なし', target:'敵', tone:'cyan', fixedFor:'volt', impact:{knockbackPower:0} },
  { id:'tank-guard', title:'ガードする', short:'防御', flavor:'痛いのは困るので、しっかり受ける。', action:'guard', price:0, rarity:'common', condition:'条件なし', target:'自分', tone:'lime', fixedFor:'bastion' },
  { id:'relay-dash', title:'高速接近する', short:'高速接近', flavor:'距離という問題を、速さで消す。', action:'move', price:0, rarity:'common', condition:'敵が射程範囲外', target:'敵', tone:'amber', fixedFor:'relay', movementScale:1.65 },
  { id:'arrow-reposition', title:'緊急離脱する', short:'緊急離脱', flavor:'近い近い。いったん離れます。', action:'retreat', price:0, rarity:'common', condition:'条件なし', target:'敵', tone:'violet', fixedFor:'arrow', movementScale:1.45 },
];

export const DEFAULT_PROGRAMS: Record<string, string[]> = {
  volt:['attack-low','approach'], bastion:['attack-low','approach'],
  relay:['attack-low','relay-dash','approach'], arrow:['attack-low','approach'],
  wrath:['attack-low','approach'],
};

export const DEFAULT_REACTIONS: Record<string, ReactionBlock | null> = {
  volt:{trigger:'selfAttackHit',actionId:'volt-follow',fixedReaction:true},
  bastion:{trigger:'selfHit',actionId:'tank-guard',fixedReaction:true},
  relay:null,
  arrow:{trigger:'selfHit',actionId:'arrow-reposition',fixedReaction:true},
  wrath:{trigger:'selfHpLow',actionId:'berserker-mode',fixedReaction:true},
};
