/**
 * PDF Generator — server-side PDF generation for:
 * - 80G Tax Exemption Receipts
 * - Expense payment receipts
 * - Invoices with GST breakdown
 *
 * Returns a Buffer that can be sent as a file download.
 * Assumption: pdfkit is installed (npm install pdfkit).
 */

const PDFDocument = require('pdfkit');

/** Format number as Indian currency string */
function formatINR(amount) {
  return '₹' + parseFloat(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Format date to DD-MMM-YYYY */
function formatDate(dateStr) {
  if (!dateStr) return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Generate an 80G Tax Exemption Donation Receipt PDF
 * @param {Object} voucher - the donation/receipt voucher
 * @param {Object} trustInfo - trust details
 * @returns {Promise<Buffer>} PDF buffer
 */
function generateDonationReceipt(voucher, trustInfo) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ─── Header ───────────────────────────────────────────────────
    doc.rect(50, 40, 495, 120).fill('#0f172a');
    doc.fillColor('#10b981').fontSize(20).font('Helvetica-Bold')
      .text(trustInfo?.name || 'ARUTPERUNJOTHI SEVA CHARITABLE TRUST', 70, 55, { width: 455, align: 'center' });
    doc.fillColor('#94a3b8').fontSize(9).font('Helvetica')
      .text(trustInfo?.tagline || 'Transforming Rural Education & Community Welfare', 70, 82, { width: 455, align: 'center' });
    doc.fillColor('#64748b').fontSize(8)
      .text(`Reg: ${trustInfo?.regNumber || 'TRUST/ERD/2018/IV-482'} | PAN: ${trustInfo?.panNumber || 'AAATA4892K'} | NITI Aayog: ${trustInfo?.darpanId || 'TN/2021/0284729'}`, 70, 98, { width: 455, align: 'center' });
    doc.fillColor('#94a3b8').fontSize(8)
      .text(`Section 12A: ${trustInfo?.exemptions?.section12A || '—'} | Section 80G: ${trustInfo?.exemptions?.section80G || '—'}`, 70, 113, { width: 455, align: 'center' });
    doc.fillColor('#10b981').fontSize(8)
      .text(`${trustInfo?.registeredOffice || 'Erode, Tamil Nadu'} | ${trustInfo?.phone || ''} | ${trustInfo?.email || ''}`, 70, 128, { width: 455, align: 'center' });

    // ─── Title ────────────────────────────────────────────────────
    doc.fillColor('#0f172a').rect(50, 175, 495, 30).fill();
    doc.fillColor('white').fontSize(13).font('Helvetica-Bold')
      .text('OFFICIAL DONATION RECEIPT — SECTION 80G TAX EXEMPTION', 50, 183, { width: 495, align: 'center' });

    doc.fillColor('#0f172a');
    doc.moveTo(50, 210).lineTo(545, 210).strokeColor('#e2e8f0').stroke();

    // ─── Receipt Details ──────────────────────────────────────────
    const leftX = 60, rightX = 310, startY = 225, lineH = 22;

    const addRow = (label, value, y, color = '#0f172a') => {
      doc.fillColor('#64748b').fontSize(9).font('Helvetica').text(label, leftX, y);
      doc.fillColor(color).fontSize(9).font('Helvetica-Bold').text(String(value || '—'), rightX, y);
    };

    addRow('Receipt Number:', voucher.voucherNumber || '—', startY);
    addRow('Receipt Date:', formatDate(voucher.date), startY + lineH);
    addRow('Donor Name:', voucher.donorName || 'Anonymous', startY + lineH * 2);
    addRow('PAN Number:', voucher.donorPan || 'Not Provided', startY + lineH * 3);
    addRow('Address:', voucher.donorAddress || 'Tamil Nadu, India', startY + lineH * 4);
    addRow('Phone / Email:', `${voucher.donorPhone || '—'} / ${voucher.donorEmail || '—'}`, startY + lineH * 5);
    addRow('Payment Mode:', voucher.paymentMode || 'NEFT / RTGS', startY + lineH * 6);
    addRow('Reference Number:', voucher.referenceNumber || '—', startY + lineH * 7);
    addRow('Project / Fund:', voucher.projectName || 'General Welfare Fund', startY + lineH * 8);
    addRow('Bank / Instrument:', voucher.bankOrCashLedger || 'HDFC Bank A/c', startY + lineH * 9);

    // ─── Amount Box ───────────────────────────────────────────────
    const amtY = startY + lineH * 11;
    doc.rect(leftX, amtY, 474, 50).fill('#f0fdf4').stroke('#16a34a');
    doc.fillColor('#15803d').fontSize(12).font('Helvetica-Bold')
      .text('DONATION AMOUNT', leftX + 10, amtY + 8);
    doc.fillColor('#0f172a').fontSize(22).font('Helvetica-Bold')
      .text(formatINR(voucher.amount), leftX + 10, amtY + 22);
    doc.fillColor('#374151').fontSize(9).font('Helvetica')
      .text(`(${amountInWords(parseFloat(voucher.amount || 0))} Only)`, leftX + 180, amtY + 28);

    // ─── 80G Declaration ──────────────────────────────────────────
    const declY = amtY + 70;
    doc.rect(leftX, declY, 474, 55).fill('#eff6ff').stroke('#3b82f6');
    doc.fillColor('#1d4ed8').fontSize(9).font('Helvetica-Bold')
      .text('SECTION 80G TAX EXEMPTION CERTIFICATE', leftX + 10, declY + 8);
    doc.fillColor('#374151').fontSize(8).font('Helvetica')
      .text(
        `Certified that this donation qualifies for 50% tax deduction under Section 80G of the Income Tax Act, 1961. ` +
        `80G Registration: ${trustInfo?.exemptions?.section80G || 'AAATA4892KF20218'}. ` +
        `Please retain this receipt for your IT filing. The donation has been received and is being utilised solely for charitable purposes.`,
        leftX + 10, declY + 22, { width: 454, align: 'left' }
      );

    // ─── Bank Details ─────────────────────────────────────────────
    const bankY = declY + 70;
    doc.fillColor('#374151').fontSize(9).font('Helvetica-Bold').text('Bank Details for Reference:', leftX, bankY);
    const bank = trustInfo?.bankDetails || {};
    doc.fillColor('#374151').fontSize(8).font('Helvetica')
      .text(`Account: ${bank.accountName || '—'} | A/c No: ${bank.accountNumber || '—'} | Bank: ${bank.bankName || '—'} | IFSC: ${bank.ifscCode || '—'} | UPI: ${bank.upiId || '—'}`,
        leftX, bankY + 14, { width: 474 });

    // ─── Signature ────────────────────────────────────────────────
    const sigY = bankY + 55;
    doc.moveTo(leftX, sigY).lineTo(545, sigY).strokeColor('#e2e8f0').stroke();
    doc.fillColor('#64748b').fontSize(8).font('Helvetica')
      .text('This is a system-generated receipt. For queries, contact: ' + (trustInfo?.email || 'contact@sevacharitabletrust.org'), leftX, sigY + 8);
    doc.fillColor('#0f172a').fontSize(9).font('Helvetica-Bold')
      .text('Authorised Signatory', 400, sigY + 5);
    doc.fillColor('#64748b').fontSize(8).font('Helvetica')
      .text('Managing Trustee / Treasurer', 400, sigY + 18);

    // ─── Footer ───────────────────────────────────────────────────
    doc.rect(50, 770, 495, 25).fill('#0f172a');
    doc.fillColor('#94a3b8').fontSize(7).font('Helvetica')
      .text(`Receipt generated: ${new Date().toLocaleString('en-IN')} | Tally Sync Status: ${voucher.tallySyncStatus || 'Pending'} | Voucher ID: ${voucher.id}`,
        55, 777, { width: 485, align: 'center' });

    doc.end();
  });
}

