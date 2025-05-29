# Breaking Changes

## Version 0.2.0 (Unreleased)

### Filter Parameter Change

**What changed:**
The filter parameter name has been corrected from `filter_by` to `filter` to match Vikunja API v3.

**Previous behavior:**
```javascript
// Filters were sent using the incorrect parameter name
vikunja_tasks.list({ filter: "(priority >= 4 && done = false)" })
// API received: filter_by="(priority >= 4 && done = false)" -> 500 Error
```

**New behavior:**
```javascript
// Filters are now sent using the correct parameter name
vikunja_tasks.list({ filter: "(priority >= 4 && done = false)" })
// API receives: filter="(priority >= 4 && done = false)" -> Works correctly
```

**Impact:**
- Complex filters with parentheses and boolean operators now work as intended
- The filter conversion logic from PR #57 has been removed - filters are passed directly to the API
- No changes needed for users - the MCP interface remains the same

**Why this change was made:**
Investigation revealed that we were using the wrong parameter name. The Vikunja API v3 expects `filter`, not `filter_by`. This simple fix enables all the complex filter functionality that was already supported by the API.

---

For older breaking changes, see the git history.