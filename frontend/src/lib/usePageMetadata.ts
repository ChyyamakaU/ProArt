import { useEffect } from 'react';

type ShareMetadata = { url: string; image?: string };

export function usePageMetadata(title: string, description: string, share?: ShareMetadata) {
  const url = share?.url;
  const image = share?.image;
  useEffect(() => {
    const previousTitle = document.title;
    const descriptionTag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = descriptionTag?.content;
    document.title = title;
    if (descriptionTag) descriptionTag.content = description;

    const properties = url
      ? { 'og:title': title, 'og:description': description, 'og:url': url, 'og:type': 'profile', 'og:image': image }
      : {};
    const tags = Object.entries(properties).flatMap(([property, content]) => {
      if (!content) return [];
      const tag = document.createElement('meta');
      tag.setAttribute('property', property);
      tag.content = content;
      document.head.append(tag);
      return [tag];
    });

    return () => {
      document.title = previousTitle;
      if (descriptionTag && previousDescription !== undefined) descriptionTag.content = previousDescription;
      tags.forEach(tag => tag.remove());
    };
  }, [title, description, url, image]);
}
