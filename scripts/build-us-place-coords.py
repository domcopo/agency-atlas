"""Builds src/lib/audit/us-place-coords.json: a map position for each place in us-places.json.

Source: US Census Bureau 2024 Gazetteer files (public): places, county subdivisions
(townships) and counties. Census names carry a type word ("Youngstown city",
"Austintown CDP", "Austintown township"); it is dropped to match Google's names. Output:
{ "OH": { "Austintown": [41.102, -80.765], ... }, ... } rounded to 3 decimals (~100 m).

Usage: python3 -I scripts/build-us-place-coords.py <us-places.json> <place.txt> <cousubs.txt> <counties.txt> <out.json>
"""
import csv, json, re, sys

places_json, place_txt, cousub_txt, county_txt, out = sys.argv[1:6]
google = json.load(open(places_json, encoding="utf-8"))

def key(name):
    k = name.lower()
    k = re.sub(r"\bst\.?\s", "saint ", k)
    k = re.sub(r"\bmt\.?\s", "mount ", k)
    k = re.sub(r"\bft\.?\s", "fort ", k)
    k = re.sub(r"[^a-z0-9 ]", "", k)
    return re.sub(r"\s+", " ", k).strip()

def rows(path):
    with open(path, encoding="latin-1", newline="") as f:
        r = csv.reader(f, delimiter="\t")
        head = [h.strip() for h in next(r)]
        for row in r:
            yield dict(zip(head, [c.strip() for c in row]))

def base(name):
    n = re.sub(r"\s*\((balance|historical)\)$", "", name)
    toks = n.split(" ")
    while len(toks) > 1 and (toks[-1] == "CDP" or toks[-1].islower()):
        toks.pop()
    return " ".join(toks)

found = {}  # state -> key -> (lat, lng, land)
def add(state, name, lat, lng, land):
    k = key(name)
    if not k:
        return
    cur = found.setdefault(state, {}).get(k)
    if cur is None or land > cur[2]:
        found[state][k] = (lat, lng, land)

for r in rows(place_txt):
    add(r["USPS"], base(r["NAME"]), float(r["INTPTLAT"]), float(r["INTPTLONG"]), float(r.get("ALAND") or 0))
for r in rows(cousub_txt):
    name = r["NAME"]
    if name.endswith(" township"):
        plain = name[: -len(" township")]
        add(r["USPS"], plain + " Township", float(r["INTPTLAT"]), float(r["INTPTLONG"]), float(r.get("ALAND") or 0))
        add(r["USPS"], plain, float(r["INTPTLAT"]), float(r["INTPTLONG"]), -1)  # e.g. Google's "Boardman"; a real city of that name wins
    else:
        add(r["USPS"], base(name), float(r["INTPTLAT"]), float(r["INTPTLONG"]), 0)  # New England towns etc.; places win
for r in rows(county_txt):
    add(r["USPS"], r["NAME"], float(r["INTPTLAT"]), float(r["INTPTLONG"].strip()), float(r.get("ALAND") or 0) * 10)

result, total, hit = {}, 0, 0
for state, lists in google.items():
    out_state = {}
    for name in lists["c"] + lists["k"]:
        total += 1
        f = found.get(state, {}).get(key(name))
        if f:
            hit += 1
            out_state[name] = [round(f[0], 3), round(f[1], 3)]
    result[state] = out_state

with open(out, "w", encoding="utf-8") as fh:
    json.dump(result, fh, separators=(",", ":"), ensure_ascii=False)
print(f"positions for {hit} of {total} Google places ({hit * 100 // max(total, 1)}%)")
oh = result["OH"]
for n in ["Austintown", "Youngstown", "Boardman", "Canfield", "Warren", "Niles", "Austintown Township", "Mahoning County"]:
    print(n, oh.get(n))
print("PA Sharon", result["PA"].get("Sharon"), "Hermitage", result["PA"].get("Hermitage"))
print("CO Denver", result["CO"].get("Denver"), "Thornton", result["CO"].get("Thornton"))
