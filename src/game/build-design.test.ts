import { describe, expect, it } from 'vitest';
import { createBuildMatrix, renderBuildMatrixMarkdown, validateBuildDesign } from './build-design';
import { GAME_DATA } from './game-data';

describe('build design', () => {
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
    invalid.skills.forEach((skill) => {
      skill.scope = 'exclusive';
      skill.sharedSynergies = [];
    });

    expect(
      validateBuildDesign(
        invalid,
        GAME_DATA.blocks.map((block) => block.id),
      ),
    ).toEqual(
      expect.arrayContaining([
        'build "poison" needs at least 2 open skills but has 0',
        'build "poison" exclusive skill ratio 1 exceeds 0.75',
      ]),
    );
  });

  it('requires shared hooks to connect to another build once that build exists', () => {
    const design = structuredClone(GAME_DATA.buildDesign);
    design.builds.push({
      id: 'guard',
      title: '防壁',
      placementIdentity: '折り返しと逆流',
      strength: '防御しながら育つ',
      risk: '決着が遅い',
      gamePlan: '防御経路を循環させて反撃へつなぐ',
      payoffs: [
        { id: 'counter', title: '反撃', strategy: '防御を反撃へ変える' },
        { id: 'fortify', title: '要塞', strategy: '防御を残して耐える' },
      ],
    });

    expect(createBuildMatrix(design).find((row) => row.buildId === 'poison')?.openSkillIds).toEqual([]);

    const bridge = structuredClone(design.skills.find((skill) => skill.id === 'return-coil')!);
    bridge.id = 'guard-return-coil';
    bridge.title = '反撃コイル';
    bridge.buildLinks = [{ buildId: 'guard', roles: ['cycler'], payoffIds: ['counter', 'fortify'] }];
    design.skills.push(bridge);

    expect(createBuildMatrix(design).find((row) => row.buildId === 'poison')?.openSkillIds).toContain('return-coil');
  });

  it('renders a compact Japanese matrix for design review', () => {
    const markdown = renderBuildMatrixMarkdown(GAME_DATA.buildDesign);

    expect(markdown).toContain('# ビルド・シナジーマトリクス');
    expect(markdown).toContain('配置思想 | 長い経路と循環');
    expect(markdown).toContain('| 培養 | 毒を残して育てる |');
    expect(markdown).toContain('| 破裂 | 毒を一気に破裂させる |');
    expect(markdown).toContain('`status-relay`');
  });
});
