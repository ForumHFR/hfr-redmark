// ==UserScript==
// @name         [HFR] RedMark
// @namespace    https://github.com/ForumHFR/hfr-redmark
// @icon         https://www.google.com/s2/favicons?sz=64&domain=hardware.fr
// @version      0.2.0
// @description  Rendu Markdown dans les posts en lecture sur forum.hardware.fr (code inline/bloc, gras, barre, listes, taches...)
// @author       xat
// @match        https://forum.hardware.fr/forum2.php*
// @match        https://forum.hardware.fr/hfr/*
// @run-at       document-end
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM.addStyle
// @grant        GM.registerMenuCommand
// @grant        GM.getValue
// @grant        GM.setValue
// @updateURL    https://github.com/ForumHFR/hfr-redmark/raw/refs/heads/master/hfr-redmark.user.js
// @downloadURL  https://github.com/ForumHFR/hfr-redmark/raw/refs/heads/master/hfr-redmark.user.js
// @license      MIT
// ==/UserScript==
// --- Changelog ---
//   0.2.0 - Blocs : code fence ```, listes (- * + 1.), task lists [ ]/[x] (rendu ligne par ligne entre <br>)
//   0.1.0 - MVP : rendu inline (code, gras, barre), bascule par post, preferences, parsing DOM safe
// ---

