import hre from "hardhat";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const initialSupply = hre.ethers.parseUnits("1000000", 6);
  const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
  const usdc = await MockERC20.deploy("USD Coin", "USDC", initialSupply);
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("Mock USDC (6 decimals):", usdcAddress);

  const PrimeInvoice = await hre.ethers.getContractFactory("PrimeInvoice");
  const primeInvoice = await PrimeInvoice.deploy(usdcAddress, deployer.address);
  await primeInvoice.waitForDeployment();
  const protocolAddress = await primeInvoice.getAddress();
  console.log("PrimeInvoice:", protocolAddress);
  console.log("selfServiceKyc (turn off for a real pilot):", await primeInvoice.selfServiceKyc());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
