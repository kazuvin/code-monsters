import type { AttackType, ImpactProfile, Role } from './types';

export type ImpactInput = {
  rawDamage: number;
  minimumDamage: number;
  attackType: AttackType;
  attackerKnockbackPower: number;
  targetDefense: number;
  targetWeight: number;
  targetRole: Role;
  targetGuarded: boolean;
  impact?: ImpactProfile;
};

export type ImpactResult = {
  damage: number;
  knockbackDistance: number;
};

export function resolveImpact(input: ImpactInput): ImpactResult {
  const damageScale=input.impact?.damageScale??1;
  const guardedScale=input.targetGuarded?.82:1;
  const baseDamage=Math.round((input.rawDamage-input.targetDefense*.55)*guardedScale);
  const damage=damageScale<=0?0:Math.max(input.minimumDamage,Math.round(baseDamage*damageScale));

  const defaultKnockbackPower=input.attackType==='sniper'?0:input.attackerKnockbackPower;
  const knockbackPower=input.impact?.knockbackPower??defaultKnockbackPower;
  if(knockbackPower<=0)return {damage,knockbackDistance:0};

  const tankScale=input.targetRole==='TANK'?.5:1;
  const guardScale=input.targetGuarded?.7:1;
  const knockbackDistance=Math.max(1.5,knockbackPower-input.targetWeight*.45)*tankScale*guardScale;
  return {damage,knockbackDistance};
}
