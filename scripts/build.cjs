'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const core = fs.readFileSync(path.join(root, 'src/core.cjs'), 'utf8')
    .replace(/^'use strict';\s*/, '')
    .replace(/^module\.exports = .*;\s*$/m, '');
const app = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
const header = `// ==UserScript==
// @name         雨课堂：视频连续播放助手
// @namespace    yuketang-autonext
// @version      0.1.1
// @description  正常播放视频，结束后选择下一条视频，跳过作业与考试
// @match        https://seugs.yuketang.cn/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==
`;
const bootstrap = `
const loaderId = 'yuketang-autonext-loading';
function showLoading(message) {
    if (!document.body) return;
    let badge = document.getElementById(loaderId);
    if (!badge) {
        badge = document.createElement('div');
        badge.id = loaderId;
        badge.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483646;background:#fff;color:#17283f;border:1px solid #cbd7e8;border-radius:8px;padding:12px;max-width:320px;font:14px/1.5 system-ui;box-shadow:0 4px 20px #20345630;';
        document.body.appendChild(badge);
    }
    badge.textContent = message;
}
let retryAfter = 0;
function bootWhenReady() {
    if (!document.body || document.getElementById('yuketang-autonext-panel')) return;
    if (!courseIdFromPath(location.pathname)) {
        showLoading('连续播放助手 v0.1.1 已加载。请进入课程视频页。');
        return;
    }
    if (Date.now() < retryAfter) return;
    try {
        initializeController();
        document.getElementById(loaderId)?.remove();
    } catch (error) {
        document.getElementById('yuketang-autonext-panel')?.remove();
        retryAfter = Date.now() + 10000;
        showLoading('连续播放助手 v0.1.1 加载失败：' + String(error.message));
        console.error('[yuketang-autonext] startup', error);
    }
}
setInterval(bootWhenReady, 1000);
bootWhenReady();
`;
fs.writeFileSync(path.join(root, 'yuketang-autonext.user.js'), `${header}\n(() => {\n'use strict';\n${core}\nfunction initializeController() {\n${app}\n}\n${bootstrap}\n})();\n`, 'utf8');
console.log('已生成 yuketang-autonext.user.js');
