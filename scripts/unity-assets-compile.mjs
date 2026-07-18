import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const editor = '/Applications/Unity/Hub/Editor/6000.3.16f1/Unity.app/Contents';
const monoRoot = path.join(editor, 'Resources/Scripting/MonoBleedingEdge');
const compiler = path.join(monoRoot, 'lib/mono/msbuild/Current/bin/Roslyn/csc.exe');
const mono = path.join(monoRoot, 'bin/mono');
const managed = path.join(editor, 'Resources/Scripting/Managed');
const engineManaged = path.join(managed, 'UnityEngine');
const output = '/tmp/code-monsters-unity-presentation.dll';
const spriteApiStub = '/tmp/code-monsters-unity-sprite-editor-api.cs';
const spritePackage = path.join(editor, 'Resources/PackageManager/BuiltInPackages/com.unity.2d.sprite/Editor');

for (const required of [mono, compiler])
  if (!fs.existsSync(required)) throw new Error(`Unity 6000.3.16f1 toolchain is missing: ${required}`);

const providerSource = fs.readFileSync(path.join(spritePackage, 'Interface/ISpriteEditorDataProvider.cs'), 'utf8');
const factorySource = fs.readFileSync(path.join(spritePackage, 'SpriteEditor/SpriteEditorWindow.cs'), 'utf8');
for (const signature of ['interface ISpriteEditorDataProvider', 'interface ISpriteNameFileIdDataProvider']) {
  if (!providerSource.includes(signature))
    throw new Error(`Installed Unity Sprite package does not expose ${signature}`);
}
if (!factorySource.includes('GetSpriteEditorDataProviderFromObject'))
  throw new Error('Installed Unity Sprite package does not expose the expected data-provider factory');

fs.writeFileSync(
  spriteApiStub,
  `using System.Collections.Generic;
using UnityEngine;

namespace UnityEditor
{
    public class SpriteRect
    {
        public string name { get; set; }
        public Vector2 pivot { get; set; }
        public SpriteAlignment alignment { get; set; }
        public Vector4 border { get; set; }
        public Rect rect { get; set; }
        public GUID spriteID { get; set; }
    }
}

namespace UnityEditor.U2D.Sprites
{
    public interface ISpriteEditorDataProvider
    {
        SpriteRect[] GetSpriteRects();
        void SetSpriteRects(SpriteRect[] spriteRects);
        void Apply();
        void InitSpriteEditorDataProvider();
        T GetDataProvider<T>() where T : class;
    }

    public interface ISpriteNameFileIdDataProvider
    {
        void SetNameFileIdPairs(IEnumerable<SpriteNameFileIdPair> pairs);
    }

    public sealed class SpriteNameFileIdPair
    {
        public SpriteNameFileIdPair(string name, GUID fileId) {}
    }

    public sealed class SpriteDataProviderFactories
    {
        public void Init() {}
        public ISpriteEditorDataProvider GetSpriteEditorDataProviderFromObject(Object value) => null;
    }
}
`,
);

const references = [
  path.join(monoRoot, 'lib/mono/4.7.1-api/Facades/netstandard.dll'),
  path.join(managed, 'Newtonsoft.Json.dll'),
  path.join(managed, 'UnityEditor.Graphs.dll'),
  ...fs
    .readdirSync(engineManaged)
    .filter((file) => /^(UnityEngine|UnityEditor).*\.dll$/.test(file))
    .map((file) => path.join(engineManaged, file)),
];
const sourceRoots = [
  'unity/CodeMonsters/Assets/CodeMonsters/Presentation/Runtime',
  'unity/CodeMonsters/Assets/CodeMonsters/Presentation/Editor',
];
const sources = sourceRoots.flatMap((directory) =>
  fs
    .readdirSync(path.join(root, directory))
    .filter((file) => file.endsWith('.cs'))
    .map((file) => path.join(root, directory, file)),
);
const result = spawnSync(
  mono,
  [
    compiler,
    '-nologo',
    '-target:library',
    '-langversion:8',
    '-define:UNITY_EDITOR',
    `-out:${output}`,
    ...references.map((reference) => `-r:${reference}`),
    spriteApiStub,
    ...sources,
  ],
  { cwd: root, encoding: 'utf8' },
);
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Unity presentation sources compiled: ${output}`);
