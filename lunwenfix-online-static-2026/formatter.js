/* Conservative OOXML edits. Only word/document.xml is replaced in the ZIP. */
"use strict";
window.LunwenFormatter = (() => {
  const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const M='http://schemas.openxmlformats.org/officeDocument/2006/math';
  const MIME='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const ORDER={
    pPr:'pStyle keepNext keepLines pageBreakBefore framePr widowControl numPr suppressLineNumbers pBdr shd tabs suppressAutoHyphens kinsoku wordWrap overflowPunct topLinePunct autoSpaceDE autoSpaceDN bidi adjustRightInd snapToGrid spacing ind contextualSpacing mirrorIndents suppressOverlap jc textDirection textAlignment textboxTightWrap outlineLvl divId cnfStyle rPr sectPr pPrChange'.split(' '),
    rPr:'rStyle rFonts b bCs i iCs caps smallCaps strike dstrike outline shadow emboss imprint noProof snapToGrid vanish webHidden color spacing w kern position sz szCs highlight u effect bdr shd fitText vertAlign rtl cs em lang eastAsianLayout specVanish oMath rPrChange'.split(' '),
    sectPr:'headerReference footerReference footnotePr endnotePr type pgSz pgMar paperSrc pgBorders lnNumType pgNumType cols formProt vAlign noEndnote titlePg textDirection bidi rtlGutter docGrid printerSettings sectPrChange'.split(' ')
  };
  const all=(node,name,ns=W)=>Array.from(node.getElementsByTagNameNS(ns,name));
  const direct=(node,name)=>node && Array.from(node.children).find(n=>n.namespaceURI===W&&n.localName===name);
  const attr=(node,name)=>node?.getAttributeNS(W,name);
  const set=(node,values)=>{for (const [k,v] of Object.entries(values)) node.setAttributeNS(W,'w:'+k,String(v));};
  const remove=(node,names)=>names.forEach(k=>node.removeAttributeNS(W,k));
  function ancestor(node,name) {for(let p=node.parentElement;p;p=p.parentElement)if(p.namespaceURI===W&&p.localName===name)return p;return null;}
  function ensure(parent,name) {
    let node=direct(parent,name);if(node)return node;
    node=parent.ownerDocument.createElementNS(W,'w:'+name);
    if ((name==='pPr'&&parent.localName==='p')||(name==='rPr'&&parent.localName==='r')) parent.insertBefore(node,parent.firstChild);
    else {
      const order=ORDER[parent.localName]||[],rank=order.indexOf(name);
      parent.insertBefore(node,Array.from(parent.children).find(n=>n.namespaceURI===W&&order.indexOf(n.localName)>rank)||null);
    }
    return node;
  }
  function xml(text) {
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('不支持含自定义 XML 实体的文档。');
    const doc=new DOMParser().parseFromString(text,'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Word 结构损坏，请用 Word 另存为 .docx 后重试。');
    return doc;
  }
  function checkZip(bytes) {
    // Inspect the central directory before decompression; reject ZIP64 and encrypted files.
    const view=new DataView(bytes);let end=-1;
    for (let i=view.byteLength-22;i>=Math.max(0,view.byteLength-65557);i--) {
      if(view.getUint32(i,true)===0x06054b50 && i+22+view.getUint16(i+20,true)===view.byteLength){end=i;break;}
    }
    if(end<0)throw new Error('这不是有效的 .docx 文件，请用 Word 另存为 .docx。');
    const count=view.getUint16(end+10,true),offset=view.getUint32(end+16,true),cdSize=view.getUint32(end+12,true);
    if(view.getUint16(end+4,true)||view.getUint16(end+6,true)||view.getUint16(end+8,true)!==count||count>5000||offset+cdSize!==end)throw new Error('文档压缩结构不受支持，或包含过多文件。');
    let pos=offset,total=0;const names=new Set(),decode=new TextDecoder();
    for(let i=0;i<count;i++) {
      if(pos+46>end||view.getUint32(pos,true)!==0x02014b50)throw new Error('Word 压缩目录损坏。');
      if(view.getUint16(pos+8,true)&1)throw new Error('请先移除 Word 文件密码。');
      const size=view.getUint32(pos+24,true),n=view.getUint16(pos+28,true),extra=view.getUint16(pos+30,true),comment=view.getUint16(pos+32,true);
      if(pos+46+n+extra+comment>end)throw new Error('Word 压缩目录损坏。');
      const name=decode.decode(new Uint8Array(bytes,pos+46,n));
      if(names.has(name)||name.includes('..')||name.startsWith('/')||name.includes('\\'))throw new Error('Word 文件内部路径异常。');
      if(/vbaproject/i.test(name))throw new Error('请将含宏的文件另存为不含宏的 .docx。');
      names.add(name);total+=size;
      if(size===0xffffffff||total>150*1024*1024||(/\.xml$/i.test(name)&&size>12*1024*1024))throw new Error('文档解压后过大，请压缩图片或拆分文档后重试。');
      pos+=46+n+extra+comment;
    }
    if(pos!==end||!names.has('word/document.xml')||!names.has('[Content_Types].xml'))throw new Error('这不是完整的 Word 文档。');
  }
  function fingerprint(root) {
    const clone=root.cloneNode(true);
    for(const node of [...all(clone,'pPr'),...all(clone,'rPr')]) {
      const sect=direct(node,'sectPr');if(sect)node.parentNode.insertBefore(sect.cloneNode(true),node);
      node.remove();
    }
    for(const sect of all(clone,'sectPr')) for(const prop of Array.from(sect.children)) if(prop.namespaceURI===W&&['pgSz','pgMar'].includes(prop.localName))prop.remove();
    function tree(node) {
      if(node.nodeType!==1)return [node.nodeType,node.nodeValue];
      return [node.namespaceURI,node.localName,Array.from(node.attributes).filter(a=>a.namespaceURI!=='http://www.w3.org/2000/xmlns/').map(a=>[a.namespaceURI,a.localName,a.value]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),Array.from(node.childNodes).map(tree)];
    }
    return JSON.stringify(tree(clone));
  }
  function stylesIndex(text) {
    if(!text)return new Map();const doc=xml(text),styles=new Map();
    for(const s of all(doc,'style')) styles.set(attr(s,'styleId'),{name:attr(direct(s,'name'),'val')||'',base:attr(direct(s,'basedOn'),'val'),outline:attr(direct(direct(s,'pPr'),'outlineLvl'),'val'),numbered:!!direct(direct(s,'pPr'),'numPr')});
    return styles;
  }
  function styleInfo(p,styles) {
    const ppr=direct(p,'pPr'),outline=attr(direct(ppr,'outlineLvl'),'val');
    let kind=['0','1','2'].includes(outline)?'heading'+(Number(outline)+1):null;
    let sid=attr(direct(ppr,'pStyle'),'val'),numbered=!!direct(ppr,'numPr');const visited=new Set();
    while(sid&&!visited.has(sid)) {
      visited.add(sid);const info=styles.get(sid)||{},name=info.name||sid;numbered ||= !!info.numbered;
      if(/^TOC|目录|table of contents|^(Title|Subtitle|标题|副标题)$/i.test(name))return {kind:'protected',numbered};
      const m=name.match(/(?:heading|标题)\s*([123])/i);
      if(!kind && m)kind='heading'+m[1];
      if(!kind && ['0','1','2'].includes(info.outline))kind='heading'+(Number(info.outline)+1);
      sid=info.base;
    }
    return {kind,numbered};
  }
  function classify(text,info,region) {
    if(info.kind==='protected')return ['protected',region];
    // 静态目录条目（点线/省略号 + 页码）不参与重排，避免破坏目录。
    if(/^.{0,70}(?:\.{3,}|…{2,})\s*\d{1,4}\s*$/.test(text))return ['protected',region];
    const compact=text.replace(/\s+/g,'');
    if(/^(摘要|Abstract|中文摘要|英文摘要)$/i.test(compact))return ['heading1','abstract'];
    if(/^(参考文献|References)$/i.test(compact))return ['heading1','reference'];
    if(/^(致谢|附录[A-Z一二三四五0-9]*|目录)$/i.test(compact))return [compact==='目录'?'protected':'heading1','body'];
    if(/^(关键词|关键字|Key\s*words)\s*[:：]/i.test(text))return ['keyword','body'];
    if(/^\s*\[\d+\]/.test(text))return ['reference',region];
    if(info.kind)return [info.kind,'body'];
    if(/^[图表]\s*\d+/.test(text)&&text.length<140)return ['caption',region];
    if(text.length<=70&&!/[。！？；]/.test(text)) {
      if(/^第[一二三四五六七八九十百0-9]+[章节]\s*\S/.test(text)||/^[一二三四五六七八九十]+[、．.]\s*\S/.test(text))return ['heading1','body'];
      const m=text.match(/^(\d{1,2}(?:[.．]\d{1,2}){0,2})(?:[、.]?\s+)(\S.+)$/);
      if(m&&!/^[%％\d]/.test(m[2]))return ['heading'+(m[1].split(/[.．]/).length),'body'];
    }
    return [region==='reference'?'reference':region==='abstract'?'abstract':'body',region];
  }
  function formatRun(rpr,style) {
    const fonts=ensure(rpr,'rFonts');remove(fonts,['asciiTheme','hAnsiTheme','eastAsiaTheme','cstheme','csTheme']);
    set(fonts,{eastAsia:style.font,ascii:style.latin_font,hAnsi:style.latin_font,cs:style.latin_font});
    for(const tag of ['sz','szCs'])set(ensure(rpr,tag),{val:Math.round(style.size*2)});
    if(style.bold!==null)for(const tag of ['b','bCs'])set(ensure(rpr,tag),{val:style.bold?'1':'0'});
  }
  function formatParagraph(p,style,heading,kind) {
    const ppr=ensure(p,'pPr');set(ensure(ppr,'jc'),{val:style.align});
    set(ensure(ppr,'snapToGrid'),{val:'0'});set(ensure(ppr,'contextualSpacing'),{val:'0'});
    if(heading)set(ensure(ppr,'keepNext'),{val:'1'});
    const spacing=ensure(ppr,'spacing');remove(spacing,['beforeLines','afterLines','beforeAutospacing','afterAutospacing']);
    set(spacing,{before:Math.round(style.space_before*20),after:Math.round(style.space_after*20),line:Math.round(style.line.value*(style.line.mode==='multiple'?240:20)),lineRule:style.line.mode==='multiple'?'auto':style.line.mode});
    const ind=ensure(ppr,'ind');
    if(kind==='reference') {
      // GB/T 7714：左缩进 2 字符 + 悬挂 2 字符（首行顶格）
      const width=Math.round(2*style.size*20);
      remove(ind,['firstLine','hanging','firstLineChars','hangingChars','left','leftChars','start','startChars']);
      set(ind,{left:width,leftChars:200,hanging:width,hangingChars:200});
    } else {
      remove(ind,['firstLine','hanging','firstLineChars','hangingChars']);
      set(ind,{firstLine:Math.round(style.first_line*style.size*20),firstLineChars:Math.round(style.first_line*100)});
    }
    formatRun(ensure(ppr,'rPr'),style);
    for(const run of all(p,'r'))if(ancestor(run,'p')===p)formatRun(ensure(run,'rPr'),style);
  }
  /* 封面保守识别：仅当前 30 段反复出现学校/学院/学号等关键词，且能找到摘要或章节起点时才启用。 */
  function coverBoundary(plain) {
    const head=plain.slice(0,30),hits=head.filter(t=>t&&/大学|学院|学号|指导教师|专业|姓名|答辩|毕业论文|毕业设计/.test(t)).length;
    if(hits<3)return 0;
    const end=plain.findIndex((t,i)=>i<40&&/^(摘\s*要|Abstract|中文摘要|英文摘要|目\s*录|第[一二三四五六七八九十0-9]+章|\d+(?:\.\d+)*\s+\S)/i.test(t));
    // 只有明确找到摘要/目录/章节起点时才启用封面保护，避免误伤正文开头。
    return end>0?end:0;
  }
  const memoryError = error => error && (error instanceof RangeError || /memory|allocation|out of memory|内存/i.test(String(error.message||error)));
  async function format(file,inputRules,onProgress=()=>{}) {
    const rules=window.LunwenRules.validate(inputRules);
    if(!/\.docx$/i.test(file.name))throw new Error('本机处理支持 .docx。请先在 Word / WPS 中将旧版 .doc 另存为 .docx，再上传。');
    if(!file.size||file.size>40*1024*1024)throw new Error('请选择非空且不超过 40 MB 的 .docx 文件。');
    onProgress('正在本机读取文档…',3);
    let bytes;try{bytes=await file.arrayBuffer();}catch(error){
      if(memoryError(error))throw new Error('浏览器内存不足，无法读取该文件。请关闭其他标签页、拆分文档或更换浏览器后重试。');
      throw new Error('读取文件失败，请确认文件未损坏并重新选择。');
    }
    checkZip(bytes);onProgress('正在检查文档结构…',8);
    let zip;try{zip=await JSZip.loadAsync(bytes);}catch(_){throw new Error('文档压缩包损坏，或使用了不支持的加密方式。');}
    const contentTypes=xml(await zip.file('[Content_Types].xml').async('string'));
    if(Array.from(contentTypes.getElementsByTagNameNS('*','Override')).some(n=>/macroEnabled/i.test(n.getAttribute('ContentType')||'')))throw new Error('请先将含宏文件另存为普通 .docx。');
    onProgress('正在解析 Word 正文…',14);
    const doc=xml(await zip.file('word/document.xml').async('string')),root=doc.documentElement;
    if(root.namespaceURI!==W||root.localName!=='document')throw new Error('暂不支持 Strict OOXML，请在 Word 中另存为普通 .docx。');
    const body=direct(root,'body');if(!body)throw new Error('文档缺少正文。');
    const before=fingerprint(root),styles=stylesIndex(zip.file('word/styles.xml')?await zip.file('word/styles.xml').async('string'):null);
    const formatted={},preserved={},count=(obj,key)=>obj[key]=(obj[key]||0)+1,preview=[];
    const paragraphs=all(body,'p');
    const textOf=p=>all(p,'t').filter(t=>ancestor(t,'p')===p).map(t=>t.textContent).join('').trim();
    const plain=paragraphs.map(textOf),coverEnd=coverBoundary(plain);
    let region='body',fieldDepth=0;
    for(let i=0;i<paragraphs.length;i++) {
      if(i%25===0){
        const percent=20+Math.round(i/Math.max(1,paragraphs.length)*62);
        onProgress('正在整理第 '+(i+1)+' / '+paragraphs.length+' 段…',percent);
        await new Promise(r=>setTimeout(r,0)); // 让出主线程，降低浏览器卡顿
      }
      const p=paragraphs[i],text=plain[i];
      const fields=all(p,'fldChar');const isField=fieldDepth>0||fields.length||all(p,'fldSimple').length;
      for(const f of fields)fieldDepth=Math.max(0,fieldDepth+(attr(f,'fldCharType')==='begin'?1:attr(f,'fldCharType')==='end'?-1:0));
      if(!text){count(preserved,'空段或纯图片段落');continue;}
      if(i<coverEnd){count(preserved,'封面或前置信息');continue;}
      if(isField||['drawing','pict','object','ins','del'].some(k=>all(p,k).length)||all(p,'oMath',M).length||all(p,'oMathPara',M).length||ancestor(p,'txbxContent')){count(preserved,'域、修订、公式或图形段落');continue;}
      const info=styleInfo(p,styles);let kind;
      if(ancestor(p,'tc'))kind='table';else [kind,region]=classify(text,info,region);
      if(kind==='protected'){count(preserved,'目录或封面标题');continue;}
      if(kind==='body'&&info.numbered){count(preserved,'自动编号列表');continue;}
      const style=rules.sections[kind];if(!style.enabled){count(preserved,'保留原格式');continue;}
      formatParagraph(p,style,kind.startsWith('heading'),kind);count(formatted,kind);
      if(preview.length<120)preview.push({kind,label:(window.LunwenRules.labels[kind]||kind),text:text.length>300?text.slice(0,300)+'…':text,style:{font:style.font,latin_font:style.latin_font,size:style.size,align:style.align,bold:style.bold,line:{...style.line},first_line:style.first_line,space_before:style.space_before,space_after:style.space_after,enabled:true}});
    }
    for(const sect of all(root,'sectPr')) {
      if(['top','bottom','left','right'].some(k=>rules.page[k+'_cm']!==null)) {
        const margins=ensure(sect,'pgMar');for(const k of ['top','bottom','left','right'])if(rules.page[k+'_cm']!==null)set(margins,{[k]:Math.round(rules.page[k+'_cm']*1440/2.54)});
      }
      if(rules.page.paper==='A4'){const size=ensure(sect,'pgSz'),landscape=attr(size,'orient')==='landscape';set(size,{w:landscape?16838:11906,h:landscape?11906:16838});}
    }
    onProgress('正在校验正文结构…',86);
    const output=new XMLSerializer().serializeToString(doc);
    if(before!==fingerprint(xml(output).documentElement))throw new Error('正文结构校验未通过，已停止输出，请保留原稿。');
    zip.file('word/document.xml',output,{createFolders:false});
    onProgress('正在打包排版文件…',90);
    let blob;
    try {
      blob=await zip.generateAsync({type:'blob',mimeType:MIME,compression:'DEFLATE',compressionOptions:{level:6}},meta=>{
        onProgress('正在打包排版文件…',90+Math.round((meta.percent||0)*0.1));
      });
    } catch(error) {
      if(memoryError(error))throw new Error('浏览器内存不足，打包失败。请关闭其他标签页、压缩论文图片、拆分文档或更换浏览器后重试。');
      throw new Error('生成 Word 文件失败，请重试或更换浏览器。');
    }
    onProgress('处理完成。',100);
    return {blob,name:file.name.replace(/\.docx$/i,'')+'_格式整理.docx',original_name:file.name,created_at:Date.now(),expires_at:Date.now()+86400000,preview,report:{content_unchanged:true,formatted,preserved,rules,notes:['正文内容结构校验通过；除 document.xml 外其他文件部件保留。','封面、目录、页眉页脚等前置部件已尽量保留原样，请在 Word 中更新目录页码。','参考文献按 GB/T 7714 设置 2 字符悬挂缩进；请核对学校是否有额外要求。','请检查封面、未使用标题样式的章节及复杂排版。']}};
  }
  return {format,MIME};
})();
