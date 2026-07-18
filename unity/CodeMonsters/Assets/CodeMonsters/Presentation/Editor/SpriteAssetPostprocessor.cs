using System;
using System.Collections.Generic;
using UnityEditor;

namespace CodeMonsters.Presentation.Editor
{
    public sealed class SpriteAssetPostprocessor : AssetPostprocessor
    {
        private static readonly HashSet<string> ScheduledManifests = new HashSet<string>(StringComparer.Ordinal);

        private static void OnPostprocessAllAssets(
            string[] importedAssets,
            string[] deletedAssets,
            string[] movedAssets,
            string[] movedFromAssetPaths
        )
        {
            foreach (var path in importedAssets)
            {
                if (
                    !path.StartsWith(SpriteAssetImporter.GeneratedRoot + "/", StringComparison.Ordinal)
                    || !path.EndsWith("/manifest.json", StringComparison.Ordinal)
                    || !ScheduledManifests.Add(path)
                )
                    continue;
                EditorApplication.delayCall += () =>
                {
                    try
                    {
                        SpriteAssetImporter.ImportManifest(path);
                    }
                    catch (Exception error)
                    {
                        UnityEngine.Debug.LogError($"Failed to import approved sprite manifest {path}: {error}");
                    }
                    finally
                    {
                        ScheduledManifests.Remove(path);
                    }
                };
            }
        }
    }
}
