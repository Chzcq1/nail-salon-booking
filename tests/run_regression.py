#!/usr/bin/env python3
"""
CSC Regression Test Runner
Runs all regression tests and generates a human-readable report.

Usage:
    python tests/run_regression.py
    python tests/run_regression.py --html       # also write report.html
    python tests/run_regression.py --flow booking
"""

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

# ── ANSI colours ─────────────────────────────────────────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

FLOW_MAP = {
    "superadmin":    "test_01_superadmin_login.py test_02_shop_registration.py",
    "shop_login":    "test_03_shop_login.py",
    "customer":      "test_04_customer_registration.py test_05_customer_login.py",
    "email_otp":     "test_06_email_otp.py",
    "totp":          "test_07_totp.py",
    "booking":       "test_08_booking.py",
    "wallet_topup":  "test_09_wallet_topup.py",
    "deposit":       "test_10_deposit_payment.py",
    "walkin":        "test_11_walkin.py",
    "renewal":       "test_12_shop_renewal.py",
    "feature_flags": "test_13_feature_flags.py",
    "dashboard":     "test_14_admin_dashboard.py",
}


def run_pytest(extra_args: list[str]) -> dict:
    """Run pytest and capture JSON output."""
    report_path = Path("/tmp/csc_regression_report.json")
    cmd = [
        sys.executable, "-m", "pytest",
        "tests/",
        f"--json-report",
        f"--json-report-file={report_path}",
        "--tb=short",
        "-q",
        *extra_args,
    ]
    start = time.time()
    result = subprocess.run(cmd, capture_output=False, text=True)
    duration = time.time() - start

    report = {}
    if report_path.exists():
        with open(report_path) as f:
            report = json.load(f)

    report["_duration"] = duration
    report["_returncode"] = result.returncode
    return report


def parse_report(report: dict):
    passed, failed, skipped, errors = [], [], [], []

    for test in report.get("tests", []):
        outcome = test.get("outcome", "unknown")
        name = test.get("nodeid", "unknown")
        if outcome == "passed":
            passed.append(name)
        elif outcome == "failed":
            failed.append({"name": name, "message": test.get("call", {}).get("longrepr", "")})
        elif outcome == "skipped":
            skipped.append(name)
        elif outcome == "error":
            errors.append({"name": name, "message": test.get("setup", {}).get("longrepr", "")})

    return passed, failed, skipped, errors


