import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import hre from "hardhat";

export default buildModule("PrimeFactoringModule", (m) => {
    // 1. Deploy Mock USDC for the Testnet
    const initialSupply = hre.ethers.parseUnits("1000000", 6); // 1M USDC
    const mockUSDC = m.contract("MockERC20", ["USD Coin", "USDC", initialSupply]);

    // 2. We use the deployer's address as the initial owner of the protocol
    const protocolOwner = m.getAccount(0);

    // 3. Deploy PrimeFactoring, passing the MockUSDC address and Owner
    const primeFactoring = m.contract("PrimeFactoring", [mockUSDC, protocolOwner]);

    return { mockUSDC, primeFactoring };
});
