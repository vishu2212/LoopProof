// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {BatchState, ReturnReason, RejectReason, ProcessingOutput} from "./LoopProofTypes.sol";

/// @title LoopProofRegistry
/// @notice Evidence-gated lifecycle registry for e-waste batches.
///         Implements docs/STATE_MACHINE.md.
/// @dev IMPORTANT: on-chain records show that authorized keys recorded actions
///      and that anchored evidence hashes are unaltered. They do NOT prove that
///      physical collection, processing, or recycling actually occurred.
///      No personal data, raw serials, claim-key secrets, or evidence files are
///      stored: only opaque identifiers, hashes, addresses, states, revisions,
///      masses (grams), reason codes, and timestamps.
contract LoopProofRegistry is AccessControl {
    // ---------------------------------------------------------------------
    // Roles
    // ---------------------------------------------------------------------

    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");
    bytes32 public constant COLLECTOR_ROLE = keccak256("COLLECTOR_ROLE");
    bytes32 public constant PROCESSOR_ROLE = keccak256("PROCESSOR_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    /// @notice Maximum number of output fractions per processing revision (bounds gas).
    uint256 public constant MAX_OUTPUTS = 16;

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    struct Batch {
        bytes32 claimKey; // opaque off-chain commitment (e.g. salted hash)
        address registrar;
        address collector; // fixed at registration (D-15)
        address processor; // fixed at registration (D-15)
        address verifier; // fixed at registration (D-15)
        uint128 intakeMassGrams;
        uint128 currentOutputMassGrams;
        bytes32 collectionEvidenceHash;
        bytes32 receiptEvidenceHash;
        uint64 registeredAt;
        uint64 collectedAt;
        uint64 receivedAt;
        uint64 finalizedAt; // set on VERIFIED, REJECTED, or CANCELLED
        uint16 category; // registrar-attested, human-confirmed category code
        uint32 revisionCount;
        BatchState state;
        ReturnReason lastReturnReason;
        RejectReason rejectReason;
    }

    struct Revision {
        bytes32 evidenceHash;
        uint128 totalOutputMassGrams;
        uint64 submittedAt;
        ReturnReason returnReason; // NONE unless this revision was returned
    }

    uint256 private _batchCount;
    mapping(uint256 batchId => Batch) private _batches;
    mapping(uint256 batchId => Revision[]) private _revisions;
    mapping(uint256 batchId => mapping(uint256 revision => ProcessingOutput[])) private _revisionOutputs;

    /// @notice Claim key => batch ID (0 = unused). Claim keys are never reusable.
    mapping(bytes32 claimKey => uint256 batchId) public batchIdByClaimKey;

    /// @notice Evidence hashes already anchored anywhere in this registry.
    mapping(bytes32 evidenceHash => bool used) public evidenceUsed;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    /// @notice Emitted on every successful lifecycle transition.
    /// @param evidenceHash Hash submitted with the action, the hash of the
    ///        revision under review (verifier actions), or zero.
    event BatchStateChanged(
        uint256 indexed batchId,
        BatchState from,
        BatchState indexed to,
        address indexed actor,
        bytes32 evidenceHash
    );

    event BatchRegistered(
        uint256 indexed batchId,
        bytes32 indexed claimKey,
        uint16 category,
        address collector,
        address processor,
        address verifier
    );
    event BatchCollected(uint256 indexed batchId, uint128 intakeMassGrams, bytes32 evidenceHash);
    event BatchReceived(uint256 indexed batchId, bytes32 evidenceHash);
    event ProcessingSubmitted(
        uint256 indexed batchId,
        uint256 indexed revision,
        uint128 totalOutputMassGrams,
        bytes32 evidenceHash,
        ProcessingOutput[] outputs
    );
    event BatchVerified(uint256 indexed batchId, uint256 indexed revision, address verifier);
    event BatchReturned(uint256 indexed batchId, uint256 indexed revision, ReturnReason reason);
    event BatchRejected(uint256 indexed batchId, uint256 indexed revision, RejectReason reason);
    event BatchCancelled(uint256 indexed batchId);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error UnknownBatch(uint256 batchId);
    error UnknownRevision(uint256 batchId, uint256 revision);
    error InvalidTransition(uint256 batchId, BatchState current, BatchState attempted);
    error NotAssignedActor(uint256 batchId, address account);
    error ZeroAddress();
    error ZeroClaimKey();
    error DuplicateClaimKey(bytes32 claimKey);
    error InvalidCategory();
    error AssigneeMissingRole(address account, bytes32 role);
    error VerifierNotIndependent(address verifier);
    error MissingEvidence();
    error EvidenceAlreadyUsed(bytes32 evidenceHash);
    error ZeroIntakeMass();
    error NoOutputs();
    error TooManyOutputs(uint256 count, uint256 max);
    error InvalidOutput(uint256 index);
    error MassBalanceExceeded(uint256 totalOutputGrams, uint256 intakeGrams);
    error InvalidReasonCode();

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    /// @param admin Receives DEFAULT_ADMIN_ROLE only (role management, no lifecycle authority).
    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ---------------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------------

    /// @notice NONE -> REGISTERED.
    function registerBatch(
        bytes32 claimKey,
        uint16 category,
        address collector,
        address processor,
        address verifier
    ) external onlyRole(REGISTRAR_ROLE) returns (uint256 batchId) {
        if (claimKey == bytes32(0)) revert ZeroClaimKey();
        if (batchIdByClaimKey[claimKey] != 0) revert DuplicateClaimKey(claimKey);
        if (category == 0) revert InvalidCategory();
        if (collector == address(0) || processor == address(0) || verifier == address(0)) revert ZeroAddress();
        _requireAssigneeRole(collector, COLLECTOR_ROLE);
        _requireAssigneeRole(processor, PROCESSOR_ROLE);
        _requireAssigneeRole(verifier, VERIFIER_ROLE);
        if (verifier == collector || verifier == processor) revert VerifierNotIndependent(verifier);

        batchId = ++_batchCount;
        batchIdByClaimKey[claimKey] = batchId;

        Batch storage b = _batches[batchId];
        b.claimKey = claimKey;
        b.category = category;
        b.registrar = msg.sender;
        b.collector = collector;
        b.processor = processor;
        b.verifier = verifier;
        b.registeredAt = uint64(block.timestamp);
        b.state = BatchState.REGISTERED;

        emit BatchRegistered(batchId, claimKey, category, collector, processor, verifier);
        emit BatchStateChanged(batchId, BatchState.NONE, BatchState.REGISTERED, msg.sender, bytes32(0));
    }

    /// @notice REGISTERED -> COLLECTED. Records intake mass (grams).
    function recordCollection(uint256 batchId, uint128 intakeMassGrams, bytes32 evidenceHash)
        external
        onlyRole(COLLECTOR_ROLE)
    {
        Batch storage b = _existing(batchId);
        _requireAssigned(batchId, b.collector);
        _requireState(batchId, b, BatchState.REGISTERED, BatchState.COLLECTED);
        if (intakeMassGrams == 0) revert ZeroIntakeMass();
        _consumeEvidence(evidenceHash);

        b.intakeMassGrams = intakeMassGrams;
        b.collectionEvidenceHash = evidenceHash;
        b.collectedAt = uint64(block.timestamp);
        b.state = BatchState.COLLECTED;

        emit BatchCollected(batchId, intakeMassGrams, evidenceHash);
        emit BatchStateChanged(batchId, BatchState.REGISTERED, BatchState.COLLECTED, msg.sender, evidenceHash);
    }

    /// @notice COLLECTED -> RECEIVED.
    function recordReceipt(uint256 batchId, bytes32 evidenceHash) external onlyRole(PROCESSOR_ROLE) {
        Batch storage b = _existing(batchId);
        _requireAssigned(batchId, b.processor);
        _requireState(batchId, b, BatchState.COLLECTED, BatchState.RECEIVED);
        _consumeEvidence(evidenceHash);

        b.receiptEvidenceHash = evidenceHash;
        b.receivedAt = uint64(block.timestamp);
        b.state = BatchState.RECEIVED;

        emit BatchReceived(batchId, evidenceHash);
        emit BatchStateChanged(batchId, BatchState.COLLECTED, BatchState.RECEIVED, msg.sender, evidenceHash);
    }

    /// @notice RECEIVED -> PROCESSED_CLAIMED. A claim, not proof of recycling.
    function submitProcessing(uint256 batchId, ProcessingOutput[] calldata outputs, bytes32 evidenceHash)
        external
        onlyRole(PROCESSOR_ROLE)
    {
        Batch storage b = _existing(batchId);
        _requireAssigned(batchId, b.processor);
        _requireState(batchId, b, BatchState.RECEIVED, BatchState.PROCESSED_CLAIMED);
        _recordRevision(batchId, b, outputs, evidenceHash);
        b.state = BatchState.PROCESSED_CLAIMED;
        emit BatchStateChanged(batchId, BatchState.RECEIVED, BatchState.PROCESSED_CLAIMED, msg.sender, evidenceHash);
    }

    /// @notice RETURNED -> PROCESSED_CLAIMED. Replaces the current output set;
    ///         previous revisions are preserved (D-13). Requires new evidence.
    function resubmitProcessing(uint256 batchId, ProcessingOutput[] calldata outputs, bytes32 evidenceHash)
        external
        onlyRole(PROCESSOR_ROLE)
    {
        Batch storage b = _existing(batchId);
        _requireAssigned(batchId, b.processor);
        _requireState(batchId, b, BatchState.RETURNED, BatchState.PROCESSED_CLAIMED);
        _recordRevision(batchId, b, outputs, evidenceHash);
        b.state = BatchState.PROCESSED_CLAIMED;
        emit BatchStateChanged(batchId, BatchState.RETURNED, BatchState.PROCESSED_CLAIMED, msg.sender, evidenceHash);
    }

    /// @notice PROCESSED_CLAIMED -> VERIFIED (terminal).
    function verifyBatch(uint256 batchId) external onlyRole(VERIFIER_ROLE) {
        Batch storage b = _verifierPreconditions(batchId, BatchState.VERIFIED);
        uint256 rev = b.revisionCount - 1;

        b.state = BatchState.VERIFIED;
        b.finalizedAt = uint64(block.timestamp);

        emit BatchVerified(batchId, rev, msg.sender);
        emit BatchStateChanged(
            batchId, BatchState.PROCESSED_CLAIMED, BatchState.VERIFIED, msg.sender, _revisions[batchId][rev].evidenceHash
        );
    }

    /// @notice PROCESSED_CLAIMED -> RETURNED, with an explicit reason code (D-14).
    function returnBatch(uint256 batchId, ReturnReason reason) external onlyRole(VERIFIER_ROLE) {
        Batch storage b = _verifierPreconditions(batchId, BatchState.RETURNED);
        if (reason == ReturnReason.NONE) revert InvalidReasonCode();
        uint256 rev = b.revisionCount - 1;

        _revisions[batchId][rev].returnReason = reason;
        b.lastReturnReason = reason;
        b.state = BatchState.RETURNED;

        emit BatchReturned(batchId, rev, reason);
        emit BatchStateChanged(
            batchId, BatchState.PROCESSED_CLAIMED, BatchState.RETURNED, msg.sender, _revisions[batchId][rev].evidenceHash
        );
    }

    /// @notice PROCESSED_CLAIMED -> REJECTED (terminal), with an explicit reason code (D-14).
    function rejectBatch(uint256 batchId, RejectReason reason) external onlyRole(VERIFIER_ROLE) {
        Batch storage b = _verifierPreconditions(batchId, BatchState.REJECTED);
        if (reason == RejectReason.NONE) revert InvalidReasonCode();
        uint256 rev = b.revisionCount - 1;

        b.rejectReason = reason;
        b.state = BatchState.REJECTED;
        b.finalizedAt = uint64(block.timestamp);

        emit BatchRejected(batchId, rev, reason);
        emit BatchStateChanged(
            batchId, BatchState.PROCESSED_CLAIMED, BatchState.REJECTED, msg.sender, _revisions[batchId][rev].evidenceHash
        );
    }

    /// @notice REGISTERED -> CANCELLED (terminal). Assigned registrar only; admin cannot cancel (D-16, D-17).
    function cancelBatch(uint256 batchId) external onlyRole(REGISTRAR_ROLE) {
        Batch storage b = _existing(batchId);
        _requireAssigned(batchId, b.registrar);
        _requireState(batchId, b, BatchState.REGISTERED, BatchState.CANCELLED);

        b.state = BatchState.CANCELLED;
        b.finalizedAt = uint64(block.timestamp);

        emit BatchCancelled(batchId);
        emit BatchStateChanged(batchId, BatchState.REGISTERED, BatchState.CANCELLED, msg.sender, bytes32(0));
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function batchCount() external view returns (uint256) {
        return _batchCount;
    }

    function getBatch(uint256 batchId) external view returns (Batch memory) {
        return _existing(batchId);
    }

    function getState(uint256 batchId) external view returns (BatchState) {
        return _existing(batchId).state;
    }

    /// @notice Returns a historical (or current) processing revision and its outputs.
    function getRevision(uint256 batchId, uint256 revision)
        external
        view
        returns (Revision memory rev, ProcessingOutput[] memory outputs)
    {
        Batch storage b = _existing(batchId);
        if (revision >= b.revisionCount) revert UnknownRevision(batchId, revision);
        rev = _revisions[batchId][revision];
        outputs = _revisionOutputs[batchId][revision];
    }

    /// @notice Current (latest) output set; empty if no submission yet.
    function getCurrentOutputs(uint256 batchId) external view returns (ProcessingOutput[] memory) {
        Batch storage b = _existing(batchId);
        if (b.revisionCount == 0) return new ProcessingOutput[](0);
        return _revisionOutputs[batchId][b.revisionCount - 1];
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _existing(uint256 batchId) private view returns (Batch storage b) {
        if (batchId == 0 || batchId > _batchCount) revert UnknownBatch(batchId);
        b = _batches[batchId];
    }

    function _requireAssigned(uint256 batchId, address assignee) private view {
        if (msg.sender != assignee) revert NotAssignedActor(batchId, msg.sender);
    }

    function _requireState(uint256 batchId, Batch storage b, BatchState expected, BatchState attempted)
        private
        view
    {
        if (b.state != expected) revert InvalidTransition(batchId, b.state, attempted);
    }

    function _requireAssigneeRole(address account, bytes32 role) private view {
        if (!hasRole(role, account)) revert AssigneeMissingRole(account, role);
    }

    function _verifierPreconditions(uint256 batchId, BatchState attempted) private view returns (Batch storage b) {
        b = _existing(batchId);
        _requireAssigned(batchId, b.verifier);
        // Defense in depth: independence is also enforced at registration.
        if (msg.sender == b.collector || msg.sender == b.processor) revert VerifierNotIndependent(msg.sender);
        _requireState(batchId, b, BatchState.PROCESSED_CLAIMED, attempted);
    }

    function _consumeEvidence(bytes32 evidenceHash) private {
        if (evidenceHash == bytes32(0)) revert MissingEvidence();
        if (evidenceUsed[evidenceHash]) revert EvidenceAlreadyUsed(evidenceHash);
        evidenceUsed[evidenceHash] = true;
    }

    function _recordRevision(
        uint256 batchId,
        Batch storage b,
        ProcessingOutput[] calldata outputs,
        bytes32 evidenceHash
    ) private {
        uint256 n = outputs.length;
        if (n == 0) revert NoOutputs();
        if (n > MAX_OUTPUTS) revert TooManyOutputs(n, MAX_OUTPUTS);

        // uint128 values summed in uint256: at most 16 * (2^128 - 1), cannot overflow.
        uint256 total;
        for (uint256 i = 0; i < n; ++i) {
            if (outputs[i].materialCode == 0 || outputs[i].massGrams == 0) revert InvalidOutput(i);
            total += outputs[i].massGrams;
        }
        if (total > b.intakeMassGrams) revert MassBalanceExceeded(total, b.intakeMassGrams);

        _consumeEvidence(evidenceHash);

        uint256 rev = b.revisionCount;
        _revisions[batchId].push(
            Revision({
                evidenceHash: evidenceHash,
                totalOutputMassGrams: uint128(total), // safe: total <= intake (uint128)
                submittedAt: uint64(block.timestamp),
                returnReason: ReturnReason.NONE
            })
        );
        ProcessingOutput[] storage stored = _revisionOutputs[batchId][rev];
        for (uint256 i = 0; i < n; ++i) {
            stored.push(outputs[i]);
        }

        b.revisionCount = uint32(rev + 1);
        b.currentOutputMassGrams = uint128(total);

        emit ProcessingSubmitted(batchId, rev, uint128(total), evidenceHash, outputs);
    }
}
