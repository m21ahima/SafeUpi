// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title SafeUpiEscrow
/// @notice Holds a risky payment's funds in escrow instead of sending them
///         straight to the recipient. The sender can release (confirm it was
///         really them) or refund (cancel) during a cooling-off window; after
///         that window anyone can trigger the refund, simulating an
///         auto-refund on timeout.
contract SafeUpiEscrow {
    enum Status {
        Locked,
        Released,
        Refunded
    }

    struct Escrow {
        address payable sender;
        address payable recipient;
        uint256 amount;
        uint256 createdAt;
        Status status;
    }

    /// @dev Demo-length cooling-off period. Shortened from a real-world
    /// value (e.g. hours) so it's easy to demonstrate the auto-refund path.
    uint256 public constant COOLING_OFF_PERIOD = 10 minutes;

    uint256 public escrowCount;
    mapping(uint256 => Escrow) public escrows;

    event FundsLocked(
        uint256 indexed escrowId,
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        uint256 timestamp
    );
    event FundsReleased(uint256 indexed escrowId, address indexed recipient, uint256 amount);
    event FundsRefunded(uint256 indexed escrowId, address indexed sender, uint256 amount);

    modifier isLocked(uint256 escrowId) {
        require(escrows[escrowId].status == Status.Locked, "Escrow is not locked");
        _;
    }

    /// @notice Called by the sender's wallet (MetaMask) when SafeUPI's ML
    /// model flags a payment as high risk. The funds sit here instead of
    /// going directly to the recipient.
    function lockFunds(address payable recipient) external payable returns (uint256 escrowId) {
        require(msg.value > 0, "Amount must be greater than zero");
        require(recipient != address(0), "Invalid recipient address");

        escrowCount += 1;
        escrowId = escrowCount;

        escrows[escrowId] = Escrow({
            sender: payable(msg.sender),
            recipient: recipient,
            amount: msg.value,
            createdAt: block.timestamp,
            status: Status.Locked
        });

        emit FundsLocked(escrowId, msg.sender, recipient, msg.value, block.timestamp);
    }

    /// @notice Sender confirms the payment was genuinely intentional -> funds move to recipient.
    function releaseFunds(uint256 escrowId) external isLocked(escrowId) {
        Escrow storage e = escrows[escrowId];
        require(msg.sender == e.sender, "Only the original sender can release these funds");

        e.status = Status.Released;
        e.recipient.transfer(e.amount);

        emit FundsReleased(escrowId, e.recipient, e.amount);
    }

    /// @notice Sender cancels, or (after the cooling-off period expires) anyone
    /// can trigger the auto-refund back to the sender.
    function refundFunds(uint256 escrowId) external isLocked(escrowId) {
        Escrow storage e = escrows[escrowId];

        bool withinCoolingOff = block.timestamp < e.createdAt + COOLING_OFF_PERIOD;
        if (withinCoolingOff) {
            require(msg.sender == e.sender, "Only the sender can cancel during the cooling-off period");
        }

        e.status = Status.Refunded;
        e.sender.transfer(e.amount);

        emit FundsRefunded(escrowId, e.sender, e.amount);
    }

    function getEscrow(uint256 escrowId)
        external
        view
        returns (address sender, address recipient, uint256 amount, uint256 createdAt, Status status)
    {
        Escrow storage e = escrows[escrowId];
        return (e.sender, e.recipient, e.amount, e.createdAt, e.status);
    }
}
