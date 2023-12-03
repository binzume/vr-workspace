# XR Applications

## アプリケーションのフォーマット

通常のA-FRAMEのシーンを含むHTMLを作成してください。html内の一部の要素が ../index.html に挿入されます。

## 通常

以下のものが読み込まれます。

- id='app' を持つ要素 (読み込み時のURLに #foobar などを付けて変更できます)
- script tag (同じidまたはURLを持つものは一度しかロードされません)

## 環境

以下のものが読み込まれます。

- id='env' を持つ要素 (読み込み時のURLに #foobar などを付けて変更できます)
- script tag (同じidまたはURLを持つものは一度しかロードされません)
- a-sceneのいくつかの属性値

## vrapp component

読み込み時に vrapp コンポーネントが追加されます。
`this.el.components.vrapp` 等から取得してください。

vrappコンポーネント経由でworkspace内の機能にアクセスできます。

ドキュメントはまだ無いので `types.t.ts` ファイルを参照してください。

### API

- vrapp.services.appManager : AppManagerのインスタンス
- vrapp.services.storage : ストレージへのアクセスを提供します
- vrapp.saveFile(content, options) : ファイル保存UIを表示し、blobをストレージに保存し、`Promise<FileInfo>` を返します
- vrapp.selectFile(options) : ファイル選択UIを表示して、`Promise<FileInfo>` を返します

### Events

- 'app-start': アプリケーション起動時(要素がシーンに追加されたあと)に発火します
- 'app-save-state': アプリケーションの情報が永続化されるときに発火します
