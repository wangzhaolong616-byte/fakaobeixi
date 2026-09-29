import re, sys, json
sys.stdout.reconfigure(encoding='utf-8')

files = ["raw_26140213708162.html", "raw_26140855525357.html",
         "raw_27141525127606.html", "raw_27141930274411.html",
         "raw_27143132120572.html"]


def strip_tags(t):
    t = re.sub(r'<br\s*/?>', '\n', t)
    t = re.sub(r'<[^>]+>', '', t)
    t = t.replace('&nbsp;', ' ').replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
    t = re.sub(r'[ \t]+', ' ', t)
    t = re.sub(r'\s*\n\s*', '', t)
    return t.strip()


all_q = []
for f in files:
    s = open(f, 'rb').read().decode('utf-8', 'replace')
    # 按题块切分
    starts = [m.start() for m in re.finditer(r'<div class="Newspublic_Subject">', s)]
    print("==== %s  blocks=%d" % (f, len(starts)))
    for n, st in enumerate(starts):
        end = starts[n + 1] if n + 1 < len(starts) else len(s)
        seg = s[st:end]
        # 截断到本块答案区之后，避免吃到后续无关内容
        tail = seg.find('<div class="Newspublic_Subject_ckjx">')
        if tail != -1:
            close = seg.find('</div>', seg.find('</span>', tail))
            if close != -1:
                seg = seg[:close + 6]
        m = re.search(r'<p(?: class="Newspublic_TitThree")?>\s*(\d+)、(.*?)</p>', seg, re.S)
        if not m:
            print("  !! no stem in block", n)
            continue
        no = int(m.group(1))
        stem = strip_tags(m.group(2))
        opts = [strip_tags(x) for x in re.findall(r'<p>([ABCD]、.*?)</p>', seg, re.S)]
        a = re.search(r'参考答案：<span class="Subject_Ans">(.*?)</span>', seg, re.S)
        ans = strip_tags(a.group(1)) if a else None
        j = re.search(r'<div class="Newspublic_Subject_ckjx">参考解析：<span class="Subject_Jx"></span>(.*?)</div>', seg, re.S)
        if not j:
            j = re.search(r'参考解析：(.*?)</div>', seg, re.S)
        jx = strip_tags(j.group(1)) if j else None
        print("  Q%-3d opts=%d ans=%-8s jx=%s" % (no, len(opts), ans, len(jx) if jx else 0))
        all_q.append(dict(no=no, stem=stem, opts=opts, ans=ans, jx=jx))

all_q.sort(key=lambda x: x['no'])
json.dump(all_q, open('_raw_q.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print("total:", len(all_q), [q['no'] for q in all_q])
