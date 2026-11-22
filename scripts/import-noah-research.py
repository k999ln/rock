"""Offline, repeatable import of the research chat's public metadata (never code).

Snapshot inputs once with --capture ROOT --facts DIR --expansion DIR, then rerun
without flags to reproduce. No network, database writes, or external execution.
"""
import argparse
import gzip
import hashlib
import ipaddress
import json
import re
import shutil
import unicodedata
import zipfile
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parent.parent
INPUT = ROOT / 'data/noah-research-sources'
THREAD = '01a1dd39-46e5-7371-b2be-bfdc77e3120d'
CHECK = False
KINDS = {'A': 'agent', 'B': 'framework', 'C': 'tool', 'D': 'template',
         'E': 'resource', 'F': 'other', 'U': 'candidate'}


def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), sort_keys=True).encode()


def digest(value):
    return hashlib.sha256(value).hexdigest()


def output(path, data):
    if CHECK:
        if not path.exists() or path.read_bytes() != data:
            raise ValueError('Generated catalog differs: ' + str(path))
    else:
        path.write_bytes(data)


def canonical(value):
    u = urlsplit(value.strip())
    host = (u.hostname or '').lower()
    if u.scheme != 'https' or not host or u.username or u.password or u.port not in (None, 443):
        raise ValueError(f'Unsupported public source URL: {value}')
    if host in ('localhost',) or host.endswith(('.local', '.internal')):
        raise ValueError('Local source URL')
    try:
        if not ipaddress.ip_address(host).is_global:
            raise ValueError('Private source URL')
    except ValueError as e:
        if str(e) == 'Private source URL':
            raise
    path = u.path.rstrip('/')
    if host == 'github.com':
        path = re.sub(r'\.git$', '', path, flags=re.I).lower()
        if path in ('/daisuke134/anicca', '/daisuke134/life-manager'):
            path = '/daisuke134/life-manager'
    return urlunsplit(('https', host, path, u.query, ''))


def capture(args):
    INPUT.mkdir(parents=True, exist_ok=True)
    root, facts = Path(args.capture), Path(args.facts)
    files = {
        'census': facts / 'noah-world-agent-census.json',
        'primary-metadata': facts / 'noah-primary-source-records.jsonl.gz',
        'primary-review': root / 'docs/evidence/noah-agent-primary-review.json',
        'landscape': root / 'docs/evidence/noah-world-agent-research.json',
        'discovery': root / 'docs/evidence/noah-primary-source-discovery.json',
    }
    manifest = {'threadId': THREAD, 'asOf': '2026-11-15', 'inputs': []}
    for label, path in files.items():
        raw = path.read_bytes()
        if label == 'primary-metadata':
            value = [json.loads(line) for line in gzip.decompress(raw).splitlines()]
        else:
            value = json.loads(raw)
        data = encode(value)
        (INPUT / f'{label}.json.gz').write_bytes(gzip.compress(data, mtime=0))
        manifest['inputs'].append({'name': label, 'sourceFile': path.name, 'sourceSha256': digest(raw), 'snapshotSha256': digest(data)})
    # Descriptions are not in the normalized fact file. Read the preserved copy
    # only when explicitly supplied; they remain directory claims, not our proof.
    descriptions = json.loads(Path(args.descriptions).read_text()) if args.descriptions else []
    (INPUT / 'descriptions.json.gz').write_bytes(gzip.compress(encode(descriptions), mtime=0))
    manifest['inputs'].append({'name': 'descriptions', 'snapshotSha256': digest(encode(descriptions))})
    expansion = []
    if args.expansion:
        for path in sorted(Path(args.expansion).glob('search-gh-*.json')):
            raw = path.read_bytes()
            d = json.loads(raw)
            repos = d['result'].get('structuredContent', {}).get('repositories', [])
            # Keep only public source metadata, never permissions or account data.
            rows = [{'id': str(x['id']), 'name': x['repository_full_name'],
                     'url': x.get('display_url') or x['clone_url']} for x in repos]
            expansion.append({'query': d['query'], 'sourceSha256': digest(raw), 'records': rows})
    (INPUT / 'expansion.json.gz').write_bytes(gzip.compress(encode(expansion), mtime=0))
    manifest['inputs'].append({'name': 'expansion', 'snapshotSha256': digest(encode(expansion))})
    (INPUT / 'manifest.json').write_bytes(encode(manifest) + b'\n')


