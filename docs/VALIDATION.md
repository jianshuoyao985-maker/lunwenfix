# 验证记录

验证对象：从原始提交 df6b68d75402070c3a4343dcf316652919e1a22a 适配的 GitHub Pages 版，以及随附的可选后端。使用合成论文，不涉及用户原稿。

## 已通过

- JavaScript 格式解析：9 项。作用范围、连续补充、共同标题设置、否定词、中西文字体、字号与行距分离、页面单位、未支持要求、数值边界及原格式保留。
- Python：36 项。解析、OOXML 保真、异步任务、真实附件响应、中文文件名、Range / HEAD、CORS、到期拦截、转换降级、取件页转义及静态白名单。
- 纯静态浏览器流程：连续对话、撤回、未发送输入自动应用、实际下载 Word、刷新恢复、损坏文件提示、旧 .doc 引导、390 / 320 像素手机布局、微信提示、复制网址与格式、另一浏览器带入格式、分享用户手势、清除结果、禁用本地存储后的下载、后端不可达时本机降级。
- 后端浏览器流程：连续对话、上传、异步任务、真实 Word 下载、刷新恢复、取件页、390 像素布局、复制取件链接、两次点击准备并分享文件。
- 用独立 Python XML 解析器检查浏览器下载出的 Word：正文内容结构一致，除 document.xml 外包内各文件逐字节一致，字号、倍数行距、显式取消加粗、超链接文字、三级标题、参考文献、表格保留和分节方向正确。
- 浏览器页面无未捕获 JavaScript 错误。检查了中文字体可用环境下的手机截图。

## 复现

```sh
node --test tests/rules.cjs
python3 -m pip install -r backend/requirements.txt
python3 -m unittest discover -s tests -p 'test_*.py'
npm install --no-save playwright
npx playwright install chromium
node tests/static-browser.cjs
node tests/browser.cjs
```

浏览器脚本支持 PLAYWRIGHT_MODULE、CHROMIUM_EXECUTABLE、PYTHON 环境变量，生成文件位于被 Git 忽略的 test-results。浏览器与临时服务器由同一个测试进程启动。

## 实测边界

微信检查使用浏览器 User-Agent 模拟，系统分享使用接口模拟；这能验证页面逻辑和用户手势，不能证明微信客户端一定放行下载。仍需 iOS / Android 微信实机验收。Docker 镜像未在此环境启动；后端应用及下载接口已经本地测试。此次未验证外网生产部署和真实 AI 服务。

45 项单元测试和两套浏览器流程通过不表示任何学校的所有排版规范都已支持。封面、目录、复杂布局和未明确的要求仍需复核。线上站点尚未发布本分支。
