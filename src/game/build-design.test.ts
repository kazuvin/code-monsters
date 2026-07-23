import { describe, expect, it } from 'vitest';
import {
  createBuildMatrix,
  createSkillCoverageMatrix,
  renderBuildMatrixMarkdown,
  validateBuildDesign,
} from './build-design';
import { GAME_DATA } from './game-data';

describe('packet build design', () => {
  it('separates visible state and output axes from internal circuit operators', () => {
    const [state, output] = GAME_DATA.buildDesign.axes;

    expect(GAME_DATA.buildDesign.axes.map((axis) => axis.id)).toEqual(['trait', 'weapon']);
    expect(state.title).toBe('状態');
    expect(state.values.map((value) => value.id)).toEqual([
      'neutral',
      'damage',
      'poison',
      'charge',
      'shield',
      'repair',
      'coin',
    ]);
    expect(output.title).toBe('出力');
    expect(output.values.map((value) => value.id)).toEqual(['attack', 'guard', 'repair', 'economy', 'operator']);
    expect(state.values.map((value) => value.id)).not.toEqual(
      expect.arrayContaining(['magic-sigil', 'resonance', 'light-vein']),
    );
  });

  it('tracks circuit grammar through placement patterns instead of a third visible axis', () => {
    expect(GAME_DATA.buildDesign.placementPatterns.map((pattern) => pattern.title)).toEqual([
      '生成・変換',
      '再循環',
      '合流',
      '出力刻印',
      '状態複製',
      '分岐',
    ]);
    GAME_DATA.buildDesign.skills.forEach((skill) => {
      expect(skill.axisLinks.map((link) => link.axisId)).toEqual(['trait', 'weapon']);
      expect(skill.placementPatternId).toBeTruthy();
    });
  });

  it('generates an operator × state × output coverage matrix', () => {
    const rows = createSkillCoverageMatrix(GAME_DATA.buildDesign);

    expect(rows.length).toBe(
      GAME_DATA.buildDesign.placementPatterns.length *
        GAME_DATA.buildDesign.axes.find((axis) => axis.id === 'trait')!.values.length,
    );
    expect(rows.find((row) => row.placementPatternId === 'resonance' && row.traitId === 'neutral')?.counts).toEqual(
      expect.objectContaining({ attack: expect.any(Number), operator: expect.any(Number) }),
    );
  });

  it('keeps poison and charge builds open while preserving two payoff paths', () => {
    const rows = createBuildMatrix(GAME_DATA.buildDesign);

    expect(rows.map((row) => row.buildId)).toEqual(['poison', 'charge']);
    rows.forEach((row) => {
      expect(row.payoffs).toHaveLength(2);
      expect(row.missingRoles).toEqual([]);
      expect(row.openSkillIds.length).toBeGreaterThanOrEqual(GAME_DATA.buildDesign.rules.minimumOpenSkillsPerBuild);
      expect(row.axisCoverage.weapon?.length).toBeGreaterThanOrEqual(
        GAME_DATA.buildDesign.rules.minimumWeaponTypesPerBuild,
      );
    });
  });

  it('allows a shared operator to support multiple builds without pretending to be their state', () => {
    const invalid = structuredClone(GAME_DATA.buildDesign);
    const amplifier = invalid.skills.find((skill) => skill.id === 'amplifier')!;

    expect(amplifier.axisLinks.find((link) => link.axisId === 'trait')?.valueIds).toEqual(['neutral']);
    expect(amplifier.buildLinks.map((link) => link.buildId)).toEqual(['poison', 'charge']);
    expect(
      validateBuildDesign(
        invalid,
        GAME_DATA.blocks.map((block) => block.id),
      ),
    ).toEqual([]);
  });

  it('still rejects an unknown state or missing playable block definition', () => {
    const invalid = structuredClone(GAME_DATA.buildDesign);
    invalid.skills[0].axisLinks[0].valueIds.push('missing');
    invalid.skills[1].blockId = 'missing-block';

    expect(
      validateBuildDesign(
        invalid,
        GAME_DATA.blocks.map((block) => block.id),
      ),
    ).toEqual(
      expect.arrayContaining([
        `skill design "${invalid.skills[0].id}" references unknown axis value "trait/missing"`,
        `skill design "${invalid.skills[1].id}" references unknown block "missing-block"`,
      ]),
    );
  });

  it('renders the packet grammar in the generated Japanese matrix', () => {
    const markdown = renderBuildMatrixMarkdown(GAME_DATA.buildDesign);

    expect(markdown).toContain('# ビルド・シナジーマトリクス');
    expect(markdown).toContain('| 状態 | ノードがパケットへ生成する状態');
    expect(markdown).toContain('| ノード | 状態 | 出力 | 回路演算 |');
    expect(markdown).toContain('## 回路演算 × 状態 × 出力（スキル数）');
    expect(markdown).toContain('| `prism-arrow` | `damage` | `attack`、`operator` | 分岐 |');
  });
});
