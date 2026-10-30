#!/usr/bin/env bash
# Yayına hazır siteyi dist/ klasörüne üretir.
#   Gerekenler: .NET 10 SDK, Node.js (npm install ile monaco-editor)
set -euo pipefail
cd "$(dirname "$0")"

OUT=dist
rm -rf "$OUT" build/engine
mkdir -p "$OUT"

echo ">> .NET motoru derleniyor..."
dotnet publish src/Engine/Engine.csproj -c Release -o build/engine --nologo -v quiet

echo ">> Web dosyaları kopyalanıyor..."
cp -r web/. "$OUT/"
cp -r build/engine/wwwroot/_framework "$OUT/_framework"
# Tarayıcı .gz dosyalarını kendisi açar; .br dosyalarına gerek yok.
find "$OUT/_framework" -name "*.br" -delete

echo ">> Monaco editör kopyalanıyor..."
if [ ! -d node_modules/monaco-editor ]; then npm install --no-audit --no-fund; fi
mkdir -p "$OUT/lib/monaco"
cp -r node_modules/monaco-editor/min/vs "$OUT/lib/monaco/vs"
# Yalnızca C# dil desteği yeterli; diğer dillerin dosyalarını çıkar.
find "$OUT/lib/monaco/vs/basic-languages" -mindepth 1 -maxdepth 1 -type d ! -name csharp -exec rm -rf {} +
rm -f "$OUT"/lib/monaco/vs/nls.messages.*.js
rm -rf "$OUT/lib/monaco/vs/language/html" "$OUT/lib/monaco/vs/language/css" "$OUT/lib/monaco/vs/language/json" "$OUT/lib/monaco/vs/language/typescript"

echo ">> Hazır: $OUT/ ($(du -sh "$OUT" | cut -f1))"
