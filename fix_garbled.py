#!/usr/bin/env python3
import re

filepath = r'D:\HuaweiMoveData\Users\26945\Desktop\claude-code\memory_help\src\app\record\page.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix 1: Replace '鏈�閿欒 ' with ALERT_MESSAGES.unknownError
# This pattern appears in multiple alert messages
content = content.replace("'鏈'閿欒'", "ALERT_MESSAGES.unknownError")

# Fix 2: Replace '保存失败锛岃�绋嶅悗参阅嶈瘯' with ALERT_MESSAGES.saveFailedDetail
content = content.replace("'保存失败锛岃�绋嶅悗参阅嶈瘯'", "ALERT_MESSAGES.saveFailedDetail")

# Fix 3: Replace '鎻愬彇鏍囩残' error messages with ALERT_MESSAGES
content = content.replace("鎻愬彇鏍囩残失败: ", "ALERT_MESSAGES.extractTagsFailed + ': ' + ")
content = content.replace("'鎻愬彇鏍囩残失败: '", "ALERT_MESSAGES.extractTagsFailed + ': '")
content = content.replace("'鎻愬彇鏍囩残失败锛岃�绋嶅悗参阅嶈瘯'", "ALERT_MESSAGES.extractTagsFailedDetail")

# Fix 4: Replace update/delete failures
content = content.replace("'更新失败锛岃�绋嶅悗参阅嶈瘯'", "ALERT_MESSAGES.updateFailedDetail")
content = content.replace("'删除失败锛岃�绋嶅悗参阅嶈瘯'", "ALERT_MESSAGES.deleteFailedDetail")

# Fix 5: Replace garbled UI text in type labels
content = content.replace("'寰呭姙'", "'待办'")
content = content.replace("'鎰熷彈'", "'感受'")
content = content.replace("'鐢滆湝浜掑姩'", "'甜蜜互动'")
content = content.replace("'璁板綍'", "'记录'")

# Fix 6: Fix emojis in type labels
content = content.replace("emoji: '馃摑'", "emoji: '📋'")
content = content.replace("emoji: '馃挱'", "emoji: '💗'")
content = content.replace("emoji: '馃挄'", "emoji: '💕'")

# Fix 7: Fix header and button text
content = content.replace('馃挅 璁板綍浠婃棩', '💕 记录今日')
content = content.replace('杩斿洖 鉂わ笍', '返回 首页')
content = content.replace('璁板綍浜猴細', '记录人：')
content = content.replace('馃懄', '💙')
content = content.replace('馃懅', '💗')

# Fix 8: Fix upload button and related text
content = content.replace("涓婁紶涓?..", "上传中...")
content = content.replace("娣诲姞鍥剧墖(鏈€澶?寮?", "添加图片(最大9张)")
content = content.replace('棰勮獥', '预览')
content = content.replace('鉁', '×')

# Fix 9: Fix placeholders
content = content.replace('璁板綍鐢滆湝浜掑姩锛氱害浼氥€佺ぜ鐗┿€佸皬鎯婂枩...', '记录甜蜜互动：约会的、小惊喜、小确幸...')
content = content.replace('鍐欎笅浣犺礋瀹屾垚鐨勪换鍔★紒', '写下你要完成的任务...')
content = content.replace('璁板綍浣犵殑寰呭姙銆佹劅鍙楁垨鍙嶆€濂斤紒', '记录你的待办、感受或反思...')

# Fix 10: Fix clear button and save button
content = content.replace('娓呴櫎', '清除')
content = content.replace('淇濆瓨', '保存')

# Fix 11: Fix extract tags button
content = content.replace('鉁?鍒嗘瀽涓?..', '×分析中...')
content = content.replace('鉁?鏅鸿兘鏍囩崐', '×智能标签')

# Fix 12: Fix image lightbox close button and alt text
content = content.replace('alt="鏌ョ湅澶у浘"', 'alt="查看大图"')

# Write the result
with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixes applied successfully!")
