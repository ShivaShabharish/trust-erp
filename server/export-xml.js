const fs = require('fs');
const path = require('path');

const db = JSON.parse(fs.readFileSync(path.join(__dirname, 'database.json'), 'utf8'));

// Format date to Tally YYYYMMDD with Educational Mode compatibility (Day 01)
function formatTallyDate(dateStr) {
  if (!dateStr) return '20261001';
  const parts = dateStr.split('T')[0].split('-');
  const y = parts[0] || '2026';
  const m = parts[1] || '10';
  return `${y}${m}01`;
}

function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

let vouchersXml = '';
for (const v of db.vouchers) {
  const tallyDate = formatTallyDate(v.date);
  const amount = parseFloat(v.amount) || 0;
  const isReceipt = v.voucherType.toLowerCase() === 'receipt';
  const bankLedger = escapeXml(v.bankOrCashLedger || 'HDFC Bank A/c');
  const otherLedger = isReceipt
    ? escapeXml(v.creditLedger || 'Donations Received (80G)')
    : escapeXml(v.expenseOrVendorLedger || 'School Sanitation Project Exp');
  const narration = escapeXml(v.narration || 'Trust Welfare Operation');
  const vchNumber = escapeXml(v.voucherNumber);
  const categoryName = escapeXml(v.tallyCostCategory || 'School Sanitation & Kitchen Projects');
  const siteName = escapeXml(v.siteName || 'Multiple Sites Allocation');

  vouchersXml += `
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="${isReceipt ? 'Receipt' : 'Payment'}" ACTION="Create">
            <DATE>${tallyDate}</DATE>
            <VOUCHERTYPENAME>${isReceipt ? 'Receipt' : 'Payment'}</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${vchNumber}</VOUCHERNUMBER>
            <NARRATION>${narration}</NARRATION>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${bankLedger}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>${isReceipt ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
              <AMOUNT>${isReceipt ? -amount : amount}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${otherLedger}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>${isReceipt ? 'No' : 'Yes'}</ISDEEMEDPOSITIVE>
              <AMOUNT>${isReceipt ? amount : -amount}</AMOUNT>
              <CATEGORYALLOCATIONS.LIST>
                <CATEGORY>${categoryName}</CATEGORY>
                <COSTCENTREALLOCATIONS.LIST>
                  <NAME>${siteName}</NAME>
                  <AMOUNT>${amount}</AMOUNT>
                </COSTCENTREALLOCATIONS.LIST>
              </CATEGORYALLOCATIONS.LIST>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>`;
}

const fullEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>ARUTPERUNJOTHI SEVA TRUST</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
${vouchersXml}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

const p1 = path.join('C:', 'Program Files', 'Tally', 'Tally.ERP9', 'Tally_Import_Vouchers.xml');
const p2 = path.join('C:', 'Users', 'DELL', 'TallyInstallers', 'Tally_Import_Vouchers.xml');

fs.writeFileSync(p1, fullEnvelope, 'utf8');
fs.writeFileSync(p2, fullEnvelope, 'utf8');
console.log('Successfully written Vouchers XML with full Cost Category Allocations!');
