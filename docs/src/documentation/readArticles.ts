import 'server-only';
import { cache } from 'react';

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import matter from 'gray-matter';

import {
  documentationSections,
  type IArticle,
  type IDocumentationSection,
} from './types';

function decodeFrontmatter(data: unknown, filename: string) {
  if (
    typeof data !== 'object' ||
    data === null ||
    !('title' in data) ||
    typeof data.title !== 'string' ||
    !data.title.trim() ||
    !('description' in data) ||
    typeof data.description !== 'string' ||
    !data.description.trim() ||
    !('order' in data) ||
    typeof data.order !== 'number' ||
    !Number.isFinite(data.order)
  ) {
    throw new Error(
      `${filename} requires a nonempty title, description, and numeric order in YAML frontmatter.`,
    );
  }
  return {
    title: data.title,
    description: data.description,
    order: data.order,
  };
}

async function readSectionArticles(section: IDocumentationSection) {
  const directory = path.join(process.cwd(), 'content', section);
  const entries = await readdir(directory, { withFileTypes: true });
  const filenames = entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => entry.name);
  const articles = await Promise.all(
    filenames.map(async filename => {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(filename)) {
        throw new Error(
          `Use a lowercase hyphenated Markdown filename: ${filename}`,
        );
      }
      const file = await readFile(path.join(directory, filename), 'utf8');
      const parsed = matter(file);
      const metadata = decodeFrontmatter(parsed.data, `${section}/${filename}`);
      const slug = filename.slice(0, -3);
      return {
        section,
        slug,
        href: `/${section}/${slug}`,
        ...metadata,
        body: parsed.content,
      } satisfies IArticle;
    }),
  );
  return articles.sort(
    (left, right) =>
      left.order - right.order || left.slug.localeCompare(right.slug),
  );
}

export const readArticles = cache(async () => {
  const sections = await Promise.all(
    documentationSections.map(section => readSectionArticles(section.slug)),
  );
  return sections.flat();
});
