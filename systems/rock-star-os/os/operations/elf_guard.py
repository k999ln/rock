"""Read-only ELF admission for this aarch64/musl OS freeze, not an executor."""
import struct

INTERPRETER = '/lib/ld-musl-aarch64.so.1'


def verify_native_elf(raw):
    if not isinstance(raw, bytes) or not 64 <= len(raw) <= 16 * 1024 * 1024:
        raise ValueError('native ELF size')
    if raw[:7] != b'\x7fELF\x02\x01\x01':
        raise ValueError('native ELF must be ELF64 little endian version1')
    fields = struct.unpack_from('<HHIQQQIHHHHHH', raw, 16)
    kind, machine, version, _, phoff, _, _, ehsize, phsize, phcount, _, _, _ = fields
    if kind not in (2, 3) or machine != 183 or version != 1 or ehsize != 64:
        raise ValueError('native ELF must target aarch64')
    if phsize != 56 or not 1 <= phcount <= 256 or phoff < 64 or phoff + phsize * phcount > len(raw):
        raise ValueError('native ELF program header bounds')
    interpreters = []
    for offset in range(phoff, phoff + phsize * phcount, phsize):
        ptype, _, start, _, _, size, _, _ = struct.unpack_from('<IIQQQQQQ', raw, offset)
        if start > len(raw) or size > len(raw) - start:
            raise ValueError('native ELF segment bounds')
        if ptype == 3:
            interpreters.append(raw[start:start + size])
    if interpreters != [INTERPRETER.encode('ascii') + b'\0']:
        raise ValueError('native ELF must have exactly the expected musl interpreter')
    return {'elf_class': 64, 'endianness': 'little', 'machine': 'aarch64',
            'interpreter': INTERPRETER, 'interpreter_checked': True}
