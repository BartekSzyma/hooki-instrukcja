import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zaladuj, wczytajHtml, blok, j } from './zaladuj.mjs';

const A = zaladuj();
const elementy = () => A.INSTRUKCJA.flatMap((s) => s.elementy);
const TYPY = new Set(['tekst', 'komenda', 'sprawdz', 'uwaga', 'wazne', 'mac', 'zrzut', 'prompt', 'plik', 'dlaczego', 'schemat', 'animacja']);
const prompty = () => elementy().filter((e) => e.typ === 'prompt');

test('sekcje mają unikalne ASCII id i tytuły numerowane od 0 po kolei', () => {
  A.INSTRUKCJA.forEach((s, i) => {
    assert.match(s.id, /^[a-z0-9-]+$/, s.id);
    assert.ok(s.tytul.startsWith(`${i}. `), s.tytul);
  });
  assert.equal(new Set(A.INSTRUKCJA.map((s) => s.id)).size, A.INSTRUKCJA.length);
});

test('każdy element ma znany typ i niepustą treść; html bez <script', () => {
  for (const e of elementy()) {
    assert.ok(TYPY.has(e.typ), e.typ);
    if (['tekst', 'sprawdz', 'uwaga', 'wazne', 'mac', 'dlaczego'].includes(e.typ)) assert.ok(e.html.length > 0);
    if (e.typ === 'komenda') assert.ok(e.tekst.length > 0);
    if (e.typ === 'prompt') assert.ok(e.tytul.length > 0 && e.tekst.length > 0, e.id);
    if ('html' in e) assert.doesNotMatch(e.html, /<script/i);
  }
});

test('prompty K1..K11 po kolei, potem poglądowe Z1..Z4', () => {
  const oczekiwane = [...Array.from({ length: 11 }, (_, i) => `K${i + 1}`), 'Z1', 'Z2', 'Z3', 'Z4'];
  assert.deepEqual(j(prompty().map((e) => e.id)), oczekiwane);
  for (const e of prompty()) assert.equal(Boolean(e.poglad), e.id.startsWith('Z'), e.id);
});

test('prompty nie zawierają ścieżek ani nazw autora', () => {
  for (const e of prompty()) assert.doesNotMatch(e.tekst, /C:\\Programowanie|Bartek|auto mode|herdr|CLAUDE_CONFIG_DIR/i, e.id);
});

test('ścieżki Windows w treści nie zgubiły ukośników', () => {
  for (const e of elementy()) {
    const tresc = `${e.html || ''}${e.tekst || ''}`;
    assert.doesNotMatch(tresc, /[A-Z]:Program|\.claudeskills|\.claudehooks|Dokumentyhooki/, tresc.slice(0, 80));
  }
});

test('każdy krok z promptem (poza poglądowymi) ma ramkę „Co się dzieje i po co” i punkt „Sprawdź”', () => {
  for (const s of A.INSTRUKCJA.filter((x) => x.elementy.some((e) => e.typ === 'prompt' && !e.poglad))) {
    assert.ok(s.elementy.some((e) => e.typ === 'dlaczego'), `${s.id}: brak ramki dlaczego`);
    assert.ok(s.elementy.some((e) => e.typ === 'sprawdz'), `${s.id}: brak Sprawdź`);
  }
});

test('każdy zrzut z LISTA_ZRZUTOW użyty dokładnie raz i osadzony', () => {
  const uzyte = elementy().filter((e) => e.typ === 'zrzut').map((e) => e.klucz).sort();
  assert.deepEqual(j(uzyte), j(A.LISTA_ZRZUTOW.map((z) => z.klucz).sort()));
  assert.equal(new Set(uzyte).size, uzyte.length);
  const osadzone = Object.keys(JSON.parse(blok(wczytajHtml(), 'zrzuty').replace(/^[\s\S]*?const ZRZUTY = /, '').replace(/;\s*$/, ''))).sort();
  assert.deepEqual(osadzone, j(uzyte));
});

test('skrypty hooków w promptach zapisują UTF-8 z BOM; hook globalny używa $HOME', () => {
  for (const e of prompty().filter((p) => ['K1', 'K2', 'K3', 'K5', 'K6', 'K7', 'K11'].includes(p.id))) assert.match(e.tekst, /UTF-8 z BOM/, e.id);
  assert.match(prompty().find((p) => p.id === 'K4').tekst, /\$HOME\/\.claude\/hooks\/dzwiek\.ps1/);
});

