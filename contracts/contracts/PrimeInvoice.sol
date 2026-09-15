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
 * Settlement is non-custodial: USDC is pulled from the payer straight to the
 * recipient. The protocol contract must never hold user principal.
 *
 * Fee Structure (tiered by invoice maturity):
 * - 30-day invoice: 2% protocol, 8% financier
 * - 60-day invoice: 1.5% protocol, 8.5% financier
 * - 90-day invoice: 1% protocol, 9% financier
 */
contract PrimeInvoice is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- Enums ---
    enum InvoiceStatus { Proposed, Approved, Factored, Repaid, Cancelled, Defaulted }

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

    // Demo/local: anyone may call mockKYCVerify. Owner must set false for a pilot.
    bool public selfServiceKyc;

    // Fee structure in Basis Points (10000 = 100%)
    uint256 public constant TOTAL_FEE_BPS = 1000; // 10% total
    uint256 public constant FEE_30_DAY_BPS = 200;   // 2% protocol
    uint256 public constant FEE_60_DAY_BPS = 150;   // 1.5% protocol
    uint256 public constant FEE_90_DAY_BPS = 100;   // 1% protocol

    mapping(uint256 => Invoice) public invoices;
    mapping(bytes32 => bool) public usedInvoiceKeys;
    mapping(address => bool) public verifiedBuyers;
    mapping(address => bool) public verifiedSuppliers;

    // --- Events ---
    event InvoiceProposed(uint256 indexed id, address indexed supplier, address indexed buyer, uint256 amount, uint256 termDays);
    event InvoiceApproved(uint256 indexed id);
    event InvoiceFactored(uint256 indexed id, address indexed financier, uint256 protocolFee, uint256 financierYield);
    event InvoiceRepaid(uint256 indexed id);
    event InvoiceCancelled(uint256 indexed id);
    event InvoiceRejected(uint256 indexed id);
    event InvoiceDefaulted(uint256 indexed id);
    event SelfServiceKycSet(bool enabled);

    // --- Errors ---
    error OnlySupplier();
    error OnlyBuyer();
    error Unauthorized();
    error InvalidStatus();
    error PastDueDate();
    error InvalidAmount();
    error InvalidTerm();
    error InvoiceNotDue();
    error BuyerNotVerified();
    error SupplierNotVerified();
    error SelfServiceKycDisabled();
    error DuplicateInvoice();

    // --- Constructor ---
    constructor(address _usdcToken, address initialOwner) Ownable(initialOwner) {
        usdcToken = IERC20(_usdcToken);
        nextInvoiceId = 1;
        selfServiceKyc = true;
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

        bytes32 key = keccak256(abi.encode(msg.sender, _buyer, _amount, _dueDate));
        if (usedInvoiceKeys[key]) revert DuplicateInvoice();
        usedInvoiceKeys[key] = true;

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
        if (block.timestamp >= invoice.dueDate) revert PastDueDate();
        if (!verifiedBuyers[msg.sender]) revert BuyerNotVerified();

        invoice.status = InvoiceStatus.Approved;
        emit InvoiceApproved(_invoiceId);
    }

    /**
     * @dev Step 2b: Supplier cancels the proposed invoice before it is approved or funded.
     */
    function cancelInvoice(uint256 _invoiceId) external {
        Invoice storage invoice = invoices[_invoiceId];
        if (msg.sender != invoice.supplier) revert OnlySupplier();
        if (invoice.status != InvoiceStatus.Proposed) revert InvalidStatus();

        invoice.status = InvoiceStatus.Cancelled;
        emit InvoiceCancelled(_invoiceId);
    }

    /**
     * @dev Step 2c: Buyer rejects the proposed invoice instead of approving it.
     */
    function rejectInvoice(uint256 _invoiceId) external {
        Invoice storage invoice = invoices[_invoiceId];
        if (msg.sender != invoice.buyer) revert OnlyBuyer();
        if (invoice.status != InvoiceStatus.Proposed) revert InvalidStatus();

        invoice.status = InvoiceStatus.Cancelled;
        emit InvoiceRejected(_invoiceId);
    }

    /**
     * @dev Step 3: Investor funds the invoice. USDC never sits in this contract:
     * financier pays protocol fee to owner and remaining payout to supplier.
     */
    function factorInvoice(uint256 _invoiceId) external nonReentrant {
        Invoice storage invoice = invoices[_invoiceId];
        if (invoice.status != InvoiceStatus.Approved) revert InvalidStatus();
        if (block.timestamp >= invoice.dueDate) revert PastDueDate();

        uint256 protocolFeeBps = _protocolFeeBps(invoice.termDays);
        uint256 protocolFee = (invoice.amount * protocolFeeBps) / 10000;
        uint256 financierYield = (invoice.amount * (TOTAL_FEE_BPS - protocolFeeBps)) / 10000;
        uint256 payoutToSupplier = invoice.amount - protocolFee - financierYield;

        invoice.status = InvoiceStatus.Factored;
        invoice.financier = msg.sender;

        usdcToken.safeTransferFrom(msg.sender, owner(), protocolFee);
        usdcToken.safeTransferFrom(msg.sender, invoice.supplier, payoutToSupplier);

        emit InvoiceFactored(_invoiceId, msg.sender, protocolFee, financierYield);
    }

    /**
     * @dev Step 4: Buyer repays at maturity. Face value goes financier-direct.
     */
    function repayInvoice(uint256 _invoiceId) external nonReentrant {
        Invoice storage invoice = invoices[_invoiceId];
        if (msg.sender != invoice.buyer) revert OnlyBuyer();
        if (invoice.status != InvoiceStatus.Factored) revert InvalidStatus();
        if (block.timestamp < invoice.dueDate) revert InvoiceNotDue();

        invoice.status = InvoiceStatus.Repaid;

        usdcToken.safeTransferFrom(msg.sender, invoice.financier, invoice.amount);

        emit InvoiceRepaid(_invoiceId);
    }

    /**
     * @dev Record a missed repayment. Does not move USDC — supplier already
     * received payout. Make-whole is off-chain legal process and/or a future reserve.
     */
    function markDefaulted(uint256 _invoiceId) external {
        Invoice storage invoice = invoices[_invoiceId];
        if (invoice.status != InvoiceStatus.Factored) revert InvalidStatus();
        if (block.timestamp < invoice.dueDate) revert InvoiceNotDue();
        if (msg.sender != invoice.financier && msg.sender != owner()) revert Unauthorized();

        invoice.status = InvoiceStatus.Defaulted;
        emit InvoiceDefaulted(_invoiceId);
    }

    // --- View Functions ---

    function calculateFees(uint256 _amount, uint256 _termDays) external pure returns (
        uint256 protocolFee,
        uint256 financierYield,
        uint256 totalFee,
        uint256 supplierPayout
    ) {
        uint256 protocolFeeBps = _protocolFeeBps(_termDays);
        protocolFee = (_amount * protocolFeeBps) / 10000;
        financierYield = (_amount * (TOTAL_FEE_BPS - protocolFeeBps)) / 10000;
        totalFee = protocolFee + financierYield;
        supplierPayout = _amount - totalFee;
    }

    function _protocolFeeBps(uint256 _termDays) internal pure returns (uint256) {
        if (_termDays == 30) return FEE_30_DAY_BPS;
        if (_termDays == 60) return FEE_60_DAY_BPS;
        if (_termDays == 90) return FEE_90_DAY_BPS;
        revert InvalidTerm();
    }

    // --- Admin Functions ---

    function verifyBuyer(address _buyer, bool _status) external onlyOwner {
        verifiedBuyers[_buyer] = _status;
    }

    function verifySupplier(address _supplier, bool _status) external onlyOwner {
        verifiedSuppliers[_supplier] = _status;
    }

    function setSelfServiceKyc(bool _enabled) external onlyOwner {
        selfServiceKyc = _enabled;
        emit SelfServiceKycSet(_enabled);
    }

    /**
     * @dev Local/demo self-verification. Disabled for a real pilot via setSelfServiceKyc(false).
     */
    function mockKYCVerify(address _target, bool _asSupplier, bool _status) external {
        if (!selfServiceKyc) revert SelfServiceKycDisabled();
        if (_asSupplier) {
            verifiedSuppliers[_target] = _status;
        } else {
            verifiedBuyers[_target] = _status;
        }
    }
}
