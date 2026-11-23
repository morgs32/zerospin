import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { DocumentationPage } from '../../../../components/DocumentationPage';
import { readArticles } from '../../../../documentation/readArticles';
import { renderMarkdown } from '../../../../documentation/renderMarkdown';

interface IArticlePageProps {
  params: Promise<{ section: string; slug: string }>;
}

export const dynamicParams = false;

export async function generateStaticParams() {
  const articles = await readArticles();
  return articles.map(article => ({
    section: article.section,
    slug: article.slug,
  }));
}

export async function generateMetadata({
  params,
}: IArticlePageProps): Promise<Metadata> {
  const { section, slug } = await params;
  const articles = await readArticles();
  const article = articles.find(
    item => item.section === section && item.slug === slug,
  );
  if (!article) notFound();
  return { title: article.title, description: article.description };
}

export default async function ArticlePage({ params }: IArticlePageProps) {
  const { section, slug } = await params;
  const articles = await readArticles();
  const article = articles.find(
    item => item.section === section && item.slug === slug,
  );
  if (!article) notFound();
  const rendered = await renderMarkdown(article.body);

  return (
    <DocumentationPage
      articles={articles}
      article={article}
      headings={rendered.headings}
    >
      <article className="docs-article">{rendered.content}</article>
    </DocumentationPage>
  );
}
