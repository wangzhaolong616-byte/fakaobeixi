import json, sys
sys.stdout.reconfigure(encoding='utf-8')
qs = json.load(open('_raw_q.json', encoding='utf-8'))
lo = int(sys.argv[1]) if len(sys.argv) > 1 else 0
hi = int(sys.argv[2]) if len(sys.argv) > 2 else 999
for q in qs:
    if not (lo <= q['no'] <= hi):
        continue
    print("===== Q%s  ans=%s" % (q['no'], q['ans']))
    print("STEM:", q['stem'])
    for o in q['opts']:
        print("  ", o)
    print("JX:", q['jx'])
    print()
