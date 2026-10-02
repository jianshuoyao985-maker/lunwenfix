# 论文 Fix · 对话式格式整理

为 `lunwenfix.online` 的 GitHub Pages 部署适配。选择论文后，直接描述要求：

> 正文宋体小四，1.5 倍行距，首行缩进两个字；一级标题黑体三号居中；参考文献五号。

接着说“再把正文行距改成固定值 20 磅”即可补充。每轮显示识别结果，支持撤回、恢复默认格式。没有识别的要求会提示补充，不会宣称完成页码、引文规范等不支持的项目。

## 两种运行方式

| 能力 | 默认：GitHub Pages 本机处理 | 可选：HTTPS 后端 |
|---|---|---|
| 聊天描述格式、连续修改、撤回 | 常用格式解析，不调用 AI | 支持，可另配 AI 增强理解 |
| Word 排版与下载 | `.docx`，文件不上传 | `.docx`，上传后在服务端处理 |
| 旧版 `.doc` | 需用 Word / WPS 另存为 `.docx` | 安装 LibreOffice 后支持转换 |
| PDF | 不提供 | 安装 LibreOffice 和中文字体后提供 |
| 手机保存 / 分享 | 检测浏览器能否分享 Word | Word / PDF 分享、真实 HTTPS 附件下载 |
| 刷新恢复 | 当前浏览器最近一份结果，最多 24 小时 | 取件链接有效期内恢复 |
| 微信换浏览器继续取件 | 复制网址和格式后，需要重新选择论文 | 复制取件链接，无需重传文件 |

仅有 GitHub Pages 无法把本机生成的文件变成跨浏览器、跨设备的 HTTPS 下载地址。页面分别展示本机保存和云端取件说明，不会把临时 Blob 地址当成取件链接。

## 直接更新现有站点

保持仓库根目录发布方式，保留 `CNAME` 中的 `lunwenfix.online`。本分支合入 `main` 后，现有 GitHub Pages 配置可以继续使用，无需 Node 构建。`config.js` 默认为空，直接在浏览器内处理文件。

不能只更新 `index.html`，还需要同目录的 `styles.css`、`app.js`、`config.js`、`downloads.js`、`rules.js`、`formatter.js`、`local-files.js`、`jszip.min.js`。

本地预览：运行 `python3 -m http.server 8080`，打开 `http://localhost:8080`。线上使用 HTTPS。

## 跨浏览器取件

见 [部署说明](docs/DEPLOY.md)。后端包含任务状态、24 小时取件链接、中文下载名、断点/HEAD 请求、PDF 可选转换和过期文件拦截。默认不选择 AI 服务或模型，也不需要 AI Key。

## 排版范围与保真

支持正文、一级至三级标题、摘要正文、关键词、参考文献、题注及可选表格文字；可设置中西文字体、字号、行距、加粗、对齐、首行缩进、段前段后、页边距及 A4。

优先使用 Word 样式识别标题。含公式、图形、复杂域和修订的段落保守跳过；图片、页眉页脚等其他包内文件保留。导出前校验正文内容结构，原稿不会被覆盖。封面普通段落可能被识别为正文；排版后请复核封面和复杂段落，并在 Word 中更新目录。

旧版 `.doc` 的纯文本提取会丢失复杂内容，因此不再将其用作保真转换；改用 Word / WPS 或可选后端转换。

## 验证

```sh
node --test tests/rules.cjs
python3 -m pip install -r backend/requirements.txt
python3 -m unittest discover -s tests -p 'test_*.py'
npm install --no-save playwright
npx playwright install chromium
node tests/static-browser.cjs
node tests/browser.cjs
```

测试使用合成论文，不包含用户稿件。详见 [验证记录](docs/VALIDATION.md) 和 [同类项目研究](docs/RESEARCH.md)。沿用现有 JSZip，保留许可头；未复制同类论文项目的代码、素材或学校模板。
