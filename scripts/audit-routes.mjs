#!/usr/bin/env node
// Auditoria estática: confere se cada item da sidebar tem rota correspondente
// em src/routes/_authenticated e se nenhum arquivo de rota está órfão.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const sidebar = readFileSync(join(root, "src/components/app-sidebar.tsx"), "utf8");
const routesDir = join(root, "src/routes/_authenticated");

// Extrai { title, url } da sidebar
const itemRe = /title:\s*"([^"]+)",\s*url:\s*"([^"]+)"/g;
const menus = [];
let m;
while ((m = itemRe.exec(sidebar))) menus.push({ title: m[1], url: m[2] });

// Mapeia URL -> possíveis arquivos de rota
function routeFilesFor(url) {
  const clean = url.replace(/^\//, "");
  const flat = clean.replace(/\//g, ".");
  return [
    `${flat}.tsx`,
    `${flat}/index.tsx`,
    `${flat}.index.tsx`,
  ];
}

const existingRoutes = readdirSync(routesDir);
const results = [];
let failed = 0;

for (const item of menus) {
  const candidates = routeFilesFor(item.url);
  const found = candidates.find((c) => existsSync(join(routesDir, c)));
  const ok = !!found;
  if (!ok) failed++;
  results.push({ ...item, ok, file: found ?? null });
}

// Detecta rotas órfãs (existem mas ninguém liga)
const linkedUrls = new Set(menus.map((m) => m.url));
const orphans = existingRoutes
  .filter((f) => f.endsWith(".tsx") && !["route.tsx"].includes(f))
  .map((f) => "/" + f.replace(/\.tsx$/, "").replace(/\.index$/, "").split(".")[0])
  .filter((u, i, a) => a.indexOf(u) === i)
  .filter((u) => !linkedUrls.has(u) && !linkedUrls.some((l) => l === u || u.startsWith(l + "/") || ["/admin"].includes(u)));

console.log("\n=== AUDITORIA DE ROTAS ===\n");
for (const r of results) {
  console.log(`${r.ok ? "✓" : "✗"} ${r.title.padEnd(28)} ${r.url.padEnd(24)} ${r.file ?? "(faltando)"}`);
}
if (orphans.length) {
  console.log("\nRotas órfãs (sem link no menu):");
  for (const o of orphans) console.log(`  • ${o}`);
}
console.log(`\nTotal: ${results.length} • OK: ${results.length - failed} • Faltando: ${failed}`);
process.exit(failed > 0 ? 1 : 0);