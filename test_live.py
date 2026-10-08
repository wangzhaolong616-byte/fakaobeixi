# -*- coding: utf-8 -*-
"""线上站点冒烟测试：确认 GitHub Pages 上的「律灯」能真正跑起来"""
import sys
from playwright.sync_api import sync_playwright

URL = 'https://wangzhaolong616-byte.github.io/fakaobeixi/'

ROUTES = ['dash', 'tree', 'compare', 'train', 'exam', 'wrong', 'trap',
          'statute', 'newlaw', 'subj', 'data', 'search', 'coach', 'settings']

def main():
    errs, warns = [], []
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 1440, 'height': 900})
        pg = ctx.new_page()
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e)))
        pg.on('requestfailed', lambda r: errs.append('REQFAIL: ' + r.url))

        pg.goto(URL, wait_until='networkidle', timeout=60000)
        pg.wait_for_timeout(1200)
        print('[标题]', pg.title())
        print('[品牌]', pg.inner_text('.brand').replace('\n', ' | '))

        # 数据是否完整加载
        n = pg.evaluate("() => (window.DATA_QUESTIONS && window.DATA_QUESTIONS.questions || []).length")
        kn = pg.evaluate("() => (window.DATA_KNOWLEDGE && window.DATA_KNOWLEDGE.nodes || []).length")
        print('[题目数]', n, ' [知识节点]', kn)

        # 遍历全部路由
        bad = []
        for r in ROUTES:
            pg.goto(URL + '#/' + r, wait_until='domcontentloaded')
            pg.wait_for_timeout(420)
            txt = pg.inner_text('#view')
            if len(txt.strip()) < 40:
                bad.append((r, len(txt)))
        print('[路由巡检]', len(ROUTES), '条，异常', len(bad), bad if bad else '')

        # 真做一道题
        pg.goto(URL + '#/train', wait_until='domcontentloaded')
        pg.wait_for_timeout(800)
        opts = pg.query_selector_all('.opt')
        print('[题目训练] 选项数:', len(opts))
        if opts:
            opts[0].click(); pg.wait_for_timeout(300)
            for b2 in pg.query_selector_all('button'):
                t = (b2.inner_text() or '').strip()
                if '提交' in t or '确认' in t or '查看答案' in t:
                    b2.click(); break
            pg.wait_for_timeout(700)
            print('[作答后] 含解析:', '解析' in pg.inner_text('#view'))

        pg.screenshot(path='shot-live.png')
        ctx.close(); b.close()

    print('\nconsole errors:', len(errs))
    for e in errs[:6]: print('  !', e)
    return 1 if errs else 0

if __name__ == '__main__':
    sys.exit(main())
