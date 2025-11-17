# Feature: Remember Last Selected Repository

## Status
**Ready for Implementation** ✅

This document provides a complete specification for implementing the "remember last selected repository" feature.

## Overview
This feature enables the web clipper to remember the last selected repository for each account, improving user experience by automatically restoring the user's most recent repository selection when they reopen the extension.

## Current Behavior
- Each account has a `defaultRepositoryId` field that is set when creating or editing an account
- When the tool page loads, if a `defaultRepositoryId` is set for the current account, it auto-selects that repository
- The `defaultRepositoryId` is a static configuration that doesn't change based on user interactions
- Users must manually select their preferred repository each time if it differs from the default

## Proposed Behavior
- The extension should remember the last repository selected by the user for each account
- When the user manually selects a different repository using the RepositorySelect component, this selection should be persisted
- When the extension is reopened or the account is switched to, the last selected repository should be restored
- The last selected repository should take precedence over the `defaultRepositoryId`
- If no last selected repository exists, fall back to the `defaultRepositoryId` behavior

## Technical Specification

### Storage
- Add a new storage mechanism to persist the last selected repository per account
- Storage key: `lastSelectedRepositories` (JSON string containing object mapping accountId to repositoryId)
- Storage location: Browser sync storage (to sync across devices like other account settings)
- Data structure (stored as JSON string):
  ```typescript
  {
    [accountId: string]: string; // repositoryId
  }
  ```
- Access via `syncStorageService` from `src/common/chrome/storage.ts`

### State Management
- No changes to the existing `defaultRepositoryId` field in AccountPreference
- The `selectRepository` action in the clipper model should trigger storage of the selection
- When loading the tool page, check for a last selected repository before falling back to `defaultRepositoryId`

### Implementation Points

#### 1. Storage Helper Functions
Location: Create a new utility file `src/common/lastSelectedRepository.ts`

The existing `syncStorageService` API (from `src/common/chrome/storage.ts`) provides:
- `syncStorageService.get(key, defaultValue?)`
- `syncStorageService.set(key, value)`

Create new file with helper functions (with error handling):
```typescript
// src/common/lastSelectedRepository.ts
import { syncStorageService } from '@/common/chrome/storage';

const STORAGE_KEY = 'lastSelectedRepositories';

export async function getLastSelectedRepository(accountId: string): Promise<string | undefined> {
  try {
    const data = await syncStorageService.get(STORAGE_KEY, '{}');
    const parsed = JSON.parse(data);
    return parsed[accountId];
  } catch (error) {
    console.error('Failed to get last selected repository:', error);
    return undefined;
  }
}

export async function setLastSelectedRepository(accountId: string, repositoryId: string): Promise<void> {
  try {
    const data = await syncStorageService.get(STORAGE_KEY, '{}');
    const parsed = JSON.parse(data);
    parsed[accountId] = repositoryId;
    await syncStorageService.set(STORAGE_KEY, JSON.stringify(parsed));
  } catch (error) {
    console.error('Failed to set last selected repository:', error);
  }
}

export async function clearLastSelectedRepository(accountId: string): Promise<void> {
  try {
    const data = await syncStorageService.get(STORAGE_KEY, '{}');
    const parsed = JSON.parse(data);
    delete parsed[accountId];
    await syncStorageService.set(STORAGE_KEY, JSON.stringify(parsed));
  } catch (error) {
    console.error('Failed to clear last selected repository:', error);
  }
}
```

Then import these functions where needed:
- In `src/models/clipper.tsx`: `import { setLastSelectedRepository } from '@/common/lastSelectedRepository';`
- In `src/pages/tool/index.tsx`: `import { getLastSelectedRepository } from '@/common/lastSelectedRepository';`
- In `src/models/account.ts`: `import { clearLastSelectedRepository } from '@/common/lastSelectedRepository';`

#### 2. Update Repository Selection Logic
Location: `src/models/clipper.tsx`

Update the `selectRepository` case handler to persist the selection:
```typescript
.case(selectRepository, (state, { repositoryId }) => {
  const currentRepository = state.repositories.find(o => o.id === repositoryId);
  const updateContext = backend.getImageHostingService()?.updateContext;
  if (currentRepository && updateContext) {
    updateContext({ currentRepository });
  }
  
  // NEW: Persist the last selected repository
  if (state.currentAccountId) {
    setLastSelectedRepository(state.currentAccountId, repositoryId).catch(err => {
      console.error('Failed to persist last selected repository:', err);
    });
  }
  
  return {
    ...state,
    currentRepository,
  };
})
```

Note: Import `setLastSelectedRepository` at the top: 
```typescript
import { setLastSelectedRepository } from '@/common/lastSelectedRepository';
```

#### 3. Update Initial Selection Logic
Location: `src/pages/tool/index.tsx`

Current code (lines 119-126):
```typescript
useEffect(() => {
  if (currentAccount && currentAccount.defaultRepositoryId) {
    if (repositoryId) {
      return;
    }
    onRepositorySelect(currentAccount.defaultRepositoryId);
  }
}, [repositoryId, currentAccount, onRepositorySelect]);
```

