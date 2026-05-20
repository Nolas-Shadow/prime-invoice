import { useState } from 'react';
import './App.css';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useWriteContract, useReadContract } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { primeInvoiceABI } from './abis';

// ------ CONFIG ------
// TODO: Replace with actual deployed Base Sepolia / Arbitrum Sepolia address
const CONTRACT_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const USDC_DECIMALS = 6;

// Invoice status enum matching the contract
const STATUS: Record<string, number> = {
  Proposed: 0,
  Approved: 1,
  Factored: 2,
  Repaid: 3,
  Cancelled: 4,
};

const STATUS_LABEL: Record<number, string> = {
  0: 'Proposed',
  1: 'Approved',
  2: 'Factored',
  3: 'Repaid',
  4: 'Cancelled',
};

// ------ Types ------
interface InvoiceData {
  id: bigint;
  supplier: string;
  buyer: string;
  financier: string;
  amount: bigint;
  dueDate: bigint;
  termDays: bigint;
  status: number;
}

// ------ Tx Status Helper ------
type TxState = { status: 'idle' } | { status: 'pending'; hash?: string } | { status: 'confirmed'; hash: string } | { status: 'error'; message: string };

function TxFeedback({ tx }: { tx: TxState }) {
  if (tx.status === 'idle') return null;
  return (
    <div className={`tx-feedback ${tx.status}`}>
      {tx.status === 'pending' && <span className="spinner" />}
      {tx.status === 'pending' && <span>Transaction pending{tx.hash ? '...' : ''}</span>}
      {tx.status === 'confirmed' && <span>✅ Confirmed: <code>{tx.hash.slice(0, 10)}...{tx.hash.slice(-6)}</code></span>}
      {tx.status === 'error' && <span>❌ {tx.message}</span>}
    </div>
  );
}

