"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const base = String(window.LUNWENFIX_API_BASE || '').replace(/\/+$/, '');
  const hasBackend = !!base;
  // 核心隐私承诺：文档始终在本机格式化；AI 只解析格式文本，云端上传需用户主动勾选。
  let local = true;
  const api = path => base + path;
  const el = window.LunwenDownloads.el;
  let rules = null, rows = [], context = ['body'], history = [], file = null;
  let busy = false, chatting = false, connected = false, maxMB = 40, pollSerial = 0;
  let conversation = [], defaultsData = null, backendReady = false, aiAvailable = false;
  const storage = {
    get(key) {try{return JSON.parse(sessionStorage.getItem(key));}catch(_){return null;}},
    set(key, value) {try{sessionStorage.setItem(key, JSON.stringify(value));}catch(_){}},
    remove(key) {try{sessionStorage.removeItem(key);}catch(_){}}
  };
  const cloudMode = () => backendReady && $('useCloud').checked;
  function saveChat() {storage.set('lunwenfix-v3-chat', {rules, rows, context, history:history.slice(-12), conversation:conversation.slice(-40)});}

  /* ---------- 格式清单下拉框：常用预设，点击后立即写入当前规则 ---------- */
  const PARAGRAPH_PRESETS = {
    body: [
      {id:'song-xiaosi', label:'宋体小四 · 1.5 倍 · 首行 2 字', style:{font:'宋体',size:12,line:{mode:'multiple',value:1.5},align:'both',first_line:2,bold:null,space_before:0,space_after:0}},
      {id:'fangsong-san', label:'仿宋三号 · 1.5 倍 · 首行 2 字', style:{font:'仿宋',size:16,line:{mode:'multiple',value:1.5},align:'both',first_line:2,bold:null,space_before:0,space_after:0}},
      {id:'kai-xiaosi', label:'楷体小四 · 1.5 倍 · 首行 2 字', style:{font:'楷体',size:12,line:{mode:'multiple',value:1.5},align:'both',first_line:2,bold:null,space_before:0,space_after:0}},
      {id:'song-wuhao', label:'宋体五号 · 单倍 · 首行 2 字', style:{font:'宋体',size:10.5,line:{mode:'multiple',value:1},align:'both',first_line:2,bold:null,space_before:0,space_after:0}},
      {id:'song-xiaosi-2', label:'宋体小四 · 2 倍 · 首行 2 字', style:{font:'宋体',size:12,line:{mode:'multiple',value:2},align:'both',first_line:2,bold:null,space_before:0,space_after:0}},
      {id:'song-fixed-20', label:'宋体小四 · 固定行距 20 磅', style:{font:'宋体',size:12,line:{mode:'exact',value:20},align:'both',first_line:2,bold:null,space_before:0,space_after:0}}
    ],
    heading1: [
      {id:'hei-san-center', label:'黑体三号 · 居中', style:{font:'黑体',size:16,line:{mode:'multiple',value:1.5},align:'center',first_line:0,bold:true,space_before:12,space_after:6}},
      {id:'hei-er-center', label:'黑体二号 · 居中', style:{font:'黑体',size:22,line:{mode:'multiple',value:1.5},align:'center',first_line:0,bold:true,space_before:12,space_after:6}},
      {id:'song-san-bold', label:'宋体三号 · 加粗 · 居中', style:{font:'宋体',size:16,line:{mode:'multiple',value:1.5},align:'center',first_line:0,bold:true,space_before:12,space_after:6}},
      {id:'hei-xiaosan', label:'黑体小三 · 居中', style:{font:'黑体',size:15,line:{mode:'multiple',value:1.5},align:'center',first_line:0,bold:true,space_before:12,space_after:6}}
    ],
    heading2: [
      {id:'hei-si', label:'黑体四号 · 左对齐', style:{font:'黑体',size:14,line:{mode:'multiple',value:1.5},align:'left',first_line:0,bold:true,space_before:6,space_after:6}},
      {id:'hei-xiaosan', label:'黑体小三 · 左对齐', style:{font:'黑体',size:15,line:{mode:'multiple',value:1.5},align:'left',first_line:0,bold:true,space_before:6,space_after:6}},
      {id:'song-si-bold', label:'宋体四号 · 加粗 · 左对齐', style:{font:'宋体',size:14,line:{mode:'multiple',value:1.5},align:'left',first_line:0,bold:true,space_before:6,space_after:6}}
    ],
    reference: [
      {id:'song-wuhao', label:'宋体五号 · GB/T 7714 悬挂', style:{font:'宋体',size:10.5,line:{mode:'multiple',value:1},align:'left',first_line:0,bold:null,space_before:0,space_after:0}},
      {id:'fangsong-wuhao', label:'仿宋五号 · GB/T 7714 悬挂', style:{font:'仿宋',size:10.5,line:{mode:'multiple',value:1},align:'left',first_line:0,bold:null,space_before:0,space_after:0}},
      {id:'kai-wuhao', label:'楷体五号 · GB/T 7714 悬挂', style:{font:'楷体',size:10.5,line:{mode:'multiple',value:1},align:'left',first_line:0,bold:null,space_before:0,space_after:0}}
    ]
  };
  const MARGIN_PRESETS = [
    {id:'keep', label:'保留当前页边距', value:null},
    {id:'standard', label:'标准：上下 2.54 / 左右 3.17 cm', value:[2.54,2.54,3.17,3.17]},
    {id:'compact', label:'紧凑：上下 2.54 / 左右 2.54 cm', value:[2.54,2.54,2.54,2.54]},
    {id:'wide', label:'上下 2.5 / 左右 3 cm', value:[2.5,2.5,3,3]},
    {id:'narrow', label:'上下 2.0 / 左右 2.5 cm', value:[2,2,2.5,2.5]}
  ];
  const styleSignature = style => JSON.stringify({enabled:!!style.enabled,font:style.font,size:style.size,line:[style.line.mode,style.line.value],align:style.align,first_line:style.first_line,bold:style.bold,space_before:style.space_before,space_after:style.space_after});
  const presetIdFor = (scope, style) => {
    if (!style.enabled) return 'keep';
    const signature = styleSignature(style);
    const match = (PARAGRAPH_PRESETS[scope] || []).find(preset => styleSignature({...preset.style, enabled:true}) === signature);
    return match ? match.id : 'custom';
  };
  const marginPresetId = page => {
    if (['top_cm','bottom_cm','left_cm','right_cm'].every(key => page[key] === null)) return 'keep';
    const values = ['top_cm','bottom_cm','left_cm','right_cm'].map(key => page[key]);
    const match = MARGIN_PRESETS.find(preset => preset.value && preset.value.every((value, i) => Math.abs(value - values[i]) < 0.001));
    return match ? match.id : 'custom';
  };
  function selectOptions(select, options, current) {
    for (const [value, label] of options) select.append(new Option(label, value));
    if (!options.some(([value]) => value === current)) select.append(new Option('当前：' + current, current));
    select.value = current;
  }
  function pushHistory() {history.push({rules:JSON.parse(JSON.stringify(rules)),rows,context,conversation:conversation.slice()});}
  function commitRuleChange(scope, focusField = 'preset') {
    try {rules = window.LunwenRules.validate(rules);}
    catch (error) {status(error.message, true); return;}
    rows = window.LunwenRules.summary(rules);
    paintRules([scope]); saveChat(); controls();
    const select = $('ruleSummary').querySelector('select[data-scope="' + scope + '"][data-field="' + focusField + '"]');
    if (select) select.focus();
  }
  function applyPreset(scope, id) {
    if (id === 'custom') return;
    pushHistory();
    if (id === 'keep') rules.sections[scope].enabled = false;
    else {
      const preset = (PARAGRAPH_PRESETS[scope] || []).find(item => item.id === id);
      if (!preset) return;
      Object.assign(rules.sections[scope], preset.style, {enabled:true});
    }
    commitRuleChange(scope);
  }
  function applyPage(field, raw) {
    if (field === 'margin' && raw === 'custom') return;
    pushHistory();
    if (field === 'paper') {
      rules.page.paper = raw === 'A4' ? 'A4' : 'keep';
    } else if (raw === 'keep') {
      for (const key of ['top_cm','bottom_cm','left_cm','right_cm']) rules.page[key] = null;
    } else {
      const preset = MARGIN_PRESETS.find(item => item.id === raw);
      if (preset && preset.value) ['top_cm','bottom_cm','left_cm','right_cm'].forEach((key, i) => rules.page[key] = preset.value[i]);
    }
    commitRuleChange('page', field);
  }

  function friendlyError(error) {
    const raw = String((error && error.message) || error || '未知错误');
    if (/memory|allocation|out of memory|内存/i.test(raw)) return '浏览器内存不足，处理已中止。请关闭其他标签页、拆分文档或更换 Chrome / Edge 后重试。';
    if (/QuotaExceeded/i.test(raw)) return '浏览器本地存储空间不足。请清理本站数据，或取消“临时保留结果”后重试。';
    if (/InvalidStateError/i.test(raw)) return '浏览器状态异常，请刷新页面后重试。';
    return raw;
  }

  async function jsonFetch(path, opts = {}, timeout = 35000) {
    const control = new AbortController(), timer = setTimeout(() => control.abort(), timeout);
    try {
      const res = await fetch(api(path), {...opts, signal:control.signal});
      let data;
      try {data = await res.json();}catch(_) {throw new Error('处理服务暂不可用，请稍后重试。');}
      if (!res.ok) throw new Error(data.error || '请求未成功（' + res.status + '）');
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('连接超时，请检查网络后重试。');
      if (error instanceof TypeError) throw new Error('无法连接处理服务，请检查网络或稍后重试。');
      throw error;
    } finally {clearTimeout(timer);}
  }
  function controls() {
    const cloud = cloudMode();
    $('run').disabled = !file || !rules || busy || chatting || (cloud && !backendReady);
    $('send').disabled = !rules || busy || chatting;
    $('message').disabled = busy || chatting;
    $('file').disabled = busy;
    $('undo').disabled = !history.length || busy || chatting;
    $('reset').disabled = !rules || busy || chatting;
    $('makePdf').disabled = busy;
    $('useAi').disabled = busy || chatting;
    $('useCloud').disabled = busy;
    $('keepResult').disabled = busy;
    $('loadSample').disabled = busy || chatting;
    document.querySelectorAll('.chip').forEach(n => n.disabled = busy || chatting);
  }
  function status(text, error = false) {$('status').textContent = text; $('status').classList.toggle('error', error);}
  function uploadError(text) {
    $('uploadError').textContent = text;
    $('dropZone').classList.toggle('is-invalid', Boolean(text));
    if (text) $('file').setAttribute('aria-invalid', 'true');
    else $('file').removeAttribute('aria-invalid');
  }
  function scrollToResult() {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const heading = $('resultTitle');
    heading.tabIndex = -1;
    heading.focus({preventScroll: true});
    $('result').scrollIntoView({behavior: reducedMotion ? 'auto' : 'smooth', block: 'start'});
  }
  /* 进度条：percent 为空时使用不确定进度（云端排队/上传），数值模式用于本地处理。 */
  function progress(text, percent) {
    const bar = $('progress');
    bar.hidden = false;
    if (percent == null) {
      bar.removeAttribute('value');
      bar.setAttribute('aria-valuetext', text);
      status(text);
    } else {
      const value = Math.max(0, Math.min(100, Math.round(percent)));
      bar.value = value;
      bar.setAttribute('aria-valuetext', text + ' ' + value + '%');
      status(text + '（' + value + '%）');
    }
  }
  function message(role, text, changes = [], warnings = []) {
    const outer = el('div', null, 'message ' + role);
    const avatar = el('span', role === 'user' ? '你' : '', 'avatar');
    if (role !== 'user') {
      const img = document.createElement('img');
      img.src = './favicon.svg'; img.alt = ''; img.width = 29; img.height = 29; img.setAttribute('aria-hidden', 'true');
      avatar.append(img);
    }
    outer.append(avatar);
    const content = el('div', text, 'message-content');
    for (const row of changes) content.append(el('div', row.label + '：' + row.value, 'change-line'));
    for (const warning of warnings) content.append(el('div', warning, 'warning-line'));
    outer.append(content); $('messages').append(outer); $('messages').scrollTop = $('messages').scrollHeight;
  }
  function paintChat() {
    $('messages').replaceChildren();
    message('assistant', '你好，把学校的格式要求发给我就好。\n文档默认只在当前浏览器内处理，不会上传。我会列出识别到的设置，你可以接着补充，或撤回上一轮。页眉页脚、目录、封面、公式等请自行核对。');
    for (const m of conversation) message(m.role, m.text, m.changes, m.warnings);
  }
  function paintRules(changed = []) {
    $('ruleSummary').replaceChildren();
    const main = el('dl'), more = el('details'), extra = el('dl');
    more.append(el('summary', '查看摘要、题注等其余格式'));
    const field = (label, select) => {
      const wrap = el('label', null, 'rule-field');
      wrap.append(el('span', label, 'rule-field-label'), select);
      return wrap;
    };
    const makeSelect = (options, current, aria, scope, name, onChange) => {
      const select = document.createElement('select');
      select.className = 'rule-select';
      select.dataset.scope = scope;
      select.dataset.field = name;
      select.setAttribute('aria-label', aria);
      selectOptions(select, options, current);
      select.addEventListener('change', () => onChange(select.value));
      return select;
    };
    const paragraphEditor = row => {
      const style = rules.sections[row.scope];
      const current = presetIdFor(row.scope, style);
      const options = (PARAGRAPH_PRESETS[row.scope] || []).map(preset => [preset.id, preset.label]);
      if (current === 'custom') options.unshift(['custom', '当前自定义格式（保持）']);
      options.push(['keep', '保留原格式']);
      const select = makeSelect(options, current, row.label + '格式预设', row.scope, 'preset', value => applyPreset(row.scope, value));
      const editor = el('div', null, 'rule-editor');
      editor.append(field('格式预设', select), el('p', row.value, 'rule-current'));
      return editor;
    };
    const pageEditor = row => {
      const paper = makeSelect([['keep', '保留纸张尺寸'], ['A4', 'A4']], rules.page.paper, '页面纸张', 'page', 'paper', value => applyPage('paper', value));
      const marginId = marginPresetId(rules.page);
      const marginOptions = MARGIN_PRESETS.map(preset => [preset.id, preset.label]);
      if (marginId === 'custom') marginOptions.unshift(['custom', '当前自定义页边距（保持）']);
      const margin = makeSelect(marginOptions, marginId, '页面页边距', 'page', 'margin', value => applyPage('margin', value));
      const editor = el('div', null, 'rule-editor rule-editor-page');
      editor.append(field('纸张', paper), field('页边距', margin), el('p', row.value, 'rule-current'));
      return editor;
    };
    for (const row of rows) {
      const item = el('div', null, 'rule-row' + (changed.includes(row.scope) ? ' changed' : ''));
      const dd = el('dd');
      if (row.scope === 'page') dd.append(pageEditor(row));
      else if (PARAGRAPH_PRESETS[row.scope]) dd.append(paragraphEditor(row));
      else dd.textContent = row.value;
      item.append(el('dt', row.label), dd);
      (['body','heading1','heading2','reference','page'].includes(row.scope) ? main : extra).append(item);
    }
    more.append(extra); $('ruleSummary').append(main, more);
    $('summaryNote').textContent = history.length || (defaultsData && JSON.stringify(rules)!==JSON.stringify(defaultsData.rules)) ? '已按描述更新 · 未提及的项目沿用当前值' : '未指定的项目使用下方默认值';
  }
  async function sendMessage() {
    const text = $('message').value.trim();
    if (!text || chatting || !rules) return !text;
    chatting = true; controls(); $('sendLabel').textContent = '正在理解…';
    const snapshot = {rules, rows, context, conversation:conversation.slice()};
    message('user', text);
    try {
      let data;
      if (aiAvailable && $('useAi').checked) {
        // AI 模式仅发送格式描述、规则清单与段落范围；绝不发送论文文件或正文。
        data = await jsonFetch('/api/chat', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({message:text,rules,context,use_ai:true})});
      } else {
        data = window.LunwenRules.parse(text, rules, context);
      }
      history.push(snapshot);
      rules = data.rules; rows = data.summary; context = data.context;
      conversation.push({role:'user', text}, {role:'assistant', text:data.reply, changes:data.changes, warnings:data.warnings});
      message('assistant', data.reply, data.changes, data.warnings);
      paintRules((data.changes || []).map(x => x.scope)); saveChat(); $('message').value = '';
      $('engine').textContent = data.engine === 'ai' ? '智能理解' : '常用格式识别';
      return true;
    } catch (error) {message('assistant', friendlyError(error) + ' 你的描述仍保留在输入框，可再次发送。'); return false;}
    finally {chatting = false; controls(); $('sendLabel').textContent = '发送要求';}
  }
  $('chatForm').addEventListener('submit', event => {event.preventDefault(); sendMessage();});
  $('message').addEventListener('keydown', event => {if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.isComposing) {event.preventDefault(); sendMessage();}});
  document.querySelectorAll('[data-example]').forEach(button => button.addEventListener('click', () => {$('message').value = button.dataset.example; $('message').focus();}));
  $('undo').addEventListener('click', () => {
    const old = history.pop(); if (!old) return;
    ({rules, rows, context, conversation} = old); paintChat(); paintRules(); controls(); saveChat();
  });
  $('reset').addEventListener('click', () => {
    history.push({rules, rows, context, conversation:conversation.slice()});
    rules = defaultsData.rules; rows = defaultsData.summary; context = ['body'];
    conversation.push({role:'assistant', text:'已恢复默认格式。可以重新描述要求，或点击撤回恢复刚才的设置。'});
    paintChat(); paintRules(); controls(); saveChat();
  });
  function rejectFile(text) {
    file = null;
    $('file').value = '';
    $('fileName').textContent = '重新选择论文';
    $('fileMeta').textContent = fileSupportLabel();
    $('largeFileHint').hidden = true;
    uploadError(text);
    status('请重新选择论文并核对格式清单。');
    controls();
  }
  function chooseFile(selected, options = {}) {
    if (!selected || busy) return;
    if (!/\.docx?$/i.test(selected.name)) {rejectFile('请选择 Word 文档。'); return;}
    if (!cloudMode() && !/\.docx$/i.test(selected.name)) {rejectFile('请先用 Word / WPS 把旧版 .doc 另存为 .docx，再上传。'); return;}
    if (!selected.size || selected.size > maxMB*1024*1024) {rejectFile('请选择非空且不超过 ' + maxMB + ' MB 的文件。'); return;}
    uploadError('');
    file = selected;
    const mb = file.size/1024/1024;
    const sizeLabel = mb >= 1 ? mb.toFixed(2) + ' MB' : Math.max(1, Math.round(file.size/1024)) + ' KB';
    $('fileName').textContent = file.name;
    $('fileMeta').textContent = sizeLabel + ' · ' + (options.sample ? '示例文档 · ' : '') + '已选择';
    // 超大文件提前预警：不阻止处理，但明确提示卡顿/内存风险。
    const hint = $('largeFileHint');
    if (mb >= 20) {
      hint.hidden = false;
      hint.textContent = '文件约 ' + mb.toFixed(1) + ' MB，较大，处理时浏览器可能短暂卡顿。请保持标签页在前台、关闭其他占用内存的页面；如仍失败，可压缩论文图片、拆分文档或改用 Chrome / Edge。';
      try {
        const memory = performance.memory;
        if (memory && memory.jsHeapSizeLimit && file.size > memory.jsHeapSizeLimit * 0.2) {
          hint.textContent += ' 当前浏览器可用内存偏紧，建议先关闭其他标签页。';
        }
      } catch (_) {}
    } else {
      hint.hidden = true;
    }
    status(options.sample ? '示例文档已加载。可以点击快捷话术或输入排版要求，再生成并预览。' : '已选择论文。可继续描述要求，或按当前格式生成。');
    controls();
  }
  $('file').addEventListener('change', () => chooseFile($('file').files[0]));
  $('file').addEventListener('focus', () => $('dropZone').classList.add('focused'));
  $('file').addEventListener('blur', () => $('dropZone').classList.remove('focused'));
  for (const type of ['dragover','dragenter']) $('dropZone').addEventListener(type, event => {event.preventDefault(); if (!busy) $('dropZone').classList.add('dragover');});
  for (const type of ['dragleave','drop']) $('dropZone').addEventListener(type, event => {event.preventDefault(); $('dropZone').classList.remove('dragover'); if (type === 'drop') chooseFile(event.dataTransfer.files[0]);});

  /* 一键加载内置示例文档，走与真实上传完全相同的本地流程。 */
  $('loadSample').addEventListener('click', async () => {
    if (busy || chatting) return;
    const button = $('loadSample'), label = button.textContent;
    button.disabled = true; button.textContent = '正在准备示例…';
    try {
      if (!window.LunwenSample) throw new Error('示例文档组件未加载，请刷新页面后重试。');
      const sample = await window.LunwenSample.create();
      chooseFile(sample, {sample:true});
      $('message').focus();
    } catch (error) {
      $('uploadError').textContent = friendlyError(error);
    }
    finally {button.disabled = false; button.textContent = label;}
  });

  function showResult(data) {
    $('previewPanel').hidden = true;
    window.LunwenDownloads.render($('result'), data);
    if (window.LunwenMobileTabs) window.LunwenMobileTabs.setActive('result');
    scrollToResult();
    status('文件已生成，下载入口在下方。');
    storage.set('lunwenfix-v3-job', {token:data.token, share_url:data.share_url});
  }
  async function pollJob(token) {
    const serial = ++pollSerial; const start = Date.now(); let errors = 0;
    while (serial === pollSerial && Date.now()-start < 900000) {
      try {
        const data = await jsonFetch('/api/jobs/' + encodeURIComponent(token), {}, 15000);
        errors = 0;
        if (data.status === 'ready') {showResult(data); return;}
        if (data.status === 'error') throw Object.assign(new Error(data.error), {terminal:true});
        progress(data.stage + '。可以稍后从取件链接继续查看。', null);
      } catch (error) {
        if (error.terminal) throw error;
        if (++errors >= 3) throw new Error('暂时无法查询结果，后台任务可能仍在继续。请稍后打开上方取件链接。');
        status('网络连接中断，正在重新查询…');
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    if (serial === pollSerial) throw new Error('等待时间较长，请稍后打开取件链接查看。');
  }
  function resumeNotice(job, label) {
    $('resume').replaceChildren(el('span', label)); $('resume').hidden = false;
    const link = el('a', '打开取件页'); link.href = window.LunwenDownloads.url(job.share_url);
    $('resume').append(link);
  }
  async function cloudGenerate() {
    $('previewPanel').hidden = true;
    progress('正在上传论文，请保持网络连接…', null);
    const form = new FormData(); form.append('file', file); form.append('rules', JSON.stringify(rules)); form.append('make_pdf', $('makePdf').checked ? '1' : '0');
    const data = await jsonFetch('/api/jobs', {method:'POST',body:form}, 180000);
    const job = {token:data.token,share_url:data.share_url};
    storage.set('lunwenfix-v3-job', job); resumeNotice(job, '论文已上传，处理结果可从此处取回。');
    await pollJob(data.token);
  }
  $('run').addEventListener('click', async () => {
    if (!file || busy || chatting) return;
    if ($('message').value.trim() && !(await sendMessage())) return;
    busy = true; controls(); $('progress').hidden = false; $('runLabel').textContent = '正在整理…';
    // 浏览器卡顿兜底：处理超过 15 秒仍无结果时给出可操作提示（不打断处理）。
    const slowTimer = window.setTimeout(() => {
      if (!busy) return;
      $('largeFileHint').hidden = false;
      $('largeFileHint').textContent = '处理时间较长，页面可能短暂无响应。请保持标签页在前台，不要重复点击；如超过 1 分钟仍无进展，请压缩论文图片、拆分文档或更换 Chrome / Edge 后重试。';
    }, 15000);
    try {
      if (cloudMode()) {
        await cloudGenerate();
      } else {
        const result = await window.LunwenFormatter.format(file, rules, progress);
        let persisted = false, saveFailed = false;
        if ($('keepResult').checked) {
          try {await window.LunwenLocalFiles.save({...result, opt_in:true}); persisted = true;} catch (_) {persisted = false; saveFailed = true;}
        } else {
          try {await window.LunwenLocalFiles.clear();} catch (_) {}
        }
        window.LunwenDownloads.renderLocal($('result'), result, {persisted, saveFailed, rules});
        if (window.LunwenPreview) window.LunwenPreview.render($('previewPanel'), result);
        $('previewPanel').hidden = false;
        if (window.LunwenMobileTabs) window.LunwenMobileTabs.setActive('result');
        // 成功完成后收起仅由“处理较慢”触发的临时提示，保留原有大文件预警。
        if ($('largeFileHint').textContent.startsWith('处理时间较长')) $('largeFileHint').hidden = true;
        status('文件已生成，预览与下载入口在下方。');
        scrollToResult();
      }
    } catch (error) {
      const text = friendlyError(error);
      status(text, true);
      if (/内存不足/.test(text)) {
        $('largeFileHint').hidden = false;
        $('largeFileHint').textContent = '处理中断：' + text;
      }
    }
    finally {window.clearTimeout(slowTimer); busy = false; $('progress').hidden = true; $('progress').value = 0; $('runLabel').textContent = '生成排版文件'; controls();}
  });
  $('useCloud').addEventListener('change', () => {
    if (file && !cloudMode() && !/\.docx$/i.test(file.name)) {
      file = null; $('file').value = ''; $('fileName').textContent = '请重新选择 .docx 文件'; $('fileMeta').textContent = '本机处理仅支持 .docx';
    }
    modeUI(); controls();
    status(cloudMode() ? '已选择云端增强：生成时会先上传文档。' : '已切换回本机处理：文档不会上传。');
  });
  $('keepResult').addEventListener('change', () => {
    status($('keepResult').checked ? '已选择在浏览器临时保留结果 24 小时，可随时清除。' : '结果默认不保存，关闭或刷新页面后自动销毁。');
  });
  function fileSupportLabel() {
    return (cloudMode() ? '支持 .docx / .doc' : '支持 .docx') + '，最大 ' + maxMB + ' MB';
  }
  function modeUI() {
    const cloud = cloudMode();
    $('cloudOption').hidden = !backendReady;
    $('cloudPrivacy').hidden = !backendReady;
    $('keepResultOption').hidden = cloud;
    $('pdfOption').hidden = !cloud;
    $('aiOption').hidden = !aiAvailable;
    $('aiPrivacy').hidden = !aiAvailable;
    $('file').accept = cloud ? '.docx,.doc,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document' : '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (!file) $('fileMeta').textContent = fileSupportLabel();
    $('privacyNote').textContent = cloud
      ? '已选择云端增强：生成时会先上传文档到处理服务，用于生成 PDF 与取件链接。原稿不会被覆盖。'
      : '文档全程在当前浏览器内处理，不上传服务器；默认关闭页面后文件自动销毁，工具不存储你的文档。';
    $('footerMode').textContent = cloud ? '云端增强 · 上传后可生成 PDF 与取件链接' : (backendReady ? '本机处理 · 可选 AI 仅发送格式规则' : '本机处理 · Word 下载与手机保存');
    $('wechatStart').hidden = !/MicroMessenger/i.test(navigator.userAgent);
    $('wechatStart').textContent = cloud
      ? '你正在微信中使用。云端生成后可复制取件链接到系统浏览器继续下载，无需重新上传。'
      : '你正在微信中使用。本机结果默认只在当前微信浏览器内存在，关闭后销毁；若下载受限，建议从右上角选择“在浏览器打开”，再重新选择论文。';
  }
  function restoreChat() {
    const saved = storage.get('lunwenfix-v3-chat');
    if (saved && Array.isArray(saved.conversation) && Array.isArray(saved.history)) {
      try {
        rules=window.LunwenRules.validate(saved.rules);rows=window.LunwenRules.summary(rules);
        context=Array.isArray(saved.context)?saved.context:['body'];
        history=saved.history.filter(h=>{try{window.LunwenRules.validate(h.rules);return Array.isArray(h.rows)&&Array.isArray(h.context)&&Array.isArray(h.conversation);}catch(_){return false;}}).slice(-12);
        conversation=saved.conversation.slice(-40).filter(m=>m&&typeof m.text==='string');
      }catch(_){storage.remove('lunwenfix-v3-chat');}
    }
    if (location.hash.startsWith('#format=')) {
      try {
        const encoded=location.hash.slice(8);if(encoded.length>20000)throw new Error();
        const data=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))));
        rules=window.LunwenRules.validate(data);rows=window.LunwenRules.summary(rules);context=['body'];history=[];
        conversation=[{role:'assistant',text:'已带入原浏览器中的格式设置。请在这里重新选择论文，再生成文件。'}];
        saveChat();
      }catch(_){status('链接中的格式设置无效，请重新描述要求。',true);}
      window.history.replaceState(null,'',location.pathname+location.search);
    }
    paintChat();paintRules();controls();
  }
  async function startLocal(notice = '') {
    local = true; backendReady = false; aiAvailable = false;
    defaultsData = {rules:window.LunwenRules.defaults(),max_upload_mb:40,ai_available:false};
    defaultsData.summary = window.LunwenRules.summary(defaultsData.rules);
    rules = defaultsData.rules; rows = defaultsData.summary; maxMB = 40; connected = true;
    $('connection').hidden = !notice;
    if (notice) {$('connection').textContent = notice; $('connection').classList.add('error');}
    else $('connection').classList.remove('error');
    $('localFallback').hidden = true; $('resume').hidden = true;
    modeUI(); restoreChat();
    try {
      const result = await window.LunwenLocalFiles.latest();
      if (result) {
        $('keepResult').checked = true;
        window.LunwenDownloads.renderLocal($('result'), result, {persisted:true, rules});
        if (window.LunwenPreview) window.LunwenPreview.render($('previewPanel'), result);
        $('previewPanel').hidden = false;
        status('已恢复本浏览器中上次生成的文件。');
      }
    } catch (_) {}
  }
  $('localFallback').addEventListener('click', () => startLocal('已使用本机规则解析，文档不会上传。'));
  window.addEventListener('hashchange', () => {if (connected && !busy && location.hash.startsWith('#format=')) restoreChat();});
  window.addEventListener('beforeunload', event => {
    if (busy) {event.preventDefault(); event.returnValue = '文件正在处理，离开将丢失本次结果。';}
  });
  window.addEventListener('error', event => {
    if (/memory|allocation|out of memory/i.test(String(event.message || ''))) {
      status('浏览器内存不足，处理可能已中断。请关闭其他标签页、拆分文档或更换浏览器后重试。', true);
    }
  });
  async function boot() {
    paintChat();
    if (!hasBackend) {await startLocal(); return;}
    try {
      const address = new URL(base, location.href);
      if (address.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(address.hostname)) throw new Error('处理服务地址需要使用 HTTPS。');
      defaultsData = await jsonFetch('/api/rules', {}, 15000);
      rules = defaultsData.rules; rows = defaultsData.summary; maxMB = defaultsData.max_upload_mb || 40;
      aiAvailable = !!defaultsData.ai_available; backendReady = true; connected = true;
      $('connection').hidden = true; $('connection').classList.remove('error');
      modeUI(); restoreChat();
      const job = storage.get('lunwenfix-v3-job');
      if (job && /^[a-f0-9]{32}$/.test(job.token)) {
        resumeNotice(job, '上次的处理结果仍可通过取件页查看。');
        try {
          const data = await jsonFetch('/api/jobs/' + job.token);
          if (data.status === 'ready') window.LunwenDownloads.render($('result'), data);
          else if (['queued','processing'].includes(data.status)) {
            busy = true; controls(); $('progress').hidden = false;
            try {await pollJob(job.token);}catch (error) {status(error.message,true);}
            finally {busy = false; controls(); $('progress').hidden = true;}
          }
        } catch (_) {storage.remove('lunwenfix-v3-job');}
      }
    } catch (error) {
      // 云端增强或 AI 不可用时，自动回退到本机规则解析；文档仍不上传。
      await startLocal('云端增强暂不可用（' + friendlyError(error) + '）。已切换为本机规则解析，文档仍在当前浏览器内处理。');
    }
  }
  boot();
})();
