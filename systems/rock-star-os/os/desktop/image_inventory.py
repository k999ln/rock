"""Read-only ext4 path, ownership, mode and content inventory through debugfs.

Inode-number commands avoid interpreting names as debugfs commands. Flat
temporary exports are private, never mounted, and need no root privileges.
"""
import hashlib
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile

MAX_PATHS = 30000
MAX_DIRECTORIES = 3000
MAX_CONTENT = 1024**3
MAX_FILE = 256 * 1024**2
LINE = re.compile(r'/([0-9]+)/([0-7]+)/([0-9]+)/([0-9]+)/([^/]+)/([0-9]*)/')


def require(value, message):
    if not value:
        raise ValueError(message)


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def listing(raw):
    values = []
    for line in raw.splitlines():
        if not line or line == '/0/000000/0/0//0/':
            continue
        match = LINE.fullmatch(line)
        require(match is not None, 'unrecognized ext4 directory entry: ' + repr(line)[:300])
        inode, mode, uid, gid, name, size = match.groups()
        if name in ('.', '..'):
            continue
        require(int(inode) > 0 and not any(ord(c) < 32 or ord(c) == 127 for c in name),
                'invalid ext4 inode or filename')
        values.append((name, int(inode), int(mode, 8), int(uid), int(gid), int(size or 0)))
    return values


def debug(image, command=None, *, commands=None, timeout=30):
    args = ['debugfs', '-R', command, str(image)] if command is not None else ['debugfs', '-f', str(commands), str(image)]
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    errors = [line for line in result.stderr.splitlines() if line and not line.startswith('debugfs ')]
    require(result.returncode == 0 and not errors, 'read-only ext4 inventory failed: ' + '\n'.join(errors)[:1000])
    return result.stdout


def inventory(image, parent):
    image, parent = Path(image), Path(parent)
    require(image.is_absolute() and image == image.resolve(strict=True) and not image.is_symlink(),
            'canonical owned image required')
    info = image.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_uid == os.geteuid(), 'owned single-link image required')
    require(parent.is_absolute() and parent == parent.resolve(strict=True) and
            re.fullmatch('/[A-Za-z0-9_./-]+', str(parent)), 'canonical debugfs-safe private output parent required')
    initial = digest(image)
    result, directories, seen_directories, exports, total = {}, [('', 2)], set(), [], 0
    while directories:
        prefix, inode = directories.pop()
        require(inode not in seen_directories and len(seen_directories) < MAX_DIRECTORIES,
                'repeated or excessive ext4 directory inode')
        seen_directories.add(inode)
        raw = debug(image, 'ls -p -l <' + str(inode) + '>')
        if inode == 2:
            root = [LINE.fullmatch(line) for line in raw.splitlines()]
            root = [match for match in root if match and match[5] == '.']
            require(len(root) == 1 and int(root[0][1]) == 2 and stat.S_ISDIR(int(root[0][2], 8)), 'root directory metadata missing')
            result['/'] = {'inode':2, 'mode':stat.S_IMODE(int(root[0][2],8)), 'uid':int(root[0][3]),
                           'gid':int(root[0][4]), 'kind':'directory'}
        for name, child, mode, uid, gid, size in listing(raw):
            path = prefix + '/' + name
            require(path not in result and len(result) < MAX_PATHS and len(path) <= 4096, 'duplicate or excessive image path')
            entry = {'inode': child, 'mode': stat.S_IMODE(mode), 'uid': uid, 'gid': gid}
            if stat.S_ISDIR(mode):
                entry['kind'] = 'directory'; directories.append((path, child))
            elif stat.S_ISREG(mode) or stat.S_ISLNK(mode):
                entry.update(kind='file' if stat.S_ISREG(mode) else 'symlink', size=size)
                require(0 <= size <= MAX_FILE and total + size <= MAX_CONTENT, 'image inventory content budget exceeded')
                total += size
                if stat.S_ISLNK(mode) and size < 60:
                    value = debug(image, 'stat <' + str(child) + '>')
                    target = re.search(r'^Fast link dest: "([^\r\n]*)"$', value, re.M)
                    require(target is not None and len(target[1].encode()) == size, 'unrecognized inline symlink target')
                    entry['sha256'] = hashlib.sha256(target[1].encode()).hexdigest()
                else:
                    exports.append((path, child, size))
            else:
                raise ValueError('unsupported special inode in immutable image: ' + path)
            result[path] = entry
    with tempfile.TemporaryDirectory(prefix='image-content-', dir=parent) as temporary:
        folder = Path(temporary)
        script = folder / 'read.debugfs'
        script.write_text(''.join('dump <' + str(inode) + '> ' + str(folder / str(index)) + '\n'
                                  for index, (_, inode, _) in enumerate(exports)))
        script.chmod(0o600)
        debug(image, commands=script, timeout=120)
        for index, (path, _, size) in enumerate(exports):
            exported = folder / str(index)
            require(exported.is_file() and not exported.is_symlink() and exported.stat().st_size == size,
                    'ext4 content export is missing or has changed size')
            exported.chmod(0o600)
            result[path]['sha256'] = digest(exported)
    require(len(result) >= 100 and '/usr/bin/rock-ui' in result, 'incomplete native image inventory')
    require(digest(image) == initial, 'image changed during read-only inventory')
    return {'schema': 'rock-ext4-content-inventory/1', 'image_sha256': initial,
            'path_count': len(result), 'content_bytes': total, 'paths': result}


def compare(base, derived, injected):
    """Exactly the declared two private Wallet files and their new directory."""
    allowed = {'/etc/rock-wallet', '/etc/rock-wallet/backend.json', '/etc/rock-wallet/backend-token'}
    before, after = base['paths'], derived['paths']
    changes = {path: {'before': before.get(path), 'after': after.get(path)}
               for path in set(before) | set(after) if before.get(path) != after.get(path)}
    require(set(changes) == allowed, 'profile changed undeclared filesystem paths or omitted a required injection')
    require(all(value['before'] is None for value in changes.values()), 'profile replaced an existing path')
    directory = after['/etc/rock-wallet']
    require(directory['kind'] == 'directory' and directory['uid'] == directory['gid'] == 0 and directory['mode'] == 0o755,
            'profile directory ownership or mode differs')
    require(type(injected) is list and len(injected) == 2 and {entry['path'] for entry in injected} == allowed - {'/etc/rock-wallet'},
            'exact profile injection record required')
    for entry in injected:
        actual = after[entry['path']]
        require(actual['kind'] == 'file' and actual['uid'] == actual['gid'] == 1003 and actual['mode'] == 0o600 and
                actual['size'] == entry['size'] and actual['sha256'] == entry['sha256'], 'profile payload content or private ownership differs')
    return changes
