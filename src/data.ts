import type { Instruction, ReactionBlock, ReactionTrigger, UnitDefinition } from './types';

export const REACTION_TRIGGERS: { id: ReactionTrigger; label: string }[] = [
  { id:'selfAttackHit', label:'自分の攻撃がヒットしたら' },
  { id:'selfHit', label:'自分が攻撃を受けたら' },
  { id:'allyAttackHit', label:'味方の攻撃がヒットしたら' },
];

export const UNITS: UnitDefinition[] = [
  { id:'volt', name:'ヴォルト', code:'V-01', role:'STRIKER', color:0x39d9ff, maxHp:116, attack:25, defense:7, speed:1.18, price:4, range:10, knockbackPower:8, weight:6, attackType:'melee', rarity:'common', programLimit:4 },
  { id:'bastion', name:'バスティオン', code:'B-07', role:'TANK', color:0xffc247, maxHp:176, attack:16, defense:15, speed:.78, price:4, range:8, knockbackPower:13, weight:14, attackType:'blunt', rarity:'common', programLimit:4 },
  { id:'relay', name:'リレイ', code:'R-11', role:'CHASE', color:0xff6e77, maxHp:110, attack:21, defense:6, speed:1.22, price:4, range:11, knockbackPower:7, weight:5, attackType:'melee', rarity:'common', programLimit:3 },
  { id:'arrow', name:'アロー', code:'A-05', role:'STRIKER', color:0x8df2ff, maxHp:74, attack:20, defense:3, speed:.88, price:5, range:24, knockbackPower:0, weight:2, attackType:'sniper', rarity:'common', programLimit:5 },
];

export const INSTRUCTIONS: Instruction[] = [
  { id:'attack-low', title:'敵を攻撃する', short:'攻撃', action:'attack', price:2, rarity:'common', condition:'敵が射程範囲内', target:'敵', tone:'cyan' },
  { id:'approach', title:'敵へ前進する', short:'前進', action:'move', price:1, rarity:'common', condition:'敵が射程範囲外', target:'敵', tone:'amber' },
  { id:'retreat', title:'距離を取る', short:'後退', action:'retreat', price:2, rarity:'common', condition:'敵が射程範囲内', target:'敵', tone:'violet' },
  { id:'volt-follow', title:'敵へ追撃する', short:'追撃', action:'follow', price:0, rarity:'common', condition:'条件なし', target:'敵', tone:'cyan', fixedFor:'volt', impact:{knockbackPower:0} },
  { id:'tank-guard', title:'ガードする', short:'防御', action:'guard', price:0, rarity:'common', condition:'条件なし', target:'自分', tone:'lime', fixedFor:'bastion' },
  { id:'relay-dash', title:'敵へ高速接近する', short:'高速接近', action:'move', price:0, rarity:'common', condition:'敵が射程範囲外', target:'敵', tone:'amber', fixedFor:'relay', movementScale:1.65 },
  { id:'arrow-reposition', title:'敵から緊急離脱する', short:'緊急離脱', action:'retreat', price:0, rarity:'common', condition:'条件なし', target:'敵', tone:'violet', fixedFor:'arrow', movementScale:1.45 },
];

export const DEFAULT_PROGRAMS: Record<string, string[]> = {
  volt:['attack-low','approach'], bastion:['attack-low','approach'],
  relay:['attack-low','relay-dash','approach'], arrow:['attack-low','approach'],
};

export const DEFAULT_REACTIONS: Record<string, ReactionBlock | null> = {
  volt:{trigger:'selfAttackHit',actionId:'volt-follow',fixedReaction:true},
  bastion:{trigger:'selfHit',actionId:'tank-guard',fixedReaction:true},
  relay:null,
  arrow:{trigger:'selfHit',actionId:'arrow-reposition',fixedReaction:true},
};