def build():
    index_path = ROOT / 'data/noah-research-index.json'
    old_index = index_path.read_bytes() if index_path.exists() else None
    old_revision = json.loads(old_index)['revision'] if old_index else None
    manifest = json.loads((INPUT / 'manifest.json').read_text())
    sources = {}
    for item in manifest['inputs']:
        raw = gzip.decompress((INPUT / f"{item['name']}.json.gz").read_bytes())
        if digest(raw) != item['snapshotSha256']:
            raise ValueError('Research snapshot hash mismatch: ' + item['name'])
        sources[item['name']] = json.loads(raw)
    records, url_ids, stable_ids, coverage = {}, {}, {}, Counter()
    descriptions = {canonical(x['url']): x.get('description', '') for x in sources['descriptions']}

    def add(dataset, ref, name, url, *, kind='candidate', level='discovered', summary='',
            author='', tags=(), note='', license_note='', stable=None, group=False, evidence=()):
        key = canonical(url)
        identity = stable_ids.get(stable) if stable else None
        identity = identity or url_ids.get(key)
        if not identity:
            identity = 'anicca' if key == 'https://github.com/daisuke134/life-manager' else 'research-' + digest(key.encode())[:20]
        row = records.setdefault(identity, {
            'id': identity, 'name': name, 'kind': kind, 'level': level,
            'summary': '', 'author': author, 'tags': [], 'sources': [], 'references': [],
            'notes': [], 'license': '', 'asOf': manifest['asOf'],
            'identity': 'name_group' if group else 'distribution',
            'connection': 'existing_anicca' if identity == 'anicca' else 'not_tested',
            'price': '提供元の料金と、モデル・実行環境の費用を確認してください。',
        })
        # First reviewed classification wins over metadata. Another reviewed
        # record contributes evidence, without inventing a completed integration.
        if level == 'primary' and row['level'] != 'primary':
            row.update(name=name, kind=kind, level=level)
        if summary and (not row['summary'] or level == 'primary'):
            row['summary'] = str(summary).strip()[:700]
        if author and not row['author']:
            row['author'] = author
        if license_note:
            row['license'] = license_note
        for value in [note, *evidence]:
            if value and value not in row['notes']:
                row['notes'].append(str(value)[:800])
        for tag in tags:
            if tag not in row['tags']:
                row['tags'].append(str(tag)[:100])
        if not any(x['url'] == key for x in row['sources']):
            row['sources'].append({'url': key, 'label': name, 'type': 'directory' if group else 'primary'})
        row['references'].append({'dataset': dataset, 'ref': str(ref)})
        coverage[dataset] += 1
        url_ids[key] = identity
        if stable:
            stable_ids[stable] = identity
        return row

    # Source URL groups are retained as research groups, not claimed to be
    # independently verified products. Same names alone never join official repos.
    for group in sources['census']['groups']:
        listings = group['listings']
        row = None
        for i, listing in enumerate(listings):
            row = add('directory_listings', listing['url'], group['name'], listing['url'],
                      stable='group:' + group['id'], group=True, tags=group['categories'],
                      author=' / '.join(group['sources']), summary=descriptions.get(canonical(listing['url']), ''),
                      note='名称でまとめた調査候補です。Agent本体・同一製品かは未確認です。')
        if group['sameSourceCollision']:
            row['notes'].append('同じ紹介サイト内に同名の掲載があります。製品の同一性は未確定です。')
    for i, item in enumerate(sources['primary-metadata']):
        source, k = item['source'], item.get('kind')
        kind = {'models': 'model', 'datasets': 'dataset'}.get(k, 'candidate')
        name = item.get('fullName') or item['id']
        add('metadata', i, name, item['url'], kind=kind, tags=[source, k or 'repository'],
            author=name.split('/')[0], stable=('github:' + str(item['id'])) if source == 'GitHub' else None,
            note='公開検索で見つかった配布物です。Agent本体の判定・接続試験は未実施です。' if kind == 'candidate' else 'Agentの関連資産です。単独のAgentとして実行するものではありません。')
    review = sources['primary-review']
    for item in [*review['github'], *review['huggingFace']]:
        add('primary_review', item['id'], item['name'], item['url'], kind=KINDS[item['category']], level='primary',
            summary=item.get('providerDescription', '') or item['note'], author=item['name'].split('/')[0],
            tags=[item['source'], review['taxonomy'][item['category']]['label']], note=item['note'],
            license_note=item.get('licenseMetadata') or '',
            stable=('github:' + str(item['stableId'])) if item['source'] == 'GitHub' else None,
            evidence=[item['evidenceLevel'], '資料を確認した分類です。実行試験は未実施です。'])
    for item in sources['landscape']['entries']:
        t = item['type']
        kind = 'agent' if 'Agent' in t and '候補' not in t else {'開発基盤': 'framework', '管理基盤': 'framework', 'Tool接続': 'tool', '接続規約': 'resource', 'カタログ': 'resource', 'テンプレート': 'template'}.get(t, 'candidate')
        add('landscape', item['id'], item['name'], item['sourceUrl'], kind=kind, level='primary',
            summary=item['finding'], tags=[t, item['region']], note=item['noahAssessment'], evidence=[item['evidence']])
    for i, item in enumerate(sources['discovery']['x']['leads']):
        add('x_leads', i, item['name'], item['officialUrl'], tags=['Xからの発見'], note=item['finding'])
    for i, item in enumerate(sources['discovery']['examples']):
        add('discovery_examples', i, item['name'], item['url'], note=item.get('evidence', ''), tags=[item.get('classification', '')])
    for batch in sources['expansion']:
        for item in batch['records']:
            add('ongoing_research', batch['query'] + ':' + item['id'], item['name'], item['url'],
                stable='github:' + item['id'], author=item['name'].split('/')[0], tags=['GitHub'],
                note='追加調査中の公開リポジトリ候補。分類と接続は未確認です。')
    article_path = INPUT / 'explorax-github-100.json'
    article_raw = article_path.read_bytes()
    article = json.loads(article_raw)
    article_url = canonical(article['sourceUrl'])
    article_input = {'name': 'explorax_github_100', 'sourceFile': article_path.name,
                     'snapshotSha256': digest(article_raw)}
    for item in article['repositories']:
        repository = item['repository']
        url = canonical('https://github.com/' + repository)
        listed_url = canonical('https://github.com/' + item['listedRepository'])
        stable = 'github:' + item['githubId']
        existing = stable_ids.get(stable) or url_ids.get(url) or url_ids.get(listed_url)
        if existing:
            stable_ids[stable] = existing
        kind = item['kind']
        category = item['category']
        tags = ['GitHub', 'exploraX_', category]
        if url != listed_url:
            tags.append(item['listedRepository'])
        row = add(article_input['name'], item['position'], repository, url, kind=kind,
                  summary=f'{category}の公開リポジトリ。記事の掲載候補で、Noahでの接続と実行は未確認です。',
                  author=repository.split('/')[0], tags=tags, stable=stable,
                  note=f"{article['checkedAt']} にGitHubで公開リポジトリを確認しました。",
                  evidence=['GitHubでアーカイブ済みです。'] if item.get('archived') else [])
        if not existing:
            row['asOf'] = article['checkedAt']
        if not any(source['url'] == article_url for source in row['sources']):
            row['sources'].append({'url': article_url, 'label': article['sourceLabel'], 'type': 'citation'})
    # Keep explicit identity observations in the corresponding details.
    for finding in review['identityFindings']:
        ids = set(finding['sources'])
        for row in records.values():
            if any(r['dataset'] == 'primary_review' and r['ref'] in ids for r in row['references']):
                row['notes'].append(finding['relation'])
    rows = list(records.values())
    for row in rows:
        if not row['summary']:
            row['summary'] = '公開資料から収集した候補です。用途・実行環境・接続条件は確認待ちです。' if row['kind'] == 'candidate' else '関連資産の配布元と確認状況を掲載しています。'
        row['tags'] = sorted(set(row['tags']))
        row['sources'].sort(key=lambda x: x['url'])
    rows.sort(key=lambda x: (0 if x['id'] == 'anicca' else 1 if x['kind'] == 'agent' else 2 if x['level'] == 'primary' else 3, unicodedata.normalize('NFKC', x['name']).casefold(), x['id']))
    revision = digest(encode({'shards': 64, 'rows': rows}))[:16]
    target = ROOT / 'public/noah-research' / revision
    if not CHECK:
        target.mkdir(parents=True, exist_ok=True)
    shards = defaultdict(dict)
    index = []
    for row in rows:
        shard = '00' if row['id'] == 'anicca' else f"{int(row['id'][9:11], 16) % 64:02x}"
        shards[shard][row['id']] = row
        # Compact tuples keep the full metadata out of the worker/client bundle.
        brief = '' if row['summary'].startswith(('公開資料から収集した候補です。', '関連資産の配布元と確認状況')) else row['summary'][:230]
        index.append([row['id'], row['name'], row['kind'], row['level'], brief, row['author'], row['tags']])
    for shard, data in shards.items():
        output(target / f'{shard}.json', encode(data) + b'\n')
    stats = {'total': len(rows), 'kinds': dict(Counter(x['kind'] for x in rows)),
             'primaryReviewed': sum(x['level'] == 'primary' for x in rows),
             'nameGroups': len(sources['census']['groups']), 'sourceReferences': sum(coverage.values()),
             'coverage': dict(coverage), 'integrationTested': 0}
    output(ROOT / 'data/noah-research-index.json', encode({'revision': revision, 'asOf': manifest['asOf'], 'threadId': THREAD, 'stats': stats, 'rows': index}) + b'\n')
    output(INPUT / 'receipt.json', encode({'revision': revision, 'stats': stats, 'inputs': [*manifest['inputs'], article_input],
        'limitations': ['名称groupと配布物の件数。世界のAgent種類数ではない。', '実行環境/価格/利用条件は資料確認または未確認。全候補の動作試験なし。', '追加調査はsnapshot後に自動同期されない。']}) + b'\n')
    if not CHECK and old_revision and old_revision != revision:
        if not re.fullmatch('[a-f0-9]{16}', old_revision):
            raise ValueError('Invalid previous generated revision')
        old_dir = ROOT / 'public/noah-research' / old_revision
        if old_dir.exists():
            files = list(old_dir.iterdir())
            if not all(f.is_file() and re.fullmatch('[a-f0-9]{2}\\.json', f.name) for f in files):
                raise ValueError('Unexpected file in generated shard directory; retained')
            backup = ROOT / 'work/noah-catalog-backups' / f'{old_revision}.zip'
            backup.parent.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(backup, 'w', zipfile.ZIP_DEFLATED) as z:
                z.writestr('index.json', old_index)
                for f in files:
                    z.write(f, f.name)
            shutil.rmtree(old_dir)
    print(json.dumps({'revision': revision, **stats}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--capture')
    parser.add_argument('--facts')
    parser.add_argument('--descriptions')
    parser.add_argument('--expansion')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    CHECK = args.check
    if CHECK and args.capture:
        parser.error('--check cannot capture new input')
    if args.capture:
        capture(args)
    build()
