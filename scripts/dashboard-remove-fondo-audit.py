"""Take the Fondo Coverage & Audit tile off the CM v2 master dashboard (page 43).

    python scripts/dashboard-remove-fondo-audit.py            # dry run, shows the diff
    python scripts/dashboard-remove-fondo-audit.py --apply

Why
---
The Fondo Polizas page in the award app (/fondo/review) now carries the same
open-award list (page 206's rule) with To review / Send link / Approved tabs,
so the user asked for the second Fondo tile to go (2026-10-28).

What this changes, and nothing else
-----------------------------------
Removes the `fondoaudit` tile from DASHBOARDS and the `fondoaudit` key from any
role's `also` list. Code page 206 itself is NOT deleted; it still opens at
its own URL. page43.before-fondoaudit.html next to this script is the
byte-exact page from before the edit: deploy that to revert.
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
KEY = "fondoaudit"
HERE = os.path.dirname(os.path.abspath(__file__))
APPLY = "--apply" in sys.argv


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
before = os.path.join(HERE, "page43.before-fondoaudit.html")
open(before, "w", encoding="utf-8", newline="\n").write(live)
print("pulled live page %d: %d chars (saved as %s, the revert point)" % (PAGE, len(live), os.path.basename(before)))

# The tile object: from `{ key:"fondoaudit"` to the `},` that closes it.
tile = re.search(r'\n[ \t]*\{ key:"%s",.*?\},[ \t]*(?=\n)' % KEY, live, re.S)
if not tile:
    sys.exit("Tile %r not found. Already removed?" % KEY)
if tile.group(0).count("key:") != 1 or "Fondo Coverage" not in tile.group(0):
    sys.exit("The match spans more than the one tile. Edit by hand.")
updated = live[: tile.start()] + live[tile.end() :]

# Role short lists: drop the key wherever it appears, with its comma.
updated, n_roles = re.subn(r",'%s'(?=[,\]])|'%s',|(?<=\[)'%s'(?=\])" % (KEY, KEY, KEY), "", updated)
left = updated.count(KEY)
print("tile removed; %d role list entr%s removed; %d mention(s) left" % (n_roles, "y" if n_roles == 1 else "ies", left))
if left:
    sys.exit("The key still appears somewhere. Refusing.")

print("\ndiff:")
for line in difflib.unified_diff(live.splitlines(), updated.splitlines(), "live", "updated", n=0, lineterm=""):
    if line.startswith(("+", "-")) and not line.startswith(("+++", "---")):
        print("  " + line[:220])
if len(live) - len(updated) > 1200:
    sys.exit("That removed more than one tile would. Refusing.")

if not APPLY:
    print("\nDry run. Re-run with --apply to write page %d." % PAGE)
    sys.exit(0)

post({"act": "API_AddReplaceDBPage", "pageID": str(PAGE), "pagetype": "1", "pagebody": updated})
# Prove what landed is what was sent, rather than trusting the 200.
back = pull(PAGE)
if norm(back) != norm(updated):
    open(os.path.join(HERE, "page43.landed.html"), "w", encoding="utf-8", newline="\n").write(back)
    sys.exit("What landed differs from what was sent. Saved as page43.landed.html. Revert with %s." % os.path.basename(before))
print("\nwritten. '%s' on the live page: %d" % (KEY, back.count(KEY)))
