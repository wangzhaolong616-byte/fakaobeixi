import re, sys
sys.stdout.reconfigure(encoding='utf-8')
s = open('raw_27143132120572.html', 'rb').read().decode('utf-8', 'replace')
i = s.find('71、')
print(repr(s[i - 500:i + 300]))
print("TitThree count:", len(re.findall(r'Newspublic_TitThree', s)))
for m in re.finditer(r'Newspublic_TitThree[^>]*>(.{0,40})', s):
    print(repr(m.group(1)))
