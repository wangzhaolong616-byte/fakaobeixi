# -*- coding: utf-8 -*-
"""主观题作答自评 + 学习趋势图 + 移动端适配 专项测试"""
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

    print('--- 主观题作答与自评 ---')
    pg.goto(URL + '#/subj/case/SC-01', wait_until='load'); pg.wait_for_timeout(700)
    t = pg.evaluate('document.body.innerText')
    print('  含「第三步：自己写一遍」:', '第三步：自己写一遍' in t)
    print('  含「第四步：对照踩分点自评」:', '第四步：对照踩分点自评' in t)
    print('  含「第五步：答案三档对照」:', '第五步：答案三档对照' in t)
    print('  作答框存在:', bool(pg.query_selector('#subj-input')))
    print('  踩分点勾选框数:', pg.eval_on_selector_all('#subj-check input[data-sp]', 'els=>els.length'))
    print('  初始自评区为空:', pg.inner_text('#subj-verdict') == '')

    # 勾选前 2 个踩分点
    boxes = pg.query_selector_all('#subj-check input[data-sp]')
    for i in range(min(2, len(boxes))):
        boxes[i].click(); pg.wait_for_timeout(150)
    v = pg.inner_text('#subj-verdict')
    print('  勾选 2 个后出现档位判断:', '自评档位' in v)
    print('  档位内容:', v.replace('\n', ' | ')[:110])

    # 输入并保存
    pg.fill('#subj-input', '甲的行为构成侵权，应承担赔偿责任。依据民法典第1165条……')
    pg.click('#subj-save'); pg.wait_for_timeout(600)
    print('  保存后提示文字:', pg.inner_text('#subj-saved-at'))
    st = pg.evaluate("""() => { const s = JSON.parse(localStorage.getItem('fakao2026.system.v1'));
        return s.subjAnswers && s.subjAnswers['SC-01'] ? {text: s.subjAnswers['SC-01'].text.slice(0,20), checked: s.subjAnswers['SC-01'].checked, at: s.subjAnswers['SC-01'].at} : null; }""")
    print('  localStorage 落盘:', st)

    # 重新进入页面，数据应保留
    pg.goto(URL + '#/dash', wait_until='load'); pg.wait_for_timeout(400)
    pg.goto(URL + '#/subj/case/SC-01', wait_until='load'); pg.wait_for_timeout(700)
    val = pg.input_value('#subj-input')
    print('  重进后作答保留:', val[:20] + ('…' if len(val) > 20 else ''))
    checked_now = pg.eval_on_selector_all('#subj-check input[data-sp]:checked', 'els=>els.length')
    print('  重进后勾选保留:', checked_now)

    # 再保存一次 -> 进入 history
    pg.fill('#subj-input', '第二版作答：补充了因果关系分析。')
    pg.click('#subj-save'); pg.wait_for_timeout(600)
    hist = pg.eval_on_selector_all('.subj-history', 'els=>els.length')
    print('  历次作答记录数:', hist)

    print('\n--- 学习趋势图 ---')
    # 先造点学习记录
    pg.goto(URL + '#/train/sec/' + '刑法', wait_until='load'); pg.wait_for_timeout(500)
    for _ in range(3):
        o = pg.query_selector('.opt')
        if o: o.click(); pg.wait_for_timeout(80)
        s = pg.query_selector('#submit-q')
        if s: s.click(); pg.wait_for_timeout(150)
        n = pg.query_selector('#next-q')
        if n: n.click(); pg.wait_for_timeout(150)

    pg.goto(URL + '#/data', wait_until='load'); pg.wait_for_timeout(600)
    d = pg.evaluate('document.body.innerText')
    print('  含「学习趋势」:', '学习趋势' in d)
    print('  含切换按钮近14天/近30天:', '近 14 天' in d and '近 30 天' in d)
    print('  SVG 图表存在:', bool(pg.query_selector('.chart-wrap svg')))
    print('  柱子数:', pg.eval_on_selector_all('.chart-wrap svg rect', 'els=>els.length'))
    print('  图例文字:', pg.eval_on_selector_all('.chart-wrap svg text', 'els=>els.length'))
    pg.goto(URL + '#/data/30', wait_until='load'); pg.wait_for_timeout(600)
    print('  切到30天柱子数:', pg.eval_on_selector_all('.chart-wrap svg rect', 'els=>els.length'))

    print('\n--- 移动端适配 ---')
    mob = b.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    mob.on('console', lambda m: errors.append(f'[mobile][{m.type}] {m.text}') if m.type == 'error' else None)
    mob.on('pageerror', lambda e: errors.append(f'[mobile][pageerror] {e}'))
    for r in ['#/dash', '#/tree', '#/exam', '#/trap', '#/compare', '#/data', '#/subj']:
        mob.goto(URL + r, wait_until='load'); mob.wait_for_timeout(320)
        w = mob.evaluate('document.documentElement.scrollWidth')
        ow = mob.evaluate('document.body.scrollWidth')
        flag = 'ok' if w <= 400 else 'OVERFLOW'
        print(f'  [{flag}] {r:<14} scrollWidth={w} bodyScrollWidth={ow}')
    # 侧栏是否变成横向
    mob.goto(URL + '#/dash', wait_until='load'); mob.wait_for_timeout(400)
    side_w = mob.eval_on_selector('.side', 'el=>el.getBoundingClientRect().width')
    print('  移动端侧栏宽度:', side_w, '(应≈390)')
    mob.screenshot(path=str(ROOT / 'shot-mobile.png'), full_page=False)
    print('  已截图 shot-mobile.png')

    pg.goto(URL + '#/dash', wait_until='load'); pg.wait_for_timeout(500)
    pg.screenshot(path=str(ROOT / 'shot-dash.png'), full_page=False)
    pg.goto(URL + '#/compare', wait_until='load'); pg.wait_for_timeout(600)
    pg.screenshot(path=str(ROOT / 'shot-compare.png'), full_page=False)

    b.close()

print('\n控制台错误总数:', len(errors))
for e in errors[:15]:
    print('  ', e)
sys.exit(1 if errors else 0)
