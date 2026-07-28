/* Fairy Dice — Weryta answer-rating widget. No dependencies.
 *
 * Two independent axes per answer (scheme: girltech.me/PR/):
 *   base   black = TRUE (agree) | white = FALSE (disagree)
 *   apex   green = neutral | blue = good (like) | red = bad (dislike)
 *
 * Ergonomics: 1 click (corner) = TRUE + feeling; 2 clicks (middle, then
 * corner) = FALSE + feeling. Middle re-click toggles back (pre-save fix).
 * "Undo" after save appends a retract record — never edits (append-only).
 *
 *   FairyDice.mount(el, {lang, statementId, endpoint, onRate})
 *   FairyDice.legend(el, lang)
 *   FairyDice.glyph(code)   // '1g','1b','1r','0g','0b','0r','7' -> svg string
 */
(function (global) {
  'use strict';

  var COL = { neutral: '#00ff00', good: '#0000ff', bad: '#ff0000' };
  var LETTER = { neutral: 'g', good: 'b', bad: 'r' };
  var KEY = 'weryta_fairy_ratings';

  var STR = {
    pl: {
      hint: 'Zgadzasz się? Kliknij od razu narożnik. Nie zgadzasz się? Najpierw kliknij środek. Możesz też nie klikać wcale — brak oceny znaczy „nie wiem”.',
      middle: { t: 'środek: PRAWDA — kliknij, jeśli to nieprawda', f: 'środek: FAŁSZ — kliknij, by wrócić do prawdy' },
      corner: { neutral: 'obojętne', good: 'podoba mi się', bad: 'nie podoba mi się' },
      labels: { '1g': 'PRAWDA', '1b': 'PRAWDA + DOBRE', '1r': 'PRAWDA + ZŁE', '0g': 'FAŁSZ', '0b': 'FAŁSZ + DOBRE', '0r': 'FAŁSZ + ZŁE', '7': 'NIE WIEM' },
      savedLocal: 'zapisano lokalnie w tej przeglądarce',
      savedRemote: 'zapisano w ledgerze ocen',
      saveFailed: 'serwer niedostępny — zapisano lokalnie',
      undo: 'Cofnij ocenę', undone: 'ocena cofnięta'
    },
    en: {
      hint: 'Agree? Click a corner right away. Disagree? Click the middle first. You may also not click at all — no rating means “I don’t know”.',
      middle: { t: 'middle: TRUE — click if you think this is false', f: 'middle: FALSE — click to switch back to true' },
      corner: { neutral: 'neutral', good: 'I like it', bad: 'I don’t like it' },
      labels: { '1g': 'TRUE', '1b': 'TRUE AND GOOD', '1r': 'TRUE AND BAD', '0g': 'FALSE', '0b': 'FALSE AND GOOD', '0r': 'FALSE AND BAD', '7': 'UNKNOWN' },
      savedLocal: 'saved locally in this browser',
      savedRemote: 'saved to the ratings ledger',
      saveFailed: 'server unreachable — saved locally',
      undo: 'Undo rating', undone: 'rating retracted'
    }
  };

  var CSS = '' +
    '.fd{max-width:340px}' +
    '.fd-stage{background:#0b0b0e;border-radius:14px;padding:26px;display:flex;justify-content:center}' +
    '.fd-stage svg{width:100%;max-width:260px;height:auto;display:block}' +
    '.fd-hit{cursor:pointer;outline:none}' +
    '.fd-hit:hover,.fd-hit:focus-visible{opacity:.82}' +
    '.fd-hit:focus-visible{stroke:#fff;stroke-width:5}' +
    '.fd-caption{font-size:14px;margin:10px 2px 0;min-height:2.6em}' +
    '.fd-label{font-family:ui-monospace,monospace;font-weight:700;letter-spacing:.04em}' +
    '.fd-status{opacity:.75}' +
    '.fd-undo{font:inherit;font-size:13.5px;margin-top:6px;padding:6px 14px;border-radius:8px;border:1px solid currentColor;background:none;color:inherit;cursor:pointer}' +
    '.fd-undo:hover{opacity:.75}' +
    '.fd-legend{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;max-width:560px}' +
    '@media (max-width:480px){.fd-legend{grid-template-columns:repeat(2,minmax(0,1fr))}}' +
    '.fd-legend .fd-cell{background:#0b0b0e;border-radius:12px;padding:14px;text-align:center}' +
    '.fd-legend svg{width:76px;height:auto}' +
    '.fd-legend .fd-name{color:#e7edf3;font-family:ui-monospace,monospace;font-size:11.5px;letter-spacing:.05em;margin-top:8px}' +
    '.fd-legend .fd-sub{color:#94a2b0;font-size:11.5px;margin-top:2px}';

  function injectCss() {
    if (document.getElementById('fd-css')) return;
    var s = document.createElement('style');
    s.id = 'fd-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* Input triforce: green apex, red BL, blue BR, toggleable middle. */
  function inputSvg(truth, t) {
    var mid = truth ? '#000000' : '#ffffff';
    var midLbl = truth ? t.middle.t : t.middle.f;
    /* no stroke: the four triangles must touch seamlessly */
    function tri(pts, fill, cls, label) {
      return '<polygon points="' + pts + '" fill="' + fill + '"' +
        (cls ? ' class="fd-hit" data-k="' + cls + '" tabindex="0" role="button" aria-label="' + label + '"' : '') + '/>';
    }
    return '<svg viewBox="0 0 200 176" xmlns="http://www.w3.org/2000/svg">' +
      tri('100,8 54,88 146,88', COL.neutral, 'neutral', t.corner.neutral) +
      tri('54,88 8,168 100,168', COL.bad, 'bad', t.corner.bad) +
      tri('146,88 100,168 192,168', COL.good, 'good', t.corner.good) +
      tri('54,88 146,88 100,168', mid, 'mid', midLbl) +
      '</svg>';
  }

  /* Result glyph: fd{1|0}{g|b|r} — big base triangle, colored apex (fd*.svg geometry /10).
     '7' = the seventh state: the die did not land — outline only, nothing filled. */
  function glyph(code) {
    if (code === '7') {
      return '<svg viewBox="-6 -6 204 204" xmlns="http://www.w3.org/2000/svg">' +
        '<polygon points="96,23.3 12,168.7 180,168.7" fill="none" stroke="#94a2b0" stroke-width="4" stroke-dasharray="10 8" stroke-linejoin="round"/>' +
        '</svg>';
    }
    var base = code[0] === '1' ? '#000000' : '#ffffff';
    var apex = { g: COL.neutral, b: COL.good, r: COL.bad }[code[1]];
    return '<svg viewBox="-6 -6 204 204" xmlns="http://www.w3.org/2000/svg">' +
      '<polygon points="96,23.3 12,168.7 180,168.7" fill="' + base + '" stroke="#ffffff" stroke-width="4.8" stroke-linejoin="round"/>' +
      '<polygon points="96,23.3 58.2,88.7 133.8,88.7" fill="' + apex + '" stroke="#ffffff" stroke-width="3.6" stroke-linejoin="round"/>' +
      '</svg>';
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function localAll() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
  }
  function localSave(rec) {
    var a = localAll(); a.push(rec); localStorage.setItem(KEY, JSON.stringify(a));
  }
  function localDrop(id) {
    localStorage.setItem(KEY, JSON.stringify(localAll().filter(function (r) { return r.id !== id; })));
  }

  function post(endpoint, body) {
    return fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) { if (!r.ok) throw new Error(r.status); });
  }

  function mount(el, opts) {
    injectCss();
    opts = opts || {};
    var t = STR[opts.lang] || STR.pl;
    var state = { truth: true, last: null };

    el.innerHTML = '<div class="fd"><div class="fd-stage"></div>' +
      '<p class="fd-caption"></p><button class="fd-undo" hidden></button></div>';
    var stage = el.querySelector('.fd-stage');
    var caption = el.querySelector('.fd-caption');
    var undoBtn = el.querySelector('.fd-undo');
    undoBtn.textContent = t.undo;

    function renderInput() {
      stage.innerHTML = inputSvg(state.truth, t);
      caption.textContent = t.hint;
      undoBtn.hidden = true;
      stage.querySelectorAll('.fd-hit').forEach(function (p) {
        p.addEventListener('click', onHit);
        p.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onHit.call(p); }
        });
      });
    }

    function onHit() {
      var k = this.getAttribute('data-k');
      if (k === 'mid') { state.truth = !state.truth; renderInput(); return; }
      finish(k);
    }

    function finish(feeling) {
      var code = (state.truth ? '1' : '0') + LETTER[feeling];
      var rec = {
        event: 'rate', id: uid(),
        statement_id: opts.statementId || 'unknown',
        truth: state.truth, feeling: feeling, code: code,
        lang: opts.lang || 'pl', client_ts: new Date().toISOString()
      };
      state.last = rec;
      stage.innerHTML = glyph(code);
      undoBtn.hidden = false;
      var label = t.labels[code];
      function show(status) {
        caption.innerHTML = '<span class="fd-label">' + label + '</span> · <span class="fd-status">' + status + '</span>';
      }
      if (opts.endpoint) {
        rec.saved = 'remote';
        post(opts.endpoint, rec).then(function () { show(t.savedRemote); })
          .catch(function () { rec.saved = 'local'; localSave(rec); show(t.saveFailed); });
        show('…');
      } else {
        rec.saved = 'local'; localSave(rec); show(t.savedLocal);
      }
      if (opts.onRate) opts.onRate(rec);
    }

    undoBtn.addEventListener('click', function () {
      var rec = state.last;
      state.last = null;
      if (rec) {
        if (rec.saved === 'remote' && opts.endpoint) {
          post(opts.endpoint, { event: 'retract', of: rec.id }).catch(function () {});
        } else {
          localDrop(rec.id);
        }
      }
      state.truth = true;
      renderInput();
      caption.textContent = t.undone + ' — ' + t.hint;
    });

    renderInput();
  }

  function legend(el, lang) {
    injectCss();
    var t = STR[lang] || STR.pl;
    var subs = {
      pl: { '1g': 'zgadzam się', '1b': 'zgadzam się i podoba mi się to', '1r': 'zgadzam się, ale mi się to nie podoba', '0g': 'nie zgadzam się', '0b': 'nie zgadzam się, ale podoba mi się to', '0r': 'nie zgadzam się i nie podoba mi się to', '7': 'brak oceny — kość nie upadła' },
      en: { '1g': 'I agree', '1b': 'agree and like it', '1r': 'agree but dislike it', '0g': 'I disagree', '0b': 'disagree, but like it', '0r': 'disagree and dislike it', '7': 'no rating — the die didn’t land' }
    }[lang] || {};
    el.innerHTML = '<div class="fd-legend">' + ['1g', '1b', '1r', '0g', '0b', '0r', '7'].map(function (c) {
      return '<div class="fd-cell">' + glyph(c) +
        '<div class="fd-name">' + t.labels[c] + '</div>' +
        '<div class="fd-sub">' + (subs[c] || '') + '</div></div>';
    }).join('') + '</div>';
  }

  global.FairyDice = { mount: mount, legend: legend, glyph: glyph };
})(window);
