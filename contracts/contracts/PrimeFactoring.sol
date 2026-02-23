// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PrimeFactoring
 * @dev A decentralized B2B invoice factoring protocol.
 * Connects SME Suppliers with DeFi Investors to cryptographically secure and fund invoices.
 */
contract PrimeFactoring is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- Enums ---
    enum InvoiceStatus { Proposed, Approved, Factored, Repaid, Cancelled }

    // --- Structs ---
    struct Invoice {
        uint256 id;
        address supplier;
        address buyer;
        address financier; // The DeFi investor who funds it
        uint256 amount;
        uint256 dueDate;
        InvoiceStatus status;
    }

    // --- State Variables ---
    IERC20 public usdcToken;
    uint256 public nextInvoiceId;
    
    // Protocol Fee: 100 = 1.0% (Basis Points. 10000 = 100%)
    uint256 public protocolFeeBps = 100; 

    mapping(uint256 => Invoice) public invoices;

    // --- Events ---
    event InvoiceProposed(uint256 indexed id, address indexed supplier, address indexed buyer, uint256 amount);
    event InvoiceApproved(uint256 indexed id);
    event InvoiceFactored(uint256 indexed id, address indexed financier);
    event InvoiceRepaid(uint256 indexed id);

    // --- Errors ---
    error OnlySupplier();
    error OnlyBuyer();
    error InvalidStatus();
    error PastDueDate();
    error InvalidAmount();

    // --- Constructor ---
    constructor(address _usdcToken, address initialOwner) Ownable(initialOwner) {
        usdcToken = IERC20(_usdcToken);
        nextInvoiceId = 1;
    }

    // --- Core Functions ---

    /**
     * @dev Step 1: SME proposes an invoice to a Buyer.
     */
    function proposeInvoice(address _buyer, uint256 _amount, uint256 _dueDate) external returns (uint256) {
        if (_amount == 0) revert InvalidAmount();
        if (_dueDate <= block.timestamp) revert PastDueDate();

        uint256 id = nextInvoiceId++;
        
        invoices[id] = Invoice({
            id: id,
            supplier: msg.sender,
            buyer: _buyer,
            financier: address(0),
            amount: _amount,
            dueDate: _dueDate,
            status: InvoiceStatus.Proposed
        });

        emit InvoiceProposed(id, msg.sender, _buyer, _amount);
        return id;
    }

    /**
     * @dev Step 2: The Anchor Buyer approves the invoice, confirming the debt.
     */
    function approveInvoice(uint256 _invoiceId) external {
        Invoice storage invoice = invoices[_invoiceId];
        if (msg.sender != invoice.buyer) revert OnlyBuyer();
        if (invoice.status != InvoiceStatus.Proposed) revert InvalidStatus();

        invoice.status = InvoiceStatus.Approved;
        emit InvoiceApproved(_invoiceId);
    }

    /**
     * @dev Step 3: A Web3 Investor funds the invoice. USDC is routed to the Supplier minus fee.
     */
    function factorInvoice(uint256 _invoiceId) external nonReentrant {
        Invoice storage invoice = invoices[_invoiceId];
        if (invoice.status != InvoiceStatus.Approved) revert InvalidStatus();

        // Calculate Fees
        uint256 feeAmount = (invoice.amount * protocolFeeBps) / 10000;
        uint256 payoutToSupplier = invoice.amount - feeAmount;

        // Lock the invoice
        invoice.status = InvoiceStatus.Factored;
        invoice.financier = msg.sender;

        // Route funds: Investor -> Contract
        usdcToken.safeTransferFrom(msg.sender, address(this), invoice.amount);
        
        // Route funds: Contract -> Protocol Treasury
        usdcToken.safeTransfer(owner(), feeAmount);
        
        // Route funds: Contract -> SME Supplier
        usdcToken.safeTransfer(invoice.supplier, payoutToSupplier);

        emit InvoiceFactored(_invoiceId, msg.sender);
    }

    /**
     * @dev Step 4: At maturity, Buyer pays the contract. Funds are routed directly to the Investor.
     */
    function repayInvoice(uint256 _invoiceId) external nonReentrant {
        Invoice storage invoice = invoices[_invoiceId];
        if (msg.sender != invoice.buyer) revert OnlyBuyer();
        if (invoice.status != InvoiceStatus.Factored) revert InvalidStatus();

        invoice.status = InvoiceStatus.Repaid;

        // Route funds: Buyer -> Contract
        usdcToken.safeTransferFrom(msg.sender, address(this), invoice.amount);

        // Route funds: Contract -> Investor (Principal + Yield)
        usdcToken.safeTransfer(invoice.financier, invoice.amount);

        emit InvoiceRepaid(_invoiceId);
    }

    // --- Admin Functions ---

    function setProtocolFee(uint256 _newFeeBps) external onlyOwner {
        require(_newFeeBps <= 500, "Fee too high"); // Max 5%
        protocolFeeBps = _newFeeBps;
    }
}
