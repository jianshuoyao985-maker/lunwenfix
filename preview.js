/* 文档预览（P1-8）：直接渲染当前 docx 处理后的真实段落顺序与内容。
 * 已调整段落使用新规则样式；封面、目录、图片/公式等保留段落使用原文档样式近似。
 * 这里只做视觉示意，最终分页仍以 Word / WPS 打开为准。
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
  const sum = values => Object.values(values || {}).reduce((total, value) => total + (Number(value) || 0), 0);

  function paragraphStyle(style, kind) {
    if (!style || style.enabled === false) return '';
    const size = Number(style.size) || 12;
    const line = style.line || {mode: 'multiple', value: 1.5};
    const lineHeight = line.mode === 'multiple' ? size * line.value : Number(line.value) || size;
    const hanging = kind === 'reference' ? 2 : (Number(style.hanging) || 0);
    const rules = [
      'font-family:' + stack(style.font),
      'font-size:' + px(size) + 'px',
      'line-height:' + px(Math.max(lineHeight, size * 0.9)) + 'px',
      'text-align:' + ({left: 'left', center: 'center', right: 'right', both: 'justify'}[style.align] || 'justify'),
      'margin:' + px(style.space_before || 0) + 'px 0 ' + px(style.space_after || 0) + 'px',
      'font-weight:' + (style.bold === true ? '700' : '400')
    ];
    if (hanging > 0) {
      rules.push('padding-left:' + hanging + 'em', 'text-indent:-' + hanging + 'em');
    } else {
      rules.push('text-indent:' + (size * (Number(style.first_line) || 0)) + 'px');
    }
    return rules.join(';');
  }

  function render(container, result, options = {}) {
    if (!container || !result) return;
    const paragraphs = Array.isArray(result.preview) ? result.preview : [];
    const total = Number(result.preview_total) || paragraphs.length;
    const formatted = sum(result.report && result.report.formatted);
    const preserved = sum(result.report && result.report.preserved);
    const shown = paragraphs.filter(item => item && item.text).length;

    container.replaceChildren();
    container.hidden = false;
    const head = el('div', null, 'section-label');
    const title = el('h2', '排版预览'); title.id = 'previewTitle';
    head.append(el('span', '04', 'step'), title, el('span', '当前文档 · 实际内容', 'tag'));
    container.append(head);
    container.append(el('p', '以下是当前文档按新规则处理后的实际内容预览，保留封面、目录、正文、参考文献等原始顺序；已调整段落使用新样式，未调整段落沿用原文样式近似展示。最终分页以 Word / WPS 打开为准。', 'small-note'));
    if (paragraphs.length) {
      container.append(el('p', '本次预览：原文 ' + total + ' 段，展示 ' + shown + ' 段；已调整 ' + formatted + ' 段，保留原格式 ' + preserved + ' 段。表格、图片、公式以文字或占位方式示意。', 'preview-summary'));
    }

    if (!paragraphs.length) {
      container.append(el('p', '本次没有可展示的段落（可能文档为空或全部内容无法解析）。可下载 Word 后检查。', 'download-detail'));
    } else {
      const scroll = el('div', null, 'preview-scroll');
      const paper = el('div', null, 'preview-paper');
      paper.setAttribute('role', 'group');
      paper.setAttribute('aria-label', '文档预览：' + (result.original_name || '当前文档') + '，共 ' + total + ' 段');
      paper.append(el('p', result.original_name || '文档预览', 'preview-doc-title'));

      for (const item of paragraphs) {
        if (!item) continue;
        if (item.pageBreak) {
          const br = el('div', null, 'preview-page-break');
          br.setAttribute('role', 'separator');
          br.setAttribute('aria-label', '分页符');
          br.append(el('span', '分页符'));
          paper.append(br);
          continue;
        }
        if (item.placeholder) {
          const ph = el('p', '〔' + item.placeholder + '〕', 'preview-placeholder');
          ph.title = item.label || '保留原样';
          paper.append(ph);
          continue;
        }
        if (!item.text) continue;
        const p = el('p', item.text, 'preview-line' + (item.kind === 'reference' ? ' preview-reference' : ''));
        p.style.cssText = paragraphStyle(item.style, item.kind);
        p.title = (item.label || item.kind || '') + ' · ' + (item.style ? item.style.font + ' ' + item.style.size + 'pt' : '') + (item.preserved ? ' · 保留原格式' : ' · 已调整');
        if (item.preserved) p.dataset.preserved = 'true';
        paper.append(p);
      }
      scroll.append(paper);
      container.append(scroll);
      if (result.preview_truncated || paragraphs.length >= 300) {
        container.append(el('p', '文档较长，预览仅展示前 300 段；完整结果请下载 Word 文档查看。', 'small-note'));
      }
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
