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

  /* ---------- 手机端专用使用窗口：底部步骤导航 ---------- */
  const mobileTabs = $('mobileTabs');
  if (mobileTabs) {
    const buttons = Array.from(mobileTabs.querySelectorAll('[data-mobile-target]'));
    const mobileRun = $('mobileRun'), run = $('run');
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const setActive = targetId => {
      buttons.forEach(button => {
        const active = button.dataset.mobileTarget === targetId;
        button.classList.toggle('is-active', active);
        if (active) button.setAttribute('aria-current', 'true');
        else button.removeAttribute('aria-current');
      });
    };
    const go = targetId => {
      const target = document.getElementById(targetId);
      if (!target) return;
      if (target.hidden) {
        if (targetId === 'result' || targetId === 'previewPanel') {
          setActive('formatPanel');
          const anchor = $('run') || $('formatPanel');
          if (anchor) anchor.scrollIntoView({behavior: reduceMotion ? 'auto' : 'smooth', block: 'center'});
          const status = $('status');
          if (status) {
            status.textContent = '还没有生成结果，请先确认格式并点击“生成排版文件”。';
            status.classList.remove('error');
          }
        }
        return;
      }
      target.scrollIntoView({behavior: reduceMotion ? 'auto' : 'smooth', block: 'start'});
      setActive(targetId);
    };
    buttons.forEach(button => button.addEventListener('click', () => go(button.dataset.mobileTarget)));
    if (mobileRun && run) {
      const syncRun = () => {
        mobileRun.disabled = run.disabled;
        const busy = /正在整理/.test(run.textContent);
        const label = mobileRun.querySelector('.mobile-tab-label');
        if (label) label.textContent = busy ? '处理中' : '生成';
        mobileRun.classList.toggle('is-active', busy);
      };
      new MutationObserver(syncRun).observe(run, {attributes:true, childList:true, subtree:true, characterData:true});
      syncRun();
      mobileRun.addEventListener('click', () => { if (!mobileRun.disabled) run.click(); });
    }
    const result = $('result');
    if (result) new MutationObserver(() => {if (!result.hidden) setActive('result');}).observe(result, {attributes:true, attributeFilter:['hidden']});
    // 供论文处理逻辑在生成完成后同步手机端底栏状态。
    window.LunwenMobileTabs = {setActive};
  }

  /* ---------- footer 反馈表单（仅前端提示，不接后端） ---------- */
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
    // 不发送请求；如后续对接后端，在此处调用 fetch('/api/feedback', ...) 即可。
    feedback('提交成功，感谢你的反馈。内容仅在本页提示，不会上传服务器。' + (contact ? '如后续需要回复，会联系 ' + contact + '。' : '如需回复，可在下次反馈中留下邮箱。'));
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