test('K5 obejmuje narzędzia plikowe i powłoki (w tym PowerShell)', () => {
  assert.match(prompty().find((p) => p.id === 'K5').tekst, /Write\|Edit\|MultiEdit\|Bash\|PowerShell/);
});

test('konstruktor pytania składa kontekst i zadanie, pomija puste pola', () => {
  const pytanie = A.zlozPytanie('K1: hook na starcie (tekst)', { zrobilem: 'Wkleiłem K1.', widze: ' ' });
  assert.match(pytanie, /^\[KONTEKST\]\n.*K1: hook na starcie/);
  assert.match(pytanie, /\[CO ZROBIŁEM\]\nWkleiłem K1\./);
  assert.doesNotMatch(pytanie, /CO WIDZĘ/);
  assert.match(pytanie, /\[ZADANIE\]/);
});

test('bloki skryptu się kompilują, a HTML deklaruje UTF-8 i polski', () => {
  const html = wczytajHtml();
  assert.match(html, /<meta charset="utf-8">/);
  assert.match(html, /<html lang="pl">/);
  for (const id of ['dane', 'widok', 'zrzuty']) assert.doesNotThrow(() => new vm.Script(blok(html, id)), id);
});

test('jest sekcja o konfiguracji lokalnej i globalnej', () => {
  const sekcja = A.INSTRUKCJA.find((s) => s.id === 'gdzie-hooki');
  assert.ok(sekcja);
  const tekst = sekcja.elementy.map((e) => e.html || '').join(' ');
  for (const w of ['settings.local.json', 'settings.json', 'globalny', 'lokalny', '$HOME']) assert.ok(tekst.includes(w), w);
});

test('zwykły tekst nie zawiera żargonu (matcher, systemMessage, BOM...) poza ramkami „Dla ciekawskich”', () => {
  const ZARGON = /matcher|systemMessage|stdout|stderr|\bBOM\b|ExecutionPolicy|hookSpecificOutput|additionalContext/i;
  for (const s of A.INSTRUKCJA.filter((x) => !['typowe-problemy', 'plugin'].includes(x.id))) {
    for (const e of s.elementy.filter((x) => 'html' in x)) {
      if (e.typ === 'uwaga' && e.html.startsWith('<strong>Dla ciekawskich')) continue;
      assert.doesNotMatch(e.html, ZARGON, `${s.id}: ${e.html.slice(0, 60)}`);
    }
  }
});

test('każda część ćwiczenia ma proste „Co zrobimy” albo wstęp przed promptem', () => {
  for (const s of A.INSTRUKCJA.filter((x) => x.elementy.some((e) => e.typ === 'prompt' && !e.poglad) && !['k8', 'k9-k10'].includes(x.id))) {
    const przed = s.elementy.slice(0, s.elementy.findIndex((e) => e.typ === 'prompt'));
    assert.ok(przed.some((e) => /Co zrobimy/.test(e.html || '')) || s.id === 'gdzie-hooki', `${s.id}: brak „Co zrobimy”`);
  }
});

test('odnośniki do instrukcji głównej są bezwzględne (osobne repozytorium)', () => {
  const html = wczytajHtml();
  assert.ok(html.includes('https://bartekszyma.github.io/skill-docx-pptx-xlsx/cwiczenia-pakiet-analityczny.html'));
  assert.doesNotMatch(html, /href="cwiczenia-pakiet-analityczny\.html"/);
});

test('żaden plik tekstowy nie zawiera długich myślników', () => {
  const korzen = fileURLToPath(new URL('..', import.meta.url));
  const pomijane = new Set(['.git', 'node_modules', 'zrzuty']);
  const zakazane = [new RegExp('\\u2014'), new RegExp('\\u2013'), new RegExp('&' + 'mdash;'), new RegExp('&' + 'ndash;')];
  const pliki = (k) => readdirSync(k, { withFileTypes: true }).flatMap((w) => (pomijane.has(w.name) ? [] : w.isDirectory() ? pliki(join(k, w.name)) : ['.html', '.mjs', '.md', '.json'].includes(extname(w.name)) ? [join(k, w.name)] : []));
  for (const p of pliki(korzen)) for (const z of zakazane) assert.ok(!z.test(readFileSync(p, 'utf8')), p);
});
