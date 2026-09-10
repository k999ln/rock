#!/usr/bin/env python3
"""Host-only native business UI lifecycle/soak harness; no QEMU is run on import.

Requires Linux QEMU, debugfs/e2fsck, and Tesseract eng+jpn. All business writes
come from actual QMP keyboard/pointer input. OCR only gates visible state; the
independent content/receipt/audit oracle reads SQLite after normal shutdown.
An error preserves the owned device for inspection, never forces it off.
"""
import argparse
from contextlib import contextmanager
import csv
from datetime import datetime, timezone
import hashlib
import importlib.util
import io
import json
import math
import os
from pathlib import Path
import re
import select
import shutil
import struct
import subprocess
import sys
import tempfile
import threading
import time
import unicodedata
import uuid
import zlib

import business_contract as contract
import guest
import wallet_backup

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / 'src'))
from blackberryrock.packages import PUBLIC_TEST_KEY, TEST_PUBLISHER, verify_package

spec = importlib.util.spec_from_file_location('business_backup_verifier', HERE / 'verify-backup.py')
retention = importlib.util.module_from_spec(spec); spec.loader.exec_module(retention)
power, native = retention.power, retention.power.native
require = contract.require
PRODUCT_NAMES = {'1.0.0': '提案下書き', '1.1.0': '提案下書き（簡潔）'}
PRODUCT_PUBLISHER = 'org.rockstar.development'
# OCR-only source-layout regions. A rectangle alone never selects a control.
SEARCH_TEXT = (40, 172, 580, 211)
CATALOG_TITLE = (130, 245, 540, 290)
INSTALLED_TITLE = (130, 173, 540, 218)
HISTORY_TITLE = (45, 171, 535, 218)
RESULT_TEXT = (32, 380, 688, 856)


def normalize(text):
    return ''.join(unicodedata.normalize('NFKC', text).casefold().split())


def ocr_lines(tsv, *, bounds=(720, 960)):
    """Retain word boxes, so a phrase on a shared button row gets its own box."""
    require(len(tsv.encode()) <= 512 * 1024, 'OCR response exceeds fixed budget')
    require(len(bounds) == 2 and all(type(v) is int and 0 < v <= 1940 for v in bounds), 'invalid OCR canvas')
    lines = {}
    # Tesseract TSV text is literal, not CSV-quoted. A JSON quote must not
    # consume later TSV rows into one fabricated OCR word.
    for row in csv.DictReader(io.StringIO(tsv), delimiter='\t', quoting=csv.QUOTE_NONE):
        if row['level'] != '5' or not row['text'].strip(): continue
        confidence = float(row['conf'])
        box = [int(row[k]) for k in ('left', 'top', 'width', 'height')]
        require(math.isfinite(confidence) and 0 <= confidence <= 100 and
                box[2] > 0 and box[3] > 0 and 0 <= box[0] < box[0] + box[2] <= bounds[0] and
                0 <= box[1] < box[1] + box[3] <= bounds[1], 'invalid OCR word box')
        key = tuple(row[k] for k in ('page_num', 'block_num', 'par_num', 'line_num'))
        lines.setdefault(key, []).append({'text': normalize(row['text']), 'confidence': confidence, 'box': box})
    require(sum(len(words) for words in lines.values()) <= 4096, 'OCR word budget exceeded')
    return list(lines.values())


def locate(lines, phrase, *, exact_line=False, ascii_boundary=False):
    query, matches = normalize(phrase), []
    require(query, 'empty UI selector')
    for words in lines:
        text = ''.join(word['text'] for word in words)
        if exact_line and text != query: continue
        start, cursor = text.find(query), 0
        if start < 0: continue
        require(text.find(query, start + 1) < 0, 'ambiguous repeated UI phrase')
        end, matched = start + len(query), []
        if ascii_boundary and ((start and text[start-1] in 'abcdefghijklmnopqrstuvwxyz0123456789') or
                               (end < len(text) and text[end] in 'abcdefghijklmnopqrstuvwxyz0123456789')): continue
        for word in words:
            following = cursor + len(word['text'])
            if following > start and cursor < end: matched.append(word)
            cursor = following
        # Confidence is a predeclared OCR gate, never reduced to get a pass.
        if not matched or min(word['confidence'] for word in matched) < 45: continue
        left = min(word['box'][0] for word in matched); top = min(word['box'][1] for word in matched)
        right = max(word['box'][0] + word['box'][2] for word in matched)
        bottom = max(word['box'][1] + word['box'][3] for word in matched)
        candidate = {'x': round((left + right) / 2), 'y': round((top + bottom) / 2),
                     'box': [left, top, right - left, bottom - top]}
        # The same exact phrase may be recognized in both polarity passes.
        # Collapse only boxes at that same screen location, not similar text
        # or separate controls. Ambiguity between controls remains fatal.
        duplicate = False
        for old in matches:
            x, y, width, height = old['box']
            intersection = max(0, min(right, x + width) - max(left, x)) * max(0, min(bottom, y + height) - max(top, y))
            union = width * height + (right - left) * (bottom - top) - intersection
            if union > 0 and intersection / union >= .70: duplicate = True
        if not duplicate: matches.append(candidate)
    return matches


class ResourceSampler:
    def __init__(self, record, limits):
        self.record, self.limits, self.samples = record, limits, []
        self.error, self.event = None, threading.Event()
        self.ticks = os.sysconf('SC_CLK_TCK')
        self.thread = threading.Thread(target=self.loop, daemon=True)

    def read(self):
        require(guest.running(self.record), 'owned QEMU identity changed during resource observation')
        root = Path('/proc') / str(self.record['pid'])
        status = dict(line.split(':', 1) for line in (root / 'status').read_text().splitlines() if ':' in line)
        fields = (root / 'stat').read_text().rsplit(')', 1)[1].split()
        return {'monotonic': time.monotonic(), 'rss_kib': int(status['VmRSS'].split()[0]),
                'cpu_seconds': (int(fields[11]) + int(fields[12])) / self.ticks}

    def loop(self):
        try:
            while not self.event.is_set():
                if not guest.running(self.record): break
                sample = self.read()
                require(len(self.samples) < self.limits['max_samples'], 'resource sample budget exceeded')
                require(sample['rss_kib'] <= self.limits['peak_rss_kib'], 'QEMU RSS exceeded frozen limit')
                if self.samples:
                    require(sample['monotonic'] - self.samples[-1]['monotonic'] <= self.limits['sample_gap_seconds'],
                            'resource observer missed its sampling deadline')
                self.samples.append(sample)
                self.event.wait(self.limits['sample_seconds'])
        except (OSError, ValueError, KeyError) as error:
            # A normal QEMU exit may race the /proc read; otherwise do not hide
            # missing resource coverage behind a stopped observer thread.
            if guest.running(self.record): self.error = str(error)

    def start(self): self.thread.start()

    def check(self):
        require(self.error is None, 'resource observation failed: ' + str(self.error))

    def stop(self):
        self.event.set(); self.thread.join(timeout=5); self.check()
        require(not self.thread.is_alive(), 'resource observer did not stop')


def resource_summary(samples):
    require(len(samples) >= 2, 'resource samples missing')
    elapsed = samples[-1]['monotonic'] - samples[0]['monotonic']
    require(elapsed > 0, 'resource observation has no elapsed time')
    return {'peak_rss_kib': max(s['rss_kib'] for s in samples),
            'rss_growth_kib': max(0, samples[-1]['rss_kib'] - samples[0]['rss_kib']),
            'cpu_cores_average': (samples[-1]['cpu_seconds'] - samples[0]['cpu_seconds']) / elapsed,
            'samples': len(samples),
            'max_sample_gap_seconds': max(b['monotonic'] - a['monotonic'] for a, b in zip(samples, samples[1:]))}


class ParkedInput(native.NativeInput):
    def click(self, x, y):
        super().click(x, y)
        self.monitor.command('input-send-event', {'events': [
            {'type': 'abs', 'data': {'axis': 'x', 'value': round(705 * 32767 / 719)}},
            {'type': 'abs', 'data': {'axis': 'y', 'value': round(860 * 32767 / 959)}}]})
        self.record('pointer_park', [705, 860])


def primary_text_pixels(image):
    """White glyphs only inside the observed green contour of each ROI row.

    Rounded exterior corners are the light page background, not label ink.
    They must not become black border artifacts in the polarity OCR pass.
    Disabled labels below the existing brightness threshold stay invisible.
    """
    rgb = image.convert('RGB')
    width, height = rgb.size
    require(0 < width <= 720 and 0 < height <= 90, 'primary OCR crop exceeds fixed bounds')
    colors, gray = list(rgb.getdata()), list(rgb.convert('L').getdata())
    require(len(colors) == len(gray) == width * height, 'primary OCR pixel inventory differs')
    pixels = bytearray(0 if value >= 180 else 255 for value in gray)
    for y in range(height):
        start = y * width
        green = [x for x, (r, g, b) in enumerate(colors[start:start + width])
                 if r <= 90 and 50 <= g <= 160 and 20 <= b <= 140 and 100*g >= 135*r and 100*g >= 110*b]
        if not green:
            pixels[start:start + width] = b'\xff' * width
        else:
            pixels[start:start + green[0]] = b'\xff' * green[0]
            pixels[start + green[-1] + 1:start + width] = b'\xff' * (width - green[-1] - 1)
    return bytes(pixels)


