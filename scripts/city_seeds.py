#!/usr/bin/env python3
"""Build city_employers.json: Transparency Register orgs in the 20 target cities with a website.
Priority: NGOs, trade/business associations, think tanks/academic, consultancies; then others. Cap 3000."""
import json, re, sys, unicodedata
from urllib.parse import urlparse
sys.path.insert(0, "/srv/eujobs/importer")
import employer_jobs as ej
CAP = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
def fold(s): return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower().strip()
ALIASES = {"london": ["london"], "berlin": ["berlin"], "paris": ["paris"], "geneva": ["geneva", "geneve", "genf", "grand-saconnex", "le grand-saconnex"],
  "luxembourg": ["luxembourg", "luxemburg"], "strasbourg": ["strasbourg"], "the-hague": ["the hague", "den haag", "'s-gravenhage", "s-gravenhage", "la haye"],
  "vienna": ["vienna", "wien"], "madrid": ["madrid"], "rome": ["rome", "roma"], "warsaw": ["warsaw", "warszawa"], "copenhagen": ["copenhagen", "kobenhavn", "koebenhavn"],
  "stockholm": ["stockholm"], "dublin": ["dublin"], "lisbon": ["lisbon", "lisboa"], "prague": ["prague", "praha"], "budapest": ["budapest"],
  "athens": ["athens", "athina", "athens"], "amsterdam": ["amsterdam"], "milan": ["milan", "milano"]}
A = {a: k for k, v in ALIASES.items() for a in v}
def city_of(c):
    f = fold(c); f = re.sub(r"\s+\d.*$|,.*$", "", f).strip()
    f = re.sub(r"^(\d{2,5}[- ]?)", "", f).strip()
    return A.get(f)
PRI = [(0, r"non-governmental"), (1, r"trade and business"), (2, r"think tank|consultanc"), (3, r"academic|law firm"), (4, r"trade unions|professional assoc"), (5, r"other organisations|public authorities"), (6, r"compan")]
def pri(cat):
    for p, rx in PRI:
        if re.search(rx, cat or "", re.I): return p
    return 9
le = json.load(open(ej.RES))["lobbyingEntities"]
existing = {regdom for regdom in (ej.regdom(urlparse(s["site"]).hostname) for s in ej.seeds() if s["kind"] != "city")}
cands = {}
for e in le:
    sl = city_of(e.get("city"))
    if not sl: continue
    site = ej.norm_site(e.get("webSiteURL") or e.get("website"))
    if not site: continue
    d = ej.regdom(urlparse(site).hostname)
    if d in existing or d in ("google.com", "linkedin.com", "facebook.com", "europa.eu", "wixsite.com", "github.io", "blogspot.com"): continue
    if pri(e.get("registrationCategory")) >= 7: continue  # self-employed individuals etc.
    c = {"name": (e.get("name") or e.get("originalName") or "").strip(), "site": site, "city": sl, "cat": e.get("registrationCategory", ""),
         "trId": e.get("identificationCode"), "careers": []}
    if c["name"] and (d not in cands or pri(c["cat"]) < pri(cands[d]["cat"])): cands[d] = c
# interleave the four priority groups so NGOs don't crowd out associations/think tanks/consultancies
groups = {}
for c in sorted(cands.values(), key=lambda c: c["name"].lower()): groups.setdefault(min(pri(c["cat"]), 4) if pri(c["cat"]) < 4 else 9, []).append(c)
quota = {0: 1300, 1: 1000, 2: 700}
lst = []
for g in (0, 1, 2): lst += groups.get(g, [])[:quota[g]]
for g in (0, 1, 2, 3, 9):
    rest = [c for c in groups.get(g, []) if c not in lst]
    lst += rest[:max(0, CAP - len(lst))]
lst = lst[:CAP]
json.dump(lst, open(ej.CITY_SEEDS, "w"), indent=0, ensure_ascii=False)
import collections
print(len(cands), "candidates;", len(lst), "written")
print(collections.Counter(c["city"] for c in lst).most_common())
print(collections.Counter(c["cat"] for c in lst).most_common())
