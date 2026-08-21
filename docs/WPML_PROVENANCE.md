# WPML exporter provenance

## Purpose

This document records the source basis for the NV Drone Mapping WPML exporter so the implementation can be audited independently of third-party source code.

## Implementation rule

`client/src/dji/kmzExporter.ts` is implemented from:

1. DJI's published WPML specification and field definitions.
2. Independently published excerpts/observations of DJI Fly-generated consumer waypoint files, used only to identify consumer-format metadata that differs from the public enterprise-oriented examples.
3. NV Drone Mapping's own mission model and planner output.

The exporter must not import, copy, translate, or mechanically port third-party WPML writer source code.

## Primary specification sources

DJI WPML overview:
- https://developer.dji.com/doc/cloud-api-tutorial/en/api-reference/dji-wpml/overview.html

DJI `template.kml` specification:
- https://developer.dji.com/doc/cloud-api-tutorial/en/api-reference/dji-wpml/template-kml.html

DJI `waylines.wpml` specification:
- https://developer.dji.com/doc/cloud-api-tutorial/en/api-reference/dji-wpml/waylines-wpml.html

DJI common elements/actions:
- https://developer.dji.com/doc/cloud-api-tutorial/en/api-reference/dji-wpml/common-element.html

The public DJI specification documents, among other fields used here:
- KMZ packaging with `wpmz/template.kml` and `wpmz/waylines.wpml`;
- waypoint templates;
- WGS84 coordinates;
- `relativeToStartPoint` height mode;
- finish and RC-loss actions;
- waypoint heading and turn parameters;
- `reachPoint` action triggers;
- `takePhoto` and `gimbalRotate` actions;
- `sequence` action-group execution;
- `toPointAndStopWithDiscontinuityCurvature` for straight stop-at-point waypoint behavior.

## DJI Fly consumer compatibility observations

DJI's public WPML examples currently use:

`http://www.dji.com/wpmz/1.0.2`

Public excerpts from DJI Fly-generated waypoint files have also documented the consumer namespace:

`http://www.uav.com/wpmz/1.0.2`

Independent public observations used for this compatibility fact include:

- DJI Mobile SDK Android V5 issue #791, which quotes DJI Fly-generated mission metadata for a Mini 4 Pro: https://github.com/dji-sdk/Mobile-SDK-Android-V5/issues/791
- DJI Pilots community excerpt of a Mini 4 Pro waypoint KMZ: https://dji-pilots.com/threads/modifying-waypoints-to-help-avoid-collisions.649/
- MavicPilots discussion showing native DJI waypoint mission metadata and `droneEnumValue=68`: https://mavicpilots.com/threads/where-are-waypoints-stored.145212/

Because consumer DJI Fly behavior is not fully specified by DJI's public WPML documentation, NV Drone Mapping exposes the format as a distinct `dji-fly-consumer` profile rather than presenting it as part of the official DJI WPML contract.

## Current profiles

### `dji-standard`

Uses the namespace published by DJI:

`http://www.dji.com/wpmz/1.0.2`

### `dji-fly-consumer`

Uses the namespace independently observed in recent DJI Fly consumer mission files:

`http://www.uav.com/wpmz/1.0.2`

The consumer profile remains subject to firmware/DJI Fly changes and must be field-tested on the target aircraft before release.

## Mini 5 Pro model identifier

`droneEnumValue=68` remains configurable in the application. Public consumer mission evidence strongly establishes value 68 for the Mini 4 Pro and reports use of the same consumer waypoint identifier with current DJI Fly workflows. DJI does not currently publish a Mini 5 Pro consumer WPML enumeration in the public WPML product tables, so the value must not be represented as an official DJI guarantee.

Before commercial release for Mini 5 Pro, capture and archive at least one native DJI Fly waypoint mission created directly on the target Mini 5 Pro/RC2 combination and compare only the resulting data schema/values against the generated output.

## Commercial-release gate

The WPML module is considered source-provenance ready when all of the following are true:

- no copied/translated third-party writer implementation is present;
- exporter tests pass;
- generated XML is structurally valid;
- a generated mission loads in DJI Fly;
- a small open-area Mini 5 Pro acceptance flight succeeds;
- a native Mini 5 Pro DJI Fly mission sample is archived internally as compatibility evidence;
- dependency/license audit for the complete application is complete.

This document is engineering provenance documentation, not legal advice.
