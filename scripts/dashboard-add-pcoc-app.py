"""Add a tile for the new PCOC Amendments app to the CM v2 master dashboard.

    python scripts/dashboard-add-pcoc-app.py            # dry run, shows the diff
    python scripts/dashboard-add-pcoc-app.py --apply

What this changes, and nothing else
-----------------------------------
1. A new tile `pcocapp` (Permits section) is inserted right after the existing
   `pcocamend` tile. It opens https://pcoc-amendments.vercel.app/ (Google
   sign-in), like the Permitting Helper tile opens its own Vercel app.
2. `pcocapp` is added to the Permits role's `also` list, just before
   `pcocamend`.
The old `pcocamend` tile (Jim's code page 177) is left exactly as it is.

Re-runnable: it refuses if `pcocapp` is already on the page.
page43.before-pcoc.html next to this script is the byte-exact page from before
the edit — deploy that to revert.
"""
import difflib
import html
import os
import re
import sys
import urllib.parse
import urllib.request

REALM = os.environ["QB_REALM"]
TOK = os.environ["QB_USER_TOKEN"]
APP = "buskqh26r"
PAGE = 43
HERE = os.path.dirname(os.path.abspath(__file__))
APPLY = "--apply" in sys.argv

TILE = '''  { key:"pcocapp", section:"Permits",
    title:"PCOC Amendments app — permit amendments from Canopy scope changes",
    desc:"Every Canopy scope change that changed a case's construction cost after its permit, up or down. New ones land in Intake each morning; each case then moves through 5 steps: papers to the PA, the Permit Amendment Notice, paying the town (or claiming the refund), proof to the PA, and the PCOC. Papers are saved in Quickbase and copied to Drive per case. Sign in with your Byrdson Google account.",
    url:"https://pcoc-amendments.vercel.app/", color:"#1F3864", soft:"#e8edf6",
    icon:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8.5 15.5l2.2 2.2 4.8-4.8"/>' },
'''


def post(d):
    d["usertoken"] = TOK
    req = urllib.request.Request(
        "https://%s/db/%s" % (REALM, APP), data=urllib.parse.urlencode(d).encode()
    )
    return urllib.request.urlopen(req).read().decode()


def norm(s):
    """Quickbase stores newlines as <BR/> and hands them back that way."""
    s = s.replace("<BR/>\n", "\n").replace("<BR/>", "\n").replace("\r", "")
    return s.strip("\n \t")


def pull(pid):
    x = post({"act": "API_GetDBPage", "pageID": pid})
    m = re.search(r"<pagebody>(.*)</pagebody>", x, re.S)
    if not m:
        sys.exit("Could not read page %s" % pid)
    return norm(html.unescape(m.group(1)))


live = pull(PAGE)
if 'key:"pcocapp"' in live:
    sys.exit("pcocapp is already on page %d — nothing to do." % PAGE)
before = os.path.join(HERE, "page43.before-pcoc.html")
open(before, "w", encoding="utf-8", newline="\n").write(live)
print("pulled live page %d: %d chars (saved as page43.before-pcoc.html — the revert point)" % (PAGE, len(live)))

# 1. the tile, right after the old PCOC tile
start = live.find('  { key:"pcocamend"')
if start < 0:
    sys.exit("Old pcocamend tile not found — the TILES block has changed shape. Edit by hand.")
nxt = live.find("\n  { key:", start + 10)
if nxt < 0:
    sys.exit("Could not find the tile after pcocamend. Edit by hand.")
updated = live[: nxt + 1] + TILE + live[nxt + 1 :]

# 2. the Permits role's short list
m = re.search(r"\{key:'permits',.*?also:\[(.*?)\]\}", updated, re.S)
if not m:
    sys.exit("Permits role not matched — the ROLES block has changed shape. Edit by hand.")
current = [k.strip().strip("'") for k in m.group(1).split(",") if k.strip()]
print("Permits also list is now:", current)
wanted = list(current)
wanted.insert(wanted.index("pcocamend") if "pcocamend" in wanted else len(wanted), "pcocapp")
updated = updated[: m.start(1)] + ",".join("'%s'" % k for k in wanted) + updated[m.end(1) :]
print("Permits also list becomes:", wanted)

print("\ndiff:")
for line in difflib.unified_diff(live.splitlines(), updated.splitlines(), "live", "updated", n=0, lineterm=""):
    if line.startswith(("+", "-")) and not line.startswith(("+++", "---")):
        print("  " + line[:180])

if len(updated) - len(live) > len(TILE) + 40:
    sys.exit("That changed more than one tile and one role list. Refusing.")

if not APPLY:
    print("\nDry run. Re-run with --apply to write page %d." % PAGE)
    sys.exit(0)

post({"act": "API_AddReplaceDBPage", "pageID": str(PAGE), "pagetype": "1", "pagebody": updated})

# Prove what landed is what was sent, rather than trusting the 200.
back = pull(PAGE)
if norm(back) != norm(updated):
    open(os.path.join(HERE, "page43.landed.html"), "w", encoding="utf-8", newline="\n").write(back)
    sys.exit("What landed differs from what was sent. Saved as page43.landed.html. Revert with page43.before-pcoc.html.")
print("\nwritten. pcocapp tile on the live page:", 'key:"pcocapp"' in back)
