# Prime Invoice — Protocol Audit & Fix Plan

**Audience:** Jimmy (owner)  
**Date:** 2026-09-15  
**Scope:** Map the repo against README/docs claims, find what is broken or unsafe for a pilot, and list concrete broken→fix items. Business model is unchanged. Base is **not** required.

**Pilot assumption (from owner):** the product never takes custody of funds. Funding is non-custodial through the protocol.

---

## 1. Repo map — implemented vs claimed

| Area | What exists | What README / docs claim | Verdict |
| :--- | :--- | :--- | :--- |
| `/contracts` | `PrimeInvoice.sol` + `MockERC20.sol` only. No compiler config, no deploy script, no tests (Hardhat was deleted in `7eb81dc`). | “Security-first” Solidity; invoice tokenization and settlement | **Partial.** Lifecycle functions exist. Not tokens. Not compile/testable in-repo until tooling is restored. |
| `/daml` | `Main.daml` templates + `setup` script. `daml.yaml` SDK 2.8.0 | “DAML for multi-party agreement workflows and legal perfection” | **Does not compile.** Ledger is a sketch, not wired to the UI. |
| `/ui` | React/Vite + RainbowKit dashboard (supplier / buyer / financier / mock KYC) | Institutional UI for suppliers and financiers | **On-chain UI only.** Talks to Solidity. DAML client is dead code. Wallet chain hard-coded to Base Sepolia. |
| `/DOCS` | VitePress: intro, protocol logic, fees, legal | Technical specs and user guides | **Docs over-claim.** Clawback, invoice hash/IPFS, sanctions, tokenization are documented but not in code. |
| `/scripts` | `daml-solidity-bridge.js` event relayer | Implied DAML↔EVM sync | **Non-functional.** Wrong identity model, no JSON API in Compose, errors swallowed. |
| `/config` + `docker-compose.yaml` | Canton 2.7.9 participant + synchronizer + Postgres | Local ledger for DAML | **Won’t run a usable ledger.** Shared DB, no domain connect, no HTTP JSON API on `:7575`. |

### What the Solidity contract actually implements

Happy path in `contracts/PrimeInvoice.sol`:

1. Owner (or anyone, via public `mockKYCVerify`) marks supplier/buyer verified  
2. Supplier `proposeInvoice`  
3. Buyer `approveInvoice` (or `rejectInvoice`); supplier may `cancelInvoice` while `Proposed`  
4. Anyone `factorInvoice` (pull USDC, pay protocol fee + supplier)  
5. Buyer `repayInvoice` after `dueDate` (pull face value, pay financier)

Missing vs docs / owner intent: clawback, default status, document hash / IPFS, uniqueness against double-financing, sanctions, NFT/RWA token, DAML legal perfection, non-custodial routing (funds currently land in the contract first).

### What DAML actually implements

Templates: `InvoiceProposal` → `Invoice` → `FactoringRequest` → `FactoredInvoice`. Choices exist for accept/reject, request factoring, fund, cancel factoring, pay maturity. **Payments are comments only.** `setup` omits `termDays`. Field lists are inconsistent (`termDays` on proposal only), so `daml build` fails.

### What the UI actually implements

- Connect wallet (RainbowKit, **Base Sepolia only**)  
- Self-serve “KYC” calling public `mockKYCVerify` (company name / EIN are not stored)  
- Propose / cancel / approve / reject / USDC approve / factor / repay  
- Polls `invoices(1..nextId-1)` every 10s  
- Copy still says “Base Network”  
- `ui/src/damlClient.ts` is **never imported**

---

## 2. Broken, incomplete, or unsafe for a pilot

### 2.1 End-to-end flow: create → fund → settle → clawback

| Step | Solidity | UI | DAML | Pilot-ready? |
| :--- | :--- | :--- | :--- | :--- |
| Create invoice | `proposeInvoice` | Supplier form | Broken compile; bridge can’t create real parties | **Almost** (on-chain only) |
| Fund | `factorInvoice` | Financier approve+fund | Bridge cannot exercise as ETH addresses | **Unsafe custody** (pre-fix) |
| Settle | `repayInvoice` after due date | Button shown before due (“Early Repay”) but **tx reverts** | Same bridge gap | **UI lie + no early repay** |
| Clawback / default | **Not implemented** | **Not implemented** | **Not implemented** | **Missing** |

