# -*- coding: utf-8 -*-
"""把 _raw_y1_all.json（2019 年试卷一 1—100 题原始抓取）+ 7 个人工标注模块
   合并成 q2019-yijuan-01..04.json，供 build-real.js 消费。

用法：python _build_yijuan.py
产出：q2019-yijuan-01.json（1-25）/ -02（26-50）/ -03（51-75）/ -04（76-100）

硬规则：
  1. srcLevel 一律「回忆版」——司法部 2018 年后不再公布真题与答案，
     不得标为「官方真题」。
  2. 每题必须有人工标注（sec/k/trap/statute/correctWhy），缺失即报错退出。
  3. wrongWhy 至少覆盖所有非正确答案的选项，缺失即报错退出。
  4. 源页面缺答案时只能用标注里的 ansFix 补全，且必须在 note 中如实说明，
     绝不静默编造答案。
  5. 源页面选项残缺/重复时用 optionsFix 补全，同样必须在 note 中说明。
"""
import json, sys, re
sys.stdout.reconfigure(encoding='utf-8')

import _ann_yijuan_1 as A1
import _ann_yijuan_2 as A2
import _ann_yijuan_3 as A3
import _ann_yijuan_4 as A4
import _ann_yijuan_5 as A5
import _ann_yijuan_6 as A6
import _ann_yijuan_7 as A7

ANN = {}
for mi, m in enumerate((A1, A2, A3, A4, A5, A6, A7), 1):
    for no, v in m.ANN.items():
        if no in ANN:
            print('✗ 题号 %d 在多个标注模块中重复出现' % no)
            sys.exit(1)
        ANN[no] = v

RAW = json.load(open('_raw_y1_all.json', encoding='utf-8'))
RAW.sort(key=lambda x: x['no'])

errors = []
out = {'01': [], '02': [], '03': [], '04': []}

for q in RAW:
    no = q['no']
    tag = 'Q%d' % no
    a = ANN.get(no)
    if not a:
        errors.append('%s：缺人工标注' % tag)
        continue

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

    opts = [re.sub(r'^[ABCD][、.]\s*', '', o).strip() for o in q['opts']]
    letters = [chr(65 + i) for i in range(len(opts))]

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

    ww = a.get('wrongWhy', {})
    miss = [c for c in letters if c not in ans and c not in ww]
    if miss:
        errors.append('%s：未写错误项解析 %s' % (tag, miss))

    item = dict(
        id='Q2019-1-%03d' % no,
        year=2019,
        stage='客观题',
        paper='试卷一',
        no=no,
        sec=a['sec'],
        k=a['k'],
        type=None,          # 交由 build-real.js 按官方第 N 题结构推断
        difficulty=a.get('difficulty', 3),
        src='2019年法考客观题试卷一（233网校整理回忆版）',
        srcLevel='回忆版',
        stem=q['stem'],
        options=opts,
        answer=ans,
        trap=a.get('trap'),
        statute=a.get('statute'),
        correctWhy=a.get('correctWhy'),
        wrongWhy=ww,
        timeEffect=a.get('timeEffect'),
        note=a.get('note') or None,
    )
    out['%02d' % ((no - 1) // 25 + 1)].append(item)

extra = sorted(set(ANN) - {q['no'] for q in RAW})
if extra:
    errors.append('以下题号有标注但无原始题目：%s' % extra)

if errors:
    print('发现 %d 个问题，未写文件：' % len(errors))
    for e in errors:
        print('  · ' + e)
    sys.exit(1)

for k, arr in sorted(out.items()):
    fn = 'q2019-yijuan-%s.json' % k
    json.dump(arr, open(fn, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('写出 %s：%d 题（%d—%d）' % (fn, len(arr), arr[0]['no'], arr[-1]['no']))

from collections import Counter
allq = [x for v in out.values() for x in v]
print('合计 %d 题' % len(allq))
print('答案个数分布：', dict(sorted(Counter(len(x['answer']) for x in allq).items())))
print('科目分布：', dict(Counter(x['sec'] for x in allq)))
print('题型推断：', dict(Counter(('单选' if x['no'] <= 50 else ('多选' if x['no'] <= 85 else '不定项')) for x in allq)))
star_note = [x['no'] for x in allq if (x.get('timeEffect') or '').startswith('★')]
print('标★时效变化题：%d 题 %s' % (len(star_note), star_note))
