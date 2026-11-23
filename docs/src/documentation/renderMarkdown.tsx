import 'server-only';
import type { ComponentProps } from 'react';

import rehypeShiki from '@shikijs/rehype';
import type { Element, Root as HastRoot } from 'hast';
import { toText } from 'hast-util-to-text';
import type { Root as MarkdownRoot } from 'mdast';
import NextLink from 'next/link';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import rehypeReact from 'rehype-react';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

import { CodeCopyButton } from '../components/CodeCopyButton';

import type { IArticleHeading } from './types';

declare module 'hast' {
  interface ElementData {
    code?: string;
    filename?: string;
  }
}

function CodeBlock({
  node,
  children,
  ...props
}: ComponentProps<'pre'> & { node?: Element }) {
  const code = typeof node?.data?.code === 'string' ? node.data.code : '';
  const filename =
    typeof node?.data?.filename === 'string' ? node.data.filename : undefined;
  return (
    <figure className="docs-code">
      <div className="docs-code-toolbar">
        {filename && <figcaption>{filename}</figcaption>}
        <CodeCopyButton code={code} />
      </div>
      <pre {...props}>{children}</pre>
    </figure>
  );
}

function MarkdownLink({
  node: _node,
  href,
  children,
  ...props
}: ComponentProps<'a'> & { node?: Element }) {
  return href?.startsWith('/') ? (
    <NextLink href={href} {...props}>
      {children}
    </NextLink>
  ) : (
    <a href={href} {...props}>
      {children}
    </a>
  );
}

function MarkdownTable({
  node: _node,
  ...props
}: ComponentProps<'table'> & { node?: Element }) {
  return (
    <div className="docs-table">
      <table {...props} />
    </div>
  );
}

export async function renderMarkdown(markdown: string) {
  const headings: IArticleHeading[] = [];
  const blocks: Array<{ code: string; filename?: string }> = [];

  function collectCodeBlocks() {
    return (tree: MarkdownRoot) => {
      visit(tree, 'code', node => {
        const filename =
          /(?:title|filename)="([^"]+)"/.exec(node.meta ?? '')?.[1] ??
          /^\[([^\]]+)\]$/.exec(node.meta ?? '')?.[1];
        blocks.push({ code: node.value, filename });
      });
    };
  }

  function collectHeadingsAndLabelCode() {
    return (tree: HastRoot) => {
      let blockIndex = 0;
      visit(tree, 'element', node => {
        if (node.tagName === 'h2' || node.tagName === 'h3') {
          const id = node.properties.id;
          if (typeof id === 'string') {
            headings.push({
              id,
              title: toText(node),
              level: node.tagName === 'h2' ? 2 : 3,
            });
          }
        }
        if (node.tagName === 'pre') {
          const block = blocks[blockIndex++];
          if (block) node.data = { ...node.data, ...block };
        }
      });
    };
  }

  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(collectCodeBlocks)
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeShiki, {
      themes: { light: 'github-light', dark: 'github-dark' },
      langs: [
        'typescript',
        'tsx',
        'javascript',
        'jsx',
        'json',
        'bash',
        'sql',
        'yaml',
        'css',
        'markdown',
        'diff',
      ],
      lazy: true,
    })
    .use(collectHeadingsAndLabelCode)
    .use(rehypeReact, {
      Fragment,
      jsx,
      jsxs,
      passNode: true,
      components: { pre: CodeBlock, a: MarkdownLink, table: MarkdownTable },
    })
    .process(markdown);

  return { content: file.result, headings };
}
