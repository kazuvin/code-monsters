import { BATTLE_CONFIG } from '../data.ts';
import type { AttackType, ImpactProfile, Role } from '../types.ts';

export type ImpactInput = {
  rawDamage: number;
  minimumDamage: number;
  attackType: AttackType;
  attackerKnockbackPower: number;
  targetDefense: number;
  targetWeight: number;
  targetRole: Role;
  targetGuarded: boolean;
  guardDamageScale?: number;
  guardKnockbackScale?: number;
  impact?: ImpactProfile;
};

export type ImpactResult = {
  damage: number;
  knockbackDistance: number;
};

export function resolveImpact(input:ImpactInput):ImpactResult{
  const damageScale=input.impact?.damageScale??1;
  const guardedScale=input.targetGuarded?(input.guardDamageScale??1):1;
  const baseDamage=Math.round((input.rawDamage-input.targetDefense*BATTLE_CONFIG.defenseDamageFactor)*guardedScale);
  const damage=damageScale<=0?0:Math.max(input.minimumDamage,Math.round(baseDamage*damageScale));

  const defaultKnockbackPower=input.attackType==='sniper'?0:input.attackerKnockbackPower;
  const knockbackPower=input.impact?.knockbackPower??defaultKnockbackPower;
  if(knockbackPower<=0)return {damage,knockbackDistance:0};

  const tankScale=input.targetRole==='TANK'?BATTLE_CONFIG.tankKnockbackScale:1;
  const guardScale=input.targetGuarded?(input.guardKnockbackScale??1):1;
  const knockbackDistance=Math.max(BATTLE_CONFIG.minimumKnockbackDistance,knockbackPower-input.targetWeight*BATTLE_CONFIG.weightKnockbackFactor)*tankScale*guardScale;
  return {damage,knockbackDistance};
}
