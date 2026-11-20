# SafeUPI

**An AI + Blockchain powered fraud interception layer for UPI payments.**

UPI payments are instant and irreversible — once sent, money is gone, which is exactly what scammers rely on. SafeUPI analyzes every transaction in real time using a machine learning risk model, and instead of just showing a warning, it actively holds high-risk payments in a blockchain-based smart contract escrow for a short cooling-off period. Users can confirm the payment was genuinely intentional (funds release) or cancel/ignore it (funds auto-refund) — protecting people from scams that rely on panic and urgency.

## How it works

1. User initiates a payment
2. An ML model scores the transaction's risk (unusual recipient, amount, timing, frequency)
3. **Low risk** → payment goes through instantly, like normal UPI
4. **High risk** → funds are locked in a smart contract escrow instead of going straight to the recipient
5. User confirms (releases funds) or cancels/times out (auto-refund)

## Project Structure

```
safeupi/
├── backend/      FastAPI server — connects ML model, blockchain, and frontend
├── frontend/     React (Vite) web app — the payment interface
```

## Tech Stack

| Layer | Technology |
|---|---|
| ML / Risk Engine | Python, Scikit-learn / XGBoost |
| Smart Contract | Solidity, Hardhat, deployed on a testnet |
| Backend | FastAPI, SQLite, Web3.py |
| Frontend | React, Vite, Axios |

## Setup

See `backend/README.md` and `frontend/README.md` for setup instructions for each part.

**Quick start (two terminals needed):**
```bash
# Terminal 1 — backend
cd backend
python -m venv venv
venv\Scripts\activate      # Windows
pip install -r requirements.txt
uvicorn main:app --reload

# Terminal 2 — frontend
cd frontend
npm install
npm run dev
```

Then open the frontend URL shown in the terminal (usually `http://localhost:5173`).


