import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const editor = '/Applications/Unity/Hub/Editor/6000.3.16f1/Unity.app/Contents';
const monoRoot = path.join(editor, 'Resources/Scripting/MonoBleedingEdge');
const mono = path.join(monoRoot, 'bin/mono');
const compiler = path.join(monoRoot, 'lib/mono/msbuild/Current/bin/Roslyn/csc.exe');
const managed = path.join(editor, 'Resources/Scripting/Managed');
const engineManaged = path.join(managed, 'UnityEngine');
const output = '/tmp/code-monsters-unity-core-smoke.exe';

for (const required of [mono, compiler])
  if (!fs.existsSync(required)) throw new Error(`Unity 6000.3.16f1 toolchain is missing: ${required}`);

const sources = [
  'BattleContracts.cs',
  'BattleRules.cs',
  'CombatResolver.cs',
  'GameBalanceData.cs',
  'GameBalanceLoader.cs',
].map((file) => path.join(root, 'unity/CodeMonsters/Assets/CodeMonsters/Core', file));
sources.push(path.join(root, 'unity/CodeMonsters/Tools/UnityCoreSmoke.cs'));

const compile = spawnSync(
  mono,
  [
    compiler,
    '-nologo',
    '-target:exe',
    '-langversion:8',
    `-r:${path.join(monoRoot, 'lib/mono/4.7.1-api/Facades/netstandard.dll')}`,
    `-r:${path.join(managed, 'Newtonsoft.Json.dll')}`,
    `-r:${path.join(engineManaged, 'UnityEngine.CoreModule.dll')}`,
    `-out:${output}`,
    ...sources,
  ],
  { cwd: root, encoding: 'utf8' },
);
if (compile.stdout) process.stdout.write(compile.stdout);
if (compile.stderr) process.stderr.write(compile.stderr);
if (compile.status !== 0) process.exit(compile.status ?? 1);

const run = spawnSync(
  mono,
  [output, path.join(root, 'game-data/game-balance.json'), path.join(root, 'game-data/golden/combat-cases.json')],
  {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      MONO_PATH: [managed, engineManaged, process.env.MONO_PATH].filter(Boolean).join(path.delimiter),
    },
  },
);
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) process.exit(run.status ?? 1);
