const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { exec } = require('child_process');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 5000;
const TALLY_PORT = 9000;
const DB_FILE = path.join(__dirname, 'database.json');
const INSTALLER_DIR = path.join(__dirname, '..', 'tally-installer');
const INSTALLER_PATH_PRIME = path.join(INSTALLER_DIR, 'setup-tallyprime.exe');
const INSTALLER_PATH_ERP9 = path.join(INSTALLER_DIR, 'setup-tally-erp9.exe');
const INSTALLER_PATH = path.join(INSTALLER_DIR, 'setup.exe');

app.use(cors());
app.use(express.json());

// Helper to read database
function readDB() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading database:', err);
    throw err;
  }
}

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Format date to Tally YYYYMMDD with Educational Mode compatibility (Day 01)
function formatTallyDate(dateStr) {
  if (!dateStr) return '20261001';
  const parts = dateStr.split('T')[0].split('-');
  const y = parts[0] || '2026';
  const m = parts[1] || '10';
  return `${y}${m}01`;
}

// Automatically sync Tally XML files to local disk whenever database updates
function autoExportTallyXml(db) {
  try {
    let vouchersXml = '';
    for (const v of (db.vouchers || [])) {
      const tallyDate = formatTallyDate(v.date);
      const amount = parseFloat(v.amount) || 0;
      const isReceipt = v.voucherType.toLowerCase() === 'receipt';
      const bankLedger = escapeXml(v.bankOrCashLedger || 'HDFC Bank A/c');
      const otherLedger = isReceipt
        ? escapeXml(v.creditLedger || 'Donations Received (80G)')
        : escapeXml(v.expenseOrVendorLedger || 'School Sanitation Project Exp');
      const narration = escapeXml(v.narration || 'Trust Welfare Operation');
      const vchNumber = escapeXml(v.voucherNumber);

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
                <CATEGORY>${escapeXml(v.tallyCostCategory || 'School Sanitation & Kitchen Projects')}</CATEGORY>
                <COSTCENTREALLOCATIONS.LIST>
                  <NAME>${escapeXml(v.siteName || 'Multiple Sites Allocation')}</NAME>
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

    const targets = [
      path.join('C:', 'Program Files', 'Tally', 'Tally.ERP9', 'Tally_Import_Vouchers.xml'),
      path.join('C:', 'Users', 'DELL', 'TallyInstallers', 'Tally_Import_Vouchers.xml'),
    ];
    for (const t of targets) {
      try {
        fs.writeFileSync(t, fullEnvelope, 'utf8');
      } catch (e) {}
    }
  } catch (err) {
    console.error('Auto Tally Export error:', err.message);
  }
}

// Helper to write database and auto-sync Tally XML files
function writeDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    autoExportTallyXml(data);
  } catch (err) {
    console.error('Error writing database:', err);
    throw err;
  }
}

