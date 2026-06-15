# 100Shops

食べログ百名店の候補データを取り込み、一覧、地図、外部検索導線をまとめて扱うための静的MVPです。

## 開き方

GitHub Pages、またはローカルHTTPサーバーで開きます。外部CDNから Leaflet と lucide を読み込むため、初回表示にはネットワーク接続が必要です。

```powershell
python -m http.server 8000
```

`file://` で直接開いた場合、一覧と地図は表示できますが、ブラウザ制約により詳細JSONの遅延読み込みは動かないことがあります。

## データ構成

- `data/shops-basic.js` は初期表示用の軽量データです。一覧、検索、地図、外部リンクに必要な項目だけを含みます。
- `data/details-*.json` は電話、営業時間、席数、説明文などの詳細データです。初期ロードでは読まず、店舗詳細表示時に対象ジャンル分だけ読み込みます。
- `data/shops.js` は収集時のフルデータを残したものです。アプリの初期表示では読み込みません。
- 訪問ステータスとメモはブラウザの `localStorage` に保存します。

## URLパラメータ

検索条件はURLに反映されます。URLを共有すると同じ条件で開けます。

- `dataset`: データセットID
- `q`: 検索語
- `pref`: 都道府県
- `area`: 市区町村フィルタ
- `sort`: 並び順
- `shop`: 選択中の店舗ID

## CSV形式

最低限 `name,address,lat,lng` が必要です。推奨ヘッダーは以下です。

```csv
name,tabelogUrl,area,station,address,lat,lng,genre,note
```

例:

```csv
name,tabelogUrl,area,station,address,lat,lng,genre,note
サンプル店,https://tabelog.com/example,新宿,新宿駅,東京都新宿区新宿3丁目,35.6909,139.7003,立ち飲み,候補
```

## 次にやること

1. 立ち飲み百名店2025の実データを10件だけ入力する。
2. 住所から緯度経度を補完する手順を決める。
3. Google Places APIを使うか、CSVで手動補正するかを選ぶ。
