#!/usr/bin/env node
/* Cifra tus mp3 y listas para publicarlos en un sitio estático (GitHub Pages) protegidos con contraseña.
 *
 *   1) Crea la carpeta  vault-src/  (NO se sube a GitHub: está en .gitignore)
 *        - una subcarpeta por lista, con los mp3 dentro, nombrados «Título - Artista.mp3»
 *        - opcional: vault-src/playlists.json para dar portadas, álbum, año… (ver tools/playlists-ejemplo.json)
 *   2) node tools/build-vault.mjs        (pide la contraseña; o define OUSIFY_PASS)
 *   3) Sube la carpeta  vault/  al repositorio (git add vault). Solo contiene datos cifrados.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join, basename, relative } from 'node:path';
import { pbkdf2Sync, createCipheriv, createHmac, randomBytes } from 'node:crypto';
import readline from 'node:readline';

const SRC = 'vault-src', OUT = 'vault';
if (!existsSync(SRC)) { console.error(`Falta la carpeta "${SRC}". Créala y mete dentro una subcarpeta por lista con tus mp3.`); process.exit(1); }

function askHidden(q) {
  return new Promise(res => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = s => { if (s.startsWith(q)) rl.output.write(s); };
    rl.question(q, a => { rl.close(); process.stdout.write('\n'); res(a); });
  });
}
const walk = d => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lista';

/* ---- listas ---- */
const cfgPath = join(SRC, 'playlists.json');
let cfg;
if (existsSync(cfgPath)) cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
else {
  const groups = {};
  for (const f of walk(SRC).filter(f => /\.mp3$/i.test(f)).sort()) {
    const rel = relative(SRC, f).split(/[\\/]/), g = rel.length > 1 ? rel[0] : 'Ousify';
    const m = basename(f).replace(/\.mp3$/i, '').split(/\s+-\s+/);
    (groups[g] ||= []).push({ title: m[0], artist: m.slice(1).join(' - '), file: rel.join('/') });
  }
  cfg = { lists: Object.entries(groups).map(([name, tracks]) => ({ id: slug(name), name, tracks })) };
}

/* ---- contraseña y clave ---- */
const pass = (process.env.OUSIFY_PASS || await askHidden('Contraseña del grupo: ')).normalize('NFKC');
if (pass.length < 12) { console.error('Usa una contraseña de al menos 12 caracteres: una frase de 4-5 palabras es lo ideal.\nLos archivos cifrados son públicos, así que una contraseña corta se puede adivinar probando millones de combinaciones.'); process.exit(1); }
mkdirSync(OUT, { recursive: true });
const metaPath = join(OUT, 'meta.json'), ITER = 600000;
const old = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : null;
const meta = old && old.salt ? old : { v: 1, kdf: 'PBKDF2-SHA256', iter: ITER, salt: randomBytes(16).toString('base64') };
const key = pbkdf2Sync(pass, Buffer.from(meta.salt, 'base64'), meta.iter, 32, 'sha256');

function seal(buf, iv) {
  const c = createCipheriv('aes-256-gcm', key, iv);
  return Buffer.concat([iv, c.update(buf), c.final(), c.getAuthTag()]); /* iv(12) | cifrado | etiqueta(16) */
}
/* IV derivado del contenido: el mismo mp3 da siempre el mismo resultado y git no re-sube lo que no cambió */
const det = buf => createHmac('sha256', key).update('iv').update(buf).digest().subarray(0, 12);
const nameOf = buf => createHmac('sha256', key).update('name').update(buf).digest('hex').slice(0, 24) + '.enc';

let n = 0, bytes = 0; const keep = new Set(['index.enc', 'meta.json']);
for (const l of cfg.lists) {
  l.tracks = (l.tracks || []).filter(t => {
    if (!t.file) return !!t.url; /* los que ya tienen url externa se dejan tal cual */
    const p = join(SRC, t.file);
    if (!existsSync(p)) { console.warn('  ! no existe', p); return false; }
    const buf = readFileSync(p), name = nameOf(buf);
    writeFileSync(join(OUT, name), seal(buf, det(buf))); keep.add(name); t.file = name; n++; bytes += buf.length; return true;
  });
}
writeFileSync(join(OUT, 'index.enc'), seal(Buffer.from(JSON.stringify(cfg)), randomBytes(12)));
writeFileSync(metaPath, JSON.stringify(meta));
for (const f of readdirSync(OUT)) if (!keep.has(f)) unlinkSync(join(OUT, f)); /* borra cifrados de canciones que ya no están */
console.log(`Listo: ${cfg.lists.length} lista(s), ${n} canción(es) cifradas (${(bytes / 1048576).toFixed(1)} MB) en "${OUT}/".\nSube la carpeta "${OUT}/" al repositorio. No subas "${SRC}/".`);
