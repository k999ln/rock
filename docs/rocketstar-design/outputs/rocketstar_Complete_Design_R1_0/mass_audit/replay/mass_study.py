#!/usr/bin/env python3
"""RETURN-1 concept sensitivity; standard-library only, no trajectory model.

Run: python3 work/design_freeze/mass_study.py
Writes mass_study.json and mass_study.md beside this file.
All vehicle parameters are unverified study assumptions, not hardware specs.
"""
import itertools
import json
import math
from pathlib import Path

G0 = 9.80665
OUT = Path(__file__).resolve().parent
DRY = [18.0, 20.0, 22.0, 24.0]
RETURN = [4.0, 4.9, 6.0, 8.0]
ISP = [(330.0, 370.0), (320.0, 360.0), (310.0, 350.0)]
TARGETS = [9600.0, 9800.0, 10080.0, 10290.0]
S1 = dict(dry_t=40.0, ascent_t=380.0, return_t=24.0, residual_t=1.0)


def evaluate(dry, ret, ascent=150.0, isp1=330.0, isp2=370.0):
    upper_end = dry + ret + 0.6 + 1.0
    upper_start = upper_end + ascent
    booster_start = sum(S1.values()) + upper_start
    booster_end = booster_start - S1['ascent_t']
    dv1 = G0 * isp1 * math.log(booster_start / booster_end)
    dv2 = G0 * isp2 * math.log(upper_start / upper_end)
    illustrative_return = return_requirement(dry)['total_return_propellant_t']
    return dict(s2_dry_t=dry, s2_return_t=ret, s2_ascent_t=ascent,
                s2_residual_t=0.6, payload_t=1.0, isp1_s=isp1, isp2_s=isp2,
                s2_stage_t=upper_start - 1.0, s2_with_payload_t=upper_start,
                launch_t=booster_start, s1_end_t=booster_end,
                s2_end_t=upper_end,
                loaded_propellant_and_residual_t=405.0 + ret + ascent + 0.6,
                dv1_m_s=dv1, dv2_m_s=dv2, dv_total_m_s=dv1 + dv2,
                illustrative_two_burn_return_required_t=illustrative_return,
                illustrative_two_burn_return_margin_t=ret - illustrative_return,
                covers_illustrative_two_burn_return=ret >= illustrative_return,
                margins_m_s={str(int(t)): dv1 + dv2 - t for t in TARGETS})


def inverse(dry_anchor, ret, isp1, isp2, target, alpha=0.0):
    """First mathematical crossing within 0..2000 t of ascent propellant.

    D(P,R) = D_anchor + alpha * max(0, P + R - 154).
    alpha is a hypothetical marginal dry mass per added usable propellant mass.
    It is NOT an engineering sizing rule or a validated physical coefficient.
    The finite search limit is deliberately explicit. No root is not a global
    impossibility proof. A root is not a buildable design.
    """
    def calc(p):
        d = dry_anchor + alpha * max(0.0, p + ret - 154.0)
        return evaluate(d, ret, p, isp1, isp2)
    previous_p = 0.0
    previous = calc(previous_p)
    peak = previous
    for j in range(1, 4001):
        p = j * 0.5
        result = calc(p)
        if result['dv_total_m_s'] > peak['dv_total_m_s']:
            peak = result
        if previous['dv_total_m_s'] < target <= result['dv_total_m_s']:
            lo, hi = previous_p, p
            for _ in range(65):
                mid = (lo + hi) / 2.0
                if calc(mid)['dv_total_m_s'] >= target:
                    hi = mid
                else:
                    lo = mid
            solved = calc(hi)
            assert abs(solved['dv_total_m_s'] - target) < 1e-6
            return dict(dry_anchor_t=dry_anchor, return_t=ret,
                        isp1_s=isp1, isp2_s=isp2, target_m_s=target,
                        marginal_dry_per_propellant=alpha,
                        search_ascent_range_t=[0.0, 2000.0],
                        status='first_mathematical_crossing', solution=solved)
        previous_p, previous = p, result
    return dict(dry_anchor_t=dry_anchor, return_t=ret, isp1_s=isp1,
                isp2_s=isp2, target_m_s=target,
                marginal_dry_per_propellant=alpha,
                search_ascent_range_t=[0.0, 2000.0],
                status='no_crossing_in_search_range', solution=None,
                sampled_maximum=peak)


