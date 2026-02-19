using AcchuSandboxEngine.Interfaces;
using AcchuSandboxEngine.Models;
using Microsoft.Extensions.Logging;

namespace AcchuSandboxEngine.Examples;

/// <summary>
/// Example demonstrating how to use the action restriction functionality
/// </summary>
public class ActionRestrictionExample
{
    private readonly ISecurityManager _securityManager;
    private readonly ILogger<ActionRestrictionExample> _logger;

    public ActionRestrictionExample(ISecurityManager securityManager, ILogger<ActionRestrictionExample> logger)
    {
        _securityManager = securityManager;
        _logger = logger;
    }

    /// <summary>
    /// Example of validating a print action (should be allowed)
    /// </summary>
    public async Task<bool> ValidatePrintActionExample()
    {
        var actionRequest = new ActionRequest
        {
            SessionId = "example-session-123",
            RequestedAction = ActionType.Print,
            Parameters = new Dictionary<string, object>
            {
                { "copies", 2 },
                { "colorprinting", true },
                { "doublesided", false },
                { "printername", "HP LaserJet Pro" }
            },
            RequestSource = "WebUI",
            RequestTime = DateTime.UtcNow
        };

        var result = await _securityManager.ValidateActionAsync(actionRequest);
        
        if (result.IsAllowed)
        {
            _logger.LogInformation("Print action validated successfully for session {SessionId}", actionRequest.SessionId);
            
            // Now validate the print parameters
            var expectedParameters = new Dictionary<string, object>
            {
                { "copies", 2 },
                { "colorprinting", true },
                { "doublesided", false },
                { "printername", "HP LaserJet Pro" }
            };

            var paramResult = await _securityManager.ValidateParametersAsync(
                actionRequest.SessionId, 
                ActionType.Print, 
                actionRequest.Parameters, 
                expectedParameters);

            if (paramResult.IsAllowed)
            {
                _logger.LogInformation("Print parameters validated successfully for session {SessionId}", actionRequest.SessionId);
                return true;
            }
            else
            {
                _logger.LogWarning("Print parameter validation failed for session {SessionId}: {Error}", 
                    actionRequest.SessionId, paramResult.ErrorMessage);
                return false;
            }
        }
        else
        {
            _logger.LogWarning("Print action validation failed for session {SessionId}: {Error}", 
                actionRequest.SessionId, result.ErrorMessage);
            return false;
        }
    }

    /// <summary>
    /// Example of attempting a restricted action (should be blocked)
    /// </summary>
    public async Task<bool> ValidateRestrictedActionExample()
    {
        var actionRequest = new ActionRequest
        {
            SessionId = "example-session-456",
            RequestedAction = ActionType.Save,
            Parameters = new Dictionary<string, object>
            {
                { "filename", "document.pdf" },
                { "location", "C:\\Users\\Shopkeeper\\Documents" }
            },
            RequestSource = "WebUI",
            RequestTime = DateTime.UtcNow
        };

        var result = await _securityManager.ValidateActionAsync(actionRequest);
        
        if (!result.IsAllowed)
        {
            _logger.LogWarning("Restricted action '{Action}' was correctly blocked for session {SessionId}: {Error}", 
                actionRequest.RequestedAction, actionRequest.SessionId, result.ErrorMessage);
            
            // This demonstrates the fail-closed behavior - the session would be invalidated
            return true; // Expected behavior - restriction worked
        }
        else
        {
            _logger.LogError("SECURITY VIOLATION: Restricted action '{Action}' was incorrectly allowed for session {SessionId}", 
                actionRequest.RequestedAction, actionRequest.SessionId);
            return false; // Unexpected - security failure
        }
    }

    /// <summary>
    /// Example of parameter tampering detection
    /// </summary>
    public async Task<bool> ValidateParameterTamperingExample()
    {
        var sessionId = "example-session-789";
        
        // Simulate a scenario where the user tries to print more copies than authorized
        var actualParameters = new Dictionary<string, object>
        {
            { "copies", 10 }, // User tries to print 10 copies
            { "colorprinting", true },
            { "doublesided", false }
        };

        var expectedParameters = new Dictionary<string, object>
        {
            { "copies", 2 }, // But they only paid for 2 copies
            { "colorprinting", true },
            { "doublesided", false }
        };

        var result = await _securityManager.ValidateParametersAsync(
            sessionId, 
            ActionType.Print, 
            actualParameters, 
            expectedParameters);

        if (!result.IsAllowed)
        {
            _logger.LogWarning("Parameter tampering correctly detected for session {SessionId}: {Violations}", 
                sessionId, string.Join(", ", result.ViolationReasons));
            
            // This demonstrates parameter violation detection and fail-closed behavior
            return true; // Expected behavior - tampering was detected
        }
        else
        {
            _logger.LogError("SECURITY VIOLATION: Parameter tampering was not detected for session {SessionId}", sessionId);
            return false; // Unexpected - security failure
        }
    }

    /// <summary>
    /// Example of handling unexpected parameters (potential attack)
    /// </summary>
    public async Task<bool> ValidateUnexpectedParametersExample()
    {
        var sessionId = "example-session-999";
        
        // Simulate a scenario where malicious parameters are injected
        var actualParameters = new Dictionary<string, object>
        {
            { "copies", 1 },
            { "colorprinting", false },
            { "malicious_script", "rm -rf /" }, // Malicious parameter injection
            { "admin_override", "true" } // Privilege escalation attempt
        };

        var expectedParameters = new Dictionary<string, object>
        {
            { "copies", 1 },
            { "colorprinting", false }
        };

        var result = await _securityManager.ValidateParametersAsync(
            sessionId, 
            ActionType.Print, 
            actualParameters, 
            expectedParameters);

        if (!result.IsAllowed)
        {
            _logger.LogWarning("Malicious parameter injection correctly detected for session {SessionId}: {Violations}", 
                sessionId, string.Join(", ", result.ViolationReasons));
            
            // This demonstrates detection of unexpected parameters and fail-closed behavior
            return true; // Expected behavior - attack was detected
        }
        else
        {
            _logger.LogError("SECURITY VIOLATION: Malicious parameter injection was not detected for session {SessionId}", sessionId);
            return false; // Unexpected - security failure
        }
    }
}