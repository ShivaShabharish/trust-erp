/**
 * Unit tests for TallyXmlBuilder
 */
const assert = require('assert');
const { buildVoucherXml, buildReceiptXml, buildPaymentXml, buildJournalXml, validateVoucher, escapeXml, formatTallyDate } = require('../services/tallyXmlBuilder');

function runXmlBuilderTests() {
  console.log('\n--- Running TallyXmlBuilder Tests ---');
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

  test('escapeXml escapes &, <, >, ", \'', () => {
    const input = 'A & B < C > D "E" \'F\'';
    const expected = 'A &amp; B &lt; C &gt; D &quot;E&quot; &apos;F&apos;';
    assert.strictEqual(escapeXml(input), expected);
  });

  test('formatTallyDate formats YYYY-MM-DD to YYYYMMDD', () => {
    assert.strictEqual(formatTallyDate('2025-08-15'), '20250815');
    assert.strictEqual(formatTallyDate('2026-03-31T10:00:00Z'), '20260331');
  });

  test('validateVoucher catches missing date and amount <= 0', () => {
    const invalid = { date: '', amount: -100, voucherType: 'Payment' };
    const errors = validateVoucher(invalid);
    assert.ok(errors.length >= 2, 'Should catch at least 2 errors');
  });

  test('validateVoucher catches dates outside FY 2025-26', () => {
    const outsideFy = { date: '2024-02-10', amount: 50000, voucherType: 'Receipt' };
    const errors = validateVoucher(outsideFy);
    assert.ok(errors.some(e => e.includes('outside financial year')));
  });

  test('buildReceiptXml generates compliant Tally XML with Dr Bank and Cr Donations', () => {
    const voucher = {
      id: 'VCH-REC-001',
      voucherType: 'Receipt',
      voucherNumber: 'REC/25-26/0001',
      date: '2025-06-15',
      amount: 50000,
      bankOrCashLedger: 'HDFC Bank A/c',
      creditLedger: 'Donations Received (80G)',
      donorName: 'Dr. Annamalai Krishnan',
      donorPan: 'AAEPK8921B',
      narration: 'Corpus donation for school sanitation',
      idempotencyKey: 'IDEMP-REC-001',
      projectName: '36 Govt-Aided Schools Sanitation'
    };
    const xml = buildReceiptXml(voucher, 'ARUTPERUNJOTHI SEVA TRUST');
    assert.ok(xml.includes('<VOUCHER VCHTYPE="Receipt"'), 'Should declare Receipt voucher');
    assert.ok(xml.includes('<GUID>IDEMP-REC-001</GUID>'), 'Must include GUID for idempotency');
    assert.ok(xml.includes('<SVCURRENTCOMPANY>ARUTPERUNJOTHI SEVA TRUST</SVCURRENTCOMPANY>'), 'Company name must match');
    assert.ok(xml.includes('<LEDGERNAME>HDFC Bank A/c</LEDGERNAME>'), 'Bank ledger must be present');
    assert.ok(xml.includes('<AMOUNT>-50000.00</AMOUNT>'), 'Bank is deemed positive, so amount is negative in Tally XML');
    assert.ok(xml.includes('<LEDGERNAME>Donations Received (80G)</LEDGERNAME>'), 'Donations ledger must be present');
    assert.ok(xml.includes('<AMOUNT>50000.00</AMOUNT>'), 'Credit ledger amount must be positive');
  });

  test('buildPaymentXml includes Tally Cost Centre tag for project/school site', () => {
    const voucher = {
      id: 'VCH-PAY-002',
      voucherType: 'Payment',
      voucherNumber: 'PAY/25-26/0002',
      date: '2025-07-20',
      amount: 125000,
      bankOrCashLedger: 'HDFC Bank A/c',
      expenseOrVendorLedger: 'School Sanitation Project Exp',
      payeeName: 'Apex Infra & Plumbing Contractors',
      siteName: 'Govt Higher Secondary School, Block 1',
      tallyCostCategory: 'School Sanitation & Kitchen Projects',
      idempotencyKey: 'IDEMP-PAY-002'
    };
    const xml = buildPaymentXml(voucher, 'ARUTPERUNJOTHI SEVA TRUST');
    assert.ok(xml.includes('<VOUCHER VCHTYPE="Payment"'), 'Should declare Payment voucher');
    assert.ok(xml.includes('<CATEGORY>School Sanitation &amp; Kitchen Projects</CATEGORY>'), 'Cost category must be present');
    assert.ok(xml.includes('<NAME>Govt Higher Secondary School, Block 1</NAME>'), 'Site cost centre must be allocated');
  });

  test('buildVoucherXml dispatches to correct builder based on voucherType', () => {
    const rec = { voucherType: 'Receipt', amount: 1000, date: '2025-05-01' };
    const pay = { voucherType: 'Payment', amount: 2000, date: '2025-05-02' };
    const jrn = { voucherType: 'Journal', amount: 3000, date: '2025-05-03' };

    assert.ok(buildVoucherXml(rec).includes('VCHTYPE="Receipt"'));
    assert.ok(buildVoucherXml(pay).includes('VCHTYPE="Payment"'));
    assert.ok(buildVoucherXml(jrn).includes('VCHTYPE="Journal"'));
  });

  console.log(`Results: ${passed}/${total} tests passed.\n`);
  return { passed, total };
}

module.exports = { runXmlBuilderTests };
if (require.main === module) {
  runXmlBuilderTests();
}
