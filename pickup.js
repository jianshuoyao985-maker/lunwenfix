"use strict";
(() => {
  const node = document.getElementById('jobData'); if (!node) return;
  const initial = JSON.parse(node.textContent), panel = document.getElementById('pickup');
  const {el, render, url} = window.LunwenDownloads;
  let attempts = 0, failures = 0;
  function failure(message) {
    panel.replaceChildren(el('h1', '暂时无法取得文件'), el('p', message, 'download-detail'));
    const reload = el('button', '重新查看', 'button'); reload.addEventListener('click', () => location.reload());
    const home = el('a', '返回首页', 'button outline'); home.href = '/';
    panel.append(reload, home);
  }
  function show(data) {
    if (data.status === 'ready') {render(panel, data); return true;}
    if (data.status === 'error') {failure(data.error); return true;}
    panel.replaceChildren(el('h1', '你的论文正在整理'), el('p', data.stage, 'busy-view'), el('p', '可以保留此页面，稍后回来下载。无需再次上传。', 'download-detail'));
    return false;
  }
  async function poll() {
    if (++attempts > 450) {failure('处理时间较长，请稍后点击“重新查看”。'); return;}
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url(initial.status_url), {signal:controller.signal});
      const data = await response.json();
      if (!response.ok) {failure(data.error || '文件已过期，请重新生成。'); return;}
      failures = 0;
      if (show(data)) return;
    } catch (_) {if (++failures >= 3) {failure('网络连接中断，后台可能仍在处理。请稍后重新查看。'); return;}}
    finally {clearTimeout(timer);}
    setTimeout(poll, 2000);
  }
  if (!show(initial)) poll();
})();
