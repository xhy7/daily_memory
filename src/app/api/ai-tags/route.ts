import { NextRequest, NextResponse } from 'next/server';
import { chatWithAI } from '@/lib/ai';

/**
 * Escape special characters in user input to prevent prompt injection
 */
function escapeForPrompt(text: string): string {
  if (!text) return '';
  // Remove control characters and escape quotes that could break the prompt
  return text
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .replace(/"/g, '\\"')            // Escape double quotes
    .replace(/\n/g, ' ');            // Replace newlines with spaces
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content, imageUrl, existingTags } = body;

    if (!content && !imageUrl) {
      return NextResponse.json({ error: 'Content or image is required' }, { status: 400 });
    }

    // Sanitize user input to prevent prompt injection
    const textContent = escapeForPrompt(content?.trim() || '');
    const sanitizedTags = Array.isArray(existingTags)
      ? existingTags.map(t => escapeForPrompt(t)).filter(t => t.length > 0)
      : [];

    const existingTagsStr = sanitizedTags.length > 0
      ? `已有标签库：${sanitizedTags.join('、')}。只选择与当前记录内容高度相关的标签！如果已有标签都不贴切，坚决不要选择它们，直接创建新标签！`
      : '暂无已有标签，请自行创建合适的标签。';

    // 根据 requirements.md 的要求设计提示词，优先考虑已有标签
    const prompt = `你是「情侣甜蜜日记」AI标签提取助手，核心目标是为用户的情侣日常记录提取**高质量、可用于三维视图串联的语义标签**。

输入格式：
- user_content: "${textContent}"
- image_info: "${imageUrl ? '有图片' : '无图片'}"
- ${existingTagsStr}
- user_request: "无"

---

### 📌 标签提取规则（严格遵守）
1. **优先使用已有标签**：首先从已有标签库中选择合适的标签！
2. **语义优先，禁止硬拆**：绝不从句子中简单抽取单个词语，必须提炼**有完整语义、符合语境、适合聚合关联的标签**
3. **多维度覆盖**（根据内容灵活提取）：
   - 主题标签：核心事件（如「化妆吐槽」「情侣撒娇」「日常打卡」）
   - 情感标签：情绪氛围（如「甜蜜互动」「搞笑吐槽」「暖心日常」）
   - 人物标签：关联人物（如「姐姐」「男友」）
   - 场景标签：发生场景（如「线上聊天」「居家日常」「约会出行」）
   - 特征标签：关键细节（如「周末约会」「2小时」）
4. **标签规范**：
   - 单个标签2-8字，简洁精准
   - 标签数量3-8个，100%去重
   - 标签必须具备**可串联性**：能关联不同记录
5. **语境灵活适配**：捕捉语气（撒娇、吐槽、甜蜜），标签需贴合语境
6. **氛围要求**：符合情侣日常的温馨氛围，避免生硬、冰冷的词汇

---

### 输出要求
请严格按以下JSON格式返回，不要有任何其他文字：
{"tags": ["标签1", "标签2", "标签3"]}

请直接输出JSON，不要有前缀或解释：`;

    let responseText: string;
    try {
      const result = await chatWithAI([{ role: 'user', content: prompt }]);
      responseText = result.content;
    } catch (error) {
      // Fallback: try extract semantic tags from original content
      responseText = '';
    }

    console.log('AI response text:', responseText);

    // 解析标签
    let tags = parseTags(responseText);

    // 兜底：从原文提取有意义标签
    if (tags.length === 0) {
      tags = extractSemanticTags(textContent);
    }

    // 确保标签数量在3-8个范围内
    if (tags.length < 3) {
      // 补充标签
      const supplement = supplementTags(textContent, tags);
      tags = [...tags, ...supplement].slice(0, 8);
    }

    // 去重并限制数量
    tags = Array.from(new Set(tags)).slice(0, 8);

    return NextResponse.json({
      tags,
      debug: {
        rawResponse: responseText,
        parsedCount: tags.length,
      },
    });
  } catch (error) {
    console.error('Failed to extract tags:', error);
    return NextResponse.json({ error: '提取标签失败', details: String(error) }, { status: 500 });
  }
}

