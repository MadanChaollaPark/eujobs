#!/usr/bin/env python3
"""EUJobs employer-careers importer.
Discovers current vacancies ONLY on employers' own careers pages / ATS feeds.
Competitor boards are never fetched or linked. Respects robots.txt, rate-limits per host.
Text stored is EUJobs' own short summary of structured facts, never copied job text."""
import argparse, csv, datetime as dt, hashlib, json, re, sqlite3, subprocess, sys, threading, time, uuid
import concurrent.futures as cf
from html import unescape
from urllib.parse import urljoin, urlparse
from urllib import robotparser
import requests
import ats_adapters

UA = "EUJobsBot/1.0 (+https://eujobs.co/about; careers-page indexer)"
COMPETITORS = ("eurobrussels.com", "brusselsjobs.com", "jobsin.brussels")
DB = "/srv/eujobs/db/eujobs.sqlite"
RES = "/srv/eujobs/db/resources.json"
LEADS = "/srv/eujobs/shared/leads.csv"
OUT = "/srv/eujobs/shared/imports/employer"
NOW = dt.datetime.now(dt.timezone.utc)
TIMEOUT = 12
HOST_DELAY = 1.5
CITY_SEEDS = "/srv/eujobs/importer/city_employers.json"
CHECKPOINT_DIR = "/srv/eujobs/shared/imports/employer/checkpoints"
# Target cities outside Brussels (slug, display, country, location regex incl. local-language names)
CITIES = [
    ("london", "London", "United Kingdom", r"\blondon\b"),
    ("berlin", "Berlin", "Germany", r"\bberlin\b"),
    ("paris", "Paris", "France", r"\bparis\b"),
    ("geneva", "Geneva", "Switzerland", r"\bgen[eè]v[ae]\b|\bgenf\b"),
    ("luxembourg", "Luxembourg", "Luxembourg", r"\bluxemb(?:o|ou)rg\b|\bluxemburg\b"),
    ("strasbourg", "Strasbourg", "France", r"\bstrasbourg\b|\bstra(?:ss|ß)burg\b"),
    ("the-hague", "The Hague", "Netherlands", r"\bthe hague\b|\bden haag\b|'s-gravenhage|\bla haye\b"),
    ("vienna", "Vienna", "Austria", r"\bvienna\b|\bwien\b"),
    ("madrid", "Madrid", "Spain", r"\bmadrid\b"),
    ("rome", "Rome", "Italy", r"\brome\b|\broma\b"),
    ("warsaw", "Warsaw", "Poland", r"\bwarsaw\b|\bwarszaw\w*|\bvarsovie\b"),
    ("copenhagen", "Copenhagen", "Denmark", r"\bcopenhagen\b|\bk(?:ø|o|oe)benhavn\b"),
    ("stockholm", "Stockholm", "Sweden", r"\bstockholms?\b"),
    ("dublin", "Dublin", "Ireland", r"\bdublin\b"),
    ("lisbon", "Lisbon", "Portugal", r"\blisbon\b|\blisboa\b|\blisbonne\b"),
    ("prague", "Prague", "Czechia", r"\bprague\b|\bpraha\b|\bpraze\b|\bpra[zž]sk\w*|\bprag\b"),
    ("budapest", "Budapest", "Hungary", r"\bbudapest\b"),
    ("athens", "Athens", "Greece", r"\bathens\b|\bathina\b|\bathen\b|αθήνα"),
    ("amsterdam", "Amsterdam", "Netherlands", r"\bamsterdam\b"),
    ("milan", "Milan", "Italy", r"\bmilan\b|\bmilano\b"),
]
CITY_RX = [(slug, name, country, re.compile(rx, re.I)) for slug, name, country, rx in CITIES]
def detect_city(loc, prefer=None):
    """Return (display, country) for Brussels or one of the target cities found in a location text."""
    hits = [(n, c, sl) for sl, n, c, rx in CITY_RX if rx.search(loc or "")]
    if prefer:
        for h in hits:
            if h[2] == prefer: return h[0], h[1]
    if re.search(r"brussel|bruxelles", loc or "", re.I): return "Brussels", "Belgium"
    if hits: return hits[0][0], hits[0][1]
    if BRU.search(loc or ""): return "Brussels", "Belgium"
    return None

def is_comp(u):
    h = (urlparse(u).hostname or "").lower()
    return any(h == c or h.endswith("." + c) for c in COMPETITORS)

_robots, _rlock, _last, _llock = {}, threading.Lock(), {}, threading.Lock()
S = requests.Session(); S.headers.update({"User-Agent": UA, "Accept-Language": "en"})

def allowed(url):
    p = urlparse(url); base = f"{p.scheme}://{p.netloc}"
    with _rlock:
        rp = _robots.get(base)
    if rp is None:
        rp = robotparser.RobotFileParser()
        try:
            r = S.get(base + "/robots.txt", timeout=TIMEOUT)
            rp.parse(r.text.splitlines() if r.status_code == 200 else [])
            if r.status_code in (401, 403): rp.parse(["User-agent: *", "Disallow: /"])
        except Exception:
            rp.parse([])
        with _rlock: _robots[base] = rp
    return rp.can_fetch(UA, url)

def get(url, as_json=False):
    if is_comp(url) or not url.startswith("http"): return None
    if not allowed(url): return None
    host = urlparse(url).netloc
    with _llock:
        wait = _last.get(host, 0) + HOST_DELAY - time.time()
        _last[host] = max(time.time(), _last.get(host, 0) + HOST_DELAY)
    if wait > 0: time.sleep(wait)
    try:
        r = S.get(url, timeout=TIMEOUT, allow_redirects=True)
        if r.status_code != 200 or is_comp(r.url): return None
        if "charset" not in r.headers.get("content-type", "").lower(): r.encoding = "utf-8"
        if as_json: return r.json()
        if "html" not in r.headers.get("content-type", "") and "xml" not in r.headers.get("content-type", ""): return None
        return r.text[:3_000_000], r.url
    except Exception:
        return None

