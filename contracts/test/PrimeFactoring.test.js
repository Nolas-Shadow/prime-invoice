import { expect } from "chai";
import hre from "hardhat";

describe("PrimeFactoring", function () {
    let usdcToken;
    let primeFactoring;
    let owner, supplier, buyer, financier;
    const initialSupply = hre.ethers.parseUnits("1000000", 6); // 1M USDC

    beforeEach(async function () {
        [owner, supplier, buyer, financier] = await hre.ethers.getSigners();

        // Deploy a mock USDC Token for testing
        const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
        usdcToken = await MockERC20.deploy("USD Coin", "USDC", initialSupply);

        // Deploy the Protocol Contract
        const PrimeFactoring = await hre.ethers.getContractFactory("PrimeFactoring");
        primeFactoring = await PrimeFactoring.deploy(usdcToken.target, owner.address);

        // Distribute testing funds
        await usdcToken.transfer(buyer.address, hre.ethers.parseUnits("100000", 6));
        await usdcToken.transfer(financier.address, hre.ethers.parseUnits("100000", 6));
    });

    it("Should create an invoice correctly", async function () {
        const amount = hre.ethers.parseUnits("50000", 6);
        const dueDate = Math.floor(Date.now() / 1000) + 86400 * 30; // 30 days from now

        // Supplier creates the invoice
        await expect(primeFactoring.connect(supplier).proposeInvoice(buyer.address, amount, dueDate))
            .to.emit(primeFactoring, "InvoiceProposed")
            .withArgs(1, supplier.address, buyer.address, amount);

        const invoice = await primeFactoring.invoices(1);
        expect(invoice.supplier).to.equal(supplier.address);
        expect(invoice.amount).to.equal(amount);
    });

    // End to end lifecycle test
    it("Should process an entire factoring lifecycle with fees", async function () {
        const amount = hre.ethers.parseUnits("10000", 6); // $10,000 Invoice
        const dueDate = Math.floor(Date.now() / 1000) + 86400 * 30;

        // 1. Supplier Proposes
        await primeFactoring.connect(supplier).proposeInvoice(buyer.address, amount, dueDate);

        // 2. Buyer Approves
        await primeFactoring.connect(buyer).approveInvoice(1);
        const approvedInvoice = await primeFactoring.invoices(1);
        expect(approvedInvoice.status).to.equal(1); // 1 = Approved Enum

        // 3. Financier Funds (Needs to approve protocol to spend their USDC first)
        await usdcToken.connect(financier).approve(primeFactoring.target, amount);

        // Expect 100 bps protocol fee = $100.00
        // Supplier should receive $9900.00
        // Financier spends $10000.00
        await expect(primeFactoring.connect(financier).factorInvoice(1))
            .to.emit(primeFactoring, "InvoiceFactored")
            .withArgs(1, financier.address);

        const supplierBalance = await usdcToken.balanceOf(supplier.address);
        expect(supplierBalance).to.equal(hre.ethers.parseUnits("9900", 6));

        const protocolBalance = await usdcToken.balanceOf(owner.address);
        // Base 1M supply - 200k given out + $100 fee = 800100
        expect(protocolBalance).to.equal(hre.ethers.parseUnits("800100", 6));

        // 4. Buyer Repays at Maturity
        await usdcToken.connect(buyer).approve(primeFactoring.target, amount);
        await primeFactoring.connect(buyer).repayInvoice(1);

        // Financier should get their $10,000 principal/yield back from the contract
        const finalFinancierBal = await usdcToken.balanceOf(financier.address);
        expect(finalFinancierBal).to.equal(hre.ethers.parseUnits("100000", 6));
    });
});
