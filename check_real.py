# -*- coding: utf-8 -*-
"""真题导入后的界面核对：
   1. 驾驶舱是否显示「回忆版」与考频来源声明
   2. 训练页题库声明与「只做历年真题」入口
   3. 知识树节点是否标注回忆版考频
   4. 全路由巡检控制台错误必须为 0
"""
import re, sys, pathlib
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent
URL = 'file:///' + str(ROOT / 'index.html').replace('\\', '/')
errs = []

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1440, 'height': 900})
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))

    def go(hash_):
        pg.goto(URL + hash_, wait_until='load')
        pg.wait_for_timeout(400)
        # 首次打开会被强制重定向到入学诊断页，先跳过再进入目标路由
        if pg.locator('text=先跳过').count() and pg.evaluate('location.hash') != hash_:
            pg.locator('text=先跳过').first.click()
            pg.wait_for_timeout(300)
            pg.goto(URL + hash_, wait_until='load')
            pg.wait_for_timeout(400)

    go('#/dash')
    print('[驾驶舱] 当前路由:', pg.evaluate('location.hash'))
    t = pg.inner_text('#view')
    print('[驾驶舱] 含「回忆版」:', '回忆版' in t)
    print('[驾驶舱] 含「考频基于」:', '考频基于' in t)
    print('[驾驶舱] 含「不存在官方考频数据」:', '不存在官方考频数据' in t)
    idx = t.find('题库总量')
    print('[驾驶舱] 题库构成片段:', t[idx:idx + 120].replace('\n', ' | ') if idx >= 0 else '未找到')

    go('#/train')
    t2 = pg.inner_text('#view')
    m = re.search(r'当前题库共.*?道。', t2, re.S)
    print('[训练] 题库声明:', m.group(0) if m else '未找到')
    print('[训练] 含「只做历年真题」:', '只做历年真题' in t2)

    go('#/tree')
    t3 = pg.inner_text('#view')
    print('[知识树] 含「（回忆版）」:', '（回忆版）' in t3)

    go('#/train/real')
    t4 = pg.inner_text('#view')
    print('[真题训练] 前 80 字:', t4[:80].replace('\n', ' | '))

    # 全路由巡检
    routes = ['dash', 'tree', 'node/MF-05', 'compare', 'train', 'train/real', 'exam', 'wrong',
              'trap', 'statute', 'newlaw', 'subj', 'data', 'search', 'coach', 'diag', 'settings']
    for r in routes:
        go('#/' + r)
    print('[巡检] 路由数:', len(routes))

    b.close()

print('console errors:', len(errs))
for e in errs[:15]:
    print('  !', e[:200])
