/* Browser-only, scope-aware format parser. No document or message leaves the device. */
"use strict";
globalThis.LunwenRules = (() => {
  const labels = {body:'正文',heading1:'一级标题',heading2:'二级标题',heading3:'三级标题',abstract:'摘要正文',reference:'参考文献',caption:'图表题注',keyword:'关键词',table:'表格文字'};
  const sizes = {'小初号':36,'初号':42,'小一号':24,'小二号':18,'小三号':15,'小四号':12,'小五号':9,'小六号':6.5,'一号':26,'二号':22,'三号':16,'四号':14,'五号':10.5,'六号':7.5,'七号':5.5,'八号':5,'小初':36,'小一':24,'小二':18,'小三':15,'小四':12,'小五':9,'小六':6.5};
  const sizeKeys = Object.keys(sizes).sort((a,b)=>b.length-a.length);
  const fontPattern = 'Times\\s+New\\s+Roman|Arial|Calibri|Cambria|仿宋_GB2312|楷体_GB2312|方正小标宋(?:简体)?|微软雅黑|思源宋体|思源黑体|华文中宋|宋体|黑体|仿宋|楷体|等线';
  const numberPattern = '(?:\\d+(?:\\.\\d+)?|[零一二两三四五六七八九十半])';
  const targets = {'一级标题':['heading1'],'章标题':['heading1'],'大标题':['heading1'],'主标题':['heading1'],'二级标题':['heading2'],'三级标题':['heading3'],'各级标题':['heading1','heading2','heading3'],'标题':['heading1','heading2','heading3'],'摘要正文':['abstract'],'中文摘要':['abstract'],'英文摘要':['abstract'],'摘要':['abstract'],'参考文献格式':['reference'],'参考文献':['reference'],'文献':['reference'],'GB/T 7714':['reference'],'GB/T7714':['reference'],'GB7714':['reference'],'图表题注':['caption'],'图题':['caption'],'表题':['caption'],'图注':['caption'],'表注':['caption'],'题注':['caption'],'关键词':['keyword'],'关键字':['keyword'],'表格文字':['table'],'表格':['table'],'正文部分':['body'],'论文正文':['body'],'正文':['body'],'全文':Object.keys(labels),'所有文字':Object.keys(labels),'页面':['page'],'页边距':['page']};
  for (const term of ['摘要标题','参考文献标题','论文题目','小标题','页眉','页脚','页码','目录','封面','公式']) targets[term] = ['unsupported'];
  const targetKeys = Object.keys(targets).sort((a,b)=>b.length-a.length);
  const copy = value => JSON.parse(JSON.stringify(value));
  function defaults() {
    const base = {font:'宋体',latin_font:'Times New Roman',size:12,align:'both',bold:null,line:{mode:'multiple',value:1.5},first_line:2,space_before:0,space_after:0,enabled:true};
    const sections = Object.fromEntries(Object.keys(labels).map(k => [k,copy(base)]));
    for (let n=1;n<=3;n++) Object.assign(sections['heading'+n],{font:'黑体',size:[16,14,12][n-1],bold:true,align:n===1?'center':'left',first_line:0,space_before:n===1?12:6,space_after:6});
    for (const k of ['reference','caption','table']) Object.assign(sections[k],{size:10.5,first_line:0,line:{mode:'multiple',value:1}});
    sections.reference.align='left'; sections.caption.align='center';
    Object.assign(sections.table,{enabled:false,align:'left'}); Object.assign(sections.keyword,{first_line:0,align:'left'});
    return {sections,page:{paper:'keep',top_cm:2.54,bottom_cm:2.54,left_cm:3.17,right_cm:3.17}};
  }
  function validate(value) {
    const template = defaults();
    const sameKeys = (a,b) => a && typeof a==='object' && !Array.isArray(a) && Object.keys(a).sort().join('|')===Object.keys(b).sort().join('|');
    const bound = (n,lo,hi,label) => {if (typeof n!=='number' || !Number.isFinite(n) || n<lo || n>hi) throw new Error(label+'应在 '+lo+'–'+hi+' 之间。');};
    if (!sameKeys(value,template) || !sameKeys(value.sections,labels) || !sameKeys(value.page,template.page)) throw new Error('格式配置无效，请恢复默认格式后重试。');
    for (const style of Object.values(value.sections)) {
      if (!sameKeys(style,template.sections.body)) throw new Error('段落配置无效。');
      for (const k of ['font','latin_font']) if (typeof style[k]!=='string' || !style[k].length || style[k].length>64 || /[<>\x00-\x1f]/.test(style[k])) throw new Error('字体名称无效。');
      for (const [k,lo,hi,label] of [['size',5,72,'字号'],['first_line',0,10,'首行缩进'],['space_before',0,100,'段前间距'],['space_after',0,100,'段后间距']]) bound(style[k],lo,hi,label);
      if (!['left','center','right','both'].includes(style.align) || ![true,false,null].includes(style.bold) || typeof style.enabled!=='boolean') throw new Error('段落格式无效。');
      if (!sameKeys(style.line,{mode:1,value:1}) || !['multiple','exact','atLeast'].includes(style.line.mode)) throw new Error('行距配置无效。');
      bound(style.line.value,style.line.mode==='multiple'?0.5:5,style.line.mode==='multiple'?5:100,'行距');
    }
    if (!['keep','A4'].includes(value.page.paper)) throw new Error('纸张配置无效。');
    for (const k of ['top_cm','bottom_cm','left_cm','right_cm']) if (value.page[k]!==null) bound(value.page[k],0.5,6,'页边距');
    return copy(value);
  }
  const number = value => Number(({零:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10,半:0.5})[value] ?? value);

  /* 判断字体名前的限定词：最近出现的是“英文/西文”还是“中文/汉字”。
   * 排除“英文摘要 / 中文标题”这类段落名，避免把摘要的中文字体误判为西文字体。 */
  function fontRole(text, start, end) {
    const pattern = /英文|西文|拉丁|英语|字母|数字|中文|汉字/g;
    const isQualified = (match, offset) => {
      const after = text.slice(offset + match[0].length, offset + match[0].length + 3);
      return !/摘要|标题|题目|关键词|目录|封面|正文/.test(after);
    };
    const before = text.slice(Math.max(0, start - 14), start), after = text.slice(end, end + 10);
    let last = null;
    for (const m of before.matchAll(pattern)) if (isQualified(m, Math.max(0, start - 14) + m.index)) last = m[0];
    for (const m of after.matchAll(pattern)) {
      if (isQualified(m, end + m.index) && (m.index <= 4)) {last = m[0]; break;}
    }
    if (!last) return /^(Times|Arial|Calibri|Cambria)/i.test(text.slice(start, end)) ? 'latin' : 'cjk';
    return /英文|西文|拉丁|英语|字母|数字/.test(last) ? 'latin' : 'cjk';
  }

  function properties(text, baseSize = 12, baseLine = null) {
    const patch = {}; let m;
    if (/保持(?:原样|不变)|保留原(?:有)?格式|不(?:要)?(?:修改|改动|更改)/.test(text)) return {enabled:false};
    // 排除被否定的字体/字号，避免“不要黑体”被当作设置了黑体。
    text = text.replace(new RegExp('(?:不要|不用|别用|取消)(?:使用|用)?\\s*(?:'+fontPattern+')','gi'),'')
      .replace(/(?:不要|不用|取消)(?:左对齐|右对齐|居中|两端对齐)/g,'');
    text = text.replace(new RegExp('(?:不要|不用|别用)\\s*(?:'+sizeKeys.join('|')+')','g'),'');
    for (const font of text.matchAll(new RegExp(fontPattern,'gi'))) {
      const value = /^Times/i.test(font[0])?'Times New Roman':font[0];
      const role = fontRole(text, font.index, font.index + font[0].length);
      patch[role==='latin'?'latin_font':'font']=value;
    }
    // 中文字号：小四 / 小四号 / 12 号（“12 号”按 12 磅理解）
    const found = [...text.matchAll(new RegExp(sizeKeys.join('|'),'g'))];
    if (found.length) patch.size=sizes[found.at(-1)[0]];
    if ((m=text.match(/(?:字号|字大小|字体大小)(?:为|用|设为|改成|改为|是|[:：\s])*(\d+(?:\.\d+)?)\s*(?:pt|磅)?/i))) patch.size=Number(m[1]);
    else if ((m=text.match(/(?<![\d第月])(\d+(?:\.\d+)?)\s*号(?!楼|院|线|文件|通知)/))) patch.size=Number(m[1]);
    else if (!/行距|行间距|固定|段前|段后|边距|缩进/.test(text) && (m=text.match(/(\d+(?:\.\d+)?)\s*(?:pt|磅)/i))) patch.size=Number(m[1]);
    if (/不(?:要)?加粗|取消加粗|不加黑/.test(text)) patch.bold=false;
    else if (/加粗|加黑/.test(text)) patch.bold=true;
    const align=[...text.matchAll(/两端对齐|两边对齐|居中|中间对齐|左对齐|靠左|左边对齐|右对齐|靠右/g)].at(-1);
    if (align) patch.align=/两端|两边/.test(align[0])?'both':/居中|中间/.test(align[0])?'center':/左/.test(align[0])?'left':'right';
    // 悬挂缩进由参考文献规则单独处理，不当作首行缩进
    const indentText = text.replace(/悬挂缩进[^,;。]{0,8}/g,'');
    if (/不(?:要)?(?:首行)?缩进|取消(?:首行)?缩进|顶格/.test(indentText)) patch.first_line=0;
    else if ((m=indentText.match(new RegExp('(?:首行(?:缩进|空)?|缩进)[^\\d零一二两三四五六七八九十]{0,8}('+numberPattern+')\\s*(?:个)?(?:汉字|字|字符|格)')))) patch.first_line=number(m[1]);
    // 行距：支持“行距 22 磅”“固定值 22 磅”“22 磅固定行距”“最小行距 20 磅”等语序
    if ((m=text.match(/(?:行距|行间距)[^\d,;。]{0,10}(\d+(?:\.\d+)?)\s*(?:磅|pt)/i))
      || (m=text.match(/(\d+(?:\.\d+)?)\s*(?:磅|pt)\s*(?:的)?(?:固定|最小)?(?:值)?\s*(?:行距|行间距)/i))
      || (!/段前|段后/.test(text) && (m=text.match(/(?:固定(?:值)?|最小(?:值)?)(?:为|是|设为)?\s*(\d+(?:\.\d+)?)\s*(?:磅|pt)/i)))) {
      patch.line={mode:/最小/.test(text)?'atLeast':'exact',value:Number(m[1])};
    } else if (/单倍/.test(text)) patch.line={mode:'multiple',value:1};
    else if (/一倍半|1\.5\s*倍/.test(text)) patch.line={mode:'multiple',value:1.5};
    else if ((m=text.match(new RegExp('('+numberPattern+')\\s*倍(?:行距|行间距)?')))) patch.line={mode:'multiple',value:number(m[1])};
    // 段前 / 段后：同时支持“磅”和“行”，按当前字号与行距换算成磅
    const currentLine = patch.line || baseLine;
    const lineHeight = currentLine ? (currentLine.mode==='multiple' ? baseSize*currentLine.value : currentLine.value) : baseSize*1.5;
    const toPt = (value, unit) => /行/.test(unit) ? Math.round((Number(value)||number(value))*lineHeight*10)/10 : Number(value);
    const unitPattern='(\\d+(?:\\.\\d+)?|[一二两三四五六七八九十半])\\s*(行|磅|pt)';
    const both=text.match(new RegExp('段前(?:和|与|、|及)?\\s*段后(?:各|均|都|为|是|设为)?\\s*'+unitPattern,'i'));
    if (both) {patch.space_before=toPt(both[1],both[2]);patch.space_after=toPt(both[1],both[2]);}
    else for (const [key,term] of [['space_before','段前'],['space_after','段后']]) {
      if ((m=text.match(new RegExp(term+'[^\\d,;。]{0,6}'+unitPattern,'i')))) patch[key]=toPt(m[1],m[2]);
    }
    if (Object.keys(patch).length) patch.enabled=true;
    return patch;
  }
  function pageProperties(text) {
    const patch={}; let m;
    if (/A4/i.test(text)) patch.paper='A4';
    if (/(?:页边距|页面).*保持(?:原样|不变)/.test(text)) return {paper:'keep',top_cm:null,bottom_cm:null,left_cm:null,right_cm:null};
    const unit='(\\d+(?:\\.\\d+)?)\\s*(厘米|公分|cm|毫米|mm|英寸|inch)';
    const cm = m => Number(m[1])*(/^(毫米|mm)$/i.test(m[2])?0.1:/^(英寸|inch)$/i.test(m[2])?2.54:1);
    if ((m=text.match(new RegExp('(?:页边距|四周|四边|边距)(?:全部|统一|都|均|为|是|设为|改为|改成|[:\\s])*'+unit,'i')))) for (const k of ['top_cm','bottom_cm','left_cm','right_cm']) patch[k]=cm(m);
    for (const [word,keys] of [['上下',['top_cm','bottom_cm']],['左右',['left_cm','right_cm']],['上',['top_cm']],['下',['bottom_cm']],['左',['left_cm']],['右',['right_cm']]]) {
      if ((m=text.match(new RegExp(word+'(?:侧|边距|边)?(?:各|分别|都是|均为|为|是|改为|改成|设为|[:\\s])*'+unit,'i')))) for (const k of keys) patch[k]=cm(m);
    }
    return patch;
  }
  function describe(s, scope) {
    if (!s.enabled) return '保留原格式';
    const line=s.line.mode==='multiple'?s.line.value+' 倍行距':(s.line.mode==='exact'?'固定':'最小')+' '+s.line.value+' 磅';
    const hanging = scope==='reference' ? '，悬挂缩进 2 字符（GB/T 7714）' : '';
    return s.font+' / 西文 '+s.latin_font+'，'+s.size+' 磅，'+line+'，'+({left:'左对齐',center:'居中',right:'右对齐',both:'两端对齐'})[s.align]+'，首行 '+s.first_line+' 字'+hanging+'，段前 '+s.space_before+' / 段后 '+s.space_after+' 磅'+(s.bold===null?'':s.bold?'，加粗':'，不加粗');
  }
  function summary(rules) {
    const rows=Object.entries(labels).map(([scope,label])=>({scope,label,value:describe(rules.sections[scope],scope)}));
    rows.push({scope:'page',label:'页面',value:(rules.page.paper==='keep'?'保留纸张尺寸':'A4')+'；'+[['top_cm','上'],['bottom_cm','下'],['left_cm','左'],['right_cm','右']].map(([k,l])=>l+(rules.page[k]===null?'保留':' '+rules.page[k]+' cm')).join(' / ')});
    return rows;
  }
  function parse(message,rules=defaults(),context=['body']) {
    if (typeof message!=='string' || !message.trim() || message.length>6000) throw new Error('请填写 1–6000 字的格式要求。');
    let result=validate(rules),scopes=Array.isArray(context)&&context.length&&context.every(k=>labels[k])?context.slice():['body'];
    const text=message.normalize('NFKC')
      .replace(/第?([123一二三])级标题/g,(_,n)=>({'1':'一','2':'二','3':'三'}[n]||n)+'级标题')
      .replace(/一、二、三级标题|一二三级标题/g,'各级标题')
      .replace(/([一二三])级(?=[和与及、][一二三]级标题)/g,'$1级标题')
      .replace(/([一二三])(?=[、和与及][一二三]级标题)/g,'$1级标题'),warnings=[],touched=new Set(),notes=[];
    const pagePatch=pageProperties(text);
    if (Object.keys(pagePatch).length) {Object.assign(result.page,pagePatch);touched.add('page');}
    if (!/它|这个|刚才|上面|再|改成|改为/.test(text)) scopes=['body'];
    let pending=[],pendingClause=-1;
    const targetRe=new RegExp(targetKeys.join('|'),'g');
    const propertiesFor=(value,size)=>properties(value,size||12,(result.sections[scopes[0]]||result.sections.body).line);
    [...text.split(/[,;。\n]+/).entries()].forEach(([clauseIndex,rawClause])=>{
      const clause=rawClause.trim();
      if (!clause || /^\s*(?:其他|其它|其余).*(?:不变|原样|不动)\s*$/.test(clause)) return;
      const baseSize=()=>(result.sections[scopes[0]]||result.sections.body).size;
      const gb=/GB\s*\/?\s*T\s*7714|GB\s*7714|国标\s*7714/i.test(clause);
      if (gb) {
        scopes=['reference'];touched.add('reference');result.sections.reference.enabled=true;
        notes.push('参考文献已按 GB/T 7714 使用 2 字符悬挂缩进。');
        const hang=clause.match(/悬挂缩进\s*([0-9零一二两三四五六七八九十]+)\s*(?:个)?(?:字符|字|格)?/);
        if (hang && number(hang[1])!==2) warnings.push('本工具按 GB/T 7714 固定使用 2 字符悬挂缩进，已忽略“'+hang[1]+' 字符”的写法。');
      }
      const matches=[...clause.matchAll(targetRe)];
      // 上一个分句遗留的并列目标，遇到本分句的新目标时不再沿用
      if (matches.length && pending.length && pendingClause!==clauseIndex) {
        const first=targets[matches[0][0]];
        if (!first.some(k=>pending.includes(k))) pending=[];
      }
      const segments=[];
      if (!matches.length) segments.push([null,clause]);
      else {
        const first=matches[0],before=clause.slice(0,first.index),afterFirst=clause.slice(first.index+first[0].length,matches[1]?.index??clause.length);
        const beforeProps=before && Object.keys(propertiesFor(before,baseSize())).length;
        const afterProps=Object.keys(propertiesFor(afterFirst,baseSize())).length;
        if (beforeProps && !afterProps) {
          // 语序颠倒：如“楷体四号一级标题”“用黑体三号排正文”
          segments.push([targets[first[0]],before+' '+afterFirst]);
          for (let i=1;i<matches.length;i++) segments.push([targets[matches[i][0]],clause.slice(matches[i].index+matches[i][0].length,matches[i+1]?.index??clause.length)]);
        } else {
          if (before && Object.keys(propertiesFor(before,baseSize())).length) segments.push([null,before]);
          matches.forEach((match,i)=>segments.push([targets[match[0]],clause.slice(match.index+match[0].length,matches[i+1]?.index??clause.length)]));
        }
      }
      let clauseProps=null;
      for (const [target,content] of segments) {
        if (target) scopes=target.slice();
        if (scopes[0]==='unsupported') {pending=[];warnings.push('暂未自动处理「'+clause+'」。页眉、页码、目录、封面及公式布局请在 Word 中核对。');continue;}
        if (scopes[0]==='page') {pending=[];if (!Object.keys(pagePatch).length) warnings.push('没有识别页面数值，可写“页边距上下 2.5 cm、左右 3 cm”。');continue;}
        const hanging=/悬挂缩进/.test(content);
        const props=propertiesFor(content,baseSize());
        if (!Object.keys(props).length) {
          if (hanging) {
            if (scopes[0]==='reference') {touched.add('reference');result.sections.reference.enabled=true;notes.push('参考文献已设置 2 字符悬挂缩进。');}
            else warnings.push('悬挂缩进目前仅用于参考文献，请说明“参考文献悬挂缩进 2 字符”。');
            continue;
          }
          if (target && /^\s*(?:和|与|及|、|都)?\s*$/.test(content)) {pending.push(...scopes);pendingClause=clauseIndex;}
          else if (!gb && !Object.keys(pageProperties(clause)).length && !/^\s*(?:其他|其它)?(?:保持不变|不变|谢谢|就这样|请|麻烦)?\s*$/.test(content)) warnings.push('尚未明确「'+clause+'」，请补充字体、字号、行距等具体要求。');
          continue;
        }
        const active=[...new Set([...pending,...scopes])];pending=[];
        for (const scope of active) {Object.assign(result.sections[scope],copy(props));touched.add(scope);}
        scopes=active;clauseProps=props;
        if (/三线表|斜体|颜色|红色|蓝色|下划线|分栏|横向|分页|大一点|小一点/i.test(content)) warnings.push('「'+clause+'」中仅应用已列出的格式；三线表、颜色、分页等要求尚需人工处理。');
      }
      // “楷体四号一级标题与二级标题”：把语序颠倒的属性同样应用到并列的尾随目标
      if (pending.length && pendingClause===clauseIndex && clauseProps) {
        for (const scope of new Set(pending)) {Object.assign(result.sections[scope],copy(clauseProps));touched.add(scope);}
        pending=[];
      }
    });
    result=validate(result);
    const rows=summary(result),changes=rows.filter(row=>touched.has(row.scope));
    const noteText=[...new Set(notes)].join(' ');
    return {rules:result,summary:rows,context:scopes.every(k=>labels[k])?scopes:['body'],changes,warnings:[...new Set(warnings)],engine:'local',reply:(changes.length?'已更新以下格式。可以继续补充，没提到的设置沿用当前值。':'这句话暂时没有生成明确的格式修改。')+(noteText?' '+noteText:(changes.length?'':' 可以说“正文宋体小四，1.5 倍行距”。'))};
  }
  return {defaults,validate,parse,summary,labels};
})();
if (typeof module!=='undefined') module.exports=globalThis.LunwenRules;
