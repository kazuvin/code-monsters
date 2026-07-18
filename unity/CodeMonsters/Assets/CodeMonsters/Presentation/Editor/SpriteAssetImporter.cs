using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using Newtonsoft.Json;
using UnityEditor;
using UnityEditor.Animations;
using UnityEditor.U2D.Sprites;
using UnityEngine;

namespace CodeMonsters.Presentation.Editor
{
    public static class SpriteAssetImporter
    {
        public const string GeneratedRoot = "Assets/CodeMonsters/Presentation/Generated";

        [MenuItem("Code Monsters/Assets/Import Approved Sprites")]
        public static void ImportAllApprovedSprites()
        {
            var manifestGuids = AssetDatabase.FindAssets("manifest t:TextAsset", new[] { GeneratedRoot });
            var imported = 0;
            foreach (var guid in manifestGuids)
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                if (!path.EndsWith("/manifest.json", StringComparison.Ordinal))
                    continue;
                ImportManifest(path);
                imported += 1;
            }
            Debug.Log($"Imported {imported} approved Code Monsters sprite manifest(s).");
        }

        public static SpriteImportResult ImportManifest(string manifestAssetPath)
        {
            var manifest = LoadAndValidateManifest(manifestAssetPath);
            var directory = Path.GetDirectoryName(manifestAssetPath)?.Replace('\\', '/');
            if (string.IsNullOrWhiteSpace(directory))
                throw new InvalidDataException($"Manifest has no asset directory: {manifestAssetPath}");
            if (!string.Equals(Path.GetFileName(directory), manifest.UnitId, StringComparison.Ordinal))
                throw new InvalidDataException($"Manifest unit ID does not match its directory: {manifest.UnitId}");
            var sheetAssetPath = $"{directory}/{manifest.Sheet.FileName}";
            ValidateSheetHash(sheetAssetPath, manifest.Sheet.Sha256);
            ConfigureSpriteSheet(sheetAssetPath, manifest);

            var sprites = AssetDatabase
                .LoadAllAssetsAtPath(sheetAssetPath)
                .OfType<Sprite>()
                .ToDictionary(sprite => sprite.name, StringComparer.Ordinal);
            var animationDirectory = $"{directory}/Animations";
            EnsureAssetDirectory(animationDirectory);
            var clips = CreateAnimationClips(animationDirectory, manifest, sprites);
            var controllerPath = $"{directory}/{manifest.UnitId}.controller";
            var controller = CreateAnimatorController(controllerPath, manifest, clips);
            var prefabPath = $"{directory}/{manifest.UnitId}.prefab";
            clips.TryGetValue("idle", out var idleClip);
            CreatePresentationPrefab(prefabPath, manifest.UnitId, controller, idleClip);

            var result = new SpriteImportResult
            {
                SchemaVersion = 1,
                UnitId = manifest.UnitId,
                ContentHash = manifest.ContentHash,
                SpriteCount = sprites.Count,
                ClipCount = clips.Count,
                ControllerPath = controllerPath,
                PrefabPath = prefabPath,
            };
            File.WriteAllText(
                AssetPathToAbsolute($"{directory}/import-result.json"),
                JsonConvert.SerializeObject(result, Formatting.Indented) + Environment.NewLine
            );
            AssetDatabase.ImportAsset($"{directory}/import-result.json", ImportAssetOptions.ForceUpdate);
            AssetDatabase.SaveAssets();
            return result;
        }

