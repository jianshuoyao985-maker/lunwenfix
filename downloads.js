"use strict";
window.LunwenDownloads = (() => {
  let localUrls=[];
  function releaseLocal() {localUrls.forEach(u=>URL.revokeObjectURL(u));localUrls=[];}
  const blobUrl = blob => {const address=URL.createObjectURL(blob);localUrls.push(address);return address;};
  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function url(value) {
    const resolved = new URL(value, location.href);
    if (!['http:', 'https:'].includes(resolved.protocol)) throw new Error('下载地址无效');
    return resolved.href;
  }
  async function copy(text, input, feedback, success='已复制取件链接。在其他浏览器粘贴打开，即可继续下载。') {
    try {
      if (!navigator.clipboard || !window.isSecureContext) throw new Error('clipboard');
      await Promise.race([navigator.clipboard.writeText(text), new Promise((_, reject) => setTimeout(() => reject(new Error('clipboard timeout')), 1800))]);
      feedback.textContent = success;
    } catch (_) {
      input.focus(); input.select(); input.setSelectionRange(0, input.value.length);
      let copied=false;try{copied=document.execCommand && document.execCommand('copy');}catch(_){}
      feedback.textContent = copied ? success : '请长按已选中的链接，选择“复制”，再粘贴到浏览器。';
    }
  }
  function render(container, result) {
    releaseLocal();
    container.replaceChildren(); container.hidden = false;
    const head = el('div', null, 'result-head');
    head.append(el('span', '✓', 'success-icon'));
    const title = el('div');
    const h = el('h2', '论文，整理好了。'); h.id = 'resultTitle';
    title.append(h, el('p', result.original_name)); head.append(title); container.append(head);
    container.append(el('p','修改格式要求后，请重新生成文件。','small-note'));
    const expiry = new Date(result.expires_at * 1000).toLocaleString('zh-CN', {hour12:false});
    container.append(el('p', '取件链接有效至 ' + expiry + '。请及时保存；持有链接的人可以下载文件。', 'download-detail'));
    const wechat = /MicroMessenger/i.test(navigator.userAgent);
    const help = el('div', null, 'wechat-help');
    help.append(el('strong', wechat ? '当前在微信中打开' : '在手机上保存文件'));
    help.append(el('span', wechat ? '可先点击下载 Word。若微信只显示预览或拦截下载，点击右上角“···”选择“在浏览器打开”，或复制下方取件链接到 Safari / 系统浏览器；文件仍会保留，无需重新上传。' : '若打开的是预览，使用浏览器的分享菜单选择“存储到文件”或用 Word/WPS 打开。也可以复制取件链接，换一台设备下载。'));
    container.append(help);
    const actions = el('div', null, 'download-actions');
    function link(label, address, cls, preview) {
      const a = el('a', label, 'button ' + (cls || ''));
      a.href = url(address);
      if (preview) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      actions.append(a); return a;
    }
    link('下载 Word 文档 ↓', result.docx_url);
    if (result.pdf_url) {
      link('下载 PDF ↓', result.pdf_url, 'secondary');
      link('预览 PDF · ' + result.pdf_pages + ' 页', result.preview_url, 'outline', true);
    }
    link('下载压缩包 ↓', result.zip_url, 'outline');
    link('处理说明', result.report_url, 'outline');
    container.append(actions);
    const feedback = el('p', '', 'download-feedback'); feedback.setAttribute('role', 'status');
    if (navigator.share && navigator.canShare && window.isSecureContext) {
      const prepare = el('button', '准备手机保存 / 分享', 'button secondary');
      const format = el('select'); format.setAttribute('aria-label', '选择保存的文件格式');
      format.append(new Option('Word', 'docx'));
      if (result.pdf_url) format.append(new Option('PDF', 'pdf'));
      let prepared = null;
      format.addEventListener('change', () => {prepared = null; prepare.textContent = '准备手机保存 / 分享';});
      prepare.addEventListener('click', async () => {
        if (prepared) {
          try { await navigator.share({files: [prepared]}); }
          catch (error) { if (error.name !== 'AbortError') feedback.textContent = '系统未能分享此文件，请使用下载按钮或复制取件链接。'; }
          return;
        }
        prepare.disabled = true; format.disabled = true; prepare.textContent = '正在准备…';
        const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 60000);
        try {
          const kind = format.value;
          const response = await fetch(url(result[kind + '_url']), {signal: controller.signal});
          if (!response.ok) throw new Error('文件不存在或已过期');
          if (Number(response.headers.get('Content-Length') || 0) > 25*1024*1024) throw new Error('此文件较大，请使用直接下载');
          const blob = await response.blob();
          if (blob.size > 25*1024*1024) throw new Error('此文件较大，请使用直接下载');
          const name = result.original_name.replace(/\.(docx?|DOCX?)$/, '') + '_格式整理.' + kind;
          const file = new File([blob], name, {type: kind === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
          if (!navigator.canShare({files: [file]})) throw new Error('当前浏览器不支持分享此格式，请直接下载或尝试 PDF');
          prepared = file; prepare.textContent = '点击保存 / 分享' + (kind === 'pdf' ? ' PDF' : ' Word');
          feedback.textContent = '文件已准备好，再点一次即可打开系统菜单。可选择存储到文件或其他应用。';
        } catch (error) { feedback.textContent = error.name === 'AbortError' ? '准备超时，请直接下载或复制取件链接。' : error.message; prepare.textContent = '重新准备手机保存'; }
        finally {clearTimeout(timer); prepare.disabled = false; format.disabled = false;}
      });
      actions.append(format, prepare);
    }
    const linkBox = el('div', null, 'download-link-box');
    const input = el('input'); input.value = url(result.share_url); input.readOnly = true; input.setAttribute('aria-label', '取件链接');
    const copyButton = el('button', '复制取件链接', 'button outline');
    copyButton.addEventListener('click', () => copy(input.value, input, feedback));
    const open = el('a', '打开取件页', 'button outline'); open.href = url(result.share_url);
    linkBox.append(input, copyButton, open); container.append(linkBox, feedback);
    const verified = result.report && result.report.content_unchanged;
    container.append(el('p', verified ? '✓ 输出 Word 的正文结构校验通过。请检查封面、目录与复杂排版后提交。' : '请检查最终排版后提交。', 'download-detail'));
    for (const warning of result.warnings || []) container.append(el('p', warning, 'warning-line'));
  }
  function renderLocal(container,result,{persisted=false,rules}={}) {
    releaseLocal();container.replaceChildren();container.hidden=false;
    const head=el('div',null,'result-head'),title=el('div'),h=el('h2','论文，整理好了。');h.id='resultTitle';
    title.append(h,el('p',result.original_name));head.append(el('span','✓','success-icon'),title);container.append(head);
    container.append(el('p','生成于 '+new Date(result.created_at).toLocaleString('zh-CN',{hour12:false})+'。修改格式要求后，请重新生成文件。','small-note'));
    container.append(el('p',persisted?'结果已保存在本浏览器中，24 小时内刷新页面可恢复。浏览器可能提前清理缓存，请及时下载。':'浏览器未能保存结果缓存，请在关闭此页前下载。','download-detail'));
    const help=el('div',null,'wechat-help');
    help.append(el('strong',/MicroMessenger/i.test(navigator.userAgent)?'当前在微信中打开':'在手机上保存文件'));
    help.append(el('span','点击下载 Word，或使用可用的系统保存 / 分享入口。如果当前浏览器拦截下载，可复制下方“网址与格式”到系统浏览器，重新选择论文并生成。网址只携带格式设置，不包含文件；换浏览器后本机文件不会自动转移。'));
    container.append(help);
    const actions=el('div',null,'download-actions'),feedback=el('p','','download-feedback');feedback.setAttribute('role','status');
    const a=el('a','下载 Word 文档 ↓','button');a.href=blobUrl(result.blob);a.download=result.name;
    a.addEventListener('click',()=>{feedback.textContent='已请求浏览器保存。若出现文档预览，请通过分享菜单存储到文件，或用 Word / WPS 打开。';});actions.append(a);
    const shareFile=new File([result.blob],result.name,{type:result.blob.type});
    let canShare=false;try{canShare=window.isSecureContext && navigator.share && navigator.canShare && navigator.canShare({files:[shareFile]});}catch(_){}
    if(canShare) {
      const share=el('button','保存 / 分享 Word','button secondary');share.type='button';
      share.addEventListener('click',async()=>{
        // The File is already prepared: invoke share directly in this click gesture.
        share.disabled=true;
        try{await navigator.share({files:[shareFile]});feedback.textContent='已交给系统分享菜单，请确认文件已保存。';}
        catch(error){feedback.textContent=error.name==='AbortError'?'已取消分享，文件仍可下载。':'当前系统未能分享此文件，请使用下载按钮或换浏览器生成。';}
        finally{share.disabled=false;}
      });actions.append(share);
    }
    const report=el('a','下载处理说明','button outline');report.href=blobUrl(new Blob([JSON.stringify(result.report,null,2)],{type:'application/json;charset=utf-8'}));report.download=result.name.replace(/\.docx$/i,'_处理说明.json');actions.append(report);
    const clear=el('button','清除本机结果','button outline');clear.type='button';
    clear.addEventListener('click',async()=>{clear.disabled=true;try{await window.LunwenLocalFiles.clear();releaseLocal();container.replaceChildren(el('p','本机结果已清除。已下载的文件不受影响。','download-detail'));}catch(_){feedback.textContent='未能清除缓存，请通过浏览器的网站数据设置清理。';clear.disabled=false;}});
    actions.append(clear);container.append(actions);
    if(rules) {
      const linkBox=el('div',null,'download-link-box'),input=el('input');input.readOnly=true;input.setAttribute('aria-label','网址与格式');
      const data=new TextEncoder().encode(JSON.stringify(rules));
      const site=new URL(location.pathname,location.origin);site.hash='format='+btoa(Array.from(data,b=>String.fromCharCode(b)).join(''));input.value=site.href;
      const copyButton=el('button','复制网址与格式','button outline');copyButton.type='button';
      copyButton.addEventListener('click',()=>copy(input.value,input,feedback,'已复制网址与格式。请在系统浏览器打开后重新选择论文，文件不会随链接传递。'));
      linkBox.append(input,copyButton);container.append(linkBox);
    }
    container.append(feedback,el('p','✓ 正文内容结构校验通过。'+Object.entries(result.report.formatted).map(([k,v])=>(window.LunwenRules.labels[k]||k)+' '+v+' 段').join(' · '),'download-detail'));
    for(const note of result.report.notes.slice(1))container.append(el('p',note,'small-note'));
  }
  return {render,renderLocal,el,url};
})();