Docs (`DOCS/legal-and-compliance.md`) describe on-chain clawback via admin + reserve. There is no `Defaulted` status, no clawback function, no reserve. If the buyer never pays, the financier’s USDC is gone and the invoice stays `Factored` forever.

### 2.2 Custody (conflicts with “we never take custody”)

`factorInvoice` and `repayInvoice` do `safeTransferFrom(..., address(this), ...)` then `safeTransfer` out. In one transaction this is atomic, but:

- The **contract is the token holder** for that call (custodial routing).  
- A historical bug (fixed in `14a68dd`) pulled the **full** face value and left `financierYield` stuck in the contract. The remaining pattern is the same class of bug: the contract is a piggy-bank.  
- Correct non-custodial pattern: `transferFrom(payer, recipient, amount)` so USDC goes **financier → supplier/treasury** and **buyer → financier** without the protocol address ever holding a balance.

Protocol fee to `owner()` is an explicit treasury payment, not “holding user funds.” That is fine if disclosed.

### 2.3 Keys, KYC, admin

- `mockKYCVerify` is **public**. Any wallet can verify any address as supplier or buyer. The UI “Identity & KYC Hub” is a label over this call. Company name / tax ID never leave the browser.  
- Real `verifyBuyer` / `verifySupplier` are `onlyOwner`, but the mock bypasses them.  
- No sanctions / AML screening (claimed in legal docs).  
- Owner can `renounceOwnership` and freeze the only real KYC path.  
- Relayer has no DAML JWT / party operator keys; JSON API calls would be unauthenticated and use Ethereum addresses as if they were DAML parties (they are not).  
- `.env.example` ships a WalletConnect project id (normal for WC; not a private key). No protocol private keys in repo. **There is no deploy key management** because deploy tooling was removed.

### 2.4 Compile / test / deploy failures

- **Contracts:** OpenZeppelin imports, but no `package.json`, Hardhat, or Foundry. `npm test` / `forge test` cannot run. Ignition deploy history was deleted.  
- **MockERC20** uses default **18 decimals**; protocol + UI assume **6** (USDC). Wallets that read `decimals()` will show wrong units.  
- **DAML:** `setup` creates `InvoiceProposal` without `termDays`. `AcceptInvoice` does `create Invoice with ..` but `Invoice` has no `termDays`. `CancelFactoring` does `create Invoice with ..` from a template with extra fields (`financier`, `discountedAmount`).  
- **Canton Compose:** participant and synchronizer share `canton_db`; participant.conf never connects to the domain; **no `http-json` service on 7575** (UI + bridge both target it). Image `2.7.9` vs `daml.yaml` SDK `2.8.0`.  
- **Bridge:** `scripts/` has no `package.json`. Failures are `console.warn` + continue, so a silent empty DAML ledger looks “healthy.”  
- **UI:** `damlClient.ts` unused. Chain list is `[baseSepolia]` only.  
- **CI:** only VitePress docs deploy. No contract/UI/DAML CI.

### 2.5 Double-financing / legal perfection (claimed, not built)

- README: cryptographic signatures eliminate double-financing. Reality: `msg.sender` checks, incrementing `id`, **no invoice document hash, no IPFS CID, no uniqueness on (supplier, buyer, amount, due date, document)**. Same commercial invoice can be proposed many times.  
- Legal doc: SHA-256 of the physical invoice stored on-chain. **No such field.**  
- Invoices are a **struct**, not an ERC-721/1155 “RWA token.”

### 2.6 Chain coupling (do not require Base)

Hard-coupled to Base **in the UI and copy**, not in Solidity.

| Location | Coupling | How to make chain-agnostic |
| :--- | :--- | :--- |
| `ui/src/main.tsx` | `chains: [baseSepolia]` | Drive chain(s) from `VITE_CHAIN_ID` / `VITE_CHAIN_IDS`. Solidity is already EVM-generic. |
| `ui/src/App.tsx` | “Base Network”, “Base network” copy | Neutral “on-chain” copy. |
| `DOCS/introduction.md` | “built on Base” | Describe as EVM; Base as one deployment target. |
| Deleted Hardhat config (git history) | `base_sepolia` **and** `arbitrum_sepolia` | Restore multi-network deploy via `RPC_URL` + chain id. |

USDC address is a constructor argument — already chain-agnostic. Do not bake in Base USDC.

### 2.7 Other pilot hazards

