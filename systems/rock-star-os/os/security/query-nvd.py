#!/usr/bin/env python3
"""Bounded read-only NIST API inventory screen, not a claim of vulnerability absence."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = 'https://services.nvd.nist.gov/rest/json/'


def now():
    return datetime.now(timezone.utc).isoformat()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inventory', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    inventory_bytes = args.inventory.read_bytes()
    inventory = json.loads(inventory_bytes)
    args.output.mkdir(parents=True, exist_ok=False)
    (args.output / 'input-package-info.json').write_bytes(inventory_bytes)
    report = {'schema':'rock-nvd-inventory-screen/1', 'started_utc':now(), 'status':'RUNNING',
              'source':'NIST NVD REST API 2.0', 'inventory_sha256':hashlib.sha256(inventory_bytes).hexdigest(),
              'scope':'Buildroot selected non-host versioned components; runtime file applicability requires separate review',
              'limitations':['No match is not proof of absence.', 'NVD may lag a recent release or CVE.',
                             'CPE product mapping and configuration applicability require review.',
                             'Custom Rock code has no NVD CPE; it requires separate security review.',
                             'This does not audit firmware, proprietary BlackBerry drivers or host VM packages.'],
              'components':[], 'requests':[]}
    next_request = 0.0
    def fetch(endpoint, query, basename):
        nonlocal next_request
        delay = next_request - time.monotonic()
        if delay > 0:
            time.sleep(delay)
        url = BASE + endpoint + '?' + urllib.parse.urlencode(query)
        record = {'url':url, 'started_utc':now()}
        next_request = time.monotonic() + 6.3
        try:
            request = urllib.request.Request(url, headers={'User-Agent':'RockStarOS-development-inventory/0.2'})
            with urllib.request.urlopen(request, timeout=25) as response:
                raw = response.read(8 * 1024 * 1024 + 1)
                if len(raw) > 8 * 1024 * 1024:
                    raise ValueError('NVD response exceeded 8 MiB')
                data = json.loads(raw)
                if type(data.get('totalResults')) is not int or type(data.get('resultsPerPage')) is not int:
                    raise ValueError('unexpected NVD result schema')
                (args.output / (basename + '.json')).write_bytes(raw)
                record.update(http_status=response.status, total_results=data['totalResults'],
                              response_sha256=hashlib.sha256(raw).hexdigest(), file=basename + '.json',
                              nvd_timestamp=data.get('timestamp'))
                return data
        except (OSError, ValueError) as error:
            record['error'] = type(error).__name__ + ': ' + str(error)
            return None
        finally:
            record['finished_utc'] = now()
            report['requests'].append(record)
            (args.output / 'report.json').write_text(json.dumps(report, indent=2) + '\n')

    for name, package in sorted(inventory.items()):
        if name.startswith('host-') or not package.get('version'):
            continue
        item = {'package':name, 'version':package['version'], 'cpe':package.get('cpe-id')}
        report['components'].append(item)
        if not item['cpe']:
            item['status'] = 'NO_CPE_CUSTOM_REVIEW_REQUIRED'
            continue
        parts = item['cpe'].split(':')
        if len(parts) != 13 or parts[:2] != ['cpe','2.3']:
            item['status'] = 'INVALID_CPE'
            continue
        product = ':'.join(parts[:5] + ['*'] * 8)
        dictionary = fetch('cpes/2.0', {'cpeMatchString':product, 'resultsPerPage':1}, name + '-product')
        item['product_dictionary_matches'] = dictionary.get('totalResults') if dictionary else None
        # Keep an exact Buildroot CPE query even when dictionary coverage is absent;
        # wildcard vulnerability criteria can still yield matches for newer versions.
        matches = fetch('cves/2.0', {'cpeName':item['cpe'], 'isVulnerable':'', 'resultsPerPage':2000}, name + '-cves')
        if matches is None:
            item['status'] = 'QUERY_FAILED'
        else:
            item['returned_ids'] = [entry['cve']['id'] for entry in matches.get('vulnerabilities', [])]
            item['total_results'] = matches['totalResults']
            item['complete_page'] = len(item['returned_ids']) == matches['totalResults']
            item['status'] = ('TRIAGE_REQUIRED' if item['returned_ids'] else 'NO_MATCH_RETURNED') if item['complete_page'] else 'INCOMPLETE_PAGINATION'
            if not item['product_dictionary_matches']:
                item['mapping_review_required'] = True
        print(json.dumps(item), flush=True)
    report['status'] = 'QUERIES_FINISHED_WITH_LIMITATIONS'
    report['finished_utc'] = now()
    report['candidate_ids'] = sorted({cve for item in report['components'] for cve in item.get('returned_ids', [])})
    report['request_errors'] = sum('error' in request for request in report['requests'])
    (args.output / 'report.json').write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()
