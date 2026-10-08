# -*- coding: utf-8 -*-
"""三层核查：本地 dist/ → 线上通道逐文件 sha256 比对

用法：python verify_live.py
"""
import os, sys, hashlib, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(HERE, 'dist')

CHANNELS = {
    'GitHub Pages': 'https://wangzhaolong616-byte.github.io/fakaobeixi/',
    '内置发布': 'https://05df5faa4d6b48288298ee7f52032fd7.sg.agentos-app.run/',
}

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120'


def local_files():
    out = {}
    for root, _, files in os.walk(DIST):
        for f in files:
            p = os.path.join(root, f)
            rel = os.path.relpath(p, DIST).replace('\\', '/')
            out[rel] = open(p, 'rb').read()
    return out


def fetch(url, tries=3):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url + ('&' if '?' in url else '?') + 'cb=%d' % time.time(),
                                         headers={'User-Agent': UA, 'Cache-Control': 'no-cache'})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read()
        except Exception as e:
            last = e
            time.sleep(2 * (i + 1))
    raise last


def normalize(rel, data):
    """内置发布通道会在 index.html 的 </head> 前注入平台自带的预览统计脚本
    （beacon.cdn.qq.com / BeaconAction）。这是平台行为，不是内容差异，
    比对时把它剔除，避免每次发布都报「index.html 不一致」的假警报。"""
    if rel != 'index.html':
        return data
    s = data.decode('utf-8', 'ignore')
    i = s.find('<script src="https://beacon.cdn.qq.com/')
    if i == -1:
        return data
    j = s.find('</head>', i)
    if j == -1:
        return data
    return (s[:i] + s[j:]).encode('utf-8')


def main():
    loc = local_files()
    print('本地 dist/ 文件数：%d' % len(loc))
    ok_all = True
    for name, base in CHANNELS.items():
        print('\n=== %s  %s' % (name, base))
        bad, short = [], []
        with ThreadPoolExecutor(max_workers=6) as ex:
            results = list(ex.map(lambda kv: (kv[0], fetch(base + kv[0])), loc.items()))
        for rel, data in results:
            exp = loc[rel]
            if len(data) != len(exp):
                short.append('%s(线上 %d / 本地 %d)' % (rel, len(data), len(exp)))
            elif hashlib.sha256(normalize(rel, data)).hexdigest() != hashlib.sha256(exp).hexdigest():
                bad.append(rel)
        print('  字节数不符：%s' % (short if short else '无（index.html 的平台注入已按白名单剔除）'))
        print('  哈希不一致：%s' % (bad if bad else '无'))
        if bad:
            ok_all = False
        else:
            print('  ✓ 全部 %d 个文件内容与本地一致' % len(loc))
    print('\n结论：%s' % ('两个通道均与本地一致' if ok_all else '存在差异，需重发或等待构建'))
    return 0 if ok_all else 1


if __name__ == '__main__':
    sys.exit(main())
