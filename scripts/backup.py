#!/usr/bin/env python3
"""Online SQLite backup with an independently opened integrity check.

Usage: python3 scripts/backup.py DATA_DIR BACKUP_DIR
Backups contain private data and must be copied off this VM separately.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import sys

source = Path(sys.argv[1]).resolve() / 'eujobs.sqlite'
destination = Path(sys.argv[2]).resolve()
if not source.is_file():
    raise SystemExit('Source database does not exist.')
os.umask(0o077)
destination.mkdir(parents=True, exist_ok=True, mode=0o700)
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
final = destination / f'eujobs-{stamp}.sqlite'
temporary = final.with_suffix('.partial')
with sqlite3.connect(f'{source.as_uri()}?mode=ro', uri=True) as src:
    with sqlite3.connect(temporary) as backup:
        src.backup(backup)
with sqlite3.connect(f'{temporary.as_uri()}?mode=ro', uri=True) as check:
    if check.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
        raise SystemExit('Backup integrity verification failed; partial file retained.')
    counts = {table: check.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]
              for table in ('users', 'listings', 'contacts')}
temporary.rename(final)
digest = hashlib.sha256(final.read_bytes()).hexdigest()
manifest = {'file': final.name, 'createdAt': stamp, 'sha256': digest,
            'integrity': 'ok', 'counts': counts, 'source': str(source)}
final.with_suffix('.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps(manifest))
