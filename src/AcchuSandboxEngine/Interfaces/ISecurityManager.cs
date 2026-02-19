using AcchuSandboxEngine.Models;

namespace AcchuSandboxEngine.Interfaces;

public interface ISecurityManager
{
    Task<ValidationResult> ValidateSessionTokenAsync(string sessionToken);
    Task<ValidationResult> ValidateFileSourceAsync(Stream fileStream, string expectedSource);
    Task LogSecurityEventAsync(SecurityEvent securityEvent);
    Task<bool> EnforceFailClosedAsync(string sessionId, string failureReason);
    Task<bool> ValidateSessionAsync(string sessionId);
    
    // Action Restriction Methods
    Task<ActionValidationResult> ValidateActionAsync(ActionRequest actionRequest);
    Task<ActionValidationResult> ValidateParametersAsync(string sessionId, ActionType actionType, Dictionary<string, object> parameters, Dictionary<string, object> expectedParameters);
    Task LogActionViolationAsync(string sessionId, ActionRequest actionRequest, List<string> violationReasons);
    Task LogParameterViolationAsync(string sessionId, List<ParameterViolation> violations);
}