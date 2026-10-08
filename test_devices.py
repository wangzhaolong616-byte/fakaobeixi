# -*- coding: utf-8 -*-
"""跨设备实测：华为手机 / iPad / 笔记本 三种视口下打开线上站点是否正常"""
import sys
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else \
    'https://727f625e3d3b4474a694869bb5bddc00.sg.agentos-app.run/'

# 设备视口 + UA
DEVICES = [
    ('华为手机 (P60 类)', 393, 851, 'Mozilla/5.0 (Linux; Android 12; HarmonyOS; MNA-AL00) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114 Mobile Safari/537.36'),
    ('华为手机 (窄屏)',   360, 780, 'Mozilla/5.0 (Linux; Android 10; HarmonyOS; ELE-AL00) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108 Mobile Safari/537.36'),
    ('iPad (10.9 英寸)',  820, 1180, 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'),
    ('笔记本电脑',       1440,  900, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'),
]

ROUTES = ['dash', 'tree', 'train', 'exam', 'trap', 'statute', 'newlaw', 'subj', 'data']

def main():
    errs = []
    print('目标：' + URL + '\n')
    with sync_playwright() as p:
        b = p.chromium.launch()
        for name, w, h, ua in DEVICES:
            ctx = b.new_context(viewport={'width': w, 'height': h}, user_agent=ua,
                                device_scale_factor=2, is_mobile=(w < 900), has_touch=(w < 900))
            pg = ctx.new_page()
            pg.on('console', lambda m, n=name: errs.append(n + ': ' + m.text) if m.type == 'error' else None)
            pg.on('pageerror', lambda e, n=name: errs.append(n + ' PAGEERROR: ' + str(e)))

            pg.goto(URL, wait_until='networkidle', timeout=90000)
            pg.wait_for_timeout(1500)

            title = pg.title()
            nq = pg.evaluate("()=>(window.DATA_QUESTIONS&&window.DATA_QUESTIONS.questions||[]).length")
            overflow = []
            for r in ROUTES:
                pg.goto(URL + '#/' + r, wait_until='domcontentloaded')
                pg.wait_for_timeout(500)
                sw, cw = pg.evaluate("()=>[document.documentElement.scrollWidth, document.documentElement.clientWidth]")
                if sw > cw + 2:
                    overflow.append('%s(%d>%d)' % (r, sw, cw))
            print('%-18s %4dx%-5d 题目%-4d 标题=%s  横向溢出=%s' %
                  (name, w, h, nq, title, overflow if overflow else '无'))
            if w < 900:
                pg.screenshot(path='shot-dev-%dx%d.png' % (w, h))
            ctx.close()
        b.close()

    print('\n控制台错误：%d' % len(errs))
    for e in errs[:8]:
        print('  ! ' + e)
    return 1 if errs else 0

if __name__ == '__main__':
    sys.exit(main())
