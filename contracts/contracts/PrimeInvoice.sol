// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PrimeInvoice
 * @dev DeFi Invoice Factoring Protocol for SMEs
 * 
 * Only verified buyers (Fortune 1000) and suppliers can use the protocol.
 * 
 * Fee Structure (tiered by invoice maturity):
 * - 30-day invoice: 2% protocol, 8% financier
 * - 60-day invoice: 1.5% protocol, 8.5% financier
 * - 90-day invoice: 1% protocol, 9% financier
 */
contract PrimeInvoice is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- Enums ---
    enum InvoiceStatus { Proposed, Approved, Factored, Repaid, Cancelled }

    // --- Structs ---
    struct Invoice {
        uint256 id;
        address supplier;
        address buyer;
        address financier;
        uint256 amount;
        uint256 dueDate;
        uint256 termDays;
        InvoiceStatus status;
    }

    // --- State Variables ---
    IERC20 public usdcToken;
    uint256 public nextInvoiceId;
    
    // Fee structure in Basis Points (10000 = 100%)
    uint256 public constant TOTAL_FEE_BPS = 1000; // 10% total
    uint256 public constant FEE_30_DAY_BPS = 200;   // 2% protocol
    uint256 public constant FEE_60_DAY_BPS = 150;   // 1.5% protocol
    uint256 public constant FEE_90_DAY_BPS = 100;   // 1% protocol

    mapping(uint256 => Invoice) public invoices;

    // --- Events ---
    event InvoiceProposed(uint256 indexed id, address indexed supplier, address indexed buyer, uint256 amount, uint256 termDays);
    event InvoiceApproved(uint256 indexed id);
    event InvoiceFactored(uint256 indexed id, address indexed financier, uint256 protocolFee, uint256 financierYield);
    event InvoiceRepaid(uint256 indexed id);

    // --- Errors ---
    error OnlySupplier();
    error OnlyBuyer();
    error InvalidStatus();
    error PastDueDate();
    error InvalidAmount();
    error InvalidTerm();
    error InvoiceNotDue();
    error BuyerNotVerified();
    error SupplierNotVerified();

    // --- Constructor ---
    constructor(address _usdcToken, address initialOwner) Ownable(initialOwner) {
        usdcToken = IERC20(_usdcToken);
        nextInvoiceId = 1;
    }

    // --- Core Functions ---

    /**
     * @dev Step 1: Verified SME proposes an invoice to a Verified Buyer.
     */
    function proposeInvoice(address _buyer, uint256 _amount, uint256 _dueDate, uint256 _termDays) external returns (uint256) {
        if (_amount == 0) revert InvalidAmount();
        if (_dueDate <= block.timestamp) revert PastDueDate();
        if (_termDays != 30 && _termDays != 60 && _termDays != 90) revert InvalidTerm();
        if (!verifiedBuyers[_buyer]) revert BuyerNotVerified();
        if (!verifiedSuppliers[msg.sender]) revert SupplierNotVerified();

        uint256 id = nextInvoiceId++;
        
        invoices[id] = Invoice({
            id: id,
            supplier: msg.sender,
            buyer: _buyer,
            financier: address(0),
            amount: _amount,
            dueDate: _dueDate,
            termDays: _termDays,
            status: InvoiceStatus.Proposed
        });

        emit InvoiceProposed(id, msg.sender, _buyer, _amount, _termDays);
        return id;
    }

    /**
     * @dev Step 2: Verified Buyer approves the invoice.
     */
    function approveInvoice(uint256 _invoiceId) external {
        Invoice storage invoice = invoices[_invoiceId];
        if (msg.sender != invoice.buyer) revert OnlyBuyer();
        if (invoice.status != InvoiceStatus.Proposed) revert InvalidStatus();
        if (!verifiedBuyers[msg.sender]) revert BuyerNotVerified();

        invoice.status = InvoiceStatus.Approved;
        emit InvoiceApproved(_invoiceId);
    }

    /**
     * @dev Step 3: Investor funds the invoice.
     */
    function factorInvoice(uint256 _invoiceId) external nonReentrant {
        Invoice storage invoice = invoices[_invoiceId];
        if (invoice.status != InvoiceStatus.Approved) revert InvalidStatus();

        uint256 protocolFeeBps;
        if (invoice.termDays == 30) {
            protocolFeeBps = FEE_30_DAY_BPS;
        } else if (invoice.termDays == 60) {
            protocolFeeBps = FEE_60_DAY_BPS;
        } else {
            protocolFeeBps = FEE_90_DAY_BPS;
        }

        uint256 protocolFee = (invoice.amount * protocolFeeBps) / 10000;
        uint256 financierYield = (invoice.amount * (TOTAL_FEE_BPS - protocolFeeBps)) / 10000;
        uint256 payoutToSupplier = invoice.amount - protocolFee - financierYield;

        invoice.status = InvoiceStatus.Factored;
        invoice.financier = msg.sender;

        usdcToken.safeTransferFrom(msg.sender, address(this), invoice.amount);
        usdcToken.safeTransfer(owner(), protocolFee);
        usdcToken.safeTransfer(invoice.supplier, payoutToSupplier);

        emit InvoiceFactored(_invoiceId, msg.sender, protocolFee, financierYield);
    }

    /**
     * @dev Step 4: Buyer repays at maturity.
     */
    function repayInvoice(uint256 _invoiceId) external nonReentrant {
        Invoice storage invoice = invoices[_invoiceId];
        if (msg.sender != invoice.buyer) revert OnlyBuyer();
        if (invoice.status != InvoiceStatus.Factored) revert InvalidStatus();
        if (block.timestamp < invoice.dueDate) revert InvoiceNotDue();

        invoice.status = InvoiceStatus.Repaid;

        usdcToken.safeTransferFrom(msg.sender, address(this), invoice.amount);
        usdcToken.safeTransfer(invoice.financier, invoice.amount);

        emit InvoiceRepaid(_invoiceId);
    }

    // --- View Functions ---

    function calculateFees(uint256 _amount, uint256 _termDays) external pure returns (
        uint256 protocolFee,
        uint256 financierYield,
        uint256 totalFee,
        uint256 supplierPayout
    ) {
        uint256 protocolFeeBps;
        if (_termDays == 30) {
            protocolFeeBps = FEE_30_DAY_BPS;
        } else if (_termDays == 60) {
            protocolFeeBps = FEE_60_DAY_BPS;
        } else {
            protocolFeeBps = FEE_90_DAY_BPS;
        }

        protocolFee = (_amount * protocolFeeBps) / 10000;
        financierYield = (_amount * (TOTAL_FEE_BPS - protocolFeeBps)) / 10000;
        totalFee = protocolFee + financierYield;
        supplierPayout = _amount - totalFee;
    }

    // --- Admin Functions ---

    mapping(address => bool) public verifiedBuyers;

    function verifyBuyer(address _buyer, bool _status) external onlyOwner {
        verifiedBuyers[_buyer] = _status;
    }

    mapping(address => bool) public verifiedSuppliers;

    function verifySupplier(address _supplier, bool _status) external onlyOwner {
        verifiedSuppliers[_supplier] = _status;
    }
}
