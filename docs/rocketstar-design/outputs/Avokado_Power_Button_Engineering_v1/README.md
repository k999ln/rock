# avokado 電源ボタンの操作設計

Avokado_Power_Button_Engineering_v1.mdが本文。button_behavior.jsonは時間と遷移の基準。

Pythonの2ファイルは実機I/Oを持たない振る舞い模型。Python 3.10以上の独立環境で `python -m unittest -v test_power_button` をこのフォルダーから実行できる。実製品のfirmwareやOS driverとして出荷するコードではない。

前版の面一ボタン形状を継承し、接点を主基板へ直接渡す候補から常時給電controllerで操作を判定する方式へ変更。3秒解放で正常OFF、10秒保持で独立電源遮断を要求する。
