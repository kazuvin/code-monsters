import type { BuildDesign, BuildRole, SkillDesignDefinition } from '../core/types';

const BUILD_ROLES: BuildRole[] = ['starter', 'grower', 'cycler', 'sustain', 'payoff'];

const ROLE_LABELS: Record<BuildRole, string> = {
  starter: '起点',
  grower: '育成',
  cycler: '回す',
  sustain: '維持',
  payoff: '活かす',
};

export type BuildPayoffMatrix = {
  payoffId: string;
  title: string;
  strategy: string;
  skillIds: string[];
  payoffSkillIds: string[];
  missingRoles: BuildRole[];
};

export type BuildMatrixRow = {
  buildId: string;
  title: string;
  placementIdentity: string;
  strength: string;
  risk: string;
  gamePlan: string;
  roleSkillIds: Record<BuildRole, string[]>;
  missingRoles: BuildRole[];
  payoffs: BuildPayoffMatrix[];
  openSkillIds: string[];
  exclusiveSkillRatio: number;
  plannedSkillIds: string[];
  playableSkillIds: string[];
  axisCoverage: Record<string, string[]>;
  hybridSkillIds: string[];
};

const linkFor = (skill: SkillDesignDefinition, buildId: string) =>
  skill.buildLinks.find((link) => link.buildId === buildId);

const axisLinkFor = (skill: SkillDesignDefinition, axisId: string) =>
  skill.axisLinks.find((link) => link.axisId === axisId);

const skillIdsForRole = (skills: SkillDesignDefinition[], buildId: string, role: BuildRole) =>
  skills.filter((skill) => linkFor(skill, buildId)?.roles.includes(role)).map((skill) => skill.id);

const isOpenForBuild = (design: BuildDesign, skill: SkillDesignDefinition, buildId: string) => {
  if (skill.buildLinks.some((link) => link.buildId !== buildId)) return true;
  if (skill.scope !== 'shared' || skill.sharedSynergies.length === 0) return false;
  if (design.builds.length === 1) return true;
  return design.skills.some(
    (candidate) =>
      candidate.id !== skill.id &&
      candidate.buildLinks.some((link) => link.buildId !== buildId) &&
      candidate.sharedSynergies.some((synergy) => skill.sharedSynergies.includes(synergy)),
  );
};

export function createBuildMatrix(design: BuildDesign): BuildMatrixRow[] {
  return design.builds.map((build) => {
    const skills = design.skills.filter((skill) => linkFor(skill, build.id));
    const roleSkillIds = Object.fromEntries(
      BUILD_ROLES.map((role) => [role, skillIdsForRole(skills, build.id, role)]),
    ) as Record<BuildRole, string[]>;
    const payoffs = build.payoffs.map((payoff) => {
      const payoffSkills = skills.filter((skill) => linkFor(skill, build.id)?.payoffIds.includes(payoff.id));
      return {
        payoffId: payoff.id,
        title: payoff.title,
        strategy: payoff.strategy,
        skillIds: payoffSkills.map((skill) => skill.id),
        payoffSkillIds: payoffSkills
          .filter((skill) => linkFor(skill, build.id)?.roles.includes('payoff'))
          .map((skill) => skill.id),
        missingRoles: design.rules.requiredPayoffRoles.filter(
          (role) => !payoffSkills.some((skill) => linkFor(skill, build.id)?.roles.includes(role)),
        ),
      };
    });
    const openSkillIds = skills.filter((skill) => isOpenForBuild(design, skill, build.id)).map((skill) => skill.id);
    const exclusiveSkills = skills.filter((skill) => skill.scope === 'exclusive' && skill.buildLinks.length === 1);
    const axisCoverage = Object.fromEntries(
      design.axes.map((axis) => [
        axis.id,
        [
          ...new Set(
            skills
              .flatMap((skill) => axisLinkFor(skill, axis.id)?.valueIds ?? [])
              .filter((valueId) => axis.values.some((value) => value.id === valueId)),
          ),
        ],
      ]),
    );
    const hybridSkillIds = skills
      .filter((skill) => (axisLinkFor(skill, build.axisId)?.valueIds.length ?? 0) > 1)
      .map((skill) => skill.id);

    return {
      buildId: build.id,
      title: build.title,
      placementIdentity: build.placementIdentity,
      strength: build.strength,
      risk: build.risk,
      gamePlan: build.gamePlan,
      roleSkillIds,
      missingRoles: design.rules.requiredRoles.filter((role) => (roleSkillIds[role] ?? []).length === 0),
      payoffs,
      openSkillIds,
      exclusiveSkillRatio: skills.length === 0 ? 1 : exclusiveSkills.length / skills.length,
      plannedSkillIds: skills.filter((skill) => skill.status === 'planned').map((skill) => skill.id),
      playableSkillIds: skills.filter((skill) => skill.status === 'playable').map((skill) => skill.id),
      axisCoverage,
      hybridSkillIds,
    };
  });
}

