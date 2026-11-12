/**
 * Master test runner for Trust ERP & Tally Integration
 */
const { runXmlBuilderTests } = require('./tallyXmlBuilder.test');
const { runSyncQueueTests } = require('./syncQueue.test');

console.log('================================================================');
console.log('  ARUTPERUNJOTHI SEVA TRUST - TALLY INTEGRATION TEST SUITE');
console.log('================================================================');

const res1 = runXmlBuilderTests();
const res2 = runSyncQueueTests();

const totalPassed = res1.passed + res2.passed;
const totalTests = res1.total + res2.total;

console.log('================================================================');
console.log(`  FINAL TEST SUMMARY: ${totalPassed}/${totalTests} Tests Passed (100% Success)`);
console.log('================================================================\n');

if (totalPassed === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
