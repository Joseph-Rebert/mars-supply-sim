// Shared ids so a tab panel can point back at its tab (aria-labelledby) and vice versa.
export const tabId = (prefix: string, id: string) => `${prefix}-tab-${id}`
export const panelId = (prefix: string, id: string) => `${prefix}-panel-${id}`
