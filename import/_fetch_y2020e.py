# -*- coding: utf-8 -*-
"""抓取 233 网校「2020 年法考客观题试卷二 真题及答案」系列到 y2020e/

系列页标题形如：2020年法考客观题考试卷二真题及答案（1）…（20）
入口：https://www.233.com/sf/erjuan/zhenti/202106/18085830405594.html
用法：python _fetch_y2020e.py
产出：y2020e/y2020e_01.html ... + _manifest.json
"""
import os, re, sys, json, time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)
os.makedirs('y2020e', exist_ok=True)

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/120.0 Safari/537.36')
ENTRY = 'https://www.233.com/sf/erjuan/zhenti/202106/18085830405594.html'


def get(url, tries=3):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9',
                'Referer': 'https://www.233.com/sf/',
            })
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode('utf-8', 'ignore')
        except Exception as e:
            last = e
            time.sleep(1.5 * (i + 1))
    raise last


def title_of(h):
    m = re.search(r'<title>(.*?)</title>', h, re.S)
    return m.group(1).strip() if m else ''


def norm(u):
    if u.startswith('//'):
        u = 'https:' + u
    if u.startswith('/'):
        u = 'https://www.233.com' + u
    return u.replace('m.233.com', 'www.233.com')


def page_no(t):
    m = re.search(r'[（(](\d+)[）)]', t)
    return int(m.group(1)) if m else None


def main():
    got = {}          # url -> html
    frontier = [ENTRY]
    seen_url = set()
    while frontier:
        batch = [u for u in frontier if u not in seen_url]
        if not batch:
            break
        seen_url.update(batch)
        with ThreadPoolExecutor(max_workers=5) as ex:
            for u, h in zip(batch, ex.map(lambda x: (get(x)), batch)):
                got[u] = h
        nxt = []
        for u in batch:
            for l in re.findall(r'href=["\']([^"\']*erjuan/zhenti/20[^"\']*\.html)["\']', got[u]):
                l = norm(l)
                if l in seen_url:
                    continue
                t = title_of(got[u])
                # 只跟同系列（2020 卷二真题及答案（N））
                for m in re.findall(r'<a[^>]*href=["\']([^"\']+erjuan/zhenti/20[^"\']+\.html)["\'][^>]*>(.*?)</a>',
                                    got[u], re.S):
                    tt = re.sub(r'<[^>]+>', '', m[1]).strip()
                    if re.match(r'^2020年法考客观题考试卷二真题及答案（\d+）$', tt):
                        nxt.append(norm(m[0]))
        frontier = sorted(set(nxt))

    series = []
    for u, h in got.items():
        t = title_of(h)
        n = page_no(t)
        if n and '2020年法考客观题考试卷二真题及答案' in t:
            series.append((n, t, u, h))
    series.sort()

    manifest = []
    for i, (n, t, u, h) in enumerate(series, 1):
        fn = 'y2020e/y2020e_%02d.html' % n
        open(fn, 'w', encoding='utf-8').write(h)
        manifest.append({'no': n, 'title': t, 'url': u, 'file': fn, 'bytes': len(h)})
        print('  写出 %s  %6d 字节  %s' % (fn, len(h), t))
    json.dump(manifest, open('y2020e/_manifest.json', 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print('完成，共 %d 页，题号 %s' % (len(manifest), [m['no'] for m in manifest]))


if __name__ == '__main__':
    main()
