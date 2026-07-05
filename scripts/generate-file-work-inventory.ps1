param(
  [string]$Root = "."
)

$ErrorActionPreference = "Stop"

function Normalize-PathForReport {
  param([string]$Path)
  return ($Path -replace "\\", "/")
}

function Escape-Cell {
  param([string]$Text)
  if ([string]::IsNullOrWhiteSpace($Text)) { return "-" }
  $clean = $Text -replace "`r?`n", " "
  $clean = $clean -replace "\|", "\|"
  $clean = $clean -replace "\s+", " "
  return $clean.Trim()
}

function Get-RegexMatches {
  param(
    [string]$Text,
    [string]$Pattern
  )
  $matches = [regex]::Matches($Text, $Pattern, "Multiline")
  $items = @()
  foreach ($match in $matches) {
    if ($match.Groups.Count -gt 1) {
      $items += $match.Groups[1].Value
    }
  }
  return $items | Select-Object -Unique
}

function Get-BackendPurpose {
  param([string]$RelPath, [string]$Name)
  $p = $RelPath.ToLowerInvariant()
  $base = [IO.Path]::GetFileNameWithoutExtension($Name)
  $base = $base -replace "\.service$", "" -replace "\.controller$", "" -replace "\.routes$", "" -replace "\.worker$", "" -replace "\.queue$", "" -replace "\.cron$", ""

  if ($p -eq "backend/src/app.ts") { return "Express application composition: middleware, parsers, API route mounting, response normalization, and error handling." }
  if ($p -eq "backend/src/server.ts") { return "Backend process entrypoint: initializes env, database, Redis/queues, workers, sockets, startup tasks, and graceful shutdown." }
  if ($p -like "backend/src/routes/*") { return "Defines HTTP/API/webhook endpoints for the $base backend surface and wires controllers/middleware." }
  if ($p -like "backend/src/controllers/*") { return "Handles request/response orchestration for `${base}: validates HTTP inputs, calls services, and returns API payloads." }
  if ($p -like "backend/src/services/executive/*") { return "Executive Brain module for `${base}: identity/reasoning/memory/planning/decision intelligence behavior." }
  if ($p -like "backend/src/services/revenuebrain/*") { return "Revenue Brain module for `${base}: inbound sales reasoning, state, memory, tool planning, and delivery." }
  if ($p -like "backend/src/services/salesagent/*") { return "Sales Agent module for `${base}: lead intent, reply policy, pricing flow, progression, optimization, and conversion handling." }
  if ($p -like "backend/src/services/crm/*") { return "CRM intelligence module for `${base}: customer graph, lifecycle, segmentation, state, value, and refresh behavior." }
  if ($p -like "backend/src/services/autonomous/*") { return "Autonomous revenue/growth operations module for `${base}: campaigns, retention, expansion, referrals, guardrails, and observability." }
  if ($p -like "backend/src/services/commerce/*") { return "Commerce provider/domain module for `${base}: payment provider abstraction, checkout, credentials, or commerce shared behavior." }
  if ($p -like "backend/src/services/conversion/*") { return "Conversion engine module for `${base}: persuasion, urgency, offer, trust, objection, CTA, negotiation, and close logic." }
  if ($p -like "backend/src/services/security/*") { return "Security governance module for `${base}: KMS, authorization, tenant isolation, security events, or compliance controls." }
  if ($p -like "backend/src/services/reliability/*") { return "Reliability module for `${base}: resilience, self-audit, runtime reliability, and infrastructure hardening." }
  if ($p -like "backend/src/services/intelligence/*") { return "Business intelligence OS module for `${base}: forecasts, optimization, runtime influence, and strategic intelligence loops." }
  if ($p -like "backend/src/services/*") { return "Business/domain service for `${base}: implements reusable backend behavior behind controllers, workers, or runtime modules." }
  if ($p -like "backend/src/runtime/workflow/*") { return "Workflow runtime component for `${base}: definitions, execution orchestration, memory, triggers, and workflow observability." }
  if ($p -like "backend/src/runtime/execution/*") { return "Tool execution runtime component for `${base}: validation, permissioning, policies, approvals, retries, circuit breaking, and scheduling." }
  if ($p -like "backend/src/runtime/intelligence/*") { return "Runtime intelligence component for `${base}: context, constitution, prompt compilation, memory, reasoning, and learning." }
  if ($p -like "backend/src/runtime/communication/*") { return "Communication runtime component for `${base}: event bus, contracts, routing, identity, correlation, scheduling, or DLQ behavior." }
  if ($p -like "backend/src/runtime/governance/*") { return "Runtime governance component for `${base}: policies, semantic resolution, decision metadata, and governance state." }
  if ($p -like "backend/src/runtime/observability/*") { return "Runtime observability component for `${base}: metrics, tracing, telemetry, audit, health, costs, alerts, or analytics." }
  if ($p -like "backend/src/runtime/models/*") { return "Model runtime component for `${base}: model registry, providers, routing, fallback, cost, and health management." }
  if ($p -like "backend/src/runtime/sandbox/*") { return "Sandbox/simulation runtime component for `${base}: replay, shadow mode, safety evaluation, experiments, scenarios, and certification." }
  if ($p -like "backend/src/runtime/oig/*") { return "Operational intelligence graph runtime for `${base}: graph/event integration and operating-system style intelligence contracts." }
  if ($p -like "backend/src/runtime/kernel/*") { return "Runtime kernel component for `${base}: DI, config, lifecycle, feature flags, health, manifest, and guardrails." }
  if ($p -like "backend/src/runtime/core/*") { return "Legacy/core runtime component for `${base}: universal core, plugins, capability registry, compatibility, and module registration." }
  if ($p -like "backend/src/runtime/interfaces/*") { return "Runtime interface contract for `${base}: shared types and boundaries between runtime subsystems." }
  if ($p -like "backend/src/middleware/*") { return "Express middleware for `${base}: request authentication, tenancy, RBAC, rate limiting, monitoring, subscriptions, or upload handling." }
  if ($p -like "backend/src/queues/*") { return "Queue definition/enqueue helper for $base jobs." }
  if ($p -like "backend/src/workers/*") { return "Background worker for `${base}: consumes queue jobs or runs partitioned async processing." }
  if ($p -like "backend/src/cron/*") { return "Scheduled cron task for $base maintenance or recurring automation." }
  if ($p -like "backend/src/config/*") { return "Runtime configuration for $base." }
  if ($p -like "backend/src/utils/*") { return "Utility helper for $base shared across backend modules." }
  if ($p -like "backend/src/tests/*") { return "Automated test or test harness validating $base behavior/regressions." }
  if ($p -like "backend/src/observability/*") { return "Backend observability helper for `${base}: logging, context, metrics, or Sentry." }
  if ($p -like "backend/src/types/*") { return "Type definition or Express/request augmentation for $base." }
  if ($p -like "backend/src/analytics/*") { return "Analytics repository/cache module for $base data access." }
  if ($p -like "backend/src/scripts/*") { return "Operational script for $base maintenance, benchmark, backfill, or rollback." }
  if ($p -like "backend/src/redis/*") { return "Redis helper for $base safety or rate-limit integration." }
  if ($p -like "backend/src/sockets/*") { return "Socket.IO server module for real-time client updates." }
  return "Backend source file for $base behavior."
}