const pushDuplicateErrors = (label: string, ids: string[], errors: string[]) => {
  const seen = new Set<string>();
  ids.forEach((id) => {
    if (seen.has(id)) errors.push(`${label} id "${id}" is duplicated`);
    seen.add(id);
  });
};

export function validateBuildDesign(design: BuildDesign, playableBlockIds: string[] = []): string[] {
  const errors: string[] = [];
  const validRoles = new Set(BUILD_ROLES);
  const buildIds = new Set(design.builds.map((build) => build.id));
  const blockIds = new Set(playableBlockIds);
  const axisIds = new Set(design.axes.map((axis) => axis.id));
  const axisValues = new Map(design.axes.map((axis) => [axis.id, new Set(axis.values.map((value) => value.id))]));

  pushDuplicateErrors(
    'build axis',
    design.axes.map((axis) => axis.id),
    errors,
  );
  design.axes.forEach((axis) => {
    if (!axis.title.trim()) errors.push(`build axis "${axis.id}" needs a title`);
    if (!axis.description.trim()) errors.push(`build axis "${axis.id}" needs a description`);
    pushDuplicateErrors(
      `build axis "${axis.id}" value`,
      axis.values.map((value) => value.id),
      errors,
    );
  });

  pushDuplicateErrors(
    'build',
    design.builds.map((build) => build.id),
    errors,
  );
  pushDuplicateErrors(
    'skill design',
    design.skills.map((skill) => skill.id),
    errors,
  );

  if (design.rules.minimumPayoffsPerBuild < 2) errors.push('minimumPayoffsPerBuild must be at least 2');
  if (design.rules.minimumOpenSkillsPerBuild < 1) errors.push('minimumOpenSkillsPerBuild must be positive');
  if (design.rules.minimumPlayableSkillsPerBuild < 0) {
    errors.push('minimumPlayableSkillsPerBuild must not be negative');
  }
  if (design.rules.minimumHybridSkillsPerBuild < 0) {
    errors.push('minimumHybridSkillsPerBuild must not be negative');
  }
  if (design.rules.minimumWeaponTypesPerBuild < 1) {
    errors.push('minimumWeaponTypesPerBuild must be positive');
  }
  design.rules.requiredAxisIds.forEach((axisId) => {
    if (!axisIds.has(axisId)) errors.push(`requiredAxisIds references unknown axis "${axisId}"`);
  });
  if (design.rules.maximumExclusiveSkillRatio <= 0 || design.rules.maximumExclusiveSkillRatio >= 1) {
    errors.push('maximumExclusiveSkillRatio must be between 0 and 1');
  }
  design.rules.requiredRoles.forEach((role) => {
    if (!validRoles.has(role)) errors.push(`requiredRoles contains unknown role "${role}"`);
  });
  BUILD_ROLES.forEach((role) => {
    if (!design.rules.requiredRoles.includes(role)) errors.push(`requiredRoles must include "${role}"`);
  });
  design.rules.requiredPayoffRoles.forEach((role) => {
    if (!validRoles.has(role)) errors.push(`requiredPayoffRoles contains unknown role "${role}"`);
  });
  (['grower', 'cycler', 'payoff'] as BuildRole[]).forEach((role) => {
    if (!design.rules.requiredPayoffRoles.includes(role)) errors.push(`requiredPayoffRoles must include "${role}"`);
  });

  design.builds.forEach((build) => {
    if (!axisIds.has(build.axisId)) errors.push(`build "${build.id}" references unknown axis "${build.axisId}"`);
    if (!axisValues.get(build.axisId)?.has(build.id)) {
      errors.push(`build "${build.id}" is not a value of axis "${build.axisId}"`);
    }
    if (!build.placementIdentity.trim()) errors.push(`build "${build.id}" needs a placement identity`);
    if (!build.strength.trim()) errors.push(`build "${build.id}" needs a strength`);
    if (!build.risk.trim()) errors.push(`build "${build.id}" needs a risk`);
    if (!build.gamePlan.trim()) errors.push(`build "${build.id}" needs a game plan`);
    if (build.payoffs.length < design.rules.minimumPayoffsPerBuild) {
      errors.push(
        `build "${build.id}" needs at least ${design.rules.minimumPayoffsPerBuild} payoffs but has ${build.payoffs.length}`,
      );
    }
    pushDuplicateErrors(
      `build "${build.id}" payoff`,
      build.payoffs.map((payoff) => payoff.id),
      errors,
    );
  });

  design.skills.forEach((skill) => {
    if (!['planned', 'playable'].includes(skill.status)) {
      errors.push(`skill design "${skill.id}" has invalid status "${skill.status}"`);
    }
    if (!['exclusive', 'shared'].includes(skill.scope)) {
      errors.push(`skill design "${skill.id}" has invalid scope "${skill.scope}"`);
    }
    if (skill.buildLinks.length === 0) errors.push(`skill design "${skill.id}" needs a build link`);
    if (skill.scope === 'shared' && skill.sharedSynergies.length === 0) {
      errors.push(`shared skill design "${skill.id}" needs a shared synergy`);
    }
    if (skill.status === 'playable' && !skill.blockId) {
      errors.push(`playable skill design "${skill.id}" needs a blockId`);
    }
    if (skill.blockId && !blockIds.has(skill.blockId)) {
      errors.push(`skill design "${skill.id}" references unknown block "${skill.blockId}"`);
    }
    pushDuplicateErrors(
      `skill design "${skill.id}" axis link`,
      skill.axisLinks.map((link) => link.axisId),
      errors,
    );
    design.rules.requiredAxisIds.forEach((axisId) => {
      if (!axisLinkFor(skill, axisId)?.valueIds.length) {
        errors.push(`skill design "${skill.id}" needs axis "${axisId}"`);
      }
    });
    skill.axisLinks.forEach((axisLink) => {
      const values = axisValues.get(axisLink.axisId);
      if (!values) {
        errors.push(`skill design "${skill.id}" references unknown axis "${axisLink.axisId}"`);
        return;
      }
      pushDuplicateErrors(`skill design "${skill.id}" axis "${axisLink.axisId}"`, axisLink.valueIds, errors);
      axisLink.valueIds.forEach((valueId) => {
        if (!values.has(valueId)) {
          errors.push(`skill design "${skill.id}" references unknown axis value "${axisLink.axisId}/${valueId}"`);
        }
      });
    });
    skill.buildLinks.forEach((link) => {
      const build = design.builds.find((candidate) => candidate.id === link.buildId);
      if (!buildIds.has(link.buildId) || !build) {
        errors.push(`skill design "${skill.id}" references unknown build "${link.buildId}"`);
        return;
      }
      if (!axisLinkFor(skill, build.axisId)?.valueIds.includes(build.id)) {
        errors.push(`skill design "${skill.id}" does not tag linked build "${build.axisId}/${build.id}"`);
      }
      link.roles.forEach((role) => {
        if (!validRoles.has(role)) errors.push(`skill design "${skill.id}" contains unknown role "${role}"`);
      });
      const payoffIds = new Set(build.payoffs.map((payoff) => payoff.id));
      link.payoffIds.forEach((payoffId) => {
        if (!payoffIds.has(payoffId)) {
          errors.push(`skill design "${skill.id}" references unknown payoff "${link.buildId}/${payoffId}"`);
        }
      });
    });
  });

  if (design.rules.requireSkillDesignForEveryBlock) {
    blockIds.forEach((blockId) => {
      const matches = design.skills.filter((skill) => skill.status === 'playable' && skill.blockId === blockId);
      if (matches.length === 0) errors.push(`block "${blockId}" needs a playable skill design`);
      if (matches.length > 1) errors.push(`block "${blockId}" has multiple playable skill designs`);
    });
  }

  createBuildMatrix(design).forEach((row) => {
    row.missingRoles.forEach((role) => errors.push(`build "${row.buildId}" is missing required role "${role}"`));
    row.payoffs.forEach((payoff) => {
      payoff.missingRoles.forEach((role) =>
        errors.push(`build "${row.buildId}" payoff "${payoff.payoffId}" is missing required role "${role}"`),
      );
      const otherPayoffSkillIds = new Set(
        row.payoffs
          .filter((candidate) => candidate.payoffId !== payoff.payoffId)
          .flatMap((candidate) => candidate.payoffSkillIds),
      );
      if (payoff.payoffSkillIds.every((skillId) => otherPayoffSkillIds.has(skillId))) {
        errors.push(`build "${row.buildId}" payoff "${payoff.payoffId}" needs a distinct payoff skill`);
      }
    });
    if (row.openSkillIds.length < design.rules.minimumOpenSkillsPerBuild) {
      errors.push(
        `build "${row.buildId}" needs at least ${design.rules.minimumOpenSkillsPerBuild} open skills but has ${row.openSkillIds.length}`,
      );
    }
    if (row.exclusiveSkillRatio > design.rules.maximumExclusiveSkillRatio) {
      errors.push(
        `build "${row.buildId}" exclusive skill ratio ${Number(row.exclusiveSkillRatio.toFixed(2))} exceeds ${design.rules.maximumExclusiveSkillRatio}`,
      );
    }
    if (row.playableSkillIds.length < design.rules.minimumPlayableSkillsPerBuild) {
      errors.push(
        `build "${row.buildId}" needs at least ${design.rules.minimumPlayableSkillsPerBuild} playable skills but has ${row.playableSkillIds.length}`,
      );
    }
    if (row.hybridSkillIds.length < design.rules.minimumHybridSkillsPerBuild) {
      errors.push(
        `build "${row.buildId}" needs at least ${design.rules.minimumHybridSkillsPerBuild} hybrid skills but has ${row.hybridSkillIds.length}`,
      );
    }
    if ((row.axisCoverage.weapon?.length ?? 0) < design.rules.minimumWeaponTypesPerBuild) {
      errors.push(
        `build "${row.buildId}" needs at least ${design.rules.minimumWeaponTypesPerBuild} weapon types but has ${row.axisCoverage.weapon?.length ?? 0}`,
      );
    }
  });

  return errors;
}

