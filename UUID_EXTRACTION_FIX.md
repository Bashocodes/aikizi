# UUID Extraction Fix - CRITICAL BUG

## The Problem

**Post Detail Page was showing "Post not found" even though posts existed**

### Root Cause
The URL format is: `/p/{uuid}-{slug}`
Example: `/p/99dc0a0b-a886-4fde-bce9-649ac5886a29--sref-345678901-e8knme`

**Old Code (BROKEN):**
```javascript
const postId = id?.split('-')[0];
// Result: "99dc0a0b" ❌ INCOMPLETE UUID!
```

UUIDs have the format: `8-4-4-4-12` (separated by hyphens)
Example UUID: `99dc0a0b-a886-4fde-bce9-649ac5886a29`

Splitting on `-` and taking `[0]` only gives the first 8 characters, creating an invalid UUID!

### Error Message
```
Error fetching post: invalid input syntax for type uuid: "99dc0a0b"
```

## The Solution

**New Code (WORKING):**
```javascript
// Extract UUID from URL format: {uuid}-{slug}
// UUID format: 8-4-4-4-12 characters
const postId = id ? id.split('-').slice(0, 5).join('-') : undefined;
// Result: "99dc0a0b-a886-4fde-bce9-649ac5886a29" ✅ COMPLETE UUID!
```

**How it works:**
1. Split URL on `-`: `['99dc0a0b', 'a886', '4fde', 'bce9', '649ac5886a29', 'sref', '345678901', 'e8knme']`
2. Take first 5 parts: `['99dc0a0b', 'a886', '4fde', 'bce9', '649ac5886a29']`
3. Join with `-`: `"99dc0a0b-a886-4fde-bce9-649ac5886a29"`

## Impact

### Before Fix
- Gallery loads ✅
- Click post → "Post not found" ❌
- Console errors: "invalid input syntax for type uuid" ❌

### After Fix
- Gallery loads ✅
- Click post → Shows full post detail ✅
- Image displays ✅
- Analysis text displays ✅
- All metadata displays ✅

## Build Status
✅ Build successful

## Files Modified
- `/src/pages/PostDetailPage.tsx` - Line 52 (UUID extraction logic)
