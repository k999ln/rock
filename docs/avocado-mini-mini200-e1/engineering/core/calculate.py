"""Mini200 E1 arithmetic and fictional game checks, not hardware benchmarks."""
from pathlib import Path
import json, math, random

OUT=Path(__file__).resolve().parent/'mini200_e1_core'
def run():
    OUT.mkdir(exist_ok=True)
    inputs={
        'status':'PROPOSED_BUDGET_NOT_MEASUREMENT',
        'frame_rate_hz':60,'stereo_width_px':1280,'stereo_hfov_deg':80,
        'baseline_m':0.120,'assumed_disparity_sigma_px':0.5,
        'depth_test_distances_m':[1,2,3],
        'ram_budget_gib':{'os':4,'game_cpu':8,'shared_graphics':8,'vision':2,'speech':2,'reserve':8},
        'storage_nominal_bytes':1000000000000,
        'storage_budget_gib':{'os_recovery':96,'models_apps':24,'creations_saves':96,'games':512,'updates':96},
        'motion_pipeline_ms':{'capture_wait':1000/60,'exposure_budget':4,'vision':12,'transfer':5,'permission':2,'game_wait':1000/60,'render':1000/60,'display':1000/60},
        'voice_end_to_ui_ms':{'endpoint':300,'queue':50,'asr':700,'parse_gate':50,'ui':100},
        'design_targets_ms':{'motion_p95':100,'voice_after_end_p95':1200},
        'physical_tests':0,'asr_audio_tests':0,
    }
    fx=inputs['stereo_width_px']/(2*math.tan(math.radians(inputs['stereo_hfov_deg']/2)))
    depth=[{'distance_m':z,'disparity_px':fx*inputs['baseline_m']/z,
            'linearized_depth_sigma_mm':1000*z*z*inputs['assumed_disparity_sigma_px']/(fx*inputs['baseline_m'])}
           for z in inputs['depth_test_distances_m']]
    checks=[]
    def check(name,condition):
        checks.append({'name':name,'pass':bool(condition)})
        if not condition:raise AssertionError(name)
    motion=sum(inputs['motion_pipeline_ms'].values());voice=sum(inputs['voice_end_to_ui_ms'].values())
    check('ram_allocations_sum_32',sum(inputs['ram_budget_gib'].values())==32)
    storage=inputs['storage_nominal_bytes']/2**30
    storage_free=storage-sum(inputs['storage_budget_gib'].values())
    check('storage_allocation_positive_reserve',storage_free>100)
    check('motion_budget_below_target_not_benchmark',motion<=inputs['design_targets_ms']['motion_p95'])
    check('voice_budget_within_target_not_benchmark',voice<=inputs['design_targets_ms']['voice_after_end_p95'])
    check('depth_disparity_decreases_with_distance',depth[0]['disparity_px']>depth[1]['disparity_px']>depth[2]['disparity_px'])
    check('depth_sigma_grows_quadratically',math.isclose(depth[1]['linearized_depth_sigma_mm'],4*depth[0]['linearized_depth_sigma_mm']))
    check('32_particle_all_pairs_496',32*31//2==496)
    check('256_particle_all_pairs_32640',256*255//2==32640)
    rng=random.Random(2001);max_momentum_error=0.;max_energy_error=0.
    for i in range(1000):
        m1=rng.uniform(.1,10);m2=rng.uniform(.1,10)
        v1=[rng.uniform(-5,5) for _ in range(3)];v2=[rng.uniform(-5,5) for _ in range(3)]
        v=[(m1*a+m2*b)/(m1+m2) for a,b in zip(v1,v2)]
        before=.5*m1*sum(a*a for a in v1)+.5*m2*sum(a*a for a in v2)
        after=.5*(m1+m2)*sum(a*a for a in v)
        heat=before-after
        err=max(abs(m1*a+m2*b-(m1+m2)*c) for a,b,c in zip(v1,v2,v))
        max_momentum_error=max(max_momentum_error,err)
        max_energy_error=max(max_energy_error,abs(before-after-heat))
        assert heat>=-1e-10 and err<1e-10
    check('fictional_merge_1000_momentum_and_energy_ledger_cases',max_momentum_error<1e-10 and max_energy_error<1e-10)
    result={
        'revision':'Mini200 E1','physical_tests':0,'asr_audio_tests':0,
        'inputs':inputs,'focal_length_assumption_px':fx,'depth_sensitivity':depth,
        'motion_budget_ms':motion,'voice_budget_ms':voice,
        'storage_gib':storage,'storage_unallocated_gib':storage_free,
        'fictional_merge_cases':1000,'max_momentum_error':max_momentum_error,
        'max_energy_accounting_error':max_energy_error,'checks':checks,'pass_count':len(checks),
        'limits':['No CPU/GPU/ASR performance measured. Adding latency allocations does not prove a P95 target.',
                  'Stereo error assumes rectification, correct correspondence and 0.5px disparity uncertainty, not measured hand accuracy.',
                  'RAM is a logical shared-memory budget, not dedicated VRAM or a demonstrated concurrent workload.',
                  'Fictional perfectly inelastic particle merge only. No chemistry, collision engine timing or real hardware.']}
    (OUT/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    (OUT/'README.md').write_text('''# E1 ゲーム処理と容量の計算

run() は標準ライブラリだけの計算です。60Hzの処理配分、RAM32GiBの論理予算、SSD1TBのGiB換算、仮定したステレオ奥行き誤差を計算します。予算の和は実機のP95測定ではありません。

seed2001の架空粒子1000組で、完全非弾性結合後の質量加重速度と、減った運動エネルギーを熱の台帳に移す式を検査します。実化学・人体認識・ゲームのGPU負荷を検証しません。

寸法120mm、HFOV80度、幅1280画素、視差誤差0.5画素は計算入力です。実際はcamera calibration、crop、同期、被写体、照明、奥行き境界で変わります。
''')
    return result
if __name__=='__main__':
    r=run();print(json.dumps({k:r[k] for k in ['pass_count','motion_budget_ms','voice_budget_ms','storage_unallocated_gib','physical_tests']},ensure_ascii=False))