- `repayInvoice` reverts with `InvoiceNotDue` before maturity; UI still offers “Early Repay.”  
- `factorInvoice` does not check `dueDate`; an approved invoice can be funded **after** it is already due.  
- `calculateFees` treats any non-30/60 term as 90-day.  
- No pause, no default path, no financier allowlist (may be intended), no invoice size floor (docs say >$50k; code allows 1 unit).  
- UI lists invoices with N `eth_call`s (OK for a handful of pilot invoices, not a marketplace).  
- Fee math uses float in the UI (`parseFloat`) vs integer BPS on-chain — display can disagree by cents.

---

## 3. Fix plan

**Done** means: a new engineer can run the flow on a local or any EVM testnet without the protocol holding user USDC, without a public KYC backdoor on a “pilot” deploy, and with tests that fail if those properties regress.

### P0 — blockers for a working end-to-end pilot

| ID | What’s wrong | Where | Done looks like |
| :--- | :--- | :--- | :--- |
| **P0-1** | Funds route through `address(this)` (custody + leftover-balance class of bug) | `contracts/PrimeInvoice.sol` `factorInvoice`, `repayInvoice` | `transferFrom(financier, owner, fee)` + `transferFrom(financier, supplier, payout)`; `transferFrom(buyer, financier, amount)`. After each tx, `balanceOf(protocol) == 0`. Tests assert this. |
| **P0-2** | No compile/test/deploy path (Hardhat removed; OZ unresolved) | `/contracts` (git `7eb81dc`) | `contracts/` has Hardhat + OZ, `npx hardhat test` green, `deploy.js` deploys **MockERC20 + PrimeInvoice** (old script passed deployer as the USDC address — unusable). |
| **P0-3** | `MockERC20` is 18 decimals; protocol assumes 6 | `contracts/MockERC20.sol` | `decimals() == 6`; tests mint/parse with 6. |
| **P0-4** | Public `mockKYCVerify` makes “verified buyer” meaningless | `PrimeInvoice.sol`, `ui/src/App.tsx` | Self-serve KYC is an **owner-toggled demo flag** (on for local demo, off for pilot). Pilot uses `onlyOwner` `verifySupplier` / `verifyBuyer`. |
| **P0-5** | UI “Early Repay” cannot succeed | `ui/src/App.tsx` `handleRepay`; `repayInvoice` | Repay disabled until `dueDate`; copy does not promise early repay. (Optional later: explicit `allowEarlyRepay` protocol change — out of scope unless product asks.) |
| **P0-6** | DAML does not compile | `daml/Main.daml` | `daml build` succeeds: `termDays` on all templates, `setup` supplies it, `CancelFactoring` constructs `Invoice` with explicit fields. |
| **P0-7** | No default / clawback — financier stuck | Contract + legal docs | **Minimum for pilot:** `Defaulted` status + `markDefaulted` (financier or owner, after due). **Do not** fake a USDC clawback from the supplier — they already spent payout. Real make-whole needs an off-chain legal process and/or a separate reserve (product decision, not this patch). |
| **P0-8** | Wallet hard-coded to Base Sepolia | `ui/src/main.tsx`, copy | `VITE_CHAIN_ID` selects chain. Contract unchanged. |
| **P0-9** | DAML/Canton/bridge cannot sync | `docker-compose.yaml`, `config/*`, `scripts/daml-solidity-bridge.js`, `ui/src/damlClient.ts` | **Large.** Separate DBs is a small correctness fix. Full JSON API + party-to-address registry + authenticated relayer is a project. **Pilot can ship Solidity-only** if DAML is labeled “legal workflow v2.” |
| **P0-10** | Double-finance: no document identity | `proposeInvoice` | Unique `bytes32 documentHash` (or unique key on supplier+buyer+amount+dueDate). UI collects or hashes a file. |

**This PR implements P0-1 through P0-8 (status-only default, not fund clawback) plus a uniqueness key (P0-10 lite) and Canton DB split. P0-9 (full DAML bridge) is explicitly deferred.** Solidity sources for the Hardhat project live in `/contracts/contracts/` (Hardhat default). Run `cd contracts && npm test`.

### P1 — important before real capital

