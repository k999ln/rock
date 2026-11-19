"""Validate and export a COPY of the LED bench CAD. Does not order fabrication."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

def check(cli, output):
    source = Path(__file__).resolve().parent / 'cad'
    output = Path(output).absolute()
    if output.exists():
        raise ValueError('Use a new output directory; previous evidence is not overwritten.')
    output.mkdir(parents=True)
    configuration = output / 'config'
    (configuration / '10.0').mkdir(parents=True)
    (configuration / '10.0/fp-lib-table').write_text('(fp_lib_table (version 7))\n')
    env = dict(os.environ, KICAD_CONFIG_HOME=str(configuration), XDG_CACHE_HOME=str(output / 'cache'))
    cli = str(Path(cli).resolve())
    version = subprocess.check_output([cli, 'version'], text=True, env=env).strip()
    if version != '10.0.7':
        raise ValueError('This recorded export profile requires KiCad 10.0.7.')
    cad = output / 'cad'
    shutil.copytree(source, cad, ignore=shutil.ignore_patterns('*.lck', '*.kicad_prl', '*~', '*-backups'))
    before = {str(p.relative_to(cad)): hashlib.sha256(p.read_bytes()).hexdigest()
              for p in sorted(cad.rglob('*')) if p.is_file()}
    board = cad / 'mini-supervisor-bench.kicad_pcb'
    sch = cad / 'mini-supervisor-bench.kicad_sch'
    commands = []
    def run(label, arguments):
        commands.append([cli, *map(str, arguments)])
        with (output / (label + '.log')).open('w') as log:
            subprocess.run(commands[-1], stdout=log, stderr=subprocess.STDOUT, env=env, check=True)
    run('erc', ['sch', 'erc', '--format', 'json', '--severity-all', '--exit-code-violations',
                '--output', output / 'erc.json', sch])
    run('drc', ['pcb', 'drc', '--refill-zones', '--save-board', '--schematic-parity', '--format', 'json',
                '--severity-all', '--exit-code-violations', '--output', output / 'drc.json', board])
    erc = json.loads((output / 'erc.json').read_text())
    drc = json.loads((output / 'drc.json').read_text())
    erc_items = [v for sheet in erc['sheets'] for v in sheet['violations']]
    counts = {'erc': len(erc_items), 'drc': len(drc['violations']),
              'unconnected': len(drc['unconnected_items']), 'schematicParity': len(drc['schematic_parity'])}
    if any(counts.values()):
        raise ValueError('CAD findings remain; export is not accepted.')
    run('netlist', ['sch', 'export', 'netlist', '--format', 'kicadxml', '--output', output / 'netlist.xml', sch])
    (output / 'preview/schematic').mkdir(parents=True)
    layers = 'F.Cu,B.Cu,F.Paste,B.Paste,F.Mask,B.Mask,F.SilkS,B.SilkS,Edge.Cuts'
    run('gerbers', ['pcb', 'export', 'gerbers', '--layers', layers, '--output', str(output / 'gerbers') + '/', board])
    run('drill', ['pcb', 'export', 'drill', '--format', 'excellon', '--output', str(output / 'drill') + '/', board])
    run('board-svg', ['pcb', 'export', 'svg', '--mode-single', '--fit-page-to-board', '--exclude-drawing-sheet',
                      '--layers', 'F.Cu,F.SilkS,F.Fab,Edge.Cuts', '--output', output / 'preview/board.svg', board])
    run('schematic-svg', ['sch', 'export', 'svg', '--output', str(output / 'preview/schematic') + '/', sch])
    run('positions', ['pcb', 'export', 'pos', '--format', 'csv', '--units', 'mm', '--side', 'both',
                     '--output', output / 'positions.csv', board])
    # Verify that the original source stayed still while the tool worked on its copy.
    for path, digest in before.items():
        if hashlib.sha256((source / path).read_bytes()).hexdigest() != digest:
            raise ValueError('CAD source changed during validation; discard the exports.')
    paths = [*sorted((output / 'gerbers').rglob('*')), *sorted((output / 'drill').rglob('*')),
             *sorted((output / 'preview').rglob('*.svg')), output / 'positions.csv', output / 'netlist.xml', output / 'erc.json', output / 'drc.json', board]
    result = {'schema': 'rockstaros.mini-bench-cad-check/1', 'tool': 'KiCad ' + version,
              'scope': '76x62mm LED/contact engineering carrier only',
              'counts': counts, 'sourceSha256': before,
              'outputs': {str(p.relative_to(output)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths if p.is_file()},
              'commands': commands, 'assembled': False, 'physicalStopMeasured': False,
              'exactBomAccepted': False, 'factoryRelease': False}
    (output / 'cad-check-manifest.json').write_text(json.dumps(result, indent=2) + '\n')
    return result

if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('--kicad-cli', required=True); p.add_argument('--output', required=True)
    args = p.parse_args(); check(args.kicad_cli, args.output)
