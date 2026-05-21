import { useState, useEffect } from 'react';
import './App.css';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { BrowserProvider, Contract, formatUnits, parseUnits } from 'ethers';
import { primeInvoiceABI } from './abis';

declare global {
  interface Window {
    ethereum?: any;
  }
}

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

// Minimal ERC20 ABI for USDC interactions
const USDC_ABI = [
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function allowance(address owner, address spender) public view returns (uint256)",
  "function balanceOf(address account) public view returns (uint256)"
];

interface InvoiceData {
  id: number;
  supplier: string;
  buyer: string;
  financier: string;
  amount: string; // Formatted USDC string
  dueDate: number; // Unix timestamp
  termDays: number;
  status: number; // 0=Proposed, 1=Approved, 2=Factored, 3=Repaid, 4=Cancelled
}

interface AlertMessage {
  type: 'success' | 'error' | 'info';
  text: string;
}

function App() {
  const [activeTab, setActiveTab] = useState<'supplier' | 'buyer' | 'financier' | 'kyc'>('kyc');
  const { address, isConnected } = useAccount();

  const [isVerifiedSupplier, setIsVerifiedSupplier] = useState(false);
  const [isVerifiedBuyer, setIsVerifiedBuyer] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [txPending, setTxPending] = useState(false);
  const [alertMsg, setAlertMsg] = useState<AlertMessage | null>(null);

  const activeAddress = isConnected && address ? address : 'Not Connected';

  // Helper to trigger alert banners
  const showAlert = (type: 'success' | 'error' | 'info', text: string) => {
    setAlertMsg({ type, text });
    setTimeout(() => {
      setAlertMsg(null);
    }, 8000);
  };

  // Main read function to query contract states
  const refreshData = async () => {
    if (!isConnected || !address || !window.ethereum) return;
    try {
      const provider = new BrowserProvider(window.ethereum as any);
      const contract = new Contract(CONTRACT_ADDRESS, primeInvoiceABI, provider);

      // Read verification status
      const isSup = await contract.verifiedSuppliers(address);
      const isBuy = await contract.verifiedBuyers(address);
      setIsVerifiedSupplier(isSup);
      setIsVerifiedBuyer(isBuy);

      // Fetch all invoices
      const nextId = await contract.nextInvoiceId();
      const fetchedInvoices: InvoiceData[] = [];
      
      for (let i = 1; i < Number(nextId); i++) {
        try {
          const inv = await contract.invoices(i);
          fetchedInvoices.push({
            id: Number(inv.id),
            supplier: inv.supplier,
            buyer: inv.buyer,
            financier: inv.financier,
            amount: formatUnits(inv.amount, 6),
            dueDate: Number(inv.dueDate),
            termDays: Number(inv.termDays),
            status: Number(inv.status)
          });
        } catch (invErr) {
          console.error(`Error querying invoice ${i}:`, invErr);
        }
      }
      setInvoices(fetchedInvoices);
    } catch (err: any) {
      console.error("Failed to query contract state:", err);
      showAlert('error', `Failed to load blockchain data: ${err.message || err}`);
    }
  };

  // Fetch data on connection and set up polling interval
  useEffect(() => {
    if (isConnected && address) {
      refreshData();
      const interval = setInterval(refreshData, 10000); // refresh every 10s
      return () => clearInterval(interval);
    } else {
      setInvoices([]);
      setIsVerifiedSupplier(false);
      setIsVerifiedBuyer(false);
    }
  }, [isConnected, address]);

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

      {alertMsg && (
        <div className={`alert-banner alert-${alertMsg.type}`}>
          <div className="alert-content">
            <span className="alert-icon">
              {alertMsg.type === 'success' && '✅'}
              {alertMsg.type === 'error' && '❌'}
              {alertMsg.type === 'info' && '⏳'}
            </span>
            <p>{alertMsg.text}</p>
          </div>
          <button className="alert-close" onClick={() => setAlertMsg(null)}>×</button>
        </div>
      )}

      {txPending && (
        <div className="tx-loading-overlay">
          <div className="spinner"></div>
          <p>Processing Transaction on Base Network... Please confirm in wallet.</p>
        </div>
      )}

      {!isConnected ? (
        <div className="empty-state-container">
          <div className="empty-state" style={{ padding: '4rem 2rem' }}>
            <span style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔗</span>
            <h3>Connect Your Wallet</h3>
            <p>Please connect your Web3 wallet using the button above to access the Prime Invoice marketplace.</p>
            <div style={{ marginTop: '1.5rem' }}>
              <ConnectButton />
            </div>
          </div>
        </div>
      ) : (
        <div className="dashboard">
          <div className="sidebar">
            <h3>Terminal Controls</h3>
            <button
              className={activeTab === 'kyc' ? 'active' : ''}
              onClick={() => setActiveTab('kyc')}
            >
              🔑 Identity & KYC Hub
            </button>
            <button
              className={activeTab === 'supplier' ? 'active' : ''}
              onClick={() => setActiveTab('supplier')}
            >
              🏭 Supplier (SME)
            </button>
            <button
              className={activeTab === 'buyer' ? 'active' : ''}
              onClick={() => setActiveTab('buyer')}
            >
              🏢 Corporate Buyer
            </button>
            <button
              className={activeTab === 'financier' ? 'active' : ''}
              onClick={() => setActiveTab('financier')}
            >
              🏦 Financier (Bank)
            </button>
          </div>

          <div className="main-content">
            {activeTab === 'kyc' && (
              <IdentityKYCHub
                party={activeAddress}
                isSupplier={isVerifiedSupplier}
                isBuyer={isVerifiedBuyer}
                setTxPending={setTxPending}
                showAlert={showAlert}
                refreshData={refreshData}
              />
            )}
            
            {activeTab === 'supplier' && (
              <SupplierDashboard
                party={activeAddress}
                isVerified={isVerifiedSupplier}
                invoices={invoices}
                setTxPending={setTxPending}
                showAlert={showAlert}
                refreshData={refreshData}
                setActiveTab={setActiveTab}
              />
            )}

            {activeTab === 'buyer' && (
              <BuyerDashboard
                party={activeAddress}
                isVerified={isVerifiedBuyer}
                invoices={invoices}
                setTxPending={setTxPending}
                showAlert={showAlert}
                refreshData={refreshData}
                setActiveTab={setActiveTab}
              />
            )}

            {activeTab === 'financier' && (
              <FinancierDashboard
                party={activeAddress}
                invoices={invoices}
                setTxPending={setTxPending}
                showAlert={showAlert}
                refreshData={refreshData}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------- //
// 1. IDENTITY & KYC HUB (KYC/KYB Registration)
// ----------------------------------------------------- //
interface IdentityHubProps {
  party: string;
  isSupplier: boolean;
  isBuyer: boolean;
  setTxPending: (p: boolean) => void;
  showAlert: (type: 'success'|'error'|'info', text: string) => void;
  refreshData: () => Promise<void>;
}

function IdentityKYCHub({ party, isSupplier, isBuyer, setTxPending, showAlert, refreshData }: IdentityHubProps) {
  const [companyName, setCompanyName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [role, setRole] = useState<'supplier' | 'buyer'>('supplier');

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName || !taxId) {
      showAlert('error', 'Please fill out all registration fields.');
      return;
    }

    if (!window.ethereum) return;
    setTxPending(true);
    showAlert('info', 'Submitting KYC Verification request...');

    try {
      const provider = new BrowserProvider(window.ethereum as any);
      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, primeInvoiceABI, signer);

      const asSupplier = role === 'supplier';
      const tx = await contract.mockKYCVerify(party, asSupplier, true);
      await tx.wait();

      showAlert('success', `KYC verification complete! Registered successfully as ${asSupplier ? 'Supplier' : 'Buyer'}.`);
      await refreshData();
      setCompanyName('');
      setTaxId('');
    } catch (err: any) {
      console.error(err);
      showAlert('error', `KYC verification failed: ${err.reason || err.message || err}`);
    } finally {
      setTxPending(false);
    }
  };

  return (
    <div className="role-panel kyc-panel">
      <header>
        <h2>Identity & KYC/KYB Verification Hub</h2>
        <p>Manage and request institutional trade finance verifications.</p>
      </header>

      <div className="card-grid">
        <div className="card">
          <h3>Verification Status</h3>
          <div style={{ margin: '1.5rem 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid var(--border-color)' }}>
              <span>Web3 Wallet:</span>
              <code style={{ color: 'var(--accent-blue)', fontSize: '0.85rem' }}>{party.substring(0, 8)}...{party.substring(party.length-6)}</code>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid var(--border-color)' }}>
              <span>Supplier Verification:</span>
              <span className={`status-badge ${isSupplier ? 'badge-verified' : 'badge-unverified'}`}>
                {isSupplier ? '✅ Active / KYC Passed' : '❌ Not Verified'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0' }}>
              <span>Buyer Verification:</span>
              <span className={`status-badge ${isBuyer ? 'badge-verified' : 'badge-unverified'}`}>
                {isBuyer ? '✅ Active / KYC Passed' : '❌ Not Verified'}
              </span>
            </div>
          </div>
        </div>

        <div className="card">
          <h3>Request KYC/KYB Verification</h3>
          <form onSubmit={handleVerify}>
            <div className="form-group">
              <label>COMPANY LEGAL NAME:</label>
              <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Acme Widgets Corp" required />
            </div>
            <div className="form-group">
              <label>TAX REGISTRATION / EIN:</label>
              <input type="text" value={taxId} onChange={e => setTaxId(e.target.value)} placeholder="US-123456789" required />
            </div>
            <div className="form-group">
              <label>REGISTRATION ROLE:</label>
              <select value={role} onChange={e => setRole(e.target.value as any)} className="form-select">
                <option value="supplier">SME Supplier (Invoice Creator)</option>
                <option value="buyer">Corporate Buyer (Invoice Obligor)</option>
              </select>
            </div>
            <button type="submit" className="primary btn-propose">Run KYC and Register</button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------- //
// 2. SUPPLIER DASHBOARD (Propose & Cancel Invoices)
// ----------------------------------------------------- //
interface SupplierProps {
  party: string;
  isVerified: boolean;
  invoices: InvoiceData[];
  setTxPending: (p: boolean) => void;
  showAlert: (type: 'success'|'error'|'info', text: string) => void;
  refreshData: () => Promise<void>;
  setActiveTab: (t: any) => void;
}

function SupplierDashboard({ party, isVerified, invoices, setTxPending, showAlert, refreshData, setActiveTab }: SupplierProps) {
  const [amount, setAmount] = useState('');
  const [buyerAddress, setBuyerAddress] = useState('');
  const [termDays, setTermDays] = useState('30');

  // Calculate live breakdown matching the contract fee rules
  const amtNum = parseFloat(amount) || 0;
  const termNum = parseInt(termDays);
  
  // Rules: 30 days = 2% protocol, 8% financier yield
  // 60 days = 1.5% protocol, 8.5% financier yield
  // 90 days = 1% protocol, 9% financier yield
  // Total fee is always 10%
  const protocolFeePct = termNum === 30 ? 0.02 : termNum === 60 ? 0.015 : 0.01;
  const yieldPct = termNum === 30 ? 0.08 : termNum === 60 ? 0.085 : 0.09;
  
  const protocolFee = amtNum * protocolFeePct;
  const financierYield = amtNum * yieldPct;
  const totalFee = protocolFee + financierYield;
  const payoutToSupplier = amtNum - totalFee;
  const financierOutlay = amtNum - financierYield;

  const handlePropose = async () => {
    if (!amount || !buyerAddress) {
      showAlert('error', "Please enter amount and Buyer Web3 Address.");
      return;
    }

    if (!isVerified) {
      showAlert('error', "Your connected address is not verified as a Supplier. Please complete KYC first.");
      return;
    }

    if (!window.ethereum) return;
    setTxPending(true);
    showAlert('info', "Proposing Invoice to Buyer on-chain...");

    try {
      const provider = new BrowserProvider(window.ethereum as any);
      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, primeInvoiceABI, signer);

      const amountInUSDC = parseUnits(amount, 6);
      const dueDate = Math.floor(Date.now() / 1000) + 86400 * termNum;

      const tx = await contract.proposeInvoice(buyerAddress, amountInUSDC, BigInt(dueDate), BigInt(termNum));
      await tx.wait();

      showAlert('success', `Invoice proposed successfully! Buyer has been requested to approve.`);
      setAmount('');
      setBuyerAddress('');
      await refreshData();
    } catch (error: any) {
      console.error(error);
      showAlert('error', `Proposal failed: ${error.reason || error.message || error}`);
    } finally {
      setTxPending(false);
    }
  };

  const handleCancel = async (id: number) => {
    if (!window.ethereum) return;
    setTxPending(true);
    showAlert('info', `Cancelling invoice proposal #${id}...`);
    try {
      const provider = new BrowserProvider(window.ethereum as any);
      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, primeInvoiceABI, signer);

      const tx = await contract.cancelInvoice(id);
      await tx.wait();
      showAlert('success', `Invoice #${id} cancelled successfully.`);
      await refreshData();
    } catch (err: any) {
      console.error(err);
      showAlert('error', `Cancel failed: ${err.reason || err.message || err}`);
    } finally {
      setTxPending(false);
    }
  };

  const myInvoices = invoices.filter(inv => inv.supplier.toLowerCase() === party.toLowerCase());

  const getStatusText = (status: number) => {
    switch (status) {
      case 0: return 'Proposed';
      case 1: return 'Approved';
      case 2: return 'Factored';
      case 3: return 'Repaid';
      case 4: return 'Cancelled';
      default: return 'Unknown';
    }
  };

  return (
    <div className="role-panel supplier-panel">
      <header>
        <h2>SME Supplier Terminal</h2>
        <p>Logged in as: <strong>{party}</strong></p>
      </header>

      {!isVerified && (
        <div className="warning-banner">
          ⚠️ <strong>Supplier Identity Unverified:</strong> You need to pass KYC to draft invoice proposals. 
          <button className="text-btn" onClick={() => setActiveTab('kyc')}>Get Verified Now →</button>
        </div>
      )}

      <div className="card-grid">
        <div className="card">
          <h3>Draft New Invoice Proposal</h3>
          <div className="form-group">
            <label>AMOUNT (USD):</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="100000" disabled={!isVerified} />
          </div>
          <div className="form-group">
            <label>BILLED TO (BUYER WEB3 ADDRESS):</label>
            <input type="text" value={buyerAddress} onChange={e => setBuyerAddress(e.target.value)} placeholder="0x..." disabled={!isVerified} />
          </div>
          <div className="form-group">
            <label>MATURITY TERM:</label>
            <select value={termDays} onChange={e => setTermDays(e.target.value)} className="form-select" disabled={!isVerified}>
              <option value="30">30-Day Term (8% Financier Yield / 2% Protocol)</option>
              <option value="60">60-Day Term (8.5% Financier Yield / 1.5% Protocol)</option>
              <option value="90">90-Day Term (9% Financier Yield / 1% Protocol)</option>
            </select>
          </div>

          {amtNum > 0 && (
            <div className="breakdown-box">
              <h4>Live Pricing Breakdown</h4>
              <div className="breakdown-row">
                <span>Invoice Face Value:</span>
                <span>${amtNum.toLocaleString()} USDC</span>
              </div>
              <div className="breakdown-row text-yield">
                <span>Financier Discount Yield ({yieldPct * 100}%):</span>
                <span>-${financierYield.toLocaleString()} USDC</span>
              </div>
              <div className="breakdown-row text-fee">
                <span>Protocol Fee ({protocolFeePct * 100}%):</span>
                <span>-${protocolFee.toLocaleString()} USDC</span>
              </div>
              <hr className="divider" />
              <div className="breakdown-row text-supplier">
                <span>Immediate SME Payout:</span>
                <strong>${payoutToSupplier.toLocaleString()} USDC</strong>
              </div>
              <div className="breakdown-row text-financier" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <span>Financier Outlay Cost:</span>
                <span>${financierOutlay.toLocaleString()} USDC</span>
              </div>
            </div>
          )}

          <button className="primary btn-propose" onClick={handlePropose} disabled={!isVerified}>Submit to Buyer</button>
        </div>

        <div className="card" style={{ gridColumn: 'span 1' }}>
          <h3>My Active Invoices</h3>
          {myInvoices.length === 0 ? (
            <div className="empty-state">No invoices created.</div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Buyer</th>
                    <th>Amount</th>
                    <th>Term</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {myInvoices.map((inv) => (
                    <tr key={inv.id}>
                      <td>#{inv.id}</td>
                      <td>{inv.buyer.substring(0, 6)}...</td>
                      <td>${parseFloat(inv.amount).toLocaleString()}</td>
                      <td>{inv.termDays}d</td>
                      <td>
                        <span className={`status-pill status-${getStatusText(inv.status).toLowerCase()}`}>
                          {getStatusText(inv.status)}
                        </span>
                      </td>
                      <td>
                        {inv.status === 0 && (
                          <button className="action-btn btn-cancel" onClick={() => handleCancel(inv.id)}>Cancel</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------- //
// 3. BUYER DASHBOARD (Approve, Reject, & Repay)
// ----------------------------------------------------- //
interface BuyerProps {
  party: string;
  isVerified: boolean;
  invoices: InvoiceData[];
  setTxPending: (p: boolean) => void;
  showAlert: (type: 'success'|'error'|'info', text: string) => void;
  refreshData: () => Promise<void>;
  setActiveTab: (t: any) => void;
}

function BuyerDashboard({ party, isVerified, invoices, setTxPending, showAlert, refreshData, setActiveTab }: BuyerProps) {
  const [usdcAllowances, setUsdcAllowances] = useState<{[key: number]: string}>({});

  // Query buyer allowance for each factored invoice
  useEffect(() => {
    const fetchAllowances = async () => {
      if (!window.ethereum || invoices.length === 0) return;
      try {
        const provider = new BrowserProvider(window.ethereum as any);
        const contract = new Contract(CONTRACT_ADDRESS, primeInvoiceABI, provider);
        const usdcAddress = await contract.usdcToken();
        const usdcContract = new Contract(usdcAddress, USDC_ABI, provider);
        
        const allowanceMap: {[key: number]: string} = {};
        for (const inv of invoices) {
          if (inv.status === 2 && inv.buyer.toLowerCase() === party.toLowerCase()) {
            const allow = await usdcContract.allowance(party, CONTRACT_ADDRESS);
            allowanceMap[inv.id] = formatUnits(allow, 6);
          }
        }
        setUsdcAllowances(allowanceMap);
      } catch (err) {
        console.error("Error reading allowances:", err);
      }
    };
    fetchAllowances();
  }, [invoices, party]);

  const handleApprove = async (id: number) => {
    if (!window.ethereum) return;
    setTxPending(true);
    showAlert('info', `Approving invoice proposal #${id}...`);
    try {
      const provider = new BrowserProvider(window.ethereum as any);
      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, primeInvoiceABI, signer);

      const tx = await contract.approveInvoice(id);
      await tx.wait();
      showAlert('success', `Invoice #${id} approved successfully! It is now open for financing.`);
      await refreshData();
    } catch (err: any) {
      console.error(err);
      showAlert('error', `Approval failed: ${err.reason || err.message || err}`);
    } finally {
      setTxPending(false);
    }
  };

  const handleReject = async (id: number) => {
    if (!window.ethereum) return;
    setTxPending(true);
    showAlert('info', `Rejecting invoice proposal #${id}...`);
    try {
      const provider = new BrowserProvider(window.ethereum as any);
      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, primeInvoiceABI, signer);

      const tx = await contract.rejectInvoice(id);
      await tx.wait();
      showAlert('success', `Invoice #${id} rejected successfully.`);
      await refreshData();
    } catch (err: any) {
      console.error(err);
      showAlert('error', `Rejection failed: ${err.reason || err.message || err}`);
    } finally {
      setTxPending(false);
    }
  };

  const handleApproveUSDC = async (_id: number, amountStr: string) => {
    if (!window.ethereum) return;
    setTxPending(true);
    showAlert('info', `Approving USDC spend of $${parseFloat(amountStr).toLocaleString()}...`);
    try {
      const provider = new BrowserProvider(window.ethereum as any);
      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, primeInvoiceABI, provider);
      const usdcAddress = await contract.usdcToken();
      const usdcContract = new Contract(usdcAddress, USDC_ABI, signer);

      const amountUnits = parseUnits(amountStr, 6);
      const tx = await usdcContract.approve(CONTRACT_ADDRESS, amountUnits);
      await tx.wait();
      showAlert('success', `USDC approved. You can now proceed to repay the invoice.`);
      await refreshData();
    } catch (err: any) {
      console.error(err);
      showAlert('error', `USDC approval failed: ${err.reason || err.message || err}`);
    } finally {
      setTxPending(false);
    }
  };

  const handleRepay = async (id: number) => {
    if (!window.ethereum) return;
    setTxPending(true);
    showAlert('info', `Repaying invoice #${id} on-chain...`);
    try {
      const provider = new BrowserProvider(window.ethereum as any);
      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, primeInvoiceABI, signer);

      const tx = await contract.repayInvoice(id);
      await tx.wait();
      showAlert('success', `Invoice #${id} repaid! Funds have been sent back to the financier.`);
      await refreshData();
    } catch (err: any) {
      console.error(err);
      showAlert('error', `Repayment failed: ${err.reason || err.message || err}`);
    } finally {
      setTxPending(false);
    }
  };

  const myBuyerInvoices = invoices.filter(inv => inv.buyer.toLowerCase() === party.toLowerCase());
  const pendingApprovals = myBuyerInvoices.filter(inv => inv.status === 0);
  const outstandingInvoices = myBuyerInvoices.filter(inv => inv.status !== 0 && inv.status !== 4);

  const getStatusText = (status: number) => {
    switch (status) {
      case 1: return 'Approved';
      case 2: return 'Factored';
      case 3: return 'Repaid';
      default: return 'Unknown';
    }
  };

  return (
    <div className="role-panel buyer-panel">
      <header>
        <h2>Corporate Buyer Terminal</h2>
        <p>Logged in as: <strong>{party}</strong></p>
      </header>

      {!isVerified && (
        <div className="warning-banner">
          ⚠️ <strong>Buyer Identity Unverified:</strong> You need to pass KYC to approve invoice proposals. 
          <button className="text-btn" onClick={() => setActiveTab('kyc')}>Get Verified Now →</button>
        </div>
      )}

      <div className="card-grid">
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <h3>Pending Invoice Proposals</h3>
          {pendingApprovals.length === 0 ? (
            <div className="empty-state">No pending proposals from suppliers.</div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Supplier</th>
                    <th>Amount</th>
                    <th>Term</th>
                    <th>Due Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingApprovals.map((inv) => (
                    <tr key={inv.id}>
                      <td>#{inv.id}</td>
                      <td>{inv.supplier.substring(0, 8)}...</td>
                      <td>${parseFloat(inv.amount).toLocaleString()}</td>
                      <td>{inv.termDays} Days</td>
                      <td>{new Date(inv.dueDate * 1000).toLocaleDateString()}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="action-btn btn-approve" onClick={() => handleApprove(inv.id)} disabled={!isVerified}>Approve</button>
                          <button className="action-btn btn-reject" onClick={() => handleReject(inv.id)} disabled={!isVerified}>Reject</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card" style={{ gridColumn: 'span 2' }}>
          <h3>Approved & Escrow History</h3>
          {outstandingInvoices.length === 0 ? (
            <div className="empty-state">No outstanding invoices to pay.</div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Supplier</th>
                    <th>Amount</th>
                    <th>Due Date</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {outstandingInvoices.map((inv) => {
                    const isFactored = inv.status === 2;
                    const allowance = parseFloat(usdcAllowances[inv.id] || '0');
                    const amtNum = parseFloat(inv.amount);
                    const isApproved = allowance >= amtNum;
                    const isDue = Date.now() / 1000 >= inv.dueDate;

                    return (
                      <tr key={inv.id}>
                        <td>#{inv.id}</td>
                        <td>{inv.supplier.substring(0, 8)}...</td>
                        <td>${amtNum.toLocaleString()}</td>
                        <td>{new Date(inv.dueDate * 1000).toLocaleDateString()}</td>
                        <td>
                          <span className={`status-pill status-${getStatusText(inv.status).toLowerCase()}`}>
                            {getStatusText(inv.status)}
                          </span>
                        </td>
                        <td>
                          {isFactored && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                              {!isApproved ? (
                                <button className="action-btn btn-approve" onClick={() => handleApproveUSDC(inv.id, inv.amount)}>
                                  Approve USDC
                                </button>
                              ) : (
                                <button className="action-btn btn-fund" onClick={() => handleRepay(inv.id)}>
                                  Repay Invoice {!isDue && "(Early Repay)"}
                                </button>
                              )}
                              {!isDue && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                                  Not due until maturity
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------- //
// 4. FINANCIER DASHBOARD (Escrow Liquidity, Earn Yield)
// ----------------------------------------------------- //
interface FinancierProps {
  party: string;
  invoices: InvoiceData[];
  setTxPending: (p: boolean) => void;
  showAlert: (type: 'success'|'error'|'info', text: string) => void;
  refreshData: () => Promise<void>;
}

function FinancierDashboard({ party, invoices, setTxPending, showAlert, refreshData }: FinancierProps) {
  const [usdcAllowances, setUsdcAllowances] = useState<{[key: number]: string}>({});

  // Query financier allowance for each approved invoice
  useEffect(() => {
    const fetchAllowances = async () => {
      if (!window.ethereum || invoices.length === 0) return;
      try {
        const provider = new BrowserProvider(window.ethereum as any);
        const contract = new Contract(CONTRACT_ADDRESS, primeInvoiceABI, provider);
        const usdcAddress = await contract.usdcToken();
        const usdcContract = new Contract(usdcAddress, USDC_ABI, provider);
        
        const allowanceMap: {[key: number]: string} = {};
        for (const inv of invoices) {
          if (inv.status === 1) { // Approved
            const allow = await usdcContract.allowance(party, CONTRACT_ADDRESS);
            allowanceMap[inv.id] = formatUnits(allow, 6);
          }
        }
        setUsdcAllowances(allowanceMap);
      } catch (err) {
        console.error("Error reading allowances:", err);
      }
    };
    fetchAllowances();
  }, [invoices, party]);

  const handleApproveUSDC = async (_id: number, outlayStr: string) => {
    if (!window.ethereum) return;
    setTxPending(true);
    showAlert('info', `Approving USDC spend of $${parseFloat(outlayStr).toLocaleString()}...`);
    try {
      const provider = new BrowserProvider(window.ethereum as any);
      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, primeInvoiceABI, provider);
      const usdcAddress = await contract.usdcToken();
      const usdcContract = new Contract(usdcAddress, USDC_ABI, signer);

      const amountUnits = parseUnits(outlayStr, 6);
      const tx = await usdcContract.approve(CONTRACT_ADDRESS, amountUnits);
      await tx.wait();
      showAlert('success', `USDC approved. You can now proceed to fund the invoice.`);
      await refreshData();
    } catch (err: any) {
      console.error(err);
      showAlert('error', `USDC approval failed: ${err.reason || err.message || err}`);
    } finally {
      setTxPending(false);
    }
  };

  const handleFund = async (id: number) => {
    if (!window.ethereum) return;
    setTxPending(true);
    showAlert('info', `Funding invoice #${id} on-chain...`);
    try {
      const provider = new BrowserProvider(window.ethereum as any);
      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, primeInvoiceABI, signer);

      const tx = await contract.factorInvoice(id);
      await tx.wait();
      showAlert('success', `Invoice #${id} funded! Capital disbursed to Supplier.`);
      await refreshData();
    } catch (err: any) {
      console.error(err);
      showAlert('error', `Funding failed: ${err.reason || err.message || err}`);
    } finally {
      setTxPending(false);
    }
  };

  const incomingDemands = invoices.filter(inv => inv.status === 1);
  const myPortfolio = invoices.filter(inv => inv.financier.toLowerCase() === party.toLowerCase());

  // Pricing rules
  const getOutlayAndYield = (amountStr: string, termDays: number) => {
    const amtNum = parseFloat(amountStr);
    const yieldPct = termDays === 30 ? 0.08 : termDays === 60 ? 0.085 : 0.09;
    const financierYield = amtNum * yieldPct;
    const outlay = amtNum - financierYield;
    return { outlay, financierYield, yieldPct };
  };

  const getStatusText = (status: number) => {
    switch (status) {
      case 2: return 'Factored';
      case 3: return 'Repaid';
      default: return 'Unknown';
    }
  };

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
            Example: You fund a $100,000 90-day invoice for $91,000. At maturity, the smart contract routes exactly $100,000 back to you, 
            securing a guaranteed <strong style={{ color: 'var(--accent-cyan)' }}>$9,000 profit</strong> safely backed by corporate liabilities.
          </p>
        </div>

        <div className="card demand-card">
          <div className="risk-badge">Low Risk - Verified</div>
          <h3>Incoming Factoring Demands</h3>
          {incomingDemands.length === 0 ? (
            <div className="empty-state">No approved invoices waiting to be funded.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {incomingDemands.map((inv) => {
                const { outlay, financierYield, yieldPct } = getOutlayAndYield(inv.amount, inv.termDays);
                const allowance = parseFloat(usdcAllowances[inv.id] || '0');
                const isApproved = allowance >= outlay;

                return (
                  <div key={inv.id} style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                    <div style={{ color: 'var(--accent-cyan)', fontWeight: 700, marginBottom: '0.5rem' }}>Invoice #{inv.id}</div>
                    <div className="stat-label">Supplier: <strong>{inv.supplier.substring(0, 8)}...</strong></div>
                    <div className="stat-label">Buyer: <strong>{inv.buyer.substring(0, 8)}...</strong></div>
                    <div className="amount-highlight">
                      <span className="amount-strikethrough">${parseFloat(inv.amount).toLocaleString()}</span> → ${outlay.toLocaleString()}
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>({yieldPct * 100}% yield discount)</div>
                    </div>
                    <div className="stats-row" style={{ marginBottom: '1rem' }}>
                      <div><span className="stat-label">Term:</span> <span className="stat-value">{inv.termDays} Days</span></div>
                      <div><span className="stat-label">Earnings:</span> <span className="stat-value" style={{ color: 'var(--accent-green)' }}>+${financierYield.toLocaleString()}</span></div>
                    </div>
                    
                    {!isApproved ? (
                      <button className="primary" onClick={() => handleApproveUSDC(inv.id, outlay.toString())}>
                        Approve USDC (${outlay.toLocaleString()})
                      </button>
                    ) : (
                      <button className="primary btn-propose" onClick={() => handleFund(inv.id)}>
                        Fund Invoice
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card" style={{ gridColumn: 'span 2' }}>
          <h3>My Portfolio</h3>
          {myPortfolio.length === 0 ? (
            <div className="empty-state">No funded invoices in portfolio.</div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Supplier</th>
                    <th>Buyer</th>
                    <th>Outlay Paid</th>
                    <th>Return at Maturity</th>
                    <th>Net Profit</th>
                    <th>Maturity</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {myPortfolio.map((inv) => {
                    const { outlay, financierYield } = getOutlayAndYield(inv.amount, inv.termDays);
                    return (
                      <tr key={inv.id}>
                        <td>#{inv.id}</td>
                        <td>{inv.supplier.substring(0, 6)}...</td>
                        <td>{inv.buyer.substring(0, 6)}...</td>
                        <td>${outlay.toLocaleString()}</td>
                        <td>${parseFloat(inv.amount).toLocaleString()}</td>
                        <td style={{ color: 'var(--accent-green)', fontWeight: 600 }}>+${financierYield.toLocaleString()}</td>
                        <td>{new Date(inv.dueDate * 1000).toLocaleDateString()}</td>
                        <td>
                          <span className={`status-pill status-${getStatusText(inv.status).toLowerCase()}`}>
                            {getStatusText(inv.status)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
