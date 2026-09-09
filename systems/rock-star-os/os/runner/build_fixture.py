"""Sign an explicit remote development Tool using only the existing RFC fixture."""
from pathlib import Path
from blackberryrock.packages import REMOTE_CONTRACT, canonical
from blackberryrock.sdk import sign_development, starter


def remote_fixture():
    source = starter('org.rockstar.remote-text', '遠隔で入力文章を整える（開発試験）', recipe=[{'op': 'trim_lines'}], schema_version=2)
    source['manifest'].update(schema_version=3, execution_targets=['cloud', 'pc_usb'],
        permissions=['text.input', 'text.output', 'execution.remote'],
        data={'input': 'user_supplied_text', 'destinations': ['cloud', 'pc_usb']}, remote=REMOTE_CONTRACT.copy())
    source['manifest']['description'] = '明示承認した UTF-8 入力だけを有限 recipe で処理。公開開発認証 fixture。物理 USB は未検証。'
    return sign_development(source)


if __name__ == '__main__':
    output = Path(__file__).resolve().parent / 'fixtures/remote-text.rock.json'
    output.write_bytes(canonical(remote_fixture()))
    print(output)
