#!/usr/bin/env python3
"""Read public CVE issuer records for broad NVD inventory candidates."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import time
import urllib.error
import urllib.request


def now():
    return datetime.now(timezone.utc).isoformat()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--nvd-report', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    raw = args.nvd_report.read_bytes()
    source = json.loads(raw)
    ids = source['candidate_ids']
    if not isinstance(ids,list) or len(ids) > 2000 or any(not re.fullmatch(r'CVE-\d{4}-\d{4,}', value) for value in ids):
        raise ValueError('invalid bounded candidate inventory')
    args.output.mkdir(parents=True, exist_ok=False)
    (args.output / 'nvd-screen.json').write_bytes(raw)
    report = {'schema':'rock-cve-issuer-collection/1', 'started_utc':now(), 'status':'RUNNING',
              'nvd_report_sha256':hashlib.sha256(raw).hexdigest(), 'candidate_count':len(ids),
              'source':'CVE Program public API; each record identifies its issuing CNA',
              'purpose':'version applicability triage, not exploitation or a claim of a vulnerable OS',
              'records':[]}
    for index, identifier in enumerate(ids):
        started = time.monotonic()
        url = 'https://cveawg.mitre.org/api/cve/' + identifier
        entry = {'id':identifier, 'url':url, 'started_utc':now()}
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent':'RockStarOS-maintenance-inventory/0.2'}),timeout=15) as response:
                body = response.read(512 * 1024 + 1)
                if len(body) > 512 * 1024:
                    raise ValueError('CVE issuer record exceeds size bound')
                value = json.loads(body)
                if value.get('cveMetadata',{}).get('cveId') != identifier:
                    raise ValueError('CVE issuer identity mismatch')
                (args.output / (identifier + '.json')).write_bytes(body)
                entry.update(http_status=response.status, sha256=hashlib.sha256(body).hexdigest(),
                             issuer=value['cveMetadata'].get('assignerShortName'),
                             state=value['cveMetadata'].get('state'), updated=value['cveMetadata'].get('dateUpdated'))
        except (OSError,ValueError) as error:
            entry['error'] = type(error).__name__ + ': ' + str(error)
        entry['finished_utc'] = now()
        report['records'].append(entry)
        if index % 25 == 0 or index + 1 == len(ids):
            (args.output / 'collection.json').write_text(json.dumps(report,indent=2)+'\n')
            print(json.dumps({'completed':index+1,'total':len(ids),'errors':sum('error' in row for row in report['records'])}),flush=True)
        # One sequential public GET at most every 0.65 seconds; no bulk workers,
        # retries, credentials or traffic to any non-CVE endpoint.
        time.sleep(max(0, .65 - (time.monotonic()-started)))
    report.update(status='FINISHED',finished_utc=now(),errors=sum('error' in row for row in report['records']))
    (args.output / 'collection.json').write_text(json.dumps(report,indent=2)+'\n')


if __name__ == '__main__':
    main()
