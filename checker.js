const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA = path.join(__dirname, 'data');
const BASELINE = path.join(DATA, 'baseline.json');
const HISTORY = path.join(DATA, 'history.json');
const SECRET = process.env.HMAC_SECRET || 'change-me';
const MASS_THRESHOLD = parseFloat(process.env.MASS_THRESHOLD || '0.3'); // 30% of files

function hashFile(p) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(p).on('data', d => h.update(d))
      .on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

async function walk(dir, base = dir, out = {}) {
  for (const e of await fs.promises.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, base, out);
    else if (e.isFile()) {
      const st = await fs.promises.stat(full);
      out[path.relative(base, full)] = { sha256: await hashFile(full), size: st.size };
    }
  }
  return out;
}

// Signing the baseline detects tampering with the baseline file itself
function sign(files) {
  const canon = JSON.stringify(Object.keys(files).sort().map(k => [k, files[k].sha256]));
  return crypto.createHmac('sha256', SECRET).update(canon).digest('hex');
}

async function createBaseline(dir) {
  const files = await walk(dir);
  const data = { createdAt: new Date().toISOString(), dir, files, signature: sign(files) };
  fs.writeFileSync(BASELINE, JSON.stringify(data, null, 2));
  return { createdAt: data.createdAt, total: Object.keys(files).length };
}

async function scan(dir) {
  if (!fs.existsSync(BASELINE)) throw new Error('No baseline yet. Create one first.');
  const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const baselineValid = sign(base.files) === base.signature;
  const now = await walk(dir);

  const modified = [], deleted = [], added = [];
  for (const f of Object.keys(base.files)) {
    if (!now[f]) deleted.push(f);
    else if (now[f].sha256 !== base.files[f].sha256) modified.push(f);
  }
  for (const f of Object.keys(now)) if (!base.files[f]) added.push(f);

  const baseCount = Object.keys(base.files).length || 1;
  const changedRatio = (modified.length + deleted.length) / baseCount;

  let status = 'OK';
  if (added.length) status = 'WARNING';
  if (modified.length || deleted.length) status = 'TAMPERED';
  if (changedRatio >= MASS_THRESHOLD) status = 'CRITICAL'; // mass-change pattern
  if (!baselineValid) status = 'BASELINE_TAMPERED';

  const report = {
    time: new Date().toISOString(), status, baselineValid,
    totalFiles: Object.keys(now).length, baselineFiles: baseCount,
    changedPercent: +(changedRatio * 100).toFixed(1), modified, deleted, added
  };
  saveHistory(report);
  return report;
}

function saveHistory(r) {
  let h = [];
  try { h = JSON.parse(fs.readFileSync(HISTORY, 'utf8')); } catch {}
  h.unshift({ time: r.time, status: r.status, modified: r.modified.length,
    deleted: r.deleted.length, added: r.added.length, changedPercent: r.changedPercent });
  fs.writeFileSync(HISTORY, JSON.stringify(h.slice(0, 100), null, 2));
}

function getHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY, 'utf8')); } catch { return []; }
}

async function alert(report) {
  if (report.status === 'OK') return;
  const msg = `[Backup Integrity] ${report.status}: ${report.modified.length} modified, ` +
    `${report.deleted.length} deleted, ${report.added.length} new (${report.changedPercent}% changed)`;
  console.warn(msg);
  if (process.env.WEBHOOK_URL) {
    try {
      await fetch(process.env.WEBHOOK_URL, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: msg }) });
    } catch (e) { console.error('Webhook failed:', e.message); }
  }
}

module.exports = { createBaseline, scan, getHistory, alert };
