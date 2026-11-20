function EscrowActions({ escrow, onRelease, onRefund, working, error }) {
  if (!escrow) return null;

  return (
    <div className="escrow-actions-card">
      <div className="escrow-actions-header">
        <span className="welcome-label">ON-CHAIN ESCROW</span>
        <h4>Funds are locked in the smart contract</h4>
        <p>
          Escrow #{escrow.escrowId} · locked via tx{" "}
          <span className="hash">
            {escrow.txHash.slice(0, 10)}...{escrow.txHash.slice(-6)}
          </span>
        </p>
      </div>

      <p className="escrow-actions-question">
        Was this payment really you?
      </p>

      {error && <p className="risk-modal-error">{error}</p>}

      <div className="risk-modal-actions">
        <button
          type="button"
          className="risk-modal-secondary"
          onClick={onRefund}
          disabled={working}
        >
          {working === "refunding" ? "Refunding in MetaMask..." : "No, refund me"}
        </button>

        <button
          type="button"
          className="risk-modal-primary"
          onClick={onRelease}
          disabled={working}
        >
          {working === "releasing" ? "Releasing in MetaMask..." : "Yes, release funds"}
        </button>
      </div>
    </div>
  );
}

export default EscrowActions;
