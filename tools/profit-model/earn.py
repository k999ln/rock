"""Fermi estimate: average monthly profit of one earning blueprint (spec-122, 470) in its first year.

Revenue per blueprint = what the company receives (after the platform's cut) in an average month
of year 1, including months and blueprints that earn 0. low / mid / high per place.
Cost per blueprint = the steps' costYen in lib/noah-business.ts (video 3,000 / image 1,000 yen a month)
+ fixed fees added here (blog hosting, Shopify, Apple Developer). Profit = revenue - cost.
"""
import json, sys, collections

USD = 157  # same rate as the profit sheet (lib/noah-cloud-contract.ts)
bps = json.load(open(sys.argv[1]))

# ---- evidence (each number has a source; see SOURCES) -------------------------------------
PB_YEAR1 = round(2.42 * USD)             # new blogs (<1 year): average $2.42 / month  [PB]
JAFRA_MEDIAN = 4100                      # all affiliates: median in the 1,000-5,000 bracket, interpolated [JAFRA]
COCONALA_NET = 907                       # 17,226M yen GMV / 1.233M skill registrants / 12 x (1 - 22%) [COCONALA]
LINE_MEAN = 650                          # 47.9B yen / 720k creators / 36 months x 35% creator share [LINE]
KDP_NOLIST_MEDIAN = round(15 * USD)      # authors without an email list: median ~$15 / month [WWM]
BASE_GMV_PER_SHOP = 5342                 # 69,735 selling shops x 191,510 yen / 2.5M opened shops [BASE]
APP_Q1 = round(16 * USD)                 # lower quartile after a year: $16 / month [RC]
APP_MEAN = round(72 * USD)               # average after a year: $72 / month [RC]
YT_LONG_MID = 600                        # 20% monetized x half the year x 20k views x 0.3 yen [VIDIQ, VOX]
YT_SHORTS_MID = 100                      # Shorts RPM $0.04-0.30 / 1,000 views; YPP via Shorts is rare [VOX]
MARGIN_GOODS = 0.20                      # gross margin on dropship / print-on-demand goods (assumed)

# per place: (revenue low, mid, high) in yen / month, net of the platform's cut
REV = {
    # affiliate and oshi travel: rewards are paid net
    'affiliate': (0, PB_YEAR1, JAFRA_MEDIAN),
    # ads
    'ads:blog': (0, PB_YEAR1, JAFRA_MEDIAN),
    'ads:youtube': (0, YT_LONG_MID, 3000),
    'ads:youtube-shorts': (0, YT_SHORTS_MID, 2000),
    # gig: same evidence for the 4 markets
    'gig': (0, COCONALA_NET, 39500),
    # digital
    'digital:line-creators': (0, LINE_MEAN, 2 * LINE_MEAN),
    'digital:amazon-kdp': (0, 500, KDP_NOLIST_MEDIAN),
    'digital:pixta': (0, 200, LINE_MEAN),
    'digital:adobe-stock': (0, 200, LINE_MEAN),
    'digital': (0, 500, KDP_NOLIST_MEDIAN),  # note, brain, gumroad, booth, udemy
    # commerce (gross margin on BASE's GMV per opened shop)
    'commerce': (0, round(BASE_GMV_PER_SHOP * MARGIN_GOODS), round(4 * BASE_GMV_PER_SHOP * MARGIN_GOODS)),
    'commerce:kdp-books': (0, 500, KDP_NOLIST_MEDIAN),
    # app (Apple keeps 15% under the small business program)
    'app': (0, round(APP_Q1 * 0.85), round(APP_MEAN * 0.85)),
}
FIXED = {'hosting': 1000, 'shopify': 25 * USD, 'apple-developer': round(12980 / 12)}

def rev_key(b):
    parts = b['id'].split(':'); m = b['model']; place = parts[-1]
    if m == 'affiliate': return 'affiliate'
    if m == 'ads': return f'ads:{place}'
    if m == 'gig': return 'gig'
    if m == 'digital': return f'digital:{place}' if f'digital:{place}' in REV else 'digital'
    if m == 'commerce': return 'commerce:kdp-books' if place == 'kdp-books' else 'commerce'
    if m == 'app': return 'app'
    if m == 'oshi':
        if b.get('hold'): return None  # on hold (the owner's decision): not run, 0
        kind = parts[1]
        if kind.startswith('calendar'): return 'ads:blog'
        if kind.startswith('travel') or kind.startswith('expedition'): return 'affiliate'
        return 'commerce'
    raise ValueError(b['id'])

