import pkg from 'hardhat';
const { ethers } = pkg;

async function main() {
  const [owner, buyer] = await ethers.getSigners();
  const contractAddress = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
  
  console.log("Connecting to PrimeInvoice at:", contractAddress);
  const primeFactoring = await ethers.getContractAt("PrimeInvoice", contractAddress);

  const amount = ethers.parseUnits("1000", 6); // 1000 USDC
  const dueDate = Math.floor(Date.now() / 1000) + 86400 * 30; // 30 days

  console.log("Submitting proposal from Supplier:", owner.address);
  console.log("Targeting Buyer:", buyer.address);

  const tx = await primeFactoring.proposeInvoice(buyer.address, amount, dueDate);
  console.log("Transaction Hash:", tx.hash);

  const receipt = await tx.wait();
  console.log("Transaction Confirmed in Block:", receipt.blockNumber);

  const invoice = await primeFactoring.invoices(1);
  console.log("Verified Invoice State in Contract:");
  console.log(" - ID:", invoice.id.toString());
  console.log(" - Supplier:", invoice.supplier);
  console.log(" - Buyer:", invoice.buyer);
  console.log(" - Amount:", ethers.formatUnits(invoice.amount, 6), "USDC");
  console.log(" - Status:", ["Proposed", "Approved", "Factored", "Repaid", "Cancelled"][invoice.status]);

  if (invoice.id.toString() === "1") {
    console.log("\n✅ TRANSACTION COMPLETE AND VERIFIED ON LOCALHOST!");
  } else {
    console.log("\n❌ VERIFICATION FAILED.");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
