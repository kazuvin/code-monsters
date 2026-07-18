import html
import json
from pathlib import Path
from typing import Any


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def write_html_report(path: Path, report: dict[str, Any], sheet_relative_path: str) -> None:
    rows = "\n".join(
        "<tr>"
        f"<td>{html.escape(issue['severity'])}</td>"
        f"<td><code>{html.escape(issue['code'])}</code></td>"
        f"<td>{html.escape(issue.get('motionId') or '-')}</td>"
        f"<td>{html.escape(str(issue.get('frameIndex') if issue.get('frameIndex') is not None else '-'))}</td>"
        f"<td>{html.escape(issue['message'])}</td>"
        f"<td>{html.escape(issue['suggestedAction'])}</td>"
        "</tr>"
        for issue in report["issues"]
    )
    if not rows:
        rows = '<tr><td colspan="6">No quality issues.</td></tr>'
    document = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sprite QA {html.escape(report['runId'])}</title>
  <style>
    body {{ background: #11151b; color: #eef4fb; font: 14px system-ui; margin: 24px; }}
    img {{ background: repeating-conic-gradient(#28303a 0 25%, #182029 0 50%) 0 / 16px 16px; image-rendering: pixelated; max-width: 100%; }}
    table {{ border-collapse: collapse; width: 100%; }}
    th, td {{ border: 1px solid #3b4654; padding: 8px; text-align: left; vertical-align: top; }}
    code {{ color: #39d9ff; }}
  </style>
</head>
<body>
  <h1>{html.escape(report['unitId'])} / {html.escape(report['runId'])}</h1>
  <p>Errors: {report['summary']['errors']} / Warnings: {report['summary']['warnings']} / Info: {report['summary']['infos']}</p>
  <img src="{html.escape(sheet_relative_path)}" alt="Processed sprite sheet">
  <h2>Issues</h2>
  <table><thead><tr><th>Severity</th><th>Code</th><th>Motion</th><th>Frame</th><th>Message</th><th>Action</th></tr></thead><tbody>{rows}</tbody></table>
</body>
</html>
"""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(document, encoding="utf-8")
