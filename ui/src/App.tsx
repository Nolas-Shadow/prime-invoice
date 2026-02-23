import { useState } from 'react';
import './App.css';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';

// Core Application Component
function App() {
  const [activeTab, setActiveTab] = useState<'supplier' | 'buyer' | 'financier'>('supplier');
  const { address, isConnected } = useAccount();

  // The Active Web3 Address (Falls back to 'Not Connected')
  const activeAddress = isConnected && address ? address : 'Not Connected';

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="brand">
          <span className="brand-network">Base</span>
          <span className="brand-app">PrimeFactoring</span>
        </div>
        <div className="wallet-connect">
          <ConnectButton />
        </div>
      </header>

      <div className="dashboard">
        <div className="sidebar">
          <h3>Simulated Roles</h3>
          <button
            className={activeTab === 'supplier' ? 'active' : ''}
            onClick={() => setActiveTab('supplier')}
          >
            SME Supplier
          </button>
          <button
            className={activeTab === 'buyer' ? 'active' : ''}
            onClick={() => setActiveTab('buyer')}
          >
            Corporate Buyer
          </button>
          <button
            className={activeTab === 'financier' ? 'active' : ''}
            onClick={() => setActiveTab('financier')}
          >
            Financier (Bank)
          </button>
        </div>

        <div className="main-content">
          {activeTab === 'supplier' && <SupplierDashboard party={activeAddress} />}
          {activeTab === 'buyer' && <BuyerDashboard party={activeAddress} />}
          {activeTab === 'financier' && <FinancierDashboard party={activeAddress} />}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------- //
// 1. Supplier Dashboard (Creates Proposals, Requests Factoring)
// ----------------------------------------------------- //
import { useWriteContract } from 'wagmi';
import { parseUnits } from 'viem';
import { primeFactoringABI } from './abis';

// TODO: Replace with actual deployed Base Sepolia address
const CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000000";

function SupplierDashboard({ party }: { party: string }) {
  const [amount, setAmount] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [buyerAddress, setBuyerAddress] = useState('');

  const { writeContractAsync } = useWriteContract();

  const handlePropose = async () => {
    if (!amount || !invoiceId || !buyerAddress) {
      alert("Please enter invoice ID, amount, and Buyer Web3 Address.");
      return;
    }

    try {
      // 30 days from now in Unix Seconds
      const dueDate = Math.floor(Date.now() / 1000) + 86400 * 30;
      // USDC has 6 decimals
      const amountInUSDC = parseUnits(amount, 6);

      const txHash = await writeContractAsync({
        abi: primeFactoringABI,
        address: CONTRACT_ADDRESS,
        functionName: 'proposeInvoice',
        args: [
          buyerAddress,
          amountInUSDC,
          BigInt(dueDate)
        ],
      });

      alert(`Transaction Submitted! Hash: ${txHash}`);
    } catch (error) {
      console.error(error);
      alert("Transaction failed or was rejected by user.");
    }
  };

  return (
    <div className="role-panel supplier-panel">
      <header>
        <h2>SME Supplier Terminal</h2>
        <p>Logged in as: <strong>{party}</strong></p>
      </header>

      <div className="card-grid">
        <div className="card">
          <h3>Draft New Invoice Proposal</h3>
          <div className="form-group">
            <label>Invoice ID:</label>
            <input type="text" value={invoiceId} onChange={e => setInvoiceId(e.target.value)} placeholder="INV-2024-001" />
          </div>
          <div className="form-group">
            <label>Amount (USD):</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="50000" />
          </div>
          <div className="form-group">
            <label>Billed To (Buyer Web3 Address):</label>
            <input type="text" value={buyerAddress} onChange={e => setBuyerAddress(e.target.value)} placeholder="0x..." />
          </div>
          <button className="primary btn-propose" onClick={handlePropose}>Submit to Buyer</button>
        </div>

        <div className="card">
          <h3>My Active Invoices</h3>
          <div className="empty-state">No active approved invoices to factor.</div>
          {/* Real implementation would map over active 'Main:Invoice' contracts */}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------- //
// 2. Buyer Dashboard (Accepts Proposals, Pays at Maturity)
// ----------------------------------------------------- //
function BuyerDashboard({ party }: { party: string }) {
  return (
    <div className="role-panel buyer-panel">
      <header>
        <h2>Corporate Buyer Terminal</h2>
        <p>Logged in as: <strong>{party}</strong></p>
      </header>

      <div className="card-grid">
        <div className="card">
          <h3>Pending Invoice Approvals</h3>
          <div className="empty-state">No pending proposals from suppliers.</div>
          {/* Real implementation would query 'Main:InvoiceProposal' and show Accept/Reject choices */}
        </div>

        <div className="card">
          <h3>Upcoming Liabilities</h3>
          <div className="empty-state">No outstanding invoices to pay.</div>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------- //
// 3. Financier Dashboard (Funds Factoring Requests)
// ----------------------------------------------------- //
function FinancierDashboard({ party }: { party: string }) {
  return (
    <div className="role-panel financier-panel">
      <header>
        <h2>Institutional Financier Terminal</h2>
        <p>Logged in as: <strong>{party}</strong></p>
      </header>

      <div className="card-grid">
        <div className="card highlight-card">
          <h3>Incoming Factoring Demands</h3>
          <div className="empty-state">No immediate factoring requests matching risk profile.</div>
          {/* Real implementation queries 'Main:FactoringRequest' */}
        </div>
      </div>
    </div>
  );
}

export default App;
