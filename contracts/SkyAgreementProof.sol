// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Timestamped commitments to private electronic agreements. No billing or access authority.
contract SkyAgreementProof {
    mapping(address => mapping(bytes32 => uint256)) public anchoredAt;
    event AgreementAnchored(address indexed account, bytes32 indexed commitment, uint256 timestamp);
    function anchor(bytes32 commitment) external {
        require(commitment != bytes32(0), "empty commitment");
        if (anchoredAt[msg.sender][commitment] != 0) return;
        anchoredAt[msg.sender][commitment] = block.timestamp;
        emit AgreementAnchored(msg.sender, commitment, block.timestamp);
    }
}
