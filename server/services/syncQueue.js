/**
 * SyncQueue — manages the Tally sync queue with:
 * - Pending / Synced / Failed / Retrying statuses
 * - Exponential backoff (2^attempt * 30s, max 5 attempts)
 * - Idempotency via unique key embedded in voucher GUID field
 * - Human-readable error classification
 */

const http = require('http');

const MAX_ATTEMPTS = 5;
const BASE_RETRY_SECONDS = 30;

/** Classify a Tally error response into a human-readable message */
function classifyTallyError(responseBody, networkErr) {
  if (networkErr) {
    if (networkErr.code === 'ECONNREFUSED') return 'Tally is not running or port 9000 is blocked';
    if (networkErr.code === 'ETIMEDOUT' || networkErr.message?.includes('timeout')) return 'Connection to Tally timed out';
    return `Network error: ${networkErr.message}`;
  }
  if (!responseBody) return 'Empty response from Tally';
  const body = String(responseBody);
  if (body.includes('CREATED>0') || body.includes('ALTERED>0')) return 'Voucher already exists in Tally (idempotency check passed)';
  if (body.includes('Ledger') && body.includes('not found')) return 'Ledger not found in Tally — create the ledger first or enable auto-create';
  if (body.includes('outside')) return 'Voucher date is outside the current financial year in Tally';
  if (body.includes('unbalanced') || body.includes('Unbalanced')) return 'Voucher entries are unbalanced — debit does not equal credit';
  if (body.includes('Company') && body.includes('not found')) return 'Company name mismatch — check Tally config';
  if (body.includes('STATUS>0') || body.includes('ERRORS>1')) return 'Tally returned an error — check Tally Day Book for details';
  return 'Unknown Tally error — check sync logs for raw response';
}

/** Send XML to Tally HTTP server */
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
      timeout: 5000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Connection to Tally timed out after 5000ms')); });
    req.write(postData);
    req.end();
  });
}

/** Add a new item to the sync queue */
function enqueue(db, voucherId, voucherNumber) {
  if (!db.syncQueue) db.syncQueue = [];
  
  // Prevent duplicate queuing
  const existing = db.syncQueue.find(q => q.voucherId === voucherId);
  if (existing) return existing;

  const entry = {
    id: 'SQ-' + Date.now().toString(36).toUpperCase(),
    voucherId,
    voucherNumber,
    status: 'pending',
    attempts: 0,
    nextRetryAt: new Date().toISOString(),
    lastError: null,
    createdAt: new Date().toISOString(),
  };
  db.syncQueue.push(entry);
  return entry;
}

/** Process the queue — sync all pending/retrying items */
async function processQueue(db, tallyConfig, buildXmlFn, writeDB) {
  if (!db.syncQueue) db.syncQueue = [];
  const now = new Date();
  
  const items = db.syncQueue.filter(q => 
    (q.status === 'pending' || q.status === 'retrying') &&
    new Date(q.nextRetryAt) <= now
  );

  const results = { synced: 0, failed: 0, skipped: 0 };

  for (const qItem of items) {
    const voucher = (db.vouchers || []).find(v => v.id === qItem.voucherId);
    if (!voucher) {
      qItem.status = 'failed';
      qItem.lastError = 'Voucher not found in database';
      results.failed++;
      continue;
    }

    qItem.attempts++;
    qItem.status = 'retrying';

    try {
      const xmlPayload = buildXmlFn(voucher, tallyConfig.companyName);
      const response = await postXmlToTally(xmlPayload, tallyConfig.host, tallyConfig.port);
      
      // Check for Tally-level errors in XML response
      const body = response.body || '';
      const hasError = body.includes('ERRORS>1') || 
                       (body.includes('STATUS>0') && !body.includes('STATUS>1')) ||
                       (body.includes('CREATED>0') && !body.includes('ALTERED>'));
      
      if (hasError && !body.includes('already')) {
        throw new Error(classifyTallyError(body, null));
      }

      // SUCCESS
      qItem.status = 'synced';
      qItem.lastError = null;
      voucher.tallySyncStatus = 'synced';
      voucher.tallySyncedAt = new Date().toISOString();
      voucher.tallyResponse = `Synced via queue at ${new Date().toLocaleString()}`;
      
      // Add to sync logs
      if (!db.syncLogs) db.syncLogs = [];
      db.syncLogs.unshift({
        id: 'LOG-' + Date.now().toString(36).toUpperCase(),
        voucherId: voucher.id,
        voucherNumber: voucher.voucherNumber,
        timestamp: new Date().toISOString(),
        mode: tallyConfig.mockMode ? 'mock' : 'live',
        status: 'SUCCESS',
        tallyPort: tallyConfig.port,
        detail: `Queue sync successful (attempt ${qItem.attempts})`,
      });
      results.synced++;

    } catch (err) {
      const errorMsg = classifyTallyError(null, err);
      qItem.lastError = errorMsg;

      if (qItem.attempts >= MAX_ATTEMPTS) {
        qItem.status = 'failed';
        voucher.tallySyncStatus = 'failed';
        voucher.tallyResponse = `Failed after ${MAX_ATTEMPTS} attempts: ${errorMsg}`;
        
        if (!db.syncLogs) db.syncLogs = [];
        db.syncLogs.unshift({
          id: 'LOG-' + Date.now().toString(36).toUpperCase(),
          voucherId: voucher.id,
          voucherNumber: voucher.voucherNumber,
          timestamp: new Date().toISOString(),
          mode: tallyConfig.mockMode ? 'mock' : 'live',
          status: 'FAILED',
          tallyPort: tallyConfig.port,
          detail: `Failed after ${MAX_ATTEMPTS} attempts: ${errorMsg}`,
        });
        results.failed++;
      } else {
        // Exponential backoff
        const backoffSeconds = Math.pow(2, qItem.attempts) * BASE_RETRY_SECONDS;
        qItem.nextRetryAt = new Date(Date.now() + backoffSeconds * 1000).toISOString();
        qItem.status = 'retrying';
        results.skipped++;
      }
    }
  }

  writeDB(db);
  return results;
}

/** Manually retry a specific failed item */
async function retryItem(db, queueId, tallyConfig, buildXmlFn, writeDB) {
  const qItem = (db.syncQueue || []).find(q => q.id === queueId);
  if (!qItem) throw new Error('Queue item not found');
  
  qItem.status = 'pending';
  qItem.attempts = 0;
  qItem.nextRetryAt = new Date().toISOString();
  qItem.lastError = null;
  
  return processQueue(db, tallyConfig, buildXmlFn, writeDB);
}

module.exports = { enqueue, processQueue, retryItem, postXmlToTally, classifyTallyError };