def post(url, payload):
    """JSON POST for employer ATS search APIs (Workday, UN Careers): same robots/rate/competitor rules as get()."""
    if is_comp(url) or not url.startswith("http") or not allowed(url): return None
    host = urlparse(url).netloc
    with _llock:
        wait = _last.get(host, 0) + HOST_DELAY - time.time()
        _last[host] = max(time.time(), _last.get(host, 0) + HOST_DELAY)
    if wait > 0: time.sleep(wait)
    try:
        r = S.post(url, json=payload, timeout=TIMEOUT)
        if r.status_code != 200 or is_comp(r.url): return None
        return r.json()
    except Exception:
        return None

def norm_site(u):
    if not u: return None
    u = u.strip()
    if not u.startswith("http"): u = "https://" + u.lstrip("/")
    p = urlparse(u)
    if not p.hostname or is_comp(u): return None
    return f"https://{p.hostname}/"

def regdom(h):
    parts = (h or "").lower().split(".")
    if parts and parts[0] == "www": parts = parts[1:]
    return ".".join(parts[-3:]) if len(parts) > 2 and parts[-2] in ("co", "org", "ac", "europa") else ".".join(parts[-2:])

# ---------- seeds ----------
def seeds():
    out = {}
    def add(name, site, kind, cat=""):
        s = norm_site(site)
        if not s or not name: return
        k = regdom(urlparse(s).hostname)
        if k in ("google.com", "linkedin.com", "drive.google.com", "europa.eu"): return
        out.setdefault(k, {"name": name.strip()[:120], "site": s, "kind": kind, "cat": cat})
    try:
        for r in csv.DictReader(open(LEADS)):
            add(r["company"], r.get("company_website"), "lead", r.get("org_type", ""))
    except FileNotFoundError: pass
    db = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    for org, url in db.execute("select organization,url from listings where kind='job' and url is not null"):
        h = urlparse(url).hostname or ""
        if not any(a in h for a in ("greenhouse", "lever.co", "workable", "teamtailor", "recruitee", "personio", "occupop", "zoom.us", "google.")):
            add(org, f"https://{h}/", "known")
    try:
        le = json.load(open(RES)).get("lobbyingEntities", [])
        for e in le:
            if (e.get("country") or "").upper() == "BELGIUM" or re.search(r"brussel|bruxelles", e.get("city") or "", re.I):
                add(e.get("name") or e.get("originalName"), e.get("webSiteURL") or e.get("website"), "register", e.get("registrationCategory", ""))
    except Exception: pass
    try:
        for c in json.load(open(CITY_SEEDS)):
            s = norm_site(c.get("site"))
            if not s: continue
            k = regdom(urlparse(s).hostname)
            if k in out:
                # Already crawled as lead/known/register: keep that kind but use the city's careers pages and filter.
                o = out[k]; o.setdefault("city", c.get("city"))
                o["careers"] = list(dict.fromkeys((o.get("careers") or []) + (c.get("careers") or [])))[:3]
                continue
            out[k] = {"name": c["name"][:120], "site": s, "kind": "city", "cat": c.get("cat", ""), "city": c.get("city"), "careers": c.get("careers") or []}
    except FileNotFoundError: pass
    return list(out.values())

# ---------- extraction ----------
CAREER_RE = re.compile(r"career|jobs?\b|vacanc|recruit|work-with-us|work-for-us|join-us|joinus|opportunit|emploi|vacature|offres|stellen|we-are-hiring|hiring|jobba|lediga|karriar|karriär|praca|kariera|lavora|volna-mista|nabidky|ledige|stillinger|job-karriere", re.I)
ATS = [
    (re.compile(r"(?:boards|job-boards)\.(?:eu\.)?greenhouse\.io/(?:embed/job_board\?for=)?([A-Za-z0-9_-]+)"), "greenhouse"),
    (re.compile(r"jobs\.(?:eu\.)?lever\.co/([A-Za-z0-9_.-]+)"), "lever"),
    (re.compile(r"apply\.workable\.com/([A-Za-z0-9_-]+)"), "workable"),
    (re.compile(r"([A-Za-z0-9-]+)\.recruitee\.com"), "recruitee"),
    (re.compile(r"([A-Za-z0-9-]+)\.teamtailor\.com"), "teamtailor"),
    (re.compile(r"([A-Za-z0-9-]+)\.jobs\.personio\.(?:de|com)"), "personio"),
]
def links(html, base):
    for m in re.finditer(r"<a\b[^>]*href=[\"']([^\"'#]+)[\"'][^>]*>(.*?)</a>", html, re.I | re.S):
        yield urljoin(base, unescape(m.group(1))), re.sub(r"<[^>]+>|\s+", " ", m.group(2)).strip()

def jsonld_jobs(html):
    res = []
    for m in re.finditer(r"<script[^>]*application/ld\+json[^>]*>(.*?)</script>", html, re.I | re.S):
        try: data = json.loads(m.group(1).strip())
        except Exception: continue
        stack = [data]
        while stack:
            x = stack.pop()
            if isinstance(x, list): stack.extend(x); continue
            if not isinstance(x, dict): continue
            if "@graph" in x: stack.append(x["@graph"])
            t = x.get("@type"); t = t if isinstance(t, list) else [t]
            if "JobPosting" in t: res.append(x)
    return res

