# SafeUPI Backend

## What's in this folder

- `main.py` — the server. Run this.
- `database.py` — SQLite storage for transactions (auto-creates `safeupi.db`)
- `ml_model.py` — fraud risk scoring. Currently a PLACEHOLDER. Swap this when your ML teammate sends her file.
- `blockchain.py` — escrow lock/release/refund. Currently a PLACEHOLDER. Swap this when the smart contract is deployed.
- `requirements.txt` — everything you need to install

## Setup (do this once)

1. Open this `backend` folder in VS Code.
2. Open a terminal in VS Code (Terminal → New Terminal).
3. (Recommended) Create a virtual environment so packages don't clash with anything else on your system:
   ```
   python -m venv venv
   ```
   Then activate it:
   - Windows: `venv\Scripts\activate`
   - Mac/Linux: `source venv/bin/activate`
4. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

## Running the server

```
uvicorn main:app --reload
```

You should see something like:
```
Uvicorn running on http://127.0.0.1:8000
```

Now open **http://127.0.0.1:8000/docs** in your browser. This is FastAPI's auto-generated interactive docs — you can test every endpoint right there by clicking "Try it out", no frontend needed yet.

## Testing it works

In the `/docs` page, try `POST /api/analyze-payment` with:
```json
{
  "recipient": "test@upi",
  "amount": 25000,
  "category": "Transfer",
  "note": "testing"
}
```
A high amount should come back with `"risk_level": "HIGH"` and `"status": "escrow"`. Try a small amount like `500` — it should come back `"LOW"` and `"completed"`.

Then check `GET /api/transactions` — you should see your test payments saved there.

## Connecting your React frontend

In your frontend, wherever `getRiskAnalysis()` currently does fake math in `App.jsx`, replace it with a real API call using axios (already installed in your frontend):

```javascript
import axios from "axios";

const analyzePayment = async (paymentData) => {
  const response = await axios.post("http://127.0.0.1:8000/api/analyze-payment", paymentData);
  return response.data;
};
```

Call this inside `handlePaymentSubmit` instead of using the local `getRiskAnalysis()` function, and use the returned data (`risk_score`, `risk_level`, `message`, `status`, `escrow_id`) to update what's displayed — instead of the currently hardcoded logic.

## When your teammates send their files

**ML model file arrives:**
Open `ml_model.py`. Read the commented-out example at the top. Replace the body of `get_risk_score()` to load her model and call `.predict()` — keep the same input (a dict) and output (`{"score": int, "level": str, "message": str}`) shape so nothing else breaks.

**Smart contract is deployed:**
Open `blockchain.py`. Read the commented-out example at the top. You'll need the contract's address and ABI (a JSON file) from your blockchain teammate. Replace the three function bodies (`lock_in_escrow`, `release_from_escrow`, `refund_from_escrow`) with real `web3.py` calls.

Nothing else in `main.py` needs to change either time — that's the whole point of keeping them in separate files.

## Common issues

- **"Address already in use" when running uvicorn** → something's already running on port 8000. Run `uvicorn main:app --reload --port 8001` instead, and update the frontend URL to match.
- **CORS error in the browser console** → double check your frontend is calling `http://127.0.0.1:8000` (not `localhost:8000` — sometimes browsers treat these differently) and that the backend is actually running.
- **`ModuleNotFoundError`** → you probably forgot to activate your virtual environment before running `pip install` or `uvicorn`.