        public static SpriteAssetManifest LoadAndValidateManifest(string manifestAssetPath)
        {
            if (
                !manifestAssetPath.StartsWith(GeneratedRoot + "/", StringComparison.Ordinal)
                || !manifestAssetPath.EndsWith("/manifest.json", StringComparison.Ordinal)
                || !File.Exists(AssetPathToAbsolute(manifestAssetPath))
            )
                throw new FileNotFoundException("Sprite manifest must be inside the generated presentation directory", manifestAssetPath);
            var manifest = JsonConvert.DeserializeObject<SpriteAssetManifest>(
                File.ReadAllText(AssetPathToAbsolute(manifestAssetPath))
            );
            if (manifest == null)
                throw new InvalidDataException($"Could not deserialize sprite manifest: {manifestAssetPath}");
            if (manifest.SchemaVersion != 1)
                throw new InvalidDataException($"Unsupported sprite manifest schemaVersion: {manifest.SchemaVersion}");
            if (manifest.Quality.Errors != 0)
                throw new InvalidDataException($"Sprite manifest contains {manifest.Quality.Errors} blocking quality error(s)");
            if (string.IsNullOrWhiteSpace(manifest.ApprovedAt) || string.IsNullOrWhiteSpace(manifest.ApprovedBy))
                throw new InvalidDataException("Sprite manifest has not been approved");
            if (!IsStableId(manifest.UnitId))
                throw new InvalidDataException($"Invalid unit ID: {manifest.UnitId}");
            if (manifest.CoordinateSystem != "top-left")
                throw new InvalidDataException($"Unsupported coordinate system: {manifest.CoordinateSystem}");
            if (manifest.PipelineVersion <= 0 || manifest.SourceGameSchemaVersion <= 0)
                throw new InvalidDataException("Manifest provenance versions must be positive");
            if (
                string.IsNullOrWhiteSpace(manifest.Sheet.FileName)
                || !string.Equals(Path.GetFileName(manifest.Sheet.FileName), manifest.Sheet.FileName, StringComparison.Ordinal)
                || !manifest.Sheet.FileName.EndsWith(".png", StringComparison.OrdinalIgnoreCase)
            )
                throw new InvalidDataException($"Invalid sprite sheet file name: {manifest.Sheet.FileName}");
            if (!IsSha256(manifest.Sheet.Sha256) || !IsSha256(manifest.ContentHash))
                throw new InvalidDataException("Manifest sheet and content hashes must be lowercase SHA-256 values");
            if (manifest.PixelsPerUnit <= 0 || manifest.Sheet.Width <= 0 || manifest.Sheet.Height <= 0)
                throw new InvalidDataException("Sprite sheet dimensions and pixelsPerUnit must be positive");
            if (manifest.Motions.Count == 0 || manifest.Frames.Count == 0)
                throw new InvalidDataException("Sprite manifest must contain motions and frames");
            if (!DateTimeOffset.TryParse(manifest.ApprovedAt, out _) || string.IsNullOrWhiteSpace(manifest.ApprovedBy))
                throw new InvalidDataException("Sprite manifest approval metadata is invalid");

            var frameIds = new HashSet<string>(StringComparer.Ordinal);
            foreach (var frame in manifest.Frames)
            {
                if (!frameIds.Add(frame.FrameId))
                    throw new InvalidDataException($"Duplicate sprite frame ID: {frame.FrameId}");
                if (!IsStableId(frame.MotionId) || frame.FrameIndex < 0)
                    throw new InvalidDataException($"Invalid sprite frame: {frame.FrameId}");
                if (frame.FrameId != $"{manifest.UnitId}.{frame.MotionId}.{frame.FrameIndex:D3}")
                    throw new InvalidDataException($"Sprite frame ID does not match its identity fields: {frame.FrameId}");
                if (
                    frame.Rect.X < 0
                    || frame.Rect.Y < 0
                    || frame.Rect.Width <= 0
                    || frame.Rect.Height <= 0
                    || frame.Rect.X + frame.Rect.Width > manifest.Sheet.Width
                    || frame.Rect.Y + frame.Rect.Height > manifest.Sheet.Height
                )
                    throw new InvalidDataException($"Sprite frame is outside the sheet: {frame.FrameId}");
                if (frame.Pivot.X < 0 || frame.Pivot.X > 1 || frame.Pivot.Y < 0 || frame.Pivot.Y > 1)
                    throw new InvalidDataException($"Sprite pivot is outside normalized bounds: {frame.FrameId}");
            }
            var motionIds = new HashSet<string>(StringComparer.Ordinal);
            var referencedFrameIds = new HashSet<string>(StringComparer.Ordinal);
            foreach (var motion in manifest.Motions)
            {
                if (
                    !IsStableId(motion.MotionId)
                    || !motionIds.Add(motion.MotionId)
                    || motion.Fps <= 0
                    || motion.FrameIds.Count == 0
                )
                    throw new InvalidDataException($"Invalid sprite motion: {motion.MotionId}");
                if (motion.FrameIds.Any(frameId => !frameIds.Contains(frameId)))
                    throw new InvalidDataException($"Motion {motion.MotionId} references an unknown frame");
                var expectedFrameIds = manifest
                    .Frames.Where(frame => frame.MotionId == motion.MotionId)
                    .OrderBy(frame => frame.FrameIndex)
                    .Select(frame => frame.FrameId)
                    .ToArray();
                if (!motion.FrameIds.SequenceEqual(expectedFrameIds))
                    throw new InvalidDataException($"Motion {motion.MotionId} frame order does not match its frame records");
                if (motion.FrameIds.Any(frameId => !referencedFrameIds.Add(frameId)))
                    throw new InvalidDataException($"Motion {motion.MotionId} contains a duplicate frame reference");
            }
            if (!referencedFrameIds.SetEquals(frameIds))
                throw new InvalidDataException("Manifest contains a frame that is not referenced by exactly one motion");
            foreach (var fallback in manifest.Fallbacks)
            {
                if (!IsStableId(fallback.Key) || motionIds.Contains(fallback.Key) || !motionIds.Contains(fallback.Value))
                    throw new InvalidDataException($"Fallback {fallback.Key} references unavailable motion {fallback.Value}");
            }
            return manifest;
        }

