import { describe, expect, it } from 'vitest';
import {
  createBuildMatrix,
  createSkillCoverageMatrix,
  renderBuildMatrixMarkdown,
  validateBuildDesign,
} from './build-design';
import { GAME_DATA } from './game-data';

describe('build design', () => {
  it('models build concepts as trait and weapon axes with reusable combinations', () => {
    expect(GAME_DATA.buildDesign.axes.map((axis) => axis.id)).toEqual(['trait', 'weapon']);
    expect(GAME_DATA.buildDesign.axes.find((axis) => axis.id === 'trait')?.values.map((value) => value.id)).toEqual([
      'neutral',
      'poison',
      'charge',
    ]);
    expect(GAME_DATA.buildDesign.axes.find((axis) => axis.id === 'weapon')?.values.map((value) => value.id)).toEqual([
      'blade',
      'bow',
      'cannon',
      'device',
      'magic',
    ]);

    const hybridSkills = GAME_DATA.buildDesign.skills.filter(
      (skill) => skill.axisLinks.find((link) => link.axisId === 'trait')?.valueIds.length === 2,
    );
    expect(hybridSkills.map((skill) => skill.id).sort()).toEqual(['status-relay', 'toxic-reservoir']);

    GAME_DATA.buildDesign.skills.forEach((skill) => {
      expect(skill.axisLinks.map((link) => link.axisId).sort(), skill.id).toEqual(['trait', 'weapon']);
    });
  });

  it('tracks internal placement conditions and generates a trait-by-type coverage count', () => {
    expect(GAME_DATA.buildDesign.placementPatterns.map((pattern) => pattern.id)).toEqual([
      'free',
      'loop',
      'fully-connected',
      'straight-line',
    ]);
    expect(GAME_DATA.buildDesign.skills.every((skill) => Boolean(skill.placementPatternId))).toBe(true);

    const rows = createSkillCoverageMatrix(GAME_DATA.buildDesign);
    expect(
      rows.find((row) => row.placementPatternId === 'loop' && row.traitId === 'poison')?.counts.magic,
    ).toBeGreaterThanOrEqual(1);
    expect(
      rows.find((row) => row.placementPatternId === 'fully-connected' && row.traitId === 'neutral')?.counts.magic,
    ).toBeGreaterThanOrEqual(1);
    expect(
      rows.find((row) => row.placementPatternId === 'straight-line' && row.traitId === 'charge')?.counts.blade,
    ).toBeGreaterThanOrEqual(1);
  });

  it('adds charge while keeping poison open to weapon and cross-trait combinations', () => {
    const rows = createBuildMatrix(GAME_DATA.buildDesign);
    const poison = rows.find((row) => row.buildId === 'poison')!;
    const charge = rows.find((row) => row.buildId === 'charge')!;

    expect(poison.exclusiveSkillRatio).toBeLessThanOrEqual(0.5);
    expect(poison.axisCoverage.weapon).toEqual(expect.arrayContaining(['blade', 'bow', 'cannon', 'device']));
    expect(charge.missingRoles).toEqual([]);
    expect(charge.axisCoverage.weapon).toEqual(expect.arrayContaining(['blade', 'bow', 'cannon', 'device']));
    expect(charge.payoffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ payoffId: 'burst', missingRoles: [] }),
        expect.objectContaining({ payoffId: 'guard', missingRoles: [] }),
      ]),
    );
  });

  it('covers every required role and gives poison distinct payoff paths', () => {
    const [poison] = createBuildMatrix(GAME_DATA.buildDesign);

    expect(poison.buildId).toBe('poison');
    expect(poison.missingRoles).toEqual([]);
    expect(poison.openSkillIds.length).toBeGreaterThanOrEqual(GAME_DATA.buildDesign.rules.minimumOpenSkillsPerBuild);
    expect(poison.payoffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ payoffId: 'cultivate', missingRoles: [], payoffSkillIds: ['venom-bloom'] }),
        expect.objectContaining({ payoffId: 'burst', missingRoles: [], payoffSkillIds: ['rupture-stake'] }),
      ]),
    );
    expect(
      validateBuildDesign(
        GAME_DATA.buildDesign,
        GAME_DATA.blocks.map((block) => block.id),
      ),
    ).toEqual([]);
  });

  it('detects a missing role and a payoff path without its own finisher', () => {
    const invalid = structuredClone(GAME_DATA.buildDesign);
    invalid.skills = invalid.skills.filter((skill) => skill.id !== 'rupture-stake');
    invalid.skills.forEach((skill) => {
      skill.buildLinks.forEach((link) => {
        link.roles = link.roles.filter((role) => role !== 'sustain');
      });
    });

    expect(
      validateBuildDesign(
        invalid,
        GAME_DATA.blocks.map((block) => block.id),
      ),
    ).toEqual(
      expect.arrayContaining([
        'build "poison" is missing required role "sustain"',
        'build "poison" payoff "burst" is missing required role "payoff"',
        'build "poison" payoff "burst" needs a distinct payoff skill',
      ]),
    );
  });

  it('detects a closed build with too few reusable skills', () => {
    const invalid = structuredClone(GAME_DATA.buildDesign);
    invalid.builds = invalid.builds.filter((build) => build.id === 'poison');
    invalid.skills = invalid.skills.filter((skill) => skill.buildLinks.some((link) => link.buildId === 'poison'));
    invalid.skills.forEach((skill) => {
      skill.scope = 'exclusive';
      skill.sharedSynergies = [];
      skill.buildLinks = skill.buildLinks.filter((link) => link.buildId === 'poison');
      const trait = skill.axisLinks.find((link) => link.axisId === 'trait');
      if (trait) trait.valueIds = ['poison'];
    });

    expect(
      validateBuildDesign(
        invalid,
        GAME_DATA.blocks.map((block) => block.id),
      ),
    ).toEqual(
      expect.arrayContaining([
        'build "poison" needs at least 3 open skills but has 0',
        'build "poison" exclusive skill ratio 1 exceeds 0.5',
      ]),
    );
  });

  it('requires a shared node to tag every linked build on the trait axis', () => {
    const invalid = structuredClone(GAME_DATA.buildDesign);
    const relay = invalid.skills.find((skill) => skill.id === 'status-relay')!;
    relay.axisLinks.find((link) => link.axisId === 'trait')!.valueIds = ['poison'];

    expect(
      validateBuildDesign(
        invalid,
        GAME_DATA.blocks.map((block) => block.id),
      ),
    ).toContain('skill design "status-relay" does not tag linked build "trait/charge"');
  });

  it('allows a neutral shared node to support builds without pretending to own their traits', () => {
    const strike = GAME_DATA.buildDesign.skills.find((skill) => skill.id === 'strike')!;

    expect(strike.axisLinks.find((link) => link.axisId === 'trait')?.valueIds).toEqual(['neutral']);
    expect(strike.buildLinks.map((link) => link.buildId).sort()).toEqual(['charge', 'poison']);
    expect(
      validateBuildDesign(
        GAME_DATA.buildDesign,
        GAME_DATA.blocks.map((block) => block.id),
      ),
    ).toEqual([]);
  });

  it('renders a compact Japanese matrix for design review', () => {
    const markdown = renderBuildMatrixMarkdown(GAME_DATA.buildDesign);

    expect(markdown).toContain('# ビルド・シナジーマトリクス');
    expect(markdown).toContain('| 特性 | ノード固有の蓄積・変換。無特性はどのビルドにも属さない |');
    expect(markdown).toContain('| `poison-needle` | `poison` | `bow` |');
    expect(markdown).toContain('## 配置条件 × 特性 × 武器・装置（スキル数）');
    expect(markdown).toContain('| 循環 × 毒 |');
    expect(markdown).toContain('配置思想 | 充電ノードを連ねた経路と遠い解放点');
    expect(markdown).toContain('| 培養 | 毒を残して育てる |');
    expect(markdown).toContain('| 破裂 | 毒を一気に破裂させる |');
    expect(markdown).toContain('| 一括解放 | 全チャージを大ダメージへ変える |');
    expect(markdown).toContain('`discharge-bow`');
    expect(markdown).toContain('`status-relay`');
  });
});
