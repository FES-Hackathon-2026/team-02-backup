#!/bin/bash

set -u

SOURCE_DIR="$( cd "$( dirname "$0" )" && pwd )"
EXPORT_DIR="$SOURCE_DIR/code_export"
ALLE_DIR="$EXPORT_DIR/alle"
KOMPR_DIR="$EXPORT_DIR/alle komprimiert"

INCLUDE_NAMES=(
  ".gitignore"
  ".gitattributes"
  "mvnw"
  "mvnw.cmd"
  "Dockerfile"
  "docker-compose.yml"
  "docker-compose.yaml"
)

EXCLUDE_DIRS=(
  "target"
  "build"
  "dist"
  ".mvn"
  ".gradle"
  ".git"
  ".idea"
  ".vscode"
  "node_modules"
  "__pycache__"
  ".venv"
  "venv"
  "logs"
  "code_export"
)

matches_include() {
  local file="$1"
  local base
  base="$(basename "$file")"

  for name in "${INCLUDE_NAMES[@]}"; do
    [[ "$base" == "$name" ]] && return 0
  done

  lower_base="$(printf '%s' "$base" | tr '[:upper:]' '[:lower:]')"
  case "$lower_base" in
    *.java|*.kt|*.groovy|*.xml|*.properties|*.yml|*.yaml|*.proto|*.html|*.css|*.js|*.ts|*.tsx|*.jsx|*.sh|*.bat|*.cmd|*.ps1|*.md|*.json|*.sql|*.graphql|*.env|*.gradle|*.txt|*.py)
      return 0
      ;;
  esac

  return 1
}

is_excluded_path() {
  local path="$1"
  for dir in "${EXCLUDE_DIRS[@]}"; do
    [[ "$path" == *"/$dir/"* ]] && return 0
    [[ "$path" == *"/$dir" ]] && return 0
  done
  return 1
}

echo ""
echo "🚀 🚀 🚀 🚀 🚀 🚀 🚀 🚀 🚀 🚀 🚀 🚀 🚀 🚀 🚀 🚀 🚀 🚀 🚀 🚀"
echo "UNIVERSELLES CODE EXPORT TOOL (macOS)"
echo "🚀 🚀 🚀 🚀 🚀 🚀 🚀 🚀 🚀 🚀 🚀 🚀 🚀 🚀 🚀 🚀 🚀 🚀 🚀 🚀"
echo ""
echo "Quelle: $SOURCE_DIR"
echo "Output: $EXPORT_DIR"

echo ""
echo "================================================================================"
echo "SCHRITT 1: VORBEREITUNG"
echo "================================================================================"
if [ -d "$EXPORT_DIR" ]; then
  echo "Lösche alten Export-Ordner: $EXPORT_DIR"
  rm -rf "$EXPORT_DIR"
fi
mkdir -p "$EXPORT_DIR"
echo "✓ Export-Ordner bereit: $EXPORT_DIR"

echo ""
echo "================================================================================"
echo "SCHRITT 2: STRUKTURIERTER EXPORT"
echo "================================================================================"

structured_count=0

while IFS= read -r -d '' file; do
  if is_excluded_path "$file"; then
    continue
  fi

  if ! matches_include "$file"; then
    continue
  fi

  rel="${file#$SOURCE_DIR/}"
  out="$EXPORT_DIR/$rel.txt"
  mkdir -p "$(dirname "$out")"

  {
    echo "Path: $file"
    echo "=================================================="
    echo ""
    cat "$file"
  } > "$out"

  structured_count=$((structured_count + 1))
done < <(find "$SOURCE_DIR" -type f -print0)

echo "✓ $structured_count Dateien im strukturierten Format exportiert"

echo ""
echo "================================================================================"
echo "SCHRITT 3: FLACHER EXPORT (alle)"
echo "================================================================================"

mkdir -p "$ALLE_DIR"
flat_count=0