// 解析标签
function parseTags(responseText: string): string[] {
  let tags: string[] = [];

  if (!responseText) return tags;

  // 策略1: JSON 直接解析
  try {
    const parsed = JSON.parse(responseText);
    if (parsed.tags && Array.isArray(parsed.tags)) {
      tags = parsed.tags.filter((t: unknown) => typeof t === 'string' && t.length >= 2 && t.length <= 8);
    } else if (Array.isArray(parsed)) {
      tags = parsed.filter((t: unknown) => typeof t === 'string' && t.length >= 2 && t.length <= 8);
    }
    if (tags.length >= 3) return tags;
  } catch {
    // 继续下一个策略
  }

  // 策略2: 从各种括号中提取
  const patterns = [
    /"tags"\s*:\s*\[[\s\S]*?\]/,
    /\[[\s\S]*?\]/g,
  ];

  for (const pattern of patterns) {
    const match = responseText.match(pattern);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((t: unknown) => typeof t === 'string' && t.length >= 2 && t.length <= 8);
          if (valid.length >= 3) return valid;
          if (valid.length > tags.length) tags = valid;
        }
      } catch { /* continue */ }
    }
  }

  // 策略3: 按分隔符拆分，提取有语义的词汇组合
  if (tags.length < 3) {
    const cleanText = responseText.replace(/[\[\]{}""']/g, '');
    const parts = cleanText.split(/[,，、\n]+/);
    const validParts = parts
      .map((p: string) => p.trim())
      .filter((p: string) => p.length >= 2 && p.length <= 8);
    if (validParts.length >= 3) tags = validParts;
  }

  return tags;
}

// 提取语义标签（兜底方案）
function extractSemanticTags(text: string): string[] {
  const tags: string[] = [];

  // 识别常见场景
  const scenePatterns = [
    { pattern: /约会|出行|旅游|逛街|看电影/, tag: '约会出行' },
    { pattern: /吃饭|晚餐|午餐|早餐|做饭|外卖/, tag: '美食时光' },
    { pattern: /聊天|微信|发消息|视频/, tag: '线上聊天' },
    { pattern: /在家|居家|宿舍|家里/, tag: '居家日常' },
    { pattern: /生日|纪念日|节日/, tag: '特殊日子' },
    { pattern: /礼物|惊喜|惊喜/, tag: '甜蜜礼物' },
    { pattern: /吵架|生气|不开心|郁闷/, tag: '小争执' },
    { pattern: /哄|安慰|暖心|感动/, tag: '暖心时刻' },
    { pattern: /学习|工作|加班|忙/, tag: '学习工作' },
    { pattern: /健身|运动|跑步|游泳/, tag: '运动健康' },
  ];

  // 识别情感
  const emotionPatterns = [
    { pattern: /开心|高兴|快乐|兴奋/, tag: '开心甜蜜' },
    { pattern: /生气|不满|郁闷|烦躁/, tag: '小情绪' },
    { pattern: /想|思念|想念|牵挂/, tag: '思念' },
    { pattern: /爱|喜欢|心动了/, tag: '甜蜜爱意' },
    { pattern: /吐槽|无语|醉了|搞笑/, tag: '搞笑吐槽' },
  ];

  for (const { pattern, tag } of scenePatterns) {
    if (pattern.test(text) && !tags.includes(tag)) {
      tags.push(tag);
    }
  }

  for (const { pattern, tag } of emotionPatterns) {
    if (pattern.test(text) && !tags.includes(tag)) {
      tags.push(tag);
    }
  }

  // 提取有意义的词组
  if (tags.length < 3) {
    const words = text.split(/[,，、。！？!?.：:\s]+/);
    const meaningful = words.filter((w: string) => {
      const trimmed = w.trim();
      // 过滤条件
      if (trimmed.length < 2 || trimmed.length > 8) return false;
      if (/^(.)\1+$/.test(trimmed)) return false; // 重复字符
      if (/^[，。！？!?.]+$/.test(trimmed)) return false; // 纯标点
      // 保留有意义的词汇
      return /[\u4e00-\u9fa5]/.test(trimmed);
    }).slice(0, 5);

    for (const word of meaningful) {
      if (!tags.includes(word) && tags.length < 8) {
        tags.push(word);
      }
    }
  }

  return tags.slice(0, 8);
}

// 补充标签
function supplementTags(text: string, existingTags: string[]): string[] {
  const supplement: string[] = [];
  const tagSet = new Set(existingTags);

  // 根据内容类型补充
  if (text.length > 20) {
    if (!tagSet.has('日常记录')) {
      supplement.push('日常记录');
    }
  }

  // 检测时间相关
  if (/今天|明天|昨天|周末|周一|周二|周三|周四|周五|周六/.test(text)) {
    if (!tagSet.has('当天记录')) {
      supplement.push('当天记录');
    }
  }

  // 检测人物
  if (/老婆|女友|女朋友|媳妇|宝宝|亲爱的/.test(text)) {
    if (!tagSet.has('女友')) {
      supplement.push('女友');
    }
  } else if (/老公|男友|男朋友|先生|老公/.test(text)) {
    if (!tagSet.has('男友')) {
      supplement.push('男友');
    }
  }

  return supplement.slice(0, 8 - existingTags.length);
}
