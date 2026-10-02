# GitHub 同类项目研究与本次改进

研究依据为以下公开项目的 README、公开实现说明及所列源文件；不是对所有分支或发布版本的完整审计。评估关注本次要求：自然语言对话、文档保真、手机取件。

| 项目 | 可借鉴点 | 与当前需求的差距及本次应对 |
|---|---|---|
| [lilanlan11/thesis-formatter](https://github.com/lilanlan11/thesis-formatter) | 分层处理正文、标题、图表、参考文献，提供命令行入口 | 公开使用路径以本地命令/Skill 为主，规范是预置方案；README 提醒目录页码是估算值。本次增加浏览器连续对话与参数清单，并保留原目录，不生成估算页码 |
| [zxyasfas/paper_format_agent](https://github.com/zxyasfas/paper_format_agent) | 保存前用内容指纹检查正文没有变化，失败则停止输出 | 主要是本地论文格式工作流；公开文档也提示公式及复杂排版的局限。本次采用类似的内容检查思想，以自有 OOXML 实现保留其他包成员和命名空间，复杂段落保守跳过，并加入手机取件服务 |
| [sjzyouwen/thesis-template](https://github.com/sjzyouwen/thesis-template) | 将学校规范模板化，降低用户反复设置成本 | 用户仍需对应模板/样式和文档刷流程。本次让用户直接说具体要求；没有学校规范原文时不猜测官方格式 |
| [eligrey/FileSaver.js](https://github.com/eligrey/FileSaver.js) | 维护浏览器文件保存兼容策略 | 项目建议服务器文件先使用 Content-Disposition attachment，并记录 Safari/iOS 的限制。本次在云端模式使用服务器文件、取件页和系统分享；本机模式保留浏览器下载和缓存，并明确换浏览器需要重新选文件 |

以上表格中“差距”是针对本项目场景的工程判断，不表示这些项目没有其他适用场景。v3 未复制以上项目代码、模板或素材，也未把它们合并成依赖；沿用用户上传项目的总体结构并重新实现增强模块。

## 此前上传包 v2 的后端问题与改进

1. 自定义描述按整段查找字体，会把正文、标题和参考文献要求混用。v3 按段落作用范围分段解析，连续对话只合并目标参数。
2. v2 行距最终统一写 `lineRule=exact`，导致 1.5 倍实际上变成固定 18 磅。v3 区分倍数、固定值、最小值。
3. 数字标题识别先于部分参考文献判断，且 1.1 / 1.1.1 分层不准确。v3 优先尊重 Word 原有样式和 outline 层级，再谨慎做文本识别。
4. v2 只处理直接 `w:r`，可能漏过超链接内文字。v3 在同一段落内处理相关嵌套 runs，并跳过图形/复杂域。
5. ElementTree 重新命名 XML namespace 可能影响 `mc:Ignorable` 对前缀的引用。v3 使用保留命名空间的 lxml，并检查内容结构指纹。
6. v2 主要修改末尾 section；v3 遍历所有 section，同时保留横向页面和页眉页脚关联。
7. PDF 出错会删掉整个任务目录。v3 独立降级，已生成的 Word 继续可用。
8. v2 保留真实下载地址但手机交互不足。v3 增加独立取件状态、刷新恢复、复制链接、系统保存和明确的微信说明。
9. v2 到期主要靠新上传触发清理，旧地址可能仍读到结果。v3 在每次取件和文件请求时强制检查有效期。

## 现有 GitHub 静态站点的补充修复

1. 原页面调用了未定义的 `ensureDownloadWorker`，微信下还引用未定义的 `wechatGuide`。新页面移除这组未完成初始化。
2. 单一要求输入框改成连续对话、撤回、实时格式清单和明确的未识别提醒。
3. 原浏览器排版直接移除粗体属性，可能仍继承加粗；现在写入明确关闭值，同时区分倍数与固定行距，清除冲突的字体主题和缩进属性。
4. 不再把 `.doc` 纯文本提取作为保真转换；本机要求先另存为 `.docx`，云端通过 LibreOffice 转换。
5. 增加浏览器本地缓存和恢复、清除结果、手机分享能力检测、格式携带链接。纯静态模式不声称能跨浏览器携带论文文件。
6. 提供兼容现有根目录 Pages 发布方式的前端，以及按需接入的 HTTPS 后端。

## 云端手机下载设计依据

- 使用真实 HTTPS 文件地址和 `Content-Disposition: attachment`。不在异步上传完成后自动触发新窗口或 blob 下载。
- `navigator.share()` 有浏览器支持范围、HTTPS 和用户手势要求，不能假设所有微信 WebView 都支持。
- 准备文件与系统分享拆成两次点击。实际调用系统分享时直接响应第二次点击，避免网络请求消耗用户手势。
- 先 `canShare({files})` 检测具体格式；不支持 Word 分享时保留直接下载和 PDF 选择。
- 微信 User-Agent 模拟只能检查界面是否出现、链接是否有效，不能证明真实微信客户端一定放行下载。

参考：[MDN Navigator.share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share)、[GitHub Pages 官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)。
