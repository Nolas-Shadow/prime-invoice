# Legal & Compliance (RWA)

Prime Invoice is a **Real-World Asset (RWA)** protocol. This means every on-chain transaction is backed by a legally enforceable debt claim in the physical world.

## The Off-Chain / On-Chain Link

The protocol bridges these two worlds through a **Master Factoring Agreement (MFA)** and specific **Assigment Notices**.

### 1. The Legal Anchor
Each invoice proposed on-chain is accompanied by a cryptographic hash (SHA-256) of the physical invoice and its associated legal assignments. This hash is stored within the on-chain metadata (IPFS CID) linked to the `invoiceId`.

### 2. Perfection of Interest
When a Financier funds an invoice (`factorInvoice`), the legal right to collect that debt is automatically assigned from the Supplier to the Financier. The on-chain transaction serves as the **Notice of Assignment**, which is a critical step for legal "perfection" in most jurisdictions (e.g., UCC filings in the US).

## Dispute Resolution

If a **Buyer** fails to repay the invoice on-chain by the maturity date, the Financier has two primary avenues for resolution:

### A. On-Chain Clawback
In cases of proven fraud or accidental non-payment, the Protocol Admin (Owner) can trigger a **Clawback** if a reserve or collateral pool is implemented. These funds are used to make the Financier whole while the legal dispute is settled off-chain.

### B. Off-Chain Legal Enforcement
Because the Financier holds a perfected legal assignment, they have the right to pursue the Buyer in traditional court systems. The decentralized ledger of Prime Invoice acts as **immutable evidence** of:
- The Buyer's original approval of the debt.
- The Financier's successful funding of the debt.
- The Buyer's failure to repay by the agreed-upon `dueDate`.

## Compliance Modules

- **KYC/KYB**: All **Suppliers and Buyers** must undergo Know-Your-Customer (KYC) or Know-Your-Business (KYB) checks before being "Verified" on-chain.
- **Privacy-First Funding**: Being a DeFi-native protocol, **Financiers** (liquidity providers) can supply capital permissionlessly and without mandatory KYC, providing they meet the blockchain-level anti-money laundering (AML) address screening.
- **Sanctions Screening**: The protocol automatically screens addresses against global sanctions lists (OFAC, etc.) prior to interaction.
