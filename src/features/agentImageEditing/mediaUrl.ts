const REQUEST_FACTORY_MEDIA_HOST = /^(?:https?:)?\/\/testserver(?::\d+)?(?=\/)/i;

export const normalizeAgentMediaUrl = (value: unknown): string => {
  const raw = String(value || '').trim();
  if (!REQUEST_FACTORY_MEDIA_HOST.test(raw)) return raw;
  const relative = raw.replace(REQUEST_FACTORY_MEDIA_HOST, '');
  return relative.startsWith('/media/') ? relative : raw;
};
