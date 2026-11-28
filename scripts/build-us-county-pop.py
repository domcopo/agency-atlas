"""Builds src/lib/audit/us-county-pop.json: each county's population, keyed like
us-place-coords.json (state code → county name), so an audit can add up the people who live
within its radius.

Source: US Census Bureau, Vintage 2024 county population estimates (public, no key):
https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/counties/totals/co-est2024-alldata.csv
Column POPESTIMATE2024 (July 1, 2024). Only counties that also have a map position are kept;
"US" holds the national total of all counties. Numbers only, no personal data.

Usage: python3 -I scripts/build-us-county-pop.py <co-est2024-alldata.csv> <us-place-coords.json> <out.json>
"""
import csv, json, sys

src, coords_path, out = sys.argv[1:4]
coords = json.load(open(coords_path, encoding="utf-8"))
# State names → codes, from the coords file's own codes (the Census file names states in full).
NAMES = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR", "California": "CA", "Colorado": "CO",
    "Connecticut": "CT", "Delaware": "DE", "District of Columbia": "DC", "Florida": "FL", "Georgia": "GA",
    "Hawaii": "HI", "Idaho": "ID", "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
    "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD", "Massachusetts": "MA",
    "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS", "Missouri": "MO", "Montana": "MT",
    "Nebraska": "NE", "Nevada": "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM",
    "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
    "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD",
    "Tennessee": "TN", "Texas": "TX", "Utah": "UT", "Vermont": "VT", "Virginia": "VA", "Washington": "WA",
    "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY",
}
result, total, kept, missed = {}, 0, 0, []
with open(src, encoding="latin-1", newline="") as f:
    for r in csv.DictReader(f):
        if r["SUMLEV"] != "050":
            continue
        pop = int(r["POPESTIMATE2024"])
        total += pop
        st = NAMES.get(r["STNAME"])
        name = r["CTYNAME"]
        if st and name in coords.get(st, {}):
            result.setdefault(st, {})[name] = pop
            kept += 1
        else:
            missed.append(f"{r['STNAME']}: {name}")
result["US"] = {"total": total}
json.dump(result, open(out, "w", encoding="utf-8"), separators=(",", ":"), sort_keys=True)
print(f"kept {kept} counties, {len(missed)} without a map position (left out); US total {total:,}")
print("examples left out:", missed[:8])
