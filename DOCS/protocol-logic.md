# Protocol Logic

The Prime Invoice protocol follows a rigid 4-step lifecycle to ensure security, agreement, and legal perfection of the debt.

## Invoice Lifecycle

### 1. Propose
The process begins when a **Verified Supplier** (SME) proposes an invoice to a **Verified Buyer**.
- **Action**: `proposeInvoice`
- **Data Required**: Buyer address, Amount (USDC), Due Date, and Term (30/60/90 days).
- **Status**: `Proposed`

### 2. Approve
The **Verified Buyer** must digitally sign and approve the invoice on-chain. This step confirms the debt exists and that the Buyer intends to pay.
- **Action**: `approveInvoice`
- **Status**: `Approved`

### 3. Factor
A **Financier** (Investor) selects an approved invoice and funds it.
- **Action**: `factorInvoice`
- **Outcome**: The Financier's USDC is pulled. The Protocol takes a small fee, and the remainder (minus the Financier's yield) is sent instantly to the Supplier.
- **Status**: `Factored`

### 4. Repay
On or after the maturity date, the **Buyer** repays the full original invoice amount.
- **Action**: `repayInvoice`
- **Outcome**: The Buyer's USDC is pulled and sent directly to the Financier, completing the cycle.
- **Status**: `Repaid`

## Fee Tiering (Basis Points)

Prime Invoice uses a tiered fee structure based on the maturity of the invoice. Total fee is fixed at **1000 BPS (10%)**, split between the Protocol and the Financier (Yield).

| Term | Protocol Fee | Financier Yield | Total Fee |
| :--- | :--- | :--- | :--- |
| **30-Day** | 200 BPS (2.0%) | 800 BPS (8.0%) | 1000 BPS (10%) |
| **60-Day** | 150 BPS (1.5%) | 850 BPS (8.5%) | 1000 BPS (10%) |
| **90-Day** | 100 BPS (1.0%) | 900 BPS (9.0%) | 1000 BPS (10%) |

---

## Technical Reference (Solidity API)

For developers and integrators, the following functions define the protocol's on-chain interaction:

### Core Write Functions
- `proposeInvoice(address _buyer, uint256 _amount, uint256 _dueDate, uint256 _termDays)`: SME Supplier initiates the process.
- `approveInvoice(uint256 _invoiceId)`: Buyer confirms the debt on-chain.
- `factorInvoice(uint256 _invoiceId)`: Financier funds the invoice and triggers USDC transfer.
- `repayInvoice(uint256 _invoiceId)`: Buyer repays the original amount to the Financier.

### Verification API
- `verifyBuyer(address _buyer, bool _status)`: Administrative verification of corporate buyers.
- `verifySupplier(address _supplier, bool _status)`: Administrative verification of SME suppliers.

### Utility Functions
- `calculateFees(uint256 _amount, uint256 _termDays)`: Returns the breakdown of protocol fees and investor yield for a given transaction.