// ------ Main App ------
function App() {
  const [activeTab, setActiveTab] = useState<'supplier' | 'buyer' | 'financier'>('supplier');
  const { address, isConnected } = useAccount();
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
          <button className={activeTab === 'supplier' ? 'active' : ''} onClick={() => setActiveTab('supplier')}>
            SME Supplier
          </button>
          <button className={activeTab === 'buyer' ? 'active' : ''} onClick={() => setActiveTab('buyer')}>
            Corporate Buyer
          </button>
          <button className={activeTab === 'financier' ? 'active' : ''} onClick={() => setActiveTab('financier')}>
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

// ------ Invoice List Component (shared across roles) ------
function InvoiceRow({
  invoice,
  actions,
}: {
  invoice: InvoiceData;
  actions?: { label: string; onClick: () => void; disabled?: boolean }[];
}) {
  const amountFmt = formatUnits(invoice.amount, USDC_DECIMALS);
  const dueDate = new Date(Number(invoice.dueDate) * 1000).toLocaleDateString();
  return (
    <div className="invoice-row">
      <div className="invoice-row-header">
        <span className="invoice-id">INV-{invoice.id.toString()}</span>
        <span className={`status-badge status-${STATUS_LABEL[invoice.status]?.toLowerCase() || 'unknown'}`}>
          {STATUS_LABEL[invoice.status] || 'Unknown'}
        </span>
      </div>
      <div className="invoice-row-details">
        <span>Amount: <strong>${Number(amountFmt).toLocaleString()}</strong></span>
        <span>Term: <strong>{invoice.termDays.toString()}d</strong></span>
        <span>Due: <strong>{dueDate}</strong></span>
        {invoice.supplier !== '0x0000000000000000000000000000000000000000' && (
          <span className="addr">Supplier: {invoice.supplier.slice(0, 6)}...{invoice.supplier.slice(-4)}</span>
        )}
        {invoice.buyer !== '0x0000000000000000000000000000000000000000' && (
          <span className="addr">Buyer: {invoice.buyer.slice(0, 6)}...{invoice.buyer.slice(-4)}</span>
        )}
        {invoice.financier !== '0x0000000000000000000000000000000000000000' && (
          <span className="addr">Financier: {invoice.financier.slice(0, 6)}...{invoice.financier.slice(-4)}</span>
        )}
      </div>
      {actions && (
        <div className="invoice-row-actions">
          {actions.map((a, i) => (
            <button key={i} className="primary btn-sm" onClick={a.onClick} disabled={a.disabled}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ------ Hook: fetch all invoices from chain ------
function useInvoices() {
  const { data: nextId } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: primeInvoiceABI,
    functionName: 'nextInvoiceId',
  });
  const maxId = nextId ? Number(nextId) - 1 : 0;

  const queries = Array.from({ length: Math.max(0, maxId) }, (_, i) => i + 1);

  const results = queries.map((id) =>
    ({
      // eslint-disable-next-line react-hooks/rules-of-hooks
      ...useReadContract({
        address: CONTRACT_ADDRESS,
        abi: primeInvoiceABI,
        functionName: 'invoices',
        args: [BigInt(id)],
      }),
      id,
    })
  );

  const invoices: InvoiceData[] = [];
  let loading = nextId === undefined;

  for (const r of results) {
    if (r.data) {
      const raw = r.data as readonly [bigint, string, string, string, bigint, bigint, bigint, number];
      invoices.push({
        id: raw[0],
        supplier: raw[1],
        buyer: raw[2],
        financier: raw[3],
        amount: raw[4],
        dueDate: raw[5],
        termDays: raw[6],
        status: raw[7],
      });
    }
    if (r.isLoading) loading = true;
  }

  // Sort by ID descending (newest first)
  invoices.sort((a, b) => (a.id < b.id ? 1 : -1));

  return { invoices, loading, refreshKey: maxId };
}

// ------ Supplier Dashboard ------
function SupplierDashboard({ party }: { party: string }) {
  const [amount, setAmount] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [buyerAddress, setBuyerAddress] = useState('');
  const [termDays, setTermDays] = useState<number>(30);
  const [tx, setTx] = useState<TxState>({ status: 'idle' });

  const { writeContractAsync } = useWriteContract();

  const handlePropose = async () => {
    if (!amount || !invoiceId || !buyerAddress) {
      alert("Please enter invoice ID, amount, and Buyer Web3 Address.");
      return;
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(buyerAddress)) {
      alert("Invalid buyer address. Must be a valid 0x-prefixed Ethereum address.");
      return;
    }

    setTx({ status: 'pending' });
    try {
      const dueDate = Math.floor(Date.now() / 1000) + 86400 * termDays;
      const amountInUSDC = parseUnits(amount, USDC_DECIMALS);

      const hash = await writeContractAsync({
        abi: primeInvoiceABI,
        address: CONTRACT_ADDRESS,
        functionName: 'proposeInvoice',
        args: [buyerAddress as `0x${string}`, amountInUSDC, BigInt(dueDate), BigInt(termDays)],
      });

      setTx({ status: 'confirmed', hash });
      setAmount('');
      setInvoiceId('');
      setBuyerAddress('');
    } catch (error: any) {
      console.error(error);
      setTx({ status: 'error', message: error?.shortMessage || error?.message || 'Transaction failed' });
    }
  };

  const { invoices, loading } = useInvoices();
  const myInvoices = invoices.filter(
    (inv) => inv.supplier.toLowerCase() === (party !== 'Not Connected' ? party.toLowerCase() : '')
  );

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
            <label>INVOICE ID (reference):</label>
            <input type="text" value={invoiceId} onChange={e => setInvoiceId(e.target.value)} placeholder="INV-2024-001" />
          </div>
          <div className="form-group">
            <label>AMOUNT (USD):</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="50000" min="0" />
          </div>
          <div className="form-group">
            <label>BILLED TO (BUYER WEB3 ADDRESS):</label>
            <input type="text" value={buyerAddress} onChange={e => setBuyerAddress(e.target.value)} placeholder="0x..." />
          </div>
          <div className="form-group">
            <label>TERM (DAYS):</label>
            <select value={termDays} onChange={e => setTermDays(Number(e.target.value))}>
              <option value={30}>30 Days — 8% Financier Yield</option>
              <option value={60}>60 Days — 8.5% Financier Yield</option>
              <option value={90}>90 Days — 9% Financier Yield</option>
            </select>
          </div>
          <button className="primary btn-propose" onClick={handlePropose} disabled={tx.status === 'pending'}>
            {tx.status === 'pending' ? 'Submitting...' : 'Submit to Buyer'}
          </button>
          <TxFeedback tx={tx} />
        </div>

        <div className="card">
          <h3>My Active Invoices</h3>
          {loading ? (
            <div className="empty-state">Loading...</div>
          ) : myInvoices.length === 0 ? (
            <div className="empty-state">No active approved invoices to factor.</div>
          ) : (
            <div className="invoice-list">
              {myInvoices.map((inv) => (
                <InvoiceRow key={inv.id.toString()} invoice={inv} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ------ Buyer Dashboard ------
function BuyerDashboard({ party }: { party: string }) {
  const [tx, setTx] = useState<TxState>({ status: 'idle' });
  const { writeContractAsync } = useWriteContract();

  const { invoices, loading } = useInvoices();
  const isBuyer = party !== 'Not Connected';
  const partyLower = party.toLowerCase();

  const pendingInvoices = invoices.filter(
    (inv) => inv.status === STATUS.Proposed && inv.buyer.toLowerCase() === partyLower
  );
  const approvedInvoices = invoices.filter(
    (inv) => inv.status === STATUS.Approved && inv.buyer.toLowerCase() === partyLower
  );
  const repayableInvoices = invoices.filter(
    (inv) => inv.status === STATUS.Factored && inv.buyer.toLowerCase() === partyLower
  );

  const handleApprove = async (invoiceId: bigint) => {
    setTx({ status: 'pending' });
    try {
      const hash = await writeContractAsync({
        abi: primeInvoiceABI,
        address: CONTRACT_ADDRESS,
        functionName: 'approveInvoice',
        args: [invoiceId],
      });
      setTx({ status: 'confirmed', hash });
    } catch (error: any) {
      setTx({ status: 'error', message: error?.shortMessage || error?.message || 'Approval failed' });
    }
  };

  const handleRepay = async (invoiceId: bigint, amount: bigint) => {
    setTx({ status: 'pending' });
    try {
      // First approve USDC transfer
      const usdcABI = [
        {
          inputs: [{ internalType: 'address', name: 'spender', type: 'address' }, { internalType: 'uint256', name: 'amount', type: 'uint256' }],
          name: 'approve',
          outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
          stateMutability: 'nonpayable',
          type: 'function',
        } as const,
      ];
      await writeContractAsync({
        abi: usdcABI,
        address: CONTRACT_ADDRESS, // This will be the USDC address in production
        functionName: 'approve',
        args: [CONTRACT_ADDRESS, amount],
      });

      const hash = await writeContractAsync({
        abi: primeInvoiceABI,
        address: CONTRACT_ADDRESS,
        functionName: 'repayInvoice',
        args: [invoiceId],
      });
      setTx({ status: 'confirmed', hash });
    } catch (error: any) {
      setTx({ status: 'error', message: error?.shortMessage || error?.message || 'Repayment failed' });
    }
  };

  return (
    <div className="role-panel buyer-panel">
      <header>
        <h2>Corporate Buyer Terminal</h2>
        <p>Logged in as: <strong>{party}</strong></p>
      </header>

      <TxFeedback tx={tx} />

      <div className="card-grid">
        <div className="card">
          <h3>Pending Invoice Approvals</h3>
          {loading ? (
            <div className="empty-state">Loading...</div>
          ) : !isBuyer ? (
            <div className="empty-state">Connect your wallet to view pending approvals.</div>
          ) : pendingInvoices.length === 0 ? (
            <div className="empty-state">No pending proposals from suppliers.</div>
          ) : (
            <div className="invoice-list">
              {pendingInvoices.map((inv) => (
                <InvoiceRow
                  key={inv.id.toString()}
                  invoice={inv}
                  actions={[{ label: 'Approve Invoice', onClick: () => handleApprove(inv.id), disabled: tx.status === 'pending' }]}
                />
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3>Outstanding (Approved & Funded)</h3>
          {loading ? (
            <div className="empty-state">Loading...</div>
          ) : !isBuyer ? (
            <div className="empty-state">Connect your wallet to view outstanding invoices.</div>
          ) : (
            <>
              {approvedInvoices.length > 0 && (
                <>
                  <h4 style={{ color: 'var(--accent-blue)', margin: '1rem 0 0.5rem' }}>Approved (Awaiting Funding)</h4>
                  {approvedInvoices.map((inv) => (
                    <InvoiceRow key={inv.id.toString()} invoice={inv} />
                  ))}
                </>
              )}
              {repayableInvoices.length > 0 && (
                <>
                  <h4 style={{ color: 'var(--accent-cyan)', margin: '1rem 0 0.5rem' }}>Funded (Due for Repayment)</h4>
                  {repayableInvoices.map((inv) => (
                    <InvoiceRow
                      key={inv.id.toString()}
                      invoice={inv}
                      actions={[{ label: 'Repay Invoice', onClick: () => handleRepay(inv.id, inv.amount), disabled: tx.status === 'pending' }]}
                    />
                  ))}
                </>
              )}
              {approvedInvoices.length === 0 && repayableInvoices.length === 0 && (
                <div className="empty-state">No outstanding invoices to manage.</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ------ Financier Dashboard ------
function FinancierDashboard({ party }: { party: string }) {
  const [tx, setTx] = useState<TxState>({ status: 'idle' });
  const [selectedInvoice, setSelectedInvoice] = useState<bigint | null>(null);
  const { writeContractAsync } = useWriteContract();

  const { invoices, loading } = useInvoices();

  // Invoices that are Approved (ready to be factored/funded)
  const fundableInvoices = invoices.filter((inv) => inv.status === STATUS.Approved);

  // Invoices I have already funded
  const partyLower = party.toLowerCase();
  const myFundedInvoices = invoices.filter(
    (inv) => inv.financier.toLowerCase() === partyLower && (inv.status === STATUS.Factored || inv.status === STATUS.Repaid)
  );

  const handleFactor = async (invoice: InvoiceData) => {
    setSelectedInvoice(invoice.id);
    setTx({ status: 'pending' });
    try {
      // First approve USDC transfer to the contract
      const usdcApproveABI = [
        {
          inputs: [{ internalType: 'address', name: 'spender', type: 'address' }, { internalType: 'uint256', name: 'amount', type: 'uint256' }],
          name: 'approve',
          outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
          stateMutability: 'nonpayable',
          type: 'function',
        } as const,
      ];
      await writeContractAsync({
        abi: usdcApproveABI,
        address: CONTRACT_ADDRESS, // In production, this should be the USDC address
        functionName: 'approve',
        args: [CONTRACT_ADDRESS, invoice.amount],
      });

      const hash = await writeContractAsync({
        abi: primeInvoiceABI,
        address: CONTRACT_ADDRESS,
        functionName: 'factorInvoice',
        args: [invoice.id],
      });
      setTx({ status: 'confirmed', hash });
    } catch (error: any) {
      console.error(error);
      setTx({ status: 'error', message: error?.shortMessage || error?.message || 'Funding failed' });
    }
    setSelectedInvoice(null);
  };

  const formatFee = (_amount: bigint, termDays: bigint, isYield: boolean) => {
    if (termDays === 30n) return isYield ? '8%' : '2%';
    if (termDays === 60n) return isYield ? '8.5%' : '1.5%';
    return isYield ? '9%' : '1%';
  };

  return (
    <div className="role-panel financier-panel">
      <header>
        <h2>Institutional Financier Terminal</h2>
        <p>Logged in as: <strong>{party}</strong></p>
      </header>

      <TxFeedback tx={tx} />

      <div className="card-grid">
        <div className="info-section">
          <h3>Why Provide Liquidity? (The Incentive)</h3>
          <p>
            Financiers fund approved invoices at a fixed <strong style={{ color: 'var(--accent-cyan)' }}>10% total discount</strong> across the Base network.
            Yields are structured dynamically based on the invoice's maturity date.
          </p>
          <ul className="yield-table">
            <li><span><strong>30-Day Invoice:</strong> 8% Yield to Financier</span><span className="yield-value">(2% Protocol Fee)</span></li>
            <li><span><strong>60-Day Invoice:</strong> 8.5% Yield to Financier</span><span className="yield-value">(1.5% Protocol Fee)</span></li>
            <li><span><strong>90-Day Invoice:</strong> 9% Yield to Financier</span><span className="yield-value">(1% Protocol Fee)</span></li>
          </ul>
        </div>

        <div className="card demand-card">
          <div className="risk-badge">Low Risk — Verified</div>
          <h3>Incoming Factoring Demands</h3>

          {loading ? (
            <div className="empty-state">Loading available invoices...</div>
          ) : fundableInvoices.length === 0 ? (
            <div className="empty-state">No approved invoices available for funding yet. Check back after buyers approve supplier proposals.</div>
          ) : (
            <div className="invoice-list">
              {fundableInvoices.map((inv) => {
                const amountFmt = formatUnits(inv.amount, USDC_DECIMALS);
                const yieldStr = formatFee(inv.amount, inv.termDays, true);
                const feeStr = formatFee(inv.amount, inv.termDays, false);
                return (
                  <div key={inv.id.toString()} className="funding-card">
                    <div className="invoice-id">INV-{inv.id.toString()}</div>
                    <div className="amount-highlight">
                      <span className="amount-strikethrough">${Number(amountFmt).toLocaleString()}</span>
                      {' → '}${(Number(amountFmt) * 0.9).toLocaleString()}
                    </div>
                    <div className="stats-row">
                      <div><span className="stat-label">Term:</span> <span className="stat-value">{inv.termDays.toString()} Days</span></div>
                      <div><span className="stat-label">Yield:</span> <span className="stat-value" style={{ color: 'var(--accent-green)' }}>{yieldStr}</span></div>
                      <div><span className="stat-label">Fee:</span> <span className="stat-value">{feeStr}</span></div>
                    </div>
                    <div className="stats-row">
                      <span className="addr">Supplier: {inv.supplier.slice(0, 6)}...{inv.supplier.slice(-4)}</span>
                      <span className="addr">Buyer: {inv.buyer.slice(0, 6)}...{inv.buyer.slice(-4)}</span>
                    </div>
                    <button
                      className="primary"
                      onClick={() => handleFactor(inv)}
                      disabled={tx.status === 'pending' && selectedInvoice === inv.id}
                      style={{ marginTop: '0.75rem' }}
                    >
                      {tx.status === 'pending' && selectedInvoice === inv.id ? 'Funding...' : 'Fund Invoice'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {myFundedInvoices.length > 0 && (
          <div className="card">
            <h3>My Funded Invoices</h3>
            <div className="invoice-list">
              {myFundedInvoices.map((inv) => {
                const dueDate = new Date(Number(inv.dueDate) * 1000).toLocaleDateString();
                return (
                  <div key={inv.id.toString()} className="invoice-row">
                    <div className="invoice-row-header">
                      <span className="invoice-id">INV-{inv.id.toString()}</span>
                      <span className={`status-badge status-${STATUS_LABEL[inv.status]?.toLowerCase()}`}>
                        {STATUS_LABEL[inv.status]}
                      </span>
                    </div>
                    <div className="invoice-row-details">
                      <span>Funded: <strong>${Number(formatUnits(inv.amount, USDC_DECIMALS)).toLocaleString()}</strong></span>
                      <span>Due: <strong>{dueDate}</strong></span>
                      <span>Yield: <strong style={{ color: 'var(--accent-green)' }}>{formatFee(inv.amount, inv.termDays, true)}</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;