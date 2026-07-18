using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using CodeMonsters.Presentation.Editor;
using Newtonsoft.Json;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;

namespace CodeMonsters.Presentation.Tests
{
    public sealed class SpriteAssetImporterTests
    {
        private const string TestDirectory = "Assets/CodeMonsters/Presentation/Generated/importer-test";
        private const string ManifestPath = TestDirectory + "/manifest.json";
        private const string SheetPath = TestDirectory + "/sprite-sheet.png";

        [SetUp]
        public void SetUp()
        {
            AssetDatabase.DeleteAsset(TestDirectory);
            Directory.CreateDirectory(AbsolutePath(TestDirectory));
            WriteSheet();
            WriteManifest();
            AssetDatabase.Refresh();
        }

        [TearDown]
        public void TearDown()
        {
            AssetDatabase.DeleteAsset(TestDirectory);
        }

        [Test]
        public void ApprovedManifestGeneratesSpritesClipsControllerAndPrefabIdempotently()
        {
            var first = SpriteAssetImporter.ImportManifest(ManifestPath);
            var clipPath = TestDirectory + "/Animations/idle.anim";
            var controllerPath = TestDirectory + "/importer-test.controller";
            var prefabPath = TestDirectory + "/importer-test.prefab";
            var firstClipGuid = AssetDatabase.AssetPathToGUID(clipPath);
            var firstControllerGuid = AssetDatabase.AssetPathToGUID(controllerPath);
            var firstPrefabGuid = AssetDatabase.AssetPathToGUID(prefabPath);
            var firstSpriteFileIds = SpriteFileIds();

            var importer = AssetImporter.GetAtPath(SheetPath) as TextureImporter;
            Assert.That(importer, Is.Not.Null);
            Assert.That(importer.spriteImportMode, Is.EqualTo(SpriteImportMode.Multiple));
            Assert.That(importer.filterMode, Is.EqualTo(FilterMode.Point));
            Assert.That(importer.mipmapEnabled, Is.False);
            Assert.That(importer.textureCompression, Is.EqualTo(TextureImporterCompression.Uncompressed));
            Assert.That(AssetDatabase.LoadAllAssetsAtPath(SheetPath).OfType<Sprite>(), Has.Exactly(2).Items);

            var clip = AssetDatabase.LoadAssetAtPath<AnimationClip>(clipPath);
            Assert.That(clip, Is.Not.Null);
            Assert.That(clip.frameRate, Is.EqualTo(8));
            var binding = AnimationUtility.GetObjectReferenceCurveBindings(clip).Single();
            Assert.That(AnimationUtility.GetObjectReferenceCurve(clip, binding), Has.Length.EqualTo(2));
            var serializedClip = new SerializedObject(clip);
            Assert.That(
                serializedClip.FindProperty("m_AnimationClipSettings").FindPropertyRelative("m_LoopTime").boolValue,
                Is.True
            );

            var controller = AssetDatabase.LoadAssetAtPath<AnimatorController>(controllerPath);
            Assert.That(controller.layers[0].stateMachine.states.Select(state => state.state.name), Does.Contain("move"));
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);
            Assert.That(prefab.GetComponent<SpriteRenderer>(), Is.Not.Null);
            Assert.That(prefab.GetComponent<Animator>().runtimeAnimatorController, Is.SameAs(controller));
            Assert.That(prefab.GetComponent<GeneratedUnitPresenter>().UnitId, Is.EqualTo("importer-test"));

            var second = SpriteAssetImporter.ImportManifest(ManifestPath);
            Assert.That(second.ContentHash, Is.EqualTo(first.ContentHash));
            Assert.That(AssetDatabase.AssetPathToGUID(clipPath), Is.EqualTo(firstClipGuid));
            Assert.That(AssetDatabase.AssetPathToGUID(controllerPath), Is.EqualTo(firstControllerGuid));
            Assert.That(AssetDatabase.AssetPathToGUID(prefabPath), Is.EqualTo(firstPrefabGuid));
            Assert.That(SpriteFileIds(), Is.EqualTo(firstSpriteFileIds));
        }

