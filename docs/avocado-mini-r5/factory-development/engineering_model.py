#!/usr/bin/env python3
"""Reproducible feasibility arithmetic; never a component qualification or circuit sign-off."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent


def calculate(data: dict) -> dict:
    g = data["geometry"]
    e = data["energy"]
    m = data["mass"]
    nominal_wh = e["m65aCellNominalWh"] * e["cellCount"]
    load_side_wh = nominal_wh * e["usableFractionHypothesis"] * e["railEfficiencyHypothesis"]
    ap_wh = e["satelliteApSystemPowerHypothesisW"] * e["satelliteApHoursHypothesis"]
    remaining_hours = e["carryHoursHypothesis"] - e["satelliteApHoursHypothesis"]
    if remaining_hours <= 0:
        raise ValueError("carryHoursHypothesis must exceed satelliteApHoursHypothesis")
    available_idle_w = (load_side_wh - ap_wh) / remaining_hours
    if e["cellCount"] != 2:
        raise ValueError("2S voltage screen requires exactly two cells")
    return {
        "status": "SCREEN_ONLY_NOT_RELEASE",
        "geometry": {
            "readyUnallocatedGapAndFaultAndCollarMm": g["allStatesHeightLimitMm"] - g["telescopingReadyBaseHeightMm"],
            "cellEndSpaceMm": g["batteryBayLengthMm"] - e["m65aCellMaxLengthMm"],
            "listed9523BoardDiameterShortfallMm": g["idealClearDiameterMm"] - g["planet9523BoardWidthMm"],
            "listed9523BoardFitsIdealClearDiameter": g["planet9523BoardWidthMm"] <= g["idealClearDiameterMm"],
            "certus9770WidthMarginBeforeMountingMm": g["idealClearDiameterMm"] - g["certus9770WidthMm"],
        },
        "energy": {
            "nominalCellEnergyWh": round(nominal_wh, 3),
            "hypotheticalLoadSideEnergyWh": round(load_side_wh, 3),
            "hypotheticalApEnergyWh": round(ap_wh, 3),
            "hypotheticalOtherLoadsMaxAverageW": round(available_idle_w, 3),
            "cm5IdleTypicalW": e["cm5IdleTypicalW"],
            "continuousCm5IdleExceedsAvailableOtherLoad": e["cm5IdleTypicalW"] > available_idle_w,
            "twoSeriesBatteryRangeV": [e["twoSeriesCellVoltageMinV"], e["twoSeriesCellVoltageMaxV"]],
            "certus9770InputRangeV": [e["certus9770InputMinV"], e["certus9770InputMaxV"]],
            "certus9770RequiresBoostFromTwoSeriesCells": e["twoSeriesCellVoltageMaxV"] < e["certus9770InputMinV"],
        },
        "mass": {
            "hypothetical9770PartialMassG": round(
                m["shellSidewallHypothesisG"]
                + e["m65aCellMaxMassG"] * e["cellCount"]
                + m["rejectedFourPanelOpticalHypothesisG"]
                + m["certus9770ModuleG"], 3
            ),
            "hypothetical9523BoardPartialMassG": round(
                m["shellSidewallHypothesisG"]
                + e["m65aCellMaxMassG"] * e["cellCount"]
                + m["rejectedFourPanelOpticalHypothesisG"]
                + m["planet9523BoardCurrentListingG"], 3
            ),
            "comparisonTargetG": m["comparisonTargetG"],
            "warning": "Includes rejected optical mass proxy, excludes many required parts; never a BOM or mass pass.",
        },
        "blockingUnknowns": [
            "protected battery pack length, tab and insulation", "chosen modem TX peak current",
            "regulator thermal and transient design", "antenna matching and legal RF exposure",
            "actual optical engine, drivers and view zone", "all-state closed enclosure CAD",
            "US device-specific satellite IP and Wi-Fi redistribution contract",
        ],
    }


def main() -> None:
    data = json.loads((ROOT / "assumptions.json").read_text(encoding="utf-8"))
    result = calculate(data)
    (ROOT / "screen-results.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
