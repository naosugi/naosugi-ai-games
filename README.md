# 作ってみたゲームの発表会（仮）

個人開発のHTMLゲーム置き場です。キャッチコピーは「令和の技術で令和の発想を平成初期風ゲームに」。GitHub Pages で公開しています。

- 公開URL: https://naosugi.github.io/naosugi-ai-games/

## 収録ゲーム（サンプル）

| ゲーム | 内容 |
|---|---|
| [INFINITE SHOT 3D](games/infinite-shot-3d/) | 自動前進の3Dシューティング。5分間スコアアタック |
| [INFINITE SHOT 3D II](games/infinite-shot-3d-2/) | INFINITE SHOT 3D の続編。分岐ルートで拾ったコアで武器が進化する、5分間の3Dシューティング |
| [名を持つ十二の兵](games/named-twelve/) | TRPG風軍団戦。会話と選択で戦士を4年かけて育て、12体の軍団で戦う。手がかりをつなぐと真シナリオが開く |
| [NEON CLAW RUSH](games/neon-claw-rush/) | 60秒タイムアタックのクレーンゲーム。連続GETでFEVER突入 |
| [BLUE DASH](games/blue-dash/) | 5段の高架道路を走る横スクロールアクション。日没までに巨大ロボを倒して相棒を救え |
| [子育てサバイバル](games/kosodate-survival/) | 0〜22歳を約5分で育てる家計サバイバル。お世話と仕事を同時にさばき、人生の選択で家計が揺れる。性格・将来分岐・実績つき |
| [独裁者AI国家シミュレーター](games/dictator-ai-simulator/) | 独裁者として25ターンでAI国家を築くカード選択シミュレーション。8つのエンディングと図鑑つき（[dictator-ai-simulator](https://github.com/naosugi/dictator-ai-simulator) の1ファイル移植版） |
| [おうちとひらがな](games/ouchi-hiragana/) | 子ども向けひらがな探し。見つけるたびにおうちが育ち、記録を保存して遊ぶほど豪華に。音声読み上げつき（[moji_learn_mining](https://github.com/naosugi/moji_learn_mining) のスマホ操作改善・1ファイル版） |
| [キーボード☆ドライバー](games/keyboard-driver/) | こども向け日本語入力れんしゅう。文字を打ってロケットで荷物をとどけ、強化すると漢字変換・記号・全角半角などの問題が解放される |
| [アーッ！とゴルフ](games/aatto-golf/) | 心のスタミナを削り合うゴルフ。風や芝を読んで球を操り、相手の様子から心を読む。CPU戦・マッチプレーつき |
| [ROBOT DEFENSE](games/robot-defense/) | 前線基地を守るタワーディフェンス。ロボットを組んで配置し、乗って戦う。全5章・21作戦、進化パーツと高難度つき |
| [独裁者AI国家シミュレーターⅡ AIセーフティ編](games/dictator-ai-monitor/) | 監視カードと報告AIを選び、AIに任せた国を監督する死に覚えゲーム。真相は最後に分かる。 |

## 構成

```
index.html                    トップ（collections.json を読み込み、サンプル・イベントの入口を表示）
collections.json              トップに出す一覧ページの登録（hidden: true でトップに出さない）
assets/site.css               共通の見た目
assets/collection.js          一覧ページ・印刷用QRシートの表示処理（同じフォルダの games.json を読む）
tools/build.py                各一覧ページの index.html / print.html とQRコード画像を書き出す

samples/                      サンプルゲームの一覧（中の人が作った見本）
  games.json                  一覧情報とゲームの登録
  index.html, print.html      tools/build.py が書き出す（直接編集しない）
  qr/                         QRコード画像（_page.png は一覧ページ、<id>.png は各ゲーム）
games/<id>/index.html         サンプルゲーム本体（1ファイル完結）。URLを変えないため場所はそのまま

events/<番号>/         イベントで作られたゲームの一覧（samples/ と同じ作り）
  games/<id>/index.html       イベントのゲーム本体
```

## ゲームの追加方法

説明文の長さ・タグ・公開までの確認などの指針は [CLAUDE.md](CLAUDE.md) にまとめています。

1. ゲームを置く（サンプルは `games/<id>/`、イベントは `events/<イベント>/games/<id>/`）
2. 必要ならサムネイル画像（16:9、`thumb.jpg`）を同じフォルダに置く
3. その一覧の `games.json` の `games` に1件追加する。`path` と `thumbnail` は `games.json` のあるフォルダから見た位置で書く
4. `python3 tools/build.py` を実行してQRコードを作る（初回は `pip install segno`）

```json
{
  "id": "my-game",
  "title": "ゲーム名",
  "author": "@naoya_oosugi",
  "description": "一覧に表示する説明文",
  "path": "games/my-game/",
  "thumbnail": "games/my-game/thumb.jpg",
  "tags": ["パズル"],
  "controls": "クリック",
  "playtime": "約3分",
  "added": "2026-10-24"
}
```

`author` は一覧のカードに「制作者: 」として出ます。イベントのゲームでは参加者のニックネームを書きます。
`thumbnail` `tags` `controls` `playtime` は省略できます。`added` から14日間は一覧に NEW が付きます。サンプルは新しい順、イベントは `games.json` に書いた順に並びます。

ゲーム側から一覧へ戻るリンク: サンプルは `../../samples/`、イベントのゲームは `../../`（そのイベントの一覧）。

## イベントページの追加

1. `events/<番号>/games.json` を作る（`title` `kind: "event"` `date` `place` `lead` `games: []`。講座の案内を載せるときは `about` に見出し `h`・段落 `p`・箇条書き `ul` の配列を書く。`**太字**` と `[文字](URL)` が使える）
2. `collections.json` に1件追加する。公開前は `"hidden": true` にしておく
3. `python3 tools/build.py` を実行する

各一覧ページの右上のQRを押すと、印刷用シート（A4、ゲームごとのQRを切り分けられる形）が開きます。QR画像は `qr/` にPNGで入っています。

## ライセンス

QRコードの生成には [segno](https://github.com/heuer/segno)（BSD 3-Clause）を使っています（ビルド時のみ。サイトには含めていません）。

このリポジトリのコードは MIT License（[LICENSE](LICENSE)）です。

同梱しているサードパーティ製ソフトウェア:

- **three.js**（MIT License, Copyright © 2010-2026 three.js authors）— `games/infinite-shot-3d/index.html`・`games/infinite-shot-3d-2/index.html`・`games/robot-defense/index.html` に埋め込み（いずれも r186。robot-defense は使う部品だけをまとめた版）。ライセンス全文は各ファイル内のスクリプト冒頭に記載しています。
- **three.js**（MIT License, Copyright © 2010-2021 Three.js Authors）— `games/blue-dash/index.html` に r128 を埋め込み（ダウンロードしてオフラインでも遊べるようにするため）。
- **Phaser**（MIT License, Copyright © 2020 Richard Davey, Photon Storm Ltd.）— `games/ouchi-hiragana/index.html` に v3.60.0 を埋め込み。ライセンス全文は同ファイル内のスクリプト冒頭に記載しています。
