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

        # 答案 / 解析依赖 span 结构，必须在去掉 span 之前提取
        a = re.search(r'参考答案：<span class="Subject_Ans">(.*?)</span>', seg, re.S)
        ans = strip_tags(a.group(1)) if a else None
        j = re.search(r'<div class="Newspublic_Subject_ckjx">参考解析：<span class="Subject_Jx"></span>(.*?)</div>',
                      seg, re.S)
        if not j:
            j = re.search(r'参考解析：(.*?)</div>', seg, re.S)
        jx = strip_tags(j.group(1)) if j else None

        # 归一化：部分页面（如 2020 卷一第 2 题）把题干包在 <span> 里，
        # 去掉 span 包裹后再匹配，否则会整题漏掉
        flat = re.sub(r'</?span[^>]*>', '', seg)

        m = re.search(r'<p(?: class="Newspublic_TitThree")?>\s*(\d+)、(.*?)</p>', flat, re.S)
        if not m:
            continue
        no = int(m.group(1))
        stem = strip_tags(m.group(2))

        # 选项提取
        #   源页面有两种形态：
        #     ① 每个选项各自一个 <p>（正常）
        #     ② 两个选项被挤进同一个 <p>，中间没有任何分隔符
        #        （如 2020 卷一第 31 题：「A、…公诉B、…公诉」）
        #   因此：只在「题干之后、参考答案之前」的区间里找，
        #   再按 A、B、C、D、 标记切分，并用「顺序校验」防止
        #   把选项正文里的「A、B两公司」这类字样误当成新选项。
        after = flat[m.end():]
        ck = after.find('Newspublic_Subject_ckda')
        opt_zone = after[:ck] if ck != -1 else after

        ORDER = 'ABCD'
        opts = []
        for t in re.findall(r'<p[^>]*>(.*?)</p>', opt_zone, re.S):
            txt = strip_tags(t)
            if not txt:
                continue
            for piece in re.split(r'(?=[A-D]、)', txt):
                piece = piece.strip()
                mm = re.match(r'^([A-D])、', piece)
                if not mm:
                    continue
                # 必须是「下一个应出现的字母」，否则视为正文中的干扰字样
                if len(opts) < 4 and mm.group(1) == ORDER[len(opts)]:
                    opts.append(piece)

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
