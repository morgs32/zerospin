import type { ReactNode } from 'react';

import NextLink from 'next/link';

import {
  documentationSections,
  type IArticle,
  type IArticleHeading,
  type IDocumentationSection,
} from '../documentation/types';

import { ThemeSwitch } from './Appearance';
import { Outline, OutlineItem } from './Outline';

function ArticleNavigation({
  articles,
  article,
  headings,
  section: activeSection,
}: {
  articles: IArticle[];
  article?: IArticle;
  headings: IArticleHeading[];
  section: IDocumentationSection;
}) {
  return (
    <nav aria-label="Documentation">
      <Outline>
        {documentationSections.map((section, sectionIndex) => (
          <OutlineItem
            key={section.slug}
            label={
              <NextLink href={`/${section.slug}`}>
                {sectionIndex + 1} {section.title}
              </NextLink>
            }
          >
            {section.slug === (article?.section ?? activeSection) && (
              <Outline>
                {articles
                  .filter(item => item.section === section.slug)
                  .map(item => (
                    <OutlineItem
                      key={item.href}
                      label={
                        <NextLink
                          href={item.href}
                          aria-current={
                            article?.href === item.href ? 'page' : undefined
                          }
                        >
                          {item.title}
                        </NextLink>
                      }
                    >
                      {article?.href === item.href && headings.length > 0 && (
                        <Outline muted>
                          {headings.map(heading => (
                            <OutlineItem
                              key={heading.id}
                              className={
                                heading.level === 3
                                  ? 'docs-heading-subsection'
                                  : undefined
                              }
                              label={
                                <a href={`#${heading.id}`}>{heading.title}</a>
                              }
                            />
                          ))}
                        </Outline>
                      )}
                    </OutlineItem>
                  ))}
              </Outline>
            )}
          </OutlineItem>
        ))}
      </Outline>
    </nav>
  );
}

export function DocumentationPage({
  articles,
  article,
  headings = [],
  section = article?.section ?? 'handbook',
  children,
}: {
  articles: IArticle[];
  article?: IArticle;
  headings?: IArticleHeading[];
  section?: IDocumentationSection;
  children: ReactNode;
}) {
  const position = articles.findIndex(item => item.href === article?.href);
  const previous = position > 0 ? articles[position - 1] : undefined;
  const next = position >= 0 ? articles[position + 1] : undefined;
  const navigation = (
    <ArticleNavigation
      articles={articles}
      article={article}
      headings={headings}
      section={section}
    />
  );

  return (
    <div className="page-width docs-layout">
      <aside className="docs-nav">
        <div className="docs-desktop-nav">{navigation}</div>
        <details className="docs-mobile-nav">
          <summary>Browse documentation</summary>
          {navigation}
        </details>
      </aside>
      <main id="article" className="docs-content">
        <div className="docs-source-note">
          Current source · unreleased
          <NextLink href="/guides/quickstart">Workspace quickstart →</NextLink>
        </div>
        {article && (
          <header className="docs-article-header">
            <p>
              {
                documentationSections.find(
                  section => section.slug === article.section,
                )?.title
              }
            </p>
            <h1>{article.title}</h1>
            <p>{article.description}</p>
          </header>
        )}
        {children}
        {(previous || next) && (
          <nav
            className="docs-pagination"
            aria-label="Previous and next articles"
          >
            <div>
              {previous && (
                <NextLink href={previous.href} rel="prev">
                  <span>← Previous</span>
                  {previous.title}
                </NextLink>
              )}
            </div>
            <div>
              {next && (
                <NextLink href={next.href} rel="next">
                  <span>Next →</span>
                  {next.title}
                </NextLink>
              )}
            </div>
          </nav>
        )}
        <ThemeSwitch />
      </main>
    </div>
  );
}
