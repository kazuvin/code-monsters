import { BATTLE_CONFIG, CONDITIONS, INSTRUCTIONS } from '../data.ts';
import { resolveImpact, type ImpactResult } from './combat.ts';
import type { ConditionId, Fighter, Instruction, UnitDefinition } from '../types.ts';

export const instructionById=new Map(INSTRUCTIONS.map(instruction=>[instruction.id,instruction]));
export const conditionById=new Map(CONDITIONS.map(condition=>[condition.id,condition]));

export const clampStage=(x:number)=>Math.max(BATTLE_CONFIG.wallLeft,Math.min(BATTLE_CONFIG.wallRight,x));
export const distanceTo=(a:Pick<Fighter,'x'>,b:Pick<Fighter,'x'>)=>Math.abs(a.x-b.x);
export const nearestEnemy=(actor:Fighter,enemies:Fighter[])=>[...enemies].sort((a,b)=>distanceTo(actor,a)-distanceTo(actor,b))[0];
export const lowestHp=(fighters:Fighter[])=>[...fighters].sort((a,b)=>a.hp-b.hp)[0];

export function advanceToward(actor:Fighter,target:Fighter,distance:number):number{
  const stoppingDistance=actor.range*BATTLE_CONFIG.rangeStopRatio;
  if(actor.team==='ally')return clampStage(Math.min(actor.x+distance,target.x-stoppingDistance));
  return clampStage(Math.max(actor.x-distance,target.x+stoppingDistance));
}

export function retreatFrom(actor:Fighter,distance:number):number{
  return clampStage(actor.team==='ally'?actor.x-distance:actor.x+distance);
}

export function knockbackPosition(target:Fighter,distance:number):number{
  return clampStage(target.team==='ally'?target.x-distance:target.x+distance);
}

export function canRunCondition(condition:ConditionId,actor:Fighter,enemies:Fighter[],allies:Fighter[]):boolean{
  if(condition==='always')return true;
  if(enemies.length===0||allies.length===0)return false;
  const nearest=nearestEnemy(actor,enemies);
  const inRange=distanceTo(actor,nearest)<=actor.range;
  if(condition==='enemyInRange')return inRange;
  if(condition==='enemyOutOfRange')return !inRange;
  if(condition==='enemyHpBelow50')return lowestHp(enemies).hp/lowestHp(enemies).maxHp<=BATTLE_CONFIG.enemyLowHpThreshold;
  if(condition==='selfHpBelow30')return actor.hp/actor.maxHp<=BATTLE_CONFIG.lowHpThreshold;
  if(condition==='allyHpBelow50')return lowestHp(allies).hp/lowestHp(allies).maxHp<=BATTLE_CONFIG.allyLowHpThreshold;
  return enemies.some(fighter=>fighter.poison>0);
}

export function actionCooldown(speed:number):number{
  return Math.max(BATTLE_CONFIG.minimumActionCooldownSeconds,BATTLE_CONFIG.baseActionCooldownSeconds/speed);
}

export function tickCooldowns(fighters:Fighter[],dt:number):Fighter[]{
  return fighters.map(fighter=>({
    ...fighter,
    cooldown:fighter.cooldown-dt,
    reactionCooldown:fighter.reactionCooldown-dt,
  }));
}

export function rawActionDamage(actor:Fighter,instruction:Instruction,target:Fighter):number{
  const statusBonus=target.poison>0?(instruction.params.statusTargetDamageBonus??0):0;
  return actor.attack*(instruction.params.attackScale??1)+(instruction.params.flatDamage??0)+statusBonus;
}

export function resolveActionImpact(actor:Fighter,target:Fighter,instruction:Instruction):ImpactResult{
  return resolveImpact({
    rawDamage:rawActionDamage(actor,instruction,target),
    minimumDamage:instruction.params.minimumDamage??0,
    attackType:actor.attackType,
    attackerKnockbackPower:actor.knockbackPower,
    targetDefense:target.defense,
    targetWeight:target.weight,
    targetRole:target.role,
    targetGuarded:target.guarded,
    guardDamageScale:target.guardDamageScale,
    guardKnockbackScale:target.guardKnockbackScale,
    impact:{damageScale:instruction.params.damageScale,knockbackPower:instruction.params.knockbackPower},
  });
}

export function activateBerserker(actor:Fighter,instruction:Instruction):Pick<Fighter,'attack'|'speed'|'berserk'>{
  return {
    attack:Math.round(actor.attack*(instruction.params.attackScale??1)),
    speed:Number((actor.speed*(instruction.params.speedScale??1)).toFixed(2)),
    berserk:true,
  };
}

export function selectInstructionTarget(instruction:Instruction,actor:Fighter,enemies:Fighter[],allies:Fighter[]):Fighter|undefined{
  if(instruction.target==='self')return actor;
  if(instruction.target==='lowestHpEnemy')return lowestHp(enemies);
  if(instruction.target==='lowestHpAlly')return lowestHp(allies);
  return nearestEnemy(actor,enemies);
}

export function instructionMetrics(instruction:Instruction,unit:UnitDefinition):{label:string;value:string}[]{
  const metricNumber=(value:number)=>Number.isInteger(value)?String(value):value.toFixed(1);
  if(instruction.action==='move')return [{label:'前進',value:`${metricNumber(instruction.params.moveDistance??0)} m`},{label:'停止',value:'RNG内'}];
  if(instruction.action==='retreat')return [{label:'後退',value:`${metricNumber(instruction.params.moveDistance??0)} m`},{label:'停止',value:'壁際'}];
  if(instruction.action==='guard')return [
    {label:'被DMG',value:`−${Math.round((1-(instruction.params.incomingDamageScale??1))*100)}%`},
    {label:'被KB',value:`−${Math.round((1-(instruction.params.incomingKnockbackScale??1))*100)}%`},
  ];
  if(instruction.action==='heal')return [{label:'回復',value:`${unit.role==='SUPPORT'?(instruction.params.supportHealAmount??instruction.params.healAmount??0):(instruction.params.healAmount??0)} HP`}];
  if(instruction.action==='buff')return [{label:'ATK',value:`+${instruction.params.attackFlat??0}`}];
  if(instruction.action==='berserk')return [
    {label:'ATK',value:`+${Math.round(((instruction.params.attackScale??1)-1)*100)}%`},
    {label:'SPD',value:`+${Math.round(((instruction.params.speedScale??1)-1)*100)}%`},
  ];
  if(instruction.action==='wait')return [{label:'待機',value:`${instruction.params.cooldownSeconds??0} s`}];
  const rawDamage=unit.attack*(instruction.params.attackScale??1)+(instruction.params.flatDamage??0);
  const knockbackPower=instruction.params.knockbackPower??(unit.attackType==='sniper'?0:unit.knockbackPower);
  return [{label:'基礎DMG',value:metricNumber(rawDamage)},{label:'KB出力',value:metricNumber(knockbackPower)}];
}
