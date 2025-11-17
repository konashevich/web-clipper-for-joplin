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
