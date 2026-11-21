/* 全站通用交互：启动视图切换、footer 反馈表单、导航当前页标记。
 * 与论文处理逻辑解耦，可被 index.html / privacy.html / disclaimer.html 共用。
 */
"use strict";
(() => {
  const $ = id => document.getElementById(id);

  /* ---------- 启动开始界面 → 工具主界面（单页双视图，无路由） ---------- */
  const launch = $('launchView'), app = $('appView'), start = $('startJourney');
  function showApp() {
    if (!launch || !app || !app.hidden) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    app.hidden = false;
    app.classList.add('view-entering');
    launch.classList.add('view-leaving');
    document.body.classList.add('tool-active');
    const skip = document.querySelector('.skip-link');
    if (skip) skip.setAttribute('href', '#mainContent');
    const finish = () => {
      launch.hidden = true;
      launch.classList.remove('view-leaving');
      app.classList.remove('view-entering');
      app.classList.add('view-active');
      const heading = app.querySelector('.intro h1');
      if (heading) {heading.setAttribute('tabindex', '-1'); heading.focus({preventScroll: true});}
    };
    if (reduce) {finish(); return;}
    window.setTimeout(finish, 340);
  }
  if (start) start.addEventListener('click', showApp);
  // 首次访问 / 刷新始终回到启动页，并回到顶部，避免浏览器恢复上次滚动位置。
  if (launch && app) {
    window.scrollTo(0, 0);
    window.addEventListener('pageshow', event => {if (event.persisted) window.scrollTo(0, 0);});
  }

  /* ---------- 导航当前页标记 ---------- */
  const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  document.querySelectorAll('.topnav a, .footer-links a').forEach(link => {
    const href = (link.getAttribute('href') || '').split('#')[0];
    const target = (href.split('/').pop() || 'index.html').toLowerCase();
    const current = target === page || (page === '' && target === 'index.html');
    if (current) link.setAttribute('aria-current', 'page');
  });

  /* ---------- footer 反馈表单（静态演示：仅前端提示，不接后端） ---------- */
  const form = $('feedbackForm'), statusNode = $('feedbackStatus');
  if (!form || !statusNode) return;
  const text = $('feedbackText'), email = $('feedbackEmail');
  function feedback(message, error = false) {
    statusNode.textContent = message;
    statusNode.classList.toggle('error', error);
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    const description = (text.value || '').trim(), contact = (email.value || '').trim();
    if (!description) {feedback('请先填写问题描述，再提交反馈。', true); text.focus(); return;}
    if (contact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {feedback('邮箱格式看起来不正确，可以留空或改成有效邮箱。', true); email.focus(); return;}
    // 静态版不发送请求；如后续对接后端，在此处调用 fetch('/api/feedback', ...) 即可。
    feedback('提交成功，感谢你的反馈。当前为静态演示版，内容仅在本页提示，不会上传服务器。' + (contact ? '如后续需要回复，会联系 ' + contact + '。' : '如需回复，可在下次反馈中留下邮箱。'));
    form.reset();
  });

  /* ---------- 文档损坏等未捕获异常的统一友好提示 ---------- */
  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason && (event.reason.message || String(event.reason));
    if (reason && /memory|allocation|out of memory/i.test(reason)) {
      event.preventDefault();
      feedback('浏览器内存不足，处理被中止。请关闭其他标签页、拆分文档或更换浏览器后重试。', true);
    }
  });
})();
