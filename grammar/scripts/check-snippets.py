"""Validate snippet bodies against Zed's snippet syntax rules.

Zed treats every unescaped `$` as a tab stop (`$1` or `${1...}`), so literal
dollar signs (e.g. regex anchors) must be written as `\\$` in the snippet body.
"""
import json, re, sys

path = sys.argv[1] if len(sys.argv) > 1 else "snippets/crowdstrike cql.json"
bad = 0
for name, snip in json.load(open(path)).items():
    body = "\n".join(snip["body"]) if isinstance(snip["body"], list) else snip["body"]
    i = 0
    while i < len(body):
        c = body[i]
        if c == "\\":
            i += 2
            continue
        if c == "$" and not re.match(r"\d|\{\d", body[i + 1 : i + 3]):
            print(f"{name!r}: unescaped '$' at: {body[max(0, i - 15) : i + 10]!r}")
            bad += 1
        i += 1
print("OK" if not bad else f"{bad} problem(s)")
sys.exit(1 if bad else 0)
