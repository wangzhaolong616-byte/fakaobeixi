# -*- coding: utf-8 -*-
"""全路由巡检 + 交互回归（Playwright / Chromium）"""
import sys, io, json, pathlib
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).parent.resolve()
URL = (ROOT / 'index.html').as_uri()

ROUTES = [
    '#/dash', '#/tree', '#/tree/%E5%88%91%E6%B3%95',
    '#/train', '#/train/sec/%E5%88%91%E6%B3%95', '#/train/weak',
    '#/exam', '#/wrong', '#/statute', '#/newlaw', '#/subj',
    '#/data', '#/search', '#/coach', '#/diag', '#/settings',
    '#/node/LLF-01', '#/node/MF-10', '#/subj/case/SC-01',
]

errors, warns = [], []

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1440, 'height': 960})
    pg.on('console', lambda m: errors.append(f'[{m.type}] {m.text}') if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(f'[pageerror] {e}'))
    pg.on('dialog', lambda d: d.accept())   # 自动确认 confirm

    pg.goto(URL, wait_until='load')
    pg.wait_for_timeout(600)

    stats = pg.evaluate("""() => ({
        nodes: (window.DATA_KNOWLEDGE?.nodes||[]).length,
        questions: (window.DATA_QUESTIONS?.questions||[]).length,
        statutes: (window.DATA_STATUTES?.statutes||[]).length,
        newlaws: (window.DATA_NEWLAWS?.items||[]).length,
        subjCases: (window.DATA_SUBJECTIVE?.cases||[]).length,
        appState: typeof window.AppState
    })""")
    print('数据自检:', json.dumps(stats, ensure_ascii=False))

    print('\n--- 路由巡检 ---')
    for r in ROUTES:
        before = len(errors)
        pg.goto(URL + r, wait_until='load')
        pg.wait_for_timeout(240)
        body = pg.evaluate('document.body.innerText.length')
        newerr = len(errors) - before
        flag = 'ERR' if newerr else ' ok'
        print(f'  [{flag}] {r[:34]:<36} bodyText={body}')
        if body < 300:
            warns.append(f'{r} 渲染内容过少 (bodyText={body})')

    # ---------- 训练：成组出题 ----------
    print('\n--- 训练：成组出题 ---')
    pg.goto(URL + '#/train', wait_until='load'); pg.wait_for_timeout(400)
    txt = pg.evaluate('document.body.innerText')
    print('  按钮文案含「开始一组训练」:', '开始一组训练' in txt)
    print('  页面是否出现「真题教学模式」(应为 False):', '真题教学模式' in txt)
    btn = pg.query_selector('#start-random')
    if btn:
        btn.click(); pg.wait_for_timeout(600)
        head = pg.evaluate('document.body.innerText')
        import re
        m = re.search(r'第 1 / (\d+) 题', head)
        print('  点击后组卷题数:', m.group(1) if m else '未识别')
        # 答一题
        opt = pg.query_selector('.opt')
        if opt:
            opt.click(); pg.wait_for_timeout(200)
            sb = pg.query_selector('#submit-q')
            if sb: sb.click(); pg.wait_for_timeout(400)
            after = pg.evaluate('document.body.innerText')
            print('  作答后出现解析:', '第 1 层' in after)
            print('  作答后出现陷阱/变形:', '第 5 层' in after)
    else:
        warns.append('训练页未找到 #start-random')

    # ---------- 模拟考试：标准卷组卷 ----------
    print('\n--- 模拟考试：标准卷组卷 ---')
    pg.goto(URL + '#/exam', wait_until='load'); pg.wait_for_timeout(500)
    ex = pg.evaluate('document.body.innerText')
    print('  显示题型结构:', '单项选择题' in ex)
    print('  显示按分计分:', '按分计分' in ex or '得分' in ex)
    full_btn = pg.query_selector('[data-exam="full"]')
    if full_btn and not full_btn.is_disabled():
        full_btn.click(); pg.wait_for_timeout(900)
        q = pg.evaluate('document.body.innerText')
        m = re.search(r'第 1 / (\d+) 题', q)
        print('  标准卷题数:', m.group(1) if m else '未识别')
        print('  含考试计时器:', bool(pg.query_selector('#exam-clock')))
        print('  含提前交卷按钮:', bool(pg.query_selector('#exam-quit')))
        clock1 = pg.inner_text('#exam-clock') if pg.query_selector('#exam-clock') else ''
        pg.wait_for_timeout(1600)
        clock2 = pg.inner_text('#exam-clock') if pg.query_selector('#exam-clock') else ''
        print(f'  计时器走动: {clock1} -> {clock2}  {"OK" if clock1 != clock2 else "未走动!"}')
        # 走一遍：每题直接提交+下一题，直到交卷
        for i in range(1000):
            if not pg.query_selector('#submit-q'):
                break
            o = pg.query_selector('.opt')
            if o: o.click(); pg.wait_for_timeout(40)
            sb = pg.query_selector('#submit-q')
            if sb: sb.click(); pg.wait_for_timeout(80)
            nx = pg.query_selector('#next-q')
            if not nx: break
            nx.click(); pg.wait_for_timeout(100)
            if pg.query_selector('.stat-row') and '模拟考试结果' in pg.evaluate('document.body.innerText'):
                break
        res = pg.evaluate('document.body.innerText')
        print('  出现考试结果页:', '模拟考试结果' in res)
        print('  结果含各题型得分:', '各题型得分' in res)
        print('  结果含折算合格线:', '折算合格线参考' in res)
        print('  结果含按分计分:', '按分计分' in res)
    else:
        warns.append('标准卷按钮不可用（题库题型储备不足）')

    # ---------- 数据持久化 ----------
    ls = pg.evaluate("() => Object.keys(localStorage)")
    print('\n  localStorage keys:', ls)
    rec = pg.evaluate("() => { try { return JSON.parse(localStorage.getItem('fakao2026.system.v1')).examRecords.slice(-1)[0]; } catch(e){ return null; } }")
    print('  最新考试记录:', json.dumps(rec, ensure_ascii=False)[:220] if rec else None)

    b.close()

print('\n================ 汇总 ================')
print('控制台错误总数:', len(errors))
for e in errors[:20]:
    print('  ', e)
print('渲染警告:', len(warns))
for w in warns:
    print('  ', w)
print('======================================')
sys.exit(1 if errors else 0)
