# SafeUPI — Blockchain (Ganache + MetaMask) Setup

This adds a real on-chain escrow to the project: high-risk payments are
locked in a Solidity smart contract via the sender's own MetaMask wallet,
instead of a fake `PLACEHOLDER` escrow id.

## What changed

- `blockchain/` — new Truffle project with the escrow smart contract
  (`SafeUpiEscrow.sol`).
- `backend/blockchain.py` — no longer fakes escrow locking. It now
  verifies real on-chain transactions (via web3.py) that MetaMask
  already submitted.
- `backend/main.py` — `analyze-payment` returns `requires_escrow` +
  `amount_wei` instead of immediately faking an escrow. New endpoints:
  `/api/lock-confirmation` and `/api/contract-info`.
- `frontend/src/web3.js` — talks to MetaMask + the contract.
- `frontend/src/components/RiskAlertModal.jsx` — the popup shown to the
  sender when a payment is flagged unhealthy.
- `frontend/src/components/EscrowActions.jsx` — release/refund buttons
  once funds are actually locked on-chain.

## One-time setup

1. **Install Ganache** (the desktop GUI app) from https://trufflesuite.com/ganache/
   and start a workspace. Confirm it's running on **port 7545** (Ganache's
   default) — if you use `ganache-cli` instead, it defaults to 8545; either
   works, just make `blockchain/truffle-config.js`'s `port` match.

2. **Install MetaMask** in your browser, then add Ganache as a custom
   network:
   - Network name: `Ganache Local`
   - RPC URL: `http://127.0.0.1:7545`
   - Chain ID: `1337` (Ganache's default — check the Ganache app header;
     older versions use `5777`)
   - Currency symbol: `ETH`

3. **Import a Ganache test account into MetaMask** so you have test ETH:
   in Ganache, click the key icon next to any account to copy its
   private key, then in MetaMask use "Import Account" and paste it.
   Import a **second** account too — you'll use its address as a demo
   "recipient wallet" when testing escrow.

4. **Compile and deploy the contract:**
   ```bash
   cd blockchain
   npm install
   npx truffle migrate
   ```
   This needs internet access the first time (Truffle downloads the
   matching Solidity compiler). Re-run with `npx truffle migrate --reset`
   any time you restart Ganache, since a fresh Ganache workspace resets
   all deployed contract addresses.

5. **Run the backend as usual:**
   ```bash
   cd backend
   pip install -r requirements.txt
   uvicorn main:app --reload
   ```
   It reads the deployed contract's address straight out of
   `blockchain/build/contracts/SafeUpiEscrow.json` — nothing to
   copy-paste.

6. **Run the frontend as usual:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

## Trying it out

1. On the **Make Payment** page, paste a second Ganache account's address
   into **Recipient Wallet Address**.
2. Submit a payment with a large amount (e.g. ₹30,000) so the ML model
   flags it HIGH risk.
3. A popup appears warning you the payment looks risky. Click
   **"Protect with escrow"** — MetaMask will prompt you to confirm the
   `lockFunds` transaction.
4. Once confirmed, you'll see escrow status with **"Yes, release funds"**
   / **"No, refund me"** buttons — each triggers another MetaMask
   transaction (`releaseFunds` / `refundFunds`), which the backend then
   verifies on-chain before marking the payment completed/refunded.

## Notes

- The rupee → ETH conversion (`DEMO_WEI_PER_RUPEE` in `backend/blockchain.py`)
  is an arbitrary demo rate (₹10,000 = 1 ETH) — there's no real UPI-to-crypto
  bridge here, it's just so escrow amounts are meaningful on the local chain.
- The contract's cooling-off period is 10 minutes (`COOLING_OFF_PERIOD` in
  `SafeUpiEscrow.sol`) — after it expires, *anyone* can trigger the refund,
  simulating an automatic timeout refund. Shorten it in the contract if you
  want to demo that path quickly.
