"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentStatus = exports.JobStatus = exports.SessionStatus = void 0;
// Session Management Types
var SessionStatus;
(function (SessionStatus) {
    SessionStatus["ACTIVE"] = "active";
    SessionStatus["PRINTING"] = "printing";
    SessionStatus["COMPLETED"] = "completed";
    SessionStatus["TERMINATED"] = "terminated";
})(SessionStatus || (exports.SessionStatus = SessionStatus = {}));
// Print Job Types
var JobStatus;
(function (JobStatus) {
    JobStatus["QUEUED"] = "queued";
    JobStatus["PRINTING"] = "printing";
    JobStatus["COMPLETED"] = "completed";
    JobStatus["FAILED"] = "failed";
})(JobStatus || (exports.JobStatus = JobStatus = {}));
// Payment Types
var PaymentStatus;
(function (PaymentStatus) {
    PaymentStatus["PENDING"] = "pending";
    PaymentStatus["COMPLETED"] = "completed";
    PaymentStatus["FAILED"] = "failed";
    PaymentStatus["CANCELLED"] = "cancelled";
})(PaymentStatus || (exports.PaymentStatus = PaymentStatus = {}));
//# sourceMappingURL=index.js.map