#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

install_dir=$(mktemp -d)
trap 'rm -rf "$install_dir"' EXIT

# Deploy prunes the shared lockfile to Docs. A filtered install also selects the workspace root.
corepack pnpm --filter docs --config.inject-workspace-packages=true deploy "$install_dir"

rm -rf node_modules
mv "$install_dir/node_modules" node_modules