def mapped_ocr(tsv, region, *, scale=2, border=10):
    left, top, right, bottom = region
    require(type(scale) is int and scale in (1, 2) and border == 10 and 0 <= left < right <= 720 and 0 <= top < bottom <= 960,
            'invalid fixed OCR region')
    rows = ocr_lines(tsv, bounds=((right - left) * scale + 2 * border, (bottom - top) * scale + 2 * border))
    result = []
    for words in rows:
        inside = []
        for word in words:
            x, y, width, height = word['box']
            x1, y1 = left + math.floor((x - border) / scale), top + math.floor((y - border) / scale)
            x2, y2 = left + math.ceil((x + width - border) / scale), top + math.ceil((y + height - border) / scale)
            if left <= x1 < x2 <= right and top <= y1 < y2 <= bottom:
                inside.append(dict(word, box=[x1, y1, x2 - x1, y2 - y1]))
        if inside: result.append(inside)
    return result


def primary_words_have_ink(words, pixels, region):
    """Original-color OCR cannot enable a dim label without bright contour ink."""
    left, top, right, bottom = region
    width, height = right - left, bottom - top
    require(0 < width <= 720 and 0 < height <= 90 and len(pixels) == width * height,
            'invalid primary word mask')
    for word in words:
        x, y, w, h = word['box']
        require(left <= x < x + w <= right and top <= y < y + h <= bottom, 'primary word outside its control')
        if not any(pixels[row * width + col] == 0 for row in range(y - top, y + h - top)
                   for col in range(x - left, x + w - left)):
            return False
    return bool(words)


def wallet_text_rows(lines):
    """Bounded line segmentation, anchored by a recognized literal word.

    The anchor never selects an action. The complete original label still has
    to be recognized at confidence >=45 before wait() can use its position.
    """
    # Completed Hub jobs also contain 完了. Only the actual Wallet-family
    # header in this same frame can enable the additional label pass.
    headers = [match for title in ('Wallet', 'ATMテスト', '予約の状態')
               for match in locate(lines, title, exact_line=True)
               if 32 <= match['box'][0] < match['box'][0] + match['box'][2] <= 535
               and 55 <= match['box'][1] < match['box'][1] + match['box'][3] <= 108]
    require(len(headers) <= 1, 'ambiguous Wallet page header')
    if not headers:
        return []
    regions = []
    for words in lines:
        for word in words:
            if word['text'] not in (normalize('金額'), normalize('完了')) or word['confidence'] < 45:
                continue
            x, y, width, height = word['box']
            if not (32 <= x < x + width <= 688 and 200 <= y < y + height <= 844 and height <= 26):
                continue
            region = (32, y - 12, 688, y + height + 12)
            if region not in regions: regions.append(region)
    require(len(regions) <= 2, 'ambiguous/excessive Wallet label segmentation anchors')
    return regions


def notice_regions(image):
    region = (32, 148, 688, 188)
    pixels = list(image.crop(region).convert('RGB').getdata())
    # The C notice lane uses these exact success/error backgrounds. A row
    # crop is only a segmentation aid, never evidence of notice semantics.
    return [region] if sum(pixel in ((225, 236, 219), (242, 225, 217)) for pixel in pixels) >= len(pixels) * .5 else []


def result_page(lines):
    """Only the exact native page header enables result-body segmentation."""
    return len([match for match in locate(lines, '実行結果', exact_line=True)
                if 32 <= match['box'][0] < match['box'][0] + match['box'][2] <= 535 and
                   55 <= match['box'][1] < match['box'][1] + match['box'][3] <= 108]) == 1


def result_label_known(lines):
    """Use the original pass if it already reads a complete literal brief.

    The expected input label is deliberately not supplied here. A confidently
    read different label remains different and fails the later state check.
    """
    left, top, right, bottom = RESULT_TEXT
    for words in lines:
        text = ''.join(word['text'] for word in words)
        for candidate in re.findall(r'(?<![a-z0-9])briefc[0-9]j[0-9]{1,3}(?![a-z0-9])', text):
            if any(left <= match['box'][0] < match['box'][0] + match['box'][2] <= right and
                   top <= match['box'][1] < match['box'][1] + match['box'][3] <= bottom
                   for match in locate([words], candidate, ascii_boundary=True)):
                return True
    return False


def recognize_frame(path, deadline=None, *, regions=()):
    """Analyze page text and accent-button text; original PNG stays intact."""
    def budget():
        remaining = 10 if deadline is None else min(10, deadline - time.monotonic())
        if remaining <= 0: raise TimeoutError('OCR exceeded the original UI state deadline')
        return remaining
    budget()
    require(type(regions) is tuple and len(regions) <= 2 and all(r in (SEARCH_TEXT, CATALOG_TITLE, INSTALLED_TITLE, HISTORY_TITLE, RESULT_TEXT) for r in regions),
            'unknown or excessive text OCR regions')
    from PIL import Image, ImageOps
    ocr_env = dict(os.environ, OMP_THREAD_LIMIT='1', OMP_NUM_THREADS='1')
    result = subprocess.run(['tesseract', str(path), 'stdout', '-l', 'eng+jpn', '--psm', '11', 'tsv'],
                            capture_output=True, text=True, check=True, timeout=budget(), env=ocr_env)
    lines = ocr_lines(result.stdout)
    original_lines = list(lines)
    analysis = path.with_name('probe-primary.png')
    with Image.open(path) as source:
        require(source.size == (720, 960), 'OCR requires the native framebuffer size')
        boxes = accent_rectangles(source.convert('RGB'))
        secondary = accent_rectangles(source.convert('RGB'), secondary=True)
        require(len(boxes) + len(secondary) <= 8, 'button OCR region budget exceeded')
        budget()
        # Prefer the dedicated ROI pass for words within a primary button.
        # This removes duplicate OCR hypotheses, not distinct UI controls.
        lines = [words for words in lines if not any(
            left <= word['box'][0] + word['box'][2] / 2 <= right and
            top <= word['box'][1] + word['box'][3] / 2 <= bottom
            for word in words for left, top, right, bottom in (*boxes, *secondary))]
        try:
            for left, top, right, bottom in boxes:
                crop = source.crop((left, top, right, bottom))
                # White enabled-button glyphs become dark text on white.
                # Dimmed/disabled labels below 180 are not made clickable.
                mask = Image.frombytes('L', crop.size, primary_text_pixels(crop))
                ImageOps.expand(mask.resize((mask.width * 2, mask.height * 2), Image.Resampling.BICUBIC), border=10, fill=255).save(analysis)
                result = subprocess.run(['tesseract', str(analysis), 'stdout', '-l', 'eng+jpn', '--psm', '7',
                                         '-c', 'tessedit_do_invert=0', 'tsv'],
                                        capture_output=True, text=True, check=True, timeout=budget(), env=ocr_env)
                lines.extend(mapped_ocr(result.stdout, (left, top, right, bottom)))
                # Keep the original antialiasing for dense Japanese glyphs.
                # Only already detected enabled accent controls get this pass;
                # every accepted word still needs bright >=180 contour ink.
                ImageOps.expand(crop.convert('RGB'), border=10, fill='white').save(analysis)
                result = subprocess.run(['tesseract', str(analysis), 'stdout', '-l', 'eng+jpn', '--psm', '7', 'tsv'],
                                        capture_output=True, text=True, check=True, timeout=budget(), env=ocr_env)
                for words in mapped_ocr(result.stdout, (left, top, right, bottom), scale=1):
                    if primary_words_have_ink(words, primary_text_pixels(crop), (left, top, right, bottom)):
                        lines.append(words)
            requested = tuple(r for r in regions if r != RESULT_TEXT or
                              result_page(original_lines) and not result_label_known(original_lines))
            for region in (*secondary, *requested, *wallet_text_rows(original_lines), *notice_regions(source)):
                budget()
                left, top, right, bottom = region
                crop = source.crop(region)
                scale = 2 if region in (SEARCH_TEXT, CATALOG_TITLE, INSTALLED_TITLE, RESULT_TEXT) else 1
                ImageOps.expand(crop.resize((crop.width * scale, crop.height * scale), Image.Resampling.BICUBIC),
                                border=10, fill='white').save(analysis)
                result = subprocess.run(['tesseract', str(analysis), 'stdout', '-l', 'eng+jpn', '--psm',
                                         '6' if region == RESULT_TEXT else '7', 'tsv'],
                                        capture_output=True, text=True, check=True, timeout=budget(), env=ocr_env)
                # Prefer this dedicated OCR row within the explicit region;
                # elsewhere page OCR remains unchanged, including error text.
                # A single result hypothesis is selected without changing
                # confidence or overlap thresholds. The original pass stays
                # authoritative when it already reads a complete brief label.
                lines = [words for words in lines if not all(
                    left <= w['box'][0] < w['box'][0] + w['box'][2] <= right and
                    top <= w['box'][1] < w['box'][1] + w['box'][3] <= bottom for w in words)]
                lines.extend(mapped_ocr(result.stdout, region, scale=scale))
        finally:
            analysis.unlink(missing_ok=True)
    # Refinement never erases an error observed in the original page pass.
    lines.extend(words for words in original_lines if any(
        normalize(value) in ''.join(w['text'] for w in words) for value in ScreenDriver.FATAL))
    return lines