def loc_text(jp):
    locs = jp.get("jobLocation") or []
    locs = locs if isinstance(locs, list) else [locs]
    parts = []
    for l in locs:
        a = (l or {}).get("address") if isinstance(l, dict) else l
        if isinstance(a, dict): parts += [str(a.get(k, "")) for k in ("addressLocality", "addressRegion", "addressCountry")]
        elif a: parts.append(str(a))
    return " ".join(parts) + " " + json.dumps(jp.get("applicantLocationRequirements", ""))

def ats_jobs(kind, slug):
    out = []
    if kind == "greenhouse":
        d = get(f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs", True) or {}
        for j in d.get("jobs", []): out.append(dict(title=j.get("title"), loc=(j.get("location") or {}).get("name", ""), url=j.get("absolute_url"), posted=j.get("updated_at")))
    elif kind == "lever":
        d = get(f"https://api.lever.co/v0/postings/{slug}?mode=json", True) or []
        for j in d if isinstance(d, list) else []:
            c = j.get("categories") or {}
            out.append(dict(title=j.get("text"), loc=c.get("location", "") + " " + " ".join(c.get("allLocations") or []), url=j.get("hostedUrl"), commitment=c.get("commitment")))
    elif kind == "workable":
        d = get(f"https://apply.workable.com/api/v1/widget/accounts/{slug}", True) or {}
        for j in d.get("jobs", []): out.append(dict(title=j.get("title"), loc=" ".join(filter(None, [j.get("city"), j.get("country")])), url=j.get("url") or j.get("shortlink"), commitment=j.get("employment_type")))
    elif kind == "recruitee":
        d = get(f"https://{slug}.recruitee.com/api/offers/", True) or {}
        for j in d.get("offers", []): out.append(dict(title=j.get("title"), loc=" ".join(filter(None, [j.get("city"), j.get("country")])), url=j.get("careers_url"), commitment=j.get("employment_type_code")))
    elif kind in ("teamtailor", "personio"):
        url = f"https://{slug}.teamtailor.com/jobs.rss" if kind == "teamtailor" else f"https://{slug}.jobs.personio.de/xml"
        r = get(url)
        if r:
            x = r[0]
            for it in re.findall(r"<(?:item|position)>(.*?)</(?:item|position)>", x, re.S):
                g = lambda t: unescape(re.sub(r"<!\[CDATA\[|\]\]>", "", (re.search(rf"<{t}[^>]*>(.*?)</{t}>", it, re.S) or [None, ""])[1])).strip()
                link = g("link") or (f"https://{slug}.jobs.personio.de/job/{g('id')}" if kind == "personio" else "")
                out.append(dict(title=g("title") or g("name"), loc=" ".join([g("tt:location"), g("location"), g("office"), g("city"), g("country")]), url=link, commitment=g("employmentType") or g("schedule")))
    return [o for o in out if o.get("title") and o.get("url")]

ROLE_RX = re.compile(r"officer|manager|assistant|intern\b|internship|trainee|advis[oe]r|director|coordinator|analyst|head of|\blead\b|specialist|expert|associate|consultant|secretary|economist|researcher|fellow|stagiaire|counsel|editor|praktik\w*|generalsekreterare|handläggare|samordnare|projektledare|rådgivare|sekreterare|utredare|kommunikatör|caseworker|project worker|specjalist\w*|koordynator\w*|asystent\w*|stażyst\w*|staż\b|praktyk\w*|ekspert\w*|analityk\w*|responsabile|coordinat(?:ore|rice)|addett[oa]|tirocin\w*|stagista|ricercat(?:ore|rice)|esperto|koordinátor\w*|stáž\w*|analytik|výzkumn\w*|konsulent|medarbejder|praktikant|chefkonsulent|rådgiver|fuldmægtig|seniorrådgiver", re.I)
BAD_TITLE = re.compile(r"\b(board|committee|directory|staff list|our team|members?hip? list|council|governance|our people)\b|closed|filled|call for papers|challenge|programme$|internships at|offers in|director general|\bgrants? call", re.I)
MONTHS = {m: i for i, m in enumerate(["january","february","march","april","may","june","july","august","september","october","november","december"], 1)}
DL_RX = re.compile(r"(?:deadline|closing date|apply (?:by|before)|applications?[^.]{0,30}?(?:by|before|until)|date limite|uiterste datum)[^0-9a-z]{0,40}?(?:\w+day,?\s*)?(\d{1,2})(?:st|nd|rd|th)?[\s./-]+([a-z]+|\d{1,2})[\s./-]+(20\d\d)", re.I)
def html_job(html, anchor_text, prefer=None):
    text = re.sub(r"<script.*?</script>|<style.*?</style>", " ", html, flags=re.S | re.I)
    h1 = re.search(r"<h1[^>]*>(.*?)</h1>", text, re.S | re.I)
    plain = unescape(re.sub(r"<[^>]+>", " ", text)); plain = re.sub(r"\s+", " ", plain)
    if h1:
        start = plain.find(unescape(re.sub(r"<[^>]+>", " ", h1.group(1))).strip()[:30])
        body = plain[start:start + 5000] if start >= 0 else plain
    else:
        body = plain
    t_raw = unescape(re.sub(r"<[^>]+>", " ", h1.group(1) if h1 else anchor_text))
    found_city = detect_city(t_raw, prefer)
    if not found_city:
        tail = re.search(r"(?:[–|—]| - |\bin |\bbased in )\s*([A-Z][\w\- ]{2,40})\s*$", t_raw.strip())
        if tail: return None  # title names some other location
        found_city = detect_city(body[:1500], prefer)
    if not found_city and prefer:
        # Single-city employer page: accept the seed's city if it is the only target city named on the page.
        named = {sl for sl, n, c, rx in CITY_RX if rx.search(plain)} | ({"brussels"} if re.search(r"brussel|bruxelles", plain, re.I) else set())
        if named == {prefer}: found_city = next((n, c) for sl, n, c, rx in CITY_RX if sl == prefer)
    if not found_city: return None
    if not (re.search(r"\bapply\b|application|candidat|\bCV\b|cover letter|postuler|solliciteren|ansök|ansökan|personligt brev|aplikuj|zgłosz|aplikacj|CV|candidatur|invia|životopis|přihlá|ansøg", body, re.I)
            and re.search(r"contract|salary|start date|deadline|full[- ]time|part[- ]time|position|vacancy|job description|responsibilit|tjänst|anställning|heltid|deltid|sista ansökningsdag|tillträde|umow|etat|wymagania|obowiązki|contratto|requisiti|mansioni|tempo pieno|úvazek|smlouv|požadavky|stilling|ansættelse|fuldtid|ansøgningsfrist", body, re.I)):
        return None
    title = clean_title(h1.group(1)) if h1 and ROLE_RX.search(re.sub(r"<[^>]+>", "", h1.group(1))) else clean_title(anchor_text)
    deadline = None
    m = DL_RX.search(plain)
    if m:
        d, mo, y = m.groups()
        mo = int(mo) if mo.isdigit() else next((v for k, v in MONTHS.items() if k.startswith(mo.lower()[:3])), 0)
        try: deadline = dt.date(int(y), int(mo), int(d)).isoformat()
        except Exception: deadline = None
        if deadline is None: return None
    if re.search(r"(position|vacancy|this role) (has been|is) (filled|closed)|no longer accepting", plain, re.I): return None
    if BAD_TITLE.search(title): return None
    if not re.search(rf"\b({NOW.year}|{NOW.year + 1})\b", body): return None  # no current dates: likely stale
    return dict(title=title, loc=found_city[0], deadline=deadline)

BRU = re.compile(r"brussel|bruxelles|belgi|\bBE\b", re.I)
def crawl(seed):
    found, ats_seen = [], set()
    home = get(seed["site"])
    if not home: return seed, found, False
    html, base = home
    pages, cands = [(html, base)], []
    for href, text in links(html, base):
        if is_comp(href): continue
        if CAREER_RE.search(href) or CAREER_RE.search(text):
            if regdom(urlparse(href).hostname) == regdom(urlparse(base).hostname) or any(r.search(href) for r, _ in ATS):
                cands.append(href)
    seed["_careers"] = [c for c in dict.fromkeys(cands) if regdom(urlparse(c).hostname) == regdom(urlparse(base).hostname) or any(r.search(c) for r, _ in ATS)][:3]
    for c in list(dict.fromkeys((seed.get("careers") or []) + cands))[:3]:
        r = get(c)
        if r: pages.append(r)
    # careers URLs supplied by teammates can be a single vacancy notice on the employer's own site
    for cu in seed.get("careers") or []:
        if urlparse(cu).path.strip("/") and regdom(urlparse(cu).hostname) == regdom(urlparse(base).hostname):
            pg = next((p for p in pages if p[1].rstrip("/") == cu.rstrip("/")), None)
            if pg:
                item = html_job(pg[0], "", seed.get("city"))
                if item: found.append(("html", item, pg[1]))
    joblinks = []
    for h, b in pages:
        for rx, kind in ATS:
            for m in rx.finditer(h):
                ats_seen.add((kind, m.group(1).lower()))
        for jp in jsonld_jobs(h): found.append(("jsonld", jp, b))
        for href, text in links(h, b):
            if is_comp(href): continue
            p = urlparse(href)
            if regdom(p.hostname) == regdom(urlparse(base).hostname) and re.search(r"/(jobs?|jobb|vacanc\w*|careers?|vacatures?|offres?|positions?|opportunit\w*|lediga[-\w]*|work-for-us|work-with-us|praca|oferty|kariera|lavora-con-noi|posizioni|volna-mista|nabidky|kariera|ledige-stillinger|vacancies)/[^/?#]{6,}", p.path, re.I):
                joblinks.append(href)
    # role-named links on the careers pages themselves (employer's own site only)
    role_links = []
    for h, b in pages[1:]:
        for href, text in links(h, b):
            if is_comp(href) or not (6 <= len(text) <= 140) or not ROLE_RX.search(text): continue
            if regdom(urlparse(href).hostname) != regdom(urlparse(base).hostname) and not any(r.search(href) for r, _ in ATS): continue
            if urlparse(href).path.rstrip("/") in ("", urlparse(b).path.rstrip("/")) or re.search(r"\.(pdf|docx?)$", href, re.I): continue
            role_links.append((href, text))
    jl_all = list(dict.fromkeys(joblinks + [h for h, _ in role_links]))[:15]
    anchor = dict(role_links)
    for jl in jl_all:
        r = get(jl)
        if not r: continue
        jps = jsonld_jobs(r[0])
        for jp in jps: found.append(("jsonld", jp, r[1]))
        if not jps and jl in anchor:
            item = html_job(r[0], anchor[jl], seed.get("city"))
            if item: found.append(("html", item, r[1]))
    found += ats_adapters.feed_jobs(seed)
    for kind, slug in list(ats_seen)[:3]:
        if slug in ("embed", "api", "www", "jobs", "app", "careers"): continue
        for j in ats_jobs(kind, slug): found.append((kind, j, j["url"]))
    return seed, found, True

# ---------- normalisation ----------
TOPIC_RULES = [("Climate & energy", r"climat|energy|environment|sustainab|green|nature|ocean"), ("Digital & technology", r"digital|tech|data|ai\b|cyber|software|it\b"), ("Health", r"health|medic|pharma|patient"), ("Trade & economy", r"trade|econom|finance|financial|tax|bank|industr|market"), ("Law & governance", r"legal|law|lawyer|counsel|governance|compliance|democra|rights"), ("Research & education", r"research|scien|educat|academ|analyst|fellow"), ("Public affairs", r"public affairs|advoca|lobby|government relations|campaign|communicat|media|press")]
def topic(title):
    for t, rx in TOPIC_RULES:
        if re.search(rx, title, re.I): return t
    return "EU policy"
def category(seed):
    c = (seed.get("cat") or "").lower()
    if "non-governmental" in c or "ngo" in c: return "ngos"
    if "trade and business" in c or "trade association" in c or "trade & business" in c: return "trade-associations"
    if "think tank" in c or "academic" in c: return "think-tanks"
    if "consultanc" in c or "public affairs" in c: return "public-affairs"
    if "law firm" in c: return "law-firms"
    return "unknown"
POLICY_RX = re.compile(r"polic|affairs|advoca|regulat|public|government|communicat|campaign|eu\b|europe|legal|counsel|economist|analyst|research|intern|trainee|stagiair|project|programme|program|officer|advisor|adviser|manager|director|coordinator|assistant|secretar|praktik|sekreterare|handläggare|utredare|referent", re.I)
# Stricter filter for city employers (outside the Brussels core): keep EU-affairs / policy-type roles only.
EU_AFFAIRS_RX = re.compile(r"polic|affairs|advoca|regulat|public|government|politi|parliament|communicat|press|media|campaign|"
    r"research|analyst|economist|fellow|legal|counsel|lawyer|jurist|rights|programme|program|project (officer|manager|coordinator)|"
    r"intern|trainee|stagiair|praktik|stage\b|staż|stáž|tirocin|stagista|konsulent|rådgiver|specjalist|ekspert|analityk|analytik|responsabile|coordinat|koordyn|koordin|generalsekreterare|handläggare|utredare|kommunikatör|referent|advis[eo]r|berater|consultant|climate|energy|sustainab|"
    r"\beu\b|europe|international|partnership|stakeholder|membership|secretary general|executive director|director of|head of (policy|advocacy|public|eu|communications|programmes?)", re.I)
NON_EU_RX = re.compile(r"marketing|sales|vertrieb|account (manager|executive)|key account|\bcrm\b|developer|engineer|software|\bit\b|"
    r"product manager|auditor|accountant|bookkeep|payroll|\bhr\b|human resources|recruiter|teller|clerical|receptionist|therapist|"
    r"nurse|care worker|driver|warehouse|cleaner|chef|designer|diseñador|asset manager|health & safety|office manager|personal assistant|"
    r"executive assistant", re.I)
def eu_affairs_title(t):
    return bool(EU_AFFAIRS_RX.search(t)) and not NON_EU_RX.search(t)

def emp_type(v, title):
    v = (json.dumps(v) if not isinstance(v, str) else v or "").upper()
    if re.search(r"intern|trainee|stagiair|traineeship|stage\b", title, re.I) or "INTERN" in v: return "Traineeship"
    if "TEMPORARY" in v or "FIXED" in v: return "Fixed-term"
    if "CONTRACT" in v or "FREELANCE" in v: return "Freelance"
    if "PERMANENT" in v: return "Permanent"
    return None
def iso_deadline(v):
    if not v: return None
    try:
        s = str(v).strip()
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s): return s
        d = dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
        if not d.tzinfo: d = d.replace(tzinfo=dt.timezone.utc)
        return d.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")
    except Exception: return None
