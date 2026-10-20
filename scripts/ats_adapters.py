"""Adapters for employer-owned applicant-tracking systems / public job feeds (EUJobs importer).
Every request goes through employer_jobs.get()/post(): EUJobsBot UA, robots.txt, per-host rate limit,
competitor hosts refused. Only systems run by the employer itself are configured in FEEDS."""
import json, re
from html import unescape
from urllib.parse import urljoin, unquote, urlparse

ej = None  # set by employer_jobs at import time (avoids a circular import)
MAX_PAGES = 15

# registered domain of the employer -> list of feeds
FEEDS = {
    "icrc.org": [{"type": "sf_sitemap", "url": "https://careers.icrc.org/sitemap.xml"}],
    "ilo.org": [{"type": "sf_sitemap", "url": "https://jobs.ilo.org/sitemap.xml"}],
    "theglobalfund.org": [{"type": "workday", "host": "https://theglobalfund.wd1.myworkdayjobs.com", "tenant": "theglobalfund", "site": "External"}],
    "iom.int": [{"type": "oracle_hcm", "host": "https://fa-evlj-saasfaprod1.fa.ocs.oraclecloud.com", "site": "CX_1001"}],
    "unfpa.org": [{"type": "oracle_hcm", "host": "https://estm.fa.em2.oraclecloud.com", "site": "CX_2003"}],
    "un.org": [{"type": "un_careers"}],
    "civiliansinconflict.org": [{"type": "bamboohr", "sub": "civilians"}],
    "preferredbynature.org": [{"type": "rss", "url": "https://career.preferredbynature.org/jobs.rss", "loc_tags": ["tt:location", "tt:city", "location"]}],
    "gichd.org": [{"type": "rss", "url": "https://www.gichd.org/about/work-with-us/job-opportunities/rss.xml", "fetch_items": True}],
    "drc.ngo": [{"type": "links", "url": "https://drc.ngo/en/jobs/", "pattern": r"/jobs/job\?id=\d+"}],
    "peopleinneed.net": [{"type": "links", "url": "https://www.peopleinneed.net/career", "pattern": r"/career/[a-z0-9-]+-\d+jo"}],
    "osce.org": [{"type": "links", "url": "https://vacancies.osce.org/", "pattern": r"/jobs/[a-z0-9-]+-\d+$"}],
    "avsi.org": [{"type": "links", "url": "https://www.avsi.org/it/lavora-con-noi", "pattern": r"/lavora-con-noi/posizioni-lavorative/[A-Za-z0-9-]+"}],
    "euspa.europa.eu": [{"type": "links", "url": "https://www.euspa.europa.eu/opportunities/careers", "pattern": r"vacancies\.euspa\.europa\.eu/Jobs/VacancyDetails/\d+"}],
}

def _items_xml(x, tag="item"):
    return re.findall(rf"<{tag}\b[^>]*>(.*?)</{tag}>", x, re.S)
def _tag(it, t):
    m = re.search(rf"<{re.escape(t)}\b[^>]*>(.*?)</{re.escape(t)}>", it, re.S)
    return unescape(re.sub(r"<!\[CDATA\[|\]\]>|<[^>]+>", " ", m.group(1))).strip() if m else ""

def _sf_sitemap(f):
    r = ej.get(f["url"]); out = []
    if not r: return out
    for loc in re.findall(r"<loc>([^<]+)</loc>", r[0]):
        loc = unescape(loc)
        m = re.search(r"/job/([^/]+)/\d+/?$", loc)
        if not m: continue
        slug = unquote(m.group(1)).replace("-", " ")
        head = re.split(r"\s\(|\s", slug, 1)[0]  # SuccessFactors puts the duty station first
        place = ej.detect_city(head)
        if not place: continue  # field postings / other duty stations are never fetched
        title = re.sub(r"^\S+\s(\([A-Z]{3}\)\s)?", "", slug)
        title = re.sub(r"\s\d{4,6}$|\s\(\d{6}\)", "", title).strip()
        page = ej.get(loc)
        if page:
            mt = re.search(r'<meta[^>]+property="og:title"[^>]+content="([^"]+)"', page[0]) or re.search(r"<h1[^>]*>(.*?)</h1>", page[0], re.S)
            if mt: title = re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", "", mt.group(1)))).strip() or title
            if re.search(r"no longer (available|accepting)|position has been filled", page[0], re.I): continue
        out.append(("feed", {"title": title, "loc": place[0], "url": loc}, loc))
    return out

def _workday(f):
    out, off = [], 0
    api = f"{f['host']}/wday/cxs/{f['tenant']}/{f['site']}/jobs"
    while off < 400:
        d = ej.post(api, {"limit": 20, "offset": off, "searchText": "", "appliedFacets": {}})
        if not d or not d.get("jobPostings"): break
        for j in d["jobPostings"]:
            out.append(("feed", {"title": j.get("title"), "loc": j.get("locationsText") or "", "url": f"{f['host']}/{f['site']}{j.get('externalPath', '')}"}, f["host"]))
        off += 20
        if off >= d.get("total", 0): break
    return out

