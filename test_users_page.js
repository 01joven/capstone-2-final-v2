const { spawn, spawnSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = 'C:\\Users\\Acer\\Desktop\\capstone\\capstone-2-final';
const distDir = root + '\\frontend\\dist';
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mime = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.ico':'image/x-icon' };
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api')) {
    const p = http.request({ hostname:'localhost', port:5000, path:req.url, method:req.method, headers:req.headers }, (pr) => { res.writeHead(pr.statusCode, pr.headers); pr.pipe(res); });
    p.on('error', () => { res.writeHead(502); res.end('proxy error'); });
    req.pipe(p); return;
  }
  let f = decodeURIComponent(req.url.split('?')[0]);
  let fp = path.join(distDir, f);
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) fp = path.join(distDir, 'index.html');
  res.writeHead(200, { 'Content-Type': mime[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});
(async () => {
  const errors = []; let ch;
  try {
    await new Promise((r) => server.listen(4100, r));
    const post = async (u, b) => { const r = await fetch('http://localhost:5000' + u, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(b) }); return r.json(); };
    const a = await post('/api/auth/admin/login', { email:'admin@example.com', password:'StrongPassword123' });
    const profile = path.join(process.env.TEMP, 'mm-chrome-staff-' + Date.now());
    ch = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9344','--user-data-dir=' + profile,'about:blank'], { stdio:'ignore' });
    let targets = null;
    for (let i = 0; i < 25; i++) { try { const r = await fetch('http://127.0.0.1:9344/json'); targets = await r.json(); if (targets && targets.length) break; } catch {} await sleep(1000); }
    const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
    let id = 0; const pend = new Map();
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
      else if (m.method === 'Runtime.exceptionThrown') { errors.push('PAGE_EXC ' + String(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text).split('\n')[0]); }
    };
    await new Promise((r) => { ws.onopen = r; });
    const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id:i, method, params })); });
    await send('Page.enable'); await send('Runtime.enable');
    const evalExpr = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); if (r.result && r.result.exceptionDetails) return 'EXC ' + JSON.stringify(r.result.exceptionDetails).slice(0, 200); return r.result && r.result.result ? r.result.result.value : JSON.stringify(r); };
    await send('Page.navigate', { url: 'http://localhost:4100/' }); await sleep(4000);
    await evalExpr('localStorage.setItem("token", ' + JSON.stringify(a.token) + '); localStorage.setItem("user", ' + JSON.stringify(JSON.stringify(a.user)) + '); "set"');
    await send('Page.navigate', { url: 'http://localhost:4100/admin/users' }); await sleep(4000);
    const result = await evalExpr('JSON.stringify({path:location.pathname, title:(document.querySelector(".page-title")||{innerText:"NA"}).innerText, hasAddBtn:!!document.querySelector(".admin-heading-row button.btn-primary"), btnText:(document.querySelector(".admin-heading-row button.btn-primary")||{innerText:"NA"}).innerText})');
    console.log('USERS_PAGE ' + result);
    console.log('ERRORS ' + JSON.stringify(errors));
    ws.close();
  } catch (e) { console.log('FATAL ' + e.message); }
  finally { server.close(); if (ch) spawnSync('taskkill', ['/pid', String(ch.pid), '/T', '/F']); }
})();