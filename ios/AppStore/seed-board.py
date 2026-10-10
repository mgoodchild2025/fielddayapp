#!/usr/bin/env python3
"""Seed the Scoreboard app's saved board on a simulator: seed.py <device> <bundle> <scenario>"""
import json, subprocess, sys, time

def rally(a, b):
    ev = []
    # Interleave so the event log looks like a real game.
    i = j = 0
    while i < a or j < b:
        if i < a and (i * b <= j * a or j >= b): ev.append({"t": "A", "d": 1}); i += 1
        else: ev.append({"t": "B", "d": 1}); j += 1
    return ev

def sets(*scores, end=False, live=None):
    ev = []
    for a, b in scores:
        ev += rally(a, b) + [{"t": "set"}]
    if live: ev += rally(*live)
    if end: ev.append({"t": "end"})
    return ev

SCENARIOS = {
    "midgame": dict(teamA=("SAND SHARKS", "#0891B2"), teamB=("BLOCK PARTY", "#EA580C"), mode="sets", events=sets((25, 21), live=(18, 16))),
    "setpoint": dict(teamA=("SAND SHARKS", "#0891B2"), teamB=("BLOCK PARTY", "#EA580C"), mode="sets", events=sets((25, 21), live=(24, 23))),
    "final": dict(teamA=("SAND SHARKS", "#0891B2"), teamB=("BLOCK PARTY", "#EA580C"), mode="sets", events=sets((25, 21), (23, 25), (15, 12), end=True)),
    "free": dict(teamA=("FALCONS", "#DC2626"), teamB=("RIVERHAWKS", "#2563EB"), mode="free", events=rally(42, 39)),
    "clock": dict(teamA=("SAND SHARKS", "#0891B2"), teamB=("BLOCK PARTY", "#EA580C"), mode="sets", events=sets((25, 21), live=(18, 16)),
                  clock={"mode": "countdown", "lengthMs": 20000, "accumulatedMs": 0, "timeoutLengthMs": 30000,
                         "timeoutsUsed": {"A": 1, "B": 0}, "resumeAfterTimeout": False, "sound": True, "start": True}),
    # Screenshots: a 20-minute countdown at 14:27, running, mid-set…
    "clockshot": dict(teamA=("SAND SHARKS", "#0891B2"), teamB=("BLOCK PARTY", "#EA580C"), mode="sets", events=sets((25, 21), live=(18, 16)),
                      clock={"mode": "countdown", "lengthMs": 1200000, "accumulatedMs": 0, "timeoutLengthMs": 30000,
                             "timeoutsUsed": {"A": 1, "B": 0}, "resumeAfterTimeout": False, "sound": True, "startedAgoMs": 333000}),
    # …and the same game during a BLOCK PARTY timeout (0:18 left, clock paused at 14:27).
    "timeoutshot": dict(teamA=("SAND SHARKS", "#0891B2"), teamB=("BLOCK PARTY", "#EA580C"), mode="sets", events=sets((25, 21), live=(18, 16)),
                        clock={"mode": "countdown", "lengthMs": 1200000, "accumulatedMs": 333000, "timeoutLengthMs": 30000,
                               "timeoutsUsed": {"A": 1, "B": 1}, "resumeAfterTimeout": True, "sound": True, "timeoutAgoMs": ["B", 12000]}),
    "dinks": dict(teamA=("DINK DYNASTY", "#7C3AED"), teamB=("NET GAINS", "#0E9F6E"), mode="sets", events=sets((11, 7), live=(9, 6))),
}

dev, bundle, name = sys.argv[1:4]
s = SCENARIOS[name]
board = {"v": 1, "events": s["events"], "teamA": {"name": s["teamA"][0], "color": s["teamA"][1]},
         "teamB": {"name": s["teamB"][0], "color": s["teamB"][1]}, "config": {"mode": s["mode"]},
         "swapped": False, "updatedAt": 1e15, "rev": 1000000000}
if "clock" in s:
    c = dict(s["clock"])
    if c.pop("start", False):
        c["runningSince"] = time.time() * 1000
    ago = c.pop("startedAgoMs", None)
    if ago is not None:
        c["runningSince"] = time.time() * 1000 - ago
    tmo = c.pop("timeoutAgoMs", None)
    if tmo is not None:
        c["timeout"] = {"side": tmo[0], "startedAt": time.time() * 1000 - tmo[1]}
    board["clock"] = c
hexdata = json.dumps(board, separators=(",", ":")).encode().hex()
subprocess.run(["xcrun", "simctl", "terminate", dev, bundle], capture_output=True)
time.sleep(1)
# UserDefaults' argument domain (-key <plist data>) wins over the app's own
# saved board, so the seed applies however the app was used before.
subprocess.run(["xcrun", "simctl", "launch", dev, bundle, "-fieldday-scoreboard-v1", f"<{hexdata}>"], check=True, capture_output=True)
print("launched", name, len(s["events"]), "events")
