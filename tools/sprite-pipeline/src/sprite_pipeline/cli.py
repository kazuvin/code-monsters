import argparse
import json
import sys
from pathlib import Path

from .models import load_request
from .pipeline import process_request


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="sprite-pipeline")
    subparsers = parser.add_subparsers(dest="command", required=True)
    process_parser = subparsers.add_parser("process", help="Normalize frames and create a sprite sheet")
    process_parser.add_argument("--request", required=True, type=Path)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command != "process":
        raise ValueError(f"Unsupported command: {args.command}")

    try:
        request = load_request(args.request)
        result = process_request(request)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result["summary"]["errors"] == 0 else 2
    except Exception as error:  # CLI boundary reports the complete failure without hiding it.
        print(json.dumps({"error": type(error).__name__, "message": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1
