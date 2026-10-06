// audit_logs.audit_id is a BIGINT, which JSON cannot represent natively.
// This makes res.json() send it as a string instead of crashing.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (this: bigint) {
  return this.toString();
};
