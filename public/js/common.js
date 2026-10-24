/* Shared browser helpers for TALENT TWIN */
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
  };

  async function api(method, path, body, token) {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = 'Bearer ' + token;
    let res;
    try { res = await fetch('/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined }); }
    catch { const e = new Error('Network error — check your connection.'); e.status = 0; throw e; }
    let data = null; try { data = await res.json(); } catch { /* empty */ }
    if (!res.ok) { const e = new Error((data && (data.error || data.message)) || ('Request failed (' + res.status + ')')); e.status = res.status; e.data = data; throw e; }
    return data;
  }

  let toastTimer;
  function toast(msg, ms) {
    let t = $('#tt-toast');
    if (!t) { t = document.createElement('div'); t.id = 'tt-toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.remove('hide');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hide'), ms || 3200);
  }

  function modal(html, { onClose } = {}) {
    const o = document.createElement('div'); o.className = 'overlay';
    o.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' + html + '</div>';
    const close = () => { o.remove(); onClose && onClose(); };
    o.addEventListener('click', e => { if (e.target === o || e.target.closest('[data-close]')) close(); });
    document.body.appendChild(o);
    return { el: o, close };
  }

  function confirmBox(title, text, okLabel) {
    return new Promise(resolve => {
      const m = modal('<h2>' + esc(title) + '</h2><p class="muted" style="margin-top:8px">' + text + '</p><div class="btn-row" style="justify-content:flex-end;margin-top:16px"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" data-ok>' + esc(okLabel || 'Confirm') + '</button></div>',
        { onClose: () => resolve(false) });
      m.el.querySelector('[data-ok]').addEventListener('click', () => { m.el.remove(); resolve(true); });
    });
  }

  const fmtTime = iso => iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
  function fmtDuration(ms) {
    if (ms == null || !Number.isFinite(ms)) return '—';
    const s = Math.max(0, Math.round(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
  }
  const pct = (v, max) => Math.max(0, Math.min(100, (Number(v) || 0) / max * 100));

  window.TTUI = { esc, $, $$, store, api, toast, modal, confirmBox, fmtTime, fmtDuration, pct };
})();
