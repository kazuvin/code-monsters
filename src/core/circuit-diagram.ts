import { rotateCellOffset } from './circuit';
import type { BlockDefinition, Rotation } from './types';

export type CircuitDiagramKind =
  | 'cycle'
  | 'all-ports'
  | 'straight-line'
  | 'inscription'
  | 'magic-sigil'
  | 'magic-sigil-network'
  | 'resonance'
  | 'branch'
  | 'merge'
  | 'powered-trait'
  | 'downstream'
  | 'charge-flow'
  | 'charge-release';

export type CircuitDiagramRole = 'target' | 'source' | 'affected' | 'route' | 'condition' | 'sigil';

export type CircuitDiagramNode = {
  row: number;
  column: number;
  role: CircuitDiagramRole;
  glyph?: string;
};

export type CircuitDiagramLink = {
  from: [number, number];
  to: [number, number];
  role: 'flow' | 'influence';
};

export type CircuitDiagram = {
  size: 5;
  kind: CircuitDiagramKind;
  title: string;
  caption: string;
  nodes: CircuitDiagramNode[];
  links: CircuitDiagramLink[];
};

const target: CircuitDiagramNode = { row: 2, column: 2, role: 'target' };
const node = (row: number, column: number, role: CircuitDiagramRole, glyph?: string): CircuitDiagramNode => ({
  row,
  column,
  role,
  ...(glyph ? { glyph } : {}),
});
const link = (
  from: [number, number],
  to: [number, number],
  role: CircuitDiagramLink['role'] = 'flow',
): CircuitDiagramLink => ({ from, to, role });
const diagram = (
  kind: CircuitDiagramKind,
  title: string,
  caption: string,
  nodes: CircuitDiagramNode[],
  links: CircuitDiagramLink[],
): CircuitDiagram => ({ size: 5, kind, title, caption, nodes: [target, ...nodes], links });

const effectTriggerKinds = (block: BlockDefinition) =>
  block.effects.flatMap((effect) => ('trigger' in effect && effect.trigger ? [effect.trigger.kind] : []));
const effectScalingKinds = (block: BlockDefinition) =>
  block.effects.flatMap((effect) => ('scaling' in effect && effect.scaling ? [effect.scaling.kind] : []));

