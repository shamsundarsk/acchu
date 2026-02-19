# ACCHU Sandbox Engine Deployment Checklist

## Pre-Deployment Checklist

### System Requirements ✓
- [ ] Windows 10 or Windows Server 2016 or later
- [ ] .NET 8.0 Runtime installed
- [ ] Minimum 2GB RAM available
- [ ] Minimum 5GB free disk space
- [ ] Administrator privileges for installation

### Service Dependencies ✓
- [ ] Print Spooler service is running
- [ ] Windows Event Log service is running
- [ ] Network connectivity to ACCHU Backend

### Build and Publish ✓
- [ ] Application built in Release configuration
- [ ] Application published to deployment directory
- [ ] All required files present in deployment directory

## Configuration Checklist

### Security Configuration ✓
- [ ] JWT secret key changed from default value
- [ ] JWT secret key is at least 32 characters
- [ ] JWT issuer matches ACCHU Backend configuration
- [ ] JWT audience matches ACCHU Backend configuration
- [ ] Expected file source matches ACCHU Backend identifier

### Network Configuration ✓
- [ ] API ports (8080, 8443) are available
- [ ] Firewall rules configured for API ports
- [ ] ACCHU Backend URLs updated in AllowedOrigins
- [ ] SSL certificates installed (if using HTTPS)

### File System Configuration ✓
- [ ] Temp directory root path is valid
- [ ] Service account has write permissions to temp directory
- [ ] Security log path is valid and writable
- [ ] Allowed file types list is appropriate

### Print Configuration ✓
- [ ] Default printer configured (if required)
- [ ] Print timeout settings are appropriate
- [ ] Max copies limit is set correctly
- [ ] Color and duplex settings match requirements

## Deployment Steps

### Step 1: Configuration Validation ✓
```cmd
AcchuSandboxEngine.exe --validate-config
```
- [ ] Configuration validation passes without errors
- [ ] All warnings reviewed and addressed
- [ ] Configuration file syntax is valid

### Step 2: Service Installation ✓
Choose one deployment method:

**Option A: Automated Deployment (Recommended)**
```cmd
Scripts\deploy-service.bat
```
or
```powershell
.\Scripts\Deploy-AcchuSandboxEngine.ps1 -Environment Production
```

**Option B: Manual Installation**
```cmd
sc create AcchuSandboxEngine binPath= "C:\Path\To\AcchuSandboxEngine.exe" start= auto DisplayName= "ACCHU Sandbox Engine" depend= "Spooler"
```

- [ ] Service installed successfully
- [ ] Service configured with correct parameters
- [ ] Service account configured correctly
- [ ] Service dependencies configured

### Step 3: Directory Setup ✓
- [ ] Sandbox temp directory created
- [ ] Security log directory created
- [ ] Service log directory created
- [ ] Appropriate permissions set on directories

### Step 4: Service Startup ✓
```cmd
sc start AcchuSandboxEngine
```
- [ ] Service starts without errors
- [ ] Service status shows "Running"
- [ ] No startup errors in Event Log

## Post-Deployment Verification

### Service Health ✓
```powershell
Invoke-WebRequest -Uri "http://localhost:8080/health"
```
- [ ] Health endpoint responds with 200 OK
- [ ] Service health status is "Healthy"
- [ ] All health checks pass

### Logging Verification ✓
- [ ] Windows Event Log entries are being created
- [ ] Service log files are being written
- [ ] Security log files are being created (when events occur)
- [ ] Log rotation is working correctly

### Security Verification ✓
- [ ] Service runs under correct service account
- [ ] Directory permissions are restrictive
- [ ] Security event logging is functional
- [ ] Fail-closed behavior is working

### Performance Verification ✓
- [ ] Service startup time is acceptable
- [ ] Memory usage is within expected range
- [ ] CPU usage is minimal when idle
- [ ] Disk I/O patterns are normal

## Integration Testing

### API Testing ✓
- [ ] Health endpoint accessible
- [ ] Diagnostics endpoint accessible
- [ ] Authentication middleware working
- [ ] Rate limiting functional

