#!/usr/bin/env bash
# Regenera app/assets/reglamento.json (copia del reglamento que va dentro de la
# app) desde el markdown del Google Doc de Victor. Uso:
#   scripts/reglamento-asset.sh documento.md
# El servidor hace lo mismo cada día (getReglamento); esta copia solo se usa la
# primera vez o sin internet.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
npx -y esbuild@0.24 supabase/functions/api/reglamento.ts --format=esm --outfile="$tmp/reglamento.mjs" --log-level=warning
cat > "$tmp/run.mjs" <<'JS'
import { procesarReglamento } from './reglamento.mjs';
import fs from 'fs';
const r = procesarReglamento(fs.readFileSync(process.argv[2], 'utf8'));
fs.writeFileSync(process.argv[3], JSON.stringify(r));
console.log(`versión ${r.version}: ${r.secciones.length} secciones, ${r.casos.length} casos, ${r.glosario.length} términos, ${r.faltas.length} faltas`);
JS
node "$tmp/run.mjs" "$1" app/assets/reglamento.json
