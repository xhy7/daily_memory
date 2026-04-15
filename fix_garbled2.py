#!/usr/bin/env python3
import re

filepath = r'D:\HuaweiMoveData\Users\26945\Desktop\claude-code\memory_help\src\app\record\page.tsx'

with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

# Print some debug info
print("File read successfully")
print(f"File length: {len(content)}")

# Find lines containing the garbled patterns and show them
for i, line in enumerate(content.split('\n'), 1):
    if '鏈' in line or '閿欒' in line or '绋嶅悗' in line:
        print(f"Line {i}: {repr(line)}")

# Since the file has encoding issues, let's try to fix the ALERT_MESSAGES references
# The goal is to use ALERT_MESSAGES constant instead of hardcoded error strings

# Find all instances of the pattern: error || 'CORRUPTED_TEXT'
pattern1 = r"errorData\.error \|\| '[^']*閿欒[^']*'"
matches = re.findall(pattern1, content)
print(f"\nFound {len(matches)} instances of corrupted error fallback")

# Let's try simple string replacements for the obviously garbled UI text
# These are visible in the Read output as specific corrupted sequences

replacements = [
    # Type labels (visible garbled text)
    ("'寰呭姙'", "'待办'"),
    ("'鎰熷彈'", "'感受'"),
    ("'鐢滆湝浜掑姩'", "'甜蜜互动'"),
    ("'璁板綍'", "'记录'"),
    # Emojis
    ("emoji: '馃摑'", "emoji: '📋'"),
    ("emoji: '馃挱'", "emoji: '💗'"),
    ("emoji: '馃挄'", "emoji: '💕'"),
    # Header and button text
    ('馃挅 璁板綍浠婃棩', '💕 记录今日'),
    ('杩斿洖 鉂わ笍', '返回 首页'),
    ('璁板綍浜猴細', '记录人：'),
    ('馃懄', '💙'),
    ('馃懅', '💗'),
    # Upload related
    ('涓婁紶涓?..', '上传中...'),
    ('娣诲姞鍥剧墖(鏈€澶?寮?', '添加图片(最大9张)'),
    ('棰勮獥', '预览'),
    # Placeholders
    ('璁板綍鐢滆湝浜掑姩锛氱害浼氥€佺ぜ鐗┿€佸皬鎯婂枩...', '记录甜蜜互动：约会的、小惊喜、小确幸...'),
    ('鍐欎笅浣犺礋瀹屾垚鐨勪换鍔★紒', '写下你要完成的任务...'),
    ('璁板綍浣犵殑寰呭姙銆佹劅鍙楁垨鍙嶆€濂斤紒', '记录你的待办、感受或反思...'),
    # Buttons
    ('娓呴櫎', '清除'),
    ('淇濆瓨', '保存'),
    ('鉁?鍒嗘瀽涓?..', '×分析中...'),
    ('鉁?鏅鸿兘鏍囩崐', '×智能标签'),
    # Image lightbox
    ('alt="鏌ョ湅澶у浘"', 'alt="查看大图"'),
]

for old, new in replacements:
    if old in content:
        content = content.replace(old, new)
        print(f"Replaced: {old[:30]}...")
    else:
        print(f"Not found: {old[:30]}...")

# For the alert messages with corrupted characters, we need to handle them differently
# Since they contain invalid UTF-8, we need to work with the bytes

# Write the file back
with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("\nFile updated!")