        [Test]
        public void ManifestWithQualityErrorsIsRejected()
        {
            var manifest = JsonConvert.DeserializeObject<SpriteAssetManifest>(File.ReadAllText(AbsolutePath(ManifestPath)));
            manifest.Quality.Errors = 1;
            File.WriteAllText(AbsolutePath(ManifestPath), JsonConvert.SerializeObject(manifest));

            Assert.Throws<InvalidDataException>(() => SpriteAssetImporter.ImportManifest(ManifestPath));
        }

        private static void WriteSheet()
        {
            var texture = new Texture2D(32, 16, TextureFormat.RGBA32, false);
            var pixels = Enumerable.Repeat(Color.clear, 32 * 16).ToArray();
            for (var y = 2; y < 14; y += 1)
            for (var x = 4; x < 12; x += 1)
                pixels[y * 32 + x] = Color.cyan;
            for (var y = 2; y < 14; y += 1)
            for (var x = 20; x < 28; x += 1)
                pixels[y * 32 + x] = Color.cyan;
            texture.SetPixels(pixels);
            texture.Apply();
            File.WriteAllBytes(AbsolutePath(SheetPath), texture.EncodeToPNG());
            UnityEngine.Object.DestroyImmediate(texture);
        }

        private static void WriteManifest()
        {
            var manifest = new
            {
                schemaVersion = 1,
                pipelineVersion = 1,
                unitId = "importer-test",
                sourceRunId = "test-run",
                sourceGameSchemaVersion = 8,
                coordinateSystem = "top-left",
                sheet = new { fileName = "sprite-sheet.png", width = 32, height = 16, sha256 = FileHash(SheetPath) },
                palette = new { id = "test-palette", sha256 = new string('a', 64), colors = new[] { "#00FFFF" } },
                pixelsPerUnit = 16,
                motions = new[]
                {
                    new
                    {
                        motionId = "idle",
                        fps = 8,
                        loop = true,
                        frameIds = new[] { "importer-test.idle.000", "importer-test.idle.001" },
                    },
                },
                frames = new[]
                {
                    new
                    {
                        frameId = "importer-test.idle.000",
                        motionId = "idle",
                        frameIndex = 0,
                        rect = new { x = 0, y = 0, width = 16, height = 16 },
                        pivot = new { x = 0.5, y = 0.125 },
                        sha256 = new string('b', 64),
                    },
                    new
                    {
                        frameId = "importer-test.idle.001",
                        motionId = "idle",
                        frameIndex = 1,
                        rect = new { x = 16, y = 0, width = 16, height = 16 },
                        pivot = new { x = 0.5, y = 0.125 },
                        sha256 = new string('c', 64),
                    },
                },
                fallbacks = new { move = "idle" },
                qaSummary = new { errors = 0, warnings = 0, infos = 0 },
                approvedAt = "2026-07-18T00:00:00Z",
                approvedBy = "test",
                contentHash = new string('d', 64),
            };
            File.WriteAllText(AbsolutePath(ManifestPath), JsonConvert.SerializeObject(manifest, Formatting.Indented));
        }

        private static string FileHash(string assetPath)
        {
            using var sha256 = SHA256.Create();
            using var stream = File.OpenRead(AbsolutePath(assetPath));
            return string.Concat(sha256.ComputeHash(stream).Select(value => value.ToString("x2")));
        }

        private static string AbsolutePath(string assetPath)
        {
            return Path.GetFullPath(Path.Combine(Application.dataPath, "..", assetPath));
        }

        private static long[] SpriteFileIds()
        {
            return AssetDatabase
                .LoadAllAssetsAtPath(SheetPath)
                .OfType<Sprite>()
                .OrderBy(sprite => sprite.name, StringComparer.Ordinal)
                .Select(sprite =>
                {
                    Assert.That(AssetDatabase.TryGetGUIDAndLocalFileIdentifier(sprite, out _, out long fileId), Is.True);
                    return fileId;
                })
                .ToArray();
        }
    }
}
