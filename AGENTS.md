# AGENTS.md - Prime Invoice Protocol

This file serves as a machine-readable guide for AI agents (coding assistants, autonomous agents, etc.) to understand and interact with the **Prime Invoice** protocol.

## Protocol Overview

Prime Invoice is a decentralized invoice factoring platform built on the **Base (L2)** network. It bridges Real-World Assets (RWA) by tokenizing corporate invoices for immediate liquidity.

### Core Architecture
- **Layer 1 (Trust):** Ethereum (via L2 settlement).
- **Layer 2 (Execution):** Base Network (Solidity Smart Contracts).
- **Business Logic:** DAML (Digital Asset Modeling Language) for multi-party agreement workflows.
- **Frontend:** React + Vite + RainbowKit (Web3 Wallet integration).

## Domain-Specific Vocabulary

| Term | Definition |
| :--- | :--- |
| **Factoring** | The process of selling an invoice to a third party (financier) at a discount for immediate cash. |
| **SME Supplier** | The business that issued the invoice and needs funding. |
| **Corporate Buyer** | The Fortune 1000 company that owes the money on the invoice. |
| **Financier** | The liquidity provider (investor) who funds the invoice as an RWA asset. |
| **Maturity** | The due date when the Corporate Buyer repays the full amount. |
| **BPS** | Basis Points (1/100th of 1%). 1000 BPS = 10% fee. |

## Development Environment

### 🛠 UI / Frontend
- **Root**: `/ui`
- **Setup**: `npm install` (Use `--legacy-peer-deps` for RainbowKit compatible Wagmi setup).
- **Dev**: `npm run dev`
- **Build**: `npm run build`
- **Tech**: React 19, Vite 7, ethers v6, wagmi v3, rainbowkit v2.

### ⛓ Smart Contracts
- **Root**: `/contracts`
- **Setup**: `npm install`
- **Test**: `npx hardhat test`
- **Deploy**: `npx hardhat run scripts/deploy.js --network base-sepolia`

## Protocol Logic (Solidity)

### Fee Tiering (Basis Points)
- **30-day term**: 200 BPS (Protocol) / 800 BPS (Financier)
- **60-day term**: 150 BPS (Protocol) / 850 BPS (Financier)
- **90-day term**: 100 BPS (Protocol) / 900 BPS (Financier)
- **Total Fee**: Fixed at 1000 BPS (10%).

### Workflow API
1.  `proposeInvoice(address _buyer, uint256 _amount, uint256 _dueDate, uint256 _termDays)`
2.  `approveInvoice(uint256 _invoiceId)`
3.  `factorInvoice(uint256 _invoiceId)` (Triggers USDC transfer from Financier)
4.  `repayInvoice(uint256 _invoiceId)` (Buyer repays Financier)

## Asset References
- **Header Logo**: `ui/public/banner_logo.svg`
- **Digital Pitch Deck**: `ui/public/pitch_deck.html` (Accessible at root `/pitch_deck.html` on Cloudflare).

## Guidelines for AI Agents
- **Code Style**: Use functional React components with hooks. Use Tailwind-like CSS variables from `App.css`.
- **Contract Interaction**: Use the `useWriteContract` and `useAccount` hooks from `wagmi`.
- **Deployment**: Always verify the Root Directory is set to `ui` on Cloudflare Pages.