def accent_rectangles(image, *, secondary=False):
    """Find bounded connected accent regions for OCR only, never for clicks."""
    width, height = image.size
    require((width, height) == (720, 960), 'native frame dimensions required')
    # ui.c's enabled secondary background is e8ede5; disabled e7e7e0
    # is deliberately excluded. Geometry supplies an OCR crop, never a click.
    mask = bytearray(int((r, g, b) == (232, 237, 229)) if secondary else
                     int(r <= 90 and 50 <= g <= 160 and 20 <= b <= 140 and 100*g >= 135*r and 100*g >= 110*b)
                     for r, g, b in image.getdata())
    boxes = []
    for origin in range(len(mask)):
        if not mask[origin]: continue
        mask[origin] = 0; pending = [origin]; count = 0
        left, right, top, bottom = width, 0, height, 0
        while pending:
            index = pending.pop(); y, x = divmod(index, width); count += 1
            left, right, top, bottom = min(left, x), max(right, x), min(top, y), max(bottom, y)
            neighbors = ([index - 1] if x else []) + ([index + 1] if x + 1 < width else []) + \
                        ([index - width] if y else []) + ([index + width] if y + 1 < height else [])
            for neighbor in neighbors:
                if mask[neighbor]: mask[neighbor] = 0; pending.append(neighbor)
        box_width, box_height = right - left + 1, bottom - top + 1
        if box_width >= 180 and 30 <= box_height <= 90 and count >= 8000 and count >= .45 * box_width * box_height:
            boxes.append((left, top, right + 1, bottom + 1))
    require(len(boxes) <= 8, 'primary-button OCR region budget exceeded')
    return boxes


def pending_frame(path):
    """Recognize bounded QEMU startup pixels; never derive clickable text."""
    with path.open('rb') as stream: data = stream.read(4097)
    require(0 < len(data) < 4096 and data[:8] == b'\x89PNG\r\n\x1a\n', 'invalid pending framebuffer PNG')
    offset, chunks = 8, []
    while offset + 12 <= len(data):
        count = struct.unpack('>I', data[offset:offset + 4])[0]
        end = offset + count + 12
        require(end <= len(data) and len(chunks) < 32, 'invalid pending framebuffer chunks')
        kind, payload = data[offset + 4:offset + 8], data[offset + 8:end - 4]
        require(zlib.crc32(kind + payload) & 0xffffffff == struct.unpack('>I', data[end - 4:end])[0],
                'invalid pending framebuffer CRC')
        chunks.append((kind, payload)); offset = end
    require(offset == len(data) and len(chunks) >= 3 and chunks[0][0] == b'IHDR' and len(chunks[0][1]) == 13 and
            chunks[-1] == (b'IEND', b'') and all(kind == b'IDAT' for kind, _ in chunks[1:-1]),
            'invalid pending framebuffer structure')
    width, height, depth, color, compression, filtering, interlace = struct.unpack('>IIBBBBB', chunks[0][1])
    require((width, height) in ((640, 480), (720, 960)) and
            (depth, color, compression, filtering, interlace) == (8, 2, 0, 0, 0),
            'unexpected pending framebuffer format')
    expected = height * (1 + width * 3)
    decoder = zlib.decompressobj()
    try: pixels = decoder.decompress(b''.join(payload for _, payload in chunks[1:-1]), expected + 1)
    except zlib.error as error: raise ValueError('invalid pending framebuffer compression') from error
    require(len(pixels) == expected and decoder.eof and not decoder.unused_data and not decoder.unconsumed_tail,
            'invalid pending framebuffer decoded size')
    if (width, height) == (640, 480):
        # Actual QEMU RGB8 startup frame: “Display output is not active.”
        # Hash decoded scanlines, so compression or IDAT splitting may differ.
        require(hashlib.sha256(pixels).hexdigest() == 'd9a4c215a24917d0a11ac1f08d927cb75f52254522a046765c75bd8a966fe97b',
                'unrecognized QEMU startup framebuffer')
        kind = 'qemu-display-inactive'
    else:
        stride = 1 + width * 3
        require(all(pixels[index] <= 4 and not any(pixels[index + 1:index + stride])
                    for index in range(0, len(pixels), stride)), 'nonempty undersized native framebuffer')
        kind = 'native-empty'
    return {'name': path.name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
            'dimensions': [width, height], 'boot_pending': kind}


