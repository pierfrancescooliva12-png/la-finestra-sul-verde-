// Quando il sito avrà il suo dominio: node scripts/set-domain.mjs https://www.lafinestrasulverde.it
// Sostituisce l'indirizzo usato in canonical, hreflang, anteprime social, dati strutturati, sitemap e robots.
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OLD = "https://iridescent-cassata-cd1a68.netlify.app";
const next = (process.argv[2] || "").replace(/\/+$/, "");
if (!/^https:\/\/[a-z0-9.-]+$/i.test(next)) {
  console.error("Uso: node scripts/set-domain.mjs https://www.tuodominio.it");
  process.exit(1);
}

async function* files(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* files(p);
    else if (/\.(html|xml|txt)$/.test(e.name)) yield p;
  }
}

let changed = 0;
for await (const f of files("public")) {
  const s = await readFile(f, "utf8");
  if (s.includes(OLD)) { await writeFile(f, s.replaceAll(OLD, next)); changed++; console.log("aggiornato", f); }
}
console.log(`${changed} file aggiornati`);
