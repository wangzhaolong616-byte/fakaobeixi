import re, sys
sys.stdout.reconfigure(encoding='utf-8')
s = open('raw_27143132120572.html', 'rb').read().decode('utf-8', 'replace')
b = s.find('<div class="Newspublic_Subject"')
print("first Newspublic_Subject at", b)
print(repr(s[b:b + 1800]))
print("----- count Newspublic_Subject:", s.count('<div class="Newspublic_Subject"'))
print("----- count Subject_Ans:", s.count('Subject_Ans'))
