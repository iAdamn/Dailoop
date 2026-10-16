import type { PresentationPreferences } from '../src/infrastructure/preferences';

let mockPersisted: string | null = null;
const mockWrite = jest.fn<Promise<void>, [string]>();
const mockDatabase = {
  getFirstAsync: jest.fn(async (sql: string) => sql.includes('PRAGMA') ? { user_version: 1 } : mockPersisted === null ? null : { json: mockPersisted }),
  execAsync: jest.fn(async () => undefined),
  withTransactionAsync: jest.fn(async (work: () => Promise<void>) => work()),
  runAsync: jest.fn(async (_sql: string, json: string) => { await mockWrite(json); mockPersisted = json; }),
};
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn(async () => mockDatabase) }));

async function freshStore() {
  delete (globalThis as typeof globalThis & { __dailoopPresentation?: unknown }).__dailoopPresentation;
  let preferences!: typeof import('../src/infrastructure/preferences');
  jest.isolateModules(() => { preferences = jest.requireActual('../src/infrastructure/preferences'); });
  return preferences;
}

beforeEach(() => {
  mockPersisted = null;
  jest.clearAllMocks();
  mockWrite.mockImplementation(async () => undefined);
});
afterEach(() => { delete (globalThis as typeof globalThis & { __dailoopPresentation?: unknown }).__dailoopPresentation; });

test('presentation parsing accepts only the four choices and recovers malformed local values', async () => {
  const { parsePresentationPreferences } = await freshStore();
  for (const columns of [1, 2, 3, 4]) expect(parsePresentationPreferences(JSON.stringify({ activityColumns: columns, homeListMode: 'activities' }))).toEqual({ activityColumns: columns, homeListMode: 'activities' });
  for (const value of [null, '', 'broken', '{}', 'null', '[]', '{"activityColumns":0}', '{"activityColumns":5}', '{"activityColumns":"4"}']) {
    expect(parsePresentationPreferences(value)).toEqual({ activityColumns: 1, homeListMode: 'activities' });
  }
});

test('native preference is announced only after its write commits and loads after a fresh store', async () => {
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const commit = new Promise<void>(resolve => { release = resolve; });
  mockWrite.mockImplementationOnce(async () => { entered(); await commit; });
  const store = (await freshStore()).presentationPreferences;
  expect(await store.load()).toEqual({ activityColumns: 1, homeListMode: 'activities' });
  const published: PresentationPreferences[] = [];
  store.subscribe(value => published.push(value));
  const pending = store.setColumns(4);
  await started;
  expect(published).toEqual([]);
  expect(mockPersisted).toBeNull();
  release();
  expect(await pending).toEqual({ activityColumns: 4, homeListMode: 'activities' });
  expect(published).toEqual([{ activityColumns: 4, homeListMode: 'activities' }]);
  expect(await (await freshStore()).presentationPreferences.load()).toEqual({ activityColumns: 4, homeListMode: 'activities' });
});

test('failed preference write preserves the prior value and does not poison later serialized writes', async () => {
  mockPersisted = '{"activityColumns":2}';
  const store = (await freshStore()).presentationPreferences;
  await store.load();
  const published: PresentationPreferences[] = [];
  store.subscribe(value => published.push(value));
  mockWrite.mockRejectedValueOnce(new Error('SQLite full'));
  await expect(store.setColumns(4)).rejects.toThrow('SQLite full');
  expect(mockPersisted).toBe('{"activityColumns":2}');
  expect(published).toEqual([]);
  await expect(store.setColumns(3)).resolves.toEqual({ activityColumns: 3, homeListMode: 'activities' });
  expect(published).toEqual([{ activityColumns: 3, homeListMode: 'activities' }]);
});

test('queued changes preserve user order and invalid runtime requests never reach storage', async () => {
  const store = (await freshStore()).presentationPreferences;
  await store.load();
  await Promise.all([store.setColumns(2), store.setColumns(4), store.setColumns(1)]);
  expect(mockWrite.mock.calls.map(([json]) => JSON.parse(json).activityColumns)).toEqual([2, 4, 1]);
  await expect(store.setColumns(5 as 1)).rejects.toThrow('Selecciona');
  expect(mockWrite).toHaveBeenCalledTimes(3);
  expect(await (await freshStore()).presentationPreferences.load()).toEqual({ activityColumns: 1, homeListMode: 'activities' });
});


test('old preferences gain activities mode; folder mode and columns survive queued changes and restart', async () => {
  const { parsePresentationPreferences, presentationPreferences: store } = await freshStore();
  expect(parsePresentationPreferences('{"activityColumns":4}')).toEqual({ activityColumns: 4, homeListMode: 'activities' });
  expect(parsePresentationPreferences('{"activityColumns":0,"homeListMode":"categories"}')).toEqual({ activityColumns: 1, homeListMode: 'categories' });
  await store.load();
  await Promise.all([store.setHomeListMode('categories'), store.setColumns(3)]);
  expect(await (await freshStore()).presentationPreferences.load()).toEqual({ activityColumns: 3, homeListMode: 'categories' });
  await expect(store.setHomeListMode('invalid' as 'categories')).rejects.toThrow('Selecciona');
});

test('language commits only after storage, survives restart and preserves existing presentation choices',async()=>{
  const preferences=await freshStore();
  for(const language of ['es','en','pt'])expect(preferences.parsePresentationPreferences(JSON.stringify({activityColumns:3,homeListMode:'categories',language}))).toEqual({activityColumns:3,homeListMode:'categories',language});
  for(const language of ['fr','pt-PT',null,{},42])expect(preferences.parsePresentationPreferences(JSON.stringify({activityColumns:3,language}))).toEqual({activityColumns:3,homeListMode:'activities'});
  mockPersisted='{"activityColumns":4,"homeListMode":"categories"}';
  const store=preferences.presentationPreferences;await store.load();
  let release!:()=>void;let entered!:()=>void;
  const started=new Promise<void>(resolve=>{entered=resolve;});
  const commit=new Promise<void>(resolve=>{release=resolve;});
  mockWrite.mockImplementationOnce(async()=>{entered();await commit;});
  const published:PresentationPreferences[]=[];store.subscribe(value=>published.push(value));
  const pending=store.setLanguage('en');await started;
  expect(published).toEqual([]);expect(JSON.parse(mockPersisted!)).not.toHaveProperty('language');
  release();await pending;
  expect(published).toEqual([{activityColumns:4,homeListMode:'categories',language:'en'}]);
  expect(await (await freshStore()).presentationPreferences.load()).toEqual({activityColumns:4,homeListMode:'categories',language:'en'});
});

test('language save failure retains the prior language and later queued changes keep it',async()=>{
  mockPersisted='{"activityColumns":2,"homeListMode":"activities","language":"pt"}';
  const store=(await freshStore()).presentationPreferences;await store.load();
  mockWrite.mockRejectedValueOnce(new Error('SQLite full'));
  await expect(store.setLanguage('en')).rejects.toThrow('SQLite full');
  expect(JSON.parse(mockPersisted!)).toEqual({activityColumns:2,homeListMode:'activities',language:'pt'});
  await store.setColumns(3);
  expect(await (await freshStore()).presentationPreferences.load()).toEqual({activityColumns:3,homeListMode:'activities',language:'pt'});
  const writes=mockWrite.mock.calls.length;
  await expect(store.setLanguage('fr' as 'es')).rejects.toThrow('Selecciona');
  expect(mockWrite).toHaveBeenCalledTimes(writes);
});
