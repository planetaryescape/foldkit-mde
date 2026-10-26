#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.."
root="$PWD"
consumer="$(mktemp -d /tmp/foldkit-mde-consumer.XXXXXX)"
trap 'rm -rf "$consumer"' EXIT
cp packages/tooling/consumer/* "$consumer/"

effect="$(jq -r '.workspaces.catalog.effect' package.json)"
foldkit="$(jq -r '.workspaces.catalog.foldkit' package.json)"
version="$(jq -r '.version' package.json)"
jq --arg root "$root" --arg version "$version" --arg effect "$effect" --arg foldkit "$foldkit" '
  .dependencies = ({effect: $effect, foldkit: $foldkit} +
    (["core", "persistence", "plugins", "editor"] | map({
      key: ("@foldkit-mde/" + .),
      value: ("file:" + $root + "/dist/tarballs/foldkit-mde-" + . + "-" + $version + ".tgz")
    }) | from_entries))
  | .overrides = (.dependencies | with_entries(select(.key | startswith("@foldkit-mde/"))))
' packages/tooling/consumer/package.json > "$consumer/package.json"
(
  cd "$consumer"
  bun install --ignore-scripts
  "$root/node_modules/.bin/tsc" -p tsconfig.json
  node --experimental-strip-types check.ts
  bun build index.html --outdir dist --target browser
)
printf '\nPassed: isolated tarball installation, declarations, Node ESM imports, formatting/undo, persistence and browser build\n'
