import { privateKeyToAccount } from "viem/accounts";
import { getUsdcBalance, getAgentAddress } from "./clob.js";
import type { Address } from "viem";

export interface WalletInfo {
  address: Address;
  usdcBalance: number;
  hasFunds: boolean;
}

let _agentAddress: Address | null = null;

export async function getAgentWalletInfo(): Promise<WalletInfo> {
  if (!_agentAddress) {
    _agentAddress = await getAgentAddress();
  }
  const usdcBalance = await getUsdcBalance(_agentAddress);
  return {
    address: _agentAddress,
    usdcBalance,
    hasFunds: usdcBalance > 0,
  };
}
