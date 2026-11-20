const SafeUpiEscrow = artifacts.require("SafeUpiEscrow");

module.exports = function (deployer) {
  deployer.deploy(SafeUpiEscrow);
};
