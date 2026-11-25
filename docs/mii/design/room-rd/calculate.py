#!/usr/bin/env python3
"""Reproduce necessary-condition ray geometry and conditional R&D budgets.

This is a geometric-optics diagnostic, not a wave-optics simulator or proof of
display feasibility. Emitters sit on the four walls and have no intervening
scatterers, relays, mirrors, walls-as-screens, or occluders. The observer grid
samples eye-centre positions, not two pupils or a continuous walking domain.
"""
import itertools
import json
import math
from pathlib import Path


def first_boundary(eye, target, dimensions):
    direction = [b - a for a, b in zip(eye, target)]
    candidates = []
    bounds = [(-dimensions[0] / 2, dimensions[0] / 2),
              (-dimensions[1] / 2, dimensions[1] / 2), (0, dimensions[2])]
    for axis, delta in enumerate(direction):
        if abs(delta) < 1e-12:
            continue
        boundary = bounds[axis][1 if delta > 0 else 0]
        t = (boundary - eye[axis]) / delta
        if t > 0:
            point = tuple(eye[i] + t * direction[i] for i in range(3))
            candidates.append((t, axis, point))
    return min(candidates)


def wall_aperture_hit(axis, point, width, z_range):
    if axis == 2:
        return False
    lateral = point[1 - axis]
    return abs(lateral) <= width / 2 + 1e-9 and z_range[0] <= point[2] <= z_range[1]


def calculate(a):
    dims = a['room_m']
    eyes = list(itertools.product(a['observer_xy_m'], a['observer_xy_m'], a['observer_eye_z_m']))
    targets = list(itertools.product(a['target_xy_m'], a['target_xy_m'], a['target_z_m']))
    rays = [first_boundary(e, t, dims) for e in eyes for t in targets if math.dist(e, t) >= 0.3]
    angular = 4 * math.degrees(2 * math.atan(a['aperture_test_widths_m'][0] / dims[0]))
    coverage = []
    for w in a['aperture_test_widths_m']:
        hits = sum(wall_aperture_hit(axis, p, w, a['aperture_z_m']) for _, axis, p in rays)
        coverage.append({'width_m_each_of_4': w, 'hits': hits, 'rays': len(rays),
                         'fraction': round(hits / len(rays), 6)})
    slm = a['phase_slm']
    half_sine = slm['wavelength_nm'] / (2 * slm['pitch_um'] * 1000)
    native_angle = 2 * math.asin(half_sine)
    magnification = slm['relay_width_mm'] / slm['width_mm']
    relay_angle = 2 * math.asin(half_sine / magnification)
    one_channel = slm['width_px'] * slm['height_px'] * slm['phase_bits'] * slm['refresh_hz'] / 1e9
    tracker = a['tracking']
    eyebox = 2 * (tracker['speed_m_s'] * tracker['delay_ms'] + tracker['position_error_mm'] + tracker['pupil_radius_mm'])
    camera = a['camera']
    camera_rate = camera['width_px'] * camera['height_px'] * camera['bits'] * camera['fps'] * camera['count'] / 1e9
    cumulative = [0, 0]
    phases = []
    for p in a['phases']:
        labor = [p['person_months'] * r for r in a['labor_man_jpy_per_person_month']]
        subtotal = [labor[i] + p['prototype_man_jpy'][i] + p['external_man_jpy'][i] for i in range(2)]
        total = [round(x * (1 + p['contingency_percent'] / 100), 3) for x in subtotal]
        cumulative = [round(cumulative[i] + total[i], 3) for i in range(2)]
        phases.append({'id': p['id'], 'labor_man_jpy': labor, 'incremental_man_jpy': total,
                       'cumulative_man_jpy': cumulative[:]})
    return {
        'scope': 'necessary_geometry_and_budget_only_not_physical_acceptance',
        'central_horizontal_coverage_deg': round(angular, 4),
        'central_horizontal_coverage_fraction': round(angular / 360, 6),
        'sampled_geometry': coverage,
        'floor_or_ceiling_exit_rays': sum(axis == 2 for _, axis, _ in rays),
        'slm_native_full_angle_deg': round(math.degrees(native_angle), 5),
        'simple_relay_full_angle_deg': round(math.degrees(relay_angle), 5),
        'simple_relay_cone_span_mm_at_eye_distance': round(2 * slm['eye_distance_m'] * 1000 * math.tan(relay_angle / 2), 5),
        'phase_payload_gbps_per_channel': round(one_channel, 6),
        'phase_payload_gbps_rgb_two_independent_eyes': round(one_channel * slm['rgb_channels'] * slm['eye_channels'], 6),
        'sequential_rgb_two_eye_subframes_hz': slm['refresh_hz'] * slm['rgb_channels'] * slm['eye_channels'],
        'tracking_eyebox_minimum_mm_under_assumptions': eyebox,
        'raw_camera_payload_gbps_8_cameras': round(camera_rate, 6),
        'phases': phases,
        'sequential_months_all_gates_pass': sum(p['months'] for p in a['phases']),
        'physical_accepted': False,
        'success_probability': None,
    }


def sanity_checks(a, result):
    assert first_boundary((0, 0, 1.2), (1, 0, 1.2), a['room_m'])[1] == 0
    assert first_boundary((0, 0, 1.2), (0, 0, 0.2), a['room_m'])[1] == 2
    # Full closed boundary intersects every nonzero ray; four side apertures do not.
    assert wall_aperture_hit(0, (2.25, 0, 1.2), 0.6, [0.4, 2.2])
    assert not wall_aperture_hit(2, (0, 0, 0), 4.5, [0, 2.5])
    fractions = [r['fraction'] for r in result['sampled_geometry']]
    assert fractions == sorted(fractions) and fractions[-1] < 1
    assert all(0 < p['incremental_man_jpy'][0] <= p['incremental_man_jpy'][1] for p in result['phases'])
    assert result['sequential_rgb_two_eye_subframes_hz'] > 0
    assert result['tracking_eyebox_minimum_mm_under_assumptions'] > 0
    assert result['physical_accepted'] is False


if __name__ == '__main__':
    assumptions = json.loads(Path(__file__).with_name('assumptions.json').read_text())
    result = calculate(assumptions)
    sanity_checks(assumptions, result)
    print(json.dumps(result, ensure_ascii=False, indent=2))
