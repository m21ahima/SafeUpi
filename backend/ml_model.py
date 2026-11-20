"""
ml_model.py
-----------
This is where the ML teammate's fraud-risk model plugs in.

RIGHT NOW: this is a placeholder that mimics what a real model would
return, so the rest of the backend can be built and tested today.

WHEN SHE SENDS HER FILE: replace the inside of get_risk_score() with
code that loads her model and calls .predict() on it. Nothing else
in the backend needs to change - the function signature (what goes
in, what comes out) stays the same.
"""

import random

# --------------------------------------------------------------------
# TODO: once you get her file, uncomment and adapt something like this:
#
# import joblib
# model = joblib.load("fraud_model.pkl")
#
# def get_risk_score(transaction: dict) -> dict:
#     features = [
#         transaction["amount"],
#         # ...whatever other fields her model expects
#     ]
#     probability = model.predict_proba([features])[0][1]  # fraud probability
#     score = int(probability * 100)
#     return _score_to_result(score)
# --------------------------------------------------------------------


def _score_to_result(score: int) -> dict:
    """Converts a 0-100 risk score into a level + human-readable message.
    This part stays the same regardless of where the score came from."""
    if score <= 25:
        level = "LOW"
        message = "Transaction appears safe."
    elif score <= 50:
        level = "MEDIUM"
        message = "Transaction amount or pattern is moderately unusual."
    elif score <= 70:
        level = "MEDIUM/HIGH"
        message = "Transaction requires additional verification."
    elif score <= 90:
        level = "HIGH"
        message = "High-risk transaction detected. Payment has been protected."
    else:
        level = "MALICIOUS"
        message = (
            "This transaction matches known fraud patterns and has been "
            "flagged as highly likely to be malicious. Proceed only if you "
            "are certain this is intentional."
        )

    return {
        "score": score,
        "level": level,
        "message": message,
    }


def get_risk_score(transaction: dict) -> dict:
    """
    PLACEHOLDER LOGIC - replace this function body once the real
    model file arrives. Keep the same input/output shape:

    Input:  a dict like {"recipient": "...", "amount": 5000, "category": "..."}
    Output: {"score": int 0-100, "level": str, "message": str}
    """
    amount = float(transaction.get("amount", 0))

    # crude placeholder: bigger amount -> higher fake risk, plus some randomness
    base_score = min(int(amount / 300), 90)
    noise = random.randint(-5, 5)
    score = max(0, min(100, base_score + noise))

    return _score_to_result(score)
