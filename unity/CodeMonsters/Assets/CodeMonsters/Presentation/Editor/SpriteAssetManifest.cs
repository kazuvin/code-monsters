using System.Collections.Generic;
using Newtonsoft.Json;

namespace CodeMonsters.Presentation.Editor
{
    public sealed class SpriteAssetManifest
    {
        [JsonProperty("schemaVersion")]
        public int SchemaVersion;

        [JsonProperty("pipelineVersion")]
        public int PipelineVersion;

        [JsonProperty("unitId")]
        public string UnitId = "";

        [JsonProperty("sourceRunId")]
        public string SourceRunId = "";

        [JsonProperty("sourceGameSchemaVersion")]
        public int SourceGameSchemaVersion;

        [JsonProperty("coordinateSystem")]
        public string CoordinateSystem = "";

        [JsonProperty("sheet")]
        public SpriteSheetDefinition Sheet = new SpriteSheetDefinition();

        [JsonProperty("pixelsPerUnit")]
        public float PixelsPerUnit;

        [JsonProperty("motions")]
        public List<SpriteMotionDefinition> Motions = new List<SpriteMotionDefinition>();

        [JsonProperty("frames")]
        public List<SpriteFrameDefinition> Frames = new List<SpriteFrameDefinition>();

        [JsonProperty("fallbacks")]
        public Dictionary<string, string> Fallbacks = new Dictionary<string, string>();

        [JsonProperty("qaSummary")]
        public QualitySummary Quality = new QualitySummary();

        [JsonProperty("approvedAt")]
        public string ApprovedAt = "";

        [JsonProperty("approvedBy")]
        public string ApprovedBy = "";

        [JsonProperty("contentHash")]
        public string ContentHash = "";
    }

    public sealed class SpriteSheetDefinition
    {
        [JsonProperty("fileName")]
        public string FileName = "";

        [JsonProperty("width")]
        public int Width;

        [JsonProperty("height")]
        public int Height;

        [JsonProperty("sha256")]
        public string Sha256 = "";
    }

    public sealed class SpriteMotionDefinition
    {
        [JsonProperty("motionId")]
        public string MotionId = "";

        [JsonProperty("fps")]
        public float Fps;

        [JsonProperty("loop")]
        public bool Loop;

        [JsonProperty("frameIds")]
        public List<string> FrameIds = new List<string>();
    }

    public sealed class SpriteFrameDefinition
    {
        [JsonProperty("frameId")]
        public string FrameId = "";

        [JsonProperty("motionId")]
        public string MotionId = "";

        [JsonProperty("frameIndex")]
        public int FrameIndex;

        [JsonProperty("rect")]
        public SpriteRectDefinition Rect = new SpriteRectDefinition();

        [JsonProperty("pivot")]
        public SpritePivotDefinition Pivot = new SpritePivotDefinition();
    }

    public sealed class SpriteRectDefinition
    {
        [JsonProperty("x")]
        public int X;

        [JsonProperty("y")]
        public int Y;

        [JsonProperty("width")]
        public int Width;

        [JsonProperty("height")]
        public int Height;
    }

    public sealed class SpritePivotDefinition
    {
        [JsonProperty("x")]
        public float X;

        [JsonProperty("y")]
        public float Y;
    }

    public sealed class QualitySummary
    {
        [JsonProperty("errors")]
        public int Errors;

        [JsonProperty("warnings")]
        public int Warnings;

        [JsonProperty("infos")]
        public int Infos;
    }
}
