"""Rebuilds the Sheets artifact 「Noah 300人の利益試算」 (revision 14) and checks it.

Inputs are copied from the 前提 sheet. Every formula follows the sheet's own formulas
(月の計算, 12か月, まとめ). The 12か月 sheet read at revision 12/14 is the check.
"""
import json, math, sys

def round_half_away(x, digits=0):
    m = 10 ** digits
    v = abs(x) * m
    r = math.floor(v + 0.5)
    return math.copysign(r / m, x) if x != 0 else 0.0

def rounddown(x, digits=0):
    m = 10 ** digits
    return math.trunc(x * m) / m

def roundup(x, digits=0):
    m = 10 ** digits
    v = x * m
    return (math.ceil(v) if v >= 0 else math.floor(v)) / m

P = dict(
    N=300, B5_pay_in_free=0, cloud_pp=45, usd=157, ai_cost=0.01, refund=0.02, reserve=0.05,
    creator=0.2, ref_fee=0.1, d=0.75, price=600, optin=0.05, paid_extra_cloud=60,
    transfer_fee=100, min_payout=1000, shipping=1000, consult=100000,
    fee_coconala=0.22, fee_card=0.036, fee_affiliate=0.0,
)
P['paid_plan'] = 5 * P['usd']
RAMP = [30, 100, 300] + [300] * 9
FREE_MONTHS = min(12, sum(1 for n in RAMP if n < P['N']) + 1)

N = P['N']
SCEN = {
    'S1': dict(label='S1 今の実例', B=39500, C=0, D=0, F=0, G=0),
    'S2': dict(label='S2 実例の平均＋紹介少し', B=round_half_away(263634 / 79 * 30, -3), C=N * 0.01, D=20000, F=0, G=0),
    'S3': dict(label='S3 紹介が回る', B=round_half_away(263634 / 79 * 30, -3), C=N * 0.03, D=30000, F=0, G=30000),
    'S4': dict(label='S4 本人の例（1人20万円）', B=0, C=0, D=0, F=N * 200000, G=0),
}
for s in SCEN.values():
    s['E'] = s['C'] * s['D']
    s['H'] = s['B'] + s['E'] + s['F'] + s['G']

def transfers(per, n, refs):
    t = 0 if per <= 0 else (n if per >= P['min_payout'] else n * per / P['min_payout'])
    return t + refs

def month_calc(s):
    """月の計算: block 1 (free, 300 people) and block 2 (after the deduction starts)."""
    inc = s['H']; ref = inc * P['refund']
    fee = (s['B'] * P['fee_coconala'] + (s['E'] + s['F']) * P['fee_card'] + s['G'] * P['fee_affiliate']) * (1 - P['refund'])
    cost = N * P['cloud_pp'] + P['paid_plan'] + inc * P['ai_cost']
    creator = (inc - ref) * P['creator']
    reserve = roundup((inc - ref) * P['reserve'], 0)
    reffee = s['E'] * (1 - P['refund']) * P['ref_fee']
    surplus = inc - ref - fee - cost - creator - reserve - reffee
    pool = rounddown(surplus * P['d'], 0) if (surplus > 0 and P['B5_pay_in_free'] == 1) else 0
    per = rounddown(pool / N, 0)
    company = surplus - pool
    tr = transfers(per, N, s['C']); tfee = tr * P['transfer_fee']
    b1 = dict(income=inc, refund=ref, fee=fee, cost=cost, creator=creator, reserve=reserve, reffee=reffee,
              surplus=surplus, pool=pool, per=per, paid=0, deduction=0, company=company,
              transfers=tr, tfee=tfee, profit=company - tfee, cash=company - tfee + reserve)
    paid = round_half_away(N * P['optin'], 0) if rounddown(rounddown(max(surplus, 0) * P['d'], 0) / N, 0) >= P['price'] else 0
    cost2 = cost + paid * P['paid_extra_cloud']
    surplus2 = inc - ref - fee - cost2 - creator - reserve - reffee
    pool2 = rounddown(surplus2 * P['d'], 0) if surplus2 > 0 else 0
    per2 = rounddown(pool2 / N, 0)
    ded2 = paid * P['price'] if per2 >= P['price'] else 0
    company2 = surplus2 - pool2
    tr2 = transfers(per2, N, s['C']); tfee2 = tr2 * P['transfer_fee']
    b2 = dict(income=inc, refund=ref, fee=fee, cost=cost2, creator=creator, reserve=reserve, reffee=reffee,
              surplus=surplus2, pool=pool2, per=per2, paid=paid, deduction=ded2, company=company2,
              transfers=tr2, tfee=tfee2, profit=company2 + ded2 - tfee2, cash=company2 + ded2 - tfee2 + reserve)
    return b1, b2

