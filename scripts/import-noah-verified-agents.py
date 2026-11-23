#!/usr/bin/env python3
"""Import reviewed research metadata only. No remote downloads or agent execution.

--source registry.json --watch follows a locally reviewed registry every 5s.
The generated application artifact is replaced atomically only after validation.
Production uses the last deployed artifact; this command does not deploy it.
"""
import argparse
import gzip
import hashlib
import json
import math
import os
from pathlib import Path
import tempfile
import time
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'data/noah-verified-agent-source.json.gz'
OUTPUT = ROOT / 'data/noah-agent-registry.json'
DECISIONS = {'agent', 'unverifiable', 'merged', 'historical', 'announced', 'template', 'framework', 'tool', 'model', 'resource', 'other'}


def public_url(value):
    if not isinstance(value, str):
        raise ValueError('source URL must be a string')
    url = urlsplit(value)
    if url.scheme != 'https' or not url.hostname or url.username or url.password:
        raise ValueError('public HTTPS source URL required')
    return value


def text(value):
    if not isinstance(value, str) or not value.strip():
        raise ValueError('nonempty text required')
    return value


def build(source):
    if source.get('schema') != 'noah.agent-body-registry/1':
        raise ValueError('unsupported research schema')
    products, reviews = [], []
    ids, families, urls, review_ids = set(), set(), set(), set()
    for product in source['products']:
        identifier, family = text(product['id']), text(product['identityKey'])
        url = public_url(product['canonicalUrl'])
        normalized = url.lower().rstrip('/').removesuffix('.git')
        if identifier in ids or family in families or normalized in urls:
            raise ValueError('duplicate family, ID, or canonical URL')
        ids.add(identifier); families.add(family); urls.add(normalized)
        products.append({
            'id': identifier, 'familyId': family, 'name': text(product['name']),
            'publisher': text(product['publisher']), 'category': text(product['category']),
            'summary': text(product['admissionReason']), 'url': url,
            'sources': list(dict.fromkeys([url] + [public_url(s['url']) for s in product['sources']])),
            'status': text(product['status']), 'added': product.get('reviewBatch') == 'full-review-20261122',
            # An external research record can never authorize execution.
            'connection': 'not_tested', 'launchAllowed': False,
            'protocol': product.get('connectionAssessment', {}).get('protocol'),
            'requirements': ['実行入口と接続方式の確認', '提供元の利用条件・利用権の確認',
                             '認証・モデル・専用実行環境の準備', 'Noahで入力・成果・停止を通す試験'],
        })
    counts = {}
    for review in source['adjudicationLedger']:
        key, decision = text(review['key']), review['decision']
        if key in review_ids or decision not in DECISIONS:
            raise ValueError('duplicate review or unsupported decision')
        review_ids.add(key)
        family = review.get('familyId')
        if family is not None and family not in families:
            raise ValueError('review references a missing family')
        counts[decision] = counts.get(decision, 0) + 1
        reviews.append({
            'key': key, 'name': text(review['name']), 'source': text(review['source']),
            'url': public_url(review['url']), 'decision': decision, 'reason': text(review['reason']),
            'method': text(review['method']), 'familyId': family,
        })
    research = source['latestReview']
    categories = len({p['category'] for p in products})
    if (source['summary']['confirmedProductFamilies'] != len(products)
            or source['summary']['functionalCategoryCount'] != categories
            or research['total'] != len(reviews) or research['byDecision'] != counts
            or research['addedFamilies'] != sum(p['added'] for p in products)):
        raise ValueError('research counts do not reconcile')
    individual = sum(r['method'].startswith('individual') for r in reviews)
    result = {
        'schema': 'noah.verified-agent-catalog/1', 'asOf': text(source['asOf']),
        'summary': {'families': len(products), 'categories': categories,
                    'added': research['addedFamilies'], 'reviewed': len(reviews),
                    'unresolved': counts.get('unverifiable', 0), 'byDecision': counts,
                    'individuallyReviewed': individual, 'automatedTriage': len(reviews) - individual,
                    'noahConnectionTests': 0},
        'products': products, 'reviews': reviews,
    }
    result['revision'] = hashlib.sha256(json.dumps(result, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]
    return result


def atomic_write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as file:
        temporary = file.name
        file.write(content)
    try:
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def run(path, check=False):
    raw = path.read_bytes()
    if path.suffix == '.gz':
        raw = gzip.decompress(raw)
    source = json.loads(raw)
    result = build(source)
    output = (json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
    if check:
        if not OUTPUT.exists() or OUTPUT.read_bytes() != output:
            raise ValueError('generated Noah registry is stale')
        return result
    if path.resolve() != SOURCE.resolve():
        atomic_write(SOURCE, gzip.compress(raw, mtime=0))
    if not OUTPUT.exists() or OUTPUT.read_bytes() != output:
        atomic_write(OUTPUT, output)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=SOURCE)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--watch', action='store_true')
    parser.add_argument('--interval', type=float, default=5)
    args = parser.parse_args()
    if not math.isfinite(args.interval) or args.interval < 1 or args.check and args.watch:
        parser.error('interval >= 1; --check cannot be combined with --watch')
    last = None
    while True:
        try:
            digest = hashlib.sha256(args.source.read_bytes()).hexdigest()
            if digest != last:
                result = run(args.source, args.check)
                last = digest
                print(json.dumps({'revision': result['revision'], **result['summary']}, ensure_ascii=False), flush=True)
        except (ValueError, KeyError, TypeError, AttributeError, EOFError, OSError) as error:
            if not args.watch:
                raise
            print('Rejected registry update; previous artifact retained: ' + str(error), flush=True)
        if not args.watch:
            break
        time.sleep(args.interval)


if __name__ == '__main__':
    main()
