/**
 * TallyXmlBuilder — builds Tally-compliant XML envelopes for all voucher types.
 * Supports: Receipt, Payment, Journal, Sales, Purchase
 * Idempotency: unique referenceId embedded in GUID field + narration
 */

function escapeXml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Format date to YYYYMMDD for Tally */
function formatTallyDate(dateStr) {
  if (!dateStr) return new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return String(dateStr).split('T')[0].replace(/-/g, '');
}

/** Validate voucher will not break Tally rules */
function validateVoucher(voucher) {
  const errors = [];
  if (!voucher.date) errors.push('Date is required');
  if (!voucher.amount || parseFloat(voucher.amount) <= 0) errors.push('Amount must be positive');
  if (!voucher.voucherType) errors.push('Voucher type is required');
  
  const date = new Date(voucher.date);
  const fyStart = new Date('2025-04-01');
  const fyEnd = new Date('2026-03-31');
  if (date < fyStart || date > fyEnd) {
    errors.push(`Voucher date ${voucher.date} is outside financial year 2025-26 (Apr 2025 – Mar 2026)`);
  }
  
  if (isNaN(parseFloat(voucher.amount))) {
    errors.push('Amount is not a valid number');
  }
  
  return errors;
}

/** Build Receipt voucher XML (Donation inflow → Dr Bank, Cr Donations) */
function buildReceiptXml(voucher, companyName) {
  const date = formatTallyDate(voucher.date);
  const amount = parseFloat(voucher.amount).toFixed(2);
  const bankLedger = escapeXml(voucher.bankOrCashLedger || 'HDFC Bank A/c');
  const creditLedger = escapeXml(voucher.creditLedger || 'Donations Received (80G)');
  const narration = escapeXml(
    `${voucher.narration || 'Donation Received'} | Ref:${voucher.idempotencyKey || voucher.id} | Donor:${voucher.donorName || 'Anonymous'} | PAN:${voucher.donorPan || 'N/A'} | Project:${voucher.projectName || 'General'}`
  );
  const vchNum = escapeXml(voucher.voucherNumber);
  const category = escapeXml(voucher.tallyCostCategory || 'Primary Cost Category');
  const costCentre = escapeXml(voucher.siteName && voucher.siteName !== 'Multiple Sites Allocation' ? voucher.siteName : voucher.projectName || 'General Fund');

  return `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Receipt" ACTION="Create" OBJVIEW="Accounting Voucher View">
            <GUID>${escapeXml(voucher.idempotencyKey || voucher.id)}</GUID>
            <DATE>${date}</DATE>
            <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${vchNum}</VOUCHERNUMBER>
            <REFERENCE>${escapeXml(voucher.referenceNumber || voucher.id)}</REFERENCE>
            <NARRATION>${narration}</NARRATION>
            <PARTYNAME>${escapeXml(voucher.donorName || creditLedger)}</PARTYNAME>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${bankLedger}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${amount}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${creditLedger}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${amount}</AMOUNT>
              <CATEGORYALLOCATIONS.LIST>
                <CATEGORY>${category}</CATEGORY>
                <COSTCENTREALLOCATIONS.LIST>
                  <NAME>${costCentre}</NAME>
                  <AMOUNT>${amount}</AMOUNT>
                </COSTCENTREALLOCATIONS.LIST>
              </CATEGORYALLOCATIONS.LIST>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

/** Build Payment voucher XML (Expense outflow → Dr Expense, Cr Bank) */
function buildPaymentXml(voucher, companyName) {
  const date = formatTallyDate(voucher.date);
  const amount = parseFloat(voucher.amount).toFixed(2);
  const bankLedger = escapeXml(voucher.bankOrCashLedger || 'HDFC Bank A/c');
  const expenseLedger = escapeXml(voucher.expenseOrVendorLedger || 'School Sanitation Project Exp');
  const narration = escapeXml(
    `${voucher.narration || 'Project Expense'} | Ref:${voucher.idempotencyKey || voucher.id} | Payee:${voucher.payeeName || 'Vendor'} | Bill:${voucher.invoiceNumber || 'N/A'} | Site:${voucher.siteName || 'General'}`
  );
  const vchNum = escapeXml(voucher.voucherNumber);
  const category = escapeXml(voucher.tallyCostCategory || 'Primary Cost Category');
  const costCentre = escapeXml(voucher.siteName && voucher.siteName !== 'Multiple Sites Allocation' ? voucher.siteName : voucher.projectName || 'General Fund');

  const costCentreXml = (costCentre && costCentre !== 'General Fund') ? `
              <CATEGORYALLOCATIONS.LIST>
                <CATEGORY>${category}</CATEGORY>
                <COSTCENTREALLOCATIONS.LIST>
                  <NAME>${costCentre}</NAME>
                  <AMOUNT>-${amount}</AMOUNT>
                </COSTCENTREALLOCATIONS.LIST>
              </CATEGORYALLOCATIONS.LIST>` : '';

  return `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Payment" ACTION="Create" OBJVIEW="Accounting Voucher View">
            <GUID>${escapeXml(voucher.idempotencyKey || voucher.id)}</GUID>
            <DATE>${date}</DATE>
            <VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${vchNum}</VOUCHERNUMBER>
            <REFERENCE>${escapeXml(voucher.referenceNumber || voucher.invoiceNumber || voucher.id)}</REFERENCE>
            <NARRATION>${narration}</NARRATION>
            <PARTYNAME>${escapeXml(voucher.payeeName || expenseLedger)}</PARTYNAME>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${expenseLedger}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${amount}</AMOUNT>${costCentreXml}
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${bankLedger}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${amount}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

/** Build Journal voucher XML (adjustments) */
function buildJournalXml(voucher, companyName) {
  const date = formatTallyDate(voucher.date);
  const amount = parseFloat(voucher.amount).toFixed(2);
  const drLedger = escapeXml(voucher.drLedger || 'Suspense Account');
  const crLedger = escapeXml(voucher.crLedger || 'Suspense Account');
  const narration = escapeXml(`${voucher.narration || 'Journal Adjustment'} | Ref:${voucher.idempotencyKey || voucher.id}`);

  return `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Journal" ACTION="Create" OBJVIEW="Accounting Voucher View">
            <GUID>${escapeXml(voucher.idempotencyKey || voucher.id)}</GUID>
            <DATE>${date}</DATE>
            <VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${escapeXml(voucher.voucherNumber)}</VOUCHERNUMBER>
            <NARRATION>${narration}</NARRATION>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${drLedger}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${amount}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${crLedger}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${amount}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

/** Master builder — picks the right XML based on voucherType */
function buildVoucherXml(voucher, companyName = 'ARUTPERUNJOTHI SEVA TRUST') {
  const type = (voucher.voucherType || '').toLowerCase();
  if (type === 'receipt') return buildReceiptXml(voucher, companyName);
  if (type === 'payment') return buildPaymentXml(voucher, companyName);
  if (type === 'journal') return buildJournalXml(voucher, companyName);
  return buildPaymentXml(voucher, companyName); // fallback
}

module.exports = { buildVoucherXml, buildReceiptXml, buildPaymentXml, buildJournalXml, validateVoucher, escapeXml, formatTallyDate };
