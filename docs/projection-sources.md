# Afghanistan / Iraq projection provenance

The added values are published DCS map projection constants, not geographical
UTM-zone guesses. DCS mission `x` is northing; mission `y` is easting (world `z`).
The existing converter deliberately swaps `[x,y]` for proj4js and returns
`[latitude,longitude]` in WGS84. Both maps use transverse Mercator, `lat_0=0`,
scale `0.9996`, and metres.

## Pinned primary sources

- [dcs-retribution/pydcs Afghanistan](https://github.com/dcs-retribution/pydcs/blob/3a79b8edf923042a5b933feb64543da9e6bdfd37/dcs/terrain/afghanistan/projection.py)
- [dcs-retribution/pydcs Iraq](https://github.com/dcs-retribution/pydcs/blob/3a79b8edf923042a5b933feb64543da9e6bdfd37/dcs/terrain/iraq/projection.py)
- [pydcs DCS export/calibration procedure](https://github.com/dcs-retribution/pydcs/blob/3a79b8edf923042a5b933feb64543da9e6bdfd37/tools/export_map_projection.py): exports DCS's origin and airports, derives offsets, and checks airport residuals
- [VEAF independently calibrated map table](https://github.com/VEAF/dcs-maps/blob/6921ea11d2119f6ac581e49348c98092161d0c96/src/dcs_coords/data/maps.yaml)
- [VEAF DCS grid calibration procedure](https://github.com/VEAF/dcs-maps/blob/6921ea11d2119f6ac581e49348c98092161d0c96/docs/adding-a-map.md)

The two published tables agree to within 0.000003 metres on both offsets.
Afghanistan: central meridian 63°, false easting −300150 m, false northing
−3759657 m. Iraq: 45°, +72290 m, −3680057 m. `coordinates.ts` retains the full
published pydcs precision to follow the existing map table's convention.

## Regression controls and limits

Eight fixed controls in `coordinates.test.ts` cover the origin and three off-origin
points per map, including negative coordinates. Expected lat/lon values were
calculated independently of proj4js using the WGS84 inverse transverse-Mercator
series (Snyder, USGS Professional Paper 1395) with VEAF's calibrated constants.
The forward-control tolerance is 0.000003° and reverse tolerance is 0.5 m to
accommodate truncated-series error. Separate round trips require <0.001 m.
These catch swapped axes, sign, scale and false-origin errors. Reproduce the fixed
controls with `python3 tools/generate_projection_controls.py` (standard library only).

These are independently calculated projection controls, **not newly collected
DCS in-game ground-truth samples**. No proprietary DCS installation or mission
corpus was available in this validation environment. Before release, a DCS owner
can additionally compare known airports and route points in the Mission Editor.

The numerical reference data above is attributed to pydcs (LGPL-3.0) and
VEAF/dcs-maps (MIT). No source code or proprietary game assets were copied.

This change adds coordinate projections only. The existing normalizer still warns
when these maps lack a mission-supplied `utcOffset`; no DCS timezone or magnetic
variation defaults were guessed as part of coordinate support.
