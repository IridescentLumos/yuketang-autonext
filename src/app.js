const PANEL_ID = 'yuketang-autonext-panel';
if (document.getElementById(PANEL_ID)) return;
const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
const courseKey = () => location.pathname.match(/^\/pro\/lms\/[^/]+\/[^/]+/)?.[0] || null;
const initialCourse = courseKey();
if (!initialCourse) return;
const storageKey = `yuketang-autonext:pending:${initialCourse}`;
const gate = createRunGate();
let running = false;
let currentId = null;
let directorySignature = '';
let boundVideo = null;
let boundSource = null;
let detachPlayer = () => {};
let bootPending = readPending();
const logs = [];

function readDirectory() {
    const roots = [...document.querySelectorAll('.nav-list')]
        .filter(root => root.querySelector('.leaf-item-title'));
    if (roots.length !== 1) throw new Error('尚未找到唯一的课程目录。');
    const root = roots[0];
    const lessons = [...root.querySelectorAll('.leaf-item')].map(row => {
        const title = normalize(row.querySelector('.leaf-item-title')?.textContent);
        const type = normalize(row.querySelector('.leaf-item-tag')?.textContent);
        if (!title || !type) throw new Error('有目录项的标题或类型无法识别。');
        return { id: `${type}:${title}`, title, type, row };
    });
    if (!lessons.length) throw new Error('目录尚未加载。');
    if (new Set(lessons.map(lesson => lesson.id)).size !== lessons.length) {
        throw new Error('发现同名目录项，无法安全确定下一节。');
    }
    return { root, lessons };
}
const signatureOf = lessons => JSON.stringify(lessons.map(({ id }) => id));

function inferCurrent(directory) {
    const candidates = new Set();
    const videos = directory.lessons.filter(lesson => lesson.type === '视频');
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
        const node = walker.currentNode;
        const parent = node.parentElement;
        if (!parent || directory.root.contains(parent) || parent.closest('script,style')) continue;
        if (!parent.getClientRects().length) continue;
        const text = normalize(node.textContent);
        for (const lesson of videos) {
            if (text === lesson.title) candidates.add(lesson.id);
        }
    }
    return candidates.size === 1 ? [...candidates][0] : null;
}

function getPlayer() {
    const players = [...document.querySelectorAll('video.xt_video_player')]
        .filter(video => video.getBoundingClientRect().width > 0 && video.getBoundingClientRect().height > 0);
    if (players.length !== 1) throw new Error('尚未找到唯一的视频播放器。');
    return players[0];
}

function readPending() {
    try {
        const pending = JSON.parse(sessionStorage.getItem(storageKey));
        return pending && pending.course === initialCourse && Date.now() - pending.at < 120000 ? pending : null;
    } catch { return null; }
}
function writePending(title, signature) {
    try { sessionStorage.setItem(storageKey, JSON.stringify({ course: initialCourse, title, signature, at: Date.now() })); }
    catch { /* 单页切换仍可继续；页面重新加载后需点击开始。 */ }
}
function clearPending() {
    try { sessionStorage.removeItem(storageKey); } catch { /* 浏览器可能禁用存储。 */ }
}

