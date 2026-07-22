import type { BattleTraceEvent, GameData, Rarity, Team } from './types';

export type SkillBattleReport = {
  blockId: string;
  code: string;
  title: string;
  glyph: string;
  rarity: Rarity;
  activations: number;
  damage: number;
  poisonApplied: number;
  shield: number;
  repair: number;
  coinsEarned: number;
};

export type TeamBattleReport = {
  team: Team;
  totals: {
    totalDamage: number;
    skillDamage: number;
    poisonDamage: number;
    poisonApplied: number;
    shield: number;
    repair: number;
    coinsEarned: number;
  };
  skills: SkillBattleReport[];
};

export type BattleReport = Record<Team, TeamBattleReport>;

type MutableSkillReport = SkillBattleReport & { activationKeys: Set<string> };

const otherTeam = (team: Team): Team => (team === 'player' ? 'enemy' : 'player');

const emptyTeamReport = (team: Team): TeamBattleReport => ({
  team,
  totals: {
    totalDamage: 0,
    skillDamage: 0,
    poisonDamage: 0,
    poisonApplied: 0,
    shield: 0,
    repair: 0,
    coinsEarned: 0,
  },
  skills: [],
});

export function createBattleReport(data: GameData, trace: BattleTraceEvent[]): BattleReport {
  const blockById = new Map(data.blocks.map((block) => [block.id, block]));
  const report: BattleReport = { player: emptyTeamReport('player'), enemy: emptyTeamReport('enemy') };
  const skillMaps: Record<Team, Map<string, MutableSkillReport>> = { player: new Map(), enemy: new Map() };

  for (const event of trace) {
    if (event.kind === 'overload') continue;
    if (event.kind === 'poison-tick') {
      report[otherTeam(event.team)].totals.poisonDamage += event.value;
      continue;
    }
    if (!('blockId' in event)) continue;

    const block = blockById.get(event.blockId);
    if (!block) continue;
    let skill = skillMaps[event.team].get(event.blockId);
    if (!skill) {
      skill = {
        blockId: block.id,
        code: block.code,
        title: block.title,
        glyph: block.glyph,
        rarity: block.rarity,
        activations: 0,
        damage: 0,
        poisonApplied: 0,
        shield: 0,
        repair: 0,
        coinsEarned: 0,
        activationKeys: new Set(),
      };
      skillMaps[event.team].set(event.blockId, skill);
    }
    skill.activationKeys.add(`${event.tick}:${event.row}:${event.column}`);
    if (event.kind === 'damage' || event.kind === 'rupture') skill.damage += event.value;
    if (event.kind === 'poison') skill.poisonApplied += event.value;
    if (event.kind === 'shield') skill.shield += event.value;
    if (event.kind === 'repair') skill.repair += event.value;
    if (event.kind === 'coin') skill.coinsEarned += event.value;
  }

  (['player', 'enemy'] as Team[]).forEach((team) => {
    const skills = [...skillMaps[team].values()]
      .map(({ activationKeys, ...skill }) => ({ ...skill, activations: activationKeys.size }))
      .sort(
        (left, right) =>
          right.damage +
            right.poisonApplied +
            right.shield +
            right.repair +
            right.coinsEarned -
            (left.damage + left.poisonApplied + left.shield + left.repair + left.coinsEarned) ||
          left.title.localeCompare(right.title, 'ja'),
      );
    const totals = report[team].totals;
    skills.forEach((skill) => {
      totals.skillDamage += skill.damage;
      totals.poisonApplied += skill.poisonApplied;
      totals.shield += skill.shield;
      totals.repair += skill.repair;
      totals.coinsEarned += skill.coinsEarned;
    });
    totals.totalDamage = totals.skillDamage + totals.poisonDamage;
    report[team].skills = skills;
  });

  return report;
}
