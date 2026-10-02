/* Optional E2E: npm install --no-save playwright; npx playwright install chromium;
 * python -m pip install -r backend/requirements.txt; node tests/browser.cjs
 * Set PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE for a custom browser runtime.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawn, execFileSync} = require('node:child_process');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'test-results'); fs.mkdirSync(output, {recursive:true});
const python = process.env.PYTHON || 'python';
execFileSync(python, ['-c', "import sys;from pathlib import Path;sys.path.insert(0,'tests');from fixtures import package;Path('test-results/sample.docx').write_bytes(package())"], {cwd:root});
const port = process.env.TEST_PORT || '8092';
const origin = 'http://127.0.0.1:' + port;
const server = spawn(python, ['app.py'], {cwd:path.join(root,'backend'), env:{...process.env,PORT:port,DATA_DIR:path.join(output,'jobs'),PUBLIC_BASE_URL:'',ALLOWED_ORIGINS:'http://127.0.0.1:8093'},stdio:['ignore','pipe','pipe']});
let browser;
async function start() {
  for (let i=0;i<100;i++) {try {if((await fetch(origin+'/health')).ok)return;}catch(_){} await new Promise(resolve=>setTimeout(resolve,100));}
  throw new Error('Test server did not start');
}
async function send(page,text) {
  await page.locator('#message').fill(text);await page.locator('#send').click();
  await page.waitForFunction(()=>!document.querySelector('#send').disabled && !document.querySelector('#message').value);
}
async function noOverflow(page) {
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow');
}
(async()=>{
  try {
    await start();
    const options={headless:true};
    if(process.env.CHROMIUM_EXECUTABLE)Object.assign(options,{executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox','--disable-gpu','--no-zygote','--disable-dev-shm-usage']});
    browser=await chromium.launch(options);
    const context=await browser.newContext({viewport:{width:1440,height:1080},locale:'zh-CN'});
    const errors=[];const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin);await page.waitForFunction(()=>document.querySelector('#connection').hidden);
    assert(await page.locator('#run').isDisabled());
    await send(page,'正文宋体小四，1.5倍行距；一级标题黑体小二居中；参考文献仿宋五号。');
    assert.match(await page.locator('#ruleSummary').innerText(),/18 磅/);
    await send(page,'再把正文行距改成固定值20磅');
    assert.match(await page.locator('#ruleSummary').innerText(),/固定 20 磅/);
    await page.locator('#undo').click();
    assert.doesNotMatch(await page.locator('#ruleSummary').innerText(),/固定 20 磅/);
    await send(page,'页眉写学校名称');
    assert.match(await page.locator('#messages').innerText(),/暂未自动处理/);
    await page.locator('#file').setInputFiles(path.join(output,'sample.docx'));
    await page.locator('#makePdf').uncheck();
    await page.locator('#message').fill('正文楷体五号，其他保持不变');
    await page.locator('#run').click();
    await page.locator('#resultTitle').waitFor({timeout:30000});
    assert.match(await page.locator('#ruleSummary').innerText(),/楷体/);
    const downloadWait=page.waitForEvent('download');
    await page.getByRole('link',{name:'下载 Word 文档 ↓'}).click();
    const download=await downloadWait;assert.match(download.suggestedFilename(),/格式整理\.docx$/);
    await download.saveAs(path.join(output,'browser-output.docx'));
    const share=await page.locator('#result input[aria-label="取件链接"]').inputValue();
    await noOverflow(page);await page.screenshot({path:path.join(output,'desktop.png'),fullPage:true});
    await page.reload();await page.locator('#resultTitle').waitFor();
    assert.match(await page.locator('#ruleSummary').innerText(),/楷体/);
    const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,locale:'zh-CN',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0'});
    const phone=await mobile.newPage();phone.on('pageerror',e=>errors.push(e.message));
    await phone.goto(origin);await phone.waitForFunction(()=>document.querySelector('#connection').hidden);await noOverflow(phone);
    await phone.screenshot({path:path.join(output,'mobile-home.png'),fullPage:true});
    await send(phone,'正文不要加粗，首行缩进两个字');
    assert.match(await phone.locator('#ruleSummary').innerText(),/不加粗/);
    await phone.goto(share);await phone.locator('#resultTitle').waitFor();
    assert.match(await phone.locator('.wechat-help').innerText(),/当前在微信中打开/);await noOverflow(phone);
    await phone.getByRole('button',{name:'复制取件链接'}).click();
    await phone.waitForFunction(()=>document.querySelector('.download-feedback').textContent.length>0);
    assert.match(await phone.locator('.download-feedback').innerText(),/已复制|请长按/);
    await phone.screenshot({path:path.join(output,'mobile-pickup.png'),fullPage:true});
    // Simulate an OS exposing file sharing: preparation and share must be separate gestures.
    await phone.addInitScript(()=>{Object.defineProperty(navigator,'canShare',{value:()=>true,configurable:true});Object.defineProperty(navigator,'share',{value:async data=>{window.sharedCount=data.files.length;},configurable:true});});
    await phone.reload();await phone.locator('#resultTitle').waitFor();
    await phone.getByRole('button',{name:'准备手机保存 / 分享'}).click();
    await phone.getByRole('button',{name:'点击保存 / 分享 Word'}).waitFor();
    await phone.getByRole('button',{name:'点击保存 / 分享 Word'}).click();
    assert.equal(await phone.evaluate(()=>window.sharedCount),1);
    assert.deepEqual(errors,[]);
    execFileSync(python,['-c',"import sys,zipfile;sys.path.insert(0,'backend');from formatter import xml,content_fingerprint; a=zipfile.ZipFile('test-results/sample.docx');b=zipfile.ZipFile('test-results/browser-output.docx');assert content_fingerprint(xml(a.read('word/document.xml')))==content_fingerprint(xml(b.read('word/document.xml')));print('Downloaded DOCX content verified')"],{cwd:root,stdio:'inherit'});
    console.log('PASS: chat, scope, follow-up, undo, warnings, unsent input, upload, actual download, reload, 390px layout, WeChat help, clipboard and two-step native share.');
  } finally {if(browser)await browser.close();server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
