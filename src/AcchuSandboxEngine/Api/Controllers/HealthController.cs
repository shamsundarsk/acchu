using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using AcchuSandboxEngine.Api.Models;

namespace AcchuSandboxEngine.Api.Controllers;

/// <summary>
/// Health check controller for service monitoring
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class HealthController : ControllerBase
{
    private readonly HealthCheckService _healthCheckService;

    public HealthController(HealthCheckService healthCheckService)
    {
        _healthCheckService = healthCheckService;
    }

    /// <summary>
    /// Gets the overall health status of the service
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<HealthResponse>> GetHealth()
    {
        try
        {
            var healthReport = await _healthCheckService.CheckHealthAsync();

            var response = new HealthResponse
            {
                Status = healthReport.Status.ToString(),
                Details = new Dictionary<string, object>()
            };

            // Add details for each health check
            foreach (var entry in healthReport.Entries)
            {
                var entryDetails = new Dictionary<string, object>
                {
                    { "Status", entry.Value.Status.ToString() },
                    { "Description", entry.Value.Description ?? "No description" },
                    { "Duration", entry.Value.Duration.TotalMilliseconds }
                };

                if (entry.Value.Data?.Any() == true)
                {
                    entryDetails.Add("Data", entry.Value.Data);
                }

                if (entry.Value.Exception != null)
                {
                    entryDetails.Add("Exception", entry.Value.Exception.Message);
                }

                response.Details[entry.Key] = entryDetails;
            }

            // Return appropriate HTTP status based on health
            return healthReport.Status switch
            {
                HealthStatus.Healthy => Ok(response),
                HealthStatus.Degraded => StatusCode(200, response), // Still OK but with warnings
                HealthStatus.Unhealthy => StatusCode(503, response), // Service Unavailable
                _ => StatusCode(500, response)
            };
        }
        catch (Exception ex)
        {
            return StatusCode(500, new HealthResponse
            {
                Status = "Error",
                Details = new Dictionary<string, object>
                {
                    { "Error", ex.Message }
                }
            });
        }
    }

    /// <summary>
    /// Gets a simple health check response for load balancers
    /// </summary>
    [HttpGet("ping")]
    public IActionResult Ping()
    {
        return Ok(new { Status = "OK", Timestamp = DateTime.UtcNow });
    }
}