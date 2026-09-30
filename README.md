# Backup Integrity Monitor

Detects tampering in backup files. It stores a SHA-256 baseline of every file, then rescans on demand or on a schedule and reports modified, deleted and new files. A mass-change rule (default 30% of files) flags ransomware-like activity, and the baseline is HMAC-signed so tampering with the baseline itself is detected. Alerts go to the console and an optional webhook (Slack or Discord).

## Run
    npm install
    export HMAC_SECRET="use-a-long-random-string"
    export BACKUP_DIR=./sample-backup        # folder to protect
    export SCAN_INTERVAL_MIN=5               # optional auto-scan
    export WEBHOOK_URL=...                   # optional
    npm start                                # dashboard at http://localhost:3000

CLI: `npm run baseline` then `npm run scan` (exit code 1 if anything changed, so it works in cron/CI).

## Demo
    mkdir sample-backup && for i in $(seq 1 10); do echo "data $i" > sample-backup/file$i.txt; done
    npm run baseline
    echo "tampered" >> sample-backup/file1.txt   # -> TAMPERED
    rm sample-backup/file2.txt                    # -> deleted
    for i in 3 4 5; do echo x > sample-backup/file$i.txt; done   # -> CRITICAL (mass change)

## Design notes
- Streaming hashes, so large files don't load into memory.
- Baseline stores hashes only; restore from a trusted copy after an alert.
- Limitations: file-level checks only, and a real system would keep the baseline and secret on a separate, write-protected host.
