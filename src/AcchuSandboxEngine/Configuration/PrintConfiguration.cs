namespace AcchuSandboxEngine.Configuration;

public class PrintConfiguration
{
    public const string SectionName = "Print";
    
    public string DefaultPrinterName { get; set; } = string.Empty;
    public int MaxCopiesAllowed { get; set; } = 10;
    public bool AllowColorPrinting { get; set; } = true;
    public bool AllowDoubleSided { get; set; } = true;
    public int PrintTimeoutSeconds { get; set; } = 300; // 5 minutes
    public bool UseMockPrinter { get; set; } = false;
    public int MockPrintDelay { get; set; } = 3000;
    public string MockPrinterName { get; set; } = "ACCHU Virtual Printer";
}