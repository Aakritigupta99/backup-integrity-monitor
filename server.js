const express = require('express');
const { createBaseline, scan, getHistory, alert } = require('./checker');

const app = express();
const dir = process.env.BACKUP_DIR || './sample-backup';
const PORT = process.env.PORT || 3000;
const INTERVAL_MIN = parseInt(process.env.SCAN_INTERVAL_MIN || '0', 10);
let latest = null;

app.use(express.static('public'));

async function runScan() {
  latest = await scan(dir);
  await alert(latest);
  return latest;
}

app.post('/api/baseline', async (req, res) => {
  try { res.json(await createBaseline(dir)); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/scan', async (req, res) => {
  try { res.json(await runScan()); } catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/latest', (req, res) => res.json(latest));
app.get('/api/history', (req, res) => res.json(getHistory()));

if (INTERVAL_MIN > 0) setInterval(() => runScan().catch(e => console.error(e.message)), INTERVAL_MIN * 60000);

app.listen(PORT, () => console.log(`Monitoring "${dir}" at http://localhost:${PORT}`));