GENERIC_TITLE = re.compile(r"^(internships?( opportunities| programme| offers?)?|student work.*|become an? .*|read our .*|careers?|vacancies|jobs?|work with us|join us|call for candidates.*|.*\bboard of directors\b.*)$", re.I)
def clean_title(t):
    t = re.sub(r"[\u200b\ufeff]", "", unescape(re.sub(r"<[^>]+>", " ", str(t or ""))))
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r"^[!*•·\-–\s]+", "", t)
    t = re.sub(r"^(continue reading|we are hiring|vacancy|job opening|now hiring|new vacancy)\s*[:\-–]?\s*", "", t, flags=re.I).strip()
    if t.isupper(): t = t.title()
    return t[:140]
def stale_url(u):
    m = re.search(r"/(20\d\d)/\d{1,2}/", u)
    return bool(m and int(m.group(1)) < NOW.year)

def to_row(seed, kind, item, page_url):
    if kind == "jsonld":
        title = clean_title(item.get("title") or item.get("name"))
        loc = loc_text(item); url = item.get("url") or page_url
        if isinstance(url, list): url = url[0]
        url = urljoin(page_url, str(url)); deadline = iso_deadline(item.get("validThrough"))
        et = emp_type(item.get("employmentType"), title)
        org = (item.get("hiringOrganization") or {}).get("name") if isinstance(item.get("hiringOrganization"), dict) else None
    elif kind == "html":
        title = item["title"]; loc = item["loc"]; url = page_url; deadline = item.get("deadline")
        et = emp_type(None, title); org = None
    else:
        title = clean_title(item.get("title")); loc = item.get("loc") or ""; url = item["url"]; deadline = iso_deadline(item.get("deadline"))
        et = emp_type(item.get("commitment"), title); org = item.get("org")
    if GENERIC_TITLE.match(title) or stale_url(url): return None
    m3 = re.match(r"^(.{3,60}?) [–-] ", title)
    if m3 and not ROLE_RX.search(m3.group(1)) and m3.group(1).lower()[:12] not in (seed["name"] or "").lower():
        return None  # another organisation's vacancy re-posted on a network/consortium site
    place = detect_city(loc, seed.get("city"))
    if len(title) < 4 or not place or is_comp(url) or is_comp(page_url): return None
    city_name, country = place
    if (seed["kind"] == "register" or (seed["kind"] == "city" and seed.get("cat"))) and category(seed) == "unknown" and not re.search(r"polic|affairs|advoca|regulat|government|public", title, re.I): return None
    if not POLICY_RX.search(title): return None
    if (seed["kind"] == "city" or seed.get("city")) and not eu_affairs_title(title): return None
    if deadline:
        dl = dt.datetime.fromisoformat(deadline.replace("Z", "+00:00")) if "T" in deadline else dt.datetime.fromisoformat(deadline + "T21:59:59+00:00")
        if dl <= NOW + dt.timedelta(hours=12): return None
    org = ((org if kind not in ("jsonld", "html") else None) or seed["name"] or org or "").strip()[:120]
    host = urlparse(url).hostname
    deadline_txt = ""
    if deadline:
        deadline_txt = f" Applications close on {deadline[:10]} (check the employer's notice for the exact time)."
    ctype = {"Traineeship": "a traineeship", "Fixed-term": "a fixed-term role", "Freelance": "a freelance or contract role", "Permanent": "a permanent role"}.get(et, "a role")
    summary = f"{org} is recruiting for {title} in {city_name}. Apply directly on the employer's site."[:300]
    if len(summary) < 20: return None
    description = (f"{org} is hiring: {title}. This is {ctype} based in {city_name}, {country}.{deadline_txt}\n\n"
                   f"EUJobs lists this vacancy from {org}'s own careers page ({host}). The full job description, requirements and "
                   f"application steps are published by the employer. Read the original notice and apply on the employer's site.")
    sid = hashlib.sha1(re.sub(r"[?#].*$", "", url).rstrip("/").lower().encode()).hexdigest()[:24]
    return {"sourceId": sid, "checkedAt": NOW.isoformat().replace("+00:00", "Z"), "listing": {
        "kind": "job", "title": title, "organization": org, "location": city_name, "country": country,
        "topic": topic(title), "categorySlug": category(seed), "summary": summary, "description": description,
        "employmentType": et, "seniority": None, "workMode": None, "sourceUrl": url, "url": url,
        **({"deadline": deadline} if deadline else {})}}

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--apply", action="store_true"); ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--import-file", default="")
    ap.add_argument("--workers", type=int, default=12); ap.add_argument("--budget-min", type=int, default=75)
    ap.add_argument("--kinds", default="", help="comma list of seed kinds to crawl (lead,known,register,city); default all")
    ap.add_argument("--domains-file", default="", help="only crawl seeds whose registered domain is listed (one per line)")
    ap.add_argument("--checkpoint", default="", help="JSONL checkpoint; already-crawled domains are skipped and their rows reused")
    a = ap.parse_args()
    import os; os.makedirs(OUT, exist_ok=True)
    if a.import_file:
        run_import(a.import_file); mark_verified(); return
    sd = seeds()
    if a.kinds: sd = [s for s in sd if s["kind"] in a.kinds.split(",")]
    if a.domains_file:
        want = {l.strip().lower() for l in open(a.domains_file) if l.strip()}
        sd = [s for s in sd if regdom(urlparse(s["site"]).hostname) in want]
    sd.sort(key=lambda s: {"lead": 0, "known": 1, "register": 2, "city": 3}[s["kind"]])
    if a.limit: sd = sd[: a.limit]
    print(f"seeds: {len(sd)}", file=sys.stderr)
    rows, stats, crawled = {}, {"sites_ok": 0, "sites_failed": 0, "jsonld": 0, "ats": 0}, []
    deadline_t = time.time() + a.budget_min * 60
    careers_found = {}
    ck = None
    if a.checkpoint:
        done = set()
        try:
            for line in open(a.checkpoint):
                c = json.loads(line); done.add(c["domain"])
                stats["sites_ok" if c["ok"] else "sites_failed"] += 1
                if c["ok"]: crawled.append(c["domain"])
                if c.get("careers"): careers_found[c["domain"]] = c["careers"]
                for r in c["rows"]: rows.setdefault(r["sourceId"], r)
        except FileNotFoundError: pass
        sd = [s for s in sd if regdom(urlparse(s["site"]).hostname) not in done]
        print(f"checkpoint: {len(done)} done, {len(sd)} remaining", file=sys.stderr)
        ck = open(a.checkpoint, "a")
    with cf.ThreadPoolExecutor(a.workers) as ex:
        futs = [ex.submit(crawl, s) for s in sd]
        for f in cf.as_completed(futs):
            if time.time() > deadline_t: break
            try: seed, found, ok = f.result()
            except Exception: continue
            stats["sites_ok" if ok else "sites_failed"] += 1
            dom = regdom(urlparse(seed["site"]).hostname)
            if ok: crawled.append(dom)
            if seed.get("_careers"): careers_found[dom] = seed["_careers"]
            new = []
            for kind, item, page in found:
                try: r = to_row(seed, kind, item, page)
                except Exception: r = None
                if r and r["sourceId"] not in rows:
                    rows[r["sourceId"]] = r; new.append(r); stats[kind if kind in ("jsonld", "html") else "ats"] = stats.get(kind if kind in ("jsonld", "html") else "ats", 0) + 1
            if ck:
                ck.write(json.dumps({"domain": dom, "ok": ok, "careers": seed.get("_careers") or [], "rows": new}) + "\n"); ck.flush()
        for f in futs: f.cancel()
    save_careers(careers_found)
    rows = {k: r for k, r in rows.items() if final_ok(r)}
    # identity dedupe (title+org)
    seen, final = set(), []
    for r in rows.values():
        k = (r["listing"]["title"].lower(), r["listing"]["organization"].lower())
        if k not in seen: seen.add(k); final.append(r)
    final = dedupe_existing(final)
    stamp = NOW.strftime("%Y%m%dT%H%M%SZ")
    path = f"{OUT}/employer-{stamp}.json"
    json.dump(final[:1000], open(path, "w"), indent=1)
    json.dump({"stats": stats, "rows": len(final), "crawledDomains": crawled}, open(f"{OUT}/employer-{stamp}.meta.json", "w"))
    print(json.dumps({"stats": stats, "rows": len(final), "file": path}))
    if a.apply and final:
        run_import(path)
    if a.apply: mark_verified()
    if a.apply: close_missing(set(r["sourceId"] for r in final), set(crawled))

