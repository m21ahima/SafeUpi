import { useState, useEffect } from "react";

function RiskAlertModal({ risk, onProtect, onDismiss, phase, error }) {
  const [acknowledged, setAcknowledged] = useState(false);

  // Reset the acknowledgement checkbox every time a new risky payment
  // triggers this modal, so it can't carry over from a previous one.
  useEffect(() => {
    if (risk) setAcknowledged(false);
  }, [risk]);

  if (!risk) return null;

  const isWorking = phase === "connecting" || phase === "locking" || phase === "confirming";
  const isMalicious = risk.level === "MALICIOUS";

  return (
    <div className={`risk-modal-overlay ${isMalicious ? "risk-modal-overlay-malicious" : ""}`}>
      <div className={`risk-modal ${isMalicious ? "risk-modal-malicious" : ""}`}>
        <div className="risk-modal-icon">{isMalicious ? "🛑" : "⚠️"}</div>

        <span className="welcome-label">
          {isMalicious ? "SAFEUPI FRAUD WARNING" : "SAFEUPI ALERT"}
        </span>

        <h3>
          {isMalicious ? "This payment is likely fraudulent" : "This payment looks risky"}
        </h3>

        <p>
          Risk score <strong>{risk.score}/100</strong> — {risk.message}
        </p>

        {isMalicious && (
          <div className="risk-modal-danger-box">
            <strong>⚠ Do not continue unless you are absolutely certain.</strong>
            <p>
              This transaction matches patterns strongly associated with fraud
              (e.g. sudden unusually large amount, unfamiliar recipient).
              SafeUPI strongly recommends cancelling this payment.
            </p>
          </div>
        )}

        <p className="risk-modal-sub">
          To protect you, SafeUPI won't send this payment directly. Instead
          it will be locked in an on-chain escrow contract, and you'll
          confirm the release yourself in MetaMask.
        </p>

        {phase === "awaiting-wallet-info" && (
          <p className="risk-modal-note">
            Enter the recipient's wallet address below to continue.
          </p>
        )}

        {error && <p className="risk-modal-error">{error}</p>}

        {isMalicious && (
          <label className="risk-modal-checkbox">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              disabled={isWorking}
            />
            I understand the risk and want to proceed anyway
          </label>
        )}

        <div className="risk-modal-actions">
          <button
            type="button"
            className="risk-modal-secondary"
            onClick={onDismiss}
            disabled={isWorking}
          >
            Cancel payment
          </button>

          <button
            type="button"
            className={`risk-modal-primary ${isMalicious ? "risk-modal-primary-danger" : ""}`}
            onClick={onProtect}
            disabled={isWorking || (isMalicious && !acknowledged)}
          >
            {phase === "connecting" && "Connecting MetaMask..."}
            {phase === "locking" && "Confirm in MetaMask..."}
            {phase === "confirming" && "Verifying on-chain..."}
            {!isWorking && "🔒 Protect with escrow"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RiskAlertModal;