export function circuitDiagramForBlock(block: BlockDefinition, rotation: Rotation): CircuitDiagram | null {
  const triggers = effectTriggerKinds(block);
  const scalings = effectScalingKinds(block);
  const inscriptions = block.effects.filter((effect) => effect.kind === 'inscribe-magic-sigil');

  if (inscriptions.length > 0) {
    const affected = inscriptions.flatMap((effect) =>
      effect.offsets.map((offset) => {
        const rotated = rotateCellOffset(offset, rotation);
        return node(2 + rotated.row, 2 + rotated.column, 'affected', '紋');
      }),
    );
    const links = affected.map((item) => link([2, 2], [item.row, item.column]));
    const level = Math.max(...inscriptions.map((effect) => effect.amount));
    return diagram(
      'inscription',
      '魔紋を刻む範囲',
      `中央から色の付いたマスへ、魔紋を${level}段階刻む。カードを回すと範囲も回る。`,
      affected,
      links,
    );
  }

  if (triggers.includes('branch-at-least') || scalings.includes('downstream-count')) {
    return diagram(
      'branch',
      '下流へ分岐',
      '中央から先へ通電する経路を数える。枝が多いほど効果が強くなる。',
      [
        node(1, 2, 'affected'),
        node(0, 2, 'route'),
        node(2, 3, 'affected'),
        node(2, 4, 'route'),
        node(3, 2, 'affected'),
        node(4, 2, 'route'),
      ],
      [
        link([2, 2], [1, 2]),
        link([1, 2], [0, 2]),
        link([2, 2], [2, 3]),
        link([2, 3], [2, 4]),
        link([2, 2], [3, 2]),
        link([3, 2], [4, 2]),
      ],
    );
  }

  if (triggers.includes('merge-at-least') || scalings.includes('upstream-count')) {
    return diagram(
      'merge',
      '上流から合流',
      '色の付いた別経路が中央へ同時に入る。合流する経路が多いほど効果が強くなる。',
      [
        node(0, 2, 'source'),
        node(1, 2, 'route'),
        node(2, 0, 'source'),
        node(2, 1, 'route'),
        node(4, 2, 'source'),
        node(3, 2, 'route'),
        node(2, 3, 'route'),
      ],
      [
        link([0, 2], [1, 2]),
        link([1, 2], [2, 2]),
        link([2, 0], [2, 1]),
        link([2, 1], [2, 2]),
        link([4, 2], [3, 2]),
        link([3, 2], [2, 2]),
        link([2, 2], [2, 3]),
      ],
    );
  }

  if (triggers.includes('adjacent-powered-at-least') || scalings.includes('adjacent-powered')) {
    const surrounding = [
      [1, 1],
      [1, 2],
      [1, 3],
      [2, 1],
      [2, 3],
      [3, 1],
      [3, 2],
      [3, 3],
    ] as const;
    return diagram(
      'resonance',
      '周囲8マスで共鳴',
      '色の付いた周囲8マスにある通電ノードを数え、中央の効果を強くする。',
      surrounding.map(([row, column]) => node(row, column, 'source')),
      surrounding.map(([row, column]) => link([row, column], [2, 2], 'influence')),
    );
  }

  if (triggers.includes('in-cycle')) {
    const route = [
      [1, 2],
      [1, 3],
      [2, 3],
      [3, 3],
      [3, 2],
    ] as const;
    const path = [[2, 2], ...route, [2, 2]] as Array<readonly [number, number]>;
    return diagram(
      'cycle',
      '輪の中で発動',
      '中央を含む通電経路を一周させると、追加効果が発動する。',
      route.map(([row, column]) => node(row, column, 'condition')),
      path.slice(0, -1).map((from, index) => link([from[0], from[1]], [path[index + 1][0], path[index + 1][1]])),
    );
  }

  if (triggers.includes('all-ports-connected')) {
    const neighbors = [
      [1, 2],
      [2, 3],
      [3, 2],
      [2, 1],
    ] as const;
    return diagram(
      'all-ports',
      'すべての接続を使う',
      '中央の接続口をすべて隣のノードへつなぐと、追加効果が発動する。',
      neighbors.map(([row, column]) => node(row, column, 'condition')),
      neighbors.map(([row, column]) => link([row, column], [2, 2], 'influence')),
    );
  }

  if (triggers.includes('straight-line-at-least') || scalings.includes('straight-line')) {
    return diagram(
      'straight-line',
      '長い直線で強化',
      '中央を含む一直線の通電ノードを数える。直線が長いほど効果が強くなる。',
      [0, 1, 3, 4].map((column) => node(2, column, 'condition')),
      [0, 1, 2, 3].map((column) => link([2, column], [2, column + 1])),
    );
  }

  if (scalings.includes('magic-sigil-count')) {
    const sigils = [
      [0, 0],
      [0, 4],
      [3, 0],
      [4, 4],
    ] as const;
    return diagram(
      'magic-sigil-network',
      '通電中の魔紋を数える',
      '盤面で通電している魔紋の数を合計し、中央の効果を強くする。',
      [node(2, 2, 'target', '紋'), ...sigils.map(([row, column]) => node(row, column, 'sigil', '紋'))],
      sigils.map(([row, column]) => link([row, column], [2, 2], 'influence')),
    );
  }

  if (triggers.includes('magic-sigil-level-at-least') || scalings.includes('magic-sigil-level')) {
    return diagram(
      'magic-sigil',
      '魔紋の上で強化',
      '中央のマスへ魔紋を重ねる。位階が高いほど効果が強くなる。',
      [node(2, 2, 'target', '紋')],
      [],
    );
  }

  if (scalings.includes('powered-axis')) {
    const sources = [
      [0, 1],
      [1, 4],
      [3, 0],
      [4, 3],
    ] as const;
    return diagram(
      'powered-trait',
      '通電中の特性を数える',
      '盤面で通電している対象特性のノードを合計し、中央の効果を強くする。',
      sources.map(([row, column]) => node(row, column, 'source')),
      sources.map(([row, column]) => link([row, column], [2, 2], 'influence')),
    );
  }

  if (
    block.effects.some(
      (effect) =>
        (effect.kind === 'growth' && effect.target === 'downstream') ||
        effect.kind === 'amplify' ||
        effect.kind === 'haste',
    )
  ) {
    return diagram(
      'downstream',
      'この先の技を強化',
      '中央より先へ通電するノードに、成長・増幅・加速の効果を渡す。',
      [node(2, 3, 'affected'), node(2, 4, 'affected')],
      [link([2, 2], [2, 3]), link([2, 3], [2, 4])],
    );
  }

  if (block.effects.some((effect) => effect.kind === 'release-charge')) {
    return diagram(
      'charge-release',
      '届いたチャージを解放',
      '左から届いたチャージを中央ですべて使う。このノードから先へは通電しない。',
      [node(2, 0, 'source', '充'), node(2, 1, 'route')],
      [link([2, 0], [2, 1]), link([2, 1], [2, 2])],
    );
  }

  if (block.effects.some((effect) => effect.kind === 'charge')) {
    return diagram(
      'charge-flow',
      'チャージを先へ渡す',
      '中央でチャージを加え、通電経路の先にある解放ノードへ運ぶ。',
      [node(2, 1, 'route'), node(2, 3, 'affected', '充'), node(2, 4, 'route')],
      [link([2, 1], [2, 2]), link([2, 2], [2, 3]), link([2, 3], [2, 4])],
    );
  }

  return null;
}