function Get-FrontendPurpose {
  param([string]$RelPath, [string]$Name)
  $p = $RelPath.ToLowerInvariant()
  $base = [IO.Path]::GetFileNameWithoutExtension($Name)

  if ($p -like "frontend/app/*/page.tsx" -or $p -eq "frontend/app/page.tsx") { return "Next.js route page: renders the user-facing screen for this route and wires page-level data/actions." }
  if ($p -like "frontend/app/*/layout.tsx" -or $p -eq "frontend/app/layout.tsx") { return "Next.js layout: wraps route segment content with providers, shell, metadata, or shared UI structure." }
  if ($p -eq "frontend/app/globals.css") { return "Global styling: Tailwind import, design tokens, brand shell classes, form/button/card utilities, and scrollbar/tooltip styles." }
  if ($p -eq "frontend/app/manifest.ts") { return "PWA manifest metadata for app name, icons, theme color, display mode, and shortcuts." }
  if ($p -like "frontend/components/*") {
    $folder = ($RelPath -split "/")[2]
    return "Frontend $folder component: renders reusable UI and interaction logic for $base."
  }
  if ($p -like "frontend/lib/*") { return "Frontend library/API helper for `${base}: client requests, URL/auth/billing/security/domain utilities, or presentation transforms." }
  if ($p -like "frontend/hooks/*") { return "Custom React hook for $base state, fetching, debounce, auth guard, notifications, or dashboard behavior." }
  if ($p -like "frontend/context/*") { return "React context provider/state module for $base cross-app state." }
  if ($p -like "frontend/providers/*" -or $p -eq "frontend/providers.tsx") { return "Provider composition module for app-wide React Query/auth/client providers." }
  return "Frontend source file for $base behavior."
}

