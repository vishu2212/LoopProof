// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

/// @title LoopProof shared types
/// @notice Mirrors docs/STATE_MACHINE.md. Contains no logic.
/// @dev Enum order is part of the on-chain ABI once deployed; do not reorder
///      after deployment. Value 0 of every enum means "unset/invalid".

/// @notice Batch lifecycle state. NONE (0) is the default for an unknown batch ID.
enum BatchState {
    NONE,
    REGISTERED,
    COLLECTED,
    RECEIVED,
    PROCESSED_CLAIMED,
    VERIFIED,
    RETURNED,
    REJECTED,
    CANCELLED
}

/// @notice Reason a verifier returns a processing claim for more evidence (STATE_MACHINE §4a).
enum ReturnReason {
    NONE,
    INSUFFICIENT_EVIDENCE,
    EVIDENCE_UNREADABLE,
    OUTPUT_DATA_INCOMPLETE,
    MASS_DISCREPANCY
}

/// @notice Reason a verifier rejects a processing claim (STATE_MACHINE §4a).
enum RejectReason {
    NONE,
    EVIDENCE_INCONSISTENT,
    MASS_BALANCE_IMPLAUSIBLE,
    PROCESSOR_NOT_QUALIFIED,
    CHAIN_OF_CUSTODY_BROKEN
}

/// @notice One output fraction of a processing claim.
/// @param materialCode Opaque non-zero material code, defined off-chain.
/// @param massGrams Output mass in grams (> 0).
struct ProcessingOutput {
    uint16 materialCode;
    uint128 massGrams;
}
