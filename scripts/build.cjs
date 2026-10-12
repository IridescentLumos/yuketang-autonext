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
// @version      0.1.0
// @description  正常播放视频，结束后选择下一条视频，跳过作业与考试
// @match        https://seugs.yuketang.cn/pro/lms/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==
`;
fs.writeFileSync(path.join(root, 'yuketang-autonext.user.js'), `${header}\n(() => {\n'use strict';\n${core}\n${app}\n})();\n`, 'utf8');
console.log('已生成 yuketang-autonext.user.js');