def print_report(report: dict, passed, failed, skipped, errors):
    total = len(passed) + len(failed) + len(skipped) + len(errors)
    duration = report.get("_duration", 0)

    print(f"\n{'═'*65}")
    print(f"{BOLD}  CSC Regression Report  —  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}{RESET}")
    print(f"{'═'*65}\n")

    # ── Summary ──────────────────────────────────────────────────────────────
    print(f"  {BOLD}SUMMARY{RESET}")
    print(f"  {'─'*40}")
    print(f"  Total tests  : {total}")
    print(f"  {GREEN}Passed{RESET}       : {len(passed)}")
    print(f"  {RED}Failed{RESET}       : {len(failed)}")
    print(f"  {YELLOW}Skipped{RESET}      : {len(skipped)}")
    print(f"  {RED}Errors{RESET}       : {len(errors)}")
    print(f"  Duration     : {duration:.1f}s\n")

    # ── Per-flow breakdown ────────────────────────────────────────────────────
    FLOW_LABELS = {
        "test_01": "Shop Registration",
        "test_02": "Shop Registration (flow)",
        "test_03": "Shop Login",
        "test_04": "Customer Registration",
        "test_05": "Customer Login",
        "test_06": "Email OTP",
        "test_07": "Google TOTP",
        "test_08": "Booking",
        "test_09": "Wallet Topup",
        "test_10": "Deposit Payment",
        "test_11": "Walk-in",
        "test_12": "Shop Renewal",
        "test_13": "Feature Flags",
        "test_14": "Admin Dashboard",
    }

    print(f"  {BOLD}PER-FLOW RESULTS{RESET}")
    print(f"  {'─'*55}")
    all_tests = report.get("tests", [])
    for prefix, label in FLOW_LABELS.items():
        flow_tests = [t for t in all_tests if prefix in t.get("nodeid", "")]
        if not flow_tests:
            continue
        p = sum(1 for t in flow_tests if t["outcome"] == "passed")
        f = sum(1 for t in flow_tests if t["outcome"] == "failed")
        s = sum(1 for t in flow_tests if t["outcome"] == "skipped")
        e = sum(1 for t in flow_tests if t["outcome"] == "error")
        status_icon = f"{GREEN}✓{RESET}" if (f + e) == 0 else f"{RED}✗{RESET}"
        print(f"  {status_icon}  {label:<28}  {p}✓  {f}✗  {s}⊘")
    print()

    # ── Passed tests ──────────────────────────────────────────────────────────
    if passed:
        print(f"  {GREEN}{BOLD}PASSED ({len(passed)}){RESET}")
        print(f"  {'─'*55}")
        for name in passed:
            short = name.split("::")[-1]
            print(f"  {GREEN}✓{RESET}  {short}")
        print()

    # ── Failed tests ──────────────────────────────────────────────────────────
    if failed:
        print(f"  {RED}{BOLD}FAILED ({len(failed)}){RESET}")
        print(f"  {'─'*55}")
        for item in failed:
            short = item["name"].split("::")[-1]
            print(f"  {RED}✗  {short}{RESET}")
            if item["message"]:
                # Print first 3 lines of failure message
                lines = str(item["message"]).strip().splitlines()
                for line in lines[:3]:
                    print(f"       {YELLOW}{line[:100]}{RESET}")
        print()

    # ── Errors ────────────────────────────────────────────────────────────────
    if errors:
        print(f"  {RED}{BOLD}SETUP ERRORS ({len(errors)}){RESET}")
        print(f"  {'─'*55}")
        for item in errors:
            print(f"  {RED}⚠  {item['name'].split('::')[-1]}{RESET}")

    # ── Skipped ───────────────────────────────────────────────────────────────
    if skipped:
        print(f"  {YELLOW}SKIPPED ({len(skipped)}){RESET}")
        for name in skipped:
            print(f"  ⊘  {name.split('::')[-1]}")
        print()

    # ── Overall verdict ───────────────────────────────────────────────────────
    print(f"{'═'*65}")
    if (len(failed) + len(errors)) == 0:
        print(f"{GREEN}{BOLD}  ✅  ALL TESTS PASSED{RESET}")
    else:
        print(f"{RED}{BOLD}  ❌  {len(failed) + len(errors)} TEST(S) FAILED — regression detected{RESET}")
    print(f"{'═'*65}\n")


def write_html_report(report: dict, passed, failed, skipped, errors, path="regression_report.html"):
    total = len(passed) + len(failed) + len(skipped) + len(errors)
    pass_pct = int(len(passed) / total * 100) if total else 0

    rows = ""
    for test in report.get("tests", []):
        outcome = test.get("outcome", "unknown")
        name = test.get("nodeid", "")
        module = name.split("::")[0].replace("tests/", "")
        fn = name.split("::")[-1]
        duration = test.get("call", {}).get("duration", 0)
        colour = {"passed": "#22c55e", "failed": "#ef4444", "skipped": "#f59e0b", "error": "#dc2626"}.get(outcome, "#6b7280")
        icon = {"passed": "✓", "failed": "✗", "skipped": "⊘", "error": "⚠"}.get(outcome, "?")
        longrepr = ""
        if outcome in ("failed", "error"):
            raw = test.get("call", {}).get("longrepr") or test.get("setup", {}).get("longrepr", "")
            longrepr = f"<pre style='font-size:11px;background:#1e293b;padding:8px;border-radius:4px;overflow:auto;max-height:120px;color:#fca5a5'>{str(raw)[:600]}</pre>"
        rows += f"""
        <tr>
          <td style='color:{colour};font-size:18px;text-align:center'>{icon}</td>
          <td style='color:#94a3b8;font-size:12px'>{module}</td>
          <td style='font-weight:500'>{fn}</td>
          <td style='color:#64748b;font-size:12px'>{duration:.2f}s</td>
          <td>{longrepr}</td>
        </tr>"""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>CSC Regression Report</title>