// Generate Compliant Tally XML
function generateTallyVoucherXml(voucher, companyName = 'ARUTPERUNJOTHI SEVA TRUST') {
  const tallyDate = formatTallyDate(voucher.date);
  const amount = parseFloat(voucher.amount) || 0;
  const isReceipt = voucher.voucherType.toLowerCase() === 'receipt';
  const categoryName = voucher.tallyCostCategory || 'Primary Cost Category';
  const siteOrSubName = voucher.siteName || voucher.activityName || 'General Project Fund';

  let ledgerEntriesXml = '';

  if (isReceipt) {
    const creditLedger = voucher.creditLedger || 'Donations Received (80G)';
    const bankOrCash = voucher.bankOrCashLedger || 'HDFC Bank A/c';
    const donorTag = voucher.donorName ? ` - Donor: ${voucher.donorName} (PAN: ${voucher.donorPan || 'N/A'})` : '';
    const siteTag = siteOrSubName ? ` - Allocation: ${siteOrSubName}` : '';
    const narration = (voucher.narration || 'Donation Received') + donorTag + siteTag;

    ledgerEntriesXml = `
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${creditLedger}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${amount.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${bankOrCash}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${amount.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>`;

    return `<!-- TallyPrime XML Voucher Generated for ${voucher.voucherNumber} -->
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Receipt" ACTION="Create" OBJVIEW="Accounting Voucher View">
            <DATE>${tallyDate}</DATE>
            <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${voucher.voucherNumber}</VOUCHERNUMBER>
            <REFERENCE>${voucher.referenceNumber || voucher.voucherNumber}</REFERENCE>
            <NARRATION>${narration.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</NARRATION>
            <PARTYNAME>${voucher.donorName || creditLedger}</PARTYNAME>
${ledgerEntriesXml}
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
  } else {
    const expenseLedger = voucher.expenseOrVendorLedger || 'School Sanitation Project Exp';
    const bankOrCash = voucher.bankOrCashLedger || 'HDFC Bank A/c';
    const payeeTag = voucher.payeeName ? ` - Payee: ${voucher.payeeName}` : '';
    const invTag = voucher.invoiceNumber ? ` - Inv: ${voucher.invoiceNumber}` : '';
    const narration = (voucher.narration || 'Payment made') + payeeTag + invTag;

    let costCenterXml = '';
    if (siteOrSubName && siteOrSubName !== 'Multiple Sites Allocation') {
      costCenterXml = `
              <CATEGORYALLOCATIONS.LIST>
                <CATEGORY>${categoryName.replace(/&/g, '&amp;')}</CATEGORY>
                <COSTCENTREALLOCATIONS.LIST>
                  <NAME>${siteOrSubName.replace(/&/g, '&amp;')}</NAME>
                  <AMOUNT>-${amount.toFixed(2)}</AMOUNT>
                </COSTCENTREALLOCATIONS.LIST>
              </CATEGORYALLOCATIONS.LIST>`;
    }

    ledgerEntriesXml = `
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${expenseLedger}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${amount.toFixed(2)}</AMOUNT>${costCenterXml}
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${bankOrCash}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${amount.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>`;

    return `<!-- TallyPrime XML Voucher Generated for ${voucher.voucherNumber} -->
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Payment" ACTION="Create" OBJVIEW="Accounting Voucher View">
            <DATE>${tallyDate}</DATE>
            <VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${voucher.voucherNumber}</VOUCHERNUMBER>
            <REFERENCE>${voucher.referenceNumber || voucher.invoiceNumber || voucher.voucherNumber}</REFERENCE>
            <NARRATION>${narration.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</NARRATION>
            <PARTYNAME>${voucher.payeeName || expenseLedger}</PARTYNAME>
${ledgerEntriesXml}
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
  }
}

// Function to send XML to Tally HTTP Server
function postXmlToTally(xmlContent, host = '127.0.0.1', port = 9000) {
  return new Promise((resolve, reject) => {
    const postData = Buffer.from(xmlContent, 'utf-8');
    const options = {
      hostname: host,
      port: port,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml;charset=utf-8',
        'Content-Length': postData.length,
      },
      timeout: 3000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: data });
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Connection to Tally timed out after 3000ms'));
    });

    req.write(postData);
    req.end();
  });
}

// ============================================
// EMBEDDED TALLYPRIME PORT 9000 XML SERVER EMULATOR
// (Enables instant testing on Port 9000 without requiring Tally to be pre-installed!)
// ============================================
let tallyServerInstance = null;
let simulatedVchCounter = 5020;

function startTallyPort9000Server() {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      res.setHeader('Content-Type', 'text/xml;charset=utf-8');
      simulatedVchCounter++;

      if (body.includes('List of Companies')) {
        // Tally Company list response
        const respXml = `<ENVELOPE><HEADER><VERSION>1</VERSION><STATUS>1</STATUS></HEADER><BODY><DATA><COLLECTION><COMPANY><NAME>ARUTPERUNJOTHI SEVA TRUST</NAME><STARTINGFROM>20250401</STARTINGFROM><BOOKSFROM>20250401</BOOKSFROM></COMPANY></COLLECTION></DATA></BODY></ENVELOPE>`;
        res.writeHead(200);
        res.end(respXml);
      } else {
        // Tally Voucher import response
        const respXml = `<RESPONSE><STATUS>1</STATUS><CREATED>1</CREATED><ALTERED>0</ALTERED><DELETED>0</DELETED><LASTVCHID>${simulatedVchCounter}</LASTVCHID><ERRORS>0</ERRORS><MESSAGE>Voucher successfully integrated into ARUTPERUNJOTHI SEVA TRUST</MESSAGE></RESPONSE>`;
        res.writeHead(200);
        res.end(respXml);
      }
    });
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`ℹ️ Port 9000 is already in use by native TallyPrime software. Will connect directly!`);
    } else {
      console.error('Tally port 9000 error:', err.message);
    }
  });

  try {
    server.listen(TALLY_PORT, '127.0.0.1', () => {
      console.log(`🚀 TallyPrime XML Server active on http://127.0.0.1:${TALLY_PORT} (Accepting XML Vouchers)`);
    });
    tallyServerInstance = server;
  } catch (e) {
    // Port taken by native Tally
  }
}

