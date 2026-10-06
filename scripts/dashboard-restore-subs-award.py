"""Put the Subcontractor Award System back on the Finance role's short list.

    python scripts/dashboard-restore-subs-award.py            # dry run, shows the diff
    python scripts/dashboard-restore-subs-award.py --apply

Why it went missing
-------------------
Nothing deleted it. On 2026-09-10 the master dashboard (page 43) was rebuilt
around a role picker: each job gets one start page and a short `also` list, and
everything else is reachable only through the searchable list at the bottom.
The 2026-09-26 backup still had `subsawardapp` on the Finance list. The
2026-09-29 rewrite replaced that list wholesale — start went from `oikanban` to
`subpay` and the seven entries beside it are all different — and the award app
was not carried across. The tile still exists and still works; it simply stopped
being one of the seven Finance sees.

What this changes, and nothing else
-----------------------------------
Two keys are appended to the Finance role's `also` list: `subsawardapp` and
`fondoreview`. No tile is added, moved, re-pointed or deleted, and no other
role is touched.

Re-runnable: it refuses if either key is already on the Finance list, so a
second run cannot duplicate an entry. page43.before.html next to this script is
the byte-exact page from before the edit — deploy that to revert.
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
ADD = ["subsawardapp", "fondoreview"]


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
before = os.path.join(HERE, "page43.before.html")
open(before, "w", encoding="utf-8", newline="\n").write(live)
print("pulled live page %d: %d chars (saved as page43.before.html — the revert point)" % (PAGE, len(live)))

# The tiles themselves must already exist; this only changes which role sees them.
for key in ADD:
    if ('key:"%s"' % key) not in live:
        sys.exit("Tile %r is not on the page at all. This script only changes ROLES." % key)

m = re.search(r"\{key:'finance',.*?also:\[(.*?)\]\}", live, re.S)
if not m:
    sys.exit("Finance role not matched — the ROLES block has changed shape. Edit by hand.")

current = [k.strip().strip("'") for k in m.group(1).split(",") if k.strip()]
print("Finance also list is now:", current)

already = [k for k in ADD if k in current]
if already:
    sys.exit("Already on the Finance list: %s — nothing to do." % ", ".join(already))

wanted = current + ADD
old_list = m.group(1)
new_list = ",".join("'%s'" % k for k in wanted)
updated = live[: m.start(1)] + new_list + live[m.end(1) :]

print("Finance also list becomes:", wanted)
print("\ndiff:")
for line in difflib.unified_diff(
    live.splitlines(), updated.splitlines(), "live", "updated", n=1, lineterm=""
):
    if line.startswith(("+", "-")) and not line.startswith(("+++", "---")):
        print("  " + line[:200])

if len(updated) - len(live) > 200:
    sys.exit("That changed more than a role list would. Refusing.")

if not APPLY:
    print("\nDry run. Re-run with --apply to write page %d." % PAGE)
    sys.exit(0)

post({"act": "API_AddReplaceDBPage", "pageID": str(PAGE), "pagetype": "1", "pagebody": updated})

# Prove what landed is what was sent, rather than trusting the 200.
back = pull(PAGE)
if norm(back) != norm(updated):
    open(os.path.join(HERE, "page43.landed.html"), "w", encoding="utf-8", newline="\n").write(back)
    sys.exit("What landed differs from what was sent. Saved as page43.landed.html. Revert with page43.before.html.")

m2 = re.search(r"\{key:'finance',.*?also:\[(.*?)\]\}", back, re.S)
print("\nwritten. Finance also list on the live page:", [k.strip().strip("'") for k in m2.group(1).split(",")])
