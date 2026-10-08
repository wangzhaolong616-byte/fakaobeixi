# -*- coding: utf-8 -*-
"""通用组卷构建：把某一年某卷的「原始抓取 + 人工标注」合并成 q<年份>-<卷>-NN.json

用法：
    python _build_paper.py 2019
    python _build_paper.py 2020
    python _build_paper.py            # 构建全部已配置的年份

产出：q2019-yijuan-01..04.json / q2020-yijuan-01..04.json
      （每 25 题一个文件，供 build-real.js 消费）

硬规则（违反即报错退出，绝不静默放过）：
  1. srcLevel 一律「回忆版」——司法部 2018 年后不再公布真题与答案，
     不得标为「官方真题」。
  2. 每题必须有人工标注（sec/k/trap/statute/correctWhy），缺失即报错。
  3. wrongWhy 必须覆盖所有非正确答案的选项，缺失即报错。
  4. 源页面缺答案时只能用标注里的 ansFix 补全，且必须在 note 中如实说明。
  5. 源页面选项残缺/重复时用 optionsFix 补全，同样必须在 note 中说明。
  6. sec 必须与所选知识节点的板块一致（交由 build-real.js 二次校验）。
"""
import json, sys, re, importlib, os
from collections import Counter
sys.stdout.reconfigure(encoding='utf-8')

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)

PAPERS = {
    2019: dict(
        raw='_raw_y1_all.json', paper='试卷一', prefix='yijuan',
        src='2019年法考客观题试卷一（233网校整理回忆版）',
        idfmt='Q2019-1-%03d',
        mods=['_ann_yijuan_1', '_ann_yijuan_2', '_ann_yijuan_3', '_ann_yijuan_4',
              '_ann_yijuan_5', '_ann_yijuan_6', '_ann_yijuan_8'],
    ),
    2020: dict(
        raw='_raw_y2020_all.json', paper='试卷一', prefix='yijuan',
        src='2020年法考客观题试卷一（233网校整理回忆版）',
        idfmt='Q2020-1-%03d',
        mods=['_ann_y2020_a', '_ann_y2020_b', '_ann_y2020_c', '_ann_y2020_d',
              '_ann_y2020_e', '_ann_y2020_f'],
    ),
}


def build(year):
    cfg = PAPERS[year]
    if not os.path.exists(cfg['raw']):
        print('✗ 找不到原始抓取文件 %s' % cfg['raw'])
        return 1

    # ---- 汇总标注 ----
    ANN = {}
    for name in cfg['mods']:
        if not os.path.exists(name + '.py'):
            print('✗ 缺标注模块 %s.py（可能子任务尚未完成）' % name)
            return 1
        m = importlib.import_module(name)
        for no, v in m.ANN.items():
            if no in ANN:
                print('✗ 题号 %d 在多个标注模块中重复出现（%s）' % (no, name))
                return 1
            ANN[no] = v

    RAW = json.load(open(cfg['raw'], encoding='utf-8'))
    RAW.sort(key=lambda x: x['no'])

    errors = []
    out = {}
    for q in RAW:
        no = q['no']
        tag = 'Q%d' % no
        a = ANN.get(no)
        if not a:
            errors.append('%s：缺人工标注' % tag)
            continue

        # ---- 答案 ----
        raw_ans = (q.get('ans') or '').strip()
        if raw_ans:
            ans = [c.strip() for c in re.split(r'[,，、\s]+', raw_ans) if c.strip()]
        else:
            ans = list(a.get('ansFix') or [])
            if not ans:
                errors.append('%s：源页面无答案且标注未提供 ansFix' % tag)
                continue
            if not a.get('note'):
                errors.append('%s：使用 ansFix 补全答案，必须在 note 中说明来源' % tag)

        # ---- 选项 ----
        opts = [re.sub(r'^[ABCD][、.]\s*', '', o).strip() for o in q['opts']]
        letters = [chr(65 + i) for i in range(len(opts))]

        # ---- 题干订正（仅用于源页面题干存在明显笔误、与答案自相矛盾的情形）----
        stem = q['stem']
        if a.get('stemFix'):
            stem = a['stemFix']
            if not a.get('note'):
                errors.append('%s：使用 stemFix 改写题干，必须在 note 中说明原委' % tag)

        for L, txt in (a.get('optionsFix') or {}).items():
            if L not in letters:
                errors.append('%s：optionsFix 的项 %s 超出选项范围' % (tag, L))
                continue
            opts[letters.index(L)] = txt
        if a.get('optionsFix') and not a.get('note'):
            errors.append('%s：使用 optionsFix 改写选项，必须在 note 中说明' % tag)
        if len(set(opts)) != len(opts):
            errors.append('%s：存在重复选项，请人工核对' % tag)
        if any(c not in letters for c in ans):
            errors.append('%s：答案 %s 超出选项 %s 范围' % (tag, ans, letters))
            continue

        # ---- 错误项解析完整性 ----
        ww = a.get('wrongWhy', {})
        miss = [c for c in letters if c not in ans and c not in ww]
        if miss:
            errors.append('%s：未写错误项解析 %s' % (tag, miss))

        item = dict(
            id=cfg['idfmt'] % no,
            year=year,
            stage='客观题',
            paper=cfg['paper'],
            no=no,
            sec=a['sec'],
            k=a['k'],
            type=None,          # 交由 build-real.js 按官方第 N 题结构推断
            difficulty=a.get('difficulty', 3),
            src=cfg['src'],
            srcLevel='回忆版',
            stem=stem,
            options=opts,
            answer=ans,
            trap=a.get('trap'),
            statute=a.get('statute'),
            correctWhy=a.get('correctWhy'),
            wrongWhy=ww,
            timeEffect=a.get('timeEffect'),
            note=a.get('note') or None,
        )
        out.setdefault('%02d' % ((no - 1) // 25 + 1), []).append(item)

    extra = sorted(set(ANN) - {q['no'] for q in RAW})
    if extra:
        errors.append('以下题号有标注但无原始题目：%s' % extra)

    if errors:
        print('[%d] 发现 %d 个问题，未写文件：' % (year, len(errors)))
        for e in errors:
            print('  · ' + e)
        return 1

    for k, arr in sorted(out.items()):
        fn = 'q%d-%s-%s.json' % (year, cfg['prefix'], k)
        json.dump(arr, open(fn, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print('[%d] 写出 %s：%d 题（%d—%d）' % (year, fn, len(arr), arr[0]['no'], arr[-1]['no']))

    allq = [x for v in out.values() for x in v]
    print('[%d] 合计 %d 题' % (year, len(allq)))
    print('[%d] 答案个数分布：%s' % (year, dict(sorted(Counter(len(x['answer']) for x in allq).items()))))
    print('[%d] 科目分布：%s' % (year, dict(Counter(x['sec'] for x in allq))))
    print('[%d] 题型推断：%s' % (year, dict(Counter(
        ('单选' if x['no'] <= 50 else ('多选' if x['no'] <= 85 else '不定项')) for x in allq))))
    star = [x['no'] for x in allq if (x.get('timeEffect') or '').startswith('★')]
    print('[%d] 标★时效变化题：%d 题 %s' % (year, len(star), star))
    return 0


if __name__ == '__main__':
    years = [int(sys.argv[1])] if len(sys.argv) > 1 else sorted(PAPERS)
    rc = 0
    for y in years:
        rc |= build(y)
    sys.exit(rc)