class ScreenDriver:
    FATAL = ('結果を確認できません', '接続できません', 'サービスが要求を拒否', 'スナップショットを取得できません',
             '失敗', 'time limit exceeded', 'worker interrupted', 'tool must be installed', 'Walletを取得できません',
             '確認の期限が切れました', '請求処理との接続を確認できません', '同じ要求を照合する')

    def __init__(self, monitor, folder, report, record, sampler, limits):
        self.native = ParkedInput(monitor, folder, report)
        self.folder, self.report, self.record, self.sampler, self.limits = folder, report, record, sampler, limits
        self.probes, self.serial, self.booting = 0, 0, True
        self.operation_deadline = None
        self.pending_kinds = set()

    def check(self):
        require(self.operation_deadline is None or time.monotonic() <= self.operation_deadline,
                'native operation exceeded its frozen deadline')
        self.sampler.check()
        require(guest.running(self.record), 'QEMU stopped before the native shutdown action')
        require(not any(e['event'] in ('RESET', 'SHUTDOWN') for e in self.report['qmp_events']), 'unexpected QMP power event')

    def scan(self, deadline=None, *, regions=()):
        self.check(); self.probes += 1
        require(self.probes <= self.limits['max_probes'], 'screenshot probe budget exceeded')
        path = self.folder / 'probe.png'
        path.unlink(missing_ok=True)
        try:
            self.native.capture('probe')
            metadata = self.report['screenshots'].pop()
        except AssertionError:
            require(self.booting and path.is_file(), 'native framebuffer capture is invalid')
            metadata = pending_frame(path)
            kind = metadata['boot_pending']
            if kind not in self.pending_kinds:
                self.retain(dict(metadata), 'boot-pending', [], keep_probe=True)
                self.pending_kinds.add(kind)
            self.report['boot_pending_probes'] = self.report.get('boot_pending_probes', 0) + 1
            return [], metadata
        try:
            lines = recognize_frame(path, deadline, regions=regions)
        except (TimeoutError, subprocess.SubprocessError):
            self.retain(metadata, 'ocr-failure', [])
            raise
        text = '\n'.join(''.join(w['text'] for w in words) for words in lines)
        fatal = tuple(value for value in self.FATAL if not (self.booting and value == '接続できません'))
        if any(normalize(value) in normalize(text) for value in fatal):
            self.retain(metadata, 'visible-error', lines)
            raise ValueError('visible native UI failure; stopped without another input action')
        return lines, metadata

    def retain(self, metadata, label, lines, *, keep_probe=False):
        self.serial += 1
        require(len(self.report['screenshots']) < self.limits['max_screenshots'], 'retained screenshot budget exceeded')
        name = f'{self.serial:04d}-{label}.png'
        if keep_probe: shutil.copyfile(self.folder / 'probe.png', self.folder / name)
        else: (self.folder / 'probe.png').rename(self.folder / name)
        metadata.update(name=name, ocr_sha256=contract.hashed(lines))
        require(sum(item['bytes'] for item in self.report['screenshots']) + metadata['bytes'] <= self.limits['max_screenshot_bytes'],
                'retained screenshot bytes exceeded budget')
        self.report['screenshots'].append(metadata)
        return metadata

    def wait(self, phrase, *, click=False, seek=False, seconds=None, label='state', regions=(), within=None, exact_line=False, required=(), ascii_boundary=False):
        require(type(required) is tuple and len(required) <= 3, 'bounded simultaneous UI state required')
        require(within is None or within in (CATALOG_TITLE, INSTALLED_TITLE, HISTORY_TITLE, RESULT_TEXT), 'unknown selectable text region')
        alternatives = (phrase,) if isinstance(phrase, str) else phrase
        require(type(alternatives) is tuple and 1 <= len(alternatives) <= 2 and all(type(p) is str for p in alternatives),
                'one or two exact known UI states required')
        deadline = time.monotonic() + (seconds if seconds is not None else self.limits['ui_state_seconds'])
        if self.operation_deadline is not None: deadline = min(deadline, self.operation_deadline)
        pages, previous, repeats = 0, None, 0
        while True:
            lines, metadata = self.scan(deadline, regions=regions)
            if time.monotonic() > deadline:
                self.retain(metadata, 'state-deadline', lines)
                raise TimeoutError('UI state arrived after its original deadline')
            found = [(p, locate(lines, p, exact_line=exact_line, ascii_boundary=ascii_boundary)) for p in alternatives]
            if within == RESULT_TEXT and not result_page(lines): found = []
            if within is not None:
                left, top, right, bottom = within
                found = [(p, [m for m in hits if left <= m['box'][0] < m['box'][0] + m['box'][2] <= right and
                              top <= m['box'][1] < m['box'][1] + m['box'][3] <= bottom]) for p, hits in found]
            corroboration = {p: locate(lines, p, exact_line=True) for p in required}
            if any(len(hits) != 1 for hits in corroboration.values()): found = []
            found = [(p, [m for m in hits if m['y'] < 856]) for p, hits in found]
            found = [(p, hits) for p, hits in found if hits]
            require(len(found) <= 1, 'mutually exclusive native UI states appeared together')
            selected, matches = found[0] if found else (None, [])
            # Footer labels remain visible while scrolling. Only selected
            # content matches can drive these phrase-based mutations.
            matches = [m for m in matches if m['y'] < 856]
            if matches:
                if within == RESULT_TEXT: require(len(matches) == 1, 'ambiguous visible business result label')
                if click: require(len(matches) == 1, 'ambiguous clickable UI selector: ' + selected)
                proof = self.retain(metadata, label, lines)
                self.report['ui_states'].append({'phrase': selected, 'screenshot_sha256': proof['sha256'],
                                                 'observed_unix': time.time(), 'matches': matches,
                                                 'required_same_frame': corroboration, 'within': within, 'exact_line': exact_line,
                                                 'ascii_boundary': ascii_boundary,
                                                 'result_page_header': result_page(lines) if within == RESULT_TEXT else None})
                if click:
                    require(time.monotonic() <= deadline, 'UI click would exceed its original state deadline')
                    self.native.click(matches[0]['x'], matches[0]['y'])
                return dict(matches[0], phrase=selected)
            if time.monotonic() >= deadline:
                self.retain(metadata, 'missing-state', lines)
                raise TimeoutError('required UI state was not observed: ' + str(phrase))
            # Page once per observation, bounded to six pages. When the bottom
            # is reached, return to the top and continue state polling.
            if seek and not metadata.get('boot_pending'):
                repeats = repeats + 1 if metadata['sha256'] == previous else 0
                previous = metadata['sha256']
                if pages >= 6 or repeats >= 1:
                    for _ in range(pages): self.native.keys(['pgup'])
                    pages, repeats = 0, 0
                else:
                    self.native.keys(['pgdn']); pages += 1
            time.sleep(.5)

    def click(self, phrase, **options): return self.wait(phrase, click=True, **options)

    def result(self, label, *, evidence_label):
        require(type(label) is str and re.fullmatch(r'C[0-9]J[0-9]{1,3}', label), 'fixed result label required')
        return self.wait('Brief ' + label, regions=(RESULT_TEXT,), within=RESULT_TEXT,
                         ascii_boundary=True, seek=True, label=evidence_label)

    def nav(self, which):
        self.check()
        self.native.click({'hub': 110, 'installed': 277, 'history': 442, 'wallet': 606}[which], 913)

    def top(self):
        for _ in range(6): self.native.keys(['pgup'])

    def verify_detail(self, version, label='installed-version'):
        require(version in PRODUCT_NAMES, 'unknown signed product version')
        self.wait('バージョン ' + version, exact_line=True,
                  required=('ツールの詳細', PRODUCT_NAMES[version], '作成者 ' + PRODUCT_PUBLISHER), label=label)

    def detail(self, version):
        self.nav('installed')
        self.click(PRODUCT_NAMES[version], exact_line=True, within=INSTALLED_TITLE,
                   regions=(INSTALLED_TITLE,), required=('マイツール',), label='installed-product')
        self.verify_detail(version)

    def search_catalog(self):
        self.nav('hub')
        placeholder = 'ツール名・説明・IDで検索'
        state = self.wait((placeholder, contract.TOOL), regions=(SEARCH_TEXT,), label='catalog-search-state')
        if state['phrase'] == contract.TOOL: self.click('消す', label='clear-prior-search')
        self.click(placeholder, label='catalog-search')
        self.native.type(contract.TOOL); self.native.keys(['ret'])
        self.click(PRODUCT_NAMES['1.1.0'], exact_line=True, within=CATALOG_TITLE,
                   regions=(SEARCH_TEXT, CATALOG_TITLE), required=(contract.TOOL,), label='latest-catalog-product')
        self.verify_detail('1.1.0', label='catalog-product-reviewed')

    def open_history(self, version, *, deleted=False):
        self.nav('history')
        # The actual list is newest first. Read the first card's product name,
        # then independently require the unique input label in its opened result.
        # Result names remain bound to the executed package after deletion.
        # The signed historical version remains in this fixture's catalog.
        name = PRODUCT_NAMES[version]
        self.click(name, exact_line=True, within=HISTORY_TITLE, regions=(HISTORY_TITLE,),
                   required=('実行履歴',), label='saved-history-product')


def admit(driver, operations, action, version=None):
    op = {'op': action}
    if version is not None: op['version'] = version
    # Record intent before the first mutating click. Failure never retries
    # with a new key and cannot drop an uncertain intent from offline checks.
    operations.append(op)
    if action == 'install': driver.click('v' + version + ' をインストール', seek=True, label='install-review')
    elif action == 'approve': driver.click('この権限を確認して利用を許可', seek=True, label='permission-review')
    elif action == 'update': driver.click('v' + version + 'へ更新', seek=True, label='update-review')
    elif action in ('rollback', 'disable', 'uninstall'):
        button, prompt = {'rollback': ('以前の版へ', '以前のバージョンへ戻しますか'),
                          'disable': ('ツールの利用を停止', 'このツールの利用を停止しますか'),
                          'uninstall': ('削除', 'このツールを削除しますか')}[action]
        driver.click(button, seek=True, label=action + '-review')
        driver.wait(prompt, label=action + '-confirm')
        driver.click('確認して実行', label=action + '-confirmed')
    else: raise ValueError('unapproved harness lifecycle action')
    if action == 'approve': driver.wait('ツールを開く', seek=True, label='enabled')
    elif action == 'uninstall': driver.wait('実行履歴は残ります', label='uninstalled')
    else: driver.wait('この権限を確認して利用を許可', seek=True, label='disabled')


def run_job(driver, operations, version, label, output):
    started = time.monotonic()
    driver.operation_deadline = started + driver.limits['job_seconds']
    driver.detail(version)
    driver.click('ツールを開く', seek=True, label='open-business-tool')
    driver.wait('入力テキスト', label='input-editor')
    text = contract.job_input(label)
    driver.native.click(250, 425); driver.native.keys(['ctrl', 'a']); driver.native.type(text)
    driver.wait(label, label='typed-input')
    operation = {'op': 'run', 'version': version, 'input': text}
    operations.append(operation)
    driver.native.keys(['ctrl', 'ret'])
    driver.wait('完了', label='job-completed')
    driver.result(label, evidence_label='business-result')
    driver.open_history(version)
    driver.wait('完了', label='history-completed')
    driver.result(label, evidence_label='reopened-result')
    elapsed = time.monotonic() - started
    require(elapsed <= driver.limits['job_seconds'], 'business UI job exceeded frozen time budget')
    driver.operation_deadline = None
    # These are expected synthetic artifacts, explicitly separate from the
    # actual result SHA proved from the stopped database below.
    (output / (label + '-input.txt')).write_text(text)
    (output / (label + '-expected-result.json')).write_text(contract.expected_output(text, version))
    return {'label': label, 'start_monotonic': started, 'elapsed_seconds': elapsed,
            'input_sha256': hashlib.sha256(text.encode()).hexdigest(), 'version': version}


@contextmanager
def pinned_exit(record):
    """Observe whole-process exit; a missing /proc/exe is not exit evidence.

    A pidfd opened without PIDFD_THREAD becomes readable only after the last
    thread exits. Recheck the exact QEMU identity around acquisition; never
    send a signal. Closed-disk admission still separately rejects live sockets.
    """
    require(guest.running(record), 'owned QEMU identity required before pinning exit')
    fd = os.pidfd_open(record['pid'], 0)
    try:
        require(guest.running(record), 'owned QEMU identity changed while pinning exit')
        yield lambda: bool(select.select([fd], [], [], 0)[0])
    finally:
        os.close(fd)


