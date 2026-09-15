import { expect } from "chai";
import hre from "hardhat";

describe("PrimeInvoice", function () {
  let usdcToken;
  let primeInvoice;
  let owner, supplier, buyer, financier, stranger;
  const initialSupply = hre.ethers.parseUnits("1000000", 6);

  beforeEach(async function () {
    [owner, supplier, buyer, financier, stranger] = await hre.ethers.getSigners();

    const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
    usdcToken = await MockERC20.deploy("USD Coin", "USDC", initialSupply);

    const PrimeInvoice = await hre.ethers.getContractFactory("PrimeInvoice");
    primeInvoice = await PrimeInvoice.deploy(await usdcToken.getAddress(), owner.address);

    await usdcToken.transfer(buyer.address, hre.ethers.parseUnits("100000", 6));
    await usdcToken.transfer(financier.address, hre.ethers.parseUnits("100000", 6));

    await primeInvoice.verifySupplier(supplier.address, true);
    await primeInvoice.verifyBuyer(buyer.address, true);
  });

  async function protocolBalance() {
    return usdcToken.balanceOf(await primeInvoice.getAddress());
  }

  async function dueInDays(days) {
    const latest = await hre.ethers.provider.getBlock("latest");
    return Number(latest.timestamp) + 86400 * days;
  }

  it("uses 6-decimal mock USDC", async function () {
    expect(await usdcToken.decimals()).to.equal(6);
  });

  it("Should create an invoice correctly", async function () {
    const amount = hre.ethers.parseUnits("50000", 6);
    const dueDate = await dueInDays(30);

    await expect(primeInvoice.connect(supplier).proposeInvoice(buyer.address, amount, dueDate, 30))
      .to.emit(primeInvoice, "InvoiceProposed")
      .withArgs(1, supplier.address, buyer.address, amount, 30);

    const invoice = await primeInvoice.invoices(1);
    expect(invoice.supplier).to.equal(supplier.address);
    expect(invoice.amount).to.equal(amount);
    expect(invoice.termDays).to.equal(30n);
  });

  it("rejects a duplicate supplier/buyer/amount/dueDate invoice", async function () {
    const amount = hre.ethers.parseUnits("50000", 6);
    const dueDate = await dueInDays(30);
    await primeInvoice.connect(supplier).proposeInvoice(buyer.address, amount, dueDate, 30);
    await expect(
      primeInvoice.connect(supplier).proposeInvoice(buyer.address, amount, dueDate, 30)
    ).to.be.revertedWithCustomError(primeInvoice, "DuplicateInvoice");
  });

  it("Should process an entire factoring lifecycle without holding USDC", async function () {
    const amount = hre.ethers.parseUnits("10000", 6);
    const dueDate = await dueInDays(30);

    await primeInvoice.connect(supplier).proposeInvoice(buyer.address, amount, dueDate, 30);
    await primeInvoice.connect(buyer).approveInvoice(1);

    const financierOutlay = hre.ethers.parseUnits("9200", 6);
    await usdcToken.connect(financier).approve(await primeInvoice.getAddress(), financierOutlay);

    await expect(primeInvoice.connect(financier).factorInvoice(1))
      .to.emit(primeInvoice, "InvoiceFactored")
      .withArgs(1, financier.address, hre.ethers.parseUnits("200", 6), hre.ethers.parseUnits("800", 6));

    expect(await usdcToken.balanceOf(supplier.address)).to.equal(hre.ethers.parseUnits("9000", 6));
    expect(await usdcToken.balanceOf(owner.address)).to.equal(hre.ethers.parseUnits("800200", 6));
    expect(await protocolBalance()).to.equal(0n);

    await hre.network.provider.send("evm_increaseTime", [86400 * 30 + 1]);
    await hre.network.provider.send("evm_mine");

    await usdcToken.connect(buyer).approve(await primeInvoice.getAddress(), amount);
    await primeInvoice.connect(buyer).repayInvoice(1);

    expect(await usdcToken.balanceOf(financier.address)).to.equal(hre.ethers.parseUnits("100800", 6));
    expect(await protocolBalance()).to.equal(0n);
  });

  it("reverts repay before due date", async function () {
    const amount = hre.ethers.parseUnits("10000", 6);
    const dueDate = await dueInDays(30);
    await primeInvoice.connect(supplier).proposeInvoice(buyer.address, amount, dueDate, 30);
    await primeInvoice.connect(buyer).approveInvoice(1);
    await usdcToken.connect(financier).approve(await primeInvoice.getAddress(), hre.ethers.parseUnits("9200", 6));
    await primeInvoice.connect(financier).factorInvoice(1);

    await usdcToken.connect(buyer).approve(await primeInvoice.getAddress(), amount);
    await expect(primeInvoice.connect(buyer).repayInvoice(1)).to.be.revertedWithCustomError(
      primeInvoice,
      "InvoiceNotDue"
    );
  });

  it("allows financier to mark default after due date", async function () {
    const amount = hre.ethers.parseUnits("10000", 6);
    const dueDate = await dueInDays(30);
    await primeInvoice.connect(supplier).proposeInvoice(buyer.address, amount, dueDate, 30);
    await primeInvoice.connect(buyer).approveInvoice(1);
    await usdcToken.connect(financier).approve(await primeInvoice.getAddress(), hre.ethers.parseUnits("9200", 6));
    await primeInvoice.connect(financier).factorInvoice(1);

    await hre.network.provider.send("evm_increaseTime", [86400 * 30 + 1]);
    await hre.network.provider.send("evm_mine");

    await expect(primeInvoice.connect(stranger).markDefaulted(1)).to.be.revertedWithCustomError(
      primeInvoice,
      "Unauthorized"
    );

    await expect(primeInvoice.connect(financier).markDefaulted(1))
      .to.emit(primeInvoice, "InvoiceDefaulted")
      .withArgs(1);
    expect((await primeInvoice.invoices(1)).status).to.equal(5);
  });

  it("gates mock KYC when self-service is disabled", async function () {
    await primeInvoice.connect(stranger).mockKYCVerify(stranger.address, true, true);
    expect(await primeInvoice.verifiedSuppliers(stranger.address)).to.equal(true);

    await primeInvoice.connect(owner).setSelfServiceKyc(false);
    await expect(
      primeInvoice.connect(stranger).mockKYCVerify(buyer.address, false, true)
    ).to.be.revertedWithCustomError(primeInvoice, "SelfServiceKycDisabled");
  });

  it("rejects calculateFees for invalid terms", async function () {
    await expect(primeInvoice.calculateFees(1000, 45)).to.be.revertedWithCustomError(
      primeInvoice,
      "InvalidTerm"
    );
  });
});
