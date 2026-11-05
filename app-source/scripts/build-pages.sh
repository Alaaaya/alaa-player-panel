#!/bin/sh
set -eu
npx vite build
mkdir -p dist/admin
sed 's|\./assets/|../assets/|g' dist/index.html >dist/admin/index.html
sed 's|\./assets/|/alaa-player-panel/assets/|g' dist/index.html >dist/404.html
touch dist/.nojekyll
