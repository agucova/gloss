import { Link } from "@tanstack/react-router";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { LandingFooter } from "@/components/landing/landing-footer";
import { Logo } from "@/components/logo";

interface LegalPageProps {
	eyebrow: string;
	title: string;
	lead?: string;
	/** Markdown body (no top-level h1; use `title` instead). */
	content: string;
}

export function LegalPage({ eyebrow, title, lead, content }: LegalPageProps) {
	return (
		<div
			className="relative min-h-screen w-full text-landing-ink"
			style={{ colorScheme: "light" }}
		>
			<div
				aria-hidden="true"
				className="fixed inset-0 -z-10 bg-landing-surface"
			/>
			<div className="mx-auto flex min-h-screen w-full max-w-[720px] flex-col px-6 py-12 sm:px-10 sm:py-16">
				<Link
					to="/"
					aria-label="Gloss home"
					className="flex items-center gap-2.5 self-start text-landing-ink"
				>
					<Logo variant="mark" className="h-6 w-6 text-landing-ink" />
					<span className="text-[17px] font-medium tracking-[-0.01em]">
						Gloss
					</span>
				</Link>

				<header className="flex flex-col gap-5 pt-20 pb-10">
					<span className="text-[11px] font-medium tracking-[0.14em] text-landing-ink-muted uppercase">
						{eyebrow}
					</span>
					<h1 className="font-display text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.08] tracking-[-0.015em] text-landing-ink">
						{title}
					</h1>
					{lead ? (
						<p className="max-w-[58ch] text-[15px] leading-relaxed text-landing-ink-muted sm:text-base">
							{lead}
						</p>
					) : null}
				</header>

				<article className="legal-prose pb-16">
					<Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
						{content}
					</Markdown>
				</article>

				<LandingFooter />
			</div>
		</div>
	);
}

const markdownComponents = {
	h1: ({ children }: { children?: React.ReactNode }) => (
		<h2 className="mt-14 mb-5 scroll-mt-20 font-display text-[clamp(1.5rem,3vw,2rem)] leading-tight tracking-[-0.015em] text-landing-ink">
			{children}
		</h2>
	),
	h2: ({ children }: { children?: React.ReactNode }) => (
		<h2 className="mt-14 mb-5 scroll-mt-20 font-display text-[clamp(1.5rem,3vw,2rem)] leading-tight tracking-[-0.015em] text-landing-ink">
			{children}
		</h2>
	),
	h3: ({ children }: { children?: React.ReactNode }) => (
		<h3 className="mt-10 mb-3 font-sans text-[17px] font-medium tracking-[-0.005em] text-landing-ink">
			{children}
		</h3>
	),
	h4: ({ children }: { children?: React.ReactNode }) => (
		<h4 className="mt-8 mb-2 font-sans text-[15px] font-medium tracking-[0.08em] text-landing-ink-muted uppercase">
			{children}
		</h4>
	),
	p: ({ children }: { children?: React.ReactNode }) => (
		<p className="my-4 text-[15.5px] leading-[1.75] text-landing-ink-muted">
			{children}
		</p>
	),
	strong: ({ children }: { children?: React.ReactNode }) => (
		<strong className="font-medium text-landing-ink">{children}</strong>
	),
	em: ({ children }: { children?: React.ReactNode }) => (
		<em className="text-landing-ink italic">{children}</em>
	),
	ul: ({ children }: { children?: React.ReactNode }) => (
		<ul className="my-5 space-y-2 pl-0 text-[15.5px] leading-[1.7] text-landing-ink-muted marker:text-landing-ink-subtle">
			{children}
		</ul>
	),
	ol: ({ children }: { children?: React.ReactNode }) => (
		<ol className="my-5 list-decimal space-y-2 pl-6 text-[15.5px] leading-[1.7] text-landing-ink-muted marker:text-landing-ink-subtle">
			{children}
		</ol>
	),
	li: ({ children }: { children?: React.ReactNode }) => (
		<li className="relative pl-6 before:absolute before:top-[0.9em] before:left-0 before:h-px before:w-3 before:bg-landing-rule">
			{children}
		</li>
	),
	a: ({ children, href }: { children?: React.ReactNode; href?: string }) => {
		const isExternal =
			href?.startsWith("http") || href?.startsWith("mailto:") || false;
		return (
			<a
				href={href}
				{...(isExternal
					? { target: "_blank", rel: "noopener noreferrer" }
					: {})}
				className="text-landing-ink underline decoration-landing-rule decoration-1 underline-offset-[3px] transition-colors hover:decoration-landing-ink"
			>
				{children}
			</a>
		);
	},
	blockquote: ({ children }: { children?: React.ReactNode }) => (
		<blockquote className="my-8 border-l-2 border-highlight-own bg-landing-surface-2 py-4 pr-4 pl-5 text-[14.5px] leading-relaxed text-landing-ink-muted">
			{children}
		</blockquote>
	),
	hr: () => <hr className="my-14 border-0 border-t border-landing-rule" />,
	code: ({ children }: { children?: React.ReactNode }) => (
		<code className="rounded-sm bg-landing-surface-2 px-1.5 py-0.5 font-mono text-[0.88em] text-landing-ink">
			{children}
		</code>
	),
	table: ({ children }: { children?: React.ReactNode }) => (
		<div className="my-8 overflow-x-auto">
			<table className="w-full border-collapse text-left text-[14px] leading-relaxed">
				{children}
			</table>
		</div>
	),
	thead: ({ children }: { children?: React.ReactNode }) => (
		<thead className="border-b border-landing-rule">{children}</thead>
	),
	tbody: ({ children }: { children?: React.ReactNode }) => (
		<tbody className="divide-y divide-landing-rule">{children}</tbody>
	),
	tr: ({ children }: { children?: React.ReactNode }) => <tr>{children}</tr>,
	th: ({ children }: { children?: React.ReactNode }) => (
		<th className="px-3 py-3 text-[11px] font-medium tracking-[0.1em] text-landing-ink-muted uppercase">
			{children}
		</th>
	),
	td: ({ children }: { children?: React.ReactNode }) => (
		<td className="px-3 py-3 align-top text-landing-ink-muted">{children}</td>
	),
};
