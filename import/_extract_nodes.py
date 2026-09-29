import re, sys, json
sys.stdout.reconfigure(encoding='utf-8')
s = open('js/data-knowledge.js', encoding='utf-8').read()
pat = re.compile(r"id:\s*['\"]([^'\"]+)['\"].*?sec:\s*['\"]([^'\"]+)['\"].*?name:\s*['\"]([^'\"]+)['\"]", re.S)
res = pat.findall(s)
print("count:", len(res))
out = {}
for i, sec, name in res:
    out.setdefault(sec, []).append((i, name))
for sec in out:
    print("==", sec, len(out[sec]))
    for i, name in out[sec]:
        print("  ", i, name)
