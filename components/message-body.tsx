"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useMemo,
  type ReactElement,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { Avatar } from "@/components/avatar";
import { CodeBlock, InlineCode } from "@/components/markdown/code-block";
import {
  ProfileHoverCard,
  type ProfileHoverInfo,
} from "@/components/profile-hover-card";

export type MentionTarget = {
  id: string;
  kind: "agent" | "human";
  name: string;
  aliases: string[];
  avatar_url: string | null;
  hover: ProfileHoverInfo;
};

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findMentionTarget(
  token: string,
  targets: MentionTarget[],
): MentionTarget | null {
  const lower = token.toLowerCase();
  return (
    targets.find((t) =>
      t.aliases.some((alias) => alias.toLowerCase() === lower),
    ) || null
  );
}

function MentionChip({
  target,
  communitySlug,
  currentUserId,
}: {
  target: MentionTarget;
  communitySlug: string;
  currentUserId: string;
}) {
  return (
    <ProfileHoverCard
      info={target.hover}
      communitySlug={communitySlug}
      currentUserId={currentUserId}
    >
      <span className={`mention-chip mention-chip--${target.kind}`}>
        <Avatar
          src={target.avatar_url}
          name={target.name}
          size={18}
          title={null}
        />
        <span>{target.name}</span>
      </span>
    </ProfileHoverCard>
  );
}

function splitTextWithMentions(
  text: string,
  targets: MentionTarget[],
  communitySlug: string,
  currentUserId: string,
  keyPrefix: string,
): ReactNode[] {
  if (!targets.length || !text) return [text];

  const aliases = [...new Set(targets.flatMap((t) => t.aliases))]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  if (!aliases.length) return [text];

  const pattern = new RegExp(
    `@(?:${aliases.map(escapeRegExp).join("|")})\\b`,
    "gi",
  );

  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let i = 0;

  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    const raw = match[0];
    if (start > lastIndex) {
      nodes.push(text.slice(lastIndex, start));
    }
    const token = raw.slice(1);
    const target = findMentionTarget(token, targets);
    if (target) {
      nodes.push(
        <MentionChip
          key={`${keyPrefix}-m-${i++}`}
          target={target}
          communitySlug={communitySlug}
          currentUserId={currentUserId}
        />,
      );
    } else {
      nodes.push(raw);
    }
    lastIndex = start + raw.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length ? nodes : [text];
}

function withMentions(
  children: ReactNode,
  targets: MentionTarget[],
  communitySlug: string,
  currentUserId: string,
  keyPrefix = "n",
): ReactNode {
  return Children.map(children, (child, index) => {
    if (typeof child === "string") {
      return splitTextWithMentions(
        child,
        targets,
        communitySlug,
        currentUserId,
        `${keyPrefix}-${index}`,
      );
    }
    if (!isValidElement(child)) {
      return child;
    }
    const el = child as ReactElement<{ children?: ReactNode }>;
    const type = el.type;
    if (
      type === "code" ||
      type === "pre" ||
      type === "a" ||
      type === "img" ||
      type === CodeBlock ||
      type === InlineCode ||
      type === MentionChip
    ) {
      return el;
    }
    if (el.props.children == null) return el;
    return cloneElement(el, {
      children: withMentions(
        el.props.children,
        targets,
        communitySlug,
        currentUserId,
        `${keyPrefix}-${index}`,
      ),
    });
  });
}

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [
      ...(defaultSchema.attributes?.code || []),
      ["className"],
      ["class"],
    ],
    span: [
      ...(defaultSchema.attributes?.span || []),
      ["className"],
      ["class"],
    ],
    pre: [...(defaultSchema.attributes?.pre || []), ["className"], ["class"]],
    img: [
      ...(defaultSchema.attributes?.img || []),
      ["className"],
      ["class"],
    ],
  },
};

export function MessageBody({
  body,
  targets,
  communitySlug,
  currentUserId,
}: {
  body: string;
  targets: MentionTarget[];
  communitySlug: string;
  currentUserId: string;
}) {
  const components = useMemo<Components>(() => {
    const mentionify = (nodes: ReactNode) =>
      withMentions(nodes, targets, communitySlug, currentUserId);

    return {
      p: ({ children }) => <p>{mentionify(children)}</p>,
      li: ({ children }) => <li>{mentionify(children)}</li>,
      h1: ({ children }) => <h1>{mentionify(children)}</h1>,
      h2: ({ children }) => <h2>{mentionify(children)}</h2>,
      h3: ({ children }) => <h3>{mentionify(children)}</h3>,
      h4: ({ children }) => <h4>{mentionify(children)}</h4>,
      h5: ({ children }) => <h5>{mentionify(children)}</h5>,
      h6: ({ children }) => <h6>{mentionify(children)}</h6>,
      td: ({ children }) => <td>{mentionify(children)}</td>,
      th: ({ children }) => <th>{mentionify(children)}</th>,
      blockquote: ({ children }) => (
        <blockquote>{mentionify(children)}</blockquote>
      ),
      strong: ({ children }) => <strong>{mentionify(children)}</strong>,
      em: ({ children }) => <em>{mentionify(children)}</em>,
      a: ({ href, children }) => {
        const url = typeof href === "string" ? href : undefined;
        const external = url?.startsWith("http");
        return (
          <a
            href={url}
            className="message-md__link"
            {...(external
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
          >
            {mentionify(children)}
          </a>
        );
      },
      img: ({ src, alt }) => {
        if (typeof src !== "string" || !src) return null;
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={typeof alt === "string" ? alt : ""}
            className="message-md__img"
          />
        );
      },
      table: ({ children }) => (
        <div className="message-md__table-wrap">
          <table>{children}</table>
        </div>
      ),
      pre: ({ children }) => <>{children}</>,
      code: ({ className, children, ...props }) => {
        const isBlock =
          Boolean(className?.includes("language-")) ||
          Boolean(className?.includes("hljs"));
        if (isBlock) {
          return (
            <CodeBlock className={className} {...props}>
              {children}
            </CodeBlock>
          );
        }
        return (
          <InlineCode className={className} {...props}>
            {children}
          </InlineCode>
        );
      },
    };
  }, [targets, communitySlug, currentUserId]);

  return (
    <div className="message-md leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[
          [rehypeSanitize, sanitizeSchema],
          [rehypeHighlight, { plainText: ["mermaid"] }],
        ]}
        components={components}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