        private static void ConfigureSpriteSheet(string sheetAssetPath, SpriteAssetManifest manifest)
        {
            AssetDatabase.ImportAsset(sheetAssetPath, ImportAssetOptions.ForceSynchronousImport);
            var importer = AssetImporter.GetAtPath(sheetAssetPath) as TextureImporter;
            if (importer == null)
                throw new InvalidDataException($"Sprite sheet is not a texture asset: {sheetAssetPath}");
            importer.textureType = TextureImporterType.Sprite;
            importer.spriteImportMode = SpriteImportMode.Multiple;
            importer.filterMode = FilterMode.Point;
            importer.textureCompression = TextureImporterCompression.Uncompressed;
            importer.mipmapEnabled = false;
            importer.alphaIsTransparency = true;
            importer.isReadable = false;
            importer.spritePixelsPerUnit = manifest.PixelsPerUnit;
            var textureSettings = new TextureImporterSettings();
            importer.ReadTextureSettings(textureSettings);
            textureSettings.spriteMeshType = SpriteMeshType.FullRect;
            importer.SetTextureSettings(textureSettings);
            importer.SaveAndReimport();

            var texture = AssetDatabase.LoadAssetAtPath<Texture2D>(sheetAssetPath);
            if (texture == null || texture.width != manifest.Sheet.Width || texture.height != manifest.Sheet.Height)
                throw new InvalidDataException(
                    $"Sprite sheet dimensions do not match the manifest: expected {manifest.Sheet.Width}x{manifest.Sheet.Height}"
                );

            importer = AssetImporter.GetAtPath(sheetAssetPath) as TextureImporter;
            if (importer == null)
                throw new InvalidDataException($"Sprite sheet importer was lost after reimport: {sheetAssetPath}");
            var providerFactories = new SpriteDataProviderFactories();
            providerFactories.Init();
            var dataProvider = providerFactories.GetSpriteEditorDataProviderFromObject(importer);
            if (dataProvider == null)
                throw new InvalidDataException($"Sprite Editor data provider is unavailable: {sheetAssetPath}");
            dataProvider.InitSpriteEditorDataProvider();
            var existingSpriteIds = dataProvider
                .GetSpriteRects()
                .Where(rect => !string.IsNullOrWhiteSpace(rect.name))
                .GroupBy(rect => rect.name, StringComparer.Ordinal)
                .ToDictionary(group => group.Key, group => group.First().spriteID, StringComparer.Ordinal);
            var spriteRects = manifest
                .Frames.Select(frame => new SpriteRect
                {
                    name = frame.FrameId,
                    rect = new Rect(
                        frame.Rect.X,
                        manifest.Sheet.Height - frame.Rect.Y - frame.Rect.Height,
                        frame.Rect.Width,
                        frame.Rect.Height
                    ),
                    alignment = SpriteAlignment.Custom,
                    pivot = new Vector2(frame.Pivot.X, frame.Pivot.Y),
                    border = Vector4.zero,
                    spriteID = existingSpriteIds.TryGetValue(frame.FrameId, out var spriteId)
                        ? spriteId
                        : GUID.Generate(),
                })
                .ToArray();
            dataProvider.SetSpriteRects(spriteRects);
            var nameFileIdProvider = dataProvider.GetDataProvider<ISpriteNameFileIdDataProvider>();
            if (nameFileIdProvider == null)
                throw new InvalidDataException($"Sprite name/file ID provider is unavailable: {sheetAssetPath}");
            nameFileIdProvider.SetNameFileIdPairs(
                spriteRects.Select(rect => new SpriteNameFileIdPair(rect.name, rect.spriteID))
            );
            dataProvider.Apply();
            importer.SaveAndReimport();
        }

