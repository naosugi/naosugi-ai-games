#!/bin/sh
# 試作版 ROBOT DEFENSE を1ファイル（../index.html）にまとめる
#   head.html  … HTML と CSS
#   three-entry.js … 使う three.js の部品だけを書き出す入口（three r186 を esbuild でまとめる）
#   sim.js     … ゲームロジック（描画なし。../sim-*.js からも読み込む）
#   view.js    … 描画と UI
# 必要なもの：node（npm で three@0.186.0 と esbuild を入れる）
set -e
D=$(cd "$(dirname "$0")" && pwd)
W=$(mktemp -d)
cp "$D/three-entry.js" "$W/entry.js"
( cd "$W" && npm init -y >/dev/null && npm i three@0.186.0 esbuild >/dev/null 2>&1 && npx esbuild entry.js --bundle --minify --format=iife --legal-comments=none --outfile=out.js >/dev/null 2>&1 )
{
  cat "$D/head.html"
  echo '<script>'
  printf '/*!\n * three.js r186 (https://threejs.org/), used under the MIT License:\n * Copyright © 2010-2026 three.js authors\n */\n'
  cat "$W/out.js"
  echo '</script>'
  echo '<script>'
  cat "$D/sim.js" "$D/view.js"
  echo '</script>'
  echo '</body>'
  echo '</html>'
} > "$D/../index.html"
rm -rf "$W"
echo "built $D/../index.html"
