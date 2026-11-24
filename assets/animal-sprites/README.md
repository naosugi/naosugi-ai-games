# 動物ドット絵（24×24）

ウォンバット☆シリーズで使う動物のドット絵です。62体。どれも **右向き・全身**、地面の高さをそろえてあります。輪郭線は自動で付けています。

最初の利用先は [ウォンバット☆どうぶつ陣取り](../../games/wombat-jintori/) です。

## ファイル

| ファイル | 中身 |
|---|---|
| `animals.js` | データ込みのブラウザ用の部品。このファイルだけで描ける |
| `animals.json` | データだけ（`pal`＝色の一覧、`rows`＝24文字×24行。1文字が色の番号、`.` は透明） |
| `png/<id>.png` | 1体ずつの画像（24×24） |
| `png@4x/<id>.png` | 1体ずつの画像（96×96、4倍） |
| `sheet.png` / `sheet@4x.png` | 全員を8列で並べた画像。並び順と位置は `animals.json` の `sheet.index` |
| `src/` | 作り直し用。`animals_src.py` が図形の定義、`build.py` が書き出し |

## 使い方（ブラウザ）

```html
<script src="../../assets/animal-sprites/animals.js"></script>
<script>
  const c = animalCanvas('koala', 4);        // 4倍の canvas
  document.body.appendChild(c);
  img.src = animalDataURL('lion', 2, true);  // 2倍・左向き
  drawAnimal(ctx, 'fugu', 10, 10, 3);        // 既存の canvas に描く
</script>
```

表示するときは CSS に `image-rendering: pixelated;` を付けると、ぼやけずにくっきり見えます。

ゲームを1ファイルで完結させたい場合（一覧からダウンロードしてネットなしで遊べるようにする場合）は、`animals.js` の中身をそのまま `<script>` に貼り付けて使います。

## 描き直し・追加

1. `src/animals_src.py` で、その動物の関数を書きかえる（`ell`＝楕円、`circ`＝円、`rect`＝四角、`poly`＝多角形、`line`/`path`＝線、`blob`＝太い体、`px`＝1ドット）
2. `cd src && python3 build.py .. meta.json`（Pillow が必要）
3. 新しい動物を足すときは、`meta.json` に名前も足す

## 一覧

| id | 名前 |
|---|---|
| `ant` | アリ |
| `archer` | テッポウウオ |
| `bee` | ハチ |
| `crab` | カニ |
| `frog` | カエル |
| `fugu` | フグ |
| `gila` | ドクトカゲ |
| `ladybug` | テントウムシ |
| `leech` | ヒル |
| `locust` | イナゴ |
| `mouse` | ネズミ |
| `pillbug` | ダンゴムシ |
| `sparrow` | スズメ |
| `spider` | クモ |
| `worm` | ミミズ |
| `beaver` | ビーバー |
| `chameleon` | カメレオン |
| `crow` | カラス |
| `dhole` | リカオン |
| `fox` | キツネ |
| `goat` | ヤギ |
| `monkey` | サル |
| `moray` | ウツボ |
| `owl` | フクロウ |
| `penguin` | ペンギン |
| `rabbit` | ウサギ |
| `raccoon` | アライグマ |
| `skunk` | スカンク |
| `sloth` | ナマケモノ |
| `snake` | ヘビ |
| `armadillo` | アルマジロ |
| `boar` | イノシシ |
| `capybara` | カピバラ |
| `cobra` | コブラ |
| `deer` | シカ |
| `eagle` | ワシ |
| `falcon` | ハヤブサ |
| `hyena` | ハイエナ |
| `kangaroo` | カンガルー |
| `octopus` | タコ |
| `ostrich` | ダチョウ |
| `otter` | カワウソ |
| `porcupine` | ヤマアラシ |
| `ratel` | ラーテル |
| `wolf` | オオカミ |
| `anaconda` | アナコンダ |
| `bear` | クマ |
| `bison` | バイソン |
| `giraffe` | キリン |
| `gorilla` | ゴリラ |
| `hippo` | カバ |
| `komodo` | コモドオオトカゲ |
| `moose` | ヘラジカ |
| `rhino` | サイ |
| `turtle` | カメ |
| `croc` | ワニ |
| `elephant` | ゾウ |
| `lion` | ライオン |
| `orca` | シャチ |
| `tiger` | トラ |
| `koala` | コアラ |
| `echidna` | ハリモグラ |
