"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const base = String(window.LUNWENFIX_API_BASE || '').replace(/\/+$/, '');
  let local = !base;
  const api = path => base + path;
  const el = window.LunwenDownloads.el;
  let rules = null, rows = [], context = ['body'], history = [], file = null;
  let busy = false, chatting = false, connected = false, maxMB = 40, pollSerial = 0;
  let conversation = [], defaultsData = null;
  const storage = {
    get(key) {try{return JSON.parse(sessionStorage.getItem(key));}catch(_){return null;}},
    set(key, value) {try{sessionStorage.setItem(key, JSON.stringify(value));}catch(_){}},
    remove(key) {try{sessionStorage.removeItem(key);}catch(_){}}
  };
  function saveChat() {storage.set('lunwenfix-v3-chat', {rules, rows, context, history:history.slice(-12), conversation:conversation.slice(-40)});}
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
    $('run').disabled = !file || !rules || busy || chatting || !connected;
    $('send').disabled = !rules || busy || chatting || !connected;
    $('message').disabled = busy || chatting;
    $('file').disabled = busy;
    $('undo').disabled = !history.length || busy || chatting;
    $('reset').disabled = !rules || busy || chatting;
    $('makePdf').disabled = busy;
    $('useAi').disabled = busy || chatting;
    document.querySelectorAll('.chip').forEach(n => n.disabled = busy || chatting);
  }
  function status(text, error = false) {$('status').textContent = text; $('status').classList.toggle('error', error);}
  function message(role, text, changes = [], warnings = []) {
    const outer = el('div', null, 'message ' + role);
    outer.append(el('span', role === 'user' ? '你' : 'F', 'avatar'));
    const content = el('div', text, 'message-content');
    for (const row of changes) content.append(el('div', row.label + '：' + row.value, 'change-line'));
    for (const warning of warnings) content.append(el('div', warning, 'warning-line'));
    outer.append(content); $('messages').append(outer); $('messages').scrollTop = $('messages').scrollHeight;
  }
  function paintChat() {
    $('messages').replaceChildren();
    message('assistant', '你好，把学校的格式要求发给我就好。\n我会列出识别到的设置，你可以接着补充，或撤回上一轮。没提到的部分使用清单中的默认格式。');
    for (const m of conversation) message(m.role, m.text, m.changes, m.warnings);
  }
  function paintRules(changed = []) {
    $('ruleSummary').replaceChildren();
    const main = el('dl'), more = el('details'), extra = el('dl');
    more.append(el('summary', '查看摘要、题注等其余格式'));
    for (const row of rows) {
      const item = el('div', null, 'rule-row' + (changed.includes(row.scope) ? ' changed' : ''));
      item.append(el('dt', row.label), el('dd', row.value));
      (['body','heading1','heading2','reference','page'].includes(row.scope) ? main : extra).append(item);
    }
    more.append(extra); $('ruleSummary').append(main, more);
    $('summaryNote').textContent = history.length || (defaultsData && JSON.stringify(rules)!==JSON.stringify(defaultsData.rules)) ? '已按描述更新 · 未提及的项目沿用当前值' : '未指定的项目使用下方默认值';
  }
  async function sendMessage() {
    const text = $('message').value.trim();
    if (!text || chatting || !rules) return !text;
    chatting = true; controls(); $('send').textContent = '正在理解…';
    const snapshot = {rules, rows, context, conversation:conversation.slice()};
    message('user', text);
    try {
      const data = local ? window.LunwenRules.parse(text,rules,context) : await jsonFetch('/api/chat', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({message:text,rules,context,use_ai:$('useAi').checked})});
      history.push(snapshot);
      rules = data.rules; rows = data.summary; context = data.context;
      conversation.push({role:'user', text}, {role:'assistant', text:data.reply, changes:data.changes, warnings:data.warnings});
      message('assistant', data.reply, data.changes, data.warnings);
      paintRules(data.changes.map(x => x.scope)); saveChat(); $('message').value = '';
      $('engine').textContent = data.engine === 'ai' ? '智能理解' : '常用格式识别';
      return true;
    } catch (error) {message('assistant', error.message + ' 你的描述仍保留在输入框，可再次发送。'); return false;}
    finally {chatting = false; controls(); $('send').textContent = '发送要求 ↑';}
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
  function chooseFile(selected) {
    if (!selected || busy) return;
    function reject(text) {file=null;$('file').value='';$('fileName').textContent='重新选择论文';status(text,true);controls();}
    if (!/\.docx?$/i.test(selected.name)) {reject('请选择 Word 文档。'); return;}
    if (local && !/\.docx$/i.test(selected.name)) {reject('请先用 Word / WPS 把旧版 .doc 另存为 .docx，再上传。'); return;}
    if (!selected.size || selected.size > maxMB*1024*1024) {reject('请选择非空且不超过 ' + maxMB + ' MB 的文件。'); return;}
    file = selected; $('fileName').textContent = file.name; $('fileMeta').textContent = (file.size/1024/1024).toFixed(2) + ' MB · 已选择';
    status('已选择论文。可继续描述要求，或按当前格式生成。'); controls();
  }
  $('file').addEventListener('change', () => chooseFile($('file').files[0]));
  $('file').addEventListener('focus', () => $('dropZone').classList.add('focused'));
  $('file').addEventListener('blur', () => $('dropZone').classList.remove('focused'));
  for (const type of ['dragover','dragenter']) $('dropZone').addEventListener(type, event => {event.preventDefault(); if (!busy) $('dropZone').classList.add('dragover');});
  for (const type of ['dragleave','drop']) $('dropZone').addEventListener(type, event => {event.preventDefault(); $('dropZone').classList.remove('dragover'); if (type === 'drop') chooseFile(event.dataTransfer.files[0]);});
  function showResult(data) {
    window.LunwenDownloads.render($('result'), data);
    $('result').scrollIntoView({behavior:'smooth',block:'start'});
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
        status(data.stage + '。可以稍后从取件链接继续查看。');
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
  $('run').addEventListener('click', async () => {
    if (!file || busy || chatting) return;
    if ($('message').value.trim() && !(await sendMessage())) return;
    busy = true; controls(); $('progress').hidden = false; $('run').textContent = '正在整理…';
    try {
      if (local) {
        const result = await window.LunwenFormatter.format(file,rules,status);
        let persisted=false;
        try {await window.LunwenLocalFiles.save(result);persisted=true;}catch(_){}
        window.LunwenDownloads.renderLocal($('result'),result,{persisted,rules});
        status('文件已生成，下载入口在下方。');
        $('result').scrollIntoView({behavior:'smooth',block:'start'});
        return;
      }
      status('正在上传论文，请保持网络连接。');
      const form = new FormData(); form.append('file', file); form.append('rules', JSON.stringify(rules)); form.append('make_pdf', $('makePdf').checked ? '1' : '0');
      const data = await jsonFetch('/api/jobs', {method:'POST',body:form}, 180000);
      const job = {token:data.token,share_url:data.share_url};
      storage.set('lunwenfix-v3-job', job); resumeNotice(job, '论文已上传，处理结果可从此处取回。');
      await pollJob(data.token);
    } catch (error) {status(error.message, true);}
    finally {busy = false; $('progress').hidden = true; $('run').textContent = '生成排版文件 →'; controls();}
  });
  function modeUI() {
    $('pdfOption').hidden=local;$('aiOption').hidden=local || !defaultsData.ai_available;$('aiPrivacy').hidden=$('aiOption').hidden;
    $('file').accept=local?'.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document':'.docx,.doc,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    $('fileMeta').textContent=(local?'支持 .docx':'支持 .docx / .doc')+'，最大 '+maxMB+' MB';
    $('privacyNote').textContent=local?'文档在当前浏览器内处理，不上传。生成结果可在本浏览器内恢复，原稿不会被覆盖。':'文档会上传至本站处理服务。取件链接在有效期内可跨浏览器下载，请及时保存。';
    $('footerMode').textContent=local?'本机处理 · Word 下载与手机保存':'云端处理 · Word / PDF 与跨设备取件';
    $('wechatStart').hidden=!/MicroMessenger/i.test(navigator.userAgent);
    $('wechatStart').textContent=local?'你正在微信中使用。本机结果只在当前微信浏览器内保存。若下载受限，建议先从右上角选择“在浏览器打开”，再选择论文；也可在生成后尝试系统分享。':'你正在微信中使用。生成后可复制取件链接到系统浏览器继续下载，无需重新上传。';
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
  async function startLocal() {
    local=true;defaultsData={rules:window.LunwenRules.defaults(),max_upload_mb:40,ai_available:false};
    defaultsData.summary=window.LunwenRules.summary(defaultsData.rules);
    rules=defaultsData.rules;rows=defaultsData.summary;maxMB=40;connected=true;
    $('connection').hidden=true;$('localFallback').hidden=true;$('resume').hidden=true;
    modeUI();restoreChat();
    try {
      const result=await window.LunwenLocalFiles.latest();
      if(result){window.LunwenDownloads.renderLocal($('result'),result,{persisted:true,rules});status('已恢复本浏览器中上次生成的文件。');}
    }catch(_){}
  }
  $('localFallback').addEventListener('click',()=>{startLocal();});
  window.addEventListener('hashchange',()=>{if(connected&&!busy&&location.hash.startsWith('#format='))restoreChat();});
  async function boot() {
    paintChat();
    if (local) {await startLocal();return;}
    try {
      const address=new URL(base,location.href);
      if(address.protocol!=='https:' && !['localhost','127.0.0.1'].includes(address.hostname))throw new Error('处理服务地址需要使用 HTTPS。');
      defaultsData = await jsonFetch('/api/rules', {}, 15000);
      rules = defaultsData.rules; rows = defaultsData.summary; maxMB = defaultsData.max_upload_mb;
      connected = true; $('connection').hidden = true;
      modeUI();restoreChat();
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
      $('connection').textContent = error.message + ' 刷新页面可以重新连接。'; $('connection').classList.add('error');
      $('localFallback').hidden=false;
      $('ruleSummary').replaceChildren(el('p', '连接成功后将显示格式清单。', 'muted')); controls();
    }
  }
  boot();
})();
