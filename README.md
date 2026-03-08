# PrimeFactoring 🏦 ⛓️

### Bridge Between Corporate Debt and Web3 Liquidity

PrimeFactoring is a Decentralized Invoice Marketplace built to bridge the $3T+ global supply chain finance gap. By tokenizing corporate invoices into Real-World Assets (RWAs), we provide SMEs with immediate working capital while offering Web3 investors institutional-grade, short-duration yield.

---

## 🚀 The Vision

Traditional Factoring (selling invoices for immediate cash) is broken:
- **Cash Flow Starvation:** SMEs wait 60–90 days for payment.
- **Legacy Gatekeepers:** High fees and manual overhead make "micro-invoices" (under $50k) unprofitable for banks.
- **Fraud Risk:** "Double-financing" errors are common in siloed bank systems.

**PrimeFactoring solves this on Base:**
- **Instant Settlement:** Atomic invoice funding in seconds on the Base network.
- **Low Cost:** Sub-cent transaction fees allow for micro-factoring at scale.
- **Verified Truth:** Cryptographic signatures from buyers eliminate double-financing fraud.

---

## 🛠 Tech Stack

- **Smart Contracts:** Built for the **Base (L2)** ecosystem.
- **Business Logic:** Powered by **DAML** for multi-party agreement workflows.
- **Frontend:** Modern React/Vite-based UI for Suppliers and Financiers.
- **Infrastructure:** Docker-ready for rapid deployment and testing.

---

## 📂 Repository Structure

- `/contracts`: Smart contracts for invoice tokenization and settlement.
- `/daml`: Core agreement logic and ledger templates.
- `/ui`: The PrimeFactoring dashboard and marketplace interaction layer.
- `/scripts`: Utility scripts for deployment and transaction verification.

---

## 🏗 Getting Started

### Prerequisites
- Node.js (v18+)
- Docker & Docker Compose
- [DAML SDK](https://docs.daml.com/getting-started/installation.html)

### Local Development
1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd prime-factoring
   ```

2. **Start the ledger and infrastructure:**
   ```bash
   docker-compose up -d
   ```

3. **Install UI dependencies and run:**
   ```bash
   cd ui && npm install && npm run dev
   ```

---

## 📈 Roadmap & Funding

We are currently seeking seeking a **$25,000 Ecosystem Grant** to:
1. **Bootstrap Liquidity:** Fund the first cohort of live SME invoices.
2. **Security:** Professional smart contract auditing for Mainnet launch.

---

## 📄 Documentation

- [Pitch Deck](pitch_deck.html)
- [Architecture Overview](contracts/README.md) *(If applicable)*

---

## 🤝 Contact

**Build the future of RWA on Base.**  
Reach out for partnerships or funding inquiries.