(function () {
  'use strict';

  // =====================================================================
  // SHIMS GM (compat Tampermonkey / Violentmonkey / Greasemonkey v4+)
  // =====================================================================

  if (typeof GM_addStyle === 'undefined') {
    /* global GM */
    if (typeof GM !== 'undefined' && GM.addStyle) {
      GM_addStyle = function (css) { return GM.addStyle(css); };
    } else {
      GM_addStyle = function (css) {
        var s = document.createElement('style');
        s.textContent = css;
        (document.head || document.documentElement).appendChild(s);
        return s;
      };
    }
  }
  if (typeof GM_registerMenuCommand === 'undefined') {
    if (typeof GM !== 'undefined' && GM.registerMenuCommand) {
      GM_registerMenuCommand = function (name, fn) { return GM.registerMenuCommand(name, fn); };
    } else {
      GM_registerMenuCommand = function () {}; // noop si non supporte
    }
  }
  // GM_getValue / GM_setValue : versions sync (TM/VM). Fallback localStorage.
  if (typeof GM_getValue === 'undefined') {
    GM_getValue = function (key, def) {
      try {
        var v = localStorage.getItem('GM_' + key);
        return v === null ? def : v;
      } catch (e) { return def; }
    };
  }
  if (typeof GM_setValue === 'undefined') {
    GM_setValue = function (key, val) {
      try { localStorage.setItem('GM_' + key, val); } catch (e) {}
    };
  }

  // =====================================================================
  // CONFIG
  // =====================================================================

  var CONFIG = {
    prefsKey: 'hfr_redmark_prefs',
    // Selecteurs DOM HFR
    postTable: 'table.messagetable',
    postAnchor: 'td.messCase1 a[name^="t"]',   // ancre = numreponse (absente sur les pubs)
    toolbar: 'td.messCase2 div.toolbar',
    toolbarRight: 'td.messCase2 div.toolbar div.right'
  };

  // Regles inline disponibles, dans l'ordre de PRIORITE (le code protege le reste).
  // literal = pas de recursion dans le contenu (le code reste brut).
  var RULES = [
    { name: 'code',    label: 'Code inline  `code`',     tag: 'code',   cls: 'redmark-code', literal: true,
      re: /`([^`\n]+)`/ },
    { name: 'bold',    label: 'Gras  **texte**',         tag: 'strong', cls: '',
      re: /\*\*(\S(?:[^*]*?\S)?)\*\*/ },
    { name: 'boldu',   label: 'Gras  __texte__',         tag: 'strong', cls: '',
      re: /__(\S(?:[^_]*?\S)?)__/ },
    { name: 'strike',  label: 'Barré  ~~texte~~',    tag: 'del',    cls: '',
      re: /~~(\S(?:[^~]*?\S)?)~~/ },
    { name: 'italic',  label: 'Italique  *texte*',       tag: 'em',     cls: '',
      re: /\*(\S(?:[^*]*?\S)?)\*/ },
    { name: 'italicu', label: 'Italique  _texte_',       tag: 'em',     cls: '',
      re: /_(\S(?:[^_]*?\S)?)_/ }
  ];

  // Regles bloc-level (rendues ligne par ligne entre les <br>), pour l'UI.
  var BLOCKS = [
    { name: 'fence', label: 'Bloc de code  ```' },
    { name: 'list',  label: 'Listes  -  *  +  1.' },
    { name: 'task',  label: 'Cases à cocher  - [ ] / - [x]' },
    { name: 'quote', label: 'Citation  > texte' }
  ];

  // Defauts : toutes les regles actives. L'italique (*texte* / _texte_) et le
  // gras __ peuvent produire des faux positifs (snake_case, multiplications...) :
  // ils restent desactivables dans les preferences.
  var DEFAULTS = {
    enabled: true,
    perPostToggle: true,
    rules: {
      code: true, bold: true, boldu: true, strike: true, italic: true, italicu: true,
      fence: true, list: true, task: true, quote: true
    }
  };

  // =====================================================================
  // PREFERENCES
  // =====================================================================

  function loadPrefs() {
    var prefs;
    try { prefs = JSON.parse(GM_getValue(CONFIG.prefsKey, '') || '{}'); }
    catch (e) { prefs = {}; }
    var out = {
      enabled: prefs.enabled !== false,
      perPostToggle: prefs.perPostToggle !== false,
      rules: {}
    };
    var keys = Object.keys(DEFAULTS.rules);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      out.rules[k] = (prefs.rules && typeof prefs.rules[k] === 'boolean') ? prefs.rules[k] : DEFAULTS.rules[k];
    }
    return out;
  }

  function savePrefs(prefs) {
    try { GM_setValue(CONFIG.prefsKey, JSON.stringify(prefs)); } catch (e) {}
  }

  var prefs = loadPrefs();

  // =====================================================================
  // STYLES
  // =====================================================================

  GM_addStyle(
    '.redmark-code{font-family:Consolas,"Liberation Mono","Courier New",monospace;' +
      'background:rgba(127,127,127,.16);padding:.05em .35em;border-radius:4px;' +
      'font-size:.92em;white-space:pre-wrap;}' +
    'del.redmark{opacity:.75;}' +
    'pre.redmark-pre{font-family:Consolas,"Liberation Mono","Courier New",monospace;' +
      'background:rgba(127,127,127,.13);border:1px solid rgba(127,127,127,.25);' +
      'border-radius:5px;padding:8px 11px;margin:6px 0;overflow:auto;font-size:.9em;}' +
    'pre.redmark-pre code{background:none;padding:0;white-space:pre;}' +
    'ul.redmark-list,ol.redmark-list{margin:5px 0 5px 4px;padding-left:22px;}' +
    'ul.redmark-list li,ol.redmark-list li{margin:1px 0;}' +
    'li.redmark-task{list-style:none;margin-left:-18px;}' +
    '.redmark-check{display:inline-block;width:1em;}' +
    'blockquote.redmark-quote{margin:6px 0;padding:2px 12px;border-left:3px solid #b9c2cc;' +
      'color:#5a6573;background:rgba(127,127,127,.07);}' +
    '.redmark-toggle{display:inline-block;cursor:pointer;font:11px/1.4 monospace;' +
      'padding:0 5px;margin-left:8px;border:1px solid #b9c2cc;border-radius:3px;' +
      'color:#8b97a4;background:transparent;user-select:none;vertical-align:middle;}' +
    '.redmark-toggle:hover{border-color:#1f6feb;color:#1f6feb;}' +
    '.redmark-toggle.on{color:#1f6feb;border-color:#1f6feb;font-weight:bold;}' +
    '#hfr-rm-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;' +
      'display:flex;align-items:center;justify-content:center;}' +
    '#hfr-rm-panel{background:#fff;color:#222;max-width:440px;width:92%;border-radius:8px;' +
      'padding:22px 24px;font:13px/1.5 Arial,sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.35);}' +
    '#hfr-rm-panel h2{margin:0 0 16px;font-size:16px;}' +
    '#hfr-rm-panel label{display:block;margin:7px 0;cursor:pointer;}' +
    '#hfr-rm-panel .sep{border-top:1px solid #e3e3e3;margin:14px 0 10px;}' +
    '#hfr-rm-panel .muted{color:#888;font-size:11px;margin:2px 0 0 22px;}' +
    '#hfr-rm-actions{margin-top:20px;text-align:right;}' +
    '#hfr-rm-actions button{margin-left:8px;padding:6px 14px;border-radius:4px;' +
      'border:1px solid #ccc;background:#f4f4f4;cursor:pointer;font-size:13px;}' +
    '#hfr-rm-actions button.primary{background:#1f6feb;border-color:#1f6feb;color:#fff;}'
  );

  // =====================================================================
  // MOTEUR MARKDOWN (inline)
  // =====================================================================

  // Masquage des echappements \` \* \_ \~ \\ : on remplace par des caracteres
  // de la zone privee Unicode pour que les regex ne les voient pas, puis on
  // restitue le caractere litteral a l'emission du texte.
  var ESC = { '\\': '\uE000', '`': '\uE001', '*': '\uE002', '_': '\uE003', '~': '\uE004' };
  var UNESC = { '\uE000': '\\', '\uE001': '`', '\uE002': '*', '\uE003': '_', '\uE004': '~' };
  var reEscape = /\\([\\`*_~])/g;
  var reUnmask = /[\uE000-\uE004]/g;
  var reMd = /[`*_~\\]/; // detection rapide : y a-t-il quelque chose a faire ?

  function maskEscapes(s) { return s.replace(reEscape, function (m, c) { return ESC[c]; }); }
  function unmask(s) { return s.replace(reUnmask, function (c) { return UNESC[c]; }); }
  function txt(s) { return document.createTextNode(unmask(s)); }

  // Trouve le premier motif (position la plus a gauche, priorite = ordre RULES).
  function firstMatch(str, enabled) {
    var best = null;
    for (var k = 0; k < RULES.length; k++) {
      var rule = RULES[k];
      if (!enabled[rule.name]) continue;
      var m = rule.re.exec(str);
      if (!m) continue;
      if (best === null || m.index < best.m.index) {
        best = { rule: rule, m: m };
        if (m.index === 0) break; // priorite respectee : on ne fera pas mieux
      }
    }
    return best;
  }

  // Construit recursivement les noeuds DOM a partir d'une chaine masquee.
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

  // =====================================================================
  // PARCOURS DOM SAFE
  // =====================================================================

  // Tags dont le contenu ne doit JAMAIS etre touche.
  var SKIP_TAGS = { A: 1, CODE: 1, PRE: 1, KBD: 1, SAMP: 1, TT: 1, TEXTAREA: 1,
    SCRIPT: 1, STYLE: 1, SELECT: 1, OPTION: 1, BUTTON: 1 };
  // Classes HFR a ignorer (citations, code, spoilers, signatures, edition...).
  var SKIP_CLASS = /(^|\s)(cita|cit\d?|cback|code|spoiler|sign|signature|sig|alerte|edited)(\s|$)/i;

  // Un noeud texte est-il dans un contexte a ne pas transformer ?
  function inSkippableContext(node, root) {
    for (var el = node.parentNode; el && el !== root && el.nodeType === 1; el = el.parentNode) {
      if (SKIP_TAGS[el.tagName]) return true;
      if (el.tagName === 'TABLE') return true; // citations HFR = tables imbriquees
      var cls = el.className;
      if (typeof cls === 'string' && SKIP_CLASS.test(cls)) return true;
    }
    return false;
  }

  // =====================================================================
  // MOTEUR MARKDOWN (blocs : fenced code)
  // Sur HFR les lignes sont separees par <br> ; on segmente les noeuds d'un
  // "hote de lignes" par <br>, on detecte les blocs, on remplace les runs.
  // =====================================================================

  var reFenceOpen = /^\s*```(\w*)\s*$/;
  var reFenceClose = /^\s*```\s*$/;
  var reUL = /^\s*[-*+]\s+\S/;          // puce + espace + contenu
  var reOL = /^\s*\d+\.\s+\S/;          // numero. + espace + contenu
  var reStripUL = /^\s*[-*+]\s+/;
  var reStripOL = /^\s*\d+\.\s+/;
  var reQuote = /^\s*>/;                // citation Markdown (distincte du [quote] HFR)
  var reStripQuote = /^\s*>\s?/;

  function listType(text) {
    if (reOL.test(text)) return 'ol';
    if (reUL.test(text)) return 'ul';
    return null;
  }

  function lineText(nodes) {
    var t = '';
    for (var i = 0; i < nodes.length; i++) {
      var v = nodes[i].textContent;
      t += (v != null ? v : (nodes[i].nodeValue || ''));
    }
    return t;
  }

  function hasDirectBr(el) {
    for (var i = 0; i < el.childNodes.length; i++) {
      var c = el.childNodes[i];
      if (c.nodeType === 1 && c.tagName === 'BR') return true;
    }
    return false;
  }

  // L'hote (ou un de ses ancetres sous root) est-il un contexte a ignorer ?
  function hostExcluded(el, root) {
    for (var n = el; n && n.nodeType === 1 && n !== root; n = n.parentNode) {
      if (n.tagName === 'TABLE' || SKIP_TAGS[n.tagName]) return true;
      var cls = n.className;
      if (typeof cls === 'string' && SKIP_CLASS.test(cls)) return true;
    }
    return false;
  }

  // Elements qui cassent une ligne logique : blocs (p, div, listes, citations...)
  // et contextes a ignorer (signature...). Ils ne font partie d'aucune ligne
  // Markdown et coupent les runs (un <p> ne fusionne pas avec ses voisins).
  var BLOCK_BOUNDARY = { P: 1, DIV: 1, UL: 1, OL: 1, PRE: 1, BLOCKQUOTE: 1, TABLE: 1,
    HR: 1, FIGURE: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1 };
  function isBoundaryEl(n) {
    if (n.nodeType !== 1) return false;
    if (BLOCK_BOUNDARY[n.tagName]) return true;
    var cls = n.className;
    return typeof cls === 'string' && SKIP_CLASS.test(cls);
  }

  // Segmente les enfants directs de host en lignes (separateur = <br>).
  // Les elements-frontiere (blocs/skip) sont exclus et inserent une coupure.
  function segmentLines(host) {
    var lines = [];
    var cur = { nodes: [], br: null };
    var kids = Array.prototype.slice.call(host.childNodes);
    for (var i = 0; i < kids.length; i++) {
      var n = kids[i];
      if (n.nodeType === 1 && n.tagName === 'BR') {
        cur.br = n; lines.push(cur); cur = { nodes: [], br: null };
      } else if (isBoundaryEl(n)) {
        lines.push(cur); cur = { nodes: [], br: null };
        lines.push({ nodes: [], br: null, boundary: true });
      } else {
        cur.nodes.push(n);
      }
    }
    lines.push(cur);
    for (var j = 0; j < lines.length; j++) lines[j].text = lines[j].boundary ? '\x00' : lineText(lines[j].nodes);
    return lines;
  }

  // Remplace les lignes [from..to] (+ leurs <br>) par blockEl.
  function replaceLines(host, lines, from, to, blockEl) {
    var anchor = lines[from].nodes[0] || lines[from].br || null;
    host.insertBefore(blockEl, anchor);
    for (var i = from; i <= to; i++) {
      for (var n = 0; n < lines[i].nodes.length; n++) {
        var nd = lines[i].nodes[n];
        if (nd.parentNode === host) host.removeChild(nd);
      }
      if (lines[i].br && lines[i].br.parentNode === host) host.removeChild(lines[i].br);
    }
  }

  function processHost(host) {
    var rules = prefs.rules;
    var lines = segmentLines(host);
    var ops = [];
    var i = 0;
    while (i < lines.length) {
      var open = rules.fence ? reFenceOpen.exec(lines[i].text) : null;
      if (open) {
        var j = i + 1;
        while (j < lines.length && !reFenceClose.test(lines[j].text)) j++;
        if (j < lines.length) { ops.push({ type: 'fence', from: i, to: j, lang: open[1] }); i = j + 1; continue; }
      }
      if (rules.list) {
        var lt = listType(lines[i].text);
        if (lt) {
          var e = i + 1;
          while (e < lines.length && listType(lines[e].text) === lt) e++;
          ops.push({ type: 'list', listType: lt, from: i, to: e - 1 });
          i = e; continue;
        }
      }
      if (rules.quote && reQuote.test(lines[i].text)) {
        var q = i + 1;
        while (q < lines.length && reQuote.test(lines[q].text)) q++;
        ops.push({ type: 'quote', from: i, to: q - 1 });
        i = q; continue;
      }
      i++;
    }
    // applique de la fin vers le debut : les index/refs restent valides
    for (var k = ops.length - 1; k >= 0; k--) applyOp(host, lines, ops[k]);
  }

  function applyOp(host, lines, op) {
    if (op.type === 'fence') {
      var content = [];
      for (var i = op.from + 1; i < op.to; i++) content.push(lines[i].text);
      var pre = document.createElement('pre');
      pre.className = 'redmark redmark-pre';
      var code = document.createElement('code');
      if (op.lang) code.className = 'language-' + op.lang;
      code.appendChild(document.createTextNode(content.join('\n')));
      pre.appendChild(code);
      replaceLines(host, lines, op.from, op.to, pre);
    } else if (op.type === 'list') {
      var listEl = document.createElement(op.listType === 'ol' ? 'ol' : 'ul');
      listEl.className = 'redmark redmark-list';
      var anchor = lines[op.from].nodes[0] || lines[op.from].br || null;
      host.insertBefore(listEl, anchor);
      var stripRe = op.listType === 'ol' ? reStripOL : reStripUL;
      for (var li = op.from; li <= op.to; li++) {
        var item = document.createElement('li');
        var nodes = lines[li].nodes;
        if (nodes.length && nodes[0].nodeType === 3) {
          nodes[0].nodeValue = nodes[0].nodeValue.replace(stripRe, '');
          // task list : "[ ] " / "[x] " en tete de l'item
          if (prefs.rules.task) {
            var tm = /^\[([ xX])\]\s+/.exec(nodes[0].nodeValue);
            if (tm) {
              nodes[0].nodeValue = nodes[0].nodeValue.slice(tm[0].length);
              item.className = 'redmark-task';
              var box = document.createElement('span');
              box.className = 'redmark-check';
              box.appendChild(document.createTextNode(tm[1] === ' ' ? '☐' : '☑'));
              item.appendChild(box);
              item.appendChild(document.createTextNode(' '));
            }
          }
        }
        for (var m = 0; m < nodes.length; m++) item.appendChild(nodes[m]);
        listEl.appendChild(item);
        if (lines[li].br && lines[li].br.parentNode === host) host.removeChild(lines[li].br);
      }
    } else if (op.type === 'quote') {
      var bq = document.createElement('blockquote');
      bq.className = 'redmark redmark-quote';
      var qa = lines[op.from].nodes[0] || lines[op.from].br || null;
      host.insertBefore(bq, qa);
      for (var q = op.from; q <= op.to; q++) {
        var qn = lines[q].nodes;
        if (qn.length && qn[0].nodeType === 3) qn[0].nodeValue = qn[0].nodeValue.replace(reStripQuote, '');
        for (var p = 0; p < qn.length; p++) bq.appendChild(qn[p]);
        if (q < op.to) bq.appendChild(document.createElement('br'));
        if (lines[q].br && lines[q].br.parentNode === host) host.removeChild(lines[q].br);
      }
    }
  }

  function processBlocks(para) {
    var hosts = [];
    // Le para n'est un hote direct que s'il porte des lignes (contexte multi-ligne) ;
    // sinon les vraies lignes sont dans les <p> (structure HFR).
    if (hasDirectBr(para)) hosts.push(para);
    // Chaque <p> est une unite de paragraphe HFR : hote meme sans <br> (ligne unique).
    var ps = para.getElementsByTagName('p');
    for (var i = 0; i < ps.length; i++) {
      if (!hostExcluded(ps[i], para)) hosts.push(ps[i]);
    }
    for (var h = 0; h < hosts.length; h++) processHost(hosts[h]);
  }

  function renderPost(para) {
    if (para.getAttribute('data-redmark') === 'on') return;
    if (para.__redmarkOrig == null) para.__redmarkOrig = para.innerHTML;

    var enabled = prefs.rules;
    // Blocs d'abord (fences/listes) : restructure le DOM avant l'inline, pour
    // que l'inline ne touche pas le contenu des fences et s'applique aux <li>.
    if (enabled.fence || enabled.list || enabled.quote) processBlocks(para);

    var walker = document.createTreeWalker(para, NodeFilter.SHOW_TEXT, null, false);
    var targets = [];
    var n;
    while ((n = walker.nextNode())) {
      if (!n.nodeValue || !reMd.test(n.nodeValue)) continue;
      if (inSkippableContext(n, para)) continue;
      targets.push(n);
    }
    // On remplace apres collecte (modifier le DOM invalide le walker).
    for (var i = 0; i < targets.length; i++) {
      var node = targets[i];
      var masked = maskEscapes(node.nodeValue);
      var hasEscape = masked !== node.nodeValue;
      if (!hasEscape && !firstMatch(masked, enabled)) continue;
      var frag = document.createDocumentFragment();
      emitInline(frag, masked, enabled);
      if (node.parentNode) node.parentNode.replaceChild(frag, node);
    }
    para.setAttribute('data-redmark', 'on');
  }

  function restorePost(para) {
    if (para.__redmarkOrig != null) para.innerHTML = para.__redmarkOrig;
    para.setAttribute('data-redmark', 'off');
  }

  // =====================================================================
  // BASCULE PAR POST
  // =====================================================================

  function injectToggle(table, para) {
    if (table.getAttribute('data-redmark-btn')) return;
    var bar = table.querySelector(CONFIG.toolbarRight) || table.querySelector(CONFIG.toolbar);
    if (!bar) return;

    var btn = document.createElement('span');
    btn.className = 'redmark-toggle';
    btn.title = 'Afficher / masquer le rendu Markdown (RedMark)';
    function refresh() {
      var on = para.getAttribute('data-redmark') === 'on';
      btn.textContent = on ? 'Md' : 'md';
      btn.classList.toggle('on', on);
    }
    btn.addEventListener('click', function () {
      if (para.getAttribute('data-redmark') === 'on') restorePost(para);
      else renderPost(para);
      refresh();
    });
    bar.appendChild(btn);
    table.setAttribute('data-redmark-btn', '1');
    refresh();
  }

  // =====================================================================
  // TRAITEMENT DE LA PAGE
  // =====================================================================

  function setupPost(table) {
    var anchor = table.querySelector(CONFIG.postAnchor);
    if (!anchor) return; // pub / bloc sans post
    var name = anchor.getAttribute('name') || '';
    var num = name.charAt(0) === 't' ? name.slice(1) : name;
    var para = document.getElementById('para' + num);
    if (!para) return;

    if (prefs.enabled) renderPost(para);
    if (prefs.perPostToggle) injectToggle(table, para);
  }

  function processAll() {
    var tables = document.querySelectorAll(CONFIG.postTable);
    for (var i = 0; i < tables.length; i++) setupPost(tables[i]);
  }

  // Re-applique les preferences a toute la page (apres changement de prefs).
  function reapply() {
    var paras = document.querySelectorAll('[id^="para"]');
    for (var i = 0; i < paras.length; i++) {
      var para = paras[i];
      if (prefs.enabled) {
        restorePost(para); // repart de l'original pour appliquer les nouvelles regles
        renderPost(para);
      } else {
        restorePost(para);
      }
    }
    // (re)synchronise les boutons de bascule
    var btns = document.querySelectorAll('.redmark-toggle');
    for (var j = 0; j < btns.length; j++) {
      // le refresh est gere au clic ; on force un re-label simple
    }
  }

  // =====================================================================
  // UI PREFERENCES
  // =====================================================================

  function openPrefsPanel() {
    var existing = document.getElementById('hfr-rm-overlay');
    if (existing) existing.remove();

    var cur = loadPrefs();
    var overlay = document.createElement('div');
    overlay.id = 'hfr-rm-overlay';

    function checkboxes(defs) {
      var s = '';
      for (var i = 0; i < defs.length; i++) {
        s += '<label><input type="checkbox" data-rule="' + defs[i].name + '"' +
          (cur.rules[defs[i].name] ? ' checked' : '') + '> ' + defs[i].label + '</label>';
      }
      return s;
    }

    overlay.innerHTML =
      '<div id="hfr-rm-panel">' +
        '<h2>[HFR] RedMark — Préférences</h2>' +
        '<label><input type="checkbox" id="hfr-rm-enabled"' + (cur.enabled ? ' checked' : '') +
          '> <b>Activer le rendu Markdown</b></label>' +
        '<div class="sep"></div>' +
        '<div style="font-weight:bold;margin-bottom:4px">Syntaxes en ligne</div>' +
        checkboxes(RULES) +
        '<div class="muted">Tout est activé. Désactivez l\'italique / gras __ ' +
          'en cas de faux positifs (snake_case, multiplications...).</div>' +
        '<div class="sep"></div>' +
        '<div style="font-weight:bold;margin-bottom:4px">Blocs</div>' +
        checkboxes(BLOCKS) +
        '<div class="sep"></div>' +
        '<label><input type="checkbox" id="hfr-rm-toggle"' + (cur.perPostToggle ? ' checked' : '') +
          '> Bouton de bascule (md) sur chaque post</label>' +
        '<div id="hfr-rm-actions">' +
          '<button id="hfr-rm-cancel">Annuler</button>' +
          '<button id="hfr-rm-save" class="primary">Enregistrer</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });
    overlay.querySelector('#hfr-rm-cancel').addEventListener('click', function () { overlay.remove(); });
    overlay.querySelector('#hfr-rm-save').addEventListener('click', function () {
      var next = { enabled: false, perPostToggle: false, rules: {} };
      next.enabled = overlay.querySelector('#hfr-rm-enabled').checked;
      next.perPostToggle = overlay.querySelector('#hfr-rm-toggle').checked;
      var boxes = overlay.querySelectorAll('input[data-rule]');
      for (var i = 0; i < boxes.length; i++) {
        next.rules[boxes[i].getAttribute('data-rule')] = boxes[i].checked;
      }
      savePrefs(next);
      prefs = loadPrefs();
      overlay.remove();
      reapply();
    });
  }

  GM_registerMenuCommand('RedMark: Préférences', openPrefsPanel);
  GM_registerMenuCommand('RedMark: Activer / désactiver', function () {
    var cur = loadPrefs();
    cur.enabled = !cur.enabled;
    savePrefs(cur);
    prefs = loadPrefs();
    reapply();
  });

  // =====================================================================
  // INIT
  // =====================================================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', processAll);
  } else {
    processAll();
  }

  // Hook de test (Node/CommonJS) : expose l'API interne. Inerte dans le
  // navigateur (module indefini) — n'affecte pas le userscript livre.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      maskEscapes: maskEscapes,
      emitInline: emitInline,
      firstMatch: firstMatch,
      inSkippableContext: inSkippableContext,
      processBlocks: processBlocks,
      renderPost: renderPost,
      restorePost: restorePost,
      RULES: RULES,
      SKIP_CLASS: SKIP_CLASS,
      SKIP_TAGS: SKIP_TAGS,
      setPrefs: function (p) { prefs = p; },
      getPrefs: function () { return prefs; }
    };
  }
})();
