#!/usr/bin/env python3
"""Save the rendered public preview pages as a portable, script-free artifact."""
import argparse
from html import escape
from html.parser import HTMLParser
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, urlopen


VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}


class PreviewPage(HTMLParser):
    def __init__(self, route):
        super().__init__(convert_charrefs=False)
        self.route = route
        self.stack = []
        self.parts = []
        self.styles = []
        self.assets = set()
        self.main_count = 0

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == 'link' and values.get('rel') == 'stylesheet':
            self.styles.append(values['href'])
        if not self.stack and tag != 'main':
            return
        if not self.stack:
            self.main_count += 1
        assert tag not in ('script', 'iframe', 'form'), 'Preview artifact contains an active surface'
        if tag == 'a':
            href = values.get('href', '')
            page, sep, fragment = href.partition('#')
            mapping = {'/rockstaros': 'index.html', '/rockstaros/guide': 'guide.html'}
            if page in mapping:
                values['href'] = mapping[page] + (sep + fragment if sep else '')
            elif page == '/':
                # The full Web app is not part of this portable preview.
                values['href'] = 'index.html' if '_brand_' in values.get('class', '') else 'https://github.com/k999ln/rock'
            elif page.startswith('/rockstaros/') and Path(page).suffix in ('.mp4', '.png', '.json'):
                assert '..' not in page.split('/')
                self.assets.add(page)
                values['href'] = 'assets/' + Path(page).name
            elif page.startswith('/'):
                raise ValueError('Unmapped application link: ' + page)
        if tag in ('img', 'video', 'source', 'track'):
            for field in ('src', 'poster'):
                src = values.get(field)
                if not src:
                    continue
                parsed = urlsplit(src)
                if parsed.path == '/_next/image':
                    src = parse_qs(parsed.query)['url'][0]
                assert src.startswith('/rockstaros/') and '..' not in src.split('/'), src
                self.assets.add(src)
                values[field] = 'assets/' + Path(src).name
            values.pop('srcset', None)
        attrs = ''.join(' ' + key + ('' if value is None else '="' + escape(value, quote=True) + '"')
                        for key, value in values.items() if not key.startswith('data-'))
        self.parts.append('<' + tag + attrs + '>')
        if tag not in VOID:
            self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if not self.stack:
            return
        assert self.stack[-1] == tag, (self.stack[-1], tag)
        self.parts.append('</' + tag + '>')
        self.stack.pop()

    def handle_data(self, data):
        if self.stack:
            self.parts.append(data.replace('既存のWeb・PCツールへ', '既存Web・PCツールのソースと案内へ'))

    def handle_entityref(self, name):
        if self.stack:
            self.parts.append('&' + name + ';')

    def handle_charref(self, name):
        if self.stack:
            self.parts.append('&#' + name + ';')


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--repository', type=Path, required=True)
    ap.add_argument('--origin', default='http://localhost:5173')
    ap.add_argument('--output', type=Path, required=True)
    ap.add_argument('--allow-dirty-preview', action='store_true')
    args = ap.parse_args()
    root = args.repository.resolve(strict=True)
    assert urlsplit(args.origin).hostname in ('localhost', '127.0.0.1'), 'Only the owned local preview is read'
    inputs = ['app/rockstaros/page.tsx', 'app/rockstaros/guide/page.tsx', 'app/rockstaros/preview.module.css', 'app/globals.css', 'data/rockstaros-preview.json']
    commit = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
    dirty = subprocess.check_output(['git', '-C', str(root), 'status', '--porcelain', '--', *inputs], text=True)
    assert args.allow_dirty_preview or not dirty, 'Commit the exact Web input before exporting the deliverable'
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    assets = output / 'assets'
    assets.mkdir()
    manifest = {'schema': 'rock-preview-site-export/1', 'source_commit': commit,
                'status': 'LOCAL_PORTABLE_PREVIEW_NOT_DEPLOYED', 'dirty_preview': bool(dirty),
                'exporter_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                'source_files_sha256': {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in inputs},
                'pages': {}, 'scope': 'Rendered announcement and guide only. No login, wallet API, Web app state or OS runtime. Original public OS media copied unchanged.'}
    for route, name, title in [('/rockstaros', 'index.html', 'avocadoOS 1.0 Developer Preview'),
                               ('/rockstaros/guide', 'guide.html', '導入・最初の成果・復旧 | avocadoOS 1.0')]:
        with urlopen(args.origin + route, timeout=20) as response:
            assert response.status == 200
            raw = response.read()
        page = PreviewPage(route)
        page.feed(raw.decode())
        page.close()
        assert page.main_count == 1 and not page.stack
        styles = []
        for index, href in enumerate(page.styles):
            assert href.startswith('/') and not href.startswith('//')
            request = Request(args.origin + href, headers={'Accept': 'text/css'})
            with urlopen(request, timeout=20) as response:
                assert response.headers.get_content_type() == 'text/css'
                css = response.read()
            assert b'url(' not in css, 'CSS assets require explicit local export binding'
            css_name = 'style-' + hashlib.sha256(css).hexdigest()[:16] + '.css'
            (assets / css_name).write_bytes(css)
            styles.append('<link rel="stylesheet" href="assets/' + css_name + '">')
        for src in page.assets:
            target = assets / Path(src).name
            origin = root / 'public' / src.lstrip('/')
            if target.exists():
                assert target.read_bytes() == origin.read_bytes(), 'Colliding asset names'
            else:
                shutil.copyfile(origin, target)
        html = '<!doctype html>\n<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escape(title) + '</title>' + ''.join(styles) + '</head><body>' + ''.join(page.parts) + '</body></html>\n'
        (output / name).write_text(html)
        manifest['pages'][name] = {'route': route, 'response_sha256': hashlib.sha256(raw).hexdigest(), 'export_sha256': hashlib.sha256(html.encode()).hexdigest()}
    (output / 'README.md').write_text('# avocadoOS 1.0 — 発表・導入ページのローカル閲覧用ファイル\n\nindex.html を開くと案内、guide.html で導入・復旧手順を確認できます。Webサイトへ公開した記録ではありません。実OSや既存Webアプリ本体の代わりにはなりません。\n\nローカルHTTPで確認する場合は、このフォルダーで `python3 -m http.server 8765 --bind 127.0.0.1` を実行し、ブラウザで `http://localhost:8765/` を開きます。閲覧後はCtrl+Cで終了します。\n\n画面・動画は元のQEMU実画面をそのまま含みます。各ページに記載された受入状況、合成環境、対応・既知制限を確認してください。公開・再配布条件は別途の配布記録が正本です。\n')
    manifest['files_sha256'] = {str(p.relative_to(output)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(output.rglob('*')) if p.is_file()}
    (output / 'site-export.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'status': manifest['status'], 'dirty_preview': bool(dirty), 'output': str(output), 'files': len(manifest['files_sha256']) + 1}))


if __name__ == '__main__':
    main()
