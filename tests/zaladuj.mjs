import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export const PLIK = 'index.html';

export function wczytajHtml() {
  return readFileSync(new URL(`../${PLIK}`, import.meta.url), 'utf8');
}

export function blok(html, id) {
  const m = html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`));
  if (!m) throw new Error(`Brak bloku <script id="${id}"> w ${PLIK}`);
  return m[1];
}

export function zaladuj() {
  const kod = [blok(wczytajHtml(), 'dane'), 'globalThis.__api = { ...DANE };'].join('\n;\n');
  const kontekst = vm.createContext({});
  vm.runInContext(kod, kontekst, { filename: PLIK });
  return kontekst.__api;
}

// Obiekty z innego realmu vm mają inne prototypy - przed deepEqual kopiujemy je przez JSON.
export const j = (x) => JSON.parse(JSON.stringify(x));
