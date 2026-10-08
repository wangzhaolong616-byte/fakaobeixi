# -*- coding: utf-8 -*-
"""验证品牌改名与体验优化项是否生效"""
import io, sys, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent
URL = (ROOT / 'index.html').as_uri()

def main():
    errs = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 1440, 'height': 900})
        pg = ctx.new_page()
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errs.append(str(e)))

        pg.goto(URL)
        pg.wait_for_timeout(700)
        # 首次进入会跳诊断：标记为已完成，避免每次都被拉去诊断
        pg.evaluate("""() => {
            const k = 'fakao2026.system.v1';
            let s = {};
            try { s = JSON.parse(localStorage.getItem(k)) || {}; } catch (e) {}
            s.profile = s.profile || {};
            s.profile.diagDone = true;
            localStorage.setItem(k, JSON.stringify(s));
        }""")
        pg.reload(); pg.wait_for_timeout(700)
        pg.goto(URL + '#/dash'); pg.wait_for_timeout(700)

        # 1) 站点标题
        title = pg.title()
        print('[标题]', title)
        assert '律灯' in title, '标题未改为「律灯」'

        # 2) 侧栏品牌
        brand = pg.inner_text('.brand')
        print('[品牌]', brand.replace('\n', ' | '))
        assert '律灯' in brand, '侧栏品牌未改'
        assert pg.inner_text('.brand .logo').strip() == '律', 'logo 字符未改'

        # 3) favicon 声明
        ico = pg.get_attribute('link[rel="icon"]', 'href')
        print('[图标]', ico)
        assert ico == 'favicon.svg', 'favicon 未设置'

        # 4) 驾驶舱标题
        hero = pg.inner_text('.hero-title')
        print('[驾驶舱]', hero)

        # 5) 路由记忆：去知识体系 → 重新打开应停在那里
        pg.goto(URL + '#/tree'); pg.wait_for_timeout(500)
        pg.goto(URL); pg.wait_for_timeout(700)
        print('[回访落点]', pg.url.split('#')[-1])
        assert pg.url.endswith('#/tree'), '未记住上次页面'

        # 6) 标签页标题随页面变化
        print('[当前标签]', pg.title())
        assert '知识体系' in pg.title(), '标签标题未随页面变化'

        # 7) 错题本空态
        pg.goto(URL + '#/wrong'); pg.wait_for_timeout(500)
        body = pg.inner_text('#view')
        print('[错题本空态字数]', len(body))
        assert '间隔重复' in body and '命题陷阱库' in body, '错题本空态未丰富'

        # 截图
        pg.goto(URL + '#/dash'); pg.wait_for_timeout(800)
        pg.screenshot(path=str(ROOT / 'shot-brand.png'), full_page=False)

        ctx.close(); b.close()

    print('\nconsole errors:', len(errs))
    for e in errs[:5]: print('  !', e)
    print('结论：', '全部通过' if not errs else '有错误')
    return 1 if errs else 0

if __name__ == '__main__':
    sys.exit(main())
