# naosugi-ai-games

ブラウザでそのまま遊べる HTML ゲーム集です。GitHub Pages で公開しています。

- 公開URL: https://naosugi.github.io/naosugi-ai-games/

## 収録ゲーム

| ゲーム | 内容 |
|---|---|
| [INFINITE SHOT 3D](games/infinite-shot-3d/) | 自動前進の3Dシューティング。5分間スコアアタック |

## 構成

```
index.html            ゲーム一覧（games.json を読み込んで表示）
games.json            一覧に載せるゲームの登録情報
games/<id>/index.html 各ゲーム本体（1ファイル完結）
games/<id>/thumb.jpg  一覧用サムネイル（16:9 推奨）
```

## ゲームの追加方法

1. `games/<id>/` フォルダを作り、ゲームを `index.html` として置く
2. 必要ならサムネイル画像（16:9、`thumb.jpg` など）を同じフォルダに置く
3. `games.json` に1件追加する

```json
{
  "id": "my-game",
  "title": "ゲーム名",
  "description": "一覧に表示する説明文",
  "path": "games/my-game/",
  "thumbnail": "games/my-game/thumb.jpg",
  "tags": ["パズル"],
  "controls": "クリック",
  "playtime": "約3分",
  "added": "2026-10-24"
}
```

`thumbnail` `tags` `controls` `playtime` は省略できます。`added` から14日間は一覧に NEW が付き、新しい順に並びます。
ゲーム側から一覧へ戻るリンクは `../../` です。

## ライセンス

このリポジトリのコードは MIT License（[LICENSE](LICENSE)）です。

同梱しているサードパーティ製ソフトウェア:

- **three.js**（MIT License, Copyright © 2010-2026 three.js authors）— `games/infinite-shot-3d/index.html` に埋め込み。ライセンス全文は同ファイル内のスクリプト冒頭に記載しています。
