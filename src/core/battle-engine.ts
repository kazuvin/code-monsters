import { BATTLE_CONFIG, DEFAULT_PROGRAMS, DEFAULT_REACTIONS } from '../data.ts';
import type { BattleFlash, Fighter, LogItem, ReactionBlock, ReactionTrigger, UnitInventoryItem } from '../types.ts';
import {
  actionCooldown,
  actionRange,
  activateBerserker,
  advanceToward,
  distanceTo,
  instructionById,
  jumpToward,
  matchCondition,
  knockbackPosition,
  priorityEnemy,
  pullToward,
  resolveActionImpact,
  retreatFrom,
  selectConditionTargets,
  selectInstructionTarget,
  throwBehind,
  tickCooldowns,
} from './rules.ts';

type MutableFighterFields = Pick<
  Fighter,
  | 'hp'
  | 'x'
  | 'cooldown'
  | 'reactionCooldown'
  | 'guarded'
  | 'guardDamageScale'
  | 'guardKnockbackScale'
  | 'berserk'
  | 'poison'
  | 'tauntTargetId'
  | 'tauntSeconds'
  | 'attack'
  | 'speed'
>;
export type FighterUpdate = { id: string; values: Partial<MutableFighterFields> };
export type BattleLogPayload = { actor: string; text: string; type: LogItem['type'] };
export type BattleStep = { flash: BattleFlash; log?: BattleLogPayload; updates: FighterUpdate[] };
export type BattlePlan = { fighters: Fighter[]; steps: BattleStep[]; logs: BattleLogPayload[]; complete: boolean };

const attackTypeLabels: Record<Fighter['attackType'], string> = { melee: '近距離', blunt: '打撃', sniper: '狙撃' };

export function applyFighterUpdates(fighters: Fighter[], updates: FighterUpdate[]): Fighter[] {
  return fighters.map((fighter) => {
    const matching = updates.filter((update) => update.id === fighter.instanceId);
    return matching.reduce((current, update) => ({ ...current, ...update.values }), fighter);
  });
}

export function applyBattleStep(fighters: Fighter[], step: BattleStep): Fighter[] {
  return applyFighterUpdates(fighters, step.updates);
}

export function isBattleComplete(fighters: Fighter[]): boolean {
  return (
    !fighters.some((fighter) => fighter.team === 'ally' && fighter.hp > 0) ||
    !fighters.some((fighter) => fighter.team === 'enemy' && fighter.hp > 0)
  );
}