def _oracle(f):
    out, off = [], 0
    while off < 1000:
        u = (f"{f['host']}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList"
             f"&finder=findReqs;siteNumber={f['site']},limit=100,offset={off},sortBy=POSTING_DATES_DESC")
        d = ej.get(u, True)
        reqs = ((d or {}).get("items") or [{}])[0].get("requisitionList") or []
        if not reqs: break
        for j in reqs:
            loc = " ".join(filter(None, [j.get("PrimaryLocation"), j.get("PrimaryLocationCountry")] + [(s or {}).get("Name", "") for s in j.get("secondaryLocations") or []]))
            out.append(("feed", {"title": j.get("Title"), "loc": loc, "url": f"{f['host']}/hcmUI/CandidateExperience/en/sites/{f['site']}/job/{j.get('Id')}", "deadline": None}, f["host"]))
        off += 100
    return out

def _un_careers(f):
    out, page = [], 0
    api = "https://careers.un.org/api/public/opening/jo/list/filteredV2/en"
    while page < 20:
        d = ej.post(api, {"filterConfig": {"keyword": ""}, "pagination": {"page": page, "itemPerPage": 100, "sortBy": "startDate", "sortDirection": -1}})
        lst = ((d or {}).get("data") or {}).get("list") or []
        if not lst: break
        for j in lst:
            locs = [(d or {}).get("description", "") for d in (j.get("dutyStation") or [])]
            dept = ((j.get("dept") or {}).get("name") or "").strip()
            out.append(("feed", {"title": j.get("postingTitle") or j.get("jobTitle"), "loc": " ".join(locs)[:400], "org": dept or None, "url": f"https://careers.un.org/jobSearchDescription/{j.get('jobId')}?language=en", "deadline": (j.get("endDate") or "")[:10] or None}, api))
        page += 1
    return out

def _bamboo(f):
    d = ej.get(f"https://{f['sub']}.bamboohr.com/careers/list", True) or {}
    return [("feed", {"title": j.get("jobOpeningName"), "loc": " ".join(filter(None, [(j.get("location") or {}).get("city"), (j.get("location") or {}).get("state")])),
             "url": f"https://{f['sub']}.bamboohr.com/careers/{j.get('id')}", "commitment": j.get("employmentStatusLabel")}, f"https://{f['sub']}.bamboohr.com/careers")
            for j in d.get("result", [])]

def _rss(f, seed):
    r = ej.get(f["url"]); out = []
    if not r: return out
    for it in _items_xml(r[0]):
        title, link = _tag(it, "title"), _tag(it, "link")
        if not link: continue
        if f.get("fetch_items"):
            p = ej.get(link)
            if not p: continue
            jps = ej.jsonld_jobs(p[0])
            if jps: out += [("jsonld", jp, p[1]) for jp in jps]; continue
            item = ej.html_job(p[0], title, seed.get("city"))
            if item: out.append(("html", item, p[1]))
        else:
            loc = " ".join(_tag(it, t) for t in f.get("loc_tags", []))
            out.append(("feed", {"title": title, "loc": loc, "url": link}, f["url"]))
    return out

def _links(f, seed):
    r = ej.get(f["url"]); out = []
    if not r: return out
    hrefs = []
    for href, text in ej.links(r[0], r[1]):
        if re.search(f["pattern"], href) and not ej.is_comp(href): hrefs.append((href, text))
    seen = set()
    for href, text in hrefs:
        if href in seen or len(seen) >= 60: continue
        seen.add(href)
        p = ej.get(href)
        if not p: continue
        jps = ej.jsonld_jobs(p[0])
        if jps: out += [("jsonld", jp, p[1]) for jp in jps]; continue
        item = ej.html_job(p[0], text, seed.get("city"))
        if item: out.append(("html", item, p[1]))
    return out

def feed_jobs(seed):
    dom = ej.regdom(urlparse(seed["site"]).hostname)
    out = []
    for f in FEEDS.get(dom, []):
        try:
            t = f["type"]
            out += (_sf_sitemap(f) if t == "sf_sitemap" else _workday(f) if t == "workday" else _oracle(f) if t == "oracle_hcm"
                    else _un_careers(f) if t == "un_careers" else _bamboo(f) if t == "bamboohr" else _rss(f, seed) if t == "rss" else _links(f, seed))
        except Exception as e:
            print(f"feed error {dom} {f['type']}: {e}", flush=True)
    return [x for x in out if x[1].get("title") or x[0] == "jsonld"]