        private static Dictionary<string, AnimationClip> CreateAnimationClips(
            string animationDirectory,
            SpriteAssetManifest manifest,
            IReadOnlyDictionary<string, Sprite> sprites
        )
        {
            var clips = new Dictionary<string, AnimationClip>(StringComparer.Ordinal);
            foreach (var motion in manifest.Motions)
            {
                var clipPath = $"{animationDirectory}/{motion.MotionId}.anim";
                var clip = AssetDatabase.LoadAssetAtPath<AnimationClip>(clipPath);
                if (clip == null)
                {
                    clip = new AnimationClip { name = motion.MotionId };
                    AssetDatabase.CreateAsset(clip, clipPath);
                }
                clip.frameRate = motion.Fps;
                clip.ClearCurves();
                var binding = new EditorCurveBinding
                {
                    type = typeof(SpriteRenderer),
                    path = "",
                    propertyName = "m_Sprite",
                };
                var keyframes = motion
                    .FrameIds.Select(
                        (frameId, index) =>
                        {
                            if (!sprites.TryGetValue(frameId, out var sprite))
                                throw new InvalidDataException($"Imported sprite is missing: {frameId}");
                            return new ObjectReferenceKeyframe { time = index / motion.Fps, value = sprite };
                        }
                    )
                    .ToArray();
                AnimationUtility.SetObjectReferenceCurve(clip, binding, keyframes);
                SetLoopTime(clip, motion.Loop);
                EditorUtility.SetDirty(clip);
                clips[motion.MotionId] = clip;
            }
            return clips;
        }

        private static AnimatorController CreateAnimatorController(
            string controllerPath,
            SpriteAssetManifest manifest,
            IReadOnlyDictionary<string, AnimationClip> clips
        )
        {
            var controller = AssetDatabase.LoadAssetAtPath<AnimatorController>(controllerPath);
            if (controller == null)
                controller = AnimatorController.CreateAnimatorControllerAtPath(controllerPath);
            var stateMachine = controller.layers[0].stateMachine;
            foreach (var state in stateMachine.states.ToArray())
                stateMachine.RemoveState(state.state);

            var states = new Dictionary<string, AnimatorState>(StringComparer.Ordinal);
            foreach (var motion in manifest.Motions)
            {
                var state = stateMachine.AddState(motion.MotionId);
                state.motion = clips[motion.MotionId];
                states[motion.MotionId] = state;
            }
            foreach (var fallback in manifest.Fallbacks.OrderBy(entry => entry.Key, StringComparer.Ordinal))
            {
                var state = stateMachine.AddState(fallback.Key);
                state.motion = clips[fallback.Value];
                states[fallback.Key] = state;
            }
            stateMachine.defaultState = states.TryGetValue("idle", out var idleState) ? idleState : states.Values.First();
            EditorUtility.SetDirty(controller);
            return controller;
        }