def return_requirement(dry):
    # Two sequential ideal burns; no attitude gas, boiloff, restart or other loss.
    landed = dry + 0.6
    before_landing = landed * math.exp(600.0 / (G0 * 320.0))
    before_departure = before_landing * math.exp(150.0 / (G0 * 360.0))
    return dict(s2_dry_t=dry, touchdown_t=landed,
                landing_propellant_t=before_landing - landed,
                departure_propellant_t=before_departure - before_landing,
                total_return_propellant_t=before_departure - landed)


def main():
    nominal = evaluate(18, 4)
    assert abs(nominal['launch_t'] - 618.6) < 1e-9
    assert abs(nominal['dv_total_m_s'] - 10323.64520312457) < 1e-6
    assert abs(nominal['launch_t'] - (40 + 18 + 1 + nominal['loaded_propellant_and_residual_t'])) < 1e-9
    sensitivity = []
    for d, r, (i1, i2), mode in itertools.product(DRY, RETURN, ISP, ['ascent_fixed_150t', 'total_s2_propellant_fixed_154_6t']):
        p = 150.0 if mode == 'ascent_fixed_150t' else 154.0 - r
        row = evaluate(d, r, p, i1, i2)
        row['propellant_mode'] = mode
        assert math.isclose(row['launch_t'], 40 + d + 1 + row['loaded_propellant_and_residual_t'])
        assert math.isclose(row['s1_end_t'], 65 + row['s2_with_payload_t'])
        sensitivity.append(row)
    fixed_inverse = [inverse(d, r, i1, i2, t)
        for d, r, (i1, i2), t in itertools.product(DRY, RETURN, ISP, TARGETS)]
    coupled_inverse = [inverse(d, r, i1, i2, t, alpha)
        for d, r, (i1, i2), t, alpha in itertools.product(
            [18.0, 22.0, 24.0], [4.9, 6.0, 8.0], ISP[:2],
            [10080.0, 10290.0], [0.0, 0.03, 0.06, 0.10])]
    return_rows = [return_requirement(d) for d in DRY]
    data = dict(
        title='RETURN-1 質量・理想性能の設計判断支援',
        date='2026-09-23', units=dict(mass='metric tonne', velocity='m/s', isp='s'),
        status='concept_sensitivity_only_not_build_or_flight_release',
        source_document='outputs/RETURN-1_Avokado_Link_Design_v0.1.md',
        g0_m_s2=G0, stage1=S1, reference_orbit=dict(altitude_km=550, inclination_deg=53, status='provisional'),
        payload=dict(satellite_count=2, each_released_mass_t=0.5,
                     retained_adapter='included in s2 dry mass; not payload'),
        requirements=dict(unmargined_m_s=[9600, 9800], margin_fraction=0.05,
                          margined_m_s=[10080, 10290], status='study_conditions_not_trajectory_results'),
        caveats=[
            'No site, trajectory, aerodynamic, thermal, structural, tank-volume, engine, burn-time or control closure.',
            'Stage1 remains 445 t by mathematical assumption; load, thrust and recovery impacts are not validated.',
            'Dry values already include the old 25 percent allocation; +2/+4/+6 t are beyond that allocation.',
            'Propellant growth slopes are illustrative sensitivities and must not be adopted as sizing rules.',
            'Dry-growth inverse cases hold return propellant fixed and may fail even the two-burn illustrative return condition.',
            'All inverse solutions are mathematical comparison values, not selected specifications.',
            'No-crossing results refer only to the explicit 0..2000 t ascent-propellant search range.',
            'Attitude, conditioning, restart, boiloff, vent, pressurant and other consumables are not closed.',
            'The two-burn return example is not a trajectory or flight procedure.'
        ],
        reference_rocket_equation='https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ideal-rocket-equation/',
        nominal=nominal, previous_112t=evaluate(18, 4, 112),
        sensitivity=sensitivity, inverse_fixed_dry=fixed_inverse,
        inverse_with_hypothetical_dry_growth=coupled_inverse,
        two_burn_return_example=return_rows)
    (OUT/'mass_study.json').write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    write_markdown(data)
    print(json.dumps({'sensitivity_cases': len(sensitivity), 'fixed_dry_inverse_cases': len(fixed_inverse),
                      'dry_growth_inverse_cases': len(coupled_inverse),
                      'outputs': [str(OUT/'mass_study.md'), str(OUT/'mass_study.json')]}, ensure_ascii=False))


