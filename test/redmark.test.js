// Tests RedMark — jsdom + require du userscript reel (source unique, zero copie).
//   npm test   (ou: node test/redmark.test.js)
'use strict';
var fs = require('fs');
var path = require('path');
var JSDOM = require('jsdom').JSDOM;

// --- DOM + stubs GM avant le require (le userscript lit document/GM au chargement) ---
var dom = new JSDOM('<!DOCTYPE html><body></body>', { url: 'https://forum.hardware.fr/' });
global.window = dom.window;
global.document = dom.window.document;
global.NodeFilter = dom.window.NodeFilter;
global.GM_addStyle = function () {};
global.GM_registerMenuCommand = function () {};
global.GM_getValue = function (k, d) { return d; };
global.GM_setValue = function () {};

var rm = require('../hfr-redmark.user.js');
var document = global.document;

// =========================================================================
// Helpers
// =========================================================================
function renderInline(text, rules) {
  var frag = document.createDocumentFragment();
  rm.emitInline(frag, rm.maskEscapes(text), rules);
  var div = document.createElement('div');
  div.appendChild(frag);
  return div.innerHTML;
}
function para(html) {
  var p = document.createElement('div');
  p.innerHTML = html;
  return p;
}
function firstText(node) { // premier noeud texte descendant
  if (node.nodeType === 3) return node;
  for (var i = 0; i < node.childNodes.length; i++) {
    var r = firstText(node.childNodes[i]); if (r) return r;
  }
  return null;
}

var pass = 0, fail = 0;
function eq(label, got, exp) {
  if (got === exp) { pass++; }
  else { fail++; console.log('FAIL ' + label + '\n  attendu: ' + JSON.stringify(exp) + '\n  obtenu : ' + JSON.stringify(got)); }
}

var DEFAULT = { code: true, bold: true, boldu: false, strike: true, italic: false, italicu: false };
var ALL = { code: true, bold: true, boldu: true, strike: true, italic: true, italicu: true };

// =========================================================================
// 1. Moteur inline
// =========================================================================
eq('code flagship', renderInline('`test`', DEFAULT), '<code class="redmark redmark-code">test</code>');
eq('code inline', renderInline('voici `du code` la', DEFAULT), 'voici <code class="redmark redmark-code">du code</code> la');
eq('gras', renderInline('**gras**', DEFAULT), '<strong class="redmark">gras</strong>');
eq('barre', renderInline('~~barre~~', DEFAULT), '<del class="redmark">barre</del>');
eq('code protege gras', renderInline('`**x**`', DEFAULT), '<code class="redmark redmark-code">**x**</code>');
eq('imbrication gras>code', renderInline('**a `b`**', DEFAULT), '<strong class="redmark">a <code class="redmark redmark-code">b</code></strong>');
eq('faux positif multiplication', renderInline('a * b * c', DEFAULT), 'a * b * c');
eq('faux positif snake_case', renderInline('my_var_name ok', DEFAULT), 'my_var_name ok');
eq('faux positif exponentiation', renderInline('2 ** 8 sans pair', DEFAULT), '2 ** 8 sans pair');
eq('italique on-demande', renderInline('*ital*', ALL), '<em class="redmark">ital</em>');
eq('italique underscore', renderInline('_ital_', ALL), '<em class="redmark">ital</em>');
eq('echappement code', renderInline('\\`pas code\\`', DEFAULT), '`pas code`');
eq('echappement gras', renderInline('\\*\\*pas gras\\*\\*', DEFAULT), '**pas gras**');
eq('multi gras', renderInline('**a** et **b**', DEFAULT), '<strong class="redmark">a</strong> et <strong class="redmark">b</strong>');
eq('gras avec espace au bord', renderInline('** pas gras **', DEFAULT), '** pas gras **');
eq('backticks vides', renderInline('rien `` ici', DEFAULT), 'rien `` ici');

// =========================================================================
// 2. inSkippableContext (structures HFR reelles, verifiees le 2026-06-14)
// =========================================================================
var pCit = para('<div class="container"><table class="citation"><tr class="none"><td>texte cite</td></tr></table></div>');
eq('skip citation (table)', rm.inSkippableContext(pCit.querySelector('td').firstChild, pCit), true);
var pSig = para('<span class="signature">ma signature</span>');
eq('skip signature', rm.inSkippableContext(pSig.querySelector('.signature').firstChild, pSig), true);
var pLink = para('<a class="cLink">lien</a>');
eq('skip lien (a)', rm.inSkippableContext(pLink.querySelector('a').firstChild, pLink), true);
var pPre = para('<pre>bloc code</pre>');
eq('skip code (pre)', rm.inSkippableContext(pPre.querySelector('pre').firstChild, pPre), true);
var pBody = para('corps du message');
eq('corps rendu (non skip)', rm.inSkippableContext(pBody.firstChild, pBody), false);
var pSpan = para('<span class="fontd">emphase</span>');
eq('span neutre (non skip)', rm.inSkippableContext(pSpan.querySelector('span').firstChild, pSpan), false);

