# 部署到 lunwenfix.online

## GitHub Pages 直接部署

已读取仓库 `jianshuoyao985-maker/lunwenfix`，原始提交 `df6b68d75402070c3a4343dcf316652919e1a22a`。原始根目录只有 `index.html`、`jszip.min.js`、`tech-bg.webp`、`CNAME`；域名返回 GitHub Pages 响应，没有 `/health` 处理服务。

本次前端可直接在根目录发布，`CNAME` 不变。`config.js` 留空启用本机处理。请整组提交前端文件，勿只替换 HTML。

更新后访问 `https://lunwenfix.online`，发送“正文楷体五号”，选择合成 `.docx`，生成并下载；刷新确认可以恢复本浏览器的结果。

## 可选后端：微信换浏览器后无需重新上传

需要可运行 Docker 的 Linux 主机和 HTTPS 后端域名。GitHub Pages 不能运行 Python。可保留前端并另设后端子域名，实际地址由站点维护者配置。

1. 在服务器拉取本仓库，将 `.env.example` 复制为 `.env`，填入实际地址：

   ```dotenv
   PUBLIC_BASE_URL=https://实际后端域名
   ALLOWED_ORIGINS=https://lunwenfix.online
   MAX_UPLOAD_MB=40
   FILE_TTL_SECONDS=86400
   TRUST_PROXY=1
   ```

   `TRUST_PROXY=1` 仅用于下述单层受信任反向代理。`.env` 已被 Git 和 Docker 忽略，不提交密钥。`LLM_*` 留空仍支持常用自然语言描述。

2. 运行 `docker compose up -d --build`。镜像安装 LibreOffice 和中文字体，服务只映射主机本地 `127.0.0.1:8080`，持久化卷保存有效期内的取件文件。

3. 在已有 HTTPS 反向代理转发到 `127.0.0.1:8080`。Nginx 的 HTTPS `server` 内部配置示例：

   ```nginx
   client_max_body_size 41m;
   location / {
       proxy_pass http://127.0.0.1:8080;
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-Proto $scheme;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_read_timeout 310s;
   }
   ```

   域名解析和证书按主机环境配置。确认 `https://实际后端域名/health` 返回 `status: ok`。

4. 将前端 `config.js` 改为 `window.LUNWENFIX_API_BASE = "https://实际后端域名";`，提交后等待 Pages 更新。只填写公开地址，不填 AI Key。

5. 用合成论文验证 Word、PDF、压缩包及取件页。把取件链接复制到另一浏览器，确认无需重传即可下载。PDF 失败不会影响已生成的 Word。

直接访问后端首页也能使用完整服务：Flask 的 `/config.js` 自动选择同域 API。静态路由采用白名单，不能读取 `.env`、后端源码或任务源文件。

## 微信验收与限制

- iOS 微信和 Android 微信分别测试域名可达性、下载 Word、系统分享、右上角在浏览器打开、粘贴取件链接下载。
- `navigator.share` 和 Word 分享取决于客户端能力；微信 User-Agent 模拟不等于微信客户端实测。
- 本机缓存属于当前浏览器，可能被清理；只保留最近一份结果，过期缓存在后续访问时清理。换浏览器不能直接继承文件。
- 后端取件默认有效 24 小时，持有链接者可下载；到期访问被拒绝并清理文件。上传源文件处理完后删除。

## 回滚与交付状态

可通过 GitHub revert 合并回滚。只需关闭云端时，将根目录 `config.js` 改回空字符串并发布。

本地分支为 `feat/chat-mobile-format`。读取权限检查时，连接账号 `duyvxi` 对目标仓库只有 pull 权限，没有 push 权限，因此本地开发不代表已提交或上线。需连接仓库所属账号，或授权当前账号写入，再推送分支和创建 PR。