FOREIGN = ("Afghanistan|Albania|Algeria|Angola|Bangladesh|Benin|Bolivia|Burkina Faso|Burundi|Cambodia|Cameroon|Chad|Colombia|Congo|DRC|"
    "Ecuador|Egypt|Ethiopia|Gaza|Ghana|Guatemala|Guinea|Haiti|Honduras|India|Indonesia|Iraq|Jordan|Kenya|Lebanon|Liberia|Libya|"
    "Madagascar|Malawi|Mali|Mauritania|Mozambique|Myanmar|Nepal|Niger|Nigeria|Pakistan|Palestine|Philippines|Rwanda|Senegal|"
    "Sierra Leone|Somalia|South Sudan|Sudan|Syria|Tanzania|Togo|Uganda|Venezuela|Yemen|Zambia|Zimbabwe|Kyiv|Kharkiv|Odesa|Nairobi|Mandalay")
TAIL_PLACE = re.compile(r"(?:\s[–|—]\s|\s-\s|\s\|\s)\s*([A-Z][\w'’.\- ]{2,40})\s*!?$|\(([A-Z][^)]{2,60})\)\s*$")
def final_ok(r):
    """Last-pass quality gate on every row (also re-applied to checkpointed rows): tidy titles, drop generic
    pages and vacancies whose title names a location other than the listing's city."""
    l = r["listing"]; t = clean_title(l["title"])
    t = re.sub(r"^(?:vacancy\s+)?notice\s*:\s*", "", t, flags=re.I).strip()
    t = re.sub(r"[\U0001F000-\U0001FFFF\u2600-\u27BF\uFE0F]", "", t).strip()
    if re.search(r"Ã.|â€", t):
        try: t = t.encode("latin-1").decode("utf-8")
        except Exception: return False
    if re.search(r"\s[–-]\s.*\b(credit union|ltd|limited|gmbh|s\.?r\.?l|plc)\b", t, re.I): return False
    if len(re.findall(r"\b[A-Z]{4,}\b", t)) >= 3: return False
    md = re.search(r"closing (\d{1,2}) ([A-Za-z]+) (20\d\d)", t, re.I)
    if md:
        mo = next((v for k, v in MONTHS.items() if k.startswith(md.group(2).lower()[:3])), 0)
        try:
            if dt.date(int(md.group(3)), mo, int(md.group(1))) < NOW.date(): return False
        except Exception: return False
    if re.search(r"sydney|melbourne|singapore|new york|nairobi|mandalay|kabul|juba|goma|bamako|dakar|niamey|maiduguri|cox", l.get("url", ""), re.I): return False
    if re.search(r"\bfaqs?\b|^how to apply|^our (internship|traineeship)s?\b", t, re.I): return False
    yrs = [int(y) for y in re.findall(r"\b(20\d\d)\b", t)]
    if yrs and max(yrs) < NOW.year: return False  # e.g. "autumn/winter 2025" notices
    if re.search(r"\b(?:" + FOREIGN + r")\b", t, re.I) and not detect_city(t): return False  # role based in another country
    city = l["location"]
    m = TAIL_PLACE.search(t)
    if m:
        place = (m.group(1) or m.group(2) or "").strip()
        if detect_city(place) and detect_city(place)[0] == city:
            t = t[: m.start()].strip(" –-|")  # "Communications Intern | Paris" -> title without the city
        elif re.search(r"\b(?:Afghanistan|Albania|Algeria|Angola|Argentina|Armenia|Australia|Azerbaijan|Bangladesh|Benin|Bolivia|Bosnia|Brazil|Burkina|Burundi|Cambodia|Cameroon|Canada|Chad|Chile|China|Colombia|Congo|DRC|Ecuador|Egypt|Ethiopia|Gaza|Georgia|Ghana|Guatemala|Guinea|Haiti|Honduras|India|Indonesia|Iran|Iraq|Jordan|Kenya|Kosovo|Lebanon|Liberia|Libya|Madagascar|Malawi|Mali|Mexico|Moldova|Mongolia|Morocco|Mozambique|Myanmar|Nepal|Nicaragua|Niger|Nigeria|Pakistan|Palestine|Peru|Philippines|Rwanda|Senegal|Serbia|Sierra Leone|Somalia|South Sudan|Sri Lanka|Sudan|Syria|Tanzania|Thailand|Tunisia|Turkey|Türkiye|Uganda|Ukraine|USA|United States|Venezuela|Vietnam|Yemen|Zambia|Zimbabwe|Kyiv|Nairobi|Dakar|Bangkok|Washington|New York|Beirut|Amman|Kampala|Addis|Abuja|Port-au-Prince|Bogot|Manila|Jakarta|Delhi|Singapore|Hong Kong|Tokyo|Sydney|Toronto|Africa|Asia|Latin America|Middle East|MENA|Americas|Pacific|Caribbean|Remote)", place, re.I) and not re.search(r"\b(?:FTC|m/f|f/m|w/m|m/w|mwd|wmd|gn|all genders|maternity|parental|temporary|permanent|contract|part[- ]time|full[- ]time|remote|hybrid|\d+\s*h)\b|M/F|F/H|H/F", place, re.I) and not ROLE_RX.search(place):
            return False  # title names another place (e.g. "– Kyiv", "(Colombia, Venezuela)")
    if GENERIC_TITLE.match(t) or re.search(r"^career opportunities|opportunities for\b|^job opportunities", t, re.I): return False
    if len(t) < 4 or re.fullmatch(r"(?i)(intern|internship|trainee|consultant|vacancy|job)s?", t): return False
    if re.search(r"visa application centre|\bdriver\b|security guard", t, re.I): return False
    if t != l["title"]:
        l["title"] = t; l["summary"] = l["summary"].replace(r["listing"]["summary"].split(" is recruiting for ")[-1].split(" in ")[0], t, 1)
    return True

