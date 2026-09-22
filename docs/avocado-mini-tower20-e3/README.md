# avocadoMini Tower20 E3 product baseline

2026-09-22 / supplied E3 design package / Material Invention and avocadoMini / `ROCK`

## Current product form

Tower20 E3 replaces the former E1 and E2 single-enclosure directions and the tall telescoping P0.2 tower direction as the current product design baseline.

- four identical silver Motion Tower input devices;
- each tower is fixed-height and no more than 200 mm from the installation surface to its top;
- the three visible body sections are cosmetic boundaries, not a motorized extension mechanism;
- one separate low Edge Hub performs game, capture, fusion, voice, storage, policy and approved AI work;
- TV, controller and suitable AC adapter remain external;
- local installed games must not require an internet round trip for input, simulation or rendering.

The proposed E3 dimensions are design inputs rather than released manufacturing dimensions: tower body outer diameter 44 mm, base diameter 96 mm, four-foot contact circle 200 mm and Hub envelope 240 × 200 × 70 mm. The provisional tower stack is 199.50 ± 0.45 mm with an arithmetic maximum of 199.95 mm. Its remaining 0.05 mm margin is not a production acceptance result.

## Sensor and Hub architecture

Each tower contains one Basler dart daA1600-60um S-mount monochrome camera candidate. The two additional dark exterior windows are reserved and do not represent two more working cameras. The Hub gathers four USB 3 streams through a device support package and keeps capture, fusion, voice, game, broker, asset and adapter boundaries separate.

The current center-ROI game candidate is 1280 × 800 mono8 at 60 fps for four cameras. The calculation gives 2.260992 Gbps including a 15 percent planning margin and a serial latency budget of about 95.7 ms. This is a planning result only. Full-frame 1600 × 1200 at 30 fps misses the 100 ms latency goal, while full-frame 60 fps exceeds the provisional shared USB budget. The real USB controller topology, camera ROI support, exposure, trigger, calibration, inference and display timing remain untested.

The Hub candidate set includes ASRock Industrial 4X4-AI350, 32 GB DDR5, 1 TB NVMe and a Seeed ReSpeaker XVF3800 USB four-microphone array. The proposed DC system budget is 116 W before final component allocation. A 160 W-class supply passes only the provisional 80 percent arithmetic allocation. Board revision, cooling, airflow, acoustics, power protection, connectors and driver support remain unapproved.

## RockstarOS behavior

RockstarOS starts camera and microphone input logically off. Releasing a physical switch does not grant capture consent. Four registered tower identities, capture generation, time evidence, calibration revision and tracking quality must be valid before body input can commit a game action. Unknown time evidence, partial disconnection or lost tracking disables commit instead of replaying queued movement later.

Initial voice is push-to-talk Japanese recognition evaluated locally with whisper.cpp candidates. Voice can select finite game modes and assist navigation, but cannot grant capture, purchase, publish, device-control or safety authority. Local and external AI remain provider adapters behind the same owner, purpose, rights, cost and receipt boundaries.

## Known E3 gaps

- No physical prototype, camera test, ASR test or integrated game test has been completed.
- A 5 N upper cable pull exceeds the current tip model; low cable routing improves tipping but does not solve sliding on the provisional friction assumption.
- A 4 W tower heat load does not meet the provisional surface-temperature screen under all assumed natural-convection cases.
- The low 184.5 mm optical center does not prove full-body or full-room coverage. Four corner towers do not give four views at every point.
- Camera timestamp authenticity, external trigger wiring, privacy cutoff circuitry and device authenticity remain open.
- Hub CAD, airflow, fan noise, production power, signed recovery, rollback and manufacturing drawings remain open.
- GTA compatibility, Rockstar Games partnership scope, satellite reception and a general RockstarOS installer are outside the evidence supplied by E3.

## Public presentation

The public product Site must show four short fixed-height Tower20 devices around a separate low Edge Hub. It must not show a 20 cm single-box console, a human-height telescoping tower, three active cameras per tower or a lower sensor as the current E3 product. Cyan sensor light is a visual status effect. Images remain concept renders rather than photographs of production hardware.

The planned price remains ¥160,000 plus tax for one tower and ¥410,000 plus tax for the four-tower and Edge Hub system. Payments stay closed until seller information, shipping, delivery, cancellation and refund terms, final totals and approved production evidence are complete.

## Source and acceptance boundary

The supplied `RockstarOS_Tower20_E3_OS_Design.pdf`, `avocadoMini_Tower20_E3_Hardware_Design.pdf` and matching DOCX are the design sources for this baseline. They are not copied into the public repository. Their document calculations and diagrams do not constitute electrical, mechanical, optical, thermal, software or manufacturing acceptance.

The next acceptance package must fix the exact purchased revisions, finish mechanical and electrical CAD, close timing and calibration evidence, build the same integrated prototype and measure capture, voice, game, power, heat, acoustics, storage, update and recovery behavior on that hardware.
