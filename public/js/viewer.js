/* Protected in-app document viewer: view-only, no download link.
 * Files are fetched in pieces through the authenticated API and drawn onto canvases / rendered inline
 * with a watermark. This deters downloading; no web page can stop screenshots. */
(function () {
  'use strict';
  const { esc, api, toast } = window.TTUI;
  const loaded = {};
  function loadScript(src) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load viewer component')); document.head.appendChild(s); });
    return loaded[src];
  }

  function watermark(el, text) {
    const w = document.createElement('div'); w.className = 'watermark';
    const rows = 40, cols = 6;   // fixed pixel spacing; overflow is clipped
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const s = document.createElement('span'); s.textContent = text;
      s.style.top = (r * 170 + 40) + 'px'; s.style.left = (c * 320 - 80 + (r % 2) * 160) + 'px'; w.appendChild(s);
    }
    el.appendChild(w);
  }

  const blockKeys = e => {
    const k = (e.key || '').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && ['s', 'p', 'c', 'a', 'u'].includes(k)) { e.preventDefault(); e.stopPropagation(); toast('Downloading, printing and copying are disabled for case documents.'); }
    if (k === 'escape') close();
  };
  let current = null;
  function close() {
    if (!current) return;
    current.remove(); current = null;
    document.removeEventListener('keydown', blockKeys, true);
    document.body.style.overflow = '';
  }

  async function open(docId, token, wmText, title) {
    close();
    const o = document.createElement('div'); o.className = 'viewer-overlay';
    o.innerHTML = '<div class="viewer-bar"><span class="title">' + esc(title || 'Document') + '</span><span class="small" style="color:#9aa4b8">View only</span>' +
      '<button class="btn btn-sm" data-zoom="-1" aria-label="Zoom out">−</button><button class="btn btn-sm" data-zoom="1" aria-label="Zoom in">+</button>' +
      '<button class="btn btn-sm" data-x>Close</button></div><div class="viewer-body" tabindex="0"><p style="color:#c9cfdb;text-align:center;margin-top:40px">Loading…</p></div>';
    document.body.appendChild(o); current = o; document.body.style.overflow = 'hidden';
    o.addEventListener('contextmenu', e => e.preventDefault());
    o.addEventListener('dragstart', e => e.preventDefault());
    o.addEventListener('copy', e => e.preventDefault());
    document.addEventListener('keydown', blockKeys, true);
    o.querySelector('[data-x]').addEventListener('click', close);
    const body = o.querySelector('.viewer-body');
    let zoom = 1; let rerender = null;
    o.querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', () => {
      zoom = Math.max(0.6, Math.min(2.4, zoom + Number(b.dataset.zoom) * 0.2));
      if (rerender) rerender(); else body.querySelectorAll('.viewer-doc,.viewer-page').forEach(el => { el.style.zoom = zoom; });
    }));

    try {
      const meta = await api('GET', '/doc/' + docId, null, token);
      const parts = [];
      for (let i = 0; i < meta.chunks; i++) {
        const msg = body.querySelector('p'); if (msg && meta.chunks > 1) msg.textContent = 'Loading… ' + Math.round(i / meta.chunks * 100) + '%';
        const r = await fetch('/api/doc/' + docId + '/chunk/' + i, { cache: 'no-store', headers: { authorization: 'Bearer ' + token } });
        if (!r.ok) throw new Error('The document could not be loaded (' + r.status + ').');
        parts.push(new Uint8Array(await r.arrayBuffer()));
      }
      const total = parts.reduce((n, a) => n + a.length, 0); const all = new Uint8Array(total); let off = 0;
      parts.forEach(a => { all.set(a, off); off += a.length; });
      const buf = all.buffer;
      body.innerHTML = '';
      if (meta.kind === 'pdf') {
        const pdfjs = await import('/vendor/pdfjs/pdf.min.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
        const renderAll = async () => {
          body.innerHTML = '';
          const width = Math.min(body.clientWidth - 36, 1000) * zoom; const dpr = Math.min(window.devicePixelRatio || 1, 2);
          for (let i = 1; i <= pdf.numPages; i++) {
            if (!current) return;
            const page = await pdf.getPage(i);
            const vp1 = page.getViewport({ scale: 1 }); const scale = width / vp1.width; const vp = page.getViewport({ scale: scale * dpr });
            const wrap = document.createElement('div'); wrap.className = 'viewer-page';
            const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; c.style.width = (vp.width / dpr) + 'px';
            wrap.appendChild(c); watermark(wrap, wmText); body.appendChild(wrap);
            await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
          }
        };
        rerender = renderAll; await renderAll();
      } else if (meta.kind === 'image') {
        const blob = new Blob([buf], { type: meta.mime }); const bmp = await createImageBitmap(blob);
        const draw = () => {
          body.innerHTML = ''; const wrap = document.createElement('div'); wrap.className = 'viewer-page';
          const c = document.createElement('canvas'); const maxW = Math.min(body.clientWidth - 36, 1100) * zoom; const s = Math.min(1 * zoom, maxW / bmp.width);
          c.width = bmp.width * s; c.height = bmp.height * s; c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
          wrap.appendChild(c); watermark(wrap, wmText); body.appendChild(wrap);
        };
        rerender = draw; draw();
      } else if (meta.kind === 'docx') {
        await loadScript('/vendor/mammoth.browser.min.js');
        const out = await window.mammoth.convertToHtml({ arrayBuffer: buf });
        const d = document.createElement('div'); d.className = 'viewer-doc'; d.innerHTML = sanitize(out.value); watermark(d, wmText); body.appendChild(d);
      } else if (meta.kind === 'xlsx' || meta.kind === 'csv') {
        await loadScript('/vendor/xlsx.full.min.js');
        const wb = meta.kind === 'csv' ? window.XLSX.read(new TextDecoder().decode(buf), { type: 'string' }) : window.XLSX.read(buf, { type: 'array' });
        const d = document.createElement('div'); d.className = 'viewer-doc';
        d.innerHTML = wb.SheetNames.map(n => '<h3 style="margin:6px 0 10px">' + esc(n) + '</h3><div class="table-wrap">' + sanitize(window.XLSX.utils.sheet_to_html(wb.Sheets[n], { header: '', footer: '' })) + '</div>').join('<br>');
        watermark(d, wmText); body.appendChild(d);
      } else {
        const d = document.createElement('div'); d.className = 'viewer-doc';
        const pre = document.createElement('pre'); pre.textContent = new TextDecoder().decode(buf); d.appendChild(pre); watermark(d, wmText); body.appendChild(d);
      }
    } catch (e) {
      body.innerHTML = '<div class="viewer-doc"><p><b>Could not open this document.</b></p><p class="muted">' + esc(e.message) + '</p></div>';
    }
  }

  /* Keep only harmless markup from converted Word/Excel content. */
  function sanitize(html) {
    const t = document.createElement('template'); t.innerHTML = html;
    t.content.querySelectorAll('script,style,iframe,object,embed,link,meta,form,input,button').forEach(n => n.remove());
    t.content.querySelectorAll('*').forEach(n => {
      [...n.attributes].forEach(a => {
        const name = a.name.toLowerCase();
        if (name.startsWith('on') || name === 'srcset' || (['href', 'src', 'xlink:href'].includes(name) && !/^data:image\/(png|jpe?g|gif|webp);/i.test(a.value) && name !== 'href')) n.removeAttribute(a.name);
        if (name === 'href') n.removeAttribute(a.name);
      });
    });
    return t.innerHTML;
  }

  window.TTViewer = { open, close };
})();
