export const documentationSections = [
  { slug: 'handbook', title: 'Handbook' },
  { slug: 'guides', title: 'Guides' },
  { slug: 'reference', title: 'Reference' },
  { slug: 'skills', title: 'Skills' },
] as const;

export type IDocumentationSection =
  (typeof documentationSections)[number]['slug'];

export interface IArticle {
  section: IDocumentationSection;
  slug: string;
  href: string;
  title: string;
  description: string;
  order: number;
  body: string;
}

export interface IArticleHeading {
  id: string;
  title: string;
  level: 2 | 3;
}
