"""Reproduce narrow budget/coverage checks; never a flight or RF simulator."""
import json
import math
from pathlib import Path

G0 = 9.80665


def ascent(dry_upper=18.0, isp_first=330.0, isp_upper=370.0,
           ascent_upper=150.0, return_upper=4.0):
    first_total = 40.0 + 380.0 + 24.0 + 1.0
    upper_payload = dry_upper + ascent_upper + return_upper + 0.6 + 1.0
    first_start = first_total + upper_payload
    first_end = first_start - 380.0
    upper_end = upper_payload - ascent_upper
    dv = G0 * (isp_first * math.log(first_start / first_end)
               + isp_upper * math.log(upper_payload / upper_end))
    return {"launch_mass_t": first_start, "ideal_ascent_dv_m_s": dv,
            "margin_against_provisional_10080_m_s": dv - 10080.0}


def main():
    radius, altitude, elevation = 6371.0, 550.0, math.radians(25.0)
    psi = math.acos(radius / (radius + altitude) * math.cos(elevation)) - elevation
    fraction = (1.0 - math.cos(psi)) / 2.0
    upper_terminal = 18.0 + 0.6
    # Separate Isp assumptions from the old report: 600 m/s at 320 s;
    # preceding 150 m/s at 360 s. These demands are sensitivity inputs.
    pre_landing = upper_terminal * math.exp(600.0 / (G0 * 320.0))
    pre_deorbit = pre_landing * math.exp(150.0 / (G0 * 360.0))
    return_required = pre_deorbit - upper_terminal
    data = {
        "scope": "Arithmetic and spherical geometry only; no physical validation.",
        "coverage": {
            "earth_radius_km": radius, "altitude_km": altitude,
            "min_elevation_deg": 25, "cap_angle_deg": math.degrees(psi),
            "one_satellite_global_area_fraction": fraction,
            "two_satellites_nonoverlap_global_area_upper_bound": 2 * fraction,
            "area_only_satellite_count_necessary_lower_bound": math.ceil(1 / fraction),
            "inclination_53_geometric_latitude_bound_deg": 53 + math.degrees(psi),
            "this_is_not_a_continuous_coverage_proof": True,
        },
        "rocket_budget_sensitivity": {
            "baseline": ascent(),
            "upper_dry_plus_2t": ascent(dry_upper=20.0),
            "both_isp_minus_10s": ascent(isp_first=320.0, isp_upper=360.0),
            "return_plus_2t_ascent_minus_2t": ascent(ascent_upper=148.0, return_upper=6.0),
            "return_150_and_600_m_s_required_propellant_t": return_required,
            "difference_from_4t_return_budget_t": return_required - 4.0,
            "requirements_and_mass_are_provisional": True,
        },
        "qualification": {"live_satellite_received": False,
                          "hardware_test_executed": False,
                          "both_stages_recovered": False,
                          "flight_qualified": False},
    }
    assert 0.01 < 2 * fraction < 0.02
    assert data["coverage"]["inclination_53_geometric_latitude_bound_deg"] < 90
    assert data["rocket_budget_sensitivity"]["baseline"]["margin_against_provisional_10080_m_s"] > 0
    assert data["rocket_budget_sensitivity"]["upper_dry_plus_2t"]["margin_against_provisional_10080_m_s"] < 0
    assert return_required > 4.0
    output = Path(__file__).with_name("closure_checks.json")
    output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
