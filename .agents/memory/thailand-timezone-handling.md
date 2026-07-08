---
name: Thailand timezone handling
description: How "now"/"today" is computed for Thailand-local business logic in this codebase
---

The app's core `_now()` helper (in `backend/routes/nail.py`) returns naive-UTC-aware `datetime.now(timezone.utc)`. There is no server-level Thailand timezone config — the DB and app run in UTC.

Any business rule that depends on "what day/time is it right now for the shop" (e.g. filtering out time slots that have already passed today, "is this booking today") must NOT compare directly against `_now()`. Instead convert explicitly:

```python
TH_TZ = timezone(timedelta(hours=7))  # Thailand has no DST, so a fixed offset is safe
def _now_th() -> datetime:
    return _now().astimezone(TH_TZ)
```

Use `_now_th().strftime("%Y-%m-%d")` / `"%H:%M"` to compare against the string-based `slot_date`/`start_time` fields already used throughout `nail.py`.

**Why:** Comparing raw UTC time against Thai wall-clock expectations silently keeps/removes the wrong slots (off by up to 7 hours) — this was the root cause of "today's already-passed time slots stay bookable all day."

**How to apply:** Any new nail-booking feature that reasons about "today" or "has this time passed" must go through `_now_th()`, not `_now()` directly.
