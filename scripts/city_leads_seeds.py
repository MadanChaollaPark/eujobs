#!/usr/bin/env python3
"""Merge city_leads.csv employers into city_employers.json. Vacancy/source URLs there are third-party job
boards and are NEVER fetched or stored; employer websites come from the employer's own email domain or a
Transparency Register name match. UK MP-office roles are skipped."""
import csv, json, re, sys, unicodedata
from urllib.parse import urlparse
sys.path.insert(0, "/srv/eujobs/importer"); import employer_jobs as ej
BOARDS = ("charityjobs.ie","activelink.ie","jobbsafari","arbetsformedlingen","unjobs.org","humanityhub.org","politjobs.com","w4mpjobs.org","unjobnet.org","coordinationsud.org","goodjobs.eu","makesense.org","talents4good.org","linkedin.com","indeed.","stepstone","glassdoor")
FREEMAIL = ("gmail.com","outlook.com","hotmail.com","yahoo.com","gmx.de","web.de","parliament.uk")
SL = {n.lower(): s for s, n, c, rx in ej.CITIES}
fold = lambda s: re.sub(r"[^a-z0-9]+", " ", unicodedata.normalize("NFKD", s or "").encode("ascii","ignore").decode().lower()).strip()
tr = {}
for e in json.load(open(ej.RES))["lobbyingEntities"]:
    w = ej.norm_site(e.get("webSiteURL") or e.get("website"))
    if w:
        for n in (e.get("name"), e.get("originalName"), e.get("acronym")):
            if n and len(fold(n)) > 3: tr.setdefault(fold(n), (w, e.get("registrationCategory","")))
cs = json.load(open(ej.CITY_SEEDS)); have = {ej.regdom(urlparse(c["site"]).hostname) for c in cs}
added, skipped = [], []
OUTDOMS = sys.argv[2] if len(sys.argv) > 2 else None
CITY_ONLY = set(sys.argv[3].split(",")) if len(sys.argv) > 3 else None
for r in csv.DictReader(open(sys.argv[1] if len(sys.argv) > 1 else "/srv/eujobs/importer/city_leads.csv")):
    org = r["org"].strip(); city = SL.get(r["city"].strip().lower())
    if CITY_ONLY and city not in CITY_ONLY: continue
    if re.search(r"\bMP\b", org) or "parliament.uk" in r["email"]: skipped.append((org, "UK MP office")); continue
    site = None; cat = ""
    for em in re.split(r"[;,\s]+", r["email"]):
        d = em.split("@")[-1].strip().lower() if "@" in em else ""
        if d and not d.endswith(FREEMAIL) and "." in d: site = ej.norm_site(d); break
    if not site:
        v = r["vacancy_url"]; h = (urlparse(v).hostname or "").lower()
        if h and not any(b in h for b in BOARDS) and not ej.is_comp(v): site = ej.norm_site(v)
    if not site and fold(org) in tr: site, cat = tr[fold(org)]
    if not site: skipped.append((org, "no employer website found (only job-board URL)")); continue
    if ej.is_comp(site) or any(b in site for b in BOARDS): skipped.append((org, "board URL")); continue
    d = ej.regdom(urlparse(site).hostname)
    if OUTDOMS: open(OUTDOMS, "a").write(d + "\n")
    if d in have: continue
    have.add(d); c = {"name": org, "site": site, "city": city, "cat": cat, "source": "city_leads.csv", "careers": []}
    cs.append(c); added.append(c)
json.dump(cs, open(ej.CITY_SEEDS, "w"), indent=0, ensure_ascii=False)
print(json.dumps({"added": len(added), "skipped": len(skipped), "addedOrgs": [(c["name"], c["site"], c["city"]) for c in added], "skippedOrgs": skipped}, ensure_ascii=False, indent=0))