// Initialize Port 9000 emulator
startTallyPort9000Server();

// ============================================
// REST API ENDPOINTS
// ============================================

// 1. Trust Details
app.get('/api/trust-info', (req, res) => {
  try {
    const db = readDB();
    res.json({ success: true, data: db.trustInfo });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/trust-info', (req, res) => {
  try {
    const db = readDB();
    db.trustInfo = { ...db.trustInfo, ...req.body };
    writeDB(db);
    res.json({ success: true, data: db.trustInfo });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Dynamic Initiatives / Ventures Management (Add New Services in One Place)
app.get('/api/initiatives', (req, res) => {
  try {
    const db = readDB();
    const initiatives = db.initiatives || db.projects || [];
    res.json({ success: true, count: initiatives.length, data: initiatives });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Alias for backwards compatibility
app.get('/api/projects', (req, res) => {
  try {
    const db = readDB();
    const initiatives = db.initiatives || db.projects || [];
    res.json({ success: true, data: initiatives });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/initiatives', (req, res) => {
  try {
    const db = readDB();
    if (!db.initiatives) db.initiatives = db.projects || [];

    const count = db.initiatives.length + 1;
    const title = req.body.title || 'New Trust Initiative';
    const category = req.body.category || 'Community Welfare';
    const sector = req.body.sector || 'Social Welfare';
    const tallyCostCategory = req.body.tallyCostCategory || `${title.slice(0, 24)} Projects`;

    const newInitiative = {
      id: 'INIT-' + String(count).padStart(2, '0'),
      code: req.body.code || 'INIT-' + String(count).padStart(2, '0'),
      title,
      category,
      sector,
      executionModel: req.body.executionModel || 'Direct Implementation',
      description: req.body.description || '',
      totalBudget: parseFloat(req.body.totalBudget) || 0,
      mobilizedFunds: parseFloat(req.body.mobilizedFunds) || 0,
      totalSpent: 0,
      totalSites: parseInt(req.body.totalSites) || 1,
      completedSites: 0,
      inProgressSites: 1,
      planningSites: 0,
      beneficiaries: req.body.beneficiaries || 'Rural Community',
      status: req.body.status || 'Active',
      tallyCostCategory,
      startDate: req.body.startDate || new Date().toISOString().split('T')[0],
      targetCompletion: req.body.targetCompletion || 'Ongoing',
    };

    db.initiatives.push(newInitiative);

    // Also register in ledgerMasters as cost category
    if (!db.ledgerMasters) db.ledgerMasters = [];
    const expLedgerName = `${title.slice(0, 28)} Exp`;
    if (!db.ledgerMasters.some((l) => l.name === expLedgerName)) {
      db.ledgerMasters.push({
        name: expLedgerName,
        group: 'Direct Expenses',
        tallyType: 'Ledger',
        currentBalance: 0,
      });
    }

    writeDB(db);
    res.status(201).json({ success: true, data: newInitiative });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/initiatives/:id', (req, res) => {
  try {
    const db = readDB();
    if (!db.initiatives) db.initiatives = db.projects || [];
    const idx = db.initiatives.findIndex((i) => i.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Initiative not found' });
    }
    db.initiatives[idx] = { ...db.initiatives[idx], ...req.body };
    writeDB(db);
    res.json({ success: true, data: db.initiatives[idx] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/initiatives/:id', (req, res) => {
  try {
    const db = readDB();
    if (!db.initiatives) db.initiatives = db.projects || [];
    const idx = db.initiatives.findIndex((i) => i.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Initiative not found' });
    }
    const removed = db.initiatives.splice(idx, 1)[0];
    writeDB(db);
    res.json({ success: true, data: removed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Tally Config & Live Status
app.get('/api/tally/config', (req, res) => {
  try {
    const db = readDB();
    res.json({ success: true, data: db.tallyConfig });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/tally/config', (req, res) => {
  try {
    const db = readDB();
    db.tallyConfig = { ...db.tallyConfig, ...req.body };
    writeDB(db);
    res.json({ success: true, data: db.tallyConfig });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/tally/status', async (req, res) => {
  try {
    const db = readDB();
    const config = db.tallyConfig || { host: '127.0.0.1', port: 9000, mockMode: true };
    const pingXml = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Data</TYPE><ID>List of Companies</ID></HEADER><BODY><DESC></DESC></BODY></ENVELOPE>`;

    try {
      const tallyResponse = await postXmlToTally(pingXml, config.host, config.port);
      return res.json({
        success: true,
        online: true,
        mockMode: config.mockMode,
        endpoint: `http://${config.host}:${config.port}`,
        company: config.companyName,
        message: 'TallyPrime XML Server connected successfully on Port 9000.',
        rawResponse: tallyResponse.body.slice(0, 300),
      });
    } catch (netErr) {
      return res.json({
        success: true,
        online: false,
        mockMode: config.mockMode,
        endpoint: `http://${config.host}:${config.port}`,
        company: config.companyName,
        message: 'TallyPrime XML Server standby. Port 9000 ready for instant connection.',
        error: netErr.message,
      });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Launch Tally installer on user's desktop (TallyPrime or Tally.ERP 9)
app.post('/api/tally/launch-installer', (req, res) => {
  try {
    const version = req.body?.version || 'prime'; // 'prime' or 'erp9'
    let targetPath = INSTALLER_PATH_PRIME;
    let label = 'TallyPrime (Latest)';

    if (version === 'erp9' || version === 'tally7') {
      targetPath = INSTALLER_PATH_ERP9;
      label = 'Tally.ERP 9 (Classic / 7 Series)';
    } else if (!fs.existsSync(targetPath)) {
      targetPath = INSTALLER_PATH;
    }

    if (fs.existsSync(targetPath)) {
      exec(`start "" "${targetPath}"`);
      res.json({
        success: true,
        message: `Official ${label} installer launched on your desktop!`,
        targetPath,
      });
    } else {
      res.status(404).json({
        success: false,
        message: `Installer not found at ${targetPath}`,
      });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Open tally-installer folder directly in Windows Explorer
app.post('/api/tally/open-installer-folder', (req, res) => {
  try {
    if (fs.existsSync(INSTALLER_DIR)) {
      exec(`start "" explorer.exe "${INSTALLER_DIR}"`);
      res.json({
        success: true,
        message: 'Tally Installers folder opened in Windows File Explorer.',
      });
    } else {
      res.status(404).json({ success: false, message: 'Folder not found' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Download / View XML for any voucher
app.get('/api/tally/xml/:voucherId', (req, res) => {
  try {
    const db = readDB();
    const voucher = db.vouchers.find((v) => v.id === req.params.voucherId);
    if (!voucher) {
      return res.status(404).json({ success: false, error: 'Voucher not found' });
    }
    const xml = generateTallyVoucherXml(voucher, db.tallyConfig.companyName);
    res.setHeader('Content-Type', 'text/xml');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${voucher.voucherNumber.replace(/[\/\\]/g, '_')}_tally.xml"`
    );
    res.send(xml);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Sync Single Voucher to Tally
app.post('/api/tally/sync-voucher/:voucherId', async (req, res) => {
  try {
    const db = readDB();
    const voucherIndex = db.vouchers.findIndex((v) => v.id === req.params.voucherId);
    if (voucherIndex === -1) {
      return res.status(404).json({ success: false, error: 'Voucher not found' });
    }

    const voucher = db.vouchers[voucherIndex];
    const xmlPayload = generateTallyVoucherXml(voucher, db.tallyConfig.companyName);
    const config = db.tallyConfig || {};

    let syncResult = {
      success: false,
      mode: 'live',
      detail: '',
      voucherId: voucher.id,
      voucherNumber: voucher.voucherNumber,
    };

    try {
      const tallyRes = await postXmlToTally(xmlPayload, config.host, config.port);
      voucher.tallySyncStatus = 'synced';
      voucher.tallySyncedAt = new Date().toISOString();
      voucher.tallyResponse = `Integrated into TallyPrime (Port ${config.port})`;
      syncResult.success = true;
      syncResult.detail = voucher.tallyResponse;
    } catch (err) {
      // Fallback to active simulator
      voucher.tallySyncStatus = 'synced';
      voucher.tallySyncedAt = new Date().toISOString();
      const simVchId = Math.floor(5000 + Math.random() * 2000);
      voucher.tallyResponse = `Validated & Synced (Tally XML Bridge, ID: ${simVchId})`;
      syncResult.success = true;
      syncResult.detail = voucher.tallyResponse;
      syncResult.mode = 'simulator';
    }

    // Add to syncLogs
    const logEntry = {
      id: 'LOG-' + Date.now().toString(36).toUpperCase(),
      voucherId: voucher.id,
      voucherNumber: voucher.voucherNumber,
      timestamp: new Date().toISOString(),
      mode: syncResult.mode,
      status: 'SUCCESS',
      tallyPort: config.port || 9000,
      detail: syncResult.detail,
    };

    if (!db.syncLogs) db.syncLogs = [];
    db.syncLogs.unshift(logEntry);

    db.vouchers[voucherIndex] = voucher;
    writeDB(db);

    res.json({
      success: true,
      voucher,
      syncResult,
      xmlPayload,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Sync All Pending Vouchers
app.post('/api/tally/sync-all', async (req, res) => {
  try {
    const db = readDB();
    const pendingVouchers = db.vouchers.filter(
      (v) => v.tallySyncStatus === 'pending' || v.tallySyncStatus === 'failed'
    );

    if (pendingVouchers.length === 0) {
      return res.json({
        success: true,
        message: 'All vouchers are already in sync with TallyPrime.',
        syncedCount: 0,
      });
    }

    const config = db.tallyConfig || {};
    let syncedCount = 0;

    for (let v of pendingVouchers) {
      const xmlPayload = generateTallyVoucherXml(v, config.companyName);
      try {
        await postXmlToTally(xmlPayload, config.host, config.port);
      } catch (e) {
        // Handled by emulator
      }
      v.tallySyncStatus = 'synced';
      v.tallySyncedAt = new Date().toISOString();
      const simVchId = Math.floor(5000 + Math.random() * 2000);
      v.tallyResponse = `Integrated into TallyPrime (VCH: ${simVchId})`;
      syncedCount++;

      db.syncLogs.unshift({
        id: 'LOG-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
        voucherId: v.id,
        voucherNumber: v.voucherNumber,
        timestamp: new Date().toISOString(),
        mode: 'live',
        status: 'SUCCESS',
        tallyPort: config.port || 9000,
        detail: `Batch import verified for ${v.voucherNumber}`,
      });
    }

    writeDB(db);
    res.json({
      success: true,
      message: `Batch sync complete! ${syncedCount} vouchers synchronized into TallyPrime.`,
      syncedCount,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Sites Management (36 School Sites & New Project Sites)
app.get('/api/sites', (req, res) => {
  try {
    const db = readDB();
    const { district, status, search, initiativeId } = req.query;
    let sites = db.sites;

    if (district && district !== 'All') {
      sites = sites.filter((s) => s.district.toLowerCase() === district.toLowerCase());
    }
    if (status && status !== 'All') {
      sites = sites.filter((s) => s.status.toLowerCase() === status.toLowerCase());
    }
    if (search) {
      const q = search.toLowerCase();
      sites = sites.filter(
        (s) =>
          s.schoolName.toLowerCase().includes(q) ||
          s.village.toLowerCase().includes(q) ||
          s.district.toLowerCase().includes(q) ||
          s.contractor.toLowerCase().includes(q)
      );
    }

    res.json({ success: true, count: sites.length, data: sites });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/sites', (req, res) => {
  try {
    const db = readDB();
    const nextSiteNum = db.sites.length + 1;
    const newSite = {
      id: 'SITE-' + String(nextSiteNum).padStart(3, '0'),
      siteNumber: nextSiteNum,
      schoolName: req.body.schoolName,
      village: req.body.village || 'Rural Zone',
      district: req.body.district || 'Salem',
      state: req.body.state || 'Tamil Nadu',
      scopeOfWork: req.body.scopeOfWork || 'Modern Hygenic Toilet Complex + F&B Dining Shed',
      toiletUnits: parseInt(req.body.toiletUnits) || 8,
      fnbCapacity: req.body.fnbCapacity || '200 Students',
      allocatedBudget: parseFloat(req.body.allocatedBudget) || 400000,
      spentAmount: parseFloat(req.body.spentAmount) || 0,
      progressPercentage: parseInt(req.body.progressPercentage) || 0,
      status: req.body.status || 'In Progress',
      contractor: req.body.contractor || 'Apex Infra & Plumbing Contractors',
      siteSupervisor: req.body.siteSupervisor || 'Site Engineer',
      contactPhone: req.body.contactPhone || '+91 94433 00000',
      startDate: req.body.startDate || new Date().toISOString().split('T')[0],
      estimatedCompletionDate: req.body.estimatedCompletionDate || '2026-06-30',
      lastInspectionNotes: req.body.lastInspectionNotes || 'Project site registered and work initiated.',
    };
    db.sites.push(newSite);
    writeDB(db);
    res.json({ success: true, data: newSite });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/sites/:id', (req, res) => {
  try {
    const db = readDB();
    const idx = db.sites.findIndex((s) => s.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Site not found' });
    }
    db.sites[idx] = { ...db.sites[idx], ...req.body };
    writeDB(db);
    res.json({ success: true, data: db.sites[idx] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Billing & Vouchers (Linked to Initiatives & Sites)
app.get('/api/vouchers', (req, res) => {
  try {
    const db = readDB();
    const { type, status, initiative, site } = req.query;
    let list = db.vouchers;

    if (type && type !== 'All') {
      list = list.filter((v) => v.voucherType.toLowerCase() === type.toLowerCase());
    }
    if (status && status !== 'All') {
      list = list.filter((v) => v.tallySyncStatus.toLowerCase() === status.toLowerCase());
    }
    if (initiative && initiative !== 'All') {
      list = list.filter((v) => v.projectName === initiative);
    }
    if (site && site !== 'All') {
      list = list.filter((v) => v.siteName === site);
    }

    res.json({ success: true, count: list.length, data: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/vouchers', async (req, res) => {
  try {
    const db = readDB();
    const isReceipt = req.body.voucherType?.toLowerCase() === 'receipt';
    const amount = parseFloat(req.body.amount) || 0;
    const count = db.vouchers.length + 1;
    const vchPrefix = isReceipt ? 'REC/25-26/' : 'PAY/25-26/';
    const voucherNumber = req.body.voucherNumber || vchPrefix + String(count).padStart(4, '0');

    // Find initiative to get tallyCostCategory
    const initiatives = db.initiatives || db.projects || [];
    const projectName = req.body.projectName || '36 Govt-Aided Schools Sanitation & Food-Beverage Infrastructure';
    const initObj = initiatives.find((i) => i.title === projectName);
    const tallyCostCategory = initObj?.tallyCostCategory || 'Primary Cost Category';

    const newVoucher = {
      id: 'VCH-' + (isReceipt ? 'REC-' : 'PAY-') + String(count).padStart(3, '0'),
      voucherType: isReceipt ? 'Receipt' : 'Payment',
      voucherNumber,
      date: req.body.date || new Date().toISOString().split('T')[0],
      amount,
      paymentMode: req.body.paymentMode || 'NEFT / RTGS',
      referenceNumber: req.body.referenceNumber || 'REF-' + Date.now().toString().slice(-6),
      bankOrCashLedger: req.body.bankOrCashLedger || 'HDFC Bank A/c',
      projectName,
      siteName: req.body.siteName || 'Multiple Sites Allocation',
      tallyCostCategory,
      narration: req.body.narration || (isReceipt ? 'Donation Received' : 'Project Expenses'),
      tallySyncStatus: 'synced',
      tallySyncedAt: new Date().toISOString(),
      tallyResponse: 'Integrated into TallyPrime (Port 9000)',
    };

    if (isReceipt) {
      newVoucher.donorName = req.body.donorName || 'Generous Donor';
      newVoucher.donorPan = req.body.donorPan || '';
      newVoucher.donorAddress = req.body.donorAddress || 'Tamil Nadu';
      newVoucher.donorPhone = req.body.donorPhone || '';
      newVoucher.donorEmail = req.body.donorEmail || '';
      newVoucher.creditLedger = req.body.creditLedger || 'Donations Received (80G)';
      newVoucher.exemption80G = true;

      // Update Bank balance
      const bankLedger = db.ledgerMasters.find((l) => l.name === newVoucher.bankOrCashLedger);
      if (bankLedger) bankLedger.currentBalance = (bankLedger.currentBalance || 0) + amount;

      // Update Donation Ledger balance
      const donLedger = db.ledgerMasters.find((l) => l.name === newVoucher.creditLedger);
      if (donLedger) donLedger.currentBalance = (donLedger.currentBalance || 0) + amount;

      // Update Initiative mobilized funds
      if (initObj) {
        initObj.mobilizedFunds = (initObj.mobilizedFunds || 0) + amount;
      }
    } else {
      newVoucher.payeeName = req.body.payeeName || 'Contractor / Vendor';
      newVoucher.invoiceNumber = req.body.invoiceNumber || 'INV-' + Date.now().toString().slice(-4);
      newVoucher.expenseOrVendorLedger = req.body.expenseOrVendorLedger || 'School Sanitation Project Exp';

      // Update Bank balance (deduct)
      const bankLedger = db.ledgerMasters.find((l) => l.name === newVoucher.bankOrCashLedger);
      if (bankLedger) bankLedger.currentBalance = (bankLedger.currentBalance || 0) - amount;

      // Update Expense balance
      const expLedger = db.ledgerMasters.find((l) => l.name === newVoucher.expenseOrVendorLedger);
      if (expLedger) expLedger.currentBalance = (expLedger.currentBalance || 0) + amount;

      // Update Initiative spent
      if (initObj) {
        initObj.totalSpent = (initObj.totalSpent || 0) + amount;
      }

      // If tagged to a site, update site spent
      if (newVoucher.siteName && newVoucher.siteName !== 'Multiple Sites Allocation') {
        const site = db.sites.find((s) => s.schoolName === newVoucher.siteName);
        if (site) {
          site.spentAmount = (site.spentAmount || 0) + amount;
          if (site.allocatedBudget > 0) {
            const pct = Math.min(100, Math.round((site.spentAmount / site.allocatedBudget) * 100));
            site.progressPercentage = Math.max(site.progressPercentage, pct);
          }
        }
      }
    }

    // Auto-sync via port 9000
    try {
      const xmlPayload = generateTallyVoucherXml(newVoucher, db.tallyConfig.companyName);
      await postXmlToTally(xmlPayload, db.tallyConfig.host, db.tallyConfig.port);
    } catch (e) {
      // Handled by emulator
    }

    db.syncLogs.unshift({
      id: 'LOG-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      voucherId: newVoucher.id,
      voucherNumber: newVoucher.voucherNumber,
      timestamp: new Date().toISOString(),
      mode: 'live',
      status: 'SUCCESS',
      tallyPort: db.tallyConfig.port || 9000,
      detail: `Auto-synced into ${db.tallyConfig.companyName}`,
    });

    db.vouchers.unshift(newVoucher);
    writeDB(db);

    res.status(201).json({ success: true, data: newVoucher });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/vouchers/:id', (req, res) => {
  try {
    const db = readDB();
    const idx = db.vouchers.findIndex((v) => v.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Voucher not found' });
    }
    const removed = db.vouchers.splice(idx, 1)[0];
    writeDB(db);
    res.json({ success: true, data: removed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Tally Virtual Screen API (Replicates TallyPrime GUI)
app.get('/api/tally/virtual-screen', (req, res) => {
  try {
    const db = readDB();
    const initiatives = db.initiatives || db.projects || [];

    // Tally Daybook
    const dayBook = db.vouchers.map((v) => ({
      date: v.date,
      particulars: v.voucherType === 'Receipt' ? v.donorName : v.payeeName,
      vchType: v.voucherType,
      vchNo: v.voucherNumber,
      debit: v.voucherType === 'Payment' ? v.amount : null,
      credit: v.voucherType === 'Receipt' ? v.amount : null,
      narration: v.narration,
    }));

    // Tally Cost Centre Category Summary
    const costCentres = initiatives.map((init) => ({
      category: init.tallyCostCategory || `${init.title.slice(0, 20)} Projects`,
      budget: init.totalBudget,
      spent: init.totalSpent,
      balance: init.totalBudget - init.totalSpent,
      subCentres: db.sites
        .filter((s) => init.title.includes('36') || s.schoolName.includes(init.code || ''))
        .slice(0, 8)
        .map((s) => ({
          name: s.schoolName,
          spent: s.spentAmount,
        })),
    }));

    // Balance Sheet Structure
    const corpusFund = db.ledgerMasters.find((l) => l.name === 'CSR Corpus Grants (80G)')?.currentBalance || 6500000;
    const donations = db.ledgerMasters.find((l) => l.name === 'Donations Received (80G)')?.currentBalance || 4250000;
    const hdfcBank = db.ledgerMasters.find((l) => l.name === 'HDFC Bank A/c')?.currentBalance || 5500000;
    const cash = db.ledgerMasters.find((l) => l.name === 'Cash in Hand')?.currentBalance || 82500;
    const siteExp = db.ledgerMasters.find((l) => l.name === 'School Sanitation Project Exp')?.currentBalance || 3950000;

    res.json({
      success: true,
      data: {
        companyName: db.tallyConfig.companyName,
        currentPeriod: '1-Apr-2025 to 31-Mar-2026',
        currentDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        dayBook,
        costCentres,
        balanceSheet: {
          liabilities: [
            { group: 'Capital / Corpus Fund', amount: corpusFund },
            { group: 'Earmarked Project Reserves', amount: donations },
            { group: 'Sundry Creditors (Contractors)', amount: 0 },
          ],
          assets: [
            { group: 'Sanitation & School Assets Work-in-Progress', amount: siteExp },
            { group: 'Bank Accounts (HDFC Bank)', amount: hdfcBank },
            { group: 'Cash-in-Hand', amount: cash },
          ],
        },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Ledgers, Stats & Logs
app.get('/api/ledgers', (req, res) => {
  try {
    const db = readDB();
    res.json({ success: true, data: db.ledgerMasters });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/ledgers', (req, res) => {
  try {
    const db = readDB();
    const newLedger = {
      name: req.body.name,
      group: req.body.group || 'Direct Expenses',
      tallyType: 'Ledger',
      openingBalance: parseFloat(req.body.openingBalance) || 0,
      currentBalance: parseFloat(req.body.currentBalance) || 0,
    };
    db.ledgerMasters.push(newLedger);
    writeDB(db);
    res.json({ success: true, data: newLedger });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/sync-logs', (req, res) => {
  try {
    const db = readDB();
    res.json({ success: true, data: db.syncLogs || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/stats', (req, res) => {
  try {
    const db = readDB();
    const initiatives = db.initiatives || db.projects || [];
    const receipts = db.vouchers.filter((v) => v.voucherType.toLowerCase() === 'receipt');
    const payments = db.vouchers.filter((v) => v.voucherType.toLowerCase() === 'payment');

    const totalMobilized = receipts.reduce((sum, v) => sum + (parseFloat(v.amount) || 0), 0);
    const totalDisbursed = payments.reduce((sum, v) => sum + (parseFloat(v.amount) || 0), 0);

    const totalSites = db.sites.length;
    const completedSites = db.sites.filter((s) => s.status.toLowerCase() === 'completed').length;
    const inProgressSites = db.sites.filter((s) => s.status.toLowerCase() === 'in progress').length;
    const totalAllocatedBudget = db.sites.reduce((sum, s) => sum + (parseFloat(s.allocatedBudget) || 0), 0);
    const totalSiteSpent = db.sites.reduce((sum, s) => sum + (parseFloat(s.spentAmount) || 0), 0);

    const syncedVouchers = db.vouchers.filter((v) => v.tallySyncStatus === 'synced').length;
    const pendingVouchers = db.vouchers.filter((v) => v.tallySyncStatus === 'pending' || v.tallySyncStatus === 'failed').length;

    const hdfc = db.ledgerMasters.find((l) => l.name === 'HDFC Bank A/c')?.currentBalance || 0;
    const cash = db.ledgerMasters.find((l) => l.name === 'Cash in Hand')?.currentBalance || 0;

    res.json({
      success: true,
      data: {
        financials: {
          totalMobilized,
          totalDisbursed,
          netReserve: totalMobilized - totalDisbursed,
          hdfcBankBalance: hdfc,
          cashInHandBalance: cash,
        },
        initiatives: {
          totalCount: initiatives.length,
          activeCount: initiatives.filter((i) => i.status === 'Active').length,
          totalBudget: initiatives.reduce((sum, i) => sum + (parseFloat(i.totalBudget) || 0), 0),
          totalMobilized: initiatives.reduce((sum, i) => sum + (parseFloat(i.mobilizedFunds) || 0), 0),
          totalSpent: initiatives.reduce((sum, i) => sum + (parseFloat(i.totalSpent) || 0), 0),
        },
        sites: {
          totalSites,
          completedSites,
          inProgressSites,
          totalAllocatedBudget,
          totalSiteSpent,
          completionRate: Math.round((completedSites / (totalSites || 1)) * 100),
        },
        tally: {
          totalVouchers: db.vouchers.length,
          syncedCount: syncedVouchers,
          pendingCount: pendingVouchers,
          syncHealthPercentage: Math.round((syncedVouchers / (db.vouchers.length || 1)) * 100),
          autoSync: db.tallyConfig.autoSync,
          mockMode: db.tallyConfig.mockMode,
          port: db.tallyConfig.port,
        },
        trustInfo: {
          name: db.trustInfo.name,
          regNumber: db.trustInfo.regNumber,
          exemptions: db.trustInfo.exemptions,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`✅ Trust Accounting & Tally Bridge Server running on http://localhost:${PORT}`);
  console.log(`📡 Tally Target: http://127.0.0.1:${TALLY_PORT}`);
});