def save_careers(found):
    """Persist careers pages discovered for city employers so later runs fetch them directly."""
    try: cs = json.load(open(CITY_SEEDS))
    except FileNotFoundError: return
    n = 0
    for c in cs:
        s = norm_site(c.get("site")); d = regdom(urlparse(s).hostname) if s else None
        if d in found and found[d] != c.get("careers"): c["careers"] = found[d]; n += 1
    if n:
        tmp = CITY_SEEDS + ".tmp"; json.dump(cs, open(tmp, "w"), indent=0, ensure_ascii=False)
        import os; os.replace(tmp, CITY_SEEDS)

def dedupe_existing(rows):
    """Skip vacancies already on EUJobs (same apply URL, or same employer and near-identical title)."""
    db = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    ex = db.execute("select title,organization,url from listings where kind='job' and status='published' and coalesce(externalSource,'')!='employer'").fetchall()
    n = lambda u: re.sub(r"[?#].*$", "", (u or "")).rstrip("/").lower().replace("http://", "https://").replace("://www.", "://")
    toks = lambda s: set(w for w in re.findall(r"[a-z]{3,}", s.lower()) if w not in {"the", "and", "for", "with", "brussels", "belgium"} | {w for _, n, c, _ in CITIES for w in (n.lower(), c.lower())})
    urls = {n(e[2]) for e in ex}; keep = []
    for r in rows:
        l = r["listing"]
        if n(l["url"]) in urls: continue
        if any((toks(o) & toks(l["organization"])) and toks(t) and toks(l["title"]) and len(toks(t) & toks(l["title"])) / len(toks(t) | toks(l["title"])) >= 0.6 for t, o, _ in ex): continue
        keep.append(r)
    return keep

