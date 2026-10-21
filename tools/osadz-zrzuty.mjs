// Osadzenie zrzutów z katalogu zrzuty/ w bloku <script id="zrzuty"> pliku HTML.
// Osadza tylko zrzuty wymienione w LISTA_ZRZUTOW danego pliku.
// Użycie: node tools/osadz-zrzuty.mjs [plik.html]   (domyślnie cwiczenia-pakiet-analityczny.html)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { extname, basename } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import vm from 'node:vm';

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const WZOR_BLOKU = /<script id="zrzuty">[\s\S]*?<\/script>/;

export function osadz(html, pliki) {
  if (!WZOR_BLOKU.test(html)) throw new Error('Brak bloku <script id="zrzuty"> w HTML');
  const obiekt = Object.fromEntries(pliki.map((p) => [p.klucz, `data:${p.mime};base64,${p.dane.toString('base64')}`]));
  const blok = `<script id="zrzuty">\nconst ZRZUTY = ${JSON.stringify(obiekt, null, 1)};\n</script>`;
  return html.replace(WZOR_BLOKU, () => blok);
}

// Klucze zrzutów z LISTA_ZRZUTOW w bloku <script id="dane">.
export function kluczeZrzutow(html) {
  const m = html.match(/<script id="dane">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('Brak bloku <script id="dane"> w HTML');
  const kontekst = vm.createContext({});
  vm.runInContext(`${m[1]}\n;globalThis.__lista = DANE.LISTA_ZRZUTOW;`, kontekst);
  return new Set(kontekst.__lista.map((z) => z.klucz));
}

function main() {
  const katalog = fileURLToPath(new URL('../zrzuty/', import.meta.url));
  const sciezkaHtml = fileURLToPath(new URL(`../${process.argv[2] || 'cwiczenia-pakiet-analityczny.html'}`, import.meta.url));
  const klucze = kluczeZrzutow(readFileSync(sciezkaHtml, 'utf8'));
  const pliki = readdirSync(katalog)
    .filter((n) => MIME[extname(n).toLowerCase()] && klucze.has(basename(n, extname(n))))
    .sort()
    .map((n) => ({ klucz: basename(n, extname(n)), mime: MIME[extname(n).toLowerCase()], dane: readFileSync(katalog + n) }));
  const html = osadz(readFileSync(sciezkaHtml, 'utf8'), pliki);
  writeFileSync(sciezkaHtml, html, 'utf8');
  const megabajty = (Buffer.byteLength(html) / 1024 / 1024).toFixed(2);
  console.log(`Osadzono ${pliki.length} zrzutów: ${pliki.map((p) => p.klucz).join(', ')}. Rozmiar HTML: ${megabajty} MB.`);
  if (megabajty > 5) console.log('Uwaga: HTML ma ponad 5 MB - rozważ zapis zrzutów jako JPG lub ich przycięcie.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