<style>
  body{{font-family:'Inter',sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:24px}}
  h1{{margin:0 0 4px;font-size:22px}}
  .meta{{color:#64748b;font-size:13px;margin-bottom:24px}}
  .cards{{display:flex;gap:16px;margin-bottom:32px;flex-wrap:wrap}}
  .card{{background:#1e293b;border-radius:12px;padding:20px 28px;min-width:130px}}
  .card .num{{font-size:36px;font-weight:700}}
  .card .lbl{{font-size:13px;color:#64748b;margin-top:2px}}
  .pass{{color:#22c55e}}.fail{{color:#ef4444}}.skip{{color:#f59e0b}}.total{{color:#e2e8f0}}
  table{{width:100%;border-collapse:collapse;background:#1e293b;border-radius:12px;overflow:hidden}}
  th{{text-align:left;padding:12px 16px;font-size:12px;color:#64748b;border-bottom:1px solid #334155;background:#0f172a}}
  td{{padding:10px 16px;border-bottom:1px solid #1e293b;vertical-align:top}}
  tr:hover td{{background:#263347}}
  .bar{{background:#1e293b;border-radius:99px;height:10px;width:200px;overflow:hidden;display:inline-block;vertical-align:middle;margin-left:12px}}
  .bar-fill{{height:100%;background:#22c55e;border-radius:99px}}
</style>
</head>
<body>
<h1>🧪 CSC Regression Report</h1>
<p class="meta">Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} &nbsp;|&nbsp; Duration: {report.get('_duration', 0):.1f}s</p>
<div class="cards">
  <div class="card"><div class="num total">{total}</div><div class="lbl">Total</div></div>
  <div class="card"><div class="num pass">{len(passed)}</div><div class="lbl">Passed</div></div>
  <div class="card"><div class="num fail">{len(failed) + len(errors)}</div><div class="lbl">Failed</div></div>
  <div class="card"><div class="num skip">{len(skipped)}</div><div class="lbl">Skipped</div></div>
  <div class="card">
    <div class="num pass">{pass_pct}%</div>
    <div class="lbl">Pass rate
      <div class="bar"><div class="bar-fill" style="width:{pass_pct}%"></div></div>
    </div>
  </div>
</div>
<table>
<thead><tr><th></th><th>File</th><th>Test</th><th>Time</th><th>Details</th></tr></thead>
<tbody>{rows}</tbody>
</table>
</body></html>"""

    with open(path, "w") as f:
        f.write(html)
    print(f"  HTML report written → {path}")


def main():
    parser = argparse.ArgumentParser(description="CSC Regression Runner")
    parser.add_argument("--html", action="store_true", help="Write HTML report")
    parser.add_argument("--flow", help=f"Run only one flow: {', '.join(FLOW_MAP)}")
    parser.add_argument("--fail-fast", "-x", action="store_true")
    args = parser.parse_args()

    extra_args = []
    if args.flow:
        files = FLOW_MAP.get(args.flow)
        if not files:
            print(f"Unknown flow '{args.flow}'. Options: {', '.join(FLOW_MAP)}")
            sys.exit(1)
        extra_args += [f"tests/{f}" for f in files.split()]
    if args.fail_fast:
        extra_args.append("-x")

    # Ensure pytest-json-report is installed
    try:
        import pytest_jsonreport  # noqa
    except ImportError:
        print("Installing pytest-json-report…")
        subprocess.run([sys.executable, "-m", "pip", "install", "pytest-json-report", "-q"])

    report = run_pytest(extra_args)
    passed, failed, skipped, errors = parse_report(report)
    print_report(report, passed, failed, skipped, errors)

    if args.html:
        write_html_report(report, passed, failed, skipped, errors)

    sys.exit(0 if (len(failed) + len(errors)) == 0 else 1)


if __name__ == "__main__":
    main()
