const fs = require('fs');
const path = require('path');

const mastersXml = `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>ARUTPERUNJOTHI SEVA TRUST</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <!-- COST CATEGORIES -->
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <COSTCATEGORY NAME="School Sanitation &amp; Kitchen Projects" ACTION="Create">
            <NAME>School Sanitation &amp; Kitchen Projects</NAME>
            <ALLOCATEREVENUE>Yes</ALLOCATEREVENUE>
            <ALLOCATENONREVENUE>Yes</ALLOCATENONREVENUE>
          </COSTCATEGORY>
        </TALLYMESSAGE>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <COSTCATEGORY NAME="36 Govt-Aided Schools Infrastructure" ACTION="Create">
            <NAME>36 Govt-Aided Schools Infrastructure</NAME>
            <ALLOCATEREVENUE>Yes</ALLOCATEREVENUE>
            <ALLOCATENONREVENUE>Yes</ALLOCATENONREVENUE>
          </COSTCATEGORY>
        </TALLYMESSAGE>

        <!-- COST CENTRES -->
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <COSTCENTRE NAME="Multiple Sites Allocation" ACTION="Create">
            <NAME>Multiple Sites Allocation</NAME>
            <CATEGORY>School Sanitation &amp; Kitchen Projects</CATEGORY>
          </COSTCENTRE>
        </TALLYMESSAGE>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <COSTCENTRE NAME="Site #01 - Panchayat Union Middle School, Tiruvallur" ACTION="Create">
            <NAME>Site #01 - Panchayat Union Middle School, Tiruvallur</NAME>
            <CATEGORY>36 Govt-Aided Schools Infrastructure</CATEGORY>
          </COSTCENTRE>
        </TALLYMESSAGE>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <COSTCENTRE NAME="Govt Model Higher Secondary School, Block 4" ACTION="Create">
            <NAME>Govt Model Higher Secondary School, Block 4</NAME>
            <CATEGORY>School Sanitation &amp; Kitchen Projects</CATEGORY>
          </COSTCENTRE>
        </TALLYMESSAGE>

        <!-- BANK LEDGERS -->
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <LEDGER NAME="HDFC Bank A/c" ACTION="Create">
            <NAME>HDFC Bank A/c</NAME>
            <PARENT>Bank Accounts</PARENT>
            <OPENINGBALANCE>-2500000.00</OPENINGBALANCE>
            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
          </LEDGER>
        </TALLYMESSAGE>

        <!-- INCOME LEDGERS -->
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <LEDGER NAME="Donations Received (80G)" ACTION="Create">
            <NAME>Donations Received (80G)</NAME>
            <PARENT>Direct Incomes</PARENT>
            <ISCOSTCENTRESON>Yes</ISCOSTCENTRESON>
          </LEDGER>
        </TALLYMESSAGE>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <LEDGER NAME="CSR Corpus Grants (80G)" ACTION="Create">
            <NAME>CSR Corpus Grants (80G)</NAME>
            <PARENT>Direct Incomes</PARENT>
            <ISCOSTCENTRESON>Yes</ISCOSTCENTRESON>
          </LEDGER>
        </TALLYMESSAGE>

        <!-- EXPENSE LEDGERS -->
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <LEDGER NAME="School Sanitation Project Exp" ACTION="Create">
            <NAME>School Sanitation Project Exp</NAME>
            <PARENT>Direct Expenses</PARENT>
            <ISCOSTCENTRESON>Yes</ISCOSTCENTRESON>
          </LEDGER>
        </TALLYMESSAGE>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <LEDGER NAME="Food &amp; Beverage Equipment Exp" ACTION="Create">
            <NAME>Food &amp; Beverage Equipment Exp</NAME>
            <PARENT>Direct Expenses</PARENT>
            <ISCOSTCENTRESON>Yes</ISCOSTCENTRESON>
          </LEDGER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

const dest = path.join('C:', 'Users', 'DELL', 'TallyInstallers', 'Tally_Import_Masters.xml');
fs.writeFileSync(dest, mastersXml, 'utf8');
console.log('Successfully wrote comprehensive masters to:', dest);
