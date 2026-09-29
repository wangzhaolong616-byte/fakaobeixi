# -*- coding: utf-8 -*-
"""解析 233 网校「2019 年法考客观题考试卷一真题及答案」页面
   用法：python _parse_y1.py <html文件或目录> [输出json]

   页面结构（PC 版与移动版一致）：
     <div class="Newspublic_Subject">
       <p>N、题干</p><p>A、…</p>…
       <div class="Newspublic_Subject_ckda">参考答案：<span class="Subject_Ans">X</span>
       <div class="Newspublic_Subject_ckjx">参考解析：…
"""
import re, sys, os, glob, json
sys.stdout.reconfigure(encoding='utf-8')


def strip_tags(t):
    t = re.sub(r'<br\s*/?>', '\n', t)
    t = re.sub(r'<[^>]+>', '', t)
    t = t.replace('&nbsp;', ' ').replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
    t = re.sub(r'[ \t]+', ' ', t)
    t = re.sub(r'\s*\n\s*', '', t)
    return t.strip()


def parse(f):
    s = open(f, 'rb').read().decode('utf-8', 'replace')
    starts = [m.start() for m in re.finditer(r'<div class="Newspublic_Subject">', s)]
    out = []
    for n, st in enumerate(starts):
        end = starts[n + 1] if n + 1 < len(starts) else len(s)
        seg = s[st:end]
        tail = seg.find('<div class="Newspublic_Subject_ckjx">')
        if tail != -1:
            close = seg.find('</div>', seg.find('</span>', tail))
            if close != -1:
                seg = seg[:close + 6]
        m = re.search(r'<p(?: class="Newspublic_TitThree")?>\s*(\d+)、(.*?)</p>', seg, re.S)
        if not m:
            continue
        no = int(m.group(1))
        stem = strip_tags(m.group(2))
        opts = [strip_tags(x) for x in re.findall(r'<p>([ABCD]、.*?)</p>', seg, re.S)]
        a = re.search(r'参考答案：<span class="Subject_Ans">(.*?)</span>', seg, re.S)
        ans = strip_tags(a.group(1)) if a else None
        j = re.search(r'<div class="Newspublic_Subject_ckjx">参考解析：<span class="Subject_Jx"></span>(.*?)</div>',
                      seg, re.S)
        if not j:
            j = re.search(r'参考解析：(.*?)</div>', seg, re.S)
        jx = strip_tags(j.group(1)) if j else None
        out.append(dict(no=no, stem=stem, opts=opts, ans=ans, jx=jx, file=os.path.basename(f)))
    return out


if __name__ == '__main__':
    target = sys.argv[1]
    out_fn = sys.argv[2] if len(sys.argv) > 2 else None
    files = [target] if os.path.isfile(target) else sorted(glob.glob(os.path.join(target, '*.html')))
    allq = []
    seen = set()
    for f in files:
        qs = parse(f)
        print('%-40s blocks=%d  %s' % (os.path.basename(f), len(qs),
                                       [q['no'] for q in qs]))
        for q in qs:
            if q['no'] in seen:
                continue
            seen.add(q['no'])
            allq.append(q)
    allq.sort(key=lambda x: x['no'])
    if out_fn:
        json.dump(allq, open(out_fn, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print('写出 %s：%d 题，题号 %s' % (out_fn, len(allq), [q['no'] for q in allq]))
    else:
        for q in allq:
            print('=== Q%s ans=%r opts=%d' % (q['no'], q['ans'], len(q['opts'])))
            print(q['stem'])
            for o in q['opts']:
                print('   ', o)
            print('JX:', (q['jx'] or '')[:2000])
