#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.."

mkdir -p dist/tarballs
destination="$PWD/dist/tarballs"
for package in core persistence plugins editor; do
  (cd "dist/packages/$package" && bun pm pack --ignore-scripts --destination "$destination")
done
