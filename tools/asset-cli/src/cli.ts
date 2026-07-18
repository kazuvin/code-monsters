import path from 'node:path';
import { approveRun, validateRun } from './approval.ts';
import { booleanOption, optionalString, parseArguments, requiredOption } from './arguments.ts';
import { chooseBackgroundColor } from './colors.ts';
import { findUnit, loadGameData, loadMotionConfig, loadPipelineConfig } from './config.ts';
import { processRun } from './processor.ts';
import { publishUnit } from './publisher.ts';
import { deriveMotionRequirements } from './requirements.ts';
import { checkRepositoryAssets } from './repository-check.ts';
import { importManualRun, loadRun } from './run-store.ts';

const help = `Code Monsters asset CLI

Commands:
  requirements --unit <unitId>
  generate --unit <unitId> --source-dir <path> [--motions idle,move] [--background #00FF00]
  process --run <runId>
  validate --run <runId>
  preview --run <runId>
  approve --run <runId> --by <name> [--replace]
  publish --unit <unitId>
  check
`;

async function main(): Promise<void> {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (command === 'help' || booleanOption(options, 'help')) {
    console.log(help);
    return;
  }

  if (command === 'requirements') {
    const unitId = requiredOption(options, 'unit');
    const data = await loadGameData();
    const unit = findUnit(data, unitId);
    const pipeline = await loadPipelineConfig();
    const requirements = deriveMotionRequirements(data, await loadMotionConfig(), unitId);
    console.log(
      JSON.stringify(
        {
          ...requirements,
          recommendedBackgroundColor: chooseBackgroundColor(
            pipeline.background.candidates,
            [...pipeline.palette.baseColors, unit.color],
            pipeline.background.minimumPaletteDeltaE,
          ),
        },
        null,
        2,
      ),
    );
    return;
  }

  if (command === 'generate') {
    const motions = optionalString(options, 'motions')
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const run = await importManualRun({
      unitId: requiredOption(options, 'unit'),
      motionIds: motions,
      sourceDirectory: path.resolve(requiredOption(options, 'source-dir')),
      backgroundColor: optionalString(options, 'background'),
    });
    console.log(JSON.stringify(run, null, 2));
    return;
  }

  if (command === 'process') {
    console.log(JSON.stringify(await processRun(requiredOption(options, 'run')), null, 2));
    return;
  }

  if (command === 'validate') {
    const { report, manifest } = await validateRun(requiredOption(options, 'run'));
    console.log(JSON.stringify({ summary: report.summary, contentHash: manifest.contentHash }, null, 2));
    if (report.summary.errors > 0) process.exitCode = 2;
    return;
  }

  if (command === 'preview') {
    const { run, directory } = await loadRun(requiredOption(options, 'run'));
    if (!run.outputs.preview) throw new Error(`Run ${run.runId} has no preview; process it first`);
    console.log(path.join(directory, run.outputs.preview));
    return;
  }

  if (command === 'approve') {
    const result = await approveRun(
      requiredOption(options, 'run'),
      requiredOption(options, 'by'),
      booleanOption(options, 'replace'),
    );
    console.log(JSON.stringify({ directory: result.directory, contentHash: result.manifest.contentHash }, null, 2));
    return;
  }

  if (command === 'publish') {
    console.log(JSON.stringify(await publishUnit(requiredOption(options, 'unit')), null, 2));
    return;
  }

  if (command === 'check') {
    console.log(JSON.stringify(await checkRepositoryAssets(), null, 2));
    return;
  }

  throw new Error(`Unknown command: ${command}\n\n${help}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
