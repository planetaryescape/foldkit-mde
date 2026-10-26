#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.."

rm -rf dist/packages dist/declarations
bunx --no-install tsc -p tsconfig.packages.json

for package in core persistence plugins editor; do
  destination="dist/packages/$package"
  mkdir -p "$destination/dist"
  sources=()
  for source in "packages/$package/src/"*.ts; do
    [[ "$source" == *.test.ts ]] || sources+=("$source")
  done
  bun build "${sources[@]}" --target browser --format esm --packages external --splitting \
    --root "packages/$package/src" --outdir "$destination/dist"
  cp dist/declarations/"$package"/src/*.d.ts "$destination/dist/"
  cp README.md "$destination/README.md"
  if [[ "$package" == editor ]]; then
    cp packages/editor/src/editor.css "$destination/dist/editor.css"
  fi
  jq --slurpfile root package.json '
    del(.private, .scripts, .devDependencies)
    | .license = "UNLICENSED"
    | .files = ["dist", "README.md"]
    | .sideEffects = ["**/*.css"]
    | .exports |= with_entries(
        if (.value | endswith(".ts")) then
          .value |= sub("^./src/"; "./dist/")
          | .value = {types: (.value | sub(".ts$"; ".d.ts")), import: (.value | sub(".ts$"; ".js"))}
        else .value |= sub("^./src/"; "./dist/") end)
    | .peerDependencies = (.dependencies | with_entries(select(.key == "effect" or .key == "foldkit"))
        | with_entries(.value = $root[0].workspaces.catalog[.key]))
    | .dependencies |= with_entries(select(.key != "effect" and .key != "foldkit")
        | if (.value | startswith("workspace:")) then .value = $root[0].version else . end)
  ' "packages/$package/package.json" > "$destination/package.json"
done
