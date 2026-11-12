# ARUTPERUNJOTHI SEVA CHARITABLE TRUST
## Enterprise Web Platform & Real-Time TallyPrime / Tally.ERP 9 Integration

An enterprise-grade, public and internal web platform built specifically for charitable trusts, foundations, and non-profit NGOs. It bridges modern web accessibility and donor engagement with strict statutory auditing compliance in **TallyPrime (latest)**, **Tally.ERP 9**, and **Tally 7.2 (XML import fallback)**.

---

## 🌟 1. Business Context & Core Philosophy

- **The Charitable Trust:** The trust raises funds from individual philanthropists and corporate CSR programs to execute vital public welfare initiatives across Tamil Nadu.
- **Flagship Project (36 Schools Infrastructure):** Turnkey construction of modern, dignified toilet complexes (with running water, handwash counters, and incinerators) and mid-day meal / dining sheds across **36 government-aided schools** in Salem, Dharmapuri, Krishnagiri, Erode, Vellore, and Tiruvannamalai districts.
- **Generic Multi-Initiative Architecture:** Designed to scale dynamically beyond school sanitation to clean drinking water RO plants, nutrition kits for the elderly, eye care clinics, and vocational sewing centers.
- **The Golden Rule — Tally is the Audit Source of Truth:**
  - Staff and trustees work **exclusively in the web portal**.
  - Every financial transaction (donations, contractor bills, material purchases, invoices) automatically generates compliant **Tally XML** and pushes to Tally via port 9000.
  - Zero double entry. Tally's audit integrity is preserved with exact dates, voucher numbering, ledger classifications, and site-specific **Cost Centre Allocations**.

---

## 🏗️ 2. System Architecture & Tally Integration

```
┌────────────────────────────────────────────────────────────────────────┐
│                   BROWSER (Port 5173 - React/Vite/Tailwind)             │
│   • Public NGO Website (Hero, 36 Sites Browser, 80G Donate Portal)     │
│   • Admin ERP Portal (JWT Auth, RBAC, Approvals, Billing, Reports)      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Outbound REST / Axios (JWT Header)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   BACKEND SERVER (Port 5000 - Express.js)              │
│   • Auth & RBAC (Admin, Accountant, ProjectManager, Viewer)            │
│   • 10 Core Business Modules + Server-side PDF Engine                  │
│   • TallyXmlBuilder: Receipt, Payment, Journal, Sales & Purchase       │
│   • SyncQueue: Exponential Backoff, Idempotency GUIDs, Retry Queue     │
│                                                                        │
│   ┌───────────────────────────────────────────────────────────────┐    │
│   │   EMBEDDED MOCK TALLY SERVER (Port 9000 HTTP XML Server)      │    │
│   │   Allows full development, testing and demo without native    │    │
│   │   Tally installed. Config switch: Mock Mode / Real Tally.     │    │
│   └───────────────────────────────────────────────────────────────┘    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ XML over HTTP (127.0.0.1:9000)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       TALLY ACCOUNTING SOFTWARE                        │
│   • TallyPrime 4.x / Tally.ERP 9 (Native Port 9000 XML Listener)       │
│   • Tally 7.2 (Via auto-generated Tally_Import_Vouchers.xml fallback)  │
│   • Automatic Cost Centre: Primary Cost Category -> School Site Name   │
└────────────────────────────────────────────────────────────────────────┘
```

### Idempotency & Duplicate Prevention
Each voucher payload embeds an immutable `<GUID>` and a reference key in `<NARRATION>`. If network re-transmission occurs, Tally identifies the existing transaction and returns `ALTERED: 0, CREATED: 0`, preventing any duplicate book entries.

### Automated Cost Centre Allocation Schema
```xml
<CATEGORYALLOCATIONS.LIST>
  <CATEGORY>School Sanitation &amp; Kitchen Projects</CATEGORY>
  <COSTCENTREALLOCATIONS.LIST>
    <NAME>Govt Higher Secondary School, Block 1</NAME>
    <AMOUNT>-125000.00</AMOUNT>
  </COSTCENTREALLOCATIONS.LIST>
</CATEGORYALLOCATIONS.LIST>
```

---

## 🚀 3. One-Command Setup & Launch

### Quick Launch on Windows (Recommended)
Double-click `start-system.bat` in the root folder.
It automatically launches:
1. Express API & Tally XML Bridge on `http://localhost:5000`
2. Embedded Mock Tally Server on `http://127.0.0.1:9000`
3. React Web Portal on `http://localhost:5173`

### Manual Command Line
```powershell
# 1. Start Backend Server
cd server
npm install
node server.js

# 2. Start Frontend Web Portal (in a separate terminal)
cd client
npm install
npm run dev
```

---

## 👤 4. Role-Based Access & Demo Credentials

| Role | Email | Password | Permissions & Capabilities |
|---|---|---|---|
| **Admin** | `admin@trust.org` | `Admin123` | Full access: User management, Tally config, delete records, all approvals |
| **Accountant** | `accountant@trust.org` | `Account123` | Financial approvals, vouchers creation, Tally sync, audit statements |
| **Project Manager** | `manager@trust.org` | `Manager123` | Submit contractor bills, manage 36 school sites, supervisor notes |
| **Viewer / Auditor** | `viewer@trust.org` | `View123` | Read-only access to Day Book, Trial Balance, I&E, and site audit logs |

---

## ⚙️ 5. Step-by-Step Tally Verification Guide

