'use strict';
const assert = require('node:assert/strict');
const { chooseNextVideo, hasReallyEnded, createRunGate } = require('../src/core.cjs');
const lessons = [
    { id: '4.1', type: '视频' }, { id: 'chapter4-work', type: '作业' },
    { id: '5.1', type: '视频' }, { id: '5.2', type: '视频' },
    { id: 'chapter5-work', type: '作业' },
];
assert.equal(chooseNextVideo(lessons, '4.1').id, '5.1');
assert.equal(chooseNextVideo(lessons, '5.1').id, '5.2');
assert.equal(chooseNextVideo(lessons, '5.2'), null);
assert.throws(() => chooseNextVideo(lessons, 'missing'));
assert.throws(() => chooseNextVideo([...lessons, { id: '4.1', type: '视频' }], '4.1'));
assert.throws(() => chooseNextVideo([{ id: '1', type: '视频' }, { id: '2', type: '' }], '1'));
assert.equal(hasReallyEnded({ ended: false, duration: 100, currentTime: 100 }), false);
assert.equal(hasReallyEnded({ ended: true, duration: 100, currentTime: 30 }), false);
assert.equal(hasReallyEnded({ ended: true, duration: NaN, currentTime: 100 }), false);
assert.equal(hasReallyEnded({ ended: true, loop: true, duration: 100, currentTime: 100 }), false);
assert.equal(hasReallyEnded({ ended: true, duration: 100, currentTime: 100 }), true);
const gate = createRunGate();
const oldToken = gate.start();
assert.equal(gate.beginTransition(oldToken), true);
assert.equal(gate.isTransitioning(oldToken), true);
assert.equal(gate.beginTransition(oldToken), false);
gate.stop();
assert.equal(gate.isCurrent(oldToken), false);
assert.equal(gate.isTransitioning(oldToken), false);
const newToken = gate.start();
assert.equal(gate.beginTransition(oldToken), false);
assert.equal(gate.beginTransition(newToken), true);
gate.finishTransition(oldToken);
assert.equal(gate.beginTransition(newToken), false);
gate.finishTransition(newToken);
assert.equal(gate.beginTransition(newToken), true);
console.log('已通过：跨章节跳过作业、目录异常处理、真实结束判断、停止和重复事件保护。');
