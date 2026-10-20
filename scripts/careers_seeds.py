#!/usr/bin/env python3
"""Merge careers_urls.csv (city, org, careers_url) into city_employers.json; careers pages must be on the employer's own site."""
import csv, json, sys
from urllib.parse import urlparse
sys.path.insert(0, "/srv/eujobs/importer"); import employer_jobs as ej
BOARDS = ("unjobs.org","humanityhub.org","politjobs.com","w4mpjobs.org","unjobnet.org","charityjobs.ie","activelink.ie","goodjobs.eu","linkedin.com","indeed.","jobbsafari","arbetsformedlingen","stepstone","glassdoor")
SL = {n.lower(): s for s, n, c, rx in ej.CITIES}
cs = json.load(open(ej.CITY_SEEDS)); by = {ej.regdom(urlparse(c["site"]).hostname): c for c in cs}
added, updated, skipped, doms = 0, 0, [], []
for r in csv.DictReader(open(sys.argv[1])):
    u = (r.get("careers_url") or "").strip()
    if not u or ej.is_comp(u) or any(b in u for b in BOARDS): skipped.append((r["org"], "no own-site careers URL")); continue
    site = ej.norm_site(u); d = ej.regdom(urlparse(site).hostname); doms.append(d)
    if d in by:
        c = by[d]; c["careers"] = list(dict.fromkeys([u] + (c.get("careers") or [])))[:3]; updated += 1
    else:
        c = {"name": r["org"].strip(), "site": site, "city": SL.get(r["city"].strip().lower()), "cat": "", "source": "careers_urls.csv", "careers": [u]}
        cs.append(c); by[d] = c; added += 1
json.dump(cs, open(ej.CITY_SEEDS, "w"), indent=0, ensure_ascii=False)
open(sys.argv[2], "a").write("\n".join(doms) + "\n")
print(json.dumps({"added": added, "updated": updated, "skipped": skipped}, ensure_ascii=False))
