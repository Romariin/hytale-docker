'use client';

import { useState } from 'react';
import { Copy, Check, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

interface ComposePreviewProps {
	content: string;
	copied: boolean;
	onCopy: () => void;
}

export function ComposePreview({ content, copied, onCopy }: ComposePreviewProps) {
	const [showApiKey, setShowApiKey] = useState(false);

	// Mask API key values if not showing
	const processLine = (line: string): string => {
		if (!showApiKey && line.includes('CF_API_KEY:')) {
			return line.replace(/"([^"]+)"/, '"••••••••••••••••"');
		}
		if (!showApiKey && line.includes('MT_API_KEY:')) {
			return line.replace(/"([^"]+)"/, '"••••••••••••••••"');
		}
		return line;
	};

	return (
		<div className="bg-card rounded-xl border shadow-sm overflow-hidden flex flex-col lg:max-h-175">
			<div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30 shrink-0">
				<div className="flex items-center gap-2">
					<div className="flex gap-1.5">
						<div className="w-3 h-3 rounded-full bg-red-500/80" />
						<div className="w-3 h-3 rounded-full bg-yellow-500/80" />
						<div className="w-3 h-3 rounded-full bg-green-500/80" />
					</div>
					<span className="text-sm font-medium text-muted-foreground ml-2">
						docker-compose.yml
					</span>
				</div>
				<div className="flex items-center gap-1">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setShowApiKey(!showApiKey)}
						className="gap-2"
						title={showApiKey ? 'Hide API key' : 'Show API key'}
					>
						{showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
					</Button>
					<Button variant="ghost" size="sm" onClick={onCopy} className="gap-2">
						{copied ? (
							<>
								<Check className="w-4 h-4" />
								Copied!
							</>
						) : (
							<>
								<Copy className="w-4 h-4" />
								Copy
							</>
						)}
					</Button>
				</div>
			</div>
			<ScrollArea className="flex-1 min-h-0">
				<pre className="p-4 text-sm font-mono leading-relaxed min-w-max">
					<code className="text-foreground">
						{content.split('\n').map((line, i) => (
							<div key={i} className="flex whitespace-nowrap">
								<span className="text-muted-foreground w-8 select-none text-right mr-4 shrink-0">
									{i + 1}
								</span>
								<span>{highlightYaml(processLine(line))}</span>
							</div>
						))}
					</code>
				</pre>
				<ScrollBar orientation="horizontal" />
			</ScrollArea>
		</div>
	);
}

function highlightYaml(line: string): React.ReactNode {
	if (line.trim().startsWith('#')) {
		return <span className="text-muted-foreground italic">{line}</span>;
	}

	const keyMatch = line.match(/^(\s*)([^:\s]+)(:)(.*)$/);
	if (keyMatch) {
		const [, indent, key, colon, value] = keyMatch;
		return (
			<>
				{indent}
				<span className="text-cyan-500 dark:text-cyan-400">{key}</span>
				<span className="text-foreground">{colon}</span>
				{highlightValue(value)}
			</>
		);
	}

	const listMatch = line.match(/^(\s*)(-)(\s+)(.*)$/);
	if (listMatch) {
		const [, indent, dash, space, value] = listMatch;
		return (
			<>
				{indent}
				<span className="text-foreground">{dash}</span>
				{space}
				{highlightValue(value)}
			</>
		);
	}

	return line;
}

function highlightValue(value: string): React.ReactNode {
	const quotedMatch = value.match(/^(\s*)"([^"]*)"(.*)$/);
	if (quotedMatch) {
		const [, space, quoted, rest] = quotedMatch;
		return (
			<>
				{space}
				<span className="text-amber-500 dark:text-amber-400">"{quoted}"</span>
				{rest}
			</>
		);
	}

	const numberMatch = value.match(/^(\s*)(\d+)(\s*)$/);
	if (numberMatch) {
		const [, space, num, trailing] = numberMatch;
		return (
			<>
				{space}
				<span className="text-purple-500 dark:text-purple-400">{num}</span>
				{trailing}
			</>
		);
	}

	if (value.trim() === 'true' || value.trim() === 'false') {
		return <span className="text-orange-500 dark:text-orange-400">{value}</span>;
	}

	return <span className="text-green-500 dark:text-green-400">{value}</span>;
}
