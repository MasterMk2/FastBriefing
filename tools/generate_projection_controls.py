"""Reproduce fixed projection controls without proj4js or external dependencies.

Inverse transverse-Mercator series: Snyder, USGS Professional Paper 1395.
Use VEAF's separately calibrated parameters; see docs/projection-sources.md.
This generates mathematical controls, not new DCS in-game observations.
"""
import math

A = 6378137.0
F = 1 / 298.257223563
E2 = F * (2 - F)
EP2 = E2 / (1 - E2)
K = 0.9996
PARAMETERS = [
    ("Afghanistan", 63, -300150.00000261003, -3759657.000001035),
    ("Iraq", 45, 72290.0000013377, -3680056.999997638),
]

for theatre, meridian, false_easting, false_northing in PARAMETERS:
    for x, y in [(0, 0), (100000, 50000), (-200000, -150000), (250000, 200000)]:
        mu = (x - false_northing) / K / (A * (1 - E2/4 - 3*E2**2/64 - 5*E2**3/256))
        e1 = (1 - math.sqrt(1-E2)) / (1 + math.sqrt(1-E2))
        phi = (mu + (3*e1/2 - 27*e1**3/32)*math.sin(2*mu)
               + (21*e1**2/16 - 55*e1**4/32)*math.sin(4*mu)
               + 151*e1**3/96*math.sin(6*mu) + 1097*e1**4/512*math.sin(8*mu))
        n = A / math.sqrt(1-E2*math.sin(phi)**2)
        r = A*(1-E2) / (1-E2*math.sin(phi)**2)**1.5
        t, c = math.tan(phi)**2, EP2*math.cos(phi)**2
        d = (y-false_easting) / (n*K)
        lat = phi - n*math.tan(phi)/r * (
            d**2/2 - (5+3*t+10*c-4*c*c-9*EP2)*d**4/24
            + (61+90*t+298*c+45*t*t-252*EP2-3*c*c)*d**6/720)
        lon = math.radians(meridian) + (
            d - (1+2*t+c)*d**3/6 + (5-2*c+28*t-3*c*c+8*EP2+24*t*t)*d**5/120
        ) / math.cos(phi)
        print(f"['{theatre}', {x}, {y}, {math.degrees(lat):.8f}, {math.degrees(lon):.8f}],")
