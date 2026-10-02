const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('../rules.js');
test('separate body, heading and reference rules; Chinese sizes use points',()=>{
  const d=R.parse('正文宋体小四，1.5倍行距，首行缩进两个字；一级标题黑体三号居中；参考文献仿宋五号。');
  assert.equal(d.rules.sections.body.size,12);assert.deepEqual(d.rules.sections.body.line,{mode:'multiple',value:1.5});
  assert.equal(d.rules.sections.heading1.font,'黑体');assert.equal(d.rules.sections.heading1.size,16);
  assert.equal(d.rules.sections.reference.font,'仿宋');assert.equal(d.rules.sections.reference.size,10.5);
});
test('follow-up merges only changed properties and remembers shared scopes',()=>{
  const first=R.parse('一级标题与二级标题楷体四号');
  const second=R.parse('再改成固定值20磅',first.rules,first.context);
  assert.equal(second.rules.sections.heading1.size,14);assert.equal(second.rules.sections.heading2.font,'楷体');
  assert.deepEqual(second.rules.sections.heading2.line,{mode:'exact',value:20});
  assert.equal(second.rules.sections.body.line.mode,'multiple');assert.equal(first.rules.sections.heading1.line.mode,'multiple');
});
test('Chinese and Latin fonts are independent; negative alternatives are excluded',()=>{
  const d=R.parse('正文不用黑体，改成宋体小四，英文数字用Times New Roman，不要加粗，取消首行缩进');
  assert.equal(d.rules.sections.body.font,'宋体');assert.equal(d.rules.sections.body.latin_font,'Times New Roman');
  assert.equal(d.rules.sections.body.bold,false);assert.equal(d.rules.sections.body.first_line,0);
});
test('margins convert mm and respect keep-original instructions',()=>{
  const d=R.parse('A4纸，页边距上下25毫米，左右3厘米');
  assert.deepEqual(d.rules.page,{paper:'A4',top_cm:2.5,bottom_cm:2.5,left_cm:3,right_cm:3});
  assert.equal(R.parse('页边距保持不变',d.rules).rules.page.top_cm,null);
});
test('unsupported requests never apply fonts to the body',()=>{
  const d=R.parse('页眉宋体五号居中，摘要标题黑体小二；正文三线表，段前6磅');
  assert.equal(d.rules.sections.body.size,12);assert.equal(d.rules.sections.body.space_before,6);
  assert(d.warnings.length>=2);assert.equal(d.rules.sections.heading1.size,16);
});
test('mixed units do not confuse font size with line spacing',()=>{
  const d=R.parse('正文小四，最小值20磅行距，段前6磅，段后8磅');
  assert.equal(d.rules.sections.body.size,12);assert.deepEqual(d.rules.sections.body.line,{mode:'atLeast',value:20});
  assert.equal(d.rules.sections.body.space_after,8);
});
test('out-of-range values and malformed saved settings are rejected',()=>{
  assert.throws(()=>R.parse('正文行距999磅'),/行距/);assert.throws(()=>R.parse('页边距0.1厘米'),/页边距/);
  const invalid=R.defaults();invalid.sections.body.font='<script>';assert.throws(()=>R.validate(invalid),/字体/);
  assert.throws(()=>R.validate({}),/配置/);
});
test('preserve a section without resetting other rules',()=>{
  const d=R.parse('表格保留原格式，正文楷体五号，其他保持不变');
  assert.equal(d.rules.sections.table.enabled,false);assert.equal(d.rules.sections.body.enabled,true);
  assert.equal(d.rules.sections.body.font,'楷体');assert.equal(d.rules.sections.heading1.font,'黑体');
});
test('numeric and abbreviated heading names do not leak into the body',()=>{
  const d=R.parse('第1级标题黑体三号；一、二、三级标题不要加粗');
  assert.equal(d.rules.sections.heading1.size,16);assert.equal(d.rules.sections.heading3.bold,false);
  assert.equal(d.rules.sections.body.bold,null);
});
