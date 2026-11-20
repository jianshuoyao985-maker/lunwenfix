/* 内置示例文档（P1-5）：用 JSZip 现场构建一份结构完整、排版合规的 .docx。
 * 不包含任何真实论文或个人数据；用户无需上传自己的文件即可体验完整流程。
 */
"use strict";
window.LunwenSample = (() => {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`;

  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdStyles" Type="${R}/styles" Target="styles.xml"/>
</Relationships>`;

  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>示例论文：数字时代的协作学习</dc:title><dc:creator>lunwenfix.online 示例</dc:creator><dc:description>仅用于演示论文格式修复流程，不含真实论文内容。</dc:description>
<dcterms:created xsi:type="dcterms:W3CDTF">2026-01-01T00:00:00Z</dcterms:created>
</cp:coreProperties>`;

  /* 合规示范样式：正文宋体小四、1.5 倍行距、首行缩进 2 字符；
   * 一级标题黑体三号居中，二级黑体四号，三级黑体小四。 */
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="宋体" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/>
  <w:pPr><w:spacing w:before="0" w:after="0" w:line="360" w:lineRule="auto"/><w:ind w:firstLineChars="200" w:firstLine="480"/><w:jc w:val="both"/></w:pPr>
  <w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="宋体" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/>
  <w:pPr><w:spacing w:before="240" w:after="240" w:line="360" w:lineRule="auto"/><w:ind w:firstLineChars="0" w:firstLine="0"/><w:jc w:val="center"/></w:pPr>
  <w:rPr><w:rFonts w:eastAsia="黑体"/><w:b/><w:sz w:val="44"/><w:szCs w:val="44"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/>
  <w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120" w:line="360" w:lineRule="auto"/><w:ind w:firstLineChars="0" w:firstLine="0"/><w:jc w:val="center"/><w:outlineLvl w:val="0"/></w:pPr>
  <w:rPr><w:rFonts w:eastAsia="黑体"/><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:qFormat/>
  <w:pPr><w:keepNext/><w:spacing w:before="120" w:after="120" w:line="360" w:lineRule="auto"/><w:ind w:firstLineChars="0" w:firstLine="0"/><w:jc w:val="left"/><w:outlineLvl w:val="1"/></w:pPr>
  <w:rPr><w:rFonts w:eastAsia="黑体"/><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:qFormat/>
  <w:pPr><w:keepNext/><w:spacing w:before="120" w:after="60" w:line="360" w:lineRule="auto"/><w:ind w:firstLineChars="0" w:firstLine="0"/><w:jc w:val="left"/><w:outlineLvl w:val="2"/></w:pPr>
  <w:rPr><w:rFonts w:eastAsia="黑体"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
</w:styles>`;

  const P = (text, style, align) => {
    const props = (style ? '<w:pStyle w:val="' + style + '"/>' : '') + (align ? '<w:jc w:val="' + align + '"/>' : '');
    return '<w:p><w:pPr>' + props + '</w:pPr><w:r><w:t xml:space="preserve">' + text + '</w:t></w:r></w:p>';
  };
  const info = (text) => '<w:p><w:pPr><w:spacing w:line="360" w:lineRule="auto"/><w:ind w:firstLineChars="0" w:firstLine="0"/><w:jc w:val="center"/></w:pPr><w:r><w:t>' + text + '</w:t></w:r></w:p>';

  const body = [
    P('数字时代的协作学习：模式与效果研究', 'Title'),
    info('——以某高校本科毕业论文为例'),
    info('学　　院：教育学院'),
    info('专　　业：教育技术学'),
    info('姓　　名：张同学'),
    info('学　　号：20260001'),
    info('指导教师：李老师'),
    info('完成日期：2026 年 5 月'),
    '<w:p><w:r><w:br w:type="page"/></w:r></w:p>',
    P('摘要', 'Heading1'),
    P('本文围绕数字时代的协作学习展开研究，梳理协作学习的主要模式，并结合 2024 年 32 所高校的 486 份样本分析其学习效果。研究发现，结构化的协作任务、清晰的角色分工与及时的教师反馈，是提升协作学习效果的关键因素。'),
    P('关键词：协作学习；数字化学习；学习效果；高校教学', null, 'left'),
    P('第一章 绪论', 'Heading1'),
    P('随着信息技术与教育教学的深度融合，协作学习（Collaborative Learning）逐渐成为高校课堂的重要组织形式。本章介绍研究背景、研究问题与论文结构。'),
    P('1.1 研究背景', 'Heading2'),
    P('近年来，在线学习平台与智能终端快速普及。2024 年的调查数据显示，超过 78% 的受访学生使用过至少一种协作学习工具。与此同时，协作任务设计、过程性评价与学习效果之间的关系仍需进一步实证检验。'),
    P('1.1.1 研究问题', 'Heading3'),
    P('本研究聚焦三个问题：第一，协作学习的主要模式有哪些；第二，不同模式对学习效果的影响是否存在差异；第三，教师支持如何调节这一关系。'),
    P('第二章 文献综述', 'Heading1'),
    P('已有研究从社会建构主义、分布式认知等视角解释协作学习。Johnson 与 Johnson 指出，积极互赖与个体问责是有效协作的两个核心条件。国内学者也强调任务结构化与过程性评价的重要性。'),
    P('2.1 协作学习的模式', 'Heading2'),
    P('常见模式包括小组讨论、同伴互评、项目式协作与在线协作写作。不同模式对交流频率、任务复杂度与技术支持的要求不同，需要结合课程目标进行选择。'),
    P('第三章 研究设计', 'Heading1'),
    P('本研究采用问卷调查与半结构化访谈相结合的混合方法，样本来自 32 所高校的 486 名本科生。问卷包含协作学习参与度、教师支持感知与学习效果自评三个维度。'),
    P('第四章 结论与建议', 'Heading1'),
    P('研究表明，协作学习的效果并非自动产生，而是依赖任务设计、角色分工与教师反馈的共同作用。建议教师在课程设计中明确协作目标，提供过程性评价，并关注小组内部的参与均衡。'),
    P('参考文献', 'Heading1'),
    P('[1] 王某某. 协作学习的理论与实践[M]. 北京: 教育科学出版社, 2023.'),
    P('[2] 李某某, 赵某某. 高校在线协作学习效果的影响因素研究[J]. 现代教育技术, 2024, 34(2): 45-53.'),
    P('[3] Johnson D W, Johnson R T. Cooperation and Competition: Theory and Research[M]. Edina: Interaction Book Company, 2022.'),
    P('[4] Smith J, Brown A. Collaborative learning in higher education: a systematic review[J]. Studies in Higher Education, 2023, 48(6): 1121-1138.'),
    P('致谢', 'Heading1'),
    P('感谢指导教师在选题、研究设计与论文修改过程中给予的悉心指导，感谢参与调查的各位同学。'),
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1797" w:bottom="1440" w:left="1797" w:header="851" w:footer="992" w:gutter="0"/><w:cols w:space="425"/><w:docGrid w:linePitch="312"/></w:sectPr>'
  ].join('');

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}</w:body></w:document>`;

  async function create() {
    if (!window.JSZip) throw new Error('示例文档组件未加载，请刷新页面后重试。');
    const zip = new JSZip();
    zip.file('[Content_Types].xml', contentTypes);
    zip.file('_rels/.rels', rels);
    zip.file('docProps/core.xml', core);
    zip.file('word/document.xml', documentXml);
    zip.file('word/styles.xml', styles);
    zip.file('word/_rels/document.xml.rels', documentRels);
    const blob = await zip.generateAsync({type: 'blob', mimeType: MIME, compression: 'DEFLATE', compressionOptions: {level: 6}});
    return new File([blob], '示例论文_本科毕业论文格式示范.docx', {type: MIME, lastModified: Date.now()});
  }

  return {create};
})();
