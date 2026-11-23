/* 全站通用交互：启动视图切换、导航当前页标记、手机端底部使用窗口。
 * 与论文处理逻辑解耦，可被 index.html / privacy.html / disclaimer.html 共用。
 */
"use strict";
(() => {
  const $ = id => document.getElementById(id);

  const compliance = $('complianceBanner');
  if (compliance) {
    const message = $('complianceMessage'), compact = $('complianceCompact'), toggle = $('complianceToggle');
    const updateScrollPadding = () => {
      const height = Math.ceil(compliance.getBoundingClientRect().height);
      document.documentElement.style.setProperty('--compliance-height', height + 'px');
    };
    toggle.hidden = false;
    toggle.addEventListener('click', () => {
      const collapsed = !message.hidden;
      message.hidden = collapsed;
      compact.hidden = !collapsed;
      compliance.classList.toggle('is-collapsed', collapsed);
      toggle.setAttribute('aria-expanded', String(!collapsed));
      toggle.textContent = collapsed ? '展开' : '收起';
      updateScrollPadding();
    });
    updateScrollPadding();
    if (window.ResizeObserver) new ResizeObserver(updateScrollPadding).observe(compliance);
    else window.addEventListener('resize', updateScrollPadding);
  }

  /* ---------- 启动开始界面 → 工具主界面（单页双视图，无路由） ---------- */
  const launch = $('launchView'), app = $('appView'), start = $('startJourney');
  const mobileTabs = $('mobileTabs');
  const visualViewport = window.visualViewport;
  function dockMobileTabs() {
    if (!visualViewport || mobileTabs.hidden || visualViewport.height <= 0) return;
    // Safari 的固定定位边界和实际可见区域可能不同。
    const bottom = (visualViewport.offsetTop + visualViewport.height) + 'px';
    if (mobileTabs.style.getPropertyValue('--mobile-viewport-bottom') === bottom) return;
    mobileTabs.style.setProperty('--mobile-viewport-bottom', bottom);
    mobileTabs.classList.add('visual-viewport-dock');
  }
  function showApp() {
    if (!launch || !app || !app.hidden) return;
    launch.hidden = true;
    app.hidden = false;
    app.classList.add('view-entering');
    document.body.classList.add('tool-active');
    const skip = document.querySelector('.skip-link');
    if (skip) skip.setAttribute('href', '#mainContent');
    window.scrollTo(0, 0);
    app.querySelector('.intro h1').focus({preventScroll: true});
    if (mobileTabs) {
      mobileTabs.hidden = false;
      dockMobileTabs();
    }
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
  if (mobileTabs) {
    if (visualViewport) {
      let frame = 0;
      const requestDock = () => {
        if (frame || mobileTabs.hidden) return;
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          dockMobileTabs();
        });
      };
      visualViewport.addEventListener('resize', requestDock);
      visualViewport.addEventListener('scroll', requestDock, {passive:true});
      window.addEventListener('scroll', requestDock, {passive:true});
      window.addEventListener('resize', requestDock);
      window.addEventListener('pageshow', requestDock);
    }
    const buttons = Array.from(mobileTabs.querySelectorAll('[data-mobile-target]'));
    const mobileRun = $('mobileRun'), run = $('run');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
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
        if (targetId === 'result') {
          setActive('formatPanel');
          const anchor = $('run') || $('formatPanel');
          if (anchor) anchor.scrollIntoView({behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'center'});
          const status = $('status');
          if (status) {
            status.textContent = '还没有生成结果，请先确认格式并点击“生成排版文件”。';
            status.classList.remove('error');
          }
        }
        return;
      }
      const heading = target.querySelector('h2');
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({preventScroll: true});
      }
      target.scrollIntoView({behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start'});
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

  /* ---------- 文档损坏等未捕获异常的统一友好提示 ---------- */
  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason && (event.reason.message || String(event.reason));
    if (reason && /memory|allocation|out of memory/i.test(reason)) {
      event.preventDefault();
      const status = $('status');
      if (status) {
        status.textContent = '浏览器内存不足，处理已中止。请关闭其他标签页、拆分文档或更换浏览器后重试。';
        status.classList.add('error');
      }
    }
  });
})();
