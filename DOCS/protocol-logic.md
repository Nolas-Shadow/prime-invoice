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

## Security & Verification

Only addresses that have been **Verified** by the Protocol Admin can participate in the workflow. This prevents sybil attacks and ensures only legitimate corporate entities are involved in the RWA process.
