/* ===== أدوات الصور: ضغط، أبعاد، لون سائد ===== */
window.ImgTools = (function () {
  'use strict';

  async function loadBitmap(file) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) {
      return new Promise((res, rej) => {
        const url = URL.createObjectURL(file); const im = new Image();
        im.onload = () => { URL.revokeObjectURL(url); res(im); }; im.onerror = rej; im.src = url;
      });
    }
  }
  const dim = bm => ({ w: bm.width || bm.naturalWidth, h: bm.height || bm.naturalHeight });

  /* يضغط الصورة إلى JPEG بحدّ أقصى للضلع الأطول ويعيد {blob, base64, dataUrl, w, h} */
  async function compress(file, { maxEdge = 1800, quality = 0.86, type = 'image/jpeg' } = {}) {
    const bm = await loadBitmap(file);
    const { w, h } = dim(bm);
    const k = Math.min(1, maxEdge / Math.max(w, h));
    const W = Math.max(1, Math.round(w * k)), H = Math.max(1, Math.round(h * k));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); }
    ctx.drawImage(bm, 0, 0, W, H);
    const blob = await new Promise(r => cv.toBlob(r, type, quality));
    const dataUrl = await blobToDataUrl(blob);
    return { blob, dataUrl, base64: dataUrl.split(',')[1], w: W, h: H, size: blob.size };
  }
  function blobToDataUrl(blob) {
    return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
  }
  /* اللون السائد (متوسط مُشبَّع قليلاً) — من ملف أو من عنصر صورة */
  async function dominantColor(src) {
    const bm = src instanceof Blob ? await loadBitmap(src) : src;
    const cv = document.createElement('canvas'); cv.width = 24; cv.height = 24;
    const ctx = cv.getContext('2d'); ctx.drawImage(bm, 0, 0, 24, 24);
    const d = ctx.getImageData(0, 0, 24, 24).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 100) continue; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    if (!n) return '#0F4C3A';
    r /= n; g /= n; b /= n;
    // تشبيع خفيف وتعتيم إن كان فاتحاً جداً
    let [hh, ss, ll] = rgb2hsl(r, g, b);
    ss = Math.min(1, ss * 1.25 + 0.05); if (ll > 0.7) ll = 0.55; if (ll < 0.12) ll = 0.18;
    const [R, G, B] = hsl2rgb(hh, ss, ll);
    return '#' + [R, G, B].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  }
  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
    if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); switch (mx) { case r: h = (g - b) / d + (g < b ? 6 : 0); break; case g: h = (b - r) / d + 2; break; default: h = (r - g) / d + 4; } h /= 6; }
    return [h, s, l];
  }
  function hsl2rgb(h, s, l) {
    if (s === 0) return [l * 255, l * 255, l * 255];
    const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = t => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
  }
  const fmtSize = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' م.ب' : Math.round(n / 1024) + ' ك.ب';
  return { compress, dominantColor, blobToDataUrl, fmtSize };
})();
