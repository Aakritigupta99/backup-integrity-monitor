const { createBaseline, scan, alert } = require('./checker');
const dir = process.env.BACKUP_DIR || './sample-backup';
(async () => {
  const cmd = process.argv[2];
  if (cmd === 'baseline') console.log(await createBaseline(dir));
  else if (cmd === 'scan') { const r = await scan(dir); console.log(r); await alert(r); process.exitCode = r.status === 'OK' ? 0 : 1; }
  else console.log('Usage: node cli.js baseline|scan');
})().catch(e => { console.error(e.message); process.exit(2); });
