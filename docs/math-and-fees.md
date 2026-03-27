# Math and Fees

Prime Invoice uses a stable and transparent fee structure designed to incentivize both short-term liquidity and long-duration investment.

## The 10% Protocol Ceiling

The total fee for any invoice factored on the platform is fixed at **1000 Basis Points (10%)**. This fee is split between the **Protocol Treasury** and the **Financier**.

### Tiered Fee Distribution

The split is determined by the invoice's **Term Days** (30, 60, or 90 days):

| Term | Protocol Fee | Financier Yield | Total Fee |
| :--- | :--- | :--- | :--- |
| **30 Days** | 200 BPS (2%) | 800 BPS (8%) | 1000 BPS (10%) |
| **60 Days** | 150 BPS (1.5%) | 850 BPS (8.5%) | 1000 BPS (10%) |
| **90 Days** | 100 BPS (1%) | 900 BPS (9%) | 1000 BPS (10%) |

## Why Tiered Fees?

- **Financier's Perspective**: Longer duration invoices involve more capital lock-up time. We reward Financiers with a higher percentage of the fee for taking longer-term risks.
- **Protocol's Perspective**: We incentivize high-velocity, short-term factoring by taking a larger fixed split on 30-day invoices.

## Calculation Formulas

The smart contract executes the following logic during the `factorInvoice` step:

```solidity
// Example for a 30-day invoice
protocolFee = (invoiceAmount * 200) / 10000;
financierYield = (invoiceAmount * 800) / 10000;
supplierPayout = invoiceAmount - protocolFee - financierYield;
```

When the Buyer repays, they pay the **Full Invoice Amount (100%)** back to the Financier. The Financier's net profit is the `financierYield` they received during the initial funding.