function Analyze-File {
  param([IO.FileInfo]$File, [string]$RootPath)
  $full = $File.FullName
  $rel = Normalize-PathForReport ($full.Substring($RootPath.Length + 1))
  $text = Get-Content -Raw -LiteralPath $full
  $lines = if ($text.Length -eq 0) { 0 } else { ($text -split "`r?`n").Count }
  $name = $File.Name
  $isBackend = $rel -like "backend/src/*"
  $isFrontend = $rel -like "frontend/*"
  $purpose = if ($isBackend) { Get-BackendPurpose $rel $name } else { Get-FrontendPurpose $rel $name }

  $exports = @()
  $exports += Get-RegexMatches $text "export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+([A-Za-z0-9_]+)"
  $exports += Get-RegexMatches $text "export\s*\{\s*([^}]+)\s*\}"
  $exports = $exports | ForEach-Object { ($_ -replace "\s+as\s+", " as ").Trim() } | Select-Object -Unique

  $components = @()
  if ($rel -like "frontend/*.tsx" -or $rel -like "frontend/*.ts") {
    $components += Get-RegexMatches $text "export\s+default\s+function\s+([A-Z][A-Za-z0-9_]*)"
    $components += Get-RegexMatches $text "function\s+([A-Z][A-Za-z0-9_]*)\s*\("
    $components += Get-RegexMatches $text "const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*(?:memo\()?[\(\w]"
    $components = $components | Select-Object -Unique
  }

  $routes = @()
  if ($rel -like "backend/src/routes/*" -or $rel -like "backend/src/app.ts") {
    $routeMatches = [regex]::Matches($text, "router\.(get|post|put|patch|delete)\s*\(\s*[""']([^""']+)", "Multiline")
    foreach ($m in $routeMatches) { $routes += ($m.Groups[1].Value.ToUpperInvariant() + " " + $m.Groups[2].Value) }
    $appMatches = [regex]::Matches($text, "app\.(get|post|put|patch|delete|use)\s*\(\s*[""']([^""']+)", "Multiline")
    foreach ($m in $appMatches) { $routes += ("APP " + $m.Groups[1].Value.ToUpperInvariant() + " " + $m.Groups[2].Value) }
  }

  $hooks = @()
  if ($isFrontend) {
    foreach ($h in @("useState","useEffect","useMemo","useCallback","useQuery","useMutation","useRef","useRouter","useAuth")) {
      if ($text.Contains($h)) { $hooks += $h }
    }
  }

  $signals = @()
  foreach ($sig in @("prisma.","redis","openai","stripe","twilio","socket","localStorage","sessionStorage","api.","apiFetch","fetch(","axios","BullMQ","Queue","Worker","cron","zod","helmet","cors")) {
    if ($text.Contains($sig)) { $signals += $sig }
  }

  $risk = @()
  if ($File.Length -gt 100KB) { $risk += "very large file" }
  elseif ($File.Length -gt 40KB) { $risk += "large file" }
  if ($text -match "TODO|FIXME|mock|placeholder|fallback") { $risk += "contains TODO/mock/fallback signals" }
  if ($text -match "localStorage|sessionStorage") { $risk += "browser storage state" }
  if ($text -match "console\.(log|warn|error|info)") { $risk += "console logging" }

  return [PSCustomObject]@{
    Path = $rel
    Area = if ($isBackend) { "backend" } elseif ($isFrontend) { "frontend" } else { "other" }
    Lines = $lines
    SizeKB = [math]::Round($File.Length / 1KB, 1)
    Work = $purpose
    Exports = ($exports -join ", ")
    Components = ($components -join ", ")
    Routes = ($routes -join "; ")
    Hooks = ($hooks -join ", ")
    Signals = ($signals -join ", ")
    RiskNotes = ($risk -join "; ")
  }
}

$rootPath = (Resolve-Path $Root).Path
$sourcePatterns = @(
  "backend/src",
  "frontend/app",
  "frontend/components",
  "frontend/lib",
  "frontend/hooks",
  "frontend/context",
  "frontend/providers",
  "frontend/providers.tsx"
)

