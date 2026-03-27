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
          <img src="/banner_logo.svg" alt="Prime Invoice Logo" className="logo-banner" />
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
import { primeInvoiceABI } from './abis';

// TODO: Replace with actual deployed Base Sepolia address
const CONTRACT_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

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
      const dueDate = Math.floor(Date.now() / 1000) + 86400 * 30;
      const amountInUSDC = parseUnits(amount, 6);

      const txHash = await writeContractAsync({
        abi: primeInvoiceABI,
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
            <label>INVOICE ID:</label>
            <input type="text" value={invoiceId} onChange={e => setInvoiceId(e.target.value)} placeholder="INV-2024-001" />
          </div>
          <div className="form-group">
            <label>AMOUNT (USD):</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="50000" />
          </div>
          <div className="form-group">
            <label>BILLED TO (BUYER WEB3 ADDRESS):</label>
            <input type="text" value={buyerAddress} onChange={e => setBuyerAddress(e.target.value)} placeholder="0x..." />
          </div>
          <button className="primary btn-propose" onClick={handlePropose}>Submit to Buyer</button>
        </div>

        <div className="card">
          <h3>My Active Invoices</h3>
          <div className="empty-state">
            No active approved invoices to factor.
          </div>
        </div>
      </div>
    </div>
  );
}

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
        </div>

        <div className="card">
          <h3>Approved History</h3>
          <div className="empty-state">No outstanding invoices to pay.</div>
        </div>
      </div>
    </div>
  );
}

function FinancierDashboard({ party }: { party: string }) {
  return (
    <div className="role-panel financier-panel">
      <header>
        <h2>Institutional Financier Terminal</h2>
        <p>Logged in as: <strong>{party}</strong></p>
      </header>

      <div className="card-grid">
        <div className="info-section">
          <h3>Why Provide Liquidity? (The Incentive)</h3>
          <p>
            Financiers fund approved invoices at a fixed <strong style={{ color: 'var(--accent-cyan)' }}>10% total discount</strong> across the Base network.
            Yields are structured dynamically based on the invoice's maturity date.
          </p>
          <ul className="yield-table">
            <li>
              <span><strong>30-Day Invoice:</strong> 8% Yield to Financier</span>
              <span className="yield-value">(2% Protocol Fee)</span>
            </li>
            <li>
              <span><strong>60-Day Invoice:</strong> 8.5% Yield to Financier</span>
              <span className="yield-value">(1.5% Protocol Fee)</span>
            </li>
            <li>
              <span><strong>90-Day Invoice:</strong> 9% Yield to Financier</span>
              <span className="yield-value">(1% Protocol Fee)</span>
            </li>
          </ul>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Example: You fund a $100,000 90-day invoice for $90,000. At maturity, the smart contract routes exactly $99,000 back to you, 
            securing a guaranteed <strong style={{ color: 'var(--accent-cyan)' }}>$9,000 profit</strong> safely backed by real-world Corporate liabilities.
          </p>
        </div>

        <div className="card demand-card">
          <div className="risk-badge">Low Risk - Verified</div>
          <h3>Incoming Factoring Demands</h3>
          
          <div style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
            <div style={{ color: 'var(--accent-cyan)', fontWeight: 700, marginBottom: '0.5rem' }}>INV-2026-045</div>
            <div className="stat-label">Supplier: <strong>Acme Widgets</strong></div>
            <div className="amount-highlight">
              <span className="amount-strikethrough">$100,000</span> → $90,000
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>(10% discount)</div>
            </div>
            <div className="stats-row">
              <div><span className="stat-label">Due:</span> <span className="stat-value">30 Days</span></div>
              <div><span className="stat-label">Yield:</span> <span className="stat-value" style={{ color: 'var(--accent-green)' }}>8%</span></div>
            </div>
            <button className="primary" style={{ marginTop: '1rem' }}>Fund Invoice</button>
          </div>

          <div style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
            <div style={{ color: 'var(--accent-cyan)', fontWeight: 700, marginBottom: '0.5rem' }}>INV-2026-078</div>
            <div className="stat-label">Supplier: <strong>TechNova Solutions</strong></div>
            <div className="amount-highlight">
              <span className="amount-strikethrough">$150,000</span> → $135,000
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>(10% discount)</div>
            </div>
            <div className="stats-row">
              <div><span className="stat-label">Due:</span> <span className="stat-value">60 Days</span></div>
              <div><span className="stat-label">Yield:</span> <span className="stat-value" style={{ color: 'var(--accent-green)' }}>8.5%</span></div>
            </div>
            <button className="primary" style={{ marginTop: '1rem' }}>Fund Invoice</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
