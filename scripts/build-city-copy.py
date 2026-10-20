#!/usr/bin/env python3
"""Regenerate src/data/city-pages.json from teammate copy (cities/pages/<slug>.md).
Uses Title tag, Meta description, H1, Body copy and For employers. 'Social posts' are ignored.
In 'For employers', price bullets and the trailing link line are dropped: the page renders prices from
JOB_PLANS plus the LAUNCH149 offer (hidden after 31 Oct 2026) so they can never drift from checkout. Usage: build-city-copy.py <pages_dir> <out.json>"""
import html, json, os, re, sys
SLUGS = ["brussels","london","berlin","paris","geneva","luxembourg","strasbourg","the-hague","vienna","madrid","rome","warsaw","copenhagen","stockholm","dublin","lisbon","prague","budapest","athens","amsterdam","milan"]
def inline(t):
    t = html.escape(t, quote=False)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"\[([^\]]+)\]\((/[^)\s]*|https://eujobs\.co/[^)\s]*)\)", lambda m: f'<a href="{m.group(2).replace("https://eujobs.co","")}">{m.group(1)}</a>', t)
    return t
def md_html(md):
    out, para, lst = [], [], []
    def flush():
        if para: out.append("<p>" + inline(" ".join(para)) + "</p>"); para.clear()
        if lst: out.append("<ul>" + "".join(f"<li>{inline(x)}</li>" for x in lst) + "</ul>"); lst.clear()
    for line in md.splitlines():
        s = line.strip()
        if not s: flush(); continue
        if s.startswith("### "): flush(); out.append(f"<h3>{inline(s[4:])}</h3>"); continue
        if s.startswith("- "): 
            if para: flush()
            lst.append(s[2:]); continue
        para.append(s)
    flush(); return "".join(out)
PRICE = re.compile(r"(EUR|€)\s?\d|LAUNCH149|\bfree (first )?(listing|post)", re.I)
def employers(md):
    keep = [l for l in md.splitlines() if not PRICE.search(l) and not re.match(r"\s*\[Post a job\]", l)]
    return md_html("\n".join(keep))
def sections(text):
    d = {}
    for m in re.finditer(r"^## (.+?)\n(.*?)(?=^## |\Z)", text, re.M | re.S): d[m.group(1).strip().lower()] = m.group(2).strip()
    return d
pages_dir, out = sys.argv[1], sys.argv[2]
res = {}
for slug in SLUGS:
    f = os.path.join(pages_dir, f"{slug}.md")
    if not os.path.exists(f): continue
    s = sections(open(f, encoding="utf-8").read())
    title = re.sub(r"\s*\|\s*EUJobs\s*$", "", s["title tag"]).strip()
    res[slug] = {"title": title, "description": s["meta description"].strip(), "h1": s["h1"].strip(), "html": md_html(s["body copy"]), "employersHtml": employers(s.get("for employers", "")), "source": f"cities/pages/{slug}.md"}
json.dump(res, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(res), "cities")
