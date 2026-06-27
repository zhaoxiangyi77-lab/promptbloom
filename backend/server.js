import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 8787;
const MODULE_KEYS = ['主体','场景','风格','构图','镜头','色彩','材质','光影','用途','负面提示词'];
const DEFAULT_MODEL = process.env.QWEN_MODEL || 'qwen-vl-plus';

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS: ' + origin));
  }
}));
app.use(express.json({ limit: '45mb' }));

function buildPrompt(modules = {}) {
  const main = MODULE_KEYS.filter(k => k !== '负面提示词').map(k => modules[k]).filter(Boolean).join('，');
  return main + (modules['负面提示词'] ? `。负面提示词：${modules['负面提示词']}` : '');
}

function fallback(filename = '图片') {
  const base = String(filename).replace(/\.[^.]+$/, '') || '图片主体';
  const modules = {
    '主体': base,
    '场景': '根据图片内容补充场景描述，主体突出',
    '风格': '精致视觉风格，适合 AI 图像与视频生成',
    '构图': '主体明确，画面层次清晰，留白舒适',
    '镜头': '稳定镜头，中景视角，可作为视频首帧参考',
    '色彩': '色彩协调，画面统一',
    '材质': '细节清晰，质感自然',
    '光影': '自然光影，氛围柔和',
    '用途': 'AI 视频生成参考',
    '负面提示词': '模糊，低清晰度，畸形，水印，文字错误'
  };
  return { category: '未分类', tags: ['本地兜底', '待修正'], prompt: buildPrompt(modules), modules };
}

function normalizeResult(data, filename) {
  const fb = fallback(filename);
  const result = data && typeof data === 'object' ? data : {};
  const incoming = result.modules && typeof result.modules === 'object' ? result.modules : {};
  const modules = {};
  for (const key of MODULE_KEYS) modules[key] = String(incoming[key] || fb.modules[key] || '').trim();
  const prompt = String(result.prompt || '').trim() || buildPrompt(modules) || fb.prompt;
  return {
    category: result.category || fb.category,
    tags: Array.isArray(result.tags) && result.tags.length ? result.tags.map(String).slice(0, 8) : ['千问生成'],
    prompt,
    modules
  };
}

function extractJson(text = '') {
  const clean = String(text).replace(/```json|```/g, '').trim();
  try { return JSON.parse(clean); } catch {}
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(clean.slice(start, end + 1)); } catch {}
  }
  return null;
}

app.get('/', (_req, res) => {
  res.json({ ok: true, name: 'PromptBloom API', health: '/api/health' });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, model: process.env.QWEN_MODEL || DEFAULT_MODEL, key: Boolean(process.env.DASHSCOPE_API_KEY) });
});

app.post('/api/analyze-image', async (req, res) => {
  const started = Date.now();
  const { filename = 'image.png', image, provider = 'qwen' } = req.body || {};
  const model = process.env.QWEN_MODEL || DEFAULT_MODEL;
  const imageSizeMB = image ? (String(image).length / 1024 / 1024).toFixed(2) : '0';
  console.log(`[Analyze start] file=${filename} provider=${provider} model=${model} image=${imageSizeMB}MB`);

  if (!image) {
    console.error('[Analyze error] missing image');
    return res.status(400).json({ error: '缺少 image 字段' });
  }

  if (provider === 'local') {
    console.log(`[Analyze local] file=${filename}`);
    return res.json(fallback(filename));
  }

  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    console.error('[Analyze error] missing DASHSCOPE_API_KEY');
    return res.status(500).json({ error: '缺少 DASHSCOPE_API_KEY 环境变量', model });
  }

  const instruction = `你是一个 AI 图像生成提示词整理助手。请分析用户上传的图片，输出严格 JSON，不要输出 Markdown，不要输出解释文字。请生成适合 AI 图像生成或 AI 视频首帧/参考图的中文提示词，内容具体、可复用。
JSON 格式必须是：
{
  "category": "角色参考/场景参考/风格参考/分镜关键帧/UI/图标素材/视频首帧/视频尾帧/训练素材/未分类 之一",
  "tags": ["3-8个中文标签"],
  "prompt": "一段完整中文提示词，必须包含主体、场景、风格、构图、色彩、材质、光影、用途",
  "modules": {
    "主体": "图片主体、角色、物体或核心内容",
    "场景": "空间、地点、背景环境",
    "风格": "画风、媒介、审美风格",
    "构图": "景别、视角、布局",
    "镜头": "镜头语言或运动建议",
    "色彩": "主色调和配色",
    "材质": "服装、物体、表面材质等",
    "光影": "光源方向、光线质感、氛围",
    "用途": "适合视频首帧/尾帧/角色参考/场景参考/分镜/UI图标等",
    "负面提示词": "不希望出现的问题"
  }
}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: instruction },
          { role: 'user', content: [
            { type: 'text', text: `请分析这张图片并整理提示词。文件名：${filename}` },
            { type: 'image_url', image_url: { url: image } }
          ] }
        ],
        temperature: 0.3
      })
    });
    clearTimeout(timeout);
    const raw = await response.text();
    console.log(`[Qwen response] status=${response.status} time=${Date.now() - started}ms file=${filename}`);
    if (!response.ok) {
      console.error('Qwen API error:', response.status, raw);
      return res.status(response.status).json({ error: '千问接口调用失败', detail: raw, model });
    }
    const payload = JSON.parse(raw);
    const content = payload?.choices?.[0]?.message?.content || '';
    const parsed = extractJson(content);
    if (!parsed) {
      console.error('[Analyze parse failed]', content.slice(0, 1000));
      return res.json({ ok: true, ...fallback(filename), tags: ['千问返回解析失败', '待修正'], raw: content });
    }
    console.log(`[Analyze done] time=${Date.now() - started}ms file=${filename}`);
    return res.json({ ok: true, ...normalizeResult(parsed, filename) });
  } catch (err) {
    clearTimeout(timeout);
    console.error('[Analyze failed]', err?.name || '', err?.message || String(err));
    return res.status(500).json({ error: '服务器调用千问失败', detail: String(err), model });
  }
});

app.listen(PORT, () => {
  console.log(`API server listening on port ${PORT}`);
  console.log(`Analyze endpoint: /api/analyze-image`);
  console.log(`Health check: /api/health`);
  console.log('Qwen model:', process.env.QWEN_MODEL || DEFAULT_MODEL);
  console.log('DashScope key:', process.env.DASHSCOPE_API_KEY ? '已读取' : '未设置');
});
