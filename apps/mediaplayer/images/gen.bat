@echo off
setlocal enabledelayedexpansion

mkdir build
set F=
for %%f in (icon_play icon_pause icon_next icon_prev icon_back10 icon_next10 icon_volume icon_mute) do (
  msdfgen.exe -svg %%f.svg -o build/%%f.png -size 32 32 -scale 0.5
  set F=!F! build/%%f.png
)

echo %F%
go run pack.go -o icons.png %F%
go run decode_msdf.go -o build/out.png icons.png
