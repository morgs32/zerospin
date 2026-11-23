import type { Metadata } from 'next';
import NextLink from 'next/link';
import { notFound } from 'next/navigation';

import { DocumentationPage } from '../../../components/DocumentationPage';
import { readArticles } from '../../../documentation/readArticles';
import { documentationSections } from '../../../documentation/types';

interface ISectionPageProps {
  params: Promise<{ section: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return documentationSections.map(section => ({ section: section.slug }));
}

export async function generateMetadata({
  params,
}: ISectionPageProps): Promise<Metadata> {
  const { section } = await params;
  const group = documentationSections.find(item => item.slug === section);
  if (!group) notFound();
  return { title: group.title };
}

export default async function SectionPage({ params }: ISectionPageProps) {
  const { section } = await params;
  const group = documentationSections.find(item => item.slug === section);
  if (!group) notFound();
  const articles = await readArticles();

  return (
    <DocumentationPage articles={articles} section={group.slug}>
      <header className="docs-article-header">
        <h1>{group.title}</h1>
      </header>
      <ol className="docs-article-list">
        {articles
          .filter(article => article.section === section)
          .map(article => (
            <li key={article.href}>
              <NextLink href={article.href}>{article.title}</NextLink>
              <p>{article.description}</p>
            </li>
          ))}
      </ol>
    </DocumentationPage>
  );
}
