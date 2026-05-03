# Compass

**自己探求のための診断ツール**

ストレングスファインダー（CliftonStrengths）に着想を得た34資質ランキング ＋ 4脳分類（16タイプ）の統合プロフィール診断。

🌐 **公開URL**: <https://strengths.stunpiece.com>

## 概要

| 項目 | 内容 |
|---|---|
| 質問形式 | A/Bペア比較（ipsative）＋ Likert |
| 質問数 | 全パート: 196問 / SFのみ: 150ペア / 4脳のみ: 46問 |
| 所要時間 | 全パート: 30〜35分 / SFのみ: 25分 / 4脳のみ: 8分 |
| 出力 | 34資質ランキング・SFアーキタイプ・4脳プロフィール（16タイプ）・統合アーキタイプ・クロス分析 |
| 制限 | 各問40秒タイマー、戻り操作なし（直感重視） |
| 保存 | localStorage（途中保存・続きから可） |
| 書き出し | JSON / CSV / PDF（印刷ダイアログ） |

## 使い方（受験者向け）

1. <https://strengths.stunpiece.com> を開く
2. 受けたいパートを選択（**すべて受ける** / ストレングスのみ / 4脳のみ）
3. 名前と所属（任意）を入力して **「診断を開始する」**
4. A/B のどちらが当てはまるかを5段階で選択（40秒で次の問題へ自動移動）
5. 完了後、結果画面で **34資質ランキング**・**4脳プロフィール**・**統合アーキタイプ**・**クロス分析**を確認
6. 必要なら **「JSON書き出し」** や **「PDFダウンロード」** で結果を保存

## 結果画面の構成

| セクション | 内容 |
|---|---|
| **Hero** | 名前・SFアーキタイプ |
| **01 — Strength Map** | 34資質マトリクス + DNAストリップ + 支配領域バンド |
| **02 — Top 5 Strengths** | 最も強い5資質の編集レイアウト |
| **03 — All 34 Themes** | 全資質ランキング（クリックで詳細展開） |
| **04 — 4脳プロフィール** | 16タイプ判定 + 4脳バー + 内外/陰陽軸 |
| **05 — Cross Analysis** | 統合アーキタイプ + シナジー / ギャップ / ベストフィット / ブラインドスポット |

## 管理者モード（キャリブレーション機能）

URLに `?admin=true` を付与すると、Calibrationセクション（Gallup公式結果との比較UI）が表示されます。
通常のユーザーには表示されません。

```
https://strengths.stunpiece.com/?admin=true
```

このセクションでは:
- ① Gallup公式の結果を入力 → JSON書き出し
- ② 自作ツール結果と Gallup結果を比較 → 平均ズレ・Top10一致・ズレが大きい資質トップ5を表示

## キャリブレーション運用（管理者向け）

### データ収集
1. 特定の社員/関係者に「自作ツールのJSONと、Gallup公式の結果スクショ」を個別依頼
2. 受け取ったファイルを開発リポジトリの `analysis/strengths-calibration/results/` に保存:
   ```
   {名前}_self_v{N}_{YYYYMMDD}.json
   {名前}_gallup_{YYYYMMDD}.json
   ```
3. Gallup結果はスクショから手動で34資質を順位順に転記。`?admin=true` でアクセスし「Gallup結果を入力」UIでJSONに変換可能

### 集計

```bash
node scripts/calibrate.mjs
```

これで以下が生成されます:

- `comparison/per-user/{名前}.json` — 個人別比較レポート
- `comparison/aggregate.json` — 全ユーザー横断集計（資質ごとのズレ・ワースト3）
- `comparison/theme-drift.csv` — Excel等で開ける表形式

### 改善ループ

`aggregate.json` の `weakestThemes` を確認 → 該当資質の質問を `index.html` 内の `QUESTIONS` 配列で書き直し → push → GitHub Pages が自動的に再デプロイ。

## デプロイ手順（初回のみ）

### 1. GitHubにpush

```bash
cd ~/Desktop/stunpiece-strengths-tool
git init
git add .
git commit -m "Initial: Compass v11"
# GitHubで public リポジトリを作成（例: stunpiece-strengths-tool）
git remote add origin https://github.com/<account>/stunpiece-strengths-tool.git
git branch -M main
git push -u origin main
```

### 2. GitHub Pages を有効化

1. GitHub のリポジトリ画面 → Settings → Pages
2. Source: **Deploy from a branch**
3. Branch: **main** / **/ (root)** → Save
4. 数分後、`https://<account>.github.io/stunpiece-strengths-tool/` で公開される

### 3. カスタムドメイン設定

#### A. DNS（stunpiece.comの管理画面）

CNAMEレコードを追加:
```
ホスト: strengths
タイプ: CNAME
向き先: <account>.github.io
TTL: 3600
```

#### B. GitHubリポジトリ側

1. リポジトリ直下の `CNAME` ファイル（同梱済み）が `strengths.stunpiece.com` を指している
2. Settings → Pages → Custom domain に `strengths.stunpiece.com` を入力 → Save
3. **Enforce HTTPS** にチェック（DNSが効いてから）
4. 5〜30分後、`https://strengths.stunpiece.com` でアクセス可能

### 4. 完成

以後、ツールを更新するときは:
```bash
git add . && git commit -m "Update questions" && git push
```
これだけで本番が自動更新されます。

## バージョン履歴

| 版 | 形式 | 質問数 | 概要 |
|---|---|---|---|
| v9 | Ipsative + 4脳 | 196問 | 4脳分類（16タイプ）統合 |
| v10 | 同上 | 196問 | 3モード選択（全部 / SFのみ / 4脳のみ）追加 |
| **v11** | 同上 | **196問** | **遊戯者15問書き直し（情緒・関係性志向に再フレーム）／ Compass にブランド変更** |

## ライセンス

Gallup® および CliftonStrengths® は Gallup, Inc. の登録商標です。本ツールは独立した類似ツールであり、Gallup社の認定や承認は受けていません。

## クレジット

- ツール開発: StunPiece株式会社
- ストレングスファインダー（CliftonStrengths）: Gallup, Inc.
- 4脳分類（四脳分類）: yonnoubunrui.com に着想

---

© StunPiece株式会社 2026
