# -*- coding: utf-8 -*-
"""把 _raw_er/_raw_e2/_raw_e3/_raw_e4 的原始抓取 + 人工标注合并成
   q2019-erjuan-01..04.json，供 build-real.js 消费。

用法：python _build_erjuan.py
产出：q2019-erjuan-01.json（1-25）/ -02（26-50）/ -03（51-75）/ -04（76-100）

硬规则：
  1. srcLevel 一律「回忆版」——司法部 2018 年后不再公布真题与答案，
     不得标为「官方真题」。
  2. 每题必须有人工标注（sec/k/trap/statute/correctWhy），缺失即报错退出。
  3. wrongWhy 至少覆盖所有非正确答案的选项，缺失即报错退出。
"""
import json, sys, re
sys.stdout.reconfigure(encoding='utf-8')

import _ann_erjuan_1 as A1
import _ann_erjuan_2 as A2
import _ann_erjuan_3 as A3
import _ann_erjuan_4 as A4

ANN = {}
for m in (A1, A2, A3, A4):
    for no, v in m.ANN.items():
        if no in ANN:
            print('✗ 题号重复：%s' % no)
            sys.exit(1)
        ANN[no] = v

RAW = []
for f in ('_raw_er.json', '_raw_e2.json', '_raw_e3.json', '_raw_e4.json'):
    RAW += json.load(open(f, encoding='utf-8'))
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

    ans = [c.strip() for c in re.split(r'[,，、\s]+', (q['ans'] or '').strip()) if c.strip()]
    if not ans:
        errors.append('%s：无答案' % tag)
        continue

    opts = [re.sub(r'^[ABCD][、.]\s*', '', o).strip() for o in q['opts']]
    letters = [chr(65 + i) for i in range(len(opts))]
    # 源页面个别选项存在明显录入错误（如把 D 写成与 C 重复），由人工标注中的
    # optionsFix 还原，且必须在 note 中如实记录，绝不静默改写数据。
    for L, txt in (a.get('optionsFix') or {}).items():
        if L not in letters:
            errors.append('%s：optionsFix 的项 %s 超出选项范围' % (tag, L))
            continue
        opts[letters.index(L)] = txt
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
        id='Q2019-2-%03d' % no,
        year=2019,
        stage='客观题',
        paper='试卷二',
        no=no,
        sec=a['sec'],
        k=a['k'],
        type=None,          # 交由 build-real.js 按官方第 N 题结构推断
        difficulty=a.get('difficulty', 3),
        src='2019年法考客观题试卷二（233网校整理回忆版）',
        srcLevel='回忆版',
        stem=q['stem'],
        options=opts,
        answer=ans,
        trap=a.get('trap'),
        statute=a.get('statute'),
        correctWhy=a.get('correctWhy'),
        wrongWhy=ww,
        timeEffect=a.get('timeEffect'),
        note=a.get('note'),
    )
    out['%02d' % ((no - 1) // 25 + 1)].append(item)

if errors:
    print('发现 %d 个问题，未写文件：' % len(errors))
    for e in errors:
        print('  · ' + e)
    sys.exit(1)

for k, arr in out.items():
    fn = 'q2019-erjuan-%s.json' % k
    json.dump(arr, open(fn, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('写出 %s：%d 题（%d—%d）' % (fn, len(arr), arr[0]['no'], arr[-1]['no']))

print('合计 %d 题' % sum(len(v) for v in out.values()))
