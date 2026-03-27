import pkg from 'hardhat';
const { ethers } = pkg;

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contract with account:", deployer.address);
    const provider = ethers.provider;
    const balance = await provider.getBalance(deployer.address);
    console.log("Account balance:", ethers.formatEther(balance));

    // Dummy USDC Mock? Or just pass a dummy address for the token for now, since it's just a demo.
    // Wait, no, we need to pass the USDC token address or any dummy token address to the constructor.
    const usdcTokenAddress = deployer.address; // using deployer just as a dummy address for now

    const PrimeInvoice = await ethers.getContractFactory("PrimeInvoice");
    const primeInvoice = await PrimeInvoice.deploy(usdcTokenAddress, deployer.address);

    await primeInvoice.waitForDeployment();
    console.log("PrimeInvoice deployed to:", await primeInvoice.getAddress());
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
