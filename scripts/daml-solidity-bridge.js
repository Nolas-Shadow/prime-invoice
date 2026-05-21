import { ethers } from 'ethers';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load ABI from local JSON file
const abiPath = path.join(__dirname, 'abis', 'PrimeInvoice.json');
const primeInvoiceABI = JSON.parse(fs.readFileSync(abiPath, 'utf8'));

// Configuration from environment variables
const RPC_URL = process.env.RPC_URL || 'http://localhost:8545';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
const DAML_JSON_API_URL = process.env.DAML_JSON_API_URL || 'http://localhost:7575/v1';

// Active DAML Ledger Templates
const TEMPLATE_PROPOSAL = 'Main:InvoiceProposal';
const TEMPLATE_INVOICE = 'Main:Invoice';
const TEMPLATE_FACTORING_REQ = 'Main:FactoringRequest';
const TEMPLATE_FACTORED_INVOICE = 'Main:FactoredInvoice';

// Helper to make DAML ledger API calls
async function callDamlLedger(endpoint, payload) {
  try {
    const url = `${DAML_JSON_API_URL}${endpoint}`;
    console.log(`[DAML Bridge] Sending POST to ${url}...`);
    const response = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' }
    });
    console.log(`[DAML Bridge] Success:`, JSON.stringify(response.data.result || response.data));
    return response.data.result;
  } catch (error) {
    console.warn(`[DAML Bridge] Ledger interaction skipped/failed (is Canton JSON API running at ${DAML_JSON_API_URL}?):`, error.message);
    return null;
  }
}

async function main() {
  console.log("====================================================");
  console.log("   PRIME INVOICE: DAML-SOLIDITY INTEGRATION RELAYER");
  console.log("====================================================");
  console.log("Connecting to RPC URL:", RPC_URL);
  console.log("Contract Address:", CONTRACT_ADDRESS);
  console.log("Targeting DAML Ledger JSON API at:", DAML_JSON_API_URL);

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const primeInvoice = new ethers.Contract(CONTRACT_ADDRESS, primeInvoiceABI, provider);

  // 1. Listen for InvoiceProposed (Supplier -> Buyer)
  primeInvoice.on("InvoiceProposed", async (id, supplier, buyer, amount, termDays) => {
    const invoiceId = id.toString();
    const amountUSDC = ethers.formatUnits(amount, 6);
    const term = termDays.toString();

    console.log(`\n🔔 [Solidity Event] InvoiceProposed!`);
    console.log(`   - ID: ${invoiceId}`);
    console.log(`   - Supplier: ${supplier}`);
    console.log(`   - Buyer: ${buyer}`);
    console.log(`   - Amount: $${amountUSDC} USDC`);
    console.log(`   - Term: ${term} Days`);

    // Synchronize to DAML Ledger: Create InvoiceProposal contract
    await callDamlLedger('/create', {
      templateId: TEMPLATE_PROPOSAL,
      payload: {
        supplier: supplier,
        buyer: buyer,
        invoiceId: `INV-${invoiceId}`,
        amount: parseFloat(amountUSDC),
        dueDate: new Date(Date.now() + 86400 * 1000 * parseInt(term)).toISOString().split('T')[0],
        termDays: parseInt(term)
      }
    });
  });

  // 2. Listen for InvoiceApproved (Buyer -> Supplier)
  primeInvoice.on("InvoiceApproved", async (id) => {
    const invoiceId = id.toString();
    console.log(`\n🔔 [Solidity Event] InvoiceApproved!`);
    console.log(`   - ID: ${invoiceId}`);

    // Synchronize to DAML Ledger: Exercise AcceptInvoice choice
    const proposals = await callDamlLedger('/query', { templateIds: [TEMPLATE_PROPOSAL] });
    if (proposals) {
      const match = proposals.find(p => p.payload.invoiceId === `INV-${invoiceId}`);
      if (match) {
        await callDamlLedger('/exercise', {
          templateId: TEMPLATE_PROPOSAL,
          contractId: match.contractId,
          choice: 'AcceptInvoice',
          argument: {}
        });
      } else {
        console.log(`[DAML Bridge] Warning: No matching DAML Proposal found for ID INV-${invoiceId}`);
      }
    }
  });

  // 3. Listen for InvoiceFactored (Financier funds the invoice)
  primeInvoice.on("InvoiceFactored", async (id, financier, protocolFee, financierYield) => {
    const invoiceId = id.toString();
    console.log(`\n🔔 [Solidity Event] InvoiceFactored!`);
    console.log(`   - ID: ${invoiceId}`);
    console.log(`   - Financier: ${financier}`);
    console.log(`   - Protocol Fee: $${ethers.formatUnits(protocolFee, 6)} USDC`);
    console.log(`   - Financier Yield: $${ethers.formatUnits(financierYield, 6)} USDC`);

    // Synchronize to DAML Ledger: Transition state to FactoredInvoice
    const invoices = await callDamlLedger('/query', { templateIds: [TEMPLATE_INVOICE] });
    if (invoices) {
      const match = invoices.find(inv => inv.payload.invoiceId === `INV-${invoiceId}`);
      if (match) {
        // Supplier requests factoring on DAML
        const reqResult = await callDamlLedger('/exercise', {
          templateId: TEMPLATE_INVOICE,
          contractId: match.contractId,
          choice: 'RequestFactoring',
          argument: {
            financier: financier,
            discountedAmount: match.payload.amount - parseFloat(ethers.formatUnits(financierYield, 6))
          }
        });
        
        // Financier funds the request on DAML
        if (reqResult && reqResult.events) {
          const reqCid = reqResult.events[0].created.contractId;
          await callDamlLedger('/exercise', {
            templateId: TEMPLATE_FACTORING_REQ,
            contractId: reqCid,
            choice: 'Fund',
            argument: {}
          });
        }
      }
    }
  });

  // 4. Listen for InvoiceRepaid (Buyer pays Financier at Maturity)
  primeInvoice.on("InvoiceRepaid", async (id) => {
    const invoiceId = id.toString();
    console.log(`\n🔔 [Solidity Event] InvoiceRepaid!`);
    console.log(`   - ID: ${invoiceId}`);

    // Synchronize to DAML Ledger: Exercise PayMaturity choice
    const factoredInvoices = await callDamlLedger('/query', { templateIds: [TEMPLATE_FACTORED_INVOICE] });
    if (factoredInvoices) {
      const match = factoredInvoices.find(f => f.payload.invoiceId === `INV-${invoiceId}`);
      if (match) {
        await callDamlLedger('/exercise', {
          templateId: TEMPLATE_FACTORED_INVOICE,
          contractId: match.contractId,
          choice: 'PayMaturity',
          argument: {}
        });
      }
    }
  });

  console.log("Listening for Solidity events... Press Ctrl+C to stop.");
  
  // Keep script running
  await new Promise(() => {});
}

main().catch((error) => {
  console.error("Bridge Error:", error);
  process.exit(1);
});
