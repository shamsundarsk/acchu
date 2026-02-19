namespace AcchuSandboxEngine.Configuration;

public class SecurityConfiguration
{
    public const string SectionName = "Security";
    
    public string JwtSecretKey { get; set; } = string.Empty;
    public string JwtIssuer { get; set; } = "ACCHU-Backend";
    public string JwtAudience { get; set; } = "ACCHU-Sandbox-Engine";
    public int TokenExpirationMinutes { get; set; } = 60;
    public bool ValidateIssuer { get; set; } = true;
    public bool ValidateAudience { get; set; } = true;
    public bool ValidateLifetime { get; set; } = true;
    public bool ValidateIssuerSigningKey { get; set; } = true;
    public string ExpectedFileSource { get; set; } = "ACCHU-Backend";
    public bool EnableSecurityEventLogging { get; set; } = true;
    public string SecurityLogPath { get; set; } = "%TEMP%\\AcchuSandbox\\SecurityLogs";
    
    // Action Restriction Settings
    public List<string> AllowedActions { get; set; } = new() { "Print", "Preview" };
    public List<string> RestrictedActions { get; set; } = new() { "Save", "Copy", "Export", "Edit", "Delete", "Share", "Email", "Upload", "Download" };
    public bool EnableActionRestriction { get; set; } = true;
    public bool LogActionViolations { get; set; } = true;
    public bool FailClosedOnActionViolation { get; set; } = true;
    public bool FailClosedOnParameterViolation { get; set; } = true;
}