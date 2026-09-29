import re, sys
sys.stdout.reconfigure(encoding='utf-8')
raw = open('p15.html', 'rb').read()
for enc in ('utf-8', 'gb18030'):
    try:
        s = raw.decode(enc)
        print("decoded with", enc)
        break
    except Exception as e:
        print(enc, "fail", e)
else:
    sys.exit()
i = s.find('75、')
print("index of 75:", i)
print(repr(s[i-200:i+2500]))
