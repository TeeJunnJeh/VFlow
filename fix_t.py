import os
import re

directory = r'C:\Users\12447\Desktop\Vf\AAAapp_making\VFlow\src\components\productImages\Functions\DynamicImage'

for filename in os.listdir(directory):
    if not filename.endswith('.tsx'):
        continue
    filepath = os.path.join(directory, filename)
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Replace t('key') with (t as any).key
    # Note: we need to handle strings. Let's just use (t as any).key
    content = re.sub(r"t\('([^']+)'\)", r"(t as any).\1", content)
    
    # Also handle the dynamic keys in AnimatedImageForm.tsx
    content = re.sub(r"t\(groupKey as .*?\)", r"(t as any)[groupKey]", content)
    content = re.sub(r"t\(MOTION_KEY_MAP\[mt\] as .*?\)", r"(t as any)[MOTION_KEY_MAP[mt]]", content)
    content = re.sub(r"t\(m === 'veo-3.1' \? 'di_model_veo' : 'di_model_seedance'\)", r"m === 'veo-3.1' ? (t as any).di_model_veo : (t as any).di_model_seedance", content)
    content = re.sub(r"t\(d === 5 \? 'di_duration_5s' : 'di_duration_10s'\)", r"d === 5 ? (t as any).di_duration_5s : (t as any).di_duration_10s", content)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
