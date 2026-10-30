#!/usr/bin/env bash
# C# Form Stüdyosu'nu (c-lesson) GitHub'dan alıp c-lesson/ klasörüne kopyalar.
# c-lesson bu depoda alt modül değil, düz dosya olarak durur (Hostinger alt modül indirmez).
#
#   ./araclar/c-lesson-guncelle.sh            → c-lesson main dalının son hâli
#   ./araclar/c-lesson-guncelle.sh <commit>   → belirli bir sürüm
#
# Yalnızca c-lesson deposundaki dosyalar kopyalanır (derleme çıktıları ve yerel dosyalar değil).
# Alınan sürüm c-lesson/SURUM dosyasına yazılır. Sonra testleri çalıştırıp commit edin.
set -euo pipefail
cd "$(dirname "$0")/.."

SURUM_ISTEGI="${1:-main}"
GECICI=$(mktemp -d)
trap 'rm -rf "$GECICI"' EXIT

git clone -q https://github.com/mkcaglars/c-lesson.git "$GECICI/c-lesson"
git -C "$GECICI/c-lesson" checkout -q "$SURUM_ISTEGI"
SURUM=$(git -C "$GECICI/c-lesson" rev-parse HEAD)

rm -rf c-lesson
mkdir c-lesson
git -C "$GECICI/c-lesson" archive HEAD | tar -x -C c-lesson
echo "$SURUM" > c-lesson/SURUM

echo "c-lesson güncellendi: $(git -C "$GECICI/c-lesson" log -1 --format='%h %cs %s')"