// =========================================================================
// 4. Blocs (fenced code, listes, task lists) — sur lignes separees par <br>
// =========================================================================
var BLOCK = { code: true, bold: true, boldu: false, strike: true, italic: false, italicu: false,
  fence: true, list: true, task: true };
function blockHtml(html, rules) {
  rm.setPrefs({ enabled: true, perPostToggle: false, rules: rules || BLOCK });
  var p = para(html);
  rm.processBlocks(p);
  return p.innerHTML;
}

// fenced code
eq('fenced code avec langue', blockHtml('```js<br>const x = 1;<br>```'),
  '<pre class="redmark redmark-pre"><code class="language-js">const x = 1;</code></pre>');
eq('fenced code sans langue', blockHtml('```<br>plain<br>```'),
  '<pre class="redmark redmark-pre"><code>plain</code></pre>');
eq('fenced code multi-lignes', blockHtml('```<br>a<br>b<br>```'),
  '<pre class="redmark redmark-pre"><code>a\nb</code></pre>');
eq('fenced code non ferme = inchange', blockHtml('```<br>a<br>b'), '```<br>a<br>b');
eq('fenced code echappe le HTML', blockHtml('```html<br>&lt;div&gt;<br>```'),
  '<pre class="redmark redmark-pre"><code class="language-html">&lt;div&gt;</code></pre>');

// listes non ordonnees
eq('liste a puces (-)', blockHtml('- un<br>- deux<br>- trois'),
  '<ul class="redmark redmark-list"><li>un</li><li>deux</li><li>trois</li></ul>');
eq('liste marqueur *', blockHtml('* x<br>* y'),
  '<ul class="redmark redmark-list"><li>x</li><li>y</li></ul>');
eq('liste marqueur +', blockHtml('+ x<br>+ y'),
  '<ul class="redmark redmark-list"><li>x</li><li>y</li></ul>');
eq('liste un seul item (avec saut de ligne)', blockHtml('- seul<br>'),
  '<ul class="redmark redmark-list"><li>seul</li></ul>');
// Conservateur : une seule ligne sans <br> n'est jamais un bloc (evite de
// transformer un post entier "- bof" en liste).
eq('conservateur : ligne unique sans <br> = inchange', blockHtml('- seul'), '- seul');
eq('liste ordonnee', blockHtml('1. a<br>2. b'),
  '<ol class="redmark redmark-list"><li>a</li><li>b</li></ol>');
eq('liste puis texte', blockHtml('- a<br>- b<br>suite'),
  '<ul class="redmark redmark-list"><li>a</li><li>b</li></ul>suite');
eq('ul puis ol = deux listes', blockHtml('- a<br>1. b'),
  '<ul class="redmark redmark-list"><li>a</li></ul><ol class="redmark redmark-list"><li>b</li></ol>');
eq('pas une liste : tiret sans espace', blockHtml('-pasliste<br>-non'), '-pasliste<br>-non');

// task lists (rendu en symboles Unicode)
eq('task list cochee/decochee', blockHtml('- [ ] a<br>- [x] b'),
  '<ul class="redmark redmark-list">' +
  '<li class="redmark-task"><span class="redmark-check">☐</span> a</li>' +
  '<li class="redmark-task"><span class="redmark-check">☑</span> b</li></ul>');

// integration renderPost : blocs PUIS inline, composes correctement
function renderFull(html, rules) {
  rm.setPrefs({ enabled: true, perPostToggle: false, rules: rules || BLOCK });
  var p = para(html);
  rm.renderPost(p);
  return p.innerHTML;
}
eq('integration liste + inline', renderFull('- **a**<br>- b'),
  '<ul class="redmark redmark-list"><li><strong class="redmark">a</strong></li><li>b</li></ul>');
eq('integration fence non touche par inline', renderFull('```<br>**reste brut**<br>```'),
  '<pre class="redmark redmark-pre"><code>**reste brut**</code></pre>');
var citHtml = '<div class="container"><table class="citation"><tr><td>- a<br>- b</td></tr></table></div>';
eq('integration citation inchangee', renderFull(citHtml), para(citHtml).innerHTML);

// gating + robustesse
var noBlocks = { code: true, bold: true, boldu: false, strike: true, italic: false, italicu: false,
  fence: false, list: false, task: false };
eq('blocs desactives = inchange', blockHtml('```<br>x<br>```', noBlocks), '```<br>x<br>```');
eq('fence entoure de texte', blockHtml('avant<br>```<br>code<br>```<br>apres'),
  'avant<br><pre class="redmark redmark-pre"><code>code</code></pre>apres');

// =========================================================================
// 3. Coherence version (.user.js <-> CHANGELOG)
// =========================================================================
var src = fs.readFileSync(path.join(__dirname, '..', 'hfr-redmark.user.js'), 'utf8');
var ver = (src.match(/@version\s+(\S+)/) || [])[1] || '';
var changelog = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
eq('version presente dans le .user.js', ver.length > 0, true);
eq('version coherente avec CHANGELOG', new RegExp('^##\\s+' + ver.replace(/\./g, '\\.'), 'm').test(changelog), true);

// =========================================================================
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
