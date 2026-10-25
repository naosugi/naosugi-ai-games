# naosugi-ai-games

ブラウザでそのまま遊べる HTML ゲーム集です。GitHub Pages で公開しています。

- 公開URL: https://naosugi.github.io/naosugi-ai-games/

## 収録ゲーム

| ゲーム | 内容 |
|---|---|
| [INFINITE SHOT 3D](games/infinite-shot-3d/) | 自動前進の3Dシューティング。5分間スコアアタック |
| [名を持つ十二の兵](games/named-twelve/) | TRPG風軍団戦。会話と選択で戦士を4年かけて育て、12体の軍団で戦う。手がかりをつなぐと真シナリオが開く |
| [NEON CLAW RUSH](games/neon-claw-rush/) | 60秒タイムアタックのクレーンゲーム。連続GETでFEVER突入 |
| [BLUE DASH](games/blue-dash/) | 5段の高架道路を走る横スクロールアクション。日没までに巨大ロボを倒して相棒を救え |
| [子育てサバイバル](games/kosodate-survival/) | 0〜22歳を約5分で育てる家計サバイバル。お世話と仕事を同時にさばき、人生の選択で家計が揺れる。性格・将来分岐・実績つき |
| [独裁者AI国家シミュレーター](games/dictator-ai-simulator/) | 独裁者として25ターンでAI国家を築くカード選択シミュレーション。8つのエンディングと図鑑つき（[dictator-ai-simulator](https://github.com/naosugi/dictator-ai-simulator) の1ファイル移植版） |
| [おうちとひらがな](games/ouchi-hiragana/) | 子ども向けひらがな探し。見つけるたびにおうちが育ち、記録を保存して遊ぶほど豪華に。音声読み上げつき（[moji_learn_mining](https://github.com/naosugi/moji_learn_mining) のスマホ操作改善・1ファイル版） |

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
- `games/blue-dash/index.html` は three.js（r128）を cdnjs から読み込みます（同梱はしていません）。
- **Phaser**（MIT License, Copyright © 2020 Richard Davey, Photon Storm Ltd.）— `games/ouchi-hiragana/index.html` に v3.60.0 を埋め込み。ライセンス全文は同ファイル内のスクリプト冒頭に記載しています。
