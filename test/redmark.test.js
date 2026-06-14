// Tests RedMark — sans dependance (node test/redmark.test.js)
//
// Couvre :
//   1. le moteur inline (rendu, priorite, imbrication, anti-faux-positifs, echappement)
//   2. le predicat inSkippableContext (citations, signatures, code, liens ignores)
//   3. un garde anti-derive : les regex/selecteurs testes existent bien dans le .user.js
//
// Le moteur et le predicat sont recopies a l'identique du userscript ; le garde (3)
// echoue si une regex change dans le .user.js sans etre repercutee ici.
'use strict';
var fs = require('fs');
var path = require('path');

// =========================================================================
// DOM stub minimal (TextNode / Element avec parentNode, DocumentFragment)
// =========================================================================
function TextNode(s) { this.nodeType = 3; this.data = s; this.parentNode = null; }
function El(tag) { this.nodeType = 1; this.tagName = tag.toUpperCase(); this.className = ''; this.children = []; this.parentNode = null; }
El.prototype.appendChild = function (n) { n.parentNode = this; this.children.push(n); return n; };
function Frag() { this.nodeType = 11; this.children = []; }
Frag.prototype.appendChild = El.prototype.appendChild;
var document = {
  createTextNode: function (s) { return new TextNode(s); },
  createElement: function (t) { return new El(t); },
  createDocumentFragment: function () { return new Frag(); }
};
function serialize(node) {
  if (node.nodeType === 3) return node.data;
  if (node.nodeType === 11) return node.children.map(serialize).join('');
  var inner = node.children.map(serialize).join('');
  var cls = node.className ? ' class="' + node.className + '"' : '';
  return '<' + node.tagName.toLowerCase() + cls + '>' + inner + '</' + node.tagName.toLowerCase() + '>';
}
// Constructeurs d'arbre cablant parentNode (pour tester inSkippableContext)
function mkText(s) { return new TextNode(s); }
function mkEl(tag, className, kids) {
  var el = new El(tag); el.className = className || '';
  (kids || []).forEach(function (k) { el.appendChild(k); });
  return el;
}

