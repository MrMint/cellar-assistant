#!/usr/bin/env python3
"""Wait for the instrument's `boot` record and print the host's pid.

    SAMPLES=<host-samples.jsonl> RUNTIME=<bun|node> boot-record.py

Exits non-zero if the record never appears (the instrument did not load, so the
run file did not take) or if it names a runtime other than the one asked for.
Everything but the pid goes to stdout as human lines and the pid is the LAST
line, so the caller can `tee` the identity into its report directory and still
read the pid off the tail.

This exists because `pgrep -f src/index.ts` is machine-wide: every worktree's
host-run stack matches it, the command line is relative so it carries no app
directory to filter on, and sampling another stack's process would produce a
perfectly plausible, entirely wrong answer.
"""

import json
import os
import sys
import time

path = os.environ["SAMPLES"]
want = os.environ["RUNTIME"]
deadline = time.time() + 90

while time.time() < deadline:
    try:
        with open(path) as handle:
            for line in handle:
                try:
                    record = json.loads(line)
                except ValueError:
                    continue
                if record.get("kind") != "boot":
                    continue
                got = record.get("runtime")
                if got != want:
                    sys.exit(f"host booted under {got!r}, expected {want!r}")
                print(f"runtime  {got} {record.get('version')}")
                print(f"execPath {record.get('execPath')}")
                print(f"argv     {record.get('argv')}")
                print(f"loopHist {record.get('loopHistAvailable')}")
                print(f"nativeModulesAtBoot {record.get('nativeModulesAtBoot')}")
                print(record["pid"])
                sys.exit(0)
    except FileNotFoundError:
        pass
    time.sleep(1)

sys.exit(f"no boot record in {path}: the instrument never loaded")
