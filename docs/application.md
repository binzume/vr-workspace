# XR Application

## アプリケーションのフォーマット

通常のA-FRAMEのシーンを含むHTMLを作成してください。html内の一部の要素がシーンに挿入されます。

利用したいアプリケーションへのリンクは [../index.html](../index.html) 内の `<div id='applications' style='display:none'>` ～ `</div>` 内に追加してください。

## 通常

以下のものが読み込まれます。

- `id='app'` を持つ要素 (読み込み時のURLに #foobar などを付けて変更できます)
- `script` 要素(同じidまたはURLを持つものは一度しかロードされません)

## 環境

以下のものが読み込まれます。

- `id='env'` を持つ要素 (読み込み時のURLに #foobar などを付けて変更できます)
- `script` 要素(同じidまたはURLを持つものは一度しかロードされません)
- `a-scene` の `background`, `fog` の属性値

## vrapp component

読み込み時に `vrapp` コンポーネントが追加されます。
`this.el.components.vrapp` 等からインスタンスを取得して利用してください。

vrappコンポーネント経由でworkspace内の機能にアクセスできます。

### API

ドキュメントはまだ無いので [types.t.ts](../js/types.d.ts) ファイルを参照してください。

- vrapp.services.appManager : AppManagerのインスタンス
- vrapp.services.storage : ストレージへのアクセスを提供します
- vrapp.saveFile(content, options) : ファイル保存UIを表示し、blobをストレージに保存し、`Promise<FileInfo>` を返します
- vrapp.selectFile(options) : ファイル選択UIを表示して、`Promise<FileInfo>` を返します

### Events

- 'app-start': アプリケーション起動時(要素がシーンに追加されたあと)に発火します
- 'app-save-state': アプリケーションの情報が永続化されるときに発火します
