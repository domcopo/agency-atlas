"""Builds src/lib/audit/us-places.json from DataForSEO's free SERP locations CSV.

Keeps only US rows of type City or County whose name is exactly "<Place>,<State>,United States"
(neighborhoods and nested names are left out). Output: { "OH": { "c": [cities...], "k": [counties...] }, ... }
sorted, names only. Usage: python3 -I build_places.py <locations.csv> <out.json>
"""
import csv, json, sys

STATES = {
 "AL":"Alabama","AK":"Alaska","AZ":"Arizona","AR":"Arkansas","CA":"California","CO":"Colorado","CT":"Connecticut","DE":"Delaware",
 "DC":"District of Columbia","FL":"Florida","GA":"Georgia","HI":"Hawaii","ID":"Idaho","IL":"Illinois","IN":"Indiana","IA":"Iowa",
 "KS":"Kansas","KY":"Kentucky","LA":"Louisiana","ME":"Maine","MD":"Maryland","MA":"Massachusetts","MI":"Michigan","MN":"Minnesota",
 "MS":"Mississippi","MO":"Missouri","MT":"Montana","NE":"Nebraska","NV":"Nevada","NH":"New Hampshire","NJ":"New Jersey","NM":"New Mexico",
 "NY":"New York","NC":"North Carolina","ND":"North Dakota","OH":"Ohio","OK":"Oklahoma","OR":"Oregon","PA":"Pennsylvania","RI":"Rhode Island",
 "SC":"South Carolina","SD":"South Dakota","TN":"Tennessee","TX":"Texas","UT":"Utah","VT":"Vermont","VA":"Virginia","WA":"Washington",
 "WV":"West Virginia","WI":"Wisconsin","WY":"Wyoming",
}
BY_NAME = {v: k for k, v in STATES.items()}

src, out = sys.argv[1], sys.argv[2]
places = {code: {"c": set(), "k": set()} for code in STATES}
types = {}
with open(src, newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        if row.get("country_iso_code") != "US":
            continue
        t = row.get("location_type", "")
        types[t] = types.get(t, 0) + 1
        if t not in ("City", "County", "Municipality"):
            continue
        parts = row.get("location_name", "").split(",")
        if len(parts) != 3 or parts[2] != "United States":
            continue
        name, state = parts[0].strip(), parts[1].strip()
        code = BY_NAME.get(state)
        if not code or not name or len(name) > 60 or any(ch in name for ch in '<>"\\{}'):
            continue
        places[code]["k" if t == "County" else "c"].add(name)

data = {code: {"c": sorted(v["c"]), "k": sorted(v["k"])} for code, v in places.items()}
with open(out, "w", encoding="utf-8") as f:
    json.dump(data, f, separators=(",", ":"), ensure_ascii=False)
print("types:", dict(sorted(types.items(), key=lambda x: -x[1])[:12]))
print("cities:", sum(len(v["c"]) for v in data.values()), "counties:", sum(len(v["k"]) for v in data.values()))
print("OH sample:", data["OH"]["c"][:5], data["OH"]["k"][:3], "Austintown" in data["OH"]["c"], "Mahoning County" in data["OH"]["k"])
print("CO:", "Westminster" in data["CO"]["c"], "Thornton" in data["CO"]["c"])