def twelve(s, b2):
    rows = []; cum = 0
    for m in range(1, 13):
        n = RAMP[m - 1]
        if m <= FREE_MONTHS:
            stage = '無料'
            inc = s['B'] + n * (s['E'] + s['F']) / N + s['G']
            surplus = (inc - inc * P['refund']
                       - (s['B'] * P['fee_coconala'] + n * (s['E'] + s['F']) / N * P['fee_card'] + s['G'] * P['fee_affiliate']) * (1 - P['refund'])
                       - (n * P['cloud_pp'] + P['paid_plan'] + inc * P['ai_cost'])
                       - (inc - inc * P['refund']) * P['creator']
                       - roundup((inc - inc * P['refund']) * P['reserve'], 0)
                       - n * s['E'] / N * (1 - P['refund']) * P['ref_fee'])
            pool = rounddown(surplus * P['d'], 0) if (surplus > 0 and P['B5_pay_in_free'] == 1) else 0
            ded = 0
            per_n = rounddown(pool / n, 0)
            t = 0 if pool <= 0 else (n if per_n >= P['min_payout'] else n * per_n / P['min_payout'])
            tfee = (t + s['C'] * n / N) * P['transfer_fee']
        else:
            stage = '天引き'
            inc, surplus, pool, ded, tfee = b2['income'], b2['surplus'], b2['pool'], b2['deduction'], b2['tfee']
        profit = surplus - pool + ded - tfee - (P['consult'] if m == FREE_MONTHS + 1 else 0)
        cum += profit
        rows.append(dict(m=m, n=n, stage=stage, income=inc, surplus=surplus, pool=pool, deduction=ded, tfee=tfee, profit=profit, cum=cum))
    return rows

def breakeven(target, s3b1, s1_income):
    k = (s3b1['surplus'] + N * P['cloud_pp'] + P['paid_plan']) / s3b1['income']
    need = round_half_away((N * target / P['d'] + N * P['cloud_pp'] + P['paid_plan']) / k, -3)
    return need, need / s1_income

RESULT = {}
for key, s in SCEN.items():
    b1, b2 = month_calc(s)
    RESULT[key] = dict(s=s, b1=b1, b2=b2, months=twelve(s, b2))

# ---- check against the sheet's 12か月 (read at revision 12; inputs unchanged at 14) ----
sheet = json.load(open(sys.argv[1]))
rows = sheet['rows']
def num(c):
    if isinstance(c, dict):
        c = c.get('value', c)
        if isinstance(c, dict) and 'number' in c: return c['number']
    return c
starts = {'S1': 3, 'S2': 18, 'S3': 33, 'S4': 48}
bad = 0; checked = 0
for key, r0 in starts.items():
    for i, mrow in enumerate(RESULT[key]['months']):
        cells = [num(c) for c in rows[str(r0 + i)]]
        mine = [mrow['m'], mrow['n'], mrow['stage'], mrow['income'], mrow['surplus'], mrow['pool'], mrow['deduction'], mrow['tfee'], mrow['profit'], mrow['cum']]
        for a, b in zip(mine, cells):
            checked += 1
            if isinstance(a, str) or isinstance(b, str):
                ok = a == b
            else:
                ok = abs(a - b) < 1e-6
            if not ok:
                bad += 1; print('MISMATCH', key, i + 1, a, b)
# まとめ and 分かれ目 values read at revision 12
want = {
    'S1': (39500, 14, 5835.8, 1039.8, -51984.4), 'S2': (160000, 180, 71858.2, 12340.2, 192634.72),
    'S3': (400000, 545, 217269.4, 37292.4, 659702.24), 'S4': (60000000, 103420, 41368915, 10321004, 152083251),
}
for key, w in want.items():
    R = RESULT[key]
    mine = (R['s']['H'], R['b2']['per'], R['b1']['profit'], R['b2']['profit'], R['months'][-1]['cum'])
    for a, b in zip(mine, w):
        checked += 1
        if abs(a - b) > 0.01: bad += 1; print('MISMATCH まとめ', key, a, b)
s1_income = RESULT['S1']['s']['H']
for target, need in [(100, 93000), (600, 438000), (2000, 1401000), (150000, 103271000)]:
    checked += 1
    got = breakeven(target, RESULT['S3']['b1'], s1_income)[0]
    if got != need: bad += 1; print('MISMATCH 分かれ目', target, got, need)
print(f'checked {checked} values, mismatches {bad}')
json.dump({k: {'b1': v['b1'], 'b2': v['b2'], 'months': v['months'], 'scenario': v['s']} for k, v in RESULT.items()},
          open(sys.argv[2], 'w'), ensure_ascii=False, indent=1)
sys.exit(1 if bad else 0)