def write_markdown(data):
    lines = [
        '# RETURN-1 質量・上昇性能の設計判断メモ',
        '', '2026-09-23 / v0.1の数値監査 / 製造・飛行承認ではない', '',
        '**結論：618.6 t・上段乾燥18 t・帰還4 tを確定仕様へ昇格させない。** 単独の仮定では理想Δv 10,324 m/sとなるが、乾燥質量・帰還必要量・比推力の不確かさを組み合わせると、暫定要求に対する余裕が消える。推進剤を増やして乾燥質量を固定する逆算は比較用に限定する。発射場、上昇・帰還経路、空力・加熱、燃焼時間、エンジン仕様を決める前に一意の寸法・質量・性能を凍結できない。', '',
        '## 1. 維持する設計意図と撤回する数値の扱い', '',
        '| 対象 | 決定 | 理由・次の根拠 |', '|---|---|---|',
        '| 両段の回収・再使用、通常時の機体部品保持 | 設計要求として維持 | 飛行実証済みという意味ではない |',
        '| 第1段の海上回収、第2段の大気減速後の推進着陸 | 比較設計の方式として維持 | 帰還回廊・熱防護・再着火・着陸余裕を閉じる |',
        '| 500 kg衛星2機、550 km円・53° | 参照ミッションとして維持 | 射場、軌道面、通信要求と整合を確認 |',
        '| 打上げ質量618.6 t | 確定仕様としての扱いを撤回し、比較点B0へ降格 | 計算自体は再現できるが、部品積み上げと軌道が未確定 |',
        '| 上段乾燥18 tと、その内部配分14.4+3.6 t | 達成可能な確定質量という扱いを撤回 | +2/+4/+6 tを含む設計探索範囲へ変更。18 tは旧比較点 |',
        '| 上段帰還4 t | 十分な帰還予算という扱いを撤回 | 仮の2燃焼だけでも乾燥18 tで4.896 t必要となる別条件がある |',
        '| 比推力330/370 s | 保証性能を撤回、比較用仮定として保持 | 実際のエンジン、運転点と高度依存性能が必要 |',
        '| 必要Δv9,600 m/s、5%上乗せ | 合否が確定した要求という扱いを撤回 | 9,800 m/sも比較。真の必要量は軌道・損失解析から求める |',
        '| 第1段445 t、上段上昇用150 t | 計算境界条件として保持 | 推力、構造、タンク体積、燃焼時間から独立した確定仕様にはしない |',
        '| 推進剤追加のみで問題を解決する方針 | 採用しない | 質量成長と損失増加を結合しないと成立を誤判定する |', '',
        '旧版は既に仮定を明記しているため、計算結果を誤りとして削除するのではなく、「確定させてよい値」への昇格を明確に否定する。旧版に不足していたのは、複数の不確かさを同時に組み合わせた合否比較である。', '',
        '## 2. モデルと質量の数え方', '',
        '全質量はt。第1段は乾燥40、上昇380、帰還24、未使用1、合計445を固定する。第2段の乾燥D、上昇推進剤P、帰還推進剤R、未使用0.6、衛星1を別計上する。機体側アダプター・扉はDに含め、衛星1 tは2機とも放出する。', '',
        '`U = D + P + R + 0.6 + 1.0`', '',
        '`Δv = g0 Isp1 ln[(445+U)/(65+U)] + g0 Isp2 ln[U/(D+R+1.6)]`', '',
        'g0=9.80665 m/s²。理想ロケット方程式の関係は[NASA Glenn](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ideal-rocket-equation/)を参照。上記の質量・比推力は本検討の仮定でありNASAの設計値ではない。重力・抗力・操舵損失、時間、推力、空力、熱、タンク容積は式に含まれない。', '',
        '乾燥40 tには32+8、乾燥18 tには14.4+3.6という旧25%成長余裕が既に含まれる。D=20/22/24 tは、その余裕を含む18 tからさらに増える場合であり、25%を再度加算しない。姿勢制御・再着火・冷却・蒸発・ベント・加圧等の消耗分が未配分であるため、質量台帳が閉じたとはいえない。', '',
        '比較する要求は9,600および9,800 m/s。その5%上乗せ条件は10,080および10,290 m/sである。5%という値も設計比較条件であり、所要信頼度を保証する統計的余裕ではない。', '',
        '## 3. 組合せ感度：上段上昇用150 tを維持', '',
        '帰還分を増やした分は追加搭載する比較。したがって打上げ質量も変わる。表の値は理想Δv、m/s。**感度表は上昇性能だけの比較であり、帰還推進剤が不足するケースも含む。上昇条件を満たすことは帰還成立を意味しない。** 例えば乾燥20 t・帰還4.9 tは、第5節の説明用2燃焼で必要な5.423 tに約0.523 t不足する。', '',
        '| 上段乾燥D | 帰還R | 打上げ質量 | 比推力330/370 s | 320/360 s | 310/350 s | 330/370で10,080との差 | 330/370で10,290との差 |',
        '|---:|---:|---:|---:|---:|---:|---:|---:|'
    ]
    for d, r in itertools.product(DRY, RETURN):
        vals = [evaluate(d, r, 150, *i) for i in ISP]
        a = vals[0]
        lines.append(f"| {d:.0f} | {r:.1f} | {a['launch_t']:.1f} | {a['dv_total_m_s']:,.0f} | {vals[1]['dv_total_m_s']:,.0f} | {vals[2]['dv_total_m_s']:,.0f} | {a['dv_total_m_s']-10080:+,.0f} | {a['dv_total_m_s']-10290:+,.0f} |")
    lines += ['',
        '上段乾燥20 t・帰還4.9 t・比推力低下10 sでは約9,661 m/s。乾燥22 t・帰還6 tでは公称比推力でも約9,576 m/sになる。これらの条件を起こらないとする部品・試験根拠はまだない。', '',
        '## 4. 帰還増量を、上昇用から差し替える場合', '',
        '第2段の総充填量154.6 tを固定すると、P=154−Rとなる。上昇150 t維持と混在させない。代表値を示し、全48条件はJSONへ収録した。', '',
        '| 乾燥D | 帰還R | 上昇P | 330/370 s | 320/360 s |', '|---:|---:|---:|---:|---:|'
    ]
    for d, r in [(18,4),(18,4.9),(18,6),(20,4.9),(22,6),(24,8)]:
        a=evaluate(d,r,154-r)
        b=evaluate(d,r,154-r,320,360)
        lines.append(f"| {d:.0f} | {r:.1f} | {154-r:.1f} | {a['dv_total_m_s']:,.0f} | {b['dv_total_m_s']:,.0f} |")
    lines += ['', '## 5. 帰還4.9 tも普遍的な答えではない', '',
        '説明用に軌道離脱150 m/s（比推力360 s）、終末降下・着陸600 m/s（比推力320 s）だけを順に与える。これは飛行手順や必要量の確定ではない。着陸時質量はD+0.6とし、必要なRを逆算した。', '',
        '`R = (D + 0.6) × { exp[150/(g0×360) + 600/(g0×320)] − 1 }`', '',
        '| 上段乾燥D | 接地側質量 | 2燃焼の合計推進剤 |', '|---:|---:|---:|'
    ]
    for row in data['two_burn_return_example']:
        lines.append(f"| {row['s2_dry_t']:.0f} t | {row['touchdown_t']:.1f} t | {row['total_return_propellant_t']:.3f} t |")
    lines += ['',
        '4.90 tは乾燥18 tの特定条件だけの数字である。実際は帰還場所・軌道離脱・姿勢遷移・大気減速・着陸分散・再着火・残留推進剤を同時に決める。熱防護の重量増加は上昇性能だけでなく帰還推進剤にも影響する。', '',
        '## 6. 必要上昇推進剤の逆算：乾燥質量固定という下側比較', '',
        '以下はDとRを固定し、上段上昇用Pを変えて理想Δvの条件に一致させる数学的逆算である。第1段の445 tも固定している。タンク・構造・推力・燃焼時間を成立させた仕様ではなく、採用してはならない。', '',
        '| D / R | 比推力1/2 | 10,080へ必要なP | 10,290へ必要なP | 後者の打上げ質量 |',
        '|---|---|---:|---:|---:|'
    ]
    for d,r,i1,i2 in [(18,4.9,330,370),(20,4.9,330,370),(22,6,330,370),(22,6,320,360),(24,8,330,370),(24,8,320,360)]:
        a=inverse(d,r,i1,i2,10080)['solution']
        b=inverse(d,r,i1,i2,10290)['solution']
        lines.append(f"| {d:.0f} / {r:.1f} t | {i1}/{i2} s | {a['s2_ascent_t']:.1f} t | {b['s2_ascent_t']:.1f} t | {b['launch_t']:.1f} t |")
    lines += ['',
        '## 7. タンク増量に伴う乾燥成長を仮に連動させる', '',
        '`D(P,R) = D_anchor + α × max[0, P + R − 154]`', '',
        'α=0、0.03、0.06、0.10 t/tを比較する。この係数は経験則でも採用品の値でもなく、追加した使用可能推進剤1 tあたり乾燥質量が0/30/60/100 kg増える仮の感度である。体積、座屈、荷重、空力・熱、エンジン変更を表現する物理モデルではない。', '',
        '代表条件はD_anchor=22 t、R=6 t、Isp1/2=320/360 s、要求10,290 m/s。Pは0〜2,000 tの範囲を0.5 t刻みで探索し、最初の交差を二分法で求めた。根がない場合は、この探索範囲内だけの結果である。', '',
        '| 仮のα | 逆算P | 逆算乾燥D | 打上げ質量 | 判定 |', '|---:|---:|---:|---:|---|'
    ]
    for alpha in [0,.03,.06,.10]:
        row=inverse(22,6,320,360,10290,alpha)
        s=row['solution']
        if s:
            lines.append(f"| {alpha:.2f} | {s['s2_ascent_t']:.1f} t | {s['s2_dry_t']:.1f} t | {s['launch_t']:.1f} t | 数学的交差のみ |")
        else:
            peak=row['sampled_maximum']
            lines.append(f"| {alpha:.2f} | — | — | — | 範囲内に交差なし。標本上の最大約{peak['dv_total_m_s']:,.0f} m/s |")
    lines += ['',
        'この表では帰還Rを6 tに固定しているため、乾燥成長に伴う帰還必要量の増加まで閉じていない。α=0.03の約27.7 tの乾燥質量では、前節の説明用2燃焼だけで帰還推進剤は約7.46 t必要となり、固定した6 tでは不足する。819.7 t案も帰還成立案ではない。これを補うとさらにタンク・上昇性能を再計算する必要があり、結合設計が不可欠である。', '',
        '推進剤が増えると上段単体の理想速度増分は増え得る一方、第1段が運ぶ質量と上段乾燥質量も増える。条件によって、追加するほど有利という関係は失われる。得られた大きな機体の数字を新基準へそのまま採用するのではなく、段間配分・推力・形状・帰還方式・ペイロード要求を含めて再探索する必要がある。', '',
        '## 8. 次に確定させる具体的な設計判断', '',
        '| 順序 | 決める内容 | 合格に必要な根拠 |', '|---|---|---|',
        '| 1 | 発射場・射向・投入面・回収地点と待機時間 | 550 km/53°への到達、飛行区域と帰還機会 |',
        '| 2 | 全機形状・材質候補・荷重条件、推進系候補 | タンク容積と構造・熱防護・着陸系の質量積み上げ |',
        '| 3 | 上昇と帰還の推力・燃焼時間・飛行経路を同時最適化 | 重力・抗力・操舵損失、離脱・再突入・着陸必要量 |',
        '| 4 | 推進剤と乾燥質量の台帳を統合 | 全消耗流体・残量・成長余裕の一意な計上、適切な配分 |',
        '| 5 | 分散と故障条件の性能・回収域 | 公称一点だけでなく所定の誤差・劣化・異常条件で成立 |',
        '| 6 | 質量・性能仕様の凍結 | 上記が閉じ、要求・根拠・担当・承認履歴がそろう |', '',
        'この段階で固定してよいのは方式選択・追跡可能な設計目標と、解析の比較条件である。未検証の数値をすべて確定させるのではなく、根拠のそろった項目から凍結する。小型衛星1 tのミッションに対しても、全段再使用の装備負担を含む本比較は約620 t級から始まる。小型機で成立したことを意味しない。', '',
        '## 9. 再現性と確認範囲', '',
        '`python3 work/design_freeze/mass_study.py`で本メモとJSONを再生成する。標準ライブラリのみを使用する。JSONには96通りの順計算、192通りの乾燥固定逆算、144通りの仮の乾燥成長連動逆算を収録する。質量保存、旧基準値との一致、逆算残差を確認した。これらは数式実装の確認であり、実機や飛行経路の妥当性検証ではない。', ''
    ]
    (OUT/'mass_study.md').write_text('\n'.join(lines), encoding='utf-8')


if __name__ == '__main__':
    main()
