"""E1 mechanical allocation arithmetic; stdlib only; no physical qualification."""
from pathlib import Path
import json, math
P=Path(__file__).resolve().parent

def overlap(a,b):
    return all(min(a[k][1],b[k][1])-max(a[k][0],b[k][0])>1e-9 for k in 'xyz')

def run():
    a=json.loads((P/'inputs.json').read_text());o=a['outer'];z=a['zones'];t=a['thermal'];f=a['front']
    mx={k:o[k]+o['total_tolerance_budget'] for k in ('W','D','H')}
    inner=a['usable_inner_budget']
    outside=[n for n,v in z.items() if any(v[k][0]<inner[k][0]-1e-9 or v[k][1]>inner[k][1]+1e-9 for k in 'xyz')]
    zn=list(z);collisions=[(n,m) for j,n in enumerate(zn) for m in zn[j+1:] if overlap(z[n],z[m])]
    barrier_collisions=[(n,m) for n,v in z.items() for m,b in a['barriers'].items() if isinstance(b,dict) and overlap(v,b)]
    dc=sum(a['power_allocation_W'].values());heat=dc/t['DC_efficiency_assumption']
    minflow=heat/(t['air_density_kg_m3']*t['air_Cp_J_kgK']*t['air_delta_K'])
    selectflow=minflow*t['flow_factor']
    intake=math.prod(t['side_intake_each_YZ'])*t['side_intake_count']*t['open_fraction_assumption']/1e6
    exhaust=math.prod(t['rear_exhaust_XZ'])*t['open_fraction_assumption']/1e6
    pitch=f['center_x'][1]-f['center_x'][0];cw=f['camera_candidate_envelope_WDH'][0]
    mic=a['audio'];ports=mic['top_port_centers']
    port_pitch_x=max(x for x,y in ports)-min(x for x,y in ports)
    port_pitch_y=max(y for x,y in ports)-min(y for x,y in ports)
    r={
      'revision':a['revision'],'physical_tests':0,'status':a['status'],
      'outer_nominal_mm':{k:o[k] for k in ('W','D','H')},'outer_max_budget_mm':mx,
      'zone_dimensions_WDH_mm':{n:[v[k][1]-v[k][0] for k in 'xyz'] for n,v in z.items()},
      'zone_outside_usable_inner':outside,'zone_overlaps':collisions,'barrier_zone_overlaps':barrier_collisions,
      'camera_geometry':{'adjacent_nominal_pitch_mm':pitch,'tracking_nominal_baseline_mm':f['center_x'][-1]-f['center_x'][0],
        'candidate_module_neighbor_gap_mm':pitch-cw,'visual_window_web_nominal_mm':pitch-f['visual_window_diameter'],
        'window_vignetting_status':'HOLD; no selected optical model, entrance pupil or cover-window test'},
      'audio_geometry':{'published_mic_pitch_mm':[port_pitch_x,port_pitch_y],
        'board_to_zone_side_reserve_nominal_mm':(z['audio_array']['x'][1]-z['audio_array']['x'][0]-mic['published_PCB_diameter'])/2,
        'fan_to_audio_vertical_zone_gap_mm':z['audio_array']['z'][0]-z['rear_fan_plenum']['z'][1],
        'zone_top_to_worst_budget_inner_lid_mm':inner['z'][1]-z['audio_array']['z'][1],
        'meaning':'Zone separation only, not acoustic attenuation. Nominal side reserve excludes cable bends. Thin upper margin demands actual stack-up/CAD.'},
      'thermal_budget':{'DC_allocation_W':dc,'assumed_inside_DC_loss_W':heat-dc,'enclosure_heat_W':heat,
        'minimum_energy_balance_flow_m3_h':minflow*3600,'provisional_factor2_flow_m3_h':selectflow*3600,
        'two_side_intakes_total_free_area_cm2':intake*1e4,'rear_exhaust_free_area_cm2':exhaust*1e4,
        'mean_intake_velocity_m_s':selectflow/intake,'mean_exhaust_velocity_m_s':selectflow/exhaust,
        'surface_effective_theta_budget_K_W':(t['surface_target_C']-t['ambient_upper_C']-t['measurement_margin_K'])/heat,
        'status':'Allocation only. APU sustained/boost, SSD, USB, PSU peak and fan operating point are not certified. Surface theta is only a screening inequality, not a heatsink thermal-resistance specification.'},
      'nonclaims':['No selected APU motherboard fits verified','No OAK controller/FFC/USB routing verified','No completed privacy shutter','No released fastening or wall mount','No acoustic recognition distance, accuracy or fan-noise guarantee','No old D0 full-body coverage retained automatically']}
    tests=[
      ('outer_budget_all_axes_le_200',all(v<=o['proposed_axis_limit'] for v in mx.values())),
      ('allocated_zones_within_inner_budget',not outside),('allocated_boxes_nonoverlap',not collisions),
      ('barriers_do_not_intersect_allocated_boxes',not barrier_collisions),
      ('game_computer_has_separate_zone','compute_board_RAM_SSD' in z),
      ('vision_controller_has_separate_zone','vision_controller' in z),
      ('audio_allocation_110x110x20',r['zone_dimensions_WDH_mm']['audio_array']==[110,110,20]),
      ('audio_board_diameter_nominal_within_xy',mic['published_PCB_diameter']<110),
      ('four_ports_follow_published_square',[port_pitch_x,port_pitch_y]==[66,66]),
      ('tracking_baseline_120',r['camera_geometry']['tracking_nominal_baseline_mm']==120),
      ('camera_envelope_nominal_separation',pitch-cw>0),
      ('audio_5W_replaces_3W',a['power_allocation_W']['audio']==5 and dc==80),
      ('thermal_80_divided_by_90pct',abs(heat-88.8888888889)<1e-8),
      ('no_external_USB_or_speaker_load_assumed',a['power_allocation_W'].keys()=={'APU','board_RAM','SSD','vision','audio','fan_control'})]
    r['model_tests']=[{'name':n,'pass':bool(v)} for n,v in tests]
    assert all(v for _,v in tests),r['model_tests']
    (P/'calculated_results.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'model_tests':len(tests),'pass':all(v for _,v in tests),'physical_tests':0,'thermal':r['thermal_budget']},ensure_ascii=False,indent=2))
    return r

if __name__=='__main__':
    if not __debug__:raise RuntimeError('Run without assertion disabling.')
    run()
