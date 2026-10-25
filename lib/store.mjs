// Archivio dati chiave → JSON.
// Online (Netlify) usa Netlify Blobs; in locale (STORAGE=file) usa la cartella .data/.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const DIR = path.resolve(process.env.DATA_DIR || ".data");
let blobs;

async function blobStore() {
  if (process.env.STORAGE === "file") return null;
  if (blobs === undefined) {
    try {
      const { getStore } = await import("@netlify/blobs");
      blobs = getStore({ name: "finestra", consistency: "strong" });
    } catch {
      blobs = null;
    }
  }
  return blobs;
}

export async function read(key, fallback) {
  const b = await blobStore();
  if (b) return (await b.get(key, { type: "json" })) ?? fallback;
  try {
    return JSON.parse(await readFile(path.join(DIR, `${key}.json`), "utf8"));
  } catch {
    return fallback;
  }
}

export async function write(key, value) {
  const b = await blobStore();
  if (b) return b.setJSON(key, value);
  await mkdir(DIR, { recursive: true });
  await writeFile(path.join(DIR, `${key}.json`), JSON.stringify(value, null, 2));
}
