// ==UserScript==
// @name         雨课堂：目录结构采集
// @namespace    yuketang-autonext
// @version      0.1.0
// @description  读取视频目录和播放器结构，供连续播放脚本适配使用
// @match        https://seugs.yuketang.cn/pro/lms/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

(() => {
    'use strict';
    const hostId = 'yuketang-autonext-inspector';
    if (document.getElementById(hostId)) return;
    const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
    const titles = () => [...document.querySelectorAll('.leaf-item-title')];
    function rowFor(title) {
        for (let node = title.parentElement; node && node !== document.body; node = node.parentElement) {
            if (node.querySelectorAll('.leaf-item-title').length !== 1) break;
            if (node.querySelector('.leaf-item-tag')) return node;
        }
        return null;
    }
    function describe(node) {
        if (!node) return null;
        return {
            tag: node.tagName.toLowerCase(),
            class: node.className && typeof node.className === 'string' ? node.className : '',
            role: node.getAttribute('role'),
            titles: node.querySelectorAll('.leaf-item-title').length,
            tags: node.querySelectorAll('.leaf-item-tag').length,
        };
    }
    function structuralHTML(node) {
        if (!node) return null;
        const clone = node.cloneNode(true);
        for (const element of [clone, ...clone.querySelectorAll('*')]) {
            for (const attribute of [...element.attributes]) {
                if (!['class', 'role', 'aria-selected', 'aria-expanded', 'type'].includes(attribute.name)) {
                    element.removeAttribute(attribute.name);
                }
            }
            if (element.matches('input, textarea')) element.value = '';
        }
        return clone.outerHTML.slice(0, 12000);
    }
    const host = document.createElement('div');
    host.id = hostId;
    host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
        <style>
        :host { font:14px/1.5 system-ui,"Microsoft YaHei",sans-serif;color:#162238; }
        section { width:360px;max-width:calc(100vw - 48px);background:#fff;border:1px solid #c8d4e6;border-radius:12px;padding:16px;box-shadow:0 6px 28px #20345630; }
        header { display:flex;justify-content:space-between;align-items:center;font-weight:600; }
        p { margin:10px 0;color:#526076; }
        button,select,textarea { font:inherit;box-sizing:border-box; }
        select,textarea { width:100%;border:1px solid #c8d4e6;border-radius:6px;padding:7px;background:#fff; }
        button { border:0;border-radius:6px;padding:7px 10px;background:#386ce4;color:#fff;cursor:pointer; }
        header button { background:#edf2fa;color:#162238; }
        nav { display:flex;gap:8px;margin:10px 0; }
        textarea { height:170px;resize:vertical;font:12px/1.5 monospace; }
        .status { font-size:12px;white-space:pre-wrap; }
        </style>
        <section>
          <header>雨课堂 · 目录结构采集 <button id="close" type="button">关闭</button></header>
          <p>选择当前视频，再生成并复制结果发回聊天。</p>
          <select id="lesson" aria-label="当前视频"></select>
          <nav><button id="refresh" type="button">刷新目录</button><button id="collect" type="button">生成结果</button><button id="copy" type="button">复制结果</button></nav>
          <textarea id="result" readonly aria-label="采集结果" placeholder="采集结果会显示在这里"></textarea>
          <p class="status" id="status">只读取目录和播放器结构；不会点击课程或控制播放。</p>
        </section>`;
    document.body.appendChild(host);
    const select = shadow.querySelector('#lesson');
    const result = shadow.querySelector('#result');
    const status = shadow.querySelector('#status');
    function refresh() {
        const previous = select.value;
        select.replaceChildren();
        titles().forEach((title, index) => {
            const option = document.createElement('option');
            option.value = String(index);
            option.textContent = normalize(title.textContent);
            select.appendChild(option);
        });
        if ([...select.options].some(option => option.value === previous)) select.value = previous;
        status.textContent = `已找到 ${select.options.length} 条目录项。请选择当前视频。`;
    }
    shadow.querySelector('#refresh').addEventListener('click', refresh);
    shadow.querySelector('#close').addEventListener('click', () => host.remove());
    shadow.querySelector('#collect').addEventListener('click', () => {
        const entries = titles();
        const selected = entries[Number(select.value)];
        if (!selected) { status.textContent = '未找到目录，请在课程视频页点击“刷新目录”。'; return; }
        const row = rowFor(selected);
        const ancestors = [];
        for (let node = selected.parentElement, depth = 0; node && node !== document.body && depth < 7; node = node.parentElement, depth++) {
            ancestors.push(describe(node));
        }
        const homework = entries.find(title => normalize(rowFor(title)?.querySelector('.leaf-item-tag')?.textContent) === '作业');
        const report = {
            version: 1,
            selectedTitle: normalize(selected.textContent),
            selectedRow: structuralHTML(row),
            ancestors,
            homeworkRow: structuralHTML(homework && rowFor(homework)),
            directory: entries.map(title => ({
                title: normalize(title.textContent),
                type: normalize(rowFor(title)?.querySelector('.leaf-item-tag')?.textContent),
                row: describe(rowFor(title)),
            })),
            players: [...document.querySelectorAll('video')].map(video => ({
                tag: 'video', class: video.className, controls: video.controls,
                paused: video.paused, ended: video.ended, loop: video.loop,
                duration: Number.isFinite(video.duration) ? video.duration : null,
                currentTime: video.currentTime,
                visible: video.getBoundingClientRect().width > 0 && video.getBoundingClientRect().height > 0,
            })),
            iframeCount: document.querySelectorAll('iframe').length,
        };
        result.value = JSON.stringify(report, null, 2);
        status.textContent = '已生成。点击“复制结果”，然后粘贴到聊天。结果不包含媒体地址、Cookie 或账号信息。';
    });
    shadow.querySelector('#copy').addEventListener('click', async () => {
        if (!result.value) { status.textContent = '请先点击“生成结果”。'; return; }
        try {
            await navigator.clipboard.writeText(result.value);
            status.textContent = '已复制，请粘贴到聊天。';
        } catch {
            result.focus();
            result.select();
            status.textContent = '已选中结果，请按 Ctrl+C 复制，再粘贴到聊天。';
        }
    });
    refresh();
})();
