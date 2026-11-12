/**
 * seed-enrichment.js
 * Enriches database.json with:
 * - 4 users with verified bcrypt hashes
 * - 20 donors (realistic Tamil names, PAN, contact, donations count/total)
 * - 10 vendors (Civil, Plumbing, Electrical, Materials, Catering)
 * - 60 expenses (with approval status: Pending, Approved, Rejected, linked to projects & sites)
 * - 10 sample invoices (Sales/Purchase with line items and GST)
 * - 5 syncQueue items (Pending, Retrying, Failed, Synced)
 * - 25 auditLog entries
 * - settings object
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.json');
const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));

// 1. Users
db.users = [
  {
    id: 'USR-001',
    name: 'Dr. K. Ramanathan, M.S.',
    email: 'admin@trust.org',
    passwordHash: '$2b$12$d9kvD6/E5jPdu3D26vVlZu41uI172VsBwIjp74cqEZ6J7LXX.DFhO', // Admin123
    role: 'Admin',
    designation: 'Managing Trustee & Administrator',
    active: true,
    createdAt: '2025-04-01T09:00:00Z',
    lastLogin: new Date().toISOString()
  },
  {
    id: 'USR-002',
    name: 'Mrs. S. Meenakshi, M.A.',
    email: 'accountant@trust.org',
    passwordHash: '$2b$12$.WtN8snbjTN1MSmJaRuf7O8Oikzl4HNaIZV0kACPkqhCp/u2Sls4C', // Account123
    role: 'Accountant',
    designation: 'Chief Accounts Officer & Treasurer',
    active: true,
    createdAt: '2025-04-01T09:30:00Z',
    lastLogin: new Date().toISOString()
  },
  {
    id: 'USR-003',
    name: 'Er. P. Shanmugam, B.E.',
    email: 'manager@trust.org',
    passwordHash: '$2b$12$Xc.lx103PiJAOl2DGNlqQeUlAqsUEKGLF0oA0thbZ7r1vHJROqMwO', // Manager123
    role: 'ProjectManager',
    designation: 'Senior Infrastructure Project Lead',
    active: true,
    createdAt: '2025-04-02T10:00:00Z',
    lastLogin: new Date().toISOString()
  },
  {
    id: 'USR-004',
    name: 'Adv. R. Venkataraman',
    email: 'viewer@trust.org',
    passwordHash: '$2b$12$Llp4eW8ovYPPo8CaeAfwnuoEoGz9bLN8Wby08Xs5IccknfmqSNvKm', // View123
    role: 'Viewer',
    designation: 'Statutory Auditor & Legal Reviewer',
    active: true,
    createdAt: '2025-04-05T11:00:00Z',
    lastLogin: new Date().toISOString()
  }
];

// 2. Settings
db.settings = {
  trustName: db.trustInfo?.name || 'ARUTPERUNJOTHI SEVA CHARITABLE TRUST',
  financialYear: '2025-26',
  booksBeginningDate: '2025-04-01',
  currency: 'INR (₹)',
  numberingSeries: {
    receipt: 'REC/25-26/',
    payment: 'PAY/25-26/',
    invoice: 'INV/25-26/',
    journal: 'JRN/25-26/'
  },
  tallyAutoSync: true,
  enableCostCenterEnforcement: true,
  autoCreateMissingLedgers: true,
  backupEnabled: true,
  theme: 'dark'
};

// 3. Donors (20 realistic donors)
const donorNames = [
  { name: 'Dr. Annamalai Krishnan', email: 'annamalai.k@gmail.com', phone: '+91 94431 82910', pan: 'AAEPK8921B', city: 'Erode', amount: 500000, count: 5 },
  { name: 'Mrs. Kavitha Rajendran', email: 'kavitha.raj@outlook.com', phone: '+91 98422 10452', pan: 'BCUPK7129A', city: 'Salem', amount: 350000, count: 4 },
  { name: 'Er. Senthil Kumar V.', email: 'senthil.infra@yahoo.com', phone: '+91 94420 33819', pan: 'AHSPK9481C', city: 'Coimbatore', amount: 450000, count: 6 },
  { name: 'Sundaram Fasteners CSR Foundation', email: 'csr@sundaramfasteners.com', phone: '+91 44 2852 1100', pan: 'AAACS1902E', city: 'Chennai', amount: 2500000, count: 3 },
  { name: 'Apex Textile Mills Philanthropy Trust', email: 'trust@apextextiles.in', phone: '+91 424 2261900', pan: 'AAATA4412F', city: 'Tirupur', amount: 1800000, count: 2 },
  { name: 'Mr. R. Balasubramanian', email: 'bala.subbu@gmail.com', phone: '+91 97890 41258', pan: 'BKRPB3319L', city: 'Dharmapuri', amount: 150000, count: 3 },
  { name: 'Mrs. Jayanthi Natarajan', email: 'jayanthi.n@rediffmail.com', phone: '+91 94435 90214', pan: 'AWJPN4910K', city: 'Vellore', amount: 200000, count: 2 },
  { name: 'Vasan Eye Care CSR Wing', email: 'giving@vasancare.org', phone: '+91 431 2415900', pan: 'AABCV8190P', city: 'Tiruchirappalli', amount: 750000, count: 3 },
  { name: 'Mr. Murugesan Palanisamy', email: 'muru.palanisamy@gmail.com', phone: '+91 98430 77123', pan: 'BPMPM9012D', city: 'Namakkal', amount: 250000, count: 4 },
  { name: 'Sri Sakthi Educational Society', email: 'srisakthi.trust@gmail.com', phone: '+91 4256 233400', pan: 'AAATS8120M', city: 'Perundurai', amount: 1200000, count: 2 },
  { name: 'Dr. Radhakrishnan Memorial Trust', email: 'rk.trust@education.tn.org', phone: '+91 94422 18902', pan: 'AAATR6192G', city: 'Chennai', amount: 600000, count: 3 },
  { name: 'Mrs. Deepa Karthikeyan', email: 'deepa.karthik@gmail.com', phone: '+91 98941 22849', pan: 'BFEPK4490R', city: 'Krishnagiri', amount: 180000, count: 2 },
  { name: 'Mr. T. Saravanan', email: 'saravanan.t@tcs.com', phone: '+91 97911 88320', pan: 'AWPTS5512N', city: 'Bengaluru', amount: 300000, count: 5 },
  { name: 'Kaveri Basin Farmers Welfare Guild', email: 'kaveri.guild@gmail.com', phone: '+91 4286 220911', pan: 'AAABK7721H', city: 'Karur', amount: 400000, count: 2 },
  { name: 'Kongu Alumni Global Association (USA Chapter)', email: 'kongualumni.usa@gmail.com', phone: '+1 408 555 0192', pan: 'AAATK9910Q', city: 'Global / Erode', amount: 1500000, count: 3 },
  { name: 'Mrs. Lakshmi Narayanan', email: 'lakshmi.n@gmail.com', phone: '+91 94433 71190', pan: 'AWLPN1120T', city: 'Tiruvannamalai', amount: 220000, count: 3 },
  { name: 'Mr. G. Vijayanand', email: 'vijayanand.g@yahoo.com', phone: '+91 98421 99014', pan: 'AMGPV8819S', city: 'Salem', amount: 175000, count: 2 },
  { name: 'Bannari Amman Rural Community Fund', email: 'ruralfund@bannari.com', phone: '+91 4254 222111', pan: 'AAACB1100J', city: 'Sathyamangalam', amount: 2000000, count: 2 },
  { name: 'Dr. Priya Sivakumar, M.D.', email: 'dr.priyas@apollo.org', phone: '+91 94432 09841', pan: 'AAGPS4129X', city: 'Madurai', amount: 350000, count: 4 },
  { name: 'Mr. N. Chandrasekaran', email: 'chandru.n@gmail.com', phone: '+91 98420 11984', pan: 'AHCPN6621K', city: 'Erode', amount: 500000, count: 5 }
];

db.donors = donorNames.map((d, idx) => ({
  id: 'DON-' + String(idx + 1).padStart(4, '0'),
  name: d.name,
  email: d.email,
  phone: d.phone,
  pan: d.pan,
  address: `${d.city}, Tamil Nadu, India`,
  organization: d.name.includes('Trust') || d.name.includes('CSR') || d.name.includes('Mills') || d.name.includes('Association') || d.name.includes('Fund') || d.name.includes('Society') ? d.name : 'Individual Philanthropist',
  totalDonated: d.amount,
  donationCount: d.count,
  createdAt: '2025-04-10T10:00:00Z'
}));

// 4. Vendors (10 vendors)
db.vendors = [
  { id: 'VND-001', name: 'Apex Infra & Plumbing Contractors', gstin: '33AABCA1234F1Z1', address: '12 Trichy Main Road, Salem - 636001', phone: '+91 98421 00111', email: 'contact@apexinfra.in', category: 'Civil & Turnkey Construction' },
  { id: 'VND-002', name: 'Sri Sai Civil & Sanitation Builders', gstin: '33BBXCS5678G1Z4', address: '45 Gandhi Road, Dharmapuri - 636701', phone: '+91 98421 00222', email: 'srisaibuilders@gmail.com', category: 'Civil & Sanitation' },
  { id: 'VND-003', name: 'Kaveri Hardware & Plumbing Supplies', gstin: '33AACKH9910H1Z2', address: '88 Brough Road, Erode - 638001', phone: '+91 424 2251010', email: 'kaverihardware@yahoo.com', category: 'Plumbing Materials' },
  { id: 'VND-004', name: 'UltraTech Cement Authorized Agency', gstin: '33AACCA8811K1Z3', address: 'Plot 4, Industrial Estate, Salem', phone: '+91 94432 18910', email: 'ultratech.salem@agency.in', category: 'Cement & Structural Materials' },
  { id: 'VND-005', name: 'Surya Solar Power Systems', gstin: '33AADCS7722M1Z9', address: '104 Mettur Road, Erode - 638011', phone: '+91 98422 99120', email: 'info@suryasolar.in', category: 'Solar RO & Electrical' },
  { id: 'VND-006', name: 'Green Aqua RO Technologies', gstin: '33AAFCG4412L1Z5', address: '22 Avinashi Road, Coimbatore - 641018', phone: '+91 422 2309110', email: 'greenaqua.tn@gmail.com', category: 'Water Treatment & RO Plants' },
  { id: 'VND-007', name: 'Annapoorna Provision & Grain Traders', gstin: '33AAGCA3321N1Z7', address: '55 Nethaji Daily Market, Erode', phone: '+91 424 2221980', email: 'annapoorna.grains@gmail.com', category: 'Nutrition & Food Supplies' },
  { id: 'VND-008', name: 'Singer Motorized Sewing Machines Dealer', gstin: '33AAECS2219P1Z8', address: '19 Park Road, Erode', phone: '+91 94430 81290', email: 'singer.dealer.erd@gmail.com', category: 'Vocational Equipment' },
  { id: 'VND-009', name: 'Vetri Logistics & Transport Services', gstin: '33AAACV1109Q1Z1', address: 'National Highway Bypass, Salem', phone: '+91 98420 55190', email: 'vetritrans@rediffmail.com', category: 'Freight & Site Transport' },
  { id: 'VND-010', name: 'Shiva Electricals & Submersible Pumps', gstin: '33AABCS9912R1Z6', address: '30 Gandhi Bazaar, Dharmapuri', phone: '+91 94431 44102', email: 'shiva.elec.dp@gmail.com', category: 'Electrical & Pumps' }
];

// 5. 60 Realistic Expenses
const expenseCategories = ['Civil Construction', 'Plumbing & Fittings', 'Sanitary Wares', 'Solar RO Equipment', 'Mid-Day Dining Shed Civil', 'Electrical & Lighting', 'Food Supplies & Provisions', 'Transport & Material Delivery', 'Sewing Machines & Skill Tools'];
const projectsList = db.initiatives || [];
const sitesList = db.sites || [];

const expenses = [];
const startDay = new Date('2025-05-01');

for (let i = 1; i <= 60; i++) {
  const proj = projectsList[(i - 1) % projectsList.length];
  const site = sitesList[(i - 1) % sitesList.length];
  const vendor = db.vendors[(i - 1) % db.vendors.length];
  const cat = expenseCategories[(i - 1) % expenseCategories.length];
  
  const expDate = new Date(startDay.getTime() + (i * 2.5 * 24 * 3600 * 1000));
  const dateStr = expDate.toISOString().split('T')[0];
  
  // Amounts between 12,000 and 1,80,000
  const amount = Math.round((15000 + ((i * 3791) % 165000)) / 500) * 500;
  
  // 42 Approved, 13 Pending, 5 Rejected
  let approvalStatus = 'Approved';
  let approvedBy = 'Mrs. S. Meenakshi, M.A.';
  let rejectedReason = null;
  let tallySyncStatus = 'synced';
  let voucherId = 'VCH-PAY-' + String(i).padStart(3, '0');
  
  if (i > 47 && i <= 55) {
    approvalStatus = 'Pending';
    approvedBy = null;
    tallySyncStatus = 'pending';
    voucherId = null;
  } else if (i > 55) {
    approvalStatus = 'Rejected';
    approvedBy = null;
    rejectedReason = 'Duplicate bill submission or rate variance beyond approved contract terms';
    tallySyncStatus = 'failed';
    voucherId = null;
  }

  expenses.push({
    id: 'EXP-' + String(i).padStart(4, '0'),
    vendorId: vendor.id,
    vendorName: vendor.name,
    description: `${cat} milestone disbursement for ${site.schoolName}`,
    amount,
    billNumber: `BL/25-26/${String(i).padStart(4, '0')}`,
    billDate: dateStr,
    projectId: proj.id,
    projectName: proj.title,
    siteId: site.id,
    siteName: site.schoolName,
    category: cat,
    paymentMode: i % 4 === 0 ? 'Cheque / Bank Transfer' : 'NEFT / RTGS',
    approvalStatus,
    approvedBy,
    approvedAt: approvalStatus === 'Approved' ? dateStr + 'T14:30:00Z' : null,
    rejectedReason,
    rejectedBy: approvalStatus === 'Rejected' ? 'Er. P. Shanmugam, B.E.' : null,
    tallySyncStatus,
    voucherId,
    createdAt: dateStr + 'T09:15:00Z',
    createdBy: 'Er. P. Shanmugam, B.E.'
  });
}
db.expenses = expenses;

// 6. 10 Sample Invoices / Bills
db.invoices = [
  {
    id: 'INV-0001',
    invoiceNumber: 'INV/25-26/0001',
    type: 'purchase',
    partyName: 'Apex Infra & Plumbing Contractors',
    partyGstin: '33AABCA1234F1Z1',
    invoiceDate: '2025-06-20',
    dueDate: '2025-07-20',
    lineItems: [
      { description: 'Civil foundation and brickwork for Toilet Unit 1-4', quantity: 1, rate: 180000, amount: 180000 },
      { description: 'Sanitary ceramic fixtures, piping and septic connection', quantity: 1, rate: 120000, amount: 120000 }
    ],
    subtotal: 300000,
    gstRate: 18,
    gstAmount: 54000,
    total: 354000,
    status: 'Paid',
    notes: 'Stage 1 completion bill passed by Er. P. Shanmugam',
    projectId: 'INIT-01',
    tallySyncStatus: 'synced',
    voucherId: 'VCH-PAY-001'
  },
  {
    id: 'INV-0002',
    invoiceNumber: 'INV/25-26/0002',
    type: 'purchase',
    partyName: 'Sri Sai Civil & Sanitation Builders',
    partyGstin: '33BBXCS5678G1Z4',
    invoiceDate: '2025-07-05',
    dueDate: '2025-08-05',
    lineItems: [
      { description: 'Structural steel truss and puff roof for F&B Dining Shed', quantity: 1, rate: 220000, amount: 220000 },
      { description: 'Stainless steel handwash station with multiple bib cocks', quantity: 1, rate: 65000, amount: 65000 }
    ],
    subtotal: 285000,
    gstRate: 18,
    gstAmount: 51300,
    total: 336300,
    status: 'Paid',
    notes: 'Dining shed construction at GHSS Block 2',
    projectId: 'INIT-01',
    tallySyncStatus: 'synced',
    voucherId: 'VCH-PAY-002'
  },
  {
    id: 'INV-0003',
    invoiceNumber: 'INV/25-26/0003',
    type: 'purchase',
    partyName: 'Surya Solar Power Systems',
    partyGstin: '33AADCS7722M1Z9',
    invoiceDate: '2025-07-18',
    dueDate: '2025-08-18',
    lineItems: [
      { description: 'Solar Powered 1000 LPH RO Water Purification Skid', quantity: 1, rate: 320000, amount: 320000 },
      { description: 'Storage tank 2000L and stainless dispensing tap stand', quantity: 1, rate: 45000, amount: 45000 }
    ],
    subtotal: 365000,
    gstRate: 12,
    gstAmount: 43800,
    total: 408800,
    status: 'Paid',
    notes: 'Solar RO Plant installation at Salem rural hamlet',
    projectId: 'INIT-02',
    tallySyncStatus: 'synced',
    voucherId: 'VCH-PAY-005'
  },
  {
    id: 'INV-0004',
    invoiceNumber: 'INV/25-26/0004',
    type: 'purchase',
    partyName: 'Annapoorna Provision & Grain Traders',
    partyGstin: '33AAGCA3321N1Z7',
    invoiceDate: '2025-08-02',
    dueDate: '2025-09-02',
    lineItems: [
      { description: 'Nutrition Kit Foodgrains (Ponni Rice 10kg x 300 kits)', quantity: 300, rate: 580, amount: 174000 },
      { description: 'Toor Dal, Cooking Oil, Salt and Protein Millets', quantity: 300, rate: 420, amount: 126000 }
    ],
    subtotal: 300000,
    gstRate: 0,
    gstAmount: 0,
    total: 300000,
    status: 'Paid',
    notes: 'Elderly nutrition distribution monthly grocery bulk batch',
    projectId: 'INIT-03',
    tallySyncStatus: 'synced',
    voucherId: 'VCH-PAY-008'
  },
  {
    id: 'INV-0005',
    invoiceNumber: 'INV/25-26/0005',
    type: 'purchase',
    partyName: 'Singer Motorized Sewing Machines Dealer',
    partyGstin: '33AAECS2219P1Z8',
    invoiceDate: '2025-08-15',
    dueDate: '2025-09-15',
    lineItems: [
      { description: 'Heavy Duty Motorized Zig-zag Sewing Machines', quantity: 20, rate: 9500, amount: 190000 },
      { description: 'Tailoring tool kits, measuring stands & scissors', quantity: 20, rate: 1200, amount: 24000 }
    ],
    subtotal: 214000,
    gstRate: 18,
    gstAmount: 38520,
    total: 252520,
    status: 'Paid',
    notes: 'Women vocational training center batch 2 kits',
    projectId: 'INIT-05',
    tallySyncStatus: 'synced',
    voucherId: 'VCH-PAY-012'
  },
  {
    id: 'INV-0006',
    invoiceNumber: 'INV/25-26/0006',
    type: 'sales',
    partyName: 'Sundaram Fasteners CSR Division',
    partyGstin: '33AAACS1902E1Z2',
    invoiceDate: '2025-08-25',
    dueDate: '2025-09-25',
    lineItems: [
      { description: 'CSR Grant Claim: Phase 1 School Sanitation Project (10 Schools)', quantity: 1, rate: 1500000, amount: 1500000 }
    ],
    subtotal: 1500000,
    gstRate: 0,
    gstAmount: 0,
    total: 1500000,
    status: 'Paid',
    notes: 'Milestone claim backed by CA expenditure utilization certificate',
    projectId: 'INIT-01',
    tallySyncStatus: 'synced',
    voucherId: 'VCH-REC-002'
  },
  {
    id: 'INV-0007',
    invoiceNumber: 'INV/25-26/0007',
    type: 'purchase',
    partyName: 'Apex Infra & Plumbing Contractors',
    partyGstin: '33AABCA1234F1Z1',
    invoiceDate: '2025-09-10',
    dueDate: '2025-10-10',
    lineItems: [
      { description: 'Sanitation block tiling, painting and incinerator installation', quantity: 1, rate: 210000, amount: 210000 }
    ],
    subtotal: 210000,
    gstRate: 18,
    gstAmount: 37800,
    total: 247800,
    status: 'Issued',
    notes: 'Awaiting site supervisor final handover signoff',
    projectId: 'INIT-01',
    tallySyncStatus: 'pending',
    voucherId: null
  },
  {
    id: 'INV-0008',
    invoiceNumber: 'INV/25-26/0008',
    type: 'purchase',
    partyName: 'Kaveri Hardware & Plumbing Supplies',
    partyGstin: '33AACKH9910H1Z2',
    invoiceDate: '2025-09-22',
    dueDate: '2025-10-22',
    lineItems: [
      { description: 'UPVC pipelines, brass taps, ball valves & water overhead tanks', quantity: 1, rate: 115000, amount: 115000 }
    ],
    subtotal: 115000,
    gstRate: 18,
    gstAmount: 20700,
    total: 135700,
    status: 'Draft',
    notes: 'Bulk stock delivery for 4 Vellore schools',
    projectId: 'INIT-01',
    tallySyncStatus: 'pending',
    voucherId: null
  },
  {
    id: 'INV-0009',
    invoiceNumber: 'INV/25-26/0009',
    type: 'sales',
    partyName: 'Apex Textile Mills CSR Wing',
    partyGstin: '33AAATA4412F1Z8',
    invoiceDate: '2025-10-01',
    dueDate: '2025-11-01',
    lineItems: [
      { description: 'CSR Grant tranche 2 for Rural Clean Drinking Water RO Plants', quantity: 1, rate: 800000, amount: 800000 }
    ],
    subtotal: 800000,
    gstRate: 0,
    gstAmount: 0,
    total: 800000,
    status: 'Issued',
    notes: 'Tranche invoice submitted to CSR committee',
    projectId: 'INIT-02',
    tallySyncStatus: 'pending',
    voucherId: null
  },
  {
    id: 'INV-0010',
    invoiceNumber: 'INV/25-26/0010',
    type: 'purchase',
    partyName: 'Vetri Logistics & Transport Services',
    partyGstin: '33AAACV1109Q1Z1',
    invoiceDate: '2025-10-15',
    dueDate: '2025-11-15',
    lineItems: [
      { description: 'Inter-district material transit and loading labor across 12 school sites', quantity: 12, rate: 4500, amount: 54000 }
    ],
    subtotal: 54000,
    gstRate: 5,
    gstAmount: 2700,
    total: 56700,
    status: 'Draft',
    notes: 'Trip sheets attached and verified',
    projectId: 'INIT-01',
    tallySyncStatus: 'pending',
    voucherId: null
  }
];

// 7. Sync Queue items (with varied statuses for testing)
db.syncQueue = [
  {
    id: 'SQ-2025-001',
    voucherId: 'VCH-PAY-048',
    voucherNumber: 'PAY/25-26/0048',
    status: 'pending',
    attempts: 0,
    nextRetryAt: new Date().toISOString(),
    lastError: null,
    createdAt: '2025-10-28T08:00:00Z'
  },
  {
    id: 'SQ-2025-002',
    voucherId: 'VCH-PAY-049',
    voucherNumber: 'PAY/25-26/0049',
    status: 'retrying',
    attempts: 2,
    nextRetryAt: new Date(Date.now() + 120000).toISOString(),
    lastError: 'Connection to Tally timed out after 5000ms',
    createdAt: '2025-10-28T09:30:00Z'
  },
  {
    id: 'SQ-2025-003',
    voucherId: 'VCH-PAY-056',
    voucherNumber: 'PAY/25-26/0056',
    status: 'failed',
    attempts: 5,
    nextRetryAt: new Date().toISOString(),
    lastError: 'Ledger "Suspense Contractor Advance" not found in Tally company',
    createdAt: '2025-10-27T11:20:00Z'
  },
  {
    id: 'SQ-2025-004',
    voucherId: 'VCH-REC-018',
    voucherNumber: 'REC/25-26/0018',
    status: 'synced',
    attempts: 1,
    nextRetryAt: null,
    lastError: null,
    createdAt: '2025-10-26T15:00:00Z'
  },
  {
    id: 'SQ-2025-005',
    voucherId: 'VCH-PAY-057',
    voucherNumber: 'PAY/25-26/0057',
    status: 'failed',
    attempts: 5,
    nextRetryAt: new Date().toISOString(),
    lastError: 'Voucher date 2024-03-15 outside current financial year 2025-26',
    createdAt: '2025-10-27T16:45:00Z'
  }
];

// 8. 25 Audit Log Entries
const auditActions = [
  { action: 'LOGIN', entity: 'auth', entityId: 'USR-001', details: 'Dr. K. Ramanathan signed in from IP 192.168.1.101' },
  { action: 'CREATE', entity: 'donation', entityId: 'VCH-REC-018', details: 'Recorded ₹5,00,000 donation from Sundaram Fasteners CSR Foundation' },
  { action: 'APPROVE', entity: 'expense', entityId: 'EXP-0042', details: 'Mrs. S. Meenakshi approved payment ₹1,25,000 for GHSS Site 14' },
  { action: 'TALLY_PUSH', entity: 'voucher', entityId: 'VCH-PAY-0042', details: 'Synchronized Payment voucher to TallyPrime Port 9000 with Cost Center' },
  { action: 'CREATE', entity: 'site', entityId: 'SITE-036', details: 'Registered school site: Govt Higher Secondary School, Block 36' },
  { action: 'BULK_IMPORT', entity: 'sites', entityId: 'BATCH-01', details: 'Imported 12 rural school sites from Education Department sanction order' },
  { action: 'GENERATE_PDF', entity: 'receipt', entityId: 'REC/25-26/0018', details: 'Generated official 80G tax exemption receipt for donor' },
  { action: 'UPDATE', entity: 'tallyConfig', entityId: 'PORT-9000', details: 'Verified Tally HTTP connectivity: Port 9000 active, company matched' },
  { action: 'REJECT', entity: 'expense', entityId: 'EXP-0056', details: 'Rejected expense bill BL/25-26/0056: rate variance requires retendering' },
  { action: 'CREATE', entity: 'invoice', entityId: 'INV-0006', details: 'Issued CSR milestone reimbursement invoice for ₹15,00,000' }
];

const auditLogs = [];
for (let i = 1; i <= 25; i++) {
  const t = auditActions[(i - 1) % auditActions.length];
  const auditDate = new Date(Date.now() - ((25 - i) * 3600 * 4000));
  auditLogs.push({
    id: 'AUD-' + String(i).padStart(4, '0'),
    userId: i % 2 === 0 ? 'USR-002' : 'USR-001',
    userName: i % 2 === 0 ? 'Mrs. S. Meenakshi, M.A.' : 'Dr. K. Ramanathan, M.S.',
    action: t.action,
    entity: t.entity,
    entityId: t.entityId,
    details: t.details,
    timestamp: auditDate.toISOString()
  });
}
db.auditLog = auditLogs.reverse();

fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
console.log('✅ database.json successfully enriched with complete production demo dataset!');
