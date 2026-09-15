import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const accounts =
  process.env.PRIVATE_KEY !== undefined && process.env.PRIVATE_KEY !== ""
    ? [process.env.PRIVATE_KEY]
    : [];

/** @type import('hardhat/config').HardhatUserConfig */
export default {
  solidity: {
    version: "0.8.20",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    hardhat: {},
    localhost: { url: "http://127.0.0.1:8545" },
    // Chain-agnostic: set RPC_URL + PRIVATE_KEY. Examples: Sepolia, Base Sepolia, Arb Sepolia.
    sepolia: {
      url: process.env.RPC_URL || process.env.SEPOLIA_RPC_URL || "",
      accounts,
    },
    base_sepolia: {
      url: process.env.RPC_URL || process.env.BASE_SEPOLIA_RPC_URL || "",
      accounts,
    },
    arbitrum_sepolia: {
      url: process.env.RPC_URL || process.env.ARB_SEPOLIA_RPC_URL || "",
      accounts,
    },
  },
};