const host = document.createElement('div');
host.id = PANEL_ID;
host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483646;';
const shadow = host.attachShadow({ mode: 'open' });
shadow.innerHTML = `
<style>
:host { font:14px/1.5 system-ui,"Microsoft YaHei",sans-serif;color:#17283f; }
section { width:310px;max-width:calc(100vw - 40px);background:#fff;border:1px solid #cbd7e8;border-radius:12px;padding:14px;box-shadow:0 6px 28px #20345630; }
header { display:flex;justify-content:space-between;align-items:center;font-weight:650; }
button,select { font:inherit;box-sizing:border-box; }
select { width:100%;border:1px solid #cbd7e8;background:#fff;border-radius:6px;padding:7px;margin:5px 0; }
button { border:0;border-radius:6px;padding:7px 10px;background:#386ce4;color:#fff;cursor:pointer; }
button:disabled { opacity:.45;cursor:default; }
.secondary { background:#eef3fb;color:#17283f; }
nav { display:flex;gap:8px;margin:9px 0; }
p { margin:8px 0; }
.hint { color:#65748b;font-size:12px; }
#status { padding:9px;background:#f2f6fc;border-radius:6px;white-space:pre-wrap; }
#log { max-height:110px;overflow:auto;white-space:pre-wrap;font-size:12px;color:#65748b; }
[hidden] { display:none!important; }
</style>
<section>
  <header>雨课堂 · 连续播放 <button id="fold" class="secondary" type="button">收起</button></header>
  <div id="body">
    <p class="hint">正常速度 · 跳过作业和考试 · 保持课程页前台</p>
    <label for="lesson">当前正在看的视频</label>
    <select id="lesson"></select>
    <nav><button id="start" type="button">开始 / 继续</button><button id="pause" class="secondary" type="button">暂停</button><button id="stop" class="secondary" type="button">停止</button></nav>
    <div id="status" role="status">等待目录加载…</div>
    <p class="hint" id="count"></p>
    <div id="log" aria-label="运行记录"></div>
  </div>
</section>`;
document.body.appendChild(host);
const picker = shadow.querySelector('#lesson');
const status = shadow.querySelector('#status');
const log = shadow.querySelector('#log');
const startButton = shadow.querySelector('#start');
const pauseButton = shadow.querySelector('#pause');
const stopButton = shadow.querySelector('#stop');

function setStatus(message, record = false) {
    status.textContent = message;
    if (record) {
        logs.push(`${new Date().toLocaleTimeString()} ${message}`);
        if (logs.length > 12) logs.shift();
        log.textContent = logs.join('\n');
        log.scrollTop = log.scrollHeight;
    }
}
function updateButtons() {
    picker.disabled = running;
    pauseButton.disabled = !running;
    stopButton.disabled = !running && !currentId;
}
function halt(message, pausePlayback = false) {
    gate.stop();
    running = false;
    detachPlayer();
    detachPlayer = () => {};
    clearPending();
    bootPending = null;
    if (pausePlayback && boundVideo?.isConnected) boundVideo.pause();
    boundVideo = null;
    boundSource = null;
    setStatus(message, true);
    updateButtons();
}
function requireCurrent(token) {
    if (!gate.isCurrent(token)) throw new Error('已取消');
    if (courseKey() !== initialCourse) throw new Error('课程已改变，请刷新页面。');
}
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const foreground = () => document.visibilityState === 'visible' && document.hasFocus();

async function waitForForeground(token) {
    while (!foreground()) {
        requireCurrent(token);
        setStatus('课程页已离开前台，自动切换正在等待。回到课程页后继续。');
        await sleep(300);
    }
    requireCurrent(token);
}
async function startPlayback(video, token) {
    requireCurrent(token);
    if (!foreground()) {
        setStatus('请保持课程页前台，点击“开始 / 继续”。');
        return;
    }
    video.playbackRate = 1;
    if (hasReallyEnded(video)) { void advance(video, token); return; }
    try {
        if (video.paused) await video.play();
        if (gate.isCurrent(token)) setStatus('正在播放，播完后将自动进入下一条视频。');
    } catch {
        if (gate.isCurrent(token)) setStatus('浏览器暂未允许播放。请点击视频播放按钮，或点击“开始 / 继续”。');
    }
}
function bindPlayer(video, token) {
    detachPlayer();
    boundVideo = video;
    boundSource = video.currentSrc || video.getAttribute('src');
    const onEnded = () => { if (gate.isCurrent(token)) void advance(video, token); };
    const onPause = () => {
        if (gate.isCurrent(token) && !video.ended) setStatus('视频已暂停。回到课程页后，可点击视频或“开始 / 继续”。');
    };
    const onPlaying = () => {
        if (gate.isCurrent(token)) setStatus('正在播放，播完后将自动进入下一条视频。');
    };
    const onError = () => {
        if (gate.isCurrent(token)) halt('视频加载失败，请手动重新加载播放器后继续。');
    };
    video.addEventListener('ended', onEnded);
    video.addEventListener('pause', onPause);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('error', onError);
    detachPlayer = () => {
        video.removeEventListener('ended', onEnded);
        video.removeEventListener('pause', onPause);
        video.removeEventListener('playing', onPlaying);
        video.removeEventListener('error', onError);
    };
}

