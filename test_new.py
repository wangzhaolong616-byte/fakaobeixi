# -*- coding: utf-8 -*-
"""新增模块专项测试：陷阱库 / 对比辨析 / 单题精练"""
import sys, io, pathlib
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).parent.resolve()
URL = (ROOT / 'index.html').as_uri()
errors = []

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1440, 'height': 1000})
    pg.on('console', lambda m: errors.append(f'[{m.type}] {m.text}') if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(f'[pageerror] {e}'))
    pg.on('dialog', lambda d: d.accept())

    print('--- 命题陷阱库 ---')
    pg.goto(URL + '#/trap', wait_until='load'); pg.wait_for_timeout(600)
    t = pg.evaluate('document.body.innerText')
    print('  渲染条目数:', pg.eval_on_selector_all('.trap-item', 'els=>els.length'))
    print('  含统计行:', '陷阱条目总数' in t)
    print('  含自动归类说明:', '不是官方分类' in t)
    print('  含板块筛选:', '按板块筛选' in t)
    print('  含类型筛选:', '按陷阱类型筛选' in t)

    # 板块筛选
    pg.goto(URL + '#/trap/' + '刑法', wait_until='load'); pg.wait_for_timeout(500)
    t2 = pg.evaluate('document.body.innerText')
    print('  筛选刑法后含「板块 · 刑法」:', '板块 · 刑法' in t2)

    # 陷阱类型筛选
    pg.goto(URL + '#/trap/' + '概念混淆', wait_until='load'); pg.wait_for_timeout(500)
    t3 = pg.evaluate('document.body.innerText')
    print('  筛选类型后含「陷阱类型 · 概念混淆」:', '陷阱类型 · 概念混淆' in t3)

    # 再显示更多
    pg.goto(URL + '#/trap', wait_until='load'); pg.wait_for_timeout(500)
    n1 = pg.eval_on_selector_all('.trap-item', 'els=>els.length')
    more = pg.query_selector('#trap-more')
    if more:
        more.click(); pg.wait_for_timeout(500)
        n2 = pg.eval_on_selector_all('.trap-item', 'els=>els.length')
        print(f'  显示更多: {n1} -> {n2}')
    else:
        print('  显示更多按钮: 不存在（条目少于60）')

    # 单题精练跳转
    link = pg.query_selector('.trap-item-foot a.btn')
    if link:
        href = link.get_attribute('href')
        print('  练这道题链接:', href)
        link.click(); pg.wait_for_timeout(700)
        q = pg.evaluate('document.body.innerText')
        print('  跳转后含「单题精练」:', '单题精练' in q)
        print('  跳转后有选项:', pg.eval_on_selector_all('.opt', 'els=>els.length'))
    else:
        print('  !! 未找到练这道题链接')

    print('\n--- 相似概念对比辨析 ---')
    pg.goto(URL + '#/compare', wait_until='load'); pg.wait_for_timeout(600)
    c = pg.evaluate('document.body.innerText')
    print('  渲染卡片数:', pg.eval_on_selector_all('.cmp-card', 'els=>els.length'))
    print('  含对比对总数:', '对比对总数' in c)
    print('  辨析默认隐藏:', pg.eval_on_selector_all('.cmp-body[hidden]', 'els=>els.length'))
    print('  含训练按钮:', bool(pg.query_selector('#cmp-train')))

    # 展开辨析
    tb = pg.query_selector('[data-cmp-toggle]')
    if tb:
        tb.click(); pg.wait_for_timeout(300)
        print('  点击后展开的辨析数:', pg.eval_on_selector_all('.cmp-body:not([hidden])', 'els=>els.length'))
        print('  按钮文字变为收起:', tb.inner_text())

    # 板块筛选
    pg.goto(URL + '#/compare/' + '民法', wait_until='load'); pg.wait_for_timeout(500)
    print('  筛选民法后卡片数:', pg.eval_on_selector_all('.cmp-card', 'els=>els.length'))

    # 对比辨析训练
    pg.goto(URL + '#/compare', wait_until='load'); pg.wait_for_timeout(500)
    ct = pg.query_selector('#cmp-train')
    if ct:
        ct.click(); pg.wait_for_timeout(800)
        q = pg.evaluate('document.body.innerText')
        import re
        m = re.search(r'第 1 / (\d+) 题', q)
        print('  辨析训练题数:', m.group(1) if m else '未识别')
        print('  含面包屑「对比辨析训练」:', '对比辨析训练' in q)

    b.close()

print('\n控制台错误总数:', len(errors))
for e in errors[:15]:
    print('  ', e)
sys.exit(1 if errors else 0)
