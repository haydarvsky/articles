/* ===== طبقة الاتصال بـGitHub (Git Data API) — تعمل في المتصفح وNode ===== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GhApi = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const utf8ToB64 = s => {
    if (typeof Buffer !== 'undefined') return Buffer.from(s, 'utf8').toString('base64');
    const bytes = new TextEncoder().encode(s); let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  const b64ToUtf8 = b => {
    const clean = b.replace(/\s/g, '');
    if (typeof Buffer !== 'undefined') return Buffer.from(clean, 'base64').toString('utf8');
    const bin = atob(clean); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  };

  class GhApi {
    constructor({ owner, repo, branch = 'main', token = '' }) {
      Object.assign(this, { owner, repo, branch, token });
      this.base = `https://api.github.com/repos/${owner}/${repo}`;
    }
    async req(method, url, body) {
      const r = await fetch(url.startsWith('http') ? url : this.base + url, {
        method,
        headers: {
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(this.token ? { 'Authorization': 'Bearer ' + this.token } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      let data = null; const txt = await r.text();
      try { data = txt ? JSON.parse(txt) : null; } catch { data = { raw: txt }; }
      if (!r.ok) {
        const e = new Error((data && data.message) || ('HTTP ' + r.status)); e.status = r.status; e.data = data; throw e;
      }
      return data;
    }
    /* التحقق من الصلاحية والوصول للمستودع */
    async check() {
      const repo = await this.req('GET', '');
      let user = null; try { user = await this.req('GET', 'https://api.github.com/user'); } catch { }
      return { repo: repo.full_name, canPush: !!(repo.permissions && repo.permissions.push), user: user && user.login, defaultBranch: repo.default_branch };
    }
    /* قراءة ملف نصي (حتى ١ ميغابايت) */
    async readText(path) {
      try {
        const d = await this.req('GET', `/contents/${encodeURI(path)}?ref=${this.branch}`);
        return { sha: d.sha, text: b64ToUtf8(d.content || '') };
      } catch (e) { if (e.status === 404) return null; throw e; }
    }
    /* شجرة الملفات كاملة: path -> sha */
    async tree() {
      const d = await this.req('GET', `/git/trees/${this.branch}?recursive=1`);
      const m = new Map(); (d.tree || []).forEach(t => { if (t.type === 'blob') m.set(t.path, t.sha); });
      return m;
    }
    /* التزام واحد يضم إضافات/تعديلات/حذوفات:
       files: [{path, base64}] أو [{path, text}] ؛ deletes: [path] */
    async commit({ message, files = [], deletes = [], onProgress = () => { } }) {
      const ref = await this.req('GET', `/git/ref/heads/${this.branch}`);
      const headSha = ref.object.sha;
      const head = await this.req('GET', `/git/commits/${headSha}`);
      const baseTree = head.tree.sha;
      const entries = [];
      // رفع الكائنات (٤ متوازية)
      let done = 0; const q = files.slice();
      const worker = async () => {
        while (q.length) {
          const f = q.shift();
          const body = f.base64 != null ? { content: f.base64, encoding: 'base64' } : { content: f.text, encoding: 'utf-8' };
          const b = await this.req('POST', '/git/blobs', body);
          entries.push({ path: f.path, mode: '100644', type: 'blob', sha: b.sha });
          done++; onProgress({ stage: 'upload', done, total: files.length, path: f.path });
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, files.length || 1) }, worker));
      deletes.forEach(p => entries.push({ path: p, mode: '100644', type: 'blob', sha: null }));
      if (!entries.length) return { sha: headSha, unchanged: true };
      onProgress({ stage: 'tree' });
      const tree = await this.req('POST', '/git/trees', { base_tree: baseTree, tree: entries });
      onProgress({ stage: 'commit' });
      const commit = await this.req('POST', '/git/commits', { message, tree: tree.sha, parents: [headSha] });
      await this.req('PATCH', `/git/refs/heads/${this.branch}`, { sha: commit.sha, force: false });
      onProgress({ stage: 'done', sha: commit.sha });
      return { sha: commit.sha };
    }
    /* حالة آخر بناء لـPages (اختياري) */
    async pagesStatus() {
      try { const d = await this.req('GET', '/pages/builds/latest'); return d && d.status; } catch { return null; }
    }
  }
  GhApi.utf8ToB64 = utf8ToB64; GhApi.b64ToUtf8 = b64ToUtf8;
  return GhApi;
});