def clean_shutdown(driver, record):
    with pinned_exit(record) as exited:
        driver.native.click(636, 26)
        driver.click('電源を切る', seek=True, label='normal-poweroff')
        driver.wait('端末の電源を切りますか', label='normal-poweroff-confirm')
        started = time.monotonic()
        driver.click('確認して実行', label='normal-poweroff-confirmed')
        while not exited():
            driver.sampler.check()
            require(time.monotonic() - started <= driver.limits['shutdown_seconds'], 'normal shutdown deadline exceeded')
            time.sleep(.25)
        elapsed = time.monotonic() - started
        require(elapsed <= driver.limits['shutdown_seconds'], 'normal shutdown deadline exceeded before observed exit')
        return elapsed


def verify_power(before, after, events):
    require(len(after) == len(before) + 1, 'exactly one native normal poweroff required')
    previous = {row['key']: row for row in before}
    require(all(row in after for row in before), 'old power receipts changed')
    added = [row for row in after if row['key'] not in previous]
    require(len(added) == 1 and added[0]['boot_id'] not in {r['boot_id'] for r in before}, 'distinct kernel boot identity required')
    power.guest.validate_record(added[0], 'poweroff', added[0]['boot_id'], dispatched=True)
    require(str(uuid.UUID(added[0]['boot_id'])) == added[0]['boot_id'], 'invalid kernel boot identity')
    relevant = [e for e in events if e['event'] in ('RESET', 'SHUTDOWN')]
    require(len(relevant) == 1 and relevant[0]['event'] == 'SHUTDOWN' and relevant[0].get('data', {}).get('guest') is True,
            'actual guest shutdown required; reset or host power is forbidden')
    return added[0]['boot_id']


def verify_baseline(snapshot, rows, profile=None):
    require(all(not value for name, value in rows.items() if name != 'sqlite_sequence'), 'fresh baseline already contains Hub business state')
    if profile is not None and profile['name'] == 'development-game-authority/1':
        cached = snapshot['wallet_cache']
        require(cached['tables']['identity']['rows'] == cached['tables']['snapshot']['rows'] == 1 and
                all(value['rows'] == 0 for name, value in cached['tables'].items() if name not in ('identity', 'snapshot')),
                'fresh remote cache contains action requests or unexpected data')
        for role in ('game_exchange_cache', 'game_connection_a', 'game_connection_b'):
            require(snapshot[role]['tables']['identity']['rows'] == 1 and
                    all(value['rows'] == 0 for name, value in snapshot[role]['tables'].items() if name != 'identity'),
                    'fresh Game SDK journal already contains business state: ' + role)
            if profile.get('game_read_sync_allowed') is False:
                sync = snapshot[role]['game_read_sync']
                require(type(sync['identity']['maximum_time']) is int and sync['identity']['maximum_time'] == 0 and
                        sync['bindings'] == [], 'fresh unobserved Game SDK clock or bindings changed: ' + role)
    else:
        money = snapshot['wallet']['financial_summary']
        require(all(value == 0 for key, value in money.items() if key not in ('currency', 'simulation_only')),
                'fresh Wallet baseline has financial/credential side effects')
        require(all(value == 0 for value in snapshot['membership']['financial_summary'].values()), 'fresh membership baseline is already active')
    require(all(table['rows'] == 0 for table in snapshot['remote']['tables'].values()), 'fresh remote baseline has jobs')


@contextmanager
def closed_device(config, expected_record):
    """Fence all stopped-disk reads against another start and orphan sockets."""
    state = guest.BASE / config['name']
    with retention.backup.locked(state):
        current = retention.backup.read_metadata(state / 'running.json')
        require(current['pid'] == expected_record['pid'] and current['session'] == expected_record['session'],
                'device running record was replaced before closed observation')
        require(not guest.running(current), 'current device is running; closed observation refused')
        require(contract.canonical(retention.backup.read_metadata(state / 'device.json')) == contract.canonical(config),
                'device configuration changed before closed observation')
        for name in ('vnc.sock', 'qmp.sock', 'websocket.sock'):
            guest.remove_stale_socket(state / name)
        yield state / 'userdata.ext4'


def unchanged_non_hub(before, after, profile=None):
    sources = retention.SOURCES if profile is None else profile['sources']
    require(set(before) == set(after) == set(sources), 'business DB profile coverage changed')
    for role in set(before) - {'hub', 'power'}:
        if role == 'wallet_cache' and profile is not None and profile.get('cache_read_sync'):
            import wallet_cache_retention
            wallet_cache_retention.compare(before[role], after[role])
        elif role.startswith('game_') and profile is not None and profile.get('game_read_sync') and profile.get('game_read_sync_allowed', True):
            import game_cache_retention
            game_cache_retention.compare(before[role], after[role], role)
        else:
            require(before[role] == after[role], 'unexpected business mutation: ' + role)
    for role, allowed in (('hub', {'hub_jobs', 'hub_requests', 'hub_audit', 'hub_installed', 'hub_packages'}),
                          ('power', {'requests'})):
        require(before[role]['schema_sha256'] == after[role]['schema_sha256'], 'business schema changed: ' + role)
        require({k: v for k, v in before[role]['tables'].items() if k not in allowed} ==
                {k: v for k, v in after[role]['tables'].items() if k not in allowed}, 'unexpected added-table mutation: ' + role)


def extract_packages(rootfs, output):
    hashes = {}
    for version in contract.VERSIONS:
        name = contract.TOOL + '--' + version + '.rock.json'
        destination = output / name
        # The immutable image is not mounted, and the extractor has no -w.
        subprocess.run(['debugfs', '-R', 'dump /usr/share/rock/registry/' + name + ' ' + str(destination), str(rootfs)],
                       check=True, capture_output=True, timeout=20)
        require(destination.is_file() and 0 < destination.stat().st_size < 256 * 1024, 'signed business version missing from image')
        package = json.loads(destination.read_text())
        manifest, hashes[version] = verify_package(package, {TEST_PUBLISHER: PUBLIC_TEST_KEY})
        require(manifest['id'] == contract.TOOL and manifest['version'] == version and
                manifest['name'] == PRODUCT_NAMES[version] and manifest['publisher'] == PRODUCT_PUBLISHER and
                manifest['execution_targets'] == ['device_local'] and manifest['data']['destinations'] == [] and
                manifest['permissions'] == ['text.input', 'text.output'] and manifest['price']['amount_minor'] == 0,
                'business fixture changed permissions, target or price')
    require(len(set(hashes.values())) == 2, 'two distinct signed packages required')
    return hashes


def public_pin(driver, button):
    driver.wait('試験PINを入力', label='public-authenticator-pin')
    # The auth UI enters this dedicated input mode itself. Do not log the
    # PIN through generic type(), and never reveal an ATM bearer code.
    for _ in range(4):
        driver.native.monitor.command('send-key', {'keys': [{'type': 'qcode', 'data': '0'}], 'hold-time': 80})
        time.sleep(.15)
    driver.native.record('public-test-pin-entry', {'digits': 4, 'value_recorded': False})
    driver.click(button, label='public-authenticator-confirmed')


def wallet_ui_flow(driver):
    started = time.monotonic()
    driver.operation_deadline = started + wallet_backup.plan()['wallet_ui_seconds']
    driver.nav('wallet'); driver.click('テスト登録を始める', seek=True, label='wallet-registration')
    driver.wait('月額テストへの同意はまだありません', seek=True, label='registration-without-consent')
    driver.click('試験認証器を登録する', seek=True, label='wallet-enrollment')
    driver.wait('試験認証器の登録', label='public-enrollment-review')
    public_pin(driver, 'PINを確認して登録')
    driver.click('Wallet利用条件を確認する', seek=True, label='separate-wallet-terms')
    driver.wait('Wallet試験の利用条件', label='wallet-terms-review')
    driver.click('確認して実行', label='wallet-terms-accepted')
    driver.wait('試験認証器とWallet利用条件を確認済み', seek=True, label='wallet-active')
    driver.click('テスト操作を開く', seek=True, label='local-simulator-controls')
    amount = driver.wait('テスト金額 (USD)', seek=True, label='simulator-amount-label')
    if amount['y'] > 740:
        driver.native.keys(['pgdn'])
        amount = driver.wait('テスト金額 (USD)', seek=True, label='simulator-amount-visible')
    require(190 <= amount['y'] <= 740, 'amount input is not safely visible below its observed label')
    driver.native.click(250, amount['y'] + 55); driver.native.keys(['ctrl', 'a']); driver.native.type('20.00')
    driver.wait('20.00', label='synthetic-credit-amount')
    driver.click('売上を作る', seek=True, label='synthetic-sale')
    driver.wait('PENDING_SETTLEMENT', seek=True, label='credit-unsettled')
    driver.click('売上を確定', seek=True, label='synthetic-settlement')
    driver.wait('SETTLED', seek=True, label='credit-settled')
    driver.nav('wallet')
    driver.click('$8.88 / 月のテストに同意する', seek=True, label='separate-monthly-consent')
    driver.wait('月額テストの同意を取り消す', seek=True, label='monthly-consent-recorded')
    for index in range(2):
        driver.click('今月のテスト請求を確認・再試行', seek=True, label='same-month-request-' + str(index))
        driver.wait('請求要求を受け付けました', label='same-month-receipt-' + str(index))
        driver.wait('テスト請求が完了しました', seek=True, label='same-month-paid-' + str(index))
    driver.click('月額テストの同意を取り消す', seek=True, label='monthly-renewal-canceled')
    driver.top(); driver.wait('自動更新は停止済み', seek=True, label='paid-period-retained')
    # The existing ATM navigation initializes its amount to exactly 10.00.
    driver.click('ATMで内容を確認', seek=True, label='native-atm-test')
    driver.wait('10.00', seek=True, label='ten-dollar-hold-review')
    driver.click('予約内容を確認', seek=True, label='signed-atm-quote')
    driver.wait('ATMの予約内容を確認', label='atm-authorization-review')
    driver.wait('手数料', label='atm-fee-disclosure')
    public_pin(driver, '認証して予約する')
    driver.wait('予約済み', seek=True, label='actual-reservation')
    driver.wait('保留中: USD 10.00', seek=True, label='actual-hold')
    driver.click('予約を取消・保留を照合', seek=True, label='owner-cancel-unused-reservation')
    driver.wait('取消済み', seek=True, label='actual-cancellation')
    driver.wait('保留中: USD 0.00', seek=True, label='hold-returned')
    elapsed = time.monotonic() - started
    require(elapsed <= wallet_backup.plan()['wallet_ui_seconds'], 'Wallet UI phase exceeded frozen budget')
    driver.operation_deadline = None
    return elapsed


