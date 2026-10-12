<#
  BMIMS API verification script.
  Logs in as an admin, a staff member and a resident, then checks the main
  rules end to end (access control, row-level security, stored functions,
  triggers, error handling) and runs a concurrency test on the budget trigger.

  Run from the /server folder, with the API running:
      powershell -ExecutionPolicy Bypass -File .\scripts\verify-api.ps1

  Passwords are typed at the prompts (hidden). Nothing is saved.
  Test rows are created; the SQL to remove them is printed at the end.
#>
param([string]$BaseUrl = "http://localhost:3000")

$ErrorActionPreference = "Stop"
$script:results = @()
$script:cleanup = @()

function Read-Plain([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

# One HTTP call that never throws on 4xx/5xx: returns Status and parsed Data
function Call {
  param([string]$Method, [string]$Path, [hashtable]$Headers = @{}, $Body = $null)
  $params = @{ Method = $Method; Uri = "$BaseUrl$Path"; Headers = $Headers; UseBasicParsing = $true }
  if ($null -ne $Body) {
    $params.Body = ($Body | ConvertTo-Json -Depth 6)
    $params.ContentType = "application/json"
  }
  if ($PSVersionTable.PSVersion.Major -ge 7) { $params.SkipHttpErrorCheck = $true }

  $status = 0
  $text = ""
  try {
    $response = Invoke-WebRequest @params
    $status = [int]$response.StatusCode
    $text = $response.Content
  } catch {
    $errorResponse = $_.Exception.Response
    if ($null -eq $errorResponse) { throw }
    $status = [int]$errorResponse.StatusCode
    $reader = New-Object System.IO.StreamReader($errorResponse.GetResponseStream())
    $text = $reader.ReadToEnd()
  }

  $data = $null
  if ($text) {
    try { $data = $text | ConvertFrom-Json } catch { $data = $text }
  }
  return [pscustomobject]@{ Status = $status; Data = $data }
}

function Check([string]$Name, [bool]$Passed, [string]$Detail = "") {
  $script:results += [pscustomobject]@{ Name = $Name; Passed = $Passed }
  if ($Passed) {
    Write-Host ("PASS  " + $Name) -ForegroundColor Green
  } else {
    Write-Host ("FAIL  " + $Name + "   [" + $Detail + "]") -ForegroundColor Red
  }
}

function Login([string]$Username, [string]$Password) {
  $r = Call "POST" "/api/auth/login" @{} @{ username = $Username; password = $Password }
  if ($r.Status -ne 200) { throw "Login failed for $Username (HTTP $($r.Status)). Check the password." }
  return [pscustomobject]@{
    Headers = @{ Authorization = "Bearer $($r.Data.token)" }
    Token   = $r.Data.token
    User    = $r.Data.user
  }
}

function Detail($r) {
  $msg = ""
  if ($r.Data -and $r.Data.error) { $msg = $r.Data.error }
  return "HTTP $($r.Status) $msg"
}

Write-Host ""
Write-Host "BMIMS API verification against $BaseUrl" -ForegroundColor Cyan
Write-Host ""
$adminPass = Read-Plain "admin1 password"
$staffPass = Read-Plain "kagawad.health password"
$resPass   = Read-Plain "juan password"

$admin = Login "admin1" $adminPass
$staff = Login "kagawad.health" $staffPass
$res   = Login "juan" $resPass
$resId = [int]$res.User.resident_id

Write-Host ""
Write-Host "--- Basics and access control ---" -ForegroundColor Cyan

$r = Call "GET" "/api/health"
Check "Health check answers" ($r.Status -eq 200) (Detail $r)

$r = Call "GET" "/api/residents"
Check "No token is rejected (401)" ($r.Status -eq 401) (Detail $r)

$r = Call "GET" "/api/residents" @{ "x-tier" = "admin" }
Check "Fake x-tier header does not work (401)" ($r.Status -eq 401) (Detail $r)

$r = Call "GET" "/api/residents" $admin.Headers
Check "Admin sees all residents" ($r.Status -eq 200 -and @($r.Data).Count -ge 8) (Detail $r)

$r = Call "GET" "/api/residents" $res.Headers
Check "Resident sees only their own record" ($r.Status -eq 200 -and @($r.Data).Count -eq 1) (Detail $r)

foreach ($path in @("households", "staff", "committees", "document-types", "health-programs", "enrollments", "staff-assignments")) {
  $r = Call "GET" "/api/$path" $admin.Headers
  Check "Admin can read /api/$path" ($r.Status -eq 200) (Detail $r)
}

$r = Call "GET" "/api/committees" $staff.Headers
Check "Staff can read committees" ($r.Status -eq 200) (Detail $r)

$r = Call "POST" "/api/committees" $staff.Headers @{ committee_name = "Verify test committee" }
Check "Staff cannot create a committee (403)" ($r.Status -eq 403) (Detail $r)

$r = Call "GET" "/api/staff" $res.Headers
Check "Resident cannot read the staff list (403)" ($r.Status -eq 403) (Detail $r)

$r = Call "GET" "/api/committees" $res.Headers
Check "Resident can read committee names" ($r.Status -eq 200) (Detail $r)

$r = Call "GET" "/api/audit-logs" $res.Headers
Check "Resident cannot read the audit log (403)" ($r.Status -eq 403) (Detail $r)

$r = Call "GET" "/api/audit-logs" $staff.Headers
Check "Staff cannot read the audit log (403)" ($r.Status -eq 403) (Detail $r)

$r = Call "GET" "/api/expenses" $res.Headers
Check "Resident cannot read expenses (403)" ($r.Status -eq 403) (Detail $r)

$delete = Call "DELETE" "/api/residents/1" $admin.Headers
Check "Deleting a resident that other records need is blocked (409)" ($delete.Status -eq 409) (Detail $delete)

Write-Host ""
Write-Host "--- Service request and stored function sp_issue_certificate ---" -ForegroundColor Cyan

$sr = Call "POST" "/api/service-requests" $res.Headers @{ doc_type_id = 1; committee_id = 2 }
Check "Resident submits a request (Pending)" ($sr.Status -eq 201 -and $sr.Data.status -eq "Pending") (Detail $sr)
$reqId = $sr.Data.request_id

if ($reqId) {
  $script:cleanup += "DELETE FROM service_requests WHERE request_id = $reqId;"

  $r = Call "POST" "/api/service-requests/$reqId/issue" $res.Headers
  Check "Resident cannot issue a certificate (403)" ($r.Status -eq 403) (Detail $r)

  $r = Call "POST" "/api/service-requests/$reqId/issue" $admin.Headers
  $ref = $r.Data.reference_number
  Check "Admin issues it and gets a BRGY reference number" ($r.Status -eq 200 -and ($ref -match '^BRGY-\d{4}-\d{4}$')) (Detail $r)

  $r = Call "POST" "/api/service-requests/$reqId/issue" $admin.Headers
  Check "Issuing it twice is refused (422)" ($r.Status -eq 422) (Detail $r)

  $r = Call "GET" "/api/service-requests/$reqId" $res.Headers
  Check "Resident sees the request as Released" ($r.Status -eq 200 -and $r.Data.status -eq "Released") (Detail $r)

  $r = Call "GET" "/api/audit-logs?table_name=service_requests&record_id=$reqId" $admin.Headers
  $rows = @($r.Data)
  $logged = $rows | Where-Object { $_.changed_by_user_id -eq $admin.User.user_id }
  Check "Audit trigger recorded the issue with the admin as actor" ($r.Status -eq 200 -and @($logged).Count -ge 1) (Detail $r)
}

Write-Host ""
Write-Host "--- Incidents and stored functions ---" -ForegroundColor Cyan

$before = Call "GET" "/api/incidents?limit=200" $admin.Headers
$countBefore = @($before.Data).Count

$inc = Call "POST" "/api/incidents" $res.Headers @{
  committee_id = 2; location = "Verify test"; description = "verify-api test"
  participants = @(@{ resident_id = $resId; participant_role = "complainant"; statement = "verify-api test" })
}
Check "Resident files an incident as complainant" ($inc.Status -eq 201 -and $inc.Data.incident_id) (Detail $inc)
$incId = $inc.Data.incident_id

$r = Call "POST" "/api/incidents" $res.Headers @{
  committee_id = 2; location = "Verify test"; description = "verify-api test"
  participants = @(@{ resident_id = 3; participant_role = "complainant" })
}
Check "Resident cannot file on behalf of someone else (422)" ($r.Status -eq 422) (Detail $r)

if ($incId) {
  $script:cleanup += "DELETE FROM incident_reports WHERE incident_id = $incId;"

  $r = Call "POST" "/api/incidents/$incId/participants" $admin.Headers @{ resident_id = 3; participant_role = "respondent"; statement = "verify-api test" }
  Check "Admin adds a respondent" ($r.Status -eq 201) (Detail $r)

  $r = Call "POST" "/api/incidents/$incId/participants" $admin.Headers @{ resident_id = 3; participant_role = "respondent" }
  Check "Adding the same person twice is refused (409)" ($r.Status -eq 409) (Detail $r)

  $r = Call "POST" "/api/incidents/$incId/participants" $staff.Headers @{ resident_id = 4; participant_role = "witness" }
  Check "Staff from another committee cannot add people (422)" ($r.Status -eq 422) (Detail $r)

  $r = Call "GET" "/api/incidents/$incId" $admin.Headers
  Check "Admin sees both participants" ($r.Status -eq 200 -and @($r.Data.participants).Count -eq 2) (Detail $r)

  $r = Call "GET" "/api/incidents/$incId" $res.Headers
  Check "Resident sees only their own participant row" ($r.Status -eq 200 -and @($r.Data.participants).Count -eq 1) (Detail $r)

  $r = Call "GET" "/api/incidents" $staff.Headers
  $theirs = @($r.Data) | Where-Object { $_.incident_id -eq $incId }
  Check "Health staff cannot see a Peace and Order incident" ($r.Status -eq 200 -and @($theirs).Count -eq 0) (Detail $r)
}

$r = Call "POST" "/api/incidents" $admin.Headers @{
  committee_id = 2; location = "Verify test"; description = "verify-api rollback"
  participants = @(
    @{ resident_id = 1; participant_role = "complainant" },
    @{ resident_id = 999; participant_role = "witness" }
  )
}
Check "Unknown participant is refused (409)" ($r.Status -eq 409) (Detail $r)

$after = Call "GET" "/api/incidents?limit=200" $admin.Headers
$expected = $countBefore + $(if ($incId) { 1 } else { 0 })
Check "Failed filing left no half-saved incident" (@($after.Data).Count -eq $expected) "count $(@($after.Data).Count), expected $expected"

Write-Host ""
Write-Host "--- Budget trigger ---" -ForegroundColor Cyan

$b0 = Call "GET" "/api/budgets/3" $admin.Headers
$start = [decimal]$b0.Data.remaining_amount

$r = Call "POST" "/api/expenses" $admin.Headers @{ budget_id = 3; description = "verify-api test"; amount = 1000 }
Check "Admin logs an expense" ($r.Status -eq 201) (Detail $r)

$b1 = Call "GET" "/api/budgets/3" $admin.Headers
$mid = [decimal]$b1.Data.remaining_amount
Check "Budget dropped by exactly the expense amount" (($start - $mid) -eq 1000) "before $start, after $mid"

$tooBig = $mid + 1
$r = Call "POST" "/api/expenses" $admin.Headers @{ budget_id = 3; description = "verify-api test"; amount = $tooBig }
Check "Overspending is rejected (409)" ($r.Status -eq 409) (Detail $r)

$b2 = Call "GET" "/api/budgets/3" $admin.Headers
Check "Rejected expense left the budget unchanged" (([decimal]$b2.Data.remaining_amount) -eq $mid) "remaining $($b2.Data.remaining_amount)"

$r = Call "GET" "/api/expenses" $staff.Headers
Check "Staff can read expenses" ($r.Status -eq 200) (Detail $r)

Write-Host ""
Write-Host "--- Concurrency: two expenses at the same moment ---" -ForegroundColor Cyan

$remaining = [decimal]((Call "GET" "/api/budgets/3" $admin.Headers).Data.remaining_amount)
# Each expense alone fits, but both together do not
$each = [math]::Floor($remaining / 2) + 1

$jobScript = {
  param($Url, $Token, $Amount, $StartTicks)
  while ((Get-Date).Ticks -lt $StartTicks) { Start-Sleep -Milliseconds 2 }
  try {
    $response = Invoke-WebRequest -Method Post -Uri "$Url/api/expenses" -UseBasicParsing `
      -ContentType "application/json" -Headers @{ Authorization = "Bearer $Token" } `
      -Body (@{ budget_id = 3; description = "verify-api test"; amount = $Amount } | ConvertTo-Json)
    [int]$response.StatusCode
  } catch {
    if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { -1 }
  }
}

$startAt = (Get-Date).AddSeconds(5).Ticks
$j1 = Start-Job -ScriptBlock $jobScript -ArgumentList $BaseUrl, $admin.Token, $each, $startAt
$j2 = Start-Job -ScriptBlock $jobScript -ArgumentList $BaseUrl, $admin.Token, $each, $startAt
Wait-Job $j1, $j2 | Out-Null
$codes = @(Receive-Job $j1, $j2)
Remove-Job $j1, $j2

$created  = @($codes | Where-Object { $_ -eq 201 }).Count
$rejected = @($codes | Where-Object { $_ -eq 409 }).Count
Check "Exactly one of two simultaneous expenses is accepted" ($created -eq 1 -and $rejected -eq 1) ("codes: " + ($codes -join ", "))

$b3 = Call "GET" "/api/budgets/3" $admin.Headers
Check "Budget never went below zero and fell by one amount only" ((([decimal]$b3.Data.remaining_amount) -eq ($remaining - $each)) -and ([decimal]$b3.Data.remaining_amount -ge 0)) "remaining $($b3.Data.remaining_amount)"
$script:cleanup += "DELETE FROM expense_logs WHERE description = 'verify-api test';"

Write-Host ""
$failed = @($script:results | Where-Object { -not $_.Passed }).Count
$total = $script:results.Count
if ($failed -eq 0) {
  Write-Host "All $total checks passed." -ForegroundColor Green
} else {
  Write-Host "$failed of $total checks FAILED." -ForegroundColor Red
}

Write-Host ""
Write-Host "Remove the test rows by running this in the Neon SQL Editor" -ForegroundColor Yellow
Write-Host "(deleting the expenses first gives the money back to the budget):" -ForegroundColor Yellow
foreach ($line in ($script:cleanup | Sort-Object { if ($_ -like "DELETE FROM expense_logs*") { 0 } else { 1 } })) {
  Write-Host $line
}
