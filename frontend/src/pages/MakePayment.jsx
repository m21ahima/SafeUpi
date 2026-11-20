import { useState } from "react";

function MakePayment() {
  const [payment, setPayment] = useState({
    recipient: "",
    amount: "",
    category: "",
    note: "",
  });

  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e) => {
    setPayment({
      ...payment,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <section className="payment-page">

      <div className="payment-intro">
        <div>
          <span className="welcome-label">
            SECURE PAYMENT
          </span>

          <h2>Make a Payment</h2>

          <p>
            SafeUPI will analyze this transaction before
            allowing the payment to proceed.
          </p>
        </div>

        <div className="payment-shield">
          🛡️
        </div>
      </div>

      <div className="payment-layout">

        {/* PAYMENT FORM */}

        <div className="panel">

          <div className="panel-header">
            <div>
              <h3>Payment Details</h3>
              <p>Enter the transaction details</p>
            </div>
          </div>

          <form
            className="payment-form"
            onSubmit={handleSubmit}
          >

            {/* Recipient */}

            <div className="form-group">

              <label>Recipient UPI ID</label>

              <input
                type="text"
                name="recipient"
                placeholder="example@upi"
                value={payment.recipient}
                onChange={handleChange}
                required
              />

              <small>
                Enter the recipient's UPI ID
              </small>

            </div>

            {/* Amount */}

            <div className="form-group">

              <label>Amount</label>

              <div className="amount-input">

                <span>₹</span>

                <input
                  type="number"
                  name="amount"
                  placeholder="0.00"
                  min="1"
                  value={payment.amount}
                  onChange={handleChange}
                  required
                />

              </div>

            </div>

            {/* Category */}

            <div className="form-group">

              <label>Payment Category</label>

              <select
                name="category"
                value={payment.category}
                onChange={handleChange}
                required
              >

                <option value="">
                  Select category
                </option>

                <option value="Shopping">
                  Shopping
                </option>

                <option value="Food">
                  Food
                </option>

                <option value="Bills">
                  Bills
                </option>

                <option value="Travel">
                  Travel
                </option>

                <option value="Education">
                  Education
                </option>

                <option value="Healthcare">
                  Healthcare
                </option>

                <option value="Transfer">
                  Personal Transfer
                </option>

                <option value="Other">
                  Other
                </option>

              </select>

            </div>

            {/* Note */}

            <div className="form-group">

              <label>Payment Note</label>

              <textarea
                name="note"
                placeholder="Optional payment description..."
                rows="3"
                value={payment.note}
                onChange={handleChange}
              />

            </div>

            <button
              type="submit"
              className="analyze-button"
            >
              🛡️ Analyze Payment
            </button>

          </form>

        </div>

        {/* SECURITY INFORMATION */}

        <div className="payment-side">

          <div className="panel">

            <div className="security-heading">

              <div className="security-icon">
                🛡️
              </div>

              <div>
                <h3>SafeUPI Protection</h3>

                <p>
                  Every payment is analyzed
                </p>
              </div>

            </div>

            <div className="protection-item">
              <span>✓</span>

              <div>
                <strong>AI Risk Analysis</strong>

                <small>
                  ML analyzes transaction behavior
                </small>
              </div>
            </div>

            <div className="protection-item">
              <span>✓</span>

              <div>
                <strong>Fraud Detection</strong>

                <small>
                  Suspicious patterns are identified
                </small>
              </div>
            </div>

            <div className="protection-item">
              <span>✓</span>

              <div>
                <strong>Smart Escrow</strong>

                <small>
                  High-risk payments can be temporarily held
                </small>
              </div>
            </div>

            <div className="protection-item">
              <span>✓</span>

              <div>
                <strong>Automatic Refund</strong>

                <small>
                  Cancelled payments are returned
                </small>
              </div>
            </div>

          </div>

          {/* HOW IT WORKS */}

          <div className="info-card">

            <span>HOW IT WORKS</span>

            <div className="flow-step">
              <div>1</div>
              <p>Enter payment details</p>
            </div>

            <div className="flow-line"></div>

            <div className="flow-step">
              <div>2</div>
              <p>AI analyzes the transaction</p>
            </div>

            <div className="flow-line"></div>

            <div className="flow-step">
              <div>3</div>
              <p>Payment is approved or protected</p>
            </div>

          </div>

        </div>

      </div>

      {/* RESULT */}

      {submitted && (
        <div className="analysis-message">

          <div className="analysis-icon">
            🔍
          </div>

          <div>

            <strong>
              Payment submitted for analysis
            </strong>

            <p>
              Transaction details captured successfully.
              The ML risk engine will analyze this payment.
            </p>

          </div>

        </div>
      )}

    </section>
  );
}

export default MakePayment;