/**
 * Generate an invoice PDF
 */
function generateInvoicePdf(invoice, trustInfo) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.rect(50, 40, 495, 80).fill('#0f172a');
    doc.fillColor('#10b981').fontSize(18).font('Helvetica-Bold')
      .text(trustInfo?.name || 'ARUTPERUNJOTHI SEVA CHARITABLE TRUST', 70, 52, { width: 455, align: 'center' });
    doc.fillColor('#94a3b8').fontSize(8)
      .text(trustInfo?.registeredOffice || 'Erode, Tamil Nadu', 70, 78, { width: 455, align: 'center' });
    doc.fillColor('#10b981').fontSize(8)
      .text(`GSTIN: ${trustInfo?.gstin || 'N/A'} | PAN: ${trustInfo?.panNumber || 'AAATA4892K'}`, 70, 92, { width: 455, align: 'center' });

    // Invoice Title
    doc.fillColor('#0f172a').rect(50, 135, 495, 28).fill('#f1f5f9').stroke('#e2e8f0');
    doc.fillColor('#0f172a').fontSize(13).font('Helvetica-Bold')
      .text(invoice.type === 'purchase' ? 'PURCHASE BILL' : 'TAX INVOICE', 50, 143, { width: 495, align: 'center' });

    // Invoice Details
    const y = 180;
    doc.fillColor('#374151').fontSize(9).font('Helvetica-Bold').text('Invoice Number:', 60, y);
    doc.font('Helvetica').text(invoice.invoiceNumber || '—', 200, y);
    doc.font('Helvetica-Bold').text('Invoice Date:', 60, y + 18);
    doc.font('Helvetica').text(formatDate(invoice.invoiceDate), 200, y + 18);
    doc.font('Helvetica-Bold').text('Party:', 60, y + 36);
    doc.font('Helvetica').text(invoice.partyName || '—', 200, y + 36);
    doc.font('Helvetica-Bold').text('Status:', 60, y + 54);
    doc.font('Helvetica').text(invoice.status || 'Draft', 200, y + 54);
    doc.font('Helvetica-Bold').text('Due Date:', 60, y + 72);
    doc.font('Helvetica').text(formatDate(invoice.dueDate), 200, y + 72);

    // Line Items Table
    const tY = y + 100;
    doc.rect(50, tY, 495, 22).fill('#0f172a');
    doc.fillColor('white').fontSize(9).font('Helvetica-Bold');
    doc.text('#', 60, tY + 7);
    doc.text('Description', 80, tY + 7);
    doc.text('Qty', 320, tY + 7);
    doc.text('Rate', 360, tY + 7);
    doc.text('Amount', 430, tY + 7);

    let lineY = tY + 25;
    const items = invoice.lineItems || [];
    items.forEach((item, i) => {
      doc.fillColor('#374151').fontSize(9).font('Helvetica');
      if (i % 2 === 0) doc.rect(50, lineY - 3, 495, 20).fill('#f8fafc');
      doc.fillColor('#374151');
      doc.text(String(i + 1), 60, lineY);
      doc.text(item.description || '—', 80, lineY, { width: 230 });
      doc.text(String(item.quantity || 1), 320, lineY);
      doc.text(formatINR(item.rate || 0), 360, lineY);
      doc.text(formatINR(item.amount || 0), 430, lineY);
      lineY += 20;
    });

    // Totals
    lineY += 10;
    doc.moveTo(50, lineY).lineTo(545, lineY).stroke('#e2e8f0');
    lineY += 8;
    doc.fillColor('#374151').fontSize(9).font('Helvetica-Bold').text('Subtotal:', 360, lineY);
    doc.font('Helvetica').text(formatINR(invoice.subtotal || 0), 430, lineY);
    if (invoice.gstAmount > 0) {
      lineY += 16;
      doc.font('Helvetica-Bold').text(`GST (${invoice.gstRate || 18}%):`, 360, lineY);
      doc.font('Helvetica').text(formatINR(invoice.gstAmount || 0), 430, lineY);
    }
    lineY += 16;
    doc.rect(350, lineY - 4, 195, 22).fill('#0f172a');
    doc.fillColor('white').fontSize(11).font('Helvetica-Bold')
      .text('TOTAL:', 360, lineY + 1);
    doc.text(formatINR(invoice.total || 0), 430, lineY + 1);

    // Notes
    lineY += 40;
    if (invoice.notes) {
      doc.fillColor('#374151').fontSize(8).font('Helvetica').text('Notes: ' + invoice.notes, 60, lineY, { width: 474 });
    }

    // Footer
    doc.rect(50, 780, 495, 20).fill('#0f172a');
    doc.fillColor('#94a3b8').fontSize(7).text(`Invoice ID: ${invoice.id} | Tally Sync: ${invoice.tallySyncStatus || 'Pending'} | Generated: ${new Date().toLocaleString()}`, 55, 786, { width: 485, align: 'center' });

    doc.end();
  });
}

/** Simple amount-in-words converter for INR */
function amountInWords(amount) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convert(n) {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convert(n % 100) : '');
    if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + convert(n % 1000) : '');
    if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + convert(n % 100000) : '');
    return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + convert(n % 10000000) : '');
  }

  const intPart = Math.floor(amount);
  const words = convert(intPart) || 'Zero';
  return 'Rupees ' + words;
}

module.exports = { generateDonationReceipt, generateInvoicePdf };