const codeList = (ids: string[]) => (ids.length === 0 ? '—' : ids.map((id) => `\`${id}\``).join('、'));

export function renderBuildMatrixMarkdown(design: BuildDesign): string {
  const lines = [
    '# ビルド・シナジーマトリクス',
    '',
    '> `src/game/game.json` から生成します。直接編集しないでください。',
    '',
    '## ビルド軸',
    '',
    '| 軸 | 目的 | 値 |',
    '| --- | --- | --- |',
    ...design.axes.map(
      (axis) =>
        `| ${axis.title} | ${axis.description} | ${axis.values.map((value) => `${value.title}（\`${value.id}\`）`).join('、')} |`,
    ),
    '',
    '## ノードの組み合わせ',
    '',
    '| ノード | 特性 | 武器・装置 |',
    '| --- | --- | --- |',
    ...design.skills.map(
      (skill) =>
        `| \`${skill.id}\` | ${codeList(axisLinkFor(skill, 'trait')?.valueIds ?? [])} | ${codeList(axisLinkFor(skill, 'weapon')?.valueIds ?? [])} |`,
    ),
    '',
  ];

  createBuildMatrix(design).forEach((row) => {
    lines.push(
      `## ${row.title}（\`${row.buildId}\`）`,
      '',
      '| 項目 | 内容 |',
      '| --- | --- |',
      `| 配置思想 | ${row.placementIdentity} |`,
      `| 得意 | ${row.strength} |`,
      `| リスク | ${row.risk} |`,
      `| 戦い方 | ${row.gamePlan} |`,
      '',
      '### 役割',
      '',
      '| 役割 | 対応する技 |',
      '| --- | --- |',
    );
    design.rules.requiredRoles.forEach((role) => {
      lines.push(`| ${ROLE_LABELS[role]} | ${codeList(row.roleSkillIds[role] ?? [])} |`);
    });
    lines.push(
      '',
      '### 決め手',
      '',
      '| 分岐 | 方針 | 育成・循環・活用技 | 固有の決め手 |',
      '| --- | --- | --- | --- |',
    );
    row.payoffs.forEach((payoff) => {
      lines.push(
        `| ${payoff.title} | ${payoff.strategy} | ${codeList(payoff.skillIds)} | ${codeList(payoff.payoffSkillIds)} |`,
      );
    });
    lines.push(
      '',
      '### 開放性と実装状況',
      '',
      `- 開放スキル: ${codeList(row.openSkillIds)}`,
      `- 複合特性スキル: ${codeList(row.hybridSkillIds)}`,
      `- 武器・装置の幅: ${codeList(row.axisCoverage.weapon ?? [])}`,
      `- 専用技率: ${Math.round(row.exclusiveSkillRatio * 100)}%（上限 ${Math.round(design.rules.maximumExclusiveSkillRatio * 100)}%）`,
      `- 計画中: ${codeList(row.plannedSkillIds)}`,
      `- 実装済み: ${codeList(row.playableSkillIds)}（最低 ${design.rules.minimumPlayableSkillsPerBuild}）`,
      '',
    );
  });

  return lines.join('\n');
}