async function advance(video, token) {
    if (!hasReallyEnded(video) || video !== boundVideo || !gate.beginTransition(token)) return;
    let removeLoadWatch = () => {};
    try {
        setStatus('本节播放结束，等待页面记录进度…', true);
        await sleep(1800);
        requireCurrent(token);
        await waitForForeground(token);
        const directory = readDirectory();
        if (signatureOf(directory.lessons) !== directorySignature) throw new Error('课程目录已改变，请重新选择当前视频后继续。');
        const inferred = inferCurrent(directory);
        if (getPlayer() !== video || (inferred && inferred !== currentId)) throw new Error('播放器已切换，请确认当前视频后继续。');
        const next = chooseNextVideo(directory.lessons, currentId);
        if (!next) { halt('已到目录中的最后一条视频。作业和考试由你自行完成。'); return; }
        const previousSource = video.currentSrc || video.getAttribute('src');
        let reloaded = false;
        const markReload = () => { reloaded = true; };
        video.addEventListener('loadedmetadata', markReload);
        removeLoadWatch = () => video.removeEventListener('loadedmetadata', markReload);
        writePending(next.title, directorySignature);
        setStatus(`正在打开：${next.title}`, true);
        next.row.click();
        const deadline = Date.now() + 35000;
        let replacement = null;
        while (Date.now() < deadline) {
            requireCurrent(token);
            try {
                const candidate = getPlayer();
                const source = candidate.currentSrc || candidate.getAttribute('src');
                const mediaChanged = candidate !== video || (source && source !== previousSource) || reloaded;
                const ready = candidate.readyState >= 1 && Number.isFinite(candidate.duration) && candidate.duration > 0;
                const loadedDirectory = readDirectory();
                const heading = inferCurrent(loadedDirectory);
                if (signatureOf(loadedDirectory.lessons) !== directorySignature) throw new Error('课程目录已改变。');
                if (mediaChanged && ready && (!heading || heading === next.id)) { replacement = candidate; break; }
            } catch (error) {
                if (error.message === '课程目录已改变。') throw error;
            }
            await sleep(250);
        }
        requireCurrent(token);
        if (!replacement) throw new Error('下一节视频未在 35 秒内加载，请手动打开后继续。');
        currentId = next.id;
        picker.value = next.id;
        bindPlayer(replacement, token);
        clearPending();
        gate.finishTransition(token);
        await waitForForeground(token);
        await startPlayback(replacement, token);
    } catch (error) {
        if (gate.isCurrent(token)) halt(error.message);
    } finally {
        removeLoadWatch();
        gate.finishTransition(token);
    }
}

async function startCurrent() {
    try {
        const directory = readDirectory();
        const lesson = directory.lessons.find(item => item.id === picker.value && item.type === '视频');
        if (!lesson) throw new Error('请在下拉框选择当前正在看的视频。');
        const inferred = inferCurrent(directory);
        if (inferred && inferred !== lesson.id) throw new Error('所选小节与播放器标题不同。请先在左侧打开目标视频，再点击开始。');
        const video = getPlayer();
        gate.stop();
        clearPending();
        bootPending = null;
        const token = gate.start();
        running = true;
        currentId = lesson.id;
        directorySignature = signatureOf(directory.lessons);
        bindPlayer(video, token);
        updateButtons();
        setStatus(`已开始：${lesson.title}`, true);
        await startPlayback(video, token);
    } catch (error) { halt(error.message); }
}

