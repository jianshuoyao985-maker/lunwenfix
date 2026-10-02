/* Run from repo root: npm install --no-save playwright; npx playwright install chromium;
 * node tests/static-browser.cjs. Optional PLAYWRIGHT_MODULE / CHROMIUM_EXECUTABLE / PYTHON.
 * Uses synthetic documents, never user files. No backend is required. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawn,execFileSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results');fs.mkdirSync(out,{recursive:true});
const python=process.env.PYTHON||'python3',port=process.env.TEST_PORT||'8095',origin='http://127.0.0.1:'+port;
execFileSync(python,['-c',"import sys;from pathlib import Path;sys.path.insert(0,'tests');from fixtures import package;Path('test-results/static-sample.docx').write_bytes(package())"],{cwd:root});
const server=spawn(python,['-m','http.server',port,'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
let browser;const errors=[];
async function ready(){for(let i=0;i<100;i++){try{if((await fetch(origin)).ok)return;}catch(_){}await new Promise(r=>setTimeout(r,100));}throw new Error('Static server did not start');}
async function send(page,text){await page.locator('#message').fill(text);await page.locator('#send').click();await page.waitForFunction(()=>!document.querySelector('#send').disabled&&!document.querySelector('#message').value);}
async function home(page){page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.waitForFunction(()=>document.querySelector('#connection').hidden);}
async function generate(page){await page.locator('#file').setInputFiles(path.join(out,'static-sample.docx'));await page.locator('#run').click();await page.locator('#resultTitle').waitFor({timeout:30000});}
async function noOverflow(page){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow');}
(async()=>{
  try{
    await ready();const options={headless:true};if(process.env.CHROMIUM_EXECUTABLE)Object.assign(options,{executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox','--disable-gpu','--no-zygote','--disable-dev-shm-usage']});
    browser=await chromium.launch(options);const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});
    const page=await context.newPage(),requests=[];page.on('request',r=>requests.push(r.url()));await home(page);
    assert(await page.locator('#run').isDisabled());assert(await page.locator('#pdfOption').isHidden());
    await send(page,'正文宋体小四，1.5倍行距；一级标题黑体小二居中；参考文献仿宋五号。');
    await send(page,'再把正文行距改成固定值20磅');assert.match(await page.locator('#ruleSummary').innerText(),/固定 20 磅/);
    await page.locator('#undo').click();assert.doesNotMatch(await page.locator('#ruleSummary').innerText(),/固定 20 磅/);
    await send(page,'页眉写学校名称');assert.match(await page.locator('#messages').innerText(),/暂未自动处理/);
    await page.locator('#file').setInputFiles(path.join(out,'static-sample.docx'));
    await page.locator('#message').fill('正文楷体五号，不要加粗，其他保持不变');await page.locator('#run').click();
    await page.locator('#resultTitle').waitFor({timeout:30000});assert.match(await page.locator('#ruleSummary').innerText(),/楷体/);
    const wait=page.waitForEvent('download');await page.getByRole('link',{name:'下载 Word 文档 ↓'}).click();const dl=await wait;
    assert.match(dl.suggestedFilename(),/格式整理\.docx$/);await dl.saveAs(path.join(out,'static-output.docx'));
    assert(!requests.some(u=>u.includes('/api/')||!u.startsWith(origin)),'Static processing must not send document or chat to a server');
    const transfer=await page.getByRole('textbox',{name:'网址与格式'}).inputValue();assert(transfer.includes('#format='));
    await noOverflow(page);await page.screenshot({path:path.join(out,'static-desktop.png'),fullPage:true});
    await page.reload();await page.locator('#resultTitle').waitFor();assert.match(await page.locator('#status').innerText(),/恢复/);
    await page.locator('#file').setInputFiles({name:'bad.docx',mimeType:'application/octet-stream',buffer:Buffer.from('not a zip')});
    await page.locator('#run').click();await page.waitForFunction(()=>document.querySelector('#status').classList.contains('error'));
    assert.match(await page.locator('#status').innerText(),/有效/);assert(await page.locator('#run').isEnabled());
    await page.locator('#file').setInputFiles({name:'old.doc',mimeType:'application/msword',buffer:Buffer.from('legacy')});assert(await page.locator('#run').isDisabled());
    const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,locale:'zh-CN',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0'});
    const phone=await mobile.newPage();await home(phone);await noOverflow(phone);assert(await phone.locator('#wechatStart').isVisible());
    await phone.goto(transfer);await phone.waitForFunction(()=>document.querySelector('#connection').hidden);
    assert.match(await phone.locator('#ruleSummary').innerText(),/楷体/);assert(await phone.locator('#result').isHidden());assert.equal(new URL(phone.url()).hash,'');
    await generate(phone);assert.match(await phone.locator('#result .wechat-help').innerText(),/文件不会自动转移/);
    await phone.getByRole('button',{name:'复制网址与格式'}).click();await phone.waitForFunction(()=>document.querySelector('.download-feedback').textContent.length>0);assert.match(await phone.locator('.download-feedback').innerText(),/复制/);
    await noOverflow(phone);await phone.screenshot({path:path.join(out,'static-mobile.png'),fullPage:true});
    await phone.setViewportSize({width:320,height:760});await noOverflow(phone);
    await phone.addInitScript(()=>{
      Object.defineProperty(navigator,'canShare',{value:()=>true,configurable:true});
      Object.defineProperty(navigator,'share',{value:async data=>{window.shared={count:data.files.length,name:data.files[0].name,active:navigator.userActivation.isActive};},configurable:true});
    });
    await phone.reload();await phone.getByRole('button',{name:'保存 / 分享 Word'}).click();
    const shared=await phone.evaluate(()=>window.shared);assert.equal(shared.count,1);assert.equal(shared.active,true);assert.match(shared.name,/\.docx$/);
    await phone.getByRole('button',{name:'清除本机结果'}).click();await phone.getByText('本机结果已清除。已下载的文件不受影响。',{exact:true}).waitFor();
    await phone.reload();await phone.waitForFunction(()=>document.querySelector('#connection').hidden);assert(await phone.locator('#result').isHidden());
    const denied=await browser.newContext();await denied.addInitScript(()=>Object.defineProperty(window,'indexedDB',{get(){throw new Error('blocked');}}));
    const deniedPage=await denied.newPage();await home(deniedPage);await generate(deniedPage);assert.match(await deniedPage.locator('#result').innerText(),/未能保存结果缓存/);
    const fallback=await context.newPage();await fallback.route('**/config.js',r=>r.fulfill({contentType:'application/javascript',body:'window.LUNWENFIX_API_BASE="https://unavailable.invalid";'}));
    await fallback.route('https://unavailable.invalid/**',r=>r.abort());await fallback.goto(origin);await fallback.locator('#localFallback').click();await fallback.waitForFunction(()=>document.querySelector('#connection').hidden);assert(await fallback.locator('#send').isEnabled());
    assert.deepEqual(errors,[]);
    execFileSync(python,['tests/verify_static.py'],{cwd:root,stdio:'inherit'});
    console.log('PASS: static chat, undo, unsupported input, unsent rules, actual DOCX download, cache/reload, invalid file, old DOC guard, 390/320px, WeChat guidance, format transfer, native share gesture, clear, blocked storage, backend fallback.');
  }finally{if(browser)await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
