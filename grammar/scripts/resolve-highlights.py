# Resolve effective highlight per node: highest pattern index wins (Zed semantics);
# within a pattern, the rightmost capture name (Zed fallback order) is reported.
import sys,re
src=open(sys.argv[1]).read().split('\n')
best={}; pat=0
for l in sys.stdin:
    p=re.match(r'\s+pattern: (\d+)',l)
    if p: pat=int(p.group(1)); continue
    m=re.search(r'capture: (?:\d+ - )?([\w.]+), start: \((\d+), (\d+)\), end: \((\d+), (\d+)\)',l)
    if not m: continue
    cap,r1,c1,r2,c2=m.group(1),*map(int,m.groups()[1:])
    if r1!=r2: continue
    k=(r1,c1,c2)
    if k not in best or pat>=best[k][0]: best[k]=(pat,cap)
seen=set()
for (r,c1,c2),(p,cap) in sorted(best.items()):
    t=src[r][c1:c2]
    if len(t)>34 or (t,cap) in seen or cap.startswith('punctuation'): continue
    seen.add((t,cap)); print(f'{t!r:36} {cap}')
