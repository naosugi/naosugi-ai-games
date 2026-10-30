#!/bin/sh
# 1ファイルにまとめる：head.html + three.js + ロジック + 描画
D=$(dirname "$0"); OUT=/home/claude/naosugi-ai-games/games/robot-defense-proto/index.html
mkdir -p "$(dirname "$OUT")"
{ cat "$D/head.html"; echo '<script>'; cat "$D/../three.js"; echo '</script>'; echo '<script>'; cat "$D/sim.js" "$D/view.js"; echo '</script>'; echo '</body>'; echo '</html>'; } > "$OUT"
echo "$OUT $(wc -c < "$OUT") bytes"
