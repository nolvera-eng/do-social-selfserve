#!/bin/bash
# Script to download partner logos from Figma
# This requires the Figma file to be accessible

LOGOS_JSON="partner-logos-map.json"
OUTPUT_DIR="assets/partner-logos"
FILE_KEY="XpDLizTmEBK67YEgkyGPhZ"

mkdir -p "$OUTPUT_DIR"

echo "Downloading partner logos..."
count=0
total=$(jq 'length' "$LOGOS_JSON")

jq -r 'to_entries[] | "\(.key)|\(.value)"' "$LOGOS_JSON" | while IFS='|' read -r name node_id; do
  count=$((count + 1))
  echo "[$count/$total] Downloading $name..."

  # Note: This requires figma CLI or API access
  # For now, logos need to be downloaded via the Figma MCP tool
  # TODO: Implement batch download via Figma API
done

echo "Done! Downloaded $total logos to $OUTPUT_DIR"
