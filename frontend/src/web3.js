// web3.js
// --------------------------------------------------------------------
// Everything needed to talk to MetaMask and the SafeUpiEscrow smart
// contract from the browser. The backend never signs these transactions -
// the sender's own MetaMask wallet does, then we tell the backend the
// resulting tx hash so it can verify what actually happened on-chain.
// --------------------------------------------------------------------

import { BrowserProvider, Contract } from "ethers";
import axios from "axios";

const API_BASE = "http://127.0.0.1:8000";

let cachedContractInfo = null;

async function getContractInfo() {
  if (cachedContractInfo) return cachedContractInfo;
  const res = await axios.get(`${API_BASE}/api/contract-info`);
  cachedContractInfo = res.data;
  return cachedContractInfo;
}

function requireMetaMask() {
  if (!window.ethereum) {
    throw new Error(
      "MetaMask isn't installed. Install the MetaMask browser extension and connect it to your local Ganache network to use SafeUPI's escrow protection."
    );
  }
}

async function getSigner() {
  requireMetaMask();
  const provider = new BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []); // prompts MetaMask if not already connected
  return provider.getSigner();
}

async function getContract(signer) {
  const { address, abi } = await getContractInfo();
  return new Contract(address, abi, signer);
}

/**
 * Sender's wallet locks the payment amount into the escrow contract.
 * Returns the tx hash and the address MetaMask actually signed with.
 */
export async function lockFundsOnChain(recipientAddress, amountWei) {
  const signer = await getSigner();
  const senderAddress = await signer.getAddress();
  const contract = await getContract(signer);

  const tx = await contract.lockFunds(recipientAddress, { value: amountWei });
  const receipt = await tx.wait();

  return { txHash: receipt.hash, senderAddress };
}

/**
 * For LOW/MEDIUM/MEDIUM-HIGH risk payments: still goes through MetaMask so
 * the sender explicitly confirms it, but sends a plain ETH transfer
 * straight to the recipient instead of locking it in the escrow contract.
 */
export async function sendDirectPaymentOnChain(recipientAddress, amountWei) {
  const signer = await getSigner();
  const senderAddress = await signer.getAddress();

  const tx = await signer.sendTransaction({ to: recipientAddress, value: amountWei });
  const receipt = await tx.wait();

  return { txHash: receipt.hash, senderAddress };
}

/** Sender confirms the payment was genuinely intentional. */
export async function releaseFundsOnChain(escrowId) {
  const signer = await getSigner();
  const contract = await getContract(signer);

  const tx = await contract.releaseFunds(escrowId);
  const receipt = await tx.wait();

  return { txHash: receipt.hash };
}

/** Sender cancels the payment (or triggers the timeout refund). */
export async function refundFundsOnChain(escrowId) {
  const signer = await getSigner();
  const contract = await getContract(signer);

  const tx = await contract.refundFunds(escrowId);
  const receipt = await tx.wait();

  return { txHash: receipt.hash };
}