$files = @()
foreach ($pattern in $sourcePatterns) {
  $candidate = Join-Path $rootPath $pattern
  if (Test-Path -LiteralPath $candidate -PathType Leaf) {
    $files += Get-Item -LiteralPath $candidate
  } elseif (Test-Path -LiteralPath $candidate -PathType Container) {
    $files += Get-ChildItem -LiteralPath $candidate -Recurse -File -Include *.ts,*.tsx,*.css
  }
}

$files = $files | Sort-Object FullName -Unique
$records = foreach ($file in $files) { Analyze-File $file $rootPath }

$docsDir = Join-Path $rootPath "docs"
if (!(Test-Path -LiteralPath $docsDir)) {
  New-Item -ItemType Directory -Path $docsDir | Out-Null
}

$inventoryPath = Join-Path $docsDir "source_file_work_inventory_2026-07-03.md"
$frontendPath = Join-Path $docsDir "frontend_component_work_inventory_2026-07-03.md"

$lines = @()
$lines += "# Source File Work Inventory"
$lines += ""
$lines += "Generated: 2026-07-03"
$lines += "Scope: backend source plus frontend app/components/lib/hooks/context/providers. Build artifacts and node_modules are excluded."
$lines += ""
$lines += "## Summary"
$lines += ""
$lines += "- Files inventoried: $($records.Count)"
$lines += "- Backend files: $(($records | Where-Object Area -eq 'backend').Count)"
$lines += "- Frontend files: $(($records | Where-Object Area -eq 'frontend').Count)"
$lines += "- Large/very large files flagged: $(($records | Where-Object { $_.RiskNotes -match 'large file' }).Count)"
$lines += ""
$lines += "## Inventory"
$lines += ""
$lines += "| Path | Lines | KB | Work | Exports / Components / Routes | Signals | Risk notes |"
$lines += "|---|---:|---:|---|---|---|---|"
foreach ($r in $records) {
  $detail = @()
  if ($r.Exports) { $detail += "Exports: $($r.Exports)" }
  if ($r.Components) { $detail += "Components: $($r.Components)" }
  if ($r.Routes) { $detail += "Routes: $($r.Routes)" }
  $lines += "| $(Escape-Cell $r.Path) | $($r.Lines) | $($r.SizeKB) | $(Escape-Cell $r.Work) | $(Escape-Cell ($detail -join ' / ')) | $(Escape-Cell $r.Signals) | $(Escape-Cell $r.RiskNotes) |"
}
Set-Content -LiteralPath $inventoryPath -Value ($lines -join "`r`n") -Encoding UTF8

$front = $records | Where-Object { $_.Area -eq "frontend" } | Sort-Object Path
$componentLines = @()
$componentLines += "# Frontend Component Work Inventory"
$componentLines += ""
$componentLines += "Generated: 2026-07-03"
$componentLines += "Scope: every frontend route, component, hook, context, provider, and library helper under active source folders."
$componentLines += ""
$componentLines += "## Frontend Components And Pages"
$componentLines += ""
$componentLines += "| File | Components / page exports | What it does | Hooks/state | API/storage/runtime signals | Risk notes |"
$componentLines += "|---|---|---|---|---|---|"
foreach ($r in $front) {
  $names = if ($r.Components) { $r.Components } elseif ($r.Exports) { $r.Exports } else { "-" }
  $componentLines += "| $(Escape-Cell $r.Path) | $(Escape-Cell $names) | $(Escape-Cell $r.Work) | $(Escape-Cell $r.Hooks) | $(Escape-Cell $r.Signals) | $(Escape-Cell $r.RiskNotes) |"
}

$componentLines += ""
$componentLines += "## Component Families"
$componentLines += ""
$families = $front | Where-Object { $_.Path -like "frontend/components/*" } | Group-Object { ($_.Path -split "/")[2] } | Sort-Object Name
foreach ($family in $families) {
  $componentLines += "### $($family.Name)"
  foreach ($r in ($family.Group | Sort-Object Path)) {
    $names = if ($r.Components) { $r.Components } elseif ($r.Exports) { $r.Exports } else { [IO.Path]::GetFileNameWithoutExtension($r.Path) }
    $componentLines += "- `$($r.Path)`: $(Escape-Cell $r.Work) Names: $(Escape-Cell $names). Signals: $(Escape-Cell $r.Signals)."
  }
  $componentLines += ""
}
Set-Content -LiteralPath $frontendPath -Value ($componentLines -join "`r`n") -Encoding UTF8

Write-Output "Generated $inventoryPath"
Write-Output "Generated $frontendPath"

