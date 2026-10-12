'use strict';

function chooseNextVideo(lessons, currentId) {
    const positions = lessons.flatMap((lesson, index) => lesson.id === currentId ? [index] : []);
    if (positions.length !== 1) throw new Error('当前小节必须在目录中唯一存在。');
    for (let index = positions[0] + 1; index < lessons.length; index++) {
        const lesson = lessons[index];
        if (lesson.type === '视频') return lesson;
        if (!['作业', '测验', '考试', '讨论', '文档', '课件', '图文'].includes(lesson.type)) {
            throw new Error('下一条目录项的类型尚未识别。');
        }
    }
    return null;
}

function hasReallyEnded(video) {
    return video.ended === true && video.loop !== true && Number.isFinite(video.duration)
        && video.duration > 0 && Number.isFinite(video.currentTime)
        && video.currentTime >= video.duration - 0.5;
}

function createRunGate() {
    let generation = 0;
    let running = false;
    let transitioning = false;
    return {
        start() { generation++; running = true; transitioning = false; return generation; },
        stop() { generation++; running = false; transitioning = false; },
        token() { return generation; },
        isCurrent(token) { return running && token === generation; },
        isTransitioning(token) { return running && transitioning && token === generation; },
        beginTransition(token) {
            if (!running || transitioning || token !== generation) return false;
            transitioning = true;
            return true;
        },
        finishTransition(token) { if (running && token === generation) transitioning = false; },
    };
}

module.exports = { chooseNextVideo, hasReallyEnded, createRunGate };
