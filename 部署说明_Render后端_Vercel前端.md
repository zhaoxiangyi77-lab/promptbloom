# PromptBloom v24i 可部署版

这个版本用于“发一个网址，对方打开就能用”。

结构：

```text
frontend/  前端网页，部署到 Vercel
backend/   Node/Express 后端，部署到 Render
```

数据说明：

- 不共享资产库。
- 每个用户上传的图片、提示词、合成台内容都保存在他自己的浏览器 localStorage 里。
- 你的千问 API Key 只放在 Render 后端环境变量，不写进前端。

---

## 一、先部署后端到 Render

1. 把整个 `promptbloom_v24i_deploy_ready` 文件夹上传到 GitHub 仓库。
2. 打开 Render，选择 New → Web Service。
3. 连接你的 GitHub 仓库。
4. 配置：

```text
Root Directory: backend
Build Command: npm install
Start Command: npm start
```

5. 在 Render 的 Environment 添加环境变量：

```text
DASHSCOPE_API_KEY = 你的千问 DashScope API Key
QWEN_MODEL = qwen-vl-plus
ALLOWED_ORIGINS = *
```

6. 部署完成后，Render 会给你一个后端地址，类似：

```text
https://promptbloom-api.onrender.com
```

7. 测试后端健康检查：

```text
https://promptbloom-api.onrender.com/api/health
```

看到类似下面内容就说明后端成功：

```json
{"ok":true,"model":"qwen-vl-plus","key":true}
```

---

## 二、把 Render 后端地址写进前端

打开：

```text
frontend/config.js
```

把里面的：

```js
window.PROMPTBLOOM_API_URL = 'https://YOUR_RENDER_BACKEND_URL.onrender.com/api/analyze-image';
```

改成你的 Render 后端地址：

```js
window.PROMPTBLOOM_API_URL = 'https://promptbloom-api.onrender.com/api/analyze-image';
```

保存后提交到 GitHub。

---

## 三、部署前端到 Vercel

1. 打开 Vercel，选择 Add New → Project。
2. 导入同一个 GitHub 仓库。
3. 配置：

```text
Root Directory: frontend
Framework Preset: Other
Build Command: npm run build
Output Directory: .
```

4. 部署完成后，Vercel 会给你一个前端网址，类似：

```text
https://promptbloom.vercel.app
```

对方打开这个网址，就可以上传图片、调用后端千问接口生成提示词。

---

## 四、部署后建议改 CORS

前端部署成功后，把 Render 里的：

```text
ALLOWED_ORIGINS = *
```

改成你的 Vercel 前端域名：

```text
ALLOWED_ORIGINS = https://promptbloom.vercel.app
```

这样可以避免别人从其他网页滥用你的后端接口。

---

## 五、本地测试方式

后端：

```bat
cd /d "你的路径\promptbloom_v24i_deploy_ready\backend"
set DASHSCOPE_API_KEY=你的key
set QWEN_MODEL=qwen-vl-plus
npm install
npm start
```

前端：

```bat
cd /d "你的路径\promptbloom_v24i_deploy_ready\frontend"
npx --yes http-server -p 5173 -c-1
```

浏览器打开：

```text
http://127.0.0.1:5173/index.html?v=23
```

本地测试时，前端设置页的 API 地址可以填：

```text
http://localhost:8787/api/analyze-image
```