function refreshPicker() {
    const directory = readDirectory();
    const videos = directory.lessons.filter(item => item.type === '视频');
    const oldValue = picker.value;
    const candidate = inferCurrent(directory);
    const nextSignature = videos.map(item => item.id).join('\n');
    if (picker.dataset.signature !== nextSignature) {
        picker.replaceChildren();
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '请选择当前正在看的视频';
        picker.appendChild(placeholder);
        videos.forEach(lesson => {
            const option = document.createElement('option');
            option.value = lesson.id;
            option.textContent = lesson.title;
            picker.appendChild(option);
        });
        picker.dataset.signature = nextSignature;
        picker.value = videos.some(item => item.id === oldValue) ? oldValue : (candidate || '');
    } else if (!running && candidate) picker.value = candidate;
    shadow.querySelector('#count').textContent = `已读取 ${videos.length} 个视频；${directory.lessons.length - videos.length} 个非视频单元将跳过。`;
    startButton.disabled = !videos.length;
    return directory;
}

startButton.addEventListener('click', () => { void startCurrent(); });
pauseButton.addEventListener('click', () => halt('已暂停。点击“开始 / 继续”恢复。', true));
stopButton.addEventListener('click', () => {
    halt('自动播放已停止。', true);
    currentId = null;
    updateButtons();
});
shadow.querySelector('#fold').addEventListener('click', event => {
    const body = shadow.querySelector('#body');
    body.hidden = !body.hidden;
    event.target.textContent = body.hidden ? '展开' : '收起';
});
document.addEventListener('click', event => {
    if (!event.isTrusted || !running || !(event.target instanceof Element)) return;
    const row = event.target.closest('.leaf-item');
    if (row?.closest('.nav-list')) halt('你已手动切换目录，自动播放已停止。选择当前视频后可继续。');
}, true);
document.addEventListener('visibilitychange', () => {
    if (running && document.visibilityState !== 'visible') {
        setStatus('课程页已离开前台。回到页面后，按需点击播放或“开始 / 继续”。');
    }
});

let initialized = false;
async function poll() {
    if (courseKey() !== initialCourse) {
        halt('已进入其他课程或页面。请刷新页面后再开始。');
        clearInterval(pollTimer);
        return;
    }
    try {
        const directory = refreshPicker();
        if (!initialized) { initialized = true; setStatus('已就绪。确认当前视频后，点击“开始 / 继续”。'); }
        if (bootPending) {
            const pending = bootPending;
            if (Date.now() - pending.at >= 120000) { clearPending(); bootPending = null; return; }
            const lesson = directory.lessons.find(item => item.title === pending.title && item.type === '视频');
            const video = getPlayer();
            if (!lesson || signatureOf(directory.lessons) !== pending.signature) {
                halt('重新加载后的目录与原目录不同，请手动确认当前视频。'); return;
            }
            if (video.readyState < 1) return;
            const inferred = inferCurrent(directory);
            if (inferred && inferred !== lesson.id) { halt('页面未打开预期视频，请手动选择后继续。'); return; }
            picker.value = lesson.id;
            bootPending = null;
            await startCurrent();
        } else if (running && boundVideo && !gate.isTransitioning(gate.token())) {
            const player = getPlayer();
            const source = player.currentSrc || player.getAttribute('src');
            const inferred = inferCurrent(directory);
            if (player !== boundVideo || (boundSource && source && source !== boundSource) || (inferred && inferred !== currentId)) {
                halt('播放器已切换，自动播放已停止。确认当前视频后可继续。');
            } else {
                if (!boundSource && source) boundSource = source;
                if (hasReallyEnded(boundVideo)) void advance(boundVideo, gate.token());
            }
        }
    } catch (error) {
        if (!initialized) setStatus(`${error.message} 请等待课程视频页加载。`);
    }
    updateButtons();
}
updateButtons();
const pollTimer = setInterval(() => { void poll(); }, 1000);
void poll();