rows = []
for b in bps:
    k = rev_key(b)
    lo, mid, hi = REV[k] if k else (0, 0, 0)
    step_cost = sum(s.get('costYen') or 0 for s in b['steps'])
    fixed = sum(FIXED.get(a, 0) for a in b['accounts']) if k else 0
    cost = (step_cost if k else 0) + fixed
    rows.append(dict(id=b['id'], model=b['model'], place=b['id'].split(':')[-1], key=k or 'hold', hold=bool(b.get('hold')),
                     lo=lo, mid=mid, hi=hi, step_cost=step_cost if k else 0, fixed=fixed, cost=cost,
                     p_lo=lo - cost, p_mid=mid - cost, p_hi=hi - cost))

def avg(rs, f): return sum(r[f] for r in rs) / len(rs)
run = [r for r in rows if not r['hold']]
print(f"all {len(rows)}: revenue mid {avg(rows,'mid'):.0f}, cost {avg(rows,'cost'):.0f}, profit lo/mid/hi {avg(rows,'p_lo'):.0f} / {avg(rows,'p_mid'):.0f} / {avg(rows,'p_hi'):.0f}")
print(f"running {len(run)}: revenue mid {avg(run,'mid'):.0f}, cost {avg(run,'cost'):.0f}, profit lo/mid/hi {avg(run,'p_lo'):.0f} / {avg(run,'p_mid'):.0f} / {avg(run,'p_hi'):.0f}")
g = collections.defaultdict(list)
for r in rows: g[(r['model'], r['key'], r['step_cost'], r['fixed'])].append(r)
for k, rs in sorted(g.items()):
    print(k, len(rs), 'rev', rs[0]['lo'], rs[0]['mid'], rs[0]['hi'], 'profit mid', rs[0]['p_mid'])
pos = [r for r in run if r['p_mid'] > 0]
print('positive at mid:', len(pos), 'avg profit', round(avg(pos, 'p_mid')), 'avg revenue', round(avg(pos, 'mid')))
json.dump(rows, open(sys.argv[2], 'w'), ensure_ascii=False, indent=1)

# ---- alternative: make video and images with open-source tools (assumed cost) ----------------
OSS_COST = {3000: 300, 1000: 100}   # video 3,000 -> 300, image 1,000 -> 100 yen / month (assumed)
for r in rows:
    sc = OSS_COST.get(r['step_cost'], r['step_cost'])
    r['cost_oss'] = sc + r['fixed']
    r['p_mid_oss'] = r['mid'] - r['cost_oss']
summary = {}
for name, rs in [('all', rows), ('running', run)]:
    summary[name] = dict(n=len(rs), rev_lo=avg(rs,'lo'), rev_mid=avg(rs,'mid'), rev_hi=avg(rs,'hi'), cost=avg(rs,'cost'),
                         p_lo=avg(rs,'p_lo'), p_mid=avg(rs,'p_mid'), p_hi=avg(rs,'p_hi'),
                         cost_oss=avg(rs,'cost_oss'), p_mid_oss=avg(rs,'p_mid_oss'))
pos = [r for r in run if r['p_mid'] > 0]
pos_oss = [r for r in run if r['p_mid_oss'] > 0]
summary['positive'] = dict(n=len(pos), rev_mid=avg(pos,'mid'), p_mid=avg(pos,'p_mid'), total_rev=sum(r['mid'] for r in pos), total_profit=sum(r['p_mid'] for r in pos))
summary['positive_oss'] = dict(n=len(pos_oss), rev_mid=avg(pos_oss,'mid'), p_mid=avg(pos_oss,'p_mid_oss'), total_rev=sum(r['mid'] for r in pos_oss), total_profit=sum(r['p_mid_oss'] for r in pos_oss))
summary['running_totals'] = dict(rev=sum(r['mid'] for r in run), cost=sum(r['cost'] for r in run), profit=sum(r['p_mid'] for r in run),
                                 cost_oss=sum(r['cost_oss'] for r in run), profit_oss=sum(r['p_mid_oss'] for r in run))
for k, v in summary.items(): print(k, {a: round(b) for a, b in v.items()})
json.dump(rows, open(sys.argv[2], 'w'), ensure_ascii=False, indent=1)
json.dump(summary, open(sys.argv[2].replace('.json', '-summary.json'), 'w'), ensure_ascii=False, indent=1)