// =========================================================================
// MOTEUR (copie conforme du userscript)
// =========================================================================
var RULES = [
  { name: 'code',    tag: 'code',   cls: 'redmark-code', literal: true, re: /`([^`\n]+)`/ },
  { name: 'bold',    tag: 'strong', cls: '', re: /\*\*(\S(?:[^*]*?\S)?)\*\*/ },
  { name: 'boldu',   tag: 'strong', cls: '', re: /__(\S(?:[^_]*?\S)?)__/ },
  { name: 'strike',  tag: 'del',    cls: '', re: /~~(\S(?:[^~]*?\S)?)~~/ },
  { name: 'italic',  tag: 'em',     cls: '', re: /\*(\S(?:[^*]*?\S)?)\*/ },
  { name: 'italicu', tag: 'em',     cls: '', re: /_(\S(?:[^_]*?\S)?)_/ }
];
// Placeholders de zone privee construits sans caractere litteral dans la source.
function pua(n) { return String.fromCharCode(0xE000 + n); }
var ESC = { '\\': pua(0), '`': pua(1), '*': pua(2), '_': pua(3), '~': pua(4) };
var UNESC = {}; Object.keys(ESC).forEach(function (k) { UNESC[ESC[k]] = k; });
var reEscape = /\\([\\`*_~])/g;
var reUnmask = new RegExp('[' + pua(0) + '-' + pua(4) + ']', 'g');
function maskEscapes(s) { return s.replace(reEscape, function (m, c) { return ESC[c]; }); }
function unmask(s) { return s.replace(reUnmask, function (c) { return UNESC[c]; }); }
function txt(s) { return document.createTextNode(unmask(s)); }
function firstMatch(str, enabled) {
  var best = null;
  for (var k = 0; k < RULES.length; k++) {
    var rule = RULES[k]; if (!enabled[rule.name]) continue;
    var m = rule.re.exec(str); if (!m) continue;
    if (best === null || m.index < best.m.index) { best = { rule: rule, m: m }; if (m.index === 0) break; }
  }
  return best;
}
function emitInline(parent, str, enabled) {
  while (str) {
    var f = firstMatch(str, enabled);
    if (!f) { parent.appendChild(txt(str)); return; }
    if (f.m.index > 0) parent.appendChild(txt(str.slice(0, f.m.index)));
    var el = document.createElement(f.rule.tag);
    el.className = f.rule.cls ? ('redmark ' + f.rule.cls) : 'redmark';
    if (f.rule.literal) el.appendChild(txt(f.m[1]));
    else emitInline(el, f.m[1], enabled);
    parent.appendChild(el);
    str = str.slice(f.m.index + f.m[0].length);
  }
}
function render(text, enabled) {
  var frag = document.createDocumentFragment();
  emitInline(frag, maskEscapes(text), enabled);
  return serialize(frag);
}

// inSkippableContext (copie conforme)
var SKIP_TAGS = { A: 1, CODE: 1, PRE: 1, KBD: 1, SAMP: 1, TT: 1, TEXTAREA: 1,
  SCRIPT: 1, STYLE: 1, SELECT: 1, OPTION: 1, BUTTON: 1 };
var SKIP_CLASS = /(^|\s)(cita|cit\d?|cback|code|spoiler|sign|signature|sig|alerte|edited)(\s|$)/i;
function inSkippableContext(node, root) {
  for (var el = node.parentNode; el && el !== root && el.nodeType === 1; el = el.parentNode) {
    if (SKIP_TAGS[el.tagName]) return true;
    if (el.tagName === 'TABLE') return true;
    var cls = el.className;
    if (typeof cls === 'string' && SKIP_CLASS.test(cls)) return true;
  }
  return false;
}

// =========================================================================
// ASSERTIONS
// =========================================================================
var pass = 0, fail = 0;
function eq(label, got, exp) {
  if (got === exp) { pass++; }
  else { fail++; console.log('FAIL ' + label + '\n  attendu: ' + JSON.stringify(exp) + '\n  obtenu : ' + JSON.stringify(got)); }
}

var DEFAULT = { code: true, bold: true, boldu: false, strike: true, italic: false, italicu: false };
var ALL = { code: true, bold: true, boldu: true, strike: true, italic: true, italicu: true };

// --- 1. Moteur inline ---
eq('code flagship', render('`test`', DEFAULT), '<code class="redmark redmark-code">test</code>');
eq('code inline', render('voici `du code` la', DEFAULT), 'voici <code class="redmark redmark-code">du code</code> la');
eq('gras', render('**gras**', DEFAULT), '<strong class="redmark">gras</strong>');
eq('barre', render('~~barre~~', DEFAULT), '<del class="redmark">barre</del>');
eq('code protege gras', render('`**x**`', DEFAULT), '<code class="redmark redmark-code">**x**</code>');
eq('imbrication gras>code', render('**a `b`**', DEFAULT), '<strong class="redmark">a <code class="redmark redmark-code">b</code></strong>');
eq('faux positif multiplication', render('a * b * c', DEFAULT), 'a * b * c');
eq('faux positif snake_case', render('my_var_name ok', DEFAULT), 'my_var_name ok');
eq('faux positif exponentiation', render('2 ** 8 sans pair', DEFAULT), '2 ** 8 sans pair');
eq('italique on-demande', render('*ital*', ALL), '<em class="redmark">ital</em>');
eq('italique underscore', render('_ital_', ALL), '<em class="redmark">ital</em>');
eq('echappement code', render('\\`pas code\\`', DEFAULT), '`pas code`');
eq('echappement gras', render('\\*\\*pas gras\\*\\*', DEFAULT), '**pas gras**');
eq('multi gras', render('**a** et **b**', DEFAULT), '<strong class="redmark">a</strong> et <strong class="redmark">b</strong>');
eq('gras avec espace au bord', render('** pas gras **', DEFAULT), '** pas gras **');
eq('backticks vides', render('rien `` ici', DEFAULT), 'rien `` ici');

// --- 2. inSkippableContext (structures HFR reelles, verifiees le 2026-06-14) ---
// mkEl cable parentNode des enfants ; para.appendChild cable le conteneur a la racine.
var para = mkEl('div', ''); // racine = #para{N}

// citation : div.container > table.citation > tr > td > texte  (verifie sur HFR)
var citTxt = mkText('texte cite avec `code`');
para.appendChild(mkEl('div', 'container', [ mkEl('table', 'citation', [ mkEl('tr', 'none', [ mkEl('td', '', [ citTxt ]) ]) ]) ]));
eq('skip citation (table)', inSkippableContext(citTxt, para), true);

// signature : span.signature > texte  (verifie sur HFR, dans le para)
var sigTxt = mkText('ma signature **non rendue**');
para.appendChild(mkEl('span', 'signature', [ sigTxt ]));
eq('skip signature', inSkippableContext(sigTxt, para), true);

// lien : a > texte
var aTxt = mkText('lien `non rendu`');
para.appendChild(mkEl('a', 'cLink', [ aTxt ]));
eq('skip lien (a)', inSkippableContext(aTxt, para), true);

// code HFR : pre > texte
var preTxt = mkText('bloc code');
para.appendChild(mkEl('pre', '', [ preTxt ]));
eq('skip code (pre)', inSkippableContext(preTxt, para), true);

// corps direct du message : NON skippe
var bodyTxt = mkText('corps `rendu`');
para.appendChild(bodyTxt);
eq('corps rendu (non skip)', inSkippableContext(bodyTxt, para), false);

// texte dans un span neutre du corps : NON skippe
var spanTxt = mkText('emphase');
para.appendChild(mkEl('span', 'fontd', [ spanTxt ]));
eq('span neutre (non skip)', inSkippableContext(spanTxt, para), false);

// --- 3. Garde anti-derive : coherence avec le .user.js livre ---
var src = fs.readFileSync(path.join(__dirname, '..', 'hfr-redmark.user.js'), 'utf8');
RULES.forEach(function (r) {
  eq('regex "' + r.name + '" presente dans le .user.js', src.indexOf(r.re.source) !== -1, true);
});
eq('SKIP_CLASS coherente', src.indexOf(SKIP_CLASS.source) !== -1, true);
eq('version 0.1.0 dans le .user.js', /@version\s+0\.1\.0/.test(src), true);
var changelog = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
eq('version 0.1.0 dans le CHANGELOG', /^##\s+0\.1\.0/m.test(changelog), true);

// =========================================================================
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