        private static void CreatePresentationPrefab(
            string prefabPath,
            string unitId,
            RuntimeAnimatorController controller,
            AnimationClip idleClip
        )
        {
            var existing = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);
            var root = existing == null ? new GameObject(unitId) : PrefabUtility.LoadPrefabContents(prefabPath);
            try
            {
                root.name = unitId;
                var renderer = root.GetComponent<SpriteRenderer>() ?? root.AddComponent<SpriteRenderer>();
                var animator = root.GetComponent<Animator>() ?? root.AddComponent<Animator>();
                var presenter = root.GetComponent<GeneratedUnitPresenter>() ?? root.AddComponent<GeneratedUnitPresenter>();
                presenter.SetUnitId(unitId);
                animator.runtimeAnimatorController = controller;
                renderer.sprite = FirstSprite(idleClip);
                PrefabUtility.SaveAsPrefabAsset(root, prefabPath);
            }
            finally
            {
                if (existing == null)
                    UnityEngine.Object.DestroyImmediate(root);
                else
                    PrefabUtility.UnloadPrefabContents(root);
            }
        }

        private static Sprite FirstSprite(AnimationClip clip)
        {
            if (clip == null)
                return null;
            var binding = AnimationUtility.GetObjectReferenceCurveBindings(clip).FirstOrDefault();
            return AnimationUtility.GetObjectReferenceCurve(clip, binding)?.FirstOrDefault().value as Sprite;
        }

        private static void SetLoopTime(AnimationClip clip, bool loop)
        {
            var serialized = new SerializedObject(clip);
            var settings = serialized.FindProperty("m_AnimationClipSettings");
            var loopTime = settings?.FindPropertyRelative("m_LoopTime");
            if (loopTime == null)
                throw new InvalidDataException($"Could not configure loopTime for clip {clip.name}");
            loopTime.boolValue = loop;
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        private static bool IsStableId(string value)
        {
            return !string.IsNullOrWhiteSpace(value)
                && char.IsLower(value[0])
                && value.All(character => char.IsLower(character) || char.IsDigit(character) || character == '-');
        }

        private static bool IsSha256(string value)
        {
            return value != null
                && value.Length == 64
                && value.All(character => (character >= '0' && character <= '9') || (character >= 'a' && character <= 'f'));
        }

        private static void ValidateSheetHash(string sheetAssetPath, string expectedHash)
        {
            var absolutePath = AssetPathToAbsolute(sheetAssetPath);
            if (!File.Exists(absolutePath))
                throw new FileNotFoundException("Approved sprite sheet is missing", sheetAssetPath);
            using var sha256 = SHA256.Create();
            using var stream = File.OpenRead(absolutePath);
            var actual = string.Concat(sha256.ComputeHash(stream).Select(value => value.ToString("x2")));
            if (!string.Equals(actual, expectedHash, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException($"Sprite sheet hash mismatch: expected {expectedHash}, received {actual}");
        }

        private static void EnsureAssetDirectory(string assetPath)
        {
            Directory.CreateDirectory(AssetPathToAbsolute(assetPath));
            AssetDatabase.Refresh();
        }

        private static string AssetPathToAbsolute(string assetPath)
        {
            return Path.GetFullPath(Path.Combine(Application.dataPath, "..", assetPath));
        }
    }

    public sealed class SpriteImportResult
    {
        [JsonProperty("schemaVersion")]
        public int SchemaVersion;

        [JsonProperty("unitId")]
        public string UnitId = "";

        [JsonProperty("contentHash")]
        public string ContentHash = "";

        [JsonProperty("spriteCount")]
        public int SpriteCount;

        [JsonProperty("clipCount")]
        public int ClipCount;

        [JsonProperty("controllerPath")]
        public string ControllerPath = "";

        [JsonProperty("prefabPath")]
        public string PrefabPath = "";
    }
}
