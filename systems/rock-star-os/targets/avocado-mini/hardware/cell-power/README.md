# Mini 5V cell-power evaluation coupon

Purpose: develop source power switching against selected E0 image-source supply. This is a partial 5V circuit, not the Mini motherboard or qualified optical stop. Inputs: external current-limited regulated5V and 3V3 control AFTER an external NC stop. Output: switched5V for dummy load during unqualified stage. No software/firmware or settings saved. Default ON pull-down removes request on open wire; MOSFET faults and backfeeding remain unhandled.

`python3 systems/rock-star-os/targets/avocado-mini/hardware/cell-power/generate.py --output /new/cad` generates editable schematic, board with pads/nets/tracks/ground zone and libraries. `cad/` is the current generated source, not Gerber/DFM release. No ERC/DRC or real board acceptance was run. Source BOM has unresolved exact passives/connectors and land/stencil/assembly review. Do not fabricate or connect the optical source from this status.

The IC is TPS22965DSGR (not Q1): pin1/2 VIN5, pin3 ON, pin4 VBIAS5, pin5 GND, pin6 CT, pin7/8 VOUT, pad9 GND. Source: https://www.ti.com/lit/ds/symlink/tps22965.pdf . R1 1k/R2 10k gives nominal3.0V ON from3.3V. C1 10uF/C2 1uF/C3 1nF are evaluation candidates. This is not a6A board rating. At hypothetical2A and Ron25mOhm, switch loss0.10W. Thermal/inrush need actual load and layout measurements.

No current limit, reverse isolation, watchdog or independent safety cutoff is present. HDMI/USB can supply alternate current paths; switch-off has not been shown to stop light. External stop contacts, hardware faults, residual emission and actual peak need acceptance before optical connection. Owner chooses procurement and adoption; ROCK owns source; EXTERNAL supplies parts; JOINT owns measured acceptance. Existing price system unchanged.
