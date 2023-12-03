# VR Workspace

ブラウザのWebVR/WebXRで動作するXR Workspace環境です。

## Demo

https://binzume.github.io/vr-workspace/

OculusQuest等で上記URLにアクセスして `VR` または `AR` ボタンをクリックしてください．

- コントローラのトリガーボタンがクリック，グリップボタンがメニュー表示とジェスチャー入力です
- ウインドウ等のドラッグ中にグリップボタンを押すと対象との距離を操作できます
- Google Drive上のファイルを使いたい場合は事前に `Storage Settings` 内でアクセスを許可してください

サーバ等は不要ですが，WebXR Device APIを使うためには適当なHTTPサーバを用いて https:// でアクセスする必要があります。
また、別の環境にアップロードして利用する場合は Google API の clientId等を書き換えてください．

## Features

- Physics
- Hand tracking
- VR app dynamic loading 

## Available apps

アプリケーションの実装方法は [docs/application.md](docs/application.md) を参照してください。

- Calculator
- Notepad
- Paint3D
- Console
- Task Manager
- Media Player
- Storage
  - Google Drive client
  - WebkitFileSystem
  - Demo storage (Read Only)
- WebRTC Remote Desktop ( https://github.com/binzume/webrtc-rdp )
- VNC Client (needs websockify)
- VRM model viewer

![screenshot](docs/screenshot.png)

## License

MIT License
