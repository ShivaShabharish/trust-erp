/**
 * Unit tests for SyncQueue logic
 */
const assert = require('assert');
const { enqueue, classifyTallyError } = require('../services/syncQueue');

function runSyncQueueTests() {
  console.log('\n--- Running SyncQueue Tests ---');
  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}: ${err.message}`);
    }
  }

  test('enqueue creates new pending queue item with unique id', () => {
    const db = { syncQueue: [] };
    const item = enqueue(db, 'VCH-001', 'REC/25-26/0001');
    assert.strictEqual(item.status, 'pending');
    assert.strictEqual(item.attempts, 0);
    assert.strictEqual(item.voucherId, 'VCH-001');
    assert.strictEqual(db.syncQueue.length, 1);
  });

  test('enqueue prevents duplicate queuing of same voucher', () => {
    const db = { syncQueue: [] };
    const item1 = enqueue(db, 'VCH-001', 'REC/25-26/0001');
    const item2 = enqueue(db, 'VCH-001', 'REC/25-26/0001');
    assert.strictEqual(item1.id, item2.id, 'Should return existing item');
    assert.strictEqual(db.syncQueue.length, 1, 'Length should remain 1');
  });

  test('classifyTallyError handles connection refused', () => {
    const err = { code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 127.0.0.1:9000' };
    const msg = classifyTallyError(null, err);
    assert.ok(msg.includes('not running or port 9000 is blocked'));
  });

  test('classifyTallyError handles timeout', () => {
    const err = { code: 'ETIMEDOUT', message: 'Connection to Tally timed out' };
    const msg = classifyTallyError(null, err);
    assert.ok(msg.includes('timed out'));
  });

  test('classifyTallyError classifies ledger not found response', () => {
    const xml = '<RESPONSE><STATUS>0</STATUS><ERRORS>1</ERRORS><MESSAGE>Ledger "Suspense" not found</MESSAGE></RESPONSE>';
    const msg = classifyTallyError(xml, null);
    assert.ok(msg.includes('Ledger not found in Tally'));
  });

  test('classifyTallyError detects outside financial year', () => {
    const xml = '<RESPONSE><STATUS>0</STATUS><ERRORS>1</ERRORS><MESSAGE>Voucher date outside financial year</MESSAGE></RESPONSE>';
    const msg = classifyTallyError(xml, null);
    assert.ok(msg.includes('outside the current financial year'));
  });

  console.log(`Results: ${passed}/${total} tests passed.\n`);
  return { passed, total };
}

module.exports = { runSyncQueueTests };
if (require.main === module) {
  runSyncQueueTests();
}
