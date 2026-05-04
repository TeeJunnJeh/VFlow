export const setMetaDescription = (content: string) => {
  if (typeof document === 'undefined') return;
  const text = String(content || '').trim();
  if (!text) return;
  let tag = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('name', 'description');
    document.head.appendChild(tag);
  }
  if (tag.getAttribute('content') !== text) {
    tag.setAttribute('content', text);
  }
};

