#!/usr/bin/env python3
"""Collect target binaries/dependencies and write the real ARM64 stage0 cpio.

Run on the Linux build host AFTER Buildroot produced the final rootfs image.
The same kernel/initramfs pair must be used on every boot in the A/B tests.
"""
import argparse
import gzip
import os
from pathlib import Path, PurePosixPath
import posixpath
import re
import shutil
import stat
import subprocess
import tempfile

from make_bundle import envelope_for, check_filesystem
from rock_update import canonical


def target_origin(target, relative):
    """Refuse dependency parents that would traverse outside the target tree.

    Leaf symlinks are handled separately as paths in the guest filesystem.
    Absolute or relative parent links into the host must never reach open().
    """
    root = target.resolve(strict=True)
    origin = root / str(relative).lstrip('/')
    try:
        parent = origin.parent.resolve(strict=True)
    except (OSError, RuntimeError) as error:
        raise RuntimeError('Target dependency parent is missing or cyclic') from error
    if not parent.is_relative_to(root):
        raise RuntimeError('Target dependency parent resolves outside the target tree')
    return parent / origin.name


def target_shell(target):
    """Resolve /bin/sh inside the target, never using host absolute symlinks."""
    relative, visited = PurePosixPath('/bin/sh'), set()
    while relative not in visited and len(visited) < 16:
        visited.add(relative)
        origin = target_origin(target, relative)
        if origin.is_symlink():
            link = os.readlink(origin)
            relative = PurePosixPath(posixpath.normpath(str(
                PurePosixPath(link) if link.startswith('/') else relative.parent / link)))
            continue
        if relative not in (PurePosixPath('/bin/dash'), PurePosixPath('/usr/bin/dash')) or not origin.is_file():
            raise RuntimeError('Target /bin/sh must resolve to the installed Dash binary')
        with origin.open('rb') as stream:
            if stream.read(4) != b'\x7fELF':
                raise RuntimeError('Target Dash shell is not an ELF binary')
        return relative
    raise RuntimeError('Target shell symlink chain is cyclic or excessive')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--rootfs", type=Path, help="Final rootfs.ext4, default TARGET/../images/rootfs.ext4")
    parser.add_argument("--readelf", default="readelf")
    parser.add_argument("--include-tests", action="store_true", help="include explicit development fault shim")
    args = parser.parse_args()
    target = args.target.resolve()
    rootfs = (args.rootfs or target.parent / "images/rootfs.ext4").resolve()
    if not rootfs.is_file() or not (target / "usr/bin/python3").exists():
        raise SystemExit("Final rootfs and target Python3 are required")
    if not shutil.which(args.readelf):
        raise SystemExit("A host readelf (or --readelf cross-toolchain binary) is required")
    target_shell(target)
    check_filesystem(rootfs)
    source = Path(__file__).resolve().parent
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="rock-stage0-") as temporary:
        stage = Path(temporary)
        for name in ("bin", "sbin", "usr/bin", "usr/lib/rock-update", "etc/rock-update",
                     "proc", "sys", "dev", "run", "data", "newroot"):
            (stage / name).mkdir(parents=True, exist_ok=True)
        (stage / "tmp").symlink_to("run/tmp")
        copied = set()
        elf_queue = []

        def copy_path(relative):
            relative = PurePosixPath(posixpath.normpath("/" + str(relative).lstrip("/")))
            if relative in copied:
                return
            copied.add(relative)
            origin = target_origin(target, relative)
            destination = stage / str(relative).lstrip("/")
            destination.parent.mkdir(parents=True, exist_ok=True)
            if origin.is_symlink():
                link = os.readlink(origin)
                destination.symlink_to(link)
                copy_path(link if link.startswith("/") else relative.parent / link)
                return
            if not origin.is_file():
                raise RuntimeError(f"Required target dependency missing: {relative}")
            shutil.copy2(origin, destination)
            with origin.open("rb") as stream:
                if stream.read(4) == b"\x7fELF":
                    elf_queue.append((relative, origin))

        for relative in ("/bin/busybox", "/bin/sh", "/usr/bin/python3", "/usr/bin/openssl"):
            copy_path(relative)
        python_dirs = [path for path in (target / "usr/lib").glob("python3.*") if path.is_dir()]
        if len(python_dirs) != 1:
            raise RuntimeError("Expected one target Python standard-library directory")
        for directory, subdirs, files in os.walk(python_dirs[0]):
            subdirs[:] = [name for name in subdirs if name not in ("__pycache__", "test", "tests", "site-packages", "ensurepip")]
            for name in files:
                if not name.endswith((".pyc", ".a")):
                    copy_path("/" + str((Path(directory) / name).relative_to(target)))
        index = 0
        while index < len(elf_queue):
            relative, origin = elf_queue[index]
            index += 1
            dynamic = subprocess.check_output([args.readelf, "-d", str(origin)], text=True)
            program = subprocess.check_output([args.readelf, "-l", str(origin)], text=True)
            for interpreter in re.findall(r"Requesting program interpreter: ([^\]]+)\]", program):
                copy_path(interpreter)
            for library in re.findall(r"\(NEEDED\).*\[([^\]]+)\]", dynamic):
                choices = [PurePosixPath("/lib") / library, PurePosixPath("/usr/lib") / library]
                found = next((path for path in choices if os.path.lexists(target / str(path).lstrip("/"))), None)
                if found is None:
                    raise RuntimeError(f"Unresolved target library {library} needed by {relative}")
                copy_path(found)
        for applet in ("mount", "mkdir", "chmod", "sleep", "switch_root", "sync", "poweroff", "chroot"):
            (stage / "bin" / applet).symlink_to("busybox")
        shutil.copyfile(source / "init", stage / "init")
        (stage / "init").chmod(0o755)
        shutil.copyfile(source / "rock_update.py", stage / "usr/lib/rock-update/rock_update.py")
        if args.include_tests:
            for name in ('fault_cli.py', 'test_faults.py'):
                shutil.copyfile(source / name, stage / 'usr/lib/rock-update' / name)
        (stage / "etc/rock-update/factory.json").write_bytes(canonical(envelope_for(rootfs, 1, "factory-1")) + b"\n")
        (stage / "etc/rock-update/factory.json").chmod(0o444)
        with args.output.open("wb") as output, gzip.GzipFile(filename="", mode="wb", fileobj=output, mtime=0) as archive:
            inode = 1

            def entry(name, mode, size=0, contents=None, link=None, major=0, minor=0):
                nonlocal inode
                encoded = name.encode() + b"\0"
                # newc stores root ownership independent of the build user's UID.
                values = [inode, mode, 0, 0, 1, 0, size, 0, 0, major, minor, len(encoded), 0]
                header = b"070701" + b"".join(f"{value:08x}".encode() for value in values)
                archive.write(header + encoded)
                archive.write(b"\0" * (-(len(header) + len(encoded)) % 4))
                if link is not None:
                    archive.write(link)
                elif contents is not None:
                    with contents.open("rb") as stream:
                        shutil.copyfileobj(stream, archive, length=1024 * 1024)
                archive.write(b"\0" * (-size % 4))
                inode += 1

            for path in sorted(stage.rglob("*"), key=lambda path: str(path.relative_to(stage))):
                name = str(path.relative_to(stage))
                info = path.lstat()
                if path.is_symlink():
                    link = os.readlink(path).encode()
                    entry(name, info.st_mode, len(link), link=link)
                elif path.is_dir():
                    entry(name, info.st_mode)
                else:
                    entry(name, info.st_mode, info.st_size, contents=path)
            entry("dev/console", stat.S_IFCHR | 0o600, major=5, minor=1)
            entry("dev/null", stat.S_IFCHR | 0o666, major=1, minor=3)
            entry("TRAILER!!!", 0)
        print(f"Built {args.output}: {args.output.stat().st_size} bytes, {len(copied)} target dependencies")
        print("PUBLIC DEVELOPMENT TRUST; kernel/initramfs authentication and physical BlackBerry boot unverified")


if __name__ == "__main__":
    main()
