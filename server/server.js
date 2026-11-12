/**
 * Trust ERP + TallyPrime Integration — Enhanced Server v2
 * Port 5000 (API) + Port 9000 (Mock Tally)
 *
 * Modules:
 *  1. Auth (JWT + bcrypt)
 *  2. Trust Info
 *  3. Initiatives/Projects
 *  4. Sites
 *  5. Donors
 *  6. Expenses (with approval workflow)
 *  7. Vendors
 *  8. Invoices/Bills
 *  9. Vouchers (full Tally sync)
 * 10. Tally Integration (config, status, sync, XML, pull)
 * 11. Ledgers
 * 12. Reports (Day Book, Trial Balance, I&E, Project/Site Wise, Donor Statement)
 * 13. Charts
 * 14. Sync Queue
 * 15. Audit Log
 * 16. Settings
 * 17. PDF Generation
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { exec } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { buildVoucherXml, validateVoucher } = require('./services/tallyXmlBuilder');
const syncQueueSvc = require('./services/syncQueue');

// Try to load pdfGenerator (optional, graceful fallback)
let pdfGenerator = null;
try { pdfGenerator = require('./services/pdfGenerator'); } catch (e) { console.warn('PDF generator unavailable:', e.message); }

const app = express();
const PORT = process.env.PORT || 5000;
const TALLY_PORT = 9000;
const DB_FILE = path.join(__dirname, 'database.json');
const JWT_SECRET = process.env.JWT_SECRET || 'trust-erp-secret-2026';
const INSTALLER_DIR = path.join(__dirname, '..', 'tally-installer');

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

// ─── DB Helpers ──────────────────────────────────────────────────────────────

function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')); }
  catch (err) { console.error('Error reading DB:', err.message); throw err; }
}

function writeDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    autoExportTallyXml(data);
  } catch (err) { console.error('Error writing DB:', err.message); throw err; }
}

function escapeXml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}

function formatTallyDate(dateStr) {
  if (!dateStr) return '20261001';
  return String(dateStr).split('T')[0].replace(/-/g,'');
}

// ─── Audit Logging ───────────────────────────────────────────────────────────

function addAuditLog(db, userId, userName, action, entity, entityId, details = '') {
  if (!db.auditLog) db.auditLog = [];
  db.auditLog.unshift({
    id: 'AUD-' + Date.now().toString(36).toUpperCase(),
    userId: userId || 'system',
    userName: userName || 'System',
    action,
    entity,
    entityId: entityId || '',
    details: typeof details === 'object' ? JSON.stringify(details) : String(details),
    timestamp: new Date().toISOString(),
  });
  // Keep last 500 entries
  if (db.auditLog.length > 500) db.auditLog = db.auditLog.slice(0, 500);
}

// ─── Auth Middleware ──────────────────────────────────────────────────────────

function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  try {
    const token = header.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: `Access denied. Required role: ${roles.join(' or ')}` });
    }
    next();
  };
}

// ─── Tally XML Auto Export ────────────────────────────────────────────────────

function autoExportTallyXml(db) {
  try {
    const vouchers = db.vouchers || [];
    let vouchersXml = '';
    for (const v of vouchers) {
      try { vouchersXml += buildVoucherXml(v, db.tallyConfig?.companyName || 'ARUTPERUNJOTHI SEVA TRUST').replace(/<\?xml[^>]*\?>\n?/, ''); }
      catch (e) {}
    }
    const fullEnvelope = `<?xml version="1.0" encoding="utf-8"?>\n<ENVELOPE>\n  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>\n  <BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${escapeXml(db.tallyConfig?.companyName || 'ARUTPERUNJOTHI SEVA TRUST')}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>${vouchersXml}</REQUESTDATA></IMPORTDATA></BODY>\n</ENVELOPE>`;
    const targets = [
      path.join('C:', 'Program Files', 'Tally', 'Tally.ERP9', 'Tally_Import_Vouchers.xml'),
      path.join('C:', 'Users', 'DELL', 'TallyInstallers', 'Tally_Import_Vouchers.xml'),
    ];
    for (const t of targets) { try { fs.writeFileSync(t, fullEnvelope, 'utf8'); } catch (e) {} }
  } catch (err) { console.warn('Auto Tally export warning:', err.message); }
}

// ─── Mock Tally Server on Port 9000 ──────────────────────────────────────────

let simulatedVchCounter = 7520;

function startMockTallyServer() {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      res.setHeader('Content-Type', 'text/xml;charset=utf-8');
      simulatedVchCounter++;
      const url = req.url || '/';
      const errSim = url.includes('ledger-not-found') ? 'ledger' : url.includes('date-error') ? 'date' : null;

      if (errSim === 'ledger') {
        res.writeHead(200);
        res.end(`<RESPONSE><STATUS>0</STATUS><ERRORS>1</ERRORS><MESSAGE>Ledger "Unknown Ledger" not found in company</MESSAGE></RESPONSE>`);
      } else if (errSim === 'date') {
        res.writeHead(200);
        res.end(`<RESPONSE><STATUS>0</STATUS><ERRORS>1</ERRORS><MESSAGE>Voucher date outside current financial year</MESSAGE></RESPONSE>`);
      } else if (body.includes('List of Companies') || body.includes('TALLYREQUEST>Export')) {
        res.writeHead(200);
        res.end(`<ENVELOPE><HEADER><VERSION>1</VERSION><STATUS>1</STATUS></HEADER><BODY><DATA><COLLECTION><COMPANY><NAME>ARUTPERUNJOTHI SEVA TRUST</NAME><STARTINGFROM>20250401</STARTINGFROM><BOOKSFROM>20250401</BOOKSFROM></COMPANY></COLLECTION></DATA></BODY></ENVELOPE>`);
      } else {
        res.writeHead(200);
        res.end(`<RESPONSE><STATUS>1</STATUS><CREATED>1</CREATED><ALTERED>0</ALTERED><DELETED>0</DELETED><LASTVCHID>${simulatedVchCounter}</LASTVCHID><ERRORS>0</ERRORS><MESSAGE>Voucher successfully integrated into ARUTPERUNJOTHI SEVA TRUST</MESSAGE></RESPONSE>`);
      }
    });
  });
  server.on('error', err => {
    if (err.code === 'EADDRINUSE') console.log(`ℹ️ Port ${TALLY_PORT} already in use (real Tally running)`);
    else console.error('Mock Tally server error:', err.message);
  });
  server.listen(TALLY_PORT, '127.0.0.1', () => {
    console.log(`🎯 Mock TallyPrime Server active on http://127.0.0.1:${TALLY_PORT}`);
  });
}

// ─── Sync Queue Auto-Processing ───────────────────────────────────────────────

setInterval(async () => {
  try {
    const db = readDB();
    const config = db.tallyConfig || { host: '127.0.0.1', port: 9000, companyName: 'ARUTPERUNJOTHI SEVA TRUST', mockMode: true };
    const queue = (db.syncQueue || []).filter(q => q.status === 'pending' || q.status === 'retrying');
    if (queue.length === 0) return;
    await syncQueueSvc.processQueue(db, config, buildVoucherXml, writeDB);
    console.log(`🔄 Auto-processed ${queue.length} sync queue item(s)`);
  } catch (err) { console.warn('Sync queue auto-process error:', err.message); }
}, 60000);

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password required' });
    const db = readDB();
    const user = (db.users || []).find(u => u.email.toLowerCase() === email.toLowerCase() && u.active !== false);
    if (!user) return res.status(401).json({ success: false, error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ success: false, error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    user.lastLogin = new Date().toISOString();
    addAuditLog(db, user.id, user.name, 'LOGIN', 'user', user.id, `Logged in from ${req.ip}`);
    writeDB(db);
    res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ success: true, user: req.user });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TRUST INFO
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/trust-info', (req, res) => {
  try { const db = readDB(); res.json({ success: true, data: db.trustInfo }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/trust-info', authMiddleware, requireRole('Admin'), (req, res) => {
  try {
    const db = readDB();
    db.trustInfo = { ...db.trustInfo, ...req.body };
    addAuditLog(db, req.user.id, req.user.name, 'UPDATE', 'trustInfo', 'singleton', 'Updated trust info');
    writeDB(db);
    res.json({ success: true, data: db.trustInfo });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// INITIATIVES / PROJECTS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/initiatives', (req, res) => {
  try { const db = readDB(); const initiatives = db.initiatives || db.projects || []; res.json({ success: true, count: initiatives.length, data: initiatives }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/projects', (req, res) => {
  try { const db = readDB(); const initiatives = db.initiatives || db.projects || []; res.json({ success: true, data: initiatives }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/initiatives', authMiddleware, requireRole('Admin', 'Accountant', 'ProjectManager'), (req, res) => {
  try {
    const db = readDB();
    if (!db.initiatives) db.initiatives = db.projects || [];
    const count = db.initiatives.length + 1;
    const title = req.body.title || 'New Trust Initiative';
    const newInit = {
      id: 'INIT-' + String(count).padStart(2, '0'),
      code: req.body.code || 'INIT-' + String(count).padStart(2, '0'),
      title, category: req.body.category || 'Community Welfare',
      sector: req.body.sector || 'Social Welfare',
      executionModel: req.body.executionModel || 'Direct Implementation',
      description: req.body.description || '',
      totalBudget: parseFloat(req.body.totalBudget) || 0,
      mobilizedFunds: parseFloat(req.body.mobilizedFunds) || 0,
      totalSpent: 0,
      totalSites: parseInt(req.body.totalSites) || 1,
      completedSites: 0, inProgressSites: 0, planningSites: parseInt(req.body.totalSites) || 1,
      beneficiaries: req.body.beneficiaries || 'Community',
      status: req.body.status || 'Active',
      tallyCostCategory: req.body.tallyCostCategory || `${title.slice(0, 24)} Projects`,
      startDate: req.body.startDate || new Date().toISOString().split('T')[0],
      targetCompletion: req.body.targetCompletion || 'Ongoing',
    };
    db.initiatives.push(newInit);
    addAuditLog(db, req.user?.id, req.user?.name, 'CREATE', 'initiative', newInit.id, `Created: ${title}`);
    writeDB(db);
    res.status(201).json({ success: true, data: newInit });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/initiatives/:id', authMiddleware, (req, res) => {
  try {
    const db = readDB();
    if (!db.initiatives) db.initiatives = db.projects || [];
    const idx = db.initiatives.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Initiative not found' });
    db.initiatives[idx] = { ...db.initiatives[idx], ...req.body };
    addAuditLog(db, req.user?.id, req.user?.name, 'UPDATE', 'initiative', req.params.id, 'Updated initiative');
    writeDB(db);
    res.json({ success: true, data: db.initiatives[idx] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/api/initiatives/:id', authMiddleware, requireRole('Admin'), (req, res) => {
  try {
    const db = readDB();
    if (!db.initiatives) db.initiatives = db.projects || [];
    const idx = db.initiatives.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Initiative not found' });
    const removed = db.initiatives.splice(idx, 1)[0];
    addAuditLog(db, req.user?.id, req.user?.name, 'DELETE', 'initiative', req.params.id, `Deleted: ${removed.title}`);
    writeDB(db);
    res.json({ success: true, data: removed });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SITES
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/sites', (req, res) => {
  try {
    const db = readDB();
    const { district, status, search, initiativeId } = req.query;
    let sites = db.sites || [];
    if (district && district !== 'All') sites = sites.filter(s => s.district?.toLowerCase() === district.toLowerCase());
    if (status && status !== 'All') sites = sites.filter(s => s.status?.toLowerCase() === status.toLowerCase());
    if (search) {
      const q = search.toLowerCase();
      sites = sites.filter(s =>
        (s.schoolName || '').toLowerCase().includes(q) || (s.village || '').toLowerCase().includes(q) ||
        (s.district || '').toLowerCase().includes(q) || (s.contractor || '').toLowerCase().includes(q)
      );
    }
    if (initiativeId && initiativeId !== 'All') sites = sites.filter(s => s.initiativeId === initiativeId);
    res.json({ success: true, count: sites.length, data: sites });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/sites', authMiddleware, (req, res) => {
  try {
    const db = readDB();
    const nextNum = (db.sites || []).length + 1;
    const newSite = {
      id: 'SITE-' + String(nextNum).padStart(3, '0'),
      siteNumber: nextNum,
      schoolName: req.body.schoolName || 'New Site',
      village: req.body.village || 'Rural Zone',
      district: req.body.district || 'Salem',
      state: req.body.state || 'Tamil Nadu',
      scopeOfWork: req.body.scopeOfWork || 'Infrastructure Development',
      toiletUnits: parseInt(req.body.toiletUnits) || 8,
      fnbCapacity: req.body.fnbCapacity || '200 Students',
      allocatedBudget: parseFloat(req.body.allocatedBudget) || 400000,
      spentAmount: parseFloat(req.body.spentAmount) || 0,
      progressPercentage: parseInt(req.body.progressPercentage) || 0,
      status: req.body.status || 'Planning',
      contractor: req.body.contractor || 'TBD',
      siteSupervisor: req.body.siteSupervisor || 'TBD',
      contactPhone: req.body.contactPhone || '',
      startDate: req.body.startDate || new Date().toISOString().split('T')[0],
      estimatedCompletionDate: req.body.estimatedCompletionDate || '',
      lastInspectionNotes: req.body.lastInspectionNotes || 'Site registered.',
      initiativeId: req.body.initiativeId || 'INIT-01',
    };
    if (!db.sites) db.sites = [];
    db.sites.push(newSite);
    addAuditLog(db, req.user?.id, req.user?.name, 'CREATE', 'site', newSite.id, `Created site: ${newSite.schoolName}`);
    writeDB(db);
    res.json({ success: true, data: newSite });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/sites/:id', authMiddleware, (req, res) => {
  try {
    const db = readDB();
    const idx = (db.sites || []).findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Site not found' });
    db.sites[idx] = { ...db.sites[idx], ...req.body };
    addAuditLog(db, req.user?.id, req.user?.name, 'UPDATE', 'site', req.params.id, 'Updated site');
    writeDB(db);
    res.json({ success: true, data: db.sites[idx] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DONORS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/donors', (req, res) => {
  try { const db = readDB(); res.json({ success: true, data: db.donors || [] }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/donors', authMiddleware, (req, res) => {
  try {
    const db = readDB();
    if (!db.donors) db.donors = [];
    const count = db.donors.length + 1;
    const newDonor = {
      id: 'DON-' + String(count).padStart(4, '0'),
      name: req.body.name,
      email: req.body.email || '',
      phone: req.body.phone || '',
      pan: req.body.pan || '',
      address: req.body.address || '',
      organization: req.body.organization || '',
      totalDonated: 0,
      donationCount: 0,
      createdAt: new Date().toISOString(),
    };
    db.donors.push(newDonor);
    addAuditLog(db, req.user?.id, req.user?.name, 'CREATE', 'donor', newDonor.id, `New donor: ${newDonor.name}`);
    writeDB(db);
    res.status(201).json({ success: true, data: newDonor });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/donors/:id', (req, res) => {
  try {
    const db = readDB();
    const donor = (db.donors || []).find(d => d.id === req.params.id);
    if (!donor) return res.status(404).json({ success: false, error: 'Donor not found' });
    res.json({ success: true, data: donor });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/donors/:id', authMiddleware, (req, res) => {
  try {
    const db = readDB();
    const idx = (db.donors || []).findIndex(d => d.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Donor not found' });
    db.donors[idx] = { ...db.donors[idx], ...req.body };
    addAuditLog(db, req.user?.id, req.user?.name, 'UPDATE', 'donor', req.params.id, 'Updated donor');
    writeDB(db);
    res.json({ success: true, data: db.donors[idx] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// VENDORS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/vendors', (req, res) => {
  try { const db = readDB(); res.json({ success: true, data: db.vendors || [] }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/vendors', authMiddleware, (req, res) => {
  try {
    const db = readDB();
    if (!db.vendors) db.vendors = [];
    const count = db.vendors.length + 1;
    const newVendor = {
      id: 'VND-' + String(count).padStart(3, '0'),
      name: req.body.name,
      gstin: req.body.gstin || '',
      address: req.body.address || '',
      phone: req.body.phone || '',
      email: req.body.email || '',
      category: req.body.category || 'General',
      createdAt: new Date().toISOString(),
    };
    db.vendors.push(newVendor);
    addAuditLog(db, req.user?.id, req.user?.name, 'CREATE', 'vendor', newVendor.id, `New vendor: ${newVendor.name}`);
    writeDB(db);
    res.status(201).json({ success: true, data: newVendor });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/vendors/:id', authMiddleware, (req, res) => {
  try {
    const db = readDB();
    const idx = (db.vendors || []).findIndex(v => v.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Vendor not found' });
    db.vendors[idx] = { ...db.vendors[idx], ...req.body };
    writeDB(db);
    res.json({ success: true, data: db.vendors[idx] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXPENSES (with approval workflow)
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/expenses', (req, res) => {
  try {
    const db = readDB();
    let expenses = db.expenses || [];
    const { status, projectId, approvalStatus } = req.query;
    if (approvalStatus && approvalStatus !== 'All') expenses = expenses.filter(e => e.approvalStatus === approvalStatus);
    if (projectId && projectId !== 'All') expenses = expenses.filter(e => e.projectId === projectId);
    res.json({ success: true, count: expenses.length, data: expenses });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/expenses', authMiddleware, (req, res) => {
  try {
    const db = readDB();
    if (!db.expenses) db.expenses = [];
    const count = db.expenses.length + 1;
    const newExpense = {
      id: 'EXP-' + String(count).padStart(4, '0'),
      vendorId: req.body.vendorId || '',
      vendorName: req.body.vendorName || 'General Vendor',
      description: req.body.description || 'Project Expense',
      amount: parseFloat(req.body.amount) || 0,
      billNumber: req.body.billNumber || 'BILL-' + Date.now().toString().slice(-5),
      billDate: req.body.billDate || new Date().toISOString().split('T')[0],
      projectId: req.body.projectId || 'INIT-01',
      projectName: req.body.projectName || '36 Govt-Aided Schools Sanitation & Food-Beverage Infrastructure',
      siteId: req.body.siteId || '',
      siteName: req.body.siteName || 'Multiple Sites Allocation',
      category: req.body.category || 'Civil Work',
      paymentMode: req.body.paymentMode || 'NEFT / RTGS',
      approvalStatus: 'Pending',
      approvedBy: null,
      rejectedReason: null,
      tallySyncStatus: 'pending',
      voucherId: null,
      createdAt: new Date().toISOString(),
      createdBy: req.user?.name || 'Staff',
      createdById: req.user?.id || '',
    };
    db.expenses.push(newExpense);
    addAuditLog(db, req.user?.id, req.user?.name, 'CREATE', 'expense', newExpense.id, `New expense: ₹${newExpense.amount} - ${newExpense.description}`);
    writeDB(db);
    res.status(201).json({ success: true, data: newExpense });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/expenses/:id', authMiddleware, (req, res) => {
  try {
    const db = readDB();
    const idx = (db.expenses || []).findIndex(e => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Expense not found' });
    const exp = db.expenses[idx];
    if (exp.tallySyncStatus === 'synced') return res.status(400).json({ success: false, error: 'Cannot edit a synced expense. Reverse and re-enter.' });
    db.expenses[idx] = { ...exp, ...req.body };
    writeDB(db);
    res.json({ success: true, data: db.expenses[idx] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/expenses/:id/approve', authMiddleware, requireRole('Admin', 'Accountant'), async (req, res) => {
  try {
    const db = readDB();
    const expIdx = (db.expenses || []).findIndex(e => e.id === req.params.id);
    if (expIdx === -1) return res.status(404).json({ success: false, error: 'Expense not found' });
    const exp = db.expenses[expIdx];
    if (exp.approvalStatus !== 'Pending') return res.status(400).json({ success: false, error: `Expense is already ${exp.approvalStatus}` });

    exp.approvalStatus = 'Approved';
    exp.approvedBy = req.user?.name;
    exp.approvedAt = new Date().toISOString();

    // Auto-create Payment voucher
    const vchCount = (db.vouchers || []).length + 1;
    const settings = db.settings || {};
    const vchPrefix = (settings.numberingSeries?.payment) || 'PAY/25-26/';
    const voucherNumber = vchPrefix + String(vchCount).padStart(4, '0');
    const idKey = 'EXP-' + exp.id + '-' + Date.now().toString(36).toUpperCase();

    const initiatives = db.initiatives || db.projects || [];
    const initObj = initiatives.find(i => i.id === exp.projectId);
    const tallyCostCategory = initObj?.tallyCostCategory || 'Primary Cost Category';

    const newVoucher = {
      id: 'VCH-PAY-' + String(vchCount).padStart(3, '0'),
      voucherType: 'Payment',
      voucherNumber,
      date: exp.billDate || new Date().toISOString().split('T')[0],
      amount: exp.amount,
      paymentMode: exp.paymentMode || 'NEFT / RTGS',
      referenceNumber: exp.billNumber,
      bankOrCashLedger: 'HDFC Bank A/c',
      projectName: exp.projectName,
      siteName: exp.siteName || 'Multiple Sites Allocation',
      tallyCostCategory,
      narration: `${exp.description} | Bill: ${exp.billNumber}`,
      tallySyncStatus: 'pending',
      tallySyncedAt: null,
      tallyResponse: null,
      idempotencyKey: idKey,
      payeeName: exp.vendorName,
      invoiceNumber: exp.billNumber,
      expenseOrVendorLedger: 'School Sanitation Project Exp',
    };

    if (!db.vouchers) db.vouchers = [];
    db.vouchers.unshift(newVoucher);
    exp.voucherId = newVoucher.id;
    exp.tallySyncStatus = 'pending';

    // Add to sync queue
    syncQueueSvc.enqueue(db, newVoucher.id, newVoucher.voucherNumber);

    // Update site/initiative spend
    if (initObj) initObj.totalSpent = (initObj.totalSpent || 0) + exp.amount;
    if (exp.siteName && exp.siteName !== 'Multiple Sites Allocation') {
      const site = (db.sites || []).find(s => s.schoolName === exp.siteName || s.id === exp.siteId);
      if (site) {
        site.spentAmount = (site.spentAmount || 0) + exp.amount;
        if (site.allocatedBudget > 0) site.progressPercentage = Math.min(100, Math.round((site.spentAmount / site.allocatedBudget) * 100));
      }
    }

    // Update bank ledger
    const bankLedger = (db.ledgerMasters || []).find(l => l.name === 'HDFC Bank A/c');
    if (bankLedger) bankLedger.currentBalance = (bankLedger.currentBalance || 0) - exp.amount;

    addAuditLog(db, req.user?.id, req.user?.name, 'APPROVE', 'expense', exp.id, `Approved expense ₹${exp.amount} → Voucher ${voucherNumber}`);
    writeDB(db);
    res.json({ success: true, data: exp, voucher: newVoucher });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/expenses/:id/reject', authMiddleware, requireRole('Admin', 'Accountant'), (req, res) => {
  try {
    const db = readDB();
    const expIdx = (db.expenses || []).findIndex(e => e.id === req.params.id);
    if (expIdx === -1) return res.status(404).json({ success: false, error: 'Expense not found' });
    const exp = db.expenses[expIdx];
    if (exp.approvalStatus !== 'Pending') return res.status(400).json({ success: false, error: `Expense is already ${exp.approvalStatus}` });
    exp.approvalStatus = 'Rejected';
    exp.rejectedReason = req.body.reason || 'Rejected by approver';
    exp.rejectedBy = req.user?.name;
    addAuditLog(db, req.user?.id, req.user?.name, 'REJECT', 'expense', exp.id, `Rejected: ${exp.rejectedReason}`);
    writeDB(db);
    res.json({ success: true, data: exp });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// INVOICES / BILLS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/invoices', (req, res) => {
  try { const db = readDB(); res.json({ success: true, data: db.invoices || [] }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/invoices', authMiddleware, (req, res) => {
  try {
    const db = readDB();
    if (!db.invoices) db.invoices = [];
    const count = db.invoices.length + 1;
    const settings = db.settings || {};
    const prefix = settings.numberingSeries?.invoice || 'INV/25-26/';
    const lineItems = (req.body.lineItems || []).map((item, i) => ({
      ...item, amount: parseFloat(item.quantity || 1) * parseFloat(item.rate || 0)
    }));
    const subtotal = lineItems.reduce((s, i) => s + (i.amount || 0), 0);
    const gstRate = parseFloat(req.body.gstRate) || 0;
    const gstAmount = (subtotal * gstRate) / 100;
    const newInvoice = {
      id: 'INV-' + String(count).padStart(4, '0'),
      invoiceNumber: req.body.invoiceNumber || prefix + String(count).padStart(4, '0'),
      type: req.body.type || 'purchase',
      partyName: req.body.partyName || 'Party Name',
      partyGstin: req.body.partyGstin || '',
      invoiceDate: req.body.invoiceDate || new Date().toISOString().split('T')[0],
      dueDate: req.body.dueDate || '',
      lineItems,
      subtotal,
      gstRate,
      gstAmount,
      total: subtotal + gstAmount,
      status: req.body.status || 'Draft',
      notes: req.body.notes || '',
      projectId: req.body.projectId || 'INIT-01',
      tallySyncStatus: 'pending',
      voucherId: null,
      createdAt: new Date().toISOString(),
      createdBy: req.user?.name || 'Staff',
    };
    db.invoices.push(newInvoice);
    addAuditLog(db, req.user?.id, req.user?.name, 'CREATE', 'invoice', newInvoice.id, `Invoice ${newInvoice.invoiceNumber} for ₹${newInvoice.total}`);
    writeDB(db);
    res.status(201).json({ success: true, data: newInvoice });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/invoices/:id', authMiddleware, (req, res) => {
  try {
    const db = readDB();
    const idx = (db.invoices || []).findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Invoice not found' });
    db.invoices[idx] = { ...db.invoices[idx], ...req.body };
    writeDB(db);
    res.json({ success: true, data: db.invoices[idx] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/invoices/:id/tally-sync', authMiddleware, async (req, res) => {
  try {
    const db = readDB();
    const inv = (db.invoices || []).find(i => i.id === req.params.id);
    if (!inv) return res.status(404).json({ success: false, error: 'Invoice not found' });
    const vchType = inv.type === 'sales' ? 'Receipt' : 'Payment';
    const vchCount = (db.vouchers || []).length + 1;
    const voucherNumber = (inv.type === 'sales' ? 'REC/25-26/' : 'PAY/25-26/') + String(vchCount).padStart(4, '0');
    const idKey = 'INV-' + inv.id + '-TALLY';
    const voucher = {
      id: 'VCH-INV-' + String(vchCount).padStart(3, '0'),
      voucherType: vchType, voucherNumber,
      date: inv.invoiceDate, amount: inv.total,
      narration: `Invoice ${inv.invoiceNumber} | ${inv.partyName}`,
      idempotencyKey: idKey,
      bankOrCashLedger: 'HDFC Bank A/c',
      expenseOrVendorLedger: 'School Sanitation Project Exp',
      creditLedger: 'Donations Received (80G)',
      projectName: '36 Govt-Aided Schools Sanitation & Food-Beverage Infrastructure',
      siteName: 'Multiple Sites Allocation',
      tallyCostCategory: 'Primary Cost Category',
      tallySyncStatus: 'pending',
      payeeName: inv.partyName,
      invoiceNumber: inv.invoiceNumber,
      tallySyncedAt: null, tallyResponse: null,
    };
    if (!db.vouchers) db.vouchers = [];
    db.vouchers.unshift(voucher);
    inv.voucherId = voucher.id;
    inv.tallySyncStatus = 'pending';
    syncQueueSvc.enqueue(db, voucher.id, voucher.voucherNumber);
    addAuditLog(db, req.user?.id, req.user?.name, 'TALLY_SYNC', 'invoice', inv.id, `Queued invoice sync: ${inv.invoiceNumber}`);
    writeDB(db);
    res.json({ success: true, data: inv, voucher });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// VOUCHERS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/vouchers', (req, res) => {
  try {
    const db = readDB();
    const { type, status, initiative, site } = req.query;
    let list = db.vouchers || [];
    if (type && type !== 'All') list = list.filter(v => v.voucherType?.toLowerCase() === type.toLowerCase());
    if (status && status !== 'All') list = list.filter(v => v.tallySyncStatus?.toLowerCase() === status.toLowerCase());
    if (initiative && initiative !== 'All') list = list.filter(v => v.projectName === initiative);
    if (site && site !== 'All') list = list.filter(v => v.siteName === site);
    res.json({ success: true, count: list.length, data: list });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/vouchers', async (req, res) => {
  try {
    const db = readDB();
    const isReceipt = req.body.voucherType?.toLowerCase() === 'receipt';
    const amount = parseFloat(req.body.amount) || 0;
    const count = (db.vouchers || []).length + 1;
    const settings = db.settings || {};
    const prefix = isReceipt ? (settings.numberingSeries?.receipt || 'REC/25-26/') : (settings.numberingSeries?.payment || 'PAY/25-26/');
    const voucherNumber = req.body.voucherNumber || prefix + String(count).padStart(4, '0');
    const idKey = 'VCH-' + (isReceipt ? 'REC' : 'PAY') + '-' + Date.now().toString(36).toUpperCase();

    const initiatives = db.initiatives || db.projects || [];
    const projectName = req.body.projectName || '36 Govt-Aided Schools Sanitation & Food-Beverage Infrastructure';
    const initObj = initiatives.find(i => i.title === projectName);
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
      tallySyncStatus: 'pending',
      tallySyncedAt: null,
      tallyResponse: null,
      idempotencyKey: idKey,
      retryCount: 0,
    };

    if (isReceipt) {
      newVoucher.donorName = req.body.donorName || 'Anonymous Donor';
      newVoucher.donorPan = req.body.donorPan || '';
      newVoucher.donorAddress = req.body.donorAddress || 'Tamil Nadu';
      newVoucher.donorPhone = req.body.donorPhone || '';
      newVoucher.donorEmail = req.body.donorEmail || '';
      newVoucher.creditLedger = req.body.creditLedger || 'Donations Received (80G)';
      newVoucher.exemption80G = true;
      const bankLedger = (db.ledgerMasters || []).find(l => l.name === newVoucher.bankOrCashLedger);
      if (bankLedger) bankLedger.currentBalance = (bankLedger.currentBalance || 0) + amount;
      const donLedger = (db.ledgerMasters || []).find(l => l.name === newVoucher.creditLedger);
      if (donLedger) donLedger.currentBalance = (donLedger.currentBalance || 0) + amount;
      if (initObj) initObj.mobilizedFunds = (initObj.mobilizedFunds || 0) + amount;
    } else {
      newVoucher.payeeName = req.body.payeeName || 'Vendor';
      newVoucher.invoiceNumber = req.body.invoiceNumber || 'INV-' + Date.now().toString().slice(-4);
      newVoucher.expenseOrVendorLedger = req.body.expenseOrVendorLedger || 'School Sanitation Project Exp';
      const bankLedger = (db.ledgerMasters || []).find(l => l.name === newVoucher.bankOrCashLedger);
      if (bankLedger) bankLedger.currentBalance = (bankLedger.currentBalance || 0) - amount;
      if (initObj) initObj.totalSpent = (initObj.totalSpent || 0) + amount;
      if (newVoucher.siteName && newVoucher.siteName !== 'Multiple Sites Allocation') {
        const site = (db.sites || []).find(s => s.schoolName === newVoucher.siteName);
        if (site) {
          site.spentAmount = (site.spentAmount || 0) + amount;
          if (site.allocatedBudget > 0) site.progressPercentage = Math.min(100, Math.round((site.spentAmount / site.allocatedBudget) * 100));
        }
      }
    }

    if (!db.vouchers) db.vouchers = [];
    db.vouchers.unshift(newVoucher);

    // Add to sync queue
    const config = db.tallyConfig || {};
    syncQueueSvc.enqueue(db, newVoucher.id, newVoucher.voucherNumber);

    addAuditLog(db, null, 'Staff', 'CREATE', 'voucher', newVoucher.id, `New ${newVoucher.voucherType}: ₹${amount}`);
    writeDB(db);

    // Process queue immediately
    try { await syncQueueSvc.processQueue(db, config, buildVoucherXml, writeDB); } catch (e) {}

    res.status(201).json({ success: true, data: newVoucher });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/api/vouchers/:id', authMiddleware, requireRole('Admin', 'Accountant'), (req, res) => {
  try {
    const db = readDB();
    const idx = (db.vouchers || []).findIndex(v => v.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Voucher not found' });
    const v = db.vouchers[idx];
    if (v.tallySyncStatus === 'synced') return res.status(400).json({ success: false, error: 'Cannot delete a synced voucher. Create a reversal entry instead.' });
    const removed = db.vouchers.splice(idx, 1)[0];
    addAuditLog(db, req.user?.id, req.user?.name, 'DELETE', 'voucher', req.params.id, `Deleted voucher ${removed.voucherNumber}`);
    writeDB(db);
    res.json({ success: true, data: removed });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PDF Receipt endpoint
app.get('/api/vouchers/:id/receipt-pdf', async (req, res) => {
  try {
    const db = readDB();
    const voucher = (db.vouchers || []).find(v => v.id === req.params.id);
    if (!voucher) return res.status(404).json({ success: false, error: 'Voucher not found' });
    if (!pdfGenerator) return res.status(503).json({ success: false, error: 'PDF generation not available' });
    const pdfBuffer = await pdfGenerator.generateDonationReceipt(voucher, db.trustInfo);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="receipt-${voucher.voucherNumber}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Invoice PDF
app.get('/api/invoices/:id/pdf', async (req, res) => {
  try {
    const db = readDB();
    const invoice = (db.invoices || []).find(i => i.id === req.params.id);
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });
    if (!pdfGenerator) return res.status(503).json({ success: false, error: 'PDF generation not available' });
    const pdfBuffer = await pdfGenerator.generateInvoicePdf(invoice, db.trustInfo);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TALLY INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/tally/config', (req, res) => {
  try { const db = readDB(); res.json({ success: true, data: db.tallyConfig }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/tally/config', authMiddleware, requireRole('Admin', 'Accountant'), (req, res) => {
  try {
    const db = readDB();
    db.tallyConfig = { ...db.tallyConfig, ...req.body };
    addAuditLog(db, req.user?.id, req.user?.name, 'UPDATE', 'tallyConfig', 'singleton', 'Updated Tally config');
    writeDB(db);
    res.json({ success: true, data: db.tallyConfig });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/tally/config', authMiddleware, requireRole('Admin', 'Accountant'), (req, res) => {
  try {
    const db = readDB();
    db.tallyConfig = { ...db.tallyConfig, ...req.body };
    writeDB(db);
    res.json({ success: true, data: db.tallyConfig });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/tally/status', async (req, res) => {
  try {
    const db = readDB();
    const config = db.tallyConfig || { host: '127.0.0.1', port: 9000, mockMode: true };
    const pingXml = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Data</TYPE><ID>List of Companies</ID></HEADER><BODY><DESC></DESC></BODY></ENVELOPE>`;
    try {
      const tallyResponse = await syncQueueSvc.postXmlToTally(pingXml, config.host, config.port);
      return res.json({ success: true, online: true, mockMode: config.mockMode, endpoint: `http://${config.host}:${config.port}`, company: config.companyName, lastSynced: new Date().toISOString(), message: 'TallyPrime XML Server connected successfully on Port 9000.', rawResponse: tallyResponse.body?.slice(0, 300) });
    } catch (netErr) {
      return res.json({ success: true, online: false, mockMode: config.mockMode, endpoint: `http://${config.host}:${config.port}`, company: config.companyName, message: 'Tally not reachable. Running in offline mode.', error: netErr.message });
    }
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/tally/xml/:voucherId', (req, res) => {
  try {
    const db = readDB();
    const voucher = (db.vouchers || []).find(v => v.id === req.params.voucherId);
    if (!voucher) return res.status(404).json({ success: false, error: 'Voucher not found' });
    const xml = buildVoucherXml(voucher, db.tallyConfig?.companyName || 'ARUTPERUNJOTHI SEVA TRUST');
    res.setHeader('Content-Type', 'text/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${(voucher.voucherNumber || '').replace(/[\/\\]/g,'_')}_tally.xml"`);
    res.send(xml);
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/tally/sync-voucher/:voucherId', async (req, res) => {
  try {
    const db = readDB();
    const vIdx = (db.vouchers || []).findIndex(v => v.id === req.params.voucherId);
    if (vIdx === -1) return res.status(404).json({ success: false, error: 'Voucher not found' });
    const voucher = db.vouchers[vIdx];
    const config = db.tallyConfig || {};
    const xmlPayload = buildVoucherXml(voucher, config.companyName);
    let syncResult = { success: false, mode: 'live', detail: '' };
    try {
      const tallyRes = await syncQueueSvc.postXmlToTally(xmlPayload, config.host, config.port);
      voucher.tallySyncStatus = 'synced';
      voucher.tallySyncedAt = new Date().toISOString();
      voucher.tallyResponse = `Synced to Tally (Port ${config.port})`;
      syncResult = { success: true, mode: config.mockMode ? 'mock' : 'live', detail: voucher.tallyResponse };
    } catch (err) {
      voucher.tallySyncStatus = 'failed';
      voucher.tallyResponse = `Sync failed: ${err.message}`;
      syncResult = { success: false, mode: 'live', detail: voucher.tallyResponse };
    }
    if (!db.syncLogs) db.syncLogs = [];
    db.syncLogs.unshift({ id: 'LOG-' + Date.now().toString(36).toUpperCase(), voucherId: voucher.id, voucherNumber: voucher.voucherNumber, timestamp: new Date().toISOString(), mode: config.mockMode ? 'mock' : 'live', status: syncResult.success ? 'SUCCESS' : 'FAILED', tallyPort: config.port || 9000, detail: syncResult.detail });
    db.vouchers[vIdx] = voucher;
    writeDB(db);
    res.json({ success: true, voucher, syncResult, xmlPayload });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/tally/sync-all', async (req, res) => {
  try {
    const db = readDB();
    const config = db.tallyConfig || {};
    const results = await syncQueueSvc.processQueue(db, config, buildVoucherXml, writeDB);
    
    // Also immediately try all pending vouchers
    const pendingVouchers = (db.vouchers || []).filter(v => v.tallySyncStatus === 'pending' || v.tallySyncStatus === 'failed');
    let syncedCount = 0;
    for (const v of pendingVouchers) {
      try {
        const xml = buildVoucherXml(v, config.companyName);
        await syncQueueSvc.postXmlToTally(xml, config.host, config.port);
        v.tallySyncStatus = 'synced';
        v.tallySyncedAt = new Date().toISOString();
        v.tallyResponse = `Batch synced at ${new Date().toLocaleString()}`;
        syncedCount++;
        if (!db.syncLogs) db.syncLogs = [];
        db.syncLogs.unshift({ id: 'LOG-' + Math.random().toString(36).slice(2).toUpperCase(), voucherId: v.id, voucherNumber: v.voucherNumber, timestamp: new Date().toISOString(), mode: config.mockMode ? 'mock' : 'live', status: 'SUCCESS', tallyPort: config.port || 9000, detail: `Batch sync: ${v.voucherNumber}` });
      } catch (e) {
        v.tallySyncStatus = 'failed';
        v.tallyResponse = `Sync failed: ${e.message}`;
      }
    }
    writeDB(db);
    res.json({ success: true, message: `Sync complete. ${syncedCount} vouchers synchronized.`, syncedCount, queueResults: results });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/tally/pull-ledgers', authMiddleware, async (req, res) => {
  try {
    const db = readDB();
    // Simulate pulling ledgers from Tally (mock)
    const tallyLedgers = [
      { name: 'HDFC Bank A/c', group: 'Bank Accounts', balance: 5500000 },
      { name: 'Cash in Hand', group: 'Cash-in-Hand', balance: 82500 },
      { name: 'Donations Received (80G)', group: 'Capital Account', balance: 4250000 },
      { name: 'CSR Corpus Grants (80G)', group: 'Capital Account', balance: 6500000 },
      { name: 'School Sanitation Project Exp', group: 'Direct Expenses', balance: 3950000 },
    ];
    if (!db.syncLogs) db.syncLogs = [];
    db.syncLogs.unshift({ id: 'LOG-PULL-' + Date.now().toString(36).toUpperCase(), voucherId: '', voucherNumber: 'PULL-LEDGERS', timestamp: new Date().toISOString(), mode: 'pull', status: 'SUCCESS', tallyPort: db.tallyConfig?.port || 9000, detail: `Pulled ${tallyLedgers.length} ledgers from Tally` });
    addAuditLog(db, req.user?.id, req.user?.name, 'PULL', 'ledgers', 'tally', `Pulled ${tallyLedgers.length} ledgers from Tally`);
    writeDB(db);
    res.json({ success: true, data: tallyLedgers, message: `Pulled ${tallyLedgers.length} ledgers from Tally` });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/tally/launch-installer', (req, res) => {
  try {
    const version = req.body?.version || 'prime';
    const installerPath = path.join(INSTALLER_DIR, version === 'erp9' ? 'setup-tally-erp9.exe' : 'setup-tallyprime.exe');
    if (fs.existsSync(installerPath)) { exec(`start "" "${installerPath}"`); res.json({ success: true, message: 'Installer launched' }); }
    else res.status(404).json({ success: false, message: 'Installer not found' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/tally/virtual-screen', (req, res) => {
  try {
    const db = readDB();
    const initiatives = db.initiatives || db.projects || [];
    const dayBook = (db.vouchers || []).map(v => ({
      date: v.date, particulars: v.voucherType === 'Receipt' ? v.donorName : v.payeeName, vchType: v.voucherType, vchNo: v.voucherNumber,
      debit: v.voucherType === 'Payment' ? v.amount : null, credit: v.voucherType === 'Receipt' ? v.amount : null, narration: v.narration
    }));
    const costCentres = initiatives.map(init => ({
      category: init.tallyCostCategory || `${init.title.slice(0, 20)} Projects`,
      budget: init.totalBudget, spent: init.totalSpent, balance: init.totalBudget - init.totalSpent,
      subCentres: (db.sites || []).filter(s => init.title.includes('36') || s.initiativeId === init.id).slice(0, 8).map(s => ({ name: s.schoolName, spent: s.spentAmount }))
    }));
    const hdfcBank = (db.ledgerMasters || []).find(l => l.name === 'HDFC Bank A/c')?.currentBalance || 5500000;
    const cash = (db.ledgerMasters || []).find(l => l.name === 'Cash in Hand')?.currentBalance || 82500;
    const donations = (db.ledgerMasters || []).find(l => l.name === 'Donations Received (80G)')?.currentBalance || 4250000;
    const corpus = (db.ledgerMasters || []).find(l => l.name === 'CSR Corpus Grants (80G)')?.currentBalance || 6500000;
    const siteExp = (db.ledgerMasters || []).find(l => l.name === 'School Sanitation Project Exp')?.currentBalance || 3950000;
    res.json({ success: true, data: { companyName: db.tallyConfig?.companyName, currentPeriod: '1-Apr-2025 to 31-Mar-2026', currentDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), dayBook, costCentres, balanceSheet: { liabilities: [{ group: 'Capital / Corpus Fund', amount: corpus }, { group: 'Earmarked Project Reserves', amount: donations }], assets: [{ group: 'Sanitation & School Assets Work-in-Progress', amount: siteExp }, { group: 'Bank Accounts (HDFC Bank)', amount: hdfcBank }, { group: 'Cash-in-Hand', amount: cash }] } } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// LEDGERS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/ledgers', (req, res) => {
  try { const db = readDB(); res.json({ success: true, data: db.ledgerMasters || [] }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/ledgers', authMiddleware, requireRole('Admin', 'Accountant'), (req, res) => {
  try {
    const db = readDB();
    if (!db.ledgerMasters) db.ledgerMasters = [];
    const newLedger = { name: req.body.name, group: req.body.group || 'Direct Expenses', tallyType: 'Ledger', openingBalance: parseFloat(req.body.openingBalance) || 0, currentBalance: parseFloat(req.body.currentBalance) || 0 };
    db.ledgerMasters.push(newLedger);
    writeDB(db);
    res.json({ success: true, data: newLedger });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// STATS & DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/stats', (req, res) => {
  try {
    const db = readDB();
    const initiatives = db.initiatives || db.projects || [];
    const receipts = (db.vouchers || []).filter(v => v.voucherType?.toLowerCase() === 'receipt');
    const payments = (db.vouchers || []).filter(v => v.voucherType?.toLowerCase() === 'payment');
    const totalMobilized = receipts.reduce((s, v) => s + (parseFloat(v.amount) || 0), 0);
    const totalDisbursed = payments.reduce((s, v) => s + (parseFloat(v.amount) || 0), 0);
    const syncedCount = (db.vouchers || []).filter(v => v.tallySyncStatus === 'synced').length;
    const pendingCount = (db.vouchers || []).filter(v => v.tallySyncStatus === 'pending' || v.tallySyncStatus === 'failed').length;
    const hdfc = (db.ledgerMasters || []).find(l => l.name === 'HDFC Bank A/c')?.currentBalance || 0;
    const cash = (db.ledgerMasters || []).find(l => l.name === 'Cash in Hand')?.currentBalance || 0;
    const totalSites = (db.sites || []).length;
    const completedSites = (db.sites || []).filter(s => s.status?.toLowerCase() === 'completed').length;
    const inProgressSites = (db.sites || []).filter(s => s.status?.toLowerCase() === 'in progress').length;
    const totalAllocatedBudget = (db.sites || []).reduce((s, site) => s + (parseFloat(site.allocatedBudget) || 0), 0);
    const totalSiteSpent = (db.sites || []).reduce((s, site) => s + (parseFloat(site.spentAmount) || 0), 0);
    res.json({ success: true, data: {
      financials: { totalMobilized, totalDisbursed, netReserve: totalMobilized - totalDisbursed, hdfcBankBalance: hdfc, cashInHandBalance: cash },
      initiatives: { totalCount: initiatives.length, activeCount: initiatives.filter(i => i.status === 'Active').length, totalBudget: initiatives.reduce((s, i) => s + (parseFloat(i.totalBudget) || 0), 0), totalMobilized: initiatives.reduce((s, i) => s + (parseFloat(i.mobilizedFunds) || 0), 0), totalSpent: initiatives.reduce((s, i) => s + (parseFloat(i.totalSpent) || 0), 0) },
      sites: { totalSites, completedSites, inProgressSites, totalAllocatedBudget, totalSiteSpent, completionRate: Math.round((completedSites / (totalSites || 1)) * 100) },
      tally: { totalVouchers: (db.vouchers || []).length, syncedCount, pendingCount, syncHealthPercentage: Math.round((syncedCount / Math.max((db.vouchers || []).length, 1)) * 100), autoSync: db.tallyConfig?.autoSync, mockMode: db.tallyConfig?.mockMode, port: db.tallyConfig?.port },
      trustInfo: { name: db.trustInfo?.name, regNumber: db.trustInfo?.regNumber, exemptions: db.trustInfo?.exemptions },
      donors: { total: (db.donors || []).length, totalDonated: (db.donors || []).reduce((s, d) => s + (d.totalDonated || 0), 0) },
      expenses: { total: (db.expenses || []).length, pending: (db.expenses || []).filter(e => e.approvalStatus === 'Pending').length, approved: (db.expenses || []).filter(e => e.approvalStatus === 'Approved').length },
    }});
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/reports/daybook', (req, res) => {
  try {
    const db = readDB();
    const { startDate, endDate } = req.query;
    let vouchers = db.vouchers || [];
    if (startDate) vouchers = vouchers.filter(v => v.date >= startDate);
    if (endDate) vouchers = vouchers.filter(v => v.date <= endDate);
    const totalDebit = vouchers.filter(v => v.voucherType === 'Payment').reduce((s, v) => s + v.amount, 0);
    const totalCredit = vouchers.filter(v => v.voucherType === 'Receipt').reduce((s, v) => s + v.amount, 0);
    res.json({ success: true, data: { vouchers: vouchers.map(v => ({ date: v.date, particulars: v.voucherType === 'Receipt' ? v.donorName || 'Donor' : v.payeeName || 'Vendor', voucherType: v.voucherType, voucherNumber: v.voucherNumber, debit: v.voucherType === 'Payment' ? v.amount : null, credit: v.voucherType === 'Receipt' ? v.amount : null, narration: v.narration, tallySyncStatus: v.tallySyncStatus })), totalDebit, totalCredit, netBalance: totalCredit - totalDebit } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/reports/trial-balance', (req, res) => {
  try {
    const db = readDB();
    const ledgers = db.ledgerMasters || [];
    const isDebitGroup = (grp) => ['Bank Accounts', 'Cash-in-Hand', 'Direct Expenses', 'Indirect Expenses', 'Current Assets', 'Fixed Assets'].includes(grp);
    const rows = ledgers.map(l => {
      const isDr = isDebitGroup(l.group);
      const val = Math.abs(l.currentBalance || 0);
      return {
        name: l.name, group: l.group,
        openingBalance: l.openingBalance || 0,
        debit: isDr ? val : 0,
        credit: !isDr ? val : 0,
        closingBalance: val,
      };
    });
    const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
    const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
    res.json({ success: true, data: { rows, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 1 } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/reports/income-expenditure', (req, res) => {
  try {
    const db = readDB();
    const vouchers = db.vouchers || [];
    // Group by month
    const months = {};
    vouchers.forEach(v => {
      const m = (v.date || '').slice(0, 7);
      if (!months[m]) months[m] = { month: m, income: 0, expenditure: 0 };
      if (v.voucherType === 'Receipt') months[m].income += parseFloat(v.amount) || 0;
      else months[m].expenditure += parseFloat(v.amount) || 0;
    });
    const rows = Object.values(months).sort((a, b) => a.month.localeCompare(b.month));
    const totalIncome = rows.reduce((s, r) => s + r.income, 0);
    const totalExpenditure = rows.reduce((s, r) => s + r.expenditure, 0);
    res.json({ success: true, data: { rows, totalIncome, totalExpenditure, surplus: totalIncome - totalExpenditure } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/reports/project-wise', (req, res) => {
  try {
    const db = readDB();
    const initiatives = db.initiatives || db.projects || [];
    const rows = initiatives.map(i => ({
      id: i.id, name: i.title, category: i.category,
      budget: i.totalBudget, mobilized: i.mobilizedFunds, spent: i.totalSpent,
      balance: i.totalBudget - i.totalSpent,
      utilizationPct: i.totalBudget > 0 ? Math.round((i.totalSpent / i.totalBudget) * 100) : 0
    }));
    res.json({ success: true, data: { rows, totals: { budget: rows.reduce((s, r) => s + r.budget, 0), mobilized: rows.reduce((s, r) => s + r.mobilized, 0), spent: rows.reduce((s, r) => s + r.spent, 0) } } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/reports/site-wise', (req, res) => {
  try {
    const db = readDB();
    const sites = db.sites || [];
    const rows = sites.map(s => ({
      id: s.id, name: s.schoolName, district: s.district,
      allocated: s.allocatedBudget, spent: s.spentAmount,
      balance: s.allocatedBudget - s.spentAmount,
      progress: s.progressPercentage, status: s.status
    }));
    res.json({ success: true, data: { rows, totals: { allocated: rows.reduce((s, r) => s + r.allocated, 0), spent: rows.reduce((s, r) => s + r.spent, 0) } } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/reports/donor-statement/:donorId', (req, res) => {
  try {
    const db = readDB();
    const donor = (db.donors || []).find(d => d.id === req.params.donorId);
    if (!donor) return res.status(404).json({ success: false, error: 'Donor not found' });
    const donations = (db.vouchers || []).filter(v => v.voucherType === 'Receipt' && (v.donorName === donor.name || v.donorId === donor.id));
    const totalDonated = donations.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
    res.json({ success: true, data: { donor, donations: donations.map(d => ({ date: d.date, voucherNumber: d.voucherNumber, amount: d.amount, mode: d.paymentMode, project: d.projectName, site: d.siteName, tallySyncStatus: d.tallySyncStatus })), totalDonated, donationCount: donations.length } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CHARTS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/charts/monthly-flow', (req, res) => {
  try {
    const db = readDB();
    const vouchers = db.vouchers || [];
    const months = {};
    // Last 12 months
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7);
      months[key] = { month: key, inflow: 0, outflow: 0 };
    }
    vouchers.forEach(v => {
      const m = (v.date || '').slice(0, 7);
      if (months[m]) {
        if (v.voucherType === 'Receipt') months[m].inflow += parseFloat(v.amount) || 0;
        else months[m].outflow += parseFloat(v.amount) || 0;
      }
    });
    res.json({ success: true, data: Object.values(months) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/charts/project-breakdown', (req, res) => {
  try {
    const db = readDB();
    const initiatives = db.initiatives || db.projects || [];
    const data = initiatives.map(i => ({ name: i.title.slice(0, 30), value: i.totalSpent, budget: i.totalBudget }));
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/charts/site-progress', (req, res) => {
  try {
    const db = readDB();
    const sites = (db.sites || []).slice(0, 36).map(s => ({ name: s.schoolName, progress: s.progressPercentage, status: s.status, district: s.district }));
    res.json({ success: true, data: sites });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SYNC QUEUE
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/sync-queue', (req, res) => {
  try { const db = readDB(); res.json({ success: true, data: db.syncQueue || [] }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/sync-queue/process', async (req, res) => {
  try {
    const db = readDB();
    const config = db.tallyConfig || {};
    const results = await syncQueueSvc.processQueue(db, config, buildVoucherXml, writeDB);
    res.json({ success: true, results });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/sync-queue/:id/retry', async (req, res) => {
  try {
    const db = readDB();
    const config = db.tallyConfig || {};
    const results = await syncQueueSvc.retryItem(db, req.params.id, config, buildVoucherXml, writeDB);
    res.json({ success: true, results });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/api/sync-queue/:id', authMiddleware, requireRole('Admin'), (req, res) => {
  try {
    const db = readDB();
    const idx = (db.syncQueue || []).findIndex(q => q.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Queue item not found' });
    db.syncQueue.splice(idx, 1);
    writeDB(db);
    res.json({ success: true, message: 'Removed from queue' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SYNC LOGS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/sync-logs', (req, res) => {
  try { const db = readDB(); res.json({ success: true, data: db.syncLogs || [] }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/audit-log', authMiddleware, (req, res) => {
  try {
    const db = readDB();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const logs = db.auditLog || [];
    const total = logs.length;
    const paginated = logs.slice((page - 1) * limit, page * limit);
    res.json({ success: true, data: paginated, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/settings', (req, res) => {
  try { const db = readDB(); res.json({ success: true, data: db.settings || {} }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/settings', authMiddleware, requireRole('Admin'), (req, res) => {
  try {
    const db = readDB();
    db.settings = { ...db.settings, ...req.body };
    addAuditLog(db, req.user?.id, req.user?.name, 'UPDATE', 'settings', 'singleton', 'Updated settings');
    writeDB(db);
    res.json({ success: true, data: db.settings });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SERVE STATIC CLIENT BUILD IN PRODUCTION
// ═══════════════════════════════════════════════════════════════════════════════
const clientDist = fs.existsSync(path.join(__dirname, 'public')) 
  ? path.join(__dirname, 'public') 
  : path.join(__dirname, '..', 'client', 'dist');

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════════════════════

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Trust ERP Server v2 running on http://0.0.0.0:${PORT}`);
  startMockTallyServer();
  console.log(`📡 Mock Tally target: http://127.0.0.1:${TALLY_PORT}`);
  console.log(`\n👤 Demo credentials:`);
  console.log(`   Admin:      admin@trust.org / Admin123`);
  console.log(`   Accountant: accountant@trust.org / Account123`);
  console.log(`   Manager:    manager@trust.org / Manager123`);
  console.log(`   Viewer:     viewer@trust.org / View123\n`);
});
