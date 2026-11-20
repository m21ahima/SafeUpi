"""
blockchain.py
-------------
Talks to the SafeUpiEscrow smart contract deployed on Ganache via web3.py.

IMPORTANT: the sender's wallet (MetaMask, in the browser) is what actually
calls lockFunds() / releaseFunds() / refundFunds() and pays gas for them -
this backend never holds a private key and never signs a transaction. Its
job is read-only verification: after the frontend tells us "here's the tx
hash MetaMask gave me", we look that transaction up on-chain ourselves and
confirm it really did what it claims, instead of trusting the frontend.

get_contract_info() reads the address + ABI straight out of Truffle's build
artifact, so the frontend/backend never need the address hardcoded or
manually copy-pasted after every `truffle migrate`.
"""

import json
import os

from web3 import Web3

# --------------------------------------------------------------------
# Config
# --------------------------------------------------------------------

GANACHE_URL = os.environ.get("GANACHE_URL", "http://127.0.0.1:7545")

CONTRACT_BUILD_PATH = os.path.join(
    os.path.dirname(__file__), "..", "blockchain", "build", "contracts", "SafeUpiEscrow.json"
)

# DEMO-ONLY conversion rate between rupees (what the UI shows) and wei
# (what the contract deals in). There's no real UPI<->ETH exchange here -
# this just gives every payment a proportional, non-zero on-chain value so
# the escrow amounts are meaningful during a demo.
# 10,000 => 1 ETH.
DEMO_WEI_PER_RUPEE = 10**14

w3 = Web3(Web3.HTTPProvider(GANACHE_URL))


def rupees_to_wei(amount_rupees: float) -> int:
    return int(round(amount_rupees * DEMO_WEI_PER_RUPEE))


# --------------------------------------------------------------------
# Contract loading
# --------------------------------------------------------------------

def _load_contract_artifact() -> dict:
    if not os.path.exists(CONTRACT_BUILD_PATH):
        raise RuntimeError(
            "Contract build artifact not found. Run `truffle migrate` inside "
            "the /blockchain folder (with Ganache running) first."
        )
    with open(CONTRACT_BUILD_PATH) as f:
        return json.load(f)


def get_contract_info() -> dict:
    """Returns {address, abi, network_id} for whatever network the contract
    was last deployed to. The frontend calls GET /api/contract-info (which
    wraps this) to build the exact same contract instance MetaMask will use."""
    artifact = _load_contract_artifact()
    abi = artifact["abi"]
    networks = artifact.get("networks", {})

    if not networks:
        raise RuntimeError(
            "Contract exists but hasn't been deployed to any network yet. "
            "Run `truffle migrate` inside /blockchain with Ganache running."
        )

    # Truffle keys `networks` by network id - take the most recent deployment.
    network_id = list(networks.keys())[-1]
    address = networks[network_id]["address"]

    return {"address": address, "abi": abi, "network_id": network_id}


def _get_contract():
    info = get_contract_info()
    return w3.eth.contract(address=info["address"], abi=info["abi"])


# --------------------------------------------------------------------
# On-chain verification (read-only - no private key involved)
# --------------------------------------------------------------------

def verify_lock_transaction(tx_hash: str, expected_sender: str, expected_amount_wei: int) -> dict:
    """Confirms a lockFunds() call really happened on-chain, was made by the
    same person who submitted the payment, and locked the right amount -
    then pulls the real escrow id out of the FundsLocked event log rather
    than trusting whatever the frontend sends."""
    receipt = w3.eth.get_transaction_receipt(tx_hash)
    if receipt is None or receipt.status != 1:
        raise ValueError("Transaction not found or failed on-chain")

    contract = _get_contract()
    events = contract.events.FundsLocked().process_receipt(receipt)
    if not events:
        raise ValueError("This transaction did not lock funds in the SafeUPI escrow contract")

    args = events[0]["args"]
    if args["sender"].lower() != expected_sender.lower():
        raise ValueError("Transaction sender does not match the payment's sender")
    if args["amount"] != expected_amount_wei:
        raise ValueError("Locked amount does not match the analyzed payment amount")

    return {
        "escrow_id": args["escrowId"],
        "recipient": args["recipient"],
        "amount_wei": args["amount"],
    }


def verify_release_transaction(tx_hash: str, escrow_id: int) -> bool:
    receipt = w3.eth.get_transaction_receipt(tx_hash)
    if receipt is None or receipt.status != 1:
        raise ValueError("Transaction not found or failed on-chain")

    contract = _get_contract()
    events = contract.events.FundsReleased().process_receipt(receipt)
    if not events or events[0]["args"]["escrowId"] != escrow_id:
        raise ValueError("No matching FundsReleased event found for this escrow")

    return True


def verify_direct_payment(
    tx_hash: str, expected_sender: str, expected_recipient: str, expected_amount_wei: int
) -> bool:
    """For LOW/MEDIUM/MEDIUM-HIGH risk payments, which aren't routed through
    the escrow contract - the sender's wallet just sends a plain ETH
    transfer straight to the recipient. This confirms that transfer really
    happened on-chain, from the right sender, to the right recipient, for
    the right amount, rather than trusting the frontend's word for it."""
    receipt = w3.eth.get_transaction_receipt(tx_hash)
    if receipt is None or receipt.status != 1:
        raise ValueError("Transaction not found or failed on-chain")

    tx = w3.eth.get_transaction(tx_hash)
    if tx["from"].lower() != expected_sender.lower():
        raise ValueError("Transaction sender does not match the payment's sender")
    if tx["to"] is None or tx["to"].lower() != expected_recipient.lower():
        raise ValueError("Transaction recipient does not match the payment's recipient")
    if tx["value"] != expected_amount_wei:
        raise ValueError("Transferred amount does not match the analyzed payment amount")

    return True


def verify_refund_transaction(tx_hash: str, escrow_id: int) -> bool:
    receipt = w3.eth.get_transaction_receipt(tx_hash)
    if receipt is None or receipt.status != 1:
        raise ValueError("Transaction not found or failed on-chain")

    contract = _get_contract()
    events = contract.events.FundsRefunded().process_receipt(receipt)
    if not events or events[0]["args"]["escrowId"] != escrow_id:
        raise ValueError("No matching FundsRefunded event found for this escrow")

    return True
