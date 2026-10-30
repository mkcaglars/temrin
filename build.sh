#!/usr/bin/env bash
# Yayına hazır siteyi dist/ klasörüne üretir (Hostinger'da dist/ içeriği public_html'e yüklenir).
#   Gerekenler: .NET 10 SDK, Node.js (Monaco editör için npm)
#   c-lesson (C# Form Stüdyosu) c-lesson/ klasöründedir; güncellemek için: araclar/c-lesson-guncelle.sh
set -euo pipefail
cd "$(dirname "$0")"

OUT=dist
STUDYO="$OUT/studyo"
CLE=c-lesson

if [ ! -f "$CLE/src/Engine/Interop.cs" ]; then
  echo "c-lesson/ klasörü eksik. Almak için: ./araclar/c-lesson-guncelle.sh" >&2
  exit 1
fi

rm -rf "$OUT" build/motor
mkdir -p "$OUT"

echo ">> Motor derleniyor (c-lesson + Temrin değerlendiricisi)..."
dotnet publish motor/Motor/Motor.csproj -c Release -o build/motor --nologo -v quiet

echo ">> Site dosyaları kopyalanıyor..."
cp -r web/. "$OUT/"

echo ">> Editör (c-lesson) kopyalanıyor..."
mkdir -p "$STUDYO/assets"
cp -r "$CLE/web/assets/css" "$CLE/web/assets/js" "$STUDYO/assets/"
# c-lesson'un sunucu katmanı yerine Temrin uyarlaması; c-lesson'a özgü giriş sayfası kullanılmaz.
cp studyo/api.js "$STUDYO/assets/js/api.js"
rm -f "$STUDYO/assets/js/main.js"
mkdir -p "$STUDYO/temrin"
cp studyo/temrin.js studyo/temrin.css studyo/monaco-ortam.js "$STUDYO/temrin/"
cp -r build/motor/wwwroot/_framework "$STUDYO/_framework"
# Tarayıcı .gz dosyalarını kendisi açar (engine.js); .br dosyalarına gerek yok.
find "$STUDYO/_framework" -name "*.br" -delete

echo ">> Monaco editör kopyalanıyor..."
if [ ! -d node_modules/monaco-editor ]; then npm install --no-audit --no-fund; fi
mkdir -p "$STUDYO/lib/monaco"
cp -r node_modules/monaco-editor/min/vs "$STUDYO/lib/monaco/vs"
find "$STUDYO/lib/monaco/vs/basic-languages" -mindepth 1 -maxdepth 1 -type d ! -name csharp -exec rm -rf {} +
rm -f "$STUDYO"/lib/monaco/vs/nls.messages.*.js
rm -rf "$STUDYO/lib/monaco/vs/language/html" "$STUDYO/lib/monaco/vs/language/css" "$STUDYO/lib/monaco/vs/language/json" "$STUDYO/lib/monaco/vs/language/typescript"

echo ">> Hazır: $OUT/ ($(du -sh "$OUT" | cut -f1))"