### Print System Integration ✓
- [ ] Print Spooler integration working
- [ ] Test print job can be submitted
- [ ] Print job status tracking functional
- [ ] Print queue cleanup working

### Session Management ✓
- [ ] Session creation working
- [ ] Session exclusivity enforced
- [ ] Session timeout handling functional
- [ ] Session cleanup working

### File System Operations ✓
- [ ] Sandbox creation working
- [ ] File storage and validation working
- [ ] Secure deletion functional
- [ ] ACL enforcement working

## Security Testing

### Authentication Testing ✓
- [ ] Valid JWT tokens accepted
- [ ] Invalid JWT tokens rejected
- [ ] Token expiration handled correctly
- [ ] Token validation parameters working

### Authorization Testing ✓
- [ ] File source validation working
- [ ] Action restrictions enforced
- [ ] Parameter violations detected
- [ ] Security violations logged

### Fail-Closed Testing ✓
- [ ] Security failures trigger session invalidation
- [ ] File system errors trigger cleanup
- [ ] Print errors trigger session cleanup
- [ ] Network errors handled appropriately

## Monitoring Setup

### Event Log Monitoring ✓
- [ ] Windows Event Log source registered
- [ ] Critical events generate alerts
- [ ] Security events are monitored
- [ ] Performance events are tracked

### Health Monitoring ✓
- [ ] Health endpoint monitoring configured
- [ ] Service status monitoring active
- [ ] Disk space monitoring enabled
- [ ] Print system monitoring functional

### Log File Monitoring ✓
- [ ] Service log monitoring configured
- [ ] Security log monitoring active
- [ ] Log rotation monitoring enabled
- [ ] Log file size limits configured

## Documentation and Handover

### Documentation ✓
- [ ] Deployment documentation updated
- [ ] Configuration documentation complete
- [ ] Troubleshooting guide available
- [ ] Monitoring procedures documented

### Knowledge Transfer ✓
- [ ] Operations team trained
- [ ] Support procedures documented
- [ ] Escalation procedures defined
- [ ] Contact information updated

### Backup and Recovery ✓
- [ ] Configuration backup procedures defined
- [ ] Service recovery procedures tested
- [ ] Disaster recovery plan documented
- [ ] Backup verification procedures established

## Final Sign-Off

### Technical Sign-Off ✓
- [ ] All technical requirements met
- [ ] All tests passed
- [ ] Performance requirements met
- [ ] Security requirements satisfied

### Operational Sign-Off ✓
- [ ] Operations team accepts handover
- [ ] Monitoring systems configured
- [ ] Support procedures in place
- [ ] Documentation complete

### Business Sign-Off ✓
- [ ] Business requirements satisfied
- [ ] User acceptance testing complete
- [ ] Compliance requirements met
- [ ] Go-live approval obtained

## Post-Deployment Tasks

### Immediate (First 24 Hours) ✓
- [ ] Monitor service stability
- [ ] Check for any startup issues
- [ ] Verify logging is working
- [ ] Confirm health checks pass

### Short-term (First Week) ✓
- [ ] Monitor performance metrics
- [ ] Review security logs
- [ ] Check disk space usage
- [ ] Verify cleanup operations

### Long-term (First Month) ✓
- [ ] Performance tuning if needed
- [ ] Security review and audit
- [ ] Capacity planning review
- [ ] Documentation updates

## Rollback Plan

### Rollback Triggers ✓
- [ ] Service fails to start
- [ ] Critical security issues discovered
- [ ] Performance issues impact operations
- [ ] Data integrity concerns

### Rollback Procedure ✓
1. [ ] Stop the service
2. [ ] Restore previous configuration
3. [ ] Restart with previous version
4. [ ] Verify rollback successful
5. [ ] Document rollback reason

---

**Deployment Date**: _______________  
**Deployed By**: _______________  
**Approved By**: _______________  
**Environment**: _______________  

**Notes**:
_Use this space for deployment-specific notes, issues encountered, or deviations from standard procedure._

---

**Document Version**: 1.0  
**Last Updated**: [Current Date]  
**Applies To**: ACCHU Sandbox Engine v1.0+