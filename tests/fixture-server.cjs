'use strict';
// Local browser verification uses real short media, with synthetic course titles.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const sampleRate = 8000;
const sampleCount = sampleRate;
const wave = Buffer.alloc(44 + sampleCount * 2);
wave.write('RIFF', 0); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8);
wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22);
wave.writeUInt32LE(sampleRate, 24); wave.writeUInt32LE(sampleRate * 2, 28);
wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34);
wave.write('data', 36); wave.writeUInt32LE(sampleCount * 2, 40);
function fixture(script, mode) {
    const types = ['视频', mode === 'unknown' ? '未知任务' : '作业', '视频', '视频', '考试'];
    const titles = ['1.1 示例视频甲', '第一章作业', '2.1 示例视频乙', '2.2 示例视频丙', '期末考试'];
    const rows = titles.map((title, index) => `<div class="nav-item-leaf-box"><div class="leaf-item" data-index="${index}"><div class="leaf-item-left"><div class="leaf-item-tag">${types[index]}</div><div class="leaf-item-title ellipsis">${title}</div></div></div></div>`).join('');
    return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>连续播放 · 本地验证</title>
<style>body{font:16px system-ui;margin:28px;display:flex;gap:40px;background:#eff4fc}.nav-list{width:260px;background:white;padding:20px}.leaf-item{padding:15px;border-bottom:1px solid #ddd;cursor:pointer}.leaf-item.active{background:#def}.leaf-item-tag{font-size:12px;color:#4070ac}main{flex:1}video{width:500px;height:220px;background:#111}#events{white-space:pre-wrap}</style>
<aside class="nav-list"><div class="nav-item is-first"><div class="nav-item-list">${rows}</div></div></aside>
<main><button id="enter" type="button">进入课程</button><button id="enter-graph" type="button">进入新版课程</button><h2 id="heading">${titles[0]}</h2><video class="xt_video_player" controls muted preload="auto" src="/tone/0.wav"></video><pre id="events">本地合成课程；不会连接真实课程平台。</pre></main>
<script>
const rows=[...document.querySelectorAll('.leaf-item')], video=document.querySelector('video');
document.querySelector('#enter').addEventListener('click',()=>history.pushState({},'', '/pro/lms/demo/class/studycontent'));
document.querySelector('#enter-graph').addEventListener('click',()=>history.pushState({},'', '/ai-workspace/lms-graph/class/video/0'));
rows[0].classList.add('active');
function record(message){document.querySelector('#events').textContent+='\\n'+message;}
rows.forEach((row,index)=>row.addEventListener('click',()=>{
record('点击:'+row.querySelector('.leaf-item-tag').textContent+':'+row.querySelector('.leaf-item-title').textContent);
rows.forEach(item=>item.classList.remove('active'));row.classList.add('active');
document.querySelector('#heading').textContent=row.querySelector('.leaf-item-title').textContent;
if(row.querySelector('.leaf-item-tag').textContent==='视频'){video.src='/tone/'+index+'.wav';video.load();video.play().catch(()=>{});}
if(location.pathname.startsWith('/ai-workspace/'))history.pushState({},'', '/ai-workspace/lms-graph/class/video/'+index);
}));
video.addEventListener('ended',()=>record('实际播放结束:'+document.querySelector('#heading').textContent));
</script><script>${script.replaceAll('</script', '<\\/script')}</script></html>`;
}
const server = http.createServer((request, response) => {
    if (request.url.startsWith('/tone/')) {
        response.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': wave.length });
        response.end(wave); return;
    }
    const script = fs.readFileSync(path.join(__dirname, '../yuketang-autonext.user.js'), 'utf8');
    const mode = new URL(request.url, 'http://127.0.0.1').searchParams.get('mode');
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(fixture(script, mode));
});
server.listen(8765, '127.0.0.1', () => console.log('本地验证：http://127.0.0.1:8765/pro/lms/demo/class/studycontent'));
