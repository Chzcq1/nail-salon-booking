---
name: React Query shared queryKey pitfall
description: When two components share a queryKey but use .then() side effects to set local state, cached data causes silent failures — the queryFn never re-runs, so side effects never fire.
---

## The Rule
Never put local `setState` calls inside a `queryFn`'s `.then()` chain as the only way to hydrate component state.

## Why
React Query deduplicates by `queryKey`. If component B mounts and the cache already has data for that key (from component A), React Query returns cached data immediately **without re-running `queryFn`**. Any `.then()` side effects in B's `queryFn` never execute. State stays at its initial value (e.g. `null`) → infinite spinner.

## Root cause in this project
`SettingsTab` and `ScheduleTab` both used `queryKey: ["nail-admin-settings"]` and set local state inside `queryFn(...).then(d => { setState(d); })`. When user visited ScheduleTab first, then switched to SettingsTab, the cache already had data, so SettingsTab's `setForm` never ran → `form` stayed null → infinite spinner.

## How to Apply
Always separate queryFn from state init:

```tsx
// ✅ Correct
const { data } = useQuery({
  queryKey: ["my-key"],
  queryFn: () => fetch("/api/...").then(r => r.json()),
  staleTime: 60000,
});

useEffect(() => {
  if (data) setMyState(data);
}, [data]);

// ❌ Wrong — queryFn may not re-run if data is cached
const { } = useQuery({
  queryKey: ["my-key"],
  queryFn: () => fetch("/api/...").then(r => r.json()).then(d => { setMyState(d); return d; }),
});
```

## Additional Fix Applied
After successful save + `invalidateQueries`, the useEffect runs again (data updates) and resets form to confirmed server values. Remove the `!myState` guard from useEffect so re-hydration happens on every data update (safe because staleTime prevents spurious background refetches).
