# Commercial readiness status

## Current state

The application is not yet cleared for commercial release.

### Completed in this hardening step

- WPML exporter rewritten as an independent implementation.
- Public DJI WPML specification separated from DJI Fly consumer compatibility behavior.
- Source/provenance basis documented in `docs/WPML_PROVENANCE.md`.
- Exporter tests cover both `dji-standard` and `dji-fly-consumer` profiles.
- Consumer-format assumptions remain explicit instead of being presented as official DJI guarantees.

## Release blockers

1. **Physical Mini 5 Pro acceptance test**
   - Create a small mission in an open, obstacle-free area.
   - Load generated KMZ in DJI Fly.
   - Verify route, altitude, speed, RTH, gimbal and photo actions.
   - Fly a short controlled mission.

2. **Native DJI Fly reference sample**
   - Create and save a native waypoint mission using the target Mini 5 Pro + DJI Fly/RC2 combination.
   - Archive the resulting KMZ internally as compatibility evidence.
   - Compare schema/values, not third-party implementation source code.

3. **Dependency/license audit**
   - Inventory all production dependencies.
   - Record SPDX/license and attribution requirements.
   - Produce `THIRD_PARTY_NOTICES` for distributions where required.

4. **Product licensing decision**
   - Decide whether NV Drone Mapping will remain open source or become proprietary/commercial source.
   - Align root license, `package.json`, repository visibility and distribution terms.

5. **Brand/trademark review**
   - Keep NV Drone Mapping as the primary product mark.
   - Use DJI names only to describe compatibility.
   - Do not imply DJI sponsorship, certification or endorsement.

## Release rule

Do not advertise the application as fully validated for DJI Mini 5 Pro until blocker 1 and blocker 2 are completed.

This file is an engineering release checklist, not legal advice.