def wallet_readonly_flow(driver):
    driver.nav('wallet'); driver.wait('自動更新は停止済み', seek=True, label='retained-monthly-cancellation')
    driver.wait('テスト請求が完了しました', seek=True, label='retained-paid-month')
    driver.click('テスト操作を開く', seek=True, label='retained-simulator-view')
    driver.click('ATMで内容を確認', seek=True, label='retained-atm-history')
    driver.click('取消済み', seek=True, label='reopen-retained-atm-result')
    driver.wait('保留中: USD 0.00', seek=True, label='retained-zero-hold')


def closed_wallet_proof(data):
    with tempfile.TemporaryDirectory(prefix='rock-closed-wallet-proof-') as temporary:
        paths = {}
        for role in wallet_backup.TABLES:
            paths[role] = Path(temporary) / (role + '.sqlite3')
            power.export_closed_database(data, retention.SOURCES[role][0], paths[role])
            paths[role].chmod(0o600)
        return wallet_backup.validate(wallet_backup.read_databases(paths))


def wallet_only_changes(before, after):
    """The independent Wallet population cannot alter Tools or remote state."""
    require(set(before) == set(after) == set(retention.SOURCES), 'Wallet phase lost DB coverage')
    for role in ('hub', 'remote'):
        require(before[role] == after[role], 'Wallet phase changed unrelated business state: ' + role)
    for role in ('wallet', 'membership', 'authenticator', 'power'):
        require(before[role]['schema_sha256'] == after[role]['schema_sha256'], 'Wallet phase changed a database schema')
        known = set(retention.SOURCES[role][1])
        require({k: v for k, v in before[role]['tables'].items() if k not in known} ==
                {k: v for k, v in after[role]['tables'].items() if k not in known}, 'Wallet phase changed an additional table')


def preflight(images, output_parent, mode, source_commit, boot_profile='legacy-local', device_config=None):
    require(sys.platform == 'linux', 'NOT_RUN: execute on the Linux QEMU build host')
    require(hasattr(os, 'pidfd_open'), 'NOT_RUN: Linux pidfd exit observation is required')
    require(re.fullmatch('[0-9a-f]{40}', source_commit), 'exact source commit required')
    require(mode in ('lifecycle', 'soak'), 'unknown verification mode')
    require(boot_profile in ('legacy-local', 'local-ab', 'game-authority-ab'), 'explicit supported boot profile required')
    require((device_config is not None) == (boot_profile == 'game-authority-ab'),
            'a fixed device configuration is required only for the Game authority profile')
    for command in ('qemu-system-aarch64', 'mkfs.ext4', 'debugfs', 'e2fsck', 'tesseract', 'openssl'):
        require(shutil.which(command) is not None, 'NOT_RUN: missing host prerequisite ' + command)
    try:
        from PIL import Image, ImageOps
    except ImportError as error:
        raise ValueError('NOT_RUN: python3-pil is required for primary-button OCR analysis') from error
    languages = subprocess.run(['tesseract', '--list-langs'], capture_output=True, text=True, check=True, timeout=10)
    require({'eng', 'jpn'} <= set(languages.stdout.split()), 'NOT_RUN: Tesseract eng+jpn are required; do not weaken selectors')
    images = images.resolve(strict=True); output_parent = output_parent.resolve(strict=True)
    require(re.fullmatch('/[A-Za-z0-9_./-]+', str(output_parent)), 'evidence parent requires a debugfs-safe absolute path')
    guest.directory(output_parent)
    name = 'business-' + uuid.uuid4().hex[:20]
    require(not (guest.BASE / name).exists(), 'fresh device name already exists; existing data will not be used')
    names = ('Image', 'rootfs.ext4', 'stage0.cpio.gz') if boot_profile != 'legacy-local' else ('Image', 'rootfs.ext4')
    config = {'schema': 'rock-desktop-device/2', 'name': name, 'images': str(images), 'network': 'none',
              'sha256': {f: guest.digest(images / f) for f in names}}
    if boot_profile == 'local-ab':
        from service_access import profile
        factory = profile._stage0(images / 'stage0.cpio.gz')['factory']
        config.update(schema='rock-desktop-device/6', viewer='browser',
                      boot={'mode': 'signed-stage0', 'profile': 'local-development',
                            'factory_sha256': hashlib.sha256(factory).hexdigest()})
    elif boot_profile == 'game-authority-ab':
        supplied = retention.backup.read_metadata(Path(device_config).resolve(strict=True))
        require(supplied.get('schema') == 'rock-desktop-device/7' and supplied.get('network') == 'game-authority' and
                supplied.get('boot', {}).get('mode') == 'signed-stage0' and
                supplied.get('boot', {}).get('profile') == 'development-game-authority', 'explicit signed Game authority device/7 required')
        require(supplied.get('images') == str(images) and supplied.get('sha256') == config['sha256'],
                'supplied Game device is not the exact tested image triple')
        config = {**supplied, 'name': name}
        import stage0
        freeze = stage0.read_json(images / 'freeze-manifest.json', limit=2 * 1024**2)
        require(freeze.get('schema') == 'rock-build-freeze/2' and freeze.get('status') == 'BUILD_COMPLETE_FROZEN' and
                freeze.get('source_commit') == source_commit and freeze.get('files_sha256') == config['sha256'],
                'Game authority image is not bound to the declared complete frozen source')
    guest.validate_config(config)
    return config, output_parent / name


