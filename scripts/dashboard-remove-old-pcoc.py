"""Remove the old PCOC tile (Jim's code page 177) from the CM v2 master dashboard.

    python scripts/dashboard-remove-old-pcoc.py            # dry run, shows the diff
    python scripts/dashboard-remove-old-pcoc.py --apply

What this changes, and nothing else
-----------------------------------
1. The `pcocamend` tile (url QB+"177") is deleted from the tiles list.
2. `pcocamend` is taken off the Permits role's `also` list.
The new `pcocapp` tile (https://pcoc-amendments.vercel.app/) stays. Code page
177 itself is not touched; only the dashboard stops linking to it.

Refuses if `pcocapp` is missing (so the dashboard is never left without a PCOC
tile) or if `pcocamend` is already gone. page43.before-remove-pcoc.html next to
this script is the byte-exact page from before the edit — deploy it to revert.
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


def post(d):
    d["usertoken"] = TOK
    req = urllib.request.Request("https://%s/db/%s" % (REALM, APP), data=urllib.parse.urlencode(d).encode())
    return urllib.request.urlopen(req).read().decode()


def norm(s):
    s = s.replace("<BR/>\n", "\n").replace("<BR/>", "\n").replace("\r", "")
    return s.strip("\n \t")


def pull(pid):
    x = post({"act": "API_GetDBPage", "pageID": pid})
    m = re.search(r"<pagebody>(.*)</pagebody>", x, re.S)
    if not m:
        sys.exit("Could not read page %s" % pid)
    return norm(html.unescape(m.group(1)))


live = pull(PAGE)
if 'key:"pcocapp"' not in live:
    sys.exit("The new pcocapp tile is not on the page — refusing to remove the only PCOC tile.")
if 'key:"pcocamend"' not in live:
    sys.exit("pcocamend is already gone — nothing to do.")
open(os.path.join(HERE, "page43.before-remove-pcoc.html"), "w", encoding="utf-8", newline="\n").write(live)
print("pulled live page %d: %d chars (saved as page43.before-remove-pcoc.html — the revert point)" % (PAGE, len(live)))

# 1. the tile object: from its line to the start of the next tile
start = live.find('  { key:"pcocamend"')
nxt = live.find("\n  { key:", start + 10)
if start < 0 or nxt < 0:
    sys.exit("Could not isolate the pcocamend tile. Edit by hand.")
block = live[start: nxt + 1]
if 'url:QB+"177"' not in block or block.count("{ key:") != 1:
    sys.exit("The block found is not exactly the page-177 tile. Edit by hand.")
updated = live[:start] + live[nxt + 1:]

# 2. the Permits role's short list
m = re.search(r"\{key:'permits',.*?also:\[(.*?)\]\}", updated, re.S)
if not m:
    sys.exit("Permits role not matched. Edit by hand.")
current = [k.strip().strip("'") for k in m.group(1).split(",") if k.strip()]
wanted = [k for k in current if k != "pcocamend"]
updated = updated[: m.start(1)] + ",".join("'%s'" % k for k in wanted) + updated[m.end(1):]
print("Permits also list:", current, "->", wanted)

if "pcocamend" in updated:
    sys.exit("pcocamend is still referenced somewhere else on the page. Edit by hand.")

print("\ndiff:")
for line in difflib.unified_diff(live.splitlines(), updated.splitlines(), "live", "updated", n=0, lineterm=""):
    if line.startswith(("+", "-")) and not line.startswith(("+++", "---")):
        print("  " + line[:170])

if len(live) - len(updated) > len(block) + 40:
    sys.exit("That removed more than one tile and one list entry. Refusing.")

if not APPLY:
    print("\nDry run. Re-run with --apply to write page %d." % PAGE)
    sys.exit(0)

post({"act": "API_AddReplaceDBPage", "pageID": str(PAGE), "pagetype": "1", "pagebody": updated})
back = pull(PAGE)
if norm(back) != norm(updated):
    open(os.path.join(HERE, "page43.landed.html"), "w", encoding="utf-8", newline="\n").write(back)
    sys.exit("What landed differs from what was sent. Saved as page43.landed.html. Revert with page43.before-remove-pcoc.html.")
print("\nwritten. pcocamend on the live page:", "pcocamend" in back, "| pcocapp:", 'key:"pcocapp"' in back)
