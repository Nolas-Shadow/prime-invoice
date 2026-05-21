import { expect } from "chai";
import hre from "hardhat";

describe("PrimeInvoice", function () {
    let usdcToken;
    let primeInvoice;
    let owner, supplier, buyer, financier;
    const initialSupply = hre.ethers.parseUnits("1000000", 6); // 1M USDC

    beforeEach(async function () {
        [owner, supplier, buyer, financier] = await hre.ethers.getSigners();

        // Deploy a mock USDC Token for testing
        const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
        usdcToken = await MockERC20.deploy("USD Coin", "USDC", initialSupply);

        // Deploy the Protocol Contract
        const PrimeInvoice = await hre.ethers.getContractFactory("PrimeInvoice");
        primeInvoice = await PrimeInvoice.deploy(usdcToken.target, owner.address);

        // Distribute testing funds
        await usdcToken.transfer(buyer.address, hre.ethers.parseUnits("100000", 6));
        await usdcToken.transfer(financier.address, hre.ethers.parseUnits("100000", 6));

        // On-chain KYC Entity Verification
        await primeInvoice.verifySupplier(supplier.address, true);
        await primeInvoice.verifyBuyer(buyer.address, true);
    });

    it("Should create an invoice correctly", async function () {
        const amount = hre.ethers.parseUnits("50000", 6);
        const dueDate = Math.floor(Date.now() / 1000) + 86400 * 30; // 30 days from now

        // Supplier creates the invoice (proposeInvoice now expects 4 arguments)
        await expect(primeInvoice.connect(supplier).proposeInvoice(buyer.address, amount, dueDate, 30))
            .to.emit(primeInvoice, "InvoiceProposed")
            .withArgs(1, supplier.address, buyer.address, amount, 30);

        const invoice = await primeInvoice.invoices(1);
        expect(invoice.supplier).to.equal(supplier.address);
        expect(invoice.amount).to.equal(amount);
        expect(invoice.termDays).to.equal(30n);
    });

    // End to end lifecycle test
    it("Should process an entire factoring lifecycle with fees", async function () {
        const amount = hre.ethers.parseUnits("10000", 6); // $10,000 Invoice
        const dueDate = Math.floor(Date.now() / 1000) + 86400 * 30; // 30-day term

        // 1. Supplier Proposes
        await primeInvoice.connect(supplier).proposeInvoice(buyer.address, amount, dueDate, 30);

        // 2. Buyer Approves
        await primeInvoice.connect(buyer).approveInvoice(1);
        const approvedInvoice = await primeInvoice.invoices(1);
        expect(approvedInvoice.status).to.equal(1); // 1 = Approved Enum

        // 3. Financier Funds (Needs to approve protocol to spend their USDC)
        // With 30-day term: 2% protocol fee ($200), 8% financier yield ($800)
        // Financier outlay = $10,000 - $800 = $9,200
        const financierOutlay = hre.ethers.parseUnits("9200", 6);
        await usdcToken.connect(financier).approve(primeInvoice.target, financierOutlay);

        await expect(primeInvoice.connect(financier).factorInvoice(1))
            .to.emit(primeInvoice, "InvoiceFactored")
            .withArgs(1, financier.address, hre.ethers.parseUnits("200", 6), hre.ethers.parseUnits("800", 6));

        // Supplier should receive $9,000 ($10,000 - $200 protocol - $800 yield)
        const supplierBalance = await usdcToken.balanceOf(supplier.address);
        expect(supplierBalance).to.equal(hre.ethers.parseUnits("9000", 6));

        // Owner (treasury) should receive the protocol fee ($200)
        // Owner starts with 1M - 200k (distributed) = 800k. Final should be 800k + 200 = 800,200
        const protocolBalance = await usdcToken.balanceOf(owner.address);
        expect(protocolBalance).to.equal(hre.ethers.parseUnits("800200", 6));

        // 4. Buyer Repays at Maturity (must advance time first)
        await hre.network.provider.send("evm_increaseTime", [86400 * 30 + 1]);
        await hre.network.provider.send("evm_mine");

        await usdcToken.connect(buyer).approve(primeInvoice.target, amount);
        await primeInvoice.connect(buyer).repayInvoice(1);

        // Financier should get their $10,000 face value back from the contract
        // Initial = 100k, spent 9,200, got back 10,000. Final = 100,800 (net $800 yield)
        const finalFinancierBal = await usdcToken.balanceOf(financier.address);
        expect(finalFinancierBal).to.equal(hre.ethers.parseUnits("100800", 6));
    });
});