while IFS= read -r -d '' txt; do
  rel_txt="${txt#$EXPORT_DIR/}"
  [[ "$rel_txt" == alle/* ]] && continue
  [[ "$rel_txt" == "alle komprimiert"/* ]] && continue

  base="$(basename "$txt")"
  target="$ALLE_DIR/$base"

  if [ -e "$target" ]; then
    stem="${base%.*}"
    ext="${base##*.}"
    if [[ "$base" != *.* ]]; then
      ext=""
    fi
    i=1
    while true; do
      if [ -n "$ext" ]; then
        candidate="$ALLE_DIR/${stem}_${i}.${ext}"
      else
        candidate="$ALLE_DIR/${stem}_${i}"
      fi
      if [ ! -e "$candidate" ]; then
        target="$candidate"
        break
      fi
      i=$((i + 1))
    done
  fi

  cp "$txt" "$target"
  flat_count=$((flat_count + 1))
done < <(find "$EXPORT_DIR" -type f -name "*.txt" -print0)

echo "✓ $flat_count Dateien im flachen Format exportiert"

echo ""
echo "================================================================================"
echo "SCHRITT 4: KOMPRIMIERTER EXPORT (alle komprimiert)"
echo "================================================================================"

mkdir -p "$KOMPR_DIR"
compressed_count=0

while IFS= read -r -d '' group_dir; do
  group_name="$(basename "$group_dir")"
  [[ "$group_name" == "alle" ]] && continue
  [[ "$group_name" == "alle komprimiert" ]] && continue

  group_total=$(find "$group_dir" -type f -name "*.txt" -print0 | tr -cd '\0' | wc -c | tr -d ' ')
  if [ "$group_total" -eq 0 ]; then
    continue
  fi

  out_file="$KOMPR_DIR/$group_name.txt"
  {
    echo "SERVICE: $group_name"
    echo "================================================================================"
    echo "Total files: $group_total"
    echo "================================================================================"
    echo ""

    while IFS= read -r -d '' f; do
      cat "$f"
      echo ""
      echo "────────────────────────────────────────────────────────────────────────────────"
      echo ""
    done < <(find "$group_dir" -type f -name "*.txt" -print0)
  } > "$out_file"

  echo "  ✓ $group_name.txt ($group_total Dateien)"
  compressed_count=$((compressed_count + 1))
done < <(find "$EXPORT_DIR" -mindepth 1 -maxdepth 1 -type d -print0)

root_total=$(find "$EXPORT_DIR" -mindepth 1 -maxdepth 1 -type f -name "*.txt" -print0 | tr -cd '\0' | wc -c | tr -d ' ')
if [ "$root_total" -gt 0 ]; then
  root_out="$KOMPR_DIR/root.txt"
  {
    echo "ROOT LEVEL FILES"
    echo "================================================================================"
    echo "Total files: $root_total"
    echo "================================================================================"
    echo ""

    while IFS= read -r -d '' f; do
      cat "$f"
      echo ""
      echo "────────────────────────────────────────────────────────────────────────────────"
      echo ""
    done < <(find "$EXPORT_DIR" -mindepth 1 -maxdepth 1 -type f -name "*.txt" -print0)
  } > "$root_out"
  echo "  ✓ root.txt ($root_total Dateien)"
  compressed_count=$((compressed_count + 1))
fi

total_size_bytes=$(find "$EXPORT_DIR" -type f -print0 | xargs -0 stat -f%z 2>/dev/null | awk '{sum+=$1} END {print sum+0}')
total_size_mb=$(awk -v b="$total_size_bytes" 'BEGIN {printf "%.2f", b/1024/1024}')

echo ""
echo "================================================================================"
echo "ZUSAMMENFASSUNG"
echo "================================================================================"
echo ""
echo "📁 Strukturierter Export:"
echo "   └─ $structured_count Dateien mit Pfad-Header"
echo ""
echo "📄 Flacher Export (alle):"
echo "   └─ $flat_count Dateien ohne Ordner-Struktur"
echo ""
echo "🗜️  Komprimierter Export (alle komprimiert):"
echo "   └─ $compressed_count Sammel-Dateien"
echo ""
echo "💾 Speichergröße: $total_size_mb MB"
echo ""
echo "📍 Speicherort: $EXPORT_DIR"
echo ""
echo "================================================================================"
echo "✓ EXPORT ABGESCHLOSSEN!"
echo "================================================================================"
echo ""

read -r -p "Enter zum Schließen..."
exit 0
