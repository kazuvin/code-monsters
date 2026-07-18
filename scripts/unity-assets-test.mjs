import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const unity = '/Applications/Unity/Hub/Editor/6000.3.16f1/Unity.app/Contents/MacOS/Unity';
if (!fs.existsSync(unity)) throw new Error(`Unity 6000.3.16f1 is missing: ${unity}`);

const resultPath = '/tmp/code-monsters-unity-asset-tests.xml';
const logPath = '/tmp/code-monsters-unity-asset-tests.log';
for (const outputPath of [resultPath, logPath]) fs.rmSync(outputPath, { force: true });
const result = spawnSync(
  unity,
  [
    '-batchmode',
    '-nographics',
    '-projectPath',
    path.join(root, 'unity/CodeMonsters'),
    '-runTests',
    '-testPlatform',
    'EditMode',
    '-testFilter',
    'CodeMonsters.Presentation.Tests',
    '-testResults',
    resultPath,
    '-logFile',
    logPath,
    '-quit',
  ],
  { cwd: root, encoding: 'utf8', timeout: 180_000, killSignal: 'SIGTERM' },
);
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) {
  if (fs.existsSync(logPath)) process.stderr.write(fs.readFileSync(logPath, 'utf8'));
  throw result.error;
}
if (result.status !== 0) process.exit(result.status ?? 1);
if (!fs.existsSync(resultPath)) throw new Error(`Unity did not write test results: ${resultPath}`);
console.log(`Unity asset tests passed: ${resultPath}`);
