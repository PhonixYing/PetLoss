#!/usr/bin/env sh
set -eu

output_dir=".cloudflare-output"

rm -rf "$output_dir"
mkdir -p "$output_dir"

find . \
  -path './.git' -prune -o \
  -path "./$output_dir" -prune -o \
  -type f -exec sh -c '
    for source_file do
      destination=".cloudflare-output/${source_file#./}"
      mkdir -p "$(dirname "$destination")"
      cp "$source_file" "$destination"
    done
  ' sh {} +
