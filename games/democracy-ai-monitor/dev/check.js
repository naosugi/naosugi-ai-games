#!/usr/bin/env node
/* 事件の中身の点検。使い方: node dev/check.js
   index.html の <script id="core"> を読み、検索と結末の分岐を確かめる。 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const code = html.match(/<script id="core">([\s\S]*?)<\/script>/)[1];
const ctx = {module: {exports: {}}, Math, Object, JSON, String};
vm.createContext(ctx); vm.runInContext(code, ctx);
const C = ctx.module.exports;
let ng = 0;
const ok = (c, m) => { if (!c) { ng++; console.log('NG', m); } };

// 日付順に並んでいるか
for (let i = 1; i < C.LOGS.length; i++) ok(C.LOGS[i - 1].d <= C.LOGS[i].d, '記録の日付順 ' + C.LOGS[i].d);
// 手がかりの記録が、素直な言葉で見つかるか
const find = (q, d) => C.search(q).hits.some(h => h.d === d);
ok(find('アサイ', '10/14'), '「アサイ」で10/14の変化が見える');
ok(find('辞退', '10/18'), '「辞退」で10/18の出典が見える');
ok(find('どこ', '10/18'), '「どこ」で10/18が見える');
ok(find('北方', '10/18'), '「北方」で10/18が見える');
ok(find('ボランティア', '10/23'), '「ボランティア」で10/23が見える');
ok(find('第7区', '10/06'), '「第7区」で10/06が見える');
ok(find('あさい', '09/22'), 'ひらがなでも見つかる');
ok(C.search('アサイ').total > C.LIMIT, '「アサイ」だけでは全部は出ない（絞り込みが要る）');
for (const q of ['アサイ', '辞退', 'どこ', '北方', '情報', '新党', '第3区']) console.log(`「${q}」 ${C.search(q).total}件`);

// すべての結末に届くか
const reach = {};
const acts = C.ACTIONS.map(a => a.id);
for (let mask = 0; mask < 1 << acts.length; mask++) {
  for (const v of C.VERDICTS) {
    const s = C.newGame();
    s.queries = []; s.seen = [];
    acts.forEach((id, i) => { if (mask & 1 << i) C.act(s, id); });
    const r = C.judge(s, {cause: 'fake', who: 'enemy'}, v.id);
    reach[r.key] = (reach[r.key] || 0) + 1;
  }
}
for (const k of Object.keys(C.ENDINGS)) ok(reach[k], '結末に届く: ' + k);
console.log('結末ごとの組み合わせ数', JSON.stringify(reach));
console.log(ng ? `NG ${ng}件` : 'すべてOK');
