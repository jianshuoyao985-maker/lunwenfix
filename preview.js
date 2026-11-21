/* 文档样式预览（P1-8）：把本地处理后的段落样式渲染为 A4 纸面示意。
 * 仅做视觉预览，不重新解析 docx；PDF 预览明确标注依赖后端能力。
 */
"use strict";
window.LunwenPreview = (() => {
  const FONT_STACK = {
    '宋体': '"SimSun","Songti SC","Noto Serif CJK SC",serif',
    '黑体': '"SimHei","Heiti SC","Noto Sans CJK SC",sans-serif',
    '楷体': '"KaiTi","Kaiti SC","STKaiti",serif',
    '仿宋': '"FangSong","STFangsong",serif',
    '微软雅黑': '"Microsoft YaHei","PingFang SC",sans-serif',
    '等线': '"DengXian","Microsoft YaHei",sans-serif',
    'Times New Roman': '"Times New Roman",Times,serif',
    'Arial': 'Arial,Helvetica,sans-serif',
    'Calibri': 'Calibri,"Segoe UI",sans-serif',
    'Cambria': 'Cambria,Georgia,serif'
  };
  const el = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  const px = pt => Math.round(pt * 4 / 3 * 100) / 100;
  const stack = name => FONT_STACK[name] || '"' + String(name).replace(/"/g, '') + '","Songti SC",serif';

  function paragraphStyle(style, kind) {    if (!style || style.enabled === false) return '';
    const size = Number(style.size) || 12;
    const line = style.line || {mode: 'multiple', value: 1.5};
    const lineHeight = line.mode === 'multiple' ? size * line.value : Number(line.value) || size;
    const rules = [
      'font-family:' + stack(style.font),
      'font-size:' + px(size) + 'px',
      'line-height:' + px(Math.max(lineHeight, size * 0.9)) + 'px',
      'text-align:' + ({left: 'left', center: 'center', right: 'right', both: 'justify'}[style.align] || 'justify'),
      'margin:' + px(style.space_before || 0) + 'px 0 ' + px(style.space_after || 0) + 'px',
      'font-weight:' + (style.bold === true || String(kind).startsWith('heading') ? '700' : '400')
    ];
    if (kind === 'reference') {
      // GB/T 7714：2 字符悬挂缩进
      rules.push('padding-left:2em', 'text-indent:-2em');
    } else {
      rules.push('text-indent:' + (size * (Number(style.first_line) || 0)) + 'px');
    }
    return rules.join(';');
  }

  function render(container, result, options = {}) {
    if (!container || !result) return;
    const paragraphs = Array.isArray(result.preview) ? result.preview : [];
    container.replaceChildren();
    container.hidden = false;
    const head = el('div', null, 'section-label');
    const title = el('h2', '排版预览'); title.id = 'previewTitle';
    head.append(el('span', '04', 'step'), title, el('span', '本地预览 · 样式示意', 'tag'));
    container.append(head);
    container.append(el('p', '以下为处理后的段落样式示意，最终效果请以 Word / WPS 打开文件为准。', 'small-note'));

    if (!paragraphs.length) {
      container.append(el('p', '本次没有可展示的已格式化段落（可能均被保守跳过或保留原格式）。可下载 Word 后检查。', 'download-detail'));
    } else {
      const scroll = el('div', null, 'preview-scroll');
      const paper = el('div', null, 'preview-paper');
      paper.setAttribute('role', 'img');
      paper.setAttribute('aria-label', '排版预览：纸张样式示意，共 ' + paragraphs.length + ' 段');
      const docTitle = el('p', result.original_name ? result.original_name.replace(/\.docx$/i, '') : '排版预览', 'preview-doc-title');
      paper.append(docTitle);
      const limit = options.limit || 90;
      for (const item of paragraphs.slice(0, limit)) {
        if (!item || !item.text) continue;
        const p = el('p', item.text, 'preview-line');
        p.style.cssText = paragraphStyle(item.style, item.kind);
        p.title = (item.label || item.kind || '') + ' · ' + (item.style ? item.style.font + ' ' + item.style.size + 'pt' : '');
        if (item.kind === 'reference') p.classList.add('preview-reference');
        paper.append(p);
      }
      scroll.append(paper);
      container.append(scroll);
      if (paragraphs.length > limit) container.append(el('p', '预览仅展示前 ' + limit + ' 段，完整结果请下载 Word 文档查看。', 'small-note'));
    }

    const actions = el('div', null, 'preview-actions');
    const pdf = el('button', 'PDF 预览（需后端能力）', 'button outline');
    pdf.type = 'button'; pdf.disabled = true; pdf.setAttribute('aria-describedby', 'pdfPreviewNote');
    const note = el('p', 'PDF 预览依赖后端转换服务，本地模式暂不启用。可先下载 Word，用 Word / WPS 查看最终分页效果。', 'small-note');
    note.id = 'pdfPreviewNote';
    actions.append(pdf, note);
    container.append(actions);
  }

  return {render};
})();