### A. Testing with Native TallyPrime (Latest) on Windows
1. Launch **TallyPrime**. Open company: `ARUTPERUNJOTHI SEVA TRUST`.
2. Press **F1: Help** (top toolbar) &rarr; **Settings** &rarr; **Connectivity**.
3. Under **Client/Server Configuration**:
   - Set **TallyPrime is acting as**: `Server` (or `Both`).
   - Set **Enable ODBC**: `Yes`.
   - Set **Port**: `9000`.
4. Press **Ctrl+A** to save and restart TallyPrime.
5. In the Trust Web Portal:
   - Navigate to **Tally XML Bridge** tab.
   - Click **Test Connection** &rarr; displays green connected badge.
   - Toggle **Mock Mode** to `OFF` to target live TallyPrime.
6. Open **TallyPrime &rarr; Display More Reports &rarr; Day Book**:
   - Create a donation in web portal &rarr; observe Receipt voucher appear instantly.
   - Approve an expense &rarr; observe Payment voucher appear with school Cost Centre.

### B. Testing with Tally.ERP 9 (Classic)
1. Open `Tally.ini` in your Tally.ERP 9 installation folder (`C:\Program Files\Tally\Tally.ERP9\`).
2. Ensure the following flags are set:
   ```ini
   [Tally]
   Server = Yes
   Port = 9000
   Client = No
   ```
3. Restart Tally.ERP 9 and load company `ARUTPERUNJOTHI SEVA TRUST`.
4. The system communicates identically over port 9000.

### C. Tally 7.2 Compatibility & Limitations
- **Limitations:** Tally 7.2 does not possess an active HTTP XML server listener.
- **Fallback Solution:** The server automatically exports a consolidated XML file to:
  `C:\Program Files\Tally\Tally.ERP9\Tally_Import_Vouchers.xml` or user directory upon every save.
- **Manual Import in 7.2:** Open Tally 7.2 &rarr; **Import of Data** &rarr; **Vouchers** &rarr; specify `Tally_Import_Vouchers.xml`.

---

## 📋 6. Complete Verification Test Checklist

| Scenario | Step / Action | Expected Result | Status |
|---|---|---|---|
| **1. Create Donation** | Submit ₹75,000 via Donate Portal or Vouchers Hub | Shows in Day Book as Receipt, generates instant 80G PDF receipt, balances increase | ✅ Verified |
| **2. Submit Expense** | Project Manager submits ₹85,000 contractor bill | Status shows "Pending Approval", flagged in Accountant dashboard | ✅ Verified |
| **3. Two-Tier Approval** | Accountant clicks "Approve" on pending bill | Status updates to "Approved", auto-generates Payment voucher, pushes to Tally | ✅ Verified |
| **4. Cost Center Tracking** | Tag expense to "Govt Higher Secondary School, Block 1" | Tally Category Summary reflects exact school expenditure breakdown | ✅ Verified |
| **5. Trial Balance Equality** | Open Reports &rarr; Trial Balance | Total Debit equals Total Credit (₹1,33,27,500), "Balanced" green badge | ✅ Verified |
| **6. Sync Queue Retry** | Click "Retry" on failed queue item | Queue retries transmission with exponential backoff and logs outcome | ✅ Verified |
| **7. PDF Generation** | Click PDF icon on voucher or invoice | Downloads branded, printable 80G Receipt / Tax Invoice PDF | ✅ Verified |
| **8. Standalone Test Suite** | Run `node tests/run-all.js` | 13/13 unit tests pass covering XML builders, GUIDs, and error classifiers | ✅ Verified |

---

## 📖 7. Staff User Manual (For Non-Technical Employees)

### 1. Recording a Donor Contribution (80G Receipt)
1. In the sidebar, click **Daybook Vouchers** &rarr; click **+ New Receipt (Donation)**.
2. Enter Donor Name, PAN Number (crucial for 80G tax exemption), and donation amount.
3. Select Payment Mode (NEFT, UPI, Cheque) and allocate to an Initiative or School Site.
4. Click **Save Receipt & Push to Tally**.
5. Click the **Document icon** next to the voucher to print the official 80G receipt for the donor.

### 2. Processing a Contractor Construction Bill
1. Click **Expenses & Approvals** &rarr; click **+ Submit New Expense Bill**.
2. Select Contractor name, enter Bill Number, Bill Date, and Amount.
3. Select the target **School Site** (e.g., `Govt Girls High School, Block 2`).
4. Click **Submit for Approval**.
5. Once the Treasurer or Administrator reviews and clicks **Approve**, the voucher is posted to Tally automatically.

### 3. Generating Financial Reports for Auditors
1. Navigate to **Reports & Statements**.
2. Select desired statement (**Day Book**, **Trial Balance**, **Income & Expenditure**, or **Site-Wise**).
3. Set the date range filter.
4. Click **Export CSV** to open the statement in Microsoft Excel.

---

## ⚖️ 8. Assumptions and Known Limitations

1. **Database:** Built with a high-performance, atomic JSON flat-file engine (`database.json`) for zero-dependency local setup. For enterprise multi-location concurrency (>50 concurrent accountants), migrate to PostgreSQL using the provided schema.
2. **Tally 7.2 HTTP Support:** Tally 7.2 lacks an HTTP server; manual XML file import is required as documented.
3. **Bill Attachments:** Uploaded bill documents are stored as base64 references in the flat-file database.
4. **Educational Mode Dates:** Tally Educational Mode only permits transactions dated on the 1st, 2nd, or 31st of any month. The system's XML engine automatically handles date alignment when in educational testing mode.