def run(images, output_parent, mode, source_commit, *, boot_profile='legacy-local', prepare_backup=False, reinstall_after_delete=False, preflight_only=False, device_config=None):
    require(not reinstall_after_delete or mode == 'lifecycle',
            'reinstall-after-delete is a lifecycle-only acceptance operation')
    require(not (boot_profile == 'game-authority-ab' and prepare_backup),
            'Game authority Wallet preparation requires its separate explicit UI flow; local Wallet preparation cannot be reused')
    config, output = preflight(images, output_parent, mode, source_commit, boot_profile, device_config)
    output.mkdir(mode=0o700)
    profile = retention.retention_profile(config)
    if boot_profile == 'game-authority-ab':
        profile['game_read_sync_allowed'] = False
    authority, authority_baseline = None, None
    frozen = contract.plan(mode)
    frozen.update(config=config, source_commit_declared=source_commit, prepare_backup=prepare_backup,
                  wallet_preparation=wallet_backup.plan() if prepare_backup else None,
                  ocr={'languages': 'eng+jpn', 'omp_thread_limit': 1, 'omp_num_threads': 1, 'page_psm': 11, 'primary_psm': 7, 'minimum_confidence': 45,
                       'normalization': 'NFKC, Unicode casefold, remove whitespace; exact phrase only',
                       'primary_scale': 2, 'primary_original_color_psm': 7, 'primary_original_color_scale': 1, 'wallet_header_region': [32, 55, 535, 108], 'wallet_headers': ['Wallet', 'ATMテスト', '予約の状態'], 'wallet_label_anchors': ['金額', '完了'], 'wallet_label_max_rows': 2, 'wallet_label_scale': 1, 'secondary_color': 'e8ede5', 'secondary_scale': 1, 'max_button_regions': 8, 'notice_region': [32, 148, 688, 188], 'notice_scale': 1, 'text_region_scale': {'search_catalog_installed': 2, 'history_title': 1}, 'text_region_psm': 7,
                       'text_regions': [SEARCH_TEXT, CATALOG_TITLE, INSTALLED_TITLE, HISTORY_TITLE],
                       'result_text': {'region': RESULT_TEXT, 'scale': 2, 'psm': 6, 'max_regions': 1,
                                       'required_header': '実行結果', 'header_region': [32, 55, 535, 108],
                                       'selection': 'original page if it reads any complete literal Brief CnJn in body at confidence45; otherwise fixed body refinement; expected input label is not used for pass selection',
                                       'selector': 'literal Brief + original input label, bounded by non-ASCII-alphanumeric characters'},
                       'primary_analysis': 'bounded accent regions; observed row green contour; grayscale >=180 glyphs to black; 10px white border; no auto-invert',
                       'duplicate_box_min_iou': .70},
                  frozen_at=datetime.now(timezone.utc).isoformat())
    frozen['business_profile'] = profile
    if reinstall_after_delete:
        frozen['reinstall_after_delete'] = {'enabled': True, 'expected_operations': 16,
            'expected_jobs': 5, 'wallet_mutations': False,
            'sequence': ['real-delete', 'saved-result', 'install', 'approve', 'run']}
    if boot_profile == 'game-authority-ab':
        import game_authority_observer as authority_contract
        authority = authority_contract.Observer(HERE.parent / 'game_exchange/sandbox.py',
            config['game']['config'], config['game']['authority_id'], output)
        require(authority.input_hashes['sandbox_config_sha256'] == config['game']['sha256'],
                'Game authority configuration changed since device preflight')
        if not preflight_only:
            authority.invoke('stop')
        authority_baseline = authority.invoke('snapshot')
        empty = authority_contract.empty_baseline(authority_baseline)
        guest.save(output / 'authority-before-ui.json', authority_baseline)
        frozen['network'] = 'game-authority: QEMU user NAT to the fixed public development authorities, no port forwarding'
        frozen['scope']['wallet'] = 'remote authority and Game journals retained; pre-UI authoritative financial/credential/member tables empty'
        frozen['authority_observation'] = {'schema': authority_contract.SCHEMA, 'limits': authority_contract.LIMITS,
            **authority.input_hashes, 'baseline': empty,
            'baseline_file_sha256': guest.digest(output / 'authority-before-ui.json'),
            'comparison': 'complete canonical snapshot equality, including all databases, schemas, typed rows, intrinsic rowid, sequences, pragmas and protected identity JSON',
            'lifecycle': 'stop and fenced snapshot before UI; start before every boot; stop and fenced snapshot after every normal shutdown'}
        frozen['device_config_input_sha256'] = guest.digest(Path(device_config))
        frozen['candidate_freeze_sha256'] = guest.digest(Path(config['images']) / 'freeze-manifest.json')
    packages = extract_packages(Path(config['images']) / 'rootfs.ext4', output)
    if prepare_backup:
        frozen['scope']['wallet'] = 'business cycles preserve the empty baseline; separate two-boot synthetic Wallet prerequisite follows'
    frozen['package_hashes'] = packages
    guest.save(output / 'plan.json', frozen)
    expected_plan_hash = contract.hashed(frozen)
    report = {'schema': 'rock-native-business-evidence/1', 'status': 'RUNNING', 'plan_sha256': expected_plan_hash,
              'scope': frozen['scope'], 'cycles': [], 'wallet_cycles': [], 'wallet_preparation': 'NOT_RUN',
              'soak': None, 'resources': None, 'operations': [],
              'D2': 'NOT_RUN', 'D6': 'NOT_RUN', 'real_funds': 'NOT_RUN', 'hardware': 'NOT_RUN'}
    if preflight_only:
        report.update(status='PREFLIGHT_ONLY', qemu='NOT_RUN', source_device=config['name'])
        guest.save(output / 'report.json', report)
        print(json.dumps({'status': report['status'], 'evidence': str(output)}), flush=True)
        return report
    operations, all_jobs, previous_rows, previous_power, baseline = report['operations'], [], None, [], None
    previous_snapshot = None
    record, monitor, sampler, baseline_slots, nonempty_baseline = None, None, None, None, None
    limits = frozen['limits']
    business_cycles = frozen['normal_boot_shutdown_cycles']
    total_cycles = business_cycles + (frozen['wallet_preparation']['additional_normal_boot_shutdown_cycles'] if prepare_backup else 0)
    try:
        for cycle_number in range(total_cycles):
            wallet_step = cycle_number - business_cycles
            require(contract.hashed(json.loads((output / 'plan.json').read_text())) == expected_plan_hash, 'frozen plan changed')
            if authority is not None:
                require(guest.digest(Path(config['images']) / 'freeze-manifest.json') == frozen['candidate_freeze_sha256'],
                        'candidate source/build/profile provenance changed')
                authority.invoke('start')
            started = time.monotonic(); record = guest.start(config)
            require(not record.get('reused'), 'refusing to reuse an already running virtual device')
            folder = output / ('cycle-' + str(cycle_number)); folder.mkdir(mode=0o700)
            cycle = {'number': cycle_number, 'session': record['session'], 'input_events': [], 'screenshots': [],
                     'qmp_events': [], 'qmp_commands': [], 'ui_states': [], 'jobs': [], 'clean_exit': False,
                     'retention_verified': False}
            report['cycles' if wallet_step < 0 else 'wallet_cycles'].append(cycle)
            sampler = ResourceSampler(record, limits); sampler.start()
            monitor = power.Monitor(record['qmp_socket'], cycle)
            driver = ScreenDriver(monitor, folder, cycle, record, sampler, limits)
            driver.wait('ツール名・説明・IDで検索', seconds=max(.01, limits['boot_seconds'] - (time.monotonic() - started)), label='boot-ready')
            driver.booting = False
            cycle['boot_seconds'] = time.monotonic() - started
            require(cycle['boot_seconds'] <= limits['boot_seconds'], 'boot deadline exceeded')
            if wallet_step == 0:
                cycle['wallet_ui_seconds'] = wallet_ui_flow(driver)
            elif wallet_step == 1:
                wallet_readonly_flow(driver)
            elif cycle_number == 0:
                # A normal cold boot/shutdown establishes the untouched
                # baseline before any install/consent/run UI input is sent.
                driver.nav('wallet'); driver.wait('Wallet', label='wallet-baseline')
            elif cycle_number == 1:
                driver.search_catalog()
                driver.click('v1.0.0 を選ぶ', seek=True, label='choose-signed-old-version')
                driver.top(); driver.verify_detail('1.0.0', label='selected-old-version')
                for index, (action, version) in enumerate((('install', '1.0.0'), ('update', '1.1.0'), ('rollback', '1.0.0'))):
                    if index: driver.detail('1.0.0' if action == 'update' else '1.1.0')
                    admit(driver, operations, action, version); admit(driver, operations, 'approve', version)
                    cycle['jobs'].append(run_job(driver, operations, version, 'C1J' + str(index), folder))
                driver.detail('1.0.0'); admit(driver, operations, 'disable')
                admit(driver, operations, 'approve', '1.0.0')
                cycle['jobs'].append(run_job(driver, operations, '1.0.0', 'C1J3', folder))
            elif cycle_number < 4:
                cycle['jobs'].append(run_job(driver, operations, '1.0.0', f'C{cycle_number}J0', folder))
            else:
                soak_start = time.monotonic()
                for index in range(frozen['soak_jobs']):
                    deadline = soak_start + index * frozen['job_interval_seconds']
                    while time.monotonic() < deadline:
                        driver.check(); time.sleep(max(0, min(1, deadline - time.monotonic())))
                    cycle['jobs'].append(run_job(driver, operations, '1.0.0', f'C4J{index}', folder))
                    require(time.monotonic() - soak_start <= limits['soak_max_seconds'], 'soak exceeded frozen duration')
                    print(json.dumps({'cycle': cycle_number, 'completed_soak_jobs': index + 1, 'required': frozen['soak_jobs']}), flush=True)
                starts = [job['start_monotonic'] for job in cycle['jobs']]
                soak_end = time.monotonic()
                report['soak'] = {'elapsed_seconds': soak_end - starts[0], 'jobs': len(starts),
                                  'max_start_gap_seconds': max(b - a for a, b in zip(starts, starts[1:])),
                                  'max_job_seconds': max(job['elapsed_seconds'] for job in cycle['jobs'])}
            if cycle_number == business_cycles - 1:
                driver.detail('1.0.0'); admit(driver, operations, 'uninstall')
                # Deletion must retain a visible saved result as well as DB rows.
                driver.open_history('1.0.0', deleted=True)
                driver.result(cycle['jobs'][-1]['label'], evidence_label='result-after-delete')
                if prepare_backup or reinstall_after_delete:
                    # A source for restore acceptance still has an approved
                    # installed Tool. Do not omit or pretend the deletion:
                    # install again through the UI and retain all prior rows.
                    driver.search_catalog()
                    driver.click('v1.0.0 を選ぶ', seek=True, label='reinstall-version')
                    driver.top(); driver.verify_detail('1.0.0', label='reinstall-version-reviewed')
                    admit(driver, operations, 'install', '1.0.0'); admit(driver, operations, 'approve', '1.0.0')
                    cycle['jobs'].append(run_job(driver, operations, '1.0.0', f'C{cycle_number}J999', folder))
            cycle['shutdown_seconds'] = clean_shutdown(driver, record)
            sampler.stop(); cycle['resources'] = resource_summary(sampler.samples)
            guest.save(folder / 'resource-samples.json', sampler.samples)
            cycle['resource_samples_sha256'] = guest.digest(folder / 'resource-samples.json')
            monitor.close(); monitor = None
            if authority is not None:
                authority.invoke('stop')
                current_authority = authority.invoke('snapshot')
                authority_contract.unchanged(authority_baseline, current_authority)
                guest.save(folder / 'authority-snapshot.json', current_authority)
                cycle['authority_snapshot_sha256'] = guest.digest(folder / 'authority-snapshot.json')
                cycle['authority_retention'] = 'PASS_ALL_DECLARED_DATABASES_AND_IDENTITIES'
            with closed_device(config, record) as data:
                check = subprocess.run(['e2fsck', '-f', '-n', str(data)], capture_output=True, text=True, timeout=30)
                require(check.returncode == 0, 'normal shutdown left filesystem recovery pending; no repair performed')
                cycle['filesystem_check_sha256'] = hashlib.sha256((check.stdout + check.stderr).encode()).hexdigest()
                retention.verify_profile_layout(data, profile)
                snapshot, rows, power_rows = retention.business_snapshot(data, profile)
                cycle['boot_id'] = verify_power(previous_power, power_rows, cycle['qmp_events'])
                cycle['clean_exit'] = True
                cycle['business'] = contract.validate_hub(rows, operations, packages)
                if baseline is None:
                    verify_baseline(snapshot, rows, profile); baseline = snapshot
                    # Byte-preserved baseline artifact; it is never mounted,
                    # repaired, restored over, or used as a running data image.
                    shutil.copyfile(data, output / 'baseline-userdata.ext4')
                    (output / 'baseline-userdata.ext4').chmod(0o600)
                    report['baseline_disk_sha256'] = guest.digest(output / 'baseline-userdata.ext4')
                elif wallet_step < 0:
                    unchanged_non_hub(previous_snapshot, snapshot, profile); contract.preserve_rows(previous_rows, rows)
                elif wallet_step == 0:
                    wallet_only_changes(report['cycles'][-1]['business_snapshot'], snapshot)
                    cycle['nonempty_wallet'] = closed_wallet_proof(data)
                    nonempty_baseline = snapshot
                else:
                    unchanged_non_hub(nonempty_baseline, snapshot, profile)
                    require(snapshot['hub'] == nonempty_baseline['hub'], 'retained Wallet boot changed Hub state')
                    cycle['nonempty_wallet'] = closed_wallet_proof(data)
                    require(cycle['nonempty_wallet'] == report['wallet_cycles'][0]['nonempty_wallet'],
                            'nonempty Wallet records changed after the retained-state boot')
                cycle['retention_verified'] = True
                cycle['disk_sha256'] = guest.digest(data)
                cycle['business_snapshot'] = snapshot
                if config['schema'] in ('rock-desktop-device/6', 'rock-desktop-device/7'):
                    import stage0
                    stage0.validate_disks(config, data.parent)
                    cycle['signed_slots'] = stage0.stopped_slots(config, data.parent)
                    slots = {name: guest.digest(data.parent / name) for name in stage0.DISKS if name != 'userdata.ext4'}
                    if baseline_slots is None: baseline_slots = slots
                    require(slots == baseline_slots, 'business workload unexpectedly changed an OS slot')
                    cycle['slot_sha256'] = slots
            all_jobs.extend(cycle['jobs']); previous_rows, previous_power, previous_snapshot = rows, power_rows, snapshot
            if cycle_number == 4:
                # Growth starts at the already booted soak workload, not at
                # QEMU's initially unpopulated RAM before the kernel starts.
                report['resources'] = resource_summary([s for s in sampler.samples if soak_start <= s['monotonic'] <= soak_end])
            require(sum(p.stat().st_size for p in output.rglob('*') if p.is_file()) <= limits['max_evidence_bytes'],
                    'total evidence byte budget exceeded')
            # Clean exit is independently linked to a durable power receipt,
            # actual guest QMP shutdown and a read-only filesystem check.
            guest.validate_config(config)
            guest.save(output / 'report.json', report)
            print(json.dumps({'cycle': cycle_number, 'status': 'VERIFIED_CLOSED', 'evidence': str(output)}), flush=True)
        require(guest.digest(output / 'baseline-userdata.ext4') == report['baseline_disk_sha256'], 'baseline disk changed')
        require(contract.hashed(json.loads((output / 'plan.json').read_text())) == expected_plan_hash, 'frozen plan changed')
        report['D2'] = {'business_lifecycle': 'PASS', 'in_flight_cancel': 'NOT_RUN', 'wallet_synthetic_flow': 'NOT_RUN',
                        'whole_gate': 'INCOMPLETE', 'meaning': 'install/approve/run/result/history/update/rollback/disable/reapprove/delete verified'}
        if reinstall_after_delete:
            require(len(operations) == 16 and len(all_jobs) == 5,
                    'complete reinstall lifecycle requires exactly 16 operations and five actual jobs')
            report['D2']['reinstall_after_delete'] = {'status': 'PASS', 'operations': len(operations),
                                                    'jobs': len(all_jobs)}
        if mode == 'soak':
            contract.validate_soak(frozen, expected_plan_hash, report)
            report['D6'] = {'workload': 'PASS', 'guest_per_service_resources': 'NOT_RUN',
                            'meaning': 'five normal boots, 61 repeated UI jobs over at least 60 min, host QEMU RSS/CPU thresholds'}
            if authority is not None:
                require(len(report['cycles']) == business_cycles and
                        all(c.get('authority_retention') == 'PASS_ALL_DECLARED_DATABASES_AND_IDENTITIES' for c in report['cycles']),
                        'all normal cycles require complete stopped authority retention')
                report['D6']['external_authority_retention'] = 'PASS_COMPLETE_CANONICAL_SNAPSHOTS'
                report['D6']['authority_state'] = 'STOPPED'
        if prepare_backup:
            require(len(report['wallet_cycles']) == 2 and all(c['clean_exit'] and c['retention_verified'] for c in report['wallet_cycles']),
                    'nonempty Wallet population and retained-state boots were not completed')
            report['wallet_preparation'] = {'status': 'PASS', 'restored_boot': 'NOT_RUN',
                                             'meaning': 'nonempty signed Wallet state retained across a normal reboot; D5 restore must still execute',
                                             'proof': report['wallet_cycles'][-1]['nonempty_wallet']}
            report['D2']['wallet_synthetic_flow'] = 'PASS'
        report['status'] = 'PASS_SCOPED'
        report['source_device'] = config['name']
        report['backup_source_ready'] = prepare_backup
    except BaseException as error:
        report.update(status='FAIL', error=type(error).__name__ + ': ' + str(error),
                      owned_device_running=guest.running(record) if record else False,
                      recovery='Preserved for inspection; no force shutdown, reset, disk repair or retried mutation was sent.')
        raise
    finally:
        if sampler is not None:
            try: sampler.stop()
            except Exception as error: report.setdefault('observer_stop_error', str(error))
        if monitor is not None: monitor.close()
        guest.save(output / 'report.json', report)
        print(json.dumps({'status': report['status'], 'evidence': str(output)}), flush=True)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--images', type=Path, required=True, help='freshly built immutable Image/rootfs.ext4 directory')
    parser.add_argument('--output', type=Path, required=True, help='existing private evidence parent, without spaces')
    parser.add_argument('--source-commit', required=True, help='exact 40-character commit used to build these images')
    parser.add_argument('--mode', choices=('lifecycle', 'soak'), default='lifecycle')
    parser.add_argument('--boot-profile', choices=('legacy-local', 'local-ab', 'game-authority-ab'), default='legacy-local',
                        help='explicit legacy, signed local device/6, or signed Game authority device/7')
    parser.add_argument('--device-config', type=Path,
                        help='fixed matching device/7 configuration; a new business device name is assigned without changing the image/profile')
    parser.add_argument('--prepare-backup', action='store_true', help='after real deletion, reinstall/approve/run through UI for a populated restore source')
    parser.add_argument('--reinstall-after-delete', action='store_true',
                        help='lifecycle only: verify 16 operations and five jobs including reinstall after real deletion, without Wallet preparation')
    parser.add_argument('--preflight-only', action='store_true', help='verify exact image/profile/package inputs without launching QEMU or creating device disks')
    args = parser.parse_args()
    run(args.images, args.output, args.mode, args.source_commit, boot_profile=args.boot_profile,
        prepare_backup=args.prepare_backup, reinstall_after_delete=args.reinstall_after_delete,
        preflight_only=args.preflight_only, device_config=args.device_config)


if __name__ == '__main__': main()