def run_import(path):
    if True:
        cmd = ["/usr/bin/node", "--env-file=/srv/eujobs/shared/runtime.env", "node_modules/tsx/dist/cli.mjs", "scripts/import-listings.ts",
               "--file", path, "--source", "employer", "--admin", "admin@example.org", "--apply", "--publish"]
        p = subprocess.run(cmd, cwd="/srv/eujobs/current", capture_output=True, text=True)
        out = (p.stdout or p.stderr).strip()
        try:
            res = json.loads(out.splitlines()[-1]); print(json.dumps({k: res.get(k) for k in ("imported", "published", "skipped")}))
        except Exception: print("import output:", out[:2000]); sys.exit(1)

def mark_verified():
    """Apply links were fetched directly from the employer's own site/ATS, so they are verified URL CTAs."""
    db = sqlite3.connect(DB, timeout=30)
    with db:
        n = db.execute("update listings set applicationMethod='url' where externalSource='employer' and applicationMethod is null and url is not null").rowcount
    print(json.dumps({"markedVerified": n}))

def close_missing(seen_ids, crawled_domains):
    """Close employer listings whose notice disappeared from a site we crawled successfully today."""
    db = sqlite3.connect(DB, timeout=30); db.row_factory = sqlite3.Row
    admin = db.execute("select id from users where role='admin' order by createdAt limit 1").fetchone()[0]
    rows = db.execute("""select l.id,l.url,s.sourceId,l.version from listings l join import_sources s on s.listingId=l.id
                         where s.source='employer' and l.status='published'""").fetchall()
    closed = 0; now = dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")
    for r in rows:
        if r["sourceId"] in seen_ids or regdom(urlparse(r["url"] or "").hostname) not in crawled_domains: continue
        try: gone = S.head(r["url"], timeout=TIMEOUT, allow_redirects=True).status_code in (404, 410)
        except Exception: gone = False
        if not gone: continue
        with db:
            db.execute("update listings set status='closed',version=version+1,updatedAt=? where id=? and version=?", (now, r["id"], r["version"]))
            db.execute("insert into audit(id,listingId,actorId,action,createdAt) values(?,?,?,?,?)", (str(uuid.uuid4()), r["id"], admin, "employer importer: notice no longer on employer site", now))
        closed += 1
    print(json.dumps({"closedMissing": closed}))

ats_adapters.ej = sys.modules[__name__]

if __name__ == "__main__":
    main()