| ID | What’s wrong | Where | Done looks like |
| :--- | :--- | :--- | :--- |
| **P1-1** | `factorInvoice` / `approveInvoice` allowed after `dueDate` | `PrimeInvoice.sol` | Revert `PastDueDate` if `block.timestamp >= dueDate`. |
| **P1-2** | No pause / no way to freeze factoring if USDC or oracle issues | Contract | `Pausable` on propose/factor/repay. |
| **P1-3** | Docs claim IPFS CID, MFA, UCC perfection | `DOCS/legal-and-compliance.md` vs contract | Either implement `documentHash` + off-chain MFA store or strike the claims. |
| **P1-4** | Canton: no domain connect, SDK 2.8 vs image 2.7.9, no JSON API | Compose + `participant.conf` | Working `docker compose up` → `daml ledger` + JSON API `:7575` with unsafe tokens **only** for localnet. |
| **P1-5** | Bridge uses ETH addresses as DAML parties | `scripts/daml-solidity-bridge.js` | Map `address → Party` via an operator-allocated party; sign JSON API with the right token; do not swallow errors. |
| **P1-6** | UI never uses DAML | `ui/src/damlClient.ts` | Delete or wire: show ledger contracts next to chain status. |
| **P1-7** | `$50k` minimum and Fortune-1000 buyer story not enforced | `proposeInvoice` | Policy checks or honest docs. |
| **P1-8** | No CI for contracts/UI | `.github/workflows` | `hardhat test` + `ui` build on PR. |
| **P1-9** | Relayer `package.json` missing | `/scripts` | `npm install && node daml-solidity-bridge.js` documented. |
| **P1-10** | `calculateFees` silent fallback to 90-day | `PrimeInvoice.sol` | Revert `InvalidTerm`. |

### P2 — polish

| ID | What’s wrong | Done looks like |
| :--- | :--- | :--- |
| **P2-1** | UI fee math is IEEE floats | Use contract `calculateFees` for display. |
| **P2-2** | Invoice scan is O(n) RPC | Emit events + cache, or `getInvoices` view / indexer. |
| **P2-3** | Pitch/docs still say Base-only / “tokenize” | Align marketing with struct+assignment, not NFT. |
| **P2-4** | No invoice size/term consistency (`dueDate` vs `termDays`) | Require `dueDate` within tolerance of `termDays`. |
| **P2-5** | Owner fee recipient is EOA | Document multisig/treasury for pilot. |
| **P2-6** | Financier can be the supplier | Decide: allow (wash) or forbid. |
| **P2-7** | `ui/README.md` is still the Vite template | How to run: env, chain id, mock USDC faucet. |

---

## 4. What this repo PR changed (small P0s)

Implemented because they are small and locally correct:

1. Non-custodial USDC routing (P0-1)  
2. Hardhat restored + lifecycle tests including `balanceOf(protocol)==0` (P0-2)  
3. Mock USDC 6 decimals (P0-3)  
4. `selfServiceKyc` flag (P0-4)  
5. UI: repay only when due; chain from env (P0-5, P0-8)  
6. DAML fields/`setup` so the module can typecheck (P0-6)  
7. `Defaulted` + `markDefaulted` (P0-7 status only)  
8. Duplicate invoice key (P0-10 lite)  
9. Reject approve/factor after due date (P1-1, cheap while touching the same functions)  
10. Canton Postgres split (necessary, not sufficient, for P0-9)

**Not in this PR:** working Canton JSON API, ETH↔DAML identity, IPFS, sanctions, NFT, fund clawback/reserve, production KYC vendor.

---

## 5. Recommended pilot architecture (no business-model change)

- **Settlement source of truth:** Solidity on **any EVM** (set USDC + chain in env).  
- **DAML:** optional legal workflow; do not block the pilot on the relayer.  
- **KYC:** owner allowlist for supplier/buyer; financiers permissionless as already specified.  
- **Default:** `markDefaulted` + off-chain collection. Add a reserve later if you want protocol make-whole.  
- **Custody:** never `transfer` to `address(this)` for user principal.

---

## 6. Top 5 P0 items (action list)

1. **Non-custodial settlement** — stop parking USDC in the protocol contract.  
2. **Restore compile/test/deploy** — Hardhat + real Mock USDC, not “deployer address is USDC.”  
3. **Kill public KYC backdoor on pilot deploys** — `selfServiceKyc = false`.  
4. **Default path** — status + ops runbook; no fake on-chain clawback of spent supplier funds.  
5. **Honest DAML** — either make the ledger compile and isolate it as v2, or drop “legal perfection on DAML” from the pitch until the bridge has real parties and auth.
