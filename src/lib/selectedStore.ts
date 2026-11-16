const SESSION_KEY = "selectedStoreId";
const OWNER_KEY = "selectedStoreUserId";
const userKey = (userId: string) => `selectedStoreId:${userId}`;

/** Restore before mounting protected pages; selection is not an access grant. */
export function restoreSelectedStore(userId: string, session = window.sessionStorage, local = window.localStorage) {
  const owner = session.getItem(OWNER_KEY);
  const saved = local.getItem(userKey(userId));
  const legacy = !owner || owner === userId ? session.getItem(SESSION_KEY) : null;
  const selected = saved || legacy;
  session.setItem(OWNER_KEY, userId);
  if (selected) {
    session.setItem(SESSION_KEY, selected);
    local.setItem(userKey(userId), selected);
  } else {
    session.removeItem(SESSION_KEY);
  }
  return selected;
}

/** Existing tabs keep their state; future tabs inherit the latest selection. */
export function saveSelectedStore(storeId: string, session = window.sessionStorage, local = window.localStorage) {
  session.setItem(SESSION_KEY, storeId);
  const owner = session.getItem(OWNER_KEY);
  if (owner) local.setItem(userKey(owner), storeId);
}