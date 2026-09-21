"""Arithmetic only. No microphone, network, recording, or ASR operation.

Run: python3 calculate.py --write
The generated JSON is deterministic. PASS is not physical product acceptance.
"""
import argparse
import itertools
import json
import math
from pathlib import Path


def calculate(d):
    c = d["candidate"]
    p = d["pcm_calculation_assumptions"]
    a = d["acoustic_calculation_assumptions"]
    w = d["power_allocation"]
    pcm = []
    for bits in p["sample_width_cases_bits"]:
        capture = c["usb_capture_rate_Hz_candidate"] * c["usb_capture_channels_candidate"] * bits
        reference = p["reference_rate_Hz_assumed"] * p["reference_usb_channels_reserved"] * bits
        pcm.append({"sample_width_bits_assumed": bits,
                    "capture_payload_Mbit_s": capture / 1e6,
                    "playback_payload_Mbit_s_assumed": reference / 1e6,
                    "duplex_payload_Mbit_s_assumed": (capture + reference) / 1e6,
                    "capture_bytes_per_second": capture / 8,
                    "USB_protocol_overhead_included": False})
    asr_bps = p["asr_rate_Hz"] * p["asr_channels"] * p["asr_sample_width_bits"] / 8
    coords = c["mic_coordinates_m"]
    pairs = [{"pair_zero_based": [i, j], "separation_mm": 1000 * math.dist(coords[i], coords[j]),
              "maximum_geometric_TDOA_us": 1e6 * math.dist(coords[i], coords[j]) / a["sound_speed_m_s"]}
             for i, j in itertools.combinations(range(len(coords)), 2)]
    max_tdoa_s = max(x["maximum_geometric_TDOA_us"] for x in pairs) / 1e6
    propagation = [{"distance_m": distance, "one_way_acoustic_delay_ms": 1000 * distance / a["sound_speed_m_s"]}
                   for distance in a["speaker_to_mic_distances_m"]]
    drift = [{"relative_clock_error_ppm_assumed": ppm, "elapsed_seconds": seconds,
              "timing_drift_ms": seconds * ppm / 1000,
              "drift_in_16k_samples": seconds * ppm / 1e6 * p["asr_rate_Hz"]}
             for ppm in a["clock_relative_error_ppm_sensitivity_cases"]
             for seconds in a["clock_drift_durations_seconds"]]
    total = w["non_audio_DC_load_W"] + w["voice_subsystem_allocation_W"]
    previous = w["non_audio_DC_load_W"] + w["previous_audio_allocation_W"]
    power = {"previous_DC_allocation_W": previous, "revised_DC_allocation_W": total,
             "revised_source_DC_W_conservative_heat_model": total / w["DC_conversion_efficiency_assumed"],
             "conversion_loss_W_assumed": total / w["DC_conversion_efficiency_assumed"] - total,
             "revision_source_delta_W": (total - previous) / w["DC_conversion_efficiency_assumed"],
             "voice_budget_equivalent_5V_current_A": w["voice_subsystem_allocation_W"] / w["voice_USB_nominal_V"],
             "USB_actual_current_A": None,
             "USB_current_permission_proven": False}
    buffers = {"ASR_bytes_per_second": asr_bps,
               "PTT_prebuffer_bytes": asr_bps * p["PTT_prebuffer_seconds"],
               "future_wake_prebuffer_bytes": asr_bps * p["future_opt_in_wake_prebuffer_seconds"],
               "maximum_utterance_bytes": asr_bps * p["maximum_command_seconds"],
               "maximum_utterance_plus_optional_prebuffer_bytes": asr_bps * (p["maximum_command_seconds"] + p["future_opt_in_wake_prebuffer_seconds"]),
               "ASR_chunk_samples": p["asr_rate_Hz"] * p["host_processing_chunk_ms_design"] / 1000,
               "ASR_chunk_bytes": asr_bps * p["host_processing_chunk_ms_design"] / 1000,
               "raw_driver_DSP_ASR_model_buffers_included": False}
    checks = {
        "four_microphones": len(coords) == 4,
        "six_mic_pairs": len(pairs) == 6,
        "square_edge_66mm": sum(math.isclose(x["separation_mm"], 66) for x in pairs) == 4,
        "square_diagonal_93_338mm": math.isclose(max(x["separation_mm"] for x in pairs), 66 * math.sqrt(2)),
        "mono_16k_S16_is_32000_Bps": asr_bps == 32000,
        "PTT_has_no_preroll": buffers["PTT_prebuffer_bytes"] == 0,
        "optional_2sec_is_64000_bytes": buffers["future_wake_prebuffer_bytes"] == 64000,
        "15sec_command_is_480000_bytes": buffers["maximum_utterance_bytes"] == 480000,
        "20ms_chunk_is_320_samples": buffers["ASR_chunk_samples"] == 320,
        "48k_stereo_32bit_duplex_is_6_144Mbps": math.isclose(pcm[-1]["duplex_payload_Mbit_s_assumed"], 6.144),
        "100ppm_60sec_drift_is_6ms": any(x["relative_clock_error_ppm_assumed"] == 100 and x["elapsed_seconds"] == 60 and x["timing_drift_ms"] == 6 for x in drift),
        "audio_5W_replaces_3W_not_added_to_78W": previous == 78 and total == 80,
        "revised_source_is_88_889W": math.isclose(power["revised_source_DC_W_conservative_heat_model"], 800 / 9),
        "budget_is_not_device_power_rating": c["board_maximum_current_A"] is None,
        "no_physical_measurements": d["physical_measurements_count"] == 0,
        "no_recording_or_upload_by_default": not p["audio_persistent_storage_default"] and not p["audio_cloud_upload_default"],
        "physical_mute_circuit_not_claimed_complete": not d["physical_mute_requirements"]["onboard_mute_button_independent_security_boundary_proven"],
        "no_barge_in_certification": not a["barge_in_certified"]
    }
    return {"revision": d["revision"], "status": "CALCULATION_ONLY_NOT_PHYSICAL_ACCEPTANCE",
            "physical_measurements_count": 0, "pcm_payload_cases": pcm,
            "host_PCM_buffer_sizes_only": buffers, "array_pair_geometry": pairs,
            "max_TDOA_in_16k_samples": max_tdoa_s * 16000,
            "max_TDOA_in_48k_samples": max_tdoa_s * 48000,
            "one_way_acoustic_propagation": propagation,
            "independent_clock_drift_sensitivity_not_measurement": drift,
            "power_allocation": power, "arithmetic_checks": checks,
            "passed_check_count": sum(checks.values()), "all_arithmetic_checks_pass": all(checks.values())}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    result = calculate(json.loads((root / "design_inputs.json").read_text(encoding="utf-8")))
    payload = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.write:
        (root / "calculated_results.json").write_text(payload, encoding="utf-8")
    print(payload)
    raise SystemExit(0 if result["all_arithmetic_checks_pass"] else 1)