export function planBattleFrame({
  fighters,
  team,
  dt,
  elapsed,
  previousElapsed,
}: {
  fighters: Fighter[];
  team: UnitInventoryItem[];
  dt: number;
  elapsed: number;
  previousElapsed: number;
}): BattlePlan {
  let displayNext = tickCooldowns(fighters, dt);
  let next = displayNext.map((fighter) => ({ ...fighter }));
  const steps: BattleStep[] = [];
  const logs: BattleLogPayload[] = [];

  const setNext = (fighterId: string, values: Partial<MutableFighterFields>) => {
    const index = next.findIndex((fighter) => fighter.instanceId === fighterId);
    if (index >= 0) next[index] = { ...next[index], ...values };
  };
  const queueStep = (step: BattleStep) => steps.push(step);
  const reactionFor = (fighter: Fighter): ReactionBlock | null =>
    fighter.team === 'ally'
      ? (team.find((unit) => unit.inventoryId === fighter.instanceId)?.reaction ?? null)
      : (DEFAULT_REACTIONS[fighter.id] ?? null);

  const queueReaction = (reactorId: string, trigger: ReactionTrigger, sourceId: string, targetId: string) => {
    const reactor = next.find((fighter) => fighter.instanceId === reactorId);
    if (!reactor) return;
    const reaction = reactionFor(reactor);
    if (!reaction || reaction.trigger !== trigger || reactor.hp <= 0 || reactor.reactionCooldown > 0) return;
    const source = next.find((fighter) => fighter.instanceId === sourceId);
    const eventTarget = next.find((fighter) => fighter.instanceId === targetId);
    const target =
      trigger === 'selfHit'
        ? source
        : trigger === 'selfHpLow'
          ? priorityEnemy(
              reactor,
              next.filter((fighter) => fighter.team !== reactor.team && fighter.hp > 0),
            )
          : eventTarget;
    const instruction = instructionById.get(reaction.actionId);
    if (!instruction) return;
    const actionLabel = `⚡ ${instruction.short}`;

    if (instruction.action === 'guard') {
      const values = {
        guarded: true,
        guardDamageScale: instruction.params.incomingDamageScale ?? 1,
        guardKnockbackScale: instruction.params.incomingKnockbackScale ?? 1,
        reactionCooldown: BATTLE_CONFIG.reactionCooldownSeconds,
      };
      setNext(reactor.instanceId, values);
      queueStep({
        flash: { id: reactor.instanceId, kind: 'guard', actionLabel, reaction: true, n: 0 },
        log: { actor: reactor.name, text: `REACTION｜${instruction.short}`, type: 'reaction' },
        updates: [{ id: reactor.instanceId, values }],
      });
      return;
    }
    if (instruction.action === 'berserk') {
      if (reactor.berserk) return;
      const boost = activateBerserker(reactor, instruction);
      const values = { ...boost, reactionCooldown: BATTLE_CONFIG.reactionCooldownSeconds };
      setNext(reactor.instanceId, values);
      queueStep({
        flash: { id: reactor.instanceId, kind: 'berserk', actionLabel, reaction: true, n: 0 },
        log: {
          actor: reactor.name,
          text: `REACTION｜バーサーカーモード｜ATK ${reactor.attack}→${boost.attack} / SPD ${reactor.speed.toFixed(2)}→${boost.speed.toFixed(2)}`,
          type: 'reaction',
        },
        updates: [{ id: reactor.instanceId, values }],
      });
      return;
    }
    if (instruction.action === 'taunt') {
      const duration = instruction.params.durationSeconds ?? 0;
      const enemyUpdates = next
        .filter((fighter) => fighter.team !== reactor.team && fighter.hp > 0)
        .map((fighter) => ({
          id: fighter.instanceId,
          values: { tauntTargetId: reactor.instanceId, tauntSeconds: duration },
        }));
      const reactorUpdate = {
        id: reactor.instanceId,
        values: { reactionCooldown: BATTLE_CONFIG.reactionCooldownSeconds },
      };
      setNext(reactor.instanceId, reactorUpdate.values);
      for (const update of enemyUpdates) setNext(update.id, update.values);
      queueStep({
        flash: { id: reactor.instanceId, kind: 'taunt', actionLabel, reaction: true, n: 0 },
        log: {
          actor: reactor.name,
          text: `REACTION｜${instruction.short}｜敵全体の標的を ${duration.toFixed(1)}秒固定`,
          type: 'reaction',
        },
        updates: [reactorUpdate, ...enemyUpdates],
      });
      return;
    }
    if (instruction.action === 'retreat') {
      if (!target || target.hp <= 0) return;
      const x = retreatFrom(reactor, target, instruction.params.moveDistance ?? 0);
      const values = { x, reactionCooldown: BATTLE_CONFIG.reactionCooldownSeconds };
      setNext(reactor.instanceId, values);
      queueStep({
        flash: { id: reactor.instanceId, kind: instruction.visualKind ?? 'move', actionLabel, reaction: true, n: 0 },
        log: { actor: reactor.name, text: `REACTION｜${instruction.short}｜戦線 ${Math.round(x)}`, type: 'reaction' },
        updates: [{ id: reactor.instanceId, values }],
      });
      return;
    }
    if (instruction.action === 'jump') {
      if (!target || target.hp <= 0) return;
      const x = jumpToward(reactor, target, instruction.params.moveDistance ?? 0);
      const values = { x, reactionCooldown: BATTLE_CONFIG.reactionCooldownSeconds };
      setNext(reactor.instanceId, values);
      queueStep({
        flash: { id: reactor.instanceId, kind: instruction.visualKind ?? 'jump', actionLabel, reaction: true, n: 0 },
        log: { actor: reactor.name, text: `REACTION｜${instruction.short}｜戦線 ${Math.round(x)}`, type: 'reaction' },
        updates: [{ id: reactor.instanceId, values }],
      });
      return;
    }
    if (instruction.action === 'move') {
      if (!target || target.hp <= 0 || distanceTo(reactor, target) <= reactor.range) return;
      const x = advanceToward(reactor, target, instruction.params.moveDistance ?? 0);
      const values = { x, reactionCooldown: BATTLE_CONFIG.reactionCooldownSeconds };
      setNext(reactor.instanceId, values);
      queueStep({
        flash: { id: reactor.instanceId, kind: instruction.visualKind ?? 'move', actionLabel, reaction: true, n: 0 },
        log: { actor: reactor.name, text: `REACTION｜${instruction.short}｜戦線 ${Math.round(x)}`, type: 'reaction' },
        updates: [{ id: reactor.instanceId, values }],
      });
      return;
    }
    if (!target || target.hp <= 0) return;
    if (instruction.action === 'pull') {
      const reactionCooldown = BATTLE_CONFIG.reactionCooldownSeconds;
      if (distanceTo(reactor, target) > actionRange(reactor, instruction)) {
        const values = { reactionCooldown };
        setNext(reactor.instanceId, values);
        queueStep({
          flash: {
            id: reactor.instanceId,
            kind: 'miss',
            attackType: reactor.attackType,
            actionLabel: `${actionLabel}｜MISS`,
            reaction: true,
            n: 0,
          },
          log: {
            actor: reactor.name,
            text: `REACTION｜${instruction.short} → ${target.name}｜空振り（射程外）`,
            type: 'miss',
          },
          updates: [{ id: reactor.instanceId, values }],
        });
        return;
      }
      const x = pullToward(reactor, target, instruction.params.pullDistance ?? 0);
      setNext(reactor.instanceId, { reactionCooldown });
      setNext(target.instanceId, { x });
      queueStep({
        flash: {
          id: reactor.instanceId,
          kind: 'pull',
          targetId: target.instanceId,
          actionLabel,
          reaction: true,
          n: 0,
        },
        log: {
          actor: reactor.name,
          text: `REACTION｜${instruction.short} → ${target.name}｜間合い ${Math.round(x)}`,
          type: 'reaction',
        },
        updates: [{ id: reactor.instanceId, values: { reactionCooldown } }],
      });
      queueStep({
        flash: { id: target.instanceId, kind: 'pulled', actionLabel: 'PULL', n: 0 },
        updates: [{ id: target.instanceId, values: { x } }],
      });
      return;
    }
    const isFollow = instruction.action === 'follow';
    if (!isFollow && distanceTo(reactor, target) > reactor.range) {
      const values = { reactionCooldown: BATTLE_CONFIG.reactionCooldownSeconds };
      setNext(reactor.instanceId, values);
      queueStep({
        flash: {
          id: reactor.instanceId,
          kind: 'miss',
          attackType: reactor.attackType,
          actionLabel: `${actionLabel}｜MISS`,
          reaction: true,
          n: 0,
        },
        log: {
          actor: reactor.name,
          text: `REACTION｜${instruction.short} → ${target.name}｜空振り（射程外）`,
          type: 'miss',
        },
        updates: [{ id: reactor.instanceId, values }],
      });
      return;
    }
    const impact = resolveActionImpact(reactor, target, instruction);
    const hp = Math.max(0, target.hp - impact.damage);
    const poison = target.poison + (instruction.params.statusStacks ?? 0);
    const x =
      hp > 0 && instruction.action === 'throw'
        ? throwBehind(reactor, target, instruction.params.throwDistance ?? 0)
        : hp > 0 && impact.knockbackDistance > 0
          ? knockbackPosition(target, reactor, impact.knockbackDistance)
          : target.x;
    setNext(reactor.instanceId, { reactionCooldown: BATTLE_CONFIG.reactionCooldownSeconds });
    setNext(target.instanceId, { hp, poison, x });
    const attackKind =
      instruction.action === 'heavy' ||
      instruction.action === 'throw' ||
      instruction.action === 'poison' ||
      instruction.action === 'burn' ||
      instruction.action === 'follow'
        ? instruction.action
        : 'attack';
    queueStep({
      flash: {
        id: reactor.instanceId,
        kind: attackKind,
        targetId: target.instanceId,
        attackType: reactor.attackType,
        actionLabel,
        reaction: true,
        n: 0,
      },
      log: {
        actor: reactor.name,
        text: `REACTION｜${instruction.short} → ${target.name}｜${impact.damage} dmg`,
        type: 'reaction',
      },
      updates: [
        { id: reactor.instanceId, values: { reactionCooldown: BATTLE_CONFIG.reactionCooldownSeconds } },
        { id: target.instanceId, values: { hp, poison } },
      ],
    });
    if (hp > 0 && x !== target.x)
      queueStep({
        flash: {
          id: target.instanceId,
          kind: instruction.action === 'throw' ? 'thrown' : 'hit',
          actionLabel: instruction.action === 'throw' ? 'THROW' : 'KNOCKBACK',
          n: 0,
        },
        updates: [{ id: target.instanceId, values: { x } }],
      });
    if (hp <= 0 && target.hp > 0)
      queueStep({ flash: { id: target.instanceId, kind: 'death', actionLabel: 'DOWN', n: 0 }, updates: [] });
  };

  const triggerHitReactions = (attackerId: string, targetId: string) => {
    const attacker = next.find((fighter) => fighter.instanceId === attackerId);
    const target = next.find((fighter) => fighter.instanceId === targetId);
    if (!attacker || !target) return;
    if (target.hp > 0) {
      queueReaction(target.instanceId, 'selfHit', attacker.instanceId, target.instanceId);
      if (target.hp / target.maxHp <= BATTLE_CONFIG.lowHpThreshold)
        queueReaction(target.instanceId, 'selfHpLow', attacker.instanceId, target.instanceId);
    }
    queueReaction(attacker.instanceId, 'selfAttackHit', attacker.instanceId, target.instanceId);
    for (const ally of next.filter(
      (fighter) => fighter.team === attacker.team && fighter.instanceId !== attacker.instanceId && fighter.hp > 0,
    )) {
      queueReaction(ally.instanceId, 'allyAttackHit', attacker.instanceId, target.instanceId);
    }
  };

  if (elapsed >= BATTLE_CONFIG.overheatStartSeconds) {
    const overtimeStep = Math.floor((elapsed - BATTLE_CONFIG.overheatStartSeconds) / BATTLE_CONFIG.overheatStepSeconds);
    const rate = BATTLE_CONFIG.overheatBaseDamageRate * Math.pow(2, overtimeStep);
    displayNext = displayNext.map((fighter) => {
      if (fighter.hp <= 0) return fighter;
      const hp = Math.max(0, fighter.hp - fighter.maxHp * rate * dt);
      if (hp <= 0 && fighter.hp > 0)
        queueStep({ flash: { id: fighter.instanceId, kind: 'death', actionLabel: 'DOWN', n: 0 }, updates: [] });
      return { ...fighter, hp };
    });
    next = displayNext.map((fighter) => ({ ...fighter }));
    if (Math.floor(elapsed) !== Math.floor(previousElapsed))
      logs.push({ actor: 'SYSTEM', text: `OVERHEAT｜最大HPの ${(rate * 100).toFixed(0)}% ダメージ`, type: 'hit' });
  }

  for (const fighter of next.filter(
    (candidate) => candidate.hp > 0 && candidate.hp / candidate.maxHp <= BATTLE_CONFIG.lowHpThreshold,
  )) {
    queueReaction(fighter.instanceId, 'selfHpLow', fighter.instanceId, fighter.instanceId);
  }

  for (const ready of [...next]
    .filter((fighter) => fighter.hp > 0 && fighter.cooldown <= 0)
    .sort((a, b) => b.speed - a.speed)) {
    const actorIndex = next.findIndex((fighter) => fighter.instanceId === ready.instanceId && fighter.hp > 0);
    if (actorIndex < 0) continue;
    const actor = next[actorIndex];
    const enemies = next.filter((fighter) => fighter.team !== actor.team && fighter.hp > 0);
    const allies = next.filter((fighter) => fighter.team === actor.team && fighter.hp > 0);
    if (enemies.length === 0 || allies.length === 0) break;
    const enemyProgram = (DEFAULT_PROGRAMS[actor.id] ?? []).map((actionId) => ({
      actionId,
      conditionId: instructionById.get(actionId)?.condition ?? 'always',
      targetId: instructionById.get(actionId)?.defaultTarget ?? 'currentEnemy',
    }));
    const program =
      actor.team === 'ally'
        ? (team.find((unit) => unit.inventoryId === actor.instanceId)?.program ?? [])
        : enemyProgram;
    const cooldown = actionCooldown(actor.speed);
    const readyValues = { cooldown, guarded: false, guardDamageScale: 1, guardKnockbackScale: 1 };
    setNext(actor.instanceId, readyValues);
    displayNext = applyFighterUpdates(displayNext, [{ id: actor.instanceId, values: readyValues }]);
    let acted = false;

    for (const block of program.slice(0, actor.programLimit)) {
      const current = next.find((fighter) => fighter.instanceId === actor.instanceId);
      if (!current || current.hp <= 0) break;
      const currentEnemies = next.filter((fighter) => fighter.team !== current.team && fighter.hp > 0);
      const currentAllies = next.filter((fighter) => fighter.team === current.team && fighter.hp > 0);
      if (currentEnemies.length === 0 || currentAllies.length === 0) break;
      const instruction = instructionById.get(block.actionId);
      if (!instruction) continue;
      const conditionTargets = selectConditionTargets(block.targetId, current, currentEnemies, currentAllies);
      const matchedTargets = matchCondition(block.conditionId, current, conditionTargets);
      if (matchedTargets.length === 0) continue;
      const nearest = priorityEnemy(current, currentEnemies);
      const target =
        instruction.targetMode === 'selected'
          ? matchedTargets[0]
          : (selectInstructionTarget(instruction, current, currentEnemies, currentAllies) ?? nearest);
      if (instruction.action === 'pull' && distanceTo(current, target) > actionRange(current, instruction)) continue;
      acted = true;

      if (instruction.action === 'taunt') {
        const duration = instruction.params.durationSeconds ?? 0;
        const updates = currentEnemies.map((enemy) => ({
          id: enemy.instanceId,
          values: { tauntTargetId: current.instanceId, tauntSeconds: duration },
        }));
        for (const update of updates) setNext(update.id, update.values);
        queueStep({
          flash: { id: current.instanceId, kind: 'taunt', actionLabel: instruction.short, n: 0 },
          log: {
            actor: current.name,
            text: `${instruction.short}｜敵全体の標的を ${duration.toFixed(1)}秒固定`,
            type: 'info',
          },
          updates,
        });
      } else if (instruction.action === 'move') {
        if (distanceTo(current, target) <= current.range) {
          queueStep({
            flash: { id: current.instanceId, kind: 'wait', actionLabel: '待機', n: 0 },
            log: { actor: current.name, text: `${target.name}と対峙｜前線を維持`, type: 'info' },
            updates: [],
          });
        } else {
          const x = advanceToward(current, target, instruction.params.moveDistance ?? 0);
          setNext(current.instanceId, { x });
          queueStep({
            flash: {
              id: current.instanceId,
              kind: instruction.visualKind ?? 'move',
              actionLabel: instruction.short,
              n: 0,
            },
            log: {
              actor: current.name,
              text: `${target.name}へ${instruction.short}｜戦線 ${Math.round(x)}`,
              type: 'info',
            },
            updates: [{ id: current.instanceId, values: { x } }],
          });
        }
      } else if (instruction.action === 'jump') {
        const x = jumpToward(current, target, instruction.params.moveDistance ?? 0);
        setNext(current.instanceId, { x });
        queueStep({
          flash: {
            id: current.instanceId,
            kind: instruction.visualKind ?? 'jump',
            actionLabel: instruction.short,
            n: 0,
          },
          log: {
            actor: current.name,
            text: `${target.name}へ${instruction.short}｜戦線 ${Math.round(x)}`,
            type: 'info',
          },
          updates: [{ id: current.instanceId, values: { x } }],
        });
      } else if (instruction.action === 'pull') {
        const x = pullToward(current, target, instruction.params.pullDistance ?? 0);
        setNext(target.instanceId, { x });
        queueStep({
          flash: {
            id: current.instanceId,
            kind: 'pull',
            targetId: target.instanceId,
            actionLabel: instruction.short,
            n: 0,
          },
          log: {
            actor: current.name,
            text: `${instruction.short} → ${target.name}｜間合い ${Math.round(x)}`,
            type: 'info',
          },
          updates: [],
        });
        queueStep({
          flash: { id: target.instanceId, kind: 'pulled', actionLabel: 'PULL', n: 0 },
          updates: [{ id: target.instanceId, values: { x } }],
        });
      } else if (instruction.action === 'heal') {
        const amount = Math.round(
          current.role === 'SUPPORT'
            ? (instruction.params.supportHealAmount ?? instruction.params.healAmount ?? 0)
            : (instruction.params.healAmount ?? 0),
        );
        const hp = Math.min(target.maxHp, target.hp + amount);
        setNext(target.instanceId, { hp });
        queueStep({
          flash: { id: target.instanceId, kind: 'heal', actionLabel: '回復', n: 0 },
          log: { actor: current.name, text: `${target.name}を ${amount} 修復`, type: 'heal' },
          updates: [{ id: target.instanceId, values: { hp } }],
        });
      } else if (instruction.action === 'retreat') {
        const x = retreatFrom(current, target, instruction.params.moveDistance ?? 0);
        setNext(current.instanceId, { x });
        queueStep({
          flash: {
            id: current.instanceId,
            kind: instruction.visualKind ?? 'move',
            actionLabel: instruction.short,
            n: 0,
          },
          log: {
            actor: current.name,
            text: `${target.name}から${instruction.short}｜戦線 ${Math.round(x)}`,
            type: 'info',
          },
          updates: [{ id: current.instanceId, values: { x } }],
        });
      } else if (instruction.action === 'guard') {
        const values = {
          guarded: true,
          guardDamageScale: instruction.params.incomingDamageScale ?? 1,
          guardKnockbackScale: instruction.params.incomingKnockbackScale ?? 1,
        };
        setNext(current.instanceId, values);
        queueStep({
          flash: { id: current.instanceId, kind: 'guard', actionLabel: instruction.short, n: 0 },
          log: { actor: current.name, text: '防御姿勢へ移行', type: 'info' },
          updates: [{ id: current.instanceId, values }],
        });
      } else if (instruction.action === 'berserk') {
        if (current.berserk) {
          queueStep({
            flash: { id: current.instanceId, kind: 'wait', actionLabel: '暴走継続', n: 0 },
            log: { actor: current.name, text: 'バーサーカーモードはすでに稼働中', type: 'info' },
            updates: [],
          });
        } else {
          const boost = activateBerserker(current, instruction);
          setNext(current.instanceId, boost);
          queueStep({
            flash: { id: current.instanceId, kind: 'berserk', actionLabel: instruction.short, n: 0 },
            log: {
              actor: current.name,
              text: `バーサーカーモード｜ATK ${current.attack}→${boost.attack} / SPD ${current.speed.toFixed(2)}→${boost.speed.toFixed(2)}`,
              type: 'info',
            },
            updates: [{ id: current.instanceId, values: boost }],
          });
        }
      } else if (instruction.action === 'buff') {
        const attack = current.attack + (instruction.params.attackFlat ?? 0);
        setNext(current.instanceId, { attack });
        queueStep({
          flash: { id: current.instanceId, kind: 'heal', actionLabel: '強化', n: 0 },
          log: { actor: current.name, text: `攻撃出力を +${instruction.params.attackFlat ?? 0} 強化`, type: 'heal' },
          updates: [{ id: current.instanceId, values: { attack } }],
        });
      } else if (instruction.action === 'wait') {
        const waitCooldown = instruction.params.cooldownSeconds ?? 0;
        setNext(current.instanceId, { cooldown: waitCooldown });
        queueStep({
          flash: { id: current.instanceId, kind: 'wait', actionLabel: '待機', n: 0 },
          log: { actor: current.name, text: '同期タイミングを待機', type: 'info' },
          updates: [{ id: current.instanceId, values: { cooldown: waitCooldown } }],
        });
      } else if (distanceTo(current, target) > current.range && instruction.action !== 'follow') {
        queueStep({
          flash: {
            id: current.instanceId,
            kind: 'miss',
            attackType: current.attackType,
            actionLabel: `${instruction.short}｜MISS`,
            n: 0,
          },
          log: { actor: current.name, text: `${instruction.short} → ${target.name}｜空振り（射程外）`, type: 'miss' },
          updates: [],
        });
      } else {
        const impact = resolveActionImpact(current, target, instruction);
        const hp = Math.max(0, target.hp - impact.damage);
        const poison = target.poison + (instruction.params.statusStacks ?? 0);
        const x =
          hp > 0 && instruction.action === 'throw'
            ? throwBehind(current, target, instruction.params.throwDistance ?? 0)
            : hp > 0 && impact.knockbackDistance > 0
              ? knockbackPosition(target, current, impact.knockbackDistance)
              : target.x;
        setNext(target.instanceId, { x, hp, poison });
        const attackKind =
          instruction.action === 'heavy' ||
          instruction.action === 'throw' ||
          instruction.action === 'poison' ||
          instruction.action === 'burn' ||
          instruction.action === 'follow'
            ? instruction.action
            : 'attack';
        queueStep({
          flash: {
            id: current.instanceId,
            kind: attackKind,
            targetId: target.instanceId,
            attackType: current.attackType,
            actionLabel: instruction.showAttackTypeLabel ? attackTypeLabels[current.attackType] : instruction.short,
            n: 0,
          },
          log: {
            actor: current.name,
            text: `${instruction.short} / ${current.attackType} → ${target.name}｜${impact.damage} dmg`,
            type: 'hit',
          },
          updates: [{ id: target.instanceId, values: { hp, poison } }],
        });
        if (hp > 0 && x !== target.x)
          queueStep({
            flash: {
              id: target.instanceId,
              kind: instruction.action === 'throw' ? 'thrown' : 'hit',
              actionLabel: instruction.action === 'throw' ? 'THROW' : 'KNOCKBACK',
              n: 0,
            },
            updates: [{ id: target.instanceId, values: { x } }],
          });
        if (hp <= 0 && target.hp > 0)
          queueStep({ flash: { id: target.instanceId, kind: 'death', actionLabel: 'DOWN', n: 0 }, updates: [] });
        if (instruction.action !== 'follow') triggerHitReactions(current.instanceId, target.instanceId);
      }
    }
    if (!acted) logs.push({ actor: actor.name, text: '実行できる指示なし', type: 'skip' });
  }

  return { fighters: displayNext, steps, logs, complete: isBattleComplete(next) && steps.length === 0 };
}
