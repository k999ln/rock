"""Coarse geometry screen for A-LINK; no RF/network/continuous-coverage claim."""
import os
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
import json
import math
from pathlib import Path
import time
import numpy as np

R_KM = 6371.0
H_KM = 550.0
MU_KM3_S2 = 398600.4418
ELEV_DEG = 25.0
INCL_DEG = 87.0
OMEGA_EARTH_RAD_S = 7.2921159e-5
N_POINTS = 2048
STEP_S = 300
TIMES_S = np.arange(0, 86400, STEP_S, dtype=np.float64)
SATS_PER_PLANE = 24

elev = np.deg2rad(ELEV_DEG)
psi = np.arccos(R_KM * np.cos(elev) / (R_KM + H_KM)) - elev
cos_psi = np.cos(psi)
mean_motion = np.sqrt(MU_KM3_S2 / (R_KM + H_KM) ** 3)
incl = np.deg2rad(INCL_DEG)

# Deterministic Fibonacci points; nearly equal-area samples, no pole points.
k = np.arange(N_POINTS, dtype=np.float64)
z = 1.0 - 2.0 * (k + 0.5) / N_POINTS
longitude = np.pi * (3.0 - np.sqrt(5.0)) * k
radial = np.sqrt(1.0 - z * z)
ground = np.column_stack((radial * np.cos(longitude), radial * np.sin(longitude), z))

def describe_point(idx):
    x, y, zval = ground[int(idx)]
    return {"point_index": int(idx), "latitude_deg": float(np.rad2deg(np.arcsin(zval))),
            "longitude_deg": float(np.rad2deg(np.arctan2(y, x)))}

def simulate(planes):
    start = time.monotonic()
    j, s = np.meshgrid(np.arange(planes), np.arange(SATS_PER_PLANE), indexing="ij")
    raan = (np.pi * j / planes).ravel()
    initial_u = (2 * np.pi * (s / SATS_PER_PLANE + j / (planes * SATS_PER_PLANE))).ravel()
    co, so = np.cos(raan), np.sin(raan)
    ci, si = np.cos(incl), np.sin(incl)
    counts = np.zeros((len(TIMES_S), N_POINTS), dtype=np.uint16)
    for tidx, t in enumerate(TIMES_S):
        u = initial_u + mean_motion * t
        cu, su = np.cos(u), np.sin(u)
        x_eci = co * cu - so * su * ci
        y_eci = so * cu + co * su * ci
        z_eci = su * si
        angle = OMEGA_EARTH_RAD_S * t
        ca, sa = np.cos(angle), np.sin(angle)
        sat_ecef = np.column_stack((ca * x_eci + sa * y_eci,
                                   -sa * x_eci + ca * y_eci, z_eci))
        dots = ground @ sat_ecef.T
        counts[tidx] = np.count_nonzero(dots >= cos_psi, axis=1)
    visible = counts >= 1
    fraction_by_point = visible.mean(axis=0)
    fraction_by_time = visible.mean(axis=1)
    current_run = np.zeros(N_POINTS, dtype=np.int32)
    longest_run = np.zeros(N_POINTS, dtype=np.int32)
    for visible_at_time in visible:
        current_run = np.where(visible_at_time, 0, current_run + 1)
        longest_run = np.maximum(longest_run, current_run)
    worst_idx = int(np.argmin(fraction_by_point))
    longest_idx = int(np.argmax(longest_run))
    result = {
        "planes": planes,
        "satellites_per_plane": SATS_PER_PLANE,
        "satellites": planes * SATS_PER_PLANE,
        "mean_point_time_visibility_fraction": float(visible.mean()),
        "worst_point_sample_visibility_fraction": float(fraction_by_point[worst_idx]),
        "worst_point": describe_point(worst_idx),
        "all_points_visible_at_every_sample_time": bool(visible.all()),
        "number_of_sample_times_all_points_visible": int(np.all(visible, axis=1).sum()),
        "total_sample_times": len(TIMES_S),
        "minimum_visible_satellites_over_all_point_times": int(counts.min()),
        "maximum_visible_satellites_over_all_point_times": int(counts.max()),
        "minimum_instantaneous_sample_area_fraction_visible": float(fraction_by_time.min()),
        "maximum_instantaneous_sample_area_fraction_visible": float(fraction_by_time.max()),
        "longest_consecutive_unseen_samples": int(longest_run[longest_idx]),
        "longest_unseen_sample_run_times_step_s": int(longest_run[longest_idx] * STEP_S),
        "longest_unseen_run_point": describe_point(longest_idx),
        "elapsed_computation_s": round(time.monotonic() - start, 3),
    }
    print(json.dumps(result, ensure_ascii=False), flush=True)
    return result

output = {
    "model": "Spherical Earth, circular orbit, geometrical line of sight only",
    "earth_radius_km": R_KM, "height_km": H_KM,
    "minimum_elevation_deg": ELEV_DEG, "inclination_deg": INCL_DEG,
    "earth_rotation_rad_s": OMEGA_EARTH_RAD_S,
    "gravitational_parameter_km3_s2": MU_KM3_S2,
    "mean_motion_rad_s": float(mean_motion),
    "coverage_cap_half_angle_deg": float(np.rad2deg(psi)),
    "points": N_POINTS, "point_rule": "Fibonacci sphere, z=1-2*(k+0.5)/2048; lon=pi*(3-sqrt(5))*k",
    "time_samples": len(TIMES_S), "time_start_s": 0, "time_stop_exclusive_s": 86400,
    "time_step_s": STEP_S,
    "orbit_plane_rule": "RAAN_j=pi*j/P, j=0..P-1 (0 to <180 deg)",
    "phase_rule": "u_j,s(t)=n*t+2*pi*(s/24+j/(P*24)); s=0..23",
    "not_a_standard_walker_claim": True,
    "visibility_rule": "dot(ground_unit, satellite_ECEF_unit)>=cos(psi)",
    "max_gap_note": "Consecutive unseen sample count times 300 s is a coarse sample-based index, not a measured exact gap duration; no periodic wrap of the 24 h boundary.",
    "limitations": [
        "Finite 2048-point grid and 300-s sampling can miss spatial and temporal gaps.",
        "No RF link budget, buildings, terrain, interference, pointing, gateway, capacity or service model.",
        "No perturbations, orbital errors, failures, manoeuvres, or phasing optimization.",
        "24 h only; a successful sampled test does not establish continuous global coverage.",
        "Numbers are preliminary for this explicit arrangement only."
    ],
    "results": [simulate(p) for p in (12, 18, 24)],
}
dest = Path(__file__).with_name("coverage_screen_results.json")
dest.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
print(str(dest), flush=True)
