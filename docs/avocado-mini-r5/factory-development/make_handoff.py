#!/usr/bin/env python3
"""Build a deterministic, reviewable RFQ package. It is not a manufacturing release."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


HERE = Path(__file__).resolve().parent
R5 = HERE.parent
OUTPUT = HERE / "factory-handoff-r0.zip"
FILES = [
    "factory-development/README.md",
    "factory-development/component-verdicts.md",
    "factory-development/electrical-architecture.md",
    "factory-development/factory-rfq.md",
    "factory-development/interface-register.json",
    "factory-development/assumptions.json",
    "factory-development/engineering_model.py",
    "factory-development/screen-results.json",
    "factory-development/make_handoff.py",
    "README.md",
    "product-invention-r1.md",
    "package/integrated_design.md",
    "assets/orbit-lt-triptych-concept.png",
    "assets/orbit-telescoping-sleeve.svg",
    "assets/orbit-lt-experience.svg",
    "assets/orbit-lt-rf-optical-conflict.svg",
]


def write_member(z: ZipFile, name: str, payload: bytes) -> None:
    member = ZipInfo(name, date_time=(2026, 10, 19, 0, 0, 0))
    member.compress_type = ZIP_DEFLATED
    member.external_attr = 0o644 << 16
    z.writestr(member, payload)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--with-runtime', action='store_true')
    parser.add_argument('--output', type=Path, default=OUTPUT)
    parser.add_argument('--native-build', type=Path)
    parser.add_argument('--native-cad', type=Path)
    parser.add_argument('--native-overlay', type=Path)
    args = parser.parse_args()
    output = args.output
    root = HERE.parents[2]
    entries = {name: R5 / name for name in FILES}
    expected_digests = {}
    if args.with_runtime:
        root = HERE.parents[2]
        provenance = json.loads((root / 'packages/rockstaros-runtime/dist/build-inputs.json').read_text())
        extra = list(provenance['inputs']) + [
            'packages/rockstaros-runtime/README.md',
            'packages/rockstaros-runtime/package.json',
            'packages/rockstaros-runtime/dist/index.mjs',
            'packages/rockstaros-runtime/dist/doctor.mjs',
            'packages/rockstaros-runtime/dist/runtime-manifest.json',
            'packages/rockstaros-runtime/dist/build-inputs.json',
            'packages/rockstaros-runtime/test/runtime.test.mjs',
            'docs/device-support-architecture.md',
            'docs/avocado-mini-r5/phone-spatial-interface.md',
        ]
        for name in extra:
            if name.startswith('/') or '..' in Path(name).parts:
                raise ValueError('Invalid runtime source path')
            source = root / name
            if name in provenance['inputs']:
                actual = hashlib.sha256(source.read_bytes()).hexdigest()
                if actual != provenance['inputs'][name]:
                    raise ValueError('Rebuild runtime after source change: ' + name)
                expected_digests['repo/' + name] = provenance['inputs'][name]
            entries['repo/' + name] = source
    native = [args.native_build, args.native_cad, args.native_overlay]
    if any(native) and not all(native):
        raise ValueError('Native firmware, checked CAD and staged overlay must be supplied together')
    def checked(name: str, source: Path, digest: str) -> None:
        if name.startswith('/') or '..' in Path(name).parts:
            raise ValueError('Unsafe artifact path')
        if hashlib.sha256(source.read_bytes()).hexdigest() != digest:
            raise ValueError('Artifact changed after validation: ' + name)
        expected_digests[name] = digest
        entries[name] = source
    if all(native):
        target = root / 'systems/rock-star-os/targets/avocado-mini'
        for source in sorted(target.rglob('*')):
            if source.is_file() and not any(part.startswith('.') or part == '__pycache__' for part in source.relative_to(target).parts) and source.suffix not in {'.pyc', '.kicad_prl', '.lck'}:
                entries['repo/' + str(source.relative_to(root))] = source
        entries['repo/tests/avocado-mini-native-development.test.mjs'] = root / 'tests/avocado-mini-native-development.test.mjs'
        entries['repo/docs/evidence/avocado-mini-native-development.json'] = root / 'docs/evidence/avocado-mini-native-development.json'
        entries['repo/contracts/avocado-mini-supervisor.json'] = root / 'contracts/avocado-mini-supervisor.json'
        build = json.loads((args.native_build / 'mini-build-manifest.json').read_text())
        for name, digest in build['sources'].items():
            checked('repo/systems/rock-star-os/targets/avocado-mini/firmware/' + name, target / 'firmware' / name, digest)
        for name, data in build['artifacts'].items():
            checked('native-build/' + name, args.native_build / name, data['sha256'])
        entries['native-build/mini-build-manifest.json'] = args.native_build / 'mini-build-manifest.json'
        cad = json.loads((args.native_cad / 'cad-check-manifest.json').read_text())
        if any(cad['counts'].values()) or cad['factoryRelease'] is not False:
            raise ValueError('Expected zero CAD findings and an unreleased engineering candidate')
        for name, digest in cad['sourceSha256'].items():
            checked('repo/systems/rock-star-os/targets/avocado-mini/hardware/cad/' + name, target / 'hardware/cad' / name, digest)
            # Keep the checked board beside its matching schematic/project/libraries,
            # so the factory can reopen it and repeat parity/library checks directly.
            if name != 'mini-supervisor-bench.kicad_pcb':
                checked('native-cad/cad/' + name, args.native_cad / 'cad' / name, digest)
        for name, digest in cad['outputs'].items():
            checked('native-cad/' + name, args.native_cad / name, digest)
        entries['native-cad/cad-check-manifest.json'] = args.native_cad / 'cad-check-manifest.json'
        overlay = json.loads((args.native_overlay / 'overlay-manifest.json').read_text())
        if overlay['bootableOsImage'] is not False or overlay['serviceEnabled'] is not False:
            raise ValueError('Expected a staged, disabled development overlay')
        for name, digest in overlay['files'].items():
            checked('native-overlay/' + name, args.native_overlay / name, digest)
            current = target / 'linux/rootfs' / name
            if name.startswith('usr/lib/rockstaros-mini/'):
                current = target / 'linux' / Path(name).name
            if current.is_file() and hashlib.sha256(current.read_bytes()).hexdigest() != digest:
                raise ValueError('Restage overlay after source change: ' + name)
        entries['native-overlay/overlay-manifest.json'] = args.native_overlay / 'overlay-manifest.json'
    manifest = {
        "packageStatus": "RFQ_READY_FOR_FEASIBILITY_ONLY_NOT_MANUFACTURING_RELEASE",
        "sourceRoot": "docs/avocado-mini-r5",
        "portableRuntimeIncluded": args.with_runtime,
        "nativeEngineeringIncluded": all(native),
        "nativeEngineeringScope": "LED contact bench firmware/CAD and existing-OS client overlay; not a final Mini mainboard or accepted native OS image" if all(native) else None,
        "physicalMiniAccepted": False,
        "sha256": {},
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, "w") as z:
        for name, source in entries.items():
            payload = source.read_bytes()
            if name in expected_digests and hashlib.sha256(payload).hexdigest() != expected_digests[name]:
                raise ValueError('Source changed while packaging: ' + name)
            manifest["sha256"][name] = hashlib.sha256(payload).hexdigest()
            write_member(z, name, payload)
        write_member(z, "handoff-manifest.json", (json.dumps(manifest, indent=2) + "\n").encode())
    with ZipFile(output) as z:
        actual_manifest = json.loads(z.read("handoff-manifest.json"))
        assert len(z.namelist()) == len(entries) + 1
        for name, digest in actual_manifest["sha256"].items():
            assert hashlib.sha256(z.read(name)).hexdigest() == digest, name
    print(f"RFQ handoff verified: {len(entries)} sources, {output.stat().st_size} bytes, {output}")


if __name__ == "__main__":
    main()
