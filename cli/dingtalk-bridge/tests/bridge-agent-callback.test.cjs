// Offline contract test. Node is used only by this developer test, never by bridge.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../scripts/bridge/get-message-by-id.js'), 'utf8');
const start = source.indexOf('observer.add(48).writePointer(');
const end = source.indexOf('observer.add(56)', start);
assert.ok(start >= 0 && end > start, 'the real CEF method-result handler must exist');
const emitted = [];
const dispatched = [];
let handler;
const context = vm.createContext({
  observer: { add() { return { writePointer(fn) { handler = fn; } }; } },
  callback: fn => fn,
  candidates: new Map([[100003, { browserId: 3 }]]),
  entries: [{ browserId: 3 }],
  pending: 1, selected: false, completed: false, discoveryComplete: true,
  messageRequestId: 900123,
  request: { cid: '10000000001', messageId: '27609201248057' },
  execute: (entry, id, expression) => { dispatched.push({ id, expression }); return 1; },
  emit: value => emitted.push(value),
});
vm.runInContext(source.slice(start, end), context);
function deliver(id, body) {
  const json = JSON.stringify(body);
  handler(null, null, id, 1, { readUtf8String() { return json; } }, Buffer.byteLength(json));
}

// CEF on_dev_tools_method_result supplies the method result without the outer
// CDP envelope. This shape was observed in the saved successful runtime probe.
deliver(100003, { result: { type: 'string', value: '{"available":true}' } });
assert.equal(dispatched.length, 1, 'a successful CEF availability result must dispatch the message read');
assert.equal(dispatched[0].id, 900123, 'the per-session message request id must be used');
assert.match(dispatched[0].expression, /getMessageById\("10000000001","27609201248057"/);
assert.equal(emitted.length, 0, 'a successful probe must not be reported as a missing page');

const message = { baseMessage: { conversationId: '10000000001', messageId: '27609201248057', content: { attachments: [{ extension: { payloadV2: '{"text":"完整正文"}' } }] } } };
deliver(900123, { result: { type: 'string', value: JSON.stringify({ success: true, message }) } });
assert.deepEqual(JSON.parse(JSON.stringify(emitted[0])), { success: true, message });
console.log('PASS CEF callback preserves the complete returned message');

const probeCall = source.match(/if\(!execute\(entry,requestId,("(?:[^"\\]|\\.)*")\)\)/);
assert.ok(probeCall, 'the availability expression must be sent to CEF');
const expression = JSON.parse(probeCall[1]);
function probe(location) {
  return JSON.parse(vm.runInNewContext(expression, { location, dingtalk: { message: { getMessageById() {} } } }));
}
assert.equal(probe({ protocol: 'about:', hostname: '' }).available, false, 'an uninitialized about:blank bridge must not win page selection');
assert.equal(probe({ protocol: 'app:', hostname: 'desktop.dingtalk.com' }).available, true);
console.log('PASS bridge discovery ignores the uninitialized about:blank page');

emitted.length = 0;
context.selected = false;
context.pending = 1;
context.discoveryComplete = false;
deliver(100003, { result: { type: 'string', value: '{"available":false}' } });
assert.equal(emitted.length, 0, 'a synchronous negative probe must not finish an incomplete browser scan');
console.log('PASS browser discovery waits for the scan to finish');