Modified to check for last selected repository first:
```typescript
useEffect(() => {
  if (currentAccount && repositories.length > 0) {
    if (repositoryId) {
      return;
    }
    // NEW: Check for last selected repository first
    getLastSelectedRepository(currentAccount.id)
      .then(lastRepositoryId => {
        if (lastRepositoryId && repositories.some(r => r.id === lastRepositoryId)) {
          onRepositorySelect(lastRepositoryId);
        } else if (currentAccount.defaultRepositoryId) {
          onRepositorySelect(currentAccount.defaultRepositoryId);
        }
      })
      .catch(error => {
        console.error('Failed to load last selected repository:', error);
        // Fallback to default on error
        if (currentAccount.defaultRepositoryId) {
          onRepositorySelect(currentAccount.defaultRepositoryId);
        }
      });
  }
}, [repositoryId, currentAccount, onRepositorySelect, repositories]);
```

Key changes:
- Added `repositories.length > 0` check to prevent race condition
- Added `.catch()` block for error handling with fallback to default
- Added `repositories` to dependency array (required for the validation check)

Note: Import the `getLastSelectedRepository` helper function at the top of the file.

#### 4. Handle Account Changes
Location: `src/models/clipper.tsx`

The existing code in `asyncChangeAccount.done` already clears the `currentRepository`, which is correct. The restoration of the last selected repository will happen in the UI layer (tool/index.tsx) via the useEffect hook, which is the appropriate place for this logic as it handles the interaction between account state and repository selection.

No changes needed to `asyncChangeAccount.done` - the current implementation is correct:
```typescript
.case(
  asyncChangeAccount.done,
  (state, { params: { id }, result: { repositories, currentImageHostingService } }) => {
    return update(state, {
      currentAccountId: {
        $set: id,
      },
      repositories: {
        $set: repositories,
      },
      currentRepository: {
        // eslint-disable-next-line no-undefined
        $set: undefined, // Correctly clears, will be restored by useEffect
      },
      currentImageHostingService: {
        $set: currentImageHostingService,
      },
    });
  }
)
```

### Edge Cases to Handle

1. **Repository no longer exists**: If the last selected repository ID doesn't exist in the current repository list, fall back to `defaultRepositoryId`
2. **Repository is disabled**: If the last selected repository is disabled, fall back to `defaultRepositoryId`
3. **Account deletion**: Clean up last selected repository data when an account is deleted
4. **First time use**: When no last selected repository exists, use `defaultRepositoryId` as before
5. **Cross-device sync**: Consider whether to use sync storage or local storage based on desired behavior

### Cleanup on Account Deletion
Location: `src/models/account.ts`

Add cleanup when deleting an account:
```typescript
model.takeEvery(asyncDeleteAccount.started, function*({ id }, { select, call }) {
  // ... existing code at the beginning ...
  
  // NEW: Clean up last selected repository
  yield call(clearLastSelectedRepository, id);
  
  // ... existing code at the end (syncStorageService.set for accounts) ...
});
```

Import the `clearLastSelectedRepository` helper function at the top of the file.

## User Experience Flow

1. User opens the web clipper extension
2. If user has previously selected a repository for this account, that repository is automatically selected
3. User can manually change the repository using the dropdown
4. The new selection is immediately persisted
5. Next time the user opens the extension, their last selection is restored

## Potential Issues and Considerations

### Race Conditions
- The `useEffect` in `tool/index.tsx` may trigger before repositories are loaded
- Solution: Add `repositories` to dependency array and check `repositories.length > 0` before attempting selection

### Storage Corruption
- Invalid JSON in storage could cause errors
- Solution: Add try-catch blocks in helper functions to handle JSON.parse errors gracefully

### Migration
- No existing data to migrate (this is a new feature)
- Existing users will simply not have any last selected repositories until they make their first selection

## Testing Considerations

1. Test that last selected repository is persisted across browser sessions
2. Test that changing repository updates the stored value
3. Test that switching accounts loads the correct last selected repository for each account
4. Test fallback to `defaultRepositoryId` when last selected repository doesn't exist
5. Test that deleting an account cleans up its last selected repository data
6. Test behavior when no repository has been selected yet
7. Test with disabled repositories
8. Test with empty repository list (edge case)
9. Test JSON parsing errors in storage (corrupted data)
10. Test race condition where repositories are not yet loaded

## Benefits

- Improved user experience by reducing repetitive selections
- Maintains backward compatibility with existing `defaultRepositoryId` behavior
- Per-account memory allows different repositories for different accounts
- Seamless integration with existing codebase

## Implementation Complexity

- **Estimated effort**: Low to Medium (2-4 hours)
- **Risk level**: Low (non-breaking change, adds new functionality)
- **Testing effort**: Medium (requires testing multiple scenarios)

## Implementation Checklist

- [ ] Create `src/common/lastSelectedRepository.ts` with helper functions
- [ ] Update `src/models/clipper.tsx` to add saga for persisting repository selection
- [ ] Update `src/pages/tool/index.tsx` useEffect to load last selected repository
- [ ] Update `src/models/account.ts` to clean up on account deletion
- [ ] Test basic functionality (selection persistence)
- [ ] Test account switching
- [ ] Test edge cases (missing repository, disabled repository, etc.)
- [ ] Test account deletion cleanup
- [ ] Test error handling (corrupted storage)
- [ ] Verify backward compatibility

## Dependencies

- No new external dependencies required
- Uses existing storage infrastructure
- Minimal changes to existing code

## Future Enhancements

- Consider remembering last selected repository per domain/URL pattern
- Add UI to clear last selections
- Add settings toggle to enable/disable this feature
- Analytics on most frequently used repositories
